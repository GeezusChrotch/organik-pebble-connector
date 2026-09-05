#!/bin/bash
set -euo pipefail
project_dir=$(cd "$(dirname "$0")/.." && pwd)
source_app="$project_dir/build/Organik Apps Pebble Connector.app"
preview="$project_dir/build/Preview/Organik Connector Preview.app"
python3 "$project_dir/scripts/check-platform.py" "$source_app"
# Reuse the validated executable; never compile previews with Swift's implicit OS target.
mkdir -p "$(dirname "$preview")"
ditto "$source_app" "$preview"
/usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier org.organikapps.connectorpreview' "$preview/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleName Organik Connector Preview' "$preview/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName Organik Connector Preview' "$preview/Contents/Info.plist"
identity=${ORGANIK_SIGNING_IDENTITY:-$(codesign -dvv "$source_app" 2>&1 | sed -n 's/^Authority=//p' | head -1)}
codesign --force --deep --options runtime --sign "${identity:--}" "$preview"
python3 "$project_dir/scripts/check-platform.py" "$preview"
codesign --verify --deep --strict "$preview"
echo "Prepared isolated preview: $preview"
