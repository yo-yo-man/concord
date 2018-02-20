const settings = require( './settings.js' )
const _ = require( './helper.js' )

const permissions = {}

permissions.hasGlobalRole = ( user, roleName ) =>
	{
		let found = false
		client.guilds.forEach( guild =>
			{
				if ( found )
					return
				
				const member = 	guild.members.find( 'id', user.id )
				if ( !member )
					return
				
				if ( member.roles.find( 'name', roleName ) )
					found = true
			})
		return found
	}

permissions.hasAdmin = user =>
	{
		const adminrole = settings.get( 'config', 'admin_role', 'admin' )
		if ( permissions.hasGlobalRole( user, adminrole ) || permissions.isOwner( user ) )
			return true
		return false
	}

permissions.isOwner = user =>
	{
		const ownerid = settings.get( 'config', 'owner_id', '' )
		if ( user.id === ownerid )
			return true
		return false
	}

permissions.userHasCommand = ( user, command ) =>
	{
		if ( !command.flags )
			return true
		
		if ( command.flags.length === 1 && command.flags.indexOf( 'no_pm' ) !== -1 )
			return true
		
		if ( command.flags.indexOf( 'owner_only' ) !== -1 && permissions.isOwner( user ) )
			return true
		
		if ( command.flags.indexOf( 'admin_only' ) !== -1 && permissions.hasAdmin( user ) )
			return true
		
		return false
	}

var client = null
permissions.init = _cl =>
	{
		client = _cl
		_.log( 'initialized permissions' )
	}

module.exports = permissions
