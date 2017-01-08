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
	category: 'blacklist',
	aliases: [ 'blacklist' ],
	help: 'blacklist a user from bot commands',
	flags: [ 'owner_only' ],
	args: '[target] [silent]',
	callback: ( client, msg, args ) =>
	{
		if ( !args )
		{
			var list = [];
			for ( var i in commands.blacklistedUsers )
			{
				var u = client.Users.get( commands.blacklistedUsers[i] );
				list.push( _.fmt( '%s#%s', u.username, u.discriminator ) );
			}
			for ( var i in commands.tempBlacklist )
			{
				var u = client.Users.get( commands.tempBlacklist[i] );
				list.push( _.fmt( '%s#%s (temp)', u.username, u.discriminator ) );
			}
			return msg.channel.sendMessage( _.fmt( 'blacklisted users:\n```%s```', list.join( ', ' ).replace( /((?:[^, ]*\, ){3})/g, '$1\n' ) || 'none' ) );
		}
		
		var split = args.split( ' ' );
		var target = commands.findTarget( msg, split[0] );
		if ( target === false )
			return;
		
		if ( commands.blacklistedUsers.indexOf( target.id ) != -1 )
		{
			var index = commands.blacklistedUsers.indexOf( target.id );
			commands.blacklistedUsers.splice( index, 1 );
			settings.save( 'blacklist', commands.blacklistedUsers );
			
			return msg.channel.sendMessage( _.fmt( 'removed `%s` from blacklist', _.nick( target ) ) );
		}
		
		commands.blacklistedUsers.push( target.id );
		settings.save( 'blacklist', commands.blacklistedUsers );
		msg.channel.sendMessage( _.fmt( '`%s` added to blacklist %s', _.nick( target ), split[1] ? '(silently)' : '' ) );
		
		if ( !split[1] )
			target.openDM().then( dm => dm.sendMessage( _.fmt( '**NOTICE:** You have been blacklisted, and will no longer be able to use bot commands' ) ) );
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
			function flushHelp( help )
			{
				author.openDM().then( d => d.sendMessage( _.fmt( '```\n%s\n```', help ) ) );
			}
			
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
					if ( help.length >= 1500 )
					{
						flushHelp( help );
						help = '';
					}
					help += _.fmt( '\n--- %s ---\n', cmd.category );
				}
				
				help += commands.generateHelp( cmd );
				
				if ( i != commands.commandList.length-1 )
					help += '\n';
			}
			
			flushHelp( help );
		}
	}});

var client = null;
module.exports.setup = function( _cl )
	{
		client = _cl;
		_.log( 'loaded plugin: base' );
	};
