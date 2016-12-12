'use strict';

var commands = require( '../commands.js' );
var permissions = require( '../permissions.js' );
var settings = require( '../settings.js' );
var _ = require( '../helper.js' );

var moment = require( 'moment' );
require( 'moment-duration-format' );

var reminders = {};
var reminderDelay = 5 * 1000;
function updateReminders()
{
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
		}
	}
	
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
	}});

var client = null;
module.exports.setup = function( _cl )
	{
		client = _cl;
		reminders = settings.get( 'reminders', null, {} );
		updateReminders();
		_.log( 'loaded plugin: util' );
	};
