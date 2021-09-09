import fs from 'fs';

export function loadConfig (path) {
	return JSON.parse(fs.readFileSync(path));
}
