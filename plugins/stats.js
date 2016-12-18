'use strict';

var Discordie = require( 'discordie' );

var commands = require( '../commands.js' );
var permissions = require( '../permissions.js' );
var settings = require( '../settings.js' );
var _ = require( '../helper.js' );

var moment = require( 'moment' );
require( 'moment-duration-format' );

var lastSeen = {};
var idleTime = {};
var lastSeenDelay = 60 * 1000;
function updateLastSeen()
{
	client.Users.forEach( function( user )
		{
			if ( user.status != 'offline' )
				lastSeen[ user.id ] = _.time();
			if ( user.status == 'idle' )
			{
				if ( !( user.id in idleTime ) )
					idleTime[ user.id ] = _.time();
			}
			else
				if ( user.id in idleTime )
					delete idleTime[ user.id ];
		});
		
	settings.save( 'lastseen', lastSeen );
	setTimeout( updateLastSeen, lastSeenDelay );
}

commands.register( {
	category: 'stats',
	aliases: [ 'who', 'lastseen' ],
	help: 'display user info and when they were last seen',
	args: 'user',
	callback: ( client, msg, args ) =>
	{
		var target = commands.findTarget( msg, args );
		if ( target === false )
			return;
		
		var rows = [];
		
		rows.push( _.fmt( '%s#%s', target.username, target.discriminator ) );
		if ( target.nick )
			rows.push( _.fmt( 'AKA %s', target.nick ) );
		else
			rows.push( '---' );
		
		
		if ( !msg.channel.isPrivate )
		{
			var roleList = [ 'everyone' ];
			for ( var i in target.roles )
				roleList.push( target.roles[i].name );
			
			rows.push( _.fmt( 'part of %s', roleList.join( ', ' ) ) );
			rows.push( _.fmt( 'joined server %s', moment( target.joined_at ).fromNow() ) );
		}
		
		
		var timestamp = 0;
		if ( target.id in lastSeen )
			timestamp = lastSeen[ target.id ];
		rows.push( _.fmt( 'last seen %s', moment.unix( timestamp ).fromNow() ) );
		
		if ( target.id in idleTime )
			rows.push( _.fmt( 'went idle %s', moment.unix( idleTime[ target.id ] ).fromNow() ) );
		else
			rows.push( '---' );
		
		
		var fields = [];
		for ( var i=0; i < rows.length; i++ )
		{
			var f = {};
			f.name = rows[i];
			f.value = rows[i+1];
			fields.push( f );
			i++;
		}
		
		var colour = 0x43b581;
		if ( target.status == 'idle' )
			colour = 0xfaa61a;
		else if ( target.status == 'offline' )
			colour = 0x8a8a8a;
		
		msg.channel.sendMessage( '', false,
			{
				color: colour,
				fields: fields,
				footer: { text: _.fmt( 'ID: %s', target.id ) },
				thumbnail: { url: target.avatarURL }
			});
		
	}});

var startTime = 0;
commands.register( {
	category: 'stats',
	aliases: [ 'uptime', 'stats' ],
	help: 'bot uptime and statistics',
	callback: ( client, msg, args ) =>
	{
		var uptime = moment.duration( (_.time() - startTime)*1000 );
		
		var stats = _.fmt( 'uptime: %s (%s)\n', uptime.humanize(), uptime.format( 'h:mm:ss' ) );
		stats += _.fmt( 'commands since boot: %s\n', commands.numSinceBoot );
		stats += _.fmt( 'servers connected: %s\n', client.Guilds.length );
		
		var total = 0;
		var listening = 0;
		client.Channels.forEach( function( channel )
			{
				if ( channel.type == Discordie.ChannelTypes.GUILD_TEXT && !channel.isPrivate )
				{
					total++;
					if ( client.User.can( permissions.discord.Text.READ_MESSAGES, channel ) )
						listening++;
				}
			});
			
		stats += _.fmt( 'channels listening: %s / %s\n', listening, total );
		stats += _.fmt( 'users seen online: %s / %s\n', Object.keys( lastSeen ).length, client.Users.length );
		
		try
		{
			var audio = require( './audio.js' );
			stats += _.fmt( 'songs played since boot: %s\n', audio.songsSinceBoot );
			stats += _.fmt( 'active music sessions: %s\n', Object.keys( audio.sessions ).length );
		} catch(e) {};
		
		msg.channel.sendMessage( '```' + stats + '```' );
	}});

var client = null;
module.exports.setup = function( _cl )
	{
		client = _cl;
		startTime = _.time();
		lastSeen = settings.get( 'lastseen', null, {} );
		updateLastSeen();
		_.log( 'loaded plugin: stats' );
	};
