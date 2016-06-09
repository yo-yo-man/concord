var permissions = require( './permissions.js' );
var settings = require( './settings.js' );

var commands = {};

commands.commandList = [];
commands.register = function( params )
	{
		commands.commandList.push( params );
	}
	
function onMessage( client, e )
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
};

commands.init = function( client )
	{
		client.Dispatcher.on( 'MESSAGE_CREATE', e => onMessage( client, e ) );
	};
	
module.exports = commands;
