#!/usr/bin/env python3
"""Validate declared bundle executables; optional repair is limited to FluidAudio resources."""
import argparse
import plistlib
from pathlib import Path


def inspect(root, repair_fluid_resources=False):
    failures, repaired = [], []
    for info in sorted(root.rglob('Info.plist')):
        if info.is_symlink():
            continue
        bundle = next((p for p in info.parents if p.suffix in ('.app', '.bundle', '.framework', '.appex', '.xpc')), None)
        if bundle is None:
            continue
        data = plistlib.loads(info.read_bytes())
        executable = data.get('CFBundleExecutable')
        if not executable:
            continue
        if not isinstance(executable, str) or Path(executable).name != executable:
            failures.append(str(info) + ': invalid executable name')
            continue
        candidates = [bundle / 'Contents/MacOS' / executable, bundle / executable,
                      bundle / 'Versions/Current' / executable, info.parent.parent / executable]
        if any(p.is_file() for p in candidates):
            continue
        known_resource = (bundle.name == 'FluidAudio_FluidAudio.bundle'
                          and data.get('CFBundleIdentifier') == 'FluidAudio.FluidAudio.resources'
                          and data.get('CFBundlePackageType') == 'BNDL'
                          and executable == 'FluidAudio_FluidAudio'
                          and not (bundle / 'Contents/MacOS').exists()
                          and (bundle / 'Contents/Resources').is_dir())
        if repair_fluid_resources and known_resource:
            del data['CFBundleExecutable']
            info.write_bytes(plistlib.dumps(data))
            repaired.append(str(info))
        else:
            failures.append(str(info) + ': declared executable is missing: ' + executable)
    return failures, repaired


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('--repair-fluid-resources', action='store_true')
    args = parser.parse_args()
    failures, repaired = inspect(args.root, args.repair_fluid_resources)
    for path in repaired:
        print('Repaired resource-only declaration:', path)
    if failures:
        raise SystemExit('\n'.join(failures))
    print('PASS: all declared bundle executables exist')
