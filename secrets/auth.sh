#!/bin/sh
tty="$(tty)"
sel='.installed | .client_id, .client_secret'
set -- $(jq -r "$sel" client_secret.json)
uri='urn:ietf:wg:oauth:2.0:oob'
chs='A-Za-z0-9-._~'
ver="$(tr -cd "$chs" < /dev/urandom | head -c 128)"
cat <<EOF
https://accounts.google.com/o/oauth2/v2/auth\
?client_id=$1&redirect_uri=$uri&response_type=code\
&code_challenge_method=plain&code_challenge=$ver\
&scope=https://www.googleapis.com/auth/youtube
EOF
printf '%s' $'\033[7mPaste authorization token:\033[0m '
{ curl -sS -H 'Content-Type: application/json' -d @- \
	'https://oauth2.googleapis.com/token' > token.json;
} <<EOF
{"client_id":"$1","client_secret":"$2",\
"code":"$(head -n 1)","code_verifier":"$ver",\
"grant_type":"authorization_code","redirect_uri":"$uri"}
EOF
