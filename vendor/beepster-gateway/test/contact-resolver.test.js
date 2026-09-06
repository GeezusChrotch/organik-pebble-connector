import test from 'node:test';
import assert from 'node:assert/strict';
import { MacContactsResolver, normalizeContactIdentifier, waitForHelperResponse } from '../src/contact-resolver.js';

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
