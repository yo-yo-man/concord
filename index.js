'use strict';

var commands = require( './commands.js' );
var permissions = require( './permissions.js' );
var settings = require( './settings.js' );


var Discordie = require( 'discordie' );
var Events = Discordie.Events;

var client = new Discordie( { autoReconnect: true } );
client.connect( { token: settings.get( 'config', 'login_token' ) } );

client.Dispatcher.on( Events.GATEWAY_READY, e =>
{
	console.log( 'Connected as: ' + client.User.username );
	require('./plugins.js').load( client );
});

client.Dispatcher.onAny( ( type, e ) =>
{
	return console.log('<' + type + '>');
});

client.Dispatcher.on( 'MESSAGE_CREATE', e =>
{
	var prefix = settings.get( 'config', 'command_prefix' );
	
	var content = e.message.content;
	if ( !content.startsWith( prefix ) )
		return;
	
	content = content.substring( prefix.length );
	var split = content.split( / (.+)?/ );
	
	var command = split[0];
	var args = split[1];
	
	for ( var i in commands.commandList )
	{
		var cmd = commands.commandList[i];
		
		if ( cmd.aliases.indexOf( command ) != -1 )
			if ( cmd.flags && cmd.flags.indexOf( 'no_pm' ) != -1 && e.message.isPrivate )
				return e.message.channel.sendMessage( "can't use this command in private messages" );
			else
				if ( permissions.userHasCommand( e.message.author, cmd ) )
					return cmd.callback( client, e.message, args );
				else
					return e.message.channel.sendMessage( 'insufficient permissions' );
	}
});
