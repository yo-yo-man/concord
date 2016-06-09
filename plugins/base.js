'use strict';

var commands = require( '../commands.js' );
var permissions = require( '../permissions.js' );
var settings = require( '../settings.js' );
var _ = require( '../helper.js' );

commands.register( {
	aliases: [ 'eval' ],
	help: 'eval some code',
	flags: [ 'owner_only' ],
	args: 'code*',
	callback: ( client, msg, args ) =>
	{
		var res = '';
		try
		{
			res = eval( args );
		}
		catch( e )
		{
			res = e;
		}
		msg.channel.sendMessage( '`' + res + '`' );
	}});

commands.register( {
	aliases: [ 'setting' ],
	help: 'view or change settings',
	flags: [ 'owner_only' ],
	args: 'file param [value]',
	callback: ( client, msg, args ) =>
	{
		var split = args.split( ' ' );
		var file = split[0];
		var param = split[1];
		var val = split[2];
		
		if ( typeof val !== 'undefined' )
			settings.set( file, param, val );
		
		msg.channel.sendMessage( '`' + settings.get( file, param ) + '`' );
	}});

commands.register( {
	aliases: [ 'help' ],
	args: '[command]',
	callback: ( client, msg, args ) =>
	{
		var author = msg.author;
		
		if ( args )
		{
			var help = 'command not found';
			for ( var i in commands.commandList )
			{
				var cmd = commands.commandList[i];
				if ( cmd.aliases.indexOf( args ) != -1 )
				{
					if ( !permissions.userHasCommand( author, cmd ) || !cmd.help )
						continue;
					
					help = commands.generateHelp( cmd );
					break;
				}
			}
			msg.channel.sendMessage( _.fmt( '```\n%s\n```', help ) );
		}
		else
		{
			for ( var i in commands.commandList )
			{
				var cmd = commands.commandList[i];
				
				if ( !permissions.userHasCommand( author, cmd ) || !cmd.help )
					continue;
				
				help += commands.generateHelp( cmd );
				
				if ( i != commands.commandList.length-1 )
					help += '\n';
			}
			
			author.openDM().then( d => d.sendMessage( _.fmt( '```\n%s\n```', help ) ) );
		}
	}});

module.exports.setup = function( client )
	{
		console.log( 'base plugin loaded' );
	};
