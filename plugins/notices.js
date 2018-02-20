const Discord = require( 'discord.js' )

const commands = require( '../commands.js' )
const permissions = require( '../permissions.js' )
const settings = require( '../settings.js' )
const _ = require( '../helper.js' )

const moderation = require( './moderation.js' )

let guildChannels = {}
function initGuilds()
{
	guildChannels = settings.get( 'notices', 'guild_channels', {} )
}

commands.register( {
	category: 'notices',
	aliases: [ 'notices' ],
	help: 'toggle notice output in this text channel',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'on|off',
	callback: ( client, msg, args ) =>
	{
		const guildId = msg.guild.id
		
		if ( args === 'on' )
		{
			guildChannels[ guildId ] = msg.channel.id
			msg.channel.send( _.fmt( 'notices enabled for %s', msg.channel.mention ) )
		}
		else if ( args === 'off' )
		{
			delete guildChannels[ guildId ]
			msg.channel.send( _.fmt( 'notices disabled for %s', msg.channel.mention ) )
		}
		
		settings.set( 'notices', 'guild_channels', guildChannels )
	} })

const guildNotices = {}
let batchDelay = 5 * 1000
function batchTick()
{
	for ( const guildId in guildNotices )
	{
		if ( guildNotices[ guildId ].length === 0 )
			continue

		const channel = client.channels.find( 'id', guildChannels[ guildId ] )
		if ( !channel )
		{
			delete guildChannels[ guildId ]
			settings.set( 'notices', 'guild_channels', guildChannels )
			_.log( _.fmt( 'WARNING: tried to send notice to invalid channel %s in %s', guildChannels[ guildId ], client.guilds.find( 'id', guildId ).name ) )
			continue
		}

		const message = guildNotices[ guildId ].join( '\n' )
		channel.send( message )

		guildNotices[ guildId ] = []
	}

	setTimeout( batchTick, batchDelay )
}

function sendGuildNotice( guildId, message, member )
{
	if ( guildId in guildChannels )
	{
		if ( !guildNotices[ guildId ] )
			guildNotices[ guildId ] = []

		guildNotices[ guildId ].push( message )
	}
}
module.exports.sendGuildNotice = sendGuildNotice

function execGlobalUserNotice( userId, callback )
{
	const user = client.users.find( 'id', userId )
	if ( !user )
		return _.log( _.fmt( 'WARNING: tried to send global notice about invalid user %s', userId ) )
		
	for ( const guildId in guildChannels )
	{
		const guild = client.guilds.find( 'id', guildId )
		
		if ( !guild )
		{
			delete guildChannels[ guildId ]
			settings.set( 'notices', 'guild_channels', guildChannels )
			_.log( _.fmt( 'WARNING: tried to send global notice to invalid guild %s', guildId ) )
			return
		}
		
		const member = 	guild.members.find( 'id', user.id )
		if ( member )
		{
			const message = callback( member )
			if ( message )
				sendGuildNotice( guildId, message, member )
		}
	}
}
module.exports.execGlobalUserNotice = execGlobalUserNotice

const noticeSuppressions = []
function suppressNotice( guildId, type, memberId )
{
	const sup = {}
	sup.guildId = guildId
	sup.memberId = memberId
	sup.type = type
	noticeSuppressions.push( sup )
}
module.exports.suppressNotice = suppressNotice

const justSwitched = {}
// TO DO: redo
/*
function processEvent( type, e )
{	
	let guild = e.guild
	if ( e.guildId )
		guild = client.guilds.find( 'id', e.guildId )
	
	let member = e.member
	if ( !member && e.user && guild )
		member = guild.members.find( 'id', e.user.id ) || e.user
	
	if ( guild )
		for ( const i in noticeSuppressions )
			if ( noticeSuppressions[i].guildId === guild.id &&
				 noticeSuppressions[i].type === type )
			{
				if ( member && noticeSuppressions[i].memberId && noticeSuppressions[i].memberId !== member.id )
					continue
				
				delete noticeSuppressions[i]
				return
			}
	
	switch ( type )
	{
		default:
			break
			
		// presenceUpdate
		// oldMember, newMember
		case 'PRESENCE_MEMBER_INFO_UPDATE':
		{
			// old, new
			// username, avatar, discriminator
			if ( e.old.username !== e.new.username )
				execGlobalUserNotice( e.old.id,
					member =>
					{
						if ( _.nick( member ) === e.new.username )
							return _.fmt( '`%s` is now known as `%s`', e.old.username, e.new.username )
					})
			if ( e.old.avatar !== e.new.avatar )
			{
				if ( settings.get( 'notices', 'hide_avatar_events', true ) )
					return
				const avatarURL = client.users.find( 'id', e.new.id ).avatarURL
				execGlobalUserNotice( e.old.id,
					member =>
					{
						return _.fmt( '`%s` changed their avatar to %s', _.nick( member ), avatarURL )
					})
			}
			break
		}

		// voiceStateUpdate
		// oldMember, newMember
		case 'VOICE_CHANNEL_LEAVE':
		{
			// user, channel, channelid, guildid, newchannelid, newguildid
			if ( e.user.bot ) return
			if ( e.newChannelId === null )
				sendGuildNotice( e.guildId, _.fmt( '`%s` disconnected', _.nick( e.user, guild ) ), member )
			else if ( e.guildId === e.newGuildId )
				justSwitched[ e.user.id ] = true
			break
		}
			
		case 'VOICE_CHANNEL_JOIN':
		{
			// user, channel, channelid, guildid
			if ( e.user.bot ) return
			
			let action = 'connected'
			if ( justSwitched[ e.user.id ] )
			{
				delete justSwitched[ e.user.id ]
				action = 'switched'
			}
			
			sendGuildNotice( e.guildId, _.fmt( '`%s` %s to `%s`', _.nick( e.user, guild ), action, e.channel.name ), member )
			break
		}
			
		case 'GUILD_MEMBER_UPDATE':
		// guildMemberUpdate
		// oldMember, newMember
		{
			// guild, member, rolesAdded, rolesRemoved, previousNick, getChanges
			if ( e.member.nick !== e.previousNick )
			{
				const prev = e.previousNick || e.member.username
				sendGuildNotice( e.guild.id, _.fmt( '`%s` is now known as `%s`', prev, _.nick( e.member ) ), member )
			}
			for ( const i in e.rolesAdded )
				sendGuildNotice( e.guild.id, _.fmt( '`%s` added to `@%s`', _.nick( e.member ), e.rolesAdded[i].name ) )
			for ( const i in e.rolesRemoved )
				sendGuildNotice( e.guild.id, _.fmt( '`%s` removed from `@%s`', _.nick( e.member ), e.rolesRemoved[i].name ) )
			break
		}
	}
}
*/
var client = null
module.exports.setup = _cl => {
    client = _cl
    initGuilds()
	batchDelay = settings.get( 'notices', 'batch_freq', 5 ) * 1000
	batchTick()
	
	// TO DO: add events

    _.log( 'loaded plugin: notices' )
}
