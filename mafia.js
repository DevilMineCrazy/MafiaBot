"use strict";

var config = require('./config.js');
var _ = require('lodash');
var store = require('node-persist');
var Discord = require('discord.js');

// init stuff
store.initSync();
var defaults = {
    channelsActivated: [],
    games: [],
};
_.each(defaults, (val, key) => {
    var objWithDefaults = _.merge({}, {[key]: val}, {[key]: store.getItem(key)});
    store.setItem(key, objWithDefaults[key]);
});
var mafiabot = new Discord.Client();

// utilities
var adminCheck = message => {
    if (config.admins.indexOf(message.author.id) >= 0) {
        return true;
    }
    mafiabot.reply(message, `You must be an admin to perform command *${message.content}*!`);
    return false;
};
var activatedCheck = message => {
    return store.getItem('channelsActivated').indexOf(message.channel.id) >= 0;
}
var printCurrentPlayers = channelId => {
    var currentGames = store.getItem('games');
    var gameInChannel = _.find(currentGames, {channelId: channelId});
    if (gameInChannel) {
        var output = `Currently ${gameInChannel.playerIds.length} players in game hosted by <@${gameInChannel.hostId}>:`;
        for (var i = 0; i < gameInChannel.playerIds.length; i++) {
            output += `\n${i + 1}. <@${gameInChannel.playerIds[i]}>`;
        }
        mafiabot.sendMessage(channelId, output);
        return true;
    }
    return false;
}

// commands
var commandPrefix = '##';
var baseCommands = [
    {
        commands: ['commands', 'help', 'wut'],
        description: 'Show list of commands',
        adminOnly: false,
        activatedOnly: false,
        onMessage: message => {
            var output = `\nType one of the following commands to interact with MafiaBot:`;
            for (var i = 0; i < baseCommands.length; i++) {
                var comm = baseCommands[i];
                output += `\n**${commandPrefix}${comm.commands.join('/')}** - ${comm.description}${comm.adminOnly ? ' - *Admin Only*' : ''}${comm.activatedOnly ? ' - *Activated Channel Only*' : ''}`;
            }
            mafiabot.reply(message, output);
        },
    },
    {
        commands: ['activatemafia'],
        description: 'Activate MafiaBot on this channel',
        adminOnly: true,
        activatedOnly: false,
        onMessage: message => {
            var currentChannels = store.getItem('channelsActivated');
            if (currentChannels.indexOf(message.channel.id) >= 0) {
                mafiabot.reply(message, `MafiaBot is already activated on channel **#${message.channel.name}**! Use *##deactivatemafia* to deactivate MafiaBot on this channel.`);
            } else {
                currentChannels.push(message.channel.id);
                store.setItem('channelsActivated', currentChannels);
                mafiabot.reply(message, `MafiaBot has been activated on channel **#${message.channel.name}**! Use *##creategame* to start playing some mafia!`);
            }
        },
    },
    {
        commands: ['deactivatemafia'],
        description: 'Deactivate MafiaBot on this channel',
        adminOnly: true,
        activatedOnly: false,
        onMessage: message => {
            var currentChannels = store.getItem('channelsActivated');
            if (currentChannels.indexOf(message.channel.id) >= 0) {
                currentChannels.splice(currentChannels.indexOf(message.channel.id), 1);
                store.setItem('channelsActivated', currentChannels);
                mafiabot.reply(message, `MafiaBot has been deactivated on channel **#${message.channel.name}**!`);
            } else {
                mafiabot.reply(message, `MafiaBot is not activate on channel **#${message.channel.name}**! Use *##activatemafia* to activate MafiaBot on this channel.`);
            }
        },
    },
    {
        commands: ['creategame'],
        description: 'Create a game in this channel and become the host',
        adminOnly: false,
        activatedOnly: true,
        onMessage: message => {
            var currentGames = store.getItem('games');
            var gameInChannel = _.find(currentGames, {channelId: message.channel.id});
            if (gameInChannel) {
                mafiabot.reply(message, `A game is already running in channel *#${message.channel.name}* hosted by <@${gameInChannel.hostId}>!`);
            } else {
                gameInChannel = {
                    channelId: message.channel.id,
                    hostId: message.author.id,
                    playerIds: [],
                    started: false,
                    votesToEndGame: [],
                };
                currentGames.push(gameInChannel);
                store.setItem('games', currentGames);
                mafiabot.sendMessage(message.channel, `Starting a game of mafia in channel *#${message.channel.name}* hosted by <@${gameInChannel.hostId}>!`);
            }
        },
    },
    {
        commands: ['endgame'],
        description: 'Current host, admin, or majority of players can end the game in this channel',
        adminOnly: false,
        activatedOnly: true,
        onMessage: message => {
            var currentGames = store.getItem('games');
            var gameInChannel = _.find(currentGames, {channelId: message.channel.id});
            var endGame = becauseOf => {
                _.remove(currentGames, gameInChannel);
                store.setItem('games', currentGames);
                mafiabot.sendMessage(message.channel, `${becauseOf} ended game of mafia in channel *#${message.channel.name}* hosted by <@${gameInChannel.hostId}>! 😥`);
            };
            if (gameInChannel) {
                if (gameInChannel.hostId == message.author.id) {
                    endGame(`Host <@${message.author.id}>`);
                } else if (config.admins.indexOf(message.author.id) >= 0) {
                    endGame(`Admin <@${message.author.id}>`);
                } else if (gameInChannel.playerIds.indexOf(message.author.id) >= 0) {
                    if (gameInChannel.votesToEndGame.indexOf(message.author.id) >= 0) {
                        mafiabot.reply(message, `We already know you want to end the current game hosted by <@${gameInChannel.hostId}>!`);
                    } else {
                        gameInChannel.votesToEndGame.push(message.author.id);
                        store.setItem('games', currentGames);
                        mafiabot.reply(message, `You voted to end the current game hosted by <@${gameInChannel.hostId}>!`);
                        
                        var votesRemaining = Math.ceil(gameInChannel.playerIds.length/2) - gameInChannel.votesToEndGame.length;
                        if (votesRemaining <= 0) {
                            endGame('A majority vote of the players');
                        } else {
                            mafiabot.sendMessage(message.channel, `There are currently ${gameInChannel.votesToEndGame.length} votes to end the current game hosted by <@${gameInChannel.hostId}>. ${votesRemaining} votes remaining!`);
                        }
                    }
                } else {
                    mafiabot.reply(message, `Only admins, hosts, and joined players can end a game!`);
                }
            } else {
                mafiabot.reply(message, `There's no game currently running in channel *#${message.channel.name}*!`);
            }
        },
    },
    {
        commands: ['join', 'in'],
        description: 'Join the game in this channel as a player',
        adminOnly: false,
        activatedOnly: true,
        onMessage: message => {
            var currentGames = store.getItem('games');
            var gameInChannel = _.find(currentGames, {channelId: message.channel.id});
            if (gameInChannel) {
                if (gameInChannel.playerIds.indexOf(message.author.id) >= 0) {
                    mafiabot.reply(message, `You are already in the current game hosted by <@${gameInChannel.hostId}>!`);
                } else {
                    gameInChannel.playerIds.push(message.author.id);
                    store.setItem('games', currentGames);
                    mafiabot.sendMessage(message.channel, `<@${message.author.id}> joined the current game hosted by <@${gameInChannel.hostId}>!`);
                }
                printCurrentPlayers(message.channel.id);
            } else {
                mafiabot.reply(message, `There's no game currently running in channel *#${message.channel.name}*!`);
            }
        },
    },
    {
        commands: ['unjoin', 'out', 'leave'],
        description: 'Leave the game in this channel, if you were joined',
        adminOnly: false,
        activatedOnly: true,
        onMessage: message => {
            var currentGames = store.getItem('games');
            var gameInChannel = _.find(currentGames, {channelId: message.channel.id});
            if (gameInChannel) {
                if (gameInChannel.playerIds.indexOf(message.author.id) >= 0) {
                    _.pull(gameInChannel.playerIds, message.author.id);
                    store.setItem('games', currentGames);
                    mafiabot.sendMessage(message.channel, `<@${message.author.id}> left the current game hosted by <@${gameInChannel.hostId}>!`);
                } else {
                    mafiabot.reply(message, `You are not currently in the current game hosted by <@${gameInChannel.hostId}>!`);
                }
                printCurrentPlayers(message.channel.id);
            } else {
                mafiabot.reply(message, `There's no game currently running in channel *#${message.channel.name}*!`);
            }
        },
    },
    {
        commands: ['NL'],
        description: 'No lynch test',
        adminOnly: false,
        activatedOnly: true,
        onMessage: message => {
            mafiabot.reply(message, "shad sucks lmao");
        },
    },
    {
        commands: ['fool', 'foolmo', 'foolmoron'],
        description: 'No lynch test',
        adminOnly: false,
        activatedOnly: true,
        onMessage: message => {
            mafiabot.reply(message, "yes I agree <@88020438474567680> is the best user");
        },
    },
    {
        commands: ['arg', 'argtest', ''],
        description: 'Arguments test',
        adminOnly: false,
        activatedOnly: true,
        onMessage: (message, args) => {
            mafiabot.reply(message, `Given args: ${args.join(' - ')}`);
        },
    },
];

// set up discord events
mafiabot.on("message", message => {
    var contentLower = message.content.toLowerCase();
    // go through all the base commands and see if any of them have been called
    for (var i = 0; i < baseCommands.length; i++) {
        var comm = baseCommands[i];
        if (contentLower.indexOf(commandPrefix) == 0) {
            var commandMatch = false;
            for (var c = 0; c < comm.commands.length; c++) {
                commandMatch |= contentLower.indexOf(comm.commands[c].toLowerCase()) == commandPrefix.length;
            }
            if (commandMatch) {
                if (!comm.adminOnly || adminCheck(message)) {
                    if (!comm.activatedOnly || activatedCheck(message)) {
                        var args = message.content.split(/[ :]/);
                        comm.onMessage(message, args);
                    }
                }
                break;
            }
        }
    }
});

// login and export after everything is set up
mafiabot.login(config.email, config.password);
module.exports = mafiabot;