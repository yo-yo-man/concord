'use strict';

var commands = require( '../commands.js' );
var permissions = require( '../permissions.js' );
var settings = require( '../settings.js' );
var _ = require( '../helper.js' );
var moment = require( 'moment' );

var client = null;

var lastSeen = {};
var idleTime = {};
var lastSeenDelay = 60 * 1000;
function updateLastSeen()
{
	client.Users.forEach( function( user )
		{
			if ( user.status != 'offline' )
				lastSeen[ user.id ] = _.time();
			if ( user.status == 'idle' )
				if ( !( user.id in idleTime ) )
					idleTime[ user.id ] = _.time();
			else
				if ( user.id in idleTime )
					delete idleTime[ user.id ];
		});
		
	settings.save( 'lastseen', lastSeen );
	setTimeout( updateLastSeen, lastSeenDelay );
}

commands.register( {
	aliases: [ 'who', 'lastseen' ],
	help: 'display user info and when they were last seen',
	args: 'user',
	callback: ( client, msg, args ) =>
	{
		var target = commands.findTarget( msg, args );
		if ( target === false )
			return;
		
		var roleList = [];
		if ( target.roles )
			for ( var i in target.roles )
				roleList.push( target.roles[i].name );
		var roles = '';
		if ( roleList.length > 0 )
			roles = _.fmt( 'part of @everyone, %s\n', roleList.join( ', ' ) );
		
		var nick = '';
		if ( target.nick )
			nick = '(' + target.nick + ') ';
		
		var who = _.fmt( '```%s\n\n%s#%s %s\n<@\u200b%s>\n%s', target.avatarURL, target.username, target.discriminator, nick, target.id, roles );		
		if ( target.joined_at )
			who += _.fmt( 'joined %s\n', moment( target.joined_at ).fromNow() );
		
		var timestamp = 0;
		if ( target.id in lastSeen )
			timestamp = lastSeen[ target.id ];
		who += _.fmt( 'last seen %s```', moment.unix( timestamp ).fromNow() );
		
		if ( target.id in idleTime )
			who += _.fmt( 'went idle %s```', moment.unix( idleTime[ target.id ] ).fromNow() );
		
		msg.channel.sendMessage( who );
	}});

commands.register( {
	aliases: [ 'uptime', 'stats' ],
	help: 'bot uptime and statistics',
	callback: ( client, msg, args ) =>
	{
		
	}});

module.exports.setup = function( _cl )
	{
		client = _cl;
		lastSeen = settings.get( 'lastseen', null, {} );
		updateLastSeen();
		console.log( 'stats plugin loaded' );
	};
