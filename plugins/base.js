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
		if ( val.indexOf( '\n' ) != -1 )
			val = '```\n' + val + '\n```';
		else
			val = '`' + val + '`';
		msg.channel.sendMessage( val );
	}});

commands.register( {
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
		
		msg.channel.sendMessage( 'clearing, please wait...' ).then( tempMsg =>
			{
				msg.channel.fetchMessages( limit*2, tempMsg ).then( () =>
					{
						var toDelete = [];
						msg.channel.messages.forEach( function( message )
							{
								if ( message.deleted )
									return;
								
								if ( target !== false && target.id != message.author.id )
								{
									limit++;
									return;
								}
								
								if ( toDelete.length >= limit )
									return;
									
								toDelete.unshift( message );
							});
						
						var deleteQueue = function( i )
							{
								if ( i >= toDelete.length )
								{
									tempMsg.delete();
									msg.channel.sendMessage( _.fmt( '%s cleared %s messages', msg.author.username, toDelete.length) )
									return;
								}
								
								toDelete[i].delete().then( () => { deleteQueue( i+1 ) } );
							};
							
						deleteQueue( 0 );
						
					}).catch( e => { console.log( e.stack ) } );
			}).catch( e => { console.log( e.stack ) } );
	}});

commands.register( {
	aliases: [ 'help' ],
	help: 'display help menu (optionally for a specific command)',
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

var client = null;
module.exports.setup = function( _cl )
	{
		client = _cl;
		console.log( 'base plugin loaded' );
	};
