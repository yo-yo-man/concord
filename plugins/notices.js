'use strict';

var Discordie = require( 'discordie' );

var commands = require( '../commands.js' );
var permissions = require( '../permissions.js' );
var settings = require( '../settings.js' );
var _ = require( '../helper.js' );

var guildChannels = {};
function initGuilds()
{
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
			_.log( _.fmt( 'WARNING: tried to send notice to invalid channel %s in %s', guildChannels[ guildId ], client.Guilds.get( guildId ).name ) );
			return;
		}
		
		channel.sendMessage( message );
	}
}
module.exports.sendGuildNotice = sendGuildNotice;

function execGlobalUserNotice( userId, callback )
{
	var user = client.Users.get( userId );
	if ( !user )
		return _.log( _.fmt( 'WARNING: tried to send global notice about invalid user %s', userId ) );
		
	for ( var guildId in guildChannels )
	{
		var guild = client.Guilds.get( guildId );
		
		if ( !guild )
		{
			delete guildChannels[ guildId ];
			settings.set( 'notices', 'guild_channels', guildChannels );
			_.log( _.fmt( 'WARNING: tried to send global notice to invalid guild %s', guildId ) );
			return;
		}
		
		var member = user.memberOf( guild );
		if ( member )		
		{
			var message = callback( member );
			if ( message )
				sendGuildNotice( guildId, message );
		}
	}
}
module.exports.execGlobalUserNotice = execGlobalUserNotice;

var noticeSuppressions = [];
function suppressNotice( guildId, type, memberId )
{
	var sup = {};
	sup.guildId = guildId;
	sup.memberId = memberId;
	sup.type = type;
	noticeSuppressions.push( sup );
}
module.exports.suppressNotice = suppressNotice;

var justSwitched = {};
function processEvent( type, e )
{
	//console.log( type );
	
	var guild = e.guild;
	if ( e.guildId )
		guild = client.Guilds.get( e.guildId );
	
	var member = e.member;
	if ( !member && e.user && guild )
		member = e.user.memberOf( guild ) || e.user;
	
	if ( guild )
		for ( var i in noticeSuppressions )
			if ( noticeSuppressions[i].guildId == guild.id &&
				 noticeSuppressions[i].type == type )
			{
				if ( member && noticeSuppressions[i].memberId && noticeSuppressions[i].memberId != member.id )
					continue;
				
				delete noticeSuppressions[i];
				return;
			}
	
	switch ( type )
	{
		case 'PRESENCE_MEMBER_INFO_UPDATE':
			// old, new
			// username, avatar, discriminator
			if ( e.old.username != e.new.username )
				execGlobalUserNotice( e.old.id, 
					member => 
					{
						if ( _.nick( member ) == e.new.username )
							return _.fmt( '`%s` is now known as `%s`', e.old.username, e.new.username );
					});
			if ( e.old.avatar != e.new.avatar )
			{
				if ( settings.get( 'notices', 'hide_avatar_events', true ) )
					return;
				var avatarURL = client.Users.get( e.new.id ).avatarURL;
				execGlobalUserNotice( e.old.id, 
					member => 
					{
						return _.fmt( '`%s` changed their avatar to %s', _.nick( member ), avatarURL );
					});
			}
			break;
			
		case 'VOICE_CHANNEL_LEAVE':
			// user, channel, channelid, guildid, newchannelid, newguildid
			if ( e.user.bot ) return;
			if ( e.newChannelId == null )
				sendGuildNotice( e.guildId, _.fmt( '`%s` disconnected', _.nick( e.user, guild ) ) );
			else if ( e.guildId == e.newGuildId )
				justSwitched[ e.user.id ] = true;
			break;
			
		case 'VOICE_CHANNEL_JOIN':
			// user, channel, channelid, guildid
			if ( e.user.bot ) return;
			
			var action = 'connected';
			if ( justSwitched[ e.user.id ] )
			{
				delete justSwitched[ e.user.id ];
				action = 'switched';
			}
			
			sendGuildNotice( e.guildId, _.fmt( '`%s` %s to `%s`', _.nick( e.user, guild ), action, e.channel.name ) );
			break;
			
		case 'VOICE_USER_SELF_MUTE':
			// user, channel, channelid, guildid, state
			if ( settings.get( 'notices', 'hide_mute_events', true ) )
				return;
			if ( e.state )
				sendGuildNotice( e.guildId, _.fmt( '`%s` muted', _.nick( e.user, guild ) ) );
			else
				sendGuildNotice( e.guildId, _.fmt( '`%s` unmuted', _.nick( e.user, guild ) ) );
			break;
		
		case 'VOICE_USER_SELF_DEAF':
			// user, channel, channelid, guildid, state
			if ( settings.get( 'notices', 'hide_deaf_events', false ) )
				return;
			if ( e.state )
				sendGuildNotice( e.guildId, _.fmt( '`%s` deafened', _.nick( e.user, guild ) ) );
			else
				sendGuildNotice( e.guildId, _.fmt( '`%s` undeafened', _.nick( e.user, guild ) ) );
			break;
		
		case 'VOICE_USER_MUTE':
			// user, channel, channelid, guildid, state
			if ( e.state )
				sendGuildNotice( e.guildId, _.fmt( '`%s` was muted by the server', _.nick( e.user, guild ) ) );
			else
				sendGuildNotice( e.guildId, _.fmt( '`%s` was unmuted by the server', _.nick( e.user, guild ) ) );
			break;
		
		case 'VOICE_USER_DEAF':
			// user, channel, channelid, guildid, state
			if ( e.state )
				sendGuildNotice( e.guildId, _.fmt( '`%s` was deafened by the server', _.nick( e.user, guild ) ) );
			else
				sendGuildNotice( e.guildId, _.fmt( '`%s` was undeafened by the server', _.nick( e.user, guild ) ) );
			break;
			
		case 'PRESENCE_UPDATE':
			// guild, user, member				
			if ( settings.get( 'notices', 'hide_game_events', true ) )
				return;
			if ( e.user.previousGameName != null )
				sendGuildNotice( e.guild.id, _.fmt( '`%s` stopped playing `%s`', _.nick( e.user, guild ), e.user.previousGameName ) );
			if ( e.user.gameName != null )
				sendGuildNotice( e.guild.id, _.fmt( '`%s` started playing `%s`', _.nick( e.user, guild ), e.user.gameName ) );
			break;
			
		case 'CHANNEL_CREATE':
			// channel
			if ( e.channel.isPrivate ) return;
			var name = e.channel.mention;
			if ( !name )
				name = '`' + e.channel.name + '`';
			sendGuildNotice( e.channel.guild.id, _.fmt( '%s created', name ) );
			break;
			
		case 'CHANNEL_DELETE':
			// channelid, data
			if ( e.data.isPrivate ) return;
			var name = e.data.name;
			if ( e.data.type == Discordie.ChannelTypes.GUILD_TEXT )
				name = '#' + name;
			sendGuildNotice( e.data.guild_id, _.fmt( '`%s` deleted', name ) );
			break;
			
		case 'GUILD_MEMBER_ADD':
			// guild, member
			sendGuildNotice( e.guild.id, _.fmt( '`%s` joined the server, welcome!', _.nick( e.member ) ) );
			break;
			
		case 'GUILD_MEMBER_REMOVE':
			// guild, user, data, getCachedData
			sendGuildNotice( e.guild.id, _.fmt( '`%s` left the server, bye :(', _.nick( e.user, guild ) ) );
			break;
			
		case 'GUILD_BAN_ADD':
			// guild, user
			sendGuildNotice( e.guild.id, _.fmt( '`%s` was banned', _.nick( e.user, guild ) ) );
			suppressNotice( e.guild.id, 'GUILD_MEMBER_REMOVE', e.user.id );
			break;
			
		case 'GUILD_BAN_REMOVE':
			// guild, user
			sendGuildNotice( e.guild.id, _.fmt( '`%s` was unbanned', _.nick( e.user, guild ) ) );
			break;
			
		case 'CHANNEL_UPDATE':
			// channel, getChanges
			if ( e.channel.isPrivate ) return;
			
			var name = e.channel.mention;
			if ( !name )
				name = '`' + e.channel.name + '`';
			
			var explicitChange = false;
			var ch = e.getChanges();
			
			if ( ch.before.name != ch.after.name )
			{
				explicitChange = true;
				sendGuildNotice( e.channel.guild.id, _.fmt( '`%s` renamed to %s', ch.before.name, name ) );
			}
			
			if ( ch.before.topic != ch.after.topic )
			{
				explicitChange = true;
				var topic = ch.after.topic || ' ';
				sendGuildNotice( e.channel.guild.id, _.fmt( '%s topic changed to `%s`', name, topic ) );
			}
			
			if ( ch.before.bitrate != ch.after.bitrate )
			{
				explicitChange = true;
				sendGuildNotice( e.channel.guild.id, _.fmt( '%s bitrate changed to `%skbps`', name, Math.round( ch.after.bitrate / 1000 ) ) );
			}
			
			if ( JSON.stringify( ch.before.permission_overwrites ) != JSON.stringify( ch.after.permission_overwrites ) )
			{
				explicitChange = true;
				sendGuildNotice( e.channel.guild.id, _.fmt( '%s permissions changed', name ) );
			}
			
			if ( !explicitChange && JSON.stringify( ch.before ) != JSON.stringify( ch.after ) )
				sendGuildNotice( e.channel.guild.id, _.fmt( '%s updated', name ) );
			break;
			
		case 'GUILD_UPDATE':
			// guild, getChanges
			
			var explicitChange = false;
			var ch = e.getChanges();
			
			if ( ch.before.name != ch.after.name )
			{
				explicitChange = true;
				sendGuildNotice( e.guild.id, _.fmt( 'server renamed to `%s`', ch.after.name ) );
			}
			
			if ( ch.before.icon != ch.after.icon )
			{
				explicitChange = true;
				sendGuildNotice( e.guild.id, _.fmt( 'server icon changed' ) );
			}
			
			if ( ch.before.region != ch.after.region )
			{
				explicitChange = true;
				sendGuildNotice( e.guild.id, _.fmt( 'server region changed to `%s`', ch.after.region ) );
			}
			
			if ( !explicitChange && JSON.stringify( ch.before ) != JSON.stringify( ch.after ) )
				sendGuildNotice( e.guild.id, _.fmt( 'server settings updated' ) );
			break;
			
		// GUILD_CREATE
			// guild, becameAvailable
			
		// GUILD_DELETE
			// guildid, data, getCachedData
			
		// MESSAGE_DELETE
			// channelid, messageid, message
			
		// MESSAGE_UPDATE
			// message, data
			
		case 'GUILD_MEMBER_UPDATE':
			// guild, member, rolesAdded, rolesRemoved, previousNick, getChanges
			if ( e.member.nick != e.previousNick )
			{
				var prev = e.previousNick || e.member.username;
				sendGuildNotice( e.guild.id, _.fmt( '`%s` is now known as `%s`', prev, _.nick( e.member ) ) );
			}
			for ( var i in e.rolesAdded )
				sendGuildNotice( e.guild.id, _.fmt( '`%s` added to `@%s`', _.nick( e.member ), e.rolesAdded[i].name ) );
			for ( var i in e.rolesRemoved )
				sendGuildNotice( e.guild.id, _.fmt( '`%s` removed from `@%s`', _.nick( e.member ), e.rolesRemoved[i].name ) );
			break;
			
		case 'GUILD_ROLE_CREATE':
			// guild, role
			sendGuildNotice( e.guild.id, _.fmt( '`@%s` created', e.role.name ) );
			break;
			
		case 'GUILD_ROLE_UPDATE':
			// guild, role, getChanges
			
			var explicitChange = false;
			var ch = e.getChanges();
			
			if ( ch.before.name != ch.after.name )
			{
				explicitChange = true;
				sendGuildNotice( e.guild.id, _.fmt( '`@%s` renamed to `@%s`', ch.before.name, ch.after.name ) );
			}
			
			if ( ch.before.permissions != ch.after.permissions )
			{
				explicitChange = true;
				sendGuildNotice( e.guild.id, _.fmt( '`@%s` permissions changed', e.role.name ) );
			}
			
			if ( !explicitChange && JSON.stringify( ch.before ) != JSON.stringify( ch.after ) )
				sendGuildNotice( e.guild.id, _.fmt( '`@%s` updated', e.role.name ) );
			break;
			
		case 'GUILD_ROLE_DELETE':
			// guild, roleid, getCachedData
			sendGuildNotice( e.guild.id, _.fmt( '`@%s` deleted', e.getCachedData().name ) );
			break;
			
		case 'GUILD_EMOJIS_UPDATE':
			// guild, getChanges
			
			var ch = e.getChanges();
			var before = {};
			var after = {};
			
			for ( var i in ch.before )
			{
				var em = ch.before[i];
				before[em.id] = em;
			}
			
			for ( var i in ch.after )
			{
				var em = ch.after[i];
				after[em.id] = em;
			}
			
			for ( var i in before )
			{
				if ( !(i in after) )
					sendGuildNotice( e.guild.id, _.fmt( '`:%s:` deleted', before[i].name ) );
			}
			
			for ( var i in after )
			{
				if ( !(i in before) )
					sendGuildNotice( e.guild.id, _.fmt( '<:%s:%s> created', after[i].name, after[i].id ) );
				else if ( before[i].name != after[i].name )
					sendGuildNotice( e.guild.id, _.fmt( '<:%s:%s> renamed', after[i].name, after[i].id ) );
			}
			
			break;
	}
}

var client = null;
module.exports.setup = function( _cl )
	{
		client = _cl;
		initGuilds();
		client.Dispatcher.onAny( ( type, e ) => { processEvent( type, e ); } );
		_.log( 'loaded plugin: notices' );
	};
