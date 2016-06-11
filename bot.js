'use strict';

var Discordie = require( 'discordie' );
var fs = require( 'fs' );

var settings = require( './settings.js' );
var _ = require( './helper.js' );


var client = new Discordie( { autoReconnect: true } );

var token = settings.get( 'config', 'login_token' );
if ( !token )
{
	var config =
		{
			'login_token': '',
			'admin_role': 'admin',
			'owner_id': '',
			'command_prefix': '!'
		};
	settings.save( 'config', config );
	console.log( '\nBot has not been configured.\nPlease edit settings/config.json and restart.' );
	process.exit( 8 );
}
else
	client.connect( { token: token } );


client.Dispatcher.on( 'GATEWAY_READY', e =>
	{
		console.log( _.fmt( 'logged in as %s <@%s>', client.User.username, client.User.id ) );
		require('./permissions.js').init( client );
		require('./commands.js').init( client );
		require('./plugins.js').load( client );
		console.log( 'bot is ready!' );
		
		if ( fs.existsSync( './crash.log' ) )
		{
			var log = fs.readFileSync( './crash.log', 'utf8' );
			var owner = client.Users.get( settings.get( 'config', 'owner_id', '' ) );
			if ( owner )
				owner.openDM().then( d => d.sendMessage( _.fmt( '```\n%s\n```', log ) ) );
			else
				console.log( 'WARNING: no owner to send crash log to' );
			fs.unlinkSync( './crash.log' );
		}
	});

client.Dispatcher.onAny( ( type, e ) =>
	{
		if ( [ 'GATEWAY_RESUMED', 'DISCONNECTED', 'GUILD_UNAVAILABLE', 'GUILD_CREATE', 'GUILD_DELETE' ].indexOf( type ) != -1 )
			return console.log('<' + type + '> ' + (e.error || e.guildId || e.guild.id || '') );
	});
