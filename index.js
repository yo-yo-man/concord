'use strict';

const util = require( 'util' );

var jstr = JSON.stringify;
var fmt = util.format;

var config = JSON.parse( require('fs').readFileSync( 'settings/config.json', 'utf8' ) );

var Discordie = require( 'discordie' );
var Events = Discordie.Events;

var client = new Discordie( { autoReconnect: true } );
client.connect( { token: config['login_token'] } );

client.Dispatcher.on( Events.GATEWAY_READY, e =>
{
	console.log( 'Connected as: ' + client.User.username );
});

var commandList = [];
function registerCommand( params )
{
	commandList.push( params );
}

function hasGlobalRole( user, roleName )
{
	var found = false;
	client.Guilds.forEach( function( guild )
		{
			if ( found )
				return;
			
			var member = user.memberOf( guild );
			if ( !member )
				return;
			
			var role = guild.roles.find( (r) => { return r.name === roleName } );
			if ( !role )
				return;
			
			if ( member.hasRole( role ) )
			{
				found = true;
				return;
			}
		} );
	return found;
}

function userHasCommand( user, command )
{
	if ( !command.flags )
		return true;
	
	if ( command.flags.indexOf( 'owner_only' ) != -1 && user.id == config['owner_id'] )
		return true;
	
	if ( command.flags.indexOf( 'admin_only' ) != -1 &&
		( hasGlobalRole( user, config['admin_role'] ) || user.id == config['owner_id'] ) )
		return true;
	
	return false;
}

client.Dispatcher.on( 'MESSAGE_CREATE', e =>
{
	var content = e.message.content;
	if ( !content.startsWith( config['command_prefix'] ) )
		return;
	
	content = content.substring( config['command_prefix'].length );
	var split = content.split( / (.+)?/ );
	
	var command = split[0];
	var args = split[1];
	
	for ( var i in commandList )
	{
		var cmd = commandList[i];
		
		if ( cmd.aliases.indexOf( command ) != -1 )
			if ( cmd.flags && cmd.flags.indexOf( 'no_pm' ) != -1 && e.message.isPrivate )
				return e.message.channel.sendMessage( "can't use this command in private messages" );
			else
				if ( userHasCommand( e.message.author, cmd ) )
					return cmd.callback( client, e.message, args );
				else
					return e.message.channel.sendMessage( 'insufficient permissions' );
	}
});

client.Dispatcher.onAny( ( type, e ) =>
{
	return console.log('<' + type + '>');
});

registerCommand( {
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

registerCommand( {
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
			
			help += config['command_prefix']
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
