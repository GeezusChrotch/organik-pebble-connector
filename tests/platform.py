"""Catch a compiler's future-OS default without mistaking SDK version for minimum OS."""
import importlib.util
from pathlib import Path
path = Path(__file__).resolve().parents[1] / 'scripts/check-platform.py'
spec = importlib.util.spec_from_file_location('platform_check', path)
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)
valid = '''Load command 11
 cmd LC_BUILD_VERSION
 platform MACOS
 minos 14.0
 sdk 28.0
 ntools 1
 tool LD
 version 1267.0
'''
assert check.deployment_versions(valid) == ['14.0']
assert check.version(check.deployment_versions(valid)[0]) <= check.version('14.0')
future = valid.replace('minos 14.0', 'minos 28.0')
assert check.version(check.deployment_versions(future)[0]) > check.version('27.0')
assert check.deployment_versions(valid + future) == ['14.0', '28.0']
assert check.deployment_versions('Load command 1\n cmd LC_VERSION_MIN_MACOSX\n version 10.13\n sdk 26.2') == ['10.13']
print('PASS: SDK versus deployment target, accidental macOS 28 target, mixed slices, and older Mach-O format')
