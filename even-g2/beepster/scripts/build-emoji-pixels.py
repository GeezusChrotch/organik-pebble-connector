#!/usr/bin/env python3
"""Compile the same Pebble emoji atlas to bounded 18x18, 4-bit G2 sprites."""
from pathlib import Path
import json
from PIL import Image
root=Path(__file__).resolve().parents[1]
source=root/'public/emoji'
catalog=json.loads((source/'catalog.json').read_text())
atlas=Image.open(source/'atlas.png').convert('RGBA')
assert atlas.size==(catalog['columns']*24,catalog['rows']*24)
output=bytearray((max(e['id'] for e in catalog['entries'])+1)*162)
for entry in catalog['entries']:
 i=entry['id'];x=i%64*24;y=i//64*24
 icon=atlas.crop((x,y,x+24,y+24)).resize((18,18),Image.Resampling.LANCZOS)
 # Lift dark colors so red hearts and dark symbols remain visible.
 # Alpha composites over the unlit G2 background; quantize to 16 levels.
 pixels=[round(((.2126*r+.7152*g+.0722*b)/255)**.55*(a/255)*15) for r,g,b,a in icon.get_flattened_data()]
 assert any(pixels),entry['key']
 output[i*162:(i+1)*162]=bytes(pixels[j]*16+pixels[j+1] for j in range(0,324,2))
(source/'g2-pixels.bin').write_bytes(output)
print(f'Compiled {len(catalog["entries"])} nonblank emoji sprites')
