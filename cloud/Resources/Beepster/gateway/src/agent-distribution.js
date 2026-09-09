import path from 'node:path';
import os from 'node:os';

export const isStoreDistribution = () => process.env.BEEPSTER_DISTRIBUTION === 'app-store';
export function beepsterStateDir() {
  const selected = process.env.BEEPSTER_STATE_DIR;
  if (selected) {
    if (!path.isAbsolute(selected)) throw new Error('Beepster state directory must be absolute');
    return selected;
  }
  if (isStoreDistribution()) throw new Error('Store Connector must supply BEEPSTER_STATE_DIR');
  return path.join(os.homedir(), 'Library', 'Application Support', 'Beepster');
}
export function agentHome(provider) {
  const selected = process.env[provider === 'hermes' ? 'BEEPSTER_HERMES_HOME' : 'BEEPSTER_OPENCLAW_HOME'];
  if (selected) {
    if (!path.isAbsolute(selected)) throw new Error('Agent data folder must be absolute');
    return selected;
  }
  if (isStoreDistribution()) throw new Error(`Choose the ${provider} data folder in Connector first`);
  return path.join(os.homedir(), provider === 'hermes' ? '.hermes' : '.openclaw');
}
export function requireLocalAgentInstall() {
  if (isStoreDistribution()) throw new Error('Install or update the agent plugin from the agent itself, then reconnect in Connector. Store builds cannot install or patch agent code.');
}
