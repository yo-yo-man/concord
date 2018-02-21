const Discord = require( 'discord.js' )
const fs = require( 'fs' )

const settings = require( './settings.js' )
const _ = require( './helper.js' )


const client = new Discord.Client()

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
	client.login( token )
		.catch( e => 
		{
			_.log( e )
		})


let initialized = false
client.on( 'ready', e =>
	{
		if ( initialized ) return
		initialized = true
		
		_.log( `logged in as ${ client.user.tag }`)
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

client.on( 'disconnected', e => _.logEvent( 'disconnected', e ) )
client.on( 'guildCreate', e => _.logEvent( 'guildCreate', e ) )
client.on( 'guildDelete', e => _.logEvent( 'guildDelete', e ) )
client.on( 'guildUnavailable', e => _.logEvent( 'guildUnavailable', e ) )


function sendOwnerMessage( type, msg )
{
	const owner = client.users.find( 'id', settings.get( 'config', 'owner_id', '' ) )
	if ( owner )
		owner.createDM().then( d => d.send( `***${type}***\n\`\`\`\n${msg}\n\`\`\`` ) )
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
