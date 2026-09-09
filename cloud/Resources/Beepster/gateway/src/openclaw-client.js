import fs from 'node:fs';
import path from 'node:path';
import { createOpenClawDeviceAuthStore, OPENCLAW_SCOPES } from './openclaw-device-auth.js';
import { agentHome } from './agent-distribution.js';

const MAX_SUMMARY = 620;

function plainText(value, limit = MAX_SUMMARY) {
  let text = String(value || '').replace(/```[a-z0-9_-]*\n?/gi, '').replace(/```/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '').replace(/^\s*[-*+]\s+/gm, '• ').replace(/[*_~`]/g, '')
    .replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length > limit) text = `${text.slice(0, limit - 1).trimEnd()}…`;
  return text;
}

function approvalSummary(approval) {
  const request = approval && approval.request;
  const rawKind = plainText(approval?.approvalKind || approval?.kind || request?.kind || 'protected action', 50).replace(/\n/g, ' ');
  const kind = rawKind === 'system-agent' ? 'OpenClaw approval' :
    (rawKind === 'exec' ? 'Command approval' : (rawKind === 'plugin' ? 'Plugin approval' : rawKind));
  const description = approval?.summary || approval?.description || request?.summary || request?.description || request?.title || '';
  const command = approval?.rawCommand || approval?.command || request?.rawCommand || request?.command ||
    request?.systemRunPlan?.commandText || '';
  // Shell punctuation is meaningful: never strip underscores, stars, backticks,
  // or truncate the command being approved. Oversized cards are not actionable.
  const detail = description && command && description !== command ? `${description}\n\nCommand:\n${command}` : description || command;
  return detail ? `${kind}\n\n${detail}` : '';
}

function extractApprovals(result) {
  if (Array.isArray(result)) return result;
  return result && Array.isArray(result.approvals) ? result.approvals : [];
}

function approvalsOfKind(result, kind) {
  return extractApprovals(result).map(item => ({...item, approvalKind:kind}));
}

function readGatewayToken(configPath) {
  if (process.env.OPENCLAW_GATEWAY_TOKEN?.trim()) return process.env.OPENCLAW_GATEWAY_TOKEN.trim();
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const token = config?.gateway?.auth?.token;
  if (typeof token !== 'string' || !token.trim()) throw new Error('OpenClaw Gateway token is unavailable');
  return token.trim();
}

export function createOpenClawBridge(options = {}) {
  let client = null;
  let stopped = false;
  // Resolve only when bootstrap needs a token; paired/manual-token Store users
  // need no permission to an external configuration file.
  const configPath = () => options.configPath || process.env.BEEPSTER_OPENCLAW_CONFIG ||
    path.join(agentHome('openclaw'), 'openclaw.json');
  const gatewayUrl = options.gatewayUrl || process.env.BEEPSTER_OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';
  const deviceAuthStore = options.deviceAuthStore || createOpenClawDeviceAuthStore(options.deviceAuthOptions);
  const identity = deviceAuthStore.loadOrCreateDeviceIdentity();
  const storedAuth = deviceAuthStore.loadDeviceAuthToken({deviceId:identity.deviceId, role:'operator'});
  let connectionStatus = {state:'connecting', pairedTokenStored:Boolean(storedAuth)};

  const ready = (async () => {
    const [{GatewayClient}, {PROTOCOL_VERSION}, {readPairingConnectErrorDetails},
      {GATEWAY_CLIENT_CAPS, GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES}] = await Promise.all([
      import('@openclaw/gateway-client'), import('@openclaw/gateway-protocol/version'),
      import('@openclaw/gateway-protocol/connect-error-details'), import('@openclaw/gateway-protocol/client-info')
    ]);
    const sharedToken = storedAuth ? undefined : (process.env.OPENCLAW_GATEWAY_TOKEN?.trim() || readGatewayToken(configPath()));
    await new Promise((resolve) => {
      let settled = false;
      client = new GatewayClient({url:gatewayUrl, token:sharedToken, deviceIdentity:identity,
        hostDeps:{signDevicePayload:deviceAuthStore.signDevicePayload,
          publicKeyRawBase64UrlFromPem:deviceAuthStore.publicKeyRawBase64UrlFromPem,
          loadDeviceAuthToken:deviceAuthStore.loadDeviceAuthToken,
          storeDeviceAuthToken:deviceAuthStore.storeDeviceAuthToken,
          clearDeviceAuthToken:deviceAuthStore.clearDeviceAuthToken},
        minProtocol:PROTOCOL_VERSION, maxProtocol:PROTOCOL_VERSION,
        clientName:GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT, clientDisplayName:'Beepster Connector',
        clientVersion:'0.12.0', platform:process.platform, mode:GATEWAY_CLIENT_MODES.UI,
        role:'operator', scopes:[...OPENCLAW_SCOPES],
        caps:[GATEWAY_CLIENT_CAPS.APPROVALS, GATEWAY_CLIENT_CAPS.EXEC_APPROVALS],
        onHelloOk:() => { connectionStatus={state:'paired', pairedTokenStored:true}; if (!settled) { settled=true; resolve(); } },
        onConnectError:error => {
          const pairing = readPairingConnectErrorDetails(error?.details);
          connectionStatus = pairing ? {state:'pairing-required', pairedTokenStored:false, requestId:pairing.requestId || ''} :
            {state:'error', pairedTokenStored:Boolean(storedAuth)};
          if (!settled) { settled=true; resolve(); }
        }});
      client.start();
    });
  })();

  return {
    async request(method, params, requestOptions) {
      let timer;
      try {
        await Promise.race([ready, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('OpenClaw connection timed out')), 5000); })]);
      } finally { clearTimeout(timer); }
      if (stopped || !client) throw new Error('OpenClaw Gateway client is stopped');
      if (connectionStatus.state !== 'paired') throw new Error('OpenClaw Gateway pairing is required');
      return client.request(method, params, requestOptions);
    },
    status() { return {...connectionStatus}; },
    stop() { stopped=true; if (client) client.stop(); }
  };
}

export function createOpenClawApprovalClient(options = {}) {
  const bridge = options.bridge || createOpenClawBridge(options);
  return {
    status() { return bridge.status(); },
    async listApprovals() {
      const [execResult, pluginResult, systemAgentResult] = await Promise.all([
        bridge.request('exec.approval.list', {}, {timeoutMs:5000}),
        bridge.request('plugin.approval.list', {}, {timeoutMs:5000}),
        bridge.request('openclaw.approval.list', {}, {timeoutMs:5000})
      ]);
      return approvalsOfKind(execResult, 'exec').concat(
        approvalsOfKind(pluginResult, 'plugin'), approvalsOfKind(systemAgentResult, 'system-agent'))
        .filter(item => item && item.id).slice(0, 20).map(item => ({
          id:String(item.id),
          kind:item.approvalKind === 'plugin' || item.kind === 'plugin' ? 'plugin' :
            item.approvalKind === 'system-agent' || item.kind === 'system-agent' ? 'system-agent' : 'exec',
          summary:approvalSummary(item),
          alwaysScope:(item.allowedDecisions || item.request?.allowedDecisions || []).includes('allow-always') ?
            'Grant persistent permission in OpenClaw for this request. Future matching actions may run without asking; the command or plugin determines the matching scope.' : undefined,
          sessionKey:String(item.sessionKey || item.request?.sessionKey || ''),
          // Never infer a shared-session request's channel from its last delivery.
          sourceChannel:String(item.turnSourceChannel || item.request?.turnSourceChannel || item.origin?.channel || item.request?.origin?.channel ||
            item.origin?.provider || item.request?.origin?.provider || '').toLowerCase(),
          truncated:approvalSummary(item).length > 4000,
          createdAt:Number(item.createdAtMs || item.createdAt || item.ts || 0),
          expiresAt:Number(item.expiresAtMs || item.expiresAt || 0)
        }));
    },
    async resolveApproval(id, decision, sessionKey) {
      if (!['allow-once', 'deny', 'allow-always'].includes(decision)) throw new Error('Unsupported approval decision');
      const pending = await this.listApprovals();
      if (!pending.some(item => item.id === id)) throw new Error('The exact approval is no longer pending');
      const item = pending.find(item => item.id === id);
      if (decision === 'allow-always' && !item.alwaysScope) throw new Error('Always approval is unavailable for this request');
      if (sessionKey && item.sessionKey !== sessionKey) throw new Error('Approval session changed');
      let result;
      if (item.kind === 'system-agent') {
        result = await bridge.request('approval.resolve', {id, kind:item.kind, decision}, {timeoutMs:15000});
        if (result?.applied !== true || result.approval?.id !== id || result.approval?.decision !== decision) {
          throw new Error('OpenClaw did not confirm the exact decision');
        }
      } else {
        result = await bridge.request(`${item.kind}.approval.resolve`, {id, decision}, {timeoutMs:15000});
        if (result?.ok !== true || result.applied === false) throw new Error('OpenClaw did not confirm the exact decision');
      }
      return {ok:true, decision};
    },
    stop() { bridge.stop(); }
  };
}

export const openClawHelpers = {plainText, approvalSummary, extractApprovals};
