'use strict';

var commands = require( '../commands.js' );
var permissions = require( '../permissions.js' );
var settings = require( '../settings.js' );
var _ = require( '../helper.js' );

var guildChannels = {};
function initGuilds( _cl )
{
	client = _cl;
	guildChannels = settings.get( 'notices', 'guild_channels', {} );
}

commands.register( {
	category: 'notices',
	aliases: [ 'notices' ],
	help: 'toggle notice output in this text channel',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'on|off',
	callback: ( client, msg, args ) =>
	{
		var guildId = msg.guild.id;
		
		if ( args == 'on' )
		{
			guildChannels[ guildId ] = msg.channel.id;
			msg.channel.sendMessage( _.fmt( 'notices enabled for %s', msg.channel.mention ) );
		}
		else if ( args == 'off' )
		{
			delete guildChannels[ guildId ];
			msg.channel.sendMessage( _.fmt( 'notices enabled for %s', msg.channel.mention ) );
		}
		
		settings.set( 'notices', 'guild_channels', guildChannels );
	}});

function sendGuildNotice( guildId, message )
{
	if ( guildId in guildChannels )
	{
		var channel = client.Channels.get( guildChannels[ guildId ] );
		if ( !channel )
		{
			delete guildChannels[ guildId ];
			settings.set( 'notices', 'guild_channels', guildChannels );
			console.log( _.fmt( 'WARNING: tried to send notice to invalid channel %s in %s', guildChannels[ guildId ], client.Guilds.get( guildId ).name ) );
			return;
		}
		
		channel.sendMessage( message );
	}
}

function sendGlobalUserNotice( userId, message )
{
	var user = client.Users.get( userId );
	if ( !user )
		return console.log( _.fmt( 'WARNING: tried to send global notice about invalid user %s', userId ) );
		
	for ( var guildId in guildChannels )
	{
		var guild = client.Guilds.get( guildId );
		
		if ( !guild )
		{
			delete guildChannels[ guildId ];
			settings.set( 'notices', 'guild_channels', guildChannels );
			console.log( _.fmt( 'WARNING: tried to send global notice to invalid guild %s', guildId ) );
			return;
		}
		
		if ( user.memberOf( guild ) )		
			sendGuildNotice( guildId, message );
	}
}

function processEvent( type, e )
{
	//console.log( type );
	
	switch ( type )
	{
		case 'PRESENCE_MEMBER_INFO_UPDATE':
			// old, new
			// username, avatar, discriminator
			if ( e.old.username != e.new.username )
				sendGlobalUserNotice( e.old.id, _.fmt( '`%s` changed their name to `%s`', e.old.username, e.new.username ) );
			if ( e.old.avatar != e.new.avatar )
			{
				var avatarURL = client.Users.get( e.new.id ).avatarURL;
				sendGlobalUserNotice( e.old.id, _.fmt( '`%s` changed their avatar to %s', e.new.username, avatarURL ) );
			}
			break;
			
		case 'VOICE_CHANNEL_LEAVE':
			// user, channel, channelid, guildid, newchannelid, newguildid
			if ( e.user.bot ) return;
			if ( e.newChannelId == null )
				sendGuildNotice( e.guildId, _.fmt( '`%s` disconnected', e.user.username ) );
			break;
			
		case 'VOICE_CHANNEL_JOIN':
			// user, channel, channelid, guildid
			if ( e.user.bot ) return;
			sendGuildNotice( e.guildId, _.fmt( '`%s` connected to `%s`', e.user.username, e.channel.name ) );
			break;
			
		case 'VOICE_USER_SELF_MUTE':
			// user, channel, channelid, guildid, state
			if ( settings.get( 'notices', 'hide_mute_events', true ) )
				return;
			if ( e.state )
				sendGuildNotice( e.guildId, _.fmt( '`%s` muted', e.user.username ) );
			else
				sendGuildNotice( e.guildId, _.fmt( '`%s` unmuted', e.user.username ) );
			break;
		
		case 'VOICE_USER_SELF_DEAF':
			// user, channel, channelid, guildid, state
			if ( settings.get( 'notices', 'hide_deaf_events', false ) )
				return;
			if ( e.state )
				sendGuildNotice( e.guildId, _.fmt( '`%s` deafened', e.user.username ) );
			else
				sendGuildNotice( e.guildId, _.fmt( '`%s` undeafened', e.user.username ) );
			break;
		
		case 'VOICE_USER_MUTE':
			// user, channel, channelid, guildid, state
			if ( e.state )
				sendGuildNotice( e.guildId, _.fmt( '`%s` was muted by the server', e.user.username ) );
			else
				sendGuildNotice( e.guildId, _.fmt( '`%s` was unmuted by the server', e.user.username ) );
			break;
		
		case 'VOICE_USER_DEAF':
			// user, channel, channelid, guildid, state
			if ( e.state )
				sendGuildNotice( e.guildId, _.fmt( '`%s` was deafened by the server', e.user.username ) );
			else
				sendGuildNotice( e.guildId, _.fmt( '`%s` was undeafened by the server', e.user.username ) );
			break;
			
		case 'PRESENCE_UPDATE':
			// guild, user, member
			if ( settings.get( 'notices', 'hide_game_events', true ) )
				return;
			if ( e.user.previousGameName != null )
				sendGuildNotice( e.guild.id, _.fmt( '`%s` stopped playing `%s`', e.user.username, e.user.previousGameName ) );
			if ( e.user.gameName != null )
				sendGuildNotice( e.guild.id, _.fmt( '`%s` started playing `%s`', e.user.username, e.user.gameName ) );
			break;
			
		case 'CHANNEL_CREATE':
			// channel
			if ( e.channel.is_private ) return;
			var name = e.channel.mention;
			if ( !name )
				name = '`' + e.channel.name + '`';
			sendGuildNotice( e.channel.guild.id, _.fmt( '%s created', name ) );
			break;
			
		case 'CHANNEL_DELETE':
			// channelid, data
			if ( e.channel.is_private ) return;
			var name = e.data.name;
			if ( e.data.type == 'text' )
				name = '#' + name;
			sendGuildNotice( e.data.guild_id, _.fmt( '`%s` deleted', name ) );
			break;
			
		case 'GUILD_MEMBER_ADD':
			// guild, member
			sendGuildNotice( e.guild.id, _.fmt( '`%s` joined the server, welcome!', e.member.username ) );
			break;
			
		case 'GUILD_MEMBER_REMOVE':
			// guild, user
			sendGuildNotice( e.guild.id, _.fmt( '`%s` left the server, bye :(', e.user.username ) );
			break;
			
		case 'GUILD_BAN_ADD':
			// guild, user
			sendGuildNotice( e.guild.id, _.fmt( '`%s` was banned', e.user.username ) );
			break;
			
		case 'GUILD_BAN_REMOVE':
			// guild, user
			sendGuildNotice( e.guild.id, _.fmt( '`%s` was unbanned', e.user.username ) );
			break;
			
		case 'CHANNEL_UPDATE':
			// channel
			if ( e.channel.is_private ) return;
			var name = e.channel.mention;
			if ( !name )
				name = '`' + e.channel.name + '`';
			sendGuildNotice( e.channel.guild.id, _.fmt( '%s updated', name ) );
			break;
			
		case 'GUILD_UPDATE':
			// guild
			sendGuildNotice( e.guild.id, 'server settings updated' );
			break;
			
		// MESSAGE_DELETE
			// channelid, messageid, message
			
		// MESSAGE_UPDATE
			// message, data
			
		// GUILD_MEMBER_UPDATE
			// guild, member
			
		// GUILD_ROLE_CREATE
			// guild, role
			
		// GUILD_ROLE_UPDATE
			// guild, role
			
		// GUILD_ROLE_DELETE
			// guild, roleid
	}
}

var client = null;
module.exports.setup = function( _cl )
	{
		client = _cl;
		initGuilds( client );
		client.Dispatcher.onAny( ( type, e ) => { processEvent( type, e ); } );
		console.log( 'notices plugin loaded' );
	};
