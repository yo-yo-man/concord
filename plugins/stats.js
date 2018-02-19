const Discordie = require( 'discordie' )

const commands = require( '../commands.js' )
const permissions = require( '../permissions.js' )
const settings = require( '../settings.js' )
const _ = require( '../helper.js' )

const moment = require( 'moment' )
require( 'moment-duration-format' )

let lastSeen = {}
let seenWith = {}

const idleTime = {}
const updateDelay = 60 * 1000
function updateUserStats()
{
	client.Users.forEach( ( user ) =>
		{
			if ( user.status !== 'offline' )
			{
				lastSeen[ user.id ] = _.time()

				client.Guilds.forEach( ( guild ) =>
					{
						if ( user.memberOf( guild ) )
						{
							const vc = user.getVoiceChannel( guild )
							if ( vc )
							{
								if ( !seenIn[ user.id ] )
									seenIn[ user.id ] = {}

								if ( !seenIn[ user.id ][ guild.id ] )
									seenIn[ user.id ][ guild.id ] = 1
								else
									seenIn[ user.id ][ guild.id ]++


								if ( !seenWith[ user.id ] )
									seenWith[ user.id ] = {}
								
								for ( const i in vc.members )
								{
									const member = vc.members[i]
									if ( member.id === user.id ) continue
									if ( !seenWith[ user.id ][ member.id ] )
										seenWith[ user.id ][ member.id ] = 1
									else
										seenWith[ user.id ][ member.id ]++
								}
							}
						}
					})
			}

			if ( user.status === 'idle' )
			{
				if ( !( user.id in idleTime ) )
					idleTime[ user.id ] = _.time()
			}
			else
				if ( user.id in idleTime )
					delete idleTime[ user.id ]
		})
	
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
		rows.push( _.fmt( '%s#%s', target.username, target.discriminator ) )
		if ( target.nick )
			rows[0] += _.fmt( 'AKA %s', target.nick )
		
		// normal
		if ( target.status == 'offline' )
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
		if ( !msg.channel.isPrivate )
		{
			const roleList = [ 'everyone' ]
			for ( const i in target.roles )
				roleList.push( target.roles[i].name )
			
			// bold
			rows.push( _.fmt( 'part of %s', roleList.join( ', ' ) ) )

			// normal
			rows.push( _.fmt( 'joined server %s', moment( target.joined_at ).fromNow() ) )
		}
		
		// bold
		if ( seenIn[ target.id ] )
		{
			const top5 = []
			for ( const gid in seenIn[ target.id ] )
			{
				if ( top5.length > 5 ) break

				const gname = client.Guilds.get( gid ).name
				top5.push( gname )
			}
			rows.push( 'frequently seen in ' + top5.join( ', ' ) )
		}

		// normal
		if ( seenWith[ target.id ] )
		{
			const top5 = []
			for ( const member in seenWith[ target.id ] )
			{
				if ( top5.length > 5 ) break

				const mem = client.Users.get( member )
				if ( msg.channel.isPrivate )
					top5.push( _.nick( mem ) )
				else
					top5.push( _.nick( mem, msg.guild ) )
			}
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
		if ( target.status === 'idle' )
			colour = 0xfaa61a
		else if ( target.status === 'offline' )
			colour = 0x8a8a8a
		
		msg.channel.sendMessage( '', false,
			{
				color: colour,
				fields,
				footer: { text: _.fmt( 'ID: %s', target.id ) },
				thumbnail: { url: target.avatarURL },
			})
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
		stats += _.fmt( 'servers connected: %s\n', client.Guilds.length )
		
		let total = 0
		let listening = 0
		client.Channels.forEach( ( channel ) => {
				if ( channel.type === Discordie.ChannelTypes.GUILD_TEXT && !channel.isPrivate )
				{
					total++
					if ( client.User.can( permissions.discord.Text.READ_MESSAGES, channel ) )
						listening++
				}
			})
			
		stats += _.fmt( 'channels listening: %s / %s\n', listening, total )
		stats += _.fmt( 'users seen online: %s / %s\n', Object.keys( lastSeen ).length, client.Users.length )
		
		try
		{
			const audio = require( './audio.js' )
			stats += _.fmt( 'songs played since boot: %s\n', audio.songsSinceBoot )
		} catch (e) {}
		
		msg.channel.sendMessage( '```' + stats + '```' )
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
