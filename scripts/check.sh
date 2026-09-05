#!/bin/bash
set -euo pipefail
project_dir=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$project_dir/build"
swiftc -target "$(uname -m)-apple-macosx14.0" -parse-as-library "$project_dir/mac/Shared.swift" "$project_dir/tests/SharedTests.swift" -o "$project_dir/build/shared-tests"
"$project_dir/build/shared-tests"
bash "$project_dir/scripts/fetch-sparkle.sh"
swiftc -target "$(uname -m)-apple-macosx14.0" -F "$project_dir/build/dependencies/sparkle" -parse-as-library -typecheck "$project_dir"/mac/*.swift
swiftc -target "$(uname -m)-apple-macosx14.0" -parse-as-library "$project_dir/mac/ConnectorState.swift" "$project_dir/tests/ConnectorStateTests.swift" -o "$project_dir/build/connector-state-tests"
"$project_dir/build/connector-state-tests"
bash "$project_dir/scripts/check-updater.sh"
python3 "$project_dir/scripts/check-private-data.py"

python3 "$project_dir/tests/distribution.py"

python3 "$project_dir/tests/platform.py"

swiftc -target "$(uname -m)-apple-macosx14.0" -parse-as-library \
  "$project_dir/mac/Shared.swift" "$project_dir/mac/ConnectorState.swift" \
  "$project_dir/mac/NotesyService.swift" "$project_dir/mac/ExternalService.swift" \
  "$project_dir/mac/BeepsterModule.swift" "$project_dir/mac/AgentSetupView.swift" "$project_dir/mac/ReminderzModule.swift" \
  "$project_dir/tests/HealthRequirementsTests.swift" -o "$project_dir/build/health-requirements-tests"
"$project_dir/build/health-requirements-tests"
