'use strict';

var permissions = require( './permissions.js' );
var settings = require( './settings.js' );
var _ = require( './helper.js' );
var moment = require( 'moment' );

var commands = {};
var client = null;

commands.numSinceBoot = 0;
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
	
commands.findTarget = function( msg, str )
	{
		var matches = [];
		str = str.toLowerCase();
		
		if ( msg.channel.is_private )
		{
			client.Users.forEach( function( user )
			{
				if ( user.username.toLowerCase().indexOf( str ) != -1 )
					 if ( matches.indexOf( user ) == -1 ) matches.push( user );
				if ( str == user.username.toLowerCase()+'#'+user.discriminator )
					 if ( matches.indexOf( user ) == -1 ) matches.push( user );
			});
		}
		else
		{
			for ( var i in msg.guild.members )
			{
				var user = msg.guild.members[i];
				if ( user.nick && user.nick.toLowerCase().indexOf( str ) != -1 )
					 if ( matches.indexOf( user ) == -1 ) matches.push( user );
				if ( user.username.toLowerCase().indexOf( str ) != -1 )
					 if ( matches.indexOf( user ) == -1 ) matches.push( user );
				if ( str == user.username.toLowerCase()+'#'+user.discriminator )
					 if ( matches.indexOf( user ) == -1 ) matches.push( user );
			}
		}
		
		if ( matches.length == 0 )
		{
			var reply = _.fmt( 'could not find user matching `%s`', str );
			msg.channel.sendMessage( reply );
			return false;
		}
		
		if ( matches.length > 1 )
		{
			var matchesString = '';
			for ( var i in matches )
			{
				var user = matches[i];
				var nick = '';
				if ( user.nick )
					nick = '(' + user.nick + ')';
				matchesString += _.fmt( '%s#%s %s\n', user.username, user.discriminator, nick );
			}
			var reply = _.fmt( 'found %s matches for `%s`:\n```\n%s```', matches.length, str, matchesString );
			msg.channel.sendMessage( reply );
			return false;
		}
		
		return matches[0];
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
			if ( cmd.flags && cmd.flags.indexOf( 'no_pm' ) != -1 && e.message.channel.is_private )
				return e.message.channel.sendMessage( "can't use this command in private messages" );
			else
				if ( permissions.userHasCommand( e.message.author, cmd ) )
				{
					var guildname = '<pm>';
					if ( e.message.guild )
						guildname = '(' + e.message.guild.name + ')';
					
					commands.numSinceBoot++;
					console.log( _.fmt( '[%s]  %s in #%s %s: %s', moment().format( 'YYYY-MM-DD hh:mm:ss' ), e.message.author.username, e.message.channel.name, guildname, e.message.content ) );
					
					if ( checkArgs( cmd, args ) )
						return cmd.callback( client, e.message, args );
					else
						return e.message.channel.sendMessage( '```\n' + commands.generateHelp( cmd ) + '\n```' );
				}
				else
					return e.message.channel.sendMessage( 'insufficient permissions' );
	}
};

commands.init = function( _cl )
	{
		client = _cl;
		_cl.Dispatcher.on( 'MESSAGE_CREATE', e => onMessage( _cl, e ) );
	};
	
module.exports = commands;
