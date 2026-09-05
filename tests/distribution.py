"""One distributable; reject old editions and invalid update configuration."""
from pathlib import Path
import base64
import os
import plistlib
import subprocess
import tempfile
root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as temporary:
    temp = Path(temporary)
    app = temp / 'Connector.app'
    binary = app / 'Contents/MacOS/organik-pebble-connector'
    binary.parent.mkdir(parents=True)
    binary.write_text('')
    binary.chmod(0o700)
    plist = app / 'Contents/Info.plist'
    for marker, relay in [('personal', False), ('public', False), ('unified', True)]:
        plist.write_bytes(plistlib.dumps({'OrganikDistribution': marker}))
        if relay:
            (app / 'Contents/Resources/PebClaw').mkdir(parents=True)
        result = subprocess.run(['bash', str(root / 'scripts/package.sh')], env={**os.environ, 'ORGANIK_APP_DESTINATION': str(app)}, capture_output=True, text=True)
        assert result.returncode != 0 and 'Packaging refuses' in result.stderr, result.stderr
    public_key = base64.b64encode(bytes(range(32))).decode()
    for feed, key, valid in [('', '', True), ('http://example.com/appcast.xml', public_key, False), ('https://example.com/appcast.xml', '', False), ('https://example.com/appcast.xml', 'bad-key', False), ('https://example.com/appcast.xml', public_key, True)]:
        plist.write_bytes(plistlib.dumps({}))
        result = subprocess.run(['python3', str(root / 'scripts/configure-updates.py'), str(plist)], env={**os.environ, 'ORGANIK_UPDATE_FEED': feed, 'ORGANIK_UPDATE_PUBLIC_KEY': key}, capture_output=True)
        assert (result.returncode == 0) == valid
        if valid and feed:
            config = plistlib.loads(plist.read_bytes())
            assert config['SUFeedURL'] == feed and config['SUPublicEDKey'] == key
print('PASS: unified packaging exclusions and signed update configuration validation')
