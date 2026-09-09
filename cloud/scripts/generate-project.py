#!/usr/bin/env python3
"""Generate an Xcode Store-development candidate from explicitly staged resources.
Does not install, launch, export, or submit the app. Resource signing is a separate
inside-out build step before invoking this project.
"""
from pathlib import Path
import json, plistlib
root = Path(__file__).resolve().parents[1]
work = root
resources = root / 'Resources'
for name in ['Beepster', 'Notesy', 'Organik.icns']:
    if not (resources / name).exists():
        raise SystemExit('Missing staged Store resource: ' + name)
info = plistlib.loads((root / 'mac/Info.plist').read_bytes())
info = {k:v for k,v in info.items() if not k.startswith('SU')}
(root / 'mac/Info.plist').write_bytes(plistlib.dumps(info))
objects = []
def obj(n, body):
    ident = f'{n:024X}'
    objects.append(ident + ' = {' + body + '};')
    return ident
def q(v): return json.dumps(str(v))
source_ids=[]; resource_ids=[]; refs=[]
for i,p in enumerate(sorted((root/'mac').glob('*.swift'))):
    ref=obj(100+i, f'isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {q(p.relative_to(root))}; sourceTree = SOURCE_ROOT;')
    refs.append(ref); source_ids.append(obj(200+i, f'isa = PBXBuildFile; fileRef = {ref};'))
for i,p in enumerate(sorted(resources.iterdir())):
    ref=obj(300+i, f'isa = PBXFileReference; lastKnownFileType = {"folder" if p.is_dir() else "file"}; path = {q(p.relative_to(root))}; sourceTree = SOURCE_ROOT;')
    refs.append(ref); resource_ids.append(obj(400+i, f'isa = PBXBuildFile; fileRef = {ref};'))
product=obj(9, 'isa = PBXFileReference; explicitFileType = wrapper.application; path = "Organik Apps Pebble Connector.app"; sourceTree = BUILT_PRODUCTS_DIR;')
obj(1, 'isa = PBXProject; attributes = {LastUpgradeCheck = 2660;}; buildConfigurationList = 000000000000000000000002; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; knownRegions = (en,Base); mainGroup = 000000000000000000000003; productRefGroup = 000000000000000000000004; projectDirPath = ""; projectRoot = ""; targets = (000000000000000000000005);')
obj(2, 'isa = XCConfigurationList; buildConfigurations = (000000000000000000000006,00000000000000000000000C); defaultConfigurationIsVisible = 0; defaultConfigurationName = Debug;')
obj(3, 'isa = PBXGroup; children = (' + ','.join(refs+[f'{4:024X}']) + '); sourceTree = "<group>";')
obj(4, f'isa = PBXGroup; children = ({product}); name = Products; sourceTree = "<group>";')
obj(5, 'isa = PBXNativeTarget; buildConfigurationList = 000000000000000000000007; buildPhases = (00000000000000000000000A,00000000000000000000000B,0000000000000000000003EB); buildRules = (); dependencies = (0000000000000000000003EA); name = OrganikConnector; productName = "Organik Apps Pebble Connector"; productReference = 000000000000000000000009; productType = "com.apple.product-type.application";')
obj(6, 'isa = XCBuildConfiguration; buildSettings = {SDKROOT = macosx; MACOSX_DEPLOYMENT_TARGET = 14.0; SWIFT_VERSION = 5.0; ALWAYS_SEARCH_USER_PATHS = NO;}; name = Debug;')
obj(7, 'isa = XCConfigurationList; buildConfigurations = (000000000000000000000008,00000000000000000000000D); defaultConfigurationIsVisible = 0; defaultConfigurationName = Debug;')
obj(8, 'isa = XCBuildConfiguration; buildSettings = {CODE_SIGN_STYLE = Automatic; CODE_SIGN_ENTITLEMENTS = '+q('$(SRCROOT)/mac/AppStore/Connector.entitlements')+'; DEVELOPMENT_TEAM = 4N9LJD597R; CODE_SIGN_IDENTITY = "Apple Development"; ENABLE_APP_SANDBOX = YES; ENABLE_HARDENED_RUNTIME = YES; GENERATE_INFOPLIST_FILE = NO; INFOPLIST_FILE = '+q('$(SRCROOT)/mac/Info.plist')+'; PRODUCT_BUNDLE_IDENTIFIER = org.organikapps.pebbleconnector; PRODUCT_NAME = "Organik Apps Pebble Connector"; EXECUTABLE_NAME = "organik-pebble-connector"; SWIFT_ACTIVE_COMPILATION_CONDITIONS = APP_STORE; SWIFT_VERSION = 5.0; CURRENT_PROJECT_VERSION = 40; MARKETING_VERSION = 1.0; VERSIONING_SYSTEM = apple-generic; ENABLE_USER_SCRIPT_SANDBOXING = NO;}; name = Debug;')
obj(13, 'isa = XCBuildConfiguration; buildSettings = {CODE_SIGN_STYLE = Automatic; CODE_SIGN_ENTITLEMENTS = '+q('$(SRCROOT)/mac/AppStore/Connector.entitlements')+'; DEVELOPMENT_TEAM = 4N9LJD597R; CODE_SIGN_IDENTITY = "Apple Development"; ENABLE_APP_SANDBOX = YES; ENABLE_HARDENED_RUNTIME = YES; GENERATE_INFOPLIST_FILE = NO; INFOPLIST_FILE = '+q('$(SRCROOT)/mac/Info.plist')+'; PRODUCT_BUNDLE_IDENTIFIER = org.organikapps.pebbleconnector; PRODUCT_NAME = "Organik Apps Pebble Connector"; EXECUTABLE_NAME = "organik-pebble-connector"; SWIFT_ACTIVE_COMPILATION_CONDITIONS = APP_STORE; SWIFT_VERSION = 5.0; CURRENT_PROJECT_VERSION = 40; MARKETING_VERSION = 1.0; VERSIONING_SYSTEM = apple-generic; ENABLE_USER_SCRIPT_SANDBOXING = NO; SWIFT_OPTIMIZATION_LEVEL = "-O"; SWIFT_COMPILATION_MODE = wholemodule; DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym"; COPY_PHASE_STRIP = YES; STRIP_INSTALLED_PRODUCT = YES;}; name = Release;')
obj(12, 'isa = XCBuildConfiguration; buildSettings = {SDKROOT = macosx; MACOSX_DEPLOYMENT_TARGET = 14.0; SWIFT_VERSION = 5.0; ALWAYS_SEARCH_USER_PATHS = NO;}; name = Release;')
obj(10, 'isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ('+','.join(source_ids)+'); runOnlyForDeploymentPostprocessing = 0;')
obj(11, 'isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = ('+','.join(resource_ids)+'); runOnlyForDeploymentPostprocessing = 0;')
obj(1000, 'isa = PBXFileReference; lastKnownFileType = wrapper.pb-project; path = camera/CameraProbe.xcodeproj; sourceTree = SOURCE_ROOT;')
obj(1001, 'isa = PBXContainerItemProxy; containerPortal = 0000000000000000000003E8; proxyType = 1; remoteGlobalIDString = A00000000000000000000005; remoteInfo = CameraProbe;')
obj(1002, 'isa = PBXTargetDependency; targetProxy = 0000000000000000000003E9;')
obj(1003, 'isa = PBXShellScriptBuildPhase; buildActionMask = 2147483647; files = (); inputPaths = (); outputPaths = (); runOnlyForDeploymentPostprocessing = 0; shellPath = /bin/bash; shellScript = '+q('bash "$SRCROOT/scripts/embed-helpers.sh"')+';')
# Make the external project visible for dependency discovery and managed signing.
objects[:] = [x.replace('children = (', 'children = (0000000000000000000003E8,',1) if x.startswith('000000000000000000000003 =') else x for x in objects]
project=work/'OrganikConnector.xcodeproj';project.mkdir(exist_ok=True)
(project/'project.pbxproj').write_text('// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n'+'\n'.join(objects)+'\n}; rootObject = 000000000000000000000001; }\n')
print(project)
