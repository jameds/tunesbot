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
import { google } from 'googleapis';
import PQueue from 'p-queue';
import duration from 'iso8601-duration';
import { loadConfig } from './config.js';

const youtube = google.youtube('v3');
const queue = new PQueue({ concurrency: 1 });
const fastQueue = new PQueue();

const creds = loadConfig('secrets/client_secret.json');
const saved_tokens = loadConfig('secrets/token.json');

const oauth2Client = new google.auth.OAuth2(
	creds.installed.client_id,
	creds.installed.client_secret
);

/* When the access token expires (frequently), a new token
is obtained by way of the refresh token. Save the new
token. */

oauth2Client.on('tokens', (tokens) => {
	console.log('new token');

	fs.writeFileSync('secrets/token.json', JSON
		.stringify(Object.assign(saved_tokens, tokens)));
});

oauth2Client.setCredentials(saved_tokens);

function err (error, request) {
	if ('errors' in error &&
		error.errors[0].reason === 'quotaExceeded')
	{
		queue.pause();
		fastQueue.pause();

		/* quota lifts at midnight Pacific Time */
		const midnight = new Date();
		const delay = (midnight
			.setUTCHours(8, 0, 0, 0) - Date.now());

		setTimeout(() => {
			queue.start();
			fastQueue.start();
		}, delay);

		request.delay = Math.trunc(delay / 60000);

		console.log('Pausing until ' + midnight);
	}
	else
		console.error(error);

	throw request;
}

async function playlistCount (playlist, video) {
	const res = await fastQueue.add(() =>
		youtube.playlistItems.list({
			auth: oauth2Client,
			part: 'id',
			playlistId: playlist,
			videoId: video,
		}));

	return res.data.pageInfo.totalResults;
}

export async function
appendPlaylist (playlist, video) {
	try {
		if (await playlistCount(playlist, video))
		{
			console.log(`ignored duplicate \
${video} in playlist ${playlist}`);
		}
		else
		{
			/* Make insert requests in serial since it is
			a request to change something on Google's
			servers.  Evidently if these calls (presumably on
			the same resource) overlap, then Google just
			returns 500. */

			const res = await queue.add(() =>
				youtube.playlistItems.insert({
					auth: oauth2Client,
					part: 'snippet',
					requestBody: {
						snippet: {
							playlistId: playlist,
							resourceId: {
								kind: 'youtube#video',
								videoId: video,
							},
						},
					},
				}));

			console.log(`${video} is position \
#${res.data.snippet.position} in playlist ${playlist}`);
		}
	}
	catch (error) {
		/* 404 means video id is invalid. That would be
		obvious to Discord users, since there would probably
		not be an embed. */

		if (error.code !== 404)
		{
			err(error, {
				playlist: playlist,
				video: video
			});
		}
	}
};

export async function
checkDuration (videos, maxDuration) {
	if (!videos.length || maxDuration === undefined)
		return { short: videos, long: [] };
	else
	{
		try {
			const res = await fastQueue.add(() =>
				youtube.videos.list({
					auth: oauth2Client,
					part: 'contentDetails',
					id: videos.join(),
				}));

			/* construct an array of each video resource with
			a longer duration than maxDuration */
			const long = res.data.items.filter((part) =>
				duration.toSeconds(duration.parse(part
					.contentDetails.duration)) > maxDuration)
					.map((part) => part.id);

			return { short: videos.filter((video) =>
				!long.includes(video)), long };
		}
		catch (error) {
			err(error, {
				video: videos
			});
		}
	}
}

/*
https://www.youtube.com/?watch?v=Ab_9-
https://music.youtube.com/?watch?v=Ab_9-
https://youtu.be/Ab_9-
*/
const re = /\bhttps:\/{2}(?:[\w.]*(?<!\w)youtube\.com\/\S*?\bv=|youtu\.be\/)([\w-]+)\b/g

export function extractVideoIds (s) {
	return Array.from(s.matchAll(re), m => m[1]);
};
