#!/bin/bash
set -euo pipefail
project_dir=$(cd "$(dirname "$0")/.." && pwd)
app=${ORGANIK_APP_DESTINATION:-"$project_dir/build/Organik Apps Pebble Connector.app"}
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")
dmg="$project_dir/dist/Organik-Apps-Pebble-Connector-$version.dmg"
test -f "$dmg"
# Run after final signing/notarization: Sparkle signatures cover the exact archive bytes.
bash "$project_dir/scripts/fetch-sparkle.sh"
key=$(/usr/libexec/PlistBuddy -c 'Print :SUPublicEDKey' "$app/Contents/Info.plist")
signer_key=$("$project_dir/build/dependencies/sparkle/bin/generate_keys" --account org.organikapps.pebbleconnector -p)
if [ "$key" != "$signer_key" ]; then echo 'Signing key does not match the bundled update key.' >&2; exit 1; fi
stage=$(mktemp -d -t organik-appcast)
trap 'rm -rf "$stage"' EXIT
cp "$dmg" "$stage/"
"$project_dir/build/dependencies/sparkle/bin/generate_appcast" \
  --account org.organikapps.pebbleconnector \
  --download-url-prefix "${ORGANIK_RELEASE_URL_PREFIX:-https://github.com/GeezusChrotch/organik-pebble-connector/releases/download/v$version/}" \
  "$stage"
swift "$project_dir/scripts/verify-appcast.swift" "$stage/appcast.xml" "$dmg" "$app/Contents/Info.plist"
cp "$stage/appcast.xml" "$project_dir/dist/appcast.xml"
notesy_version=$(/usr/libexec/PlistBuddy -c 'Print :NotesyPackageVersion' "$app/Contents/Info.plist")
(cd "$project_dir/dist" && shasum -a 256 "Organik-Apps-Pebble-Connector-$version.dmg" "Notesy-$notesy_version.pbw" appcast.xml > SHA256SUMS)
echo "Prepared $project_dir/dist/appcast.xml (not published)."
