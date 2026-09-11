from pathlib import Path
import argparse
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--pebble',type=Path,required=True);p.add_argument('--check',action='store_true');args=p.parse_args()
core=(root/'shared/pome-speech.js').read_text()
target=root/'even-g2/pome/src/speech-language.ts'
ts='// @ts-nocheck\n// Generated from shared/pome-speech.js; see scripts/sync-pome-speech.py.\n'+core+'\nexport {speechNormalize,speechClean,speechWithoutNames,speechNumber,speechGuard,speechSceneNames};\n'
pebble=args.pebble/'src/pkjs/index.js';old=pebble.read_text();a=old.index('// BEGIN SHARED POME SPEECH\n');b=old.index('// END SHARED POME SPEECH',a)
new=old[:a]+'// BEGIN SHARED POME SPEECH\n'+core+old[b:]
if args.check:
 assert target.read_text()==ts and old==new,'Pome speech helpers differ; run sync script'
else:
 target.write_text(ts);pebble.write_text(new)
