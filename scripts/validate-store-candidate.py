#!/usr/bin/env python3
"""Inspect a development candidate; never launch, upload or grant permissions."""
from pathlib import Path
import argparse,hashlib,json,plistlib,subprocess
parser=argparse.ArgumentParser();parser.add_argument('app',type=Path);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
app=args.app.resolve()
subprocess.run(["python3",str(Path(__file__).with_name("check-bundle-executables.py")),str(app)],check=True)
def entitlements(p):
 r=subprocess.run(['codesign','-d','--entitlements',':-',str(p)],capture_output=True,check=True)
 return plistlib.loads(r.stdout)
def profile(p):
 d=plistlib.loads(subprocess.check_output(['security','cms','-D','-i',str(p/'Contents/embedded.provisionprofile')],stderr=subprocess.DEVNULL))
 return {'name':d.get('Name'),'registeredDevices':len(d.get('ProvisionedDevices',[])), 'homekit':d.get('Entitlements',{}).get('com.apple.developer.homekit',False), 'groups':d.get('Entitlements',{}).get('com.apple.security.application-groups',[])}
subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
info=plistlib.loads((app/'Contents/Info.plist').read_bytes());main=entitlements(app)
assert info['CFBundleShortVersionString']=='1.0' and info['OrganikDistribution']=='app-store'
assert info.get('LSApplicationCategoryType') == 'public.app-category.utilities'
assert not any(k.startswith('SU') for k in info)
assert main.get('com.apple.security.app-sandbox') is True and not main.get('com.apple.security.inherit',False)
assert 'group.org.organikapps.pebbleconnector' in main.get('com.apple.security.application-groups',[])
assert not list(app.rglob('Sparkle.framework'))
assert (app/'Contents/Resources/PrivacyInfo.xcprivacy').exists()
helper=app/'Contents/Resources/Pome Cameras.app'; hp=profile(helper);mp=profile(app)
helper_info=plistlib.loads((helper/'Contents/Info.plist').read_bytes())
assert helper_info.get('LSApplicationCategoryType') == 'public.app-category.utilities'
assert helper_info['CFBundleVersion'] == info['CFBundleVersion']
assert hp['homekit'] and 'group.org.organikapps.pebbleconnector' in hp['groups']
assert 'group.org.organikapps.pebbleconnector' in mp['groups']
records={}
for p in [app/'Contents/MacOS/organik-pebble-connector',helper/'Contents/MacOS/CameraProbe',helper/'Contents/PlugIns/CameraWindowHost.bundle/Contents/MacOS/CameraWindowHost']:
 records[str(p.relative_to(app))]=hashlib.sha256(p.read_bytes()).hexdigest()
for p in list((app/'Contents/Resources/Beepster').glob('node-*'))+[app/'Contents/Resources/Beepster/beepster-keychain',app/'Contents/Resources/Notesy/renderer/notesy-image-helper']:
 e=entitlements(p)
 assert e.get('com.apple.security.app-sandbox') is True and e.get('com.apple.security.inherit') is True
 assert not e.get('com.apple.security.cs.allow-unsigned-executable-memory',False)
 assert not e.get('com.apple.security.cs.disable-library-validation',False)
 records[str(p.relative_to(app))]=hashlib.sha256(p.read_bytes()).hexdigest()
contacts=entitlements(app/'Contents/Resources/Beepster/Beepster Contacts.app')
assert contacts.get('com.apple.security.app-sandbox') is True and contacts.get('com.apple.security.inherit') is True
result={'version':info['CFBundleShortVersionString'],'build':info['CFBundleVersion'],'signatureValidation':True,'mainProfile':mp,'cameraProfile':hp,'sha256':records,'classification':'development candidate, not submission-ready','remaining':['live sandbox camera capture and Quit lifecycle','Contacts, Reminders, attachments and credential migration','live agent endpoints and watch delivery','Store distribution signing, archive and App Store validation']}
args.output.write_text(json.dumps(result,indent=2)+'\n')
print('PASS: sandbox/inherited tools, group+HomeKit profiles, no Sparkle, deep signatures; development gates remain')
