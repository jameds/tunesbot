/*
tunesbot Discord Bot,
automatic YouTube playlist updater

Copyright 2021 James R.
All rights reserved.

Redistribution of this source code, with or without
modification, is permitted so long as is preserved: the
above copyright notice, this condition and the following
disclaimer.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND
CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED
WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR
BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
*/

import fs from 'fs';
import nodeCleanup from 'node-cleanup';
import Discord from 'discord.js';
import { loadConfig } from './config.js';
import * as youtube from './youtube.js';

const config = loadConfig('secrets/config.json');

function readFileIfExists (path) {
	try {
		return fs.readFileSync(path);
	} catch (error) {
		if (error.code !== 'ENOENT')
			throw error;
	}
}

var lastMessageId = readFileIfExists(
	'secrets/last-message-id');

var firstMessageId;

const client = new Discord.Client({
	intents: [
		Discord.Intents.FLAGS.GUILDS,
		Discord.Intents.FLAGS.GUILD_MESSAGES
	]
});

console.log('watch ' + config.channel);

client.once('messageCreate', (message) => {
	if (message.channelId === config.channel)
		firstMessageId = message.id;
});

client.on('messageCreate', (message) => {
	if (message.channelId === config.channel)
	{
		lastMessageId = message.id;
		scanMessage(message);
	}
});

client.on('ready', () => {
	console.log('login ' + client.user.id);

	runBacklog(lastMessageId);
});

/* always runs when program ends */
nodeCleanup(() => {
	/* cache last known message id, to resume next time */
	if (lastMessageId)
	{
		fs.writeFileSync('secrets/last-message-id',
			lastMessageId);
	}
});

client.login(config.token);

/* user to send error reports */
function getTechnician (channel) {
	return channel.guild.members
		.fetch(config.technician);
}

async function playlistError (message, request) {
	const reply = await message.reply(`There was an \
error adding \`${request.video}\`, this has been logged
and a DM sent to the technician.`);

	const tech = await getTechnician(message.channel);

	tech.send(reply.url);
}

/* finds the youtube video ids in a discord message and
attempts to add each to the playlist */
function scanMessage (message) {
	const list = youtube.extractVideoIds(message.content);

	youtube.checkDuration(list, config.maxDuration)
		.then(({ short, long }) => {
			if (long.length)
			{
				message.reply(`These videos exceed \
the duration limit: \`${long.join('`, `')}\``);
			}

			short.forEach((video) => youtube
				.appendPlaylist(config.playlist, video));
		})
		.catch((q) => {
			playlistError(message, q);
		});
}

/* scans each message since the last execution */
async function runBacklog (start) {
	const channel = await
		client.channels.fetch(config.channel);

	/* firstMessageId is set for the first message this bot
	sees at present. If one message was sent, there may
	have been more, so just stop there instead of scanning
	any messages twice. */

	const end = firstMessageId || channel.lastMessageId;

	let messages;

	/* if the last message hasn't changed, do nothing */
	if (start != end)
	{
		do {
			messages = await channel.messages.fetch({
				after: start,
				before: end,
			});

			messages.sort((a, b) => a.createdTimestamp -
				b.createdTimestamp).each(scanMessage);

			start = messages.lastKey();
		}
		while (messages.size) ;

		/* update in case no more messages are sent during
		this program's execution */
		if (!firstMessageId)
			lastMessageId = end;
	}
}
