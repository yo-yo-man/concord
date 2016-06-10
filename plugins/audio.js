'use strict';

var commands = require( '../commands.js' );
var permissions = require( '../permissions.js' );
var settings = require( '../settings.js' );
var _ = require( '../helper.js' );

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

function play( file, voiceConnection )
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
	aliases: [ 'play', 'p', 'test' ],
	help: 'play audio from a url',
	args: 'url',
	callback: ( client, msg, args ) =>
	{
		join( msg ).then( conn =>
			{				
				play( args, conn.voiceConnection );
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
