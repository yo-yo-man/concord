const Discord = require( 'discord.js' )

const commands = require( '../commands.js' )
const permissions = require( '../permissions.js' )
const settings = require( '../settings.js' )
const _ = require( '../helper.js' )

const moment = require( 'moment' )
require( 'moment-duration-format' )

let lastSeen = {}
let seenWith = {}
let seenIn = {}

const idleTime = {}
const updateDelay = 60 * 1000
const statsIncrement = 0.00001
function updateUserStats()
{
	client.users.forEach( ( user ) =>
		{
			if ( user.presence.status !== 'offline' )
			{
				lastSeen[ user.id ] = _.time()

				client.guilds.forEach( guild =>
					{
						const member = guild.members.find( 'id', user.id )
						if ( member )
						{
							const vc = member.voiceChannel
							if ( vc )
							{
								if ( !seenIn[ user.id ] )
									seenIn[ user.id ] = {}

								if ( !seenIn[ user.id ][ guild.id ] )
									seenIn[ user.id ][ guild.id ] = 0
								
								seenIn[ user.id ][ guild.id ] += statsIncrement


								if ( !seenWith[ user.id ] )
									seenWith[ user.id ] = {}
								
								vc.members.forEach( other =>
									{
										if ( other.user.id === user.id ) return
										if ( !seenWith[ user.id ][ other.user.id ] )
											seenWith[ user.id ][ other.user.id ] = 0
										
										seenWith[ user.id ][ other.user.id ] += statsIncrement
									})
							}
						}
					})
			}

			if ( user.presence.status === 'idle' )
			{
				if ( !( user.id in idleTime ) )
					idleTime[ user.id ] = _.time()
			}
			else
				if ( user.id in idleTime )
					delete idleTime[ user.id ]
		})
	
	settings.save( 'seenin', seenIn )
	settings.save( 'seenwith', seenWith )
	settings.save( 'lastseen', lastSeen )
	setTimeout( updateUserStats, updateDelay )
}

commands.register( {
	category: 'stats',
	aliases: [ 'who', 'lastseen' ],
	help: 'display user info and when they were last seen',
	args: 'user',
	callback: ( client, msg, args ) =>
	{
		const target = commands.findTarget( msg, args )
		if ( target === false )
			return
		
		const rows = []
		
		// bold
		rows.push( _.fmt( '%s#%s', target.username || target.user.username, target.discriminator || target.user.discriminator ) )
		if ( target.nickname )
			rows[0] += _.fmt( ' AKA %s', target.nickname )
		
		// normal
		const targetStatus = target.presence.status || target.user.presence.status
		if ( targetStatus === 'offline' )
		{
			let timestamp = 0
			if ( target.id in lastSeen )
				timestamp = lastSeen[ target.id ]
			rows.push( _.fmt( 'last seen %s', moment.unix( timestamp ).fromNow() ) )
		}
		else if ( target.id in idleTime )
			rows.push( _.fmt( 'went idle %s', moment.unix( idleTime[ target.id ] ).fromNow() ) )
		else
			rows.push( 'online right now' )
		
		// separate block
		if ( msg.guild && target.roles )
		{
			const roleList = []
			target.roles.forEach( r =>
				{
					roleList.push( r.name )
				})
			
			// bold
			rows.push( _.fmt( 'part of %s', roleList.join( ', ' ) ) )

			// normal
			rows.push( _.fmt( 'joined server %s', moment( target.joinedTimestamp ).fromNow() ) )
		}
		
		// bold
		if ( seenIn[ target.id ] )
		{
			let sorted = Object.keys( seenIn[ target.id ] ) 
			sorted.sort( function(a, b) { return seenIn[ target.id ][b] - seenIn[ target.id ][a] } )

			const top5 = []
			for ( const gid of sorted )
			{
				if ( top5.length > 5 ) break

				const guild = client.guilds.find( 'id', gid )
				if ( !guild ) continue

				const gname = guild.name
				top5.push( gname )
			}

			if ( top5.length > 0 )
				rows.push( 'frequently seen in ' + top5.join( ', ' ) )
		}

		// normal
		if ( seenWith[ target.id ] )
		{
			let sorted = Object.keys( seenWith[ target.id ] ) 
			sorted.sort( function(a, b) { return seenWith[ target.id ][b] - seenWith[ target.id ][a] } )

			const top5 = []
			for ( const mid of sorted )
			{
				if ( top5.length > 5 ) break
				if ( !mid ) continue

				const member = client.users.find( 'id', mid )
				if ( !member ) continue

				top5.push( _.nick( member, msg.guild ) )
			}

			if ( top5.length > 0 )
				rows.push( 'frequently seen with ' + top5.join( ', ' ) )
		}
		
		
		const fields = []
		for ( let i = 0; i < rows.length; i++ )
		{
			const f = {}
			f.name = rows[i]
			f.value = rows[i + 1] || '---'
			fields.push( f )
			i++
		}
		
		let colour = 0x43b581
		if ( targetStatus === 'idle' )
			colour = 0xfaa61a
		else if ( targetStatus === 'offline' )
			colour = 0x8a8a8a

		const embed = new Discord.MessageEmbed({
							color: colour,
							fields: fields,
							thumbnail: { url: target.avatarURL },
						})
		
		msg.channel.send( '', embed )
	} })

let startTime = 0
commands.register( {
	category: 'stats',
	aliases: [ 'uptime', 'stats' ],
	help: 'bot uptime and statistics',
	callback: ( client, msg, args ) =>
	{
		const uptime = moment.duration( (_.time() - startTime) * 1000 )
		
		let stats = _.fmt( 'uptime: %s (%s)\n', uptime.humanize(), uptime.format( 'h:mm:ss' ) )
		stats += _.fmt( 'commands since boot: %s\n', commands.numSinceBoot )
		stats += _.fmt( 'servers connected: %s\n', client.guilds.size )
		
		let total = 0
		let listening = 0
		client.channels.forEach( channel =>
			{
				if ( channel.type === 'text' && channel.guild )
				{
					total++
					if ( channel.permissionsFor( client.user ).has( Discord.Permissions.FLAGS.READ_MESSAGES ) )
						listening++
				}
			})
			
		stats += _.fmt( 'channels listening: %s / %s\n', listening, total )
		stats += _.fmt( 'users seen / online: %s / %s\n', Object.keys( lastSeen ).length, client.users.size )
		
		try
		{
			const audio = require( './audio.js' )
			stats += _.fmt( 'songs played since boot: %s\n', audio.songsSinceBoot )
		} catch (e) {}
		
		msg.channel.send( '```' + stats + '```' )
	} })

var client = null
module.exports.setup = _cl => {
    client = _cl
    startTime = _.time()
	lastSeen = settings.get( 'lastseen', null, {} )
	seenWith = settings.get( 'seenwith', null, {} )
	seenIn = settings.get( 'seenin', null, {} )
    updateUserStats()
    _.log( 'loaded plugin: stats' )
}
