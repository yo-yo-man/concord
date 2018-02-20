const commands = require( '../commands.js' )
const permissions = require( '../permissions.js' )
const settings = require( '../settings.js' )
const _ = require( '../helper.js' )

const notices = require( './notices.js' )

function clearMessages( msg, limit, target, after )
{
	if ( isNaN( limit ) )
		return msg.channel.send( _.fmt( '`%s` is not a number', limit ) )
	
	if ( !msg.channel.permissionsFor( client.user ).has( require( 'discord.js' ).Permissions.FLAGS.MANAGE_MESSAGES ) )
		return msg.channel.send( "invalid 'manage messages' permission in this channel" )

	msg.channel.fetchMessages(
			{
				limit: 10,
				after: after,
			})
		.then( messages => 
			{
				const toDelete = []
				messages.forEach( m =>
					{
						if ( target && target.id !== message )
							return
						
						if ( toDelete.length > limit )
							return

						toDelete.push( m )
					})

				msg.channel.bulkDelete( toDelete )
					.then( deleted =>
						{
							let suffix = ''
							if ( target )
								suffix = ` by \`${ _.nick( target, msg.guild ) }\``
							msg.channel.send( `\`${ _.nick( msg.member, msg.guild ) }\` cleared \`${ deleted.size }\` messages${ suffix }` )
						})
					.catch( e => msg.channel.send( _.fmt( 'error deleting messages: `%s`', e.message ) ) )
			})
		.catch( e => msg.channel.send( _.fmt( 'error fetching messages: `%s`', e.message ) ) )
}

commands.register( {
	category: 'moderation',
	aliases: [ 'clear' ],
	help: 'clear messages',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'limit [user]',
	callback: ( client, msg, args ) =>
	{
		const split = args.split( ' ' )
		const limit = split[0]
		let target = split[1] || false

		if ( target )
		{
			target = commands.findTarget( msg, target )
			if ( !target )
				return
		}
		
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
			return msg.channel.send( _.fmt( '`%s` is not a numeric message ID', after ) )
		
		clearMessages( msg, limit, false, after )
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
	if ( commands.tempBlacklist.includes( member.id ) ) return
	if ( commands.blacklistedUsers.includes( member.id ) ) return
	
	const guild = member.guild

	let user = member
	if ( member.user )
		user = member.user
	
	const timespan = settings.get( 'moderation', 'cooldown_timespan', 10 ) * 1000
	const warning = settings.get( 'moderation', 'cooldown_warning_ratio', 1.5 )
	const rate = settings.get( 'moderation', 'cooldown_rate', 3.5 )
	
	if ( !eventAllowance[ user.id ] )
		eventAllowance[ user.id ] = rate
	
	if ( !lastEvent[ user.id ] )
		lastEvent[ user.id ] = Date.now()
	
	const time_passed = Date.now() - lastEvent[ user.id ]
	lastEvent[ user.id ] = Date.now()
	eventAllowance[ user.id ] += time_passed * ( rate / timespan )
	eventAllowance[ user.id ] -= 1
	
	if ( eventAllowance[ user.id ] > rate )
		eventAllowance[ user.id ] = rate
	
	if ( eventAllowance[ user.id ] < 1 )
	{
		delete eventAllowance[ user.id ]
		
		commands.tempBlacklist.push( user.id )
		tempBlacklists[ user.id ] = _.time() + settings.get( 'moderation', 'cooldown_blacklist_time', 60 )
		user.createDM().then( dm => dm.send( _.fmt( '**NOTICE:** You have been temporarily blacklisted due to excess spam' ) ) )
		
		const owner = client.users.find( 'id', settings.get( 'config', 'owner_id', '' ) )
		if ( owner )
			owner.createDM().then( d => d.send( _.fmt( '**NOTICE:** Automatically added `%s#%s` to temporary blacklist for spam', user.username, user.discriminator ) ) )
	}
	else if ( eventAllowance[ user.id ] <= warning )
	{
		if ( !nextWarning[ user.id ] || Date.now() >= nextWarning[ user.id ] )
		{
			nextWarning[ user.id ] = Date.now() + timespan / 2
			user.createDM().then( dm => dm.send( _.fmt( '**WARNING:** Potential spam detected. Please slow down or you will be temporarily blacklisted' ) ) )
		}
	}
}
module.exports.processCooldown = processCooldown

var client = null
module.exports.setup = _cl => {
    client = _cl
    updateTempBlacklists()
    _.log( 'loaded plugin: moderation' )
}
