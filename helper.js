'use strict';

const util = require( 'util' );
var moment = require( 'moment' );

var _ = {};
_.jstr = JSON.stringify;
_.exec = function( str ) { return require('child_process').execSync( str ) };
_.fmt = util.format;
_.isjson = function( str ) { try { JSON.parse( str ); return true; } catch(e) { return false; } };
_.time = function() { return Math.floor( Date.now() / 1000 ) };
_.pad = function( num, size )
	{
	    var s = num.toString();
	    while ( s.length < size )
	    	s = "0" + s;
	    return s;
	};
_.rand = function( min, max ) { return Math.floor( ( Math.random() * max ) + min ) };
_.round = function( num, places )
	{
		num = parseFloat( num );
		places = places || 0;
		return Number( Math.round( num + 'e' + places ) + 'e-' + places );
	};
_.matches = function( reg, str )
	{
		var matches, output = [];
		while ( matches = reg.exec( str ) )
			output.push( matches[1] );
		return output;
	};
_.filterlinks = function( str )
	{
		str = str.toString();
		var link_regex = /(\bhttps?\:\/\/[^\s]+)/g;
		if ( str.match( link_regex ) )
		{
			var link = _.matches( link_regex, str )[0];
			if ( !link.endsWith( '>' ) ) // if it ends with a > it's already been filtered
				str = str.replace( link_regex, '<' + link + '>' );
		}
		return str;
	};
_.log = function()
	{
		var str = '';
		for ( var i = 0; i < arguments.length; i++ )
			str += arguments[i].toString() + ' ';
		str = str.substring( 0, str.length-1 );
		console.log( _.fmt( '[%s]  %s', moment().format( 'YYYY-MM-DD hh:mm:ss' ), str ) );
	};

module.exports = _;
