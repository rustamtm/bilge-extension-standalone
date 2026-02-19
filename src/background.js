import MessageRouter from './scripts/messageRouter.js';
import { ENV, isDev, isProd } from './lib/env.js';
import { logger as appLogger, createLogger } from './lib/logger.js';

import { extractJsonPayload } from './lib/json-utils.js';

// =============================================================================
// Bilge Logger (inline for ES module compatibility)
// =============================================================================
const BILGE_LOG_KEY = '__bilge_logs__';
const MAX_LOGS = 500;
const MAX_LOG_AGE_MS = 24 * 60 * 60 * 1000;

const LogLevel = { DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' };

function truncateForLog(value, maxLen = 500) {
  if (typeof value === 'string' && value.length > maxLen) {
    return value.slice(0, maxLen) + '...[truncated]';
  }
  return value;
}

function safeStringify(obj, maxLen = 1000) {
  try {
    const str = JSON.stringify(obj, (key, value) => {
      if (typeof value === 'string') return truncateForLog(value, 200);
      if (value instanceof Error) return { name: value.name, message: value.message };
      return value;
    });
    return truncateForLog(str, maxLen);
  } catch (e) {
    return String(obj);
  }
}

async function storeLog(entry) {
  try {
    const result = await chrome.storage.local.get(BILGE_LOG_KEY);
    let logs = result[BILGE_LOG_KEY] || [];
    logs.push(entry);
    const now = Date.now();
    logs = logs.filter(log => now - new Date(log.timestamp).getTime() < MAX_LOG_AGE_MS);
    if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
    await chrome.storage.local.set({ [BILGE_LOG_KEY]: logs });
  } catch (e) {
    console.error('[BilgeLogger] Failed to store log:', e);
  }
}

class BilgeLogger {
  constructor(source) { this.source = source; }
  async log(level, message, data = null) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      source: this.source,
      message: truncateForLog(String(message), 500)
    };
    if (data !== null && data !== undefined) entry.data = safeStringify(data);
    
    if (ENV.FEATURES.CONSOLE_LOGGING) {
      console.log(`[${entry.timestamp}][${this.source}][${level}] ${message}`, data || '');
    }
    
    await storeLog(entry);
    emitAgentLogTelemetry(entry);
    return entry;
  }
  debug(msg, data) { return this.log(LogLevel.DEBUG, msg, data); }
  info(msg, data) { return this.log(LogLevel.INFO, msg, data); }
  warn(msg, data) { return this.log(LogLevel.WARN, msg, data); }
  error(msg, data) { return this.log(LogLevel.ERROR, msg, data); }
}

async function getLogs(options = {}) {
  const { level, source, since, limit = 100 } = options;
  const result = await chrome.storage.local.get(BILGE_LOG_KEY);
  let logs = result[BILGE_LOG_KEY] || [];
  if (level) {
    const levels = Array.isArray(level) ? level : [level];
    logs = logs.filter(log => levels.includes(log.level));
  }
  if (source) {
    const sources = Array.isArray(source) ? source : [source];
    logs = logs.filter(log => sources.includes(log.source));
  }
  if (since) {
    const sinceTime = typeof since === 'number' ? since : new Date(since).getTime();
    logs = logs.filter(log => new Date(log.timestamp).getTime() >= sinceTime);
  }
  return logs.reverse().slice(0, limit);
}

async function clearLogs() {
  await chrome.storage.local.remove(BILGE_LOG_KEY);
  return { cleared: true };
}

async function exportLogs() {
  const logs = await getLogs({ limit: MAX_LOGS });
  return JSON.stringify(logs, null, 2);
}

const bilgeLogUtils = {
  getLogs,
  clearLogs,
  exportLogs
};

// Console utility for viewing logs
globalThis.bilgeLogs = {
  async view(opts = {}) {
    const logs = await getLogs({ limit: opts.limit || 50, ...opts });
    console.log('\n===== BILGE LOGS =====');
    logs.forEach(l => console.log(`[${l.level}] ${l.timestamp.slice(11,23)} [${l.source}] ${l.message}`, l.data || ''));
    console.log(`===== ${logs.length} logs =====\n`);
    return logs;
  },
  errors: () => globalThis.bilgeLogs.view({ level: 'ERROR' }),
  warnings: () => globalThis.bilgeLogs.view({ level: ['ERROR', 'WARN'] }),
  since: (min = 5) => globalThis.bilgeLogs.view({ since: Date.now() - min * 60000 }),
  clear: clearLogs,
  export: exportLogs
};

// Initialize loggers for different components
const bgLogger = new BilgeLogger('background');
const batchLogger = new BilgeLogger('batch-executor');
const msgLogger = new BilgeLogger('message-handler');

if (chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));
}

chrome.runtime.onInstalled.addListener(() => {
  bgLogger.info('Bilge AI Workspace Extension Installed');
  chrome.storage.local
    .get(['connectorPreset', 'brainProvider', 'brainModel'])
    .then((stored) => {
      const patch = {};
      if (!String(stored?.connectorPreset || '').trim()) patch.connectorPreset = DEFAULT_CONNECTOR_PRESET;
      if (!String(stored?.brainProvider || '').trim()) patch.brainProvider = DEFAULT_BRAIN_PROVIDER;
      if (!String(stored?.brainModel || '').trim()) patch.brainModel = DEFAULT_BRAIN_MODEL;
      if (Object.keys(patch).length > 0) {
        return chrome.storage.local.set(patch);
      }
      return null;
    })
    .catch(() => {});
  ensureRelayAgentId().catch(() => {});
  initializeRelayClient().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  initializeRelayClient().catch(() => {});
});

// =============================================================================
// Relay / Protocol V2 (WebSocket + JSON-RPC command bridge)
// =============================================================================

const MASTER_ACTIVE_KEY = 'masterActive';
const TRAINING_ALLOW_AI_SCRIPTS_KEY = 'trainingAllowAiScripts';
const TRAINING_MODE_STORAGE_KEY = 'trainingModeEnabled';
const RELAY_AGENT_ID_KEY = 'agentId';
const RELAY_ENDPOINT_KEY = 'endpoint';
const RELAY_WS_TOKEN_KEY = 'wsToken';
const RELAY_HEARTBEAT_INTERVAL_MS = 15000;
const RELAY_RECONNECT_BASE_MS = 2500;
const RELAY_RECONNECT_MAX_MS = 30000;
const RELAY_CONNECT_TIMEOUT_MS = 5000;
const TRACE_ID_LIMIT = 64;
const DOM_SKILL_MEMORY_KEY = '__bilge_dom_skill_memory_v1';
const DOM_SKILL_MEMORY_MAX = 300;
const DEFAULT_ANALYZE_ENDPOINT = 'http://127.0.0.1:18080/api/ai/analyze-screen';
const DEFAULT_CONNECTOR_PRESET = 'deepseek';
const DEFAULT_BRAIN_PROVIDER = ENV.DEFAULT_BRAIN_PROVIDER;
const DEFAULT_BRAIN_MODEL = ENV.DEFAULT_BRAIN_MODEL;
const ANALYZE_ENDPOINT_FALLBACKS = [
  DEFAULT_ANALYZE_ENDPOINT,
  'http://127.0.0.1:8000/api/ai/analyze-screen'
];
const RELAY_WS_FALLBACKS = [
  'ws://localhost:8787/ws/agent',
  'ws://127.0.0.1:8787/ws/agent',
  'ws://localhost:18080/ws/agent',
  'ws://127.0.0.1:18080/ws/agent'
];
const SELF_IMPROVEMENT_COMMAND_RE =
  /\b(self[-\s]?(improve|improvement|heal|healing|aware|awareness|repair)|maintenance\s+mode|fix\s+(yourself|self)|diagnose\s+(yourself|self)|self\s+check|restart\s+(yourself|self)|reboot\s+(yourself|self))\b/i;
const SELF_HEAL_DEFAULT_VALIDATION = {
  provider: 'openai',
  model: 'gpt-4o',
  fallbackProvider: 'deepseek',
  fallbackModel: 'deepseek-reasoner'
};

let relaySocket = null;
let relayReconnectTimer = null;
let relayReconnectAttempts = 0;
let relayHeartbeatTimer = null;
let relayLastUrl = '';
let relayAgentIdCache = '';
let relayConnectInFlight = null;

function toErrorMessage(err) {
  if (err && typeof err === 'object' && typeof err.message === 'string') return err.message;
  return String(err || 'Unknown error');
}

function sanitizeTraceId(raw, prefix = 'id') {
  const value = String(raw || '').trim();
  if (!value) return `${prefix}_${Date.now().toString(36)}`;
  return value.slice(0, TRACE_ID_LIMIT);
}

function normalizeAgentId(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  return value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, TRACE_ID_LIMIT);
}

function normalizeAnalyzeEndpoint(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    if (!url.pathname || url.pathname === '/') {
      url.pathname = '/api/ai/analyze-screen';
    }
    return url.toString();
  } catch (_err) {
    return '';
  }
}

function boolByDefault(value, defaultValue) {
  if (value === undefined || value === null) return Boolean(defaultValue);
  return Boolean(value);
}

function sanitizeDomSkillMemoryEntries(rawEntries) {
  const now = Date.now();
  const byKey = new Map();

  for (const raw of Array.isArray(rawEntries) ? rawEntries : []) {
    if (!raw || typeof raw !== 'object') continue;
    const key = String(raw.key || '').trim();
    if (!key) continue;

    const intent = String(raw.intent || '').trim().toLowerCase();
    if (!intent) continue;

    const lastUsed = Number(raw.lastUsed || raw.updatedAt || raw.createdAt || 0);
    if (!Number.isFinite(lastUsed) || lastUsed <= 0) continue;
    if (now - lastUsed > 45 * 24 * 60 * 60 * 1000) continue;

    byKey.set(key, {
      key,
      intent,
      host: String(raw.host || '').trim().toLowerCase(),
      pathPrefix: String(raw.pathPrefix || '/').trim() || '/',
      target: String(raw.target || '').trim(),
      successCount: Math.max(0, Number(raw.successCount || 0)),
      lastUsed,
      hints: raw.hints && typeof raw.hints === 'object' ? raw.hints : {},
    });
  }

  return Array.from(byKey.values())
    .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
    .slice(0, DOM_SKILL_MEMORY_MAX);
}

async function getDomSkillMemorySummary(limit = 8) {
  const safeLimit = Math.max(1, Math.min(20, Number(limit) || 8));
  const stored = await chrome.storage.local.get([DOM_SKILL_MEMORY_KEY]);
  const entries = sanitizeDomSkillMemoryEntries(stored?.[DOM_SKILL_MEMORY_KEY]);
  const byIntent = {};
  for (const entry of entries) {
    byIntent[entry.intent] = (byIntent[entry.intent] || 0) + 1;
  }
  const recent = entries.slice(0, safeLimit).map((entry) => ({
    intent: entry.intent,
    target: entry.target,
    host: entry.host,
    pathPrefix: entry.pathPrefix,
    successCount: entry.successCount,
    lastUsed: entry.lastUsed,
  }));

  return {
    ok: true,
    total: entries.length,
    byIntent,
    recent,
  };
}

async function clearDomSkillMemory() {
  const stored = await chrome.storage.local.get([DOM_SKILL_MEMORY_KEY]);
  const entries = sanitizeDomSkillMemoryEntries(stored?.[DOM_SKILL_MEMORY_KEY]);
  await chrome.storage.local.set({ [DOM_SKILL_MEMORY_KEY]: [] });
  return { ok: true, cleared: entries.length };
}

async function ensureRelayAgentId() {
  try {
    const stored = await chrome.storage.local.get([RELAY_AGENT_ID_KEY]);
    const saved = normalizeAgentId(stored?.[RELAY_AGENT_ID_KEY]);
    if (saved) {
      relayAgentIdCache = saved;
      return saved;
    }
    const generated = `agent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    relayAgentIdCache = generated;
    await chrome.storage.local.set({ [RELAY_AGENT_ID_KEY]: generated });
    return generated;
  } catch (_err) {
    const fallback = `agent_${Date.now().toString(36)}`;
    relayAgentIdCache = fallback;
    return fallback;
  }
}

async function getRelaySettings() {
  const keys = [
    MASTER_ACTIVE_KEY,
    TRAINING_ALLOW_AI_SCRIPTS_KEY,
    TRAINING_MODE_STORAGE_KEY,
    RELAY_AGENT_ID_KEY,
    RELAY_ENDPOINT_KEY,
    RELAY_WS_TOKEN_KEY,
    'goal',
    'connectorPreset',
    'brainProvider',
    'brainModel'
  ];
  const stored = await chrome.storage.local.get(keys);
  const endpoint = normalizeAnalyzeEndpoint(stored?.[RELAY_ENDPOINT_KEY]) || DEFAULT_ANALYZE_ENDPOINT;
  const agentId = normalizeAgentId(stored?.[RELAY_AGENT_ID_KEY]) || await ensureRelayAgentId();
  const masterActive = boolByDefault(stored?.[MASTER_ACTIVE_KEY], true);
  const trainingAllowAiScripts = boolByDefault(stored?.[TRAINING_ALLOW_AI_SCRIPTS_KEY], false);
  const trainingModeEnabled = boolByDefault(stored?.[TRAINING_MODE_STORAGE_KEY], false);
  const connectorPresetRaw = String(stored?.connectorPreset || '').trim();
  const brainProviderRaw = String(stored?.brainProvider || '').trim();
  const brainModelRaw = String(stored?.brainModel || '').trim();
  const connectorPreset = connectorPresetRaw || DEFAULT_CONNECTOR_PRESET;
  const brainProvider = brainProviderRaw || DEFAULT_BRAIN_PROVIDER;
  const brainModel = brainModelRaw || DEFAULT_BRAIN_MODEL;

  const defaultPatch = {};
  if (!connectorPresetRaw) defaultPatch.connectorPreset = connectorPreset;
  if (!brainProviderRaw) defaultPatch.brainProvider = brainProvider;
  if (!brainModelRaw) defaultPatch.brainModel = brainModel;
  if (Object.keys(defaultPatch).length > 0) {
    chrome.storage.local.set(defaultPatch).catch(() => {});
  }

  return {
    endpoint,
    wsToken: String(stored?.[RELAY_WS_TOKEN_KEY] || '').trim(),
    agentId,
    masterActive,
    trainingAllowAiScripts,
    trainingModeEnabled,
    goal: String(stored?.goal || '').trim(),
    connectorPreset,
    brainProvider,
    brainModel
  };
}

function buildWsUrlFromEndpoint(endpoint, agentId, wsToken) {
  try {
    const endpointUrl = new URL(endpoint);
    const protocol = endpointUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new URL(`${protocol}//${endpointUrl.host}/ws/agent`);
    if (agentId) ws.searchParams.set('agent_id', agentId);
    if (wsToken) ws.searchParams.set('token', wsToken);
    return ws.toString();
  } catch (_err) {
    return '';
  }
}

function buildRelayWsCandidates(settings) {
  const candidates = [];
  const agentId = normalizeAgentId(settings?.agentId || relayAgentIdCache || '');
  const wsToken = String(settings?.wsToken || '').trim();

  // Prefer explicit relay fallbacks (ex: localhost:8787) over endpoint-derived WS URLs.
  // The analyze endpoint default is often on :18080 and may accept WS connections but not act as a relay.
  for (const raw of RELAY_WS_FALLBACKS) {
    try {
      const url = new URL(raw);
      if (agentId) url.searchParams.set('agent_id', agentId);
      if (wsToken) url.searchParams.set('token', wsToken);
      candidates.push(url.toString());
    } catch (_err) {}
  }

  const fromEndpoint = buildWsUrlFromEndpoint(settings?.endpoint || '', agentId, wsToken);
  if (fromEndpoint) candidates.push(fromEndpoint);

  return Array.from(new Set(candidates));
}

function relaySendFrame(frame) {
  if (!relaySocket || relaySocket.readyState !== WebSocket.OPEN) return false;
  try {
    relaySocket.send(JSON.stringify(frame));
    return true;
  } catch (_err) {
    return false;
  }
}

function relaySendJsonRpcResult(id, result) {
  relaySendFrame({ jsonrpc: '2.0', id, result });
}

function relaySendJsonRpcError(id, errorMessage, code = -32000, details = {}) {
  relaySendFrame({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message: String(errorMessage || 'Unknown error'),
      data: details
    }
  });
}

function sendRelayAck(agentId, traceMeta, commandType) {
  relaySendFrame({
    type: 'agent.ack',
    agent_id: agentId,
    run_id: traceMeta.runId,
    command_id: traceMeta.commandId,
    command_type: commandType,
    timestamp: Date.now()
  });
}

function sendRelayResult(agentId, traceMeta, commandType, result = {}) {
  relaySendFrame({
    type: 'agent.result',
    agent_id: agentId,
    run_id: traceMeta.runId,
    command_id: traceMeta.commandId,
    command_type: commandType,
    timestamp: Date.now(),
    ...result
  });
}

function sendRelayError(agentId, traceMeta, commandType, errorMessage, retriable = false, details = {}) {
  relaySendFrame({
    type: 'agent.error',
    agent_id: agentId,
    run_id: traceMeta.runId,
    command_id: traceMeta.commandId,
    command_type: commandType,
    error: String(errorMessage || 'Unknown error'),
    retriable: Boolean(retriable),
    timestamp: Date.now(),
    ...details
  });
}

function emitAgentLogTelemetry(entry) {
  if (!entry || typeof entry !== 'object') return;
  const payload = {
    id: String(entry.id || ''),
    source: String(entry.source || ''),
    level: String(entry.level || 'INFO'),
    text: String(entry.message || ''),
    timestamp: entry.timestamp || new Date().toISOString(),
    data: entry.data
  };
  safeSendRuntimeMessage({ type: 'AGENT_LOG', payload });
  relaySendFrame({
    type: 'AGENT_LOG',
    agent_id: relayAgentIdCache || '',
    payload
  });
}

function emitExecutionProgressTelemetry(payload) {
  if (!payload || typeof payload !== 'object') return;
  relaySendFrame({
    type: 'EXECUTION_PROGRESS',
    agent_id: relayAgentIdCache || '',
    payload: {
      ...payload,
      timestamp: Date.now()
    }
  });
}

function stopRelayHeartbeat() {
  if (relayHeartbeatTimer) {
    clearInterval(relayHeartbeatTimer);
    relayHeartbeatTimer = null;
  }
}

function startRelayHeartbeat(agentId, wsRef) {
  stopRelayHeartbeat();
  relayHeartbeatTimer = setInterval(() => {
    if (!wsRef || wsRef.readyState !== WebSocket.OPEN || relaySocket !== wsRef) return;
    relaySendFrame({
      type: 'agent.heartbeat',
      agent_id: agentId,
      timestamp: Date.now()
    });
  }, RELAY_HEARTBEAT_INTERVAL_MS);
}

function clearRelayReconnectTimer() {
  if (relayReconnectTimer) {
    clearTimeout(relayReconnectTimer);
    relayReconnectTimer = null;
  }
}

function scheduleRelayReconnect() {
  clearRelayReconnectTimer();
  const delay = Math.min(
    RELAY_RECONNECT_MAX_MS,
    RELAY_RECONNECT_BASE_MS * Math.max(1, 2 ** Math.min(6, relayReconnectAttempts))
  );
  relayReconnectAttempts += 1;
  relayReconnectTimer = setTimeout(() => {
    relayReconnectTimer = null;
    connectRelay().catch((err) => {
      bgLogger.warn('Relay reconnect failed', { error: toErrorMessage(err) });
      scheduleRelayReconnect();
    });
  }, delay);
}

function getRelayStatus() {
  return {
    connected: Boolean(relaySocket && relaySocket.readyState === WebSocket.OPEN),
    connecting: Boolean(relayConnectInFlight) || Boolean(relaySocket && relaySocket.readyState === WebSocket.CONNECTING),
    wsUrl: relayLastUrl,
    readyState: relaySocket ? relaySocket.readyState : WebSocket.CLOSED,
    reconnectAttempts: relayReconnectAttempts,
    agentId: relayAgentIdCache || ''
  };
}

function normalizeRelayCommandType(raw) {
  const normalized = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[.\-/\s]+/g, '_');
  if (!normalized) return '';
  if (['CAPTURE_SCREEN', 'CAPTURE', 'SCREENSHOT', 'TAKE_SCREENSHOT'].includes(normalized)) {
    return 'CAPTURE_SCREEN';
  }
  if (['EXECUTE_ACTIONS', 'EXECUTE_ACTION', 'RUN_ACTIONS', 'EXECUTE_BATCH_ACTIONS'].includes(normalized)) {
    return 'EXECUTE_ACTIONS';
  }
  if (['APPLY_PRESETS', 'APPLY_PRESET', 'SET_PRESETS', 'UPDATE_PRESETS'].includes(normalized)) {
    return 'APPLY_PRESETS';
  }
  if (['TRAINING_PROBE', 'RUN_TRAINING_PROBE', 'PROBE'].includes(normalized)) {
    return 'TRAINING_PROBE';
  }
  if (['NATURAL_COMMAND', 'NL_COMMAND', 'EXECUTE_NATURAL', 'CORTEX_COMMAND'].includes(normalized)) {
    return 'NATURAL_COMMAND';
  }
  if (['SELF_IMPROVE', 'SELF_IMPROVEMENT', 'SELF_HEAL', 'SELF_HEALING', 'MAINTENANCE_COORDINATOR'].includes(normalized)) {
    return 'SELF_IMPROVE';
  }
  return '';
}

function normalizeBrainPersona(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return 'bilge_agent';
  if (value === 'bilge_web' || value === 'web' || value === 'app') return 'bilge_web';
  return 'bilge_agent';
}

function isSelfImprovementNaturalCommand(rawCommand) {
  const text = String(rawCommand || '').trim().toLowerCase();
  if (!text) return false;
  return SELF_IMPROVEMENT_COMMAND_RE.test(text);
}

function normalizeValidationProvider(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return '';
  if (value === 'chatgpt') return 'openai';
  if (value === 'google') return 'gemini';
  if (value === 'ds') return 'deepseek';
  return value;
}

function resolveSelfHealingValidationMode(payload = {}, settings = {}) {
  const requestedProvider = normalizeValidationProvider(
    payload.validationProvider || payload.provider
  );
  const requestedModel = String(payload.validationModel || payload.model || '').trim();

  if (requestedProvider === 'openai') {
    return {
      recommendedProvider: 'openai',
      recommendedModel: requestedModel || SELF_HEAL_DEFAULT_VALIDATION.model,
      fallbackProvider: SELF_HEAL_DEFAULT_VALIDATION.fallbackProvider,
      fallbackModel: SELF_HEAL_DEFAULT_VALIDATION.fallbackModel,
      note: 'OpenAI is preferred for strict multimodal self-healing validation.'
    };
  }
  if (requestedProvider === 'deepseek') {
    return {
      recommendedProvider: 'deepseek',
      recommendedModel: requestedModel || SELF_HEAL_DEFAULT_VALIDATION.fallbackModel,
      fallbackProvider: SELF_HEAL_DEFAULT_VALIDATION.provider,
      fallbackModel: SELF_HEAL_DEFAULT_VALIDATION.model,
      note: 'DeepSeek supports vision in Bilge, but OpenAI remains the stricter validation fallback.'
    };
  }
  if (requestedProvider === 'gemini') {
    return {
      recommendedProvider: 'gemini',
      recommendedModel: requestedModel || 'gemini-2.0-flash',
      fallbackProvider: SELF_HEAL_DEFAULT_VALIDATION.provider,
      fallbackModel: SELF_HEAL_DEFAULT_VALIDATION.model,
      note: 'Gemini selected explicitly for validation mode.'
    };
  }

  const configuredProvider = normalizeValidationProvider(settings.brainProvider);
  const configuredModel = String(settings.brainModel || '').trim();
  if (configuredProvider === 'openai' && configuredModel) {
    return {
      recommendedProvider: 'openai',
      recommendedModel: configuredModel,
      fallbackProvider: SELF_HEAL_DEFAULT_VALIDATION.fallbackProvider,
      fallbackModel: SELF_HEAL_DEFAULT_VALIDATION.fallbackModel,
      note: 'Using current OpenAI connector configuration for validation mode.'
    };
  }

  return {
    recommendedProvider: SELF_HEAL_DEFAULT_VALIDATION.provider,
    recommendedModel: SELF_HEAL_DEFAULT_VALIDATION.model,
    fallbackProvider: SELF_HEAL_DEFAULT_VALIDATION.fallbackProvider,
    fallbackModel: SELF_HEAL_DEFAULT_VALIDATION.fallbackModel,
    note: 'DeepSeek has vision in this runtime; OpenAI gpt-4o is still default for strict multimodal self-healing validation.'
  };
}

function buildSelfAwarenessComponents(settings, relayStatus, appSettings, contentReachable, tab) {
  const runtimeMcpBase = String(appSettings?.mcpBaseUrl || '').trim() || 'https://mcp.caravanflow.com';
  return [
    {
      id: 'bilge_agent_runtime',
      role: 'Primary Bilge Agent runtime in Chrome extension service worker',
      status: 'active',
      details: `agentId=${relayStatus.agentId || ''}`
    },
    {
      id: 'bilge_web_persona',
      role: 'Bilge Web chat persona (separate identity boundary)',
      status: 'isolated',
      details: 'Do not merge bilge_agent and bilge_web personas.'
    },
    {
      id: 'mcp_bridge',
      role: 'MCP tool bridge between UI and extension runtime',
      status: 'active',
      details: runtimeMcpBase
    },
    {
      id: 'relay_transport',
      role: 'WebSocket relay for agent orchestration',
      status: relayStatus.connected ? 'connected' : 'disconnected',
      details: relayStatus.wsUrl || '(not connected)'
    },
    {
      id: 'content_runtime',
      role: 'Content script DOM runtime on the active tab',
      status: contentReachable ? 'reachable' : 'unreachable',
      details: tab?.url ? String(tab.url) : 'No active tab'
    },
    {
      id: 'cortex_parser',
      role: 'Natural-language parser and action planner (BilgeCortex)',
      status: 'active',
      details: 'Supports parse/rewrite/recovery paths for natural commands.'
    },
    {
      id: 'analyze_endpoint',
      role: 'Vision/analyze endpoint for probe workflows',
      status: settings.endpoint ? 'configured' : 'default',
      details: settings.endpoint || DEFAULT_ANALYZE_ENDPOINT
    }
  ];
}

async function getBilgeAppSettingsSnapshot() {
  try {
    const stored = await chrome.storage.local.get(['bilge_app_settings']);
    const payload = stored?.bilge_app_settings;
    if (payload && typeof payload === 'object') return payload;
  } catch (_err) {}
  return {};
}

function parseIncomingRelayCommand(data) {
  if (!data || typeof data !== 'object') return null;

  const rawType = String(data.type || '');
  const rawMethod = String(data.method || '');
  const isJsonRpc = data.jsonrpc === '2.0';
  const isToolCall = rawMethod === 'tools/call' || rawType.toUpperCase() === 'MCP.TOOL_CALL';
  const rpcId = isJsonRpc ? data.id : null;

  let commandType = '';
  let payload = {};

  if (isToolCall) {
    const toolName = data.params?.name || data.name || '';
    commandType = normalizeRelayCommandType(toolName);
    payload = data.params?.arguments || data.arguments || {};
  } else if (isJsonRpc) {
    commandType = normalizeRelayCommandType(rawMethod);
    payload = data.params || {};
  } else {
    commandType = normalizeRelayCommandType(rawType || data.command || data.kind);
    payload = data.payload && typeof data.payload === 'object' ? data.payload : data;
  }

  if (!commandType) return null;
  if (!payload || typeof payload !== 'object') payload = {};

  const traceMeta = {
    runId: sanitizeTraceId(
      payload.run_id || payload.runId || data.run_id || data.runId,
      'run'
    ),
    commandId: sanitizeTraceId(
      payload.command_id || payload.commandId || data.command_id || data.commandId || data.id,
      'cmd'
    )
  };

  const agentId = normalizeAgentId(
    payload.agent_id || payload.agentId || data.agent_id || data.agentId || ''
  );

  return {
    type: commandType,
    payload,
    traceMeta,
    agentId,
    isJsonRpc,
    rpcId
  };
}

function coerceBoolean(value, fallback = false) {
  if (value === undefined || value === null) return Boolean(fallback);
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (!text) return Boolean(fallback);
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return Boolean(fallback);
}

function sanitizePresetPatch(rawPresets = {}) {
  const source = rawPresets && typeof rawPresets === 'object' ? rawPresets : {};
  const aliasMap = {
    current_goal: 'goal',
    analysis_endpoint: RELAY_ENDPOINT_KEY,
    endpoint: RELAY_ENDPOINT_KEY,
    agent_id: RELAY_AGENT_ID_KEY,
    agentId: RELAY_AGENT_ID_KEY,
    master_active: MASTER_ACTIVE_KEY,
    masterActive: MASTER_ACTIVE_KEY,
    training_allow_ai_scripts: TRAINING_ALLOW_AI_SCRIPTS_KEY,
    trainingAllowAiScripts: TRAINING_ALLOW_AI_SCRIPTS_KEY,
    connector_preset: 'connectorPreset',
    connectorPreset: 'connectorPreset',
    provider: 'brainProvider',
    brain_provider: 'brainProvider',
    brainProvider: 'brainProvider',
    model: 'brainModel',
    brain_model: 'brainModel',
    brainModel: 'brainModel',
    ws_token: RELAY_WS_TOKEN_KEY,
    wsToken: RELAY_WS_TOKEN_KEY
  };

  const allowed = new Set([
    'goal',
    RELAY_ENDPOINT_KEY,
    RELAY_AGENT_ID_KEY,
    MASTER_ACTIVE_KEY,
    TRAINING_ALLOW_AI_SCRIPTS_KEY,
    'connectorPreset',
    'brainProvider',
    'brainModel',
    RELAY_WS_TOKEN_KEY
  ]);

  const patch = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) continue;
    const mapped = aliasMap[key] || key;
    if (!allowed.has(mapped)) continue;

    if (mapped === MASTER_ACTIVE_KEY || mapped === TRAINING_ALLOW_AI_SCRIPTS_KEY) {
      patch[mapped] = coerceBoolean(value, false);
      continue;
    }
    if (mapped === RELAY_AGENT_ID_KEY) {
      const agentId = normalizeAgentId(value);
      if (agentId) patch[mapped] = agentId;
      continue;
    }
    if (mapped === RELAY_ENDPOINT_KEY) {
      const endpoint = normalizeAnalyzeEndpoint(value);
      if (endpoint) patch[mapped] = endpoint;
      continue;
    }

    patch[mapped] = String(value);
  }

  return patch;
}

async function applyRelayPresets(rawPresets = {}) {
  const patch = sanitizePresetPatch(rawPresets);
  const keys = Object.keys(patch);
  if (keys.length === 0) {
    return { ok: true, applied: false, changedKeys: [] };
  }

  const current = await chrome.storage.local.get(keys);
  const changedKeys = keys.filter((key) => JSON.stringify(current[key]) !== JSON.stringify(patch[key]));
  if (changedKeys.length > 0) {
    await chrome.storage.local.set(patch);
  }

  if (patch[RELAY_AGENT_ID_KEY]) {
    relayAgentIdCache = patch[RELAY_AGENT_ID_KEY];
  }

  const requiresReconnect = changedKeys.some((key) =>
    [RELAY_ENDPOINT_KEY, RELAY_AGENT_ID_KEY, RELAY_WS_TOKEN_KEY, MASTER_ACTIVE_KEY].includes(key)
  );
  if (requiresReconnect) {
    await connectRelay().catch(() => {});
  }

  return {
    ok: true,
    applied: changedKeys.length > 0,
    changedKeys,
    appliedPatch: patch
  };
}

async function queryActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0] ? tabs[0] : null;
}

async function captureVisibleTabDataUrl(windowId = null) {
  return await new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      const err = chrome.runtime.lastError;
      if (err) reject(err);
      else resolve(dataUrl);
    });
  });
}

const CONTENT_SCRIPT_RETRY_DELAY_MS = 120;
const CONTENT_SCRIPT_INJECT_FILES = ['content.js'];

async function isAllowedFileSchemeAccess() {
  try {
    if (!chrome?.extension?.isAllowedFileSchemeAccess) return null;
    return await new Promise((resolve) => {
      chrome.extension.isAllowedFileSchemeAccess((allowed) => resolve(Boolean(allowed)));
    });
  } catch (_err) {
    return null;
  }
}

async function tryInjectContentScript(tabId, frameId = 0) {
  const resolvedFrameId = typeof frameId === 'number' ? frameId : 0;
  let tabUrl = '';

  try {
    const tab = await new Promise((resolve) => {
      chrome.tabs.get(tabId, (t) => {
        void chrome.runtime.lastError;
        resolve(t || null);
      });
    });
    tabUrl = String(tab?.url || '');
  } catch (_err) {}

  if (tabUrl && isRestrictedUrl(tabUrl)) {
    throw new Error(
      `Cannot access DOM for restricted URL: ${tabUrl || '(unknown url)'} ` +
        `(Chrome blocks content scripts on internal pages / Web Store).`
    );
  }

  if (tabUrl && tabUrl.toLowerCase().startsWith('file://')) {
    const allowed = await isAllowedFileSchemeAccess();
    if (allowed === false) {
      throw new Error(
        'Cannot access DOM on file:// pages until you enable "Allow access to file URLs" ' +
          'in chrome://extensions -> Bilge AI Workspace -> Details.'
      );
    }
  }

  await new Promise((resolve, reject) => {
    try {
      chrome.scripting.executeScript(
        {
          target: { tabId, frameIds: [resolvedFrameId] },
          files: CONTENT_SCRIPT_INJECT_FILES,
          world: 'ISOLATED'
        },
        () => {
          const err = chrome.runtime.lastError;
          if (err) reject(err);
          else resolve();
        }
      );
    } catch (err) {
      reject(err);
    }
  });
}

async function sendTabMessage(tabId, payload) {
  return await new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, { frameId: 0 }, (response) => {
      const err = chrome.runtime.lastError;
      if (err) reject(err);
      else resolve(response);
    });
  });
}

async function injectContentScriptTopFrame(tabId) {
  // After install/update, existing tabs won't have manifest content scripts until navigation.
  // content.js is idempotent (guards itself) so it's safe to inject it on-demand.
  await tryInjectContentScript(tabId, 0);
  await new Promise((resolve) => setTimeout(resolve, CONTENT_SCRIPT_RETRY_DELAY_MS));
  return true;
}

async function sendContentMessageWithRetry(tabId, payload) {
  try {
    return await sendTabMessage(tabId, payload);
  } catch (err) {
    if (!shouldRetryAfterNoReceiver(err)) throw err;
    await injectContentScriptTopFrame(tabId);
    return await sendTabMessage(tabId, payload);
  }
}

async function collectDomValidationSummary(tabId) {
  try {
    const injected = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: () => {
        const nodes = Array.from(document.querySelectorAll('input, textarea, select, [contenteditable="true"]'));
        let requiredCount = 0;
        let invalidCount = 0;
        const invalidSelectors = [];

        function makeSelector(element) {
          try {
            const tag = String(element.tagName || '').toLowerCase();
            if (!tag) return '';
            const id = element.getAttribute('id');
            if (id) return `#${CSS.escape(id)}`;
            const name = element.getAttribute('name');
            if (name) return `${tag}[name="${CSS.escape(name)}"]`;
            const className = String(element.className || '').trim();
            if (className) {
              const first = className.split(/\s+/).filter(Boolean)[0];
              if (first) return `${tag}.${first}`;
            }
            return tag;
          } catch (_err) {
            return '';
          }
        }

        for (const element of nodes) {
          const isRequired = element.hasAttribute('required') || element.getAttribute('aria-required') === 'true';
          if (isRequired) requiredCount += 1;

          let invalid = false;
          try {
            if (typeof element.checkValidity === 'function') {
              invalid = !element.checkValidity();
            }
          } catch (_err) {}
          if (!invalid && element.getAttribute('aria-invalid') === 'true') {
            invalid = true;
          }
          if (invalid) {
            invalidCount += 1;
            if (invalidSelectors.length < 40) {
              invalidSelectors.push(makeSelector(element));
            }
          }
        }

        return {
          totalScanned: nodes.length,
          requiredCount,
          invalidCount,
          invalidSelectors
        };
      }
    });
    return injected?.[0]?.result || { totalScanned: 0, requiredCount: 0, invalidCount: 0, invalidSelectors: [] };
  } catch (_err) {
    return { totalScanned: 0, requiredCount: 0, invalidCount: 0, invalidSelectors: [] };
  }
}

async function buildStructuredDomSnapshot(tabId) {
  const [pageInfo, extracted, validation] = await Promise.all([
    sendContentMessageWithRetry(tabId, { type: 'GET_PAGE_INFO' }).catch(() => null),
    sendContentMessageWithRetry(tabId, { type: 'EXTRACT_FORM_FIELDS' }).catch(() => null),
    collectDomValidationSummary(tabId)
  ]);

  const fields = Array.isArray(extracted?.fields) ? extracted.fields : [];
  const requiredFieldCount = fields.filter((field) => field && field.isRequired === true).length;

  return {
    url: String(pageInfo?.url || extracted?.pageUrl || ''),
    title: String(pageInfo?.title || extracted?.pageTitle || ''),
    formFields: fields.slice(0, 300),
    summary: {
      totalFields: fields.length,
      requiredFields: requiredFieldCount,
      invalidFields: Number(validation?.invalidCount || 0),
      invalidSelectors: Array.isArray(validation?.invalidSelectors) ? validation.invalidSelectors : []
    }
  };
}

async function postAnalyzeScreen(payload, settings = null) {
  const relaySettings = settings || await getRelaySettings();
  
  // --- BRAIN ROUTING ---
  if (!payload.metadata?.brainProvider || !payload.metadata?.brainModel) {
    const routing = resolveRoutingWithIntelligentFallback(payload.goal || '', relaySettings, {
      url: payload.url,
      title: payload.title
    });
    
    payload.metadata = {
      ...payload.metadata,
      brainProvider: routing.provider,
      brainModel: routing.model,
      brainSystemPrompt: routing.systemPrompt,
      routingMeta: routing.meta
    };
  }

  const candidates = [];
  if (relaySettings?.endpoint) candidates.push(relaySettings.endpoint);
  for (const fallback of ANALYZE_ENDPOINT_FALLBACKS) {
    if (!candidates.includes(fallback)) candidates.push(fallback);
  }

  let lastError = null;
  for (const endpoint of candidates) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const text = await response.text();
      let body = null;
      try {
        body = text ? extractJsonPayload(text) : null;
      } catch (_err) {
        body = text;
      }
      if (response.ok) {
        return {
          ok: true,
          endpoint,
          status: response.status,
          body
        };
      }
      lastError = `Analyze endpoint ${endpoint} failed: ${response.status}`;
    } catch (err) {
      lastError = `Analyze endpoint ${endpoint} error: ${toErrorMessage(err)}`;
    }
  }

  return { ok: false, error: lastError || 'Analyze endpoint unavailable' };
}

async function handleCaptureScreenCommand(command, settings, agentId) {
  const tab = await queryActiveTab();
  if (!tab?.id) throw new Error('No active tab available for CAPTURE_SCREEN');

  const screenshot = await captureVisibleTabDataUrl(tab.windowId ?? null);
  const payload = command.payload || {};
  const goal = String(payload.goal || settings.goal || '').trim();
  const shouldAnalyze = payload.analyze === true || Boolean(goal);
  const includeSnapshot = payload.includeDomSnapshot === true || shouldAnalyze;
  const snapshot = includeSnapshot ? await buildStructuredDomSnapshot(tab.id).catch(() => null) : null;
  let analysis = null;

  if (shouldAnalyze) {
    const analyzePayload = {
      screenshot,
      url: String(snapshot?.url || tab.url || ''),
      title: String(snapshot?.title || tab.title || ''),
      goal: goal || 'Analyze active tab screenshot.',
      domSnapshot: snapshot,
      metadata: {
        source: 'bilge-chrome-extension',
        agentId,
        command: 'CAPTURE_SCREEN'
      }
    };
    analysis = await postAnalyzeScreen(analyzePayload, settings);
  }

  return {
    ok: true,
    command: 'CAPTURE_SCREEN',
    screenshot,
    page: { url: String(tab.url || ''), title: String(tab.title || '') },
    domSnapshot: snapshot,
    analysis
  };
}

async function handleExecuteActionsCommand(command, settings) {
  if (settings.masterActive === false) {
    throw new Error('MASTER_ACTIVE is OFF; EXECUTE_ACTIONS blocked.');
  }
  if (activeRuns.size > 0) {
    return { ok: false, retriable: true, error: `Agent busy with ${activeRuns.size} active run(s)` };
  }

  const payload = command.payload || {};
  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  if (actions.length === 0) {
    throw new Error('No valid actions provided for EXECUTE_ACTIONS');
  }

  const options = payload.options && typeof payload.options === 'object'
    ? { ...payload.options }
    : {};
  const allowAiScripts = settings.masterActive === true && settings.trainingAllowAiScripts === true;
  options.allowAiScripts = allowAiScripts;

  const result = await executeBatchActions(actions, options, command.traceMeta);
  return {
    ok: result?.ok !== false,
    command: 'EXECUTE_ACTIONS',
    runId: result?.runId || '',
    executedSteps: Number(result?.executedSteps || 0),
    cancelled: Boolean(result?.cancelled),
    allowAiScripts,
    error: result?.error || null
  };
}

async function handleTrainingProbeCommand(command, settings, agentId) {
  if (settings.masterActive === false) {
    throw new Error('MASTER_ACTIVE is OFF; TRAINING_PROBE blocked.');
  }

  const tab = await queryActiveTab();
  if (!tab?.id) throw new Error('No active tab available for TRAINING_PROBE');

  const payload = command.payload || {};
  const probe = String(payload.probe || payload.goal || '').trim();
  const goal = String(payload.goal || probe || settings.goal || 'Training probe').trim();
  const screenshot = await captureVisibleTabDataUrl(tab.windowId ?? null);
  const snapshot = await buildStructuredDomSnapshot(tab.id);

  let targetHtml = '';
  const targetSelector = String(payload.selector || '').trim();
  if (targetSelector) {
    const explored = await sendContentMessageWithRetry(tab.id, { type: 'EXPLORE_DOM', selector: targetSelector }).catch(() => null);
    targetHtml = String(explored?.html || '');
  }

  const analyzePayload = {
    screenshot,
    url: snapshot.url || String(tab.url || ''),
    title: snapshot.title || String(tab.title || ''),
    goal,
    trainingMode: true,
    probe: probe || goal,
    targetSelector,
    targetHtml,
    domSnapshot: snapshot,
    metadata: {
      source: 'bilge-chrome-extension',
      command: 'TRAINING_PROBE',
      agentId,
      trainingAllowAiScripts: settings.trainingAllowAiScripts === true,
      trainingModeEnabled: settings.trainingModeEnabled === true,
      connectorPreset: settings.connectorPreset || '',
      brainProvider: settings.brainProvider || '',
      brainModel: settings.brainModel || ''
    }
  };

  const analysis = await postAnalyzeScreen(analyzePayload, settings);
  return {
    ok: analysis?.ok === true,
    command: 'TRAINING_PROBE',
    goal,
    probe: probe || goal,
    snapshot,
    analysis
  };
}

function isScreenshotNaturalCommand(rawCommand) {
  const text = String(rawCommand || '').trim().toLowerCase();
  if (!text) return false;
  return /\b(screenshot|screen\s*shot|capture\s*(the\s*)?(screen|page)|take\s*(a\s*)?screenshot)\b/i.test(text);
}

function isAgentStatusNaturalCommand(rawCommand) {
  const text = String(rawCommand || '').trim().toLowerCase();
  if (!text) return false;
  // Keep this intentionally narrow so we don't steal real DOM commands.
  return /\b(status|progress|current\s+step|what\s+are\s+you\s+doing|what(?:'s| is)\s+(?:happening|going\s+on)|where\s+are\s+we|are\s+you\s+stuck)\b/i.test(text);
}

async function handleSelfImproveCommand(command, settings, agentId) {
  const payload = command?.payload && typeof command.payload === 'object' ? command.payload : {};
  const autoHeal = coerceBoolean(payload.autoHeal, true);
  const applyValidationMode = coerceBoolean(payload.applyValidationMode, false);
  const restartAfter = coerceBoolean(payload.restartAfter, false);
  const allowEnableMasterActive = coerceBoolean(payload.allowEnableMasterActive, false);
  const includeScreenshot = coerceBoolean(payload.includeScreenshot, false);
  const includeDomSnapshot = coerceBoolean(payload.includeDomSnapshot, true);
  const startedAt = Date.now();
  const issues = [];
  const actionsTaken = [];

  const relayBefore = getRelayStatus();
  let workingSettings = { ...settings };

  if (workingSettings.masterActive === false) {
    issues.push({
      code: 'master_inactive',
      severity: 'high',
      message: 'MASTER_ACTIVE is off; relay actions are blocked.'
    });
    if (autoHeal && allowEnableMasterActive) {
      await chrome.storage.local.set({ [MASTER_ACTIVE_KEY]: true }).catch(() => {});
      workingSettings.masterActive = true;
      actionsTaken.push({
        action: 'enable_master_active',
        status: 'applied',
        detail: 'Set masterActive=true from self-improvement mode.'
      });
    }
  }

  if (!relayBefore.connected && autoHeal && workingSettings.masterActive !== false) {
    try {
      await connectRelay();
      actionsTaken.push({
        action: 'relay_reconnect',
        status: 'applied',
        detail: 'Attempted reconnect for relay transport.'
      });
    } catch (err) {
      issues.push({
        code: 'relay_reconnect_failed',
        severity: 'medium',
        message: toErrorMessage(err)
      });
      actionsTaken.push({
        action: 'relay_reconnect',
        status: 'failed',
        detail: toErrorMessage(err)
      });
    }
  } else if (!relayBefore.connected && autoHeal && workingSettings.masterActive === false) {
    actionsTaken.push({
      action: 'relay_reconnect',
      status: 'skipped',
      detail: 'Skipped reconnect because masterActive is disabled.'
    });
  }

  const relayAfter = getRelayStatus();
  if (!relayAfter.connected) {
    issues.push({
      code: 'relay_disconnected',
      severity: 'medium',
      message: 'Relay websocket is not connected.'
    });
  }

  const appSettings = await getBilgeAppSettingsSnapshot();
  const validationMode = resolveSelfHealingValidationMode(payload, workingSettings);

  if (applyValidationMode) {
    const patch = sanitizePresetPatch({
      connectorPreset: validationMode.recommendedProvider,
      brainProvider: validationMode.recommendedProvider,
      brainModel: validationMode.recommendedModel
    });
    if (Object.keys(patch).length > 0) {
      await chrome.storage.local.set(patch).catch(() => {});
      actionsTaken.push({
        action: 'apply_validation_mode',
        status: 'applied',
        detail: `${patch.brainProvider || ''}/${patch.brainModel || ''}`.replace(/^\/|\/$/g, '')
      });
      workingSettings = { ...workingSettings, ...patch };
    }
  }

  const tab = await queryActiveTab().catch(() => null);
  if (!tab?.id) {
    issues.push({
      code: 'no_active_tab',
      severity: 'high',
      message: 'No active tab available for content runtime checks.'
    });
  }

  let contentPing = { ok: false, error: 'No active tab available.' };
  if (tab?.id) {
    try {
      const ping = await sendContentMessageWithRetry(tab.id, { type: '__BILGE_PING__' });
      const ok = ping?.ok === true;
      contentPing = ok ? { ok: true } : { ok: false, error: 'Unexpected content ping response.' };
      if (!ok) {
        issues.push({
          code: 'content_runtime_unreachable',
          severity: 'high',
          message: 'Content runtime did not return a healthy ping.'
        });
      }
    } catch (err) {
      const msg = toErrorMessage(err);
      contentPing = { ok: false, error: msg };
      issues.push({
        code: 'content_runtime_unreachable',
        severity: 'high',
        message: msg
      });
    }
  }

  let domSnapshot = null;
  if (tab?.id && includeDomSnapshot) {
    domSnapshot = await buildStructuredDomSnapshot(tab.id).catch(() => null);
  }

  let screenshot = '';
  if (tab?.id && includeScreenshot) {
    screenshot = await captureVisibleTabDataUrl(tab.windowId ?? null).catch(() => '');
  }

  const selfAwareness = {
    identity: {
      persona: 'bilge_agent',
      runtime: 'chrome_extension',
      separatedFromBilgeWeb: true,
      agentId: agentId || relayAfter.agentId || relayAgentIdCache || '',
      source: 'background.self_improvement_mode'
    },
    access: {
      browserAutomation: true,
      mcpBridge: true,
      relayDispatch: true,
      screenshotCapture: true,
      shellAccessViaMcp: true
    },
    boundaries: {
      bilgeAgent: 'Chrome extension runtime persona used for relay + MCP tooling.',
      bilgeWeb: 'Chat persona in Bilge web UI; must stay logically separate.'
    },
    components: buildSelfAwarenessComponents(
      workingSettings,
      relayAfter,
      appSettings,
      contentPing.ok === true,
      tab
    )
  };

  const suggestedNextActions = [
    'Use talk_to_bilge_agent_brain for targeted browser actions after diagnostics.',
    'Use dispatch_agent_command with TRAINING_PROBE to collect richer form + DOM telemetry.',
    `Run multimodal validation with ${validationMode.recommendedProvider}/${validationMode.recommendedModel} before high-risk automation.`
  ];
  if (!relayAfter.connected) {
    suggestedNextActions.unshift('Restore relay websocket service (127.0.0.1:8787 or 127.0.0.1:18080), then re-run self-improvement mode.');
  }
  if (!contentPing.ok) {
    suggestedNextActions.unshift('Open a normal http/https page and ensure content script is reachable, then re-run self-improvement mode.');
  }

  const summary =
    issues.length === 0
      ? 'Self-improvement check complete. Runtime is healthy and ready for autonomous maintenance.'
      : `Self-improvement check found ${issues.length} issue(s). ${autoHeal ? 'Auto-heal attempted where safe.' : 'Auto-heal disabled.'}`;

  if (restartAfter) {
    actionsTaken.push({
      action: 'restart_extension',
      status: 'scheduled',
      detail: 'Extension reload scheduled after self-improvement response.'
    });
    setTimeout(() => {
      try {
        chrome.runtime.reload();
      } catch (_err) {}
    }, 250);
  }

  return {
    ok: true,
    command: 'SELF_IMPROVE',
    protocol: 'self-improvement-v1',
    persona: 'bilge_agent',
    summary,
    durationMs: Date.now() - startedAt,
    selfAwareness,
    diagnostics: {
      autoHeal,
      restartAfter,
      relayBefore,
      relayAfter,
      contentPing,
      activeTab: tab
        ? { id: Number(tab.id || 0), url: String(tab.url || ''), title: String(tab.title || '') }
        : null,
      domSnapshot,
      issues,
      actionsTaken
    },
    validationMode,
    result: {
      ready: issues.length === 0,
      issueCount: issues.length,
      suggestedNextActions
    },
    restartScheduled: restartAfter,
    ...(screenshot ? { screenshot } : {})
  };
}

// =============================================================================
// AI Routing & Cortex Integration
// =============================================================================
const ROUTING_MODES = Object.freeze({ BUILTIN: 'builtin', CORTEX: 'cortex' });
const DEFAULT_ROUTING_MODE = ROUTING_MODES.BUILTIN;

/**
 * Resolves provider/model based on routing mode with intelligent fallbacks
 * @param {string} userCommand - The user's input command
 * @param {object} settings - Current settings from storage
 * @param {object} context - Optional context (url, title)
 * @returns {object} { mode, provider, model, systemPrompt, executor, meta }
 */
function resolveRoutingWithIntelligentFallback(userCommand, settings, context = {}) {
  const routingMode = settings.routingMode || DEFAULT_ROUTING_MODE;
  const defaultProvider = settings.brainProvider || ENV.DEFAULT_BRAIN_PROVIDER;
  const defaultModel = settings.brainModel || ENV.DEFAULT_BRAIN_MODEL;

  // ═══════════════════════════════════════════════════════════════
  // LEVEL 1: Try configured routing mode (Cortex or Built-in)
  // ═══════════════════════════════════════════════════════════════

  if (routingMode === ROUTING_MODES.CORTEX && globalThis.Cortex?.analyzeIntent) {
    try {
      const intentInfo = globalThis.Cortex.analyzeIntent(userCommand);
      const strategy = globalThis.Cortex.selectStrategy(intentInfo, { 
        provider: settings.brainProvider, 
        model: settings.brainModel 
      }, {
        preferSpeed: settings.cortexPreferSpeed,
        preferCost: settings.cortexPreferCost
      });

      if (strategy?.provider) {
        const systemPrompt = globalThis.CortexExtConfig?.renderTemplate(
          settings.brainSystemTemplate || globalThis.CortexExtConfig.DEFAULT_BRAIN_SYSTEM_TEMPLATE,
          {
            goal: userCommand,
            url: context.url || '',
            title: context.title || '',
            mode: settings.executionMode || 'batch',
            allow_script_actions: settings.allowScriptActions || false,
            cortex_intent: intentInfo?.category || '',
            cortex_strategy: `${strategy.provider}/${strategy.model}`,
            cortex_hints: strategy?.strategy || ''
          }
        );

        return {
          mode: 'cortex',
          provider: strategy.provider,
          model: strategy.model,
          systemPrompt,
          executor: 'standard',
          meta: { intent: intentInfo, strategy }
        };
      }
    } catch (e) {
      console.warn('[Routing] Cortex failed, trying builtin fallback:', e);
    }
  }

  // Built-in / Fallback AI
  if (routingMode === ROUTING_MODES.BUILTIN || routingMode === ROUTING_MODES.CORTEX) {
    const systemPrompt = globalThis.CortexExtConfig?.renderTemplate(
      settings.brainSystemTemplate || globalThis.CortexExtConfig.DEFAULT_BRAIN_SYSTEM_TEMPLATE,
      {
        goal: userCommand,
        url: context.url || '',
        title: context.title || '',
        mode: settings.executionMode || 'batch',
        allow_script_actions: settings.allowScriptActions || false,
        cortex_intent: '',
        cortex_strategy: '',
        cortex_hints: ''
      }
    );
    return {
      mode: 'builtin',
      provider: defaultProvider,
      model: defaultModel,
      systemPrompt,
      executor: 'standard',
      meta: { source: 'storage' }
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // LEVEL 2: Intelligent DOM Engine (no AI needed for simple patterns)
  // ═══════════════════════════════════════════════════════════════

  const simplePatterns = [
    { pattern: /^fill\s+(form|all|fields?)/i, action: 'fill_form' },
    { pattern: /^fill\s+(.+?)\s+(?:with|as|to)\s+(.+)$/i, action: 'fill_field' },
    { pattern: /^click\s+(.+)$/i, action: 'click' },
    { pattern: /^type\s+(.+?)\s+(?:into|in)\s+(.+)$/i, action: 'type' },
    { pattern: /^scroll\s+(down|up|to\s+.+)$/i, action: 'scroll' },
    { pattern: /^submit/i, action: 'submit' }
  ];

  for (const { pattern, action } of simplePatterns) {
    const match = userCommand.match(pattern);
    if (match) {
      return {
        mode: 'intelligent_dom',
        provider: null,
        model: null,
        executor: 'bilge_execution_engine',
        action,
        params: match.slice(1),
        meta: { pattern: pattern.source, direct: true }
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // LEVEL 3: DOM Engine with intent inference (Last Resort)
  // ═══════════════════════════════════════════════════════════════

  return {
    mode: 'intelligent_dom_inference',
    provider: null,
    model: null,
    executor: 'bilge_execution_engine',
    action: 'intelligent',
    intent: userCommand,
    meta: { inferred: true }
  };
}

/**
 * Executes a command based on routing decision
 */
async function executeWithRouting(routing, context) {
  const { tabId } = context;

  // AI-BASED EXECUTION
  if (routing.executor === 'standard' && routing.provider) {
    // Current flow for handleNaturalCommand still uses content script parsing
    // for direct browser commands. We only route to postAnalyzeScreen if it's broad.
    return null; // Signals to continue with legacy flow for now or use the routing metadata
  }

  // DIRECT DOM EXECUTION (No AI)
  if (routing.executor === 'bilge_execution_engine') {
    const data = {};
    if (routing.action === 'fill_form') {
      const profile = await loadProfile();
      data.profile = profile;
    } else if (routing.action === 'fill_field') {
      data.selector = routing.params[0];
      data.value = routing.params[1];
    } else if (routing.action === 'click') {
      data.target = routing.params[0];
    } else if (routing.action === 'intelligent') {
      data.text = routing.intent;
    }

    return await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { 
        type: 'ENGINE_EXECUTE', 
        intent: { type: routing.action }, 
        data 
      }, (res) => {
        resolve(res || { ok: false, error: 'No response from execution engine' });
      });
    });
  }

  return { ok: false, error: 'No valid executor resolved' };
}

/**
 * Handle natural language commands via cortex
 * Supports commands like "scroll up", "scroll down", "click on Submit", etc.
 */
async function handleNaturalCommand(command, settings) {
  if (settings.masterActive === false) {
    throw new Error('MASTER_ACTIVE is OFF; NATURAL_COMMAND blocked.');
  }

  const payload = command.payload || {};
  const commandText = String(payload.command || payload.text || payload.input || '').trim();
  const requestedPersona = normalizeBrainPersona(
    payload.persona || payload.brain || payload.targetPersona || payload.target
  );
  const strictPersona = coerceBoolean(payload.strictPersona, true);

  if (!commandText) {
    throw new Error('No command text provided for NATURAL_COMMAND');
  }
  if (strictPersona && requestedPersona !== 'bilge_agent') {
    throw new Error(
      `NATURAL_COMMAND relay is scoped to Bilge Agent persona. Requested persona "${requestedPersona}" should use Bilge Web chat channel.`
    );
  }

  if (isSelfImprovementNaturalCommand(commandText)) {
    const targetAgentId = settings.agentId || relayAgentIdCache || await ensureRelayAgentId();
    return await handleSelfImproveCommand(
      {
        ...command,
        type: 'SELF_IMPROVE',
        payload: {
          ...payload,
          command: commandText,
          persona: requestedPersona,
          source: payload.source || 'natural_command.self_improvement'
        }
      },
      settings,
      targetAgentId
    );
  }

  const tab = await queryActiveTab();
  if (!tab?.id) {
    throw new Error('No active tab available for NATURAL_COMMAND');
  }

  msgLogger.info('Processing natural language command', { command: commandText, persona: requestedPersona });
  const startedAt = Date.now();

  if (isAgentStatusNaturalCommand(commandText)) {
    const runs = [];
    for (const [runId, state] of activeRuns.entries()) {
      const entry = {
        runId,
        cancelled: Boolean(state?.cancelled),
        startTime: Number(state?.startTime || 0),
        ageMs: Number(state?.startTime ? Date.now() - state.startTime : 0),
        tabId: typeof state?.tabId === 'number' ? state.tabId : null,
        windowId: typeof state?.windowId === 'number' ? state.windowId : null,
        pageState: null
      };
      if (typeof state?.tabId === 'number') {
        entry.pageState = await readRunStateFromPage(state.tabId, runId);
      }
      runs.push(entry);
    }

    return {
      ok: true,
      protocol: 'natural-command-v3-status',
      catchMode: 'status',
      command: 'NATURAL_COMMAND',
      persona: requestedPersona,
      input: commandText,
      result: {
        activeRuns: runs,
        activeRunCount: runs.length,
        relay: getRelayStatus()
      },
      durationMs: Date.now() - startedAt
    };
  }

  // --- NEW: INTELLIGENT ROUTING ---
  const routing = resolveRoutingWithIntelligentFallback(commandText, settings, {
    url: tab.url,
    title: tab.title
  });

  const routingResult = await executeWithRouting(routing, { tabId: tab.id });
  if (routingResult) {
    return {
      ok: routingResult.ok !== false,
      protocol: 'natural-command-v3-engine',
      catchMode: routing.mode,
      command: 'NATURAL_COMMAND',
      persona: requestedPersona,
      input: commandText,
      result: routingResult,
      durationMs: Date.now() - startedAt,
      routingMeta: routing.meta
    };
  }

  if (isScreenshotNaturalCommand(commandText)) {
    const screenshot = await captureVisibleTabDataUrl(tab.windowId ?? null);
    return {
      ok: true,
      protocol: 'natural-command-v2',
      catchMode: 'direct',
      command: 'NATURAL_COMMAND',
      persona: requestedPersona,
      input: commandText,
      result: {
        success: true,
        action: 'take_screenshot',
        screenshot
      }
    };
  }

  // Send to content script for parsing/execution with self-healing + catch mode.
  let result = null;
  try {
    result = await sendContentMessageWithRetry(tab.id, {
      type: 'EXECUTE_NATURAL_COMMAND',
      command: commandText,
      persona: requestedPersona
    });
  } catch (err) {
    result = { error: toErrorMessage(err), catchMode: 'transport-error', protocol: 'natural-command-v2' };
  }

  if (result?.error) {
    return {
      ok: false,
      protocol: result?.protocol || 'natural-command-v2',
      catchMode: result?.catchMode || 'failed',
      command: 'NATURAL_COMMAND',
      persona: requestedPersona,
      input: commandText,
      error: result.error,
      durationMs: Date.now() - startedAt
    };
  }

  return {
    ok: true,
    protocol: result?.protocol || 'natural-command-v2',
    catchMode: result?.catchMode || 'direct',
    recovered: result?.selfHealed === true,
    commandMemoryHit: result?.commandMemoryHit === true,
    command: 'NATURAL_COMMAND',
    persona: requestedPersona,
    input: commandText,
    result,
    durationMs: Date.now() - startedAt
  };
}

async function dispatchRelayCommand(command) {
  const settings = await getRelaySettings();
  relayAgentIdCache = settings.agentId || relayAgentIdCache;
  const agentId = settings.agentId || relayAgentIdCache || await ensureRelayAgentId();

  if (command.agentId && command.agentId !== agentId) {
    return {
      ok: true,
      ignored: true,
      reason: `Command targeted to ${command.agentId}, local agent is ${agentId}`
    };
  }

  if (command.type === 'APPLY_PRESETS') {
    return await applyRelayPresets(command.payload?.presets || command.payload || {});
  }
  if (command.type === 'CAPTURE_SCREEN') {
    return await handleCaptureScreenCommand(command, settings, agentId);
  }
  if (command.type === 'EXECUTE_ACTIONS') {
    return await handleExecuteActionsCommand(command, settings);
  }
  if (command.type === 'TRAINING_PROBE') {
    return await handleTrainingProbeCommand(command, settings, agentId);
  }
  if (command.type === 'SELF_IMPROVE') {
    return await handleSelfImproveCommand(command, settings, agentId);
  }
  if (command.type === 'NATURAL_COMMAND') {
    return await handleNaturalCommand(command, settings);
  }
  throw new Error(`Unsupported command type: ${command.type}`);
}

async function handleRelaySocketMessage(event, wsRef) {
  if (relaySocket !== wsRef) return;
  if (!event || typeof event.data !== 'string') return;

  let data = null;
  try {
    data = JSON.parse(event.data);
  } catch (_err) {
    return;
  }
  if (!data || typeof data !== 'object') return;

  const rawType = String(data.type || '').trim().toUpperCase();
  if (rawType === 'PING' || rawType === 'AGENT_PING' || rawType === 'AGENT_HEARTBEAT' || rawType === 'AGENT.HEARTBEAT') {
    relaySendFrame({
      type: 'agent.heartbeat',
      agent_id: relayAgentIdCache || '',
      timestamp: Date.now()
    });
    return;
  }

  const command = parseIncomingRelayCommand(data);
  if (!command) return;

  const localAgentId = relayAgentIdCache || await ensureRelayAgentId();
  if (!command.isJsonRpc) {
    sendRelayAck(localAgentId, command.traceMeta, command.type);
  }

  try {
    const result = await dispatchRelayCommand(command);
    if (command.isJsonRpc && command.rpcId !== null && command.rpcId !== undefined) {
      relaySendJsonRpcResult(command.rpcId, result);
    } else {
      sendRelayResult(localAgentId, command.traceMeta, command.type, { success: result?.ok !== false, result });
    }
  } catch (err) {
    const message = toErrorMessage(err);
    if (command.isJsonRpc && command.rpcId !== null && command.rpcId !== undefined) {
      relaySendJsonRpcError(command.rpcId, message);
    } else {
      sendRelayError(localAgentId, command.traceMeta, command.type, message);
    }
  }
}

function disconnectRelay(reason = 'manual') {
  clearRelayReconnectTimer();
  stopRelayHeartbeat();
  if (relaySocket) {
    const current = relaySocket;
    relaySocket = null;
    try {
      current.close(1000, reason);
    } catch (_err) {}
  }
}

function relayHostFromWsUrl(wsUrl) {
  try {
    return new URL(wsUrl).host;
  } catch (_err) {
    return wsUrl;
  }
}

function prioritizeRelayCandidates(candidates) {
  const unique = Array.from(new Set((Array.isArray(candidates) ? candidates : []).filter(Boolean)));
  if (!relayLastUrl) return unique;
  const preferred = unique.filter((candidate) => candidate === relayLastUrl);
  const rest = unique.filter((candidate) => candidate !== relayLastUrl);
  return [...preferred, ...rest];
}

function bindRelaySocket(ws, wsUrl) {
  ws.onmessage = (event) => {
    handleRelaySocketMessage(event, ws).catch((err) => {
      bgLogger.warn('Relay message handling failed', { error: toErrorMessage(err) });
    });
  };

  ws.onclose = (event) => {
    if (relaySocket !== ws) return;
    relaySocket = null;
    stopRelayHeartbeat();
    safeSendRuntimeMessage({
      type: 'CONNECTION_STATUS',
      payload: {
        status: 'OFF',
        code: Number(event?.code || 0),
        reason: String(event?.reason || ''),
        agentId: relayAgentIdCache || ''
      }
    });
    scheduleRelayReconnect();
  };

  ws.onerror = (err) => {
    if (relaySocket !== ws) return;
    bgLogger.warn('Relay WebSocket error', { wsUrl, error: toErrorMessage(err) });
  };
}

function dialRelaySocket(wsUrl, timeoutMs = RELAY_CONNECT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let ws = null;
    let settled = false;
    let timeoutHandle = null;

    const finish = (ok, value) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (ws) {
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
      }
      if (ok) resolve(value);
      else reject(value);
    };

    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      finish(false, err instanceof Error ? err : new Error(toErrorMessage(err)));
      return;
    }

    timeoutHandle = setTimeout(() => {
      try {
        ws.close(1000, 'connect_timeout');
      } catch (_err) {}
      finish(false, new Error(`Relay connect timeout (${timeoutMs}ms) for ${wsUrl}`));
    }, timeoutMs);

    ws.onopen = () => {
      finish(true, ws);
    };
    ws.onerror = () => {
      finish(false, new Error(`Relay socket error for ${wsUrl}`));
    };
    ws.onclose = (event) => {
      finish(false, new Error(`Relay closed before open (${Number(event?.code || 0)}) for ${wsUrl}`));
    };
  });
}

function publishRelayConnected(wsUrl, ws) {
  relaySocket = ws;
  relayLastUrl = wsUrl;
  relayReconnectAttempts = 0;
  clearRelayReconnectTimer();
  bindRelaySocket(ws, wsUrl);
  startRelayHeartbeat(relayAgentIdCache || '', ws);
  relaySendFrame({
    type: 'AGENT_HELLO',
    agent_id: relayAgentIdCache || '',
    extension_version: chrome.runtime.getManifest()?.version || 'unknown',
    capabilities: ['CAPTURE_SCREEN', 'EXECUTE_ACTIONS', 'APPLY_PRESETS', 'TRAINING_PROBE', 'NATURAL_COMMAND', 'SELF_IMPROVE', 'protocol_v2'],
    timestamp: Date.now()
  });
  safeSendRuntimeMessage({
    type: 'CONNECTION_STATUS',
    payload: {
      status: 'ON',
      host: relayHostFromWsUrl(wsUrl),
      agentId: relayAgentIdCache || ''
    }
  });
}

async function connectRelayOnce() {
  clearRelayReconnectTimer();
  const settings = await getRelaySettings();
  relayAgentIdCache = settings.agentId || relayAgentIdCache;

  if (settings.masterActive === false) {
    disconnectRelay('master_off');
    return getRelayStatus();
  }

  const candidates = prioritizeRelayCandidates(buildRelayWsCandidates(settings));
  if (candidates.length === 0) {
    throw new Error('No relay websocket candidates configured');
  }

  if (relaySocket) {
    const oldSocket = relaySocket;
    relaySocket = null;
    stopRelayHeartbeat();
    try {
      oldSocket.close(1000, 'reconnect');
    } catch (_err) {}
  }

  const failures = [];
  for (const wsUrl of candidates) {
    try {
      const ws = await dialRelaySocket(wsUrl, RELAY_CONNECT_TIMEOUT_MS);
      publishRelayConnected(wsUrl, ws);
      return getRelayStatus();
    } catch (err) {
      const errorMessage = toErrorMessage(err);
      failures.push(`${wsUrl} => ${errorMessage}`);
      bgLogger.warn('Relay candidate failed', { wsUrl, error: errorMessage });
    }
  }

  const reason = failures.join(' | ') || 'Unknown relay connection error';
  safeSendRuntimeMessage({
    type: 'CONNECTION_STATUS',
    payload: {
      status: 'OFF',
      reason,
      agentId: relayAgentIdCache || ''
    }
  });
  throw new Error(`Unable to connect relay: ${reason}`);
}

async function connectRelay() {
  if (relayConnectInFlight) {
    return relayConnectInFlight;
  }
  relayConnectInFlight = (async () => {
    try {
      return await connectRelayOnce();
    } finally {
      relayConnectInFlight = null;
    }
  })();
  return relayConnectInFlight;
}

async function initializeRelayClient() {
  try {
    await ensureRelayAgentId();
    await connectRelay();
  } catch (err) {
    bgLogger.warn('Relay init failed', { error: toErrorMessage(err) });
    scheduleRelayReconnect();
  }
}

// =============================================================================
// Batch Action Executor Configuration
// =============================================================================

const HUMANIZED_DELAY_BASE_DEFAULT_MS = 220;
const HUMANIZED_DELAY_JITTER_DEFAULT_MS = 260;

// Active run tracking for cancellation
const activeRuns = new Map();

/**
 * Generate a unique run ID
 */
function generateRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Cancel an active run
 */
function safeSendRuntimeMessage(message) {
  if (message?.type === 'BATCH_RUN_UPDATE' && message?.payload) {
    emitExecutionProgressTelemetry(message.payload);
  }
  try {
    chrome.runtime.sendMessage(message, () => {
      // Ignore "Receiving end does not exist" when sidepanel is closed.
      void chrome.runtime.lastError;
    });
  } catch (_err) {}
}

async function markRunCancelledInPage(tabId, runId) {
  if (!tabId || !runId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [runId],
      func: (rid) => {
        const key = '__bilgeCancelledRuns';
        if (!window[key] || typeof window[key] !== 'object') window[key] = {};
        window[key][rid] = true;

        const stateKey = '__bilgeBatchRunState';
        if (window[stateKey] && window[stateKey][rid]) {
          try {
            window[stateKey][rid].cancelled = true;
            window[stateKey][rid].status = 'cancelled';
            window[stateKey][rid].updatedAt = Date.now();
            window[stateKey][rid].seq = Number(window[stateKey][rid].seq || 0) + 1;
          } catch (_err) {}
        }
        return { ok: true };
      }
    });
  } catch (_err) {}
}

async function clearRunStateInPage(tabId, runId) {
  if (!tabId || !runId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [runId],
      func: (rid) => {
        try {
          if (window.__bilgeBatchRunState) delete window.__bilgeBatchRunState[rid];
          if (window.__bilgeCancelledRuns) delete window.__bilgeCancelledRuns[rid];
        } catch (_err) {}
        return { ok: true };
      }
    });
  } catch (_err) {}
}

async function readRunStateFromPage(tabId, runId) {
  if (!tabId || !runId) return null;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [runId],
      func: (rid) => {
        try {
          const state = (window.__bilgeBatchRunState || {})[rid];
          return state && typeof state === 'object' ? state : null;
        } catch (_err) {
          return null;
        }
      }
    });
    return results?.[0]?.result ?? null;
  } catch (_err) {
    return null;
  }
}

async function cancelRun(runId) {
  const state = activeRuns.get(runId);
  if (!state) return false;
  state.cancelled = true;

  const tabId = state.tabId;
  if (typeof tabId === 'number') {
    await markRunCancelledInPage(tabId, runId);
  }

  safeSendRuntimeMessage({ type: 'BATCH_RUN_UPDATE', payload: { runId, status: 'cancelling', cancelled: true } });
  return true;
}

const RESTRICTED_SCHEME_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'devtools://'
];

function isRestrictedUrl(rawUrl) {
  const url = String(rawUrl || '').trim().toLowerCase();
  if (!url) return false;
  if (RESTRICTED_SCHEME_PREFIXES.some((prefix) => url.startsWith(prefix))) return true;

  // Chrome Web Store blocks content scripts regardless of host permissions.
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'chromewebstore.google.com') return true;
    if (parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore')) return true;
  } catch (_err) {}

  return false;
}

function shouldRetryAfterNoReceiver(err) {
  const message = String(err?.message || '');
  return (
    message.includes('Could not establish connection') ||
    message.includes('Receiving end does not exist')
  );
}

function sendMessageToFrame(tabId, frameId, payload, cb) {
  chrome.tabs.sendMessage(tabId, payload, { frameId }, (response) => {
    const lastErr = chrome.runtime.lastError;
    cb(lastErr, response);
  });
}

function injectContentScript(tabId, frameId, cb) {
  (async () => {
    try {
      await tryInjectContentScript(tabId, frameId);
      // Let the content script register its onMessage listener before retrying.
      setTimeout(() => cb(null), CONTENT_SCRIPT_RETRY_DELAY_MS);
    } catch (err) {
      cb(err instanceof Error ? err : new Error(String(err || 'Failed to inject content script')));
    }
  })();
}

function getAllFrames(tabId, cb) {
  // Requires "webNavigation" permission.
  chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
    const lastErr = chrome.runtime.lastError;
    cb(lastErr, Array.isArray(frames) ? frames : []);
  });
}

function isNotFoundError(response) {
  const msg = String(response?.error || '');
  return msg.includes(' not found') || msg.includes('Selector ') && msg.includes(' not found');
}

function isInvalidSelectorError(response) {
  const msg = String(response?.error || '').toLowerCase();
  return msg.includes('invalid selector');
}

function isFatalContentError(response) {
  // Errors that should not be retried across frames.
  if (!response || typeof response !== 'object') return false;
  const msg = String(response.error || '');
  if (!msg) return false;
  if (isInvalidSelectorError(response)) return true;
  if (msg.includes('Missing selector')) return true;
  if (msg.includes('Missing code')) return true;
  return false;
}

const router = new MessageRouter();

// =============================================================================
// HOT RELOAD (Development only)
// =============================================================================
const DEV_HOT_RELOAD_TAB_KEY = '__bilge_dev_hot_reload_active_tab_id__';

async function maybeReloadActiveTabAfterHotReload() {
  if (!ENV?.FEATURES?.HOT_RELOAD) return;
  try {
    const result = await chrome.storage.local.get(DEV_HOT_RELOAD_TAB_KEY);
    const tabId = result?.[DEV_HOT_RELOAD_TAB_KEY];
    if (typeof tabId !== 'number') return;

    await chrome.storage.local.remove(DEV_HOT_RELOAD_TAB_KEY);
    chrome.tabs.reload(tabId, { bypassCache: true }, () => {});
  } catch {}
}

// If the dev server triggered an extension reload, refresh the active tab so
// updated content scripts get injected without manual page refresh.
void maybeReloadActiveTabAfterHotReload();

if (ENV.FEATURES.HOT_RELOAD) {
  try {
    const reloadWs = new WebSocket('ws://localhost:35729');
    reloadWs.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'reload') {
        console.log('[Bilge][Dev] Hot reload triggered...');
        try {
          const tab = await new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              resolve(tabs && tabs[0] ? tabs[0] : null);
            });
          });
          const tabId = tab && typeof tab.id === 'number' ? tab.id : null;
          if (typeof tabId === 'number') {
            await chrome.storage.local.set({ [DEV_HOT_RELOAD_TAB_KEY]: tabId });
          }
        } catch {}
        chrome.runtime.reload();
      }
    };
    reloadWs.onerror = () => {
      // Silent error if server not running
    };
  } catch (e) {
    // websocket might not be supported or restricted
  }
}

// Relay messages from sidepanel to content script of the active tab
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle log retrieval requests
  if (request?.to === 'LOGGER') {
    (async () => {
      try {
        if (request.action === 'get_logs') {
          const logs = await bilgeLogUtils.getLogs(request.options || {});
          sendResponse({ logs });
        } else if (request.action === 'clear_logs') {
          await bilgeLogUtils.clearLogs();
          sendResponse({ cleared: true });
        } else if (request.action === 'export_logs') {
          const json = await bilgeLogUtils.exportLogs();
          sendResponse({ json });
        } else {
          sendResponse({ error: 'Unknown logger action' });
        }
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }

  if (request?.to === 'CONTENT_SCRIPT') {
    const msgType = String(request.payload?.type || 'unknown');
    msgLogger.info(`Relaying to content script: ${msgType}`, { selector: request.payload?.selector });

    (async () => {
      try {
        const tab = await new Promise((resolve) => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            resolve(tabs && tabs[0] ? tabs[0] : null);
          });
        });

        if (!tab?.id) {
          msgLogger.warn('No active tab found for content script relay');
          sendResponse({ error: 'No active tab found' });
          return;
        }

        if (isRestrictedUrl(tab.url)) {
          sendResponse({
            error:
              `Cannot access DOM for restricted URL: ${tab.url || '(unknown url)'} ` +
              `(Chrome blocks content scripts on internal pages / Web Store).`
          });
          return;
        }

        const payload = request.payload;
        const msgType = String(payload?.type || '');

        // Fast path: GET_PAGE_INFO is inherently top-frame; avoid noisy multi-frame searching.
        if (msgType === 'GET_PAGE_INFO' || msgType === '__BILGE_PING__') {
          const first = await new Promise((resolve) => {
            sendMessageToFrame(tab.id, 0, payload, (err, response) => resolve({ err, response }));
          });

          if (!first.err) {
            sendResponse(first.response ?? { error: 'No response from content script.' });
            return;
          }

          if (!shouldRetryAfterNoReceiver(first.err)) {
            sendResponse({ error: first.err.message });
            return;
          }

          // Common during navigation: content script not injected yet. Inject in the top frame and retry.
          const injected = await new Promise((resolve) => {
            injectContentScript(tab.id, 0, (injectErr) => resolve(injectErr || null));
          });

          if (injected) {
            sendResponse({ error: injected.message });
            return;
          }

          const retry = await new Promise((resolve) => {
            sendMessageToFrame(tab.id, 0, payload, (err, response) => resolve({ err, response }));
          });

          if (retry.err) {
            sendResponse({ error: retry.err.message });
            return;
          }

          sendResponse(retry.response ?? { error: 'No response from content script.' });
          return;
        }

        // Multi-frame search: try top-frame first, then other frames (including cross-origin iframes).
        const frames = await new Promise((resolve) => {
          getAllFrames(tab.id, (err, f) => resolve({ err, frames: f }));
        });

        if (frames.err) {
          // If frame enumeration fails, fall back to a single-frame send (previous behavior).
          sendMessageToFrame(tab.id, 0, payload, (err, response) => {
            if (err) sendResponse({ error: err.message });
            else sendResponse(response ?? { error: 'No response from content script.' });
          });
          return;
        }

        const frameIds = Array.from(
          new Set(
            (frames.frames || [])
              .map((f) => (typeof f?.frameId === 'number' ? f.frameId : null))
              .filter((id) => typeof id === 'number')
          )
        );

        // Deterministic: top frame first.
        frameIds.sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : a - b));
        if (!frameIds.includes(0)) frameIds.unshift(0);

        let lastResponse = null;
        let lastError = null;

        for (let i = 0; i < frameIds.length; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          const attempt = await new Promise((resolve) => {
            sendMessageToFrame(tab.id, frameIds[i], payload, (err, response) => resolve({ err, response }));
          });

          if (attempt.err && shouldRetryAfterNoReceiver(attempt.err)) {
            // eslint-disable-next-line no-await-in-loop
            const injectErr = await new Promise((resolve) => {
              injectContentScript(tab.id, frameIds[i], (err) => resolve(err || null));
            });

            if (!injectErr) {
              // eslint-disable-next-line no-await-in-loop
              const retry = await new Promise((resolve) => {
                sendMessageToFrame(tab.id, frameIds[i], payload, (err, response) => resolve({ err, response }));
              });
              attempt.err = retry.err;
              attempt.response = retry.response;
            } else {
              attempt.err = injectErr;
            }
          }

          if (attempt.err) {
            lastError = attempt.err;
            continue;
          }

          lastResponse = attempt.response ?? null;
          if (isFatalContentError(lastResponse)) {
            sendResponse(lastResponse);
            return;
          }

          // Prefer a success response from any frame. For selector-based ops, a "not found" in the
          // top frame is not terminal: the element might live in a cross-origin iframe.
          const ok = lastResponse && typeof lastResponse === 'object' && !lastResponse.error;
          if (ok) {
            sendResponse(lastResponse);
            return;
          }

          if (!isNotFoundError(lastResponse)) {
            // If it's an error other than "not found", treat it as terminal (first match wins).
            sendResponse(lastResponse || { error: 'No response from content script.' });
            return;
          }
        }

        if (lastResponse) {
          sendResponse(lastResponse);
          return;
        }

        if (lastError) {
          sendResponse({ error: lastError.message });
          return;
        }

        sendResponse({ error: 'No response from content scripts (all frames).' });
      } catch (err) {
        const message = err && err.message ? err.message : String(err || 'Unknown error');
        sendResponse({ error: message });
      }
    })();
    return true; // Keep channel open for async response
  }

  if (request?.to === 'BACKGROUND') {
    if (request.payload?.action === 'relay_status') {
      sendResponse({ ok: true, ...getRelayStatus() });
      return false;
    }

    if (request.payload?.action === 'get_relay_settings') {
      (async () => {
        try {
          const settings = await getRelaySettings();
          sendResponse({
            ok: true,
            settings: {
              agentId: settings.agentId,
              endpoint: settings.endpoint,
              masterActive: settings.masterActive,
              trainingAllowAiScripts: settings.trainingAllowAiScripts,
              trainingModeEnabled: settings.trainingModeEnabled,
              goal: settings.goal,
              connectorPreset: settings.connectorPreset,
              brainProvider: settings.brainProvider,
              brainModel: settings.brainModel,
            },
            ...getRelayStatus(),
          });
        } catch (err) {
          sendResponse({ ok: false, error: toErrorMessage(err), ...getRelayStatus() });
        }
      })();
      return true;
    }

    if (request.payload?.action === 'relay_reconnect') {
      connectRelay()
        .then(() => sendResponse({ ok: true, ...getRelayStatus() }))
        .catch((err) => sendResponse({ ok: false, error: toErrorMessage(err), ...getRelayStatus() }));
      return true;
    }

    if (request.payload?.action === 'relay_disconnect') {
      disconnectRelay('manual_disconnect');
      sendResponse({ ok: true, ...getRelayStatus() });
      return false;
    }

    if (request.payload?.action === 'relay_ping') {
      const sent = relaySendFrame({
        type: 'agent.heartbeat',
        agent_id: relayAgentIdCache || '',
        timestamp: Date.now()
      });
      sendResponse({ ok: sent, ...getRelayStatus() });
      return false;
    }

    if (request.payload?.action === 'relay_dispatch_command') {
      (async () => {
        try {
          const requestedType = String(request.payload?.type || request.payload?.commandType || '').trim();
          const normalizedType = normalizeRelayCommandType(requestedType);
          if (!normalizedType) {
            sendResponse({
              ok: false,
              error: `Unsupported command type: ${requestedType || '(empty)'}`,
              ...getRelayStatus()
            });
            return;
          }

          const rawPayload = request.payload?.payload;
          const payload = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
            ? rawPayload
            : {};
          const command = {
            type: normalizedType,
            payload,
            traceMeta: {
              runId: sanitizeTraceId(request.payload?.runId, 'run'),
              commandId: sanitizeTraceId(request.payload?.commandId, 'cmd')
            },
            agentId: normalizeAgentId(request.payload?.agentId || ''),
            isJsonRpc: false,
            rpcId: null
          };

          const result = await dispatchRelayCommand(command);
          sendResponse({
            ok: true,
            dispatched: true,
            commandType: normalizedType,
            result,
            ...getRelayStatus()
          });
        } catch (err) {
          sendResponse({
            ok: false,
            error: toErrorMessage(err),
            ...getRelayStatus()
          });
        }
      })();
      return true;
    }

    if (request.type === 'GET_SELF_HEALING_STATS') {
      (async () => {
        try {
          const key = '__bilge_recovery_telemetry_v1';
          const result = await chrome.storage.local.get([key]);
          const data = result[key] || {
            totalRecoveries: 0,
            successCount: 0,
            failureCount: 0,
            avgDuration: 0,
            byStrategy: {}
          };
          
          // Calculate success rate
          const successRate = data.totalRecoveries > 0 
            ? Math.round((data.successCount / data.totalRecoveries) * 100) 
            : 0;

          sendResponse({ ok: true, stats: { ...data, successRate } });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
      })();
      return true;
    }

    if (request.payload?.action === 'get_dom_skill_memory_summary') {
      (async () => {
        try {
          const limit = Number(request.payload?.limit || 8);
          const summary = await getDomSkillMemorySummary(limit);
          sendResponse(summary);
        } catch (err) {
          sendResponse({ ok: false, error: toErrorMessage(err), total: 0, byIntent: {}, recent: [] });
        }
      })();
      return true;
    }

    if (request.payload?.action === 'get_page_fields') {
      (async () => {
        try {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          const tab = tabs[0];
          if (!tab?.id) {
            sendResponse({ error: 'No active tab found' });
            return;
          }
          const extraction = await extractFormFields(tab.id);
          sendResponse(extraction);
        } catch (err) {
          sendResponse({ error: toErrorMessage(err) });
        }
      })();
      return true;
    }

    if (request.payload?.action === 'set_routing_mode') {
      (async () => {
        try {
          const mode = request.payload.mode === 'cortex' ? 'cortex' : 'builtin';
          const settingsResult = await chrome.storage.local.get(['bilge_app_settings']);
          const settings = settingsResult.bilge_app_settings || {};
          settings.routingMode = mode;
          await chrome.storage.local.set({ bilge_app_settings: settings });
          sendResponse({ ok: true, routingMode: mode });
        } catch (err) {
          sendResponse({ ok: false, error: toErrorMessage(err) });
        }
      })();
      return true;
    }

    if (request.payload?.action === 'get_routing_mode') {
      (async () => {
        try {
          const settingsResult = await chrome.storage.local.get(['bilge_app_settings']);
          const settings = settingsResult.bilge_app_settings || {};
          sendResponse({ routingMode: settings.routingMode || DEFAULT_ROUTING_MODE });
        } catch (err) {
          sendResponse({ routingMode: DEFAULT_ROUTING_MODE });
        }
      })();
      return true;
    }

    if (request.payload?.action === 'clear_dom_skill_memory') {
      (async () => {
        try {
          const result = await clearDomSkillMemory();
          sendResponse(result);
        } catch (err) {
          sendResponse({ ok: false, error: toErrorMessage(err), cleared: 0 });
        }
      })();
      return true;
    }

    if (request.payload?.action === 'reload_extension') {
      console.log('Reloading extension...');
      chrome.runtime.reload();
      sendResponse({ status: 'reloading' });
      return false;
    }

    if (request.payload?.action === 'system_log') {
      const { message, type, metadata } = request.payload;
      // Store the log from content script
      const contentScriptLogger = new BilgeLogger(metadata?.source || 'content-script');
      contentScriptLogger.log(type || 'INFO', message, metadata).catch(() => {});
      sendResponse({ ok: true });
      return false;
    }

    if (request.payload?.action === 'take_screenshot') {
      msgLogger.info('Taking screenshot');
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        const err = chrome.runtime.lastError;
        if (err) {
          msgLogger.error(`Screenshot failed: ${err.message}`);
          sendResponse({ error: err.message });
        } else {
          msgLogger.info('Screenshot captured successfully', { size: dataUrl?.length || 0 });
          sendResponse({ screenshot: dataUrl });
        }
      });
      return true; // async response
    }

    if (request.payload?.action === 'execute_natural_command') {
      const commandText = String(request.payload?.command || request.payload?.text || '').trim();
      const requestedPersona = normalizeBrainPersona(
        request.payload?.persona || request.payload?.brain || request.payload?.targetPersona || request.payload?.target
      );
      const strictPersona = coerceBoolean(request.payload?.strictPersona, true);
      (async () => {
        try {
          const settings = await getRelaySettings().catch(() => ({ masterActive: true }));
          const result = await handleNaturalCommand(
            { type: 'NATURAL_COMMAND', payload: { command: commandText, persona: requestedPersona, strictPersona } },
            settings
          );
          sendResponse(result);
        } catch (err) {
          sendResponse({
            ok: false,
            command: 'NATURAL_COMMAND',
            input: commandText,
            error: toErrorMessage(err)
          });
        }
      })();
      return true;
    }

    if (request.payload?.action === 'get_element_value') {
      const { selector, attribute } = request.payload;
      msgLogger.info(`Getting element value`, { selector, attribute });
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const tab = tabs[0];
        if (!tab?.id) {
          msgLogger.warn('No active tab for get_element_value');
          sendResponse({ error: 'No active tab found' });
          return;
        }
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'ISOLATED',
            args: [selector, attribute],
            func: (sel, attr) => {
              // Re-define helper inside injection
              function querySelectorDeep(selector, root = document) {
                const pendingRoots = [root];
                const seenRoots = new Set();
                const MAX_SHADOW_ROOTS = 80;
                for (let i = 0; i < pendingRoots.length && pendingRoots.length <= MAX_SHADOW_ROOTS; i++) {
                  const currentRoot = pendingRoots[i];
                  if (!currentRoot || seenRoots.has(currentRoot)) continue;
                  seenRoots.add(currentRoot);
                  try {
                    const found = currentRoot.querySelector(selector);
                    if (found) return found;
                  } catch (e) {}
                  const walker = document.createTreeWalker(currentRoot, NodeFilter.SHOW_ELEMENT);
                  for (let node = walker.currentNode; node; node = walker.nextNode()) {
                    if (node.shadowRoot) pendingRoots.push(node.shadowRoot);
                    const tag = String(node?.tagName || '').toUpperCase();
                    if (tag === 'IFRAME' || tag === 'FRAME') {
                      try { if (node.contentDocument) pendingRoots.push(node.contentDocument); } catch (e) {}
                    }
                    if (pendingRoots.length > MAX_SHADOW_ROOTS) break;
                  }
                }
                return null;
              }

              const el = querySelectorDeep(sel);
              if (!el) return { error: `Element not found: ${sel}` };

              if (attr) {
                return { value: el.getAttribute(attr), attribute: attr };
              }

              const val = el.value !== undefined ? el.value : el.innerText || el.textContent;
              return { value: val, tag: el.tagName.toLowerCase(), id: el.id, name: el.name };
            }
          });
          sendResponse(results[0]?.result);
        } catch (err) {
          sendResponse({ error: err.message });
        }
      });
      return true;
    }

    if (request.payload?.action === 'scroll_to_element') {
      const { selector } = request.payload;
      msgLogger.info(`Scrolling to element`, { selector });
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const tab = tabs[0];
        if (!tab?.id) {
          msgLogger.warn('No active tab for scroll_to_element');
          sendResponse({ error: 'No active tab found' });
          return;
        }
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'ISOLATED',
            args: [selector],
            func: (sel) => {
              function querySelectorDeep(selector, root = document) {
                const pendingRoots = [root];
                const seenRoots = new Set();
                const MAX_SHADOW_ROOTS = 80;
                for (let i = 0; i < pendingRoots.length && pendingRoots.length <= MAX_SHADOW_ROOTS; i++) {
                  const currentRoot = pendingRoots[i];
                  if (!currentRoot || seenRoots.has(currentRoot)) continue;
                  seenRoots.add(currentRoot);
                  try {
                    const found = currentRoot.querySelector(selector);
                    if (found) return found;
                  } catch (e) {}
                  const walker = document.createTreeWalker(currentRoot, NodeFilter.SHOW_ELEMENT);
                  for (let node = walker.currentNode; node; node = walker.nextNode()) {
                    if (node.shadowRoot) pendingRoots.push(node.shadowRoot);
                    const tag = String(node?.tagName || '').toUpperCase();
                    if (tag === 'IFRAME' || tag === 'FRAME') {
                      try { if (node.contentDocument) pendingRoots.push(node.contentDocument); } catch (e) {}
                    }
                    if (pendingRoots.length > MAX_SHADOW_ROOTS) break;
                  }
                }
                return null;
              }
              const el = querySelectorDeep(sel);
              if (!el) return { error: `Element not found: ${sel}` };
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              return { status: 'scrolled' };
            }
          });
          sendResponse(results[0]?.result);
        } catch (err) {
          sendResponse({ error: err.message });
        }
      });
      return true;
    }

    if (request.payload?.action === 'execute_script') {
      const { code, world, timeout_ms } = request.payload;
      const codePreview = String(code || '').slice(0, 100);
      msgLogger.info(`Executing script in ${world || 'ISOLATED'} world`, { codePreview, timeout_ms });

      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const tab = tabs[0];
        if (!tab?.id) {
          msgLogger.warn('No active tab for script execution');
          sendResponse({ error: 'No active tab found' });
          return;
        }

        if (isRestrictedUrl(tab.url)) {
          msgLogger.warn(`Script blocked on restricted URL: ${tab.url}`);
          sendResponse({ error: `Cannot execute script on restricted URL: ${tab.url}` });
          return;
        }

        const runInWorld = async (targetWorld) => {
          return await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: targetWorld,
            args: [code, timeout_ms || 5000],
            func: async (codeStr, timeout) => {
              // Helpers
              function querySelectorDeep(selector, root = document) {
                const pendingRoots = [root];
                const seenRoots = new Set();
                const MAX_SHADOW_ROOTS = 80;
                for (let i = 0; i < pendingRoots.length && pendingRoots.length <= MAX_SHADOW_ROOTS; i++) {
                  const currentRoot = pendingRoots[i];
                  if (!currentRoot || seenRoots.has(currentRoot)) continue;
                  seenRoots.add(currentRoot);
                  try {
                    const found = currentRoot.querySelector(selector);
                    if (found) return found;
                  } catch (e) {}
                  const walker = document.createTreeWalker(currentRoot, NodeFilter.SHOW_ELEMENT);
                  for (let node = walker.currentNode; node; node = walker.nextNode()) {
                    if (node.shadowRoot) pendingRoots.push(node.shadowRoot);
                    const tag = String(node?.tagName || '').toUpperCase();
                    if (tag === 'IFRAME' || tag === 'FRAME') {
                      try { if (node.contentDocument) pendingRoots.push(node.contentDocument); } catch (e) {}
                    }
                    if (pendingRoots.length > MAX_SHADOW_ROOTS) break;
                  }
                }
                return null;
              }
              function truncate(text, maxChars = 500) {
                const str = String(text || '');
                return str.length > maxChars ? `${str.slice(0, maxChars)}...` : str;
              }
              function elementSummary(element) {
                if (!element || element.nodeType !== 1) return null;
                return { tag: element.tagName.toLowerCase(), id: element.id, text: truncate(element.innerText || element.textContent, 100) };
              }
              function jsonSafe(value, seen = new WeakSet(), depth = 0) {
                if (value === null) return null;
                const t = typeof value;
                if (t === 'string' || t === 'number' || t === 'boolean') return value;
                if (t === 'bigint') return value.toString();
                if (value instanceof Error) return { name: value.name, message: value.message };
                if (value && typeof value === 'object' && value.nodeType === 1) return elementSummary(value);
                if (depth >= 5 || seen.has(value)) return '[Truncated]';
                seen.add(value);
                if (Array.isArray(value)) return value.slice(0, 50).map(v => jsonSafe(v, seen, depth + 1));
                const out = {};
                Object.keys(value).slice(0, 50).forEach(k => { out[k] = jsonSafe(value[k], seen, depth + 1); });
                return out;
              }
              const execute = async () => {
                const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
                const fn = new AsyncFunction('querySelectorDeep', 'truncate', 'elementSummary', '"use strict";\n' + codeStr);
                return await fn(querySelectorDeep, truncate, elementSummary);
              };
              try {
                const result = await Promise.race([
                  execute(),
                  new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout))
                ]);
                return { ok: true, result: jsonSafe(result) };
              } catch (err) {
                return { error: err.message };
              }
            }
          });
        };

        try {
          let results = await runInWorld(world === 'MAIN' ? 'MAIN' : 'ISOLATED');
          let payload = results[0]?.result;

          // Auto-fallback to MAIN if ISOLATED failed due to CSP/eval/Trusted Types
          if (world !== 'MAIN' && payload?.error && (payload.error.includes('CSP') || payload.error.includes('eval') || payload.error.includes('Trusted Type'))) {
            msgLogger.warn('ISOLATED world script failed (CSP), retrying in MAIN world');
            results = await runInWorld('MAIN');
            payload = results[0]?.result;
          }

          if (payload?.error) {
            msgLogger.error(`Script execution error: ${payload.error}`);
            sendResponse({ error: payload.error });
          } else {
            msgLogger.info('Script executed successfully');
            sendResponse({ ok: true, result: payload?.result });
          }
        } catch (err) {
          msgLogger.error(`Script execution exception: ${err.message}`);
          sendResponse({ error: err.message });
        }
      });
      return true;
    }

    // Execute batch actions with automation capabilities
    if (request.payload?.action === 'execute_batch_actions') {
      const { actions, options, traceMeta } = request.payload;
      (async () => {
        const settings = await getRelaySettings().catch(() => ({
          masterActive: true,
          trainingAllowAiScripts: false
        }));
        const allowAiScripts = settings.masterActive === true && settings.trainingAllowAiScripts === true;
        const mergedOptions = {
          ...(options && typeof options === 'object' ? options : {}),
          allowAiScripts
        };

        const actionCount = Array.isArray(actions) ? actions.length : 0;
        batchLogger.info(`Starting batch execution with ${actionCount} actions`, { traceMeta, options: mergedOptions });
        try {
          const result = await executeBatchActions(actions, mergedOptions, traceMeta);
          batchLogger.info(`Batch execution completed`, {
            runId: result.runId,
            executedSteps: result.executedSteps,
            cancelled: result.cancelled,
            allowAiScripts
          });
          sendResponse(result);
        } catch (err) {
          batchLogger.error(`Batch execution failed: ${err.message}`, { stack: err.stack });
          sendResponse({ error: err.message });
        }
      })();
      return true;
    }

    // Cancel an active batch execution
    if (request.payload?.action === 'cancel_batch_actions') {
      (async () => {
        const runId = String(request.payload?.runId || '').trim();
        batchLogger.info(`Cancelling batch run: ${runId}`);
        const cancelled = await cancelRun(runId);
        batchLogger.info(`Cancel result for ${runId}: ${cancelled ? 'cancelled' : 'not found'}`);
        sendResponse({ cancelled, runId });
      })();
      return true;
    }

    // Get active runs status
    if (request.payload?.action === 'get_active_runs') {
      const runs = Array.from(activeRuns.entries()).map(([id, state]) => ({
        runId: id,
        cancelled: state.cancelled,
        startTime: state.startTime,
        tabId: state.tabId ?? null
      }));
      sendResponse({ runs });
      return false;
    }

    sendResponse({ error: `Unknown background action: ${String(request.payload?.action || '')}` });
    return false;
  }

  // Unknown message shape; ignore.
  return false;
});

// =============================================================================
// Batch Action Execution
// =============================================================================

/**
 * Execute a batch of actions in the active tab
 * @param {Array} actions - Array of action objects
 * @param {Object} options - Automation options
 * @param {Object} traceMeta - Trace metadata for logging
 * @returns {Promise<Object>} Execution result
 */
async function executeBatchActions(actions, options = {}, traceMeta = null) {
  const runId = generateRunId();
  const runState = {
    cancelled: false,
    startTime: Date.now(),
    tabId: null,
    windowId: null,
    lastSeq: -1,
    pollTimer: null
  };
  activeRuns.set(runId, runState);

  try {
    // Get active tab
    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, resolve);
    });

    const tab = tabs && tabs[0];
    if (!tab?.id) {
      throw new Error('No active tab found');
    }

    if (isRestrictedUrl(tab.url)) {
      throw new Error(`Cannot execute actions on restricted URL: ${tab.url || '(unknown url)'}`);
    }

    runState.tabId = tab.id;
    runState.windowId = tab.windowId ?? null;

    const totalSteps = Array.isArray(actions) ? actions.length : 0;
    safeSendRuntimeMessage({ type: 'BATCH_RUN_UPDATE', payload: { runId, status: 'starting', executedSteps: 0, totalSteps } });

    // Poll page-run state so the UI has progress while the tool is running.
    const pollIntervalMsRaw = Number(options?.pollIntervalMs ?? 350);
    const pollIntervalMs = Number.isFinite(pollIntervalMsRaw)
      ? Math.min(1000, Math.max(150, Math.round(pollIntervalMsRaw)))
      : 350;
    let pollInFlight = false;

    runState.pollTimer = setInterval(async () => {
      if (pollInFlight) return;
      pollInFlight = true;
      try {
        const state = await readRunStateFromPage(tab.id, runId);
        if (!state) return;
        const seq = Number(state.seq || 0);
        if (seq === runState.lastSeq) return;
        runState.lastSeq = seq;
        safeSendRuntimeMessage({ type: 'BATCH_RUN_UPDATE', payload: state });
      } finally {
        pollInFlight = false;
      }
    }, pollIntervalMs);

    // --- RESIDENT RUNTIME EXECUTION (Primary) ---
    let payload = null;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'EXECUTE_BATCH',
        actions,
        options
      });
      if (response && (response.success || response.executedSteps > 0)) {
        payload = {
          ok: response.success,
          executedSteps: response.executedSteps,
          totalSteps: response.totalSteps,
          results: response.results
        };
      }
    } catch (err) {
      // Runtime not available or failed, will fall back to injection
      console.debug("[Background] Resident runtime unavailable, falling back to script injection.");
    }

    // --- SCRIPT INJECTION (Fallback) ---
    if (!payload) {
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: performPageActions,
        args: [actions, traceMeta, runId, options],
        world: 'MAIN' // Run in page context to access page's JS objects
      });
      payload = result?.[0]?.result || {};
    }

    // Flush final state to UI (best-effort).
    const finalState = await readRunStateFromPage(tab.id, runId);
    if (finalState) {
      safeSendRuntimeMessage({ type: 'BATCH_RUN_UPDATE', payload: finalState });
    } else {
      safeSendRuntimeMessage({
        type: 'BATCH_RUN_UPDATE',
        payload: {
          runId,
          status: payload.cancelled ? 'cancelled' : payload.ok !== false ? 'done' : 'error',
          executedSteps: payload.executedSteps || 0,
          totalSteps
        }
      });
    }

    return {
      ok: payload.ok !== false,
      runId,
      executedSteps: payload.executedSteps || 0,
      cancelled: payload.cancelled || false,
      error: payload.error
    };
  } catch (err) {
    safeSendRuntimeMessage({ type: 'BATCH_RUN_UPDATE', payload: { runId, status: 'error', error: err?.message || String(err || 'Unknown error') } });
    throw err;
  } finally {
    const tabId = runState.tabId;
    if (runState.pollTimer) {
      try { clearInterval(runState.pollTimer); } catch (_err) {}
      runState.pollTimer = null;
    }
    if (typeof tabId === 'number') {
      await clearRunStateInPage(tabId, runId);
    }
    activeRuns.delete(runId);
  }
}

/**
 * The Executor: this function is serialized and injected into the page context.
 * Ported from CaravanFlow Agent with full automation capabilities.
 */
async function performPageActions(actions, traceMeta = null, runId = '', optionsInput = null) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const options = optionsInput && typeof optionsInput === 'object' ? optionsInput : {};
  const logLifecycle = options.suppressLifecycleLogs !== true;
  const humanizedDelayEnabled = options.humanizedDelayEnabled === true;
  const parsedBaseDelayMs = Number(options.humanizedDelayBaseMs);
  const parsedJitterDelayMs = Number(options.humanizedDelayJitterMs);
  const humanizedDelayBaseMs = Number.isFinite(parsedBaseDelayMs)
    ? Math.min(5000, Math.max(0, Math.round(parsedBaseDelayMs)))
    : 220;
  const humanizedDelayJitterMs = Number.isFinite(parsedJitterDelayMs)
    ? Math.min(5000, Math.max(0, Math.round(parsedJitterDelayMs)))
    : 260;
  const allowAiScripts = options.allowAiScripts === true;
  const defaultAllowSensitiveFill = options.allowSensitiveFill === true;
  const defaultAllowSensitiveOverwrite = options.allowSensitiveOverwrite === true;

  const trace = {
    runId: String(traceMeta?.runId || '').trim(),
    commandId: String(traceMeta?.commandId || '').trim()
  };

  function tracePrefixLocal() {
    const parts = [];
    if (trace.runId) parts.push(`run=${trace.runId}`);
    if (trace.commandId) parts.push(`cmd=${trace.commandId}`);
    return parts.length > 0 ? `[${parts.join(' ')}] ` : '';
  }

  // Cross-world state channel:
  // - This executor runs in the page "MAIN" world (no extension APIs).
  // - We persist lightweight progress state on window so the background can poll and update the UI.
  const RUN_STATE_KEY = '__bilgeBatchRunState';

  function updateRunState(patch) {
    if (!runId) return;
    try {
      if (!window[RUN_STATE_KEY] || typeof window[RUN_STATE_KEY] !== 'object') window[RUN_STATE_KEY] = {};
      const root = window[RUN_STATE_KEY];
      const prev = root[runId] && typeof root[runId] === 'object' ? root[runId] : {};
      const next = {
        ...prev,
        ...patch,
        runId,
        updatedAt: Date.now(),
        seq: Number(prev.seq || 0) + 1,
      };
      root[runId] = next;
    } catch (_err) {}
  }

  function remoteLog(text, level = 'INFO') {
    const decorated = `${tracePrefixLocal()}${text}`;
    updateRunState({ lastLog: { ts: Date.now(), level, text: decorated } });
    try { console.log(`[${level}] ${decorated}`); } catch (_err) {}
  }

  function isCancelled() {
    const key = '__bilgeCancelledRuns';
    if (!runId) return false;
    return Boolean(window[key]?.[runId]);
  }

  function nextHumanizedDelayMs() {
    if (!humanizedDelayEnabled) return 0;
    if (humanizedDelayJitterMs <= 0) return humanizedDelayBaseMs;
    return humanizedDelayBaseMs + Math.floor(Math.random() * (humanizedDelayJitterMs + 1));
  }

  // Text normalization and tokenization
  function normalizeText(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function tokenize(value) {
    return String(value || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  // Selector hint extraction
  function extractSelectorHints(selector) {
    const hints = [];
    const attrMatches = selector.matchAll(
      /\[\s*(name|id|placeholder|aria-label|data-testid|data-test-id|data-qa)\s*(?:[*^$|~]?=)\s*(?:['"]([^'"]+)['"]|([^\]\s]+))\s*\]/gi
    );
    for (const match of attrMatches) {
      hints.push(match[2] || match[3] || '');
    }
    const idMatches = selector.matchAll(/#([A-Za-z0-9_-]+)/g);
    for (const match of idMatches) {
      hints.push(String(match[1] || '').replace(/[_-]+/g, ' '));
    }
    const classMatches = selector.matchAll(/\.([A-Za-z0-9_-]+)/g);
    for (const match of classMatches) {
      hints.push(String(match[1] || '').replace(/[_-]+/g, ' '));
    }
    const tagMatch = selector.match(/^\s*([a-z]+)/i);
    const preferredTag = tagMatch ? String(tagMatch[1]).toLowerCase() : '';
    return { hints, preferredTag };
  }

  function buildSelectorCandidates(action) {
    const raw = [];
    if (Array.isArray(action.selectors)) raw.push(...action.selectors);
    raw.push(action.selector);
    const seen = new Set();
    const selectors = [];
    for (const item of raw) {
      const selector = String(item || '').trim();
      if (!selector || seen.has(selector)) continue;
      seen.add(selector);
      selectors.push(selector);
    }
    return selectors;
  }

  // Label finding utilities
  function findLabelText(element) {
    if (!(element instanceof Element)) return '';
    const parts = [];
    const id = element.getAttribute('id');
    if (id) {
      const labelFor = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (labelFor?.textContent) parts.push(labelFor.textContent);
    }
    const closestLabel = element.closest('label');
    if (closestLabel?.textContent) parts.push(closestLabel.textContent);
    const parentLabel = element.parentElement?.querySelector?.('label');
    if (parentLabel?.textContent) parts.push(parentLabel.textContent);
    return parts.join(' ');
  }

  function elementSearchText(element) {
    const attrKeys = [
      'name', 'id', 'placeholder', 'aria-label', 'autocomplete',
      'data-testid', 'data-test-id', 'data-qa', 'title'
    ];
    const values = [];
    values.push(element.tagName.toLowerCase());
    for (const key of attrKeys) {
      const v = element.getAttribute?.(key);
      if (v) values.push(v);
    }
    values.push(findLabelText(element));
    const role = element.getAttribute?.('role');
    if (role) values.push(role);
    return normalizeText(values.join(' '));
  }

  function isUsableField(element) {
    if (!(element instanceof Element)) return false;
    const disabled = element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    if (disabled) return false;
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (rect.width < 2 || rect.height < 2) return false;
    return true;
  }

  // Heuristic token collection
  function collectHintTokens(action, selectors) {
    const tokenSet = new Set();
    const rawHints = [action.field, action.name, action.key, action.label, action.placeholder];
    let preferredTag = '';

    for (const selector of selectors) {
      const parsed = extractSelectorHints(selector);
      rawHints.push(...parsed.hints);
      if (!preferredTag && parsed.preferredTag) preferredTag = parsed.preferredTag;
    }

    for (const hint of rawHints) {
      for (const token of tokenize(hint)) tokenSet.add(token);
    }

    // Expand synonyms
    const expanded = new Set(tokenSet);
    if (expanded.has('first')) expanded.add('given');
    if (expanded.has('last')) {
      expanded.add('family');
      expanded.add('surname');
    }
    if (expanded.has('phone')) expanded.add('tel');
    if (expanded.has('mail')) expanded.add('email');
    if (expanded.has('email')) expanded.add('mail');

    return {
      tokens: Array.from(expanded),
      preferredTag
    };
  }

  // Heuristic element resolution
  function resolveHeuristicElement(action, selectors) {
    const { tokens, preferredTag } = collectHintTokens(action, selectors);
    if (!tokens.length) return null;

    const candidates = Array.from(
      document.querySelectorAll('input, textarea, select, [contenteditable="true"], [role="textbox"]')
    ).filter(isUsableField);

    const phrase = normalizeText(tokens.join(''));
    let best = null;

    for (const element of candidates) {
      const haystack = elementSearchText(element);
      if (!haystack) continue;
      let score = 0;

      for (const token of tokens) {
        const normalizedToken = normalizeText(token);
        if (!normalizedToken) continue;
        if (haystack.includes(normalizedToken)) {
          score += normalizedToken.length >= 4 ? 2 : 1;
        }
      }

      if (phrase && haystack.includes(phrase)) score += 3;
      if (preferredTag && element.tagName.toLowerCase() === preferredTag) score += 1;

      if (!best || score > best.score) {
        best = { element, score, tokens };
      }
    }

    if (!best || best.score <= 0) return null;
    return best;
  }

  // Element resolution with fallbacks
  function resolveActionElement(action, stepIndex, totalSteps, type) {
    const selectors = buildSelectorCandidates(action);
    for (let idx = 0; idx < selectors.length; idx += 1) {
      const selector = selectors[idx];
      remoteLog(`Step ${stepIndex}/${totalSteps}: selector try ${idx + 1}/${selectors.length}: ${selector}`, 'INFO');
      try {
        const element = document.querySelector(selector);
        if (element) {
          return {
            element,
            matchedBy: `selector:${selector}`,
            selectors
          };
        }
      } catch (err) {
        remoteLog(`Step ${stepIndex}/${totalSteps}: invalid selector ${selector} (${err.message})`, 'WARN');
      }
    }

    // Fallback to heuristic matching
    if (type === 'fill' || type === 'type' || type === 'click' || type === 'scroll') {
      const heuristic = resolveHeuristicElement(action, selectors);
      if (heuristic?.element) {
        const tokenText = heuristic.tokens.join(',');
        remoteLog(
          `Step ${stepIndex}/${totalSteps}: heuristic matched field (score=${heuristic.score}, tokens=${tokenText})`,
          'INFO'
        );
        return {
          element: heuristic.element,
          matchedBy: `heuristic:${tokenText}`,
          selectors
        };
      }
    }

    return {
      element: null,
      matchedBy: '',
      selectors
    };
  }

  // Field value reading/inference
  function readElementValue(element) {
    if (!element) return '';
    if (element.isContentEditable) return String(element.textContent || '');
    if ('value' in element) return String(element.value ?? '');
    return String(element.getAttribute?.('value') || '');
  }

  function inferFillFieldKind(element, action) {
    const tag = String(element?.tagName || '').toLowerCase();
    const type = String(element?.getAttribute?.('type') || '').toLowerCase();
    const hintText = [
      action?.field, action?.name, action?.key, action?.label, action?.placeholder,
      element?.getAttribute?.('name'), element?.getAttribute?.('id'),
      element?.getAttribute?.('aria-label'), element?.getAttribute?.('placeholder'),
      findLabelText(element)
    ].join(' ').toLowerCase();

    if (type === 'email' || /\bemail\b/.test(hintText)) return 'email';
    if (type === 'tel' || /\b(phone|tel|mobile)\b/.test(hintText)) return 'phone';
    if (/\b(zip|postal)\b/.test(hintText)) return 'zip';
    if (type === 'date' || /\b(dob|date|from date|to date|start date|end date)\b/.test(hintText)) return 'date';
    if (/\bstate\b/.test(hintText)) return 'state';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (tag === 'select') return 'select';
    return 'text';
  }

  function normalizeComparableValue(kind, value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    if (kind === 'email') return text.toLowerCase();
    if (kind === 'phone') return text.replace(/\D+/g, '');
    if (kind === 'zip') return text.replace(/\D+/g, '');
    if (kind === 'state') return text.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
    if (kind === 'date') return text.replace(/\s+/g, '');
    return text.toLowerCase();
  }

  // Value sanitization
  function sanitizeFillValue(kind, rawValue, element) {
    const text = String(rawValue ?? '').trim();
    const inputType = String(element?.getAttribute?.('type') || '').toLowerCase();

    if (kind === 'email') {
      const email = text.toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, reason: `invalid email value "${text}"` };
      }
      return { ok: true, value: email };
    }

    if (kind === 'phone') {
      const digits = text.replace(/\D+/g, '');
      if (digits.length < 10) return { ok: false, reason: `invalid phone value "${text}"` };
      const normalized = digits.length >= 10 ? digits.slice(-10) : digits;
      const formatted = normalized.length === 10
        ? `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`
        : normalized;
      return { ok: true, value: formatted };
    }

    if (kind === 'zip') {
      const digits = text.replace(/\D+/g, '');
      if (digits.length < 5) return { ok: false, reason: `invalid zip value "${text}"` };
      return { ok: true, value: digits.slice(0, 5) };
    }

    if (kind === 'state') {
      const letters = text.toUpperCase().replace(/[^A-Z]/g, '');
      if (letters.length < 2) return { ok: false, reason: `invalid state value "${text}"` };
      return { ok: true, value: letters.slice(0, 2) };
    }

    if (kind === 'date') {
      const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const mdyMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (inputType === 'date') {
        if (isoMatch) return { ok: true, value: text };
        if (mdyMatch) {
          const mm = mdyMatch[1].padStart(2, '0');
          const dd = mdyMatch[2].padStart(2, '0');
          const yyyy = mdyMatch[3];
          return { ok: true, value: `${yyyy}-${mm}-${dd}` };
        }
      } else {
        if (mdyMatch) {
          const mm = mdyMatch[1].padStart(2, '0');
          const dd = mdyMatch[2].padStart(2, '0');
          const yyyy = mdyMatch[3];
          return { ok: true, value: `${mm}/${dd}/${yyyy}` };
        }
        if (isoMatch) {
          return { ok: true, value: `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}` };
        }
      }
      if (!text) return { ok: false, reason: 'empty date value' };
      return { ok: true, value: text };
    }

    if (kind === 'checkbox') {
      const lowered = text.toLowerCase();
      const isChecked = lowered === 'true' || lowered === '1' || lowered === 'yes' || lowered === 'checked' || lowered === 'on';
      return { ok: true, checked: isChecked };
    }

    if (kind === 'radio') {
      if (!text) return { ok: false, reason: 'empty radio value' };
      return { ok: true, value: text };
    }

    if (kind === 'select') {
      return { ok: true, value: text };
    }

    if (!text) return { ok: false, reason: 'empty fill value' };
    return { ok: true, value: text };
  }

  // Sensitive field detection
  function fieldHintText(element, action) {
    return [
      action?.field, action?.name, action?.key, action?.label, action?.placeholder,
      element?.getAttribute?.('name'), element?.getAttribute?.('id'),
      element?.getAttribute?.('aria-label'), element?.getAttribute?.('placeholder'),
      findLabelText(element)
    ].join(' ').toLowerCase();
  }

  function isSensitiveFieldTarget(element, action) {
    const hint = fieldHintText(element, action);
    if (!hint) return false;
    return /\b(ssn|social security|passport|driver'?s?\s*license|license number|maiden name|uscis|alien number|a-number|tax id|tin|itin|dob|date of birth)\b/.test(hint)
      || /\bdl\s*#?\b/.test(hint);
  }

  // Middle name checkbox detection
  function isMiddleNameTarget(element, action) {
    const hint = fieldHintText(element, action);
    if (!hint) return false;
    if (/\bmiddle[_\s-]?name\b/.test(hint)) return true;
    return /\bmiddle\b/.test(hint) && /\bname\b/.test(hint);
  }

  function checkboxLabelText(checkbox) {
    const parts = [];
    const id = checkbox?.getAttribute?.('id');
    const owner = checkbox?.ownerDocument || document;
    if (id) {
      const labelFor = owner.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (labelFor?.textContent) parts.push(labelFor.textContent);
    }
    const closestLabel = checkbox?.closest?.('label');
    if (closestLabel?.textContent) parts.push(closestLabel.textContent);
    if (checkbox?.parentElement?.textContent) parts.push(checkbox.parentElement.textContent);
    parts.push(
      checkbox?.getAttribute?.('aria-label') || '',
      checkbox?.getAttribute?.('title') || '',
      checkbox?.getAttribute?.('name') || '',
      checkbox?.getAttribute?.('id') || ''
    );
    return parts.join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function findNearbyNoMiddleNameCheckbox(element) {
    if (!element) return null;
    const scopes = [];
    let cursor = element;
    for (let depth = 0; depth < 6 && cursor; depth += 1) {
      if (cursor instanceof Element) scopes.push(cursor);
      cursor = cursor.parentElement;
    }
    const doc = element.ownerDocument || document;
    if (doc?.body) scopes.push(doc.body);

    const seen = new Set();
    let best = null;
    const noMiddlePattern = /(no|none|without|n\/a|doesn'?t have|do not have).{0,24}middle|middle.{0,24}(no|none|n\/a)/i;

    for (let scopeIndex = 0; scopeIndex < scopes.length; scopeIndex += 1) {
      const scope = scopes[scopeIndex];
      let checkboxes = [];
      try {
        checkboxes = Array.from(scope.querySelectorAll('input[type="checkbox"]'));
      } catch (_err) {
        checkboxes = [];
      }
      for (const checkbox of checkboxes) {
        if (!checkbox || seen.has(checkbox)) continue;
        seen.add(checkbox);
        const text = checkboxLabelText(checkbox);
        if (!text) continue;
        let score = 0;
        if (noMiddlePattern.test(text)) score += 6;
        if (text.includes('middle') && text.includes('name')) score += 2;
        if (/\bno[_\s-]?middle\b/.test(text)) score += 3;
        score += Math.max(0, 3 - scopeIndex);
        if (!best || score > best.score) best = { checkbox, score };
      }
    }

    if (!best || best.score < 4) return null;
    return best.checkbox;
  }

  // Apply fill with guards
  function applyFill(element, value, action) {
    const fieldKind = inferFillFieldKind(element, action);
    const preserveExisting = action?.preserveExisting !== false;
    const overwrite = action?.overwrite === true || action?.force === true;
    const sensitiveTarget = isSensitiveFieldTarget(element, action);
    const allowSensitiveFill = action?.allowSensitiveFill === true
      || (action?.allowSensitiveFill === undefined && defaultAllowSensitiveFill);
    const allowSensitiveOverwrite = action?.allowSensitiveOverwrite === true
      || (action?.allowSensitiveOverwrite === undefined && defaultAllowSensitiveOverwrite);
    const existingRaw = readElementValue(element);
    const existingComparableRaw = normalizeComparableValue(fieldKind, existingRaw);

    if (sensitiveTarget) {
      if (existingComparableRaw && !allowSensitiveOverwrite) {
        return {
          ok: true, skipped: true,
          reason: 'sensitive field locked (existing value preserved)',
          kind: fieldKind
        };
      }
      if (!existingComparableRaw && !allowSensitiveFill) {
        return {
          ok: true, skipped: true,
          reason: 'sensitive field fill blocked',
          kind: fieldKind
        };
      }
    }

    // Handle middle name special case
    if (isMiddleNameTarget(element, action)) {
      const raw = String(value ?? '').trim().toLowerCase();
      const noMiddleRequested = action?.noMiddleName === true
        || raw === '' || raw === 'na' || raw === 'n/a'
        || raw === 'none' || raw === 'no middle name';
      if (noMiddleRequested) {
        const noMiddleCheckbox = findNearbyNoMiddleNameCheckbox(element);
        if (noMiddleCheckbox) {
          const alreadyChecked = Boolean(noMiddleCheckbox.checked);
          if (!alreadyChecked) {
            noMiddleCheckbox.focus();
            noMiddleCheckbox.click();
            noMiddleCheckbox.dispatchEvent(new Event('input', { bubbles: true }));
            noMiddleCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
          }
          if ('value' in element) {
            element.value = '';
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return {
            ok: true, skipped: alreadyChecked,
            reason: alreadyChecked ? 'no-middle-name checkbox already checked' : 'checked no-middle-name checkbox',
            kind: fieldKind
          };
        }
      }
    }

    const sanitized = sanitizeFillValue(fieldKind, value, element);
    if (!sanitized.ok) {
      return { ok: false, skipped: true, reason: sanitized.reason || 'validation failed', kind: fieldKind };
    }
    const text = String(sanitized.value ?? '');
    const tag = element.tagName.toLowerCase();
    const normalized = text.trim().toLowerCase();
    const nextComparable = normalizeComparableValue(fieldKind, text);
    const existingComparable = existingComparableRaw;

    if (existingComparable && nextComparable && existingComparable === nextComparable) {
      return { ok: true, skipped: true, reason: 'already set', kind: fieldKind };
    }
    if (preserveExisting && !overwrite && existingComparable && nextComparable && existingComparable !== nextComparable) {
      return { ok: true, skipped: true, reason: 'existing non-empty value preserved', kind: fieldKind };
    }

    function dispatchInputLikeEvents(target) {
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));
      target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Tab' }));
      target.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    }

    function setElementValue(target, nextValue) {
      if (!target) return;
      const proto = Object.getPrototypeOf(target);
      const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
      if (descriptor && typeof descriptor.set === 'function') {
        descriptor.set.call(target, nextValue);
      } else {
        target.value = nextValue;
      }
    }

    if (fieldKind === 'checkbox' && 'checked' in element) {
      element.focus();
      element.checked = Boolean(sanitized.checked);
    } else if (element.isContentEditable) {
      element.focus();
      element.textContent = text;
    } else if (tag === 'select') {
      const options = Array.from(element.options || []);
      const match = options.find((opt) => {
        const valueLower = String(opt.value || '').trim().toLowerCase();
        const textLower = String(opt.textContent || '').trim().toLowerCase();
        return valueLower === normalized || textLower === normalized
          || (normalized && valueLower.includes(normalized))
          || (normalized && textLower.includes(normalized));
      });
      element.value = match ? match.value : text;
    } else if ('value' in element) {
      element.focus();
      setElementValue(element, text);
    } else {
      element.setAttribute('value', text);
    }

    dispatchInputLikeEvents(element);
    return { ok: true, skipped: false, reason: '', kind: fieldKind };
  }

  // Main execution loop
  if (logLifecycle) {
    remoteLog('Batch action execution started.', 'INFO');
  }

	  const list = Array.isArray(actions) ? actions : [];
	  let executedSteps = 0;
	  updateRunState({ status: 'running', startedAt: Date.now(), totalSteps: list.length, executedSteps, cancelled: false });

	  for (let i = 0; i < list.length; i++) {
	    if (isCancelled()) {
	      remoteLog('Execution cancelled by user request.', 'WARN');
	      updateRunState({ status: 'cancelled', cancelled: true, executedSteps });
	      return { ok: false, cancelled: true, executedSteps };
	    }

    const action = list[i] || {};
    const type = String(action.type || '').toLowerCase();

    try {
      // Handle wait action
	      if (type === 'wait') {
	        const duration = Number(action.duration || 1000);
	        remoteLog(`Step ${i + 1}/${list.length}: wait ${duration}ms`, 'INFO');
	        await sleep(duration);
	        executedSteps += 1;
	        updateRunState({ executedSteps });
	        continue;
	      }

      // Handle script action
      if (type === 'script' || type === 'js' || type === 'javascript') {
        if (!allowAiScripts) {
          remoteLog(`Step ${i + 1}/${list.length}: blocked script action (allowAiScripts is false).`, 'WARN');
          continue;
        }

        const code = String(action.code ?? action.script ?? action.js ?? '').trim();
        if (!code) {
          remoteLog(`Step ${i + 1}/${list.length}: skipped script action (empty code).`, 'WARN');
          continue;
        }
        if (code.length > 12000) {
          remoteLog(`Step ${i + 1}/${list.length}: skipped script action (code too large).`, 'WARN');
          continue;
        }

        remoteLog(`Step ${i + 1}/${list.length}: script action`, 'INFO');
        try {
          const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
          const fn = new AsyncFunction('"use strict";\n' + code);
          const resultValue = await fn();

          let preview = '';
          try {
            preview = typeof resultValue === 'string' ? resultValue : JSON.stringify(resultValue);
          } catch (_err) {
            preview = String(resultValue);
          }
          preview = String(preview || '').replace(/\s+/g, ' ').trim();
          if (preview) {
            remoteLog(`Step ${i + 1}/${list.length}: script result: ${preview.slice(0, 180)}`, 'INFO');
          }
        } catch (err) {
          remoteLog(`Step ${i + 1}/${list.length}: script error: ${err.message}`, 'ERROR');
        }

        const postWaitMs = Math.max(0, Number(action.post_wait_ms || 300));
        await sleep(postWaitMs);
        const humanizedDelayMs = nextHumanizedDelayMs();
	        if (humanizedDelayMs > 0 && i < list.length - 1) {
	          remoteLog(`Step ${i + 1}/${list.length}: natural delay ${humanizedDelayMs}ms`, 'INFO');
	          await sleep(humanizedDelayMs);
	        }
	        executedSteps += 1;
	        updateRunState({ executedSteps });
	        continue;
	      }

      // Resolve element with probe scrolling
      let resolved = resolveActionElement(action, i + 1, list.length, type);
      let element = resolved.element;

      if (!element && (type === 'fill' || type === 'type' || type === 'click' || type === 'scroll')) {
        const probeDistance = Math.max(240, Math.round(window.innerHeight * 0.8));
        const maxProbeScrolls = 4;
        for (let probe = 1; probe <= maxProbeScrolls && !element; probe += 1) {
          window.scrollBy({ top: probeDistance, behavior: 'auto' });
          await sleep(120);
          resolved = resolveActionElement(action, i + 1, list.length, type);
          element = resolved.element;
          if (element) {
            remoteLog(`Step ${i + 1}/${list.length}: matched after probe scroll ${probe}/${maxProbeScrolls}`, 'INFO');
            break;
          }
        }
        if (!element) {
          window.scrollTo({ top: 0, behavior: 'auto' });
          await sleep(120);
          resolved = resolveActionElement(action, i + 1, list.length, type);
          element = resolved.element;
          if (element) {
            remoteLog(`Step ${i + 1}/${list.length}: matched after reset-to-top probe`, 'INFO');
          }
        }
      }

      if (!element) {
        const tried = resolved.selectors?.length ? resolved.selectors.join(' | ') : '(none)';
        remoteLog(`Step ${i + 1} failed: Could not resolve target. selectors tried: ${tried}`, 'WARN');
        continue;
      }

      // Visual highlight
      const originalStyle = {
        outline: element.style.outline,
        backgroundColor: element.style.backgroundColor
      };

      element.style.outline = '3px solid #2563eb';
      element.style.backgroundColor = 'rgba(37, 99, 235, 0.1)';
      remoteLog(`Step ${i + 1}/${list.length}: ${type} via ${resolved.matchedBy}`, 'INFO');

      // Execute action by type
      if (type === 'fill' || type === 'type') {
        try {
          element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          remoteLog(`Step ${i + 1}/${list.length}: auto-scroll to active input`, 'INFO');
        } catch (_err) {}
        const fillResult = applyFill(element, action.value, action);
        if (!fillResult.ok || fillResult.skipped) {
          const status = fillResult.ok ? 'INFO' : 'WARN';
          const reason = fillResult.reason || 'fill skipped';
          remoteLog(`Step ${i + 1}/${list.length}: fill guard (${fillResult.kind || 'text'}) -> ${reason}`, status);
        }
      } else if (type === 'click') {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.click();
      } else if (type === 'scroll') {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        remoteLog(`Step ${i + 1} skipped: Unsupported action type ${type}`, 'WARN');
      }

      // Post-action delays
      const postWaitMs = Math.max(0, Number(action.post_wait_ms || 300));
      await sleep(postWaitMs);
      const humanizedDelayMs = nextHumanizedDelayMs();
      if (humanizedDelayMs > 0 && i < list.length - 1) {
        remoteLog(`Step ${i + 1}/${list.length}: natural delay ${humanizedDelayMs}ms`, 'INFO');
        await sleep(humanizedDelayMs);
      }

	      // Restore style
	      element.style.outline = originalStyle.outline;
	      element.style.backgroundColor = originalStyle.backgroundColor;
	      executedSteps += 1;
	      updateRunState({ executedSteps });
	    } catch (err) {
	      remoteLog(`Step ${i + 1} execution error: ${err.message}`, 'ERROR');
	    }
	  }

	  if (logLifecycle) {
	    remoteLog('Batch action execution finished.', 'INFO');
	  }
	  updateRunState({ status: 'done', cancelled: false, executedSteps });
	  return { ok: true, cancelled: false, executedSteps };
	}

// =============================================================================
// Auto-Fill Feature: AI-Powered Form Filling
// =============================================================================

const PROFILE_STORAGE_KEY = 'bilge_user_profile';
const autoFillLogger = new BilgeLogger('auto-fill');
let pendingAutoFill = null;

/**
 * Load user profile from chrome.storage.local
 * @returns {Promise<Object|null>} User profile or null
 */
async function loadProfile() {
  try {
    const result = await chrome.storage.local.get(PROFILE_STORAGE_KEY);
    return result[PROFILE_STORAGE_KEY] || null;
  } catch (err) {
    autoFillLogger.error('Failed to load profile', { error: err.message });
    return null;
  }
}

/**
 * Save user profile to chrome.storage.local
 * @param {Object} profile - User profile data
 * @returns {Promise<boolean>} Success status
 */
async function saveProfile(profile) {
  try {
    await chrome.storage.local.set({ [PROFILE_STORAGE_KEY]: profile });
    autoFillLogger.info('Profile saved successfully');
    return true;
  } catch (err) {
    autoFillLogger.error('Failed to save profile', { error: err.message });
    return false;
  }
}

/**
 * Get API key from settings (stored by webapp in localStorage, synced to extension storage)
 * @returns {Promise<string|null>} API key or null
 */
async function getGeminiApiKey() {
  try {
    // Try to get from extension storage (synced from webapp settings)
    const result = await chrome.storage.local.get('bilge_app_settings');
    const settings = result.bilge_app_settings;
    if (settings?.geminiApiKey) return settings.geminiApiKey;

    // Fallback to environment variable key from build
    const envKey = String(process.env?.GEMINI_API_KEY || process.env?.API_KEY || '').trim();
    if (envKey) return envKey;

    return null;
  } catch (err) {
    autoFillLogger.error('Failed to get API key', { error: err.message });
    return null;
  }
}

/**
 * Call Gemini API to map form fields to profile data
 * @param {Array} fields - Form field metadata
 * @param {Object} profile - User profile data
 * @returns {Promise<Array>} Field mappings with values
 */
async function mapFieldsWithAI(fields, profile) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    autoFillLogger.warn('No Gemini API key available');
    return mapFieldsHeuristically(fields, profile);
  }

  const fieldsSummary = fields.map(f => ({
    index: f.index,
    selector: f.selector,
    type: f.type,
    name: f.name,
    id: f.id,
    label: f.label,
    placeholder: f.placeholder,
    autocomplete: f.autocomplete,
    hasValue: !!f.currentValue
  }));

  const profileSummary = {
    firstName: profile.firstName || '',
    lastName: profile.lastName || '',
    middleName: profile.middleName || '',
    email: profile.email || '',
    phone: profile.phone || '',
    address1: profile.address1 || '',
    address2: profile.address2 || '',
    city: profile.city || '',
    state: profile.state || '',
    zipCode: profile.zipCode || '',
    country: profile.country || 'USA',
    company: profile.company || '',
    jobTitle: profile.jobTitle || '',
    ...(profile.custom || {})
  };

  const prompt = `You are a form-filling assistant. Map the following form fields to the user's profile data.

FORM FIELDS:
${JSON.stringify(fieldsSummary, null, 2)}

USER PROFILE:
${JSON.stringify(profileSummary, null, 2)}

For each field, determine the best matching profile value based on:
1. autocomplete attribute (highest priority - e.g., "email", "given-name", "family-name", "tel", "street-address")
2. name attribute
3. id attribute
4. label text
5. placeholder text

Skip fields that already have values (hasValue: true) unless they appear incorrect.
Skip fields that don't match any profile data.
Do NOT fill sensitive fields like SSN, date of birth, passport, or driver's license.

Return ONLY a JSON array with this format (no markdown, no explanation):
[
  { "fieldIndex": 0, "selector": "#email", "profileField": "email", "value": "user@example.com", "confidence": "high" }
]

confidence levels: "high" (exact match like autocomplete="email"), "medium" (name/id match), "low" (label/placeholder inference)`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      autoFillLogger.error('Gemini API error', { status: response.status, error: errorText });
      return mapFieldsHeuristically(fields, profile);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const rawMappings = extractJsonPayload(text);
    const mappings = rawMappings.map(m => {
      const field = fields[m.fieldIndex];
      return {
        ...m,
        fieldName: field?.name || field?.id || `field_${m.fieldIndex}`,
        fieldLabel: field?.label || field?.placeholder || m.profileField,
        isSensitive: ['ssn', 'password', 'cc', 'creditcard', 'cvv', 'birthdate', 'dob'].some(s => 
          (m.profileField || '').toLowerCase().includes(s) || 
          (field?.name || '').toLowerCase().includes(s) || 
          (field?.id || '').toLowerCase().includes(s)
        ),
        confidence: m.confidence === 'high' ? 1.0 : m.confidence === 'medium' ? 0.7 : 0.4
      };
    });
    autoFillLogger.info(`AI mapped ${mappings.length} fields`);
    return mappings;
  } catch (err) {
    autoFillLogger.error('AI mapping failed', { error: err.message });
    return mapFieldsHeuristically(fields, profile);
  }
}

/**
 * Fallback heuristic field mapping when AI is unavailable
 * @param {Array} fields - Form field metadata
 * @param {Object} profile - User profile data
 * @returns {Array} Field mappings with values
 */
function mapFieldsHeuristically(fields, profile) {
  const mappings = [];

  const patterns = {
    email: { match: /email|e-mail/i, field: 'email' },
    firstName: { match: /first[_-]?name|given[_-]?name|fname/i, field: 'firstName' },
    lastName: { match: /last[_-]?name|family[_-]?name|surname|lname/i, field: 'lastName' },
    middleName: { match: /middle[_-]?name|mname/i, field: 'middleName' },
    phone: { match: /phone|tel|mobile|cell/i, field: 'phone' },
    address1: { match: /address[_-]?1|street[_-]?address|address[_-]?line[_-]?1|street/i, field: 'address1' },
    address2: { match: /address[_-]?2|apt|suite|unit|address[_-]?line[_-]?2/i, field: 'address2' },
    city: { match: /city|locality/i, field: 'city' },
    state: { match: /state|province|region/i, field: 'state' },
    zipCode: { match: /zip|postal[_-]?code|postcode/i, field: 'zipCode' },
    country: { match: /country/i, field: 'country' },
    company: { match: /company|organization|employer/i, field: 'company' },
    jobTitle: { match: /job[_-]?title|title|position|role/i, field: 'jobTitle' }
  };

  // Autocomplete attribute mapping
  const autocompleteMap = {
    'email': 'email',
    'given-name': 'firstName',
    'family-name': 'lastName',
    'additional-name': 'middleName',
    'tel': 'phone',
    'tel-national': 'phone',
    'street-address': 'address1',
    'address-line1': 'address1',
    'address-line2': 'address2',
    'address-level2': 'city',
    'address-level1': 'state',
    'postal-code': 'zipCode',
    'country': 'country',
    'country-name': 'country',
    'organization': 'company',
    'organization-title': 'jobTitle'
  };

  for (const field of fields) {
    if (field.currentValue) continue; // Skip pre-filled fields

    const searchText = `${field.autocomplete} ${field.name} ${field.id} ${field.label} ${field.placeholder}`.toLowerCase();
    let profileField = null;
    let confidence = 'low';

    // Priority 1: autocomplete attribute
    if (field.autocomplete && autocompleteMap[field.autocomplete.toLowerCase()]) {
      profileField = autocompleteMap[field.autocomplete.toLowerCase()];
      confidence = 'high';
    }

    // Priority 2: name/id/label patterns
    if (!profileField) {
      for (const [key, pattern] of Object.entries(patterns)) {
        if (pattern.match.test(searchText)) {
          profileField = pattern.field;
          confidence = 'medium';
          break;
        }
      }
    }

    if (profileField && profile[profileField]) {
      mappings.push({
        fieldIndex: field.index,
        selector: field.selector,
        profileField,
        value: profile[profileField],
        confidence
      });
    }
  }

  autoFillLogger.info(`Heuristic mapped ${mappings.length} fields`);
  return mappings;
}

/**
 * Convert field mappings to batch actions for executeBatchActions
 * @param {Array} mappings - Field mappings from AI
 * @returns {Array} Batch actions
 */
function convertMappingsToBatchActions(mappings) {
  return mappings.map(m => ({
    type: 'fill',
    selector: m.selector,
    value: m.value,
    field: m.profileField,
    preserveExisting: true
  }));
}

/**
 * Extract form fields from the active tab
 * @param {number} tabId - Tab ID
 * @returns {Promise<Object>} Fields data or error
 */
async function extractFormFields(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_FORM_FIELDS' }, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        resolve({ error: err.message });
      } else {
        resolve(response || { error: 'No response from content script' });
      }
    });
  });
}

/**
 * Main auto-fill orchestrator
 * @returns {Promise<Object>} Result of auto-fill operation
 */
async function performAutoFill() {
  autoFillLogger.info('Auto-fill triggered');

  // Step 1: Load user profile
  const profile = await loadProfile();
  if (!profile) {
    autoFillLogger.warn('No profile found - please set up your profile first');
    return { error: 'No profile configured. Please set up your profile in the Bilge sidepanel.' };
  }

  // Step 2: Get active tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) {
    autoFillLogger.error('No active tab found');
    return { error: 'No active tab found' };
  }

  if (isRestrictedUrl(tab.url)) {
    autoFillLogger.warn('Cannot auto-fill on restricted URL', { url: tab.url });
    return { error: 'Cannot auto-fill on restricted pages (Chrome internal pages, Web Store)' };
  }

  // Step 3: Extract form fields
  autoFillLogger.info('Extracting form fields...');
  const extraction = await extractFormFields(tab.id);
  if (extraction.error) {
    autoFillLogger.error('Field extraction failed', { error: extraction.error });
    return { error: `Failed to extract form fields: ${extraction.error}` };
  }

  const fields = extraction.fields || [];
  if (fields.length === 0) {
    autoFillLogger.info('No fillable form fields found on this page');
    return { error: 'No fillable form fields found on this page' };
  }

  autoFillLogger.info(`Found ${fields.length} form fields`);

  // Step 4: Map fields to profile using AI
  autoFillLogger.info('Mapping fields with AI...');
  const mappings = await mapFieldsWithAI(fields, profile);
  if (mappings.length === 0) {
    autoFillLogger.info('No fields matched profile data');
    return { error: 'No form fields matched your profile data' };
  }

  autoFillLogger.info(`Mapped ${mappings.length} fields to profile`);

  // Store for later execution if confirmed
  pendingAutoFill = {
    mappings,
    tabId: tab.id
  };

  // Try to show preview in sidepanel
  try {
    chrome.runtime.sendMessage({
      type: 'SHOW_AUTO_FILL_PREVIEW',
      payload: { mappings }
    });
    autoFillLogger.info('Sent auto-fill preview to sidepanel');
    return { previewShown: true, count: mappings.length };
  } catch (err) {
    // If sidepanel is not open or doesn't handle it, proceed directly (old behavior)
    autoFillLogger.warn('Failed to send preview, proceeding directly', { error: err.message });
  }

  // Step 5: Convert to batch actions and execute
  const actions = convertMappingsToBatchActions(mappings);
  autoFillLogger.info(`Executing ${actions.length} fill actions...`);

  try {
    const result = await executeBatchActions(actions, {
      humanizedDelayEnabled: true,
      humanizedDelayBaseMs: 50,
      humanizedDelayJitterMs: 100,
      suppressLifecycleLogs: true
    });

    autoFillLogger.info('Auto-fill completed', {
      executedSteps: result.executedSteps,
      mappedFields: mappings.length
    });

    return {
      success: true,
      filledFields: result.executedSteps,
      totalMapped: mappings.length,
      mappings: mappings.map(m => ({ field: m.profileField, confidence: m.confidence }))
    };
  } catch (err) {
    autoFillLogger.error('Auto-fill execution failed', { error: err.message });
    return { error: `Fill execution failed: ${err.message}` };
  }
}

// Command listener for keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'auto_fill_form') {
    autoFillLogger.info('Auto-fill command received (Ctrl+Shift+L)');
    const result = await performAutoFill();

    // Send result notification to sidepanel if open
    safeSendRuntimeMessage({
      type: 'AUTO_FILL_RESULT',
      payload: result
    });

    // Show notification for user feedback
    if (result.error) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Bilge Auto-Fill',
        message: result.error
      });
    } else {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Bilge Auto-Fill',
        message: `Filled ${result.filledFields} of ${result.totalMapped || 0} matched fields`
      });
    }
  }

  if (command === 'open_command_input') {
    bgLogger.info('Command: open_command_input');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    
    await chrome.sidePanel.open({ tabId: tab.id });
    // Small delay to allow sidepanel to load if it wasn't open
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'FOCUS_COMMAND_INPUT' });
    }, 500);
  }

  if (command === 'screenshot_analyze') {
    bgLogger.info('Command: screenshot_analyze');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    try {
      const screenshot = await captureVisibleTabDataUrl(tab.windowId || null);
      chrome.runtime.sendMessage({ 
        type: 'ANALYZE_SCREENSHOT', 
        payload: { screenshot, tabId: tab.id } 
      });
    } catch (err) {
      bgLogger.error('Screenshot analyze failed', { error: err.message });
    }
  }

  if (command === 'cancel_action') {
    bgLogger.info('Command: cancel_action');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    
    chrome.tabs.sendMessage(tab.id, { type: 'CANCEL_CURRENT_ACTION' });
  }
});

// Message handler for profile operations (from sidepanel)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.to === 'BACKGROUND' && request.payload?.action === 'get_profile') {
    loadProfile().then(profile => sendResponse({ profile }));
    return true;
  }

  if (request?.to === 'BACKGROUND' && request.payload?.action === 'save_profile') {
    saveProfile(request.payload.profile).then(success => sendResponse({ success }));
    return true;
  }

  if (request?.to === 'BACKGROUND' && request.payload?.action === 'auto_fill') {
    performAutoFill().then(result => sendResponse(result));
    return true;
  }

  if (request?.type === 'CONFIRM_AUTO_FILL') {
    (async () => {
      try {
        if (!pendingAutoFill) {
          sendResponse({ error: 'No pending auto-fill found' });
          return;
        }

        const { selectedFields } = request.payload;
        const filteredMappings = pendingAutoFill.mappings.filter(m => 
          selectedFields.includes(m.fieldName)
        );

        if (filteredMappings.length === 0) {
          sendResponse({ error: 'No fields selected' });
          return;
        }

        const actions = convertMappingsToBatchActions(filteredMappings);
        autoFillLogger.info(`Executing confirmed ${actions.length} fill actions...`);

        const result = await executeBatchActions(actions, {
          tabId: pendingAutoFill.tabId,
          humanizedDelayEnabled: true,
          humanizedDelayBaseMs: 50,
          humanizedDelayJitterMs: 100,
          suppressLifecycleLogs: true
        });

        pendingAutoFill = null;
        sendResponse({ success: true, filledFields: result.executedSteps });
      } catch (err) {
        autoFillLogger.error('Confirmed auto-fill failed', { error: err.message });
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }
});

// =============================================================================
// MCP Form Data Handlers (Self-Healing Integration)
// =============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Load form data from MCP filesystem
  if (request?.type === 'LOAD_MCP_FORM_DATA') {
    const path = String(request.payload?.path || 'profiles/default.json').trim();
    bgLogger.info('LOAD_MCP_FORM_DATA requested', { path });

    (async () => {
      try {
        const appSettings = await getBilgeAppSettingsSnapshot();
        const mcpBaseUrl = String(appSettings?.mcpBaseUrl || '').trim() || 'https://mcp.caravanflow.com';
        const mcpToken = String(appSettings?.mcpApiToken || appSettings?.mcpToken || '').trim();
        const headers = {
          ...(mcpToken ? { 'Authorization': `Bearer ${mcpToken}` } : {}),
          'Content-Type': 'application/json'
        };

        const response = await fetch(`${mcpBaseUrl}/mcp/resource?path=${encodeURIComponent(path)}`, {
          method: 'GET',
          headers
        });

        if (!response.ok) {
          bgLogger.warn('MCP form data fetch failed', { status: response.status, path });
          sendResponse({ ok: false, error: `MCP request failed: ${response.status}` });
          return;
        }

        const data = await response.json();
        bgLogger.info('LOAD_MCP_FORM_DATA success', { path, fieldsCount: Object.keys(data.fields || data).length });
        sendResponse({ ok: true, formData: data });
      } catch (err) {
        bgLogger.error('LOAD_MCP_FORM_DATA error', { path, error: err.message });
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  // Save form data to MCP filesystem
  if (request?.type === 'SAVE_MCP_FORM_DATA') {
    const path = String(request.payload?.path || 'profiles/default.json').trim();
    const data = request.payload?.data;
    bgLogger.info('SAVE_MCP_FORM_DATA requested', { path });

    (async () => {
      try {
        const appSettings = await getBilgeAppSettingsSnapshot();
        const mcpBaseUrl = String(appSettings?.mcpBaseUrl || '').trim() || 'https://mcp.caravanflow.com';
        const mcpToken = String(appSettings?.mcpApiToken || appSettings?.mcpToken || '').trim();
        const headers = {
          ...(mcpToken ? { 'Authorization': `Bearer ${mcpToken}` } : {}),
          'Content-Type': 'application/json'
        };

        const response = await fetch(`${mcpBaseUrl}/mcp/resource?path=${encodeURIComponent(path)}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(data)
        });

        if (!response.ok) {
          bgLogger.warn('MCP form data save failed', { status: response.status, path });
          sendResponse({ ok: false, error: `MCP save failed: ${response.status}` });
          return;
        }

        bgLogger.info('SAVE_MCP_FORM_DATA success', { path });
        sendResponse({ ok: true });
      } catch (err) {
        bgLogger.error('SAVE_MCP_FORM_DATA error', { path, error: err.message });
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  // List available profiles from MCP
  if (request?.type === 'LIST_MCP_PROFILES') {
    bgLogger.info('LIST_MCP_PROFILES requested');

    (async () => {
      try {
        const appSettings = await getBilgeAppSettingsSnapshot();
        const mcpBaseUrl = String(appSettings?.mcpBaseUrl || '').trim() || 'https://mcp.caravanflow.com';
        const mcpToken = String(appSettings?.mcpApiToken || appSettings?.mcpToken || '').trim();
        const headers = {
          ...(mcpToken ? { 'Authorization': `Bearer ${mcpToken}` } : {}),
          'Content-Type': 'application/json'
        };

        const response = await fetch(`${mcpBaseUrl}/mcp/list?path=profiles/`, {
          method: 'GET',
          headers
        });

        if (!response.ok) {
          sendResponse({ ok: false, error: `MCP list failed: ${response.status}`, profiles: [] });
          return;
        }

        const data = await response.json();
        const profiles = Array.isArray(data.files) ? data.files.filter(f => f.endsWith('.json')) : [];
        bgLogger.info('LIST_MCP_PROFILES success', { count: profiles.length });
        sendResponse({ ok: true, profiles });
      } catch (err) {
        bgLogger.error('LIST_MCP_PROFILES error', { error: err.message });
        sendResponse({ ok: false, error: err.message, profiles: [] });
      }
    })();
    return true;
  }

  // Relay self-healing messages to content script
  if (request?.type === 'FILL_FROM_PROFILE' ||
      request?.type === 'SAVE_FORM_STATE' ||
      request?.type === 'RESTORE_FORM_STATE' ||
      request?.type === 'GET_SELF_HEALING_STATS' ||
      request?.type === 'GET_PAGE_CONTEXT') {

    (async () => {
      try {
        const tab = await queryActiveTab();
        if (!tab?.id) {
          sendResponse({ ok: false, error: 'No active tab' });
          return;
        }

        const result = await sendContentMessageWithRetry(tab.id, request);
        sendResponse(result);
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  if (changes[RELAY_AGENT_ID_KEY]) {
    relayAgentIdCache = normalizeAgentId(changes[RELAY_AGENT_ID_KEY].newValue || '');
  }

  const relayRelevant = [
    MASTER_ACTIVE_KEY,
    RELAY_ENDPOINT_KEY,
    RELAY_WS_TOKEN_KEY,
    RELAY_AGENT_ID_KEY
  ];

  if (!relayRelevant.some((key) => changes[key])) {
    return;
  }

  if (changes[MASTER_ACTIVE_KEY] && changes[MASTER_ACTIVE_KEY].newValue === false) {
    disconnectRelay('master_off');
    return;
  }

  connectRelay().catch((err) => {
    bgLogger.warn('Relay reconnect after settings change failed', { error: toErrorMessage(err) });
    scheduleRelayReconnect();
  });
});

// Start relay client on worker load.
initializeRelayClient().catch((err) => {
  bgLogger.warn('Initial relay bootstrap failed', { error: toErrorMessage(err) });
});
