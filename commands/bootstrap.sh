#!/bin/sh
[ "$1" ] || { >&2 echo "$0 application-id"; exit 1; }
cd "$(dirname "$0")"
set -e; for file in *.json; do
	./register.sh "$1" < "$file"
done
