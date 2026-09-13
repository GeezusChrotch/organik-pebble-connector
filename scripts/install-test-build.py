#!/usr/bin/env python3
"""Install one explicit signed test candidate at the permanent path; never roll back."""
import argparse, datetime, json, os, plistlib, signal, socket, subprocess, time
from pathlib import Path
from upgrade_preflight import identity as upgrade_identity, incompatibilities, health_regressions, github_edition_switch

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('candidate', type=Path)
parser.add_argument('--compatibility-baseline', type=Path, help='Explicit archived working app whose permission/service model this repair restores')
parser.add_argument('--switch-to-github-edition', action='store_true', help='Explicit Pome-disabled GitHub edition switch; requires preserved sandbox/team and owned services')
args = parser.parse_args()
candidate = args.candidate.resolve()
destination = Path('/Applications/Organik Apps Pebble Connector.app')
identity = 'org.organikapps.pebbleconnector'
info = plistlib.loads((candidate/'Contents/Info.plist').read_bytes())
assert candidate != destination and info['CFBundleIdentifier'] == identity
binary = candidate/'Contents/MacOS'/info['CFBundleExecutable']
def run(*cmd, check=True):
    return subprocess.run([str(x) for x in cmd], check=check, capture_output=True, text=True)
run('codesign', '--verify', '--deep', '--strict', candidate)
candidate_identity = upgrade_identity(candidate)
if destination.exists():
    installed_identity = upgrade_identity(destination)
    assert candidate_identity['build'] > installed_identity['build'], 'Replacement must have a newer build number'
    baseline = args.compatibility_baseline.resolve() if args.compatibility_baseline else destination
    run('codesign', '--verify', '--deep', '--strict', baseline)
    baseline_identity = upgrade_identity(baseline)
    problems = incompatibilities(baseline_identity, candidate_identity)
    if args.switch_to_github_edition:
        assert info.get('OrganikDistribution') == 'direct-download' and info.get('OrganikUpgradeModel') == 'owned-v1'
        assert github_edition_switch(baseline_identity, candidate_identity), 'Unsupported GitHub edition migration'
        run('spctl', '--assess', '--type', 'execute', candidate)
        problems = []
    assert not problems, 'Upgrade stopped before changing the running app: ' + ' '.join(problems)
    # The old direct edition needs a LaunchAgent; removing it disables Beepster.
    # Refuse an already-broken direct upgrade until its service migration exists.
    if not candidate_identity['sandbox']:
        assert info.get('OrganikUpgradeModel') == 'owned-v1', 'Direct edition service migration is not implemented; refusing replacement before interrupting working apps'
run(binary, '--login-item=status')  # Require maintenance-capable candidate.
def status_file(sandbox):
    root = Path.home()/'Library'
    if sandbox: root = root/'Containers'/identity/'Data/Library'
    return root/'Application Support/Organik Apps Pebble Connector/ConnectionStatus.json'
health_before = {}
if destination.exists():
    try: health_before = json.loads(status_file(upgrade_identity(baseline)['sandbox']).read_text())
    except (OSError, ValueError): pass
if args.switch_to_github_edition:
    health_before['apps'] = [a for a in health_before.get('apps', []) if a.get('app') != 'Pome']

archive = Path.home()/'Library/Application Support/Organik Connector Archives.noindex'/datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
archive.mkdir(parents=True, mode=0o700)
record = {'explicitGithubEditionSwitch': args.switch_to_github_edition, 'compatibility': candidate_identity, 'compatibilityBaseline': str(args.compatibility_baseline) if args.compatibility_baseline else str(destination), 'version': info['CFBundleVersion'], 'candidate': str(candidate), 'installed': str(destination), 'archived': []}
lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
if not Path(lsregister).exists():
    lsregister = '/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister'
def move_old(path, category):
    target = archive/category/path.name
    target.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix == '.app': run(lsregister, '-u', path, check=False)
    path.rename(target)
    record['archived'].append({'from':str(path), 'to':str(target)})
    (archive/'manifest.json').write_text(json.dumps(record,indent=2))

# Remove the obsolete native login registration before changing any app paths.
run(binary, '--login-item=disable')
legacy = Path.home()/'Library/LaunchAgents/org.beepster.gateway.plist'
if legacy.exists() and candidate_identity['sandbox']:
    data = plistlib.loads(legacy.read_bytes())
    assert data.get('Label') == 'org.beepster.gateway'
    assert data.get('ProgramArguments',[None])[0] == str(Path.home()/'Library/Application Support/Beepster/bin/node')
    run('launchctl', 'bootout', f'gui/{os.getuid()}/org.beepster.gateway', check=False)
    run('launchctl', 'disable', f'gui/{os.getuid()}/org.beepster.gateway')
    move_old(legacy, 'LaunchAgents')

# Stop only this Connector and the helpers inside its bundles, never arbitrary port owners.
def owned():
    result=[]
    for line in run('ps','-axo','pid=,command=').stdout.splitlines():
        pid,command=line.strip().split(None,1)
        if command.startswith('/') and '.app/Contents/' in command:
            bundle=command.split('.app/Contents/',1)[0]+'.app'
            p=Path(bundle)/'Contents/Info.plist'
            try: bid=plistlib.loads(p.read_bytes()).get('CFBundleIdentifier')
            except (OSError, ValueError): continue
            if bid in [identity,'org.beepster.connector','org.reminderz.connector']:
                result.append(int(pid))
    return result
for pid in owned():
    try: os.kill(pid,signal.SIGTERM)
    except ProcessLookupError: pass
for _ in range(50):
    if not owned(): break
    time.sleep(.2)
assert not owned(), 'Owned process did not stop; no forced termination or replacement'
for port in [8794,7844,7843,7855,7858]:
    with socket.socket() as sock:
        sock.settimeout(1)
        assert sock.connect_ex(('127.0.0.1',port)) != 0, f'Port {port} still occupied; installation stopped'
for root, category in [(Path('/Applications'),'Applications'),(Path.home()/'Applications','User Applications')]:
    for app in root.glob('*.app'):
        try: bid=plistlib.loads((app/'Contents/Info.plist').read_bytes()).get('CFBundleIdentifier')
        except (OSError,ValueError): continue
        if bid in [identity,'org.beepster.connector','org.reminderz.connector']:
            move_old(app, category)
# Unregister old development copies, retaining their build evidence outside Applications.
for app in (Path(__file__).resolve().parents[1]/'build').glob('*derived/Build/Products/Debug/*.app'):
    try: bid=plistlib.loads((app/'Contents/Info.plist').read_bytes()).get('CFBundleIdentifier')
    except (OSError,ValueError): continue
    if bid == identity: run(lsregister,'-u',app,check=False)
run('ditto',candidate,destination)
run('codesign','--verify','--deep','--strict',destination)
installed_binary=destination/'Contents/MacOS'/info['CFBundleExecutable']
run(lsregister,'-f',destination)
print(run(installed_binary,'--login-item=enable').stdout.strip())
print(run(installed_binary,'--login-item=status').stdout.strip())
launched_at = time.time()
run('open','-n',destination)
record['launched']=True
(archive/'manifest.json').write_text(json.dumps(record,indent=2))
(Path(__file__).resolve().parents[1]/'build/current-test-install.json').write_text(json.dumps(record,indent=2))
# A launch is not an upgrade pass. Require a fresh snapshot from the new process
# and preserve previously working checks; never silently roll back on failure.
post = status_file(candidate_identity['sandbox'])
failures = [('Connector', 'fresh health snapshot')]
for _ in range(60):
    try:
        health_after = json.loads(post.read_text())
        checked = datetime.datetime.fromisoformat(health_after['checkedAt'].replace('Z', '+00:00')).timestamp()
        if checked >= launched_at and health_after.get('pid') in owned():
            failures = health_regressions(health_before, health_after)
            if not failures: break
    except (OSError, ValueError, KeyError): pass
    time.sleep(1)
record['healthRegressionCheck'] = {'passed': not failures, 'failures': failures}
(archive/'manifest.json').write_text(json.dumps(record,indent=2))
(Path(__file__).resolve().parents[1]/'build/current-test-install.json').write_text(json.dumps(record,indent=2))
assert not failures, 'Installed candidate has unresolved upgrade checks (no rollback performed): ' + str(failures)
print(f'Installed build {info["CFBundleVersion"]}; archived {len(record["archived"])} items at {archive}')
