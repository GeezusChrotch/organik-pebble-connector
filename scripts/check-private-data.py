from pathlib import Path
import re,sys,zipfile
root=Path(__file__).resolve().parents[1]
patterns=[re.compile(r'/Users/(?!Shared/)[A-Za-z][^\s"\']*'),re.compile(r'https://(?!sample\.|unit\.|example\.)[a-z0-9.-]+\.ts\.net',re.I),re.compile(r'-----BEGIN (?:RSA |EC )?PRIVATE KEY-----')]
failures=[]
for folder in [root/'mac',root/'vendor',root/'../StoneNotes/src',root/'../StoneNotes/gateway']:
    for file in folder.rglob('*'):
        if not file.is_file():continue
        text=file.read_text(errors='replace')
        if any(p.search(text) for p in patterns):failures.append(str(file.relative_to(root) if file.is_relative_to(root) else file.name))
if failures:raise SystemExit('Review private-data matches in: '+', '.join(failures))
print('PASS: source contains no personal vault paths, private tailnet origins, or private keys.')
if '--app' in sys.argv:
    app=Path(sys.argv[sys.argv.index('--app')+1])
    binary=app/'Contents/MacOS/organik-pebble-connector'
    if re.search(rb'/Users/[A-Za-z]',binary.read_bytes()):raise SystemExit('Developer source path found in the Mac executable.')
    with zipfile.ZipFile(app/'Contents/Resources/Notesy/Notesy.pbw') as z:
        if z.testzip():raise SystemExit('Invalid watch archive.')
        for name in z.namelist():
            text=z.read(name).decode('utf8','replace')
            if any(p.search(text) for p in patterns):raise SystemExit('Review private-data match in watch archive member: '+name)
    print('PASS: packaged native executable and watch archive contain no personal configuration.')
