import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCHEMA_VERSION = 1;
const OPERATOR_ROLE = 'operator';
export const OPENCLAW_SCOPES = Object.freeze([
  'operator.approvals'
]);

function publicKeyRaw(publicKeyPem) {
  const key = crypto.createPublicKey(publicKeyPem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Beepster OpenClaw device key is not Ed25519');
  const der = key.export({type:'spki', format:'der'});
  if (!Buffer.isBuffer(der) || der.length < 32) throw new Error('Invalid Ed25519 public key');
  return der.subarray(der.length - 32);
}

export function publicKeyRawBase64UrlFromPem(publicKeyPem) {
  return publicKeyRaw(publicKeyPem).toString('base64url');
}

function deriveDeviceId(publicKeyPem) {
  return crypto.createHash('sha256').update(publicKeyRaw(publicKeyPem)).digest('hex');
}

export function signDevicePayload(privateKeyPem, payload) {
  return crypto.sign(null, Buffer.from(String(payload), 'utf8'), crypto.createPrivateKey(privateKeyPem)).toString('base64url');
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) throw new Error('Beepster OpenClaw device scopes are invalid');
  const normalized = [...new Set(scopes.map(value => String(value).trim()).filter(Boolean))].sort();
  if (normalized.some(scope => !OPENCLAW_SCOPES.includes(scope))) {
    throw new Error('Beepster refused an OpenClaw token with unexpected scopes');
  }
  return normalized;
}

export function createOpenClawDeviceAuthStore(options = {}) {
  const stateDir = path.resolve(options.stateDir || process.env.BEEPSTER_OPENCLAW_STATE_DIR ||
    path.join(os.homedir(), 'Library', 'Application Support', 'Beepster', 'openclaw'));
  const identityPath = path.join(stateDir, 'device-identity.json');
  const tokenPath = path.join(stateDir, 'device-auth.json');

  function ensureStateDir() {
    fs.mkdirSync(stateDir, {recursive:true, mode:0o700});
    const stat = fs.lstatSync(stateDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('OpenClaw state path must be a real directory');
    fs.chmodSync(stateDir, 0o700);
  }

  function readJson(filePath) {
    try {
      const stat = fs.lstatSync(filePath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('state file is not a regular file');
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      if (error && error.code === 'ENOENT') return null;
      throw new Error(`Could not read Beepster OpenClaw state: ${error.message}`);
    }
  }

  function writeJson(filePath, value) {
    ensureStateDir();
    const temporaryPath = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
    const fd = fs.openSync(temporaryPath, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.chmodSync(temporaryPath, 0o600);
    fs.renameSync(temporaryPath, filePath);
  }

  function validateIdentity(value) {
    if (!value || value.schemaVersion !== SCHEMA_VERSION || typeof value.deviceId !== 'string' ||
        typeof value.publicKeyPem !== 'string' || typeof value.privateKeyPem !== 'string') {
      throw new Error('Beepster OpenClaw device identity is invalid');
    }
    if (deriveDeviceId(value.publicKeyPem) !== value.deviceId) throw new Error('OpenClaw device identity does not match its key');
    const probe = Buffer.from('beepster-openclaw-device-key-check', 'utf8');
    const signature = crypto.sign(null, probe, crypto.createPrivateKey(value.privateKeyPem));
    if (!crypto.verify(null, probe, crypto.createPublicKey(value.publicKeyPem), signature)) {
      throw new Error('OpenClaw device keypair does not match');
    }
    return {deviceId:value.deviceId, publicKeyPem:value.publicKeyPem, privateKeyPem:value.privateKeyPem};
  }

  function loadOrCreateDeviceIdentity() {
    ensureStateDir();
    const existing = readJson(identityPath);
    if (existing) return validateIdentity(existing);
    const {publicKey, privateKey} = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding:{type:'spki', format:'pem'}, privateKeyEncoding:{type:'pkcs8', format:'pem'}
    });
    const identity = {schemaVersion:SCHEMA_VERSION, deviceId:deriveDeviceId(publicKey),
      publicKeyPem:publicKey, privateKeyPem:privateKey, createdAt:new Date().toISOString()};
    writeJson(identityPath, identity);
    return validateIdentity(identity);
  }

  function loadDeviceAuthToken(params) {
    const value = readJson(tokenPath);
    if (!value) return null;
    if (value.schemaVersion !== SCHEMA_VERSION || value.deviceId !== params.deviceId ||
        value.role !== params.role || typeof value.token !== 'string' || !value.token.trim()) {
      throw new Error('Beepster OpenClaw device token record is invalid');
    }
    return {token:value.token.trim(), scopes:normalizeScopes(value.scopes)};
  }

  function storeDeviceAuthToken(params) {
    if (params.role !== OPERATOR_ROLE) throw new Error('Beepster only stores OpenClaw operator tokens');
    const identity = loadOrCreateDeviceIdentity();
    if (params.deviceId !== identity.deviceId) throw new Error('OpenClaw token device mismatch');
    writeJson(tokenPath, {schemaVersion:SCHEMA_VERSION, deviceId:params.deviceId, role:params.role,
      token:String(params.token).trim(), scopes:normalizeScopes(params.scopes), updatedAt:new Date().toISOString()});
  }

  function clearDeviceAuthToken(params) {
    const value = readJson(tokenPath);
    if (!value || value.deviceId !== params.deviceId || value.role !== params.role) return;
    fs.unlinkSync(tokenPath);
  }

  return {stateDir, identityPath, tokenPath, loadOrCreateDeviceIdentity,
    signDevicePayload, publicKeyRawBase64UrlFromPem, loadDeviceAuthToken, storeDeviceAuthToken, clearDeviceAuthToken};
}
