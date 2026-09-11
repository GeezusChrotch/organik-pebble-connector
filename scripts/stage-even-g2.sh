#!/bin/bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
resources=${1:?Pass the destination Resources directory}
cache=$(mktemp -d -t organik-even-npm)
trap 'rm -rf "$cache"' EXIT
npm ci --prefix "$root/even-g2/pome" --ignore-scripts --no-audit --no-fund --cache "$cache"
npm run build --prefix "$root/even-g2/pome"
mkdir -p "$resources/EvenG2/pome"
cp "$root/even-g2/server.mjs" "$resources/EvenG2/server.mjs"
# Stage only runtime assets. No node_modules, settings or test fixtures.
rm -rf "$resources/EvenG2/pome/dist"
cp -R "$root/even-g2/pome/dist" "$resources/EvenG2/pome/dist"

cp "$root/even-g2/local-speech.mjs" "$resources/EvenG2/local-speech.mjs"
bash "$root/scripts/stage-speech.sh" "$resources"
