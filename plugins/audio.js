'use strict';

var commands = require( '../commands.js' );
var permissions = require( '../permissions.js' );
var settings = require( '../settings.js' );
var _ = require( '../helper.js' );

var ydl = require( 'youtube-dl' );
var moment = require( 'moment' );
require( 'moment-duration-format' );

var sessions = {};

function join( msg )
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

function parse_seek( str )
{
	var time = str.match( /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?/g );
	var hours = parseInt( time[0] || 0 ) * 60 * 60;
	var minutes = parseInt( time[1] || 0 ) * 60;
	var seconds = parseInt( time[2] || 0 );
	return hours + minutes + seconds;
}

function rotate_queue( id, forceseek )
{
	var sess = sessions[ id ];
	if ( sess.playing )
	{
		sess.encoder.stop();
		sess.playing = false;
	}
	
	var song = sess.queue[0];
	if ( !song )
		return console.log( 'reached end of queue' ); // TO DO: disconnect timeout
	
	console.log( 'playing ' + song.url );
	
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
			//frameDuration: 60,
			inputArgs: inputArgs,
			outputArgs: [ '-af', 'volume='+volume ]
		});
		
	if ( !encoder )
		return console.log( 'voice connection is disposed' );
	
	sess.encoder = encoder;
	encoder.once( 'end', () =>
		{
			sess.queue.shift(); // TO DO: looping
			rotate_queue( id );
		});

	var encoderStream = encoder.play();
	encoderStream.resetTimestamp();
	encoderStream.removeAllListeners( 'timestamp' );
	encoderStream.on( 'timestamp', time => sess.time = sess.starttime + time );
}

function queryRemote( msg, url )
{
	var promise = new Promise( function( resolve, reject )
		{
			function parseInfo( err, info )
			{
				if ( err )
					return reject( _.fmt( 'youtube error: `%s`', err ) );
				
				var title = info.title;
				
				var length = '??:??';
				if ( info.duration )
				{					
					var split = info.duration.split( /:/g );
					if ( split.length == 1 )
						split.unshift( '00' );
					if ( split.length == 2 )
						split.unshift( '00' );
					
					length = _.fmt( '%s:%s:%s', _.pad( split[0], 2 ), _.pad( split[1], 2 ), _.pad( split[2], 2 ) )
					var length_seconds = moment.duration( length ).format( 'ss' );
					
					if ( length.substring( 0, 3 ) == '00:' )
						length = length.substring( 3 );
					
					var max_length = settings.get( 'audio', 'max_length', 62 );
					if ( length_seconds > max_length * 60 )
					{
						var maxlen = moment.duration( max_length*1000 ).format( 'h:mm:ss' );
						return reject( _.fmt( 'song exceeds max length: %s > %s', length, maxlen ) );
					}
				}
				
				var streamurl = info.formats[0].url;
				if ( info.formats[0].abr )
				{
					var formats = info.formats.sort( (a, b) => b.abr - a.abr );
					streamurl = formats[0].url;
				}
				
				var seek = false;
				if ( url.indexOf( 't=' ) != -1 )
					seek = parse_seek( url.match( /t=(.*)/g )[0] );
				
				var id = msg.guild.id;
				if ( !sessions[ id ].queue )
					sessions[ id ].queue = [];
				
				var queue_empty = sessions[ id ].queue.length == 0;
				sessions[ id ].queue.push( { url: url, title: title, length: length, queuedby: msg.author.id, seek: seek, streamurl: streamurl, length_seconds: length_seconds } );
				
				if ( queue_empty )
				{
					resolve( _.fmt( '%s started playing %s [%s]', msg.author.username, title, length ) );
					rotate_queue( id );
				}
				else
					resolve( _.fmt( '%s queued %s [%s]', msg.author.username, title, length ) );
			}
			
			ydl.getInfo( url, [], parseInfo );
		});
		
	return promise;
}

commands.register( {
	category: 'audio',
	aliases: [ 'play', 'p' ],
	help: 'play audio from a url',
	args: 'url',
	callback: ( client, msg, args ) =>
	{
		var acceptedURLs = settings.get( 'audio', 'accepted_urls',
			[
				"(https?\\:\\/\\/)?(www\\.)?(youtube\\.com|youtu\\.be)\\/.*",
				"(https?\\:\\/\\/)?(www\\.)?soundcloud.com\\/.*",
				"(https?\\:\\/\\/)?(.*\\.)?bandcamp.com\\/.*",
				"(https?\\:\\/\\/)?(www\\.)?vimeo.com\\/.*",
				"(https?\\:\\/\\/)?(www\\.)?vine.co\\/v\\/.*",
				".*\\.mp3",
				".*\\.ogg",
				".*\\.wav",
				".*\\.flac",
				".*\\.m4a",
				".*\\.aac",
				".*\\.webm",
				".*\\.mp4"
			]);
		
		var found = false;
		for ( var i in acceptedURLs )
			if ( args.match( acceptedURLs[i] ) )
				found = true;
				
		if ( !found )
			return msg.channel.sendMessage( _.fmt( '`%s` is not an accepted url', args ) );
		
		join( msg ).then( res =>
			{
				if ( res.isnew )
				{
					var channel = msg.member.getVoiceChannel();
					sessions[ msg.guild.id ] = { conn: res.conn.voiceConnection, channel: channel.id };
				}
				
				queryRemote( msg, args ).then( s => msg.channel.sendMessage( s ) ).catch( s => msg.channel.sendMessage( s ) );
			})
			.catch( e => { if ( e.message ) throw e; msg.channel.sendMessage( e ); } );
	}});

commands.register( {
	category: 'audio',
	aliases: [ 'stop', 's' ],
	help: 'stop audio',
	flags: [ 'admin_only' ],
	callback: ( client, msg, args ) =>
	{
		var channel = msg.member.getVoiceChannel();
		if ( !channel )
			return msg.channel.sendMessage( 'you are not in a voice channel' );
		
		var id = msg.guild.id;
		if ( id in sessions )
		{
			var sess = sessions[id];
			sess.conn.channel.leave();
			delete sessions[id];
		}
	}});

commands.register( {
	category: 'audio',
	aliases: [ 'volume', 'v' ],
	help: 'change audio volume',
	flags: [ 'admin_only' ],
	args: 'number_0-1',
	callback: ( client, msg, args ) =>
	{
		var channel = msg.member.getVoiceChannel();
		if ( !channel )
			return msg.channel.sendMessage( 'you are not in a voice channel' );
		
		if ( isNaN( args ) )
			return msg.channel.sendMessage( _.fmt( '`%s` is not a number', args ) );
		
		var id = msg.guild.id;
		if ( id in sessions )
		{
			var sess = sessions[id];
			sess.volume = Math.max( 0, Math.min( args, settings.get( 'audio', 'volume_max', 1 ) ) );
			sess.encoder.stop();
			rotate_queue( id, sess.time );
		}
	}});

var client = null;
module.exports.setup = function( _cl )
	{
		client = _cl;
		console.log( 'audio plugin loaded' );
	};
