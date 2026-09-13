#!/bin/bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
project=${ORGANIK_DEPENDENCY_ROOT:-$root}
baseline=${ORGANIK_RESOURCE_APP:-"/Applications/Organik Apps Pebble Connector.app"}
app="$root/build/Organik Apps Pebble Connector.app"
identity='Developer ID Application: Joshua Bessom (4N9LJD597R)'
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
mkdir -p "$app/Contents/MacOS" "$app/Contents/Frameworks" "$root/build"
ditto "$baseline/Contents/Resources" "$app/Contents/Resources"
resources="$app/Contents/Resources"
rm -rf "$resources/Pome Cameras.app" "$resources/EvenG2/pome"
cp "$root/even-g2/server.mjs" "$resources/EvenG2/server.mjs"
cp "$root/mac/Info.plist" "$app/Contents/Info.plist"
python3 - "$app" <<'PY'
import sys,plistlib,pathlib
p=pathlib.Path(sys.argv[1])/'Contents/Info.plist';d=plistlib.loads(p.read_bytes());d['NotesyPackageVersion']='1.4.8';d.update(CFBundleShortVersionString='1.0.0',CFBundleVersion='96',OrganikDistribution='direct-download',OrganikPomeAvailable=False)
for k in ['OrganikCameraAppGroup','OrganikLocalCameraPreview','NSHomeKitUsageDescription']:d.pop(k,None)
p.write_bytes(plistlib.dumps(d))
PY
sparkle="$project/build/dependencies/sparkle"
ditto "$sparkle/Sparkle.framework" "$app/Contents/Frameworks/Sparkle.framework"
cp "$sparkle/LICENSE" "$resources/Sparkle-LICENSE.txt"
cp "$root/vendor/Notesy-1.4.8.pbw" "$resources/Notesy/Notesy.pbw"
cp "$root/PRIVACY.md" "$resources/PRIVACY.md"
cp "$root/PUBLIC-README.md" "$resources/Read Me.md"
python3 "$root/scripts/check-bundle-executables.py" "$resources/Speech" --repair-fluid-resources
for arch in arm64 x86_64; do
 (cd "$root/mac" && swiftc -D DIRECT_DOWNLOAD -F "$sparkle" -framework Sparkle -Xlinker -rpath -Xlinker @executable_path/../Frameworks -parse-as-library -target "$arch-apple-macosx14.0" -gnone ./*.swift -o "$root/build/main-$arch")
done
lipo -create "$root/build/main-arm64" "$root/build/main-x86_64" -output "$app/Contents/MacOS/organik-pebble-connector"
python3 - "$root/build/node.entitlements" <<'PY'
import sys,plistlib,pathlib
pathlib.Path(sys.argv[1]).write_bytes(plistlib.dumps({'com.apple.security.cs.allow-jit':True}))
PY
for binary in "$resources/Beepster"/node-*; do
 codesign --force --options runtime --timestamp --sign "$identity" --entitlements "$root/build/node.entitlements" "$binary"
done
for binary in "$resources/Beepster/beepster-keychain" "$resources/Beepster/Beepster Contacts.app" "$resources/Notesy/renderer/notesy-image-helper" "$resources/Speech/organik-speech"; do
 codesign --force --options runtime --timestamp --sign "$identity" "$binary"
done
framework="$app/Contents/Frameworks/Sparkle.framework/Versions/B"
for nested in "$framework"/XPCServices/*.xpc "$framework/Updater.app" "$framework/Autoupdate"; do
 codesign --force --options runtime --timestamp --sign "$identity" "$nested"
done
codesign --force --options runtime --timestamp --sign "$identity" "$app/Contents/Frameworks/Sparkle.framework"
codesign --force --options runtime --timestamp --sign "$identity" "$app"
python3 "$root/scripts/check-bundle-executables.py" "$app"
codesign --verify --deep --strict "$app"
