"""Inject public release configuration; never read or export signing secrets."""
import base64
import os
from pathlib import Path
import plistlib
import sys
from urllib.parse import urlparse

path = Path(sys.argv[1])
feed = os.environ.get('ORGANIK_UPDATE_FEED', '')
key = os.environ.get('ORGANIK_UPDATE_PUBLIC_KEY', '')
if bool(feed) != bool(key):
    raise SystemExit('Set ORGANIK_UPDATE_FEED and ORGANIK_UPDATE_PUBLIC_KEY together.')
if feed:
    url = urlparse(feed)
    if url.scheme != 'https' or not url.hostname or url.username or url.password:
        raise SystemExit('Update feed must be an HTTPS URL without credentials.')
    try:
        valid = len(base64.b64decode(key, validate=True)) == 32
    except ValueError:
        valid = False
    if not valid:
        raise SystemExit('Update public key must encode a 32-byte Ed25519 public key.')
    data = plistlib.loads(path.read_bytes())
    data.update(SUFeedURL=feed, SUPublicEDKey=key)
    path.write_bytes(plistlib.dumps(data))
else:
    print('Using the update feed and public signing key from mac/Info.plist.')
