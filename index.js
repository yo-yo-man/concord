'use strict';

var _ = require( './helper.js' );

var Discordie = require( 'discordie' );

var client = new Discordie( { autoReconnect: true } );
client.connect( { token: require('./settings.js').get( 'config', 'login_token' ) } );

client.Dispatcher.on( 'GATEWAY_READY', e =>
	{
		console.log( _.fmt( 'logged in as %s <@%s>', client.User.username, client.User.id ) );
		require('./permissions.js').init( client );
		require('./commands.js').init( client );
		require('./plugins.js').load( client );
		console.log( 'bot is ready!' );
	});

client.Dispatcher.onAny( ( type, e ) =>
	{
		if ( [ 'GATEWAY_RESUMED', 'DISCONNECTED', 'GUILD_UNAVAILABLE', 'GUILD_CREATE', 'GUILD_DELETE', 'CHANNEL_DELETE' ].indexOf( type ) != -1 )
			return console.log('<' + type + '> ' + (e.error || '') );
	});
