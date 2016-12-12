'use strict';

var commands = require( '../commands.js' );
var permissions = require( '../permissions.js' );
var settings = require( '../settings.js' );
var _ = require( '../helper.js' );

function clearMessages( msg, limit, target, after )
{	
	if ( !client.User.can( permissions.discord.Text.MANAGE_MESSAGES, msg.channel ) )
		return msg.channel.sendMessage( "invalid 'manage messages' permission in this channel" );
	
	if ( target )
	{
		target = commands.findTarget( msg, target );
		if ( target === false )
			return;
	}
	else
		limit++; // clear the user's !clear command as well
	
	var hardLimit = 100; // max API will allow
	var lookback = hardLimit; // number of messages to look back into
	msg.channel.fetchMessages( lookback, msg, after ).then( () =>
		{
			var toDelete = [];
			for ( var i = msg.channel.messages.length-1; i >= 0; i-- )
			{
				var message = msg.channel.messages[i];
				
				if ( message.deleted || ( target !== false && target.id != message.author.id ) )
					continue;
				
				if ( toDelete.length >= hardLimit )
					break;
					
				toDelete.push( message );
			}
			
			client.Messages.deleteMessages( toDelete ).then( () =>
				{
					var byUser = '';
					if ( target !== false )
						byUser = _.fmt( ' by `%s`', _.nick( target ) );
					var numCleared = toDelete.length-1; // subtract user's !clear command
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
		if ( !args )
			return msg.channel.sendMessage( '`' + commands.generateHelp( commands.getCMD( 'clear' ) ) + '`' );
		
		var split = args.split( ' ' );
		var limit = split[0] || 99;
		var target = split[1] || false;
		
		if ( isNaN( limit ) )
			return msg.channel.sendMessage( _.fmt( '`%s` is not a number', limit ) );
		
		if ( parseInt( limit ) > 100 )
			return msg.channel.sendMessage( _.fmt( 'can only delete `100` messages at a time' ) );
		
		clearMessages( msg, limit, target, null );
	}});

commands.register( {
	category: 'moderation',
	aliases: [ 'clearafter' ],
	help: 'clear messages after a message ID',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'messageID [user]',
	callback: ( client, msg, args ) =>
	{
		if ( !args )
			return msg.channel.sendMessage( '`' + commands.generateHelp( commands.getCMD( 'clear' ) ) + '`' );
		
		var split = args.split( ' ' );
		var after = split[0];
		var target = split[1] || false;
		
		if ( isNaN( after ) )
			return msg.channel.sendMessage( _.fmt( '`%s` is not a numeric message ID', after ) );
		
		clearMessages( msg, 99, target, after );
	}});

var client = null;
module.exports.setup = function( _cl )
	{
		client = _cl;
		_.log( 'loaded plugin: moderation' );
	};
