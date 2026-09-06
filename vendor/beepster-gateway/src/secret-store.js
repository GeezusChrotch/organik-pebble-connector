import { execFile } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const helper = process.env.BEEPSTER_KEYCHAIN_HELPER || path.join(os.homedir(), 'Library/Application Support/Beepster/bin/beepster-keychain');

export function readSecret(account) {
  return new Promise((resolve) => {
    // A first Keychain access can remain pending while macOS asks the user to
    // authorize this helper. Killing the process on a short timer orphans that
    // dialog; launchd then restarts the gateway and creates a prompt loop.
    execFile(helper, ['get', account], (error, stdout) => {
      resolve(error ? '' : stdout.trim());
    });
  });
}

export function writeSecret(account, value) {
  return new Promise((resolve) => {
    const child = execFile(helper, ['set', account], (error) => {
      resolve(!error);
    });
    child.stdin?.end(value);
  });
}
