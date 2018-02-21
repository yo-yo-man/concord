const _ = require( './helper.js' )

const path = require( 'path' )
const fs = require( 'fs' )

const plugins = {}

plugins.load = ( client, decache ) =>
	{
		const pluginDir = './plugins'
		const normalizedPath = path.join( __dirname, pluginDir )
		fs.readdirSync( normalizedPath ).forEach( file =>
			{
				const ext = path.extname( file )
				if ( ext !== '.js' )
					return

				const module = pluginDir + '/' + file
				
				const plugin = require( module )
				if ( plugin.setup )
					plugin.setup( client )
			})
		_.log( 'initialized plugins' )
	}

module.exports = plugins
