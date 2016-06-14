'use strict';

var commands = require( '../commands.js' );
var permissions = require( '../permissions.js' );
var settings = require( '../settings.js' );
var _ = require( '../helper.js' );

var fs = require( 'fs' );
var path = require( 'path' );

var ydl = require( 'youtube-dl' );
var ytdl_core = require( 'ytdl-core' );
var moment = require( 'moment' );
require( 'moment-duration-format' );

var default_youtube_urls =
	[
		"(https?\\:\\/\\/)?(www\\.)?(youtube\\.com|youtu\\.be)\\/.*"
	];
	
var default_additional_urls =
	[
		"(https?\\:\\/\\/)?(www\\.)?soundcloud.com\\/.*",
		"(https?\\:\\/\\/)?(.*\\.)?bandcamp.com\\/.*",
		"(https?\\:\\/\\/)?(www\\.)?vimeo.com\\/.*",
		"(https?\\:\\/\\/)?(www\\.)?vine.co\\/v\\/.*"
	];
	
var default_accepted_files =
	[
		".*\\.mp3",
		".*\\.ogg",
		".*\\.wav",
		".*\\.flac",
		".*\\.m4a",
		".*\\.aac",
		".*\\.webm",
		".*\\.mp4"
	];

var sessions = {};
var guildSettings = {};

function restoreGuildSettings( id )
{
	if ( !(id in guildSettings) )
		return;
	
	sessions[id].volume = guildSettings[id]['volume'];
}

function setGuildSetting( id, param, val )
{
	if ( !(id in guildSettings) )
		guildSettings[id] = {};
	
	guildSettings[id][param] = val;
	settings.set( 'audio', 'guild_settings', guildSettings );
}

function getGuildSetting( id, param )
{
	if ( !(id in guildSettings) )
		guildSettings[id] = {};
	
	return guildSettings[id][param];
}

function join_channel( msg )
{
	var promise = new Promise( function( resolve, reject )
		{
			var channel = msg.member.getVoiceChannel();
				
			if ( !channel )
				return reject( 'you are not in a voice channel' );
			
			if ( !client.User.can( permissions.discord.Voice.CONNECT, channel ) || 
				 !client.User.can( permissions.discord.Voice.SPEAK, channel ) ||
				 !client.User.can( permissions.discord.Voice.USE_VAD, channel ) )
					return reject( _.fmt( "invalid permissions for `%s`", channel.name ) );
				
			if ( channel.guild.id in sessions )
			{
				var sess = sessions[ channel.guild.id ];
				
				var disposed = sess.conn.disposed;
				var samechan = sess.channel == channel.id;
				
				if ( !disposed && !samechan )
					return reject( 'already busy in another channel' );
				else if ( !disposed && samechan )
					return resolve( { isnew: false, conn: sess.conn } );
			}
			
			msg.member.getVoiceChannel().join().then( conn => resolve( { isnew: true, conn: conn } ) )
				.catch( e => reject( e.message ) );
		});
	
	return promise;
}

function leave_channel( id )
{
	var sess = sessions[ id ];
	if ( sess.playing )
	{
		sess.encoder.stop();
		sess.encoder.destroy();
	}
	sess.conn.channel.leave();
	delete sessions[id];
}

function parse_seek( str )
{
	var time = 0;
	if ( str.match( /(\d+)h/g ) )
		time += parseInt( _.matches( /(\d+)h/g, str )[0] ) * 60 * 60;
	if ( str.match( /(\d+)m/g ) )
		time += parseInt( _.matches( /(\d+)m/g, str )[0] ) * 60;
	if ( str.match( /(\d+)s/g ) )
		time += parseInt( _.matches( /(\d+)s/g, str )[0] );
	
	if ( time == 0 && str.length != 0 )
		time = parseInt( str );
	
	return time;
}

function rotate_queue( id )
{
	var sess = sessions[ id ];
	if ( typeof sess.loop === 'undefined' || !sess.loop )
		sess.queue.shift();
	start_player( id );
}

function get_queuedby_user( song )
{
	var by_user = client.Users.get( song.queuedby );
	if ( !by_user ) by_user = '<unknown>';
		else by_user = by_user.username;
	return by_user;
}

function start_player( id, forceseek )
{
	var sess = sessions[ id ];
	if ( sess.playing )
	{
		sess.encoder.stop();
		sess.encoder.destroy();
		sess.playing = false;
	}
	
	sess.lastActivity = _.time();
	
	var song = sess.queue[0];
	if ( !song )
	{
		var timeout = settings.get( 'audio', 'idle_timeout', 60 );
		setTimeout( () =>
			{
				var sess = sessions[ id ];
				if ( !sess ) return;
				if ( !sess.playing &&  _.time() >= sess.lastActivity + timeout )
					leave_channel( id );
			}, timeout * 1000 );
		return;
	}
	
	if ( song.channel && typeof forceseek === 'undefined' && !sess.loop )
	{
		var by_user = get_queuedby_user( song );
		song.channel.sendMessage( _.fmt( '`NOW PLAYING: %s [%s] (%s)`', song.title, song.length, by_user ) );
	}
	
	var guildname = sess.conn.guild.name;
	_.log( _.fmt( 'playing <%s> in (%s)', song.url, guildname ) );
	module.exports.songsSinceBoot++;
	
	sess.skipVotes = [];
	sess.paused = false;
	
	sess.starttime = 0;
	var seek = forceseek || song.seek;	
	var inputArgs = [];
	if ( seek )
	{
		sess.starttime = seek;
		inputArgs = [ '-ss', seek ];
	}
	
	var volume = sess.volume || settings.get( 'audio', 'volume_default', 0.5 );
	
	if ( sess.encoder )
		delete sess.encoder;
	
	var encoder = sess.conn.createExternalEncoder(
		{
			type: 'ffmpeg',
			source: song.streamurl,
			format: 'opus',
			inputArgs: inputArgs,
			outputArgs: [ '-af', 'volume='+volume ]
		});
		
	if ( !encoder )
		return _.log( 'WARNING: voice connection is disposed' );
	
	sess.playing = true;
	sess.encoder = encoder;
	encoder.once( 'end', () => rotate_queue( id ) );

	var encoderStream = encoder.play();
	encoderStream.resetTimestamp();
	encoderStream.removeAllListeners( 'timestamp' );
	encoderStream.on( 'timestamp', time => sess.time = sess.starttime + time );
}

function queryRemote( args )
{
	var msg = args.msg;
	var url = args.url;
	var returnInfo = args.returnInfo;
	var forPlaylist = args.forPlaylist;
	var quiet = args.quiet;
	
	var promise = new Promise( function( resolve, reject )
		{
			var doQuery = function( tempMsg )
				{
					function parseInfo( err, info )
					{
						if ( err )
						{
							console.log( _.filterlinks( err ) );
							if ( !quiet )
								tempMsg.delete().then( () => setTimeout( () => process.exit( 1 ), 1000 ) ); // wait a second before exiting
							return reject( 'error querying info' );
						}
						
						var title = info.title;
						
						var length = '??:??';
						if ( info.duration && info.duration != 'NaN' )
						{					
							var split = info.duration.split( ':' );
							if ( split.length == 1 )
								split.unshift( '00' );
							if ( split.length == 2 )
								split.unshift( '00' );
							
							length = _.fmt( '%s:%s:%s', _.pad( split[0], 2 ), _.pad( split[1], 2 ), _.pad( split[2], 2 ) )
							var length_seconds = moment.duration( length ).format( 'ss' );
							
							if ( length.substring( 0, 3 ) == '00:' )
								length = length.substring( 3 );
							
							var max_length = settings.get( 'audio', 'max_length', 62 ) * 60;
							if ( length_seconds > max_length )
							{
								var maxlen = moment.duration( max_length*1000 ).format( 'h:mm:ss' );
								if ( tempMsg ) tempMsg.delete();
								return reject( _.fmt( 'song exceeds max length: `%s` > `%s`', length, maxlen ) );
							}
						}
						
						var streamurl = info.url;
						if ( info.formats )
						{
							streamurl = info.formats[0].url;
							if ( info.formats[0].abr )
								streamurl = info.formats.sort( (a, b) => b.abr - a.abr )[0].url;
							if ( info.formats[0].audioBitrate )
								streamurl = info.formats.sort( (a, b) => b.audioBitrate - a.audioBitrate )[0].url;
						}
						
						var seek = false;
						if ( url.indexOf( 't=' ) != -1 )
							seek = parse_seek( _.matches( /t=(.*)/g, url )[0] );
						
						if ( tempMsg ) tempMsg.delete();
						var songInfo = { url: url, title: title, length: length, queuedby: msg.author.id, seek: seek, length_seconds: length_seconds };
						if ( !forPlaylist )
							songInfo.streamurl = streamurl;
						if ( returnInfo )
							return resolve( songInfo );
						
						// never return this
						songInfo.channel = msg.channel;
						
						var id = msg.guild.id;
						var queue_empty = sessions[ id ].queue.length == 0;
						sessions[ id ].queue.push( songInfo );
						
						if ( queue_empty )
						{
							resolve( _.fmt( '`%s` started playing `%s [%s]`', msg.author.username, title, length ) );
							start_player( id, 0 );
						}
						else
							resolve( _.fmt( '`%s` queued `%s [%s]`', msg.author.username, title, length ) );
					}
					
					function parseInfoFast( err, info )
					{
						if ( info )
							info.duration = moment.duration( parseInt( info.length_seconds ) * 1000 ).format( 'hh:mm:ss' );
						parseInfo( err, info );
					}
					
					var accepted_files = settings.get( 'audio', 'accepted_files', default_accepted_files );
					for ( var i in accepted_files )
						if ( url.match( accepted_files[i] ) )
						{
							var fn = url.split('/');
							fn = fn[ fn.length - 1 ];
							return parseInfo( false, { title: fn, url: url } );
						}
						
					var youtube_urls = settings.get( 'audio', 'youtube_urls', default_youtube_urls );
					for ( var i in youtube_urls )
						if ( url.match( youtube_urls[i] ) )
							return ytdl_core.getInfo( url, parseInfoFast );
						
					var additional_urls = settings.get( 'audio', 'additional_urls', default_additional_urls );
					for ( var i in additional_urls )
						if ( url.match( additional_urls[i] ) )
							return ydl.getInfo( url, [], parseInfo );
						
					console.log( _.fmt( 'WARNING: could not find suitable query mode for <%s>', url ) );
					return reject( 'could not find suitable query mode' );
				};
				
			if ( quiet )
				doQuery();
			else
				msg.channel.sendMessage( 'fetching info, please wait...' ).then( tempMsg => doQuery( tempMsg ) );
		});
		
	return promise;
}

function is_accepted_url( link )
{
	var youtube_urls = settings.get( 'audio', 'youtube_urls', default_youtube_urls );
	var additional_urls = settings.get( 'audio', 'additional_urls', default_additional_urls );
	var accepted_files = settings.get( 'audio', 'accepted_files', default_accepted_files );
	
	var acceptedURLs = [];
	acceptedURLs.push.apply( acceptedURLs, youtube_urls );
	acceptedURLs.push.apply( acceptedURLs, additional_urls );
	acceptedURLs.push.apply( acceptedURLs, accepted_files );
	
	var found = false;
	for ( var i in acceptedURLs )
		if ( link.match( acceptedURLs[i] ) )
			found = true;
			
	return found;
}

function create_session( conn, msg )
{	
	var channel = msg.member.getVoiceChannel().id;
	var guild = msg.guild.id;
	
	sessions[ guild ] = { conn: conn.voiceConnection, channel: channel };
	sessions[ guild ].queue = [];
	
	restoreGuildSettings( guild );
}

commands.register( {
	category: 'audio',
	aliases: [ 'play', 'p' ],
	help: 'play audio from a url',
	flags: [ 'no_pm' ],
	args: 'url',
	callback: ( client, msg, args ) =>
	{
		args = args.replace( /</g, '' ).replace( />/g, '' ); // remove filtering
		if ( !is_accepted_url( args ) )
			return msg.channel.sendMessage( _.fmt( '`%s` is not an accepted url', args ) );
		
		join_channel( msg ).then( res =>
			{
				if ( res.isnew )
					create_session( res.conn, msg );
				
				queryRemote( { msg: msg, url: args } ).then( s => msg.channel.sendMessage( s ) ).catch( s => msg.channel.sendMessage( s ) );
			})
			.catch( e => { if ( e.message ) throw e; msg.channel.sendMessage( e ); } );
	}});

commands.register( {
	category: 'audio',
	aliases: [ 'stop', 's', 'leave' ],
	help: 'stop the currently playing audio',
	flags: [ 'admin_only', 'no_pm' ],
	callback: ( client, msg, args ) =>
	{
		var id = msg.guild.id;
		if ( id in sessions )		
			leave_channel( id );
	}});

commands.register( {
	category: 'audio',
	aliases: [ 'skip' ],
	help: 'vote to skip the current song (force if admin)',
	flags: [ 'no_pm' ],
	args: '[force]',
	callback: ( client, msg, args ) =>
	{
		var id = msg.guild.id;
		if ( id in sessions )
		{
			var sess = sessions[id];
			if ( !sess.playing )
				return msg.channel.sendMessage( 'not playing anything to skip' );
			
			var channel = msg.member.getVoiceChannel();
			var samechan = sess.channel == channel.id;
			if ( !samechan )
				return msg.channel.sendMessage( "can't vote to skip from another channel" );
			
			if ( args && permissions.hasAdmin( msg.author ) )
			{
				msg.channel.sendMessage( _.fmt( '`%s` force-skipped the song', msg.author.username ) );
				rotate_queue( id );
				return;
			}
			
			if ( !sess.skipVotes )
				sess.skipVotes = [];
			
			if ( sess.skipVotes.indexOf( msg.author.id ) != -1 )
				return msg.channel.sendMessage( _.fmt( '`%s` has already voted to skip this song', msg.author.username ) );
			
			var current_users = [];
			for ( var i in channel.members )
				if ( !channel.members[i].bot )
					current_users.push( channel.members[i].id );
			
			var clean_votes = [];
			for ( var i in sess.skipVotes )
				if ( current_users.indexOf( sess.skipVotes[i] ) != -1 )
					clean_votes.push( sess.skipVotes[i] );
			sess.skipVotes = clean_votes;
			
			var votesNeeded = Math.round( current_users.length * settings.get( 'audio', 'skip_percent', 0.6 ) )
			sess.skipVotes.push( msg.author.id );
			
			if ( sess.skipVotes.length >= votesNeeded )
			{
				sess.skipVotes = [];
				msg.channel.sendMessage( 'vote skip passed' );
				return rotate_queue( id );
			}
			else
				msg.channel.sendMessage( _.fmt( '`%s` voted to skip, votes: `%s/%s`', msg.author.username, sess.skipVotes.length, votesNeeded ) );
		}
		else
			msg.channel.sendMessage( 'nothing is currently playing' );
	}});

commands.register( {
	category: 'audio',
	aliases: [ 'volume', 'v' ],
	help: 'view or change current volume',
	flags: [ 'admin_only', 'no_pm' ],
	args: '[number=0-1]',
	callback: ( client, msg, args ) =>
	{		
		var id = msg.guild.id;
		
		if ( !args )
		{
			var vol = getGuildSetting( id, 'volume' ) || settings.get( 'audio', 'volume_default', 0.5 );
			return msg.channel.sendMessage( _.fmt( 'current volume is `%s`', vol ) );
		}
		
		if ( isNaN( args ) )
			return msg.channel.sendMessage( _.fmt( '`%s` is not a number', args ) );
		
		var vol = Math.max( 0, Math.min( args, settings.get( 'audio', 'volume_max', 1 ) ) );
		msg.channel.sendMessage( _.fmt( '`%s` changed volume to `%s`', msg.author.username, vol ) );
		
		setGuildSetting( id, 'volume', vol );
		
		if ( id in sessions )
		{
			var sess = sessions[id];
			if ( !sess.playing ) return;
			
			sess.volume = vol;
			sess.encoder.stop();
			start_player( id, sess.time );
		}
	}});

commands.register( {
	category: 'audio',
	aliases: [ 'title', 'song', 'nowplaying' ],
	flags: [ 'no_pm' ],
	help: "info about what's currently playing",
	callback: ( client, msg, args ) =>
	{
		var id = msg.guild.id;		
		if ( id in sessions )
		{
			var sess = sessions[id];
			if ( !sess.playing ) return msg.channel.sendMessage( 'nothing is currently playing' );
			
			var song = sess.queue[0];
			if ( !song )
				return msg.channel.sendMessage( 'nothing is currently playing' );
			
			var by_user = get_queuedby_user( song );
			msg.channel.sendMessage( _.fmt( '`NOW PLAYING:\n%s [%s] (queued by %s)`\n<%s>', song.title, song.length, by_user, song.url ) );
		}
		else
			msg.channel.sendMessage( 'nothing is currently playing' );
	}});

commands.register( {
	category: 'audio',
	aliases: [ 'queue', 'q' ],
	flags: [ 'no_pm' ],
	help: 'view the current audio queue',
	callback: ( client, msg, args ) =>
	{
		var id = msg.guild.id;		
		if ( id in sessions )
		{
			var sess = sessions[id];
			if ( !sess.playing ) return msg.channel.sendMessage( '```\nempty\n```' );
			
			var queue = sess.queue;
			if ( queue.length == 0 )
				return msg.channel.sendMessage( '```\nempty\n```' );
			
			var res = '';
			for ( var i in queue )
			{
				var song = queue[i];
				
				var by_user = get_queuedby_user( song );
				res += _.fmt( '%s. %s [%s] (%s)\n', parseInt(i)+1, song.title, song.length, by_user );
			}
			
			msg.channel.sendMessage( '```\n' + res + '\n```' );
		}
		else
			msg.channel.sendMessage( '```\nempty\n```' );
	}});

commands.register( {
	category: 'audio',
	aliases: [ 'pause' ],
	flags: [ 'admin_only', 'no_pm' ],
	help: 'pauses the current song',
	callback: ( client, msg, args ) =>
	{
		var id = msg.guild.id;		
		if ( id in sessions )
		{
			var sess = sessions[id];
			if ( !sess.playing ) return;
			if ( sess.paused ) return;
			
			sess.paused = true;
			sess.encoder.stop();
		}
	}});

commands.register( {
	category: 'audio',
	aliases: [ 'resume' ],
	flags: [ 'admin_only', 'no_pm' ],
	help: 'resumes the current song if paused',
	callback: ( client, msg, args ) =>
	{
		var id = msg.guild.id;		
		if ( id in sessions )
		{
			var sess = sessions[id];
			if ( !sess.playing ) return;
			if ( !sess.paused ) return;
			
			sess.paused = false;
			start_player( id, sess.time );
		}
	}});

commands.register( {
	category: 'audio',
	aliases: [ 'time', 'seek' ],
	help: 'seek to a specific time',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'time',
	callback: ( client, msg, args ) =>
	{		
		var id = msg.guild.id;		
		if ( id in sessions )
		{
			var sess = sessions[id];
			if ( !sess.playing ) return;
			
			sess.encoder.stop();
			start_player( id, args );
		}
	}});

commands.register( {
	category: 'audio',
	aliases: [ 'loop' ],
	help: 'toggle looping of the current song',
	flags: [ 'admin_only', 'no_pm' ],
	callback: ( client, msg, args ) =>
	{		
		var id = msg.guild.id;		
		if ( id in sessions )
		{
			var sess = sessions[id];
			
			sess.loop = !sess.loop;
			if ( sess.loop )
				msg.channel.sendMessage( _.fmt( 'turned on looping, use `%sloop` again to toggle off', settings.get( 'config', 'command_prefix', '!' ) ) )
			else
				msg.channel.sendMessage( 'turned off looping, queue will proceed as normal' )
		}
	}});


var playlistDir = '../playlists';
function sanitize_filename( str )
{
	return str.replace( /[^a-zA-Z0-9-_]/g, '_' ).trim();
}
	
commands.register( {
	category: 'audio playlists',
	aliases: [ 'addtoplaylist', 'pladd' ],
	help: 'add a song to a playlist',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'name url',
	callback: ( client, msg, args ) =>
	{
		var split = args.split( ' ' );
		var name = split[0];
		var link = split[1];
		
		var name = sanitize_filename( name );
		if ( !name )
			return msg.channel.sendMessage( 'please enter a valid playlist name' );
		
		link = link.replace( /</g, '' ).replace( />/g, '' ); // remove filtering
		if ( !is_accepted_url( link ) )
			return msg.channel.sendMessage( _.fmt( '`%s` is not an accepted url', link ) );
		
		var filePath = path.join( __dirname, playlistDir, msg.guild.id + '_' + name + '.json' );
		
		var data = [];
		if ( fs.existsSync( filePath ) )
		{
			var playlist = fs.readFileSync( filePath, 'utf8' );
			if ( !_.isjson( playlist ) )
				return msg.channel.sendMessage( 'error in `%s`, please delete', name );
			data = JSON.parse( playlist );
		}
		
		queryRemote( { msg: msg, url: link, returnInfo: true, forPlaylist: true } ).then( info =>
			{
				data.push( info );
				fs.writeFileSync( filePath, JSON.stringify( data, null, 4 ), 'utf8' );
				msg.channel.sendMessage( _.fmt( '`%s` added `%s [%s]` to `%s`', msg.author.username, info.title, info.length, name ) );
			})
			.catch( s => msg.channel.sendMessage( s ) );
	}});

commands.register( {
	category: 'audio playlists',
	aliases: [ 'loadplaylist', 'lp' ],
	help: 'load a playlist into the queue',
	flags: [ 'no_pm' ],
	args: 'name',
	callback: ( client, msg, args ) =>
	{		
		var name = sanitize_filename( args );
		if ( !name )
			return msg.channel.sendMessage( 'please enter a valid playlist name' );
		
		var filePath = path.join( __dirname, playlistDir, msg.guild.id + '_' + name + '.json' );
		if ( !fs.existsSync( filePath ) )
			return msg.channel.sendMessage( _.fmt( '`%s` does not exist', name ) );
		
		var playlist = fs.readFileSync( filePath, 'utf8' );
		if ( !_.isjson( playlist ) )
			return msg.channel.sendMessage( 'error in `%s`, please delete', name );
		var data = JSON.parse( playlist );
		
		join_channel( msg ).then( res =>
			{
				if ( res.isnew )
					create_session( res.conn, msg );
				
				var id = msg.guild.id;
				
				var numSongs = data.length;
				var numLoaded = 0;
				var numErrors = 0;
				var errors = '';
				var tempMsg = null;
				var queueBuffer = [];
				var checkLoaded = function( i )
					{
						numLoaded++;
						if ( numLoaded >= numSongs )
						{
							if ( numErrors > 0 )
								errors = _.fmt( '\n```error loading %s song(s) in %s:\n%s```', numErrors, name, errors );
							
							if ( numErrors < numLoaded )
							{
								var queue_empty = sessions[ id ].queue.length == 0;
								sessions[ id ].queue.push.apply( sessions[ id ].queue, queueBuffer );
							}
							
							tempMsg.delete();
							if ( queue_empty )
							{
								msg.channel.sendMessage( _.fmt( '`%s` loaded `%s [%s song(s)]`%s', msg.author.username, name, data.length, errors ) );
								start_player( id );
							}
							else
								msg.channel.sendMessage( _.fmt( '`%s` queued `%s [%s song(s)]`%s', msg.author.username, name, data.length, errors ) );
						}
						else
							queryPlaylist( i+1 );
					};
				
				var queryPlaylist = function( i )
					{
						var song = data[i];
						if ( !is_accepted_url( song.url ) )
						{
							errors += _.fmt( '<%s>: not an accepted url\n', song.url );
							numErrors++;
							checkLoaded( i );
							return;
						}
						
						queryRemote( { quiet: true, msg: msg, url: song.url, returnInfo: true } ).then( info =>
							{
								info.channel = msg.channel;
								queueBuffer.push( info );
								checkLoaded( i );
							})
						.catch( s =>
							{
								errors += _.fmt( '<%s>: %s\n', song.url, s );
								numErrors++;
								checkLoaded( i );
							});
					};
					
				msg.channel.sendMessage( _.fmt( 'fetching info for `%s` song(s), please wait...', numSongs ) ).then( m =>
					{
						tempMsg = m;
						queryPlaylist( 0 )
					});
			})
			.catch( e => { if ( e.message ) throw e; msg.channel.sendMessage( e ); } );
	}});

commands.register( {
	category: 'audio playlists',
	aliases: [ 'playlists', 'playlist', 'list' ],
	help: 'list playlists, or songs in a playlist',
	flags: [ 'no_pm' ],
	args: '[name]',
	callback: ( client, msg, args ) =>
	{
		var list = '';
		
		var normalizedPath = path.join( __dirname, playlistDir );
		if ( !args )
		{
			fs.readdirSync( normalizedPath ).forEach( function( file )
				{
					if ( !file.endsWith( '.json' ) ) return;
					if ( !file.startsWith( msg.guild.id + '_' ) ) return;
					list += file.replace( '.json', '' ).replace( msg.guild.id + '_', '' ) + '\n';
				});
			list = '--- playlists ---\n' + list;
		}
		else
		{
			var name = sanitize_filename( args );
			if ( !name )
				return msg.channel.sendMessage( 'please enter a valid playlist name' );
			
			var filename = msg.guild.id + '_' + name + '.json';
			var filePath = path.join( __dirname, playlistDir, filename );
			
			var playlist = fs.readFileSync( filePath, 'utf8' );
			if ( !_.isjson( playlist ) )
				return msg.channel.sendMessage( 'error in `%s`, please delete', name );
			
			var data = JSON.parse( playlist );
			for ( var i in data )
			{
				var song = data[i];
				
				var by_user = get_queuedby_user( song );					
				list +=_.fmt( '%s. %s [%s] (%s)\n', parseInt(i)+1, song.title, song.length, by_user );
			}
		}
		
		msg.channel.sendMessage( '```\n' + list + '\n```' );
	}});

commands.register( {
	category: 'audio playlists',
	aliases: [ 'copyplaylist' ],
	help: 'copy a playlist to a different name',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'old new',
	callback: ( client, msg, args ) =>
	{
		var split = args.split( ' ' );
		var oldName = split[0];
		var newName = split[1];
		
		oldName = sanitize_filename( oldName );		
		newName = sanitize_filename( newName );
		if ( !oldName || !newName )
			return msg.channel.sendMessage( 'please enter valid playlist names' );
		
		var oldPath = path.join( __dirname, playlistDir, msg.guild.id + '_' + oldName + '.json' );
		var newPath = path.join( __dirname, playlistDir, msg.guild.id + '_' + newName + '.json' );
		
		if ( !fs.existsSync( oldPath ) )
			return msg.channel.sendMessage( _.fmt( '`%s` does not exist', oldName ) );
		
		if ( fs.existsSync( newPath ) )
			return msg.channel.sendMessage( _.fmt( '`%s` already exists', newName ) );
		
		fs.createReadStream( oldPath ).pipe( fs.createWriteStream( newPath ) );
		msg.channel.sendMessage( _.fmt( '`%s` has been copied to `%s`', oldName, newName ) );
	}});

commands.register( {
	category: 'audio playlists',
	aliases: [ 'deleteplaylist' ],
	help: 'delete a playlist',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'name',
	callback: ( client, msg, args ) =>
	{
		var name = sanitize_filename( args );
		if ( !name )
			return msg.channel.sendMessage( 'please enter a valid playlist name' );
		
		var filePath = path.join( __dirname, playlistDir, msg.guild.id + '_' + name + '.json' );
		if ( !fs.existsSync( filePath ) )
			return msg.channel.sendMessage( _.fmt( '`%s` does not exist', name ) );
		
		fs.unlinkSync( filePath );
		msg.channel.sendMessage( _.fmt( '`%s` deleted', name ) );
	}});

var client = null;
module.exports.setup = function( _cl )
	{
		client = _cl;
		guildSettings = settings.get( 'audio', 'guild_settings', {} );
		_.log( 'loaded plugin: audio' );
	};
	
module.exports.songsSinceBoot = 0;
module.exports.sessions = sessions;
