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


var initialized = false;
client.Dispatcher.on( 'GATEWAY_READY', e =>
	{
		if ( initialized ) return;
		initialized = true;
		
		_.log( _.fmt( 'logged in as %s <@%s>', client.User.username, client.User.id ) );
		require('./permissions.js').init( client );
		require('./commands.js').init( client );
		require('./plugins.js').load( client );
		_.log( 'bot is ready!' );
		
		if ( fs.existsSync( './crash.log' ) )
		{
			var log = fs.readFileSync( './crash.log', 'utf8' );
			var owner = client.Users.get( settings.get( 'config', 'owner_id', '' ) );
			if ( owner )
				owner.openDM().then( d => d.sendMessage( _.fmt( '```\n%s\n```', log ) ) );
			else
				_.log( 'WARNING: no owner to send crash log to' );
			fs.unlinkSync( './crash.log' );
		}
	});

client.Dispatcher.onAny( ( type, e ) =>
	{
		if ( [ 'GATEWAY_RESUMED', 'DISCONNECTED', 'GUILD_UNAVAILABLE', 'GUILD_CREATE', 'GUILD_DELETE' ].indexOf( type ) != -1 )
		{
			var message = e.error || e.guildId || '';
			if ( e.guild )
				message = e.guild.id;
			return _.log('<' + type + '> ' + message );
		}
	});
