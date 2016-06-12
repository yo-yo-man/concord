'use strict';

const util = require( 'util' );

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

module.exports = _;
