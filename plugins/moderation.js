'use strict';

var commands = require( '../commands.js' );
var permissions = require( '../permissions.js' );
var settings = require( '../settings.js' );
var _ = require( '../helper.js' );

function clearMessages( msg, limit, target, after )
{	
	if ( isNaN( limit ) )
		return msg.channel.sendMessage( _.fmt( '`%s` is not a number', limit ) );
	
	if ( parseInt( limit ) > 100 )
		return msg.channel.sendMessage( _.fmt( 'can only delete `100` messages at a time' ) );
	
	if ( !client.User.can( permissions.discord.Text.MANAGE_MESSAGES, msg.channel ) )
		return msg.channel.sendMessage( "invalid 'manage messages' permission in this channel" );
	
	if ( target )
	{
		target = commands.findTarget( msg, target );
		if ( target === false )
			return;
	}
	else if ( !after )
		limit++; // clear the user's !clear command as well
	
	var before = msg;
	if ( after ) before = null;
	
	limit = Math.min( limit, 100 );
	var lookback = 100; // number of messages to look back into
	msg.channel.fetchMessages( lookback, null, after ).then( () =>
		{
			var msglist = msg.channel.messages;
			if ( after ) msglist.reverse();
			
			var toDelete = [];
			for ( var i = msglist.length-1; i >= 0; i-- )
			{
				var message = msglist[i];
				
				if ( message.deleted || ( target !== false && target.id != message.author.id ) )
					continue;
				
				if ( toDelete.length >= limit )
					break;
					
				toDelete.push( message );
			}
			
			client.Messages.deleteMessages( toDelete ).then( () =>
				{
					var byUser = '';
					if ( target !== false )
						byUser = _.fmt( ' by `%s`', _.nick( target ) );
					var numCleared = toDelete.length;
					if ( !after ) numCleared -= 1;  // subtract user's !clear command
					msg.channel.sendMessage( _.fmt( '`%s` cleared `%s` messages%s', _.nick( msg.member ), numCleared, byUser ) );
				}).catch( e => msg.channel.sendMessage( _.fmt( 'error deleting messages: `%s`', e.message ) ) );
		}).catch( e => msg.channel.sendMessage( _.fmt( 'error fetching messages: `%s`', e.message ) ) );
}

commands.register( {
	category: 'moderation',
	aliases: [ 'clear' ],
	help: 'clear messages',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'limit=100 [user]',
	callback: ( client, msg, args ) =>
	{
		var split = args.split( ' ' );
		var limit = split[0] || 99;
		var target = split[1] || false;
		
		clearMessages( msg, limit, target, null );
	}});

commands.register( {
	category: 'moderation',
	aliases: [ 'clearafter' ],
	help: 'clear messages after a message ID',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'messageID [limit=100]',
	callback: ( client, msg, args ) =>
	{	
		var split = args.split( ' ' );
		var after = split[0];
		var limit = split[1] || 99;
		
		if ( isNaN( after ) )
			return msg.channel.sendMessage( _.fmt( '`%s` is not a numeric message ID', after ) );
		
		clearMessages( msg, limit, false, after );
	}});

var client = null;
module.exports.setup = function( _cl )
	{
		client = _cl;
		_.log( 'loaded plugin: moderation' );
	};
