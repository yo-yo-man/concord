'use strict';

var commands = require( '../commands.js' );
var permissions = require( '../permissions.js' );
var settings = require( '../settings.js' );
var _ = require( '../helper.js' );

var moment = require( 'moment' );
require( 'moment-duration-format' );

var notices = require( './notices.js' );

var reminders = {};
var remindersDirty = false;
var reminderDelay = 5 * 1000;
function updateReminders()
{
	var needsSave = false;
	if ( remindersDirty )
	{
		remindersDirty = false;
		needsSave = true;
	}
	
	for ( var uid in reminders )
	{
		if ( _.time() > reminders[uid].time )
		{
			var rem = reminders[uid];
			var user = client.Users.get( rem.creator );
			
			function sendReminder( channel, user, rem, uid )
			{
				channel.sendMessage( _.fmt( '**%s [reminder]** `%s`', user.mention, rem.message ) );
				delete reminders[uid];
			}
			
			if ( rem.private )
				user.openDM().then( dm => sendReminder( dm, user, rem, uid ) );
			else
				sendReminder( client.Channels.get( rem.channel ), user, rem, uid );
			
			needsSave = true;
		}
	}
	
	if ( needsSave )
		settings.save( 'reminders', reminders );
	
	setTimeout( updateReminders, reminderDelay );
}

commands.register( {
	category: 'util',
	aliases: [ 'remind', 'remindme', 'reminder' ],
	help: 'set a timely reminder',
	args: '[time] [message]',
	callback: ( client, msg, args ) =>
	{
		var prefix = settings.get( 'config', 'command_prefix', '!' );
		if ( msg.author.id in reminders )
		{
			if ( args == 'cancel' )
			{
				delete reminders[msg.author.id];
				msg.channel.sendMessage( 'Reminder has been cancelled.' );
				remindersDirty = true;
				return;
			}
			else
				return msg.channel.sendMessage( _.fmt( 'Reminder pending in %s, use `%sreminder cancel` to cancel.', moment.duration( (_.time() - reminders[msg.author.id].time)*1000 ).humanize(), prefix ) );
		}
		else if ( !args )
			return msg.channel.sendMessage( 'I current do not have any reminders set for you.' );
		
		var args = _.sanesplit( args, ' ', 1 );
		if ( args.length < 2 )
			return msg.channel.sendMessage( '`' + commands.generateHelp( commands.getCMD( 'reminder' ) ) + '`' );
		
		var rem = {};
		rem.time = _.time() + _.parsetime( args[0] );
		rem.creator = msg.author.id;
		rem.message = args[1];
		rem.private = msg.channel.isPrivate;
		rem.channel = msg.channel.id;
		
		reminders[msg.author.id] = rem;
		msg.channel.sendMessage( _.fmt( 'I will remind you in %s', moment.duration( (_.time() - rem.time)*1000 ).humanize() ) );
		remindersDirty = true;
	}});

commands.register( {
	category: 'util',
	aliases: [ 'migrate' ],
	help: 'move everyone in your channel to another one',
	args: 'channel',
	flags: [ 'admin_only', 'no_pm' ],
	callback: ( client, msg, args ) =>
	{
		var channel = msg.member.getVoiceChannel();
		if ( !channel )
			return msg.channel.sendMessage( 'you are not in a voice channel' );
		
		var target = commands.findVoiceChannel( msg, args );
		if ( target === false )
			return;
		
		var names = [];
		for ( var i in channel.members )
		{
			names.push( '`' + _.nick( channel.members[i] ) + '`' );
			notices.suppressNotice( channel.guild.id, 'VOICE_CHANNEL_LEAVE', channel.members[i].id );
			notices.suppressNotice( channel.guild.id, 'VOICE_CHANNEL_JOIN', channel.members[i].id );
			channel.members[i].setChannel( target );
		}
		
		notices.sendGuildNotice( channel.guild.id, _.fmt( '%s moved to `%s` by `%s`', names.join( ', ' ), target.name, _.nick( msg.member ) ) );
	}});

var client = null;
module.exports.setup = function( _cl )
	{
		client = _cl;
		reminders = settings.get( 'reminders', null, {} );
		updateReminders();
		_.log( 'loaded plugin: util' );
	};
