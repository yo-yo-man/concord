'use strict';

var permissions = require( './permissions.js' );
var settings = require( './settings.js' );
var _ = require( './helper.js' );

var commands = {};

commands.commandList = [];
commands.register = function( params )
	{
		commands.commandList.push( params );
	}
	
commands.generateHelp = function( cmd )
	{
		var help = settings.get( 'config', 'command_prefix' );
		for ( var j in cmd.aliases )
		{
			help += cmd.aliases[j];
			if ( j != cmd.aliases.length-1 )
				help += '|';
		}
		
		if ( cmd.args )
			help += _.fmt( ' %s', cmd.args );
		
		help += _.fmt( ' - %s', cmd.help );
		
		if ( cmd.flags )
		{
			if ( cmd.flags.indexOf( 'owner_only' ) != -1 )
				help += ' (owner-only)';
			else if ( cmd.flags.indexOf( 'admin_only' ) != -1 )
				help += ' (admin-only)';
		}
		
		return help;
	};
	
function checkArgs( cmd, message )
{	
	message = message || '';
	if ( !cmd.args )
		return true;
	
	var msg_args = message.split( / / );
	var cmd_args = cmd.args.split( / / );
	for ( var i in cmd_args )
	{
		var cmd_arg = cmd_args[i].trim();
		var msg_arg = msg_args[i];
		
		if ( !msg_arg && cmd_arg.indexOf( '[' ) != 0 )
			return false;
		
		if ( cmd_arg.indexOf( '|' ) != -1 )
		{
			var accepted_args = cmd_arg.split( /\|/ );
			if ( accepted_args.indexOf( msg_arg ) == -1 )
				return false;
		}
	}
	
	return true;
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
	
	if ( args )
		args = args.trim();
	
	for ( var i in commands.commandList )
	{
		var cmd = commands.commandList[i];
		
		if ( cmd.aliases.indexOf( command ) != -1 )
			if ( cmd.flags && cmd.flags.indexOf( 'no_pm' ) != -1 && e.message.isPrivate )
				return e.message.channel.sendMessage( "can't use this command in private messages" );
			else
				if ( permissions.userHasCommand( e.message.author, cmd ) )
					if ( checkArgs( cmd, args ) )
						return cmd.callback( client, e.message, args );
					else
						return e.message.channel.sendMessage( '```\n' + commands.generateHelp( cmd ) + '\n```' );
				else
					return e.message.channel.sendMessage( 'insufficient permissions' );
	}
};

commands.init = function( client )
	{
		client.Dispatcher.on( 'MESSAGE_CREATE', e => onMessage( client, e ) );
	};
	
module.exports = commands;
