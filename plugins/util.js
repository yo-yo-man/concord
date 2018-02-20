const commands = require( '../commands.js' )
const permissions = require( '../permissions.js' )
const settings = require( '../settings.js' )
const _ = require( '../helper.js' )

const moment = require( 'moment' )
require( 'moment-duration-format' )

const fetch = require( 'node-fetch' )

const notices = require( './notices.js' )

let reminders = {}
let remindersDirty = false
const reminderDelay = 5 * 1000

function sendReminder( channel, user, rem, uid )
{
	channel.send( _.fmt( '**%s [reminder]** `%s`', user.mention, rem.message ) )
	delete reminders[uid]
}

function updateReminders()
{
	let needsSave = false
	if ( remindersDirty )
	{
		remindersDirty = false
		needsSave = true
	}
	
	for ( const uid in reminders )
	{
		if ( _.time() > reminders[uid].time )
		{
			const rem = reminders[uid]
			const user = client.users.find( 'id', rem.creator )
			
			if ( rem.private )
				user.createDM().then( dm => sendReminder( dm, user, rem, uid ) )
			else
				sendReminder( client.channels.find( 'id', rem.channel ), user, rem, uid )
			
			needsSave = true
		}
	}
	
	if ( needsSave )
		settings.save( 'reminders', reminders )
	
	setTimeout( updateReminders, reminderDelay )
}

commands.register( {
	category: 'util',
	aliases: [ 'remind', 'remindme', 'reminder' ],
	help: 'set a timely reminder',
	args: '[time] [message]',
	callback: ( client, msg, args ) =>
	{
		const prefix = settings.get( 'config', 'command_prefix', '!' )
		if ( msg.author.id in reminders )
		{
			if ( args === 'cancel' )
			{
				delete reminders[msg.author.id]
				msg.channel.send( 'Reminder has been cancelled.' )
				remindersDirty = true
				return
			}
			else
				return msg.channel.send( _.fmt( 'Reminder pending in %s, use `%sreminder cancel` to cancel.', moment.duration( (_.time() - reminders[msg.author.id].time) * 1000 ).humanize(), prefix ) )
		}
		else if ( !args )
			return msg.channel.send( 'I current do not have any reminders set for you.' )
		
		args = _.sanesplit( args, ' ', 1 )
		if ( args.length < 2 )
			return msg.channel.send( '`' + commands.generateHelp( commands.getCMD( 'reminder' ) ) + '`' )
		
		const rem = {}
		rem.time = _.time() + _.parsetime( args[0] )
		rem.creator = msg.author.id
		rem.message = args[1]
		rem.private = msg.channel.isPrivate
		rem.channel = msg.channel.id
		
		reminders[msg.author.id] = rem
		msg.channel.send( _.fmt( 'I will remind you in %s', moment.duration( (_.time() - rem.time) * 1000 ).humanize() ) )
		remindersDirty = true
	} })

commands.register( {
	category: 'util',
	aliases: [ 'migrate' ],
	help: 'move everyone in your channel to another one',
	args: 'channel',
	flags: [ 'admin_only', 'no_pm' ],
	callback: ( client, msg, args ) =>
	{
		const channel = msg.member.getVoiceChannel()
		if ( !channel )
			return msg.channel.send( 'you are not in a voice channel' )
		
		const target = commands.findVoiceChannel( msg, args )
		if ( target === false )
			return
		
		const names = []
		for ( const i in channel.members )
		{
			names.push( '`' + _.nick( channel.members[i] ) + '`' )
			notices.suppressNotice( channel.guild.id, 'VOICE_CHANNEL_LEAVE', channel.members[i].id )
			notices.suppressNotice( channel.guild.id, 'VOICE_CHANNEL_JOIN', channel.members[i].id )
			channel.members[i].setChannel( target )
		}
		
		notices.sendGuildNotice( channel.guild.id, _.fmt( '%s moved to `%s` by `%s`', names.join( ', ' ), target.name, _.nick( msg.member ) ) )
	} })

let twitch = {}
const twitchDelay = 5 * 60 * 1000
let twitch_client_id = ''
function checkTwitch()
{
	if ( twitch_client_id === '' )
		return
	
	const channels = []
	for ( const chan in twitch )
		channels.push( chan )

	const url = `https://api.twitch.tv/kraken/streams?client_id=${ twitch_client_id }&channel=${ channels }`
	fetch( url )
	.then( ( response ) => {
		return response.json()
	}).then( ( json ) => {
		const streaming = {}
		for ( const stream in json.streams )
		{
			const chan = json.streams[ stream ].channel.name
			streaming[ chan ] = true
		}

		for ( const chan in twitch )
		{
			if ( twitch[ chan ].status !== 'live' && streaming[ chan ] )
			{
				twitch[ chan ].status = 'live'
				for ( const sink in twitch[ chan ].sinks )
				{
					const out = client.channels.find( 'id', twitch[ chan ].sinks[ sink ].id )
					out.send( twitch[ chan ].sinks[ sink ].output ).then(
						msg => {
								twitch[ chan ].sinks[ sink ].message = msg.id
							})
				}
			}
			else if ( twitch[ chan ].status === 'live' && !streaming[ chan ] )
			{
				twitch[ chan ].status = 'offline'
				for ( const sink in twitch[ chan ].sinks )
				{
					const message = twitch[ chan ].sinks[ sink ].message
					if ( !message )
						continue

					const out = client.channels.find( 'id', twitch[ chan ].sinks[ sink ].id )
					out.fetchMessage( message ).then( (e) => {
							client.Messages.get( message ).delete()
						}).catch( e => {} )
						
					delete twitch[ chan ].sinks[ sink ].message
				}
			}
		}

		setTimeout( () => { settings.save( 'twitch', twitch ) }, 10 * 1000 )
		setTimeout( checkTwitch, twitchDelay )
	}).catch( e => {
		setTimeout( checkTwitch, twitchDelay )
	})
}

commands.register( {
	category: 'util',
	aliases: [ 'twitch' ],
	help: 'notify when a twitch stream goes live',
	args: '[channel] [mentions]',
	flags: [ 'admin_only', 'no_pm' ],
	callback: ( client, msg, args ) =>
	{
		if ( twitch_client_id === '' )
			return msg.channel.send( 'bot has not been configured for twitch API usage' )

		if ( !args )
		{
			let streams = []
			for ( const chan in twitch )
				for ( const sink in twitch[ chan ].sinks )
					if ( twitch[ chan ].sinks[ sink ].id === msg.channel.id )
						streams.push( chan )

			if ( streams.length === 0 )
				msg.channel.send( 'there are no twitch streams configured for this channel' )
			else
				msg.channel.send( '```' + streams.join( '\n' ) + '```' )
			return
		}
		
		const chan = args.split( ' ' )[0]
		const mentions = args.split( ' ' )[1] || ''
		if ( !twitch[ chan ] )
		{
			const sink = {}
			sink.id = msg.channel.id
			sink.output = '<https://twitch.tv/' + chan + '> is streaming ' + mentions

			twitch[ chan ] = {}
			twitch[ chan ].sinks = []
			twitch[ chan ].sinks.push( sink )

			msg.channel.send( _.fmt( '`%s` twitch notification enabled', chan ) )
		}
		else
		{
			delete twitch[ chan ]
			msg.channel.send( _.fmt( '`%s` twitch notification disabled', chan ) )
		}

		settings.save( 'twitch', twitch )
	} })

var client = null
module.exports.setup = _cl => {
    client = _cl

    reminders = settings.get( 'reminders', null, {} )
    updateReminders()

	twitch_client_id = settings.get( 'config', 'twitch_client_id', '' )
	twitch = settings.get( 'twitch', null, {} )
	checkTwitch()

    _.log( 'loaded plugin: util' )
}
