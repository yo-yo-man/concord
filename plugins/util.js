const commands = require( '../commands.js' )
const permissions = require( '../permissions.js' )
const settings = require( '../settings.js' )
const _ = require( '../helper.js' )

const moment = require( 'moment' )
require( 'moment-duration-format' )

const notices = require( './notices.js' )

let reminders = {}
let remindersDirty = false
const reminderDelay = 5 * 1000

function sendReminder( channel, user, rem, uid )
{
	channel.sendMessage( _.fmt( '**%s [reminder]** `%s`', user.mention, rem.message ) )
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
			const user = client.Users.get( rem.creator )
			
			if ( rem.private )
				user.openDM().then( dm => sendReminder( dm, user, rem, uid ) )
			else
				sendReminder( client.Channels.get( rem.channel ), user, rem, uid )
			
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
				msg.channel.sendMessage( 'Reminder has been cancelled.' )
				remindersDirty = true
				return
			}
			else
				return msg.channel.sendMessage( _.fmt( 'Reminder pending in %s, use `%sreminder cancel` to cancel.', moment.duration( (_.time() - reminders[msg.author.id].time) * 1000 ).humanize(), prefix ) )
		}
		else if ( !args )
			return msg.channel.sendMessage( 'I current do not have any reminders set for you.' )
		
		args = _.sanesplit( args, ' ', 1 )
		if ( args.length < 2 )
			return msg.channel.sendMessage( '`' + commands.generateHelp( commands.getCMD( 'reminder' ) ) + '`' )
		
		const rem = {}
		rem.time = _.time() + _.parsetime( args[0] )
		rem.creator = msg.author.id
		rem.message = args[1]
		rem.private = msg.channel.isPrivate
		rem.channel = msg.channel.id
		
		reminders[msg.author.id] = rem
		msg.channel.sendMessage( _.fmt( 'I will remind you in %s', moment.duration( (_.time() - rem.time) * 1000 ).humanize() ) )
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
			return msg.channel.sendMessage( 'you are not in a voice channel' )
		
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

var client = null
module.exports.setup = _cl => {
    client = _cl
    reminders = settings.get( 'reminders', null, {} )
    updateReminders()
    _.log( 'loaded plugin: util' )
}
