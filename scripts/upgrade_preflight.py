"""Read-only compatibility checks before an installed Connector is stopped."""
import plistlib
import subprocess
from pathlib import Path


def identity(app):
    app = Path(app)
    info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
    result = subprocess.run(['codesign', '-d', '--entitlements', '-', '--xml', str(app)],
                            check=True, capture_output=True)
    entitlements = plistlib.loads(result.stdout) if result.stdout.strip() else {}
    signature = subprocess.run(['codesign', '-d', '-r-', '--verbose=2', str(app)], check=True, capture_output=True, text=True)
    requirement = next(line.partition('designated =>')[2].strip() for line in (signature.stdout + signature.stderr).splitlines() if 'designated =>' in line)
    team = next((line.partition('=')[2].strip() for line in (signature.stdout + signature.stderr).splitlines() if line.startswith('TeamIdentifier=')), None)
    return {'team': team, 'signingRequirement': requirement, 'bundle': info['CFBundleIdentifier'],
            'sandbox': entitlements.get('com.apple.security.app-sandbox', False),
            'groups': sorted(entitlements.get('com.apple.security.application-groups', [])),
            'pome': (app / 'Contents/Resources/Pome Cameras.app').is_dir(),
            'build': int(info['CFBundleVersion'])}


def incompatibilities(previous, candidate):
    problems = []
    if previous['bundle'] != candidate['bundle']:
        problems.append('The application identity changed.')
    if previous.get('signingRequirement') != candidate.get('signingRequirement'):
        problems.append('The signing identity changed; existing macOS privacy permissions may not transfer.')
    if previous['sandbox'] != candidate['sandbox']:
        problems.append('Sandbox and permission storage changed; this is a migration, not a compatible update.')
    if not set(previous['groups']).issubset(candidate['groups']):
        problems.append('An existing application group was removed.')
    if previous['pome'] and not candidate['pome']:
        problems.append('The update removes the installed Pome integration.')
    return problems


def ready_requirements(snapshot):
    return {(app['app'], item['id']) for app in snapshot.get('apps', [])
            for item in app.get('requirements', []) if item.get('ready')}


def health_regressions(before, after):
    failures = sorted(ready_requirements(before) - ready_requirements(after))
    if before.get('tailscale', {}).get('ready') and not after.get('tailscale', {}).get('ready'):
        failures.append(('All apps', 'tailscale'))
    return failures


def github_edition_switch(previous, candidate):
    # Explicitly requested edition switch: keep the sandbox/team/bundle and
    # remove only the HomeKit group with Pome. Never authorize arbitrary changes.
    return (previous['sandbox'] and candidate['sandbox']
            and previous['bundle'] == candidate['bundle']
            and previous.get('team') is not None and previous['team'] == candidate.get('team')
            and not candidate['pome']
            and set(previous['groups']) - set(candidate['groups']) <= {'group.org.organikapps.pebbleconnector'})
