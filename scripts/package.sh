#!/bin/bash
set -euo pipefail
project_dir=$(cd "$(dirname "$0")/.." && pwd)
app=${ORGANIK_APP_DESTINATION:-"$project_dir/build/Organik Apps Pebble Connector.app"}
test -x "$app/Contents/MacOS/organik-pebble-connector"
distribution=$(/usr/libexec/PlistBuddy -c 'Print :OrganikDistribution' "$app/Contents/Info.plist")
if [ "$distribution" != unified ] || [ -e "$app/Contents/Resources/PebClaw" ]; then
  echo 'Packaging refuses legacy, unmarked, or PebClaw-containing builds.' >&2
  exit 1
fi
python3 "$project_dir/scripts/check-platform.py" "$app"
python3 "$project_dir/scripts/check-private-data.py" --app "$app"
codesign --verify --deep --strict "$app"
stage=$(mktemp -d -t organik-package)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$project_dir/dist"
ditto "$app" "$stage/Organik Apps Pebble Connector.app"
ln -s /Applications "$stage/Applications"
cp "$project_dir/PUBLIC-README.md" "$stage/Read Me.md"
cp "$project_dir/PRIVACY.md" "$stage/PRIVACY.md"
cp "$project_dir/LICENSE" "$stage/LICENSE.txt"
cp "$project_dir/ACKNOWLEDGMENTS.md" "$stage/ACKNOWLEDGMENTS.md"
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")
dmg="$project_dir/dist/Organik-Apps-Pebble-Connector-$version.dmg"
hdiutil create -quiet -volname 'Organik Apps Pebble Connector' -srcfolder "$stage" -ov -format UDZO "$dmg"
identity=${ORGANIK_SIGNING_IDENTITY:-$(codesign -dvv "$app" 2>&1 | sed -n 's/^Authority=//p' | head -1)}
if [ -n "$identity" ] && [ "$identity" != '-' ]; then
  codesign --force --timestamp --sign "$identity" "$dmg"
fi
notesy_version=$(/usr/libexec/PlistBuddy -c 'Print :NotesyPackageVersion' "$app/Contents/Info.plist")
cp "$app/Contents/Resources/Notesy/Notesy.pbw" "$project_dir/dist/Notesy-$notesy_version.pbw"
if [ -n "${ORGANIK_NOTARY_PROFILE:-}" ]; then
  xcrun notarytool submit "$dmg" --keychain-profile "$ORGANIK_NOTARY_PROFILE" --wait
  xcrun stapler staple "$dmg"
  xcrun stapler validate "$dmg"
fi
(cd "$project_dir/dist" && shasum -a 256 "Organik-Apps-Pebble-Connector-$version.dmg" "Notesy-$notesy_version.pbw" > SHA256SUMS)
echo "$dmg"
