var respawn = require( 'respawn' );
var _ = require( './helper.js' );

var bot = respawn( ['node', 'bot.js'],
	{
		maxRestarts: -1,
		sleep: 1000
	});

var log = [];
var logSize = 21;
function logData( data )
{
	data = data.toString().replace( /\r/g, '' ).split( '\n' );
	for ( var i in data )
		log.push( data[i] );
	
	while ( log.length > logSize )
		log.shift();
}

bot.on( 'spawn', function()
	{
		_.log( 'spawning bot process...' );
		console.log( '' );
	});

bot.on( 'stdout', function( data )
	{
		process.stdout.write( data );
		logData( data );
	});

bot.on( 'stderr', function( data )
	{
		process.stdout.write( data );
		logData( data );
	});

bot.on( 'exit', function( code )
	{
		if ( code == 8 )
			return process.exit( 0 );
		
		console.log( '' );
		_.log( 'process exited with code ' + code + ', restarting...' );
		if ( code != 0 )
			require('fs').writeFileSync( './crash.log', log.join('\n'), 'utf8' );
		log = [];
	});

bot.start();
