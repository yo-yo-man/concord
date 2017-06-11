const commands = require( '../commands.js' )
const permissions = require( '../permissions.js' )
const settings = require( '../settings.js' )
const _ = require( '../helper.js' )

const notices = require( './notices.js' )

function clearMessages( msg, limit, target, after )
{
	if ( isNaN( limit ) )
		return msg.channel.sendMessage( _.fmt( '`%s` is not a number', limit ) )
	
	if ( parseInt( limit ) > 100 )
		return msg.channel.sendMessage( _.fmt( 'can only delete `100` messages at a time' ) )
	
	if ( !client.User.can( permissions.discord.Text.MANAGE_MESSAGES, msg.channel ) )
		return msg.channel.sendMessage( "invalid 'manage messages' permission in this channel" )
	
	if ( target )
	{
		target = commands.findTarget( msg, target )
		if ( target === false )
			return
	}
	else if ( !after )
		limit++ // clear the user's !clear command as well
	
	let before = msg
	if ( after ) before = null
	
	limit = Math.min( limit, 100 )
	const lookback = 100 // number of messages to look back into
	msg.channel.fetchMessages( lookback, null, after ).then( () =>
		{
			const msglist = msg.channel.messages
			if ( after ) msglist.reverse()
			
			const toDelete = []
			for ( let i = msglist.length - 1; i >= 0; i-- )
			{
				const message = msglist[i]
				
				if ( message.deleted || ( target !== false && target.id !== message.author.id ) )
					continue
				
				if ( toDelete.length >= limit )
					break
					
				toDelete.push( message )
			}
			
			client.Messages.deleteMessages( toDelete ).then( () =>
				{
					let byUser = ''
					if ( target !== false )
						byUser = _.fmt( ' by `%s`', _.nick( target ) )
					let numCleared = toDelete.length
					if ( !after ) numCleared -= 1  // subtract user's !clear command
					msg.channel.sendMessage( _.fmt( '`%s` cleared `%s` messages%s', _.nick( msg.member ), numCleared, byUser ) )
				}).catch( e => msg.channel.sendMessage( _.fmt( 'error deleting messages: `%s`', e.message ) ) )
		}).catch( e => msg.channel.sendMessage( _.fmt( 'error fetching messages: `%s`', e.message ) ) )
}

commands.register( {
	category: 'moderation',
	aliases: [ 'clear' ],
	help: 'clear messages',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'limit=100 [user]',
	callback: ( client, msg, args ) =>
	{
		const split = args.split( ' ' )
		const limit = split[0] || 99
		const target = split[1] || false
		
		clearMessages( msg, limit, target, null )
	} })

commands.register( {
	category: 'moderation',
	aliases: [ 'clearafter' ],
	help: 'clear messages after a message ID',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'messageID [limit=100]',
	callback: ( client, msg, args ) =>
	{
		const split = args.split( ' ' )
		const after = split[0]
		const limit = split[1] || 99
		
		if ( isNaN( after ) )
			return msg.channel.sendMessage( _.fmt( '`%s` is not a numeric message ID', after ) )
		
		clearMessages( msg, limit, false, after )
	} })

function kickMember( member, admin, reason )
{
	const guild = member.guild
	
	reason = reason || ''
	if ( reason !== '' )
		reason = '(reason: `' + reason + '`)'
	notices.sendGuildNotice( guild.id, _.fmt( '`%s` was kicked by `%s` %s', _.nick( member ), _.nick( admin, guild ), reason ) )
	
	notices.suppressNotice( guild.id, 'GUILD_MEMBER_REMOVE', member.id )
	member.kick()
	
	member.openDM().then( dm => dm.sendMessage( _.fmt( '**NOTICE:** You have been kicked from `%s` by `%s` %s', guild.name, _.nick( admin, guild ), reason ) ) )
}
module.exports.kickMember = kickMember

commands.register( {
	category: 'moderation',
	aliases: [ 'kick' ],
	help: 'kick a member from the server',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'target [reason]',
	callback: ( client, msg, args ) =>
	{
		if ( !client.User.can( permissions.discord.General.KICK_MEMBERS, msg.guild ) )
			return msg.channel.sendMessage( "invalid 'kick members' permission in this server" )

		args = _.sanesplit( args, ' ', 1 )
		let target = args[0]
		const reason = args[1]
		
		target = commands.findTarget( msg, target )
		if ( target === false )
			return
		
		if ( permissions.hasAdmin( target ) )
			msg.channel.sendMessage( 'you cannot kick that member' )
		else
			kickMember( target, msg.member, reason )
	} })

function banMember( member, admin, reason )
{
	const guild = member.guild
	
	reason = reason || ''
	if ( reason !== '' )
		reason = '(reason: `' + reason + '`)'
	notices.sendGuildNotice( guild.id, _.fmt( '`%s` was banned by `%s` %s', _.nick( member ), _.nick( admin, guild ), reason ) )
	
	notices.suppressNotice( guild.id, 'GUILD_MEMBER_REMOVE', member.id )
	notices.suppressNotice( guild.id, 'GUILD_BAN_ADD', member.id )
	member.ban(0)
	
	member.openDM().then( dm => dm.sendMessage( _.fmt( '**NOTICE:** You have been banned from `%s` by `%s` %s', guild.name, _.nick( admin, guild ), reason ) ) )
}
module.exports.banMember = banMember

commands.register( {
	category: 'moderation',
	aliases: [ 'ban' ],
	help: 'ban a member from the server',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'target [reason]',
	callback: ( client, msg, args ) =>
	{
		if ( !client.User.can( permissions.discord.General.BAN_MEMBERS, msg.guild ) )
			return msg.channel.sendMessage( "invalid 'ban members' permission in this server" )

		args = _.sanesplit( args, ' ', 1 )
		let target = args[0]
		const reason = args[1]
		
		target = commands.findTarget( msg, target )
		if ( target === false )
			return
		
		if ( permissions.hasAdmin( target ) )
			msg.channel.sendMessage( 'you cannot ban that member' )
		else
			banMember( target, msg.member, reason )
	} })

commands.register( {
	category: 'moderation',
	aliases: [ 'region', 'changeregion', 'setregion' ],
	help: 'change server region',
	flags: [ 'admin_only', 'no_pm' ],
	args: '[region]',
	callback: ( client, msg, args ) =>
	{
		if ( !client.User.can( permissions.discord.General.MANAGE_GUILD, msg.guild ) )
			return msg.channel.sendMessage( "invalid 'manage guild' permission in this server" )

		const guild = msg.guild
		guild.fetchRegions().then( regionList =>
			{
				const regions = []
				for ( const i in regionList )
				{
					const r = regionList[i]
					if ( !r.deprecated && !r.vip && !r.custom )
						regions.push( r.id )
				}
				
				if ( !args || regions.indexOf( args ) === -1 )
					return msg.channel.sendMessage( _.fmt( 'available regions:\n```%s```', _.wrap( regions, ', ', 3 ) ) )
				
				notices.suppressNotice( msg.member.guild.id, 'GUILD_UPDATE' )
				notices.sendGuildNotice( msg.member.guild.id, _.fmt( '`%s` changed server region to `%s`', _.nick( msg.member ), args ) )
				guild.edit( null, null, args )
			})
	} })

const tempBlacklists = {}
const tempBlacklistDelay = 10 * 1000
function updateTempBlacklists()
{
	for ( const uid in tempBlacklists )
	{
		if ( _.time() > tempBlacklists[uid] )
		{
			delete tempBlacklists[uid]
			
			const index = commands.tempBlacklist.indexOf( uid )
			commands.tempBlacklist.splice( index, 1 )
		}
	}
	
	setTimeout( updateTempBlacklists, tempBlacklistDelay )
}

const nextWarning = {}
const eventAllowance = {}
const lastEvent = {}
function processCooldown( member )
{
	if ( permissions.hasAdmin( member ) && settings.get( 'moderation', 'cooldown_admin_immunity', false ) ) return
	
	const guild = member.guild
	
	const timespan = settings.get( 'moderation', 'cooldown_timespan', 10 ) * 1000
	const warning = settings.get( 'moderation', 'cooldown_warning_ratio', 1.5 )
	const rate = settings.get( 'moderation', 'cooldown_rate', 3.5 )
	
	if ( !eventAllowance[ member.id ] )
		eventAllowance[ member.id ] = rate
	
	if ( !lastEvent[ member.id ] )
		lastEvent[ member.id ] = Date.now()
	
	const time_passed = Date.now() - lastEvent[ member.id ]
	lastEvent[ member.id ] = Date.now()
	eventAllowance[ member.id ] += time_passed * ( rate / timespan )
	eventAllowance[ member.id ] -= 1
	
	if ( eventAllowance[ member.id ] > rate )
		eventAllowance[ member.id ] = rate
	
	if ( eventAllowance[ member.id ] < 1 )
	{
		delete eventAllowance[ member.id ]
		
		commands.tempBlacklist.push( member.id )
		tempBlacklists[ member.id ] = _.time() + settings.get( 'moderation', 'cooldown_blacklist_time', 60 )
		member.openDM().then( dm => dm.sendMessage( _.fmt( '**NOTICE:** You have been temporarily blacklisted due to excess spam' ) ) )
		
		const owner = client.Users.get( settings.get( 'config', 'owner_id', '' ) )
		if ( owner )
			owner.openDM().then( d => d.sendMessage( _.fmt( '**NOTICE:** Automatically added `%s#%s` to temporary blacklist for spam', member.username, member.discriminator ) ) )
	}
	else if ( eventAllowance[ member.id ] <= warning )
	{
		if ( !nextWarning[ member.id ] || Date.now() >= nextWarning[ member.id ] )
		{
			nextWarning[ member.id ] = Date.now() + timespan / 2
			member.openDM().then( dm => dm.sendMessage( _.fmt( '**WARNING:** Potential spam detected. Please slow down or you will be temporarily blacklisted' ) ) )
		}
	}
	
	//console.log( time_passed, lastEvent[ member.id ], eventAllowance[ member.id ] );
}
module.exports.processCooldown = processCooldown

var client = null
module.exports.setup = _cl => {
    client = _cl
    updateTempBlacklists()
    _.log( 'loaded plugin: moderation' )
}
