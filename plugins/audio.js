'use strict';

var commands = require( '../commands.js' );
var permissions = require( '../permissions.js' );
var settings = require( '../settings.js' );
var _ = require( '../helper.js' );

var ydl = require( 'youtube-dl' );
var moment = require( 'moment' );
require( 'moment-duration-format' );

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

function start_player( id, forceseek )
{
	var sess = sessions[ id ];
	if ( sess.playing )
	{
		sess.encoder.stop();
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
	
	console.log( 'playing ' + song.url );
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
			//frameDuration: 60,
			inputArgs: inputArgs,
			outputArgs: [ '-af', 'volume='+volume ]
		});
		
	if ( !encoder )
		return console.log( 'voice connection is disposed' );
	
	sess.playing = true;
	sess.encoder = encoder;
	encoder.once( 'end', () => rotate_queue( id ) );

	var encoderStream = encoder.play();
	encoderStream.resetTimestamp();
	encoderStream.removeAllListeners( 'timestamp' );
	encoderStream.on( 'timestamp', time => sess.time = sess.starttime + time );
}

function queryRemote( msg, url )
{
	var promise = new Promise( function( resolve, reject )
		{
			msg.channel.sendMessage( 'fetching info, please wait...' ).then( tempMsg =>
				{
					function parseInfo( err, info )
					{
						if ( err )
						{
							tempMsg.delete();
							return reject( _.fmt( 'youtube error: `%s`', err ) );
						}
						
						var title = info.title;
						
						var length = '??:??';
						if ( info.duration )
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
							
							var max_length = settings.get( 'audio', 'max_length', 62 );
							if ( length_seconds > max_length * 60 )
							{
								var maxlen = moment.duration( max_length*1000 ).format( 'h:mm:ss' );
								tempMsg.delete();
								return reject( _.fmt( 'song exceeds max length: `%s` > `%s`', length, maxlen ) );
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
							seek = parse_seek( _.matches( /t=(.*)/g, url )[0] );
						
						var id = msg.guild.id;
						if ( !sessions[ id ].queue )
							sessions[ id ].queue = [];
						
						var queue_empty = sessions[ id ].queue.length == 0;
						sessions[ id ].queue.push( { url: url, title: title, length: length, queuedby: msg.author.id, seek: seek, streamurl: streamurl, length_seconds: length_seconds } );
						
						tempMsg.delete();
						if ( queue_empty )
						{
							resolve( _.fmt( '`%s` started playing `%s [%s]`', msg.author.username, title, length ) );
							start_player( id );
						}
						else // TO DO: force play (admin)
							resolve( _.fmt( '`%s` queued `%s [%s]`', msg.author.username, title, length ) );
					}
				
					ydl.getInfo( url, [], parseInfo );
				});
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
		
		join_channel( msg ).then( res =>
			{
				if ( res.isnew )
				{
					var channel = msg.member.getVoiceChannel();
					sessions[ msg.guild.id ] = { conn: res.conn.voiceConnection, channel: channel.id };
					restoreGuildSettings( msg.guild.id );
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
		var id = msg.guild.id;
		if ( id in sessions )
		{
			var sess = sessions[id];
			if ( !sess.playing ) return;
			
			leave_channel( id );
		}
	}});

commands.register( {
	category: 'audio',
	aliases: [ 'skip' ],
	help: 'vote to skip song',
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
	help: 'set volume between 0 and 1',
	flags: [ 'admin_only' ],
	args: 'number',
	callback: ( client, msg, args ) =>
	{		
		if ( isNaN( args ) )
			return msg.channel.sendMessage( _.fmt( '`%s` is not a number', args ) );
		
		var vol = Math.max( 0, Math.min( args, settings.get( 'audio', 'volume_max', 1 ) ) );
		msg.channel.sendMessage( _.fmt( '`%s` changed volume to `%s`', msg.author.username, vol ) );
		
		var id = msg.guild.id;
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
			
			var by_user = client.Users.get( song.queuedby );
			if ( !by_user ) by_user = '<unknown user>';
				else by_user = by_user.username;
			msg.channel.sendMessage( _.fmt( 'now playing: `%s [%s]` (queued by `%s`)', song.title, song.length, by_user ) );
		}
		else
			msg.channel.sendMessage( 'nothing is currently playing' );
	}});

commands.register( {
	category: 'audio',
	aliases: [ 'queue', 'q' ],
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
				
				var by_user = client.Users.get( song.queuedby );
				if ( !by_user ) by_user = '<unknown user>';
					else by_user = by_user.username;
				res += msg.channel.sendMessage( _.fmt( '%s [%s] (queued by %s)\n', song.title, song.length, by_user ) );
			}
			
			msg.channel.sendMessage( '```\n' + res + '\n```' );
		}
		else
			msg.channel.sendMessage( '```\nempty\n```' );
	}});

commands.register( {
	category: 'audio',
	aliases: [ 'pause' ],
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
	aliases: [ 'seek' ],
	help: 'seek to a specific time',
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
	callback: ( client, msg, args ) =>
	{		
		var id = msg.guild.id;		
		if ( id in sessions )
		{
			var sess = sessions[id];
			if ( !sess.playing ) return;
			
			sess.loop = !sess.loop;
			
			if ( sess.loop )
				msg.channel.sendMessage( 'turned on looping, use `!loop` again to toggle off' )
			else
				msg.channel.sendMessage( 'turned off looping, queue will proceed as normal' )
		}
	}});

var client = null;
module.exports.setup = function( _cl )
	{
		client = _cl;
		guildSettings = settings.get( 'audio', 'guild_settings', {} );
		console.log( 'audio plugin loaded' );
	};
	
module.exports.songsSinceBoot = 0;
module.exports.sessions = sessions;
