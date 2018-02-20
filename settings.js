const fs = require( 'fs' )
const path = require( 'path' )
const _ = require( './helper.js' )

const settings = {}
const jsonCache = {}

const settingsDir = 'settings'
const normalizedPath = path.join( __dirname, settingsDir )
function makefn( file )
{
	return normalizedPath + '/' + file + '.json'
}

settings.exists = ( file, param ) => fs.existsSync( makefn( file ) )

settings.list = file =>
	{
		if ( !( file in jsonCache ) )
			settings.reload( file )
		
		return Object.keys( jsonCache[file] )
	}

settings.get = ( file, param, def ) =>
	{
		if ( !( file in jsonCache ) )
			settings.reload( file )
		
		let val = jsonCache[file][param]
		if ( !param )
			val = jsonCache[file]
		
		if ( val === null || typeof val === 'undefined' || ( typeof val === 'object' && param === null && Object.getOwnPropertyNames(val).length === 0 ) )
		{
			if ( typeof def !== 'undefined' )
			{
				settings.set( file, param, def )
				val = def
			}
		}

		if ( val === 'true' )
			return true
		if ( val === 'false' )
			return false
		
		return val
	}

settings.set = ( file, param, val ) =>
	{
		if ( param )
			jsonCache[file][param] = val
		else
			jsonCache[file] = val
		
		settings.save( file )
	}

settings.save = (file, json) =>
	{
		if ( typeof json !== 'undefined' )
			jsonCache[file] = json
		
		fs.writeFileSync( makefn( file ), JSON.stringify( jsonCache[file], null, 4 ), 'utf8' )
	}

settings.reload = file =>
	{
		if ( settings.exists( file ) )
		{
			const contents = fs.readFileSync( makefn( file ), 'utf8' )
			if ( _.isjson( contents ) )
				jsonCache[file] = JSON.parse( contents )
			else
				jsonCache[file] = {}
		}
		else
			jsonCache[file] = {}
	}

module.exports = settings
