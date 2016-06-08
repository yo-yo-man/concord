var permissions = require( './permissions.js' );

var commands = {};
commands.commandList = [];
commands.register = function( params )
	{
		commands.commandList.push( params );
	}
module.exports = commands;
