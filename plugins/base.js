'use strict';

var commands = require( '../commands.js' );
var permissions = require( '../permissions.js' );
var settings = require( '../settings.js' );
var _ = require( '../helper.js' );

commands.register( {
	category: 'base',
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
		var val = split[2];
		
		if ( typeof val !== 'undefined' )
			settings.set( file, param, val );
		
		var val = settings.get( file, param );
		if ( val.toString().indexOf( '\n' ) != -1 )
			val = '```\n' + val + '\n```';
		else
			val = '`' + val + '`';
		msg.channel.sendMessage( val );
	}});

commands.register( {
	category: 'base',
	aliases: [ 'clear' ],
	help: 'clear messages',
	flags: [ 'admin_only', 'no_pm' ],
	args: '[limit=100] [user]',
	callback: ( client, msg, args ) =>
	{
		var split = args.split( ' ' );
		var limit = split[0] || 100;
		var target = split[1] || false;
		
		if ( isNaN( limit ) )
			return msg.channel.sendMessage( limit + ' is not a number' );
		
		if ( !client.User.can( permissions.discord.Text.MANAGE_MESSAGES, msg.channel ) )
			return msg.channel.sendMessage( "invalid 'manage messages' permission in this channel" );
		
		if ( target )
		{
			target = commands.findTarget( msg, target );
			if ( target === false )
				return;
		}
		
		limit++; // clear the user's !clear command as well
		msg.channel.sendMessage( 'clearing, please wait...' ).then( tempMsg =>
			{
				msg.channel.fetchMessages( limit, tempMsg ).then( () =>
					{
						var toDelete = [];
						for ( var i = msg.channel.messages.length-1; i >= 0; i-- )
						{
							var message = msg.channel.messages[i];
							
							if ( message.deleted || message.id == tempMsg.id || ( target !== false && target.id != message.author.id ) )
							{
								limit++;
								continue;
							}
							
							if ( toDelete.length >= limit )
								break;
								
							toDelete.push( message );
						}
						
						var deleteQueue = function( i )
							{
								if ( i >= toDelete.length )
								{
									tempMsg.delete();
									msg.channel.sendMessage( _.fmt( '`%s` cleared `%s` messages', msg.author.username, toDelete.length - 1 ) )
									return;
								}
								
								toDelete[i].delete().then( () =>
									{ setTimeout( function() { deleteQueue( i+1 ) }, 1000 )
									}).catch( e => { console.log( e.stack ) } );
							};
							
						deleteQueue( 0 );
					})
					.catch( e => { console.log( e.stack ) } );
			})
			.catch( e => { console.log( e.stack ) } );
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
		console.log( 'base plugin loaded' );
	};
