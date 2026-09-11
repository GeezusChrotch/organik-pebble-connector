#!/bin/bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
resources=${1:?Pass Resources directory}
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
swift build --package-path "$root/speech" -c release --arch arm64 --arch x86_64
bin=$(swift build --package-path "$root/speech" -c release --arch arm64 --arch x86_64 --show-bin-path)
mkdir -p "$resources/Speech"
cp "$bin/organik-speech" "$resources/Speech/organik-speech"
for bundle in "$bin"/*.bundle; do
  [ ! -d "$bundle" ] || ditto "$bundle" "$resources/Speech/$(basename "$bundle")"
done
if [ -f "$resources/Speech/FluidAudio-LICENSE.txt" ]; then chmod u+w "$resources/Speech/FluidAudio-LICENSE.txt"; fi
cp "$root/speech/.build/checkouts/FluidAudio/LICENSE" "$resources/Speech/FluidAudio-LICENSE.txt"
cp "$root/speech/NOTICE.txt" "$resources/Speech/NOTICE.txt"
