import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../../docs/setup/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1] || '';

function setupRuntime(hash = '') {
  const handlers = {};
  const elements = {
    form: { addEventListener(name, callback) { handlers[name] = callback; } },
    url: { value: '' },
    error: { textContent: '' }
  };
  const location = {
    hash,
    replaced: '',
    replace(value) { this.replaced = value; }
  };
  vm.runInNewContext(script, {
    URL,
    JSON,
    decodeURIComponent,
    encodeURIComponent,
    location,
    document: { getElementById(id) { return elements[id]; } }
  });
  return { handlers, elements, location };
}

test('public setup page contains no credential collection or external script', () => {
  assert.ok(script);
  assert.doesNotMatch(html, /BEEPER_ACCESS_TOKEN|BEEPSTER_GATEWAY_TOKEN|<script\s+src=/);
  assert.match(html, /does not receive your Beeper token/);
});

test('returning users go directly to their saved private gateway settings', () => {
  const state = encodeURIComponent(JSON.stringify({gatewayURL:'https://private.example',gatewayToken:'kept-on-phone'}));
  const { location } = setupRuntime(`#${state}`);
  assert.match(location.replaced, /^https:\/\/private\.example\/configure#/);
});

test('first-run setup accepts only HTTPS and adds the configure path', () => {
  const { handlers, elements, location } = setupRuntime();
  elements.url.value = 'http://private.example';
  handlers.submit({preventDefault(){}});
  assert.match(elements.error.textContent, /private HTTPS/);
  assert.equal(location.replaced, '');

  elements.url.value = 'https://private.example';
  handlers.submit({preventDefault(){}});
  assert.match(location.replaced, /^https:\/\/private\.example\/configure#/);
});
