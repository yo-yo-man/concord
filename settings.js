'use strict';

var fs = require( 'fs' );
var _ = require( './helper.js' );

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

settings.get = function( file, param, def )
	{
		if ( !( file in jsonCache ) )
			settings.reload( file );
		
		var val = jsonCache[file][param];
		if ( !param )
			val = jsonCache[file];
		
		if ( val == null || ( typeof val == 'object' && param == null && Object.getOwnPropertyNames(val).length == 0 ) )
		{
			if ( typeof def !== 'undefined' )
			{
				settings.set( file, param, def );
				val = def;
			}
		}

		if ( val === 'true' )
			return true;
		if ( val === 'false' )
			return false;
		
		return val;
	};
	
settings.set = function( file, param, val )
	{		
		if ( param )
			jsonCache[file][param] = val;
		else
			jsonCache[file] = val;
		
		settings.save( file );
	};
	
settings.save = function( file, json )
	{		
		if ( typeof json !== 'undefined' )
			jsonCache[file] = json;
		
		fs.writeFileSync( makefn( file ), JSON.stringify( jsonCache[file], null, 4 ), 'utf8' );
	};
	
settings.reload = function( file )
	{		
		if ( settings.exists( file ) )
		{
			var contents = require('fs').readFileSync( makefn( file ), 'utf8' );
			if ( _.isjson( contents ) )
				jsonCache[file] = JSON.parse( contents );
			else
				jsonCache[file] = {};
		}
		else
			jsonCache[file] = {};
	};
	
module.exports = settings;
