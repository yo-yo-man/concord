const commands = require( '../commands.js' )
const permissions = require( '../permissions.js' )
const settings = require( '../settings.js' )
const _ = require( '../helper.js' )

const request = require( 'request' )

function timedMessage( channel, msg, delay )
{
	setTimeout( () => channel.send( msg ), delay )
}

commands.register( {
	category: 'fun',
	aliases: [ 'roll' ],
	flags: [ 'no_pm' ],
	help: 'roll an X sided dice',
	args: '[sides=6]',
	callback: ( client, msg, args ) =>
	{
		if ( isNaN( args ) )
			return msg.channel.send( `\`${ args }\` is not a number` )

		const max = parseInt( args ) || 6
		msg.channel.send( _.fmt( '`%s` rolled a `%s`', _.nick( msg.member, msg.guild ), _.rand( 1, max ) ) )
	} })

commands.register( {
	category: 'fun',
	aliases: [ 'flip' ],
	help: 'flip a coin, decide your fate',
	callback: ( client, msg, args ) =>
	{
		msg.channel.send( '*flips a coin*' )
		timedMessage( msg.channel, 'wait for it...', 1.5 * 1000 )
		
		const rand = _.rand( 0, 1 )
		const str = [ 'HEADS!', 'TAILS!' ]
		
		timedMessage( msg.channel, str[rand], 3 * 1000 )
	} })

const rouletteCache = {}
commands.register( {
	category: 'fun',
	aliases: [ 'roulette' ],
	flags: [ 'no_pm' ],
	help: 'clench your ass cheeks and pull the trigger',
	callback: ( client, msg, args ) =>
	{
		msg.channel.send( _.fmt( '*`%s` pulls the trigger...*', _.nick( msg.member, msg.guild ) ) )
		
		const guildId = msg.guild.id
		if ( !rouletteCache[ guildId ] )
		{
			rouletteCache[ guildId ] = {}
			rouletteCache[ guildId ].chamber = 0
			rouletteCache[ guildId ].bullet = _.rand( 1, 6 )
		}
		
		rouletteCache[ guildId ].chamber++
		if ( rouletteCache[ guildId ].chamber >= rouletteCache[ guildId ].bullet )
		{
			rouletteCache[ guildId ].chamber = 0
			rouletteCache[ guildId ].bullet = _.rand( 1, 6 )
			timedMessage( msg.channel, '*BANG!*', 2 * 1000 )
		}
		else
			timedMessage( msg.channel, '*click.*', 2 * 1000 )
	} })

commands.register( {
	category: 'fun',
	aliases: [ 'joke' ],
	help: 'provided by your dad, laughter not guaranteed',
	callback: ( client, msg, args ) =>
	{
		request( 'http://www.jokes2go.com/cgi-bin/includejoke.cgi?type=o', ( error, response, body ) =>
			{
				if ( !error && response.statusCode === 200 )
				{
					let text = _.matches( /this.document.write\('(.*)'\);/g, body )[0]
					text = text.replace( /\s{2,}/g, '' )
					text = text.replace( /<\s?br\s?\/?>/g, '\n' )
					text = text.replace( /\\/g, '' )
					msg.channel.send( '```\n' + text + '\n```' )
				}
			})
	} })

commands.register( {
	category: 'fun',
	aliases: [ '8ball' ],
	help: 'ask the magic 8 ball a question',
	args: 'question',
	callback: ( client, msg, args ) =>
	{
		const answers = settings.get( 'fun', '8ball_answers', [ 'It is certain', 'It is decidedly so', 'Without a doubt',
			'Yes, definitely', 'You may rely on it', 'As I see it, yes', 'Most likely', 'Outlook good', 'Yes', 'Signs point to yes',
			'Reply hazy try again', 'Ask again later', 'Better not tell you now', 'Cannot predict now', 'Concentrate and ask again', "Don't count on it",
			'My reply is no', 'My sources say no', 'Outlook not so good', 'Very doubtful' ] )
		
		const max = answers.length - 1
		msg.channel.send( _.fmt( '`%s`', answers[ _.rand( 0, max ) ] ) )
	} })

let client = null
module.exports.setup = _cl => {
    client = _cl
    _.log( 'loaded plugin: fun' )
}
