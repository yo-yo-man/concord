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
_.sanesplit = function( str, del, limit )
	{
		var arr = str.split( del );
		var res = arr.splice( 0, limit );
		res.push( arr.join( del ) );
		return res;
	};
_.matches = function( reg, str )
	{
		var matches, output = [];
		while ( matches = reg.exec( str ) )
			output.push( matches[1] );
		return output;
	};
_.parsetime = function( str )
	{
		str = str.replace( / /g, '' );
		
		str = str.replace( /min/g, 'm' );
		str = str.replace( /mins/g, 'm' );
		str = str.replace( /minute/g, 'm' );
		str = str.replace( /minutes/g, 'm' );
		
		str = str.replace( /hr/g, 'h' );
		str = str.replace( /hrs/g, 'h' );
		str = str.replace( /hour/g, 'h' );
		str = str.replace( /hours/g, 'h' );
		
		str = str.replace( /sec/g, 's' );
		str = str.replace( /secs/g, 's' );
		str = str.replace( /second/g, 's' );
		str = str.replace( /seconds/g, 's' );
		
		var time = 0;
		if ( str.match( /(\d+)h/g ) )
			time += parseInt( _.matches( /(\d+)h/g, str )[0] ) * 60 * 60;
		if ( str.match( /(\d+)m/g ) )
			time += parseInt( _.matches( /(\d+)m/g, str )[0] ) * 60;
		if ( str.match( /(\d+)s/g ) )
			time += parseInt( _.matches( /(\d+)s/g, str )[0] );
		
		if ( time == 0 && str.length != 0 )
			time = parseInt( str );
		
		return time;
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
_.nick = function( member, guild )
	{
		if ( guild )
			member = member.memberOf( guild ) || member;
		if ( !member.nick )
			return member.username;
		return member.nick;
	};

module.exports = _;
