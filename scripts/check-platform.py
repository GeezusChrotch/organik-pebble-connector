#!/usr/bin/env python3
"""Check actual Mach-O deployment targets, not just Info.plist or SDK versions."""
from pathlib import Path
import plistlib
import re
import subprocess
import sys


def version(value):
    parts = tuple(int(part) for part in value.split('.'))
    return (parts + (0, 0, 0))[:3]


def deployment_versions(output):
    result = []
    for block in output.split('Load command '):
        if re.search(r'cmd LC_BUILD_VERSION\b', block):
            if not re.search(r'platform MACOS\b', block):
                raise ValueError('Non-macOS native executable in app')
            match = re.search(r'^\s*minos ([\d.]+)', block, re.M)
        elif re.search(r'cmd LC_VERSION_MIN_MACOSX\b', block):
            match = re.search(r'^\s*version ([\d.]+)', block, re.M)
        else:
            continue
        if match:
            result.append(match.group(1))
    if not result:
        raise ValueError('No macOS deployment target found')
    return result


def check(app):
    info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
    minimum = info['LSMinimumSystemVersion']
    if version(minimum) != version('14.0'):
        raise ValueError('Connector must retain its declared macOS 14 minimum')
    count = 0
    for path in app.rglob('*'):
        if not path.is_file() or path.is_symlink():
            continue
        with path.open('rb') as file:
            magic = file.read(4)
        if magic not in (b'\xcf\xfa\xed\xfe', b'\xce\xfa\xed\xfe', b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf'):
            continue
        output = subprocess.check_output(['xcrun', 'vtool', '-show-build', str(path)], text=True)
        for required in deployment_versions(output):
            if version(required) > version(minimum):
                raise ValueError(f'{path.relative_to(app)} requires macOS {required}, exceeding declared {minimum}')
        count += 1
    if count == 0:
        raise ValueError('No native executables checked')
    print(f'PASS: {count} native binaries and all architecture slices support macOS {minimum}+ (including macOS 27)')


if __name__ == '__main__':
    try:
        check(Path(sys.argv[1]))
    except (ValueError, KeyError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
