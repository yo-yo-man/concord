'use strict';

var _ = require( './helper.js' );

var plugins = {};

plugins.load = function( client, decache )
	{
		var pluginDir = './plugins';
		var normalizedPath = require('path').join( __dirname, pluginDir );
		require('fs').readdirSync( normalizedPath ).forEach( function( file )
			{
				var module = pluginDir + '/' + file;
				
				var plugin = require( module );				
				if ( plugin.setup )
					plugin.setup( client );
			});
		_.log( 'initialized plugins' );
	};
	
module.exports = plugins;
