#!/bin/bash
set -euo pipefail
root=$(cd "$SRCROOT/.." && pwd)
host="$TARGET_BUILD_DIR/$CONTENTS_FOLDER_PATH/PlugIns/CameraWindowHost.bundle"
mkdir -p "$(dirname "$host")"
ditto "$root/.ci-build/CameraWindowHost.bundle" "$host"
cp "$root/mac/AppStore/CameraPrivacyInfo.xcprivacy" "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/PrivacyInfo.xcprivacy"
if [[ ${CODE_SIGNING_ALLOWED:-YES} != NO ]]; then
 codesign --force --sign "${EXPANDED_CODE_SIGN_IDENTITY:--}" "$host"
fi
