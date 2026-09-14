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
# Use the explicitly staged G2 candidate, not assets inherited from the installed app.
rm -rf "$resources/EvenG2/beepster/dist"
ditto "$root/cloud/Resources/EvenG2/beepster/dist" "$resources/EvenG2/beepster/dist"
for source in beeper-client.js contact-resolver.js; do
 cp "$root/cloud/Resources/Beepster/gateway/src/$source" "$resources/Beepster/gateway/src/$source"
done
rm -rf "$resources/Pome Cameras.app" "$resources/EvenG2/pome"
python3 - "$root/even-g2/server.mjs" "$resources/EvenG2/server.mjs" <<'PYPOME'
from pathlib import Path
import sys
source=Path(sys.argv[1]).read_text()
assert source.count('export const pomeAvailable = true;') == 1
Path(sys.argv[2]).write_text(source.replace('export const pomeAvailable = true;', 'export const pomeAvailable = false;'))
PYPOME
cp "$root/mac/Info.plist" "$app/Contents/Info.plist"
python3 - "$app" <<'PY'
import sys,plistlib,pathlib
p=pathlib.Path(sys.argv[1])/'Contents/Info.plist';d=plistlib.loads(p.read_bytes());d['NotesyPackageVersion']='1.4.8';d.update(CFBundleShortVersionString='1.0.0',CFBundleVersion='108',OrganikUpgradeModel='owned-v1',SUEnableInstallerLauncherService=True,OrganikDistribution='direct-download',OrganikPomeAvailable=False)
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
 (cd "$root/mac" && swiftc -D APP_STORE -D DIRECT_DOWNLOAD -F "$sparkle" -framework Sparkle -Xlinker -rpath -Xlinker @executable_path/../Frameworks -parse-as-library -target "$arch-apple-macosx14.0" -gnone ./*.swift -o "$root/build/main-$arch")
done
lipo -create "$root/build/main-arm64" "$root/build/main-x86_64" -output "$app/Contents/MacOS/organik-pebble-connector"
python3 - "$root/build/node.entitlements" <<'PY'
import sys,plistlib,pathlib
pathlib.Path(sys.argv[1]).write_bytes(plistlib.dumps({'com.apple.security.cs.allow-jit':True,'com.apple.security.app-sandbox':True,'com.apple.security.inherit':True}))
PY
for binary in "$resources/Beepster"/node-*; do
 codesign --force --options runtime --timestamp --sign "$identity" --entitlements "$root/build/node.entitlements" "$binary"
done
for binary in "$resources/Beepster/beepster-keychain" "$resources/Beepster/Beepster Contacts.app" "$resources/Notesy/renderer/notesy-image-helper" "$resources/Speech/organik-speech"; do
 codesign --force --options runtime --timestamp --sign "$identity" --entitlements "$root/mac/AppStore/InheritedTool.entitlements" "$binary"
done
framework="$app/Contents/Frameworks/Sparkle.framework/Versions/B"
for nested in "$framework"/XPCServices/*.xpc "$framework/Updater.app" "$framework/Autoupdate"; do
 codesign --force --options runtime --timestamp --sign "$identity" "$nested"
done
codesign --force --options runtime --timestamp --sign "$identity" "$app/Contents/Frameworks/Sparkle.framework"
codesign --force --options runtime --timestamp --sign "$identity" --entitlements "$root/mac/DirectDownload.entitlements" "$app"
python3 "$root/scripts/check-bundle-executables.py" "$app"
codesign --verify --deep --strict "$app"
