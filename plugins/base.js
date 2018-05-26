let client = null

const commands = require( '../commands.js' )
const permissions = require( '../permissions.js' )
const settings = require( '../settings.js' )
const _ = require( '../helper.js' )

const request = require( 'request' )
const fs = require( 'fs' )

commands.register( {
	category: 'base',
	aliases: [ 'eval', 'ev' ],
	help: 'eval some code',
	flags: [ 'owner_only' ],
	args: 'code*',
	callback: ( client, msg, args ) =>
	{
		let res = ''
		try
		{
			res = eval( args )
		}
		catch ( e )
		{
			res = e
		}
		
		if ( typeof res === 'undefined' )
			res = 'undefined'
		
		res = res.toString()
		if ( res.indexOf( '\n' ) !== -1 )
			res = '```\n' + res + '\n```'
		else
			res = '`' + res + '`'
		msg.channel.send( res )
	} })

commands.register( {
	category: 'base',
	aliases: [ 'setting', 'settings' ],
	help: 'view or change settings',
	flags: [ 'owner_only' ],
	args: 'file [param] [value]',
	callback: ( client, msg, args ) =>
	{
		const split = args.split( ' ' )
		const file = split[0]
		const param = split[1]
		const newVal = split[2]

		if ( typeof param === 'undefined' )
			return msg.channel.send( '```' + _.wrap( settings.list( file ), ', ', 3 ) + '```' )
		
		if ( typeof newVal !== 'undefined' )
			settings.set( file, param, newVal )
		
		let val = settings.get( file, param )
		if ( typeof val === 'undefined' )
			val = 'undefined'
		
		if ( val.toString().indexOf( '\n' ) !== -1 )
			val = '```\n' + val + '\n```'
		else
			val = '`' + val + '`'
		msg.channel.send( val )
	} })

commands.register( {
	category: 'base',
	aliases: [ 'blacklist' ],
	help: 'blacklist a user from bot commands',
	flags: [ 'owner_only' ],
	args: '[target] [silent]',
	callback: ( client, msg, args ) =>
	{
		if ( !args )
		{
			const list = []
			for ( const i in commands.blacklistedUsers )
			{
				const u = client.users.get( commands.blacklistedUsers[i] )
				if ( !u ) continue
				list.push( _.fmt( '%s#%s', u.username, u.discriminator ) )
			}
			for ( const i in commands.tempBlacklist )
			{
				const u = client.users.get( commands.tempBlacklist[i] )
				if ( !u ) continue
				list.push( _.fmt( '%s#%s (temp)', u.username, u.discriminator ) )
			}
			return msg.channel.send( _.fmt( 'blacklisted users:\n```%s```', list.join( ', ' ).replace( /((?:[^, ]*, ){3})/g, '$1\n' ) || 'none' ) )
		}
		
		const split = args.split( ' ' )
		const target = commands.findTarget( msg, split[0] )
		if ( target === false )
			return
		
		if ( commands.blacklistedUsers.indexOf( target.id ) !== -1 )
		{
			const index = commands.blacklistedUsers.indexOf( target.id )
			commands.blacklistedUsers.splice( index, 1 )
			settings.save( 'blacklist', commands.blacklistedUsers )
			
			return msg.channel.send( _.fmt( 'removed `%s` from blacklist', _.nick( target, msg.guild ) ) )
		}
		
		commands.blacklistedUsers.push( target.id )
		settings.save( 'blacklist', commands.blacklistedUsers )
		msg.channel.send( _.fmt( '`%s` added to blacklist %s', _.nick( target, msg.guild ), split[1] ? '(silently)' : '' ) )
		
		if ( !split[1] )
			target.createDM().then( dm => dm.send( _.fmt( '**NOTICE:** You have been blacklisted, and will no longer be able to use bot commands' ) ) )
	} })

commands.register( {
	category: 'base',
	aliases: [ 'avatar' ],
	help: 'change bot avatar',
	flags: [ 'owner_only' ],
	args: 'file',
	callback: ( client, msg, args ) =>
	{
		request( { url: args, encoding: 'binary' }, ( error, response, body ) =>
			{
				if ( !error && response.statusCode === 200 )
				{
					const tmp = 'temp/avatar.png'
					fs.writeFileSync( tmp, body, 'binary' )
					client.user.setAvatar( fs.readFileSync( tmp ) )
					fs.unlinkSync( tmp )
				}
			})
	} })

commands.register( {
	category: 'base',
	aliases: [ 'activity' ],
	help: 'change bot activity',
	flags: [ 'owner_only' ],
	args: 'target message',
	callback: ( client, msg, args ) =>
	{
		const split = _.sanesplit( args, ' ', 1 )
		let target = split[0]
		let message = split[1]

		target = commands.findTarget( msg, target )
		if ( !target )
			return
		
		let bot = false
		const botList = require('./audio.js').audioBots
		for ( const c of botList )
			if ( c.user.id === target.id )
			{
				bot = c
				break
			}
		
		if ( !bot )
			return msg.channel.send( 'Target is not a bot under our control' )
		
		const match = message.toLowerCase().match( /(playing|listening to) (.*)/ )
		if ( !match )
			return msg.channel.send( 'Invalid activity type (must be "playing" or "listening to")' )
		
		let typeNum = ''
		if ( match[1] === 'playing' )
			typeNum = 0
		else if ( match[1] === 'listening to' )
			typeNum = 2

		message = match[2]

		if ( !message )
			return msg.channel.send( 'No message could be parsed from input string' )

		bot.user.setActivity( message, { type: typeNum } )
		settings.set( 'botactivity', target.id, { message: message, type: typeNum } )
		settings.save( 'botactivity' )
	} })

commands.register( {
	category: 'base',
	aliases: [ 'help' ],
	help: 'display help menu, optionally for a specific command',
	args: '[command]',
	callback: ( client, msg, args ) =>
	{
		const author = msg.author
		let help = ''
		
		if ( args )
		{
			help = 'command not found'
			for ( const cmd of commands.commandList )
			{
				if ( cmd.aliases.indexOf( args ) !== -1 )
				{
					if ( !permissions.userHasCommand( author, cmd ) || !cmd.help )
						continue
					
					help = commands.generateHelp( cmd )
					break
				}
			}
			msg.channel.send( _.fmt( '```\n%s\n```', help ) )
		}
		else
		{
			function flushHelp( help )
			{
				author.createDM().then( d => d.send( _.fmt( '```\n%s\n```', help ) ) )
			}
			
			help = 'powered by concord <http://github.com/DougTy/concord>\n'
			
			let lastCat = ''
			for ( const i in commands.commandList )
			{
				const cmd = commands.commandList[i]
				
				if ( !permissions.userHasCommand( author, cmd ) || !cmd.help )
					continue
				
				if ( cmd.category !== lastCat )
				{
					lastCat = cmd.category
					if ( help.length >= 1500 )
					{
						flushHelp( help )
						help = ''
					}
					help += _.fmt( '\n--- %s ---\n', cmd.category )
				}
				
				help += commands.generateHelp( cmd )
				
				if ( i !== commands.commandList.length - 1 )
					help += '\n'
			}
			
			flushHelp( help )
		}
	} })

module.exports.setup = _cl => {
	client = _cl
	_.log( 'loaded plugin: base' )
}
