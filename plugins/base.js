'use strict';

var commands = require( '../commands.js' );
var permissions = require( '../permissions.js' );
var settings = require( '../settings.js' );
var _ = require( '../helper.js' );

commands.register( {
	category: 'base',
	aliases: [ 'eval', 'ev' ],
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
		
		if ( typeof res === 'undefined' )
			res = 'undefined';
		
		res = res.toString();
		if ( res.indexOf( '\n' ) != -1 )
			res = '```\n' + res + '\n```';
		else
			res = '`' + res + '`';
		msg.channel.sendMessage( res );
	}});

commands.register( {
	category: 'base',
	aliases: [ 'setting' ],
	help: 'view or change settings',
	flags: [ 'owner_only' ],
	args: 'file param [value]',
	callback: ( client, msg, args ) =>
	{
		var split = args.split( ' ' );
		var file = split[0];
		var param = split[1];
		var newVal = split[2];
		
		if ( typeof newVal !== 'undefined' )
			settings.set( file, param, newVal );
		
		var val = settings.get( file, param );
		if ( typeof val === 'undefined' )
			val = 'undefined';
		
		if ( val.toString().indexOf( '\n' ) != -1 )
			val = '```\n' + val + '\n```';
		else
			val = '`' + val + '`';
		msg.channel.sendMessage( val );
	}});

commands.register( {
	category: 'base',
	aliases: [ 'help' ],
	help: 'display help menu, optionally for a specific command',
	args: '[command]',
	callback: ( client, msg, args ) =>
	{
		var author = msg.author;
		var help = '';
		
		if ( args )
		{
			help = 'command not found';
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
			help = 'powered by concord <http://github.com/DougTy/concord>\n';
			
			var lastCat = '';
			for ( var i in commands.commandList )
			{
				var cmd = commands.commandList[i];
				
				if ( !permissions.userHasCommand( author, cmd ) || !cmd.help )
					continue;
				
				if ( cmd.category != lastCat )
				{
					lastCat = cmd.category;
					help += _.fmt( '\n--- %s ---\n', cmd.category );
				}
				
				help += commands.generateHelp( cmd );
				
				if ( i != commands.commandList.length-1 )
					help += '\n';
			}
			
			author.openDM().then( d => d.sendMessage( _.fmt( '```\n%s\n```', help ) ) );
		}
	}});

var client = null;
module.exports.setup = function( _cl )
	{
		client = _cl;
		_.log( 'loaded plugin: base' );
	};
