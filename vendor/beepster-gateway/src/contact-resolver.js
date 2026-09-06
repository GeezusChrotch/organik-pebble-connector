import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const POSITIVE_CACHE_MS = 6 * 60 * 60 * 1000;
const NEGATIVE_CACHE_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

export function normalizeContactIdentifier(value) {
  const identifier = String(value || '').trim();
  if (!identifier) return '';
  if (identifier.includes('@')) return identifier.replace(/^mailto:/i, '').toLowerCase();
  const digits = identifier.replace(/\D/g, '');
  if (digits.length >= 7) return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return '';
}

const execFileAsync = promisify(execFile);

export async function waitForHelperResponse(responsePath, {
  timeoutMS = 8000,
  intervalMS = 50,
  reader = readFile,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
} = {}) {
  const deadline = Date.now() + timeoutMS;
  while (Date.now() <= deadline) {
    try {
      return await reader(responsePath, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await sleep(intervalMS);
  }
  throw new Error('Contacts helper response timed out');
}

async function runHelper(helperPath, identifiers) {
  const directory = await mkdtemp(join(tmpdir(), 'beepster-contacts-'));
  const requestPath = join(directory, 'request.json');
  const responsePath = join(directory, 'response.json');
  try {
    await writeFile(requestPath, JSON.stringify({ identifiers }), { mode: 0o600 });
    // `open -W` cannot reliably wait for this background-only helper and may
    // return before its response file exists. Launch it, then wait for the
    // file itself so the temporary request directory remains available.
    await execFileAsync('/usr/bin/open', ['-n', helperPath, '--args', '--lookup-file', requestPath, responsePath], {
      timeout: 3000,
      maxBuffer: 32 * 1024
    });
    const data = await waitForHelperResponse(responsePath);
    if (data.length > 256 * 1024) throw new Error('Contacts helper returned too much data');
    return JSON.parse(data);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export class MacContactsResolver {
  constructor({
    helperPath = process.env.BEEPSTER_CONTACT_HELPER || join(homedir(), 'Library/Application Support/Beepster/bin/Beepster Contacts.app'),
    runner = runHelper,
    now = () => Date.now()
  } = {}) {
    this.helperPath = helperPath;
    this.runner = runner;
    this.now = now;
    this.cache = new Map();
  }

  async lookup(values) {
    return (await this.lookupDetails(values)).names;
  }

  async lookupDetails(values) {
    if (process.platform !== 'darwin' && this.runner === runHelper) {
      return { names: new Map(), contactKeys: new Map() };
    }
    const identifiers = [...new Set(values.map(normalizeContactIdentifier).filter(Boolean))];
    if (!identifiers.length) return { names: new Map(), contactKeys: new Map() };
    const names = new Map();
    const contactKeys = new Map();
    const missing = [];
    const now = this.now();
    for (const identifier of identifiers) {
      const cached = this.cache.get(identifier);
      if (cached && cached.expiresAt > now) {
        if (cached.name) names.set(identifier, cached.name);
        if (cached.contactKey) contactKeys.set(identifier, cached.contactKey);
      } else {
        missing.push(identifier);
      }
    }
    if (!missing.length) return { names, contactKeys };
    try {
      if (this.runner === runHelper) await access(this.helperPath, constants.X_OK);
      const result = await this.runner(this.helperPath, missing);
      const resolvedNames = result?.authorized && result.names && typeof result.names === 'object' ? result.names : {};
      const resolvedKeys = result?.authorized && result.contactKeys && typeof result.contactKeys === 'object' ? result.contactKeys : {};
      for (const identifier of missing) {
        const name = String(resolvedNames[identifier] || '').trim();
        const contactKey = String(resolvedKeys[identifier] || '').trim();
        this.cache.delete(identifier);
        this.cache.set(identifier, {
          name,
          contactKey,
          expiresAt: now + (name ? POSITIVE_CACHE_MS : NEGATIVE_CACHE_MS)
        });
        if (name) names.set(identifier, name);
        if (contactKey) contactKeys.set(identifier, contactKey);
      }
      while (this.cache.size > MAX_CACHE_ENTRIES) this.cache.delete(this.cache.keys().next().value);
    } catch {
      // Contact enrichment is optional; Beeper's own label remains the honest fallback.
    }
    return { names, contactKeys };
  }
}
