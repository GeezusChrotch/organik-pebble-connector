#!/bin/bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$root/.ci-build"
if [[ ${CI:-} == TRUE ]]; then
 case "$(sw_vers -productVersion)" in 26.*) ;; *) echo 'Select stable macOS 26 for this release workflow.' >&2; exit 1;; esac
fi
xcodebuild -version | tee "$root/.ci-build/toolchain.txt"
grep -q '17F113' "$root/.ci-build/toolchain.txt"
sw_vers > "$root/.ci-build/host.txt"
if [[ -n ${CI_BUILD_NUMBER:-} ]]; then
 python3 - "$root" "$CI_BUILD_NUMBER" <<'PYVERSION'
from pathlib import Path
import re,sys
r=Path(sys.argv[1]);number=sys.argv[2]
assert number.isdecimal() and int(number)>=40, 'Set the first Xcode Cloud build number to 40 or higher.'
for p in [r/'OrganikConnector.xcodeproj/project.pbxproj',r/'camera/CameraProbe.xcodeproj/project.pbxproj']:
 p.write_text(re.sub(r'CURRENT_PROJECT_VERSION = [0-9]+;', 'CURRENT_PROJECT_VERSION = '+number+';', p.read_text()))
PYVERSION
fi
resources="$root/Resources"
for arch in arm64 x64; do
 case "$arch" in
 arm64) expected=af5cfaeafe603aaf7599f287fd9d100bb41f16794f49788fa59dd3f25546930f;;
 x64) expected=5d627245b9f53cb2512cc21b7aa6aad693106affadd91e0c8f42d600fb7ba444;;
 esac
 archive="$root/.ci-build/node-v24.15.0-darwin-$arch.tar.xz"
 curl --fail --silent --show-error --location "https://nodejs.org/dist/v24.15.0/node-v24.15.0-darwin-$arch.tar.xz" -o "$archive"
 actual=$(shasum -a 256 "$archive" | awk '{print $1}')
 [[ "$actual" == "$expected" ]] || { echo 'Node checksum mismatch' >&2; exit 1; }
 tar -xf "$archive" -C "$root/.ci-build"
 cp "$root/.ci-build/node-v24.15.0-darwin-$arch/bin/node" "$resources/Beepster/node-$arch"
done
case "$(uname -m)" in arm64) host_arch=arm64;; x86_64) host_arch=x64;; *) exit 1;; esac
node_home="$root/.ci-build/node-v24.15.0-darwin-$host_arch"
"$node_home/bin/node" "$node_home/lib/node_modules/npm/bin/npm-cli.js" ci --prefix "$resources/Beepster/gateway" --omit=dev --ignore-scripts --no-audit --no-fund
mkdir -p "$resources/Beepster/Beepster Contacts.app/Contents/MacOS"
for arch in arm64 x86_64; do
 xcrun swiftc -emit-library -parse-as-library -target "$arch-apple-macosx14.0" -gnone -framework AppKit "$root/camera/CameraWindowHost.swift" -o "$root/.ci-build/window-$arch"
 xcrun swiftc -target "$arch-apple-macosx13.0" -gnone -framework Security "$root/helpers/BeepsterKeychain.swift" -o "$root/.ci-build/keychain-$arch"
 xcrun swiftc -target "$arch-apple-macosx13.0" -gnone -framework AppKit -framework Contacts -framework CryptoKit "$root/helpers/BeepsterContacts.swift" -o "$root/.ci-build/contacts-$arch"
 xcrun swiftc -target "$arch-apple-macosx14.0" -gnone -framework AppKit -framework WebKit "$root/helpers/ImageHelper.swift" -o "$root/.ci-build/image-$arch"
done
host="$root/.ci-build/CameraWindowHost.bundle"
mkdir -p "$host/Contents/MacOS"
lipo -create "$root/.ci-build/window-arm64" "$root/.ci-build/window-x86_64" -output "$host/Contents/MacOS/CameraWindowHost"
lipo -create "$root/.ci-build/keychain-arm64" "$root/.ci-build/keychain-x86_64" -output "$resources/Beepster/beepster-keychain"
lipo -create "$root/.ci-build/contacts-arm64" "$root/.ci-build/contacts-x86_64" -output "$resources/Beepster/Beepster Contacts.app/Contents/MacOS/beepster-contacts"
lipo -create "$root/.ci-build/image-arm64" "$root/.ci-build/image-x86_64" -output "$resources/Notesy/renderer/notesy-image-helper"
python3 - "$host" <<'PY'
from pathlib import Path
import plistlib,sys
p=Path(sys.argv[1])/'Contents/Info.plist';p.write_bytes(plistlib.dumps(dict(CFBundleExecutable='CameraWindowHost',CFBundleIdentifier='com.organikapps.pome.camera-window-host',CFBundlePackageType='BNDL',NSPrincipalClass='PomeCameraWindowHost')))
PY

# Build pinned local speech code on the stable Cloud toolchain. Model data is downloaded on first use.
bash "$root/../scripts/stage-speech.sh" "$resources"
