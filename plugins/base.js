var commands = require( '../commands.js' );
var permissions = require( '../permissions.js' );
var settings = require( '../settings.js' );

const util = require( 'util' );
var jstr = JSON.stringify;
var fmt = util.format;

commands.register( {
	aliases: [ 'eval' ],
	help: 'eval some code',
	flags: [ 'owner_only' ],
	args: 'code',
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
	aliases: [ 'help' ],
	callback: ( client, msg, args ) =>
	{
		var author = msg.author;
		
		var help = '';
		for ( var i in commandList )
		{
			var cmd = commandList[i];
			
			if ( !userHasCommand( author, cmd ) || !cmd.help )
				continue;
			
			help += settings.get( 'config', 'command_prefix' );
			for ( var j in cmd.aliases )
			{
				help += cmd.aliases[j];
				if ( j != cmd.aliases.length-1 )
					help += '|';
			}
			
			if ( cmd.args )
				help += fmt( ' [%s]', cmd.args );
			
			help += fmt( ' - %s', cmd.help );
			
			if ( cmd.flags )
			{
				if ( cmd.flags.indexOf( 'owner_only' ) != -1 )
					help += ' (owner-only)';
				else if ( cmd.flags.indexOf( 'admin_only' ) != -1 )
					help += ' (admin-only)';
			}
			
			if ( i != commandList.length-1 )
				help += '\n';
		}
		
		msg.channel.sendMessage( fmt( '```\n%s\n```', help ) );
	}});

module.exports.setup = function( client )
	{
		console.log( 'base plugin loaded' );
	};
