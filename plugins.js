const _ = require( './helper.js' )

const plugins = {}

plugins.load = (client, decache) => {
    const pluginDir = './plugins'
    const normalizedPath = require('path').join( __dirname, pluginDir )
    require('fs').readdirSync( normalizedPath ).forEach( ( file ) => {
            const module = pluginDir + '/' + file
            
            const plugin = require( module )
            if ( plugin.setup )
                plugin.setup( client )
        })
    _.log( 'initialized plugins' )
}

module.exports = plugins
