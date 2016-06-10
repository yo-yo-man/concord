'use strict';

const util = require( 'util' );

var _ = {};
_.jstr = JSON.stringify;
_.exec = function( str ) { return require('child_process').execSync( str ) };
_.fmt = util.format;
_.isjson = function( str ) { try { JSON.parse( str ); return true; } catch(e) { return false; } };

_.time = function() { return Math.floor( Date.now() / 1000 ); };
_.prettytime = function( date )
	{ 
		if ( date )
			date = new Date( date )
		else
			date = new Date();
		return _.fmt( '%s-%s-%s %s:%s:%s',
			date.getFullYear(),
			_.pad( date.getMonth()+1, 2 ),
			_.pad( date.getDate(), 2 ),
			_.pad( date.getHours(), 2 ),
			_.pad( date.getMinutes(), 2 ),
			_.pad( date.getSeconds(), 2 ) );
	};
_.prettydate = function( d )
	{
		if ( d == 0 )
			return 'never';
		var s = _.time() - d;
		var day = 86400;
		if ( s > day * 1 )
			return round( s / day ) + ' days ago'
		else if ( s <= 70 )
			return 'just now'
		else if ( s < 120 )
			return '1 minute ago'
		else if ( s < 3600 )
			return round( s / 60 ) + ' minutes ago'
		else if ( s < 7200 )
			return '1 hour ago'
		else
			return round( s / 3600 ) + ' hours ago'
	};
_.pad = function( num, size )
	{
	    var s = num.toString();
	    while ( s.length < size )
	    	s = "0" + s;
	    return s;
	};

module.exports = _;
