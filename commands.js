const permissions = require( './permissions.js' )
const settings = require( './settings.js' )
const _ = require( './helper.js' )

const commands = {}

commands.blacklistedUsers = []
commands.tempBlacklist = []
commands.numSinceBoot = 0
commands.commandList = []
commands.register = params => {
    commands.commandList.push( params )
}

commands.getCMD = alias => {
    for ( const i in commands.commandList )
    {
        const cmd = commands.commandList[i]
        if ( cmd.aliases.includes(alias) )
            return cmd
    }
}

commands.generateHelp = cmd => {
    let help = settings.get( 'config', 'command_prefix', '!' )
    for ( const j in cmd.aliases )
    {
        help += cmd.aliases[j]
        if ( j !== cmd.aliases.length - 1 )
            help += '|'
    }
    
    if ( cmd.args )
        help += _.fmt( ' %s', cmd.args )
    
    help += _.fmt( ' - %s', cmd.help )
    
    if ( cmd.flags )
    {
        if ( cmd.flags.includes('owner_only') )
            help += ' (owner-only)'
        else if ( cmd.flags.includes('admin_only') )
            help += ' (admin-only)'
    }
    
    return help
}

commands.findTarget = (msg, str) => {
    const matches = []
    str = str.toLowerCase()
    
    if ( msg.channel.isPrivate )
    {
        client.Users.forEach( ( user ) => {
            if ( user.username.toLowerCase().includes(str) )
                 if ( !matches.includes(user) ) matches.push( user )
            if ( str === user.username.toLowerCase() + '#' + user.discriminator )
                 if ( !matches.includes(user) ) matches.push( user )
        })
    }
    else
    {
        for ( const i in msg.guild.members )
        {
            const user = msg.guild.members[i]
            if ( user.nick && user.nick.toLowerCase().includes(str) )
                 if ( !matches.includes(user) ) matches.push( user )
            if ( user.username.toLowerCase().includes(str) )
                 if ( !matches.includes(user) ) matches.push( user )
            if ( str === user.username.toLowerCase() + '#' + user.discriminator )
                 if ( !matches.includes(user) ) matches.push( user )
        }
    }
    
    if ( matches.length === 0 )
    {
        const reply = _.fmt( 'could not find user matching `%s`', str )
        msg.channel.sendMessage( reply )
        return false
    }
    
    if ( matches.length > 1 )
    {
        let matchesString = ''
        for ( const i in matches )
        {
            const user = matches[i]
            let nick = ''
            if ( user.nick )
                nick = '(' + user.nick + ')'
            matchesString += _.fmt( '%s#%s %s\n', user.username, user.discriminator, nick )
        }
        const reply = _.fmt( 'found %s matches for `%s`:\n```\n%s```', matches.length, str, matchesString )
        msg.channel.sendMessage( reply )
        return false
    }
    
    return matches[0]
}

commands.findVoiceChannel = (msg, str) => {
    const matches = []
    str = str.toLowerCase()
    
    for ( const i in msg.guild.voiceChannels )
    {
        const ch = msg.guild.voiceChannels[i]
        if ( ch.name.toLowerCase().includes(str) )
            if ( !matches.includes(ch) ) matches.push( ch )
    }
    
    if ( matches.length === 0 )
    {
        msg.channel.sendMessage( _.fmt( 'could not find voice channel matching `%s`', str ) )
        return false
    }
    
    if ( matches.length > 1 )
    {
        let matchesString = ''
        for ( const i in matches )
            matchesString += matches[i].name + '\n'
        msg.channel.sendMessage( _.fmt( 'found %s matches for `%s`:\n```\n%s```', matches.length, str, matchesString ) )
        return false
    }
    
    return matches[0]
}

function checkArgs( cmd, message )
{
	message = message || ''
	if ( !cmd.args )
		return true
	
	const msg_args = message.split( ' ' )
	const cmd_args = cmd.args.split( ' ' )
	for ( const i in cmd_args )
	{
		const cmd_arg = cmd_args[i].trim()
		const msg_arg = msg_args[i]
		
		if ( !msg_arg && cmd_arg.indexOf( '[' ) !== 0 )
			return false
		
		if ( cmd_arg.includes('|') )
		{
			const accepted_args = cmd_arg.split( '|' )
			if ( !accepted_args.includes(msg_arg) )
				return false
		}
	}
	
	return true
}

function onMessage( client, e )
{
	if ( commands.blacklistedUsers.includes(e.message.author.id) ) return
	
	const prefix = settings.get( 'config', 'command_prefix', '!' )
	
	let content = e.message.content
	if ( !content.startsWith( prefix ) )
		return
	
	content = content.substring( prefix.length )
	const split = content.split( / (.+)?/ )
	
	const command = split[0]
	let args = split[1]
	
	if ( args )
		args = args.trim()
	
	for ( const i in commands.commandList )
	{
		const cmd = commands.commandList[i]
		
		if ( cmd.aliases.includes(command) )
		{
			require( './plugins/moderation.js' ).processCooldown( e.message.author )
			if ( commands.tempBlacklist.includes(e.message.author.id) ) return
			
			if ( cmd.flags && cmd.flags.includes('no_pm') && e.message.channel.isPrivate )
				return e.message.channel.sendMessage( "can't use this command in private messages" )
			else
				if ( permissions.userHasCommand( e.message.author, cmd ) )
				{
					let guildname = '<pm>'
					if ( e.message.guild )
						guildname = '(' + e.message.guild.name + ')'
					
					// put < > around links so they don't clutter up the owner's crash logs too much
					let fullContent = e.message.content
					fullContent = _.filterlinks( fullContent )
					
					commands.numSinceBoot++
					_.log( _.fmt( '%s#%s in #%s %s: %s', e.message.author.username, e.message.author.discriminator, e.message.channel.name, guildname, fullContent ) )
					
					if ( checkArgs( cmd, args ) )
						return cmd.callback( client, e.message, args )
					else
						return e.message.channel.sendMessage( '```\n' + commands.generateHelp( cmd ) + '\n```' )
				}
				else
					return e.message.channel.sendMessage( 'insufficient permissions' )
		}
	}
}

var client = null
commands.init = _cl => {
    client = _cl
    _cl.Dispatcher.on( 'MESSAGE_CREATE', e => onMessage( _cl, e ) )
    commands.blacklistedUsers = settings.get( 'blacklist', null, [] )
    _.log( 'initialized commands' )
}

module.exports = commands
