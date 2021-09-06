#!/bin/sh
cd "$(dirname "$0")"
npm install
exec node --trace-warnings bot.js
