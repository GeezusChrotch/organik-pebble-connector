#!/bin/bash
set -euo pipefail
resources="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"
camera="$BUILD_DIR/$CONFIGURATION-maccatalyst/Pome Cameras.app"
[[ -d "$camera" ]] || { echo 'The Catalyst camera dependency did not build for macOS.' >&2; exit 1; }
ditto "$camera" "$resources/Pome Cameras.app"
if [[ ${CODE_SIGNING_ALLOWED:-YES} != NO ]]; then
 identity=${EXPANDED_CODE_SIGN_IDENTITY:--}
 for binary in "$resources/Beepster"/node-*; do
  codesign --force --options runtime --sign "$identity" --entitlements "$SRCROOT/mac/AppStore/Node.entitlements" "$binary"
 done
 for binary in "$resources/Beepster/beepster-keychain" "$resources/Notesy/renderer/notesy-image-helper" "$resources/Beepster/Beepster Contacts.app"; do
  codesign --force --options runtime --sign "$identity" --entitlements "$SRCROOT/mac/AppStore/InheritedTool.entitlements" "$binary"
 done
fi
