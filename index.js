'use strict';

var Discordie = require( 'discordie' );

var client = new Discordie( { autoReconnect: true } );
client.connect( { token: require('./settings.js').get( 'config', 'login_token' ) } );

client.Dispatcher.on( 'GATEWAY_READY', e =>
	{
		console.log( 'Connected as: ' + client.User.username );
		require('./commands.js').init( client );
		require('./plugins.js').load( client );
	});
