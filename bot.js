const Discordie = require( 'discordie' )
const fs = require( 'fs' )

const settings = require( './settings.js' )
const _ = require( './helper.js' )


const client = new Discordie( { autoReconnect: true } )

const token = settings.get( 'config', 'login_token' )
if ( !token )
{
	const config =
		{
			login_token: '',
			admin_role: 'admin',
			owner_id: '',
			command_prefix: '!',
		}
	settings.save( 'config', config )
	console.log( '\nBot has not been configured.\nPlease edit settings/config.json and restart.' )
	process.exit( 8 )
}
else
	client.connect( { token } )


let initialized = false
client.Dispatcher.on( 'GATEWAY_READY', e =>
	{
		if ( initialized ) return
		initialized = true
		
		_.log( _.fmt( 'logged in as %s#%s <@%s>', client.User.username, client.User.discriminator, client.User.id ) )
		require('./permissions.js').init( client )
		require('./commands.js').init( client )
		require('./plugins.js').load( client )
		_.log( 'bot is ready!' )
		
		if ( fs.existsSync( './crash.log' ) )
		{
			const log = fs.readFileSync( './crash.log', 'utf8' )
			sendOwnerMessage( 'CRASH LOG', log )
			fs.unlinkSync( './crash.log' )
		}
	})

client.Dispatcher.onAny( ( type, e ) =>
	{
		if ( [ 'GATEWAY_RESUMED', 'DISCONNECTED', 'GUILD_UNAVAILABLE', 'GUILD_CREATE', 'GUILD_DELETE' ].includes(type) )
		{
			let message = e.error || e.guildId || ''
			if ( e.guild )
				message = e.guild.id
			return _.log('<' + type + '> ' + message )
		}
	})


function sendOwnerMessage( type, msg )
{
	const owner = client.Users.get( settings.get( 'config', 'owner_id', '' ) )
	if ( owner )
		owner.openDM().then( d => d.sendMessage( `***${type}***\n\`\`\`\n${msg}\n\`\`\`` ) )
	else
		_.log( 'WARNING: no owner to send error log to' )
}

process.on( 'uncaughtException', ( ex ) =>
	{
		sendOwnerMessage( 'uncaughtException', ex.stack )
		console.log( ex.stack )
	})

process.on( 'unhandledRejection', ( reason, p ) =>
	{
		const err = `${p}\n${reason.stack}`
		sendOwnerMessage( 'unhandledRejection', err )
		console.log( err )
	})
