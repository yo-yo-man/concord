const commands = require( '../commands.js' )
const permissions = require( '../permissions.js' )
const settings = require( '../settings.js' )
const _ = require( '../helper.js' )

const fs = require( 'fs' )
const path = require( 'path' )
const spawn = require('child_process').spawn

const Discord = require( 'discord.js' )
const request = require('request')
const ydl = require( 'youtube-dl' )
const ytdl_core = require( 'ytdl-core' )
const moment = require( 'moment' )
require( 'moment-duration-format' )

const playlistDir = '../playlists'

const default_youtube_urls =
	[
		'(https?\\:\\/\\/)?(www\\.)?(youtube\\.com|youtu\\.be)\\/.*',
	]

const default_additional_urls =
	[
		'(https?\\:\\/\\/)?(www\\.)?soundcloud.com\\/.*',
		'(https?\\:\\/\\/)?(.*\\.)?bandcamp.com\\/track/.*',
		'(https?\\:\\/\\/)?(www\\.)?vimeo.com\\/.*',
		'(https?\\:\\/\\/)?(www\\.)?vine.co\\/v\\/.*',
		'(https?\\:\\/\\/)?(.*\\.)?twitch.tv\\/.*'
	]

const default_accepted_files =
	[
		'.*\\.mp3',
		'.*\\.ogg',
		'.*\\.wav',
		'.*\\.flac',
		'.*\\.m4a',
		'.*\\.aac',
		'.*\\.webm',
		'.*\\.mp4',
	]

const audioBots = []
function initAudio()
{
	client.concord_audioSessions = {}
	audioBots.push( client )

	const tokens = settings.get( 'config', 'helper_tokens', [] )
	for ( const i in tokens )
	{
		const tok = tokens[i]

		const cl = new Discord.Client()
		cl.login( tok )

		cl.on( 'ready', e =>
			{
				_.log( `connected helper as ${ cl.user.tag }`)
			})

		cl.on( 'disconnected', e => _.logEvent( 'helper-disconnected', e ) )
		cl.on( 'guildCreate', e => _.logEvent( 'helper-guildCreate', e ) )
		cl.on( 'guildDelete', e => _.logEvent( 'helper-guildDelete', e ) )
		cl.on( 'guildUnavailable', e => _.logEvent( 'helper-guildUnavailable', e ) )
		cl.on( 'error', e => _.logError( e ) )

		cl.concord_audioSessions = {}
		audioBots.push( cl )
	}
}

songTracking = {}
function trackSong( gid, song )
{
	if ( !songTracking[ gid]  )
		songTracking[ gid ] = {}

	let url = song.url
	const regex = /^(.*)(?:&(?:t|v|start|end)=.*)/g.exec( url )
	if ( regex )
		url = regex[1]

	if ( !songTracking[ gid ][ url ] )
	{
		songTracking[ gid ][ url ] = {}
		songTracking[ gid ][ url ].plays = 1
		songTracking[ gid ][ url ].title = song.title
	}
	else
		songTracking[ gid ][ url ].plays++

	settings.save( 'songtracking', songTracking )
}

function findSession( msg )
{
	const channel = msg.member.voiceChannel
	if ( !channel )
		return false

	for ( const bot of audioBots )
	{
		const sess = bot.concord_audioSessions[ channel.guild.id ]

		if ( sess && sess.conn.channel.id == channel.id )
			return sess
	}

	return false
}

const activityCheckDelay = 30 * 1000
function checkSessionActivity()
{
	const timeout = settings.get( 'audio', 'idle_timeout', 60 )

	for ( const bot of audioBots )
	{
		for ( const gid in bot.concord_audioSessions )
		{
			const sess = bot.concord_audioSessions[ gid ]

			if ( !sess )
				continue
			
			if ( !sess.playing && _.time() >= sess.lastActivity + timeout )
			{
				leave_channel( sess )
				continue
			}

			const numVoice = sess.conn.channel.members.size
			if ( numVoice == 1 )
			{
				leave_channel( sess )
				continue
			}
		}
	}

	setTimeout( checkSessionActivity, activityCheckDelay )
}

function create_session( bot, channel, conn )
{
	const gid = channel.guild.id

	bot.concord_audioSessions[ gid ] = {}
	bot.concord_audioSessions[ gid ].conn = conn

	bot.concord_audioSessions[ gid ].queue = []
	bot.concord_audioSessions[ gid ].volume = settings.get( 'audio', 'volume_default', 0.5 )

	bot.concord_audioSessions[ gid ].guild = gid
	bot.concord_audioSessions[ gid ].bot = bot

	return bot.concord_audioSessions[ gid ]
}

function join_channel( msg )
{
	const promise = new Promise( ( resolve, reject ) =>
		{
			const channel = msg.member.voiceChannel
				
			if ( !channel )
				return reject( 'you are not in a voice channel' )
			
			let success = false
			let botsArray = audioBots
			if ( settings.get( 'audio', 'shuffle_bots', false ) )
				botsArray = _.shuffleArr( audioBots )
			for ( const bot of botsArray )
			{
				const sess = findSession( msg )
				if ( sess )
					return resolve( sess )
				else if ( !sess && !bot.concord_audioSessions[ channel.guild.id ] )
				{
					if ( !channel.permissionsFor( bot.user ).has( Discord.Permissions.FLAGS.CONNECT ) ||
						!channel.permissionsFor( bot.user ).has( Discord.Permissions.FLAGS.SPEAK ) ||
						!channel.permissionsFor( bot.user ).has( Discord.Permissions.FLAGS.USE_VAD ) )
							return reject( _.fmt( 'invalid permissions for `%s`', channel.name ) )

					const guild = bot.guilds.find( 'id', channel.guild.id )
					if ( guild )
						guild.channels.findAll( 'type', 'voice' ).forEach( chan =>
							{
								if ( success ) return
								if ( chan.id == channel.id )
								{
									chan.join().then( conn => resolve( create_session( bot, chan, conn ) ) )
										.catch( e => reject( `error joining channel: \`${ e.message }\`` ) )
									success = true
									return
								}
							})

					if ( success )
						break
				}
			}

			if ( !success )
				return reject( 'all bots are currently busy in other channels' )
		})
	
	return promise
}

function leave_channel( sess )
{
	sess.closing = true
	sess.playing = false

	if ( sess.ffmpeg )
		sess.ffmpeg.kill( 'SIGKILL' )

	if ( sess.timeInterval )
		clearInterval( sess.timeInterval )

	if ( sess.dispatch )
	{
		stop_playback( sess )
		sess.dispatch.destroy()
	}

	if ( sess.conn.channel )
		sess.conn.channel.leave()

	const bot = sess.bot
	delete bot.concord_audioSessions[ sess.guild ]
}

function stop_playback( sess )
{
	if ( sess.dispatch )
	{
		sess.dispatch.removeAllListeners( 'end' )
		sess.dispatch.end()
	}
}

function skip_playback( sess )
{
	sess.dispatch.end()
}

function start_player( sess, forceseek )
{
	if ( sess.closing ) return

	if ( sess.ffmpeg )
	{
		sess.ffmpeg.kill( 'SIGKILL' )
		delete sess.ffmpeg
	}

	if ( sess.timeInterval )
		clearInterval( sess.timeInterval )

	stop_playback( sess )
	sess.playing = false

	if ( sess.dispatch )
	{
		sess.dispatch.destroy()
		delete sess.dispatch
	}
	
	sess.lastActivity = _.time()
	
	const song = sess.queue[0]
	if ( !song )
		return

	sess.lastSong = song
	trackSong( sess.conn.channel.guild.id, song )
	
	if ( song.channel && typeof forceseek === 'undefined' && !sess.loop )
	{
		let by_user = get_queuedby_user( song )
		if ( sess.queue.length > 1 )
			by_user += `, +${sess.queue.length - 1} in queue`

		if ( !sess.hideNP )
			song.channel.send( _.fmt( '`NOW PLAYING in %s: %s [%s] (%s)`', sess.conn.channel.name, song.title, song.length, by_user ) )
	}
	sess.hideNP = false
	
	const guildname = sess.conn.channel.guild.name
	const channelname = sess.conn.channel.name
	_.log( _.fmt( 'playing <%s> in (%s/%s)', song.url, guildname, channelname ) )
	module.exports.songsSinceBoot++
	
	sess.skipVotes = []
	sess.paused = false
	
	sess.starttime = 0
	const seek = forceseek || song.seek
	let params = [ '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '2' ]
	if ( seek )
	{
		sess.starttime = seek
		params.push( '-ss', seek )
	}
	
	const volume = sess.volume || settings.get( 'audio', 'volume_default', 0.5 )

	if ( settings.get( 'audio', 'force_speed', false ) )
		params.push( '-re' )

	let filter = `volume=${volume}`
	if ( settings.get( 'audio', 'normalize', true ) )
	{
		const I = settings.get( 'audio', 'norm_target', -24 )
		const TP = settings.get( 'audio', 'norm_maxpeak', -2 )
		const LRA = settings.get( 'audio', 'norm_range', 7 )

		let offset = 10 * Math.log( volume ) / Math.log( 2 )
		if ( offset < -99 || offset === -Infinity )
			offset = -99
		if ( offset > 99 || offset === Infinity )
			offset = 99

		filter = `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:offset=${offset}`
	}

	params.push( '-i', song.streamurl )

	params.push( '-b:a', sess.conn.channel.bitrate )
	params.push( '-af', filter )
	params.push( '-f', 'opus' )
	params.push( 'pipe:1' )

	sess.ffmpeg = spawn( 'ffmpeg', params )
	//sess.ffmpeg.stderr.on( 'data', e => console.log( e.toString() ) )

	const streamOptions = { type: 'ogg/opus', passes: 3 }
	sess.dispatch = sess.conn.play( sess.ffmpeg.stdout, streamOptions )

	if ( !sess.conn.dispatcher )
	{
		_.log( `ERROR: could not start encoder with params "${ params.join( ' ' ) }"` )
		leave_channel( sess )
		return
	}
	
	sess.playing = true
	sess.dispatch.once( 'end', () =>
		{
			sess.playing = false
			rotate_queue( sess )
		})

	sess.timeInterval = setInterval( () =>
		{
			sess.lastActivity = _.time()
			sess.time = sess.starttime + ( sess.dispatch.streamTime / 1000 )
			if ( sess.queue[0] && sess.queue[0].endAt && sess.time >= sess.queue[0].endAt )
				skip_playback( sess )
		}, 1000 )
}

function rotate_queue( sess )
{
	if ( sess.closing ) return

	if ( typeof sess.loop === 'undefined' || !sess.loop )
		sess.queue.shift()
	start_player( sess )
}

function get_queuedby_user( song )
{
	let by_user = '<unknown>'
	if ( song.queuedby )
		by_user = _.nick( song.queuedby, song.channel.guild )
	return by_user
}

function queryErr( err )
{
	console.log( _.filterlinks( err ) )
	return _.fmt( 'could not query youtube info (%s)', _.filterlinks( err ) )
}

function exceedsLength( length_seconds )
{
	const max_length = settings.get( 'audio', 'max_length', 62 ) * 60
	if ( length_seconds > max_length )
	{
		const thislen = moment.duration( max_length * 1000 ).format( 'hh:mm:ss' )
		const maxlen = moment.duration( max_length * 1000 ).format( 'hh:mm:ss' )
		return _.fmt( 'song exceeds max length: %s > %s', thislen, maxlen )
	}

	return false
}

function parseVars( url )
{
	let songInfo = {}

	songInfo.seek = false
	if ( url.indexOf( 't=' ) !== -1 )
		seek = _.parsetime( _.matches( /t=(.*)/g, url )[0] )
	if ( url.indexOf( 'start=' ) !== -1 )
		seek = _.parsetime( _.matches( /start=(.*)/g, url )[0] )

	songInfo.endAt = false
	if ( url.indexOf( 'end=' ) !== -1 )
		endAt = _.parsetime( _.matches( /end=(.*)/g, url )[0] )

	return songInfo
}

function findDesiredBitrate( formats )
{
	const desired_bitrate = settings.get( 'audio', 'desired_bitrate', false )
	if ( desired_bitrate )
	{
		const format = formats.filter( f => ( f.audioBitrate == desired_bitrate || f.abr == desired_bitrate ) )[0]
		if ( format )
			return format.url
	}

	return false
}

function parseYoutube( args )
{
	const msg = args.msg
	const url = args.url

	const resolve = args.resolve
	const reject = args.reject

	const err = args.err
	const info = args.info

	if ( err )
		return queryErr( err )

	const len_err = exceedsLength( info.length_seconds )
	if ( len_err !== false )
		return reject( len_err )

	let songInfo = {}
	songInfo.url = url
	songInfo.title = info.title
	songInfo.length = moment.duration( info.length_seconds * 1000 ).format( 'hh:mm:ss' )
	songInfo.length_seconds = info.length_seconds

	songInfo = Object.assign( parseVars( url ), songInfo )

	songInfo.streamurl = info.url
	if ( info.formats )
	{
		songInfo.streamurl = info.formats[0].url

		const desiredStream = findDesiredBitrate( info.formats )
		if ( desiredStream )
			songInfo.streamurl = desiredStream
	}

	resolve( songInfo )
}

function parseGeneric( args )
{
	const msg = args.msg
	const url = args.url

	const resolve = args.resolve
	const reject = args.reject

	const err = args.err
	const info = args.info

	if ( err )
		return queryErr( err )

	const length_seconds = info.duration.split(':').reduce( ( acc, time ) => ( 60 * acc ) + + time )

	const len_err = exceedsLength( length_seconds )
	if ( len_err !== false )
		return reject( len_err )

	let songInfo = {}
	songInfo.url = url
	songInfo.title = info.title
	songInfo.length = moment.duration( length_seconds * 1000 ).format( 'hh:mm:ss' )
	songInfo.length_seconds = length_seconds

	songInfo = Object.assign( parseVars( url ), songInfo )

	songInfo.streamurl = info.url
	if ( info.formats )
	{
		songInfo.streamurl = info.formats[0].url
		
		// skip rtmp links (soundcloud)
		if ( info.formats[0].protocol )
		{
			for ( let i = info.formats.length - 1; i >= 0; i-- )
			{
				if ( info.formats[i].protocol === 'rtmp' )
					info.formats.splice( i, 1 )
				else
					songInfo.streamurl = info.formats[i].url
			}
		}

		const desiredStream = findDesiredBitrate( info.formats )
		if ( desiredStream )
			songInfo.streamurl = desiredStream
	}

	resolve( songInfo )
}

function parseFile( args )
{
	const msg = args.msg
	const url = args.url

	const resolve = args.resolve
	const reject = args.reject

	let fn = url.split( '/' )
	fn = fn[ fn.length - 1 ]

	let songInfo = {}
	songInfo.url = url
	songInfo.title = fn
	songInfo.length = '??:??'
	songInfo.length_seconds = 0

	songInfo = Object.assign( parseVars( url ), songInfo )

	songInfo.streamurl = url

	resolve( songInfo )
}

function queryRemote( msg, url )
{
	const promise = new Promise( ( resolve, reject ) =>
		{		
			const youtube_urls = settings.get( 'audio', 'youtube_urls', default_youtube_urls )
			for ( const i in youtube_urls )
				if ( url.match( youtube_urls[i] ) )
					return ytdl_core.getInfo( url, { filter: 'audioonly' }, ( err, info ) => parseYoutube( { msg, url, resolve, reject, err, info } ) )
				
			const additional_urls = settings.get( 'audio', 'additional_urls', default_additional_urls )
			for ( const i in additional_urls )
				if ( url.match( additional_urls[i] ) )
					return ydl.getInfo( url, [], ( err, info ) => parseGeneric( { msg, url, resolve, reject, err, info } ) )

			const accepted_files = settings.get( 'audio', 'accepted_files', default_accepted_files )
				for ( const i in accepted_files )
					if ( url.match( accepted_files[i] ) )
					{						
						request( { url: url, method: 'HEAD' }, ( error, response, body ) =>
							{
								if ( !error && response.statusCode === 200 )
									parseFile( { msg, url, resolve, reject } )
								else
									reject( `remote file error ${ error }` )
							})

						return
					}
				
			console.log( _.fmt( 'ERROR: could not find suitable query mode for <%s>', url ) )
			reject( '`ERROR: could not find suitable query mode`' )
		})

	return promise
}

function queueSong( msg, sess, info )
{
	info.channel = msg.channel
	info.queuedby = msg.member

	if ( !sess )
		return '`invalid audio session`'
	
	const queue_empty = sess.queue.length === 0
	sess.queue.push( info )
	
	if ( queue_empty )
	{
		sess.hideNP = true
		start_player( sess )
		return _.fmt( '`%s` started playing `%s [%s]`', _.nick( msg.member, msg.guild ), info.title, info.length )
	}
	else
		return _.fmt( '`%s` queued `%s [%s]`', _.nick( msg.member, msg.guild ), info.title, info.length )
}

function is_accepted_url( link )
{
	const youtube_urls = settings.get( 'audio', 'youtube_urls', default_youtube_urls )
	const additional_urls = settings.get( 'audio', 'additional_urls', default_additional_urls )
	const accepted_files = settings.get( 'audio', 'accepted_files', default_accepted_files )
	
	const acceptedURLs = []
	acceptedURLs.push(...youtube_urls)
	acceptedURLs.push(...additional_urls)
	acceptedURLs.push(...accepted_files)
	
	let found = false
	for ( const i in acceptedURLs )
		if ( link.match( acceptedURLs[i] ) )
			found = true
			
	return found
}

commands.register( {
	category: 'audio',
	aliases: [ 'play', 'p' ],
	help: 'play audio from a url',
	flags: [ 'no_pm' ],
	args: 'url',
	callback: ( client, msg, args ) =>
	{
		args = args.replace( /</g, '' ).replace( />/g, '' ) // remove filtering
		if ( !is_accepted_url( args ) )
			return msg.channel.send( _.fmt( '`%s` is not an accepted url', args ) )
		
		join_channel( msg ).then( sess =>
			{				
				queryRemote( msg, args ).then( info =>
					{
						msg.channel.send( queueSong( msg, sess, info ) )
					}).catch( err => msg.channel.send( '```' + err + '```' ) )
			})
			.catch( e => { if ( e.message ) throw e; msg.channel.send( e.message ) } )
	} })

commands.register( {
	category: 'audio',
	aliases: [ 'immediateplay', 'ip', 'fp', 'forceplay' ],
	help: 'immediately play a url (skip current song)',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'url',
	callback: ( client, msg, args ) =>
	{
		args = args.replace( /</g, '' ).replace( />/g, '' ) // remove filtering
		if ( !is_accepted_url( args ) )
			return msg.channel.send( _.fmt( '`%s` is not an accepted url', args ) )
		
		join_channel( msg ).then( sess =>
			{
				if ( sess.playing )
					sess.queue = []

				queryRemote( msg, args ).then( info =>
					{
						msg.channel.send( queueSong( msg, sess, info ) )
					}).catch( err => msg.channel.send( '```' + err + '```' ) )
			})
			.catch( e => { if ( e.message ) throw e; msg.channel.send( e.message ) } )
	} })

commands.register( {
	category: 'audio',
	aliases: [ 'stop', 's', 'leave' ],
	help: 'stop the currently playing audio',
	flags: [ 'admin_only', 'no_pm' ],
	callback: ( client, msg, args ) =>
	{
		const sess = findSession( msg )
		if ( sess )
			leave_channel( sess )
	} })

commands.register( {
	category: 'audio playlists',
	aliases: [ 'youtubeplaylist', 'ytpl' ],
	help: 'save a youtube playlist for later',
	flags: [ 'no_pm' ],
	args: 'name url',
	callback: ( client, msg, args ) =>
	{
		const split = args.split( ' ' )

		const plname = split[0]
		const plurl = split[1]

		if ( !is_accepted_url( plurl ) )
			return msg.channel.send( _.fmt( '`%s` is not an accepted url', plurl ) )

		const filePath = path.join( __dirname, playlistDir, msg.guild.id + '_' + plname + '.json' )
		if ( fs.existsSync( filePath ) )
			return msg.channel.send( _.fmt( '`%s` already exists', plname ) )
		
		function playlistQuery( tempMsg )
		{
			ydl.exec( plurl, [ '--flat-playlist', '-J' ], {},
			( err, output ) =>
				{
                    tempMsg.delete()

                    if ( err )
					{
						console.log( _.filterlinks( err ) )
						return msg.channel.send( _.fmt( 'could not query info `(%s)`', _.filterlinks( err ) ) )
					}

                    const data = []
                    const playlist = JSON.parse( output ).entries

                    if ( !playlist )
						return msg.channel.send( 'invalid remote playlist' )

					for ( const song of playlist )
					{
                        const url = `https://www.youtube.com/watch?v=${song.url}`
                        if ( !song.title )
							return msg.channel.send( _.fmt( 'malformed playlist, could not find song title for `%s`', song.url ) )
                        data.push( { url, title: song.title, length: '??:??' } )
                    }
					
					queryMultiple( data, msg, plname ).then( res =>
						{
							fs.writeFileSync( filePath, JSON.stringify( res.queue, null, 4 ), 'utf8' )
							msg.channel.send( _.fmt( 'saved `%s` songs under `%s`%s', res.queue.length, plname, res.errors ) )
						}).catch( errs =>
						{
							return msg.channel.send( errs.toString() )
						})
                })
		}
		
		msg.channel.send( 'fetching playlist info, please wait...' ).then( tempMsg => playlistQuery( tempMsg ) )
	} })

commands.register( {
	category: 'audio',
	aliases: [ 'voteskip' ],
	help: 'vote to skip the current song',
	flags: [ 'no_pm' ],
	callback: ( client, msg, args ) =>
	{
		const sess = findSession( msg )
		if ( sess )
		{
			if ( !sess.playing )
				return msg.channel.send( 'not playing anything to skip' )
			
			const channel = msg.member.voiceChannel
			const samechan = sess.conn.channel.id === channel.id
			if ( !samechan )
				return msg.channel.send( "can't vote to skip from another channel" )
			
			if ( !sess.skipVotes )
				sess.skipVotes = []
			
			if ( sess.skipVotes.indexOf( msg.author.id ) !== -1 )
				return
			
			const current_users = []
			for ( const i in channel.members )
				if ( !channel.members[i].bot )
					current_users.push( channel.members[i].id )
			
			const clean_votes = []
			for ( const i in sess.skipVotes )
				if ( current_users.indexOf( sess.skipVotes[i] ) !== -1 )
					clean_votes.push( sess.skipVotes[i] )
			sess.skipVotes = clean_votes
			
			const votesNeeded = Math.round( current_users.length * settings.get( 'audio', 'skip_percent', 0.6 ) )
			sess.skipVotes.push( msg.author.id )

			const numVotes = sess.skipVotes.length
			
			if ( numVotes >= votesNeeded )
			{
				sess.skipVotes = []
				return skip_playback( sess )
			}
			else if ( numVotes % 3 === 1 )
				msg.channel.send( _.fmt( '`%s` voted to skip, votes: `%s/%s`', _.nick( msg.member, msg.guild ), numVotes, votesNeeded ) )
		}
		else
			msg.channel.send( 'nothing is currently playing' )
	} })

commands.register( {
	category: 'audio',
	aliases: [ 'skip', 'forceskip' ],
	help: 'force-skip the current song',
	flags: [ 'admin_only', 'no_pm' ],
	callback: ( client, msg, args ) =>
	{		
		const sess = findSession( msg )
		if ( sess )
			skip_playback( sess )
	} })

commands.register( {
	category: 'audio',
	aliases: [ 'volume', 'v' ],
	help: 'view or change current volume',
	flags: [ 'admin_only', 'no_pm' ],
	args: '[number=0-1]',
	callback: ( client, msg, args ) =>
	{		
		const sess = findSession( msg )

		if ( !args )
		{
			if ( !sess )
			{
				const def = settings.get( 'audio', 'volume_default', 0.5 )
				return msg.channel.send( _.fmt( 'no current audio session, default volume is `%s`', def ) )
			}

			const vol = sess.volume
			return msg.channel.send( _.fmt( 'current volume is `%s`', vol ) )
		}
		
		if ( isNaN( args ) )
			return msg.channel.send( _.fmt( '`%s` is not a number', args ) )
		
		const vol = Math.max( 0, Math.min( args, settings.get( 'audio', 'volume_max', 1 ) ) )
		msg.channel.send( _.fmt( '`%s` changed volume to `%s`', _.nick( msg.member, msg.guild ), vol ) )
		
		if ( sess )
		{
			if ( !sess.playing ) return
			
			sess.volume = vol
			start_player( sess, sess.time )
		}
	} })

commands.register( {
	category: 'audio',
	aliases: [ 'title', 'song', 'nowplaying', 'np' ],
	flags: [ 'no_pm' ],
	help: "info about what's currently playing",
	callback: ( client, msg, args ) =>
	{
		const sess = findSession( msg )
		if ( sess )
		{
			if ( !sess.playing ) return msg.channel.send( 'nothing is currently playing' )
			
			const song = sess.queue[0]
			if ( !song )
				return msg.channel.send( 'nothing is currently playing' )
			
			let by_user = get_queuedby_user( song )
			if ( sess.queue.length > 1 )
				by_user += `, +${sess.queue.length - 1} in queue`
			msg.channel.send( _.fmt( '`NOW PLAYING in %s:\n%s [%s] (%s)`\n<%s>', sess.conn.channel.name, song.title, song.length, by_user, song.url ) )
		}
		else
			msg.channel.send( 'nothing is currently playing' )
	} })

commands.register( {
	category: 'audio',
	aliases: [ 'queue', 'q' ],
	flags: [ 'no_pm' ],
	help: 'view the current audio queue',
	callback: ( client, msg, args ) =>
	{
		const sess = findSession( msg )
		if ( sess )
		{
			if ( !sess.playing ) return msg.channel.send( '```\nempty\n```' )
			
			const queue = sess.queue
			if ( queue.length === 0 )
				return msg.channel.send( '```\nempty\n```' )
			
			let total_len = 0
			const fields = []
			for ( const i in queue )
			{
				const song = queue[i]
				total_len += parseInt( song.length_seconds )
				const by_user = get_queuedby_user( song )
				fields.push( { name: _.fmt( '%s. %s [%s] (%s)', parseInt(i) + 1, song.title, song.length, by_user ), value: song.url } )
			}
			
			total_len = moment.duration( total_len * 1000 ).format( 'hh:mm:ss' )

			const embed = new Discord.MessageEmbed({
				title: `${queue.length} songs [${total_len}]`,
				description: '-',
				fields: fields,
			})
			msg.channel.send( '', embed )
		}
		else
			msg.channel.send( '```\nempty\n```' )
	} })

commands.register( {
	category: 'audio',
	aliases: [ 'pause' ],
	flags: [ 'admin_only', 'no_pm' ],
	help: 'pauses the current song',
	callback: ( client, msg, args ) =>
	{
		const sess = findSession( msg )
		if ( sess )
		{
			if ( !sess.playing ) return
			if ( sess.paused ) return
			
			sess.paused = true
			stop_playback( sess )
		}
	} })

commands.register( {
	category: 'audio',
	aliases: [ 'resume' ],
	flags: [ 'admin_only', 'no_pm' ],
	help: 'resumes the current song if paused',
	callback: ( client, msg, args ) =>
	{
		const sess = findSession( msg )
		if ( sess )
		{
			if ( !sess.playing ) return
			if ( !sess.paused ) return
			
			sess.paused = false
			start_player( sess, sess.time )
		}
	} })

commands.register( {
	category: 'audio',
	aliases: [ 'time', 'seek' ],
	help: 'seek to a specific time',
	flags: [ 'admin_only', 'no_pm' ],
	args: '[time]',
	callback: ( client, msg, args ) =>
	{
		const sess = findSession( msg )
		if ( sess )
		{
			if ( !sess.playing ) return
			
			if ( args )
				start_player( sess, _.parsetime( args ) )
			else
			{
				let currentSeek = moment.duration( Math.round(sess.time) * 1000 ).format( 'hh:mm:ss' )
				if ( !currentSeek.match( ':' ) )
					currentSeek = '00:' + currentSeek
	
				msg.channel.send( _.fmt( 'current seek time: `%s / %s`', currentSeek, sess.queue[0].length ) )
			}
		}
	} })

commands.register( {
	category: 'audio',
	aliases: [ 'loop' ],
	help: 'toggle looping of the current song',
	flags: [ 'admin_only', 'no_pm' ],
	callback: ( client, msg, args ) =>
	{
		const sess = findSession( msg )
		if ( sess )
		{			
			sess.loop = !sess.loop
			if ( sess.loop )
			{
				msg.channel.send( _.fmt( 'turned on looping, use `%sloop` again to toggle off', settings.get( 'config', 'command_prefix', '!' ) ) )
				if ( sess.lastSong && !sess.playing )
				{
					sess.queue.push( sess.lastSong )
					start_player( sess )
				}
			}
			else
				msg.channel.send( 'turned off looping, queue will proceed as normal' )
		}
	} })


function sanitize_filename( str )
{
	return str.replace( /[^a-zA-Z0-9-_]/g, '_' ).trim()
}

commands.register( {
	category: 'audio playlists',
	aliases: [ 'addtoplaylist', 'pladd' ],
	help: 'add a song to a playlist',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'name url',
	callback: ( client, msg, args ) =>
	{
		const split = args.split( ' ' )
		let name = split[0]
		let link = split[1]
		
		name = sanitize_filename( name )
		if ( !name )
			return msg.channel.send( 'please enter a valid playlist name' )
		
		link = link.replace( /</g, '' ).replace( />/g, '' ) // remove filtering
		if ( !is_accepted_url( link ) )
			return msg.channel.send( _.fmt( '`%s` is not an accepted url', link ) )
		
		const filePath = path.join( __dirname, playlistDir, msg.guild.id + '_' + name + '.json' )
		
		let data = []
		if ( fs.existsSync( filePath ) )
		{
			const playlist = fs.readFileSync( filePath, 'utf8' )
			if ( !_.isjson( playlist ) )
				return msg.channel.send( 'error in `%s`, please delete', name )
			data = JSON.parse( playlist )
		}
		
		queryRemote( msg, link ).then( info =>
			{
				delete info.streamurl

				data.push( info )
				fs.writeFileSync( filePath, JSON.stringify( data, null, 4 ), 'utf8' )
				msg.channel.send( _.fmt( '`%s` added `%s [%s]` to `%s`', _.nick( msg.member, msg.guild ), info.title, info.length, name ) )
			})
			.catch( s => msg.channel.send( '```' + s + '```' ) )
	} })

function queryMultiple( data, msg, name )
{
	const promise = new Promise( ( resolve, reject ) =>
	{
		const max = settings.get( 'audio', 'max_playlist', 50 )
		if ( data.length > max )
			return reject( _.fmt( 'playlist exceeds max playlist length: `%s` > `%s`', data.length, max ) )
		
		const numSongs = data.length
		let numLoaded = 0
		let numErrors = 0
		let errors = ''
		let tempMsg = null
		const queueBuffer = []

		function checkLoaded( i )
		{
			numLoaded++
			if ( numLoaded >= numSongs )
			{
				if ( numErrors > 0 )
					errors = _.fmt( '\n```error loading %s song(s) in %s:\n%s```', numErrors, name, errors )

				if ( tempMsg )
					tempMsg.delete()

				if ( numErrors >= numLoaded )
					return reject( errors )

				return resolve( { queue: queueBuffer, errors: errors } )
			}
			else
				queryPlaylist( i + 1 )
		}

		function queryPlaylist( i )
		{
			const song = data[i]
			if ( !is_accepted_url( song.url ) )
			{
				errors += _.fmt( '<%s>: not an accepted url\n', song.url )
				numErrors++
				checkLoaded( i )
				return
			}
			
			queryRemote( msg, song.url ).then( info =>
				{
					queueBuffer.push( info )
					checkLoaded( i )
				})
			.catch( s =>
				{
					errors += _.fmt( '<%s>: %s\n', song.url, s )
					numErrors++
					checkLoaded( i )
				})
		}
		
		if ( numSongs > 1 )
		{
			msg.channel.send( _.fmt( 'fetching info for `%s` song(s), please wait...', numSongs ) ).then( m =>
			{
				tempMsg = m
				queryPlaylist( 0 )
			})
		}
		else
			queryPlaylist( 0 )
	})

	return promise
}

function queueMultiple( data, msg, name )
{
	join_channel( msg ).then( res =>
	{		
		const sess = res

		function do_rest( firstSong, errors )
		{
			data.shift()
			if ( data.length === 0 )
				return
			
			queryMultiple( data, msg, name ).then( res =>
				{
					const queueBuffer = res.queue
					errors += res.errors

					if ( firstSong )
						queueBuffer.unshift( firstSong )
	
					const queue_empty = sess.queue.length === 0					
					if ( queue_empty )
						sess.hideNP = true
	
					const verb = queue_empty ? 'started playing' : 'queued'
					const confirmation = _.fmt( '`%s` %s `%s`%s', _.nick( msg.member, msg.guild ), verb, name, errors )
					
					let total_len = 0
					const fields = []
					for ( const i in queueBuffer )
					{
						const song = queueBuffer[i]
						song.channel = msg.channel
						song.queuedby = msg.member

						total_len += parseInt( song.length_seconds )
						fields.push( { name: _.fmt( '%s. %s [%s]', parseInt(i) + 1, song.title, song.length ), value: song.url } )
					}
	
					total_len = moment.duration( total_len * 1000 ).format( 'hh:mm:ss' )

					
					const embed = new Discord.MessageEmbed({
						title: `${queueBuffer.length} songs [${total_len}]`,
						description: '-',
						fields: fields,
					})
					msg.channel.send( confirmation, embed )
					
					queueBuffer.shift()
					sess.queue.push(...queueBuffer)
					if ( queue_empty )
						start_player( sess )
				})
				.catch( errs =>
				{
					return msg.channel.send( errs )
				})
		}
		queryRemote( msg, data[0].url ).then( info =>
			{
				msg.channel.send( queueSong( msg, sess, info ) )
				do_rest( info, '' )
			}).catch( s => do_rest( false, s+'\n' ) )
	})
	.catch( e => { if ( e.message ) throw e; msg.channel.send( e.message ) } )
}

commands.register( {
	category: 'audio playlists',
	aliases: [ 'loadplaylist', 'lp' ],
	help: 'load a playlist into the queue',
	flags: [ 'no_pm' ],
	args: 'name',
	callback: ( client, msg, args ) =>
	{
		const name = sanitize_filename( args )
		if ( !name )
			return msg.channel.send( 'please enter a valid playlist name' )
		
		const filePath = path.join( __dirname, playlistDir, msg.guild.id + '_' + name + '.json' )
		if ( !fs.existsSync( filePath ) )
			return msg.channel.send( _.fmt( '`%s` does not exist', name ) )
		
		const playlist = fs.readFileSync( filePath, 'utf8' )
		if ( !_.isjson( playlist ) )
			return msg.channel.send( 'error in `%s`, please delete', name )
		const data = JSON.parse( playlist )
		
		queueMultiple( data, msg, name )
	} })

commands.register( {
	category: 'audio playlists',
	aliases: [ 'playlists', 'playlist', 'list' ],
	help: 'list playlists, or songs in a playlist',
	flags: [ 'no_pm' ],
	args: '[name]',
	callback: ( client, msg, args ) =>
	{
		const normalizedPath = path.join( __dirname, playlistDir )
		if ( !args )
		{
			let list = ''
			fs.readdirSync( normalizedPath ).forEach( ( file ) => {
					if ( !file.endsWith( '.json' ) ) return
					if ( !file.startsWith( msg.guild.id + '_' ) ) return
					list += file.replace( '.json', '' ).replace( msg.guild.id + '_', '' ) + ', '
				})
			msg.channel.send( '```--- playlists ---\n' + list.substring( 0, list.length - 2 ) + '```' )
		}
		else
		{
			const name = sanitize_filename( args )
			if ( !name )
				return msg.channel.send( 'please enter a valid playlist name' )
			
			const filename = msg.guild.id + '_' + name + '.json'
			const filePath = path.join( __dirname, playlistDir, filename )
			
			if ( !fs.existsSync( filePath ) )
				return msg.channel.send( _.fmt( '`%s` does not exist', name ) )
			
			const playlist = fs.readFileSync( filePath, 'utf8' )
			if ( !_.isjson( playlist ) )
				return msg.channel.send( 'error in `%s`, please delete', name )
			
			let total_len = 0
			const fields = []
			const data = JSON.parse( playlist )
			for ( const i in data )
			{
				const song = data[i]
				total_len += parseInt( song.length_seconds )
				fields.push( { name: _.fmt( '%s. %s [%s]', parseInt(i) + 1, song.title, song.length ), value: song.url } )
			}
			
			total_len = moment.duration( total_len * 1000 ).format( 'hh:mm:ss' )

			const embed = new Discord.MessageEmbed({
				title: `${data.length} songs [${total_len}]`,
				description: '-',
				fields: fields,
			})
			msg.channel.send( '', embed )
		}
	} })

commands.register( {
	category: 'audio playlists',
	aliases: [ 'copyplaylist' ],
	help: 'copy a playlist to a different name',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'old new',
	callback: ( client, msg, args ) =>
	{
		const split = args.split( ' ' )
		let oldName = split[0]
		let newName = split[1]
		
		oldName = sanitize_filename( oldName )
		newName = sanitize_filename( newName )
		if ( !oldName || !newName )
			return msg.channel.send( 'please enter valid playlist names' )
		
		const oldPath = path.join( __dirname, playlistDir, msg.guild.id + '_' + oldName + '.json' )
		const newPath = path.join( __dirname, playlistDir, msg.guild.id + '_' + newName + '.json' )
		
		if ( !fs.existsSync( oldPath ) )
			return msg.channel.send( _.fmt( '`%s` does not exist', oldName ) )
		
		if ( fs.existsSync( newPath ) )
			return msg.channel.send( _.fmt( '`%s` already exists', newName ) )
		
		fs.createReadStream( oldPath ).pipe( fs.createWriteStream( newPath ) )
		msg.channel.send( _.fmt( '`%s` has been copied to `%s`', oldName, newName ) )
	} })

commands.register( {
	category: 'audio playlists',
	aliases: [ 'deleteplaylist' ],
	help: 'delete a playlist',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'name',
	callback: ( client, msg, args ) =>
	{
		const name = sanitize_filename( args )
		if ( !name )
			return msg.channel.send( 'please enter a valid playlist name' )
		
		const filePath = path.join( __dirname, playlistDir, msg.guild.id + '_' + name + '.json' )
		if ( !fs.existsSync( filePath ) )
			return msg.channel.send( _.fmt( '`%s` does not exist', name ) )
		
		fs.unlinkSync( filePath )
		msg.channel.send( _.fmt( '`%s` deleted', name ) )
	} })

commands.register( {
	category: 'audio',
	aliases: [ 'audiostats' ],
	help: 'display audio stats for this guild',
	flags: [ 'admin_only', 'no_pm' ],
	callback: ( client, msg, args ) =>
	{
		const gid = msg.guild.id
		if ( !gid in songTracking )
			return msg.channel.send( 'no audio data found for this server' )

		let sorted = Object.keys( songTracking[ gid ] ) 
		sorted.sort( function(a, b) { return songTracking[ gid ][b].plays - songTracking[ gid ][a].plays } )

		const fields = []
		for ( const url of sorted )
		{
			if ( fields.length > 10 ) break
			const song = songTracking[ gid ][ url ]
			const plays = song.plays
			const title = song.title
			fields.push( { name: `${ fields.length+1 }. [${ plays } plays] ${ title }`, value: url } )
		}

		const embed = new Discord.MessageEmbed({
			title: `top 10 songs`,
			description: '-',
			fields: fields,
		})
		msg.channel.send( '', embed )
	} })

var client = null
module.exports.setup = _cl => {
    client = _cl
	_.log( 'loaded plugin: audio' )
	
	initAudio()
	checkSessionActivity()
	songTracking = settings.get( 'songtracking', null, {} )
}

module.exports.songsSinceBoot = 0
