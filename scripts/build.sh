#!/bin/bash
set -euo pipefail
project_dir=$(cd "$(dirname "$0")/.." && pwd)
stone_dir=${STONENOTES_SOURCE:-"$project_dir/../StoneNotes"}
beepster_resources=${BEEPSTER_RESOURCES:-"/Applications/Organik Apps Pebble Connector.app/Contents/Resources/Beepster"}
if [ -n "${BEEPSTER_APP:-}" ]; then beepster_resources="$BEEPSTER_APP/Contents/Resources"; fi
beepster_gateway=${BEEPSTER_GATEWAY_SOURCE:-"$project_dir/../beepster/gateway"}
# All users receive the same app. Tesla visibility is a runtime preference.
app=${ORGANIK_APP_DESTINATION:-"$project_dir/build/Organik Apps Pebble Connector.app"}
bash "$project_dir/scripts/fetch-sparkle.sh"
sparkle="$project_dir/build/dependencies/sparkle"
work_dir=$(mktemp -d -t organik-build)
trap 'rm -rf "$work_dir"' EXIT
architectures=${ORGANIK_ARCHES:-"arm64 x86_64"}
identity=${ORGANIK_SIGNING_IDENTITY:--}
mkdir -p "$project_dir/build"
mkdir -p "$(dirname "$app")"
if [ ! -d "$beepster_resources/gateway" ]; then
  echo 'Set BEEPSTER_RESOURCES to the unified Connector Beepster runtime resources.' >&2
  exit 1
fi
test -f "$beepster_gateway/src/agent-setup.js"
test -f "$beepster_gateway/integrations/hermes/beepster/plugin.yaml"
test -f "$stone_dir/build/StoneNotes.pbw"
python3 "$stone_dir/scripts/package-release.py"
notesy_version=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$stone_dir/package.json")
staged="$work_dir/Organik Apps Pebble Connector.app"
contents="$staged/Contents"
resources="$contents/Resources"
mkdir -p "$contents/MacOS" "$resources/Notesy"
cp "$project_dir/mac/Info.plist" "$contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :NotesyPackageVersion string $notesy_version" "$contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Add :OrganikDistribution string unified' "$contents/Info.plist"
# Production builds supply a hosted appcast and its public signing key together.
python3 "$project_dir/scripts/configure-updates.py" "$contents/Info.plist"
mkdir -p "$contents/Frameworks"
ditto "$sparkle/Sparkle.framework" "$contents/Frameworks/Sparkle.framework"
cp "$sparkle/LICENSE" "$resources/Sparkle-LICENSE.txt"
cp "$project_dir/ACKNOWLEDGMENTS.md" "$resources/ACKNOWLEDGMENTS.md"
cp "$project_dir/LICENSE" "$resources/LICENSE.txt"
cp "$project_dir/PRIVACY.md" "$resources/PRIVACY.md"
cp -R "$beepster_resources" "$resources/Beepster"
# Ship the maintained gateway and agent plugins, not a stale standalone app copy.
rm -rf "$resources/Beepster/gateway"
mkdir -p "$resources/Beepster/gateway"
rsync -a --exclude='node_modules/' --exclude='.DS_Store' --exclude='__pycache__/' --exclude='*.pyc' "$beepster_gateway/" "$resources/Beepster/gateway/"
# Resolve production dependencies from the final gateway lockfile in the staging area.
(cd "$resources/Beepster/gateway" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --cache "$work_dir/npm-cache")
cp "$stone_dir"/gateway/*.js "$resources/Notesy/"
npm ci --prefix "$stone_dir/renderer" --cache "$work_dir/npm-cache" --ignore-scripts --no-audit --no-fund
node "$stone_dir/renderer/build.mjs"
cp -R "$stone_dir/renderer/dist" "$resources/Notesy/renderer"
cp "$stone_dir/dist/Notesy-$notesy_version.pbw" "$resources/Notesy/Notesy.pbw"
cp "$stone_dir/LICENSE" "$resources/Notesy/LICENSE.txt"
cp -R "$stone_dir/resources/fonts/licenses" "$resources/Notesy/Font Licenses"
cp "$project_dir/vendor/Reminderz-LICENSE.txt" "$resources/Reminderz-LICENSE.txt"
swift "$project_dir/scripts/draw-icon.swift" "$work_dir/icon.png"
mkdir -p "$work_dir/Organik.iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$work_dir/icon.png" --out "$work_dir/Organik.iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$work_dir/icon.png" --out "$work_dir/Organik.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$work_dir/Organik.iconset" -o "$resources/Organik.icns"
slices=()
image_slices=()
mkdir -p "$work_dir/source"
cp "$project_dir"/mac/*.swift "$work_dir/source/"
cp "$stone_dir/renderer/ImageHelper.swift" "$work_dir/renderer-helper.swift"
for arch in $architectures; do
  slice="$work_dir/organik-$arch"
  (cd "$work_dir/source" && swiftc -F "$sparkle" -framework Sparkle -Xlinker -rpath -Xlinker @executable_path/../Frameworks -parse-as-library -target "$arch-apple-macosx14.0" -gnone \
    -framework AppKit -framework SwiftUI -framework Foundation -framework Network -framework EventKit -framework Security -framework ServiceManagement -framework CoreImage \
    ./*.swift -o "$slice")
  slices+=("$slice")
  image_slice="$work_dir/notesy-image-$arch"
  (cd "$work_dir" && swiftc -target "$arch-apple-macosx14.0" -gnone -framework AppKit -framework WebKit renderer-helper.swift -o "$image_slice")
  image_slices+=("$image_slice")
done
lipo -create "${image_slices[@]}" -output "$resources/Notesy/renderer/notesy-image-helper"
lipo -create "${slices[@]}" -output "$contents/MacOS/organik-pebble-connector"
python3 "$project_dir/scripts/check-platform.py" "$staged"
python3 "$project_dir/scripts/check-private-data.py" --app "$staged"
sign_args=(--force --options runtime --sign "$identity")
if [ "$identity" != '-' ]; then sign_args+=(--timestamp); fi
# Preserve the runtime entitlements of the previously packaged Beepster helpers.
for binary in "$resources/Beepster"/node-* "$resources/Beepster/beepster-keychain"; do
  codesign "${sign_args[@]}" --preserve-metadata=entitlements "$binary"
done
codesign "${sign_args[@]}" --preserve-metadata=entitlements "$resources/Beepster/Beepster Contacts.app"
codesign "${sign_args[@]}" "$resources/Notesy/renderer/notesy-image-helper"
# Sign Sparkle's nested helpers inside out using this app's identity.
framework="$contents/Frameworks/Sparkle.framework/Versions/B"
for nested in "$framework"/XPCServices/*.xpc "$framework/Updater.app" "$framework/Autoupdate"; do
  codesign "${sign_args[@]}" "$nested"
done
codesign "${sign_args[@]}" "$contents/Frameworks/Sparkle.framework"
codesign "${sign_args[@]}" "$staged"
codesign --verify --deep --strict "$staged"
if [ -d "$app" ]; then mv "$app" "$work_dir/previous.app"; fi
if ! ditto "$staged" "$app"; then
  if [ -d "$work_dir/previous.app" ]; then ditto "$work_dir/previous.app" "$app"; fi
  exit 1
fi
echo "Built $app"
