import test from 'node:test';
import assert from 'node:assert/strict';
import { MacContactsResolver, normalizeContactIdentifier, waitForHelperResponse, runHelper } from '../src/contact-resolver.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function withExecutable(body, run) {
  const directory = await mkdtemp(join(tmpdir(), 'beepster-stdio-test-'));
  const helper = join(directory, 'Contacts Helper');
  try {
    await writeFile(helper, `#!${process.execPath}\n${body}`, {mode:0o700});
    await run(helper);
  } finally { await rm(directory, {recursive:true, force:true}); }
}

test('Store Contacts executable receives lookup JSON only on stdin, with names and identity keys intact', async () => {
  await withExecutable(`
    if (JSON.stringify(process.argv.slice(2)) !== '["--lookup"]') process.exit(2);
    let input='';process.stdin.on('data',x=>input+=x);
    process.stdin.on('end',()=>{
      const request=JSON.parse(input);
      if(request.identifiers[0]!=='person@example.com') process.exit(3);
      process.stdout.write(JSON.stringify({authorized:true,names:{'person@example.com':'Example'},contactKeys:{'person@example.com':'key'}}));
    });`, async helper => {
      const resolver = new MacContactsResolver({helperPath:helper, runner:runHelper});
      if (process.platform === 'darwin') {
        const result = await resolver.lookupDetails(['Person@example.com']);
        assert.equal(result.names.get('person@example.com'), 'Example');
        assert.equal(result.contactKeys.get('person@example.com'), 'key');
      } else {
        assert.equal((await runHelper(helper,['person@example.com'])).authorized,true);
      }
    });
});

test('Store Contacts executable preserves denied permission response without prompting', async () => {
  await withExecutable(`process.stdin.resume();process.stdin.on('end',()=>process.stdout.write('{"authorized":false,"names":{}}'));`, async helper => {
    assert.equal((await runHelper(helper, ['person@example.com'])).authorized, false);
  });
});

test('Store Contacts executable rejects malformed, oversized and failed responses', async () => {
  for (const body of [
    "process.stdout.write('invalid');",
    "process.stdout.write('x'.repeat(300*1024));",
    "process.exit(1);"
  ]) {
    await withExecutable(`process.stdin.resume();process.stdin.on('end',()=>{${body}});`, async helper => {
      await assert.rejects(runHelper(helper,['person@example.com']));
    });
  }
  await assert.rejects(runHelper('relative-helper', []), /absolute path/);
});

test('Store Contacts executable is bounded by a timeout', async () => {
  await withExecutable('process.stdin.resume();setInterval(()=>{},1000);', async helper => {
    await assert.rejects(runHelper(helper, []), error => error.killed === true);
  });
});

test('contact identifiers normalize emails and North American phone numbers', () => {
  assert.equal(normalizeContactIdentifier('MAILTO:Person@Example.COM'), 'person@example.com');
  assert.equal(normalizeContactIdentifier('+1 (555) 010-1000'), '5550101000');
  assert.equal(normalizeContactIdentifier('not a contact'), '');
});

test('macOS contact names are cached without exposing the address book', async () => {
  let calls = 0;
  const resolver = new MacContactsResolver({runner: async (_helper, identifiers) => {
    calls++;
    assert.deepEqual(identifiers, ['person@example.com']);
    return {authorized:true,names:{'person@example.com':'Readable Name'},
      contactKeys:{'person@example.com':'opaque-contact'}};
  }});
  const details = await resolver.lookupDetails(['Person@Example.com']);
  assert.equal(details.names.get('person@example.com'), 'Readable Name');
  assert.equal(details.contactKeys.get('person@example.com'), 'opaque-contact');
  assert.equal((await resolver.lookup(['person@example.com'])).get('person@example.com'), 'Readable Name');
  assert.equal(calls, 1);
});

test('denied Contacts access falls back quietly', async () => {
  const resolver = new MacContactsResolver({runner: async () => ({authorized:false,names:{}})});
  assert.deepEqual([...(await resolver.lookup(['person@example.com']))], []);
});

test('Contacts lookup waits for the background helper response file', async () => {
  let attempts = 0;
  const data = await waitForHelperResponse('/unused', {
    timeoutMS: 100,
    intervalMS: 0,
    sleep: async () => {},
    reader: async () => {
      attempts++;
      if (attempts < 3) throw Object.assign(new Error('not ready'), {code:'ENOENT'});
      return '{"authorized":true,"names":{}}';
    }
  });
  assert.equal(attempts, 3);
  assert.match(data, /authorized/);
});
