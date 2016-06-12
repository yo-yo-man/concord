'use strict';

var commands = require( '../commands.js' );
var permissions = require( '../permissions.js' );
var settings = require( '../settings.js' );
var _ = require( '../helper.js' );

var request = require( 'request' );

function timedMessage( channel, msg, delay )
{
	setTimeout( () => channel.sendMessage( msg ), delay );
}

commands.register( {
	category: 'fun',
	aliases: [ 'roll' ],
	help: 'roll an X sided dice',
	args: '[sides=6]',
	callback: ( client, msg, args ) =>
	{
		var max = args || 6;
		msg.channel.sendMessage( _.fmt( '`%s` rolled a `%s`', msg.author.username, _.rand(1,max) ) );
	}});

commands.register( {
	category: 'fun',
	aliases: [ 'flip' ],
	help: 'flip a coin, decide your fate',
	callback: ( client, msg, args ) =>
	{
		msg.channel.sendMessage( '*flips a coin*' );
		setTimeout( () => msg.channel.sendMessage( 'wait for it...' ), 1.5 * 1000 );
		
		var rand = _.rand( 1, 2 );
		var str = [ 'HEADS!', 'TAILS!' ];
		
		setTimeout( () => msg.channel.sendMessage( str[rand] ), 3 * 1000 );
	}});

var roulette_chamber = 0;
var roulette_bullet = _.rand( 1, 6 );
commands.register( {
	category: 'fun',
	aliases: [ 'roulette' ],
	flags: [ 'no_pm' ],
	help: 'clench your ass cheeks and pull the trigger',
	callback: ( client, msg, args ) =>
	{
		msg.channel.sendMessage( _.fmt( '*`%s` pulls the trigger...*', msg.author.username ) );
		
		roulette_chamber++;
		if ( roulette_chamber >= roulette_bullet )
		{
			roulette_chamber = 0;
			roulette_bullet = _.rand( 1, 6 );
			setTimeout( () => msg.channel.sendMessage( '*BANG!*' ), 2 * 1000 );
		}
		else
			setTimeout( () => msg.channel.sendMessage( '*click.*' ), 2 * 1000 );
	}});

commands.register( {
	category: 'fun',
	aliases: [ 'insult' ],
	help: 'get insulted at how bad these insults are',
	callback: ( client, msg, args ) =>
	{		
		request( 'http://www.insultgenerator.org', function( error, response, body )
			{
				if (!error && response.statusCode == 200)
				{
					var text = _.matches( /<div class="wrap">\s+<br><br>(.+)<\/div>/g, body )[0];
					msg.channel.sendMessage( '```\n' + text + '\n```' );
				}
			});
	}});

commands.register( {
	category: 'fun',
	aliases: [ 'joke' ],
	help: 'provided by your dad, laughter not guaranteed',
	callback: ( client, msg, args ) =>
	{		
		request( 'http://www.jokes2go.com/cgi-bin/includejoke.cgi?type=o', function( error, response, body )
			{
				if (!error && response.statusCode == 200)
				{
					var text = _.matches( /this.document.write\('(.*)'\);/g, body )[0];
					text = text.replace( /\s{2,}/g, '' );
					text = text.replace( /<\s?br\s?\/?>/g, '\n' );
					text = text.replace( /\\/g, '' );
					msg.channel.sendMessage( '```\n' + text + '\n```' );
				}
			});
	}});

commands.register( {
	category: 'fun',
	aliases: [ '8ball' ],
	help: 'ask the magic 8 ball a question',
	args: 'question',
	callback: ( client, msg, args ) =>
	{
		var answers = settings.get( 'fun', '8ball_answers', [ "It is certain", "It is decidedly so", "Without a doubt",
			"Yes, definitely", "You may rely on it", "As I see it, yes", "Most likely", "Outlook good", "Yes", "Signs point to yes",
			"Reply hazy try again", "Ask again later","Better not tell you now", "Cannot predict now","Concentrate and ask again","Don't count on it",
			"My reply is no", "My sources say no", "Outlook not so good", "Very doubtful" ] );
		
		var max = answers.length-1;
		msg.channel.sendMessage( _.fmt( '`%s`', answers[ _.rand(0,max) ] ) );
	}});

var client = null;
module.exports.setup = function( _cl )
	{
		client = _cl;
		console.log( 'fun plugin loaded' );
	};
