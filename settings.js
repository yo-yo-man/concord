'use strict';

var fs = require( 'fs' );

var settings = {};
var jsonCache = {};

var settingsDir = 'settings';
var normalizedPath = require('path').join( __dirname, settingsDir );
function makefn( file )
{
	return normalizedPath + '/' + file + '.json';
}

settings.exists = function( file, param )
	{
		return fs.existsSync( makefn( file ) );
	};

settings.get = function( file, param )
	{
		if ( !( file in jsonCache ) )
			settings.reload( file );
		
		return jsonCache[file][param];
	};
	
settings.set = function( file, param, val )
	{		
		jsonCache[file][param] = val;
		settings.save( file );
	};
	
settings.save = function( file )
	{		
		fs.writeFile( makefn( file ), JSON.stringify( jsonCache[file], null, 4 ), 'utf8' );
	};
	
settings.reload = function( file )
	{		
		if ( settings.exists( file ) )
			jsonCache[file] = JSON.parse( require('fs').readFileSync( makefn( file ), 'utf8' ) );
		else
			jsonCache[file] = {};
	};
	
module.exports = settings;
