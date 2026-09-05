#!/bin/bash
set -euo pipefail
project_dir=$(cd "$(dirname "$0")/.." && pwd)
sparkle="$project_dir/build/dependencies/sparkle"
app="$project_dir/build/UpdaterTests.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Frameworks"
python3 - "$project_dir/mac/Info.plist" "$app/Contents/Info.plist" <<'PY'
import plistlib,sys
from pathlib import Path
config=plistlib.loads(Path(sys.argv[1]).read_bytes())
config['CFBundleIdentifier']='org.organikapps.pebbleconnector.updater-tests'
config['CFBundleExecutable']='updater-tests'
config['CFBundleName']='Connector Updater Tests'
Path(sys.argv[2]).write_bytes(plistlib.dumps(config))
PY
ditto "$sparkle/Sparkle.framework" "$app/Contents/Frameworks/Sparkle.framework"
swiftc -target "$(uname -m)-apple-macosx14.0" -F "$sparkle" -framework Sparkle \
  -Xlinker -rpath -Xlinker @executable_path/../Frameworks -parse-as-library \
  "$project_dir/mac/ConnectorUpdater.swift" "$project_dir/tests/UpdaterTests.swift" \
  -o "$app/Contents/MacOS/updater-tests"
"$app/Contents/MacOS/updater-tests"
