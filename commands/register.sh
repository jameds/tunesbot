#!/bin/sh
[ "$1" ] || {
	>&2 echo "$0 application-id < command.json"; exit 1
}
token="$(jq -r '.token' ../secrets/config.json)"
curl -H 'Content-Type: application/json' \
	-H "Authorization: Bot $token" -d @- \
	"https://discord.com/api/v9/applications/$1/commands"
