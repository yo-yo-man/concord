'use strict';

const util = require( 'util' );

var _ = {};
_.jstr = JSON.stringify;
_.exec = function( str ) { return require('child_process').execSync( str ) };
_.fmt = util.format;
_.isjson = function( str ) { try { JSON.parse( str ); return true; } catch(e) { return false; } };

module.exports = _;
