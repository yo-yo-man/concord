'use strict';

var commands = require( '../commands.js' );
var permissions = require( '../permissions.js' );
var settings = require( '../settings.js' );
var _ = require( '../helper.js' );

var ytdl = require( 'ytdl-core' );

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
				return reject( 'already busy in another channel' );
			
			msg.member.getVoiceChannel().join().then( conn => resolve( conn ) )
				.catch( e => reject( e.message ) );
		});
	
	return promise;
}

function playRemote( remote, conn )
{
	function onMediaInfo( err, mediaInfo )
	{
		if ( err )
			return console.log( 'ytdl error:', err );

		// sort by bitrate, high to low; prefer webm over anything else
		var formats = mediaInfo.formats.filter( f => f.container === 'webm' ).sort( (a, b) => b.audioBitrate - a.audioBitrate );

		// get first audio-only format or fallback to non-dash video
		var bestaudio = formats.find( f => f.audioBitrate > 0 && !f.bitrate ) || formats.find( f => f.audioBitrate > 0 );
		if ( !bestaudio )
			return console.log( '[playRemote] No valid formats' );

		var encoder = conn.createExternalEncoder(
		{
			type: 'ffmpeg',
			source: bestaudio.url,
			format: 'opus',
			//frameDuration: 60,
			inputArgs: [ ],
			outputArgs: [ '-af', 'volume=0.3' ]
		});
		
		if ( !encoder )
			return console.log( 'Voice connection is disposed' );
		
		encoder.play();
	}
	try
	{
		ytdl.getInfo( remote, onMediaInfo );
	} catch(e) { console.log( 'ytdl threw:', e ); }
}

function playLocal( file, voiceConnection )
{
	var encoder = voiceConnection.createExternalEncoder(
		{
			type: 'ffmpeg',
			source: file,
			format: 'opus',
			frameDuration: 60,
			inputArgs: [],
			outputArgs: [ '-af', 'volume=0.5' ]
		});
		
	if ( !encoder )
		return console.log( 'Voice connection is disposed' );

	encoder.once( 'end', () => console.log( 'stream end' ) );

	var encoderStream = encoder.play();
	encoderStream.resetTimestamp();
	encoderStream.removeAllListeners( 'timestamp' );
	//encoderStream.on( 'timestamp', time => console.log( 'Time ' + time ) );
}

commands.register( {
	aliases: [ 'test' ], // 'play', 'p', 
	help: 'play audio from a url',
	args: 'url',
	callback: ( client, msg, args ) =>
	{
		join( msg ).then( conn =>
			{				
				//playLocal( args, conn.voiceConnection );
				playRemote( args, conn.voiceConnection );
				//setTimeout( function() { msg.member.getVoiceChannel().leave() }, 3000 );
			})
			.catch( text => { return msg.channel.sendMessage( text ); });
	}});

var client = null;
module.exports.setup = function( _cl )
	{
		client = _cl;
		console.log( 'audio plugin loaded' );
	};
