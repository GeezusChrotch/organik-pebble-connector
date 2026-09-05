#!/bin/bash
set -euo pipefail
project_dir=$(cd "$(dirname "$0")/.." && pwd)
deps="$project_dir/build/dependencies"
archive="$deps/Sparkle-2.9.6.tar.xz"
checksum=52bf9e88cdd972fc0c81501377a880e90d47031bd8ca5462488f843e2609e192
mkdir -p "$deps"
if [ ! -f "$archive" ]; then
  curl --fail --location --silent --show-error --proto '=https' --tlsv1.2 \
    https://github.com/sparkle-project/Sparkle/releases/download/2.9.6/Sparkle-2.9.6.tar.xz -o "$archive.download"
  mv "$archive.download" "$archive"
fi
actual=$(shasum -a 256 "$archive" | cut -d ' ' -f 1)
if [ "$actual" != "$checksum" ]; then echo 'Sparkle archive checksum mismatch.' >&2; exit 1; fi
mkdir -p "$deps/sparkle"
tar -xf "$archive" -C "$deps/sparkle"
