var plugins = {};

plugins.load = function( client, decache )
	{
		var pluginDir = './plugins';
		var normalizedPath = require('path').join( __dirname, pluginDir );
		require('fs').readdirSync( normalizedPath ).forEach( function( file )
			{
				var module = pluginDir + '/' + file;
				
				var resolve = require.resolve( module );
				if ( decache && resolve in require.cache )
					delete require.cache[ resolve ];
				
				var plugin = require( module );				
				if ( plugin.setup )
					plugin.setup( client );
			});
	};
	
plugins.reload = function( client )
	{
		plugins.load( client, true );
	};
	
module.exports = plugins;
