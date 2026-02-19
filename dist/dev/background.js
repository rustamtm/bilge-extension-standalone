var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/scripts/messageRouter.js
var MessageRouter = class {
  static {
    __name(this, "MessageRouter");
  }
  constructor() {
    this.handlers = /* @__PURE__ */ new Map();
    this.interceptors = [];
    console.log("[MessageRouter] Initialized");
  }
  /**
   * Register a handler for a specific action
   * @param {string} action - The action identifier
   * @param {Function} handler - Async function (request, sender) => response
   */
  register(action, handler) {
    if (this.handlers.has(action)) {
      console.warn(`[MessageRouter] Overwriting handler for action: ${action}`);
    }
    this.handlers.set(action, handler);
  }
  /**
   * Add a global interceptor for all messages
   * @param {Function} interceptor - Function (request, sender) => boolean (true to block)
   */
  addInterceptor(interceptor) {
    this.interceptors.push(interceptor);
  }
  /**
   * Dispatch an incoming message to the appropriate handler
   */
  async dispatch(request, sender) {
    const action = request.action || request.payload && request.payload.action || request.type;
    for (const interceptor of this.interceptors) {
      if (interceptor(request, sender)) {
        throw new Error("Message blocked by interceptor");
      }
    }
    const handler = this.handlers.get(action);
    if (!handler) {
      return null;
    }
    try {
      return await handler(request, sender);
    } catch (err) {
      console.error(`[MessageRouter] Error handling ${action}:`, err);
      return { ok: false, error: err.message || String(err) };
    }
  }
  /**
   * Listen for chrome.runtime.onMessage
   */
  listen() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      const action = request.action || request.payload && request.payload.action || request.type;
      if (!this.handlers.has(action)) return false;
      this.dispatch(request, sender).then((response) => {
        if (response !== null) {
          sendResponse(response);
        }
      });
      return true;
    });
  }
};
var messageRouter_default = MessageRouter;

// src/lib/env.js
function getInjectedEnv() {
  try {
    const g = typeof globalThis !== "undefined" ? globalThis : null;
    if (g && g.__BILGE_ENV__ && typeof g.__BILGE_ENV__ === "object") {
      return g.__BILGE_ENV__;
    }
  } catch {
  }
  return null;
}
__name(getInjectedEnv, "getInjectedEnv");
function getEnvFromBuildDefines() {
  const hasDefines = true;
  if (!hasDefines) return null;
  const inferredMode = true ? "development" : false ? "production" : "development";
  return {
    MODE: inferredMode,
    DEBUG: true ? true : true,
    VERSION: true ? "2.0.13" : "dev",
    MCP_BASE_URL: true ? "http://localhost:8787" : "http://localhost:8787",
    MCP_WS_URL: true ? "ws://localhost:8787/ws" : "ws://localhost:8787/ws",
    DEFAULT_BRAIN_PROVIDER: true ? "deepseek" : "deepseek",
    DEFAULT_BRAIN_MODEL: true ? "deepseek-chat" : "deepseek-chat",
    FEATURES: {
      DEV_TOOLS: true ? true : true,
      CONSOLE_LOGGING: true ? true : true,
      PERFORMANCE_METRICS: true ? true : true,
      HOT_RELOAD: true ? true : false
    },
    TELEMETRY: {
      ENABLED: true ? false : false,
      ENDPOINT: true ? "http://localhost:3001/telemetry" : ""
    }
  };
}
__name(getEnvFromBuildDefines, "getEnvFromBuildDefines");
function getEnv() {
  const injected = getInjectedEnv();
  if (injected) return injected;
  const fromDefines = getEnvFromBuildDefines();
  if (fromDefines) return fromDefines;
  return {
    MODE: "development",
    DEBUG: true,
    VERSION: "dev",
    MCP_BASE_URL: "http://localhost:8787",
    MCP_WS_URL: "ws://localhost:8787/ws",
    DEFAULT_BRAIN_PROVIDER: "deepseek",
    DEFAULT_BRAIN_MODEL: "deepseek-chat",
    FEATURES: { DEV_TOOLS: true, CONSOLE_LOGGING: true, PERFORMANCE_METRICS: true, HOT_RELOAD: true },
    TELEMETRY: { ENABLED: false, ENDPOINT: "" }
  };
}
__name(getEnv, "getEnv");
var ENV = getEnv();
var isDev = /* @__PURE__ */ __name(() => ENV.MODE === "development" || ENV.MODE === "dev", "isDev");

// src/lib/logger.js
var LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 };
var currentLevel = isDev() ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN;
function shouldLog(level) {
  if (!ENV.FEATURES.CONSOLE_LOGGING) return false;
  return level >= currentLevel;
}
__name(shouldLog, "shouldLog");
function formatMessage(level, module, message) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().split("T")[1].slice(0, -1);
  return `[${timestamp}] [${level}] [${module}] ${message}`;
}
__name(formatMessage, "formatMessage");
function createLogger(module) {
  return {
    debug(message, data) {
      if (shouldLog(LOG_LEVELS.DEBUG)) {
        console.debug(formatMessage("DEBUG", module, message), data ?? "");
      }
    },
    info(message, data) {
      if (shouldLog(LOG_LEVELS.INFO)) {
        console.info(formatMessage("INFO", module, message), data ?? "");
      }
    },
    warn(message, data) {
      if (shouldLog(LOG_LEVELS.WARN)) {
        console.warn(formatMessage("WARN", module, message), data ?? "");
      }
    },
    error(message, data) {
      if (shouldLog(LOG_LEVELS.ERROR)) {
        console.error(formatMessage("ERROR", module, message), data ?? "");
      }
    },
    time(label) {
      if (ENV.FEATURES.PERFORMANCE_METRICS) {
        console.time(`[${module}] ${label}`);
      }
    },
    timeEnd(label) {
      if (ENV.FEATURES.PERFORMANCE_METRICS) {
        console.timeEnd(`[${module}] ${label}`);
      }
    }
  };
}
__name(createLogger, "createLogger");
var logger = createLogger("Bilge");

// src/background.js
var BILGE_LOG_KEY = "__bilge_logs__";
var MAX_LOGS = 500;
var MAX_LOG_AGE_MS = 24 * 60 * 60 * 1e3;
var LogLevel = { DEBUG: "DEBUG", INFO: "INFO", WARN: "WARN", ERROR: "ERROR" };
function truncateForLog(value, maxLen = 500) {
  if (typeof value === "string" && value.length > maxLen) {
    return value.slice(0, maxLen) + "...[truncated]";
  }
  return value;
}
__name(truncateForLog, "truncateForLog");
function safeStringify(obj, maxLen = 1e3) {
  try {
    const str = JSON.stringify(obj, (key, value) => {
      if (typeof value === "string") return truncateForLog(value, 200);
      if (value instanceof Error) return { name: value.name, message: value.message };
      return value;
    });
    return truncateForLog(str, maxLen);
  } catch (e) {
    return String(obj);
  }
}
__name(safeStringify, "safeStringify");
async function storeLog(entry) {
  try {
    const result = await chrome.storage.local.get(BILGE_LOG_KEY);
    let logs = result[BILGE_LOG_KEY] || [];
    logs.push(entry);
    const now = Date.now();
    logs = logs.filter((log) => now - new Date(log.timestamp).getTime() < MAX_LOG_AGE_MS);
    if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
    await chrome.storage.local.set({ [BILGE_LOG_KEY]: logs });
  } catch (e) {
    console.error("[BilgeLogger] Failed to store log:", e);
  }
}
__name(storeLog, "storeLog");
var BilgeLogger = class {
  static {
    __name(this, "BilgeLogger");
  }
  constructor(source) {
    this.source = source;
  }
  async log(level, message, data = null) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      source: this.source,
      message: truncateForLog(String(message), 500)
    };
    if (data !== null && data !== void 0) entry.data = safeStringify(data);
    if (ENV.FEATURES.CONSOLE_LOGGING) {
      console.log(`[${entry.timestamp}][${this.source}][${level}] ${message}`, data || "");
    }
    await storeLog(entry);
    emitAgentLogTelemetry(entry);
    return entry;
  }
  debug(msg, data) {
    return this.log(LogLevel.DEBUG, msg, data);
  }
  info(msg, data) {
    return this.log(LogLevel.INFO, msg, data);
  }
  warn(msg, data) {
    return this.log(LogLevel.WARN, msg, data);
  }
  error(msg, data) {
    return this.log(LogLevel.ERROR, msg, data);
  }
};
async function getLogs(options = {}) {
  const { level, source, since, limit = 100 } = options;
  const result = await chrome.storage.local.get(BILGE_LOG_KEY);
  let logs = result[BILGE_LOG_KEY] || [];
  if (level) {
    const levels = Array.isArray(level) ? level : [level];
    logs = logs.filter((log) => levels.includes(log.level));
  }
  if (source) {
    const sources = Array.isArray(source) ? source : [source];
    logs = logs.filter((log) => sources.includes(log.source));
  }
  if (since) {
    const sinceTime = typeof since === "number" ? since : new Date(since).getTime();
    logs = logs.filter((log) => new Date(log.timestamp).getTime() >= sinceTime);
  }
  return logs.reverse().slice(0, limit);
}
__name(getLogs, "getLogs");
async function clearLogs() {
  await chrome.storage.local.remove(BILGE_LOG_KEY);
  return { cleared: true };
}
__name(clearLogs, "clearLogs");
async function exportLogs() {
  const logs = await getLogs({ limit: MAX_LOGS });
  return JSON.stringify(logs, null, 2);
}
__name(exportLogs, "exportLogs");
var bilgeLogUtils = {
  getLogs,
  clearLogs,
  exportLogs
};
globalThis.bilgeLogs = {
  async view(opts = {}) {
    const logs = await getLogs({ limit: opts.limit || 50, ...opts });
    console.log("\n===== BILGE LOGS =====");
    logs.forEach((l) => console.log(`[${l.level}] ${l.timestamp.slice(11, 23)} [${l.source}] ${l.message}`, l.data || ""));
    console.log(`===== ${logs.length} logs =====
`);
    return logs;
  },
  errors: /* @__PURE__ */ __name(() => globalThis.bilgeLogs.view({ level: "ERROR" }), "errors"),
  warnings: /* @__PURE__ */ __name(() => globalThis.bilgeLogs.view({ level: ["ERROR", "WARN"] }), "warnings"),
  since: /* @__PURE__ */ __name((min = 5) => globalThis.bilgeLogs.view({ since: Date.now() - min * 6e4 }), "since"),
  clear: clearLogs,
  export: exportLogs
};
var bgLogger = new BilgeLogger("background");
var batchLogger = new BilgeLogger("batch-executor");
var msgLogger = new BilgeLogger("message-handler");
if (chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === "function") {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));
}
chrome.runtime.onInstalled.addListener(() => {
  bgLogger.info("Bilge AI Workspace Extension Installed");
  chrome.storage.local.get(["connectorPreset", "brainProvider", "brainModel"]).then((stored) => {
    const patch = {};
    if (!String(stored?.connectorPreset || "").trim()) patch.connectorPreset = DEFAULT_CONNECTOR_PRESET;
    if (!String(stored?.brainProvider || "").trim()) patch.brainProvider = DEFAULT_BRAIN_PROVIDER;
    if (!String(stored?.brainModel || "").trim()) patch.brainModel = DEFAULT_BRAIN_MODEL;
    if (Object.keys(patch).length > 0) {
      return chrome.storage.local.set(patch);
    }
    return null;
  }).catch(() => {
  });
  ensureRelayAgentId().catch(() => {
  });
  initializeRelayClient().catch(() => {
  });
});
chrome.runtime.onStartup.addListener(() => {
  initializeRelayClient().catch(() => {
  });
});
var MASTER_ACTIVE_KEY = "masterActive";
var TRAINING_ALLOW_AI_SCRIPTS_KEY = "trainingAllowAiScripts";
var TRAINING_MODE_STORAGE_KEY = "trainingModeEnabled";
var RELAY_AGENT_ID_KEY = "agentId";
var RELAY_ENDPOINT_KEY = "endpoint";
var RELAY_WS_TOKEN_KEY = "wsToken";
var RELAY_HEARTBEAT_INTERVAL_MS = 15e3;
var RELAY_RECONNECT_BASE_MS = 2500;
var RELAY_RECONNECT_MAX_MS = 3e4;
var RELAY_CONNECT_TIMEOUT_MS = 5e3;
var TRACE_ID_LIMIT = 64;
var DOM_SKILL_MEMORY_KEY = "__bilge_dom_skill_memory_v1";
var DOM_SKILL_MEMORY_MAX = 300;
var DEFAULT_ANALYZE_ENDPOINT = "http://127.0.0.1:18080/api/ai/analyze-screen";
var DEFAULT_CONNECTOR_PRESET = "deepseek";
var DEFAULT_BRAIN_PROVIDER = ENV.DEFAULT_BRAIN_PROVIDER;
var DEFAULT_BRAIN_MODEL = ENV.DEFAULT_BRAIN_MODEL;
var ANALYZE_ENDPOINT_FALLBACKS = [
  DEFAULT_ANALYZE_ENDPOINT,
  "http://127.0.0.1:8000/api/ai/analyze-screen"
];
var RELAY_WS_FALLBACKS = [
  "ws://localhost:8787/ws/agent",
  "ws://127.0.0.1:8787/ws/agent",
  "ws://localhost:18080/ws/agent",
  "ws://127.0.0.1:18080/ws/agent"
];
var SELF_IMPROVEMENT_COMMAND_RE = /\b(self[-\s]?(improve|improvement|heal|healing|aware|awareness|repair)|maintenance\s+mode|fix\s+(yourself|self)|diagnose\s+(yourself|self)|self\s+check|restart\s+(yourself|self)|reboot\s+(yourself|self))\b/i;
var SELF_HEAL_DEFAULT_VALIDATION = {
  provider: "openai",
  model: "gpt-4o",
  fallbackProvider: "deepseek",
  fallbackModel: "deepseek-reasoner"
};
var relaySocket = null;
var relayReconnectTimer = null;
var relayReconnectAttempts = 0;
var relayHeartbeatTimer = null;
var relayLastUrl = "";
var relayAgentIdCache = "";
var relayConnectInFlight = null;
function toErrorMessage(err) {
  if (err && typeof err === "object" && typeof err.message === "string") return err.message;
  return String(err || "Unknown error");
}
__name(toErrorMessage, "toErrorMessage");
function sanitizeTraceId(raw, prefix = "id") {
  const value = String(raw || "").trim();
  if (!value) return `${prefix}_${Date.now().toString(36)}`;
  return value.slice(0, TRACE_ID_LIMIT);
}
__name(sanitizeTraceId, "sanitizeTraceId");
function normalizeAgentId(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, TRACE_ID_LIMIT);
}
__name(normalizeAgentId, "normalizeAgentId");
function normalizeAnalyzeEndpoint(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/api/ai/analyze-screen";
    }
    return url.toString();
  } catch (_err) {
    return "";
  }
}
__name(normalizeAnalyzeEndpoint, "normalizeAnalyzeEndpoint");
function boolByDefault(value, defaultValue) {
  if (value === void 0 || value === null) return Boolean(defaultValue);
  return Boolean(value);
}
__name(boolByDefault, "boolByDefault");
function sanitizeDomSkillMemoryEntries(rawEntries) {
  const now = Date.now();
  const byKey = /* @__PURE__ */ new Map();
  for (const raw of Array.isArray(rawEntries) ? rawEntries : []) {
    if (!raw || typeof raw !== "object") continue;
    const key = String(raw.key || "").trim();
    if (!key) continue;
    const intent = String(raw.intent || "").trim().toLowerCase();
    if (!intent) continue;
    const lastUsed = Number(raw.lastUsed || raw.updatedAt || raw.createdAt || 0);
    if (!Number.isFinite(lastUsed) || lastUsed <= 0) continue;
    if (now - lastUsed > 45 * 24 * 60 * 60 * 1e3) continue;
    byKey.set(key, {
      key,
      intent,
      host: String(raw.host || "").trim().toLowerCase(),
      pathPrefix: String(raw.pathPrefix || "/").trim() || "/",
      target: String(raw.target || "").trim(),
      successCount: Math.max(0, Number(raw.successCount || 0)),
      lastUsed,
      hints: raw.hints && typeof raw.hints === "object" ? raw.hints : {}
    });
  }
  return Array.from(byKey.values()).sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0)).slice(0, DOM_SKILL_MEMORY_MAX);
}
__name(sanitizeDomSkillMemoryEntries, "sanitizeDomSkillMemoryEntries");
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
    lastUsed: entry.lastUsed
  }));
  return {
    ok: true,
    total: entries.length,
    byIntent,
    recent
  };
}
__name(getDomSkillMemorySummary, "getDomSkillMemorySummary");
async function clearDomSkillMemory() {
  const stored = await chrome.storage.local.get([DOM_SKILL_MEMORY_KEY]);
  const entries = sanitizeDomSkillMemoryEntries(stored?.[DOM_SKILL_MEMORY_KEY]);
  await chrome.storage.local.set({ [DOM_SKILL_MEMORY_KEY]: [] });
  return { ok: true, cleared: entries.length };
}
__name(clearDomSkillMemory, "clearDomSkillMemory");
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
__name(ensureRelayAgentId, "ensureRelayAgentId");
async function getRelaySettings() {
  const keys = [
    MASTER_ACTIVE_KEY,
    TRAINING_ALLOW_AI_SCRIPTS_KEY,
    TRAINING_MODE_STORAGE_KEY,
    RELAY_AGENT_ID_KEY,
    RELAY_ENDPOINT_KEY,
    RELAY_WS_TOKEN_KEY,
    "goal",
    "connectorPreset",
    "brainProvider",
    "brainModel"
  ];
  const stored = await chrome.storage.local.get(keys);
  const endpoint = normalizeAnalyzeEndpoint(stored?.[RELAY_ENDPOINT_KEY]) || DEFAULT_ANALYZE_ENDPOINT;
  const agentId = normalizeAgentId(stored?.[RELAY_AGENT_ID_KEY]) || await ensureRelayAgentId();
  const masterActive = boolByDefault(stored?.[MASTER_ACTIVE_KEY], true);
  const trainingAllowAiScripts = boolByDefault(stored?.[TRAINING_ALLOW_AI_SCRIPTS_KEY], false);
  const trainingModeEnabled = boolByDefault(stored?.[TRAINING_MODE_STORAGE_KEY], false);
  const connectorPresetRaw = String(stored?.connectorPreset || "").trim();
  const brainProviderRaw = String(stored?.brainProvider || "").trim();
  const brainModelRaw = String(stored?.brainModel || "").trim();
  const connectorPreset = connectorPresetRaw || DEFAULT_CONNECTOR_PRESET;
  const brainProvider = brainProviderRaw || DEFAULT_BRAIN_PROVIDER;
  const brainModel = brainModelRaw || DEFAULT_BRAIN_MODEL;
  const defaultPatch = {};
  if (!connectorPresetRaw) defaultPatch.connectorPreset = connectorPreset;
  if (!brainProviderRaw) defaultPatch.brainProvider = brainProvider;
  if (!brainModelRaw) defaultPatch.brainModel = brainModel;
  if (Object.keys(defaultPatch).length > 0) {
    chrome.storage.local.set(defaultPatch).catch(() => {
    });
  }
  return {
    endpoint,
    wsToken: String(stored?.[RELAY_WS_TOKEN_KEY] || "").trim(),
    agentId,
    masterActive,
    trainingAllowAiScripts,
    trainingModeEnabled,
    goal: String(stored?.goal || "").trim(),
    connectorPreset,
    brainProvider,
    brainModel
  };
}
__name(getRelaySettings, "getRelaySettings");
function buildWsUrlFromEndpoint(endpoint, agentId, wsToken) {
  try {
    const endpointUrl = new URL(endpoint);
    const protocol = endpointUrl.protocol === "https:" ? "wss:" : "ws:";
    const ws = new URL(`${protocol}//${endpointUrl.host}/ws/agent`);
    if (agentId) ws.searchParams.set("agent_id", agentId);
    if (wsToken) ws.searchParams.set("token", wsToken);
    return ws.toString();
  } catch (_err) {
    return "";
  }
}
__name(buildWsUrlFromEndpoint, "buildWsUrlFromEndpoint");
function buildRelayWsCandidates(settings) {
  const candidates = [];
  const agentId = normalizeAgentId(settings?.agentId || relayAgentIdCache || "");
  const wsToken = String(settings?.wsToken || "").trim();
  const fromEndpoint = buildWsUrlFromEndpoint(settings?.endpoint || "", agentId, wsToken);
  if (fromEndpoint) candidates.push(fromEndpoint);
  for (const raw of RELAY_WS_FALLBACKS) {
    try {
      const url = new URL(raw);
      if (agentId) url.searchParams.set("agent_id", agentId);
      if (wsToken) url.searchParams.set("token", wsToken);
      candidates.push(url.toString());
    } catch (_err) {
    }
  }
  return Array.from(new Set(candidates));
}
__name(buildRelayWsCandidates, "buildRelayWsCandidates");
function relaySendFrame(frame) {
  if (!relaySocket || relaySocket.readyState !== WebSocket.OPEN) return false;
  try {
    relaySocket.send(JSON.stringify(frame));
    return true;
  } catch (_err) {
    return false;
  }
}
__name(relaySendFrame, "relaySendFrame");
function relaySendJsonRpcResult(id, result) {
  relaySendFrame({ jsonrpc: "2.0", id, result });
}
__name(relaySendJsonRpcResult, "relaySendJsonRpcResult");
function relaySendJsonRpcError(id, errorMessage, code = -32e3, details = {}) {
  relaySendFrame({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message: String(errorMessage || "Unknown error"),
      data: details
    }
  });
}
__name(relaySendJsonRpcError, "relaySendJsonRpcError");
function sendRelayAck(agentId, traceMeta, commandType) {
  relaySendFrame({
    type: "agent.ack",
    agent_id: agentId,
    run_id: traceMeta.runId,
    command_id: traceMeta.commandId,
    command_type: commandType,
    timestamp: Date.now()
  });
}
__name(sendRelayAck, "sendRelayAck");
function sendRelayResult(agentId, traceMeta, commandType, result = {}) {
  relaySendFrame({
    type: "agent.result",
    agent_id: agentId,
    run_id: traceMeta.runId,
    command_id: traceMeta.commandId,
    command_type: commandType,
    timestamp: Date.now(),
    ...result
  });
}
__name(sendRelayResult, "sendRelayResult");
function sendRelayError(agentId, traceMeta, commandType, errorMessage, retriable = false, details = {}) {
  relaySendFrame({
    type: "agent.error",
    agent_id: agentId,
    run_id: traceMeta.runId,
    command_id: traceMeta.commandId,
    command_type: commandType,
    error: String(errorMessage || "Unknown error"),
    retriable: Boolean(retriable),
    timestamp: Date.now(),
    ...details
  });
}
__name(sendRelayError, "sendRelayError");
function emitAgentLogTelemetry(entry) {
  if (!entry || typeof entry !== "object") return;
  const payload = {
    id: String(entry.id || ""),
    source: String(entry.source || ""),
    level: String(entry.level || "INFO"),
    text: String(entry.message || ""),
    timestamp: entry.timestamp || (/* @__PURE__ */ new Date()).toISOString(),
    data: entry.data
  };
  safeSendRuntimeMessage({ type: "AGENT_LOG", payload });
  relaySendFrame({
    type: "AGENT_LOG",
    agent_id: relayAgentIdCache || "",
    payload
  });
}
__name(emitAgentLogTelemetry, "emitAgentLogTelemetry");
function emitExecutionProgressTelemetry(payload) {
  if (!payload || typeof payload !== "object") return;
  relaySendFrame({
    type: "EXECUTION_PROGRESS",
    agent_id: relayAgentIdCache || "",
    payload: {
      ...payload,
      timestamp: Date.now()
    }
  });
}
__name(emitExecutionProgressTelemetry, "emitExecutionProgressTelemetry");
function stopRelayHeartbeat() {
  if (relayHeartbeatTimer) {
    clearInterval(relayHeartbeatTimer);
    relayHeartbeatTimer = null;
  }
}
__name(stopRelayHeartbeat, "stopRelayHeartbeat");
function startRelayHeartbeat(agentId, wsRef) {
  stopRelayHeartbeat();
  relayHeartbeatTimer = setInterval(() => {
    if (!wsRef || wsRef.readyState !== WebSocket.OPEN || relaySocket !== wsRef) return;
    relaySendFrame({
      type: "agent.heartbeat",
      agent_id: agentId,
      timestamp: Date.now()
    });
  }, RELAY_HEARTBEAT_INTERVAL_MS);
}
__name(startRelayHeartbeat, "startRelayHeartbeat");
function clearRelayReconnectTimer() {
  if (relayReconnectTimer) {
    clearTimeout(relayReconnectTimer);
    relayReconnectTimer = null;
  }
}
__name(clearRelayReconnectTimer, "clearRelayReconnectTimer");
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
      bgLogger.warn("Relay reconnect failed", { error: toErrorMessage(err) });
      scheduleRelayReconnect();
    });
  }, delay);
}
__name(scheduleRelayReconnect, "scheduleRelayReconnect");
function getRelayStatus() {
  return {
    connected: Boolean(relaySocket && relaySocket.readyState === WebSocket.OPEN),
    connecting: Boolean(relayConnectInFlight) || Boolean(relaySocket && relaySocket.readyState === WebSocket.CONNECTING),
    wsUrl: relayLastUrl,
    readyState: relaySocket ? relaySocket.readyState : WebSocket.CLOSED,
    reconnectAttempts: relayReconnectAttempts,
    agentId: relayAgentIdCache || ""
  };
}
__name(getRelayStatus, "getRelayStatus");
function normalizeRelayCommandType(raw) {
  const normalized = String(raw || "").trim().toUpperCase().replace(/[.\-/\s]+/g, "_");
  if (!normalized) return "";
  if (["CAPTURE_SCREEN", "CAPTURE", "SCREENSHOT", "TAKE_SCREENSHOT"].includes(normalized)) {
    return "CAPTURE_SCREEN";
  }
  if (["EXECUTE_ACTIONS", "EXECUTE_ACTION", "RUN_ACTIONS", "EXECUTE_BATCH_ACTIONS"].includes(normalized)) {
    return "EXECUTE_ACTIONS";
  }
  if (["APPLY_PRESETS", "APPLY_PRESET", "SET_PRESETS", "UPDATE_PRESETS"].includes(normalized)) {
    return "APPLY_PRESETS";
  }
  if (["TRAINING_PROBE", "RUN_TRAINING_PROBE", "PROBE"].includes(normalized)) {
    return "TRAINING_PROBE";
  }
  if (["NATURAL_COMMAND", "NL_COMMAND", "EXECUTE_NATURAL", "CORTEX_COMMAND"].includes(normalized)) {
    return "NATURAL_COMMAND";
  }
  if (["SELF_IMPROVE", "SELF_IMPROVEMENT", "SELF_HEAL", "SELF_HEALING", "MAINTENANCE_COORDINATOR"].includes(normalized)) {
    return "SELF_IMPROVE";
  }
  return "";
}
__name(normalizeRelayCommandType, "normalizeRelayCommandType");
function normalizeBrainPersona(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "bilge_agent";
  if (value === "bilge_web" || value === "web" || value === "app") return "bilge_web";
  return "bilge_agent";
}
__name(normalizeBrainPersona, "normalizeBrainPersona");
function isSelfImprovementNaturalCommand(rawCommand) {
  const text = String(rawCommand || "").trim().toLowerCase();
  if (!text) return false;
  return SELF_IMPROVEMENT_COMMAND_RE.test(text);
}
__name(isSelfImprovementNaturalCommand, "isSelfImprovementNaturalCommand");
function normalizeValidationProvider(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "";
  if (value === "chatgpt") return "openai";
  if (value === "google") return "gemini";
  if (value === "ds") return "deepseek";
  return value;
}
__name(normalizeValidationProvider, "normalizeValidationProvider");
function resolveSelfHealingValidationMode(payload = {}, settings = {}) {
  const requestedProvider = normalizeValidationProvider(
    payload.validationProvider || payload.provider
  );
  const requestedModel = String(payload.validationModel || payload.model || "").trim();
  if (requestedProvider === "openai") {
    return {
      recommendedProvider: "openai",
      recommendedModel: requestedModel || SELF_HEAL_DEFAULT_VALIDATION.model,
      fallbackProvider: SELF_HEAL_DEFAULT_VALIDATION.fallbackProvider,
      fallbackModel: SELF_HEAL_DEFAULT_VALIDATION.fallbackModel,
      note: "OpenAI is preferred for strict multimodal self-healing validation."
    };
  }
  if (requestedProvider === "deepseek") {
    return {
      recommendedProvider: "deepseek",
      recommendedModel: requestedModel || SELF_HEAL_DEFAULT_VALIDATION.fallbackModel,
      fallbackProvider: SELF_HEAL_DEFAULT_VALIDATION.provider,
      fallbackModel: SELF_HEAL_DEFAULT_VALIDATION.model,
      note: "DeepSeek supports vision in Bilge, but OpenAI remains the stricter validation fallback."
    };
  }
  if (requestedProvider === "gemini") {
    return {
      recommendedProvider: "gemini",
      recommendedModel: requestedModel || "gemini-2.0-flash",
      fallbackProvider: SELF_HEAL_DEFAULT_VALIDATION.provider,
      fallbackModel: SELF_HEAL_DEFAULT_VALIDATION.model,
      note: "Gemini selected explicitly for validation mode."
    };
  }
  const configuredProvider = normalizeValidationProvider(settings.brainProvider);
  const configuredModel = String(settings.brainModel || "").trim();
  if (configuredProvider === "openai" && configuredModel) {
    return {
      recommendedProvider: "openai",
      recommendedModel: configuredModel,
      fallbackProvider: SELF_HEAL_DEFAULT_VALIDATION.fallbackProvider,
      fallbackModel: SELF_HEAL_DEFAULT_VALIDATION.fallbackModel,
      note: "Using current OpenAI connector configuration for validation mode."
    };
  }
  return {
    recommendedProvider: SELF_HEAL_DEFAULT_VALIDATION.provider,
    recommendedModel: SELF_HEAL_DEFAULT_VALIDATION.model,
    fallbackProvider: SELF_HEAL_DEFAULT_VALIDATION.fallbackProvider,
    fallbackModel: SELF_HEAL_DEFAULT_VALIDATION.fallbackModel,
    note: "DeepSeek has vision in this runtime; OpenAI gpt-4o is still default for strict multimodal self-healing validation."
  };
}
__name(resolveSelfHealingValidationMode, "resolveSelfHealingValidationMode");
function buildSelfAwarenessComponents(settings, relayStatus, appSettings, contentReachable, tab) {
  const runtimeMcpBase = String(appSettings?.mcpBaseUrl || "").trim() || "https://mcp.caravanflow.com";
  return [
    {
      id: "bilge_agent_runtime",
      role: "Primary Bilge Agent runtime in Chrome extension service worker",
      status: "active",
      details: `agentId=${relayStatus.agentId || ""}`
    },
    {
      id: "bilge_web_persona",
      role: "Bilge Web chat persona (separate identity boundary)",
      status: "isolated",
      details: "Do not merge bilge_agent and bilge_web personas."
    },
    {
      id: "mcp_bridge",
      role: "MCP tool bridge between UI and extension runtime",
      status: "active",
      details: runtimeMcpBase
    },
    {
      id: "relay_transport",
      role: "WebSocket relay for agent orchestration",
      status: relayStatus.connected ? "connected" : "disconnected",
      details: relayStatus.wsUrl || "(not connected)"
    },
    {
      id: "content_runtime",
      role: "Content script DOM runtime on the active tab",
      status: contentReachable ? "reachable" : "unreachable",
      details: tab?.url ? String(tab.url) : "No active tab"
    },
    {
      id: "cortex_parser",
      role: "Natural-language parser and action planner (BilgeCortex)",
      status: "active",
      details: "Supports parse/rewrite/recovery paths for natural commands."
    },
    {
      id: "analyze_endpoint",
      role: "Vision/analyze endpoint for probe workflows",
      status: settings.endpoint ? "configured" : "default",
      details: settings.endpoint || DEFAULT_ANALYZE_ENDPOINT
    }
  ];
}
__name(buildSelfAwarenessComponents, "buildSelfAwarenessComponents");
async function getBilgeAppSettingsSnapshot() {
  try {
    const stored = await chrome.storage.local.get(["bilge_app_settings"]);
    const payload = stored?.bilge_app_settings;
    if (payload && typeof payload === "object") return payload;
  } catch (_err) {
  }
  return {};
}
__name(getBilgeAppSettingsSnapshot, "getBilgeAppSettingsSnapshot");
function parseIncomingRelayCommand(data) {
  if (!data || typeof data !== "object") return null;
  const rawType = String(data.type || "");
  const rawMethod = String(data.method || "");
  const isJsonRpc = data.jsonrpc === "2.0";
  const isToolCall = rawMethod === "tools/call" || rawType.toUpperCase() === "MCP.TOOL_CALL";
  const rpcId = isJsonRpc ? data.id : null;
  let commandType = "";
  let payload = {};
  if (isToolCall) {
    const toolName = data.params?.name || data.name || "";
    commandType = normalizeRelayCommandType(toolName);
    payload = data.params?.arguments || data.arguments || {};
  } else if (isJsonRpc) {
    commandType = normalizeRelayCommandType(rawMethod);
    payload = data.params || {};
  } else {
    commandType = normalizeRelayCommandType(rawType || data.command || data.kind);
    payload = data.payload && typeof data.payload === "object" ? data.payload : data;
  }
  if (!commandType) return null;
  if (!payload || typeof payload !== "object") payload = {};
  const traceMeta = {
    runId: sanitizeTraceId(
      payload.run_id || payload.runId || data.run_id || data.runId,
      "run"
    ),
    commandId: sanitizeTraceId(
      payload.command_id || payload.commandId || data.command_id || data.commandId || data.id,
      "cmd"
    )
  };
  const agentId = normalizeAgentId(
    payload.agent_id || payload.agentId || data.agent_id || data.agentId || ""
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
__name(parseIncomingRelayCommand, "parseIncomingRelayCommand");
function coerceBoolean(value, fallback = false) {
  if (value === void 0 || value === null) return Boolean(fallback);
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (!text) return Boolean(fallback);
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return Boolean(fallback);
}
__name(coerceBoolean, "coerceBoolean");
function sanitizePresetPatch(rawPresets = {}) {
  const source = rawPresets && typeof rawPresets === "object" ? rawPresets : {};
  const aliasMap = {
    current_goal: "goal",
    analysis_endpoint: RELAY_ENDPOINT_KEY,
    endpoint: RELAY_ENDPOINT_KEY,
    agent_id: RELAY_AGENT_ID_KEY,
    agentId: RELAY_AGENT_ID_KEY,
    master_active: MASTER_ACTIVE_KEY,
    masterActive: MASTER_ACTIVE_KEY,
    training_allow_ai_scripts: TRAINING_ALLOW_AI_SCRIPTS_KEY,
    trainingAllowAiScripts: TRAINING_ALLOW_AI_SCRIPTS_KEY,
    connector_preset: "connectorPreset",
    connectorPreset: "connectorPreset",
    provider: "brainProvider",
    brain_provider: "brainProvider",
    brainProvider: "brainProvider",
    model: "brainModel",
    brain_model: "brainModel",
    brainModel: "brainModel",
    ws_token: RELAY_WS_TOKEN_KEY,
    wsToken: RELAY_WS_TOKEN_KEY
  };
  const allowed = /* @__PURE__ */ new Set([
    "goal",
    RELAY_ENDPOINT_KEY,
    RELAY_AGENT_ID_KEY,
    MASTER_ACTIVE_KEY,
    TRAINING_ALLOW_AI_SCRIPTS_KEY,
    "connectorPreset",
    "brainProvider",
    "brainModel",
    RELAY_WS_TOKEN_KEY
  ]);
  const patch = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === void 0 || value === null) continue;
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
__name(sanitizePresetPatch, "sanitizePresetPatch");
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
  const requiresReconnect = changedKeys.some(
    (key) => [RELAY_ENDPOINT_KEY, RELAY_AGENT_ID_KEY, RELAY_WS_TOKEN_KEY, MASTER_ACTIVE_KEY].includes(key)
  );
  if (requiresReconnect) {
    await connectRelay().catch(() => {
    });
  }
  return {
    ok: true,
    applied: changedKeys.length > 0,
    changedKeys,
    appliedPatch: patch
  };
}
__name(applyRelayPresets, "applyRelayPresets");
async function queryActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0] ? tabs[0] : null;
}
__name(queryActiveTab, "queryActiveTab");
async function captureVisibleTabDataUrl(windowId = null) {
  return await new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
      const err = chrome.runtime.lastError;
      if (err) reject(err);
      else resolve(dataUrl);
    });
  });
}
__name(captureVisibleTabDataUrl, "captureVisibleTabDataUrl");
var CONTENT_SCRIPT_RETRY_DELAY_MS = 120;
var CONTENT_SCRIPT_INJECT_FILES = ["content.js"];
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
__name(isAllowedFileSchemeAccess, "isAllowedFileSchemeAccess");
async function tryInjectContentScript(tabId, frameId = 0) {
  const resolvedFrameId = typeof frameId === "number" ? frameId : 0;
  let tabUrl = "";
  try {
    const tab = await new Promise((resolve) => {
      chrome.tabs.get(tabId, (t) => {
        void chrome.runtime.lastError;
        resolve(t || null);
      });
    });
    tabUrl = String(tab?.url || "");
  } catch (_err) {
  }
  if (tabUrl && isRestrictedUrl(tabUrl)) {
    throw new Error(
      `Cannot access DOM for restricted URL: ${tabUrl || "(unknown url)"} (Chrome blocks content scripts on internal pages / Web Store).`
    );
  }
  if (tabUrl && tabUrl.toLowerCase().startsWith("file://")) {
    const allowed = await isAllowedFileSchemeAccess();
    if (allowed === false) {
      throw new Error(
        'Cannot access DOM on file:// pages until you enable "Allow access to file URLs" in chrome://extensions -> Bilge AI Workspace -> Details.'
      );
    }
  }
  await new Promise((resolve, reject) => {
    try {
      chrome.scripting.executeScript(
        {
          target: { tabId, frameIds: [resolvedFrameId] },
          files: CONTENT_SCRIPT_INJECT_FILES,
          world: "ISOLATED"
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
__name(tryInjectContentScript, "tryInjectContentScript");
async function sendTabMessage(tabId, payload) {
  return await new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, { frameId: 0 }, (response) => {
      const err = chrome.runtime.lastError;
      if (err) reject(err);
      else resolve(response);
    });
  });
}
__name(sendTabMessage, "sendTabMessage");
async function injectContentScriptTopFrame(tabId) {
  await tryInjectContentScript(tabId, 0);
  await new Promise((resolve) => setTimeout(resolve, CONTENT_SCRIPT_RETRY_DELAY_MS));
  return true;
}
__name(injectContentScriptTopFrame, "injectContentScriptTopFrame");
async function sendContentMessageWithRetry(tabId, payload) {
  try {
    return await sendTabMessage(tabId, payload);
  } catch (err) {
    if (!shouldRetryAfterNoReceiver(err)) throw err;
    await injectContentScriptTopFrame(tabId);
    return await sendTabMessage(tabId, payload);
  }
}
__name(sendContentMessageWithRetry, "sendContentMessageWithRetry");
async function collectDomValidationSummary(tabId) {
  try {
    const injected = await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      func: /* @__PURE__ */ __name(() => {
        const nodes = Array.from(document.querySelectorAll('input, textarea, select, [contenteditable="true"]'));
        let requiredCount = 0;
        let invalidCount = 0;
        const invalidSelectors = [];
        function makeSelector(element) {
          try {
            const tag = String(element.tagName || "").toLowerCase();
            if (!tag) return "";
            const id = element.getAttribute("id");
            if (id) return `#${CSS.escape(id)}`;
            const name = element.getAttribute("name");
            if (name) return `${tag}[name="${CSS.escape(name)}"]`;
            const className = String(element.className || "").trim();
            if (className) {
              const first = className.split(/\s+/).filter(Boolean)[0];
              if (first) return `${tag}.${first}`;
            }
            return tag;
          } catch (_err) {
            return "";
          }
        }
        __name(makeSelector, "makeSelector");
        for (const element of nodes) {
          const isRequired = element.hasAttribute("required") || element.getAttribute("aria-required") === "true";
          if (isRequired) requiredCount += 1;
          let invalid = false;
          try {
            if (typeof element.checkValidity === "function") {
              invalid = !element.checkValidity();
            }
          } catch (_err) {
          }
          if (!invalid && element.getAttribute("aria-invalid") === "true") {
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
      }, "func")
    });
    return injected?.[0]?.result || { totalScanned: 0, requiredCount: 0, invalidCount: 0, invalidSelectors: [] };
  } catch (_err) {
    return { totalScanned: 0, requiredCount: 0, invalidCount: 0, invalidSelectors: [] };
  }
}
__name(collectDomValidationSummary, "collectDomValidationSummary");
async function buildStructuredDomSnapshot(tabId) {
  const [pageInfo, extracted, validation] = await Promise.all([
    sendContentMessageWithRetry(tabId, { type: "GET_PAGE_INFO" }).catch(() => null),
    sendContentMessageWithRetry(tabId, { type: "EXTRACT_FORM_FIELDS" }).catch(() => null),
    collectDomValidationSummary(tabId)
  ]);
  const fields = Array.isArray(extracted?.fields) ? extracted.fields : [];
  const requiredFieldCount = fields.filter((field) => field && field.isRequired === true).length;
  return {
    url: String(pageInfo?.url || extracted?.pageUrl || ""),
    title: String(pageInfo?.title || extracted?.pageTitle || ""),
    formFields: fields.slice(0, 300),
    summary: {
      totalFields: fields.length,
      requiredFields: requiredFieldCount,
      invalidFields: Number(validation?.invalidCount || 0),
      invalidSelectors: Array.isArray(validation?.invalidSelectors) ? validation.invalidSelectors : []
    }
  };
}
__name(buildStructuredDomSnapshot, "buildStructuredDomSnapshot");
async function postAnalyzeScreen(payload, settings = null) {
  const relaySettings = settings || await getRelaySettings();
  if (!payload.metadata?.brainProvider || !payload.metadata?.brainModel) {
    const routing = resolveRoutingWithIntelligentFallback(payload.goal || "", relaySettings, {
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const text = await response.text();
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
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
  return { ok: false, error: lastError || "Analyze endpoint unavailable" };
}
__name(postAnalyzeScreen, "postAnalyzeScreen");
async function handleCaptureScreenCommand(command, settings, agentId) {
  const tab = await queryActiveTab();
  if (!tab?.id) throw new Error("No active tab available for CAPTURE_SCREEN");
  const screenshot = await captureVisibleTabDataUrl(tab.windowId ?? null);
  const payload = command.payload || {};
  const goal = String(payload.goal || settings.goal || "").trim();
  const shouldAnalyze = payload.analyze === true || Boolean(goal);
  const includeSnapshot = payload.includeDomSnapshot === true || shouldAnalyze;
  const snapshot = includeSnapshot ? await buildStructuredDomSnapshot(tab.id).catch(() => null) : null;
  let analysis = null;
  if (shouldAnalyze) {
    const analyzePayload = {
      screenshot,
      url: String(snapshot?.url || tab.url || ""),
      title: String(snapshot?.title || tab.title || ""),
      goal: goal || "Analyze active tab screenshot.",
      domSnapshot: snapshot,
      metadata: {
        source: "bilge-chrome-extension",
        agentId,
        command: "CAPTURE_SCREEN"
      }
    };
    analysis = await postAnalyzeScreen(analyzePayload, settings);
  }
  return {
    ok: true,
    command: "CAPTURE_SCREEN",
    screenshot,
    page: { url: String(tab.url || ""), title: String(tab.title || "") },
    domSnapshot: snapshot,
    analysis
  };
}
__name(handleCaptureScreenCommand, "handleCaptureScreenCommand");
async function handleExecuteActionsCommand(command, settings) {
  if (settings.masterActive === false) {
    throw new Error("MASTER_ACTIVE is OFF; EXECUTE_ACTIONS blocked.");
  }
  if (activeRuns.size > 0) {
    return { ok: false, retriable: true, error: `Agent busy with ${activeRuns.size} active run(s)` };
  }
  const payload = command.payload || {};
  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  if (actions.length === 0) {
    throw new Error("No valid actions provided for EXECUTE_ACTIONS");
  }
  const options = payload.options && typeof payload.options === "object" ? { ...payload.options } : {};
  const allowAiScripts = settings.masterActive === true && settings.trainingAllowAiScripts === true;
  options.allowAiScripts = allowAiScripts;
  const result = await executeBatchActions(actions, options, command.traceMeta);
  return {
    ok: result?.ok !== false,
    command: "EXECUTE_ACTIONS",
    runId: result?.runId || "",
    executedSteps: Number(result?.executedSteps || 0),
    cancelled: Boolean(result?.cancelled),
    allowAiScripts,
    error: result?.error || null
  };
}
__name(handleExecuteActionsCommand, "handleExecuteActionsCommand");
async function handleTrainingProbeCommand(command, settings, agentId) {
  if (settings.masterActive === false) {
    throw new Error("MASTER_ACTIVE is OFF; TRAINING_PROBE blocked.");
  }
  const tab = await queryActiveTab();
  if (!tab?.id) throw new Error("No active tab available for TRAINING_PROBE");
  const payload = command.payload || {};
  const probe = String(payload.probe || payload.goal || "").trim();
  const goal = String(payload.goal || probe || settings.goal || "Training probe").trim();
  const screenshot = await captureVisibleTabDataUrl(tab.windowId ?? null);
  const snapshot = await buildStructuredDomSnapshot(tab.id);
  let targetHtml = "";
  const targetSelector = String(payload.selector || "").trim();
  if (targetSelector) {
    const explored = await sendContentMessageWithRetry(tab.id, { type: "EXPLORE_DOM", selector: targetSelector }).catch(() => null);
    targetHtml = String(explored?.html || "");
  }
  const analyzePayload = {
    screenshot,
    url: snapshot.url || String(tab.url || ""),
    title: snapshot.title || String(tab.title || ""),
    goal,
    trainingMode: true,
    probe: probe || goal,
    targetSelector,
    targetHtml,
    domSnapshot: snapshot,
    metadata: {
      source: "bilge-chrome-extension",
      command: "TRAINING_PROBE",
      agentId,
      trainingAllowAiScripts: settings.trainingAllowAiScripts === true,
      trainingModeEnabled: settings.trainingModeEnabled === true,
      connectorPreset: settings.connectorPreset || "",
      brainProvider: settings.brainProvider || "",
      brainModel: settings.brainModel || ""
    }
  };
  const analysis = await postAnalyzeScreen(analyzePayload, settings);
  return {
    ok: analysis?.ok === true,
    command: "TRAINING_PROBE",
    goal,
    probe: probe || goal,
    snapshot,
    analysis
  };
}
__name(handleTrainingProbeCommand, "handleTrainingProbeCommand");
function isScreenshotNaturalCommand(rawCommand) {
  const text = String(rawCommand || "").trim().toLowerCase();
  if (!text) return false;
  return /\b(screenshot|screen\s*shot|capture\s*(the\s*)?(screen|page)|take\s*(a\s*)?screenshot)\b/i.test(text);
}
__name(isScreenshotNaturalCommand, "isScreenshotNaturalCommand");
function isAgentStatusNaturalCommand(rawCommand) {
  const text = String(rawCommand || "").trim().toLowerCase();
  if (!text) return false;
  return /\b(status|progress|current\s+step|what\s+are\s+you\s+doing|what(?:'s| is)\s+(?:happening|going\s+on)|where\s+are\s+we|are\s+you\s+stuck)\b/i.test(text);
}
__name(isAgentStatusNaturalCommand, "isAgentStatusNaturalCommand");
async function handleSelfImproveCommand(command, settings, agentId) {
  const payload = command?.payload && typeof command.payload === "object" ? command.payload : {};
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
      code: "master_inactive",
      severity: "high",
      message: "MASTER_ACTIVE is off; relay actions are blocked."
    });
    if (autoHeal && allowEnableMasterActive) {
      await chrome.storage.local.set({ [MASTER_ACTIVE_KEY]: true }).catch(() => {
      });
      workingSettings.masterActive = true;
      actionsTaken.push({
        action: "enable_master_active",
        status: "applied",
        detail: "Set masterActive=true from self-improvement mode."
      });
    }
  }
  if (!relayBefore.connected && autoHeal && workingSettings.masterActive !== false) {
    try {
      await connectRelay();
      actionsTaken.push({
        action: "relay_reconnect",
        status: "applied",
        detail: "Attempted reconnect for relay transport."
      });
    } catch (err) {
      issues.push({
        code: "relay_reconnect_failed",
        severity: "medium",
        message: toErrorMessage(err)
      });
      actionsTaken.push({
        action: "relay_reconnect",
        status: "failed",
        detail: toErrorMessage(err)
      });
    }
  } else if (!relayBefore.connected && autoHeal && workingSettings.masterActive === false) {
    actionsTaken.push({
      action: "relay_reconnect",
      status: "skipped",
      detail: "Skipped reconnect because masterActive is disabled."
    });
  }
  const relayAfter = getRelayStatus();
  if (!relayAfter.connected) {
    issues.push({
      code: "relay_disconnected",
      severity: "medium",
      message: "Relay websocket is not connected."
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
      await chrome.storage.local.set(patch).catch(() => {
      });
      actionsTaken.push({
        action: "apply_validation_mode",
        status: "applied",
        detail: `${patch.brainProvider || ""}/${patch.brainModel || ""}`.replace(/^\/|\/$/g, "")
      });
      workingSettings = { ...workingSettings, ...patch };
    }
  }
  const tab = await queryActiveTab().catch(() => null);
  if (!tab?.id) {
    issues.push({
      code: "no_active_tab",
      severity: "high",
      message: "No active tab available for content runtime checks."
    });
  }
  let contentPing = { ok: false, error: "No active tab available." };
  if (tab?.id) {
    try {
      const ping = await sendContentMessageWithRetry(tab.id, { type: "__BILGE_PING__" });
      const ok = ping?.ok === true;
      contentPing = ok ? { ok: true } : { ok: false, error: "Unexpected content ping response." };
      if (!ok) {
        issues.push({
          code: "content_runtime_unreachable",
          severity: "high",
          message: "Content runtime did not return a healthy ping."
        });
      }
    } catch (err) {
      const msg = toErrorMessage(err);
      contentPing = { ok: false, error: msg };
      issues.push({
        code: "content_runtime_unreachable",
        severity: "high",
        message: msg
      });
    }
  }
  let domSnapshot = null;
  if (tab?.id && includeDomSnapshot) {
    domSnapshot = await buildStructuredDomSnapshot(tab.id).catch(() => null);
  }
  let screenshot = "";
  if (tab?.id && includeScreenshot) {
    screenshot = await captureVisibleTabDataUrl(tab.windowId ?? null).catch(() => "");
  }
  const selfAwareness = {
    identity: {
      persona: "bilge_agent",
      runtime: "chrome_extension",
      separatedFromBilgeWeb: true,
      agentId: agentId || relayAfter.agentId || relayAgentIdCache || "",
      source: "background.self_improvement_mode"
    },
    access: {
      browserAutomation: true,
      mcpBridge: true,
      relayDispatch: true,
      screenshotCapture: true,
      shellAccessViaMcp: true
    },
    boundaries: {
      bilgeAgent: "Chrome extension runtime persona used for relay + MCP tooling.",
      bilgeWeb: "Chat persona in Bilge web UI; must stay logically separate."
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
    "Use talk_to_bilge_agent_brain for targeted browser actions after diagnostics.",
    "Use dispatch_agent_command with TRAINING_PROBE to collect richer form + DOM telemetry.",
    `Run multimodal validation with ${validationMode.recommendedProvider}/${validationMode.recommendedModel} before high-risk automation.`
  ];
  if (!relayAfter.connected) {
    suggestedNextActions.unshift("Restore relay websocket service (127.0.0.1:8787 or 127.0.0.1:18080), then re-run self-improvement mode.");
  }
  if (!contentPing.ok) {
    suggestedNextActions.unshift("Open a normal http/https page and ensure content script is reachable, then re-run self-improvement mode.");
  }
  const summary = issues.length === 0 ? "Self-improvement check complete. Runtime is healthy and ready for autonomous maintenance." : `Self-improvement check found ${issues.length} issue(s). ${autoHeal ? "Auto-heal attempted where safe." : "Auto-heal disabled."}`;
  if (restartAfter) {
    actionsTaken.push({
      action: "restart_extension",
      status: "scheduled",
      detail: "Extension reload scheduled after self-improvement response."
    });
    setTimeout(() => {
      try {
        chrome.runtime.reload();
      } catch (_err) {
      }
    }, 250);
  }
  return {
    ok: true,
    command: "SELF_IMPROVE",
    protocol: "self-improvement-v1",
    persona: "bilge_agent",
    summary,
    durationMs: Date.now() - startedAt,
    selfAwareness,
    diagnostics: {
      autoHeal,
      restartAfter,
      relayBefore,
      relayAfter,
      contentPing,
      activeTab: tab ? { id: Number(tab.id || 0), url: String(tab.url || ""), title: String(tab.title || "") } : null,
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
    ...screenshot ? { screenshot } : {}
  };
}
__name(handleSelfImproveCommand, "handleSelfImproveCommand");
var ROUTING_MODES = Object.freeze({ BUILTIN: "builtin", CORTEX: "cortex" });
var DEFAULT_ROUTING_MODE = ROUTING_MODES.BUILTIN;
function resolveRoutingWithIntelligentFallback(userCommand, settings, context = {}) {
  const routingMode = settings.routingMode || DEFAULT_ROUTING_MODE;
  const defaultProvider = settings.brainProvider || ENV.DEFAULT_BRAIN_PROVIDER;
  const defaultModel = settings.brainModel || ENV.DEFAULT_BRAIN_MODEL;
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
            url: context.url || "",
            title: context.title || "",
            mode: settings.executionMode || "batch",
            allow_script_actions: settings.allowScriptActions || false,
            cortex_intent: intentInfo?.category || "",
            cortex_strategy: `${strategy.provider}/${strategy.model}`,
            cortex_hints: strategy?.strategy || ""
          }
        );
        return {
          mode: "cortex",
          provider: strategy.provider,
          model: strategy.model,
          systemPrompt,
          executor: "standard",
          meta: { intent: intentInfo, strategy }
        };
      }
    } catch (e) {
      console.warn("[Routing] Cortex failed, trying builtin fallback:", e);
    }
  }
  if (routingMode === ROUTING_MODES.BUILTIN || routingMode === ROUTING_MODES.CORTEX) {
    const systemPrompt = globalThis.CortexExtConfig?.renderTemplate(
      settings.brainSystemTemplate || globalThis.CortexExtConfig.DEFAULT_BRAIN_SYSTEM_TEMPLATE,
      {
        goal: userCommand,
        url: context.url || "",
        title: context.title || "",
        mode: settings.executionMode || "batch",
        allow_script_actions: settings.allowScriptActions || false,
        cortex_intent: "",
        cortex_strategy: "",
        cortex_hints: ""
      }
    );
    return {
      mode: "builtin",
      provider: defaultProvider,
      model: defaultModel,
      systemPrompt,
      executor: "standard",
      meta: { source: "storage" }
    };
  }
  const simplePatterns = [
    { pattern: /^fill\s+(form|all|fields?)/i, action: "fill_form" },
    { pattern: /^fill\s+(.+?)\s+(?:with|as|to)\s+(.+)$/i, action: "fill_field" },
    { pattern: /^click\s+(.+)$/i, action: "click" },
    { pattern: /^type\s+(.+?)\s+(?:into|in)\s+(.+)$/i, action: "type" },
    { pattern: /^scroll\s+(down|up|to\s+.+)$/i, action: "scroll" },
    { pattern: /^submit/i, action: "submit" }
  ];
  for (const { pattern, action } of simplePatterns) {
    const match = userCommand.match(pattern);
    if (match) {
      return {
        mode: "intelligent_dom",
        provider: null,
        model: null,
        executor: "bilge_execution_engine",
        action,
        params: match.slice(1),
        meta: { pattern: pattern.source, direct: true }
      };
    }
  }
  return {
    mode: "intelligent_dom_inference",
    provider: null,
    model: null,
    executor: "bilge_execution_engine",
    action: "intelligent",
    intent: userCommand,
    meta: { inferred: true }
  };
}
__name(resolveRoutingWithIntelligentFallback, "resolveRoutingWithIntelligentFallback");
async function executeWithRouting(routing, context) {
  const { tabId } = context;
  if (routing.executor === "standard" && routing.provider) {
    return null;
  }
  if (routing.executor === "bilge_execution_engine") {
    const data = {};
    if (routing.action === "fill_form") {
      const profile = await loadProfile();
      data.profile = profile;
    } else if (routing.action === "fill_field") {
      data.selector = routing.params[0];
      data.value = routing.params[1];
    } else if (routing.action === "click") {
      data.target = routing.params[0];
    } else if (routing.action === "intelligent") {
      data.text = routing.intent;
    }
    return await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, {
        type: "ENGINE_EXECUTE",
        intent: { type: routing.action },
        data
      }, (res) => {
        resolve(res || { ok: false, error: "No response from execution engine" });
      });
    });
  }
  return { ok: false, error: "No valid executor resolved" };
}
__name(executeWithRouting, "executeWithRouting");
async function handleNaturalCommand(command, settings) {
  if (settings.masterActive === false) {
    throw new Error("MASTER_ACTIVE is OFF; NATURAL_COMMAND blocked.");
  }
  const payload = command.payload || {};
  const commandText = String(payload.command || payload.text || payload.input || "").trim();
  const requestedPersona = normalizeBrainPersona(
    payload.persona || payload.brain || payload.targetPersona || payload.target
  );
  const strictPersona = coerceBoolean(payload.strictPersona, true);
  if (!commandText) {
    throw new Error("No command text provided for NATURAL_COMMAND");
  }
  if (strictPersona && requestedPersona !== "bilge_agent") {
    throw new Error(
      `NATURAL_COMMAND relay is scoped to Bilge Agent persona. Requested persona "${requestedPersona}" should use Bilge Web chat channel.`
    );
  }
  if (isSelfImprovementNaturalCommand(commandText)) {
    const targetAgentId = settings.agentId || relayAgentIdCache || await ensureRelayAgentId();
    return await handleSelfImproveCommand(
      {
        ...command,
        type: "SELF_IMPROVE",
        payload: {
          ...payload,
          command: commandText,
          persona: requestedPersona,
          source: payload.source || "natural_command.self_improvement"
        }
      },
      settings,
      targetAgentId
    );
  }
  const tab = await queryActiveTab();
  if (!tab?.id) {
    throw new Error("No active tab available for NATURAL_COMMAND");
  }
  msgLogger.info("Processing natural language command", { command: commandText, persona: requestedPersona });
  const startedAt = Date.now();
  if (isAgentStatusNaturalCommand(commandText)) {
    const runs = [];
    for (const [runId, state] of activeRuns.entries()) {
      const entry = {
        runId,
        cancelled: Boolean(state?.cancelled),
        startTime: Number(state?.startTime || 0),
        ageMs: Number(state?.startTime ? Date.now() - state.startTime : 0),
        tabId: typeof state?.tabId === "number" ? state.tabId : null,
        windowId: typeof state?.windowId === "number" ? state.windowId : null,
        pageState: null
      };
      if (typeof state?.tabId === "number") {
        entry.pageState = await readRunStateFromPage(state.tabId, runId);
      }
      runs.push(entry);
    }
    return {
      ok: true,
      protocol: "natural-command-v3-status",
      catchMode: "status",
      command: "NATURAL_COMMAND",
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
  const routing = resolveRoutingWithIntelligentFallback(commandText, settings, {
    url: tab.url,
    title: tab.title
  });
  const routingResult = await executeWithRouting(routing, { tabId: tab.id });
  if (routingResult) {
    return {
      ok: routingResult.ok !== false,
      protocol: "natural-command-v3-engine",
      catchMode: routing.mode,
      command: "NATURAL_COMMAND",
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
      protocol: "natural-command-v2",
      catchMode: "direct",
      command: "NATURAL_COMMAND",
      persona: requestedPersona,
      input: commandText,
      result: {
        success: true,
        action: "take_screenshot",
        screenshot
      }
    };
  }
  let result = null;
  try {
    result = await sendContentMessageWithRetry(tab.id, {
      type: "EXECUTE_NATURAL_COMMAND",
      command: commandText,
      persona: requestedPersona
    });
  } catch (err) {
    result = { error: toErrorMessage(err), catchMode: "transport-error", protocol: "natural-command-v2" };
  }
  if (result?.error) {
    return {
      ok: false,
      protocol: result?.protocol || "natural-command-v2",
      catchMode: result?.catchMode || "failed",
      command: "NATURAL_COMMAND",
      persona: requestedPersona,
      input: commandText,
      error: result.error,
      durationMs: Date.now() - startedAt
    };
  }
  return {
    ok: true,
    protocol: result?.protocol || "natural-command-v2",
    catchMode: result?.catchMode || "direct",
    recovered: result?.selfHealed === true,
    commandMemoryHit: result?.commandMemoryHit === true,
    command: "NATURAL_COMMAND",
    persona: requestedPersona,
    input: commandText,
    result,
    durationMs: Date.now() - startedAt
  };
}
__name(handleNaturalCommand, "handleNaturalCommand");
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
  if (command.type === "APPLY_PRESETS") {
    return await applyRelayPresets(command.payload?.presets || command.payload || {});
  }
  if (command.type === "CAPTURE_SCREEN") {
    return await handleCaptureScreenCommand(command, settings, agentId);
  }
  if (command.type === "EXECUTE_ACTIONS") {
    return await handleExecuteActionsCommand(command, settings);
  }
  if (command.type === "TRAINING_PROBE") {
    return await handleTrainingProbeCommand(command, settings, agentId);
  }
  if (command.type === "SELF_IMPROVE") {
    return await handleSelfImproveCommand(command, settings, agentId);
  }
  if (command.type === "NATURAL_COMMAND") {
    return await handleNaturalCommand(command, settings);
  }
  throw new Error(`Unsupported command type: ${command.type}`);
}
__name(dispatchRelayCommand, "dispatchRelayCommand");
async function handleRelaySocketMessage(event, wsRef) {
  if (relaySocket !== wsRef) return;
  if (!event || typeof event.data !== "string") return;
  let data = null;
  try {
    data = JSON.parse(event.data);
  } catch (_err) {
    return;
  }
  if (!data || typeof data !== "object") return;
  const rawType = String(data.type || "").trim().toUpperCase();
  if (rawType === "PING" || rawType === "AGENT_PING" || rawType === "AGENT_HEARTBEAT" || rawType === "AGENT.HEARTBEAT") {
    relaySendFrame({
      type: "agent.heartbeat",
      agent_id: relayAgentIdCache || "",
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
    if (command.isJsonRpc && command.rpcId !== null && command.rpcId !== void 0) {
      relaySendJsonRpcResult(command.rpcId, result);
    } else {
      sendRelayResult(localAgentId, command.traceMeta, command.type, { success: result?.ok !== false, result });
    }
  } catch (err) {
    const message = toErrorMessage(err);
    if (command.isJsonRpc && command.rpcId !== null && command.rpcId !== void 0) {
      relaySendJsonRpcError(command.rpcId, message);
    } else {
      sendRelayError(localAgentId, command.traceMeta, command.type, message);
    }
  }
}
__name(handleRelaySocketMessage, "handleRelaySocketMessage");
function disconnectRelay(reason = "manual") {
  clearRelayReconnectTimer();
  stopRelayHeartbeat();
  if (relaySocket) {
    const current = relaySocket;
    relaySocket = null;
    try {
      current.close(1e3, reason);
    } catch (_err) {
    }
  }
}
__name(disconnectRelay, "disconnectRelay");
function relayHostFromWsUrl(wsUrl) {
  try {
    return new URL(wsUrl).host;
  } catch (_err) {
    return wsUrl;
  }
}
__name(relayHostFromWsUrl, "relayHostFromWsUrl");
function prioritizeRelayCandidates(candidates) {
  const unique = Array.from(new Set((Array.isArray(candidates) ? candidates : []).filter(Boolean)));
  if (!relayLastUrl) return unique;
  const preferred = unique.filter((candidate) => candidate === relayLastUrl);
  const rest = unique.filter((candidate) => candidate !== relayLastUrl);
  return [...preferred, ...rest];
}
__name(prioritizeRelayCandidates, "prioritizeRelayCandidates");
function bindRelaySocket(ws, wsUrl) {
  ws.onmessage = (event) => {
    handleRelaySocketMessage(event, ws).catch((err) => {
      bgLogger.warn("Relay message handling failed", { error: toErrorMessage(err) });
    });
  };
  ws.onclose = (event) => {
    if (relaySocket !== ws) return;
    relaySocket = null;
    stopRelayHeartbeat();
    safeSendRuntimeMessage({
      type: "CONNECTION_STATUS",
      payload: {
        status: "OFF",
        code: Number(event?.code || 0),
        reason: String(event?.reason || ""),
        agentId: relayAgentIdCache || ""
      }
    });
    scheduleRelayReconnect();
  };
  ws.onerror = (err) => {
    if (relaySocket !== ws) return;
    bgLogger.warn("Relay WebSocket error", { wsUrl, error: toErrorMessage(err) });
  };
}
__name(bindRelaySocket, "bindRelaySocket");
function dialRelaySocket(wsUrl, timeoutMs = RELAY_CONNECT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let ws = null;
    let settled = false;
    let timeoutHandle = null;
    const finish = /* @__PURE__ */ __name((ok, value) => {
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
    }, "finish");
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      finish(false, err instanceof Error ? err : new Error(toErrorMessage(err)));
      return;
    }
    timeoutHandle = setTimeout(() => {
      try {
        ws.close(1e3, "connect_timeout");
      } catch (_err) {
      }
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
__name(dialRelaySocket, "dialRelaySocket");
function publishRelayConnected(wsUrl, ws) {
  relaySocket = ws;
  relayLastUrl = wsUrl;
  relayReconnectAttempts = 0;
  clearRelayReconnectTimer();
  bindRelaySocket(ws, wsUrl);
  startRelayHeartbeat(relayAgentIdCache || "", ws);
  relaySendFrame({
    type: "AGENT_HELLO",
    agent_id: relayAgentIdCache || "",
    extension_version: chrome.runtime.getManifest()?.version || "unknown",
    capabilities: ["CAPTURE_SCREEN", "EXECUTE_ACTIONS", "APPLY_PRESETS", "TRAINING_PROBE", "NATURAL_COMMAND", "SELF_IMPROVE", "protocol_v2"],
    timestamp: Date.now()
  });
  safeSendRuntimeMessage({
    type: "CONNECTION_STATUS",
    payload: {
      status: "ON",
      host: relayHostFromWsUrl(wsUrl),
      agentId: relayAgentIdCache || ""
    }
  });
}
__name(publishRelayConnected, "publishRelayConnected");
async function connectRelayOnce() {
  clearRelayReconnectTimer();
  const settings = await getRelaySettings();
  relayAgentIdCache = settings.agentId || relayAgentIdCache;
  if (settings.masterActive === false) {
    disconnectRelay("master_off");
    return getRelayStatus();
  }
  const candidates = prioritizeRelayCandidates(buildRelayWsCandidates(settings));
  if (candidates.length === 0) {
    throw new Error("No relay websocket candidates configured");
  }
  if (relaySocket) {
    const oldSocket = relaySocket;
    relaySocket = null;
    stopRelayHeartbeat();
    try {
      oldSocket.close(1e3, "reconnect");
    } catch (_err) {
    }
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
      bgLogger.warn("Relay candidate failed", { wsUrl, error: errorMessage });
    }
  }
  const reason = failures.join(" | ") || "Unknown relay connection error";
  safeSendRuntimeMessage({
    type: "CONNECTION_STATUS",
    payload: {
      status: "OFF",
      reason,
      agentId: relayAgentIdCache || ""
    }
  });
  throw new Error(`Unable to connect relay: ${reason}`);
}
__name(connectRelayOnce, "connectRelayOnce");
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
__name(connectRelay, "connectRelay");
async function initializeRelayClient() {
  try {
    await ensureRelayAgentId();
    await connectRelay();
  } catch (err) {
    bgLogger.warn("Relay init failed", { error: toErrorMessage(err) });
    scheduleRelayReconnect();
  }
}
__name(initializeRelayClient, "initializeRelayClient");
var activeRuns = /* @__PURE__ */ new Map();
function generateRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
__name(generateRunId, "generateRunId");
function safeSendRuntimeMessage(message) {
  if (message?.type === "BATCH_RUN_UPDATE" && message?.payload) {
    emitExecutionProgressTelemetry(message.payload);
  }
  try {
    chrome.runtime.sendMessage(message, () => {
      void chrome.runtime.lastError;
    });
  } catch (_err) {
  }
}
__name(safeSendRuntimeMessage, "safeSendRuntimeMessage");
async function markRunCancelledInPage(tabId, runId) {
  if (!tabId || !runId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [runId],
      func: /* @__PURE__ */ __name((rid) => {
        const key = "__bilgeCancelledRuns";
        if (!window[key] || typeof window[key] !== "object") window[key] = {};
        window[key][rid] = true;
        const stateKey = "__bilgeBatchRunState";
        if (window[stateKey] && window[stateKey][rid]) {
          try {
            window[stateKey][rid].cancelled = true;
            window[stateKey][rid].status = "cancelled";
            window[stateKey][rid].updatedAt = Date.now();
            window[stateKey][rid].seq = Number(window[stateKey][rid].seq || 0) + 1;
          } catch (_err) {
          }
        }
        return { ok: true };
      }, "func")
    });
  } catch (_err) {
  }
}
__name(markRunCancelledInPage, "markRunCancelledInPage");
async function clearRunStateInPage(tabId, runId) {
  if (!tabId || !runId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [runId],
      func: /* @__PURE__ */ __name((rid) => {
        try {
          if (window.__bilgeBatchRunState) delete window.__bilgeBatchRunState[rid];
          if (window.__bilgeCancelledRuns) delete window.__bilgeCancelledRuns[rid];
        } catch (_err) {
        }
        return { ok: true };
      }, "func")
    });
  } catch (_err) {
  }
}
__name(clearRunStateInPage, "clearRunStateInPage");
async function readRunStateFromPage(tabId, runId) {
  if (!tabId || !runId) return null;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [runId],
      func: /* @__PURE__ */ __name((rid) => {
        try {
          const state = (window.__bilgeBatchRunState || {})[rid];
          return state && typeof state === "object" ? state : null;
        } catch (_err) {
          return null;
        }
      }, "func")
    });
    return results?.[0]?.result ?? null;
  } catch (_err) {
    return null;
  }
}
__name(readRunStateFromPage, "readRunStateFromPage");
async function cancelRun(runId) {
  const state = activeRuns.get(runId);
  if (!state) return false;
  state.cancelled = true;
  const tabId = state.tabId;
  if (typeof tabId === "number") {
    await markRunCancelledInPage(tabId, runId);
  }
  safeSendRuntimeMessage({ type: "BATCH_RUN_UPDATE", payload: { runId, status: "cancelling", cancelled: true } });
  return true;
}
__name(cancelRun, "cancelRun");
var RESTRICTED_SCHEME_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "edge://",
  "about:",
  "devtools://"
];
function isRestrictedUrl(rawUrl) {
  const url = String(rawUrl || "").trim().toLowerCase();
  if (!url) return false;
  if (RESTRICTED_SCHEME_PREFIXES.some((prefix) => url.startsWith(prefix))) return true;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "chromewebstore.google.com") return true;
    if (parsed.hostname === "chrome.google.com" && parsed.pathname.startsWith("/webstore")) return true;
  } catch (_err) {
  }
  return false;
}
__name(isRestrictedUrl, "isRestrictedUrl");
function shouldRetryAfterNoReceiver(err) {
  const message = String(err?.message || "");
  return message.includes("Could not establish connection") || message.includes("Receiving end does not exist");
}
__name(shouldRetryAfterNoReceiver, "shouldRetryAfterNoReceiver");
function sendMessageToFrame(tabId, frameId, payload, cb) {
  chrome.tabs.sendMessage(tabId, payload, { frameId }, (response) => {
    const lastErr = chrome.runtime.lastError;
    cb(lastErr, response);
  });
}
__name(sendMessageToFrame, "sendMessageToFrame");
function injectContentScript(tabId, frameId, cb) {
  (async () => {
    try {
      await tryInjectContentScript(tabId, frameId);
      setTimeout(() => cb(null), CONTENT_SCRIPT_RETRY_DELAY_MS);
    } catch (err) {
      cb(err instanceof Error ? err : new Error(String(err || "Failed to inject content script")));
    }
  })();
}
__name(injectContentScript, "injectContentScript");
function getAllFrames(tabId, cb) {
  chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
    const lastErr = chrome.runtime.lastError;
    cb(lastErr, Array.isArray(frames) ? frames : []);
  });
}
__name(getAllFrames, "getAllFrames");
function isNotFoundError(response) {
  const msg = String(response?.error || "");
  return msg.includes(" not found") || msg.includes("Selector ") && msg.includes(" not found");
}
__name(isNotFoundError, "isNotFoundError");
function isInvalidSelectorError(response) {
  const msg = String(response?.error || "").toLowerCase();
  return msg.includes("invalid selector");
}
__name(isInvalidSelectorError, "isInvalidSelectorError");
function isFatalContentError(response) {
  if (!response || typeof response !== "object") return false;
  const msg = String(response.error || "");
  if (!msg) return false;
  if (isInvalidSelectorError(response)) return true;
  if (msg.includes("Missing selector")) return true;
  if (msg.includes("Missing code")) return true;
  return false;
}
__name(isFatalContentError, "isFatalContentError");
var router = new messageRouter_default();
var DEV_HOT_RELOAD_TAB_KEY = "__bilge_dev_hot_reload_active_tab_id__";
async function maybeReloadActiveTabAfterHotReload() {
  if (!ENV?.FEATURES?.HOT_RELOAD) return;
  try {
    const result = await chrome.storage.local.get(DEV_HOT_RELOAD_TAB_KEY);
    const tabId = result?.[DEV_HOT_RELOAD_TAB_KEY];
    if (typeof tabId !== "number") return;
    await chrome.storage.local.remove(DEV_HOT_RELOAD_TAB_KEY);
    chrome.tabs.reload(tabId, { bypassCache: true }, () => {
    });
  } catch {
  }
}
__name(maybeReloadActiveTabAfterHotReload, "maybeReloadActiveTabAfterHotReload");
void maybeReloadActiveTabAfterHotReload();
if (ENV.FEATURES.HOT_RELOAD) {
  try {
    const reloadWs = new WebSocket("ws://localhost:35729");
    reloadWs.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "reload") {
        console.log("[Bilge][Dev] Hot reload triggered...");
        try {
          const tab = await new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              resolve(tabs && tabs[0] ? tabs[0] : null);
            });
          });
          const tabId = tab && typeof tab.id === "number" ? tab.id : null;
          if (typeof tabId === "number") {
            await chrome.storage.local.set({ [DEV_HOT_RELOAD_TAB_KEY]: tabId });
          }
        } catch {
        }
        chrome.runtime.reload();
      }
    };
    reloadWs.onerror = () => {
    };
  } catch (e) {
  }
}
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.to === "LOGGER") {
    (async () => {
      try {
        if (request.action === "get_logs") {
          const logs = await bilgeLogUtils.getLogs(request.options || {});
          sendResponse({ logs });
        } else if (request.action === "clear_logs") {
          await bilgeLogUtils.clearLogs();
          sendResponse({ cleared: true });
        } else if (request.action === "export_logs") {
          const json = await bilgeLogUtils.exportLogs();
          sendResponse({ json });
        } else {
          sendResponse({ error: "Unknown logger action" });
        }
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }
  if (request?.to === "CONTENT_SCRIPT") {
    const msgType = String(request.payload?.type || "unknown");
    msgLogger.info(`Relaying to content script: ${msgType}`, { selector: request.payload?.selector });
    (async () => {
      try {
        const tab = await new Promise((resolve) => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            resolve(tabs && tabs[0] ? tabs[0] : null);
          });
        });
        if (!tab?.id) {
          msgLogger.warn("No active tab found for content script relay");
          sendResponse({ error: "No active tab found" });
          return;
        }
        if (isRestrictedUrl(tab.url)) {
          sendResponse({
            error: `Cannot access DOM for restricted URL: ${tab.url || "(unknown url)"} (Chrome blocks content scripts on internal pages / Web Store).`
          });
          return;
        }
        const payload = request.payload;
        const msgType2 = String(payload?.type || "");
        if (msgType2 === "GET_PAGE_INFO" || msgType2 === "__BILGE_PING__") {
          const first = await new Promise((resolve) => {
            sendMessageToFrame(tab.id, 0, payload, (err, response) => resolve({ err, response }));
          });
          if (!first.err) {
            sendResponse(first.response ?? { error: "No response from content script." });
            return;
          }
          if (!shouldRetryAfterNoReceiver(first.err)) {
            sendResponse({ error: first.err.message });
            return;
          }
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
          sendResponse(retry.response ?? { error: "No response from content script." });
          return;
        }
        const frames = await new Promise((resolve) => {
          getAllFrames(tab.id, (err, f) => resolve({ err, frames: f }));
        });
        if (frames.err) {
          sendMessageToFrame(tab.id, 0, payload, (err, response) => {
            if (err) sendResponse({ error: err.message });
            else sendResponse(response ?? { error: "No response from content script." });
          });
          return;
        }
        const frameIds = Array.from(
          new Set(
            (frames.frames || []).map((f) => typeof f?.frameId === "number" ? f.frameId : null).filter((id) => typeof id === "number")
          )
        );
        frameIds.sort((a, b) => a === 0 ? -1 : b === 0 ? 1 : a - b);
        if (!frameIds.includes(0)) frameIds.unshift(0);
        let lastResponse = null;
        let lastError = null;
        for (let i = 0; i < frameIds.length; i += 1) {
          const attempt = await new Promise((resolve) => {
            sendMessageToFrame(tab.id, frameIds[i], payload, (err, response) => resolve({ err, response }));
          });
          if (attempt.err && shouldRetryAfterNoReceiver(attempt.err)) {
            const injectErr = await new Promise((resolve) => {
              injectContentScript(tab.id, frameIds[i], (err) => resolve(err || null));
            });
            if (!injectErr) {
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
          const ok = lastResponse && typeof lastResponse === "object" && !lastResponse.error;
          if (ok) {
            sendResponse(lastResponse);
            return;
          }
          if (!isNotFoundError(lastResponse)) {
            sendResponse(lastResponse || { error: "No response from content script." });
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
        sendResponse({ error: "No response from content scripts (all frames)." });
      } catch (err) {
        const message = err && err.message ? err.message : String(err || "Unknown error");
        sendResponse({ error: message });
      }
    })();
    return true;
  }
  if (request?.to === "BACKGROUND") {
    if (request.payload?.action === "relay_status") {
      sendResponse({ ok: true, ...getRelayStatus() });
      return false;
    }
    if (request.payload?.action === "relay_reconnect") {
      connectRelay().then(() => sendResponse({ ok: true, ...getRelayStatus() })).catch((err) => sendResponse({ ok: false, error: toErrorMessage(err), ...getRelayStatus() }));
      return true;
    }
    if (request.payload?.action === "relay_disconnect") {
      disconnectRelay("manual_disconnect");
      sendResponse({ ok: true, ...getRelayStatus() });
      return false;
    }
    if (request.payload?.action === "relay_ping") {
      const sent = relaySendFrame({
        type: "agent.heartbeat",
        agent_id: relayAgentIdCache || "",
        timestamp: Date.now()
      });
      sendResponse({ ok: sent, ...getRelayStatus() });
      return false;
    }
    if (request.payload?.action === "relay_dispatch_command") {
      (async () => {
        try {
          const requestedType = String(request.payload?.type || request.payload?.commandType || "").trim();
          const normalizedType = normalizeRelayCommandType(requestedType);
          if (!normalizedType) {
            sendResponse({
              ok: false,
              error: `Unsupported command type: ${requestedType || "(empty)"}`,
              ...getRelayStatus()
            });
            return;
          }
          const rawPayload = request.payload?.payload;
          const payload = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? rawPayload : {};
          const command = {
            type: normalizedType,
            payload,
            traceMeta: {
              runId: sanitizeTraceId(request.payload?.runId, "run"),
              commandId: sanitizeTraceId(request.payload?.commandId, "cmd")
            },
            agentId: normalizeAgentId(request.payload?.agentId || ""),
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
    if (request.type === "GET_SELF_HEALING_STATS") {
      (async () => {
        try {
          const key = "__bilge_recovery_telemetry_v1";
          const result = await chrome.storage.local.get([key]);
          const data = result[key] || {
            totalRecoveries: 0,
            successCount: 0,
            failureCount: 0,
            avgDuration: 0,
            byStrategy: {}
          };
          const successRate = data.totalRecoveries > 0 ? Math.round(data.successCount / data.totalRecoveries * 100) : 0;
          sendResponse({ ok: true, stats: { ...data, successRate } });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
      })();
      return true;
    }
    if (request.payload?.action === "get_dom_skill_memory_summary") {
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
    if (request.payload?.action === "get_page_fields") {
      (async () => {
        try {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          const tab = tabs[0];
          if (!tab?.id) {
            sendResponse({ error: "No active tab found" });
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
    if (request.payload?.action === "set_routing_mode") {
      (async () => {
        try {
          const mode = request.payload.mode === "cortex" ? "cortex" : "builtin";
          const settingsResult = await chrome.storage.local.get(["bilge_app_settings"]);
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
    if (request.payload?.action === "get_routing_mode") {
      (async () => {
        try {
          const settingsResult = await chrome.storage.local.get(["bilge_app_settings"]);
          const settings = settingsResult.bilge_app_settings || {};
          sendResponse({ routingMode: settings.routingMode || DEFAULT_ROUTING_MODE });
        } catch (err) {
          sendResponse({ routingMode: DEFAULT_ROUTING_MODE });
        }
      })();
      return true;
    }
    if (request.payload?.action === "clear_dom_skill_memory") {
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
    if (request.payload?.action === "reload_extension") {
      console.log("Reloading extension...");
      chrome.runtime.reload();
      sendResponse({ status: "reloading" });
      return false;
    }
    if (request.payload?.action === "system_log") {
      const { message, type, metadata } = request.payload;
      const contentScriptLogger = new BilgeLogger(metadata?.source || "content-script");
      contentScriptLogger.log(type || "INFO", message, metadata).catch(() => {
      });
      sendResponse({ ok: true });
      return false;
    }
    if (request.payload?.action === "take_screenshot") {
      msgLogger.info("Taking screenshot");
      chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
        const err = chrome.runtime.lastError;
        if (err) {
          msgLogger.error(`Screenshot failed: ${err.message}`);
          sendResponse({ error: err.message });
        } else {
          msgLogger.info("Screenshot captured successfully", { size: dataUrl?.length || 0 });
          sendResponse({ screenshot: dataUrl });
        }
      });
      return true;
    }
    if (request.payload?.action === "execute_natural_command") {
      const commandText = String(request.payload?.command || request.payload?.text || "").trim();
      const requestedPersona = normalizeBrainPersona(
        request.payload?.persona || request.payload?.brain || request.payload?.targetPersona || request.payload?.target
      );
      const strictPersona = coerceBoolean(request.payload?.strictPersona, true);
      (async () => {
        try {
          const settings = await getRelaySettings().catch(() => ({ masterActive: true }));
          const result = await handleNaturalCommand(
            { type: "NATURAL_COMMAND", payload: { command: commandText, persona: requestedPersona, strictPersona } },
            settings
          );
          sendResponse(result);
        } catch (err) {
          sendResponse({
            ok: false,
            command: "NATURAL_COMMAND",
            input: commandText,
            error: toErrorMessage(err)
          });
        }
      })();
      return true;
    }
    if (request.payload?.action === "get_element_value") {
      const { selector, attribute } = request.payload;
      msgLogger.info(`Getting element value`, { selector, attribute });
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const tab = tabs[0];
        if (!tab?.id) {
          msgLogger.warn("No active tab for get_element_value");
          sendResponse({ error: "No active tab found" });
          return;
        }
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: "ISOLATED",
            args: [selector, attribute],
            func: /* @__PURE__ */ __name((sel, attr) => {
              function querySelectorDeep(selector2, root = document) {
                const pendingRoots = [root];
                const seenRoots = /* @__PURE__ */ new Set();
                const MAX_SHADOW_ROOTS = 80;
                for (let i = 0; i < pendingRoots.length && pendingRoots.length <= MAX_SHADOW_ROOTS; i++) {
                  const currentRoot = pendingRoots[i];
                  if (!currentRoot || seenRoots.has(currentRoot)) continue;
                  seenRoots.add(currentRoot);
                  try {
                    const found = currentRoot.querySelector(selector2);
                    if (found) return found;
                  } catch (e) {
                  }
                  const walker = document.createTreeWalker(currentRoot, NodeFilter.SHOW_ELEMENT);
                  for (let node = walker.currentNode; node; node = walker.nextNode()) {
                    if (node.shadowRoot) pendingRoots.push(node.shadowRoot);
                    const tag = String(node?.tagName || "").toUpperCase();
                    if (tag === "IFRAME" || tag === "FRAME") {
                      try {
                        if (node.contentDocument) pendingRoots.push(node.contentDocument);
                      } catch (e) {
                      }
                    }
                    if (pendingRoots.length > MAX_SHADOW_ROOTS) break;
                  }
                }
                return null;
              }
              __name(querySelectorDeep, "querySelectorDeep");
              const el = querySelectorDeep(sel);
              if (!el) return { error: `Element not found: ${sel}` };
              if (attr) {
                return { value: el.getAttribute(attr), attribute: attr };
              }
              const val = el.value !== void 0 ? el.value : el.innerText || el.textContent;
              return { value: val, tag: el.tagName.toLowerCase(), id: el.id, name: el.name };
            }, "func")
          });
          sendResponse(results[0]?.result);
        } catch (err) {
          sendResponse({ error: err.message });
        }
      });
      return true;
    }
    if (request.payload?.action === "scroll_to_element") {
      const { selector } = request.payload;
      msgLogger.info(`Scrolling to element`, { selector });
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const tab = tabs[0];
        if (!tab?.id) {
          msgLogger.warn("No active tab for scroll_to_element");
          sendResponse({ error: "No active tab found" });
          return;
        }
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: "ISOLATED",
            args: [selector],
            func: /* @__PURE__ */ __name((sel) => {
              function querySelectorDeep(selector2, root = document) {
                const pendingRoots = [root];
                const seenRoots = /* @__PURE__ */ new Set();
                const MAX_SHADOW_ROOTS = 80;
                for (let i = 0; i < pendingRoots.length && pendingRoots.length <= MAX_SHADOW_ROOTS; i++) {
                  const currentRoot = pendingRoots[i];
                  if (!currentRoot || seenRoots.has(currentRoot)) continue;
                  seenRoots.add(currentRoot);
                  try {
                    const found = currentRoot.querySelector(selector2);
                    if (found) return found;
                  } catch (e) {
                  }
                  const walker = document.createTreeWalker(currentRoot, NodeFilter.SHOW_ELEMENT);
                  for (let node = walker.currentNode; node; node = walker.nextNode()) {
                    if (node.shadowRoot) pendingRoots.push(node.shadowRoot);
                    const tag = String(node?.tagName || "").toUpperCase();
                    if (tag === "IFRAME" || tag === "FRAME") {
                      try {
                        if (node.contentDocument) pendingRoots.push(node.contentDocument);
                      } catch (e) {
                      }
                    }
                    if (pendingRoots.length > MAX_SHADOW_ROOTS) break;
                  }
                }
                return null;
              }
              __name(querySelectorDeep, "querySelectorDeep");
              const el = querySelectorDeep(sel);
              if (!el) return { error: `Element not found: ${sel}` };
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              return { status: "scrolled" };
            }, "func")
          });
          sendResponse(results[0]?.result);
        } catch (err) {
          sendResponse({ error: err.message });
        }
      });
      return true;
    }
    if (request.payload?.action === "execute_script") {
      const { code, world, timeout_ms } = request.payload;
      const codePreview = String(code || "").slice(0, 100);
      msgLogger.info(`Executing script in ${world || "ISOLATED"} world`, { codePreview, timeout_ms });
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const tab = tabs[0];
        if (!tab?.id) {
          msgLogger.warn("No active tab for script execution");
          sendResponse({ error: "No active tab found" });
          return;
        }
        if (isRestrictedUrl(tab.url)) {
          msgLogger.warn(`Script blocked on restricted URL: ${tab.url}`);
          sendResponse({ error: `Cannot execute script on restricted URL: ${tab.url}` });
          return;
        }
        const runInWorld = /* @__PURE__ */ __name(async (targetWorld) => {
          return await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: targetWorld,
            args: [code, timeout_ms || 5e3],
            func: /* @__PURE__ */ __name(async (codeStr, timeout) => {
              function querySelectorDeep(selector, root = document) {
                const pendingRoots = [root];
                const seenRoots = /* @__PURE__ */ new Set();
                const MAX_SHADOW_ROOTS = 80;
                for (let i = 0; i < pendingRoots.length && pendingRoots.length <= MAX_SHADOW_ROOTS; i++) {
                  const currentRoot = pendingRoots[i];
                  if (!currentRoot || seenRoots.has(currentRoot)) continue;
                  seenRoots.add(currentRoot);
                  try {
                    const found = currentRoot.querySelector(selector);
                    if (found) return found;
                  } catch (e) {
                  }
                  const walker = document.createTreeWalker(currentRoot, NodeFilter.SHOW_ELEMENT);
                  for (let node = walker.currentNode; node; node = walker.nextNode()) {
                    if (node.shadowRoot) pendingRoots.push(node.shadowRoot);
                    const tag = String(node?.tagName || "").toUpperCase();
                    if (tag === "IFRAME" || tag === "FRAME") {
                      try {
                        if (node.contentDocument) pendingRoots.push(node.contentDocument);
                      } catch (e) {
                      }
                    }
                    if (pendingRoots.length > MAX_SHADOW_ROOTS) break;
                  }
                }
                return null;
              }
              __name(querySelectorDeep, "querySelectorDeep");
              function truncate(text, maxChars = 500) {
                const str = String(text || "");
                return str.length > maxChars ? `${str.slice(0, maxChars)}...` : str;
              }
              __name(truncate, "truncate");
              function elementSummary(element) {
                if (!element || element.nodeType !== 1) return null;
                return { tag: element.tagName.toLowerCase(), id: element.id, text: truncate(element.innerText || element.textContent, 100) };
              }
              __name(elementSummary, "elementSummary");
              function jsonSafe(value, seen = /* @__PURE__ */ new WeakSet(), depth = 0) {
                if (value === null) return null;
                const t = typeof value;
                if (t === "string" || t === "number" || t === "boolean") return value;
                if (t === "bigint") return value.toString();
                if (value instanceof Error) return { name: value.name, message: value.message };
                if (value && typeof value === "object" && value.nodeType === 1) return elementSummary(value);
                if (depth >= 5 || seen.has(value)) return "[Truncated]";
                seen.add(value);
                if (Array.isArray(value)) return value.slice(0, 50).map((v) => jsonSafe(v, seen, depth + 1));
                const out = {};
                Object.keys(value).slice(0, 50).forEach((k) => {
                  out[k] = jsonSafe(value[k], seen, depth + 1);
                });
                return out;
              }
              __name(jsonSafe, "jsonSafe");
              const execute = /* @__PURE__ */ __name(async () => {
                const AsyncFunction = Object.getPrototypeOf(async function() {
                }).constructor;
                const fn = new AsyncFunction("querySelectorDeep", "truncate", "elementSummary", '"use strict";\n' + codeStr);
                return await fn(querySelectorDeep, truncate, elementSummary);
              }, "execute");
              try {
                const result = await Promise.race([
                  execute(),
                  new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout))
                ]);
                return { ok: true, result: jsonSafe(result) };
              } catch (err) {
                return { error: err.message };
              }
            }, "func")
          });
        }, "runInWorld");
        try {
          let results = await runInWorld(world === "MAIN" ? "MAIN" : "ISOLATED");
          let payload = results[0]?.result;
          if (world !== "MAIN" && payload?.error && (payload.error.includes("CSP") || payload.error.includes("eval") || payload.error.includes("Trusted Type"))) {
            msgLogger.warn("ISOLATED world script failed (CSP), retrying in MAIN world");
            results = await runInWorld("MAIN");
            payload = results[0]?.result;
          }
          if (payload?.error) {
            msgLogger.error(`Script execution error: ${payload.error}`);
            sendResponse({ error: payload.error });
          } else {
            msgLogger.info("Script executed successfully");
            sendResponse({ ok: true, result: payload?.result });
          }
        } catch (err) {
          msgLogger.error(`Script execution exception: ${err.message}`);
          sendResponse({ error: err.message });
        }
      });
      return true;
    }
    if (request.payload?.action === "execute_batch_actions") {
      const { actions, options, traceMeta } = request.payload;
      (async () => {
        const settings = await getRelaySettings().catch(() => ({
          masterActive: true,
          trainingAllowAiScripts: false
        }));
        const allowAiScripts = settings.masterActive === true && settings.trainingAllowAiScripts === true;
        const mergedOptions = {
          ...options && typeof options === "object" ? options : {},
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
    if (request.payload?.action === "cancel_batch_actions") {
      (async () => {
        const runId = String(request.payload?.runId || "").trim();
        batchLogger.info(`Cancelling batch run: ${runId}`);
        const cancelled = await cancelRun(runId);
        batchLogger.info(`Cancel result for ${runId}: ${cancelled ? "cancelled" : "not found"}`);
        sendResponse({ cancelled, runId });
      })();
      return true;
    }
    if (request.payload?.action === "get_active_runs") {
      const runs = Array.from(activeRuns.entries()).map(([id, state]) => ({
        runId: id,
        cancelled: state.cancelled,
        startTime: state.startTime,
        tabId: state.tabId ?? null
      }));
      sendResponse({ runs });
      return false;
    }
    sendResponse({ error: `Unknown background action: ${String(request.payload?.action || "")}` });
    return false;
  }
  return false;
});
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
    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, resolve);
    });
    const tab = tabs && tabs[0];
    if (!tab?.id) {
      throw new Error("No active tab found");
    }
    if (isRestrictedUrl(tab.url)) {
      throw new Error(`Cannot execute actions on restricted URL: ${tab.url || "(unknown url)"}`);
    }
    runState.tabId = tab.id;
    runState.windowId = tab.windowId ?? null;
    const totalSteps = Array.isArray(actions) ? actions.length : 0;
    safeSendRuntimeMessage({ type: "BATCH_RUN_UPDATE", payload: { runId, status: "starting", executedSteps: 0, totalSteps } });
    const pollIntervalMsRaw = Number(options?.pollIntervalMs ?? 350);
    const pollIntervalMs = Number.isFinite(pollIntervalMsRaw) ? Math.min(1e3, Math.max(150, Math.round(pollIntervalMsRaw))) : 350;
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
        safeSendRuntimeMessage({ type: "BATCH_RUN_UPDATE", payload: state });
      } finally {
        pollInFlight = false;
      }
    }, pollIntervalMs);
    let payload = null;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "EXECUTE_BATCH",
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
      console.debug("[Background] Resident runtime unavailable, falling back to script injection.");
    }
    if (!payload) {
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: performPageActions,
        args: [actions, traceMeta, runId, options],
        world: "MAIN"
        // Run in page context to access page's JS objects
      });
      payload = result?.[0]?.result || {};
    }
    const finalState = await readRunStateFromPage(tab.id, runId);
    if (finalState) {
      safeSendRuntimeMessage({ type: "BATCH_RUN_UPDATE", payload: finalState });
    } else {
      safeSendRuntimeMessage({
        type: "BATCH_RUN_UPDATE",
        payload: {
          runId,
          status: payload.cancelled ? "cancelled" : payload.ok !== false ? "done" : "error",
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
    safeSendRuntimeMessage({ type: "BATCH_RUN_UPDATE", payload: { runId, status: "error", error: err?.message || String(err || "Unknown error") } });
    throw err;
  } finally {
    const tabId = runState.tabId;
    if (runState.pollTimer) {
      try {
        clearInterval(runState.pollTimer);
      } catch (_err) {
      }
      runState.pollTimer = null;
    }
    if (typeof tabId === "number") {
      await clearRunStateInPage(tabId, runId);
    }
    activeRuns.delete(runId);
  }
}
__name(executeBatchActions, "executeBatchActions");
async function performPageActions(actions, traceMeta = null, runId = "", optionsInput = null) {
  const sleep = /* @__PURE__ */ __name((ms) => new Promise((resolve) => setTimeout(resolve, ms)), "sleep");
  const options = optionsInput && typeof optionsInput === "object" ? optionsInput : {};
  const logLifecycle = options.suppressLifecycleLogs !== true;
  const humanizedDelayEnabled = options.humanizedDelayEnabled === true;
  const parsedBaseDelayMs = Number(options.humanizedDelayBaseMs);
  const parsedJitterDelayMs = Number(options.humanizedDelayJitterMs);
  const humanizedDelayBaseMs = Number.isFinite(parsedBaseDelayMs) ? Math.min(5e3, Math.max(0, Math.round(parsedBaseDelayMs))) : 220;
  const humanizedDelayJitterMs = Number.isFinite(parsedJitterDelayMs) ? Math.min(5e3, Math.max(0, Math.round(parsedJitterDelayMs))) : 260;
  const allowAiScripts = options.allowAiScripts === true;
  const defaultAllowSensitiveFill = options.allowSensitiveFill === true;
  const defaultAllowSensitiveOverwrite = options.allowSensitiveOverwrite === true;
  const trace = {
    runId: String(traceMeta?.runId || "").trim(),
    commandId: String(traceMeta?.commandId || "").trim()
  };
  function tracePrefixLocal() {
    const parts = [];
    if (trace.runId) parts.push(`run=${trace.runId}`);
    if (trace.commandId) parts.push(`cmd=${trace.commandId}`);
    return parts.length > 0 ? `[${parts.join(" ")}] ` : "";
  }
  __name(tracePrefixLocal, "tracePrefixLocal");
  const RUN_STATE_KEY = "__bilgeBatchRunState";
  function updateRunState(patch) {
    if (!runId) return;
    try {
      if (!window[RUN_STATE_KEY] || typeof window[RUN_STATE_KEY] !== "object") window[RUN_STATE_KEY] = {};
      const root = window[RUN_STATE_KEY];
      const prev = root[runId] && typeof root[runId] === "object" ? root[runId] : {};
      const next = {
        ...prev,
        ...patch,
        runId,
        updatedAt: Date.now(),
        seq: Number(prev.seq || 0) + 1
      };
      root[runId] = next;
    } catch (_err) {
    }
  }
  __name(updateRunState, "updateRunState");
  function remoteLog(text, level = "INFO") {
    const decorated = `${tracePrefixLocal()}${text}`;
    updateRunState({ lastLog: { ts: Date.now(), level, text: decorated } });
    try {
      console.log(`[${level}] ${decorated}`);
    } catch (_err) {
    }
  }
  __name(remoteLog, "remoteLog");
  function isCancelled() {
    const key = "__bilgeCancelledRuns";
    if (!runId) return false;
    return Boolean(window[key]?.[runId]);
  }
  __name(isCancelled, "isCancelled");
  function nextHumanizedDelayMs() {
    if (!humanizedDelayEnabled) return 0;
    if (humanizedDelayJitterMs <= 0) return humanizedDelayBaseMs;
    return humanizedDelayBaseMs + Math.floor(Math.random() * (humanizedDelayJitterMs + 1));
  }
  __name(nextHumanizedDelayMs, "nextHumanizedDelayMs");
  function normalizeText(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
  __name(normalizeText, "normalizeText");
  function tokenize(value) {
    return String(value || "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).map((part) => part.trim()).filter(Boolean);
  }
  __name(tokenize, "tokenize");
  function extractSelectorHints(selector) {
    const hints = [];
    const attrMatches = selector.matchAll(
      /\[\s*(name|id|placeholder|aria-label|data-testid|data-test-id|data-qa)\s*(?:[*^$|~]?=)\s*(?:['"]([^'"]+)['"]|([^\]\s]+))\s*\]/gi
    );
    for (const match of attrMatches) {
      hints.push(match[2] || match[3] || "");
    }
    const idMatches = selector.matchAll(/#([A-Za-z0-9_-]+)/g);
    for (const match of idMatches) {
      hints.push(String(match[1] || "").replace(/[_-]+/g, " "));
    }
    const classMatches = selector.matchAll(/\.([A-Za-z0-9_-]+)/g);
    for (const match of classMatches) {
      hints.push(String(match[1] || "").replace(/[_-]+/g, " "));
    }
    const tagMatch = selector.match(/^\s*([a-z]+)/i);
    const preferredTag = tagMatch ? String(tagMatch[1]).toLowerCase() : "";
    return { hints, preferredTag };
  }
  __name(extractSelectorHints, "extractSelectorHints");
  function buildSelectorCandidates(action) {
    const raw = [];
    if (Array.isArray(action.selectors)) raw.push(...action.selectors);
    raw.push(action.selector);
    const seen = /* @__PURE__ */ new Set();
    const selectors = [];
    for (const item of raw) {
      const selector = String(item || "").trim();
      if (!selector || seen.has(selector)) continue;
      seen.add(selector);
      selectors.push(selector);
    }
    return selectors;
  }
  __name(buildSelectorCandidates, "buildSelectorCandidates");
  function findLabelText(element) {
    if (!(element instanceof Element)) return "";
    const parts = [];
    const id = element.getAttribute("id");
    if (id) {
      const labelFor = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (labelFor?.textContent) parts.push(labelFor.textContent);
    }
    const closestLabel = element.closest("label");
    if (closestLabel?.textContent) parts.push(closestLabel.textContent);
    const parentLabel = element.parentElement?.querySelector?.("label");
    if (parentLabel?.textContent) parts.push(parentLabel.textContent);
    return parts.join(" ");
  }
  __name(findLabelText, "findLabelText");
  function elementSearchText(element) {
    const attrKeys = [
      "name",
      "id",
      "placeholder",
      "aria-label",
      "autocomplete",
      "data-testid",
      "data-test-id",
      "data-qa",
      "title"
    ];
    const values = [];
    values.push(element.tagName.toLowerCase());
    for (const key of attrKeys) {
      const v = element.getAttribute?.(key);
      if (v) values.push(v);
    }
    values.push(findLabelText(element));
    const role = element.getAttribute?.("role");
    if (role) values.push(role);
    return normalizeText(values.join(" "));
  }
  __name(elementSearchText, "elementSearchText");
  function isUsableField(element) {
    if (!(element instanceof Element)) return false;
    const disabled = element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    if (disabled) return false;
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (rect.width < 2 || rect.height < 2) return false;
    return true;
  }
  __name(isUsableField, "isUsableField");
  function collectHintTokens(action, selectors) {
    const tokenSet = /* @__PURE__ */ new Set();
    const rawHints = [action.field, action.name, action.key, action.label, action.placeholder];
    let preferredTag = "";
    for (const selector of selectors) {
      const parsed = extractSelectorHints(selector);
      rawHints.push(...parsed.hints);
      if (!preferredTag && parsed.preferredTag) preferredTag = parsed.preferredTag;
    }
    for (const hint of rawHints) {
      for (const token of tokenize(hint)) tokenSet.add(token);
    }
    const expanded = new Set(tokenSet);
    if (expanded.has("first")) expanded.add("given");
    if (expanded.has("last")) {
      expanded.add("family");
      expanded.add("surname");
    }
    if (expanded.has("phone")) expanded.add("tel");
    if (expanded.has("mail")) expanded.add("email");
    if (expanded.has("email")) expanded.add("mail");
    return {
      tokens: Array.from(expanded),
      preferredTag
    };
  }
  __name(collectHintTokens, "collectHintTokens");
  function resolveHeuristicElement(action, selectors) {
    const { tokens, preferredTag } = collectHintTokens(action, selectors);
    if (!tokens.length) return null;
    const candidates = Array.from(
      document.querySelectorAll('input, textarea, select, [contenteditable="true"], [role="textbox"]')
    ).filter(isUsableField);
    const phrase = normalizeText(tokens.join(""));
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
  __name(resolveHeuristicElement, "resolveHeuristicElement");
  function resolveActionElement(action, stepIndex, totalSteps, type) {
    const selectors = buildSelectorCandidates(action);
    for (let idx = 0; idx < selectors.length; idx += 1) {
      const selector = selectors[idx];
      remoteLog(`Step ${stepIndex}/${totalSteps}: selector try ${idx + 1}/${selectors.length}: ${selector}`, "INFO");
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
        remoteLog(`Step ${stepIndex}/${totalSteps}: invalid selector ${selector} (${err.message})`, "WARN");
      }
    }
    if (type === "fill" || type === "type" || type === "click" || type === "scroll") {
      const heuristic = resolveHeuristicElement(action, selectors);
      if (heuristic?.element) {
        const tokenText = heuristic.tokens.join(",");
        remoteLog(
          `Step ${stepIndex}/${totalSteps}: heuristic matched field (score=${heuristic.score}, tokens=${tokenText})`,
          "INFO"
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
      matchedBy: "",
      selectors
    };
  }
  __name(resolveActionElement, "resolveActionElement");
  function readElementValue(element) {
    if (!element) return "";
    if (element.isContentEditable) return String(element.textContent || "");
    if ("value" in element) return String(element.value ?? "");
    return String(element.getAttribute?.("value") || "");
  }
  __name(readElementValue, "readElementValue");
  function inferFillFieldKind(element, action) {
    const tag = String(element?.tagName || "").toLowerCase();
    const type = String(element?.getAttribute?.("type") || "").toLowerCase();
    const hintText = [
      action?.field,
      action?.name,
      action?.key,
      action?.label,
      action?.placeholder,
      element?.getAttribute?.("name"),
      element?.getAttribute?.("id"),
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("placeholder"),
      findLabelText(element)
    ].join(" ").toLowerCase();
    if (type === "email" || /\bemail\b/.test(hintText)) return "email";
    if (type === "tel" || /\b(phone|tel|mobile)\b/.test(hintText)) return "phone";
    if (/\b(zip|postal)\b/.test(hintText)) return "zip";
    if (type === "date" || /\b(dob|date|from date|to date|start date|end date)\b/.test(hintText)) return "date";
    if (/\bstate\b/.test(hintText)) return "state";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (tag === "select") return "select";
    return "text";
  }
  __name(inferFillFieldKind, "inferFillFieldKind");
  function normalizeComparableValue(kind, value) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    if (kind === "email") return text.toLowerCase();
    if (kind === "phone") return text.replace(/\D+/g, "");
    if (kind === "zip") return text.replace(/\D+/g, "");
    if (kind === "state") return text.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
    if (kind === "date") return text.replace(/\s+/g, "");
    return text.toLowerCase();
  }
  __name(normalizeComparableValue, "normalizeComparableValue");
  function sanitizeFillValue(kind, rawValue, element) {
    const text = String(rawValue ?? "").trim();
    const inputType = String(element?.getAttribute?.("type") || "").toLowerCase();
    if (kind === "email") {
      const email = text.toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, reason: `invalid email value "${text}"` };
      }
      return { ok: true, value: email };
    }
    if (kind === "phone") {
      const digits = text.replace(/\D+/g, "");
      if (digits.length < 10) return { ok: false, reason: `invalid phone value "${text}"` };
      const normalized = digits.length >= 10 ? digits.slice(-10) : digits;
      const formatted = normalized.length === 10 ? `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}` : normalized;
      return { ok: true, value: formatted };
    }
    if (kind === "zip") {
      const digits = text.replace(/\D+/g, "");
      if (digits.length < 5) return { ok: false, reason: `invalid zip value "${text}"` };
      return { ok: true, value: digits.slice(0, 5) };
    }
    if (kind === "state") {
      const letters = text.toUpperCase().replace(/[^A-Z]/g, "");
      if (letters.length < 2) return { ok: false, reason: `invalid state value "${text}"` };
      return { ok: true, value: letters.slice(0, 2) };
    }
    if (kind === "date") {
      const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const mdyMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (inputType === "date") {
        if (isoMatch) return { ok: true, value: text };
        if (mdyMatch) {
          const mm = mdyMatch[1].padStart(2, "0");
          const dd = mdyMatch[2].padStart(2, "0");
          const yyyy = mdyMatch[3];
          return { ok: true, value: `${yyyy}-${mm}-${dd}` };
        }
      } else {
        if (mdyMatch) {
          const mm = mdyMatch[1].padStart(2, "0");
          const dd = mdyMatch[2].padStart(2, "0");
          const yyyy = mdyMatch[3];
          return { ok: true, value: `${mm}/${dd}/${yyyy}` };
        }
        if (isoMatch) {
          return { ok: true, value: `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}` };
        }
      }
      if (!text) return { ok: false, reason: "empty date value" };
      return { ok: true, value: text };
    }
    if (kind === "checkbox") {
      const lowered = text.toLowerCase();
      const isChecked = lowered === "true" || lowered === "1" || lowered === "yes" || lowered === "checked" || lowered === "on";
      return { ok: true, checked: isChecked };
    }
    if (kind === "radio") {
      if (!text) return { ok: false, reason: "empty radio value" };
      return { ok: true, value: text };
    }
    if (kind === "select") {
      return { ok: true, value: text };
    }
    if (!text) return { ok: false, reason: "empty fill value" };
    return { ok: true, value: text };
  }
  __name(sanitizeFillValue, "sanitizeFillValue");
  function fieldHintText(element, action) {
    return [
      action?.field,
      action?.name,
      action?.key,
      action?.label,
      action?.placeholder,
      element?.getAttribute?.("name"),
      element?.getAttribute?.("id"),
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("placeholder"),
      findLabelText(element)
    ].join(" ").toLowerCase();
  }
  __name(fieldHintText, "fieldHintText");
  function isSensitiveFieldTarget(element, action) {
    const hint = fieldHintText(element, action);
    if (!hint) return false;
    return /\b(ssn|social security|passport|driver'?s?\s*license|license number|maiden name|uscis|alien number|a-number|tax id|tin|itin|dob|date of birth)\b/.test(hint) || /\bdl\s*#?\b/.test(hint);
  }
  __name(isSensitiveFieldTarget, "isSensitiveFieldTarget");
  function isMiddleNameTarget(element, action) {
    const hint = fieldHintText(element, action);
    if (!hint) return false;
    if (/\bmiddle[_\s-]?name\b/.test(hint)) return true;
    return /\bmiddle\b/.test(hint) && /\bname\b/.test(hint);
  }
  __name(isMiddleNameTarget, "isMiddleNameTarget");
  function checkboxLabelText(checkbox) {
    const parts = [];
    const id = checkbox?.getAttribute?.("id");
    const owner = checkbox?.ownerDocument || document;
    if (id) {
      const labelFor = owner.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (labelFor?.textContent) parts.push(labelFor.textContent);
    }
    const closestLabel = checkbox?.closest?.("label");
    if (closestLabel?.textContent) parts.push(closestLabel.textContent);
    if (checkbox?.parentElement?.textContent) parts.push(checkbox.parentElement.textContent);
    parts.push(
      checkbox?.getAttribute?.("aria-label") || "",
      checkbox?.getAttribute?.("title") || "",
      checkbox?.getAttribute?.("name") || "",
      checkbox?.getAttribute?.("id") || ""
    );
    return parts.join(" ").replace(/\s+/g, " ").trim().toLowerCase();
  }
  __name(checkboxLabelText, "checkboxLabelText");
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
    const seen = /* @__PURE__ */ new Set();
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
        if (text.includes("middle") && text.includes("name")) score += 2;
        if (/\bno[_\s-]?middle\b/.test(text)) score += 3;
        score += Math.max(0, 3 - scopeIndex);
        if (!best || score > best.score) best = { checkbox, score };
      }
    }
    if (!best || best.score < 4) return null;
    return best.checkbox;
  }
  __name(findNearbyNoMiddleNameCheckbox, "findNearbyNoMiddleNameCheckbox");
  function applyFill(element, value, action) {
    const fieldKind = inferFillFieldKind(element, action);
    const preserveExisting = action?.preserveExisting !== false;
    const overwrite = action?.overwrite === true || action?.force === true;
    const sensitiveTarget = isSensitiveFieldTarget(element, action);
    const allowSensitiveFill = action?.allowSensitiveFill === true || action?.allowSensitiveFill === void 0 && defaultAllowSensitiveFill;
    const allowSensitiveOverwrite = action?.allowSensitiveOverwrite === true || action?.allowSensitiveOverwrite === void 0 && defaultAllowSensitiveOverwrite;
    const existingRaw = readElementValue(element);
    const existingComparableRaw = normalizeComparableValue(fieldKind, existingRaw);
    if (sensitiveTarget) {
      if (existingComparableRaw && !allowSensitiveOverwrite) {
        return {
          ok: true,
          skipped: true,
          reason: "sensitive field locked (existing value preserved)",
          kind: fieldKind
        };
      }
      if (!existingComparableRaw && !allowSensitiveFill) {
        return {
          ok: true,
          skipped: true,
          reason: "sensitive field fill blocked",
          kind: fieldKind
        };
      }
    }
    if (isMiddleNameTarget(element, action)) {
      const raw = String(value ?? "").trim().toLowerCase();
      const noMiddleRequested = action?.noMiddleName === true || raw === "" || raw === "na" || raw === "n/a" || raw === "none" || raw === "no middle name";
      if (noMiddleRequested) {
        const noMiddleCheckbox = findNearbyNoMiddleNameCheckbox(element);
        if (noMiddleCheckbox) {
          const alreadyChecked = Boolean(noMiddleCheckbox.checked);
          if (!alreadyChecked) {
            noMiddleCheckbox.focus();
            noMiddleCheckbox.click();
            noMiddleCheckbox.dispatchEvent(new Event("input", { bubbles: true }));
            noMiddleCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
          }
          if ("value" in element) {
            element.value = "";
            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return {
            ok: true,
            skipped: alreadyChecked,
            reason: alreadyChecked ? "no-middle-name checkbox already checked" : "checked no-middle-name checkbox",
            kind: fieldKind
          };
        }
      }
    }
    const sanitized = sanitizeFillValue(fieldKind, value, element);
    if (!sanitized.ok) {
      return { ok: false, skipped: true, reason: sanitized.reason || "validation failed", kind: fieldKind };
    }
    const text = String(sanitized.value ?? "");
    const tag = element.tagName.toLowerCase();
    const normalized = text.trim().toLowerCase();
    const nextComparable = normalizeComparableValue(fieldKind, text);
    const existingComparable = existingComparableRaw;
    if (existingComparable && nextComparable && existingComparable === nextComparable) {
      return { ok: true, skipped: true, reason: "already set", kind: fieldKind };
    }
    if (preserveExisting && !overwrite && existingComparable && nextComparable && existingComparable !== nextComparable) {
      return { ok: true, skipped: true, reason: "existing non-empty value preserved", kind: fieldKind };
    }
    function dispatchInputLikeEvents(target) {
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
      target.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Tab" }));
      target.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    }
    __name(dispatchInputLikeEvents, "dispatchInputLikeEvents");
    function setElementValue(target, nextValue) {
      if (!target) return;
      const proto = Object.getPrototypeOf(target);
      const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
      if (descriptor && typeof descriptor.set === "function") {
        descriptor.set.call(target, nextValue);
      } else {
        target.value = nextValue;
      }
    }
    __name(setElementValue, "setElementValue");
    if (fieldKind === "checkbox" && "checked" in element) {
      element.focus();
      element.checked = Boolean(sanitized.checked);
    } else if (element.isContentEditable) {
      element.focus();
      element.textContent = text;
    } else if (tag === "select") {
      const options2 = Array.from(element.options || []);
      const match = options2.find((opt) => {
        const valueLower = String(opt.value || "").trim().toLowerCase();
        const textLower = String(opt.textContent || "").trim().toLowerCase();
        return valueLower === normalized || textLower === normalized || normalized && valueLower.includes(normalized) || normalized && textLower.includes(normalized);
      });
      element.value = match ? match.value : text;
    } else if ("value" in element) {
      element.focus();
      setElementValue(element, text);
    } else {
      element.setAttribute("value", text);
    }
    dispatchInputLikeEvents(element);
    return { ok: true, skipped: false, reason: "", kind: fieldKind };
  }
  __name(applyFill, "applyFill");
  if (logLifecycle) {
    remoteLog("Batch action execution started.", "INFO");
  }
  const list = Array.isArray(actions) ? actions : [];
  let executedSteps = 0;
  updateRunState({ status: "running", startedAt: Date.now(), totalSteps: list.length, executedSteps, cancelled: false });
  for (let i = 0; i < list.length; i++) {
    if (isCancelled()) {
      remoteLog("Execution cancelled by user request.", "WARN");
      updateRunState({ status: "cancelled", cancelled: true, executedSteps });
      return { ok: false, cancelled: true, executedSteps };
    }
    const action = list[i] || {};
    const type = String(action.type || "").toLowerCase();
    try {
      if (type === "wait") {
        const duration = Number(action.duration || 1e3);
        remoteLog(`Step ${i + 1}/${list.length}: wait ${duration}ms`, "INFO");
        await sleep(duration);
        executedSteps += 1;
        updateRunState({ executedSteps });
        continue;
      }
      if (type === "script" || type === "js" || type === "javascript") {
        if (!allowAiScripts) {
          remoteLog(`Step ${i + 1}/${list.length}: blocked script action (allowAiScripts is false).`, "WARN");
          continue;
        }
        const code = String(action.code ?? action.script ?? action.js ?? "").trim();
        if (!code) {
          remoteLog(`Step ${i + 1}/${list.length}: skipped script action (empty code).`, "WARN");
          continue;
        }
        if (code.length > 12e3) {
          remoteLog(`Step ${i + 1}/${list.length}: skipped script action (code too large).`, "WARN");
          continue;
        }
        remoteLog(`Step ${i + 1}/${list.length}: script action`, "INFO");
        try {
          const AsyncFunction = Object.getPrototypeOf(async function() {
          }).constructor;
          const fn = new AsyncFunction('"use strict";\n' + code);
          const resultValue = await fn();
          let preview = "";
          try {
            preview = typeof resultValue === "string" ? resultValue : JSON.stringify(resultValue);
          } catch (_err) {
            preview = String(resultValue);
          }
          preview = String(preview || "").replace(/\s+/g, " ").trim();
          if (preview) {
            remoteLog(`Step ${i + 1}/${list.length}: script result: ${preview.slice(0, 180)}`, "INFO");
          }
        } catch (err) {
          remoteLog(`Step ${i + 1}/${list.length}: script error: ${err.message}`, "ERROR");
        }
        const postWaitMs2 = Math.max(0, Number(action.post_wait_ms || 300));
        await sleep(postWaitMs2);
        const humanizedDelayMs2 = nextHumanizedDelayMs();
        if (humanizedDelayMs2 > 0 && i < list.length - 1) {
          remoteLog(`Step ${i + 1}/${list.length}: natural delay ${humanizedDelayMs2}ms`, "INFO");
          await sleep(humanizedDelayMs2);
        }
        executedSteps += 1;
        updateRunState({ executedSteps });
        continue;
      }
      let resolved = resolveActionElement(action, i + 1, list.length, type);
      let element = resolved.element;
      if (!element && (type === "fill" || type === "type" || type === "click" || type === "scroll")) {
        const probeDistance = Math.max(240, Math.round(window.innerHeight * 0.8));
        const maxProbeScrolls = 4;
        for (let probe = 1; probe <= maxProbeScrolls && !element; probe += 1) {
          window.scrollBy({ top: probeDistance, behavior: "auto" });
          await sleep(120);
          resolved = resolveActionElement(action, i + 1, list.length, type);
          element = resolved.element;
          if (element) {
            remoteLog(`Step ${i + 1}/${list.length}: matched after probe scroll ${probe}/${maxProbeScrolls}`, "INFO");
            break;
          }
        }
        if (!element) {
          window.scrollTo({ top: 0, behavior: "auto" });
          await sleep(120);
          resolved = resolveActionElement(action, i + 1, list.length, type);
          element = resolved.element;
          if (element) {
            remoteLog(`Step ${i + 1}/${list.length}: matched after reset-to-top probe`, "INFO");
          }
        }
      }
      if (!element) {
        const tried = resolved.selectors?.length ? resolved.selectors.join(" | ") : "(none)";
        remoteLog(`Step ${i + 1} failed: Could not resolve target. selectors tried: ${tried}`, "WARN");
        continue;
      }
      const originalStyle = {
        outline: element.style.outline,
        backgroundColor: element.style.backgroundColor
      };
      element.style.outline = "3px solid #2563eb";
      element.style.backgroundColor = "rgba(37, 99, 235, 0.1)";
      remoteLog(`Step ${i + 1}/${list.length}: ${type} via ${resolved.matchedBy}`, "INFO");
      if (type === "fill" || type === "type") {
        try {
          element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
          remoteLog(`Step ${i + 1}/${list.length}: auto-scroll to active input`, "INFO");
        } catch (_err) {
        }
        const fillResult = applyFill(element, action.value, action);
        if (!fillResult.ok || fillResult.skipped) {
          const status = fillResult.ok ? "INFO" : "WARN";
          const reason = fillResult.reason || "fill skipped";
          remoteLog(`Step ${i + 1}/${list.length}: fill guard (${fillResult.kind || "text"}) -> ${reason}`, status);
        }
      } else if (type === "click") {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.click();
      } else if (type === "scroll") {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        remoteLog(`Step ${i + 1} skipped: Unsupported action type ${type}`, "WARN");
      }
      const postWaitMs = Math.max(0, Number(action.post_wait_ms || 300));
      await sleep(postWaitMs);
      const humanizedDelayMs = nextHumanizedDelayMs();
      if (humanizedDelayMs > 0 && i < list.length - 1) {
        remoteLog(`Step ${i + 1}/${list.length}: natural delay ${humanizedDelayMs}ms`, "INFO");
        await sleep(humanizedDelayMs);
      }
      element.style.outline = originalStyle.outline;
      element.style.backgroundColor = originalStyle.backgroundColor;
      executedSteps += 1;
      updateRunState({ executedSteps });
    } catch (err) {
      remoteLog(`Step ${i + 1} execution error: ${err.message}`, "ERROR");
    }
  }
  if (logLifecycle) {
    remoteLog("Batch action execution finished.", "INFO");
  }
  updateRunState({ status: "done", cancelled: false, executedSteps });
  return { ok: true, cancelled: false, executedSteps };
}
__name(performPageActions, "performPageActions");
var PROFILE_STORAGE_KEY = "bilge_user_profile";
var autoFillLogger = new BilgeLogger("auto-fill");
var pendingAutoFill = null;
async function loadProfile() {
  try {
    const result = await chrome.storage.local.get(PROFILE_STORAGE_KEY);
    return result[PROFILE_STORAGE_KEY] || null;
  } catch (err) {
    autoFillLogger.error("Failed to load profile", { error: err.message });
    return null;
  }
}
__name(loadProfile, "loadProfile");
async function saveProfile(profile) {
  try {
    await chrome.storage.local.set({ [PROFILE_STORAGE_KEY]: profile });
    autoFillLogger.info("Profile saved successfully");
    return true;
  } catch (err) {
    autoFillLogger.error("Failed to save profile", { error: err.message });
    return false;
  }
}
__name(saveProfile, "saveProfile");
async function getGeminiApiKey() {
  try {
    const result = await chrome.storage.local.get("bilge_app_settings");
    const settings = result.bilge_app_settings;
    if (settings?.geminiApiKey) return settings.geminiApiKey;
    const envKey = String(process.env?.GEMINI_API_KEY || process.env?.API_KEY || "").trim();
    if (envKey) return envKey;
    return null;
  } catch (err) {
    autoFillLogger.error("Failed to get API key", { error: err.message });
    return null;
  }
}
__name(getGeminiApiKey, "getGeminiApiKey");
async function mapFieldsWithAI(fields, profile) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    autoFillLogger.warn("No Gemini API key available");
    return mapFieldsHeuristically(fields, profile);
  }
  const fieldsSummary = fields.map((f) => ({
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
    firstName: profile.firstName || "",
    lastName: profile.lastName || "",
    middleName: profile.middleName || "",
    email: profile.email || "",
    phone: profile.phone || "",
    address1: profile.address1 || "",
    address2: profile.address2 || "",
    city: profile.city || "",
    state: profile.state || "",
    zipCode: profile.zipCode || "",
    country: profile.country || "USA",
    company: profile.company || "",
    jobTitle: profile.jobTitle || "",
    ...profile.custom || {}
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      autoFillLogger.error("Gemini API error", { status: response.status, error: errorText });
      return mapFieldsHeuristically(fields, profile);
    }
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    let jsonText = text.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    }
    const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonText = arrayMatch[0];
    }
    const rawMappings = JSON.parse(jsonText);
    const mappings = rawMappings.map((m) => {
      const field = fields[m.fieldIndex];
      return {
        ...m,
        fieldName: field?.name || field?.id || `field_${m.fieldIndex}`,
        fieldLabel: field?.label || field?.placeholder || m.profileField,
        isSensitive: ["ssn", "password", "cc", "creditcard", "cvv", "birthdate", "dob"].some(
          (s) => (m.profileField || "").toLowerCase().includes(s) || (field?.name || "").toLowerCase().includes(s) || (field?.id || "").toLowerCase().includes(s)
        ),
        confidence: m.confidence === "high" ? 1 : m.confidence === "medium" ? 0.7 : 0.4
      };
    });
    autoFillLogger.info(`AI mapped ${mappings.length} fields`);
    return mappings;
  } catch (err) {
    autoFillLogger.error("AI mapping failed", { error: err.message });
    return mapFieldsHeuristically(fields, profile);
  }
}
__name(mapFieldsWithAI, "mapFieldsWithAI");
function mapFieldsHeuristically(fields, profile) {
  const mappings = [];
  const patterns = {
    email: { match: /email|e-mail/i, field: "email" },
    firstName: { match: /first[_-]?name|given[_-]?name|fname/i, field: "firstName" },
    lastName: { match: /last[_-]?name|family[_-]?name|surname|lname/i, field: "lastName" },
    middleName: { match: /middle[_-]?name|mname/i, field: "middleName" },
    phone: { match: /phone|tel|mobile|cell/i, field: "phone" },
    address1: { match: /address[_-]?1|street[_-]?address|address[_-]?line[_-]?1|street/i, field: "address1" },
    address2: { match: /address[_-]?2|apt|suite|unit|address[_-]?line[_-]?2/i, field: "address2" },
    city: { match: /city|locality/i, field: "city" },
    state: { match: /state|province|region/i, field: "state" },
    zipCode: { match: /zip|postal[_-]?code|postcode/i, field: "zipCode" },
    country: { match: /country/i, field: "country" },
    company: { match: /company|organization|employer/i, field: "company" },
    jobTitle: { match: /job[_-]?title|title|position|role/i, field: "jobTitle" }
  };
  const autocompleteMap = {
    "email": "email",
    "given-name": "firstName",
    "family-name": "lastName",
    "additional-name": "middleName",
    "tel": "phone",
    "tel-national": "phone",
    "street-address": "address1",
    "address-line1": "address1",
    "address-line2": "address2",
    "address-level2": "city",
    "address-level1": "state",
    "postal-code": "zipCode",
    "country": "country",
    "country-name": "country",
    "organization": "company",
    "organization-title": "jobTitle"
  };
  for (const field of fields) {
    if (field.currentValue) continue;
    const searchText = `${field.autocomplete} ${field.name} ${field.id} ${field.label} ${field.placeholder}`.toLowerCase();
    let profileField = null;
    let confidence = "low";
    if (field.autocomplete && autocompleteMap[field.autocomplete.toLowerCase()]) {
      profileField = autocompleteMap[field.autocomplete.toLowerCase()];
      confidence = "high";
    }
    if (!profileField) {
      for (const [key, pattern] of Object.entries(patterns)) {
        if (pattern.match.test(searchText)) {
          profileField = pattern.field;
          confidence = "medium";
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
__name(mapFieldsHeuristically, "mapFieldsHeuristically");
function convertMappingsToBatchActions(mappings) {
  return mappings.map((m) => ({
    type: "fill",
    selector: m.selector,
    value: m.value,
    field: m.profileField,
    preserveExisting: true
  }));
}
__name(convertMappingsToBatchActions, "convertMappingsToBatchActions");
async function extractFormFields(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "EXTRACT_FORM_FIELDS" }, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        resolve({ error: err.message });
      } else {
        resolve(response || { error: "No response from content script" });
      }
    });
  });
}
__name(extractFormFields, "extractFormFields");
async function performAutoFill() {
  autoFillLogger.info("Auto-fill triggered");
  const profile = await loadProfile();
  if (!profile) {
    autoFillLogger.warn("No profile found - please set up your profile first");
    return { error: "No profile configured. Please set up your profile in the Bilge sidepanel." };
  }
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) {
    autoFillLogger.error("No active tab found");
    return { error: "No active tab found" };
  }
  if (isRestrictedUrl(tab.url)) {
    autoFillLogger.warn("Cannot auto-fill on restricted URL", { url: tab.url });
    return { error: "Cannot auto-fill on restricted pages (Chrome internal pages, Web Store)" };
  }
  autoFillLogger.info("Extracting form fields...");
  const extraction = await extractFormFields(tab.id);
  if (extraction.error) {
    autoFillLogger.error("Field extraction failed", { error: extraction.error });
    return { error: `Failed to extract form fields: ${extraction.error}` };
  }
  const fields = extraction.fields || [];
  if (fields.length === 0) {
    autoFillLogger.info("No fillable form fields found on this page");
    return { error: "No fillable form fields found on this page" };
  }
  autoFillLogger.info(`Found ${fields.length} form fields`);
  autoFillLogger.info("Mapping fields with AI...");
  const mappings = await mapFieldsWithAI(fields, profile);
  if (mappings.length === 0) {
    autoFillLogger.info("No fields matched profile data");
    return { error: "No form fields matched your profile data" };
  }
  autoFillLogger.info(`Mapped ${mappings.length} fields to profile`);
  pendingAutoFill = {
    mappings,
    tabId: tab.id
  };
  try {
    chrome.runtime.sendMessage({
      type: "SHOW_AUTO_FILL_PREVIEW",
      payload: { mappings }
    });
    autoFillLogger.info("Sent auto-fill preview to sidepanel");
    return { previewShown: true, count: mappings.length };
  } catch (err) {
    autoFillLogger.warn("Failed to send preview, proceeding directly", { error: err.message });
  }
  const actions = convertMappingsToBatchActions(mappings);
  autoFillLogger.info(`Executing ${actions.length} fill actions...`);
  try {
    const result = await executeBatchActions(actions, {
      humanizedDelayEnabled: true,
      humanizedDelayBaseMs: 50,
      humanizedDelayJitterMs: 100,
      suppressLifecycleLogs: true
    });
    autoFillLogger.info("Auto-fill completed", {
      executedSteps: result.executedSteps,
      mappedFields: mappings.length
    });
    return {
      success: true,
      filledFields: result.executedSteps,
      totalMapped: mappings.length,
      mappings: mappings.map((m) => ({ field: m.profileField, confidence: m.confidence }))
    };
  } catch (err) {
    autoFillLogger.error("Auto-fill execution failed", { error: err.message });
    return { error: `Fill execution failed: ${err.message}` };
  }
}
__name(performAutoFill, "performAutoFill");
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "auto_fill_form") {
    autoFillLogger.info("Auto-fill command received (Ctrl+Shift+L)");
    const result = await performAutoFill();
    safeSendRuntimeMessage({
      type: "AUTO_FILL_RESULT",
      payload: result
    });
    if (result.error) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: "Bilge Auto-Fill",
        message: result.error
      });
    } else {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: "Bilge Auto-Fill",
        message: `Filled ${result.filledFields} of ${result.totalMapped || 0} matched fields`
      });
    }
  }
  if (command === "open_command_input") {
    bgLogger.info("Command: open_command_input");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await chrome.sidePanel.open({ tabId: tab.id });
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: "FOCUS_COMMAND_INPUT" });
    }, 500);
  }
  if (command === "screenshot_analyze") {
    bgLogger.info("Command: screenshot_analyze");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      const screenshot = await captureVisibleTabDataUrl(tab.windowId || null);
      chrome.runtime.sendMessage({
        type: "ANALYZE_SCREENSHOT",
        payload: { screenshot, tabId: tab.id }
      });
    } catch (err) {
      bgLogger.error("Screenshot analyze failed", { error: err.message });
    }
  }
  if (command === "cancel_action") {
    bgLogger.info("Command: cancel_action");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "CANCEL_CURRENT_ACTION" });
  }
});
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.to === "BACKGROUND" && request.payload?.action === "get_profile") {
    loadProfile().then((profile) => sendResponse({ profile }));
    return true;
  }
  if (request?.to === "BACKGROUND" && request.payload?.action === "save_profile") {
    saveProfile(request.payload.profile).then((success) => sendResponse({ success }));
    return true;
  }
  if (request?.to === "BACKGROUND" && request.payload?.action === "auto_fill") {
    performAutoFill().then((result) => sendResponse(result));
    return true;
  }
  if (request?.type === "CONFIRM_AUTO_FILL") {
    (async () => {
      try {
        if (!pendingAutoFill) {
          sendResponse({ error: "No pending auto-fill found" });
          return;
        }
        const { selectedFields } = request.payload;
        const filteredMappings = pendingAutoFill.mappings.filter(
          (m) => selectedFields.includes(m.fieldName)
        );
        if (filteredMappings.length === 0) {
          sendResponse({ error: "No fields selected" });
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
        autoFillLogger.error("Confirmed auto-fill failed", { error: err.message });
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }
});
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type === "LOAD_MCP_FORM_DATA") {
    const path = String(request.payload?.path || "profiles/default.json").trim();
    bgLogger.info("LOAD_MCP_FORM_DATA requested", { path });
    (async () => {
      try {
        const appSettings = await getBilgeAppSettingsSnapshot();
        const mcpBaseUrl = String(appSettings?.mcpBaseUrl || "").trim() || "https://mcp.caravanflow.com";
        const mcpToken = String(appSettings?.mcpApiToken || appSettings?.mcpToken || "").trim();
        const headers = {
          ...mcpToken ? { "Authorization": `Bearer ${mcpToken}` } : {},
          "Content-Type": "application/json"
        };
        const response = await fetch(`${mcpBaseUrl}/mcp/resource?path=${encodeURIComponent(path)}`, {
          method: "GET",
          headers
        });
        if (!response.ok) {
          bgLogger.warn("MCP form data fetch failed", { status: response.status, path });
          sendResponse({ ok: false, error: `MCP request failed: ${response.status}` });
          return;
        }
        const data = await response.json();
        bgLogger.info("LOAD_MCP_FORM_DATA success", { path, fieldsCount: Object.keys(data.fields || data).length });
        sendResponse({ ok: true, formData: data });
      } catch (err) {
        bgLogger.error("LOAD_MCP_FORM_DATA error", { path, error: err.message });
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
  if (request?.type === "SAVE_MCP_FORM_DATA") {
    const path = String(request.payload?.path || "profiles/default.json").trim();
    const data = request.payload?.data;
    bgLogger.info("SAVE_MCP_FORM_DATA requested", { path });
    (async () => {
      try {
        const appSettings = await getBilgeAppSettingsSnapshot();
        const mcpBaseUrl = String(appSettings?.mcpBaseUrl || "").trim() || "https://mcp.caravanflow.com";
        const mcpToken = String(appSettings?.mcpApiToken || appSettings?.mcpToken || "").trim();
        const headers = {
          ...mcpToken ? { "Authorization": `Bearer ${mcpToken}` } : {},
          "Content-Type": "application/json"
        };
        const response = await fetch(`${mcpBaseUrl}/mcp/resource?path=${encodeURIComponent(path)}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(data)
        });
        if (!response.ok) {
          bgLogger.warn("MCP form data save failed", { status: response.status, path });
          sendResponse({ ok: false, error: `MCP save failed: ${response.status}` });
          return;
        }
        bgLogger.info("SAVE_MCP_FORM_DATA success", { path });
        sendResponse({ ok: true });
      } catch (err) {
        bgLogger.error("SAVE_MCP_FORM_DATA error", { path, error: err.message });
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
  if (request?.type === "LIST_MCP_PROFILES") {
    bgLogger.info("LIST_MCP_PROFILES requested");
    (async () => {
      try {
        const appSettings = await getBilgeAppSettingsSnapshot();
        const mcpBaseUrl = String(appSettings?.mcpBaseUrl || "").trim() || "https://mcp.caravanflow.com";
        const mcpToken = String(appSettings?.mcpApiToken || appSettings?.mcpToken || "").trim();
        const headers = {
          ...mcpToken ? { "Authorization": `Bearer ${mcpToken}` } : {},
          "Content-Type": "application/json"
        };
        const response = await fetch(`${mcpBaseUrl}/mcp/list?path=profiles/`, {
          method: "GET",
          headers
        });
        if (!response.ok) {
          sendResponse({ ok: false, error: `MCP list failed: ${response.status}`, profiles: [] });
          return;
        }
        const data = await response.json();
        const profiles = Array.isArray(data.files) ? data.files.filter((f) => f.endsWith(".json")) : [];
        bgLogger.info("LIST_MCP_PROFILES success", { count: profiles.length });
        sendResponse({ ok: true, profiles });
      } catch (err) {
        bgLogger.error("LIST_MCP_PROFILES error", { error: err.message });
        sendResponse({ ok: false, error: err.message, profiles: [] });
      }
    })();
    return true;
  }
  if (request?.type === "FILL_FROM_PROFILE" || request?.type === "SAVE_FORM_STATE" || request?.type === "RESTORE_FORM_STATE" || request?.type === "GET_SELF_HEALING_STATS" || request?.type === "GET_PAGE_CONTEXT") {
    (async () => {
      try {
        const tab = await queryActiveTab();
        if (!tab?.id) {
          sendResponse({ ok: false, error: "No active tab" });
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
  if (areaName !== "local") return;
  if (changes[RELAY_AGENT_ID_KEY]) {
    relayAgentIdCache = normalizeAgentId(changes[RELAY_AGENT_ID_KEY].newValue || "");
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
    disconnectRelay("master_off");
    return;
  }
  connectRelay().catch((err) => {
    bgLogger.warn("Relay reconnect after settings change failed", { error: toErrorMessage(err) });
    scheduleRelayReconnect();
  });
});
initializeRelayClient().catch((err) => {
  bgLogger.warn("Initial relay bootstrap failed", { error: toErrorMessage(err) });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NjcmlwdHMvbWVzc2FnZVJvdXRlci5qcyIsICIuLi8uLi9zcmMvbGliL2Vudi5qcyIsICIuLi8uLi9zcmMvbGliL2xvZ2dlci5qcyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyoqXG4gKiBNZXNzYWdlUm91dGVyIC0gQWR2YW5jZWQgbWVzc2FnZSByb3V0aW5nIGZvciBCaWxnZSBBSSBXb3Jrc3BhY2VcbiAqIFByb3ZpZGVzIHN0cnVjdHVyZWQgaGFuZGxpbmcsIHZhbGlkYXRpb24sIGFuZCBlcnJvciBtYW5hZ2VtZW50IGZvciBleHRlbnNpb24gbWVzc2FnaW5nLlxuICovXG5cbmNsYXNzIE1lc3NhZ2VSb3V0ZXIge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLmhhbmRsZXJzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuaW50ZXJjZXB0b3JzID0gW107XG4gICAgY29uc29sZS5sb2coXCJbTWVzc2FnZVJvdXRlcl0gSW5pdGlhbGl6ZWRcIik7XG4gIH1cblxuICAvKipcbiAgICogUmVnaXN0ZXIgYSBoYW5kbGVyIGZvciBhIHNwZWNpZmljIGFjdGlvblxuICAgKiBAcGFyYW0ge3N0cmluZ30gYWN0aW9uIC0gVGhlIGFjdGlvbiBpZGVudGlmaWVyXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGhhbmRsZXIgLSBBc3luYyBmdW5jdGlvbiAocmVxdWVzdCwgc2VuZGVyKSA9PiByZXNwb25zZVxuICAgKi9cbiAgcmVnaXN0ZXIoYWN0aW9uLCBoYW5kbGVyKSB7XG4gICAgaWYgKHRoaXMuaGFuZGxlcnMuaGFzKGFjdGlvbikpIHtcbiAgICAgIGNvbnNvbGUud2FybihgW01lc3NhZ2VSb3V0ZXJdIE92ZXJ3cml0aW5nIGhhbmRsZXIgZm9yIGFjdGlvbjogJHthY3Rpb259YCk7XG4gICAgfVxuICAgIHRoaXMuaGFuZGxlcnMuc2V0KGFjdGlvbiwgaGFuZGxlcik7XG4gIH1cblxuICAvKipcbiAgICogQWRkIGEgZ2xvYmFsIGludGVyY2VwdG9yIGZvciBhbGwgbWVzc2FnZXNcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gaW50ZXJjZXB0b3IgLSBGdW5jdGlvbiAocmVxdWVzdCwgc2VuZGVyKSA9PiBib29sZWFuICh0cnVlIHRvIGJsb2NrKVxuICAgKi9cbiAgYWRkSW50ZXJjZXB0b3IoaW50ZXJjZXB0b3IpIHtcbiAgICB0aGlzLmludGVyY2VwdG9ycy5wdXNoKGludGVyY2VwdG9yKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEaXNwYXRjaCBhbiBpbmNvbWluZyBtZXNzYWdlIHRvIHRoZSBhcHByb3ByaWF0ZSBoYW5kbGVyXG4gICAqL1xuICBhc3luYyBkaXNwYXRjaChyZXF1ZXN0LCBzZW5kZXIpIHtcbiAgICBjb25zdCBhY3Rpb24gPSByZXF1ZXN0LmFjdGlvbiB8fCAocmVxdWVzdC5wYXlsb2FkICYmIHJlcXVlc3QucGF5bG9hZC5hY3Rpb24pIHx8IHJlcXVlc3QudHlwZTtcbiAgICBcbiAgICAvLyBSdW4gaW50ZXJjZXB0b3JzXG4gICAgZm9yIChjb25zdCBpbnRlcmNlcHRvciBvZiB0aGlzLmludGVyY2VwdG9ycykge1xuICAgICAgaWYgKGludGVyY2VwdG9yKHJlcXVlc3QsIHNlbmRlcikpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTWVzc2FnZSBibG9ja2VkIGJ5IGludGVyY2VwdG9yXCIpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGhhbmRsZXIgPSB0aGlzLmhhbmRsZXJzLmdldChhY3Rpb24pO1xuICAgIGlmICghaGFuZGxlcikge1xuICAgICAgLy8gTm90IGFuIGVycm9yLCBtaWdodCBiZSBpbnRlbmRlZCBmb3IgYW5vdGhlciBsaXN0ZW5lclxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBhd2FpdCBoYW5kbGVyKHJlcXVlc3QsIHNlbmRlcik7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGBbTWVzc2FnZVJvdXRlcl0gRXJyb3IgaGFuZGxpbmcgJHthY3Rpb259OmAsIGVycik7XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB8fCBTdHJpbmcoZXJyKSB9O1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBMaXN0ZW4gZm9yIGNocm9tZS5ydW50aW1lLm9uTWVzc2FnZVxuICAgKi9cbiAgbGlzdGVuKCkge1xuICAgIGNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcigocmVxdWVzdCwgc2VuZGVyLCBzZW5kUmVzcG9uc2UpID0+IHtcbiAgICAgIC8vIENoZWNrIGZvciBuZXN0ZWQgYWN0aW9uIGluIHBheWxvYWQgaWYgc3RhbmRhcmQgYWN0aW9uIGlzIG1pc3NpbmdcbiAgICAgIGNvbnN0IGFjdGlvbiA9IHJlcXVlc3QuYWN0aW9uIHx8IChyZXF1ZXN0LnBheWxvYWQgJiYgcmVxdWVzdC5wYXlsb2FkLmFjdGlvbikgfHwgcmVxdWVzdC50eXBlO1xuICAgICAgXG4gICAgICBpZiAoIXRoaXMuaGFuZGxlcnMuaGFzKGFjdGlvbikpIHJldHVybiBmYWxzZTtcblxuICAgICAgdGhpcy5kaXNwYXRjaChyZXF1ZXN0LCBzZW5kZXIpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICBpZiAocmVzcG9uc2UgIT09IG51bGwpIHtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UocmVzcG9uc2UpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIHRydWU7IC8vIEFsd2F5cyBhc3luY1xuICAgIH0pO1xuICB9XG59XG5cbi8vIEV4cG9ydCBmb3Igc2VydmljZSB3b3JrZXIgdXNlXG5leHBvcnQgZGVmYXVsdCBNZXNzYWdlUm91dGVyO1xuIiwgIi8qKlxuICogUnVudGltZSBlbnZpcm9ubWVudCB1dGlsaXRpZXNcbiAqIEZhbGxzIGJhY2sgdG8gZGVmYXVsdHMgaWYgX19CSUxHRV9FTlZfXyBub3QgaW5qZWN0ZWRcbiAqL1xuZnVuY3Rpb24gZ2V0SW5qZWN0ZWRFbnYoKSB7XG4gIHRyeSB7XG4gICAgY29uc3QgZyA9IHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyA/IGdsb2JhbFRoaXMgOiBudWxsO1xuICAgIGlmIChnICYmIGcuX19CSUxHRV9FTlZfXyAmJiB0eXBlb2YgZy5fX0JJTEdFX0VOVl9fID09PSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuIGcuX19CSUxHRV9FTlZfXztcbiAgICB9XG4gIH0gY2F0Y2gge31cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGdldEVudkZyb21CdWlsZERlZmluZXMoKSB7XG4gIC8vIFRoZXNlIGlkZW50aWZpZXJzIGFyZSByZXBsYWNlZCBhdCBidWlsZCB0aW1lIGJ5IGVzYnVpbGQgYGRlZmluZWAgaW4gYGJ1aWxkLm1qc2AuXG4gIGNvbnN0IGhhc0RlZmluZXMgPVxuICAgIHR5cGVvZiBfX0JJTEdFX0VOVl9fICE9PSAndW5kZWZpbmVkJyB8fFxuICAgIHR5cGVvZiBfX01DUF9CQVNFX1VSTF9fICE9PSAndW5kZWZpbmVkJyB8fFxuICAgIHR5cGVvZiBfX0VOQUJMRV9IT1RfUkVMT0FEX18gIT09ICd1bmRlZmluZWQnIHx8XG4gICAgdHlwZW9mIF9fVkVSU0lPTl9fICE9PSAndW5kZWZpbmVkJztcblxuICBpZiAoIWhhc0RlZmluZXMpIHJldHVybiBudWxsO1xuXG4gIC8vIE1PREUgaXMgdXNlZCBmb3IgbG9nZ2VyIGxldmVscyBhbmQgZmVhdHVyZSBnYXRpbmcuXG4gIC8vIEFjY2VwdCBib3RoIG1vZGVybiAoYGRldmVsb3BtZW50YC9gcHJvZHVjdGlvbmApIGFuZCBzaG9ydCAoYGRldmAvYHByb2RgKSBzcGVsbGluZ3MuXG4gIGNvbnN0IGluZmVycmVkTW9kZSA9XG4gICAgdHlwZW9mIF9fQklMR0VfRU5WX18gIT09ICd1bmRlZmluZWQnXG4gICAgICA/IF9fQklMR0VfRU5WX19cbiAgICAgIDogdHlwZW9mIF9fQlVJTERfTU9ERV9fICE9PSAndW5kZWZpbmVkJyAmJiBfX0JVSUxEX01PREVfXyA9PT0gJ3Byb2QnXG4gICAgICAgID8gJ3Byb2R1Y3Rpb24nXG4gICAgICAgIDogJ2RldmVsb3BtZW50JztcblxuICByZXR1cm4ge1xuICAgIE1PREU6IGluZmVycmVkTW9kZSxcbiAgICBERUJVRzogdHlwZW9mIF9fQklMR0VfREVCVUdfXyAhPT0gJ3VuZGVmaW5lZCcgPyBfX0JJTEdFX0RFQlVHX18gOiB0cnVlLFxuICAgIFZFUlNJT046IHR5cGVvZiBfX1ZFUlNJT05fXyAhPT0gJ3VuZGVmaW5lZCcgPyBfX1ZFUlNJT05fXyA6ICdkZXYnLFxuICAgIE1DUF9CQVNFX1VSTDogdHlwZW9mIF9fTUNQX0JBU0VfVVJMX18gIT09ICd1bmRlZmluZWQnID8gX19NQ1BfQkFTRV9VUkxfXyA6ICdodHRwOi8vbG9jYWxob3N0Ojg3ODcnLFxuICAgIE1DUF9XU19VUkw6IHR5cGVvZiBfX01DUF9XU19VUkxfXyAhPT0gJ3VuZGVmaW5lZCcgPyBfX01DUF9XU19VUkxfXyA6ICd3czovL2xvY2FsaG9zdDo4Nzg3L3dzJyxcbiAgICBERUZBVUxUX0JSQUlOX1BST1ZJREVSOlxuICAgICAgdHlwZW9mIF9fREVGQVVMVF9CUkFJTl9QUk9WSURFUl9fICE9PSAndW5kZWZpbmVkJyA/IF9fREVGQVVMVF9CUkFJTl9QUk9WSURFUl9fIDogJ2RlZXBzZWVrJyxcbiAgICBERUZBVUxUX0JSQUlOX01PREVMOiB0eXBlb2YgX19ERUZBVUxUX0JSQUlOX01PREVMX18gIT09ICd1bmRlZmluZWQnID8gX19ERUZBVUxUX0JSQUlOX01PREVMX18gOiAnZGVlcHNlZWstY2hhdCcsXG4gICAgRkVBVFVSRVM6IHtcbiAgICAgIERFVl9UT09MUzogdHlwZW9mIF9fRU5BQkxFX0RFVl9UT09MU19fICE9PSAndW5kZWZpbmVkJyA/IF9fRU5BQkxFX0RFVl9UT09MU19fIDogdHJ1ZSxcbiAgICAgIENPTlNPTEVfTE9HR0lORzogdHlwZW9mIF9fRU5BQkxFX0NPTlNPTEVfTE9HR0lOR19fICE9PSAndW5kZWZpbmVkJyA/IF9fRU5BQkxFX0NPTlNPTEVfTE9HR0lOR19fIDogdHJ1ZSxcbiAgICAgIFBFUkZPUk1BTkNFX01FVFJJQ1M6XG4gICAgICAgIHR5cGVvZiBfX0VOQUJMRV9QRVJGT1JNQU5DRV9NRVRSSUNTX18gIT09ICd1bmRlZmluZWQnID8gX19FTkFCTEVfUEVSRk9STUFOQ0VfTUVUUklDU19fIDogdHJ1ZSxcbiAgICAgIEhPVF9SRUxPQUQ6IHR5cGVvZiBfX0VOQUJMRV9IT1RfUkVMT0FEX18gIT09ICd1bmRlZmluZWQnID8gX19FTkFCTEVfSE9UX1JFTE9BRF9fIDogZmFsc2VcbiAgICB9LFxuICAgIFRFTEVNRVRSWToge1xuICAgICAgRU5BQkxFRDogdHlwZW9mIF9fVEVMRU1FVFJZX0VOQUJMRURfXyAhPT0gJ3VuZGVmaW5lZCcgPyBfX1RFTEVNRVRSWV9FTkFCTEVEX18gOiBmYWxzZSxcbiAgICAgIEVORFBPSU5UOiB0eXBlb2YgX19URUxFTUVUUllfRU5EUE9JTlRfXyAhPT0gJ3VuZGVmaW5lZCcgPyBfX1RFTEVNRVRSWV9FTkRQT0lOVF9fIDogJydcbiAgICB9XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRFbnYoKSB7XG4gIGNvbnN0IGluamVjdGVkID0gZ2V0SW5qZWN0ZWRFbnYoKTtcbiAgaWYgKGluamVjdGVkKSByZXR1cm4gaW5qZWN0ZWQ7XG5cbiAgY29uc3QgZnJvbURlZmluZXMgPSBnZXRFbnZGcm9tQnVpbGREZWZpbmVzKCk7XG4gIGlmIChmcm9tRGVmaW5lcykgcmV0dXJuIGZyb21EZWZpbmVzO1xuXG4gIC8vIEZhbGxiYWNrIGZvciBkaXJlY3QgbG9hZGluZ1xuICByZXR1cm4ge1xuICAgIE1PREU6ICdkZXZlbG9wbWVudCcsXG4gICAgREVCVUc6IHRydWUsXG4gICAgVkVSU0lPTjogJ2RldicsXG4gICAgTUNQX0JBU0VfVVJMOiAnaHR0cDovL2xvY2FsaG9zdDo4Nzg3JyxcbiAgICBNQ1BfV1NfVVJMOiAnd3M6Ly9sb2NhbGhvc3Q6ODc4Ny93cycsXG4gICAgREVGQVVMVF9CUkFJTl9QUk9WSURFUjogJ2RlZXBzZWVrJyxcbiAgICBERUZBVUxUX0JSQUlOX01PREVMOiAnZGVlcHNlZWstY2hhdCcsXG4gICAgRkVBVFVSRVM6IHsgREVWX1RPT0xTOiB0cnVlLCBDT05TT0xFX0xPR0dJTkc6IHRydWUsIFBFUkZPUk1BTkNFX01FVFJJQ1M6IHRydWUsIEhPVF9SRUxPQUQ6IHRydWUgfSxcbiAgICBURUxFTUVUUlk6IHsgRU5BQkxFRDogZmFsc2UsIEVORFBPSU5UOiAnJyB9XG4gIH07XG59XG5cbmV4cG9ydCBjb25zdCBFTlYgPSBnZXRFbnYoKTtcbmV4cG9ydCBjb25zdCBpc0RldiA9ICgpID0+IEVOVi5NT0RFID09PSAnZGV2ZWxvcG1lbnQnIHx8IEVOVi5NT0RFID09PSAnZGV2JztcbmV4cG9ydCBjb25zdCBpc1Byb2QgPSAoKSA9PiBFTlYuTU9ERSA9PT0gJ3Byb2R1Y3Rpb24nIHx8IEVOVi5NT0RFID09PSAncHJvZCc7XG5leHBvcnQgY29uc3QgaXNEZWJ1ZyA9ICgpID0+IEVOVi5ERUJVRyA9PT0gdHJ1ZTtcbiIsICJpbXBvcnQgeyBFTlYsIGlzRGV2IH0gZnJvbSAnLi9lbnYuanMnO1xuXG5jb25zdCBMT0dfTEVWRUxTID0geyBERUJVRzogMCwgSU5GTzogMSwgV0FSTjogMiwgRVJST1I6IDMsIE5PTkU6IDQgfTtcbmNvbnN0IGN1cnJlbnRMZXZlbCA9IGlzRGV2KCkgPyBMT0dfTEVWRUxTLkRFQlVHIDogTE9HX0xFVkVMUy5XQVJOO1xuXG5mdW5jdGlvbiBzaG91bGRMb2cobGV2ZWwpIHtcbiAgaWYgKCFFTlYuRkVBVFVSRVMuQ09OU09MRV9MT0dHSU5HKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiBsZXZlbCA+PSBjdXJyZW50TGV2ZWw7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdE1lc3NhZ2UobGV2ZWwsIG1vZHVsZSwgbWVzc2FnZSkge1xuICBjb25zdCB0aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc3BsaXQoJ1QnKVsxXS5zbGljZSgwLCAtMSk7XG4gIHJldHVybiBgWyR7dGltZXN0YW1wfV0gWyR7bGV2ZWx9XSBbJHttb2R1bGV9XSAke21lc3NhZ2V9YDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxvZ2dlcihtb2R1bGUpIHtcbiAgcmV0dXJuIHtcbiAgICBkZWJ1ZyhtZXNzYWdlLCBkYXRhKSB7XG4gICAgICBpZiAoc2hvdWxkTG9nKExPR19MRVZFTFMuREVCVUcpKSB7XG4gICAgICAgIGNvbnNvbGUuZGVidWcoZm9ybWF0TWVzc2FnZSgnREVCVUcnLCBtb2R1bGUsIG1lc3NhZ2UpLCBkYXRhID8/ICcnKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIGluZm8obWVzc2FnZSwgZGF0YSkge1xuICAgICAgaWYgKHNob3VsZExvZyhMT0dfTEVWRUxTLklORk8pKSB7XG4gICAgICAgIGNvbnNvbGUuaW5mbyhmb3JtYXRNZXNzYWdlKCdJTkZPJywgbW9kdWxlLCBtZXNzYWdlKSwgZGF0YSA/PyAnJyk7XG4gICAgICB9XG4gICAgfSxcbiAgICB3YXJuKG1lc3NhZ2UsIGRhdGEpIHtcbiAgICAgIGlmIChzaG91bGRMb2coTE9HX0xFVkVMUy5XQVJOKSkge1xuICAgICAgICBjb25zb2xlLndhcm4oZm9ybWF0TWVzc2FnZSgnV0FSTicsIG1vZHVsZSwgbWVzc2FnZSksIGRhdGEgPz8gJycpO1xuICAgICAgfVxuICAgIH0sXG4gICAgZXJyb3IobWVzc2FnZSwgZGF0YSkge1xuICAgICAgaWYgKHNob3VsZExvZyhMT0dfTEVWRUxTLkVSUk9SKSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKGZvcm1hdE1lc3NhZ2UoJ0VSUk9SJywgbW9kdWxlLCBtZXNzYWdlKSwgZGF0YSA/PyAnJyk7XG4gICAgICB9XG4gICAgfSxcbiAgICB0aW1lKGxhYmVsKSB7XG4gICAgICBpZiAoRU5WLkZFQVRVUkVTLlBFUkZPUk1BTkNFX01FVFJJQ1MpIHtcbiAgICAgICAgY29uc29sZS50aW1lKGBbJHttb2R1bGV9XSAke2xhYmVsfWApO1xuICAgICAgfVxuICAgIH0sXG4gICAgdGltZUVuZChsYWJlbCkge1xuICAgICAgaWYgKEVOVi5GRUFUVVJFUy5QRVJGT1JNQU5DRV9NRVRSSUNTKSB7XG4gICAgICAgIGNvbnNvbGUudGltZUVuZChgWyR7bW9kdWxlfV0gJHtsYWJlbH1gKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG59XG5cbmV4cG9ydCBjb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ0JpbGdlJyk7XG4iLCAiaW1wb3J0IE1lc3NhZ2VSb3V0ZXIgZnJvbSAnLi9zY3JpcHRzL21lc3NhZ2VSb3V0ZXIuanMnO1xuaW1wb3J0IHsgRU5WLCBpc0RldiwgaXNQcm9kIH0gZnJvbSAnLi9saWIvZW52LmpzJztcbmltcG9ydCB7IGxvZ2dlciBhcyBhcHBMb2dnZXIsIGNyZWF0ZUxvZ2dlciB9IGZyb20gJy4vbGliL2xvZ2dlci5qcyc7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBCaWxnZSBMb2dnZXIgKGlubGluZSBmb3IgRVMgbW9kdWxlIGNvbXBhdGliaWxpdHkpXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuY29uc3QgQklMR0VfTE9HX0tFWSA9ICdfX2JpbGdlX2xvZ3NfXyc7XG5jb25zdCBNQVhfTE9HUyA9IDUwMDtcbmNvbnN0IE1BWF9MT0dfQUdFX01TID0gMjQgKiA2MCAqIDYwICogMTAwMDtcblxuY29uc3QgTG9nTGV2ZWwgPSB7IERFQlVHOiAnREVCVUcnLCBJTkZPOiAnSU5GTycsIFdBUk46ICdXQVJOJywgRVJST1I6ICdFUlJPUicgfTtcblxuZnVuY3Rpb24gdHJ1bmNhdGVGb3JMb2codmFsdWUsIG1heExlbiA9IDUwMCkge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiB2YWx1ZS5sZW5ndGggPiBtYXhMZW4pIHtcbiAgICByZXR1cm4gdmFsdWUuc2xpY2UoMCwgbWF4TGVuKSArICcuLi5bdHJ1bmNhdGVkXSc7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufVxuXG5mdW5jdGlvbiBzYWZlU3RyaW5naWZ5KG9iaiwgbWF4TGVuID0gMTAwMCkge1xuICB0cnkge1xuICAgIGNvbnN0IHN0ciA9IEpTT04uc3RyaW5naWZ5KG9iaiwgKGtleSwgdmFsdWUpID0+IHtcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSByZXR1cm4gdHJ1bmNhdGVGb3JMb2codmFsdWUsIDIwMCk7XG4gICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBFcnJvcikgcmV0dXJuIHsgbmFtZTogdmFsdWUubmFtZSwgbWVzc2FnZTogdmFsdWUubWVzc2FnZSB9O1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH0pO1xuICAgIHJldHVybiB0cnVuY2F0ZUZvckxvZyhzdHIsIG1heExlbik7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gU3RyaW5nKG9iaik7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gc3RvcmVMb2coZW50cnkpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoQklMR0VfTE9HX0tFWSk7XG4gICAgbGV0IGxvZ3MgPSByZXN1bHRbQklMR0VfTE9HX0tFWV0gfHwgW107XG4gICAgbG9ncy5wdXNoKGVudHJ5KTtcbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgIGxvZ3MgPSBsb2dzLmZpbHRlcihsb2cgPT4gbm93IC0gbmV3IERhdGUobG9nLnRpbWVzdGFtcCkuZ2V0VGltZSgpIDwgTUFYX0xPR19BR0VfTVMpO1xuICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSBsb2dzID0gbG9ncy5zbGljZSgtTUFYX0xPR1MpO1xuICAgIGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IFtCSUxHRV9MT0dfS0VZXTogbG9ncyB9KTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGNvbnNvbGUuZXJyb3IoJ1tCaWxnZUxvZ2dlcl0gRmFpbGVkIHRvIHN0b3JlIGxvZzonLCBlKTtcbiAgfVxufVxuXG5jbGFzcyBCaWxnZUxvZ2dlciB7XG4gIGNvbnN0cnVjdG9yKHNvdXJjZSkgeyB0aGlzLnNvdXJjZSA9IHNvdXJjZTsgfVxuICBhc3luYyBsb2cobGV2ZWwsIG1lc3NhZ2UsIGRhdGEgPSBudWxsKSB7XG4gICAgY29uc3QgZW50cnkgPSB7XG4gICAgICBpZDogYCR7RGF0ZS5ub3coKX0tJHtNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyLCA3KX1gLFxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICBsZXZlbCxcbiAgICAgIHNvdXJjZTogdGhpcy5zb3VyY2UsXG4gICAgICBtZXNzYWdlOiB0cnVuY2F0ZUZvckxvZyhTdHJpbmcobWVzc2FnZSksIDUwMClcbiAgICB9O1xuICAgIGlmIChkYXRhICE9PSBudWxsICYmIGRhdGEgIT09IHVuZGVmaW5lZCkgZW50cnkuZGF0YSA9IHNhZmVTdHJpbmdpZnkoZGF0YSk7XG4gICAgXG4gICAgaWYgKEVOVi5GRUFUVVJFUy5DT05TT0xFX0xPR0dJTkcpIHtcbiAgICAgIGNvbnNvbGUubG9nKGBbJHtlbnRyeS50aW1lc3RhbXB9XVske3RoaXMuc291cmNlfV1bJHtsZXZlbH1dICR7bWVzc2FnZX1gLCBkYXRhIHx8ICcnKTtcbiAgICB9XG4gICAgXG4gICAgYXdhaXQgc3RvcmVMb2coZW50cnkpO1xuICAgIGVtaXRBZ2VudExvZ1RlbGVtZXRyeShlbnRyeSk7XG4gICAgcmV0dXJuIGVudHJ5O1xuICB9XG4gIGRlYnVnKG1zZywgZGF0YSkgeyByZXR1cm4gdGhpcy5sb2coTG9nTGV2ZWwuREVCVUcsIG1zZywgZGF0YSk7IH1cbiAgaW5mbyhtc2csIGRhdGEpIHsgcmV0dXJuIHRoaXMubG9nKExvZ0xldmVsLklORk8sIG1zZywgZGF0YSk7IH1cbiAgd2Fybihtc2csIGRhdGEpIHsgcmV0dXJuIHRoaXMubG9nKExvZ0xldmVsLldBUk4sIG1zZywgZGF0YSk7IH1cbiAgZXJyb3IobXNnLCBkYXRhKSB7IHJldHVybiB0aGlzLmxvZyhMb2dMZXZlbC5FUlJPUiwgbXNnLCBkYXRhKTsgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRMb2dzKG9wdGlvbnMgPSB7fSkge1xuICBjb25zdCB7IGxldmVsLCBzb3VyY2UsIHNpbmNlLCBsaW1pdCA9IDEwMCB9ID0gb3B0aW9ucztcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KEJJTEdFX0xPR19LRVkpO1xuICBsZXQgbG9ncyA9IHJlc3VsdFtCSUxHRV9MT0dfS0VZXSB8fCBbXTtcbiAgaWYgKGxldmVsKSB7XG4gICAgY29uc3QgbGV2ZWxzID0gQXJyYXkuaXNBcnJheShsZXZlbCkgPyBsZXZlbCA6IFtsZXZlbF07XG4gICAgbG9ncyA9IGxvZ3MuZmlsdGVyKGxvZyA9PiBsZXZlbHMuaW5jbHVkZXMobG9nLmxldmVsKSk7XG4gIH1cbiAgaWYgKHNvdXJjZSkge1xuICAgIGNvbnN0IHNvdXJjZXMgPSBBcnJheS5pc0FycmF5KHNvdXJjZSkgPyBzb3VyY2UgOiBbc291cmNlXTtcbiAgICBsb2dzID0gbG9ncy5maWx0ZXIobG9nID0+IHNvdXJjZXMuaW5jbHVkZXMobG9nLnNvdXJjZSkpO1xuICB9XG4gIGlmIChzaW5jZSkge1xuICAgIGNvbnN0IHNpbmNlVGltZSA9IHR5cGVvZiBzaW5jZSA9PT0gJ251bWJlcicgPyBzaW5jZSA6IG5ldyBEYXRlKHNpbmNlKS5nZXRUaW1lKCk7XG4gICAgbG9ncyA9IGxvZ3MuZmlsdGVyKGxvZyA9PiBuZXcgRGF0ZShsb2cudGltZXN0YW1wKS5nZXRUaW1lKCkgPj0gc2luY2VUaW1lKTtcbiAgfVxuICByZXR1cm4gbG9ncy5yZXZlcnNlKCkuc2xpY2UoMCwgbGltaXQpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBjbGVhckxvZ3MoKSB7XG4gIGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLnJlbW92ZShCSUxHRV9MT0dfS0VZKTtcbiAgcmV0dXJuIHsgY2xlYXJlZDogdHJ1ZSB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBleHBvcnRMb2dzKCkge1xuICBjb25zdCBsb2dzID0gYXdhaXQgZ2V0TG9ncyh7IGxpbWl0OiBNQVhfTE9HUyB9KTtcbiAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGxvZ3MsIG51bGwsIDIpO1xufVxuXG5jb25zdCBiaWxnZUxvZ1V0aWxzID0ge1xuICBnZXRMb2dzLFxuICBjbGVhckxvZ3MsXG4gIGV4cG9ydExvZ3Ncbn07XG5cbi8vIENvbnNvbGUgdXRpbGl0eSBmb3Igdmlld2luZyBsb2dzXG5nbG9iYWxUaGlzLmJpbGdlTG9ncyA9IHtcbiAgYXN5bmMgdmlldyhvcHRzID0ge30pIHtcbiAgICBjb25zdCBsb2dzID0gYXdhaXQgZ2V0TG9ncyh7IGxpbWl0OiBvcHRzLmxpbWl0IHx8IDUwLCAuLi5vcHRzIH0pO1xuICAgIGNvbnNvbGUubG9nKCdcXG49PT09PSBCSUxHRSBMT0dTID09PT09Jyk7XG4gICAgbG9ncy5mb3JFYWNoKGwgPT4gY29uc29sZS5sb2coYFske2wubGV2ZWx9XSAke2wudGltZXN0YW1wLnNsaWNlKDExLDIzKX0gWyR7bC5zb3VyY2V9XSAke2wubWVzc2FnZX1gLCBsLmRhdGEgfHwgJycpKTtcbiAgICBjb25zb2xlLmxvZyhgPT09PT0gJHtsb2dzLmxlbmd0aH0gbG9ncyA9PT09PVxcbmApO1xuICAgIHJldHVybiBsb2dzO1xuICB9LFxuICBlcnJvcnM6ICgpID0+IGdsb2JhbFRoaXMuYmlsZ2VMb2dzLnZpZXcoeyBsZXZlbDogJ0VSUk9SJyB9KSxcbiAgd2FybmluZ3M6ICgpID0+IGdsb2JhbFRoaXMuYmlsZ2VMb2dzLnZpZXcoeyBsZXZlbDogWydFUlJPUicsICdXQVJOJ10gfSksXG4gIHNpbmNlOiAobWluID0gNSkgPT4gZ2xvYmFsVGhpcy5iaWxnZUxvZ3Mudmlldyh7IHNpbmNlOiBEYXRlLm5vdygpIC0gbWluICogNjAwMDAgfSksXG4gIGNsZWFyOiBjbGVhckxvZ3MsXG4gIGV4cG9ydDogZXhwb3J0TG9nc1xufTtcblxuLy8gSW5pdGlhbGl6ZSBsb2dnZXJzIGZvciBkaWZmZXJlbnQgY29tcG9uZW50c1xuY29uc3QgYmdMb2dnZXIgPSBuZXcgQmlsZ2VMb2dnZXIoJ2JhY2tncm91bmQnKTtcbmNvbnN0IGJhdGNoTG9nZ2VyID0gbmV3IEJpbGdlTG9nZ2VyKCdiYXRjaC1leGVjdXRvcicpO1xuY29uc3QgbXNnTG9nZ2VyID0gbmV3IEJpbGdlTG9nZ2VyKCdtZXNzYWdlLWhhbmRsZXInKTtcblxuaWYgKGNocm9tZS5zaWRlUGFuZWwgJiYgdHlwZW9mIGNocm9tZS5zaWRlUGFuZWwuc2V0UGFuZWxCZWhhdmlvciA9PT0gJ2Z1bmN0aW9uJykge1xuICBjaHJvbWUuc2lkZVBhbmVsXG4gICAgLnNldFBhbmVsQmVoYXZpb3IoeyBvcGVuUGFuZWxPbkFjdGlvbkNsaWNrOiB0cnVlIH0pXG4gICAgLmNhdGNoKChlcnJvcikgPT4gY29uc29sZS5lcnJvcihlcnJvcikpO1xufVxuXG5jaHJvbWUucnVudGltZS5vbkluc3RhbGxlZC5hZGRMaXN0ZW5lcigoKSA9PiB7XG4gIGJnTG9nZ2VyLmluZm8oJ0JpbGdlIEFJIFdvcmtzcGFjZSBFeHRlbnNpb24gSW5zdGFsbGVkJyk7XG4gIGNocm9tZS5zdG9yYWdlLmxvY2FsXG4gICAgLmdldChbJ2Nvbm5lY3RvclByZXNldCcsICdicmFpblByb3ZpZGVyJywgJ2JyYWluTW9kZWwnXSlcbiAgICAudGhlbigoc3RvcmVkKSA9PiB7XG4gICAgICBjb25zdCBwYXRjaCA9IHt9O1xuICAgICAgaWYgKCFTdHJpbmcoc3RvcmVkPy5jb25uZWN0b3JQcmVzZXQgfHwgJycpLnRyaW0oKSkgcGF0Y2guY29ubmVjdG9yUHJlc2V0ID0gREVGQVVMVF9DT05ORUNUT1JfUFJFU0VUO1xuICAgICAgaWYgKCFTdHJpbmcoc3RvcmVkPy5icmFpblByb3ZpZGVyIHx8ICcnKS50cmltKCkpIHBhdGNoLmJyYWluUHJvdmlkZXIgPSBERUZBVUxUX0JSQUlOX1BST1ZJREVSO1xuICAgICAgaWYgKCFTdHJpbmcoc3RvcmVkPy5icmFpbk1vZGVsIHx8ICcnKS50cmltKCkpIHBhdGNoLmJyYWluTW9kZWwgPSBERUZBVUxUX0JSQUlOX01PREVMO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHBhdGNoKS5sZW5ndGggPiAwKSB7XG4gICAgICAgIHJldHVybiBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQocGF0Y2gpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSlcbiAgICAuY2F0Y2goKCkgPT4ge30pO1xuICBlbnN1cmVSZWxheUFnZW50SWQoKS5jYXRjaCgoKSA9PiB7fSk7XG4gIGluaXRpYWxpemVSZWxheUNsaWVudCgpLmNhdGNoKCgpID0+IHt9KTtcbn0pO1xuXG5jaHJvbWUucnVudGltZS5vblN0YXJ0dXAuYWRkTGlzdGVuZXIoKCkgPT4ge1xuICBpbml0aWFsaXplUmVsYXlDbGllbnQoKS5jYXRjaCgoKSA9PiB7fSk7XG59KTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFJlbGF5IC8gUHJvdG9jb2wgVjIgKFdlYlNvY2tldCArIEpTT04tUlBDIGNvbW1hbmQgYnJpZGdlKVxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuY29uc3QgTUFTVEVSX0FDVElWRV9LRVkgPSAnbWFzdGVyQWN0aXZlJztcbmNvbnN0IFRSQUlOSU5HX0FMTE9XX0FJX1NDUklQVFNfS0VZID0gJ3RyYWluaW5nQWxsb3dBaVNjcmlwdHMnO1xuY29uc3QgVFJBSU5JTkdfTU9ERV9TVE9SQUdFX0tFWSA9ICd0cmFpbmluZ01vZGVFbmFibGVkJztcbmNvbnN0IFJFTEFZX0FHRU5UX0lEX0tFWSA9ICdhZ2VudElkJztcbmNvbnN0IFJFTEFZX0VORFBPSU5UX0tFWSA9ICdlbmRwb2ludCc7XG5jb25zdCBSRUxBWV9XU19UT0tFTl9LRVkgPSAnd3NUb2tlbic7XG5jb25zdCBSRUxBWV9IRUFSVEJFQVRfSU5URVJWQUxfTVMgPSAxNTAwMDtcbmNvbnN0IFJFTEFZX1JFQ09OTkVDVF9CQVNFX01TID0gMjUwMDtcbmNvbnN0IFJFTEFZX1JFQ09OTkVDVF9NQVhfTVMgPSAzMDAwMDtcbmNvbnN0IFJFTEFZX0NPTk5FQ1RfVElNRU9VVF9NUyA9IDUwMDA7XG5jb25zdCBUUkFDRV9JRF9MSU1JVCA9IDY0O1xuY29uc3QgRE9NX1NLSUxMX01FTU9SWV9LRVkgPSAnX19iaWxnZV9kb21fc2tpbGxfbWVtb3J5X3YxJztcbmNvbnN0IERPTV9TS0lMTF9NRU1PUllfTUFYID0gMzAwO1xuY29uc3QgREVGQVVMVF9BTkFMWVpFX0VORFBPSU5UID0gJ2h0dHA6Ly8xMjcuMC4wLjE6MTgwODAvYXBpL2FpL2FuYWx5emUtc2NyZWVuJztcbmNvbnN0IERFRkFVTFRfQ09OTkVDVE9SX1BSRVNFVCA9ICdkZWVwc2Vlayc7XG5jb25zdCBERUZBVUxUX0JSQUlOX1BST1ZJREVSID0gRU5WLkRFRkFVTFRfQlJBSU5fUFJPVklERVI7XG5jb25zdCBERUZBVUxUX0JSQUlOX01PREVMID0gRU5WLkRFRkFVTFRfQlJBSU5fTU9ERUw7XG5jb25zdCBBTkFMWVpFX0VORFBPSU5UX0ZBTExCQUNLUyA9IFtcbiAgREVGQVVMVF9BTkFMWVpFX0VORFBPSU5ULFxuICAnaHR0cDovLzEyNy4wLjAuMTo4MDAwL2FwaS9haS9hbmFseXplLXNjcmVlbidcbl07XG5jb25zdCBSRUxBWV9XU19GQUxMQkFDS1MgPSBbXG4gICd3czovL2xvY2FsaG9zdDo4Nzg3L3dzL2FnZW50JyxcbiAgJ3dzOi8vMTI3LjAuMC4xOjg3ODcvd3MvYWdlbnQnLFxuICAnd3M6Ly9sb2NhbGhvc3Q6MTgwODAvd3MvYWdlbnQnLFxuICAnd3M6Ly8xMjcuMC4wLjE6MTgwODAvd3MvYWdlbnQnXG5dO1xuY29uc3QgU0VMRl9JTVBST1ZFTUVOVF9DT01NQU5EX1JFID1cbiAgL1xcYihzZWxmWy1cXHNdPyhpbXByb3ZlfGltcHJvdmVtZW50fGhlYWx8aGVhbGluZ3xhd2FyZXxhd2FyZW5lc3N8cmVwYWlyKXxtYWludGVuYW5jZVxccyttb2RlfGZpeFxccysoeW91cnNlbGZ8c2VsZil8ZGlhZ25vc2VcXHMrKHlvdXJzZWxmfHNlbGYpfHNlbGZcXHMrY2hlY2t8cmVzdGFydFxccysoeW91cnNlbGZ8c2VsZil8cmVib290XFxzKyh5b3Vyc2VsZnxzZWxmKSlcXGIvaTtcbmNvbnN0IFNFTEZfSEVBTF9ERUZBVUxUX1ZBTElEQVRJT04gPSB7XG4gIHByb3ZpZGVyOiAnb3BlbmFpJyxcbiAgbW9kZWw6ICdncHQtNG8nLFxuICBmYWxsYmFja1Byb3ZpZGVyOiAnZGVlcHNlZWsnLFxuICBmYWxsYmFja01vZGVsOiAnZGVlcHNlZWstcmVhc29uZXInXG59O1xuXG5sZXQgcmVsYXlTb2NrZXQgPSBudWxsO1xubGV0IHJlbGF5UmVjb25uZWN0VGltZXIgPSBudWxsO1xubGV0IHJlbGF5UmVjb25uZWN0QXR0ZW1wdHMgPSAwO1xubGV0IHJlbGF5SGVhcnRiZWF0VGltZXIgPSBudWxsO1xubGV0IHJlbGF5TGFzdFVybCA9ICcnO1xubGV0IHJlbGF5QWdlbnRJZENhY2hlID0gJyc7XG5sZXQgcmVsYXlDb25uZWN0SW5GbGlnaHQgPSBudWxsO1xuXG5mdW5jdGlvbiB0b0Vycm9yTWVzc2FnZShlcnIpIHtcbiAgaWYgKGVyciAmJiB0eXBlb2YgZXJyID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgZXJyLm1lc3NhZ2UgPT09ICdzdHJpbmcnKSByZXR1cm4gZXJyLm1lc3NhZ2U7XG4gIHJldHVybiBTdHJpbmcoZXJyIHx8ICdVbmtub3duIGVycm9yJyk7XG59XG5cbmZ1bmN0aW9uIHNhbml0aXplVHJhY2VJZChyYXcsIHByZWZpeCA9ICdpZCcpIHtcbiAgY29uc3QgdmFsdWUgPSBTdHJpbmcocmF3IHx8ICcnKS50cmltKCk7XG4gIGlmICghdmFsdWUpIHJldHVybiBgJHtwcmVmaXh9XyR7RGF0ZS5ub3coKS50b1N0cmluZygzNil9YDtcbiAgcmV0dXJuIHZhbHVlLnNsaWNlKDAsIFRSQUNFX0lEX0xJTUlUKTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplQWdlbnRJZChyYXcpIHtcbiAgY29uc3QgdmFsdWUgPSBTdHJpbmcocmF3IHx8ICcnKS50cmltKCk7XG4gIGlmICghdmFsdWUpIHJldHVybiAnJztcbiAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1teQS1aYS16MC05Ll8tXS9nLCAnXycpLnNsaWNlKDAsIFRSQUNFX0lEX0xJTUlUKTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplQW5hbHl6ZUVuZHBvaW50KHJhdykge1xuICBjb25zdCB0ZXh0ID0gU3RyaW5nKHJhdyB8fCAnJykudHJpbSgpO1xuICBpZiAoIXRleHQpIHJldHVybiAnJztcbiAgdHJ5IHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHRleHQpO1xuICAgIGlmICghdXJsLnBhdGhuYW1lIHx8IHVybC5wYXRobmFtZSA9PT0gJy8nKSB7XG4gICAgICB1cmwucGF0aG5hbWUgPSAnL2FwaS9haS9hbmFseXplLXNjcmVlbic7XG4gICAgfVxuICAgIHJldHVybiB1cmwudG9TdHJpbmcoKTtcbiAgfSBjYXRjaCAoX2Vycikge1xuICAgIHJldHVybiAnJztcbiAgfVxufVxuXG5mdW5jdGlvbiBib29sQnlEZWZhdWx0KHZhbHVlLCBkZWZhdWx0VmFsdWUpIHtcbiAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHJldHVybiBCb29sZWFuKGRlZmF1bHRWYWx1ZSk7XG4gIHJldHVybiBCb29sZWFuKHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gc2FuaXRpemVEb21Ta2lsbE1lbW9yeUVudHJpZXMocmF3RW50cmllcykge1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICBjb25zdCBieUtleSA9IG5ldyBNYXAoKTtcblxuICBmb3IgKGNvbnN0IHJhdyBvZiBBcnJheS5pc0FycmF5KHJhd0VudHJpZXMpID8gcmF3RW50cmllcyA6IFtdKSB7XG4gICAgaWYgKCFyYXcgfHwgdHlwZW9mIHJhdyAhPT0gJ29iamVjdCcpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGtleSA9IFN0cmluZyhyYXcua2V5IHx8ICcnKS50cmltKCk7XG4gICAgaWYgKCFrZXkpIGNvbnRpbnVlO1xuXG4gICAgY29uc3QgaW50ZW50ID0gU3RyaW5nKHJhdy5pbnRlbnQgfHwgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmICghaW50ZW50KSBjb250aW51ZTtcblxuICAgIGNvbnN0IGxhc3RVc2VkID0gTnVtYmVyKHJhdy5sYXN0VXNlZCB8fCByYXcudXBkYXRlZEF0IHx8IHJhdy5jcmVhdGVkQXQgfHwgMCk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobGFzdFVzZWQpIHx8IGxhc3RVc2VkIDw9IDApIGNvbnRpbnVlO1xuICAgIGlmIChub3cgLSBsYXN0VXNlZCA+IDQ1ICogMjQgKiA2MCAqIDYwICogMTAwMCkgY29udGludWU7XG5cbiAgICBieUtleS5zZXQoa2V5LCB7XG4gICAgICBrZXksXG4gICAgICBpbnRlbnQsXG4gICAgICBob3N0OiBTdHJpbmcocmF3Lmhvc3QgfHwgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpLFxuICAgICAgcGF0aFByZWZpeDogU3RyaW5nKHJhdy5wYXRoUHJlZml4IHx8ICcvJykudHJpbSgpIHx8ICcvJyxcbiAgICAgIHRhcmdldDogU3RyaW5nKHJhdy50YXJnZXQgfHwgJycpLnRyaW0oKSxcbiAgICAgIHN1Y2Nlc3NDb3VudDogTWF0aC5tYXgoMCwgTnVtYmVyKHJhdy5zdWNjZXNzQ291bnQgfHwgMCkpLFxuICAgICAgbGFzdFVzZWQsXG4gICAgICBoaW50czogcmF3LmhpbnRzICYmIHR5cGVvZiByYXcuaGludHMgPT09ICdvYmplY3QnID8gcmF3LmhpbnRzIDoge30sXG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4gQXJyYXkuZnJvbShieUtleS52YWx1ZXMoKSlcbiAgICAuc29ydCgoYSwgYikgPT4gKGIubGFzdFVzZWQgfHwgMCkgLSAoYS5sYXN0VXNlZCB8fCAwKSlcbiAgICAuc2xpY2UoMCwgRE9NX1NLSUxMX01FTU9SWV9NQVgpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXREb21Ta2lsbE1lbW9yeVN1bW1hcnkobGltaXQgPSA4KSB7XG4gIGNvbnN0IHNhZmVMaW1pdCA9IE1hdGgubWF4KDEsIE1hdGgubWluKDIwLCBOdW1iZXIobGltaXQpIHx8IDgpKTtcbiAgY29uc3Qgc3RvcmVkID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFtET01fU0tJTExfTUVNT1JZX0tFWV0pO1xuICBjb25zdCBlbnRyaWVzID0gc2FuaXRpemVEb21Ta2lsbE1lbW9yeUVudHJpZXMoc3RvcmVkPy5bRE9NX1NLSUxMX01FTU9SWV9LRVldKTtcbiAgY29uc3QgYnlJbnRlbnQgPSB7fTtcbiAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG4gICAgYnlJbnRlbnRbZW50cnkuaW50ZW50XSA9IChieUludGVudFtlbnRyeS5pbnRlbnRdIHx8IDApICsgMTtcbiAgfVxuICBjb25zdCByZWNlbnQgPSBlbnRyaWVzLnNsaWNlKDAsIHNhZmVMaW1pdCkubWFwKChlbnRyeSkgPT4gKHtcbiAgICBpbnRlbnQ6IGVudHJ5LmludGVudCxcbiAgICB0YXJnZXQ6IGVudHJ5LnRhcmdldCxcbiAgICBob3N0OiBlbnRyeS5ob3N0LFxuICAgIHBhdGhQcmVmaXg6IGVudHJ5LnBhdGhQcmVmaXgsXG4gICAgc3VjY2Vzc0NvdW50OiBlbnRyeS5zdWNjZXNzQ291bnQsXG4gICAgbGFzdFVzZWQ6IGVudHJ5Lmxhc3RVc2VkLFxuICB9KSk7XG5cbiAgcmV0dXJuIHtcbiAgICBvazogdHJ1ZSxcbiAgICB0b3RhbDogZW50cmllcy5sZW5ndGgsXG4gICAgYnlJbnRlbnQsXG4gICAgcmVjZW50LFxuICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBjbGVhckRvbVNraWxsTWVtb3J5KCkge1xuICBjb25zdCBzdG9yZWQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoW0RPTV9TS0lMTF9NRU1PUllfS0VZXSk7XG4gIGNvbnN0IGVudHJpZXMgPSBzYW5pdGl6ZURvbVNraWxsTWVtb3J5RW50cmllcyhzdG9yZWQ/LltET01fU0tJTExfTUVNT1JZX0tFWV0pO1xuICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBbRE9NX1NLSUxMX01FTU9SWV9LRVldOiBbXSB9KTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIGNsZWFyZWQ6IGVudHJpZXMubGVuZ3RoIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGVuc3VyZVJlbGF5QWdlbnRJZCgpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCBzdG9yZWQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoW1JFTEFZX0FHRU5UX0lEX0tFWV0pO1xuICAgIGNvbnN0IHNhdmVkID0gbm9ybWFsaXplQWdlbnRJZChzdG9yZWQ/LltSRUxBWV9BR0VOVF9JRF9LRVldKTtcbiAgICBpZiAoc2F2ZWQpIHtcbiAgICAgIHJlbGF5QWdlbnRJZENhY2hlID0gc2F2ZWQ7XG4gICAgICByZXR1cm4gc2F2ZWQ7XG4gICAgfVxuICAgIGNvbnN0IGdlbmVyYXRlZCA9IGBhZ2VudF8ke0RhdGUubm93KCkudG9TdHJpbmcoMzYpfV8ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIsIDgpfWA7XG4gICAgcmVsYXlBZ2VudElkQ2FjaGUgPSBnZW5lcmF0ZWQ7XG4gICAgYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgW1JFTEFZX0FHRU5UX0lEX0tFWV06IGdlbmVyYXRlZCB9KTtcbiAgICByZXR1cm4gZ2VuZXJhdGVkO1xuICB9IGNhdGNoIChfZXJyKSB7XG4gICAgY29uc3QgZmFsbGJhY2sgPSBgYWdlbnRfJHtEYXRlLm5vdygpLnRvU3RyaW5nKDM2KX1gO1xuICAgIHJlbGF5QWdlbnRJZENhY2hlID0gZmFsbGJhY2s7XG4gICAgcmV0dXJuIGZhbGxiYWNrO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFJlbGF5U2V0dGluZ3MoKSB7XG4gIGNvbnN0IGtleXMgPSBbXG4gICAgTUFTVEVSX0FDVElWRV9LRVksXG4gICAgVFJBSU5JTkdfQUxMT1dfQUlfU0NSSVBUU19LRVksXG4gICAgVFJBSU5JTkdfTU9ERV9TVE9SQUdFX0tFWSxcbiAgICBSRUxBWV9BR0VOVF9JRF9LRVksXG4gICAgUkVMQVlfRU5EUE9JTlRfS0VZLFxuICAgIFJFTEFZX1dTX1RPS0VOX0tFWSxcbiAgICAnZ29hbCcsXG4gICAgJ2Nvbm5lY3RvclByZXNldCcsXG4gICAgJ2JyYWluUHJvdmlkZXInLFxuICAgICdicmFpbk1vZGVsJ1xuICBdO1xuICBjb25zdCBzdG9yZWQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoa2V5cyk7XG4gIGNvbnN0IGVuZHBvaW50ID0gbm9ybWFsaXplQW5hbHl6ZUVuZHBvaW50KHN0b3JlZD8uW1JFTEFZX0VORFBPSU5UX0tFWV0pIHx8IERFRkFVTFRfQU5BTFlaRV9FTkRQT0lOVDtcbiAgY29uc3QgYWdlbnRJZCA9IG5vcm1hbGl6ZUFnZW50SWQoc3RvcmVkPy5bUkVMQVlfQUdFTlRfSURfS0VZXSkgfHwgYXdhaXQgZW5zdXJlUmVsYXlBZ2VudElkKCk7XG4gIGNvbnN0IG1hc3RlckFjdGl2ZSA9IGJvb2xCeURlZmF1bHQoc3RvcmVkPy5bTUFTVEVSX0FDVElWRV9LRVldLCB0cnVlKTtcbiAgY29uc3QgdHJhaW5pbmdBbGxvd0FpU2NyaXB0cyA9IGJvb2xCeURlZmF1bHQoc3RvcmVkPy5bVFJBSU5JTkdfQUxMT1dfQUlfU0NSSVBUU19LRVldLCBmYWxzZSk7XG4gIGNvbnN0IHRyYWluaW5nTW9kZUVuYWJsZWQgPSBib29sQnlEZWZhdWx0KHN0b3JlZD8uW1RSQUlOSU5HX01PREVfU1RPUkFHRV9LRVldLCBmYWxzZSk7XG4gIGNvbnN0IGNvbm5lY3RvclByZXNldFJhdyA9IFN0cmluZyhzdG9yZWQ/LmNvbm5lY3RvclByZXNldCB8fCAnJykudHJpbSgpO1xuICBjb25zdCBicmFpblByb3ZpZGVyUmF3ID0gU3RyaW5nKHN0b3JlZD8uYnJhaW5Qcm92aWRlciB8fCAnJykudHJpbSgpO1xuICBjb25zdCBicmFpbk1vZGVsUmF3ID0gU3RyaW5nKHN0b3JlZD8uYnJhaW5Nb2RlbCB8fCAnJykudHJpbSgpO1xuICBjb25zdCBjb25uZWN0b3JQcmVzZXQgPSBjb25uZWN0b3JQcmVzZXRSYXcgfHwgREVGQVVMVF9DT05ORUNUT1JfUFJFU0VUO1xuICBjb25zdCBicmFpblByb3ZpZGVyID0gYnJhaW5Qcm92aWRlclJhdyB8fCBERUZBVUxUX0JSQUlOX1BST1ZJREVSO1xuICBjb25zdCBicmFpbk1vZGVsID0gYnJhaW5Nb2RlbFJhdyB8fCBERUZBVUxUX0JSQUlOX01PREVMO1xuXG4gIGNvbnN0IGRlZmF1bHRQYXRjaCA9IHt9O1xuICBpZiAoIWNvbm5lY3RvclByZXNldFJhdykgZGVmYXVsdFBhdGNoLmNvbm5lY3RvclByZXNldCA9IGNvbm5lY3RvclByZXNldDtcbiAgaWYgKCFicmFpblByb3ZpZGVyUmF3KSBkZWZhdWx0UGF0Y2guYnJhaW5Qcm92aWRlciA9IGJyYWluUHJvdmlkZXI7XG4gIGlmICghYnJhaW5Nb2RlbFJhdykgZGVmYXVsdFBhdGNoLmJyYWluTW9kZWwgPSBicmFpbk1vZGVsO1xuICBpZiAoT2JqZWN0LmtleXMoZGVmYXVsdFBhdGNoKS5sZW5ndGggPiAwKSB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KGRlZmF1bHRQYXRjaCkuY2F0Y2goKCkgPT4ge30pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBlbmRwb2ludCxcbiAgICB3c1Rva2VuOiBTdHJpbmcoc3RvcmVkPy5bUkVMQVlfV1NfVE9LRU5fS0VZXSB8fCAnJykudHJpbSgpLFxuICAgIGFnZW50SWQsXG4gICAgbWFzdGVyQWN0aXZlLFxuICAgIHRyYWluaW5nQWxsb3dBaVNjcmlwdHMsXG4gICAgdHJhaW5pbmdNb2RlRW5hYmxlZCxcbiAgICBnb2FsOiBTdHJpbmcoc3RvcmVkPy5nb2FsIHx8ICcnKS50cmltKCksXG4gICAgY29ubmVjdG9yUHJlc2V0LFxuICAgIGJyYWluUHJvdmlkZXIsXG4gICAgYnJhaW5Nb2RlbFxuICB9O1xufVxuXG5mdW5jdGlvbiBidWlsZFdzVXJsRnJvbUVuZHBvaW50KGVuZHBvaW50LCBhZ2VudElkLCB3c1Rva2VuKSB7XG4gIHRyeSB7XG4gICAgY29uc3QgZW5kcG9pbnRVcmwgPSBuZXcgVVJMKGVuZHBvaW50KTtcbiAgICBjb25zdCBwcm90b2NvbCA9IGVuZHBvaW50VXJsLnByb3RvY29sID09PSAnaHR0cHM6JyA/ICd3c3M6JyA6ICd3czonO1xuICAgIGNvbnN0IHdzID0gbmV3IFVSTChgJHtwcm90b2NvbH0vLyR7ZW5kcG9pbnRVcmwuaG9zdH0vd3MvYWdlbnRgKTtcbiAgICBpZiAoYWdlbnRJZCkgd3Muc2VhcmNoUGFyYW1zLnNldCgnYWdlbnRfaWQnLCBhZ2VudElkKTtcbiAgICBpZiAod3NUb2tlbikgd3Muc2VhcmNoUGFyYW1zLnNldCgndG9rZW4nLCB3c1Rva2VuKTtcbiAgICByZXR1cm4gd3MudG9TdHJpbmcoKTtcbiAgfSBjYXRjaCAoX2Vycikge1xuICAgIHJldHVybiAnJztcbiAgfVxufVxuXG5mdW5jdGlvbiBidWlsZFJlbGF5V3NDYW5kaWRhdGVzKHNldHRpbmdzKSB7XG4gIGNvbnN0IGNhbmRpZGF0ZXMgPSBbXTtcbiAgY29uc3QgYWdlbnRJZCA9IG5vcm1hbGl6ZUFnZW50SWQoc2V0dGluZ3M/LmFnZW50SWQgfHwgcmVsYXlBZ2VudElkQ2FjaGUgfHwgJycpO1xuICBjb25zdCB3c1Rva2VuID0gU3RyaW5nKHNldHRpbmdzPy53c1Rva2VuIHx8ICcnKS50cmltKCk7XG5cbiAgY29uc3QgZnJvbUVuZHBvaW50ID0gYnVpbGRXc1VybEZyb21FbmRwb2ludChzZXR0aW5ncz8uZW5kcG9pbnQgfHwgJycsIGFnZW50SWQsIHdzVG9rZW4pO1xuICBpZiAoZnJvbUVuZHBvaW50KSBjYW5kaWRhdGVzLnB1c2goZnJvbUVuZHBvaW50KTtcblxuICBmb3IgKGNvbnN0IHJhdyBvZiBSRUxBWV9XU19GQUxMQkFDS1MpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXJsID0gbmV3IFVSTChyYXcpO1xuICAgICAgaWYgKGFnZW50SWQpIHVybC5zZWFyY2hQYXJhbXMuc2V0KCdhZ2VudF9pZCcsIGFnZW50SWQpO1xuICAgICAgaWYgKHdzVG9rZW4pIHVybC5zZWFyY2hQYXJhbXMuc2V0KCd0b2tlbicsIHdzVG9rZW4pO1xuICAgICAgY2FuZGlkYXRlcy5wdXNoKHVybC50b1N0cmluZygpKTtcbiAgICB9IGNhdGNoIChfZXJyKSB7fVxuICB9XG5cbiAgcmV0dXJuIEFycmF5LmZyb20obmV3IFNldChjYW5kaWRhdGVzKSk7XG59XG5cbmZ1bmN0aW9uIHJlbGF5U2VuZEZyYW1lKGZyYW1lKSB7XG4gIGlmICghcmVsYXlTb2NrZXQgfHwgcmVsYXlTb2NrZXQucmVhZHlTdGF0ZSAhPT0gV2ViU29ja2V0Lk9QRU4pIHJldHVybiBmYWxzZTtcbiAgdHJ5IHtcbiAgICByZWxheVNvY2tldC5zZW5kKEpTT04uc3RyaW5naWZ5KGZyYW1lKSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVsYXlTZW5kSnNvblJwY1Jlc3VsdChpZCwgcmVzdWx0KSB7XG4gIHJlbGF5U2VuZEZyYW1lKHsganNvbnJwYzogJzIuMCcsIGlkLCByZXN1bHQgfSk7XG59XG5cbmZ1bmN0aW9uIHJlbGF5U2VuZEpzb25ScGNFcnJvcihpZCwgZXJyb3JNZXNzYWdlLCBjb2RlID0gLTMyMDAwLCBkZXRhaWxzID0ge30pIHtcbiAgcmVsYXlTZW5kRnJhbWUoe1xuICAgIGpzb25ycGM6ICcyLjAnLFxuICAgIGlkLFxuICAgIGVycm9yOiB7XG4gICAgICBjb2RlLFxuICAgICAgbWVzc2FnZTogU3RyaW5nKGVycm9yTWVzc2FnZSB8fCAnVW5rbm93biBlcnJvcicpLFxuICAgICAgZGF0YTogZGV0YWlsc1xuICAgIH1cbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHNlbmRSZWxheUFjayhhZ2VudElkLCB0cmFjZU1ldGEsIGNvbW1hbmRUeXBlKSB7XG4gIHJlbGF5U2VuZEZyYW1lKHtcbiAgICB0eXBlOiAnYWdlbnQuYWNrJyxcbiAgICBhZ2VudF9pZDogYWdlbnRJZCxcbiAgICBydW5faWQ6IHRyYWNlTWV0YS5ydW5JZCxcbiAgICBjb21tYW5kX2lkOiB0cmFjZU1ldGEuY29tbWFuZElkLFxuICAgIGNvbW1hbmRfdHlwZTogY29tbWFuZFR5cGUsXG4gICAgdGltZXN0YW1wOiBEYXRlLm5vdygpXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBzZW5kUmVsYXlSZXN1bHQoYWdlbnRJZCwgdHJhY2VNZXRhLCBjb21tYW5kVHlwZSwgcmVzdWx0ID0ge30pIHtcbiAgcmVsYXlTZW5kRnJhbWUoe1xuICAgIHR5cGU6ICdhZ2VudC5yZXN1bHQnLFxuICAgIGFnZW50X2lkOiBhZ2VudElkLFxuICAgIHJ1bl9pZDogdHJhY2VNZXRhLnJ1bklkLFxuICAgIGNvbW1hbmRfaWQ6IHRyYWNlTWV0YS5jb21tYW5kSWQsXG4gICAgY29tbWFuZF90eXBlOiBjb21tYW5kVHlwZSxcbiAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgLi4ucmVzdWx0XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBzZW5kUmVsYXlFcnJvcihhZ2VudElkLCB0cmFjZU1ldGEsIGNvbW1hbmRUeXBlLCBlcnJvck1lc3NhZ2UsIHJldHJpYWJsZSA9IGZhbHNlLCBkZXRhaWxzID0ge30pIHtcbiAgcmVsYXlTZW5kRnJhbWUoe1xuICAgIHR5cGU6ICdhZ2VudC5lcnJvcicsXG4gICAgYWdlbnRfaWQ6IGFnZW50SWQsXG4gICAgcnVuX2lkOiB0cmFjZU1ldGEucnVuSWQsXG4gICAgY29tbWFuZF9pZDogdHJhY2VNZXRhLmNvbW1hbmRJZCxcbiAgICBjb21tYW5kX3R5cGU6IGNvbW1hbmRUeXBlLFxuICAgIGVycm9yOiBTdHJpbmcoZXJyb3JNZXNzYWdlIHx8ICdVbmtub3duIGVycm9yJyksXG4gICAgcmV0cmlhYmxlOiBCb29sZWFuKHJldHJpYWJsZSksXG4gICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgIC4uLmRldGFpbHNcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGVtaXRBZ2VudExvZ1RlbGVtZXRyeShlbnRyeSkge1xuICBpZiAoIWVudHJ5IHx8IHR5cGVvZiBlbnRyeSAhPT0gJ29iamVjdCcpIHJldHVybjtcbiAgY29uc3QgcGF5bG9hZCA9IHtcbiAgICBpZDogU3RyaW5nKGVudHJ5LmlkIHx8ICcnKSxcbiAgICBzb3VyY2U6IFN0cmluZyhlbnRyeS5zb3VyY2UgfHwgJycpLFxuICAgIGxldmVsOiBTdHJpbmcoZW50cnkubGV2ZWwgfHwgJ0lORk8nKSxcbiAgICB0ZXh0OiBTdHJpbmcoZW50cnkubWVzc2FnZSB8fCAnJyksXG4gICAgdGltZXN0YW1wOiBlbnRyeS50aW1lc3RhbXAgfHwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgIGRhdGE6IGVudHJ5LmRhdGFcbiAgfTtcbiAgc2FmZVNlbmRSdW50aW1lTWVzc2FnZSh7IHR5cGU6ICdBR0VOVF9MT0cnLCBwYXlsb2FkIH0pO1xuICByZWxheVNlbmRGcmFtZSh7XG4gICAgdHlwZTogJ0FHRU5UX0xPRycsXG4gICAgYWdlbnRfaWQ6IHJlbGF5QWdlbnRJZENhY2hlIHx8ICcnLFxuICAgIHBheWxvYWRcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGVtaXRFeGVjdXRpb25Qcm9ncmVzc1RlbGVtZXRyeShwYXlsb2FkKSB7XG4gIGlmICghcGF5bG9hZCB8fCB0eXBlb2YgcGF5bG9hZCAhPT0gJ29iamVjdCcpIHJldHVybjtcbiAgcmVsYXlTZW5kRnJhbWUoe1xuICAgIHR5cGU6ICdFWEVDVVRJT05fUFJPR1JFU1MnLFxuICAgIGFnZW50X2lkOiByZWxheUFnZW50SWRDYWNoZSB8fCAnJyxcbiAgICBwYXlsb2FkOiB7XG4gICAgICAuLi5wYXlsb2FkLFxuICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpXG4gICAgfVxuICB9KTtcbn1cblxuZnVuY3Rpb24gc3RvcFJlbGF5SGVhcnRiZWF0KCkge1xuICBpZiAocmVsYXlIZWFydGJlYXRUaW1lcikge1xuICAgIGNsZWFySW50ZXJ2YWwocmVsYXlIZWFydGJlYXRUaW1lcik7XG4gICAgcmVsYXlIZWFydGJlYXRUaW1lciA9IG51bGw7XG4gIH1cbn1cblxuZnVuY3Rpb24gc3RhcnRSZWxheUhlYXJ0YmVhdChhZ2VudElkLCB3c1JlZikge1xuICBzdG9wUmVsYXlIZWFydGJlYXQoKTtcbiAgcmVsYXlIZWFydGJlYXRUaW1lciA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICBpZiAoIXdzUmVmIHx8IHdzUmVmLnJlYWR5U3RhdGUgIT09IFdlYlNvY2tldC5PUEVOIHx8IHJlbGF5U29ja2V0ICE9PSB3c1JlZikgcmV0dXJuO1xuICAgIHJlbGF5U2VuZEZyYW1lKHtcbiAgICAgIHR5cGU6ICdhZ2VudC5oZWFydGJlYXQnLFxuICAgICAgYWdlbnRfaWQ6IGFnZW50SWQsXG4gICAgICB0aW1lc3RhbXA6IERhdGUubm93KClcbiAgICB9KTtcbiAgfSwgUkVMQVlfSEVBUlRCRUFUX0lOVEVSVkFMX01TKTtcbn1cblxuZnVuY3Rpb24gY2xlYXJSZWxheVJlY29ubmVjdFRpbWVyKCkge1xuICBpZiAocmVsYXlSZWNvbm5lY3RUaW1lcikge1xuICAgIGNsZWFyVGltZW91dChyZWxheVJlY29ubmVjdFRpbWVyKTtcbiAgICByZWxheVJlY29ubmVjdFRpbWVyID0gbnVsbDtcbiAgfVxufVxuXG5mdW5jdGlvbiBzY2hlZHVsZVJlbGF5UmVjb25uZWN0KCkge1xuICBjbGVhclJlbGF5UmVjb25uZWN0VGltZXIoKTtcbiAgY29uc3QgZGVsYXkgPSBNYXRoLm1pbihcbiAgICBSRUxBWV9SRUNPTk5FQ1RfTUFYX01TLFxuICAgIFJFTEFZX1JFQ09OTkVDVF9CQVNFX01TICogTWF0aC5tYXgoMSwgMiAqKiBNYXRoLm1pbig2LCByZWxheVJlY29ubmVjdEF0dGVtcHRzKSlcbiAgKTtcbiAgcmVsYXlSZWNvbm5lY3RBdHRlbXB0cyArPSAxO1xuICByZWxheVJlY29ubmVjdFRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgcmVsYXlSZWNvbm5lY3RUaW1lciA9IG51bGw7XG4gICAgY29ubmVjdFJlbGF5KCkuY2F0Y2goKGVycikgPT4ge1xuICAgICAgYmdMb2dnZXIud2FybignUmVsYXkgcmVjb25uZWN0IGZhaWxlZCcsIHsgZXJyb3I6IHRvRXJyb3JNZXNzYWdlKGVycikgfSk7XG4gICAgICBzY2hlZHVsZVJlbGF5UmVjb25uZWN0KCk7XG4gICAgfSk7XG4gIH0sIGRlbGF5KTtcbn1cblxuZnVuY3Rpb24gZ2V0UmVsYXlTdGF0dXMoKSB7XG4gIHJldHVybiB7XG4gICAgY29ubmVjdGVkOiBCb29sZWFuKHJlbGF5U29ja2V0ICYmIHJlbGF5U29ja2V0LnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOKSxcbiAgICBjb25uZWN0aW5nOiBCb29sZWFuKHJlbGF5Q29ubmVjdEluRmxpZ2h0KSB8fCBCb29sZWFuKHJlbGF5U29ja2V0ICYmIHJlbGF5U29ja2V0LnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5DT05ORUNUSU5HKSxcbiAgICB3c1VybDogcmVsYXlMYXN0VXJsLFxuICAgIHJlYWR5U3RhdGU6IHJlbGF5U29ja2V0ID8gcmVsYXlTb2NrZXQucmVhZHlTdGF0ZSA6IFdlYlNvY2tldC5DTE9TRUQsXG4gICAgcmVjb25uZWN0QXR0ZW1wdHM6IHJlbGF5UmVjb25uZWN0QXR0ZW1wdHMsXG4gICAgYWdlbnRJZDogcmVsYXlBZ2VudElkQ2FjaGUgfHwgJydcbiAgfTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplUmVsYXlDb21tYW5kVHlwZShyYXcpIHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IFN0cmluZyhyYXcgfHwgJycpXG4gICAgLnRyaW0oKVxuICAgIC50b1VwcGVyQ2FzZSgpXG4gICAgLnJlcGxhY2UoL1suXFwtL1xcc10rL2csICdfJyk7XG4gIGlmICghbm9ybWFsaXplZCkgcmV0dXJuICcnO1xuICBpZiAoWydDQVBUVVJFX1NDUkVFTicsICdDQVBUVVJFJywgJ1NDUkVFTlNIT1QnLCAnVEFLRV9TQ1JFRU5TSE9UJ10uaW5jbHVkZXMobm9ybWFsaXplZCkpIHtcbiAgICByZXR1cm4gJ0NBUFRVUkVfU0NSRUVOJztcbiAgfVxuICBpZiAoWydFWEVDVVRFX0FDVElPTlMnLCAnRVhFQ1VURV9BQ1RJT04nLCAnUlVOX0FDVElPTlMnLCAnRVhFQ1VURV9CQVRDSF9BQ1RJT05TJ10uaW5jbHVkZXMobm9ybWFsaXplZCkpIHtcbiAgICByZXR1cm4gJ0VYRUNVVEVfQUNUSU9OUyc7XG4gIH1cbiAgaWYgKFsnQVBQTFlfUFJFU0VUUycsICdBUFBMWV9QUkVTRVQnLCAnU0VUX1BSRVNFVFMnLCAnVVBEQVRFX1BSRVNFVFMnXS5pbmNsdWRlcyhub3JtYWxpemVkKSkge1xuICAgIHJldHVybiAnQVBQTFlfUFJFU0VUUyc7XG4gIH1cbiAgaWYgKFsnVFJBSU5JTkdfUFJPQkUnLCAnUlVOX1RSQUlOSU5HX1BST0JFJywgJ1BST0JFJ10uaW5jbHVkZXMobm9ybWFsaXplZCkpIHtcbiAgICByZXR1cm4gJ1RSQUlOSU5HX1BST0JFJztcbiAgfVxuICBpZiAoWydOQVRVUkFMX0NPTU1BTkQnLCAnTkxfQ09NTUFORCcsICdFWEVDVVRFX05BVFVSQUwnLCAnQ09SVEVYX0NPTU1BTkQnXS5pbmNsdWRlcyhub3JtYWxpemVkKSkge1xuICAgIHJldHVybiAnTkFUVVJBTF9DT01NQU5EJztcbiAgfVxuICBpZiAoWydTRUxGX0lNUFJPVkUnLCAnU0VMRl9JTVBST1ZFTUVOVCcsICdTRUxGX0hFQUwnLCAnU0VMRl9IRUFMSU5HJywgJ01BSU5URU5BTkNFX0NPT1JESU5BVE9SJ10uaW5jbHVkZXMobm9ybWFsaXplZCkpIHtcbiAgICByZXR1cm4gJ1NFTEZfSU1QUk9WRSc7XG4gIH1cbiAgcmV0dXJuICcnO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVCcmFpblBlcnNvbmEocmF3KSB7XG4gIGNvbnN0IHZhbHVlID0gU3RyaW5nKHJhdyB8fCAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gIGlmICghdmFsdWUpIHJldHVybiAnYmlsZ2VfYWdlbnQnO1xuICBpZiAodmFsdWUgPT09ICdiaWxnZV93ZWInIHx8IHZhbHVlID09PSAnd2ViJyB8fCB2YWx1ZSA9PT0gJ2FwcCcpIHJldHVybiAnYmlsZ2Vfd2ViJztcbiAgcmV0dXJuICdiaWxnZV9hZ2VudCc7XG59XG5cbmZ1bmN0aW9uIGlzU2VsZkltcHJvdmVtZW50TmF0dXJhbENvbW1hbmQocmF3Q29tbWFuZCkge1xuICBjb25zdCB0ZXh0ID0gU3RyaW5nKHJhd0NvbW1hbmQgfHwgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICBpZiAoIXRleHQpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIFNFTEZfSU1QUk9WRU1FTlRfQ09NTUFORF9SRS50ZXN0KHRleHQpO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVWYWxpZGF0aW9uUHJvdmlkZXIocmF3KSB7XG4gIGNvbnN0IHZhbHVlID0gU3RyaW5nKHJhdyB8fCAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gIGlmICghdmFsdWUpIHJldHVybiAnJztcbiAgaWYgKHZhbHVlID09PSAnY2hhdGdwdCcpIHJldHVybiAnb3BlbmFpJztcbiAgaWYgKHZhbHVlID09PSAnZ29vZ2xlJykgcmV0dXJuICdnZW1pbmknO1xuICBpZiAodmFsdWUgPT09ICdkcycpIHJldHVybiAnZGVlcHNlZWsnO1xuICByZXR1cm4gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVTZWxmSGVhbGluZ1ZhbGlkYXRpb25Nb2RlKHBheWxvYWQgPSB7fSwgc2V0dGluZ3MgPSB7fSkge1xuICBjb25zdCByZXF1ZXN0ZWRQcm92aWRlciA9IG5vcm1hbGl6ZVZhbGlkYXRpb25Qcm92aWRlcihcbiAgICBwYXlsb2FkLnZhbGlkYXRpb25Qcm92aWRlciB8fCBwYXlsb2FkLnByb3ZpZGVyXG4gICk7XG4gIGNvbnN0IHJlcXVlc3RlZE1vZGVsID0gU3RyaW5nKHBheWxvYWQudmFsaWRhdGlvbk1vZGVsIHx8IHBheWxvYWQubW9kZWwgfHwgJycpLnRyaW0oKTtcblxuICBpZiAocmVxdWVzdGVkUHJvdmlkZXIgPT09ICdvcGVuYWknKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHJlY29tbWVuZGVkUHJvdmlkZXI6ICdvcGVuYWknLFxuICAgICAgcmVjb21tZW5kZWRNb2RlbDogcmVxdWVzdGVkTW9kZWwgfHwgU0VMRl9IRUFMX0RFRkFVTFRfVkFMSURBVElPTi5tb2RlbCxcbiAgICAgIGZhbGxiYWNrUHJvdmlkZXI6IFNFTEZfSEVBTF9ERUZBVUxUX1ZBTElEQVRJT04uZmFsbGJhY2tQcm92aWRlcixcbiAgICAgIGZhbGxiYWNrTW9kZWw6IFNFTEZfSEVBTF9ERUZBVUxUX1ZBTElEQVRJT04uZmFsbGJhY2tNb2RlbCxcbiAgICAgIG5vdGU6ICdPcGVuQUkgaXMgcHJlZmVycmVkIGZvciBzdHJpY3QgbXVsdGltb2RhbCBzZWxmLWhlYWxpbmcgdmFsaWRhdGlvbi4nXG4gICAgfTtcbiAgfVxuICBpZiAocmVxdWVzdGVkUHJvdmlkZXIgPT09ICdkZWVwc2VlaycpIHtcbiAgICByZXR1cm4ge1xuICAgICAgcmVjb21tZW5kZWRQcm92aWRlcjogJ2RlZXBzZWVrJyxcbiAgICAgIHJlY29tbWVuZGVkTW9kZWw6IHJlcXVlc3RlZE1vZGVsIHx8IFNFTEZfSEVBTF9ERUZBVUxUX1ZBTElEQVRJT04uZmFsbGJhY2tNb2RlbCxcbiAgICAgIGZhbGxiYWNrUHJvdmlkZXI6IFNFTEZfSEVBTF9ERUZBVUxUX1ZBTElEQVRJT04ucHJvdmlkZXIsXG4gICAgICBmYWxsYmFja01vZGVsOiBTRUxGX0hFQUxfREVGQVVMVF9WQUxJREFUSU9OLm1vZGVsLFxuICAgICAgbm90ZTogJ0RlZXBTZWVrIHN1cHBvcnRzIHZpc2lvbiBpbiBCaWxnZSwgYnV0IE9wZW5BSSByZW1haW5zIHRoZSBzdHJpY3RlciB2YWxpZGF0aW9uIGZhbGxiYWNrLidcbiAgICB9O1xuICB9XG4gIGlmIChyZXF1ZXN0ZWRQcm92aWRlciA9PT0gJ2dlbWluaScpIHtcbiAgICByZXR1cm4ge1xuICAgICAgcmVjb21tZW5kZWRQcm92aWRlcjogJ2dlbWluaScsXG4gICAgICByZWNvbW1lbmRlZE1vZGVsOiByZXF1ZXN0ZWRNb2RlbCB8fCAnZ2VtaW5pLTIuMC1mbGFzaCcsXG4gICAgICBmYWxsYmFja1Byb3ZpZGVyOiBTRUxGX0hFQUxfREVGQVVMVF9WQUxJREFUSU9OLnByb3ZpZGVyLFxuICAgICAgZmFsbGJhY2tNb2RlbDogU0VMRl9IRUFMX0RFRkFVTFRfVkFMSURBVElPTi5tb2RlbCxcbiAgICAgIG5vdGU6ICdHZW1pbmkgc2VsZWN0ZWQgZXhwbGljaXRseSBmb3IgdmFsaWRhdGlvbiBtb2RlLidcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgY29uZmlndXJlZFByb3ZpZGVyID0gbm9ybWFsaXplVmFsaWRhdGlvblByb3ZpZGVyKHNldHRpbmdzLmJyYWluUHJvdmlkZXIpO1xuICBjb25zdCBjb25maWd1cmVkTW9kZWwgPSBTdHJpbmcoc2V0dGluZ3MuYnJhaW5Nb2RlbCB8fCAnJykudHJpbSgpO1xuICBpZiAoY29uZmlndXJlZFByb3ZpZGVyID09PSAnb3BlbmFpJyAmJiBjb25maWd1cmVkTW9kZWwpIHtcbiAgICByZXR1cm4ge1xuICAgICAgcmVjb21tZW5kZWRQcm92aWRlcjogJ29wZW5haScsXG4gICAgICByZWNvbW1lbmRlZE1vZGVsOiBjb25maWd1cmVkTW9kZWwsXG4gICAgICBmYWxsYmFja1Byb3ZpZGVyOiBTRUxGX0hFQUxfREVGQVVMVF9WQUxJREFUSU9OLmZhbGxiYWNrUHJvdmlkZXIsXG4gICAgICBmYWxsYmFja01vZGVsOiBTRUxGX0hFQUxfREVGQVVMVF9WQUxJREFUSU9OLmZhbGxiYWNrTW9kZWwsXG4gICAgICBub3RlOiAnVXNpbmcgY3VycmVudCBPcGVuQUkgY29ubmVjdG9yIGNvbmZpZ3VyYXRpb24gZm9yIHZhbGlkYXRpb24gbW9kZS4nXG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgcmVjb21tZW5kZWRQcm92aWRlcjogU0VMRl9IRUFMX0RFRkFVTFRfVkFMSURBVElPTi5wcm92aWRlcixcbiAgICByZWNvbW1lbmRlZE1vZGVsOiBTRUxGX0hFQUxfREVGQVVMVF9WQUxJREFUSU9OLm1vZGVsLFxuICAgIGZhbGxiYWNrUHJvdmlkZXI6IFNFTEZfSEVBTF9ERUZBVUxUX1ZBTElEQVRJT04uZmFsbGJhY2tQcm92aWRlcixcbiAgICBmYWxsYmFja01vZGVsOiBTRUxGX0hFQUxfREVGQVVMVF9WQUxJREFUSU9OLmZhbGxiYWNrTW9kZWwsXG4gICAgbm90ZTogJ0RlZXBTZWVrIGhhcyB2aXNpb24gaW4gdGhpcyBydW50aW1lOyBPcGVuQUkgZ3B0LTRvIGlzIHN0aWxsIGRlZmF1bHQgZm9yIHN0cmljdCBtdWx0aW1vZGFsIHNlbGYtaGVhbGluZyB2YWxpZGF0aW9uLidcbiAgfTtcbn1cblxuZnVuY3Rpb24gYnVpbGRTZWxmQXdhcmVuZXNzQ29tcG9uZW50cyhzZXR0aW5ncywgcmVsYXlTdGF0dXMsIGFwcFNldHRpbmdzLCBjb250ZW50UmVhY2hhYmxlLCB0YWIpIHtcbiAgY29uc3QgcnVudGltZU1jcEJhc2UgPSBTdHJpbmcoYXBwU2V0dGluZ3M/Lm1jcEJhc2VVcmwgfHwgJycpLnRyaW0oKSB8fCAnaHR0cHM6Ly9tY3AuY2FyYXZhbmZsb3cuY29tJztcbiAgcmV0dXJuIFtcbiAgICB7XG4gICAgICBpZDogJ2JpbGdlX2FnZW50X3J1bnRpbWUnLFxuICAgICAgcm9sZTogJ1ByaW1hcnkgQmlsZ2UgQWdlbnQgcnVudGltZSBpbiBDaHJvbWUgZXh0ZW5zaW9uIHNlcnZpY2Ugd29ya2VyJyxcbiAgICAgIHN0YXR1czogJ2FjdGl2ZScsXG4gICAgICBkZXRhaWxzOiBgYWdlbnRJZD0ke3JlbGF5U3RhdHVzLmFnZW50SWQgfHwgJyd9YFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6ICdiaWxnZV93ZWJfcGVyc29uYScsXG4gICAgICByb2xlOiAnQmlsZ2UgV2ViIGNoYXQgcGVyc29uYSAoc2VwYXJhdGUgaWRlbnRpdHkgYm91bmRhcnkpJyxcbiAgICAgIHN0YXR1czogJ2lzb2xhdGVkJyxcbiAgICAgIGRldGFpbHM6ICdEbyBub3QgbWVyZ2UgYmlsZ2VfYWdlbnQgYW5kIGJpbGdlX3dlYiBwZXJzb25hcy4nXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogJ21jcF9icmlkZ2UnLFxuICAgICAgcm9sZTogJ01DUCB0b29sIGJyaWRnZSBiZXR3ZWVuIFVJIGFuZCBleHRlbnNpb24gcnVudGltZScsXG4gICAgICBzdGF0dXM6ICdhY3RpdmUnLFxuICAgICAgZGV0YWlsczogcnVudGltZU1jcEJhc2VcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiAncmVsYXlfdHJhbnNwb3J0JyxcbiAgICAgIHJvbGU6ICdXZWJTb2NrZXQgcmVsYXkgZm9yIGFnZW50IG9yY2hlc3RyYXRpb24nLFxuICAgICAgc3RhdHVzOiByZWxheVN0YXR1cy5jb25uZWN0ZWQgPyAnY29ubmVjdGVkJyA6ICdkaXNjb25uZWN0ZWQnLFxuICAgICAgZGV0YWlsczogcmVsYXlTdGF0dXMud3NVcmwgfHwgJyhub3QgY29ubmVjdGVkKSdcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiAnY29udGVudF9ydW50aW1lJyxcbiAgICAgIHJvbGU6ICdDb250ZW50IHNjcmlwdCBET00gcnVudGltZSBvbiB0aGUgYWN0aXZlIHRhYicsXG4gICAgICBzdGF0dXM6IGNvbnRlbnRSZWFjaGFibGUgPyAncmVhY2hhYmxlJyA6ICd1bnJlYWNoYWJsZScsXG4gICAgICBkZXRhaWxzOiB0YWI/LnVybCA/IFN0cmluZyh0YWIudXJsKSA6ICdObyBhY3RpdmUgdGFiJ1xuICAgIH0sXG4gICAge1xuICAgICAgaWQ6ICdjb3J0ZXhfcGFyc2VyJyxcbiAgICAgIHJvbGU6ICdOYXR1cmFsLWxhbmd1YWdlIHBhcnNlciBhbmQgYWN0aW9uIHBsYW5uZXIgKEJpbGdlQ29ydGV4KScsXG4gICAgICBzdGF0dXM6ICdhY3RpdmUnLFxuICAgICAgZGV0YWlsczogJ1N1cHBvcnRzIHBhcnNlL3Jld3JpdGUvcmVjb3ZlcnkgcGF0aHMgZm9yIG5hdHVyYWwgY29tbWFuZHMuJ1xuICAgIH0sXG4gICAge1xuICAgICAgaWQ6ICdhbmFseXplX2VuZHBvaW50JyxcbiAgICAgIHJvbGU6ICdWaXNpb24vYW5hbHl6ZSBlbmRwb2ludCBmb3IgcHJvYmUgd29ya2Zsb3dzJyxcbiAgICAgIHN0YXR1czogc2V0dGluZ3MuZW5kcG9pbnQgPyAnY29uZmlndXJlZCcgOiAnZGVmYXVsdCcsXG4gICAgICBkZXRhaWxzOiBzZXR0aW5ncy5lbmRwb2ludCB8fCBERUZBVUxUX0FOQUxZWkVfRU5EUE9JTlRcbiAgICB9XG4gIF07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEJpbGdlQXBwU2V0dGluZ3NTbmFwc2hvdCgpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCBzdG9yZWQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoWydiaWxnZV9hcHBfc2V0dGluZ3MnXSk7XG4gICAgY29uc3QgcGF5bG9hZCA9IHN0b3JlZD8uYmlsZ2VfYXBwX3NldHRpbmdzO1xuICAgIGlmIChwYXlsb2FkICYmIHR5cGVvZiBwYXlsb2FkID09PSAnb2JqZWN0JykgcmV0dXJuIHBheWxvYWQ7XG4gIH0gY2F0Y2ggKF9lcnIpIHt9XG4gIHJldHVybiB7fTtcbn1cblxuZnVuY3Rpb24gcGFyc2VJbmNvbWluZ1JlbGF5Q29tbWFuZChkYXRhKSB7XG4gIGlmICghZGF0YSB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHJhd1R5cGUgPSBTdHJpbmcoZGF0YS50eXBlIHx8ICcnKTtcbiAgY29uc3QgcmF3TWV0aG9kID0gU3RyaW5nKGRhdGEubWV0aG9kIHx8ICcnKTtcbiAgY29uc3QgaXNKc29uUnBjID0gZGF0YS5qc29ucnBjID09PSAnMi4wJztcbiAgY29uc3QgaXNUb29sQ2FsbCA9IHJhd01ldGhvZCA9PT0gJ3Rvb2xzL2NhbGwnIHx8IHJhd1R5cGUudG9VcHBlckNhc2UoKSA9PT0gJ01DUC5UT09MX0NBTEwnO1xuICBjb25zdCBycGNJZCA9IGlzSnNvblJwYyA/IGRhdGEuaWQgOiBudWxsO1xuXG4gIGxldCBjb21tYW5kVHlwZSA9ICcnO1xuICBsZXQgcGF5bG9hZCA9IHt9O1xuXG4gIGlmIChpc1Rvb2xDYWxsKSB7XG4gICAgY29uc3QgdG9vbE5hbWUgPSBkYXRhLnBhcmFtcz8ubmFtZSB8fCBkYXRhLm5hbWUgfHwgJyc7XG4gICAgY29tbWFuZFR5cGUgPSBub3JtYWxpemVSZWxheUNvbW1hbmRUeXBlKHRvb2xOYW1lKTtcbiAgICBwYXlsb2FkID0gZGF0YS5wYXJhbXM/LmFyZ3VtZW50cyB8fCBkYXRhLmFyZ3VtZW50cyB8fCB7fTtcbiAgfSBlbHNlIGlmIChpc0pzb25ScGMpIHtcbiAgICBjb21tYW5kVHlwZSA9IG5vcm1hbGl6ZVJlbGF5Q29tbWFuZFR5cGUocmF3TWV0aG9kKTtcbiAgICBwYXlsb2FkID0gZGF0YS5wYXJhbXMgfHwge307XG4gIH0gZWxzZSB7XG4gICAgY29tbWFuZFR5cGUgPSBub3JtYWxpemVSZWxheUNvbW1hbmRUeXBlKHJhd1R5cGUgfHwgZGF0YS5jb21tYW5kIHx8IGRhdGEua2luZCk7XG4gICAgcGF5bG9hZCA9IGRhdGEucGF5bG9hZCAmJiB0eXBlb2YgZGF0YS5wYXlsb2FkID09PSAnb2JqZWN0JyA/IGRhdGEucGF5bG9hZCA6IGRhdGE7XG4gIH1cblxuICBpZiAoIWNvbW1hbmRUeXBlKSByZXR1cm4gbnVsbDtcbiAgaWYgKCFwYXlsb2FkIHx8IHR5cGVvZiBwYXlsb2FkICE9PSAnb2JqZWN0JykgcGF5bG9hZCA9IHt9O1xuXG4gIGNvbnN0IHRyYWNlTWV0YSA9IHtcbiAgICBydW5JZDogc2FuaXRpemVUcmFjZUlkKFxuICAgICAgcGF5bG9hZC5ydW5faWQgfHwgcGF5bG9hZC5ydW5JZCB8fCBkYXRhLnJ1bl9pZCB8fCBkYXRhLnJ1bklkLFxuICAgICAgJ3J1bidcbiAgICApLFxuICAgIGNvbW1hbmRJZDogc2FuaXRpemVUcmFjZUlkKFxuICAgICAgcGF5bG9hZC5jb21tYW5kX2lkIHx8IHBheWxvYWQuY29tbWFuZElkIHx8IGRhdGEuY29tbWFuZF9pZCB8fCBkYXRhLmNvbW1hbmRJZCB8fCBkYXRhLmlkLFxuICAgICAgJ2NtZCdcbiAgICApXG4gIH07XG5cbiAgY29uc3QgYWdlbnRJZCA9IG5vcm1hbGl6ZUFnZW50SWQoXG4gICAgcGF5bG9hZC5hZ2VudF9pZCB8fCBwYXlsb2FkLmFnZW50SWQgfHwgZGF0YS5hZ2VudF9pZCB8fCBkYXRhLmFnZW50SWQgfHwgJydcbiAgKTtcblxuICByZXR1cm4ge1xuICAgIHR5cGU6IGNvbW1hbmRUeXBlLFxuICAgIHBheWxvYWQsXG4gICAgdHJhY2VNZXRhLFxuICAgIGFnZW50SWQsXG4gICAgaXNKc29uUnBjLFxuICAgIHJwY0lkXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNvZXJjZUJvb2xlYW4odmFsdWUsIGZhbGxiYWNrID0gZmFsc2UpIHtcbiAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHJldHVybiBCb29sZWFuKGZhbGxiYWNrKTtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4gdmFsdWU7XG4gIGNvbnN0IHRleHQgPSBTdHJpbmcodmFsdWUpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICBpZiAoIXRleHQpIHJldHVybiBCb29sZWFuKGZhbGxiYWNrKTtcbiAgaWYgKFsnMScsICd0cnVlJywgJ3llcycsICdvbiddLmluY2x1ZGVzKHRleHQpKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKFsnMCcsICdmYWxzZScsICdubycsICdvZmYnXS5pbmNsdWRlcyh0ZXh0KSkgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gQm9vbGVhbihmYWxsYmFjayk7XG59XG5cbmZ1bmN0aW9uIHNhbml0aXplUHJlc2V0UGF0Y2gocmF3UHJlc2V0cyA9IHt9KSB7XG4gIGNvbnN0IHNvdXJjZSA9IHJhd1ByZXNldHMgJiYgdHlwZW9mIHJhd1ByZXNldHMgPT09ICdvYmplY3QnID8gcmF3UHJlc2V0cyA6IHt9O1xuICBjb25zdCBhbGlhc01hcCA9IHtcbiAgICBjdXJyZW50X2dvYWw6ICdnb2FsJyxcbiAgICBhbmFseXNpc19lbmRwb2ludDogUkVMQVlfRU5EUE9JTlRfS0VZLFxuICAgIGVuZHBvaW50OiBSRUxBWV9FTkRQT0lOVF9LRVksXG4gICAgYWdlbnRfaWQ6IFJFTEFZX0FHRU5UX0lEX0tFWSxcbiAgICBhZ2VudElkOiBSRUxBWV9BR0VOVF9JRF9LRVksXG4gICAgbWFzdGVyX2FjdGl2ZTogTUFTVEVSX0FDVElWRV9LRVksXG4gICAgbWFzdGVyQWN0aXZlOiBNQVNURVJfQUNUSVZFX0tFWSxcbiAgICB0cmFpbmluZ19hbGxvd19haV9zY3JpcHRzOiBUUkFJTklOR19BTExPV19BSV9TQ1JJUFRTX0tFWSxcbiAgICB0cmFpbmluZ0FsbG93QWlTY3JpcHRzOiBUUkFJTklOR19BTExPV19BSV9TQ1JJUFRTX0tFWSxcbiAgICBjb25uZWN0b3JfcHJlc2V0OiAnY29ubmVjdG9yUHJlc2V0JyxcbiAgICBjb25uZWN0b3JQcmVzZXQ6ICdjb25uZWN0b3JQcmVzZXQnLFxuICAgIHByb3ZpZGVyOiAnYnJhaW5Qcm92aWRlcicsXG4gICAgYnJhaW5fcHJvdmlkZXI6ICdicmFpblByb3ZpZGVyJyxcbiAgICBicmFpblByb3ZpZGVyOiAnYnJhaW5Qcm92aWRlcicsXG4gICAgbW9kZWw6ICdicmFpbk1vZGVsJyxcbiAgICBicmFpbl9tb2RlbDogJ2JyYWluTW9kZWwnLFxuICAgIGJyYWluTW9kZWw6ICdicmFpbk1vZGVsJyxcbiAgICB3c190b2tlbjogUkVMQVlfV1NfVE9LRU5fS0VZLFxuICAgIHdzVG9rZW46IFJFTEFZX1dTX1RPS0VOX0tFWVxuICB9O1xuXG4gIGNvbnN0IGFsbG93ZWQgPSBuZXcgU2V0KFtcbiAgICAnZ29hbCcsXG4gICAgUkVMQVlfRU5EUE9JTlRfS0VZLFxuICAgIFJFTEFZX0FHRU5UX0lEX0tFWSxcbiAgICBNQVNURVJfQUNUSVZFX0tFWSxcbiAgICBUUkFJTklOR19BTExPV19BSV9TQ1JJUFRTX0tFWSxcbiAgICAnY29ubmVjdG9yUHJlc2V0JyxcbiAgICAnYnJhaW5Qcm92aWRlcicsXG4gICAgJ2JyYWluTW9kZWwnLFxuICAgIFJFTEFZX1dTX1RPS0VOX0tFWVxuICBdKTtcblxuICBjb25zdCBwYXRjaCA9IHt9O1xuICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhzb3VyY2UpKSB7XG4gICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIGNvbnRpbnVlO1xuICAgIGNvbnN0IG1hcHBlZCA9IGFsaWFzTWFwW2tleV0gfHwga2V5O1xuICAgIGlmICghYWxsb3dlZC5oYXMobWFwcGVkKSkgY29udGludWU7XG5cbiAgICBpZiAobWFwcGVkID09PSBNQVNURVJfQUNUSVZFX0tFWSB8fCBtYXBwZWQgPT09IFRSQUlOSU5HX0FMTE9XX0FJX1NDUklQVFNfS0VZKSB7XG4gICAgICBwYXRjaFttYXBwZWRdID0gY29lcmNlQm9vbGVhbih2YWx1ZSwgZmFsc2UpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChtYXBwZWQgPT09IFJFTEFZX0FHRU5UX0lEX0tFWSkge1xuICAgICAgY29uc3QgYWdlbnRJZCA9IG5vcm1hbGl6ZUFnZW50SWQodmFsdWUpO1xuICAgICAgaWYgKGFnZW50SWQpIHBhdGNoW21hcHBlZF0gPSBhZ2VudElkO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChtYXBwZWQgPT09IFJFTEFZX0VORFBPSU5UX0tFWSkge1xuICAgICAgY29uc3QgZW5kcG9pbnQgPSBub3JtYWxpemVBbmFseXplRW5kcG9pbnQodmFsdWUpO1xuICAgICAgaWYgKGVuZHBvaW50KSBwYXRjaFttYXBwZWRdID0gZW5kcG9pbnQ7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBwYXRjaFttYXBwZWRdID0gU3RyaW5nKHZhbHVlKTtcbiAgfVxuXG4gIHJldHVybiBwYXRjaDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gYXBwbHlSZWxheVByZXNldHMocmF3UHJlc2V0cyA9IHt9KSB7XG4gIGNvbnN0IHBhdGNoID0gc2FuaXRpemVQcmVzZXRQYXRjaChyYXdQcmVzZXRzKTtcbiAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHBhdGNoKTtcbiAgaWYgKGtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHsgb2s6IHRydWUsIGFwcGxpZWQ6IGZhbHNlLCBjaGFuZ2VkS2V5czogW10gfTtcbiAgfVxuXG4gIGNvbnN0IGN1cnJlbnQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoa2V5cyk7XG4gIGNvbnN0IGNoYW5nZWRLZXlzID0ga2V5cy5maWx0ZXIoKGtleSkgPT4gSlNPTi5zdHJpbmdpZnkoY3VycmVudFtrZXldKSAhPT0gSlNPTi5zdHJpbmdpZnkocGF0Y2hba2V5XSkpO1xuICBpZiAoY2hhbmdlZEtleXMubGVuZ3RoID4gMCkge1xuICAgIGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldChwYXRjaCk7XG4gIH1cblxuICBpZiAocGF0Y2hbUkVMQVlfQUdFTlRfSURfS0VZXSkge1xuICAgIHJlbGF5QWdlbnRJZENhY2hlID0gcGF0Y2hbUkVMQVlfQUdFTlRfSURfS0VZXTtcbiAgfVxuXG4gIGNvbnN0IHJlcXVpcmVzUmVjb25uZWN0ID0gY2hhbmdlZEtleXMuc29tZSgoa2V5KSA9PlxuICAgIFtSRUxBWV9FTkRQT0lOVF9LRVksIFJFTEFZX0FHRU5UX0lEX0tFWSwgUkVMQVlfV1NfVE9LRU5fS0VZLCBNQVNURVJfQUNUSVZFX0tFWV0uaW5jbHVkZXMoa2V5KVxuICApO1xuICBpZiAocmVxdWlyZXNSZWNvbm5lY3QpIHtcbiAgICBhd2FpdCBjb25uZWN0UmVsYXkoKS5jYXRjaCgoKSA9PiB7fSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIG9rOiB0cnVlLFxuICAgIGFwcGxpZWQ6IGNoYW5nZWRLZXlzLmxlbmd0aCA+IDAsXG4gICAgY2hhbmdlZEtleXMsXG4gICAgYXBwbGllZFBhdGNoOiBwYXRjaFxuICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBxdWVyeUFjdGl2ZVRhYigpIHtcbiAgY29uc3QgdGFicyA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHsgYWN0aXZlOiB0cnVlLCBjdXJyZW50V2luZG93OiB0cnVlIH0pO1xuICByZXR1cm4gdGFicyAmJiB0YWJzWzBdID8gdGFic1swXSA6IG51bGw7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNhcHR1cmVWaXNpYmxlVGFiRGF0YVVybCh3aW5kb3dJZCA9IG51bGwpIHtcbiAgcmV0dXJuIGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjaHJvbWUudGFicy5jYXB0dXJlVmlzaWJsZVRhYih3aW5kb3dJZCwgeyBmb3JtYXQ6ICdwbmcnIH0sIChkYXRhVXJsKSA9PiB7XG4gICAgICBjb25zdCBlcnIgPSBjaHJvbWUucnVudGltZS5sYXN0RXJyb3I7XG4gICAgICBpZiAoZXJyKSByZWplY3QoZXJyKTtcbiAgICAgIGVsc2UgcmVzb2x2ZShkYXRhVXJsKTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbmNvbnN0IENPTlRFTlRfU0NSSVBUX1JFVFJZX0RFTEFZX01TID0gMTIwO1xuY29uc3QgQ09OVEVOVF9TQ1JJUFRfSU5KRUNUX0ZJTEVTID0gWydjb250ZW50LmpzJ107XG5cbmFzeW5jIGZ1bmN0aW9uIGlzQWxsb3dlZEZpbGVTY2hlbWVBY2Nlc3MoKSB7XG4gIHRyeSB7XG4gICAgaWYgKCFjaHJvbWU/LmV4dGVuc2lvbj8uaXNBbGxvd2VkRmlsZVNjaGVtZUFjY2VzcykgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICBjaHJvbWUuZXh0ZW5zaW9uLmlzQWxsb3dlZEZpbGVTY2hlbWVBY2Nlc3MoKGFsbG93ZWQpID0+IHJlc29sdmUoQm9vbGVhbihhbGxvd2VkKSkpO1xuICAgIH0pO1xuICB9IGNhdGNoIChfZXJyKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gdHJ5SW5qZWN0Q29udGVudFNjcmlwdCh0YWJJZCwgZnJhbWVJZCA9IDApIHtcbiAgY29uc3QgcmVzb2x2ZWRGcmFtZUlkID0gdHlwZW9mIGZyYW1lSWQgPT09ICdudW1iZXInID8gZnJhbWVJZCA6IDA7XG4gIGxldCB0YWJVcmwgPSAnJztcblxuICB0cnkge1xuICAgIGNvbnN0IHRhYiA9IGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICBjaHJvbWUudGFicy5nZXQodGFiSWQsICh0KSA9PiB7XG4gICAgICAgIHZvaWQgY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yO1xuICAgICAgICByZXNvbHZlKHQgfHwgbnVsbCk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICB0YWJVcmwgPSBTdHJpbmcodGFiPy51cmwgfHwgJycpO1xuICB9IGNhdGNoIChfZXJyKSB7fVxuXG4gIGlmICh0YWJVcmwgJiYgaXNSZXN0cmljdGVkVXJsKHRhYlVybCkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgQ2Fubm90IGFjY2VzcyBET00gZm9yIHJlc3RyaWN0ZWQgVVJMOiAke3RhYlVybCB8fCAnKHVua25vd24gdXJsKSd9IGAgK1xuICAgICAgICBgKENocm9tZSBibG9ja3MgY29udGVudCBzY3JpcHRzIG9uIGludGVybmFsIHBhZ2VzIC8gV2ViIFN0b3JlKS5gXG4gICAgKTtcbiAgfVxuXG4gIGlmICh0YWJVcmwgJiYgdGFiVXJsLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgnZmlsZTovLycpKSB7XG4gICAgY29uc3QgYWxsb3dlZCA9IGF3YWl0IGlzQWxsb3dlZEZpbGVTY2hlbWVBY2Nlc3MoKTtcbiAgICBpZiAoYWxsb3dlZCA9PT0gZmFsc2UpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgJ0Nhbm5vdCBhY2Nlc3MgRE9NIG9uIGZpbGU6Ly8gcGFnZXMgdW50aWwgeW91IGVuYWJsZSBcIkFsbG93IGFjY2VzcyB0byBmaWxlIFVSTHNcIiAnICtcbiAgICAgICAgICAnaW4gY2hyb21lOi8vZXh0ZW5zaW9ucyAtPiBCaWxnZSBBSSBXb3Jrc3BhY2UgLT4gRGV0YWlscy4nXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICB0cnkge1xuICAgICAgY2hyb21lLnNjcmlwdGluZy5leGVjdXRlU2NyaXB0KFxuICAgICAgICB7XG4gICAgICAgICAgdGFyZ2V0OiB7IHRhYklkLCBmcmFtZUlkczogW3Jlc29sdmVkRnJhbWVJZF0gfSxcbiAgICAgICAgICBmaWxlczogQ09OVEVOVF9TQ1JJUFRfSU5KRUNUX0ZJTEVTLFxuICAgICAgICAgIHdvcmxkOiAnSVNPTEFURUQnXG4gICAgICAgIH0sXG4gICAgICAgICgpID0+IHtcbiAgICAgICAgICBjb25zdCBlcnIgPSBjaHJvbWUucnVudGltZS5sYXN0RXJyb3I7XG4gICAgICAgICAgaWYgKGVycikgcmVqZWN0KGVycik7XG4gICAgICAgICAgZWxzZSByZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICByZWplY3QoZXJyKTtcbiAgICB9XG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBzZW5kVGFiTWVzc2FnZSh0YWJJZCwgcGF5bG9hZCkge1xuICByZXR1cm4gYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNocm9tZS50YWJzLnNlbmRNZXNzYWdlKHRhYklkLCBwYXlsb2FkLCB7IGZyYW1lSWQ6IDAgfSwgKHJlc3BvbnNlKSA9PiB7XG4gICAgICBjb25zdCBlcnIgPSBjaHJvbWUucnVudGltZS5sYXN0RXJyb3I7XG4gICAgICBpZiAoZXJyKSByZWplY3QoZXJyKTtcbiAgICAgIGVsc2UgcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBpbmplY3RDb250ZW50U2NyaXB0VG9wRnJhbWUodGFiSWQpIHtcbiAgLy8gQWZ0ZXIgaW5zdGFsbC91cGRhdGUsIGV4aXN0aW5nIHRhYnMgd29uJ3QgaGF2ZSBtYW5pZmVzdCBjb250ZW50IHNjcmlwdHMgdW50aWwgbmF2aWdhdGlvbi5cbiAgLy8gY29udGVudC5qcyBpcyBpZGVtcG90ZW50IChndWFyZHMgaXRzZWxmKSBzbyBpdCdzIHNhZmUgdG8gaW5qZWN0IGl0IG9uLWRlbWFuZC5cbiAgYXdhaXQgdHJ5SW5qZWN0Q29udGVudFNjcmlwdCh0YWJJZCwgMCk7XG4gIGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIENPTlRFTlRfU0NSSVBUX1JFVFJZX0RFTEFZX01TKSk7XG4gIHJldHVybiB0cnVlO1xufVxuXG5hc3luYyBmdW5jdGlvbiBzZW5kQ29udGVudE1lc3NhZ2VXaXRoUmV0cnkodGFiSWQsIHBheWxvYWQpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gYXdhaXQgc2VuZFRhYk1lc3NhZ2UodGFiSWQsIHBheWxvYWQpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBpZiAoIXNob3VsZFJldHJ5QWZ0ZXJOb1JlY2VpdmVyKGVycikpIHRocm93IGVycjtcbiAgICBhd2FpdCBpbmplY3RDb250ZW50U2NyaXB0VG9wRnJhbWUodGFiSWQpO1xuICAgIHJldHVybiBhd2FpdCBzZW5kVGFiTWVzc2FnZSh0YWJJZCwgcGF5bG9hZCk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gY29sbGVjdERvbVZhbGlkYXRpb25TdW1tYXJ5KHRhYklkKSB7XG4gIHRyeSB7XG4gICAgY29uc3QgaW5qZWN0ZWQgPSBhd2FpdCBjaHJvbWUuc2NyaXB0aW5nLmV4ZWN1dGVTY3JpcHQoe1xuICAgICAgdGFyZ2V0OiB7IHRhYklkIH0sXG4gICAgICB3b3JsZDogJ0lTT0xBVEVEJyxcbiAgICAgIGZ1bmM6ICgpID0+IHtcbiAgICAgICAgY29uc3Qgbm9kZXMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0LCB0ZXh0YXJlYSwgc2VsZWN0LCBbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXScpKTtcbiAgICAgICAgbGV0IHJlcXVpcmVkQ291bnQgPSAwO1xuICAgICAgICBsZXQgaW52YWxpZENvdW50ID0gMDtcbiAgICAgICAgY29uc3QgaW52YWxpZFNlbGVjdG9ycyA9IFtdO1xuXG4gICAgICAgIGZ1bmN0aW9uIG1ha2VTZWxlY3RvcihlbGVtZW50KSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHRhZyA9IFN0cmluZyhlbGVtZW50LnRhZ05hbWUgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICBpZiAoIXRhZykgcmV0dXJuICcnO1xuICAgICAgICAgICAgY29uc3QgaWQgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnaWQnKTtcbiAgICAgICAgICAgIGlmIChpZCkgcmV0dXJuIGAjJHtDU1MuZXNjYXBlKGlkKX1gO1xuICAgICAgICAgICAgY29uc3QgbmFtZSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCduYW1lJyk7XG4gICAgICAgICAgICBpZiAobmFtZSkgcmV0dXJuIGAke3RhZ31bbmFtZT1cIiR7Q1NTLmVzY2FwZShuYW1lKX1cIl1gO1xuICAgICAgICAgICAgY29uc3QgY2xhc3NOYW1lID0gU3RyaW5nKGVsZW1lbnQuY2xhc3NOYW1lIHx8ICcnKS50cmltKCk7XG4gICAgICAgICAgICBpZiAoY2xhc3NOYW1lKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGZpcnN0ID0gY2xhc3NOYW1lLnNwbGl0KC9cXHMrLykuZmlsdGVyKEJvb2xlYW4pWzBdO1xuICAgICAgICAgICAgICBpZiAoZmlyc3QpIHJldHVybiBgJHt0YWd9LiR7Zmlyc3R9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0YWc7XG4gICAgICAgICAgfSBjYXRjaCAoX2Vycikge1xuICAgICAgICAgICAgcmV0dXJuICcnO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoY29uc3QgZWxlbWVudCBvZiBub2Rlcykge1xuICAgICAgICAgIGNvbnN0IGlzUmVxdWlyZWQgPSBlbGVtZW50Lmhhc0F0dHJpYnV0ZSgncmVxdWlyZWQnKSB8fCBlbGVtZW50LmdldEF0dHJpYnV0ZSgnYXJpYS1yZXF1aXJlZCcpID09PSAndHJ1ZSc7XG4gICAgICAgICAgaWYgKGlzUmVxdWlyZWQpIHJlcXVpcmVkQ291bnQgKz0gMTtcblxuICAgICAgICAgIGxldCBpbnZhbGlkID0gZmFsc2U7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZWxlbWVudC5jaGVja1ZhbGlkaXR5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIGludmFsaWQgPSAhZWxlbWVudC5jaGVja1ZhbGlkaXR5KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoX2Vycikge31cbiAgICAgICAgICBpZiAoIWludmFsaWQgJiYgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtaW52YWxpZCcpID09PSAndHJ1ZScpIHtcbiAgICAgICAgICAgIGludmFsaWQgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoaW52YWxpZCkge1xuICAgICAgICAgICAgaW52YWxpZENvdW50ICs9IDE7XG4gICAgICAgICAgICBpZiAoaW52YWxpZFNlbGVjdG9ycy5sZW5ndGggPCA0MCkge1xuICAgICAgICAgICAgICBpbnZhbGlkU2VsZWN0b3JzLnB1c2gobWFrZVNlbGVjdG9yKGVsZW1lbnQpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHRvdGFsU2Nhbm5lZDogbm9kZXMubGVuZ3RoLFxuICAgICAgICAgIHJlcXVpcmVkQ291bnQsXG4gICAgICAgICAgaW52YWxpZENvdW50LFxuICAgICAgICAgIGludmFsaWRTZWxlY3RvcnNcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gaW5qZWN0ZWQ/LlswXT8ucmVzdWx0IHx8IHsgdG90YWxTY2FubmVkOiAwLCByZXF1aXJlZENvdW50OiAwLCBpbnZhbGlkQ291bnQ6IDAsIGludmFsaWRTZWxlY3RvcnM6IFtdIH07XG4gIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICByZXR1cm4geyB0b3RhbFNjYW5uZWQ6IDAsIHJlcXVpcmVkQ291bnQ6IDAsIGludmFsaWRDb3VudDogMCwgaW52YWxpZFNlbGVjdG9yczogW10gfTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBidWlsZFN0cnVjdHVyZWREb21TbmFwc2hvdCh0YWJJZCkge1xuICBjb25zdCBbcGFnZUluZm8sIGV4dHJhY3RlZCwgdmFsaWRhdGlvbl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgc2VuZENvbnRlbnRNZXNzYWdlV2l0aFJldHJ5KHRhYklkLCB7IHR5cGU6ICdHRVRfUEFHRV9JTkZPJyB9KS5jYXRjaCgoKSA9PiBudWxsKSxcbiAgICBzZW5kQ29udGVudE1lc3NhZ2VXaXRoUmV0cnkodGFiSWQsIHsgdHlwZTogJ0VYVFJBQ1RfRk9STV9GSUVMRFMnIH0pLmNhdGNoKCgpID0+IG51bGwpLFxuICAgIGNvbGxlY3REb21WYWxpZGF0aW9uU3VtbWFyeSh0YWJJZClcbiAgXSk7XG5cbiAgY29uc3QgZmllbGRzID0gQXJyYXkuaXNBcnJheShleHRyYWN0ZWQ/LmZpZWxkcykgPyBleHRyYWN0ZWQuZmllbGRzIDogW107XG4gIGNvbnN0IHJlcXVpcmVkRmllbGRDb3VudCA9IGZpZWxkcy5maWx0ZXIoKGZpZWxkKSA9PiBmaWVsZCAmJiBmaWVsZC5pc1JlcXVpcmVkID09PSB0cnVlKS5sZW5ndGg7XG5cbiAgcmV0dXJuIHtcbiAgICB1cmw6IFN0cmluZyhwYWdlSW5mbz8udXJsIHx8IGV4dHJhY3RlZD8ucGFnZVVybCB8fCAnJyksXG4gICAgdGl0bGU6IFN0cmluZyhwYWdlSW5mbz8udGl0bGUgfHwgZXh0cmFjdGVkPy5wYWdlVGl0bGUgfHwgJycpLFxuICAgIGZvcm1GaWVsZHM6IGZpZWxkcy5zbGljZSgwLCAzMDApLFxuICAgIHN1bW1hcnk6IHtcbiAgICAgIHRvdGFsRmllbGRzOiBmaWVsZHMubGVuZ3RoLFxuICAgICAgcmVxdWlyZWRGaWVsZHM6IHJlcXVpcmVkRmllbGRDb3VudCxcbiAgICAgIGludmFsaWRGaWVsZHM6IE51bWJlcih2YWxpZGF0aW9uPy5pbnZhbGlkQ291bnQgfHwgMCksXG4gICAgICBpbnZhbGlkU2VsZWN0b3JzOiBBcnJheS5pc0FycmF5KHZhbGlkYXRpb24/LmludmFsaWRTZWxlY3RvcnMpID8gdmFsaWRhdGlvbi5pbnZhbGlkU2VsZWN0b3JzIDogW11cbiAgICB9XG4gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBvc3RBbmFseXplU2NyZWVuKHBheWxvYWQsIHNldHRpbmdzID0gbnVsbCkge1xuICBjb25zdCByZWxheVNldHRpbmdzID0gc2V0dGluZ3MgfHwgYXdhaXQgZ2V0UmVsYXlTZXR0aW5ncygpO1xuICBcbiAgLy8gLS0tIEJSQUlOIFJPVVRJTkcgLS0tXG4gIGlmICghcGF5bG9hZC5tZXRhZGF0YT8uYnJhaW5Qcm92aWRlciB8fCAhcGF5bG9hZC5tZXRhZGF0YT8uYnJhaW5Nb2RlbCkge1xuICAgIGNvbnN0IHJvdXRpbmcgPSByZXNvbHZlUm91dGluZ1dpdGhJbnRlbGxpZ2VudEZhbGxiYWNrKHBheWxvYWQuZ29hbCB8fCAnJywgcmVsYXlTZXR0aW5ncywge1xuICAgICAgdXJsOiBwYXlsb2FkLnVybCxcbiAgICAgIHRpdGxlOiBwYXlsb2FkLnRpdGxlXG4gICAgfSk7XG4gICAgXG4gICAgcGF5bG9hZC5tZXRhZGF0YSA9IHtcbiAgICAgIC4uLnBheWxvYWQubWV0YWRhdGEsXG4gICAgICBicmFpblByb3ZpZGVyOiByb3V0aW5nLnByb3ZpZGVyLFxuICAgICAgYnJhaW5Nb2RlbDogcm91dGluZy5tb2RlbCxcbiAgICAgIGJyYWluU3lzdGVtUHJvbXB0OiByb3V0aW5nLnN5c3RlbVByb21wdCxcbiAgICAgIHJvdXRpbmdNZXRhOiByb3V0aW5nLm1ldGFcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgY2FuZGlkYXRlcyA9IFtdO1xuICBpZiAocmVsYXlTZXR0aW5ncz8uZW5kcG9pbnQpIGNhbmRpZGF0ZXMucHVzaChyZWxheVNldHRpbmdzLmVuZHBvaW50KTtcbiAgZm9yIChjb25zdCBmYWxsYmFjayBvZiBBTkFMWVpFX0VORFBPSU5UX0ZBTExCQUNLUykge1xuICAgIGlmICghY2FuZGlkYXRlcy5pbmNsdWRlcyhmYWxsYmFjaykpIGNhbmRpZGF0ZXMucHVzaChmYWxsYmFjayk7XG4gIH1cblxuICBsZXQgbGFzdEVycm9yID0gbnVsbDtcbiAgZm9yIChjb25zdCBlbmRwb2ludCBvZiBjYW5kaWRhdGVzKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goZW5kcG9pbnQsIHtcbiAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShwYXlsb2FkKVxuICAgICAgfSk7XG4gICAgICBjb25zdCB0ZXh0ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuICAgICAgbGV0IGJvZHkgPSBudWxsO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYm9keSA9IHRleHQgPyBKU09OLnBhcnNlKHRleHQpIDogbnVsbDtcbiAgICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgICAgYm9keSA9IHRleHQ7XG4gICAgICB9XG4gICAgICBpZiAocmVzcG9uc2Uub2spIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBvazogdHJ1ZSxcbiAgICAgICAgICBlbmRwb2ludCxcbiAgICAgICAgICBzdGF0dXM6IHJlc3BvbnNlLnN0YXR1cyxcbiAgICAgICAgICBib2R5XG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBsYXN0RXJyb3IgPSBgQW5hbHl6ZSBlbmRwb2ludCAke2VuZHBvaW50fSBmYWlsZWQ6ICR7cmVzcG9uc2Uuc3RhdHVzfWA7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBsYXN0RXJyb3IgPSBgQW5hbHl6ZSBlbmRwb2ludCAke2VuZHBvaW50fSBlcnJvcjogJHt0b0Vycm9yTWVzc2FnZShlcnIpfWA7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogbGFzdEVycm9yIHx8ICdBbmFseXplIGVuZHBvaW50IHVuYXZhaWxhYmxlJyB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVDYXB0dXJlU2NyZWVuQ29tbWFuZChjb21tYW5kLCBzZXR0aW5ncywgYWdlbnRJZCkge1xuICBjb25zdCB0YWIgPSBhd2FpdCBxdWVyeUFjdGl2ZVRhYigpO1xuICBpZiAoIXRhYj8uaWQpIHRocm93IG5ldyBFcnJvcignTm8gYWN0aXZlIHRhYiBhdmFpbGFibGUgZm9yIENBUFRVUkVfU0NSRUVOJyk7XG5cbiAgY29uc3Qgc2NyZWVuc2hvdCA9IGF3YWl0IGNhcHR1cmVWaXNpYmxlVGFiRGF0YVVybCh0YWIud2luZG93SWQgPz8gbnVsbCk7XG4gIGNvbnN0IHBheWxvYWQgPSBjb21tYW5kLnBheWxvYWQgfHwge307XG4gIGNvbnN0IGdvYWwgPSBTdHJpbmcocGF5bG9hZC5nb2FsIHx8IHNldHRpbmdzLmdvYWwgfHwgJycpLnRyaW0oKTtcbiAgY29uc3Qgc2hvdWxkQW5hbHl6ZSA9IHBheWxvYWQuYW5hbHl6ZSA9PT0gdHJ1ZSB8fCBCb29sZWFuKGdvYWwpO1xuICBjb25zdCBpbmNsdWRlU25hcHNob3QgPSBwYXlsb2FkLmluY2x1ZGVEb21TbmFwc2hvdCA9PT0gdHJ1ZSB8fCBzaG91bGRBbmFseXplO1xuICBjb25zdCBzbmFwc2hvdCA9IGluY2x1ZGVTbmFwc2hvdCA/IGF3YWl0IGJ1aWxkU3RydWN0dXJlZERvbVNuYXBzaG90KHRhYi5pZCkuY2F0Y2goKCkgPT4gbnVsbCkgOiBudWxsO1xuICBsZXQgYW5hbHlzaXMgPSBudWxsO1xuXG4gIGlmIChzaG91bGRBbmFseXplKSB7XG4gICAgY29uc3QgYW5hbHl6ZVBheWxvYWQgPSB7XG4gICAgICBzY3JlZW5zaG90LFxuICAgICAgdXJsOiBTdHJpbmcoc25hcHNob3Q/LnVybCB8fCB0YWIudXJsIHx8ICcnKSxcbiAgICAgIHRpdGxlOiBTdHJpbmcoc25hcHNob3Q/LnRpdGxlIHx8IHRhYi50aXRsZSB8fCAnJyksXG4gICAgICBnb2FsOiBnb2FsIHx8ICdBbmFseXplIGFjdGl2ZSB0YWIgc2NyZWVuc2hvdC4nLFxuICAgICAgZG9tU25hcHNob3Q6IHNuYXBzaG90LFxuICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgc291cmNlOiAnYmlsZ2UtY2hyb21lLWV4dGVuc2lvbicsXG4gICAgICAgIGFnZW50SWQsXG4gICAgICAgIGNvbW1hbmQ6ICdDQVBUVVJFX1NDUkVFTidcbiAgICAgIH1cbiAgICB9O1xuICAgIGFuYWx5c2lzID0gYXdhaXQgcG9zdEFuYWx5emVTY3JlZW4oYW5hbHl6ZVBheWxvYWQsIHNldHRpbmdzKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgb2s6IHRydWUsXG4gICAgY29tbWFuZDogJ0NBUFRVUkVfU0NSRUVOJyxcbiAgICBzY3JlZW5zaG90LFxuICAgIHBhZ2U6IHsgdXJsOiBTdHJpbmcodGFiLnVybCB8fCAnJyksIHRpdGxlOiBTdHJpbmcodGFiLnRpdGxlIHx8ICcnKSB9LFxuICAgIGRvbVNuYXBzaG90OiBzbmFwc2hvdCxcbiAgICBhbmFseXNpc1xuICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVFeGVjdXRlQWN0aW9uc0NvbW1hbmQoY29tbWFuZCwgc2V0dGluZ3MpIHtcbiAgaWYgKHNldHRpbmdzLm1hc3RlckFjdGl2ZSA9PT0gZmFsc2UpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ01BU1RFUl9BQ1RJVkUgaXMgT0ZGOyBFWEVDVVRFX0FDVElPTlMgYmxvY2tlZC4nKTtcbiAgfVxuICBpZiAoYWN0aXZlUnVucy5zaXplID4gMCkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmV0cmlhYmxlOiB0cnVlLCBlcnJvcjogYEFnZW50IGJ1c3kgd2l0aCAke2FjdGl2ZVJ1bnMuc2l6ZX0gYWN0aXZlIHJ1bihzKWAgfTtcbiAgfVxuXG4gIGNvbnN0IHBheWxvYWQgPSBjb21tYW5kLnBheWxvYWQgfHwge307XG4gIGNvbnN0IGFjdGlvbnMgPSBBcnJheS5pc0FycmF5KHBheWxvYWQuYWN0aW9ucykgPyBwYXlsb2FkLmFjdGlvbnMgOiBbXTtcbiAgaWYgKGFjdGlvbnMubGVuZ3RoID09PSAwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyB2YWxpZCBhY3Rpb25zIHByb3ZpZGVkIGZvciBFWEVDVVRFX0FDVElPTlMnKTtcbiAgfVxuXG4gIGNvbnN0IG9wdGlvbnMgPSBwYXlsb2FkLm9wdGlvbnMgJiYgdHlwZW9mIHBheWxvYWQub3B0aW9ucyA9PT0gJ29iamVjdCdcbiAgICA/IHsgLi4ucGF5bG9hZC5vcHRpb25zIH1cbiAgICA6IHt9O1xuICBjb25zdCBhbGxvd0FpU2NyaXB0cyA9IHNldHRpbmdzLm1hc3RlckFjdGl2ZSA9PT0gdHJ1ZSAmJiBzZXR0aW5ncy50cmFpbmluZ0FsbG93QWlTY3JpcHRzID09PSB0cnVlO1xuICBvcHRpb25zLmFsbG93QWlTY3JpcHRzID0gYWxsb3dBaVNjcmlwdHM7XG5cbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZUJhdGNoQWN0aW9ucyhhY3Rpb25zLCBvcHRpb25zLCBjb21tYW5kLnRyYWNlTWV0YSk7XG4gIHJldHVybiB7XG4gICAgb2s6IHJlc3VsdD8ub2sgIT09IGZhbHNlLFxuICAgIGNvbW1hbmQ6ICdFWEVDVVRFX0FDVElPTlMnLFxuICAgIHJ1bklkOiByZXN1bHQ/LnJ1bklkIHx8ICcnLFxuICAgIGV4ZWN1dGVkU3RlcHM6IE51bWJlcihyZXN1bHQ/LmV4ZWN1dGVkU3RlcHMgfHwgMCksXG4gICAgY2FuY2VsbGVkOiBCb29sZWFuKHJlc3VsdD8uY2FuY2VsbGVkKSxcbiAgICBhbGxvd0FpU2NyaXB0cyxcbiAgICBlcnJvcjogcmVzdWx0Py5lcnJvciB8fCBudWxsXG4gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVRyYWluaW5nUHJvYmVDb21tYW5kKGNvbW1hbmQsIHNldHRpbmdzLCBhZ2VudElkKSB7XG4gIGlmIChzZXR0aW5ncy5tYXN0ZXJBY3RpdmUgPT09IGZhbHNlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdNQVNURVJfQUNUSVZFIGlzIE9GRjsgVFJBSU5JTkdfUFJPQkUgYmxvY2tlZC4nKTtcbiAgfVxuXG4gIGNvbnN0IHRhYiA9IGF3YWl0IHF1ZXJ5QWN0aXZlVGFiKCk7XG4gIGlmICghdGFiPy5pZCkgdGhyb3cgbmV3IEVycm9yKCdObyBhY3RpdmUgdGFiIGF2YWlsYWJsZSBmb3IgVFJBSU5JTkdfUFJPQkUnKTtcblxuICBjb25zdCBwYXlsb2FkID0gY29tbWFuZC5wYXlsb2FkIHx8IHt9O1xuICBjb25zdCBwcm9iZSA9IFN0cmluZyhwYXlsb2FkLnByb2JlIHx8IHBheWxvYWQuZ29hbCB8fCAnJykudHJpbSgpO1xuICBjb25zdCBnb2FsID0gU3RyaW5nKHBheWxvYWQuZ29hbCB8fCBwcm9iZSB8fCBzZXR0aW5ncy5nb2FsIHx8ICdUcmFpbmluZyBwcm9iZScpLnRyaW0oKTtcbiAgY29uc3Qgc2NyZWVuc2hvdCA9IGF3YWl0IGNhcHR1cmVWaXNpYmxlVGFiRGF0YVVybCh0YWIud2luZG93SWQgPz8gbnVsbCk7XG4gIGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgYnVpbGRTdHJ1Y3R1cmVkRG9tU25hcHNob3QodGFiLmlkKTtcblxuICBsZXQgdGFyZ2V0SHRtbCA9ICcnO1xuICBjb25zdCB0YXJnZXRTZWxlY3RvciA9IFN0cmluZyhwYXlsb2FkLnNlbGVjdG9yIHx8ICcnKS50cmltKCk7XG4gIGlmICh0YXJnZXRTZWxlY3Rvcikge1xuICAgIGNvbnN0IGV4cGxvcmVkID0gYXdhaXQgc2VuZENvbnRlbnRNZXNzYWdlV2l0aFJldHJ5KHRhYi5pZCwgeyB0eXBlOiAnRVhQTE9SRV9ET00nLCBzZWxlY3RvcjogdGFyZ2V0U2VsZWN0b3IgfSkuY2F0Y2goKCkgPT4gbnVsbCk7XG4gICAgdGFyZ2V0SHRtbCA9IFN0cmluZyhleHBsb3JlZD8uaHRtbCB8fCAnJyk7XG4gIH1cblxuICBjb25zdCBhbmFseXplUGF5bG9hZCA9IHtcbiAgICBzY3JlZW5zaG90LFxuICAgIHVybDogc25hcHNob3QudXJsIHx8IFN0cmluZyh0YWIudXJsIHx8ICcnKSxcbiAgICB0aXRsZTogc25hcHNob3QudGl0bGUgfHwgU3RyaW5nKHRhYi50aXRsZSB8fCAnJyksXG4gICAgZ29hbCxcbiAgICB0cmFpbmluZ01vZGU6IHRydWUsXG4gICAgcHJvYmU6IHByb2JlIHx8IGdvYWwsXG4gICAgdGFyZ2V0U2VsZWN0b3IsXG4gICAgdGFyZ2V0SHRtbCxcbiAgICBkb21TbmFwc2hvdDogc25hcHNob3QsXG4gICAgbWV0YWRhdGE6IHtcbiAgICAgIHNvdXJjZTogJ2JpbGdlLWNocm9tZS1leHRlbnNpb24nLFxuICAgICAgY29tbWFuZDogJ1RSQUlOSU5HX1BST0JFJyxcbiAgICAgIGFnZW50SWQsXG4gICAgICB0cmFpbmluZ0FsbG93QWlTY3JpcHRzOiBzZXR0aW5ncy50cmFpbmluZ0FsbG93QWlTY3JpcHRzID09PSB0cnVlLFxuICAgICAgdHJhaW5pbmdNb2RlRW5hYmxlZDogc2V0dGluZ3MudHJhaW5pbmdNb2RlRW5hYmxlZCA9PT0gdHJ1ZSxcbiAgICAgIGNvbm5lY3RvclByZXNldDogc2V0dGluZ3MuY29ubmVjdG9yUHJlc2V0IHx8ICcnLFxuICAgICAgYnJhaW5Qcm92aWRlcjogc2V0dGluZ3MuYnJhaW5Qcm92aWRlciB8fCAnJyxcbiAgICAgIGJyYWluTW9kZWw6IHNldHRpbmdzLmJyYWluTW9kZWwgfHwgJydcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgYW5hbHlzaXMgPSBhd2FpdCBwb3N0QW5hbHl6ZVNjcmVlbihhbmFseXplUGF5bG9hZCwgc2V0dGluZ3MpO1xuICByZXR1cm4ge1xuICAgIG9rOiBhbmFseXNpcz8ub2sgPT09IHRydWUsXG4gICAgY29tbWFuZDogJ1RSQUlOSU5HX1BST0JFJyxcbiAgICBnb2FsLFxuICAgIHByb2JlOiBwcm9iZSB8fCBnb2FsLFxuICAgIHNuYXBzaG90LFxuICAgIGFuYWx5c2lzXG4gIH07XG59XG5cbmZ1bmN0aW9uIGlzU2NyZWVuc2hvdE5hdHVyYWxDb21tYW5kKHJhd0NvbW1hbmQpIHtcbiAgY29uc3QgdGV4dCA9IFN0cmluZyhyYXdDb21tYW5kIHx8ICcnKS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgaWYgKCF0ZXh0KSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiAvXFxiKHNjcmVlbnNob3R8c2NyZWVuXFxzKnNob3R8Y2FwdHVyZVxccyoodGhlXFxzKik/KHNjcmVlbnxwYWdlKXx0YWtlXFxzKihhXFxzKik/c2NyZWVuc2hvdClcXGIvaS50ZXN0KHRleHQpO1xufVxuXG5mdW5jdGlvbiBpc0FnZW50U3RhdHVzTmF0dXJhbENvbW1hbmQocmF3Q29tbWFuZCkge1xuICBjb25zdCB0ZXh0ID0gU3RyaW5nKHJhd0NvbW1hbmQgfHwgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICBpZiAoIXRleHQpIHJldHVybiBmYWxzZTtcbiAgLy8gS2VlcCB0aGlzIGludGVudGlvbmFsbHkgbmFycm93IHNvIHdlIGRvbid0IHN0ZWFsIHJlYWwgRE9NIGNvbW1hbmRzLlxuICByZXR1cm4gL1xcYihzdGF0dXN8cHJvZ3Jlc3N8Y3VycmVudFxccytzdGVwfHdoYXRcXHMrYXJlXFxzK3lvdVxccytkb2luZ3x3aGF0KD86J3N8IGlzKVxccysoPzpoYXBwZW5pbmd8Z29pbmdcXHMrb24pfHdoZXJlXFxzK2FyZVxccyt3ZXxhcmVcXHMreW91XFxzK3N0dWNrKVxcYi9pLnRlc3QodGV4dCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVNlbGZJbXByb3ZlQ29tbWFuZChjb21tYW5kLCBzZXR0aW5ncywgYWdlbnRJZCkge1xuICBjb25zdCBwYXlsb2FkID0gY29tbWFuZD8ucGF5bG9hZCAmJiB0eXBlb2YgY29tbWFuZC5wYXlsb2FkID09PSAnb2JqZWN0JyA/IGNvbW1hbmQucGF5bG9hZCA6IHt9O1xuICBjb25zdCBhdXRvSGVhbCA9IGNvZXJjZUJvb2xlYW4ocGF5bG9hZC5hdXRvSGVhbCwgdHJ1ZSk7XG4gIGNvbnN0IGFwcGx5VmFsaWRhdGlvbk1vZGUgPSBjb2VyY2VCb29sZWFuKHBheWxvYWQuYXBwbHlWYWxpZGF0aW9uTW9kZSwgZmFsc2UpO1xuICBjb25zdCByZXN0YXJ0QWZ0ZXIgPSBjb2VyY2VCb29sZWFuKHBheWxvYWQucmVzdGFydEFmdGVyLCBmYWxzZSk7XG4gIGNvbnN0IGFsbG93RW5hYmxlTWFzdGVyQWN0aXZlID0gY29lcmNlQm9vbGVhbihwYXlsb2FkLmFsbG93RW5hYmxlTWFzdGVyQWN0aXZlLCBmYWxzZSk7XG4gIGNvbnN0IGluY2x1ZGVTY3JlZW5zaG90ID0gY29lcmNlQm9vbGVhbihwYXlsb2FkLmluY2x1ZGVTY3JlZW5zaG90LCBmYWxzZSk7XG4gIGNvbnN0IGluY2x1ZGVEb21TbmFwc2hvdCA9IGNvZXJjZUJvb2xlYW4ocGF5bG9hZC5pbmNsdWRlRG9tU25hcHNob3QsIHRydWUpO1xuICBjb25zdCBzdGFydGVkQXQgPSBEYXRlLm5vdygpO1xuICBjb25zdCBpc3N1ZXMgPSBbXTtcbiAgY29uc3QgYWN0aW9uc1Rha2VuID0gW107XG5cbiAgY29uc3QgcmVsYXlCZWZvcmUgPSBnZXRSZWxheVN0YXR1cygpO1xuICBsZXQgd29ya2luZ1NldHRpbmdzID0geyAuLi5zZXR0aW5ncyB9O1xuXG4gIGlmICh3b3JraW5nU2V0dGluZ3MubWFzdGVyQWN0aXZlID09PSBmYWxzZSkge1xuICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgIGNvZGU6ICdtYXN0ZXJfaW5hY3RpdmUnLFxuICAgICAgc2V2ZXJpdHk6ICdoaWdoJyxcbiAgICAgIG1lc3NhZ2U6ICdNQVNURVJfQUNUSVZFIGlzIG9mZjsgcmVsYXkgYWN0aW9ucyBhcmUgYmxvY2tlZC4nXG4gICAgfSk7XG4gICAgaWYgKGF1dG9IZWFsICYmIGFsbG93RW5hYmxlTWFzdGVyQWN0aXZlKSB7XG4gICAgICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBbTUFTVEVSX0FDVElWRV9LRVldOiB0cnVlIH0pLmNhdGNoKCgpID0+IHt9KTtcbiAgICAgIHdvcmtpbmdTZXR0aW5ncy5tYXN0ZXJBY3RpdmUgPSB0cnVlO1xuICAgICAgYWN0aW9uc1Rha2VuLnB1c2goe1xuICAgICAgICBhY3Rpb246ICdlbmFibGVfbWFzdGVyX2FjdGl2ZScsXG4gICAgICAgIHN0YXR1czogJ2FwcGxpZWQnLFxuICAgICAgICBkZXRhaWw6ICdTZXQgbWFzdGVyQWN0aXZlPXRydWUgZnJvbSBzZWxmLWltcHJvdmVtZW50IG1vZGUuJ1xuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKCFyZWxheUJlZm9yZS5jb25uZWN0ZWQgJiYgYXV0b0hlYWwgJiYgd29ya2luZ1NldHRpbmdzLm1hc3RlckFjdGl2ZSAhPT0gZmFsc2UpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgY29ubmVjdFJlbGF5KCk7XG4gICAgICBhY3Rpb25zVGFrZW4ucHVzaCh7XG4gICAgICAgIGFjdGlvbjogJ3JlbGF5X3JlY29ubmVjdCcsXG4gICAgICAgIHN0YXR1czogJ2FwcGxpZWQnLFxuICAgICAgICBkZXRhaWw6ICdBdHRlbXB0ZWQgcmVjb25uZWN0IGZvciByZWxheSB0cmFuc3BvcnQuJ1xuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBpc3N1ZXMucHVzaCh7XG4gICAgICAgIGNvZGU6ICdyZWxheV9yZWNvbm5lY3RfZmFpbGVkJyxcbiAgICAgICAgc2V2ZXJpdHk6ICdtZWRpdW0nLFxuICAgICAgICBtZXNzYWdlOiB0b0Vycm9yTWVzc2FnZShlcnIpXG4gICAgICB9KTtcbiAgICAgIGFjdGlvbnNUYWtlbi5wdXNoKHtcbiAgICAgICAgYWN0aW9uOiAncmVsYXlfcmVjb25uZWN0JyxcbiAgICAgICAgc3RhdHVzOiAnZmFpbGVkJyxcbiAgICAgICAgZGV0YWlsOiB0b0Vycm9yTWVzc2FnZShlcnIpXG4gICAgICB9KTtcbiAgICB9XG4gIH0gZWxzZSBpZiAoIXJlbGF5QmVmb3JlLmNvbm5lY3RlZCAmJiBhdXRvSGVhbCAmJiB3b3JraW5nU2V0dGluZ3MubWFzdGVyQWN0aXZlID09PSBmYWxzZSkge1xuICAgIGFjdGlvbnNUYWtlbi5wdXNoKHtcbiAgICAgIGFjdGlvbjogJ3JlbGF5X3JlY29ubmVjdCcsXG4gICAgICBzdGF0dXM6ICdza2lwcGVkJyxcbiAgICAgIGRldGFpbDogJ1NraXBwZWQgcmVjb25uZWN0IGJlY2F1c2UgbWFzdGVyQWN0aXZlIGlzIGRpc2FibGVkLidcbiAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IHJlbGF5QWZ0ZXIgPSBnZXRSZWxheVN0YXR1cygpO1xuICBpZiAoIXJlbGF5QWZ0ZXIuY29ubmVjdGVkKSB7XG4gICAgaXNzdWVzLnB1c2goe1xuICAgICAgY29kZTogJ3JlbGF5X2Rpc2Nvbm5lY3RlZCcsXG4gICAgICBzZXZlcml0eTogJ21lZGl1bScsXG4gICAgICBtZXNzYWdlOiAnUmVsYXkgd2Vic29ja2V0IGlzIG5vdCBjb25uZWN0ZWQuJ1xuICAgIH0pO1xuICB9XG5cbiAgY29uc3QgYXBwU2V0dGluZ3MgPSBhd2FpdCBnZXRCaWxnZUFwcFNldHRpbmdzU25hcHNob3QoKTtcbiAgY29uc3QgdmFsaWRhdGlvbk1vZGUgPSByZXNvbHZlU2VsZkhlYWxpbmdWYWxpZGF0aW9uTW9kZShwYXlsb2FkLCB3b3JraW5nU2V0dGluZ3MpO1xuXG4gIGlmIChhcHBseVZhbGlkYXRpb25Nb2RlKSB7XG4gICAgY29uc3QgcGF0Y2ggPSBzYW5pdGl6ZVByZXNldFBhdGNoKHtcbiAgICAgIGNvbm5lY3RvclByZXNldDogdmFsaWRhdGlvbk1vZGUucmVjb21tZW5kZWRQcm92aWRlcixcbiAgICAgIGJyYWluUHJvdmlkZXI6IHZhbGlkYXRpb25Nb2RlLnJlY29tbWVuZGVkUHJvdmlkZXIsXG4gICAgICBicmFpbk1vZGVsOiB2YWxpZGF0aW9uTW9kZS5yZWNvbW1lbmRlZE1vZGVsXG4gICAgfSk7XG4gICAgaWYgKE9iamVjdC5rZXlzKHBhdGNoKS5sZW5ndGggPiAwKSB7XG4gICAgICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQocGF0Y2gpLmNhdGNoKCgpID0+IHt9KTtcbiAgICAgIGFjdGlvbnNUYWtlbi5wdXNoKHtcbiAgICAgICAgYWN0aW9uOiAnYXBwbHlfdmFsaWRhdGlvbl9tb2RlJyxcbiAgICAgICAgc3RhdHVzOiAnYXBwbGllZCcsXG4gICAgICAgIGRldGFpbDogYCR7cGF0Y2guYnJhaW5Qcm92aWRlciB8fCAnJ30vJHtwYXRjaC5icmFpbk1vZGVsIHx8ICcnfWAucmVwbGFjZSgvXlxcL3xcXC8kL2csICcnKVxuICAgICAgfSk7XG4gICAgICB3b3JraW5nU2V0dGluZ3MgPSB7IC4uLndvcmtpbmdTZXR0aW5ncywgLi4ucGF0Y2ggfTtcbiAgICB9XG4gIH1cblxuICBjb25zdCB0YWIgPSBhd2FpdCBxdWVyeUFjdGl2ZVRhYigpLmNhdGNoKCgpID0+IG51bGwpO1xuICBpZiAoIXRhYj8uaWQpIHtcbiAgICBpc3N1ZXMucHVzaCh7XG4gICAgICBjb2RlOiAnbm9fYWN0aXZlX3RhYicsXG4gICAgICBzZXZlcml0eTogJ2hpZ2gnLFxuICAgICAgbWVzc2FnZTogJ05vIGFjdGl2ZSB0YWIgYXZhaWxhYmxlIGZvciBjb250ZW50IHJ1bnRpbWUgY2hlY2tzLidcbiAgICB9KTtcbiAgfVxuXG4gIGxldCBjb250ZW50UGluZyA9IHsgb2s6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSB0YWIgYXZhaWxhYmxlLicgfTtcbiAgaWYgKHRhYj8uaWQpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcGluZyA9IGF3YWl0IHNlbmRDb250ZW50TWVzc2FnZVdpdGhSZXRyeSh0YWIuaWQsIHsgdHlwZTogJ19fQklMR0VfUElOR19fJyB9KTtcbiAgICAgIGNvbnN0IG9rID0gcGluZz8ub2sgPT09IHRydWU7XG4gICAgICBjb250ZW50UGluZyA9IG9rID8geyBvazogdHJ1ZSB9IDogeyBvazogZmFsc2UsIGVycm9yOiAnVW5leHBlY3RlZCBjb250ZW50IHBpbmcgcmVzcG9uc2UuJyB9O1xuICAgICAgaWYgKCFvaykge1xuICAgICAgICBpc3N1ZXMucHVzaCh7XG4gICAgICAgICAgY29kZTogJ2NvbnRlbnRfcnVudGltZV91bnJlYWNoYWJsZScsXG4gICAgICAgICAgc2V2ZXJpdHk6ICdoaWdoJyxcbiAgICAgICAgICBtZXNzYWdlOiAnQ29udGVudCBydW50aW1lIGRpZCBub3QgcmV0dXJuIGEgaGVhbHRoeSBwaW5nLidcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjb25zdCBtc2cgPSB0b0Vycm9yTWVzc2FnZShlcnIpO1xuICAgICAgY29udGVudFBpbmcgPSB7IG9rOiBmYWxzZSwgZXJyb3I6IG1zZyB9O1xuICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICBjb2RlOiAnY29udGVudF9ydW50aW1lX3VucmVhY2hhYmxlJyxcbiAgICAgICAgc2V2ZXJpdHk6ICdoaWdoJyxcbiAgICAgICAgbWVzc2FnZTogbXNnXG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBsZXQgZG9tU25hcHNob3QgPSBudWxsO1xuICBpZiAodGFiPy5pZCAmJiBpbmNsdWRlRG9tU25hcHNob3QpIHtcbiAgICBkb21TbmFwc2hvdCA9IGF3YWl0IGJ1aWxkU3RydWN0dXJlZERvbVNuYXBzaG90KHRhYi5pZCkuY2F0Y2goKCkgPT4gbnVsbCk7XG4gIH1cblxuICBsZXQgc2NyZWVuc2hvdCA9ICcnO1xuICBpZiAodGFiPy5pZCAmJiBpbmNsdWRlU2NyZWVuc2hvdCkge1xuICAgIHNjcmVlbnNob3QgPSBhd2FpdCBjYXB0dXJlVmlzaWJsZVRhYkRhdGFVcmwodGFiLndpbmRvd0lkID8/IG51bGwpLmNhdGNoKCgpID0+ICcnKTtcbiAgfVxuXG4gIGNvbnN0IHNlbGZBd2FyZW5lc3MgPSB7XG4gICAgaWRlbnRpdHk6IHtcbiAgICAgIHBlcnNvbmE6ICdiaWxnZV9hZ2VudCcsXG4gICAgICBydW50aW1lOiAnY2hyb21lX2V4dGVuc2lvbicsXG4gICAgICBzZXBhcmF0ZWRGcm9tQmlsZ2VXZWI6IHRydWUsXG4gICAgICBhZ2VudElkOiBhZ2VudElkIHx8IHJlbGF5QWZ0ZXIuYWdlbnRJZCB8fCByZWxheUFnZW50SWRDYWNoZSB8fCAnJyxcbiAgICAgIHNvdXJjZTogJ2JhY2tncm91bmQuc2VsZl9pbXByb3ZlbWVudF9tb2RlJ1xuICAgIH0sXG4gICAgYWNjZXNzOiB7XG4gICAgICBicm93c2VyQXV0b21hdGlvbjogdHJ1ZSxcbiAgICAgIG1jcEJyaWRnZTogdHJ1ZSxcbiAgICAgIHJlbGF5RGlzcGF0Y2g6IHRydWUsXG4gICAgICBzY3JlZW5zaG90Q2FwdHVyZTogdHJ1ZSxcbiAgICAgIHNoZWxsQWNjZXNzVmlhTWNwOiB0cnVlXG4gICAgfSxcbiAgICBib3VuZGFyaWVzOiB7XG4gICAgICBiaWxnZUFnZW50OiAnQ2hyb21lIGV4dGVuc2lvbiBydW50aW1lIHBlcnNvbmEgdXNlZCBmb3IgcmVsYXkgKyBNQ1AgdG9vbGluZy4nLFxuICAgICAgYmlsZ2VXZWI6ICdDaGF0IHBlcnNvbmEgaW4gQmlsZ2Ugd2ViIFVJOyBtdXN0IHN0YXkgbG9naWNhbGx5IHNlcGFyYXRlLidcbiAgICB9LFxuICAgIGNvbXBvbmVudHM6IGJ1aWxkU2VsZkF3YXJlbmVzc0NvbXBvbmVudHMoXG4gICAgICB3b3JraW5nU2V0dGluZ3MsXG4gICAgICByZWxheUFmdGVyLFxuICAgICAgYXBwU2V0dGluZ3MsXG4gICAgICBjb250ZW50UGluZy5vayA9PT0gdHJ1ZSxcbiAgICAgIHRhYlxuICAgIClcbiAgfTtcblxuICBjb25zdCBzdWdnZXN0ZWROZXh0QWN0aW9ucyA9IFtcbiAgICAnVXNlIHRhbGtfdG9fYmlsZ2VfYWdlbnRfYnJhaW4gZm9yIHRhcmdldGVkIGJyb3dzZXIgYWN0aW9ucyBhZnRlciBkaWFnbm9zdGljcy4nLFxuICAgICdVc2UgZGlzcGF0Y2hfYWdlbnRfY29tbWFuZCB3aXRoIFRSQUlOSU5HX1BST0JFIHRvIGNvbGxlY3QgcmljaGVyIGZvcm0gKyBET00gdGVsZW1ldHJ5LicsXG4gICAgYFJ1biBtdWx0aW1vZGFsIHZhbGlkYXRpb24gd2l0aCAke3ZhbGlkYXRpb25Nb2RlLnJlY29tbWVuZGVkUHJvdmlkZXJ9LyR7dmFsaWRhdGlvbk1vZGUucmVjb21tZW5kZWRNb2RlbH0gYmVmb3JlIGhpZ2gtcmlzayBhdXRvbWF0aW9uLmBcbiAgXTtcbiAgaWYgKCFyZWxheUFmdGVyLmNvbm5lY3RlZCkge1xuICAgIHN1Z2dlc3RlZE5leHRBY3Rpb25zLnVuc2hpZnQoJ1Jlc3RvcmUgcmVsYXkgd2Vic29ja2V0IHNlcnZpY2UgKDEyNy4wLjAuMTo4Nzg3IG9yIDEyNy4wLjAuMToxODA4MCksIHRoZW4gcmUtcnVuIHNlbGYtaW1wcm92ZW1lbnQgbW9kZS4nKTtcbiAgfVxuICBpZiAoIWNvbnRlbnRQaW5nLm9rKSB7XG4gICAgc3VnZ2VzdGVkTmV4dEFjdGlvbnMudW5zaGlmdCgnT3BlbiBhIG5vcm1hbCBodHRwL2h0dHBzIHBhZ2UgYW5kIGVuc3VyZSBjb250ZW50IHNjcmlwdCBpcyByZWFjaGFibGUsIHRoZW4gcmUtcnVuIHNlbGYtaW1wcm92ZW1lbnQgbW9kZS4nKTtcbiAgfVxuXG4gIGNvbnN0IHN1bW1hcnkgPVxuICAgIGlzc3Vlcy5sZW5ndGggPT09IDBcbiAgICAgID8gJ1NlbGYtaW1wcm92ZW1lbnQgY2hlY2sgY29tcGxldGUuIFJ1bnRpbWUgaXMgaGVhbHRoeSBhbmQgcmVhZHkgZm9yIGF1dG9ub21vdXMgbWFpbnRlbmFuY2UuJ1xuICAgICAgOiBgU2VsZi1pbXByb3ZlbWVudCBjaGVjayBmb3VuZCAke2lzc3Vlcy5sZW5ndGh9IGlzc3VlKHMpLiAke2F1dG9IZWFsID8gJ0F1dG8taGVhbCBhdHRlbXB0ZWQgd2hlcmUgc2FmZS4nIDogJ0F1dG8taGVhbCBkaXNhYmxlZC4nfWA7XG5cbiAgaWYgKHJlc3RhcnRBZnRlcikge1xuICAgIGFjdGlvbnNUYWtlbi5wdXNoKHtcbiAgICAgIGFjdGlvbjogJ3Jlc3RhcnRfZXh0ZW5zaW9uJyxcbiAgICAgIHN0YXR1czogJ3NjaGVkdWxlZCcsXG4gICAgICBkZXRhaWw6ICdFeHRlbnNpb24gcmVsb2FkIHNjaGVkdWxlZCBhZnRlciBzZWxmLWltcHJvdmVtZW50IHJlc3BvbnNlLidcbiAgICB9KTtcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNocm9tZS5ydW50aW1lLnJlbG9hZCgpO1xuICAgICAgfSBjYXRjaCAoX2Vycikge31cbiAgICB9LCAyNTApO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBvazogdHJ1ZSxcbiAgICBjb21tYW5kOiAnU0VMRl9JTVBST1ZFJyxcbiAgICBwcm90b2NvbDogJ3NlbGYtaW1wcm92ZW1lbnQtdjEnLFxuICAgIHBlcnNvbmE6ICdiaWxnZV9hZ2VudCcsXG4gICAgc3VtbWFyeSxcbiAgICBkdXJhdGlvbk1zOiBEYXRlLm5vdygpIC0gc3RhcnRlZEF0LFxuICAgIHNlbGZBd2FyZW5lc3MsXG4gICAgZGlhZ25vc3RpY3M6IHtcbiAgICAgIGF1dG9IZWFsLFxuICAgICAgcmVzdGFydEFmdGVyLFxuICAgICAgcmVsYXlCZWZvcmUsXG4gICAgICByZWxheUFmdGVyLFxuICAgICAgY29udGVudFBpbmcsXG4gICAgICBhY3RpdmVUYWI6IHRhYlxuICAgICAgICA/IHsgaWQ6IE51bWJlcih0YWIuaWQgfHwgMCksIHVybDogU3RyaW5nKHRhYi51cmwgfHwgJycpLCB0aXRsZTogU3RyaW5nKHRhYi50aXRsZSB8fCAnJykgfVxuICAgICAgICA6IG51bGwsXG4gICAgICBkb21TbmFwc2hvdCxcbiAgICAgIGlzc3VlcyxcbiAgICAgIGFjdGlvbnNUYWtlblxuICAgIH0sXG4gICAgdmFsaWRhdGlvbk1vZGUsXG4gICAgcmVzdWx0OiB7XG4gICAgICByZWFkeTogaXNzdWVzLmxlbmd0aCA9PT0gMCxcbiAgICAgIGlzc3VlQ291bnQ6IGlzc3Vlcy5sZW5ndGgsXG4gICAgICBzdWdnZXN0ZWROZXh0QWN0aW9uc1xuICAgIH0sXG4gICAgcmVzdGFydFNjaGVkdWxlZDogcmVzdGFydEFmdGVyLFxuICAgIC4uLihzY3JlZW5zaG90ID8geyBzY3JlZW5zaG90IH0gOiB7fSlcbiAgfTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEFJIFJvdXRpbmcgJiBDb3J0ZXggSW50ZWdyYXRpb25cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5jb25zdCBST1VUSU5HX01PREVTID0gT2JqZWN0LmZyZWV6ZSh7IEJVSUxUSU46ICdidWlsdGluJywgQ09SVEVYOiAnY29ydGV4JyB9KTtcbmNvbnN0IERFRkFVTFRfUk9VVElOR19NT0RFID0gUk9VVElOR19NT0RFUy5CVUlMVElOO1xuXG4vKipcbiAqIFJlc29sdmVzIHByb3ZpZGVyL21vZGVsIGJhc2VkIG9uIHJvdXRpbmcgbW9kZSB3aXRoIGludGVsbGlnZW50IGZhbGxiYWNrc1xuICogQHBhcmFtIHtzdHJpbmd9IHVzZXJDb21tYW5kIC0gVGhlIHVzZXIncyBpbnB1dCBjb21tYW5kXG4gKiBAcGFyYW0ge29iamVjdH0gc2V0dGluZ3MgLSBDdXJyZW50IHNldHRpbmdzIGZyb20gc3RvcmFnZVxuICogQHBhcmFtIHtvYmplY3R9IGNvbnRleHQgLSBPcHRpb25hbCBjb250ZXh0ICh1cmwsIHRpdGxlKVxuICogQHJldHVybnMge29iamVjdH0geyBtb2RlLCBwcm92aWRlciwgbW9kZWwsIHN5c3RlbVByb21wdCwgZXhlY3V0b3IsIG1ldGEgfVxuICovXG5mdW5jdGlvbiByZXNvbHZlUm91dGluZ1dpdGhJbnRlbGxpZ2VudEZhbGxiYWNrKHVzZXJDb21tYW5kLCBzZXR0aW5ncywgY29udGV4dCA9IHt9KSB7XG4gIGNvbnN0IHJvdXRpbmdNb2RlID0gc2V0dGluZ3Mucm91dGluZ01vZGUgfHwgREVGQVVMVF9ST1VUSU5HX01PREU7XG4gIGNvbnN0IGRlZmF1bHRQcm92aWRlciA9IHNldHRpbmdzLmJyYWluUHJvdmlkZXIgfHwgRU5WLkRFRkFVTFRfQlJBSU5fUFJPVklERVI7XG4gIGNvbnN0IGRlZmF1bHRNb2RlbCA9IHNldHRpbmdzLmJyYWluTW9kZWwgfHwgRU5WLkRFRkFVTFRfQlJBSU5fTU9ERUw7XG5cbiAgLy8gXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXG4gIC8vIExFVkVMIDE6IFRyeSBjb25maWd1cmVkIHJvdXRpbmcgbW9kZSAoQ29ydGV4IG9yIEJ1aWx0LWluKVxuICAvLyBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcblxuICBpZiAocm91dGluZ01vZGUgPT09IFJPVVRJTkdfTU9ERVMuQ09SVEVYICYmIGdsb2JhbFRoaXMuQ29ydGV4Py5hbmFseXplSW50ZW50KSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGludGVudEluZm8gPSBnbG9iYWxUaGlzLkNvcnRleC5hbmFseXplSW50ZW50KHVzZXJDb21tYW5kKTtcbiAgICAgIGNvbnN0IHN0cmF0ZWd5ID0gZ2xvYmFsVGhpcy5Db3J0ZXguc2VsZWN0U3RyYXRlZ3koaW50ZW50SW5mbywgeyBcbiAgICAgICAgcHJvdmlkZXI6IHNldHRpbmdzLmJyYWluUHJvdmlkZXIsIFxuICAgICAgICBtb2RlbDogc2V0dGluZ3MuYnJhaW5Nb2RlbCBcbiAgICAgIH0sIHtcbiAgICAgICAgcHJlZmVyU3BlZWQ6IHNldHRpbmdzLmNvcnRleFByZWZlclNwZWVkLFxuICAgICAgICBwcmVmZXJDb3N0OiBzZXR0aW5ncy5jb3J0ZXhQcmVmZXJDb3N0XG4gICAgICB9KTtcblxuICAgICAgaWYgKHN0cmF0ZWd5Py5wcm92aWRlcikge1xuICAgICAgICBjb25zdCBzeXN0ZW1Qcm9tcHQgPSBnbG9iYWxUaGlzLkNvcnRleEV4dENvbmZpZz8ucmVuZGVyVGVtcGxhdGUoXG4gICAgICAgICAgc2V0dGluZ3MuYnJhaW5TeXN0ZW1UZW1wbGF0ZSB8fCBnbG9iYWxUaGlzLkNvcnRleEV4dENvbmZpZy5ERUZBVUxUX0JSQUlOX1NZU1RFTV9URU1QTEFURSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBnb2FsOiB1c2VyQ29tbWFuZCxcbiAgICAgICAgICAgIHVybDogY29udGV4dC51cmwgfHwgJycsXG4gICAgICAgICAgICB0aXRsZTogY29udGV4dC50aXRsZSB8fCAnJyxcbiAgICAgICAgICAgIG1vZGU6IHNldHRpbmdzLmV4ZWN1dGlvbk1vZGUgfHwgJ2JhdGNoJyxcbiAgICAgICAgICAgIGFsbG93X3NjcmlwdF9hY3Rpb25zOiBzZXR0aW5ncy5hbGxvd1NjcmlwdEFjdGlvbnMgfHwgZmFsc2UsXG4gICAgICAgICAgICBjb3J0ZXhfaW50ZW50OiBpbnRlbnRJbmZvPy5jYXRlZ29yeSB8fCAnJyxcbiAgICAgICAgICAgIGNvcnRleF9zdHJhdGVneTogYCR7c3RyYXRlZ3kucHJvdmlkZXJ9LyR7c3RyYXRlZ3kubW9kZWx9YCxcbiAgICAgICAgICAgIGNvcnRleF9oaW50czogc3RyYXRlZ3k/LnN0cmF0ZWd5IHx8ICcnXG4gICAgICAgICAgfVxuICAgICAgICApO1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgbW9kZTogJ2NvcnRleCcsXG4gICAgICAgICAgcHJvdmlkZXI6IHN0cmF0ZWd5LnByb3ZpZGVyLFxuICAgICAgICAgIG1vZGVsOiBzdHJhdGVneS5tb2RlbCxcbiAgICAgICAgICBzeXN0ZW1Qcm9tcHQsXG4gICAgICAgICAgZXhlY3V0b3I6ICdzdGFuZGFyZCcsXG4gICAgICAgICAgbWV0YTogeyBpbnRlbnQ6IGludGVudEluZm8sIHN0cmF0ZWd5IH1cbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLndhcm4oJ1tSb3V0aW5nXSBDb3J0ZXggZmFpbGVkLCB0cnlpbmcgYnVpbHRpbiBmYWxsYmFjazonLCBlKTtcbiAgICB9XG4gIH1cblxuICAvLyBCdWlsdC1pbiAvIEZhbGxiYWNrIEFJXG4gIGlmIChyb3V0aW5nTW9kZSA9PT0gUk9VVElOR19NT0RFUy5CVUlMVElOIHx8IHJvdXRpbmdNb2RlID09PSBST1VUSU5HX01PREVTLkNPUlRFWCkge1xuICAgIGNvbnN0IHN5c3RlbVByb21wdCA9IGdsb2JhbFRoaXMuQ29ydGV4RXh0Q29uZmlnPy5yZW5kZXJUZW1wbGF0ZShcbiAgICAgIHNldHRpbmdzLmJyYWluU3lzdGVtVGVtcGxhdGUgfHwgZ2xvYmFsVGhpcy5Db3J0ZXhFeHRDb25maWcuREVGQVVMVF9CUkFJTl9TWVNURU1fVEVNUExBVEUsXG4gICAgICB7XG4gICAgICAgIGdvYWw6IHVzZXJDb21tYW5kLFxuICAgICAgICB1cmw6IGNvbnRleHQudXJsIHx8ICcnLFxuICAgICAgICB0aXRsZTogY29udGV4dC50aXRsZSB8fCAnJyxcbiAgICAgICAgbW9kZTogc2V0dGluZ3MuZXhlY3V0aW9uTW9kZSB8fCAnYmF0Y2gnLFxuICAgICAgICBhbGxvd19zY3JpcHRfYWN0aW9uczogc2V0dGluZ3MuYWxsb3dTY3JpcHRBY3Rpb25zIHx8IGZhbHNlLFxuICAgICAgICBjb3J0ZXhfaW50ZW50OiAnJyxcbiAgICAgICAgY29ydGV4X3N0cmF0ZWd5OiAnJyxcbiAgICAgICAgY29ydGV4X2hpbnRzOiAnJ1xuICAgICAgfVxuICAgICk7XG4gICAgcmV0dXJuIHtcbiAgICAgIG1vZGU6ICdidWlsdGluJyxcbiAgICAgIHByb3ZpZGVyOiBkZWZhdWx0UHJvdmlkZXIsXG4gICAgICBtb2RlbDogZGVmYXVsdE1vZGVsLFxuICAgICAgc3lzdGVtUHJvbXB0LFxuICAgICAgZXhlY3V0b3I6ICdzdGFuZGFyZCcsXG4gICAgICBtZXRhOiB7IHNvdXJjZTogJ3N0b3JhZ2UnIH1cbiAgICB9O1xuICB9XG5cbiAgLy8gXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXG4gIC8vIExFVkVMIDI6IEludGVsbGlnZW50IERPTSBFbmdpbmUgKG5vIEFJIG5lZWRlZCBmb3Igc2ltcGxlIHBhdHRlcm5zKVxuICAvLyBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcblxuICBjb25zdCBzaW1wbGVQYXR0ZXJucyA9IFtcbiAgICB7IHBhdHRlcm46IC9eZmlsbFxccysoZm9ybXxhbGx8ZmllbGRzPykvaSwgYWN0aW9uOiAnZmlsbF9mb3JtJyB9LFxuICAgIHsgcGF0dGVybjogL15maWxsXFxzKyguKz8pXFxzKyg/OndpdGh8YXN8dG8pXFxzKyguKykkL2ksIGFjdGlvbjogJ2ZpbGxfZmllbGQnIH0sXG4gICAgeyBwYXR0ZXJuOiAvXmNsaWNrXFxzKyguKykkL2ksIGFjdGlvbjogJ2NsaWNrJyB9LFxuICAgIHsgcGF0dGVybjogL150eXBlXFxzKyguKz8pXFxzKyg/OmludG98aW4pXFxzKyguKykkL2ksIGFjdGlvbjogJ3R5cGUnIH0sXG4gICAgeyBwYXR0ZXJuOiAvXnNjcm9sbFxccysoZG93bnx1cHx0b1xccysuKykkL2ksIGFjdGlvbjogJ3Njcm9sbCcgfSxcbiAgICB7IHBhdHRlcm46IC9ec3VibWl0L2ksIGFjdGlvbjogJ3N1Ym1pdCcgfVxuICBdO1xuXG4gIGZvciAoY29uc3QgeyBwYXR0ZXJuLCBhY3Rpb24gfSBvZiBzaW1wbGVQYXR0ZXJucykge1xuICAgIGNvbnN0IG1hdGNoID0gdXNlckNvbW1hbmQubWF0Y2gocGF0dGVybik7XG4gICAgaWYgKG1hdGNoKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBtb2RlOiAnaW50ZWxsaWdlbnRfZG9tJyxcbiAgICAgICAgcHJvdmlkZXI6IG51bGwsXG4gICAgICAgIG1vZGVsOiBudWxsLFxuICAgICAgICBleGVjdXRvcjogJ2JpbGdlX2V4ZWN1dGlvbl9lbmdpbmUnLFxuICAgICAgICBhY3Rpb24sXG4gICAgICAgIHBhcmFtczogbWF0Y2guc2xpY2UoMSksXG4gICAgICAgIG1ldGE6IHsgcGF0dGVybjogcGF0dGVybi5zb3VyY2UsIGRpcmVjdDogdHJ1ZSB9XG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIC8vIFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFxuICAvLyBMRVZFTCAzOiBET00gRW5naW5lIHdpdGggaW50ZW50IGluZmVyZW5jZSAoTGFzdCBSZXNvcnQpXG4gIC8vIFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFxuXG4gIHJldHVybiB7XG4gICAgbW9kZTogJ2ludGVsbGlnZW50X2RvbV9pbmZlcmVuY2UnLFxuICAgIHByb3ZpZGVyOiBudWxsLFxuICAgIG1vZGVsOiBudWxsLFxuICAgIGV4ZWN1dG9yOiAnYmlsZ2VfZXhlY3V0aW9uX2VuZ2luZScsXG4gICAgYWN0aW9uOiAnaW50ZWxsaWdlbnQnLFxuICAgIGludGVudDogdXNlckNvbW1hbmQsXG4gICAgbWV0YTogeyBpbmZlcnJlZDogdHJ1ZSB9XG4gIH07XG59XG5cbi8qKlxuICogRXhlY3V0ZXMgYSBjb21tYW5kIGJhc2VkIG9uIHJvdXRpbmcgZGVjaXNpb25cbiAqL1xuYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZVdpdGhSb3V0aW5nKHJvdXRpbmcsIGNvbnRleHQpIHtcbiAgY29uc3QgeyB0YWJJZCB9ID0gY29udGV4dDtcblxuICAvLyBBSS1CQVNFRCBFWEVDVVRJT05cbiAgaWYgKHJvdXRpbmcuZXhlY3V0b3IgPT09ICdzdGFuZGFyZCcgJiYgcm91dGluZy5wcm92aWRlcikge1xuICAgIC8vIEN1cnJlbnQgZmxvdyBmb3IgaGFuZGxlTmF0dXJhbENvbW1hbmQgc3RpbGwgdXNlcyBjb250ZW50IHNjcmlwdCBwYXJzaW5nXG4gICAgLy8gZm9yIGRpcmVjdCBicm93c2VyIGNvbW1hbmRzLiBXZSBvbmx5IHJvdXRlIHRvIHBvc3RBbmFseXplU2NyZWVuIGlmIGl0J3MgYnJvYWQuXG4gICAgcmV0dXJuIG51bGw7IC8vIFNpZ25hbHMgdG8gY29udGludWUgd2l0aCBsZWdhY3kgZmxvdyBmb3Igbm93IG9yIHVzZSB0aGUgcm91dGluZyBtZXRhZGF0YVxuICB9XG5cbiAgLy8gRElSRUNUIERPTSBFWEVDVVRJT04gKE5vIEFJKVxuICBpZiAocm91dGluZy5leGVjdXRvciA9PT0gJ2JpbGdlX2V4ZWN1dGlvbl9lbmdpbmUnKSB7XG4gICAgY29uc3QgZGF0YSA9IHt9O1xuICAgIGlmIChyb3V0aW5nLmFjdGlvbiA9PT0gJ2ZpbGxfZm9ybScpIHtcbiAgICAgIGNvbnN0IHByb2ZpbGUgPSBhd2FpdCBsb2FkUHJvZmlsZSgpO1xuICAgICAgZGF0YS5wcm9maWxlID0gcHJvZmlsZTtcbiAgICB9IGVsc2UgaWYgKHJvdXRpbmcuYWN0aW9uID09PSAnZmlsbF9maWVsZCcpIHtcbiAgICAgIGRhdGEuc2VsZWN0b3IgPSByb3V0aW5nLnBhcmFtc1swXTtcbiAgICAgIGRhdGEudmFsdWUgPSByb3V0aW5nLnBhcmFtc1sxXTtcbiAgICB9IGVsc2UgaWYgKHJvdXRpbmcuYWN0aW9uID09PSAnY2xpY2snKSB7XG4gICAgICBkYXRhLnRhcmdldCA9IHJvdXRpbmcucGFyYW1zWzBdO1xuICAgIH0gZWxzZSBpZiAocm91dGluZy5hY3Rpb24gPT09ICdpbnRlbGxpZ2VudCcpIHtcbiAgICAgIGRhdGEudGV4dCA9IHJvdXRpbmcuaW50ZW50O1xuICAgIH1cblxuICAgIHJldHVybiBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgY2hyb21lLnRhYnMuc2VuZE1lc3NhZ2UodGFiSWQsIHsgXG4gICAgICAgIHR5cGU6ICdFTkdJTkVfRVhFQ1VURScsIFxuICAgICAgICBpbnRlbnQ6IHsgdHlwZTogcm91dGluZy5hY3Rpb24gfSwgXG4gICAgICAgIGRhdGEgXG4gICAgICB9LCAocmVzKSA9PiB7XG4gICAgICAgIHJlc29sdmUocmVzIHx8IHsgb2s6IGZhbHNlLCBlcnJvcjogJ05vIHJlc3BvbnNlIGZyb20gZXhlY3V0aW9uIGVuZ2luZScgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdObyB2YWxpZCBleGVjdXRvciByZXNvbHZlZCcgfTtcbn1cblxuLyoqXG4gKiBIYW5kbGUgbmF0dXJhbCBsYW5ndWFnZSBjb21tYW5kcyB2aWEgY29ydGV4XG4gKiBTdXBwb3J0cyBjb21tYW5kcyBsaWtlIFwic2Nyb2xsIHVwXCIsIFwic2Nyb2xsIGRvd25cIiwgXCJjbGljayBvbiBTdWJtaXRcIiwgZXRjLlxuICovXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVOYXR1cmFsQ29tbWFuZChjb21tYW5kLCBzZXR0aW5ncykge1xuICBpZiAoc2V0dGluZ3MubWFzdGVyQWN0aXZlID09PSBmYWxzZSkge1xuICAgIHRocm93IG5ldyBFcnJvcignTUFTVEVSX0FDVElWRSBpcyBPRkY7IE5BVFVSQUxfQ09NTUFORCBibG9ja2VkLicpO1xuICB9XG5cbiAgY29uc3QgcGF5bG9hZCA9IGNvbW1hbmQucGF5bG9hZCB8fCB7fTtcbiAgY29uc3QgY29tbWFuZFRleHQgPSBTdHJpbmcocGF5bG9hZC5jb21tYW5kIHx8IHBheWxvYWQudGV4dCB8fCBwYXlsb2FkLmlucHV0IHx8ICcnKS50cmltKCk7XG4gIGNvbnN0IHJlcXVlc3RlZFBlcnNvbmEgPSBub3JtYWxpemVCcmFpblBlcnNvbmEoXG4gICAgcGF5bG9hZC5wZXJzb25hIHx8IHBheWxvYWQuYnJhaW4gfHwgcGF5bG9hZC50YXJnZXRQZXJzb25hIHx8IHBheWxvYWQudGFyZ2V0XG4gICk7XG4gIGNvbnN0IHN0cmljdFBlcnNvbmEgPSBjb2VyY2VCb29sZWFuKHBheWxvYWQuc3RyaWN0UGVyc29uYSwgdHJ1ZSk7XG5cbiAgaWYgKCFjb21tYW5kVGV4dCkge1xuICAgIHRocm93IG5ldyBFcnJvcignTm8gY29tbWFuZCB0ZXh0IHByb3ZpZGVkIGZvciBOQVRVUkFMX0NPTU1BTkQnKTtcbiAgfVxuICBpZiAoc3RyaWN0UGVyc29uYSAmJiByZXF1ZXN0ZWRQZXJzb25hICE9PSAnYmlsZ2VfYWdlbnQnKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgYE5BVFVSQUxfQ09NTUFORCByZWxheSBpcyBzY29wZWQgdG8gQmlsZ2UgQWdlbnQgcGVyc29uYS4gUmVxdWVzdGVkIHBlcnNvbmEgXCIke3JlcXVlc3RlZFBlcnNvbmF9XCIgc2hvdWxkIHVzZSBCaWxnZSBXZWIgY2hhdCBjaGFubmVsLmBcbiAgICApO1xuICB9XG5cbiAgaWYgKGlzU2VsZkltcHJvdmVtZW50TmF0dXJhbENvbW1hbmQoY29tbWFuZFRleHQpKSB7XG4gICAgY29uc3QgdGFyZ2V0QWdlbnRJZCA9IHNldHRpbmdzLmFnZW50SWQgfHwgcmVsYXlBZ2VudElkQ2FjaGUgfHwgYXdhaXQgZW5zdXJlUmVsYXlBZ2VudElkKCk7XG4gICAgcmV0dXJuIGF3YWl0IGhhbmRsZVNlbGZJbXByb3ZlQ29tbWFuZChcbiAgICAgIHtcbiAgICAgICAgLi4uY29tbWFuZCxcbiAgICAgICAgdHlwZTogJ1NFTEZfSU1QUk9WRScsXG4gICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICAuLi5wYXlsb2FkLFxuICAgICAgICAgIGNvbW1hbmQ6IGNvbW1hbmRUZXh0LFxuICAgICAgICAgIHBlcnNvbmE6IHJlcXVlc3RlZFBlcnNvbmEsXG4gICAgICAgICAgc291cmNlOiBwYXlsb2FkLnNvdXJjZSB8fCAnbmF0dXJhbF9jb21tYW5kLnNlbGZfaW1wcm92ZW1lbnQnXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBzZXR0aW5ncyxcbiAgICAgIHRhcmdldEFnZW50SWRcbiAgICApO1xuICB9XG5cbiAgY29uc3QgdGFiID0gYXdhaXQgcXVlcnlBY3RpdmVUYWIoKTtcbiAgaWYgKCF0YWI/LmlkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyBhY3RpdmUgdGFiIGF2YWlsYWJsZSBmb3IgTkFUVVJBTF9DT01NQU5EJyk7XG4gIH1cblxuICBtc2dMb2dnZXIuaW5mbygnUHJvY2Vzc2luZyBuYXR1cmFsIGxhbmd1YWdlIGNvbW1hbmQnLCB7IGNvbW1hbmQ6IGNvbW1hbmRUZXh0LCBwZXJzb25hOiByZXF1ZXN0ZWRQZXJzb25hIH0pO1xuICBjb25zdCBzdGFydGVkQXQgPSBEYXRlLm5vdygpO1xuXG4gIGlmIChpc0FnZW50U3RhdHVzTmF0dXJhbENvbW1hbmQoY29tbWFuZFRleHQpKSB7XG4gICAgY29uc3QgcnVucyA9IFtdO1xuICAgIGZvciAoY29uc3QgW3J1bklkLCBzdGF0ZV0gb2YgYWN0aXZlUnVucy5lbnRyaWVzKCkpIHtcbiAgICAgIGNvbnN0IGVudHJ5ID0ge1xuICAgICAgICBydW5JZCxcbiAgICAgICAgY2FuY2VsbGVkOiBCb29sZWFuKHN0YXRlPy5jYW5jZWxsZWQpLFxuICAgICAgICBzdGFydFRpbWU6IE51bWJlcihzdGF0ZT8uc3RhcnRUaW1lIHx8IDApLFxuICAgICAgICBhZ2VNczogTnVtYmVyKHN0YXRlPy5zdGFydFRpbWUgPyBEYXRlLm5vdygpIC0gc3RhdGUuc3RhcnRUaW1lIDogMCksXG4gICAgICAgIHRhYklkOiB0eXBlb2Ygc3RhdGU/LnRhYklkID09PSAnbnVtYmVyJyA/IHN0YXRlLnRhYklkIDogbnVsbCxcbiAgICAgICAgd2luZG93SWQ6IHR5cGVvZiBzdGF0ZT8ud2luZG93SWQgPT09ICdudW1iZXInID8gc3RhdGUud2luZG93SWQgOiBudWxsLFxuICAgICAgICBwYWdlU3RhdGU6IG51bGxcbiAgICAgIH07XG4gICAgICBpZiAodHlwZW9mIHN0YXRlPy50YWJJZCA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgZW50cnkucGFnZVN0YXRlID0gYXdhaXQgcmVhZFJ1blN0YXRlRnJvbVBhZ2Uoc3RhdGUudGFiSWQsIHJ1bklkKTtcbiAgICAgIH1cbiAgICAgIHJ1bnMucHVzaChlbnRyeSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiB0cnVlLFxuICAgICAgcHJvdG9jb2w6ICduYXR1cmFsLWNvbW1hbmQtdjMtc3RhdHVzJyxcbiAgICAgIGNhdGNoTW9kZTogJ3N0YXR1cycsXG4gICAgICBjb21tYW5kOiAnTkFUVVJBTF9DT01NQU5EJyxcbiAgICAgIHBlcnNvbmE6IHJlcXVlc3RlZFBlcnNvbmEsXG4gICAgICBpbnB1dDogY29tbWFuZFRleHQsXG4gICAgICByZXN1bHQ6IHtcbiAgICAgICAgYWN0aXZlUnVuczogcnVucyxcbiAgICAgICAgYWN0aXZlUnVuQ291bnQ6IHJ1bnMubGVuZ3RoLFxuICAgICAgICByZWxheTogZ2V0UmVsYXlTdGF0dXMoKVxuICAgICAgfSxcbiAgICAgIGR1cmF0aW9uTXM6IERhdGUubm93KCkgLSBzdGFydGVkQXRcbiAgICB9O1xuICB9XG5cbiAgLy8gLS0tIE5FVzogSU5URUxMSUdFTlQgUk9VVElORyAtLS1cbiAgY29uc3Qgcm91dGluZyA9IHJlc29sdmVSb3V0aW5nV2l0aEludGVsbGlnZW50RmFsbGJhY2soY29tbWFuZFRleHQsIHNldHRpbmdzLCB7XG4gICAgdXJsOiB0YWIudXJsLFxuICAgIHRpdGxlOiB0YWIudGl0bGVcbiAgfSk7XG5cbiAgY29uc3Qgcm91dGluZ1Jlc3VsdCA9IGF3YWl0IGV4ZWN1dGVXaXRoUm91dGluZyhyb3V0aW5nLCB7IHRhYklkOiB0YWIuaWQgfSk7XG4gIGlmIChyb3V0aW5nUmVzdWx0KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiByb3V0aW5nUmVzdWx0Lm9rICE9PSBmYWxzZSxcbiAgICAgIHByb3RvY29sOiAnbmF0dXJhbC1jb21tYW5kLXYzLWVuZ2luZScsXG4gICAgICBjYXRjaE1vZGU6IHJvdXRpbmcubW9kZSxcbiAgICAgIGNvbW1hbmQ6ICdOQVRVUkFMX0NPTU1BTkQnLFxuICAgICAgcGVyc29uYTogcmVxdWVzdGVkUGVyc29uYSxcbiAgICAgIGlucHV0OiBjb21tYW5kVGV4dCxcbiAgICAgIHJlc3VsdDogcm91dGluZ1Jlc3VsdCxcbiAgICAgIGR1cmF0aW9uTXM6IERhdGUubm93KCkgLSBzdGFydGVkQXQsXG4gICAgICByb3V0aW5nTWV0YTogcm91dGluZy5tZXRhXG4gICAgfTtcbiAgfVxuXG4gIGlmIChpc1NjcmVlbnNob3ROYXR1cmFsQ29tbWFuZChjb21tYW5kVGV4dCkpIHtcbiAgICBjb25zdCBzY3JlZW5zaG90ID0gYXdhaXQgY2FwdHVyZVZpc2libGVUYWJEYXRhVXJsKHRhYi53aW5kb3dJZCA/PyBudWxsKTtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IHRydWUsXG4gICAgICBwcm90b2NvbDogJ25hdHVyYWwtY29tbWFuZC12MicsXG4gICAgICBjYXRjaE1vZGU6ICdkaXJlY3QnLFxuICAgICAgY29tbWFuZDogJ05BVFVSQUxfQ09NTUFORCcsXG4gICAgICBwZXJzb25hOiByZXF1ZXN0ZWRQZXJzb25hLFxuICAgICAgaW5wdXQ6IGNvbW1hbmRUZXh0LFxuICAgICAgcmVzdWx0OiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIGFjdGlvbjogJ3Rha2Vfc2NyZWVuc2hvdCcsXG4gICAgICAgIHNjcmVlbnNob3RcbiAgICAgIH1cbiAgICB9O1xuICB9XG5cbiAgLy8gU2VuZCB0byBjb250ZW50IHNjcmlwdCBmb3IgcGFyc2luZy9leGVjdXRpb24gd2l0aCBzZWxmLWhlYWxpbmcgKyBjYXRjaCBtb2RlLlxuICBsZXQgcmVzdWx0ID0gbnVsbDtcbiAgdHJ5IHtcbiAgICByZXN1bHQgPSBhd2FpdCBzZW5kQ29udGVudE1lc3NhZ2VXaXRoUmV0cnkodGFiLmlkLCB7XG4gICAgICB0eXBlOiAnRVhFQ1VURV9OQVRVUkFMX0NPTU1BTkQnLFxuICAgICAgY29tbWFuZDogY29tbWFuZFRleHQsXG4gICAgICBwZXJzb25hOiByZXF1ZXN0ZWRQZXJzb25hXG4gICAgfSk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJlc3VsdCA9IHsgZXJyb3I6IHRvRXJyb3JNZXNzYWdlKGVyciksIGNhdGNoTW9kZTogJ3RyYW5zcG9ydC1lcnJvcicsIHByb3RvY29sOiAnbmF0dXJhbC1jb21tYW5kLXYyJyB9O1xuICB9XG5cbiAgaWYgKHJlc3VsdD8uZXJyb3IpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgcHJvdG9jb2w6IHJlc3VsdD8ucHJvdG9jb2wgfHwgJ25hdHVyYWwtY29tbWFuZC12MicsXG4gICAgICBjYXRjaE1vZGU6IHJlc3VsdD8uY2F0Y2hNb2RlIHx8ICdmYWlsZWQnLFxuICAgICAgY29tbWFuZDogJ05BVFVSQUxfQ09NTUFORCcsXG4gICAgICBwZXJzb25hOiByZXF1ZXN0ZWRQZXJzb25hLFxuICAgICAgaW5wdXQ6IGNvbW1hbmRUZXh0LFxuICAgICAgZXJyb3I6IHJlc3VsdC5lcnJvcixcbiAgICAgIGR1cmF0aW9uTXM6IERhdGUubm93KCkgLSBzdGFydGVkQXRcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBvazogdHJ1ZSxcbiAgICBwcm90b2NvbDogcmVzdWx0Py5wcm90b2NvbCB8fCAnbmF0dXJhbC1jb21tYW5kLXYyJyxcbiAgICBjYXRjaE1vZGU6IHJlc3VsdD8uY2F0Y2hNb2RlIHx8ICdkaXJlY3QnLFxuICAgIHJlY292ZXJlZDogcmVzdWx0Py5zZWxmSGVhbGVkID09PSB0cnVlLFxuICAgIGNvbW1hbmRNZW1vcnlIaXQ6IHJlc3VsdD8uY29tbWFuZE1lbW9yeUhpdCA9PT0gdHJ1ZSxcbiAgICBjb21tYW5kOiAnTkFUVVJBTF9DT01NQU5EJyxcbiAgICBwZXJzb25hOiByZXF1ZXN0ZWRQZXJzb25hLFxuICAgIGlucHV0OiBjb21tYW5kVGV4dCxcbiAgICByZXN1bHQsXG4gICAgZHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHN0YXJ0ZWRBdFxuICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBkaXNwYXRjaFJlbGF5Q29tbWFuZChjb21tYW5kKSB7XG4gIGNvbnN0IHNldHRpbmdzID0gYXdhaXQgZ2V0UmVsYXlTZXR0aW5ncygpO1xuICByZWxheUFnZW50SWRDYWNoZSA9IHNldHRpbmdzLmFnZW50SWQgfHwgcmVsYXlBZ2VudElkQ2FjaGU7XG4gIGNvbnN0IGFnZW50SWQgPSBzZXR0aW5ncy5hZ2VudElkIHx8IHJlbGF5QWdlbnRJZENhY2hlIHx8IGF3YWl0IGVuc3VyZVJlbGF5QWdlbnRJZCgpO1xuXG4gIGlmIChjb21tYW5kLmFnZW50SWQgJiYgY29tbWFuZC5hZ2VudElkICE9PSBhZ2VudElkKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiB0cnVlLFxuICAgICAgaWdub3JlZDogdHJ1ZSxcbiAgICAgIHJlYXNvbjogYENvbW1hbmQgdGFyZ2V0ZWQgdG8gJHtjb21tYW5kLmFnZW50SWR9LCBsb2NhbCBhZ2VudCBpcyAke2FnZW50SWR9YFxuICAgIH07XG4gIH1cblxuICBpZiAoY29tbWFuZC50eXBlID09PSAnQVBQTFlfUFJFU0VUUycpIHtcbiAgICByZXR1cm4gYXdhaXQgYXBwbHlSZWxheVByZXNldHMoY29tbWFuZC5wYXlsb2FkPy5wcmVzZXRzIHx8IGNvbW1hbmQucGF5bG9hZCB8fCB7fSk7XG4gIH1cbiAgaWYgKGNvbW1hbmQudHlwZSA9PT0gJ0NBUFRVUkVfU0NSRUVOJykge1xuICAgIHJldHVybiBhd2FpdCBoYW5kbGVDYXB0dXJlU2NyZWVuQ29tbWFuZChjb21tYW5kLCBzZXR0aW5ncywgYWdlbnRJZCk7XG4gIH1cbiAgaWYgKGNvbW1hbmQudHlwZSA9PT0gJ0VYRUNVVEVfQUNUSU9OUycpIHtcbiAgICByZXR1cm4gYXdhaXQgaGFuZGxlRXhlY3V0ZUFjdGlvbnNDb21tYW5kKGNvbW1hbmQsIHNldHRpbmdzKTtcbiAgfVxuICBpZiAoY29tbWFuZC50eXBlID09PSAnVFJBSU5JTkdfUFJPQkUnKSB7XG4gICAgcmV0dXJuIGF3YWl0IGhhbmRsZVRyYWluaW5nUHJvYmVDb21tYW5kKGNvbW1hbmQsIHNldHRpbmdzLCBhZ2VudElkKTtcbiAgfVxuICBpZiAoY29tbWFuZC50eXBlID09PSAnU0VMRl9JTVBST1ZFJykge1xuICAgIHJldHVybiBhd2FpdCBoYW5kbGVTZWxmSW1wcm92ZUNvbW1hbmQoY29tbWFuZCwgc2V0dGluZ3MsIGFnZW50SWQpO1xuICB9XG4gIGlmIChjb21tYW5kLnR5cGUgPT09ICdOQVRVUkFMX0NPTU1BTkQnKSB7XG4gICAgcmV0dXJuIGF3YWl0IGhhbmRsZU5hdHVyYWxDb21tYW5kKGNvbW1hbmQsIHNldHRpbmdzKTtcbiAgfVxuICB0aHJvdyBuZXcgRXJyb3IoYFVuc3VwcG9ydGVkIGNvbW1hbmQgdHlwZTogJHtjb21tYW5kLnR5cGV9YCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVJlbGF5U29ja2V0TWVzc2FnZShldmVudCwgd3NSZWYpIHtcbiAgaWYgKHJlbGF5U29ja2V0ICE9PSB3c1JlZikgcmV0dXJuO1xuICBpZiAoIWV2ZW50IHx8IHR5cGVvZiBldmVudC5kYXRhICE9PSAnc3RyaW5nJykgcmV0dXJuO1xuXG4gIGxldCBkYXRhID0gbnVsbDtcbiAgdHJ5IHtcbiAgICBkYXRhID0gSlNPTi5wYXJzZShldmVudC5kYXRhKTtcbiAgfSBjYXRjaCAoX2Vycikge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoIWRhdGEgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm47XG5cbiAgY29uc3QgcmF3VHlwZSA9IFN0cmluZyhkYXRhLnR5cGUgfHwgJycpLnRyaW0oKS50b1VwcGVyQ2FzZSgpO1xuICBpZiAocmF3VHlwZSA9PT0gJ1BJTkcnIHx8IHJhd1R5cGUgPT09ICdBR0VOVF9QSU5HJyB8fCByYXdUeXBlID09PSAnQUdFTlRfSEVBUlRCRUFUJyB8fCByYXdUeXBlID09PSAnQUdFTlQuSEVBUlRCRUFUJykge1xuICAgIHJlbGF5U2VuZEZyYW1lKHtcbiAgICAgIHR5cGU6ICdhZ2VudC5oZWFydGJlYXQnLFxuICAgICAgYWdlbnRfaWQ6IHJlbGF5QWdlbnRJZENhY2hlIHx8ICcnLFxuICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpXG4gICAgfSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgY29tbWFuZCA9IHBhcnNlSW5jb21pbmdSZWxheUNvbW1hbmQoZGF0YSk7XG4gIGlmICghY29tbWFuZCkgcmV0dXJuO1xuXG4gIGNvbnN0IGxvY2FsQWdlbnRJZCA9IHJlbGF5QWdlbnRJZENhY2hlIHx8IGF3YWl0IGVuc3VyZVJlbGF5QWdlbnRJZCgpO1xuICBpZiAoIWNvbW1hbmQuaXNKc29uUnBjKSB7XG4gICAgc2VuZFJlbGF5QWNrKGxvY2FsQWdlbnRJZCwgY29tbWFuZC50cmFjZU1ldGEsIGNvbW1hbmQudHlwZSk7XG4gIH1cblxuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRpc3BhdGNoUmVsYXlDb21tYW5kKGNvbW1hbmQpO1xuICAgIGlmIChjb21tYW5kLmlzSnNvblJwYyAmJiBjb21tYW5kLnJwY0lkICE9PSBudWxsICYmIGNvbW1hbmQucnBjSWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgcmVsYXlTZW5kSnNvblJwY1Jlc3VsdChjb21tYW5kLnJwY0lkLCByZXN1bHQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZW5kUmVsYXlSZXN1bHQobG9jYWxBZ2VudElkLCBjb21tYW5kLnRyYWNlTWV0YSwgY29tbWFuZC50eXBlLCB7IHN1Y2Nlc3M6IHJlc3VsdD8ub2sgIT09IGZhbHNlLCByZXN1bHQgfSk7XG4gICAgfVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zdCBtZXNzYWdlID0gdG9FcnJvck1lc3NhZ2UoZXJyKTtcbiAgICBpZiAoY29tbWFuZC5pc0pzb25ScGMgJiYgY29tbWFuZC5ycGNJZCAhPT0gbnVsbCAmJiBjb21tYW5kLnJwY0lkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHJlbGF5U2VuZEpzb25ScGNFcnJvcihjb21tYW5kLnJwY0lkLCBtZXNzYWdlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2VuZFJlbGF5RXJyb3IobG9jYWxBZ2VudElkLCBjb21tYW5kLnRyYWNlTWV0YSwgY29tbWFuZC50eXBlLCBtZXNzYWdlKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZGlzY29ubmVjdFJlbGF5KHJlYXNvbiA9ICdtYW51YWwnKSB7XG4gIGNsZWFyUmVsYXlSZWNvbm5lY3RUaW1lcigpO1xuICBzdG9wUmVsYXlIZWFydGJlYXQoKTtcbiAgaWYgKHJlbGF5U29ja2V0KSB7XG4gICAgY29uc3QgY3VycmVudCA9IHJlbGF5U29ja2V0O1xuICAgIHJlbGF5U29ja2V0ID0gbnVsbDtcbiAgICB0cnkge1xuICAgICAgY3VycmVudC5jbG9zZSgxMDAwLCByZWFzb24pO1xuICAgIH0gY2F0Y2ggKF9lcnIpIHt9XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVsYXlIb3N0RnJvbVdzVXJsKHdzVXJsKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIG5ldyBVUkwod3NVcmwpLmhvc3Q7XG4gIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICByZXR1cm4gd3NVcmw7XG4gIH1cbn1cblxuZnVuY3Rpb24gcHJpb3JpdGl6ZVJlbGF5Q2FuZGlkYXRlcyhjYW5kaWRhdGVzKSB7XG4gIGNvbnN0IHVuaXF1ZSA9IEFycmF5LmZyb20obmV3IFNldCgoQXJyYXkuaXNBcnJheShjYW5kaWRhdGVzKSA/IGNhbmRpZGF0ZXMgOiBbXSkuZmlsdGVyKEJvb2xlYW4pKSk7XG4gIGlmICghcmVsYXlMYXN0VXJsKSByZXR1cm4gdW5pcXVlO1xuICBjb25zdCBwcmVmZXJyZWQgPSB1bmlxdWUuZmlsdGVyKChjYW5kaWRhdGUpID0+IGNhbmRpZGF0ZSA9PT0gcmVsYXlMYXN0VXJsKTtcbiAgY29uc3QgcmVzdCA9IHVuaXF1ZS5maWx0ZXIoKGNhbmRpZGF0ZSkgPT4gY2FuZGlkYXRlICE9PSByZWxheUxhc3RVcmwpO1xuICByZXR1cm4gWy4uLnByZWZlcnJlZCwgLi4ucmVzdF07XG59XG5cbmZ1bmN0aW9uIGJpbmRSZWxheVNvY2tldCh3cywgd3NVcmwpIHtcbiAgd3Mub25tZXNzYWdlID0gKGV2ZW50KSA9PiB7XG4gICAgaGFuZGxlUmVsYXlTb2NrZXRNZXNzYWdlKGV2ZW50LCB3cykuY2F0Y2goKGVycikgPT4ge1xuICAgICAgYmdMb2dnZXIud2FybignUmVsYXkgbWVzc2FnZSBoYW5kbGluZyBmYWlsZWQnLCB7IGVycm9yOiB0b0Vycm9yTWVzc2FnZShlcnIpIH0pO1xuICAgIH0pO1xuICB9O1xuXG4gIHdzLm9uY2xvc2UgPSAoZXZlbnQpID0+IHtcbiAgICBpZiAocmVsYXlTb2NrZXQgIT09IHdzKSByZXR1cm47XG4gICAgcmVsYXlTb2NrZXQgPSBudWxsO1xuICAgIHN0b3BSZWxheUhlYXJ0YmVhdCgpO1xuICAgIHNhZmVTZW5kUnVudGltZU1lc3NhZ2Uoe1xuICAgICAgdHlwZTogJ0NPTk5FQ1RJT05fU1RBVFVTJyxcbiAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgc3RhdHVzOiAnT0ZGJyxcbiAgICAgICAgY29kZTogTnVtYmVyKGV2ZW50Py5jb2RlIHx8IDApLFxuICAgICAgICByZWFzb246IFN0cmluZyhldmVudD8ucmVhc29uIHx8ICcnKSxcbiAgICAgICAgYWdlbnRJZDogcmVsYXlBZ2VudElkQ2FjaGUgfHwgJydcbiAgICAgIH1cbiAgICB9KTtcbiAgICBzY2hlZHVsZVJlbGF5UmVjb25uZWN0KCk7XG4gIH07XG5cbiAgd3Mub25lcnJvciA9IChlcnIpID0+IHtcbiAgICBpZiAocmVsYXlTb2NrZXQgIT09IHdzKSByZXR1cm47XG4gICAgYmdMb2dnZXIud2FybignUmVsYXkgV2ViU29ja2V0IGVycm9yJywgeyB3c1VybCwgZXJyb3I6IHRvRXJyb3JNZXNzYWdlKGVycikgfSk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIGRpYWxSZWxheVNvY2tldCh3c1VybCwgdGltZW91dE1zID0gUkVMQVlfQ09OTkVDVF9USU1FT1VUX01TKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgbGV0IHdzID0gbnVsbDtcbiAgICBsZXQgc2V0dGxlZCA9IGZhbHNlO1xuICAgIGxldCB0aW1lb3V0SGFuZGxlID0gbnVsbDtcblxuICAgIGNvbnN0IGZpbmlzaCA9IChvaywgdmFsdWUpID0+IHtcbiAgICAgIGlmIChzZXR0bGVkKSByZXR1cm47XG4gICAgICBzZXR0bGVkID0gdHJ1ZTtcbiAgICAgIGlmICh0aW1lb3V0SGFuZGxlKSB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0SGFuZGxlKTtcbiAgICAgICAgdGltZW91dEhhbmRsZSA9IG51bGw7XG4gICAgICB9XG4gICAgICBpZiAod3MpIHtcbiAgICAgICAgd3Mub25vcGVuID0gbnVsbDtcbiAgICAgICAgd3Mub25jbG9zZSA9IG51bGw7XG4gICAgICAgIHdzLm9uZXJyb3IgPSBudWxsO1xuICAgICAgfVxuICAgICAgaWYgKG9rKSByZXNvbHZlKHZhbHVlKTtcbiAgICAgIGVsc2UgcmVqZWN0KHZhbHVlKTtcbiAgICB9O1xuXG4gICAgdHJ5IHtcbiAgICAgIHdzID0gbmV3IFdlYlNvY2tldCh3c1VybCk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBmaW5pc2goZmFsc2UsIGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyIDogbmV3IEVycm9yKHRvRXJyb3JNZXNzYWdlKGVycikpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aW1lb3V0SGFuZGxlID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICB3cy5jbG9zZSgxMDAwLCAnY29ubmVjdF90aW1lb3V0Jyk7XG4gICAgICB9IGNhdGNoIChfZXJyKSB7fVxuICAgICAgZmluaXNoKGZhbHNlLCBuZXcgRXJyb3IoYFJlbGF5IGNvbm5lY3QgdGltZW91dCAoJHt0aW1lb3V0TXN9bXMpIGZvciAke3dzVXJsfWApKTtcbiAgICB9LCB0aW1lb3V0TXMpO1xuXG4gICAgd3Mub25vcGVuID0gKCkgPT4ge1xuICAgICAgZmluaXNoKHRydWUsIHdzKTtcbiAgICB9O1xuICAgIHdzLm9uZXJyb3IgPSAoKSA9PiB7XG4gICAgICBmaW5pc2goZmFsc2UsIG5ldyBFcnJvcihgUmVsYXkgc29ja2V0IGVycm9yIGZvciAke3dzVXJsfWApKTtcbiAgICB9O1xuICAgIHdzLm9uY2xvc2UgPSAoZXZlbnQpID0+IHtcbiAgICAgIGZpbmlzaChmYWxzZSwgbmV3IEVycm9yKGBSZWxheSBjbG9zZWQgYmVmb3JlIG9wZW4gKCR7TnVtYmVyKGV2ZW50Py5jb2RlIHx8IDApfSkgZm9yICR7d3NVcmx9YCkpO1xuICAgIH07XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBwdWJsaXNoUmVsYXlDb25uZWN0ZWQod3NVcmwsIHdzKSB7XG4gIHJlbGF5U29ja2V0ID0gd3M7XG4gIHJlbGF5TGFzdFVybCA9IHdzVXJsO1xuICByZWxheVJlY29ubmVjdEF0dGVtcHRzID0gMDtcbiAgY2xlYXJSZWxheVJlY29ubmVjdFRpbWVyKCk7XG4gIGJpbmRSZWxheVNvY2tldCh3cywgd3NVcmwpO1xuICBzdGFydFJlbGF5SGVhcnRiZWF0KHJlbGF5QWdlbnRJZENhY2hlIHx8ICcnLCB3cyk7XG4gIHJlbGF5U2VuZEZyYW1lKHtcbiAgICB0eXBlOiAnQUdFTlRfSEVMTE8nLFxuICAgIGFnZW50X2lkOiByZWxheUFnZW50SWRDYWNoZSB8fCAnJyxcbiAgICBleHRlbnNpb25fdmVyc2lvbjogY2hyb21lLnJ1bnRpbWUuZ2V0TWFuaWZlc3QoKT8udmVyc2lvbiB8fCAndW5rbm93bicsXG4gICAgY2FwYWJpbGl0aWVzOiBbJ0NBUFRVUkVfU0NSRUVOJywgJ0VYRUNVVEVfQUNUSU9OUycsICdBUFBMWV9QUkVTRVRTJywgJ1RSQUlOSU5HX1BST0JFJywgJ05BVFVSQUxfQ09NTUFORCcsICdTRUxGX0lNUFJPVkUnLCAncHJvdG9jb2xfdjInXSxcbiAgICB0aW1lc3RhbXA6IERhdGUubm93KClcbiAgfSk7XG4gIHNhZmVTZW5kUnVudGltZU1lc3NhZ2Uoe1xuICAgIHR5cGU6ICdDT05ORUNUSU9OX1NUQVRVUycsXG4gICAgcGF5bG9hZDoge1xuICAgICAgc3RhdHVzOiAnT04nLFxuICAgICAgaG9zdDogcmVsYXlIb3N0RnJvbVdzVXJsKHdzVXJsKSxcbiAgICAgIGFnZW50SWQ6IHJlbGF5QWdlbnRJZENhY2hlIHx8ICcnXG4gICAgfVxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY29ubmVjdFJlbGF5T25jZSgpIHtcbiAgY2xlYXJSZWxheVJlY29ubmVjdFRpbWVyKCk7XG4gIGNvbnN0IHNldHRpbmdzID0gYXdhaXQgZ2V0UmVsYXlTZXR0aW5ncygpO1xuICByZWxheUFnZW50SWRDYWNoZSA9IHNldHRpbmdzLmFnZW50SWQgfHwgcmVsYXlBZ2VudElkQ2FjaGU7XG5cbiAgaWYgKHNldHRpbmdzLm1hc3RlckFjdGl2ZSA9PT0gZmFsc2UpIHtcbiAgICBkaXNjb25uZWN0UmVsYXkoJ21hc3Rlcl9vZmYnKTtcbiAgICByZXR1cm4gZ2V0UmVsYXlTdGF0dXMoKTtcbiAgfVxuXG4gIGNvbnN0IGNhbmRpZGF0ZXMgPSBwcmlvcml0aXplUmVsYXlDYW5kaWRhdGVzKGJ1aWxkUmVsYXlXc0NhbmRpZGF0ZXMoc2V0dGluZ3MpKTtcbiAgaWYgKGNhbmRpZGF0ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyByZWxheSB3ZWJzb2NrZXQgY2FuZGlkYXRlcyBjb25maWd1cmVkJyk7XG4gIH1cblxuICBpZiAocmVsYXlTb2NrZXQpIHtcbiAgICBjb25zdCBvbGRTb2NrZXQgPSByZWxheVNvY2tldDtcbiAgICByZWxheVNvY2tldCA9IG51bGw7XG4gICAgc3RvcFJlbGF5SGVhcnRiZWF0KCk7XG4gICAgdHJ5IHtcbiAgICAgIG9sZFNvY2tldC5jbG9zZSgxMDAwLCAncmVjb25uZWN0Jyk7XG4gICAgfSBjYXRjaCAoX2Vycikge31cbiAgfVxuXG4gIGNvbnN0IGZhaWx1cmVzID0gW107XG4gIGZvciAoY29uc3Qgd3NVcmwgb2YgY2FuZGlkYXRlcykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB3cyA9IGF3YWl0IGRpYWxSZWxheVNvY2tldCh3c1VybCwgUkVMQVlfQ09OTkVDVF9USU1FT1VUX01TKTtcbiAgICAgIHB1Ymxpc2hSZWxheUNvbm5lY3RlZCh3c1VybCwgd3MpO1xuICAgICAgcmV0dXJuIGdldFJlbGF5U3RhdHVzKCk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSB0b0Vycm9yTWVzc2FnZShlcnIpO1xuICAgICAgZmFpbHVyZXMucHVzaChgJHt3c1VybH0gPT4gJHtlcnJvck1lc3NhZ2V9YCk7XG4gICAgICBiZ0xvZ2dlci53YXJuKCdSZWxheSBjYW5kaWRhdGUgZmFpbGVkJywgeyB3c1VybCwgZXJyb3I6IGVycm9yTWVzc2FnZSB9KTtcbiAgICB9XG4gIH1cblxuICBjb25zdCByZWFzb24gPSBmYWlsdXJlcy5qb2luKCcgfCAnKSB8fCAnVW5rbm93biByZWxheSBjb25uZWN0aW9uIGVycm9yJztcbiAgc2FmZVNlbmRSdW50aW1lTWVzc2FnZSh7XG4gICAgdHlwZTogJ0NPTk5FQ1RJT05fU1RBVFVTJyxcbiAgICBwYXlsb2FkOiB7XG4gICAgICBzdGF0dXM6ICdPRkYnLFxuICAgICAgcmVhc29uLFxuICAgICAgYWdlbnRJZDogcmVsYXlBZ2VudElkQ2FjaGUgfHwgJydcbiAgICB9XG4gIH0pO1xuICB0aHJvdyBuZXcgRXJyb3IoYFVuYWJsZSB0byBjb25uZWN0IHJlbGF5OiAke3JlYXNvbn1gKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY29ubmVjdFJlbGF5KCkge1xuICBpZiAocmVsYXlDb25uZWN0SW5GbGlnaHQpIHtcbiAgICByZXR1cm4gcmVsYXlDb25uZWN0SW5GbGlnaHQ7XG4gIH1cbiAgcmVsYXlDb25uZWN0SW5GbGlnaHQgPSAoYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYXdhaXQgY29ubmVjdFJlbGF5T25jZSgpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICByZWxheUNvbm5lY3RJbkZsaWdodCA9IG51bGw7XG4gICAgfVxuICB9KSgpO1xuICByZXR1cm4gcmVsYXlDb25uZWN0SW5GbGlnaHQ7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGluaXRpYWxpemVSZWxheUNsaWVudCgpIHtcbiAgdHJ5IHtcbiAgICBhd2FpdCBlbnN1cmVSZWxheUFnZW50SWQoKTtcbiAgICBhd2FpdCBjb25uZWN0UmVsYXkoKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgYmdMb2dnZXIud2FybignUmVsYXkgaW5pdCBmYWlsZWQnLCB7IGVycm9yOiB0b0Vycm9yTWVzc2FnZShlcnIpIH0pO1xuICAgIHNjaGVkdWxlUmVsYXlSZWNvbm5lY3QoKTtcbiAgfVxufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQmF0Y2ggQWN0aW9uIEV4ZWN1dG9yIENvbmZpZ3VyYXRpb25cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmNvbnN0IEhVTUFOSVpFRF9ERUxBWV9CQVNFX0RFRkFVTFRfTVMgPSAyMjA7XG5jb25zdCBIVU1BTklaRURfREVMQVlfSklUVEVSX0RFRkFVTFRfTVMgPSAyNjA7XG5cbi8vIEFjdGl2ZSBydW4gdHJhY2tpbmcgZm9yIGNhbmNlbGxhdGlvblxuY29uc3QgYWN0aXZlUnVucyA9IG5ldyBNYXAoKTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhIHVuaXF1ZSBydW4gSURcbiAqL1xuZnVuY3Rpb24gZ2VuZXJhdGVSdW5JZCgpIHtcbiAgcmV0dXJuIGBydW5fJHtEYXRlLm5vdygpfV8ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIsIDkpfWA7XG59XG5cbi8qKlxuICogQ2FuY2VsIGFuIGFjdGl2ZSBydW5cbiAqL1xuZnVuY3Rpb24gc2FmZVNlbmRSdW50aW1lTWVzc2FnZShtZXNzYWdlKSB7XG4gIGlmIChtZXNzYWdlPy50eXBlID09PSAnQkFUQ0hfUlVOX1VQREFURScgJiYgbWVzc2FnZT8ucGF5bG9hZCkge1xuICAgIGVtaXRFeGVjdXRpb25Qcm9ncmVzc1RlbGVtZXRyeShtZXNzYWdlLnBheWxvYWQpO1xuICB9XG4gIHRyeSB7XG4gICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UobWVzc2FnZSwgKCkgPT4ge1xuICAgICAgLy8gSWdub3JlIFwiUmVjZWl2aW5nIGVuZCBkb2VzIG5vdCBleGlzdFwiIHdoZW4gc2lkZXBhbmVsIGlzIGNsb3NlZC5cbiAgICAgIHZvaWQgY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yO1xuICAgIH0pO1xuICB9IGNhdGNoIChfZXJyKSB7fVxufVxuXG5hc3luYyBmdW5jdGlvbiBtYXJrUnVuQ2FuY2VsbGVkSW5QYWdlKHRhYklkLCBydW5JZCkge1xuICBpZiAoIXRhYklkIHx8ICFydW5JZCkgcmV0dXJuO1xuICB0cnkge1xuICAgIGF3YWl0IGNocm9tZS5zY3JpcHRpbmcuZXhlY3V0ZVNjcmlwdCh7XG4gICAgICB0YXJnZXQ6IHsgdGFiSWQgfSxcbiAgICAgIHdvcmxkOiAnTUFJTicsXG4gICAgICBhcmdzOiBbcnVuSWRdLFxuICAgICAgZnVuYzogKHJpZCkgPT4ge1xuICAgICAgICBjb25zdCBrZXkgPSAnX19iaWxnZUNhbmNlbGxlZFJ1bnMnO1xuICAgICAgICBpZiAoIXdpbmRvd1trZXldIHx8IHR5cGVvZiB3aW5kb3dba2V5XSAhPT0gJ29iamVjdCcpIHdpbmRvd1trZXldID0ge307XG4gICAgICAgIHdpbmRvd1trZXldW3JpZF0gPSB0cnVlO1xuXG4gICAgICAgIGNvbnN0IHN0YXRlS2V5ID0gJ19fYmlsZ2VCYXRjaFJ1blN0YXRlJztcbiAgICAgICAgaWYgKHdpbmRvd1tzdGF0ZUtleV0gJiYgd2luZG93W3N0YXRlS2V5XVtyaWRdKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHdpbmRvd1tzdGF0ZUtleV1bcmlkXS5jYW5jZWxsZWQgPSB0cnVlO1xuICAgICAgICAgICAgd2luZG93W3N0YXRlS2V5XVtyaWRdLnN0YXR1cyA9ICdjYW5jZWxsZWQnO1xuICAgICAgICAgICAgd2luZG93W3N0YXRlS2V5XVtyaWRdLnVwZGF0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICB3aW5kb3dbc3RhdGVLZXldW3JpZF0uc2VxID0gTnVtYmVyKHdpbmRvd1tzdGF0ZUtleV1bcmlkXS5zZXEgfHwgMCkgKyAxO1xuICAgICAgICAgIH0gY2F0Y2ggKF9lcnIpIHt9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSBjYXRjaCAoX2Vycikge31cbn1cblxuYXN5bmMgZnVuY3Rpb24gY2xlYXJSdW5TdGF0ZUluUGFnZSh0YWJJZCwgcnVuSWQpIHtcbiAgaWYgKCF0YWJJZCB8fCAhcnVuSWQpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBhd2FpdCBjaHJvbWUuc2NyaXB0aW5nLmV4ZWN1dGVTY3JpcHQoe1xuICAgICAgdGFyZ2V0OiB7IHRhYklkIH0sXG4gICAgICB3b3JsZDogJ01BSU4nLFxuICAgICAgYXJnczogW3J1bklkXSxcbiAgICAgIGZ1bmM6IChyaWQpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBpZiAod2luZG93Ll9fYmlsZ2VCYXRjaFJ1blN0YXRlKSBkZWxldGUgd2luZG93Ll9fYmlsZ2VCYXRjaFJ1blN0YXRlW3JpZF07XG4gICAgICAgICAgaWYgKHdpbmRvdy5fX2JpbGdlQ2FuY2VsbGVkUnVucykgZGVsZXRlIHdpbmRvdy5fX2JpbGdlQ2FuY2VsbGVkUnVuc1tyaWRdO1xuICAgICAgICB9IGNhdGNoIChfZXJyKSB7fVxuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfVxuICAgIH0pO1xuICB9IGNhdGNoIChfZXJyKSB7fVxufVxuXG5hc3luYyBmdW5jdGlvbiByZWFkUnVuU3RhdGVGcm9tUGFnZSh0YWJJZCwgcnVuSWQpIHtcbiAgaWYgKCF0YWJJZCB8fCAhcnVuSWQpIHJldHVybiBudWxsO1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBjaHJvbWUuc2NyaXB0aW5nLmV4ZWN1dGVTY3JpcHQoe1xuICAgICAgdGFyZ2V0OiB7IHRhYklkIH0sXG4gICAgICB3b3JsZDogJ01BSU4nLFxuICAgICAgYXJnczogW3J1bklkXSxcbiAgICAgIGZ1bmM6IChyaWQpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBzdGF0ZSA9ICh3aW5kb3cuX19iaWxnZUJhdGNoUnVuU3RhdGUgfHwge30pW3JpZF07XG4gICAgICAgICAgcmV0dXJuIHN0YXRlICYmIHR5cGVvZiBzdGF0ZSA9PT0gJ29iamVjdCcgPyBzdGF0ZSA6IG51bGw7XG4gICAgICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHRzPy5bMF0/LnJlc3VsdCA/PyBudWxsO1xuICB9IGNhdGNoIChfZXJyKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gY2FuY2VsUnVuKHJ1bklkKSB7XG4gIGNvbnN0IHN0YXRlID0gYWN0aXZlUnVucy5nZXQocnVuSWQpO1xuICBpZiAoIXN0YXRlKSByZXR1cm4gZmFsc2U7XG4gIHN0YXRlLmNhbmNlbGxlZCA9IHRydWU7XG5cbiAgY29uc3QgdGFiSWQgPSBzdGF0ZS50YWJJZDtcbiAgaWYgKHR5cGVvZiB0YWJJZCA9PT0gJ251bWJlcicpIHtcbiAgICBhd2FpdCBtYXJrUnVuQ2FuY2VsbGVkSW5QYWdlKHRhYklkLCBydW5JZCk7XG4gIH1cblxuICBzYWZlU2VuZFJ1bnRpbWVNZXNzYWdlKHsgdHlwZTogJ0JBVENIX1JVTl9VUERBVEUnLCBwYXlsb2FkOiB7IHJ1bklkLCBzdGF0dXM6ICdjYW5jZWxsaW5nJywgY2FuY2VsbGVkOiB0cnVlIH0gfSk7XG4gIHJldHVybiB0cnVlO1xufVxuXG5jb25zdCBSRVNUUklDVEVEX1NDSEVNRV9QUkVGSVhFUyA9IFtcbiAgJ2Nocm9tZTovLycsXG4gICdjaHJvbWUtZXh0ZW5zaW9uOi8vJyxcbiAgJ2VkZ2U6Ly8nLFxuICAnYWJvdXQ6JyxcbiAgJ2RldnRvb2xzOi8vJ1xuXTtcblxuZnVuY3Rpb24gaXNSZXN0cmljdGVkVXJsKHJhd1VybCkge1xuICBjb25zdCB1cmwgPSBTdHJpbmcocmF3VXJsIHx8ICcnKS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgaWYgKCF1cmwpIHJldHVybiBmYWxzZTtcbiAgaWYgKFJFU1RSSUNURURfU0NIRU1FX1BSRUZJWEVTLnNvbWUoKHByZWZpeCkgPT4gdXJsLnN0YXJ0c1dpdGgocHJlZml4KSkpIHJldHVybiB0cnVlO1xuXG4gIC8vIENocm9tZSBXZWIgU3RvcmUgYmxvY2tzIGNvbnRlbnQgc2NyaXB0cyByZWdhcmRsZXNzIG9mIGhvc3QgcGVybWlzc2lvbnMuXG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgIGlmIChwYXJzZWQuaG9zdG5hbWUgPT09ICdjaHJvbWV3ZWJzdG9yZS5nb29nbGUuY29tJykgcmV0dXJuIHRydWU7XG4gICAgaWYgKHBhcnNlZC5ob3N0bmFtZSA9PT0gJ2Nocm9tZS5nb29nbGUuY29tJyAmJiBwYXJzZWQucGF0aG5hbWUuc3RhcnRzV2l0aCgnL3dlYnN0b3JlJykpIHJldHVybiB0cnVlO1xuICB9IGNhdGNoIChfZXJyKSB7fVxuXG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gc2hvdWxkUmV0cnlBZnRlck5vUmVjZWl2ZXIoZXJyKSB7XG4gIGNvbnN0IG1lc3NhZ2UgPSBTdHJpbmcoZXJyPy5tZXNzYWdlIHx8ICcnKTtcbiAgcmV0dXJuIChcbiAgICBtZXNzYWdlLmluY2x1ZGVzKCdDb3VsZCBub3QgZXN0YWJsaXNoIGNvbm5lY3Rpb24nKSB8fFxuICAgIG1lc3NhZ2UuaW5jbHVkZXMoJ1JlY2VpdmluZyBlbmQgZG9lcyBub3QgZXhpc3QnKVxuICApO1xufVxuXG5mdW5jdGlvbiBzZW5kTWVzc2FnZVRvRnJhbWUodGFiSWQsIGZyYW1lSWQsIHBheWxvYWQsIGNiKSB7XG4gIGNocm9tZS50YWJzLnNlbmRNZXNzYWdlKHRhYklkLCBwYXlsb2FkLCB7IGZyYW1lSWQgfSwgKHJlc3BvbnNlKSA9PiB7XG4gICAgY29uc3QgbGFzdEVyciA9IGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcjtcbiAgICBjYihsYXN0RXJyLCByZXNwb25zZSk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBpbmplY3RDb250ZW50U2NyaXB0KHRhYklkLCBmcmFtZUlkLCBjYikge1xuICAoYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB0cnlJbmplY3RDb250ZW50U2NyaXB0KHRhYklkLCBmcmFtZUlkKTtcbiAgICAgIC8vIExldCB0aGUgY29udGVudCBzY3JpcHQgcmVnaXN0ZXIgaXRzIG9uTWVzc2FnZSBsaXN0ZW5lciBiZWZvcmUgcmV0cnlpbmcuXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IGNiKG51bGwpLCBDT05URU5UX1NDUklQVF9SRVRSWV9ERUxBWV9NUyk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjYihlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyciA6IG5ldyBFcnJvcihTdHJpbmcoZXJyIHx8ICdGYWlsZWQgdG8gaW5qZWN0IGNvbnRlbnQgc2NyaXB0JykpKTtcbiAgICB9XG4gIH0pKCk7XG59XG5cbmZ1bmN0aW9uIGdldEFsbEZyYW1lcyh0YWJJZCwgY2IpIHtcbiAgLy8gUmVxdWlyZXMgXCJ3ZWJOYXZpZ2F0aW9uXCIgcGVybWlzc2lvbi5cbiAgY2hyb21lLndlYk5hdmlnYXRpb24uZ2V0QWxsRnJhbWVzKHsgdGFiSWQgfSwgKGZyYW1lcykgPT4ge1xuICAgIGNvbnN0IGxhc3RFcnIgPSBjaHJvbWUucnVudGltZS5sYXN0RXJyb3I7XG4gICAgY2IobGFzdEVyciwgQXJyYXkuaXNBcnJheShmcmFtZXMpID8gZnJhbWVzIDogW10pO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gaXNOb3RGb3VuZEVycm9yKHJlc3BvbnNlKSB7XG4gIGNvbnN0IG1zZyA9IFN0cmluZyhyZXNwb25zZT8uZXJyb3IgfHwgJycpO1xuICByZXR1cm4gbXNnLmluY2x1ZGVzKCcgbm90IGZvdW5kJykgfHwgbXNnLmluY2x1ZGVzKCdTZWxlY3RvciAnKSAmJiBtc2cuaW5jbHVkZXMoJyBub3QgZm91bmQnKTtcbn1cblxuZnVuY3Rpb24gaXNJbnZhbGlkU2VsZWN0b3JFcnJvcihyZXNwb25zZSkge1xuICBjb25zdCBtc2cgPSBTdHJpbmcocmVzcG9uc2U/LmVycm9yIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICByZXR1cm4gbXNnLmluY2x1ZGVzKCdpbnZhbGlkIHNlbGVjdG9yJyk7XG59XG5cbmZ1bmN0aW9uIGlzRmF0YWxDb250ZW50RXJyb3IocmVzcG9uc2UpIHtcbiAgLy8gRXJyb3JzIHRoYXQgc2hvdWxkIG5vdCBiZSByZXRyaWVkIGFjcm9zcyBmcmFtZXMuXG4gIGlmICghcmVzcG9uc2UgfHwgdHlwZW9mIHJlc3BvbnNlICE9PSAnb2JqZWN0JykgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBtc2cgPSBTdHJpbmcocmVzcG9uc2UuZXJyb3IgfHwgJycpO1xuICBpZiAoIW1zZykgcmV0dXJuIGZhbHNlO1xuICBpZiAoaXNJbnZhbGlkU2VsZWN0b3JFcnJvcihyZXNwb25zZSkpIHJldHVybiB0cnVlO1xuICBpZiAobXNnLmluY2x1ZGVzKCdNaXNzaW5nIHNlbGVjdG9yJykpIHJldHVybiB0cnVlO1xuICBpZiAobXNnLmluY2x1ZGVzKCdNaXNzaW5nIGNvZGUnKSkgcmV0dXJuIHRydWU7XG4gIHJldHVybiBmYWxzZTtcbn1cblxuY29uc3Qgcm91dGVyID0gbmV3IE1lc3NhZ2VSb3V0ZXIoKTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEhPVCBSRUxPQUQgKERldmVsb3BtZW50IG9ubHkpXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuY29uc3QgREVWX0hPVF9SRUxPQURfVEFCX0tFWSA9ICdfX2JpbGdlX2Rldl9ob3RfcmVsb2FkX2FjdGl2ZV90YWJfaWRfXyc7XG5cbmFzeW5jIGZ1bmN0aW9uIG1heWJlUmVsb2FkQWN0aXZlVGFiQWZ0ZXJIb3RSZWxvYWQoKSB7XG4gIGlmICghRU5WPy5GRUFUVVJFUz8uSE9UX1JFTE9BRCkgcmV0dXJuO1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChERVZfSE9UX1JFTE9BRF9UQUJfS0VZKTtcbiAgICBjb25zdCB0YWJJZCA9IHJlc3VsdD8uW0RFVl9IT1RfUkVMT0FEX1RBQl9LRVldO1xuICAgIGlmICh0eXBlb2YgdGFiSWQgIT09ICdudW1iZXInKSByZXR1cm47XG5cbiAgICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5yZW1vdmUoREVWX0hPVF9SRUxPQURfVEFCX0tFWSk7XG4gICAgY2hyb21lLnRhYnMucmVsb2FkKHRhYklkLCB7IGJ5cGFzc0NhY2hlOiB0cnVlIH0sICgpID0+IHt9KTtcbiAgfSBjYXRjaCB7fVxufVxuXG4vLyBJZiB0aGUgZGV2IHNlcnZlciB0cmlnZ2VyZWQgYW4gZXh0ZW5zaW9uIHJlbG9hZCwgcmVmcmVzaCB0aGUgYWN0aXZlIHRhYiBzb1xuLy8gdXBkYXRlZCBjb250ZW50IHNjcmlwdHMgZ2V0IGluamVjdGVkIHdpdGhvdXQgbWFudWFsIHBhZ2UgcmVmcmVzaC5cbnZvaWQgbWF5YmVSZWxvYWRBY3RpdmVUYWJBZnRlckhvdFJlbG9hZCgpO1xuXG5pZiAoRU5WLkZFQVRVUkVTLkhPVF9SRUxPQUQpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCByZWxvYWRXcyA9IG5ldyBXZWJTb2NrZXQoJ3dzOi8vbG9jYWxob3N0OjM1NzI5Jyk7XG4gICAgcmVsb2FkV3Mub25tZXNzYWdlID0gYXN5bmMgKGV2ZW50KSA9PiB7XG4gICAgICBjb25zdCBkYXRhID0gSlNPTi5wYXJzZShldmVudC5kYXRhKTtcbiAgICAgIGlmIChkYXRhLnR5cGUgPT09ICdyZWxvYWQnKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdbQmlsZ2VdW0Rldl0gSG90IHJlbG9hZCB0cmlnZ2VyZWQuLi4nKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB0YWIgPSBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY2hyb21lLnRhYnMucXVlcnkoeyBhY3RpdmU6IHRydWUsIGN1cnJlbnRXaW5kb3c6IHRydWUgfSwgKHRhYnMpID0+IHtcbiAgICAgICAgICAgICAgcmVzb2x2ZSh0YWJzICYmIHRhYnNbMF0gPyB0YWJzWzBdIDogbnVsbCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBjb25zdCB0YWJJZCA9IHRhYiAmJiB0eXBlb2YgdGFiLmlkID09PSAnbnVtYmVyJyA/IHRhYi5pZCA6IG51bGw7XG4gICAgICAgICAgaWYgKHR5cGVvZiB0YWJJZCA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IFtERVZfSE9UX1JFTE9BRF9UQUJfS0VZXTogdGFiSWQgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHt9XG4gICAgICAgIGNocm9tZS5ydW50aW1lLnJlbG9hZCgpO1xuICAgICAgfVxuICAgIH07XG4gICAgcmVsb2FkV3Mub25lcnJvciA9ICgpID0+IHtcbiAgICAgIC8vIFNpbGVudCBlcnJvciBpZiBzZXJ2ZXIgbm90IHJ1bm5pbmdcbiAgICB9O1xuICB9IGNhdGNoIChlKSB7XG4gICAgLy8gd2Vic29ja2V0IG1pZ2h0IG5vdCBiZSBzdXBwb3J0ZWQgb3IgcmVzdHJpY3RlZFxuICB9XG59XG5cbi8vIFJlbGF5IG1lc3NhZ2VzIGZyb20gc2lkZXBhbmVsIHRvIGNvbnRlbnQgc2NyaXB0IG9mIHRoZSBhY3RpdmUgdGFiXG5jaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKHJlcXVlc3QsIHNlbmRlciwgc2VuZFJlc3BvbnNlKSA9PiB7XG4gIC8vIEhhbmRsZSBsb2cgcmV0cmlldmFsIHJlcXVlc3RzXG4gIGlmIChyZXF1ZXN0Py50byA9PT0gJ0xPR0dFUicpIHtcbiAgICAoYXN5bmMgKCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKHJlcXVlc3QuYWN0aW9uID09PSAnZ2V0X2xvZ3MnKSB7XG4gICAgICAgICAgY29uc3QgbG9ncyA9IGF3YWl0IGJpbGdlTG9nVXRpbHMuZ2V0TG9ncyhyZXF1ZXN0Lm9wdGlvbnMgfHwge30pO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IGxvZ3MgfSk7XG4gICAgICAgIH0gZWxzZSBpZiAocmVxdWVzdC5hY3Rpb24gPT09ICdjbGVhcl9sb2dzJykge1xuICAgICAgICAgIGF3YWl0IGJpbGdlTG9nVXRpbHMuY2xlYXJMb2dzKCk7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgY2xlYXJlZDogdHJ1ZSB9KTtcbiAgICAgICAgfSBlbHNlIGlmIChyZXF1ZXN0LmFjdGlvbiA9PT0gJ2V4cG9ydF9sb2dzJykge1xuICAgICAgICAgIGNvbnN0IGpzb24gPSBhd2FpdCBiaWxnZUxvZ1V0aWxzLmV4cG9ydExvZ3MoKTtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBqc29uIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IGVycm9yOiAnVW5rbm93biBsb2dnZXIgYWN0aW9uJyB9KTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgIH1cbiAgICB9KSgpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKHJlcXVlc3Q/LnRvID09PSAnQ09OVEVOVF9TQ1JJUFQnKSB7XG4gICAgY29uc3QgbXNnVHlwZSA9IFN0cmluZyhyZXF1ZXN0LnBheWxvYWQ/LnR5cGUgfHwgJ3Vua25vd24nKTtcbiAgICBtc2dMb2dnZXIuaW5mbyhgUmVsYXlpbmcgdG8gY29udGVudCBzY3JpcHQ6ICR7bXNnVHlwZX1gLCB7IHNlbGVjdG9yOiByZXF1ZXN0LnBheWxvYWQ/LnNlbGVjdG9yIH0pO1xuXG4gICAgKGFzeW5jICgpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHRhYiA9IGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgY2hyb21lLnRhYnMucXVlcnkoeyBhY3RpdmU6IHRydWUsIGN1cnJlbnRXaW5kb3c6IHRydWUgfSwgKHRhYnMpID0+IHtcbiAgICAgICAgICAgIHJlc29sdmUodGFicyAmJiB0YWJzWzBdID8gdGFic1swXSA6IG51bGwpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoIXRhYj8uaWQpIHtcbiAgICAgICAgICBtc2dMb2dnZXIud2FybignTm8gYWN0aXZlIHRhYiBmb3VuZCBmb3IgY29udGVudCBzY3JpcHQgcmVsYXknKTtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBlcnJvcjogJ05vIGFjdGl2ZSB0YWIgZm91bmQnIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpc1Jlc3RyaWN0ZWRVcmwodGFiLnVybCkpIHtcbiAgICAgICAgICBzZW5kUmVzcG9uc2Uoe1xuICAgICAgICAgICAgZXJyb3I6XG4gICAgICAgICAgICAgIGBDYW5ub3QgYWNjZXNzIERPTSBmb3IgcmVzdHJpY3RlZCBVUkw6ICR7dGFiLnVybCB8fCAnKHVua25vd24gdXJsKSd9IGAgK1xuICAgICAgICAgICAgICBgKENocm9tZSBibG9ja3MgY29udGVudCBzY3JpcHRzIG9uIGludGVybmFsIHBhZ2VzIC8gV2ViIFN0b3JlKS5gXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcGF5bG9hZCA9IHJlcXVlc3QucGF5bG9hZDtcbiAgICAgICAgY29uc3QgbXNnVHlwZSA9IFN0cmluZyhwYXlsb2FkPy50eXBlIHx8ICcnKTtcblxuICAgICAgICAvLyBGYXN0IHBhdGg6IEdFVF9QQUdFX0lORk8gaXMgaW5oZXJlbnRseSB0b3AtZnJhbWU7IGF2b2lkIG5vaXN5IG11bHRpLWZyYW1lIHNlYXJjaGluZy5cbiAgICAgICAgaWYgKG1zZ1R5cGUgPT09ICdHRVRfUEFHRV9JTkZPJyB8fCBtc2dUeXBlID09PSAnX19CSUxHRV9QSU5HX18nKSB7XG4gICAgICAgICAgY29uc3QgZmlyc3QgPSBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgc2VuZE1lc3NhZ2VUb0ZyYW1lKHRhYi5pZCwgMCwgcGF5bG9hZCwgKGVyciwgcmVzcG9uc2UpID0+IHJlc29sdmUoeyBlcnIsIHJlc3BvbnNlIH0pKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGlmICghZmlyc3QuZXJyKSB7XG4gICAgICAgICAgICBzZW5kUmVzcG9uc2UoZmlyc3QucmVzcG9uc2UgPz8geyBlcnJvcjogJ05vIHJlc3BvbnNlIGZyb20gY29udGVudCBzY3JpcHQuJyB9KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoIXNob3VsZFJldHJ5QWZ0ZXJOb1JlY2VpdmVyKGZpcnN0LmVycikpIHtcbiAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IGVycm9yOiBmaXJzdC5lcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBDb21tb24gZHVyaW5nIG5hdmlnYXRpb246IGNvbnRlbnQgc2NyaXB0IG5vdCBpbmplY3RlZCB5ZXQuIEluamVjdCBpbiB0aGUgdG9wIGZyYW1lIGFuZCByZXRyeS5cbiAgICAgICAgICBjb25zdCBpbmplY3RlZCA9IGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBpbmplY3RDb250ZW50U2NyaXB0KHRhYi5pZCwgMCwgKGluamVjdEVycikgPT4gcmVzb2x2ZShpbmplY3RFcnIgfHwgbnVsbCkpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgaWYgKGluamVjdGVkKSB7XG4gICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBlcnJvcjogaW5qZWN0ZWQubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCByZXRyeSA9IGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBzZW5kTWVzc2FnZVRvRnJhbWUodGFiLmlkLCAwLCBwYXlsb2FkLCAoZXJyLCByZXNwb25zZSkgPT4gcmVzb2x2ZSh7IGVyciwgcmVzcG9uc2UgfSkpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgaWYgKHJldHJ5LmVycikge1xuICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgZXJyb3I6IHJldHJ5LmVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHNlbmRSZXNwb25zZShyZXRyeS5yZXNwb25zZSA/PyB7IGVycm9yOiAnTm8gcmVzcG9uc2UgZnJvbSBjb250ZW50IHNjcmlwdC4nIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE11bHRpLWZyYW1lIHNlYXJjaDogdHJ5IHRvcC1mcmFtZSBmaXJzdCwgdGhlbiBvdGhlciBmcmFtZXMgKGluY2x1ZGluZyBjcm9zcy1vcmlnaW4gaWZyYW1lcykuXG4gICAgICAgIGNvbnN0IGZyYW1lcyA9IGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgZ2V0QWxsRnJhbWVzKHRhYi5pZCwgKGVyciwgZikgPT4gcmVzb2x2ZSh7IGVyciwgZnJhbWVzOiBmIH0pKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKGZyYW1lcy5lcnIpIHtcbiAgICAgICAgICAvLyBJZiBmcmFtZSBlbnVtZXJhdGlvbiBmYWlscywgZmFsbCBiYWNrIHRvIGEgc2luZ2xlLWZyYW1lIHNlbmQgKHByZXZpb3VzIGJlaGF2aW9yKS5cbiAgICAgICAgICBzZW5kTWVzc2FnZVRvRnJhbWUodGFiLmlkLCAwLCBwYXlsb2FkLCAoZXJyLCByZXNwb25zZSkgPT4ge1xuICAgICAgICAgICAgaWYgKGVycikgc2VuZFJlc3BvbnNlKHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgZWxzZSBzZW5kUmVzcG9uc2UocmVzcG9uc2UgPz8geyBlcnJvcjogJ05vIHJlc3BvbnNlIGZyb20gY29udGVudCBzY3JpcHQuJyB9KTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBmcmFtZUlkcyA9IEFycmF5LmZyb20oXG4gICAgICAgICAgbmV3IFNldChcbiAgICAgICAgICAgIChmcmFtZXMuZnJhbWVzIHx8IFtdKVxuICAgICAgICAgICAgICAubWFwKChmKSA9PiAodHlwZW9mIGY/LmZyYW1lSWQgPT09ICdudW1iZXInID8gZi5mcmFtZUlkIDogbnVsbCkpXG4gICAgICAgICAgICAgIC5maWx0ZXIoKGlkKSA9PiB0eXBlb2YgaWQgPT09ICdudW1iZXInKVxuICAgICAgICAgIClcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBEZXRlcm1pbmlzdGljOiB0b3AgZnJhbWUgZmlyc3QuXG4gICAgICAgIGZyYW1lSWRzLnNvcnQoKGEsIGIpID0+IChhID09PSAwID8gLTEgOiBiID09PSAwID8gMSA6IGEgLSBiKSk7XG4gICAgICAgIGlmICghZnJhbWVJZHMuaW5jbHVkZXMoMCkpIGZyYW1lSWRzLnVuc2hpZnQoMCk7XG5cbiAgICAgICAgbGV0IGxhc3RSZXNwb25zZSA9IG51bGw7XG4gICAgICAgIGxldCBsYXN0RXJyb3IgPSBudWxsO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZnJhbWVJZHMubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tYXdhaXQtaW4tbG9vcFxuICAgICAgICAgIGNvbnN0IGF0dGVtcHQgPSBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgc2VuZE1lc3NhZ2VUb0ZyYW1lKHRhYi5pZCwgZnJhbWVJZHNbaV0sIHBheWxvYWQsIChlcnIsIHJlc3BvbnNlKSA9PiByZXNvbHZlKHsgZXJyLCByZXNwb25zZSB9KSk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBpZiAoYXR0ZW1wdC5lcnIgJiYgc2hvdWxkUmV0cnlBZnRlck5vUmVjZWl2ZXIoYXR0ZW1wdC5lcnIpKSB7XG4gICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tYXdhaXQtaW4tbG9vcFxuICAgICAgICAgICAgY29uc3QgaW5qZWN0RXJyID0gYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgICAgaW5qZWN0Q29udGVudFNjcmlwdCh0YWIuaWQsIGZyYW1lSWRzW2ldLCAoZXJyKSA9PiByZXNvbHZlKGVyciB8fCBudWxsKSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgaWYgKCFpbmplY3RFcnIpIHtcbiAgICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWF3YWl0LWluLWxvb3BcbiAgICAgICAgICAgICAgY29uc3QgcmV0cnkgPSBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHNlbmRNZXNzYWdlVG9GcmFtZSh0YWIuaWQsIGZyYW1lSWRzW2ldLCBwYXlsb2FkLCAoZXJyLCByZXNwb25zZSkgPT4gcmVzb2x2ZSh7IGVyciwgcmVzcG9uc2UgfSkpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgYXR0ZW1wdC5lcnIgPSByZXRyeS5lcnI7XG4gICAgICAgICAgICAgIGF0dGVtcHQucmVzcG9uc2UgPSByZXRyeS5yZXNwb25zZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGF0dGVtcHQuZXJyID0gaW5qZWN0RXJyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChhdHRlbXB0LmVycikge1xuICAgICAgICAgICAgbGFzdEVycm9yID0gYXR0ZW1wdC5lcnI7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBsYXN0UmVzcG9uc2UgPSBhdHRlbXB0LnJlc3BvbnNlID8/IG51bGw7XG4gICAgICAgICAgaWYgKGlzRmF0YWxDb250ZW50RXJyb3IobGFzdFJlc3BvbnNlKSkge1xuICAgICAgICAgICAgc2VuZFJlc3BvbnNlKGxhc3RSZXNwb25zZSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gUHJlZmVyIGEgc3VjY2VzcyByZXNwb25zZSBmcm9tIGFueSBmcmFtZS4gRm9yIHNlbGVjdG9yLWJhc2VkIG9wcywgYSBcIm5vdCBmb3VuZFwiIGluIHRoZVxuICAgICAgICAgIC8vIHRvcCBmcmFtZSBpcyBub3QgdGVybWluYWw6IHRoZSBlbGVtZW50IG1pZ2h0IGxpdmUgaW4gYSBjcm9zcy1vcmlnaW4gaWZyYW1lLlxuICAgICAgICAgIGNvbnN0IG9rID0gbGFzdFJlc3BvbnNlICYmIHR5cGVvZiBsYXN0UmVzcG9uc2UgPT09ICdvYmplY3QnICYmICFsYXN0UmVzcG9uc2UuZXJyb3I7XG4gICAgICAgICAgaWYgKG9rKSB7XG4gICAgICAgICAgICBzZW5kUmVzcG9uc2UobGFzdFJlc3BvbnNlKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoIWlzTm90Rm91bmRFcnJvcihsYXN0UmVzcG9uc2UpKSB7XG4gICAgICAgICAgICAvLyBJZiBpdCdzIGFuIGVycm9yIG90aGVyIHRoYW4gXCJub3QgZm91bmRcIiwgdHJlYXQgaXQgYXMgdGVybWluYWwgKGZpcnN0IG1hdGNoIHdpbnMpLlxuICAgICAgICAgICAgc2VuZFJlc3BvbnNlKGxhc3RSZXNwb25zZSB8fCB7IGVycm9yOiAnTm8gcmVzcG9uc2UgZnJvbSBjb250ZW50IHNjcmlwdC4nIH0pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChsYXN0UmVzcG9uc2UpIHtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UobGFzdFJlc3BvbnNlKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobGFzdEVycm9yKSB7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgZXJyb3I6IGxhc3RFcnJvci5tZXNzYWdlIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHNlbmRSZXNwb25zZSh7IGVycm9yOiAnTm8gcmVzcG9uc2UgZnJvbSBjb250ZW50IHNjcmlwdHMgKGFsbCBmcmFtZXMpLicgfSk7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc3QgbWVzc2FnZSA9IGVyciAmJiBlcnIubWVzc2FnZSA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVyciB8fCAnVW5rbm93biBlcnJvcicpO1xuICAgICAgICBzZW5kUmVzcG9uc2UoeyBlcnJvcjogbWVzc2FnZSB9KTtcbiAgICAgIH1cbiAgICB9KSgpO1xuICAgIHJldHVybiB0cnVlOyAvLyBLZWVwIGNoYW5uZWwgb3BlbiBmb3IgYXN5bmMgcmVzcG9uc2VcbiAgfVxuXG4gIGlmIChyZXF1ZXN0Py50byA9PT0gJ0JBQ0tHUk9VTkQnKSB7XG4gICAgaWYgKHJlcXVlc3QucGF5bG9hZD8uYWN0aW9uID09PSAncmVsYXlfc3RhdHVzJykge1xuICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IHRydWUsIC4uLmdldFJlbGF5U3RhdHVzKCkgfSk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKHJlcXVlc3QucGF5bG9hZD8uYWN0aW9uID09PSAncmVsYXlfcmVjb25uZWN0Jykge1xuICAgICAgY29ubmVjdFJlbGF5KClcbiAgICAgICAgLnRoZW4oKCkgPT4gc2VuZFJlc3BvbnNlKHsgb2s6IHRydWUsIC4uLmdldFJlbGF5U3RhdHVzKCkgfSkpXG4gICAgICAgIC5jYXRjaCgoZXJyKSA9PiBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiB0b0Vycm9yTWVzc2FnZShlcnIpLCAuLi5nZXRSZWxheVN0YXR1cygpIH0pKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmIChyZXF1ZXN0LnBheWxvYWQ/LmFjdGlvbiA9PT0gJ3JlbGF5X2Rpc2Nvbm5lY3QnKSB7XG4gICAgICBkaXNjb25uZWN0UmVsYXkoJ21hbnVhbF9kaXNjb25uZWN0Jyk7XG4gICAgICBzZW5kUmVzcG9uc2UoeyBvazogdHJ1ZSwgLi4uZ2V0UmVsYXlTdGF0dXMoKSB9KTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBpZiAocmVxdWVzdC5wYXlsb2FkPy5hY3Rpb24gPT09ICdyZWxheV9waW5nJykge1xuICAgICAgY29uc3Qgc2VudCA9IHJlbGF5U2VuZEZyYW1lKHtcbiAgICAgICAgdHlwZTogJ2FnZW50LmhlYXJ0YmVhdCcsXG4gICAgICAgIGFnZW50X2lkOiByZWxheUFnZW50SWRDYWNoZSB8fCAnJyxcbiAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpXG4gICAgICB9KTtcbiAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBzZW50LCAuLi5nZXRSZWxheVN0YXR1cygpIH0pO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGlmIChyZXF1ZXN0LnBheWxvYWQ/LmFjdGlvbiA9PT0gJ3JlbGF5X2Rpc3BhdGNoX2NvbW1hbmQnKSB7XG4gICAgICAoYXN5bmMgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHJlcXVlc3RlZFR5cGUgPSBTdHJpbmcocmVxdWVzdC5wYXlsb2FkPy50eXBlIHx8IHJlcXVlc3QucGF5bG9hZD8uY29tbWFuZFR5cGUgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgICBjb25zdCBub3JtYWxpemVkVHlwZSA9IG5vcm1hbGl6ZVJlbGF5Q29tbWFuZFR5cGUocmVxdWVzdGVkVHlwZSk7XG4gICAgICAgICAgaWYgKCFub3JtYWxpemVkVHlwZSkge1xuICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHtcbiAgICAgICAgICAgICAgb2s6IGZhbHNlLFxuICAgICAgICAgICAgICBlcnJvcjogYFVuc3VwcG9ydGVkIGNvbW1hbmQgdHlwZTogJHtyZXF1ZXN0ZWRUeXBlIHx8ICcoZW1wdHkpJ31gLFxuICAgICAgICAgICAgICAuLi5nZXRSZWxheVN0YXR1cygpXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCByYXdQYXlsb2FkID0gcmVxdWVzdC5wYXlsb2FkPy5wYXlsb2FkO1xuICAgICAgICAgIGNvbnN0IHBheWxvYWQgPSByYXdQYXlsb2FkICYmIHR5cGVvZiByYXdQYXlsb2FkID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShyYXdQYXlsb2FkKVxuICAgICAgICAgICAgPyByYXdQYXlsb2FkXG4gICAgICAgICAgICA6IHt9O1xuICAgICAgICAgIGNvbnN0IGNvbW1hbmQgPSB7XG4gICAgICAgICAgICB0eXBlOiBub3JtYWxpemVkVHlwZSxcbiAgICAgICAgICAgIHBheWxvYWQsXG4gICAgICAgICAgICB0cmFjZU1ldGE6IHtcbiAgICAgICAgICAgICAgcnVuSWQ6IHNhbml0aXplVHJhY2VJZChyZXF1ZXN0LnBheWxvYWQ/LnJ1bklkLCAncnVuJyksXG4gICAgICAgICAgICAgIGNvbW1hbmRJZDogc2FuaXRpemVUcmFjZUlkKHJlcXVlc3QucGF5bG9hZD8uY29tbWFuZElkLCAnY21kJylcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBhZ2VudElkOiBub3JtYWxpemVBZ2VudElkKHJlcXVlc3QucGF5bG9hZD8uYWdlbnRJZCB8fCAnJyksXG4gICAgICAgICAgICBpc0pzb25ScGM6IGZhbHNlLFxuICAgICAgICAgICAgcnBjSWQ6IG51bGxcbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGlzcGF0Y2hSZWxheUNvbW1hbmQoY29tbWFuZCk7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHtcbiAgICAgICAgICAgIG9rOiB0cnVlLFxuICAgICAgICAgICAgZGlzcGF0Y2hlZDogdHJ1ZSxcbiAgICAgICAgICAgIGNvbW1hbmRUeXBlOiBub3JtYWxpemVkVHlwZSxcbiAgICAgICAgICAgIHJlc3VsdCxcbiAgICAgICAgICAgIC4uLmdldFJlbGF5U3RhdHVzKClcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHtcbiAgICAgICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgICAgIGVycm9yOiB0b0Vycm9yTWVzc2FnZShlcnIpLFxuICAgICAgICAgICAgLi4uZ2V0UmVsYXlTdGF0dXMoKVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KSgpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ0dFVF9TRUxGX0hFQUxJTkdfU1RBVFMnKSB7XG4gICAgICAoYXN5bmMgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGtleSA9ICdfX2JpbGdlX3JlY292ZXJ5X3RlbGVtZXRyeV92MSc7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFtrZXldKTtcbiAgICAgICAgICBjb25zdCBkYXRhID0gcmVzdWx0W2tleV0gfHwge1xuICAgICAgICAgICAgdG90YWxSZWNvdmVyaWVzOiAwLFxuICAgICAgICAgICAgc3VjY2Vzc0NvdW50OiAwLFxuICAgICAgICAgICAgZmFpbHVyZUNvdW50OiAwLFxuICAgICAgICAgICAgYXZnRHVyYXRpb246IDAsXG4gICAgICAgICAgICBieVN0cmF0ZWd5OiB7fVxuICAgICAgICAgIH07XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gQ2FsY3VsYXRlIHN1Y2Nlc3MgcmF0ZVxuICAgICAgICAgIGNvbnN0IHN1Y2Nlc3NSYXRlID0gZGF0YS50b3RhbFJlY292ZXJpZXMgPiAwIFxuICAgICAgICAgICAgPyBNYXRoLnJvdW5kKChkYXRhLnN1Y2Nlc3NDb3VudCAvIGRhdGEudG90YWxSZWNvdmVyaWVzKSAqIDEwMCkgXG4gICAgICAgICAgICA6IDA7XG5cbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogdHJ1ZSwgc3RhdHM6IHsgLi4uZGF0YSwgc3VjY2Vzc1JhdGUgfSB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pKCk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAocmVxdWVzdC5wYXlsb2FkPy5hY3Rpb24gPT09ICdnZXRfZG9tX3NraWxsX21lbW9yeV9zdW1tYXJ5Jykge1xuICAgICAgKGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBsaW1pdCA9IE51bWJlcihyZXF1ZXN0LnBheWxvYWQ/LmxpbWl0IHx8IDgpO1xuICAgICAgICAgIGNvbnN0IHN1bW1hcnkgPSBhd2FpdCBnZXREb21Ta2lsbE1lbW9yeVN1bW1hcnkobGltaXQpO1xuICAgICAgICAgIHNlbmRSZXNwb25zZShzdW1tYXJ5KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogdG9FcnJvck1lc3NhZ2UoZXJyKSwgdG90YWw6IDAsIGJ5SW50ZW50OiB7fSwgcmVjZW50OiBbXSB9KTtcbiAgICAgICAgfVxuICAgICAgfSkoKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmIChyZXF1ZXN0LnBheWxvYWQ/LmFjdGlvbiA9PT0gJ2dldF9wYWdlX2ZpZWxkcycpIHtcbiAgICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgdGFicyA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHsgYWN0aXZlOiB0cnVlLCBjdXJyZW50V2luZG93OiB0cnVlIH0pO1xuICAgICAgICAgIGNvbnN0IHRhYiA9IHRhYnNbMF07XG4gICAgICAgICAgaWYgKCF0YWI/LmlkKSB7XG4gICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBlcnJvcjogJ05vIGFjdGl2ZSB0YWIgZm91bmQnIH0pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBleHRyYWN0aW9uID0gYXdhaXQgZXh0cmFjdEZvcm1GaWVsZHModGFiLmlkKTtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoZXh0cmFjdGlvbik7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IGVycm9yOiB0b0Vycm9yTWVzc2FnZShlcnIpIH0pO1xuICAgICAgICB9XG4gICAgICB9KSgpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHJlcXVlc3QucGF5bG9hZD8uYWN0aW9uID09PSAnc2V0X3JvdXRpbmdfbW9kZScpIHtcbiAgICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgbW9kZSA9IHJlcXVlc3QucGF5bG9hZC5tb2RlID09PSAnY29ydGV4JyA/ICdjb3J0ZXgnIDogJ2J1aWx0aW4nO1xuICAgICAgICAgIGNvbnN0IHNldHRpbmdzUmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFsnYmlsZ2VfYXBwX3NldHRpbmdzJ10pO1xuICAgICAgICAgIGNvbnN0IHNldHRpbmdzID0gc2V0dGluZ3NSZXN1bHQuYmlsZ2VfYXBwX3NldHRpbmdzIHx8IHt9O1xuICAgICAgICAgIHNldHRpbmdzLnJvdXRpbmdNb2RlID0gbW9kZTtcbiAgICAgICAgICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBiaWxnZV9hcHBfc2V0dGluZ3M6IHNldHRpbmdzIH0pO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlLCByb3V0aW5nTW9kZTogbW9kZSB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogdG9FcnJvck1lc3NhZ2UoZXJyKSB9KTtcbiAgICAgICAgfVxuICAgICAgfSkoKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmIChyZXF1ZXN0LnBheWxvYWQ/LmFjdGlvbiA9PT0gJ2dldF9yb3V0aW5nX21vZGUnKSB7XG4gICAgICAoYXN5bmMgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHNldHRpbmdzUmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFsnYmlsZ2VfYXBwX3NldHRpbmdzJ10pO1xuICAgICAgICAgIGNvbnN0IHNldHRpbmdzID0gc2V0dGluZ3NSZXN1bHQuYmlsZ2VfYXBwX3NldHRpbmdzIHx8IHt9O1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IHJvdXRpbmdNb2RlOiBzZXR0aW5ncy5yb3V0aW5nTW9kZSB8fCBERUZBVUxUX1JPVVRJTkdfTU9ERSB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgcm91dGluZ01vZGU6IERFRkFVTFRfUk9VVElOR19NT0RFIH0pO1xuICAgICAgICB9XG4gICAgICB9KSgpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHJlcXVlc3QucGF5bG9hZD8uYWN0aW9uID09PSAnY2xlYXJfZG9tX3NraWxsX21lbW9yeScpIHtcbiAgICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2xlYXJEb21Ta2lsbE1lbW9yeSgpO1xuICAgICAgICAgIHNlbmRSZXNwb25zZShyZXN1bHQpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiB0b0Vycm9yTWVzc2FnZShlcnIpLCBjbGVhcmVkOiAwIH0pO1xuICAgICAgICB9XG4gICAgICB9KSgpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHJlcXVlc3QucGF5bG9hZD8uYWN0aW9uID09PSAncmVsb2FkX2V4dGVuc2lvbicpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdSZWxvYWRpbmcgZXh0ZW5zaW9uLi4uJyk7XG4gICAgICBjaHJvbWUucnVudGltZS5yZWxvYWQoKTtcbiAgICAgIHNlbmRSZXNwb25zZSh7IHN0YXR1czogJ3JlbG9hZGluZycgfSk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKHJlcXVlc3QucGF5bG9hZD8uYWN0aW9uID09PSAnc3lzdGVtX2xvZycpIHtcbiAgICAgIGNvbnN0IHsgbWVzc2FnZSwgdHlwZSwgbWV0YWRhdGEgfSA9IHJlcXVlc3QucGF5bG9hZDtcbiAgICAgIC8vIFN0b3JlIHRoZSBsb2cgZnJvbSBjb250ZW50IHNjcmlwdFxuICAgICAgY29uc3QgY29udGVudFNjcmlwdExvZ2dlciA9IG5ldyBCaWxnZUxvZ2dlcihtZXRhZGF0YT8uc291cmNlIHx8ICdjb250ZW50LXNjcmlwdCcpO1xuICAgICAgY29udGVudFNjcmlwdExvZ2dlci5sb2codHlwZSB8fCAnSU5GTycsIG1lc3NhZ2UsIG1ldGFkYXRhKS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgICBzZW5kUmVzcG9uc2UoeyBvazogdHJ1ZSB9KTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBpZiAocmVxdWVzdC5wYXlsb2FkPy5hY3Rpb24gPT09ICd0YWtlX3NjcmVlbnNob3QnKSB7XG4gICAgICBtc2dMb2dnZXIuaW5mbygnVGFraW5nIHNjcmVlbnNob3QnKTtcbiAgICAgIGNocm9tZS50YWJzLmNhcHR1cmVWaXNpYmxlVGFiKG51bGwsIHsgZm9ybWF0OiAncG5nJyB9LCAoZGF0YVVybCkgPT4ge1xuICAgICAgICBjb25zdCBlcnIgPSBjaHJvbWUucnVudGltZS5sYXN0RXJyb3I7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICBtc2dMb2dnZXIuZXJyb3IoYFNjcmVlbnNob3QgZmFpbGVkOiAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBtc2dMb2dnZXIuaW5mbygnU2NyZWVuc2hvdCBjYXB0dXJlZCBzdWNjZXNzZnVsbHknLCB7IHNpemU6IGRhdGFVcmw/Lmxlbmd0aCB8fCAwIH0pO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IHNjcmVlbnNob3Q6IGRhdGFVcmwgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHRydWU7IC8vIGFzeW5jIHJlc3BvbnNlXG4gICAgfVxuXG4gICAgaWYgKHJlcXVlc3QucGF5bG9hZD8uYWN0aW9uID09PSAnZXhlY3V0ZV9uYXR1cmFsX2NvbW1hbmQnKSB7XG4gICAgICBjb25zdCBjb21tYW5kVGV4dCA9IFN0cmluZyhyZXF1ZXN0LnBheWxvYWQ/LmNvbW1hbmQgfHwgcmVxdWVzdC5wYXlsb2FkPy50ZXh0IHx8ICcnKS50cmltKCk7XG4gICAgICBjb25zdCByZXF1ZXN0ZWRQZXJzb25hID0gbm9ybWFsaXplQnJhaW5QZXJzb25hKFxuICAgICAgICByZXF1ZXN0LnBheWxvYWQ/LnBlcnNvbmEgfHwgcmVxdWVzdC5wYXlsb2FkPy5icmFpbiB8fCByZXF1ZXN0LnBheWxvYWQ/LnRhcmdldFBlcnNvbmEgfHwgcmVxdWVzdC5wYXlsb2FkPy50YXJnZXRcbiAgICAgICk7XG4gICAgICBjb25zdCBzdHJpY3RQZXJzb25hID0gY29lcmNlQm9vbGVhbihyZXF1ZXN0LnBheWxvYWQ/LnN0cmljdFBlcnNvbmEsIHRydWUpO1xuICAgICAgKGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBzZXR0aW5ncyA9IGF3YWl0IGdldFJlbGF5U2V0dGluZ3MoKS5jYXRjaCgoKSA9PiAoeyBtYXN0ZXJBY3RpdmU6IHRydWUgfSkpO1xuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZU5hdHVyYWxDb21tYW5kKFxuICAgICAgICAgICAgeyB0eXBlOiAnTkFUVVJBTF9DT01NQU5EJywgcGF5bG9hZDogeyBjb21tYW5kOiBjb21tYW5kVGV4dCwgcGVyc29uYTogcmVxdWVzdGVkUGVyc29uYSwgc3RyaWN0UGVyc29uYSB9IH0sXG4gICAgICAgICAgICBzZXR0aW5nc1xuICAgICAgICAgICk7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHJlc3VsdCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7XG4gICAgICAgICAgICBvazogZmFsc2UsXG4gICAgICAgICAgICBjb21tYW5kOiAnTkFUVVJBTF9DT01NQU5EJyxcbiAgICAgICAgICAgIGlucHV0OiBjb21tYW5kVGV4dCxcbiAgICAgICAgICAgIGVycm9yOiB0b0Vycm9yTWVzc2FnZShlcnIpXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pKCk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAocmVxdWVzdC5wYXlsb2FkPy5hY3Rpb24gPT09ICdnZXRfZWxlbWVudF92YWx1ZScpIHtcbiAgICAgIGNvbnN0IHsgc2VsZWN0b3IsIGF0dHJpYnV0ZSB9ID0gcmVxdWVzdC5wYXlsb2FkO1xuICAgICAgbXNnTG9nZ2VyLmluZm8oYEdldHRpbmcgZWxlbWVudCB2YWx1ZWAsIHsgc2VsZWN0b3IsIGF0dHJpYnV0ZSB9KTtcbiAgICAgIGNocm9tZS50YWJzLnF1ZXJ5KHsgYWN0aXZlOiB0cnVlLCBjdXJyZW50V2luZG93OiB0cnVlIH0sIGFzeW5jICh0YWJzKSA9PiB7XG4gICAgICAgIGNvbnN0IHRhYiA9IHRhYnNbMF07XG4gICAgICAgIGlmICghdGFiPy5pZCkge1xuICAgICAgICAgIG1zZ0xvZ2dlci53YXJuKCdObyBhY3RpdmUgdGFiIGZvciBnZXRfZWxlbWVudF92YWx1ZScpO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IGVycm9yOiAnTm8gYWN0aXZlIHRhYiBmb3VuZCcgfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IGNocm9tZS5zY3JpcHRpbmcuZXhlY3V0ZVNjcmlwdCh7XG4gICAgICAgICAgICB0YXJnZXQ6IHsgdGFiSWQ6IHRhYi5pZCB9LFxuICAgICAgICAgICAgd29ybGQ6ICdJU09MQVRFRCcsXG4gICAgICAgICAgICBhcmdzOiBbc2VsZWN0b3IsIGF0dHJpYnV0ZV0sXG4gICAgICAgICAgICBmdW5jOiAoc2VsLCBhdHRyKSA9PiB7XG4gICAgICAgICAgICAgIC8vIFJlLWRlZmluZSBoZWxwZXIgaW5zaWRlIGluamVjdGlvblxuICAgICAgICAgICAgICBmdW5jdGlvbiBxdWVyeVNlbGVjdG9yRGVlcChzZWxlY3Rvciwgcm9vdCA9IGRvY3VtZW50KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGVuZGluZ1Jvb3RzID0gW3Jvb3RdO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNlZW5Sb290cyA9IG5ldyBTZXQoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBNQVhfU0hBRE9XX1JPT1RTID0gODA7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwZW5kaW5nUm9vdHMubGVuZ3RoICYmIHBlbmRpbmdSb290cy5sZW5ndGggPD0gTUFYX1NIQURPV19ST09UUzsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50Um9vdCA9IHBlbmRpbmdSb290c1tpXTtcbiAgICAgICAgICAgICAgICAgIGlmICghY3VycmVudFJvb3QgfHwgc2VlblJvb3RzLmhhcyhjdXJyZW50Um9vdCkpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgc2VlblJvb3RzLmFkZChjdXJyZW50Um9vdCk7XG4gICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBmb3VuZCA9IGN1cnJlbnRSb290LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZm91bmQpIHJldHVybiBmb3VuZDtcbiAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHt9XG4gICAgICAgICAgICAgICAgICBjb25zdCB3YWxrZXIgPSBkb2N1bWVudC5jcmVhdGVUcmVlV2Fsa2VyKGN1cnJlbnRSb290LCBOb2RlRmlsdGVyLlNIT1dfRUxFTUVOVCk7XG4gICAgICAgICAgICAgICAgICBmb3IgKGxldCBub2RlID0gd2Fsa2VyLmN1cnJlbnROb2RlOyBub2RlOyBub2RlID0gd2Fsa2VyLm5leHROb2RlKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG5vZGUuc2hhZG93Um9vdCkgcGVuZGluZ1Jvb3RzLnB1c2gobm9kZS5zaGFkb3dSb290KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGFnID0gU3RyaW5nKG5vZGU/LnRhZ05hbWUgfHwgJycpLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0YWcgPT09ICdJRlJBTUUnIHx8IHRhZyA9PT0gJ0ZSQU1FJykge1xuICAgICAgICAgICAgICAgICAgICAgIHRyeSB7IGlmIChub2RlLmNvbnRlbnREb2N1bWVudCkgcGVuZGluZ1Jvb3RzLnB1c2gobm9kZS5jb250ZW50RG9jdW1lbnQpOyB9IGNhdGNoIChlKSB7fVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChwZW5kaW5nUm9vdHMubGVuZ3RoID4gTUFYX1NIQURPV19ST09UUykgYnJlYWs7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgY29uc3QgZWwgPSBxdWVyeVNlbGVjdG9yRGVlcChzZWwpO1xuICAgICAgICAgICAgICBpZiAoIWVsKSByZXR1cm4geyBlcnJvcjogYEVsZW1lbnQgbm90IGZvdW5kOiAke3NlbH1gIH07XG5cbiAgICAgICAgICAgICAgaWYgKGF0dHIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyB2YWx1ZTogZWwuZ2V0QXR0cmlidXRlKGF0dHIpLCBhdHRyaWJ1dGU6IGF0dHIgfTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGNvbnN0IHZhbCA9IGVsLnZhbHVlICE9PSB1bmRlZmluZWQgPyBlbC52YWx1ZSA6IGVsLmlubmVyVGV4dCB8fCBlbC50ZXh0Q29udGVudDtcbiAgICAgICAgICAgICAgcmV0dXJuIHsgdmFsdWU6IHZhbCwgdGFnOiBlbC50YWdOYW1lLnRvTG93ZXJDYXNlKCksIGlkOiBlbC5pZCwgbmFtZTogZWwubmFtZSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHNlbmRSZXNwb25zZShyZXN1bHRzWzBdPy5yZXN1bHQpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHJlcXVlc3QucGF5bG9hZD8uYWN0aW9uID09PSAnc2Nyb2xsX3RvX2VsZW1lbnQnKSB7XG4gICAgICBjb25zdCB7IHNlbGVjdG9yIH0gPSByZXF1ZXN0LnBheWxvYWQ7XG4gICAgICBtc2dMb2dnZXIuaW5mbyhgU2Nyb2xsaW5nIHRvIGVsZW1lbnRgLCB7IHNlbGVjdG9yIH0pO1xuICAgICAgY2hyb21lLnRhYnMucXVlcnkoeyBhY3RpdmU6IHRydWUsIGN1cnJlbnRXaW5kb3c6IHRydWUgfSwgYXN5bmMgKHRhYnMpID0+IHtcbiAgICAgICAgY29uc3QgdGFiID0gdGFic1swXTtcbiAgICAgICAgaWYgKCF0YWI/LmlkKSB7XG4gICAgICAgICAgbXNnTG9nZ2VyLndhcm4oJ05vIGFjdGl2ZSB0YWIgZm9yIHNjcm9sbF90b19lbGVtZW50Jyk7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgZXJyb3I6ICdObyBhY3RpdmUgdGFiIGZvdW5kJyB9KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgY2hyb21lLnNjcmlwdGluZy5leGVjdXRlU2NyaXB0KHtcbiAgICAgICAgICAgIHRhcmdldDogeyB0YWJJZDogdGFiLmlkIH0sXG4gICAgICAgICAgICB3b3JsZDogJ0lTT0xBVEVEJyxcbiAgICAgICAgICAgIGFyZ3M6IFtzZWxlY3Rvcl0sXG4gICAgICAgICAgICBmdW5jOiAoc2VsKSA9PiB7XG4gICAgICAgICAgICAgIGZ1bmN0aW9uIHF1ZXJ5U2VsZWN0b3JEZWVwKHNlbGVjdG9yLCByb290ID0gZG9jdW1lbnQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwZW5kaW5nUm9vdHMgPSBbcm9vdF07XG4gICAgICAgICAgICAgICAgY29uc3Qgc2VlblJvb3RzID0gbmV3IFNldCgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IE1BWF9TSEFET1dfUk9PVFMgPSA4MDtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBlbmRpbmdSb290cy5sZW5ndGggJiYgcGVuZGluZ1Jvb3RzLmxlbmd0aCA8PSBNQVhfU0hBRE9XX1JPT1RTOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRSb290ID0gcGVuZGluZ1Jvb3RzW2ldO1xuICAgICAgICAgICAgICAgICAgaWYgKCFjdXJyZW50Um9vdCB8fCBzZWVuUm9vdHMuaGFzKGN1cnJlbnRSb290KSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgICBzZWVuUm9vdHMuYWRkKGN1cnJlbnRSb290KTtcbiAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZvdW5kID0gY3VycmVudFJvb3QucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmb3VuZCkgcmV0dXJuIGZvdW5kO1xuICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge31cbiAgICAgICAgICAgICAgICAgIGNvbnN0IHdhbGtlciA9IGRvY3VtZW50LmNyZWF0ZVRyZWVXYWxrZXIoY3VycmVudFJvb3QsIE5vZGVGaWx0ZXIuU0hPV19FTEVNRU5UKTtcbiAgICAgICAgICAgICAgICAgIGZvciAobGV0IG5vZGUgPSB3YWxrZXIuY3VycmVudE5vZGU7IG5vZGU7IG5vZGUgPSB3YWxrZXIubmV4dE5vZGUoKSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAobm9kZS5zaGFkb3dSb290KSBwZW5kaW5nUm9vdHMucHVzaChub2RlLnNoYWRvd1Jvb3QpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0YWcgPSBTdHJpbmcobm9kZT8udGFnTmFtZSB8fCAnJykudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRhZyA9PT0gJ0lGUkFNRScgfHwgdGFnID09PSAnRlJBTUUnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgdHJ5IHsgaWYgKG5vZGUuY29udGVudERvY3VtZW50KSBwZW5kaW5nUm9vdHMucHVzaChub2RlLmNvbnRlbnREb2N1bWVudCk7IH0gY2F0Y2ggKGUpIHt9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKHBlbmRpbmdSb290cy5sZW5ndGggPiBNQVhfU0hBRE9XX1JPT1RTKSBicmVhaztcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY29uc3QgZWwgPSBxdWVyeVNlbGVjdG9yRGVlcChzZWwpO1xuICAgICAgICAgICAgICBpZiAoIWVsKSByZXR1cm4geyBlcnJvcjogYEVsZW1lbnQgbm90IGZvdW5kOiAke3NlbH1gIH07XG4gICAgICAgICAgICAgIGVsLnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdzbW9vdGgnLCBibG9jazogJ2NlbnRlcicgfSk7XG4gICAgICAgICAgICAgIHJldHVybiB7IHN0YXR1czogJ3Njcm9sbGVkJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHNlbmRSZXNwb25zZShyZXN1bHRzWzBdPy5yZXN1bHQpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHJlcXVlc3QucGF5bG9hZD8uYWN0aW9uID09PSAnZXhlY3V0ZV9zY3JpcHQnKSB7XG4gICAgICBjb25zdCB7IGNvZGUsIHdvcmxkLCB0aW1lb3V0X21zIH0gPSByZXF1ZXN0LnBheWxvYWQ7XG4gICAgICBjb25zdCBjb2RlUHJldmlldyA9IFN0cmluZyhjb2RlIHx8ICcnKS5zbGljZSgwLCAxMDApO1xuICAgICAgbXNnTG9nZ2VyLmluZm8oYEV4ZWN1dGluZyBzY3JpcHQgaW4gJHt3b3JsZCB8fCAnSVNPTEFURUQnfSB3b3JsZGAsIHsgY29kZVByZXZpZXcsIHRpbWVvdXRfbXMgfSk7XG5cbiAgICAgIGNocm9tZS50YWJzLnF1ZXJ5KHsgYWN0aXZlOiB0cnVlLCBjdXJyZW50V2luZG93OiB0cnVlIH0sIGFzeW5jICh0YWJzKSA9PiB7XG4gICAgICAgIGNvbnN0IHRhYiA9IHRhYnNbMF07XG4gICAgICAgIGlmICghdGFiPy5pZCkge1xuICAgICAgICAgIG1zZ0xvZ2dlci53YXJuKCdObyBhY3RpdmUgdGFiIGZvciBzY3JpcHQgZXhlY3V0aW9uJyk7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgZXJyb3I6ICdObyBhY3RpdmUgdGFiIGZvdW5kJyB9KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNSZXN0cmljdGVkVXJsKHRhYi51cmwpKSB7XG4gICAgICAgICAgbXNnTG9nZ2VyLndhcm4oYFNjcmlwdCBibG9ja2VkIG9uIHJlc3RyaWN0ZWQgVVJMOiAke3RhYi51cmx9YCk7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgZXJyb3I6IGBDYW5ub3QgZXhlY3V0ZSBzY3JpcHQgb24gcmVzdHJpY3RlZCBVUkw6ICR7dGFiLnVybH1gIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJ1bkluV29ybGQgPSBhc3luYyAodGFyZ2V0V29ybGQpID0+IHtcbiAgICAgICAgICByZXR1cm4gYXdhaXQgY2hyb21lLnNjcmlwdGluZy5leGVjdXRlU2NyaXB0KHtcbiAgICAgICAgICAgIHRhcmdldDogeyB0YWJJZDogdGFiLmlkIH0sXG4gICAgICAgICAgICB3b3JsZDogdGFyZ2V0V29ybGQsXG4gICAgICAgICAgICBhcmdzOiBbY29kZSwgdGltZW91dF9tcyB8fCA1MDAwXSxcbiAgICAgICAgICAgIGZ1bmM6IGFzeW5jIChjb2RlU3RyLCB0aW1lb3V0KSA9PiB7XG4gICAgICAgICAgICAgIC8vIEhlbHBlcnNcbiAgICAgICAgICAgICAgZnVuY3Rpb24gcXVlcnlTZWxlY3RvckRlZXAoc2VsZWN0b3IsIHJvb3QgPSBkb2N1bWVudCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBlbmRpbmdSb290cyA9IFtyb290XTtcbiAgICAgICAgICAgICAgICBjb25zdCBzZWVuUm9vdHMgPSBuZXcgU2V0KCk7XG4gICAgICAgICAgICAgICAgY29uc3QgTUFYX1NIQURPV19ST09UUyA9IDgwO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGVuZGluZ1Jvb3RzLmxlbmd0aCAmJiBwZW5kaW5nUm9vdHMubGVuZ3RoIDw9IE1BWF9TSEFET1dfUk9PVFM7IGkrKykge1xuICAgICAgICAgICAgICAgICAgY29uc3QgY3VycmVudFJvb3QgPSBwZW5kaW5nUm9vdHNbaV07XG4gICAgICAgICAgICAgICAgICBpZiAoIWN1cnJlbnRSb290IHx8IHNlZW5Sb290cy5oYXMoY3VycmVudFJvb3QpKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgIHNlZW5Sb290cy5hZGQoY3VycmVudFJvb3QpO1xuICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZm91bmQgPSBjdXJyZW50Um9vdC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvdW5kKSByZXR1cm4gZm91bmQ7XG4gICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7fVxuICAgICAgICAgICAgICAgICAgY29uc3Qgd2Fsa2VyID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihjdXJyZW50Um9vdCwgTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQpO1xuICAgICAgICAgICAgICAgICAgZm9yIChsZXQgbm9kZSA9IHdhbGtlci5jdXJyZW50Tm9kZTsgbm9kZTsgbm9kZSA9IHdhbGtlci5uZXh0Tm9kZSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChub2RlLnNoYWRvd1Jvb3QpIHBlbmRpbmdSb290cy5wdXNoKG5vZGUuc2hhZG93Um9vdCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRhZyA9IFN0cmluZyhub2RlPy50YWdOYW1lIHx8ICcnKS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAodGFnID09PSAnSUZSQU1FJyB8fCB0YWcgPT09ICdGUkFNRScpIHtcbiAgICAgICAgICAgICAgICAgICAgICB0cnkgeyBpZiAobm9kZS5jb250ZW50RG9jdW1lbnQpIHBlbmRpbmdSb290cy5wdXNoKG5vZGUuY29udGVudERvY3VtZW50KTsgfSBjYXRjaCAoZSkge31cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAocGVuZGluZ1Jvb3RzLmxlbmd0aCA+IE1BWF9TSEFET1dfUk9PVFMpIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBmdW5jdGlvbiB0cnVuY2F0ZSh0ZXh0LCBtYXhDaGFycyA9IDUwMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHN0ciA9IFN0cmluZyh0ZXh0IHx8ICcnKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gc3RyLmxlbmd0aCA+IG1heENoYXJzID8gYCR7c3RyLnNsaWNlKDAsIG1heENoYXJzKX0uLi5gIDogc3RyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGZ1bmN0aW9uIGVsZW1lbnRTdW1tYXJ5KGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWVsZW1lbnQgfHwgZWxlbWVudC5ub2RlVHlwZSAhPT0gMSkgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgdGFnOiBlbGVtZW50LnRhZ05hbWUudG9Mb3dlckNhc2UoKSwgaWQ6IGVsZW1lbnQuaWQsIHRleHQ6IHRydW5jYXRlKGVsZW1lbnQuaW5uZXJUZXh0IHx8IGVsZW1lbnQudGV4dENvbnRlbnQsIDEwMCkgfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBmdW5jdGlvbiBqc29uU2FmZSh2YWx1ZSwgc2VlbiA9IG5ldyBXZWFrU2V0KCksIGRlcHRoID0gMCkge1xuICAgICAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgY29uc3QgdCA9IHR5cGVvZiB2YWx1ZTtcbiAgICAgICAgICAgICAgICBpZiAodCA9PT0gJ3N0cmluZycgfHwgdCA9PT0gJ251bWJlcicgfHwgdCA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4gdmFsdWU7XG4gICAgICAgICAgICAgICAgaWYgKHQgPT09ICdiaWdpbnQnKSByZXR1cm4gdmFsdWUudG9TdHJpbmcoKTtcbiAgICAgICAgICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBFcnJvcikgcmV0dXJuIHsgbmFtZTogdmFsdWUubmFtZSwgbWVzc2FnZTogdmFsdWUubWVzc2FnZSB9O1xuICAgICAgICAgICAgICAgIGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlLm5vZGVUeXBlID09PSAxKSByZXR1cm4gZWxlbWVudFN1bW1hcnkodmFsdWUpO1xuICAgICAgICAgICAgICAgIGlmIChkZXB0aCA+PSA1IHx8IHNlZW4uaGFzKHZhbHVlKSkgcmV0dXJuICdbVHJ1bmNhdGVkXSc7XG4gICAgICAgICAgICAgICAgc2Vlbi5hZGQodmFsdWUpO1xuICAgICAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkgcmV0dXJuIHZhbHVlLnNsaWNlKDAsIDUwKS5tYXAodiA9PiBqc29uU2FmZSh2LCBzZWVuLCBkZXB0aCArIDEpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBvdXQgPSB7fTtcbiAgICAgICAgICAgICAgICBPYmplY3Qua2V5cyh2YWx1ZSkuc2xpY2UoMCwgNTApLmZvckVhY2goayA9PiB7IG91dFtrXSA9IGpzb25TYWZlKHZhbHVlW2tdLCBzZWVuLCBkZXB0aCArIDEpOyB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGNvbnN0IGV4ZWN1dGUgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgQXN5bmNGdW5jdGlvbiA9IE9iamVjdC5nZXRQcm90b3R5cGVPZihhc3luYyBmdW5jdGlvbiAoKSB7fSkuY29uc3RydWN0b3I7XG4gICAgICAgICAgICAgICAgY29uc3QgZm4gPSBuZXcgQXN5bmNGdW5jdGlvbigncXVlcnlTZWxlY3RvckRlZXAnLCAndHJ1bmNhdGUnLCAnZWxlbWVudFN1bW1hcnknLCAnXCJ1c2Ugc3RyaWN0XCI7XFxuJyArIGNvZGVTdHIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCBmbihxdWVyeVNlbGVjdG9yRGVlcCwgdHJ1bmNhdGUsIGVsZW1lbnRTdW1tYXJ5KTtcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBQcm9taXNlLnJhY2UoW1xuICAgICAgICAgICAgICAgICAgZXhlY3V0ZSgpLFxuICAgICAgICAgICAgICAgICAgbmV3IFByb21pc2UoKF8sIHJlamVjdCkgPT4gc2V0VGltZW91dCgoKSA9PiByZWplY3QobmV3IEVycm9yKGBUaW1lb3V0IGFmdGVyICR7dGltZW91dH1tc2ApKSwgdGltZW91dCkpXG4gICAgICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIHJlc3VsdDoganNvblNhZmUocmVzdWx0KSB9O1xuICAgICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBlcnJvcjogZXJyLm1lc3NhZ2UgfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHJlc3VsdHMgPSBhd2FpdCBydW5JbldvcmxkKHdvcmxkID09PSAnTUFJTicgPyAnTUFJTicgOiAnSVNPTEFURUQnKTtcbiAgICAgICAgICBsZXQgcGF5bG9hZCA9IHJlc3VsdHNbMF0/LnJlc3VsdDtcblxuICAgICAgICAgIC8vIEF1dG8tZmFsbGJhY2sgdG8gTUFJTiBpZiBJU09MQVRFRCBmYWlsZWQgZHVlIHRvIENTUC9ldmFsL1RydXN0ZWQgVHlwZXNcbiAgICAgICAgICBpZiAod29ybGQgIT09ICdNQUlOJyAmJiBwYXlsb2FkPy5lcnJvciAmJiAocGF5bG9hZC5lcnJvci5pbmNsdWRlcygnQ1NQJykgfHwgcGF5bG9hZC5lcnJvci5pbmNsdWRlcygnZXZhbCcpIHx8IHBheWxvYWQuZXJyb3IuaW5jbHVkZXMoJ1RydXN0ZWQgVHlwZScpKSkge1xuICAgICAgICAgICAgbXNnTG9nZ2VyLndhcm4oJ0lTT0xBVEVEIHdvcmxkIHNjcmlwdCBmYWlsZWQgKENTUCksIHJldHJ5aW5nIGluIE1BSU4gd29ybGQnKTtcbiAgICAgICAgICAgIHJlc3VsdHMgPSBhd2FpdCBydW5JbldvcmxkKCdNQUlOJyk7XG4gICAgICAgICAgICBwYXlsb2FkID0gcmVzdWx0c1swXT8ucmVzdWx0O1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChwYXlsb2FkPy5lcnJvcikge1xuICAgICAgICAgICAgbXNnTG9nZ2VyLmVycm9yKGBTY3JpcHQgZXhlY3V0aW9uIGVycm9yOiAke3BheWxvYWQuZXJyb3J9YCk7XG4gICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBlcnJvcjogcGF5bG9hZC5lcnJvciB9KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbXNnTG9nZ2VyLmluZm8oJ1NjcmlwdCBleGVjdXRlZCBzdWNjZXNzZnVsbHknKTtcbiAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlLCByZXN1bHQ6IHBheWxvYWQ/LnJlc3VsdCB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIG1zZ0xvZ2dlci5lcnJvcihgU2NyaXB0IGV4ZWN1dGlvbiBleGNlcHRpb246ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8vIEV4ZWN1dGUgYmF0Y2ggYWN0aW9ucyB3aXRoIGF1dG9tYXRpb24gY2FwYWJpbGl0aWVzXG4gICAgaWYgKHJlcXVlc3QucGF5bG9hZD8uYWN0aW9uID09PSAnZXhlY3V0ZV9iYXRjaF9hY3Rpb25zJykge1xuICAgICAgY29uc3QgeyBhY3Rpb25zLCBvcHRpb25zLCB0cmFjZU1ldGEgfSA9IHJlcXVlc3QucGF5bG9hZDtcbiAgICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHNldHRpbmdzID0gYXdhaXQgZ2V0UmVsYXlTZXR0aW5ncygpLmNhdGNoKCgpID0+ICh7XG4gICAgICAgICAgbWFzdGVyQWN0aXZlOiB0cnVlLFxuICAgICAgICAgIHRyYWluaW5nQWxsb3dBaVNjcmlwdHM6IGZhbHNlXG4gICAgICAgIH0pKTtcbiAgICAgICAgY29uc3QgYWxsb3dBaVNjcmlwdHMgPSBzZXR0aW5ncy5tYXN0ZXJBY3RpdmUgPT09IHRydWUgJiYgc2V0dGluZ3MudHJhaW5pbmdBbGxvd0FpU2NyaXB0cyA9PT0gdHJ1ZTtcbiAgICAgICAgY29uc3QgbWVyZ2VkT3B0aW9ucyA9IHtcbiAgICAgICAgICAuLi4ob3B0aW9ucyAmJiB0eXBlb2Ygb3B0aW9ucyA9PT0gJ29iamVjdCcgPyBvcHRpb25zIDoge30pLFxuICAgICAgICAgIGFsbG93QWlTY3JpcHRzXG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgYWN0aW9uQ291bnQgPSBBcnJheS5pc0FycmF5KGFjdGlvbnMpID8gYWN0aW9ucy5sZW5ndGggOiAwO1xuICAgICAgICBiYXRjaExvZ2dlci5pbmZvKGBTdGFydGluZyBiYXRjaCBleGVjdXRpb24gd2l0aCAke2FjdGlvbkNvdW50fSBhY3Rpb25zYCwgeyB0cmFjZU1ldGEsIG9wdGlvbnM6IG1lcmdlZE9wdGlvbnMgfSk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZUJhdGNoQWN0aW9ucyhhY3Rpb25zLCBtZXJnZWRPcHRpb25zLCB0cmFjZU1ldGEpO1xuICAgICAgICAgIGJhdGNoTG9nZ2VyLmluZm8oYEJhdGNoIGV4ZWN1dGlvbiBjb21wbGV0ZWRgLCB7XG4gICAgICAgICAgICBydW5JZDogcmVzdWx0LnJ1bklkLFxuICAgICAgICAgICAgZXhlY3V0ZWRTdGVwczogcmVzdWx0LmV4ZWN1dGVkU3RlcHMsXG4gICAgICAgICAgICBjYW5jZWxsZWQ6IHJlc3VsdC5jYW5jZWxsZWQsXG4gICAgICAgICAgICBhbGxvd0FpU2NyaXB0c1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHNlbmRSZXNwb25zZShyZXN1bHQpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBiYXRjaExvZ2dlci5lcnJvcihgQmF0Y2ggZXhlY3V0aW9uIGZhaWxlZDogJHtlcnIubWVzc2FnZX1gLCB7IHN0YWNrOiBlcnIuc3RhY2sgfSk7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICB9XG4gICAgICB9KSgpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLy8gQ2FuY2VsIGFuIGFjdGl2ZSBiYXRjaCBleGVjdXRpb25cbiAgICBpZiAocmVxdWVzdC5wYXlsb2FkPy5hY3Rpb24gPT09ICdjYW5jZWxfYmF0Y2hfYWN0aW9ucycpIHtcbiAgICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHJ1bklkID0gU3RyaW5nKHJlcXVlc3QucGF5bG9hZD8ucnVuSWQgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgYmF0Y2hMb2dnZXIuaW5mbyhgQ2FuY2VsbGluZyBiYXRjaCBydW46ICR7cnVuSWR9YCk7XG4gICAgICAgIGNvbnN0IGNhbmNlbGxlZCA9IGF3YWl0IGNhbmNlbFJ1bihydW5JZCk7XG4gICAgICAgIGJhdGNoTG9nZ2VyLmluZm8oYENhbmNlbCByZXN1bHQgZm9yICR7cnVuSWR9OiAke2NhbmNlbGxlZCA/ICdjYW5jZWxsZWQnIDogJ25vdCBmb3VuZCd9YCk7XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IGNhbmNlbGxlZCwgcnVuSWQgfSk7XG4gICAgICB9KSgpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLy8gR2V0IGFjdGl2ZSBydW5zIHN0YXR1c1xuICAgIGlmIChyZXF1ZXN0LnBheWxvYWQ/LmFjdGlvbiA9PT0gJ2dldF9hY3RpdmVfcnVucycpIHtcbiAgICAgIGNvbnN0IHJ1bnMgPSBBcnJheS5mcm9tKGFjdGl2ZVJ1bnMuZW50cmllcygpKS5tYXAoKFtpZCwgc3RhdGVdKSA9PiAoe1xuICAgICAgICBydW5JZDogaWQsXG4gICAgICAgIGNhbmNlbGxlZDogc3RhdGUuY2FuY2VsbGVkLFxuICAgICAgICBzdGFydFRpbWU6IHN0YXRlLnN0YXJ0VGltZSxcbiAgICAgICAgdGFiSWQ6IHN0YXRlLnRhYklkID8/IG51bGxcbiAgICAgIH0pKTtcbiAgICAgIHNlbmRSZXNwb25zZSh7IHJ1bnMgfSk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgc2VuZFJlc3BvbnNlKHsgZXJyb3I6IGBVbmtub3duIGJhY2tncm91bmQgYWN0aW9uOiAke1N0cmluZyhyZXF1ZXN0LnBheWxvYWQ/LmFjdGlvbiB8fCAnJyl9YCB9KTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvLyBVbmtub3duIG1lc3NhZ2Ugc2hhcGU7IGlnbm9yZS5cbiAgcmV0dXJuIGZhbHNlO1xufSk7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBCYXRjaCBBY3Rpb24gRXhlY3V0aW9uXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIEV4ZWN1dGUgYSBiYXRjaCBvZiBhY3Rpb25zIGluIHRoZSBhY3RpdmUgdGFiXG4gKiBAcGFyYW0ge0FycmF5fSBhY3Rpb25zIC0gQXJyYXkgb2YgYWN0aW9uIG9iamVjdHNcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gQXV0b21hdGlvbiBvcHRpb25zXG4gKiBAcGFyYW0ge09iamVjdH0gdHJhY2VNZXRhIC0gVHJhY2UgbWV0YWRhdGEgZm9yIGxvZ2dpbmdcbiAqIEByZXR1cm5zIHtQcm9taXNlPE9iamVjdD59IEV4ZWN1dGlvbiByZXN1bHRcbiAqL1xuYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZUJhdGNoQWN0aW9ucyhhY3Rpb25zLCBvcHRpb25zID0ge30sIHRyYWNlTWV0YSA9IG51bGwpIHtcbiAgY29uc3QgcnVuSWQgPSBnZW5lcmF0ZVJ1bklkKCk7XG4gIGNvbnN0IHJ1blN0YXRlID0ge1xuICAgIGNhbmNlbGxlZDogZmFsc2UsXG4gICAgc3RhcnRUaW1lOiBEYXRlLm5vdygpLFxuICAgIHRhYklkOiBudWxsLFxuICAgIHdpbmRvd0lkOiBudWxsLFxuICAgIGxhc3RTZXE6IC0xLFxuICAgIHBvbGxUaW1lcjogbnVsbFxuICB9O1xuICBhY3RpdmVSdW5zLnNldChydW5JZCwgcnVuU3RhdGUpO1xuXG4gIHRyeSB7XG4gICAgLy8gR2V0IGFjdGl2ZSB0YWJcbiAgICBjb25zdCB0YWJzID0gYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIGNocm9tZS50YWJzLnF1ZXJ5KHsgYWN0aXZlOiB0cnVlLCBjdXJyZW50V2luZG93OiB0cnVlIH0sIHJlc29sdmUpO1xuICAgIH0pO1xuXG4gICAgY29uc3QgdGFiID0gdGFicyAmJiB0YWJzWzBdO1xuICAgIGlmICghdGFiPy5pZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBhY3RpdmUgdGFiIGZvdW5kJyk7XG4gICAgfVxuXG4gICAgaWYgKGlzUmVzdHJpY3RlZFVybCh0YWIudXJsKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgZXhlY3V0ZSBhY3Rpb25zIG9uIHJlc3RyaWN0ZWQgVVJMOiAke3RhYi51cmwgfHwgJyh1bmtub3duIHVybCknfWApO1xuICAgIH1cblxuICAgIHJ1blN0YXRlLnRhYklkID0gdGFiLmlkO1xuICAgIHJ1blN0YXRlLndpbmRvd0lkID0gdGFiLndpbmRvd0lkID8/IG51bGw7XG5cbiAgICBjb25zdCB0b3RhbFN0ZXBzID0gQXJyYXkuaXNBcnJheShhY3Rpb25zKSA/IGFjdGlvbnMubGVuZ3RoIDogMDtcbiAgICBzYWZlU2VuZFJ1bnRpbWVNZXNzYWdlKHsgdHlwZTogJ0JBVENIX1JVTl9VUERBVEUnLCBwYXlsb2FkOiB7IHJ1bklkLCBzdGF0dXM6ICdzdGFydGluZycsIGV4ZWN1dGVkU3RlcHM6IDAsIHRvdGFsU3RlcHMgfSB9KTtcblxuICAgIC8vIFBvbGwgcGFnZS1ydW4gc3RhdGUgc28gdGhlIFVJIGhhcyBwcm9ncmVzcyB3aGlsZSB0aGUgdG9vbCBpcyBydW5uaW5nLlxuICAgIGNvbnN0IHBvbGxJbnRlcnZhbE1zUmF3ID0gTnVtYmVyKG9wdGlvbnM/LnBvbGxJbnRlcnZhbE1zID8/IDM1MCk7XG4gICAgY29uc3QgcG9sbEludGVydmFsTXMgPSBOdW1iZXIuaXNGaW5pdGUocG9sbEludGVydmFsTXNSYXcpXG4gICAgICA/IE1hdGgubWluKDEwMDAsIE1hdGgubWF4KDE1MCwgTWF0aC5yb3VuZChwb2xsSW50ZXJ2YWxNc1JhdykpKVxuICAgICAgOiAzNTA7XG4gICAgbGV0IHBvbGxJbkZsaWdodCA9IGZhbHNlO1xuXG4gICAgcnVuU3RhdGUucG9sbFRpbWVyID0gc2V0SW50ZXJ2YWwoYXN5bmMgKCkgPT4ge1xuICAgICAgaWYgKHBvbGxJbkZsaWdodCkgcmV0dXJuO1xuICAgICAgcG9sbEluRmxpZ2h0ID0gdHJ1ZTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHN0YXRlID0gYXdhaXQgcmVhZFJ1blN0YXRlRnJvbVBhZ2UodGFiLmlkLCBydW5JZCk7XG4gICAgICAgIGlmICghc3RhdGUpIHJldHVybjtcbiAgICAgICAgY29uc3Qgc2VxID0gTnVtYmVyKHN0YXRlLnNlcSB8fCAwKTtcbiAgICAgICAgaWYgKHNlcSA9PT0gcnVuU3RhdGUubGFzdFNlcSkgcmV0dXJuO1xuICAgICAgICBydW5TdGF0ZS5sYXN0U2VxID0gc2VxO1xuICAgICAgICBzYWZlU2VuZFJ1bnRpbWVNZXNzYWdlKHsgdHlwZTogJ0JBVENIX1JVTl9VUERBVEUnLCBwYXlsb2FkOiBzdGF0ZSB9KTtcbiAgICAgIH0gZmluYWxseSB7XG4gICAgICAgIHBvbGxJbkZsaWdodCA9IGZhbHNlO1xuICAgICAgfVxuICAgIH0sIHBvbGxJbnRlcnZhbE1zKTtcblxuICAgIC8vIC0tLSBSRVNJREVOVCBSVU5USU1FIEVYRUNVVElPTiAoUHJpbWFyeSkgLS0tXG4gICAgbGV0IHBheWxvYWQgPSBudWxsO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS50YWJzLnNlbmRNZXNzYWdlKHRhYi5pZCwge1xuICAgICAgICB0eXBlOiAnRVhFQ1VURV9CQVRDSCcsXG4gICAgICAgIGFjdGlvbnMsXG4gICAgICAgIG9wdGlvbnNcbiAgICAgIH0pO1xuICAgICAgaWYgKHJlc3BvbnNlICYmIChyZXNwb25zZS5zdWNjZXNzIHx8IHJlc3BvbnNlLmV4ZWN1dGVkU3RlcHMgPiAwKSkge1xuICAgICAgICBwYXlsb2FkID0ge1xuICAgICAgICAgIG9rOiByZXNwb25zZS5zdWNjZXNzLFxuICAgICAgICAgIGV4ZWN1dGVkU3RlcHM6IHJlc3BvbnNlLmV4ZWN1dGVkU3RlcHMsXG4gICAgICAgICAgdG90YWxTdGVwczogcmVzcG9uc2UudG90YWxTdGVwcyxcbiAgICAgICAgICByZXN1bHRzOiByZXNwb25zZS5yZXN1bHRzXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAvLyBSdW50aW1lIG5vdCBhdmFpbGFibGUgb3IgZmFpbGVkLCB3aWxsIGZhbGwgYmFjayB0byBpbmplY3Rpb25cbiAgICAgIGNvbnNvbGUuZGVidWcoXCJbQmFja2dyb3VuZF0gUmVzaWRlbnQgcnVudGltZSB1bmF2YWlsYWJsZSwgZmFsbGluZyBiYWNrIHRvIHNjcmlwdCBpbmplY3Rpb24uXCIpO1xuICAgIH1cblxuICAgIC8vIC0tLSBTQ1JJUFQgSU5KRUNUSU9OIChGYWxsYmFjaykgLS0tXG4gICAgaWYgKCFwYXlsb2FkKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjaHJvbWUuc2NyaXB0aW5nLmV4ZWN1dGVTY3JpcHQoe1xuICAgICAgICB0YXJnZXQ6IHsgdGFiSWQ6IHRhYi5pZCB9LFxuICAgICAgICBmdW5jOiBwZXJmb3JtUGFnZUFjdGlvbnMsXG4gICAgICAgIGFyZ3M6IFthY3Rpb25zLCB0cmFjZU1ldGEsIHJ1bklkLCBvcHRpb25zXSxcbiAgICAgICAgd29ybGQ6ICdNQUlOJyAvLyBSdW4gaW4gcGFnZSBjb250ZXh0IHRvIGFjY2VzcyBwYWdlJ3MgSlMgb2JqZWN0c1xuICAgICAgfSk7XG4gICAgICBwYXlsb2FkID0gcmVzdWx0Py5bMF0/LnJlc3VsdCB8fCB7fTtcbiAgICB9XG5cbiAgICAvLyBGbHVzaCBmaW5hbCBzdGF0ZSB0byBVSSAoYmVzdC1lZmZvcnQpLlxuICAgIGNvbnN0IGZpbmFsU3RhdGUgPSBhd2FpdCByZWFkUnVuU3RhdGVGcm9tUGFnZSh0YWIuaWQsIHJ1bklkKTtcbiAgICBpZiAoZmluYWxTdGF0ZSkge1xuICAgICAgc2FmZVNlbmRSdW50aW1lTWVzc2FnZSh7IHR5cGU6ICdCQVRDSF9SVU5fVVBEQVRFJywgcGF5bG9hZDogZmluYWxTdGF0ZSB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2FmZVNlbmRSdW50aW1lTWVzc2FnZSh7XG4gICAgICAgIHR5cGU6ICdCQVRDSF9SVU5fVVBEQVRFJyxcbiAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgIHJ1bklkLFxuICAgICAgICAgIHN0YXR1czogcGF5bG9hZC5jYW5jZWxsZWQgPyAnY2FuY2VsbGVkJyA6IHBheWxvYWQub2sgIT09IGZhbHNlID8gJ2RvbmUnIDogJ2Vycm9yJyxcbiAgICAgICAgICBleGVjdXRlZFN0ZXBzOiBwYXlsb2FkLmV4ZWN1dGVkU3RlcHMgfHwgMCxcbiAgICAgICAgICB0b3RhbFN0ZXBzXG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBvazogcGF5bG9hZC5vayAhPT0gZmFsc2UsXG4gICAgICBydW5JZCxcbiAgICAgIGV4ZWN1dGVkU3RlcHM6IHBheWxvYWQuZXhlY3V0ZWRTdGVwcyB8fCAwLFxuICAgICAgY2FuY2VsbGVkOiBwYXlsb2FkLmNhbmNlbGxlZCB8fCBmYWxzZSxcbiAgICAgIGVycm9yOiBwYXlsb2FkLmVycm9yXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgc2FmZVNlbmRSdW50aW1lTWVzc2FnZSh7IHR5cGU6ICdCQVRDSF9SVU5fVVBEQVRFJywgcGF5bG9hZDogeyBydW5JZCwgc3RhdHVzOiAnZXJyb3InLCBlcnJvcjogZXJyPy5tZXNzYWdlIHx8IFN0cmluZyhlcnIgfHwgJ1Vua25vd24gZXJyb3InKSB9IH0pO1xuICAgIHRocm93IGVycjtcbiAgfSBmaW5hbGx5IHtcbiAgICBjb25zdCB0YWJJZCA9IHJ1blN0YXRlLnRhYklkO1xuICAgIGlmIChydW5TdGF0ZS5wb2xsVGltZXIpIHtcbiAgICAgIHRyeSB7IGNsZWFySW50ZXJ2YWwocnVuU3RhdGUucG9sbFRpbWVyKTsgfSBjYXRjaCAoX2Vycikge31cbiAgICAgIHJ1blN0YXRlLnBvbGxUaW1lciA9IG51bGw7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdGFiSWQgPT09ICdudW1iZXInKSB7XG4gICAgICBhd2FpdCBjbGVhclJ1blN0YXRlSW5QYWdlKHRhYklkLCBydW5JZCk7XG4gICAgfVxuICAgIGFjdGl2ZVJ1bnMuZGVsZXRlKHJ1bklkKTtcbiAgfVxufVxuXG4vKipcbiAqIFRoZSBFeGVjdXRvcjogdGhpcyBmdW5jdGlvbiBpcyBzZXJpYWxpemVkIGFuZCBpbmplY3RlZCBpbnRvIHRoZSBwYWdlIGNvbnRleHQuXG4gKiBQb3J0ZWQgZnJvbSBDYXJhdmFuRmxvdyBBZ2VudCB3aXRoIGZ1bGwgYXV0b21hdGlvbiBjYXBhYmlsaXRpZXMuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHBlcmZvcm1QYWdlQWN0aW9ucyhhY3Rpb25zLCB0cmFjZU1ldGEgPSBudWxsLCBydW5JZCA9ICcnLCBvcHRpb25zSW5wdXQgPSBudWxsKSB7XG4gIGNvbnN0IHNsZWVwID0gKG1zKSA9PiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc2V0VGltZW91dChyZXNvbHZlLCBtcykpO1xuICBjb25zdCBvcHRpb25zID0gb3B0aW9uc0lucHV0ICYmIHR5cGVvZiBvcHRpb25zSW5wdXQgPT09ICdvYmplY3QnID8gb3B0aW9uc0lucHV0IDoge307XG4gIGNvbnN0IGxvZ0xpZmVjeWNsZSA9IG9wdGlvbnMuc3VwcHJlc3NMaWZlY3ljbGVMb2dzICE9PSB0cnVlO1xuICBjb25zdCBodW1hbml6ZWREZWxheUVuYWJsZWQgPSBvcHRpb25zLmh1bWFuaXplZERlbGF5RW5hYmxlZCA9PT0gdHJ1ZTtcbiAgY29uc3QgcGFyc2VkQmFzZURlbGF5TXMgPSBOdW1iZXIob3B0aW9ucy5odW1hbml6ZWREZWxheUJhc2VNcyk7XG4gIGNvbnN0IHBhcnNlZEppdHRlckRlbGF5TXMgPSBOdW1iZXIob3B0aW9ucy5odW1hbml6ZWREZWxheUppdHRlck1zKTtcbiAgY29uc3QgaHVtYW5pemVkRGVsYXlCYXNlTXMgPSBOdW1iZXIuaXNGaW5pdGUocGFyc2VkQmFzZURlbGF5TXMpXG4gICAgPyBNYXRoLm1pbig1MDAwLCBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKHBhcnNlZEJhc2VEZWxheU1zKSkpXG4gICAgOiAyMjA7XG4gIGNvbnN0IGh1bWFuaXplZERlbGF5Sml0dGVyTXMgPSBOdW1iZXIuaXNGaW5pdGUocGFyc2VkSml0dGVyRGVsYXlNcylcbiAgICA/IE1hdGgubWluKDUwMDAsIE1hdGgubWF4KDAsIE1hdGgucm91bmQocGFyc2VkSml0dGVyRGVsYXlNcykpKVxuICAgIDogMjYwO1xuICBjb25zdCBhbGxvd0FpU2NyaXB0cyA9IG9wdGlvbnMuYWxsb3dBaVNjcmlwdHMgPT09IHRydWU7XG4gIGNvbnN0IGRlZmF1bHRBbGxvd1NlbnNpdGl2ZUZpbGwgPSBvcHRpb25zLmFsbG93U2Vuc2l0aXZlRmlsbCA9PT0gdHJ1ZTtcbiAgY29uc3QgZGVmYXVsdEFsbG93U2Vuc2l0aXZlT3ZlcndyaXRlID0gb3B0aW9ucy5hbGxvd1NlbnNpdGl2ZU92ZXJ3cml0ZSA9PT0gdHJ1ZTtcblxuICBjb25zdCB0cmFjZSA9IHtcbiAgICBydW5JZDogU3RyaW5nKHRyYWNlTWV0YT8ucnVuSWQgfHwgJycpLnRyaW0oKSxcbiAgICBjb21tYW5kSWQ6IFN0cmluZyh0cmFjZU1ldGE/LmNvbW1hbmRJZCB8fCAnJykudHJpbSgpXG4gIH07XG5cbiAgZnVuY3Rpb24gdHJhY2VQcmVmaXhMb2NhbCgpIHtcbiAgICBjb25zdCBwYXJ0cyA9IFtdO1xuICAgIGlmICh0cmFjZS5ydW5JZCkgcGFydHMucHVzaChgcnVuPSR7dHJhY2UucnVuSWR9YCk7XG4gICAgaWYgKHRyYWNlLmNvbW1hbmRJZCkgcGFydHMucHVzaChgY21kPSR7dHJhY2UuY29tbWFuZElkfWApO1xuICAgIHJldHVybiBwYXJ0cy5sZW5ndGggPiAwID8gYFske3BhcnRzLmpvaW4oJyAnKX1dIGAgOiAnJztcbiAgfVxuXG4gIC8vIENyb3NzLXdvcmxkIHN0YXRlIGNoYW5uZWw6XG4gIC8vIC0gVGhpcyBleGVjdXRvciBydW5zIGluIHRoZSBwYWdlIFwiTUFJTlwiIHdvcmxkIChubyBleHRlbnNpb24gQVBJcykuXG4gIC8vIC0gV2UgcGVyc2lzdCBsaWdodHdlaWdodCBwcm9ncmVzcyBzdGF0ZSBvbiB3aW5kb3cgc28gdGhlIGJhY2tncm91bmQgY2FuIHBvbGwgYW5kIHVwZGF0ZSB0aGUgVUkuXG4gIGNvbnN0IFJVTl9TVEFURV9LRVkgPSAnX19iaWxnZUJhdGNoUnVuU3RhdGUnO1xuXG4gIGZ1bmN0aW9uIHVwZGF0ZVJ1blN0YXRlKHBhdGNoKSB7XG4gICAgaWYgKCFydW5JZCkgcmV0dXJuO1xuICAgIHRyeSB7XG4gICAgICBpZiAoIXdpbmRvd1tSVU5fU1RBVEVfS0VZXSB8fCB0eXBlb2Ygd2luZG93W1JVTl9TVEFURV9LRVldICE9PSAnb2JqZWN0Jykgd2luZG93W1JVTl9TVEFURV9LRVldID0ge307XG4gICAgICBjb25zdCByb290ID0gd2luZG93W1JVTl9TVEFURV9LRVldO1xuICAgICAgY29uc3QgcHJldiA9IHJvb3RbcnVuSWRdICYmIHR5cGVvZiByb290W3J1bklkXSA9PT0gJ29iamVjdCcgPyByb290W3J1bklkXSA6IHt9O1xuICAgICAgY29uc3QgbmV4dCA9IHtcbiAgICAgICAgLi4ucHJldixcbiAgICAgICAgLi4ucGF0Y2gsXG4gICAgICAgIHJ1bklkLFxuICAgICAgICB1cGRhdGVkQXQ6IERhdGUubm93KCksXG4gICAgICAgIHNlcTogTnVtYmVyKHByZXYuc2VxIHx8IDApICsgMSxcbiAgICAgIH07XG4gICAgICByb290W3J1bklkXSA9IG5leHQ7XG4gICAgfSBjYXRjaCAoX2Vycikge31cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlbW90ZUxvZyh0ZXh0LCBsZXZlbCA9ICdJTkZPJykge1xuICAgIGNvbnN0IGRlY29yYXRlZCA9IGAke3RyYWNlUHJlZml4TG9jYWwoKX0ke3RleHR9YDtcbiAgICB1cGRhdGVSdW5TdGF0ZSh7IGxhc3RMb2c6IHsgdHM6IERhdGUubm93KCksIGxldmVsLCB0ZXh0OiBkZWNvcmF0ZWQgfSB9KTtcbiAgICB0cnkgeyBjb25zb2xlLmxvZyhgWyR7bGV2ZWx9XSAke2RlY29yYXRlZH1gKTsgfSBjYXRjaCAoX2Vycikge31cbiAgfVxuXG4gIGZ1bmN0aW9uIGlzQ2FuY2VsbGVkKCkge1xuICAgIGNvbnN0IGtleSA9ICdfX2JpbGdlQ2FuY2VsbGVkUnVucyc7XG4gICAgaWYgKCFydW5JZCkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiBCb29sZWFuKHdpbmRvd1trZXldPy5bcnVuSWRdKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG5leHRIdW1hbml6ZWREZWxheU1zKCkge1xuICAgIGlmICghaHVtYW5pemVkRGVsYXlFbmFibGVkKSByZXR1cm4gMDtcbiAgICBpZiAoaHVtYW5pemVkRGVsYXlKaXR0ZXJNcyA8PSAwKSByZXR1cm4gaHVtYW5pemVkRGVsYXlCYXNlTXM7XG4gICAgcmV0dXJuIGh1bWFuaXplZERlbGF5QmFzZU1zICsgTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKGh1bWFuaXplZERlbGF5Sml0dGVyTXMgKyAxKSk7XG4gIH1cblxuICAvLyBUZXh0IG5vcm1hbGl6YXRpb24gYW5kIHRva2VuaXphdGlvblxuICBmdW5jdGlvbiBub3JtYWxpemVUZXh0KHZhbHVlKSB7XG4gICAgcmV0dXJuIFN0cmluZyh2YWx1ZSB8fCAnJykudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9bXmEtejAtOV0rL2csICcnKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHRva2VuaXplKHZhbHVlKSB7XG4gICAgcmV0dXJuIFN0cmluZyh2YWx1ZSB8fCAnJylcbiAgICAgIC5yZXBsYWNlKC8oW2Etel0pKFtBLVpdKS9nLCAnJDEgJDInKVxuICAgICAgLnRvTG93ZXJDYXNlKClcbiAgICAgIC5zcGxpdCgvW15hLXowLTldKy8pXG4gICAgICAubWFwKChwYXJ0KSA9PiBwYXJ0LnRyaW0oKSlcbiAgICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gIH1cblxuICAvLyBTZWxlY3RvciBoaW50IGV4dHJhY3Rpb25cbiAgZnVuY3Rpb24gZXh0cmFjdFNlbGVjdG9ySGludHMoc2VsZWN0b3IpIHtcbiAgICBjb25zdCBoaW50cyA9IFtdO1xuICAgIGNvbnN0IGF0dHJNYXRjaGVzID0gc2VsZWN0b3IubWF0Y2hBbGwoXG4gICAgICAvXFxbXFxzKihuYW1lfGlkfHBsYWNlaG9sZGVyfGFyaWEtbGFiZWx8ZGF0YS10ZXN0aWR8ZGF0YS10ZXN0LWlkfGRhdGEtcWEpXFxzKig/OlsqXiR8fl0/PSlcXHMqKD86WydcIl0oW14nXCJdKylbJ1wiXXwoW15cXF1cXHNdKykpXFxzKlxcXS9naVxuICAgICk7XG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiBhdHRyTWF0Y2hlcykge1xuICAgICAgaGludHMucHVzaChtYXRjaFsyXSB8fCBtYXRjaFszXSB8fCAnJyk7XG4gICAgfVxuICAgIGNvbnN0IGlkTWF0Y2hlcyA9IHNlbGVjdG9yLm1hdGNoQWxsKC8jKFtBLVphLXowLTlfLV0rKS9nKTtcbiAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIGlkTWF0Y2hlcykge1xuICAgICAgaGludHMucHVzaChTdHJpbmcobWF0Y2hbMV0gfHwgJycpLnJlcGxhY2UoL1tfLV0rL2csICcgJykpO1xuICAgIH1cbiAgICBjb25zdCBjbGFzc01hdGNoZXMgPSBzZWxlY3Rvci5tYXRjaEFsbCgvXFwuKFtBLVphLXowLTlfLV0rKS9nKTtcbiAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIGNsYXNzTWF0Y2hlcykge1xuICAgICAgaGludHMucHVzaChTdHJpbmcobWF0Y2hbMV0gfHwgJycpLnJlcGxhY2UoL1tfLV0rL2csICcgJykpO1xuICAgIH1cbiAgICBjb25zdCB0YWdNYXRjaCA9IHNlbGVjdG9yLm1hdGNoKC9eXFxzKihbYS16XSspL2kpO1xuICAgIGNvbnN0IHByZWZlcnJlZFRhZyA9IHRhZ01hdGNoID8gU3RyaW5nKHRhZ01hdGNoWzFdKS50b0xvd2VyQ2FzZSgpIDogJyc7XG4gICAgcmV0dXJuIHsgaGludHMsIHByZWZlcnJlZFRhZyB9O1xuICB9XG5cbiAgZnVuY3Rpb24gYnVpbGRTZWxlY3RvckNhbmRpZGF0ZXMoYWN0aW9uKSB7XG4gICAgY29uc3QgcmF3ID0gW107XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoYWN0aW9uLnNlbGVjdG9ycykpIHJhdy5wdXNoKC4uLmFjdGlvbi5zZWxlY3RvcnMpO1xuICAgIHJhdy5wdXNoKGFjdGlvbi5zZWxlY3Rvcik7XG4gICAgY29uc3Qgc2VlbiA9IG5ldyBTZXQoKTtcbiAgICBjb25zdCBzZWxlY3RvcnMgPSBbXTtcbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgcmF3KSB7XG4gICAgICBjb25zdCBzZWxlY3RvciA9IFN0cmluZyhpdGVtIHx8ICcnKS50cmltKCk7XG4gICAgICBpZiAoIXNlbGVjdG9yIHx8IHNlZW4uaGFzKHNlbGVjdG9yKSkgY29udGludWU7XG4gICAgICBzZWVuLmFkZChzZWxlY3Rvcik7XG4gICAgICBzZWxlY3RvcnMucHVzaChzZWxlY3Rvcik7XG4gICAgfVxuICAgIHJldHVybiBzZWxlY3RvcnM7XG4gIH1cblxuICAvLyBMYWJlbCBmaW5kaW5nIHV0aWxpdGllc1xuICBmdW5jdGlvbiBmaW5kTGFiZWxUZXh0KGVsZW1lbnQpIHtcbiAgICBpZiAoIShlbGVtZW50IGluc3RhbmNlb2YgRWxlbWVudCkpIHJldHVybiAnJztcbiAgICBjb25zdCBwYXJ0cyA9IFtdO1xuICAgIGNvbnN0IGlkID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2lkJyk7XG4gICAgaWYgKGlkKSB7XG4gICAgICBjb25zdCBsYWJlbEZvciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYGxhYmVsW2Zvcj1cIiR7Q1NTLmVzY2FwZShpZCl9XCJdYCk7XG4gICAgICBpZiAobGFiZWxGb3I/LnRleHRDb250ZW50KSBwYXJ0cy5wdXNoKGxhYmVsRm9yLnRleHRDb250ZW50KTtcbiAgICB9XG4gICAgY29uc3QgY2xvc2VzdExhYmVsID0gZWxlbWVudC5jbG9zZXN0KCdsYWJlbCcpO1xuICAgIGlmIChjbG9zZXN0TGFiZWw/LnRleHRDb250ZW50KSBwYXJ0cy5wdXNoKGNsb3Nlc3RMYWJlbC50ZXh0Q29udGVudCk7XG4gICAgY29uc3QgcGFyZW50TGFiZWwgPSBlbGVtZW50LnBhcmVudEVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3I/LignbGFiZWwnKTtcbiAgICBpZiAocGFyZW50TGFiZWw/LnRleHRDb250ZW50KSBwYXJ0cy5wdXNoKHBhcmVudExhYmVsLnRleHRDb250ZW50KTtcbiAgICByZXR1cm4gcGFydHMuam9pbignICcpO1xuICB9XG5cbiAgZnVuY3Rpb24gZWxlbWVudFNlYXJjaFRleHQoZWxlbWVudCkge1xuICAgIGNvbnN0IGF0dHJLZXlzID0gW1xuICAgICAgJ25hbWUnLCAnaWQnLCAncGxhY2Vob2xkZXInLCAnYXJpYS1sYWJlbCcsICdhdXRvY29tcGxldGUnLFxuICAgICAgJ2RhdGEtdGVzdGlkJywgJ2RhdGEtdGVzdC1pZCcsICdkYXRhLXFhJywgJ3RpdGxlJ1xuICAgIF07XG4gICAgY29uc3QgdmFsdWVzID0gW107XG4gICAgdmFsdWVzLnB1c2goZWxlbWVudC50YWdOYW1lLnRvTG93ZXJDYXNlKCkpO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIGF0dHJLZXlzKSB7XG4gICAgICBjb25zdCB2ID0gZWxlbWVudC5nZXRBdHRyaWJ1dGU/LihrZXkpO1xuICAgICAgaWYgKHYpIHZhbHVlcy5wdXNoKHYpO1xuICAgIH1cbiAgICB2YWx1ZXMucHVzaChmaW5kTGFiZWxUZXh0KGVsZW1lbnQpKTtcbiAgICBjb25zdCByb2xlID0gZWxlbWVudC5nZXRBdHRyaWJ1dGU/Ligncm9sZScpO1xuICAgIGlmIChyb2xlKSB2YWx1ZXMucHVzaChyb2xlKTtcbiAgICByZXR1cm4gbm9ybWFsaXplVGV4dCh2YWx1ZXMuam9pbignICcpKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzVXNhYmxlRmllbGQoZWxlbWVudCkge1xuICAgIGlmICghKGVsZW1lbnQgaW5zdGFuY2VvZiBFbGVtZW50KSkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGRpc2FibGVkID0gZWxlbWVudC5oYXNBdHRyaWJ1dGUoJ2Rpc2FibGVkJykgfHwgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnKSA9PT0gJ3RydWUnO1xuICAgIGNvbnN0IHJlY3QgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IHN0eWxlID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWxlbWVudCk7XG4gICAgaWYgKGRpc2FibGVkKSByZXR1cm4gZmFsc2U7XG4gICAgaWYgKHN0eWxlLmRpc3BsYXkgPT09ICdub25lJyB8fCBzdHlsZS52aXNpYmlsaXR5ID09PSAnaGlkZGVuJykgcmV0dXJuIGZhbHNlO1xuICAgIGlmIChyZWN0LndpZHRoIDwgMiB8fCByZWN0LmhlaWdodCA8IDIpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIC8vIEhldXJpc3RpYyB0b2tlbiBjb2xsZWN0aW9uXG4gIGZ1bmN0aW9uIGNvbGxlY3RIaW50VG9rZW5zKGFjdGlvbiwgc2VsZWN0b3JzKSB7XG4gICAgY29uc3QgdG9rZW5TZXQgPSBuZXcgU2V0KCk7XG4gICAgY29uc3QgcmF3SGludHMgPSBbYWN0aW9uLmZpZWxkLCBhY3Rpb24ubmFtZSwgYWN0aW9uLmtleSwgYWN0aW9uLmxhYmVsLCBhY3Rpb24ucGxhY2Vob2xkZXJdO1xuICAgIGxldCBwcmVmZXJyZWRUYWcgPSAnJztcblxuICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBleHRyYWN0U2VsZWN0b3JIaW50cyhzZWxlY3Rvcik7XG4gICAgICByYXdIaW50cy5wdXNoKC4uLnBhcnNlZC5oaW50cyk7XG4gICAgICBpZiAoIXByZWZlcnJlZFRhZyAmJiBwYXJzZWQucHJlZmVycmVkVGFnKSBwcmVmZXJyZWRUYWcgPSBwYXJzZWQucHJlZmVycmVkVGFnO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgaGludCBvZiByYXdIaW50cykge1xuICAgICAgZm9yIChjb25zdCB0b2tlbiBvZiB0b2tlbml6ZShoaW50KSkgdG9rZW5TZXQuYWRkKHRva2VuKTtcbiAgICB9XG5cbiAgICAvLyBFeHBhbmQgc3lub255bXNcbiAgICBjb25zdCBleHBhbmRlZCA9IG5ldyBTZXQodG9rZW5TZXQpO1xuICAgIGlmIChleHBhbmRlZC5oYXMoJ2ZpcnN0JykpIGV4cGFuZGVkLmFkZCgnZ2l2ZW4nKTtcbiAgICBpZiAoZXhwYW5kZWQuaGFzKCdsYXN0JykpIHtcbiAgICAgIGV4cGFuZGVkLmFkZCgnZmFtaWx5Jyk7XG4gICAgICBleHBhbmRlZC5hZGQoJ3N1cm5hbWUnKTtcbiAgICB9XG4gICAgaWYgKGV4cGFuZGVkLmhhcygncGhvbmUnKSkgZXhwYW5kZWQuYWRkKCd0ZWwnKTtcbiAgICBpZiAoZXhwYW5kZWQuaGFzKCdtYWlsJykpIGV4cGFuZGVkLmFkZCgnZW1haWwnKTtcbiAgICBpZiAoZXhwYW5kZWQuaGFzKCdlbWFpbCcpKSBleHBhbmRlZC5hZGQoJ21haWwnKTtcblxuICAgIHJldHVybiB7XG4gICAgICB0b2tlbnM6IEFycmF5LmZyb20oZXhwYW5kZWQpLFxuICAgICAgcHJlZmVycmVkVGFnXG4gICAgfTtcbiAgfVxuXG4gIC8vIEhldXJpc3RpYyBlbGVtZW50IHJlc29sdXRpb25cbiAgZnVuY3Rpb24gcmVzb2x2ZUhldXJpc3RpY0VsZW1lbnQoYWN0aW9uLCBzZWxlY3RvcnMpIHtcbiAgICBjb25zdCB7IHRva2VucywgcHJlZmVycmVkVGFnIH0gPSBjb2xsZWN0SGludFRva2VucyhhY3Rpb24sIHNlbGVjdG9ycyk7XG4gICAgaWYgKCF0b2tlbnMubGVuZ3RoKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBBcnJheS5mcm9tKFxuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QsIFtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdLCBbcm9sZT1cInRleHRib3hcIl0nKVxuICAgICkuZmlsdGVyKGlzVXNhYmxlRmllbGQpO1xuXG4gICAgY29uc3QgcGhyYXNlID0gbm9ybWFsaXplVGV4dCh0b2tlbnMuam9pbignJykpO1xuICAgIGxldCBiZXN0ID0gbnVsbDtcblxuICAgIGZvciAoY29uc3QgZWxlbWVudCBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICBjb25zdCBoYXlzdGFjayA9IGVsZW1lbnRTZWFyY2hUZXh0KGVsZW1lbnQpO1xuICAgICAgaWYgKCFoYXlzdGFjaykgY29udGludWU7XG4gICAgICBsZXQgc2NvcmUgPSAwO1xuXG4gICAgICBmb3IgKGNvbnN0IHRva2VuIG9mIHRva2Vucykge1xuICAgICAgICBjb25zdCBub3JtYWxpemVkVG9rZW4gPSBub3JtYWxpemVUZXh0KHRva2VuKTtcbiAgICAgICAgaWYgKCFub3JtYWxpemVkVG9rZW4pIGNvbnRpbnVlO1xuICAgICAgICBpZiAoaGF5c3RhY2suaW5jbHVkZXMobm9ybWFsaXplZFRva2VuKSkge1xuICAgICAgICAgIHNjb3JlICs9IG5vcm1hbGl6ZWRUb2tlbi5sZW5ndGggPj0gNCA/IDIgOiAxO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChwaHJhc2UgJiYgaGF5c3RhY2suaW5jbHVkZXMocGhyYXNlKSkgc2NvcmUgKz0gMztcbiAgICAgIGlmIChwcmVmZXJyZWRUYWcgJiYgZWxlbWVudC50YWdOYW1lLnRvTG93ZXJDYXNlKCkgPT09IHByZWZlcnJlZFRhZykgc2NvcmUgKz0gMTtcblxuICAgICAgaWYgKCFiZXN0IHx8IHNjb3JlID4gYmVzdC5zY29yZSkge1xuICAgICAgICBiZXN0ID0geyBlbGVtZW50LCBzY29yZSwgdG9rZW5zIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFiZXN0IHx8IGJlc3Quc2NvcmUgPD0gMCkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIGJlc3Q7XG4gIH1cblxuICAvLyBFbGVtZW50IHJlc29sdXRpb24gd2l0aCBmYWxsYmFja3NcbiAgZnVuY3Rpb24gcmVzb2x2ZUFjdGlvbkVsZW1lbnQoYWN0aW9uLCBzdGVwSW5kZXgsIHRvdGFsU3RlcHMsIHR5cGUpIHtcbiAgICBjb25zdCBzZWxlY3RvcnMgPSBidWlsZFNlbGVjdG9yQ2FuZGlkYXRlcyhhY3Rpb24pO1xuICAgIGZvciAobGV0IGlkeCA9IDA7IGlkeCA8IHNlbGVjdG9ycy5sZW5ndGg7IGlkeCArPSAxKSB7XG4gICAgICBjb25zdCBzZWxlY3RvciA9IHNlbGVjdG9yc1tpZHhdO1xuICAgICAgcmVtb3RlTG9nKGBTdGVwICR7c3RlcEluZGV4fS8ke3RvdGFsU3RlcHN9OiBzZWxlY3RvciB0cnkgJHtpZHggKyAxfS8ke3NlbGVjdG9ycy5sZW5ndGh9OiAke3NlbGVjdG9yfWAsICdJTkZPJyk7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgICAgIGlmIChlbGVtZW50KSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGVsZW1lbnQsXG4gICAgICAgICAgICBtYXRjaGVkQnk6IGBzZWxlY3Rvcjoke3NlbGVjdG9yfWAsXG4gICAgICAgICAgICBzZWxlY3RvcnNcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgcmVtb3RlTG9nKGBTdGVwICR7c3RlcEluZGV4fS8ke3RvdGFsU3RlcHN9OiBpbnZhbGlkIHNlbGVjdG9yICR7c2VsZWN0b3J9ICgke2Vyci5tZXNzYWdlfSlgLCAnV0FSTicpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEZhbGxiYWNrIHRvIGhldXJpc3RpYyBtYXRjaGluZ1xuICAgIGlmICh0eXBlID09PSAnZmlsbCcgfHwgdHlwZSA9PT0gJ3R5cGUnIHx8IHR5cGUgPT09ICdjbGljaycgfHwgdHlwZSA9PT0gJ3Njcm9sbCcpIHtcbiAgICAgIGNvbnN0IGhldXJpc3RpYyA9IHJlc29sdmVIZXVyaXN0aWNFbGVtZW50KGFjdGlvbiwgc2VsZWN0b3JzKTtcbiAgICAgIGlmIChoZXVyaXN0aWM/LmVsZW1lbnQpIHtcbiAgICAgICAgY29uc3QgdG9rZW5UZXh0ID0gaGV1cmlzdGljLnRva2Vucy5qb2luKCcsJyk7XG4gICAgICAgIHJlbW90ZUxvZyhcbiAgICAgICAgICBgU3RlcCAke3N0ZXBJbmRleH0vJHt0b3RhbFN0ZXBzfTogaGV1cmlzdGljIG1hdGNoZWQgZmllbGQgKHNjb3JlPSR7aGV1cmlzdGljLnNjb3JlfSwgdG9rZW5zPSR7dG9rZW5UZXh0fSlgLFxuICAgICAgICAgICdJTkZPJ1xuICAgICAgICApO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGVsZW1lbnQ6IGhldXJpc3RpYy5lbGVtZW50LFxuICAgICAgICAgIG1hdGNoZWRCeTogYGhldXJpc3RpYzoke3Rva2VuVGV4dH1gLFxuICAgICAgICAgIHNlbGVjdG9yc1xuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBlbGVtZW50OiBudWxsLFxuICAgICAgbWF0Y2hlZEJ5OiAnJyxcbiAgICAgIHNlbGVjdG9yc1xuICAgIH07XG4gIH1cblxuICAvLyBGaWVsZCB2YWx1ZSByZWFkaW5nL2luZmVyZW5jZVxuICBmdW5jdGlvbiByZWFkRWxlbWVudFZhbHVlKGVsZW1lbnQpIHtcbiAgICBpZiAoIWVsZW1lbnQpIHJldHVybiAnJztcbiAgICBpZiAoZWxlbWVudC5pc0NvbnRlbnRFZGl0YWJsZSkgcmV0dXJuIFN0cmluZyhlbGVtZW50LnRleHRDb250ZW50IHx8ICcnKTtcbiAgICBpZiAoJ3ZhbHVlJyBpbiBlbGVtZW50KSByZXR1cm4gU3RyaW5nKGVsZW1lbnQudmFsdWUgPz8gJycpO1xuICAgIHJldHVybiBTdHJpbmcoZWxlbWVudC5nZXRBdHRyaWJ1dGU/LigndmFsdWUnKSB8fCAnJyk7XG4gIH1cblxuICBmdW5jdGlvbiBpbmZlckZpbGxGaWVsZEtpbmQoZWxlbWVudCwgYWN0aW9uKSB7XG4gICAgY29uc3QgdGFnID0gU3RyaW5nKGVsZW1lbnQ/LnRhZ05hbWUgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgdHlwZSA9IFN0cmluZyhlbGVtZW50Py5nZXRBdHRyaWJ1dGU/LigndHlwZScpIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IGhpbnRUZXh0ID0gW1xuICAgICAgYWN0aW9uPy5maWVsZCwgYWN0aW9uPy5uYW1lLCBhY3Rpb24/LmtleSwgYWN0aW9uPy5sYWJlbCwgYWN0aW9uPy5wbGFjZWhvbGRlcixcbiAgICAgIGVsZW1lbnQ/LmdldEF0dHJpYnV0ZT8uKCduYW1lJyksIGVsZW1lbnQ/LmdldEF0dHJpYnV0ZT8uKCdpZCcpLFxuICAgICAgZWxlbWVudD8uZ2V0QXR0cmlidXRlPy4oJ2FyaWEtbGFiZWwnKSwgZWxlbWVudD8uZ2V0QXR0cmlidXRlPy4oJ3BsYWNlaG9sZGVyJyksXG4gICAgICBmaW5kTGFiZWxUZXh0KGVsZW1lbnQpXG4gICAgXS5qb2luKCcgJykudG9Mb3dlckNhc2UoKTtcblxuICAgIGlmICh0eXBlID09PSAnZW1haWwnIHx8IC9cXGJlbWFpbFxcYi8udGVzdChoaW50VGV4dCkpIHJldHVybiAnZW1haWwnO1xuICAgIGlmICh0eXBlID09PSAndGVsJyB8fCAvXFxiKHBob25lfHRlbHxtb2JpbGUpXFxiLy50ZXN0KGhpbnRUZXh0KSkgcmV0dXJuICdwaG9uZSc7XG4gICAgaWYgKC9cXGIoemlwfHBvc3RhbClcXGIvLnRlc3QoaGludFRleHQpKSByZXR1cm4gJ3ppcCc7XG4gICAgaWYgKHR5cGUgPT09ICdkYXRlJyB8fCAvXFxiKGRvYnxkYXRlfGZyb20gZGF0ZXx0byBkYXRlfHN0YXJ0IGRhdGV8ZW5kIGRhdGUpXFxiLy50ZXN0KGhpbnRUZXh0KSkgcmV0dXJuICdkYXRlJztcbiAgICBpZiAoL1xcYnN0YXRlXFxiLy50ZXN0KGhpbnRUZXh0KSkgcmV0dXJuICdzdGF0ZSc7XG4gICAgaWYgKHR5cGUgPT09ICdjaGVja2JveCcpIHJldHVybiAnY2hlY2tib3gnO1xuICAgIGlmICh0eXBlID09PSAncmFkaW8nKSByZXR1cm4gJ3JhZGlvJztcbiAgICBpZiAodGFnID09PSAnc2VsZWN0JykgcmV0dXJuICdzZWxlY3QnO1xuICAgIHJldHVybiAndGV4dCc7XG4gIH1cblxuICBmdW5jdGlvbiBub3JtYWxpemVDb21wYXJhYmxlVmFsdWUoa2luZCwgdmFsdWUpIHtcbiAgICBjb25zdCB0ZXh0ID0gU3RyaW5nKHZhbHVlID8/ICcnKS50cmltKCk7XG4gICAgaWYgKCF0ZXh0KSByZXR1cm4gJyc7XG4gICAgaWYgKGtpbmQgPT09ICdlbWFpbCcpIHJldHVybiB0ZXh0LnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKGtpbmQgPT09ICdwaG9uZScpIHJldHVybiB0ZXh0LnJlcGxhY2UoL1xcRCsvZywgJycpO1xuICAgIGlmIChraW5kID09PSAnemlwJykgcmV0dXJuIHRleHQucmVwbGFjZSgvXFxEKy9nLCAnJyk7XG4gICAgaWYgKGtpbmQgPT09ICdzdGF0ZScpIHJldHVybiB0ZXh0LnRvVXBwZXJDYXNlKCkucmVwbGFjZSgvW15BLVpdL2csICcnKS5zbGljZSgwLCAyKTtcbiAgICBpZiAoa2luZCA9PT0gJ2RhdGUnKSByZXR1cm4gdGV4dC5yZXBsYWNlKC9cXHMrL2csICcnKTtcbiAgICByZXR1cm4gdGV4dC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgLy8gVmFsdWUgc2FuaXRpemF0aW9uXG4gIGZ1bmN0aW9uIHNhbml0aXplRmlsbFZhbHVlKGtpbmQsIHJhd1ZhbHVlLCBlbGVtZW50KSB7XG4gICAgY29uc3QgdGV4dCA9IFN0cmluZyhyYXdWYWx1ZSA/PyAnJykudHJpbSgpO1xuICAgIGNvbnN0IGlucHV0VHlwZSA9IFN0cmluZyhlbGVtZW50Py5nZXRBdHRyaWJ1dGU/LigndHlwZScpIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgaWYgKGtpbmQgPT09ICdlbWFpbCcpIHtcbiAgICAgIGNvbnN0IGVtYWlsID0gdGV4dC50b0xvd2VyQ2FzZSgpO1xuICAgICAgaWYgKCFlbWFpbCB8fCAhL15bXlxcc0BdK0BbXlxcc0BdK1xcLlteXFxzQF0rJC8udGVzdChlbWFpbCkpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IGBpbnZhbGlkIGVtYWlsIHZhbHVlIFwiJHt0ZXh0fVwiYCB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiBlbWFpbCB9O1xuICAgIH1cblxuICAgIGlmIChraW5kID09PSAncGhvbmUnKSB7XG4gICAgICBjb25zdCBkaWdpdHMgPSB0ZXh0LnJlcGxhY2UoL1xcRCsvZywgJycpO1xuICAgICAgaWYgKGRpZ2l0cy5sZW5ndGggPCAxMCkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IGBpbnZhbGlkIHBob25lIHZhbHVlIFwiJHt0ZXh0fVwiYCB9O1xuICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IGRpZ2l0cy5sZW5ndGggPj0gMTAgPyBkaWdpdHMuc2xpY2UoLTEwKSA6IGRpZ2l0cztcbiAgICAgIGNvbnN0IGZvcm1hdHRlZCA9IG5vcm1hbGl6ZWQubGVuZ3RoID09PSAxMFxuICAgICAgICA/IGAke25vcm1hbGl6ZWQuc2xpY2UoMCwgMyl9LSR7bm9ybWFsaXplZC5zbGljZSgzLCA2KX0tJHtub3JtYWxpemVkLnNsaWNlKDYpfWBcbiAgICAgICAgOiBub3JtYWxpemVkO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiBmb3JtYXR0ZWQgfTtcbiAgICB9XG5cbiAgICBpZiAoa2luZCA9PT0gJ3ppcCcpIHtcbiAgICAgIGNvbnN0IGRpZ2l0cyA9IHRleHQucmVwbGFjZSgvXFxEKy9nLCAnJyk7XG4gICAgICBpZiAoZGlnaXRzLmxlbmd0aCA8IDUpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBgaW52YWxpZCB6aXAgdmFsdWUgXCIke3RleHR9XCJgIH07XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IGRpZ2l0cy5zbGljZSgwLCA1KSB9O1xuICAgIH1cblxuICAgIGlmIChraW5kID09PSAnc3RhdGUnKSB7XG4gICAgICBjb25zdCBsZXR0ZXJzID0gdGV4dC50b1VwcGVyQ2FzZSgpLnJlcGxhY2UoL1teQS1aXS9nLCAnJyk7XG4gICAgICBpZiAobGV0dGVycy5sZW5ndGggPCAyKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogYGludmFsaWQgc3RhdGUgdmFsdWUgXCIke3RleHR9XCJgIH07XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IGxldHRlcnMuc2xpY2UoMCwgMikgfTtcbiAgICB9XG5cbiAgICBpZiAoa2luZCA9PT0gJ2RhdGUnKSB7XG4gICAgICBjb25zdCBpc29NYXRjaCA9IHRleHQubWF0Y2goL14oXFxkezR9KS0oXFxkezJ9KS0oXFxkezJ9KSQvKTtcbiAgICAgIGNvbnN0IG1keU1hdGNoID0gdGV4dC5tYXRjaCgvXihcXGR7MSwyfSlcXC8oXFxkezEsMn0pXFwvKFxcZHs0fSkkLyk7XG4gICAgICBpZiAoaW5wdXRUeXBlID09PSAnZGF0ZScpIHtcbiAgICAgICAgaWYgKGlzb01hdGNoKSByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHRleHQgfTtcbiAgICAgICAgaWYgKG1keU1hdGNoKSB7XG4gICAgICAgICAgY29uc3QgbW0gPSBtZHlNYXRjaFsxXS5wYWRTdGFydCgyLCAnMCcpO1xuICAgICAgICAgIGNvbnN0IGRkID0gbWR5TWF0Y2hbMl0ucGFkU3RhcnQoMiwgJzAnKTtcbiAgICAgICAgICBjb25zdCB5eXl5ID0gbWR5TWF0Y2hbM107XG4gICAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiBgJHt5eXl5fS0ke21tfS0ke2RkfWAgfTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKG1keU1hdGNoKSB7XG4gICAgICAgICAgY29uc3QgbW0gPSBtZHlNYXRjaFsxXS5wYWRTdGFydCgyLCAnMCcpO1xuICAgICAgICAgIGNvbnN0IGRkID0gbWR5TWF0Y2hbMl0ucGFkU3RhcnQoMiwgJzAnKTtcbiAgICAgICAgICBjb25zdCB5eXl5ID0gbWR5TWF0Y2hbM107XG4gICAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiBgJHttbX0vJHtkZH0vJHt5eXl5fWAgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoaXNvTWF0Y2gpIHtcbiAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IGAke2lzb01hdGNoWzJdfS8ke2lzb01hdGNoWzNdfS8ke2lzb01hdGNoWzFdfWAgfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKCF0ZXh0KSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ2VtcHR5IGRhdGUgdmFsdWUnIH07XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHRleHQgfTtcbiAgICB9XG5cbiAgICBpZiAoa2luZCA9PT0gJ2NoZWNrYm94Jykge1xuICAgICAgY29uc3QgbG93ZXJlZCA9IHRleHQudG9Mb3dlckNhc2UoKTtcbiAgICAgIGNvbnN0IGlzQ2hlY2tlZCA9IGxvd2VyZWQgPT09ICd0cnVlJyB8fCBsb3dlcmVkID09PSAnMScgfHwgbG93ZXJlZCA9PT0gJ3llcycgfHwgbG93ZXJlZCA9PT0gJ2NoZWNrZWQnIHx8IGxvd2VyZWQgPT09ICdvbic7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgY2hlY2tlZDogaXNDaGVja2VkIH07XG4gICAgfVxuXG4gICAgaWYgKGtpbmQgPT09ICdyYWRpbycpIHtcbiAgICAgIGlmICghdGV4dCkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdlbXB0eSByYWRpbyB2YWx1ZScgfTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogdGV4dCB9O1xuICAgIH1cblxuICAgIGlmIChraW5kID09PSAnc2VsZWN0Jykge1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB0ZXh0IH07XG4gICAgfVxuXG4gICAgaWYgKCF0ZXh0KSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ2VtcHR5IGZpbGwgdmFsdWUnIH07XG4gICAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB0ZXh0IH07XG4gIH1cblxuICAvLyBTZW5zaXRpdmUgZmllbGQgZGV0ZWN0aW9uXG4gIGZ1bmN0aW9uIGZpZWxkSGludFRleHQoZWxlbWVudCwgYWN0aW9uKSB7XG4gICAgcmV0dXJuIFtcbiAgICAgIGFjdGlvbj8uZmllbGQsIGFjdGlvbj8ubmFtZSwgYWN0aW9uPy5rZXksIGFjdGlvbj8ubGFiZWwsIGFjdGlvbj8ucGxhY2Vob2xkZXIsXG4gICAgICBlbGVtZW50Py5nZXRBdHRyaWJ1dGU/LignbmFtZScpLCBlbGVtZW50Py5nZXRBdHRyaWJ1dGU/LignaWQnKSxcbiAgICAgIGVsZW1lbnQ/LmdldEF0dHJpYnV0ZT8uKCdhcmlhLWxhYmVsJyksIGVsZW1lbnQ/LmdldEF0dHJpYnV0ZT8uKCdwbGFjZWhvbGRlcicpLFxuICAgICAgZmluZExhYmVsVGV4dChlbGVtZW50KVxuICAgIF0uam9pbignICcpLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICBmdW5jdGlvbiBpc1NlbnNpdGl2ZUZpZWxkVGFyZ2V0KGVsZW1lbnQsIGFjdGlvbikge1xuICAgIGNvbnN0IGhpbnQgPSBmaWVsZEhpbnRUZXh0KGVsZW1lbnQsIGFjdGlvbik7XG4gICAgaWYgKCFoaW50KSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIC9cXGIoc3NufHNvY2lhbCBzZWN1cml0eXxwYXNzcG9ydHxkcml2ZXInP3M/XFxzKmxpY2Vuc2V8bGljZW5zZSBudW1iZXJ8bWFpZGVuIG5hbWV8dXNjaXN8YWxpZW4gbnVtYmVyfGEtbnVtYmVyfHRheCBpZHx0aW58aXRpbnxkb2J8ZGF0ZSBvZiBiaXJ0aClcXGIvLnRlc3QoaGludClcbiAgICAgIHx8IC9cXGJkbFxccyojP1xcYi8udGVzdChoaW50KTtcbiAgfVxuXG4gIC8vIE1pZGRsZSBuYW1lIGNoZWNrYm94IGRldGVjdGlvblxuICBmdW5jdGlvbiBpc01pZGRsZU5hbWVUYXJnZXQoZWxlbWVudCwgYWN0aW9uKSB7XG4gICAgY29uc3QgaGludCA9IGZpZWxkSGludFRleHQoZWxlbWVudCwgYWN0aW9uKTtcbiAgICBpZiAoIWhpbnQpIHJldHVybiBmYWxzZTtcbiAgICBpZiAoL1xcYm1pZGRsZVtfXFxzLV0/bmFtZVxcYi8udGVzdChoaW50KSkgcmV0dXJuIHRydWU7XG4gICAgcmV0dXJuIC9cXGJtaWRkbGVcXGIvLnRlc3QoaGludCkgJiYgL1xcYm5hbWVcXGIvLnRlc3QoaGludCk7XG4gIH1cblxuICBmdW5jdGlvbiBjaGVja2JveExhYmVsVGV4dChjaGVja2JveCkge1xuICAgIGNvbnN0IHBhcnRzID0gW107XG4gICAgY29uc3QgaWQgPSBjaGVja2JveD8uZ2V0QXR0cmlidXRlPy4oJ2lkJyk7XG4gICAgY29uc3Qgb3duZXIgPSBjaGVja2JveD8ub3duZXJEb2N1bWVudCB8fCBkb2N1bWVudDtcbiAgICBpZiAoaWQpIHtcbiAgICAgIGNvbnN0IGxhYmVsRm9yID0gb3duZXIucXVlcnlTZWxlY3RvcihgbGFiZWxbZm9yPVwiJHtDU1MuZXNjYXBlKGlkKX1cIl1gKTtcbiAgICAgIGlmIChsYWJlbEZvcj8udGV4dENvbnRlbnQpIHBhcnRzLnB1c2gobGFiZWxGb3IudGV4dENvbnRlbnQpO1xuICAgIH1cbiAgICBjb25zdCBjbG9zZXN0TGFiZWwgPSBjaGVja2JveD8uY2xvc2VzdD8uKCdsYWJlbCcpO1xuICAgIGlmIChjbG9zZXN0TGFiZWw/LnRleHRDb250ZW50KSBwYXJ0cy5wdXNoKGNsb3Nlc3RMYWJlbC50ZXh0Q29udGVudCk7XG4gICAgaWYgKGNoZWNrYm94Py5wYXJlbnRFbGVtZW50Py50ZXh0Q29udGVudCkgcGFydHMucHVzaChjaGVja2JveC5wYXJlbnRFbGVtZW50LnRleHRDb250ZW50KTtcbiAgICBwYXJ0cy5wdXNoKFxuICAgICAgY2hlY2tib3g/LmdldEF0dHJpYnV0ZT8uKCdhcmlhLWxhYmVsJykgfHwgJycsXG4gICAgICBjaGVja2JveD8uZ2V0QXR0cmlidXRlPy4oJ3RpdGxlJykgfHwgJycsXG4gICAgICBjaGVja2JveD8uZ2V0QXR0cmlidXRlPy4oJ25hbWUnKSB8fCAnJyxcbiAgICAgIGNoZWNrYm94Py5nZXRBdHRyaWJ1dGU/LignaWQnKSB8fCAnJ1xuICAgICk7XG4gICAgcmV0dXJuIHBhcnRzLmpvaW4oJyAnKS5yZXBsYWNlKC9cXHMrL2csICcgJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICBmdW5jdGlvbiBmaW5kTmVhcmJ5Tm9NaWRkbGVOYW1lQ2hlY2tib3goZWxlbWVudCkge1xuICAgIGlmICghZWxlbWVudCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3Qgc2NvcGVzID0gW107XG4gICAgbGV0IGN1cnNvciA9IGVsZW1lbnQ7XG4gICAgZm9yIChsZXQgZGVwdGggPSAwOyBkZXB0aCA8IDYgJiYgY3Vyc29yOyBkZXB0aCArPSAxKSB7XG4gICAgICBpZiAoY3Vyc29yIGluc3RhbmNlb2YgRWxlbWVudCkgc2NvcGVzLnB1c2goY3Vyc29yKTtcbiAgICAgIGN1cnNvciA9IGN1cnNvci5wYXJlbnRFbGVtZW50O1xuICAgIH1cbiAgICBjb25zdCBkb2MgPSBlbGVtZW50Lm93bmVyRG9jdW1lbnQgfHwgZG9jdW1lbnQ7XG4gICAgaWYgKGRvYz8uYm9keSkgc2NvcGVzLnB1c2goZG9jLmJvZHkpO1xuXG4gICAgY29uc3Qgc2VlbiA9IG5ldyBTZXQoKTtcbiAgICBsZXQgYmVzdCA9IG51bGw7XG4gICAgY29uc3Qgbm9NaWRkbGVQYXR0ZXJuID0gLyhub3xub25lfHdpdGhvdXR8blxcL2F8ZG9lc24nP3QgaGF2ZXxkbyBub3QgaGF2ZSkuezAsMjR9bWlkZGxlfG1pZGRsZS57MCwyNH0obm98bm9uZXxuXFwvYSkvaTtcblxuICAgIGZvciAobGV0IHNjb3BlSW5kZXggPSAwOyBzY29wZUluZGV4IDwgc2NvcGVzLmxlbmd0aDsgc2NvcGVJbmRleCArPSAxKSB7XG4gICAgICBjb25zdCBzY29wZSA9IHNjb3Blc1tzY29wZUluZGV4XTtcbiAgICAgIGxldCBjaGVja2JveGVzID0gW107XG4gICAgICB0cnkge1xuICAgICAgICBjaGVja2JveGVzID0gQXJyYXkuZnJvbShzY29wZS5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl0nKSk7XG4gICAgICB9IGNhdGNoIChfZXJyKSB7XG4gICAgICAgIGNoZWNrYm94ZXMgPSBbXTtcbiAgICAgIH1cbiAgICAgIGZvciAoY29uc3QgY2hlY2tib3ggb2YgY2hlY2tib3hlcykge1xuICAgICAgICBpZiAoIWNoZWNrYm94IHx8IHNlZW4uaGFzKGNoZWNrYm94KSkgY29udGludWU7XG4gICAgICAgIHNlZW4uYWRkKGNoZWNrYm94KTtcbiAgICAgICAgY29uc3QgdGV4dCA9IGNoZWNrYm94TGFiZWxUZXh0KGNoZWNrYm94KTtcbiAgICAgICAgaWYgKCF0ZXh0KSBjb250aW51ZTtcbiAgICAgICAgbGV0IHNjb3JlID0gMDtcbiAgICAgICAgaWYgKG5vTWlkZGxlUGF0dGVybi50ZXN0KHRleHQpKSBzY29yZSArPSA2O1xuICAgICAgICBpZiAodGV4dC5pbmNsdWRlcygnbWlkZGxlJykgJiYgdGV4dC5pbmNsdWRlcygnbmFtZScpKSBzY29yZSArPSAyO1xuICAgICAgICBpZiAoL1xcYm5vW19cXHMtXT9taWRkbGVcXGIvLnRlc3QodGV4dCkpIHNjb3JlICs9IDM7XG4gICAgICAgIHNjb3JlICs9IE1hdGgubWF4KDAsIDMgLSBzY29wZUluZGV4KTtcbiAgICAgICAgaWYgKCFiZXN0IHx8IHNjb3JlID4gYmVzdC5zY29yZSkgYmVzdCA9IHsgY2hlY2tib3gsIHNjb3JlIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFiZXN0IHx8IGJlc3Quc2NvcmUgPCA0KSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gYmVzdC5jaGVja2JveDtcbiAgfVxuXG4gIC8vIEFwcGx5IGZpbGwgd2l0aCBndWFyZHNcbiAgZnVuY3Rpb24gYXBwbHlGaWxsKGVsZW1lbnQsIHZhbHVlLCBhY3Rpb24pIHtcbiAgICBjb25zdCBmaWVsZEtpbmQgPSBpbmZlckZpbGxGaWVsZEtpbmQoZWxlbWVudCwgYWN0aW9uKTtcbiAgICBjb25zdCBwcmVzZXJ2ZUV4aXN0aW5nID0gYWN0aW9uPy5wcmVzZXJ2ZUV4aXN0aW5nICE9PSBmYWxzZTtcbiAgICBjb25zdCBvdmVyd3JpdGUgPSBhY3Rpb24/Lm92ZXJ3cml0ZSA9PT0gdHJ1ZSB8fCBhY3Rpb24/LmZvcmNlID09PSB0cnVlO1xuICAgIGNvbnN0IHNlbnNpdGl2ZVRhcmdldCA9IGlzU2Vuc2l0aXZlRmllbGRUYXJnZXQoZWxlbWVudCwgYWN0aW9uKTtcbiAgICBjb25zdCBhbGxvd1NlbnNpdGl2ZUZpbGwgPSBhY3Rpb24/LmFsbG93U2Vuc2l0aXZlRmlsbCA9PT0gdHJ1ZVxuICAgICAgfHwgKGFjdGlvbj8uYWxsb3dTZW5zaXRpdmVGaWxsID09PSB1bmRlZmluZWQgJiYgZGVmYXVsdEFsbG93U2Vuc2l0aXZlRmlsbCk7XG4gICAgY29uc3QgYWxsb3dTZW5zaXRpdmVPdmVyd3JpdGUgPSBhY3Rpb24/LmFsbG93U2Vuc2l0aXZlT3ZlcndyaXRlID09PSB0cnVlXG4gICAgICB8fCAoYWN0aW9uPy5hbGxvd1NlbnNpdGl2ZU92ZXJ3cml0ZSA9PT0gdW5kZWZpbmVkICYmIGRlZmF1bHRBbGxvd1NlbnNpdGl2ZU92ZXJ3cml0ZSk7XG4gICAgY29uc3QgZXhpc3RpbmdSYXcgPSByZWFkRWxlbWVudFZhbHVlKGVsZW1lbnQpO1xuICAgIGNvbnN0IGV4aXN0aW5nQ29tcGFyYWJsZVJhdyA9IG5vcm1hbGl6ZUNvbXBhcmFibGVWYWx1ZShmaWVsZEtpbmQsIGV4aXN0aW5nUmF3KTtcblxuICAgIGlmIChzZW5zaXRpdmVUYXJnZXQpIHtcbiAgICAgIGlmIChleGlzdGluZ0NvbXBhcmFibGVSYXcgJiYgIWFsbG93U2Vuc2l0aXZlT3ZlcndyaXRlKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgb2s6IHRydWUsIHNraXBwZWQ6IHRydWUsXG4gICAgICAgICAgcmVhc29uOiAnc2Vuc2l0aXZlIGZpZWxkIGxvY2tlZCAoZXhpc3RpbmcgdmFsdWUgcHJlc2VydmVkKScsXG4gICAgICAgICAga2luZDogZmllbGRLaW5kXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAoIWV4aXN0aW5nQ29tcGFyYWJsZVJhdyAmJiAhYWxsb3dTZW5zaXRpdmVGaWxsKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgb2s6IHRydWUsIHNraXBwZWQ6IHRydWUsXG4gICAgICAgICAgcmVhc29uOiAnc2Vuc2l0aXZlIGZpZWxkIGZpbGwgYmxvY2tlZCcsXG4gICAgICAgICAga2luZDogZmllbGRLaW5kXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIG1pZGRsZSBuYW1lIHNwZWNpYWwgY2FzZVxuICAgIGlmIChpc01pZGRsZU5hbWVUYXJnZXQoZWxlbWVudCwgYWN0aW9uKSkge1xuICAgICAgY29uc3QgcmF3ID0gU3RyaW5nKHZhbHVlID8/ICcnKS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICAgIGNvbnN0IG5vTWlkZGxlUmVxdWVzdGVkID0gYWN0aW9uPy5ub01pZGRsZU5hbWUgPT09IHRydWVcbiAgICAgICAgfHwgcmF3ID09PSAnJyB8fCByYXcgPT09ICduYScgfHwgcmF3ID09PSAnbi9hJ1xuICAgICAgICB8fCByYXcgPT09ICdub25lJyB8fCByYXcgPT09ICdubyBtaWRkbGUgbmFtZSc7XG4gICAgICBpZiAobm9NaWRkbGVSZXF1ZXN0ZWQpIHtcbiAgICAgICAgY29uc3Qgbm9NaWRkbGVDaGVja2JveCA9IGZpbmROZWFyYnlOb01pZGRsZU5hbWVDaGVja2JveChlbGVtZW50KTtcbiAgICAgICAgaWYgKG5vTWlkZGxlQ2hlY2tib3gpIHtcbiAgICAgICAgICBjb25zdCBhbHJlYWR5Q2hlY2tlZCA9IEJvb2xlYW4obm9NaWRkbGVDaGVja2JveC5jaGVja2VkKTtcbiAgICAgICAgICBpZiAoIWFscmVhZHlDaGVja2VkKSB7XG4gICAgICAgICAgICBub01pZGRsZUNoZWNrYm94LmZvY3VzKCk7XG4gICAgICAgICAgICBub01pZGRsZUNoZWNrYm94LmNsaWNrKCk7XG4gICAgICAgICAgICBub01pZGRsZUNoZWNrYm94LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gICAgICAgICAgICBub01pZGRsZUNoZWNrYm94LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3ZhbHVlJyBpbiBlbGVtZW50KSB7XG4gICAgICAgICAgICBlbGVtZW50LnZhbHVlID0gJyc7XG4gICAgICAgICAgICBlbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gICAgICAgICAgICBlbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgb2s6IHRydWUsIHNraXBwZWQ6IGFscmVhZHlDaGVja2VkLFxuICAgICAgICAgICAgcmVhc29uOiBhbHJlYWR5Q2hlY2tlZCA/ICduby1taWRkbGUtbmFtZSBjaGVja2JveCBhbHJlYWR5IGNoZWNrZWQnIDogJ2NoZWNrZWQgbm8tbWlkZGxlLW5hbWUgY2hlY2tib3gnLFxuICAgICAgICAgICAga2luZDogZmllbGRLaW5kXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHNhbml0aXplZCA9IHNhbml0aXplRmlsbFZhbHVlKGZpZWxkS2luZCwgdmFsdWUsIGVsZW1lbnQpO1xuICAgIGlmICghc2FuaXRpemVkLm9rKSB7XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIHNraXBwZWQ6IHRydWUsIHJlYXNvbjogc2FuaXRpemVkLnJlYXNvbiB8fCAndmFsaWRhdGlvbiBmYWlsZWQnLCBraW5kOiBmaWVsZEtpbmQgfTtcbiAgICB9XG4gICAgY29uc3QgdGV4dCA9IFN0cmluZyhzYW5pdGl6ZWQudmFsdWUgPz8gJycpO1xuICAgIGNvbnN0IHRhZyA9IGVsZW1lbnQudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSB0ZXh0LnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IG5leHRDb21wYXJhYmxlID0gbm9ybWFsaXplQ29tcGFyYWJsZVZhbHVlKGZpZWxkS2luZCwgdGV4dCk7XG4gICAgY29uc3QgZXhpc3RpbmdDb21wYXJhYmxlID0gZXhpc3RpbmdDb21wYXJhYmxlUmF3O1xuXG4gICAgaWYgKGV4aXN0aW5nQ29tcGFyYWJsZSAmJiBuZXh0Q29tcGFyYWJsZSAmJiBleGlzdGluZ0NvbXBhcmFibGUgPT09IG5leHRDb21wYXJhYmxlKSB7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgc2tpcHBlZDogdHJ1ZSwgcmVhc29uOiAnYWxyZWFkeSBzZXQnLCBraW5kOiBmaWVsZEtpbmQgfTtcbiAgICB9XG4gICAgaWYgKHByZXNlcnZlRXhpc3RpbmcgJiYgIW92ZXJ3cml0ZSAmJiBleGlzdGluZ0NvbXBhcmFibGUgJiYgbmV4dENvbXBhcmFibGUgJiYgZXhpc3RpbmdDb21wYXJhYmxlICE9PSBuZXh0Q29tcGFyYWJsZSkge1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIHNraXBwZWQ6IHRydWUsIHJlYXNvbjogJ2V4aXN0aW5nIG5vbi1lbXB0eSB2YWx1ZSBwcmVzZXJ2ZWQnLCBraW5kOiBmaWVsZEtpbmQgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkaXNwYXRjaElucHV0TGlrZUV2ZW50cyh0YXJnZXQpIHtcbiAgICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICAgICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICAgICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGJ1YmJsZXM6IHRydWUsIGtleTogJ1RhYicgfSkpO1xuICAgICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBidWJibGVzOiB0cnVlLCBrZXk6ICdUYWInIH0pKTtcbiAgICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBGb2N1c0V2ZW50KCdibHVyJywgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXRFbGVtZW50VmFsdWUodGFyZ2V0LCBuZXh0VmFsdWUpIHtcbiAgICAgIGlmICghdGFyZ2V0KSByZXR1cm47XG4gICAgICBjb25zdCBwcm90byA9IE9iamVjdC5nZXRQcm90b3R5cGVPZih0YXJnZXQpO1xuICAgICAgY29uc3QgZGVzY3JpcHRvciA9IHByb3RvID8gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihwcm90bywgJ3ZhbHVlJykgOiBudWxsO1xuICAgICAgaWYgKGRlc2NyaXB0b3IgJiYgdHlwZW9mIGRlc2NyaXB0b3Iuc2V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGRlc2NyaXB0b3Iuc2V0LmNhbGwodGFyZ2V0LCBuZXh0VmFsdWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGFyZ2V0LnZhbHVlID0gbmV4dFZhbHVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChmaWVsZEtpbmQgPT09ICdjaGVja2JveCcgJiYgJ2NoZWNrZWQnIGluIGVsZW1lbnQpIHtcbiAgICAgIGVsZW1lbnQuZm9jdXMoKTtcbiAgICAgIGVsZW1lbnQuY2hlY2tlZCA9IEJvb2xlYW4oc2FuaXRpemVkLmNoZWNrZWQpO1xuICAgIH0gZWxzZSBpZiAoZWxlbWVudC5pc0NvbnRlbnRFZGl0YWJsZSkge1xuICAgICAgZWxlbWVudC5mb2N1cygpO1xuICAgICAgZWxlbWVudC50ZXh0Q29udGVudCA9IHRleHQ7XG4gICAgfSBlbHNlIGlmICh0YWcgPT09ICdzZWxlY3QnKSB7XG4gICAgICBjb25zdCBvcHRpb25zID0gQXJyYXkuZnJvbShlbGVtZW50Lm9wdGlvbnMgfHwgW10pO1xuICAgICAgY29uc3QgbWF0Y2ggPSBvcHRpb25zLmZpbmQoKG9wdCkgPT4ge1xuICAgICAgICBjb25zdCB2YWx1ZUxvd2VyID0gU3RyaW5nKG9wdC52YWx1ZSB8fCAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IHRleHRMb3dlciA9IFN0cmluZyhvcHQudGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICByZXR1cm4gdmFsdWVMb3dlciA9PT0gbm9ybWFsaXplZCB8fCB0ZXh0TG93ZXIgPT09IG5vcm1hbGl6ZWRcbiAgICAgICAgICB8fCAobm9ybWFsaXplZCAmJiB2YWx1ZUxvd2VyLmluY2x1ZGVzKG5vcm1hbGl6ZWQpKVxuICAgICAgICAgIHx8IChub3JtYWxpemVkICYmIHRleHRMb3dlci5pbmNsdWRlcyhub3JtYWxpemVkKSk7XG4gICAgICB9KTtcbiAgICAgIGVsZW1lbnQudmFsdWUgPSBtYXRjaCA/IG1hdGNoLnZhbHVlIDogdGV4dDtcbiAgICB9IGVsc2UgaWYgKCd2YWx1ZScgaW4gZWxlbWVudCkge1xuICAgICAgZWxlbWVudC5mb2N1cygpO1xuICAgICAgc2V0RWxlbWVudFZhbHVlKGVsZW1lbnQsIHRleHQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBlbGVtZW50LnNldEF0dHJpYnV0ZSgndmFsdWUnLCB0ZXh0KTtcbiAgICB9XG5cbiAgICBkaXNwYXRjaElucHV0TGlrZUV2ZW50cyhlbGVtZW50KTtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgc2tpcHBlZDogZmFsc2UsIHJlYXNvbjogJycsIGtpbmQ6IGZpZWxkS2luZCB9O1xuICB9XG5cbiAgLy8gTWFpbiBleGVjdXRpb24gbG9vcFxuICBpZiAobG9nTGlmZWN5Y2xlKSB7XG4gICAgcmVtb3RlTG9nKCdCYXRjaCBhY3Rpb24gZXhlY3V0aW9uIHN0YXJ0ZWQuJywgJ0lORk8nKTtcbiAgfVxuXG5cdCAgY29uc3QgbGlzdCA9IEFycmF5LmlzQXJyYXkoYWN0aW9ucykgPyBhY3Rpb25zIDogW107XG5cdCAgbGV0IGV4ZWN1dGVkU3RlcHMgPSAwO1xuXHQgIHVwZGF0ZVJ1blN0YXRlKHsgc3RhdHVzOiAncnVubmluZycsIHN0YXJ0ZWRBdDogRGF0ZS5ub3coKSwgdG90YWxTdGVwczogbGlzdC5sZW5ndGgsIGV4ZWN1dGVkU3RlcHMsIGNhbmNlbGxlZDogZmFsc2UgfSk7XG5cblx0ICBmb3IgKGxldCBpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcblx0ICAgIGlmIChpc0NhbmNlbGxlZCgpKSB7XG5cdCAgICAgIHJlbW90ZUxvZygnRXhlY3V0aW9uIGNhbmNlbGxlZCBieSB1c2VyIHJlcXVlc3QuJywgJ1dBUk4nKTtcblx0ICAgICAgdXBkYXRlUnVuU3RhdGUoeyBzdGF0dXM6ICdjYW5jZWxsZWQnLCBjYW5jZWxsZWQ6IHRydWUsIGV4ZWN1dGVkU3RlcHMgfSk7XG5cdCAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgY2FuY2VsbGVkOiB0cnVlLCBleGVjdXRlZFN0ZXBzIH07XG5cdCAgICB9XG5cbiAgICBjb25zdCBhY3Rpb24gPSBsaXN0W2ldIHx8IHt9O1xuICAgIGNvbnN0IHR5cGUgPSBTdHJpbmcoYWN0aW9uLnR5cGUgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG5cbiAgICB0cnkge1xuICAgICAgLy8gSGFuZGxlIHdhaXQgYWN0aW9uXG5cdCAgICAgIGlmICh0eXBlID09PSAnd2FpdCcpIHtcblx0ICAgICAgICBjb25zdCBkdXJhdGlvbiA9IE51bWJlcihhY3Rpb24uZHVyYXRpb24gfHwgMTAwMCk7XG5cdCAgICAgICAgcmVtb3RlTG9nKGBTdGVwICR7aSArIDF9LyR7bGlzdC5sZW5ndGh9OiB3YWl0ICR7ZHVyYXRpb259bXNgLCAnSU5GTycpO1xuXHQgICAgICAgIGF3YWl0IHNsZWVwKGR1cmF0aW9uKTtcblx0ICAgICAgICBleGVjdXRlZFN0ZXBzICs9IDE7XG5cdCAgICAgICAgdXBkYXRlUnVuU3RhdGUoeyBleGVjdXRlZFN0ZXBzIH0pO1xuXHQgICAgICAgIGNvbnRpbnVlO1xuXHQgICAgICB9XG5cbiAgICAgIC8vIEhhbmRsZSBzY3JpcHQgYWN0aW9uXG4gICAgICBpZiAodHlwZSA9PT0gJ3NjcmlwdCcgfHwgdHlwZSA9PT0gJ2pzJyB8fCB0eXBlID09PSAnamF2YXNjcmlwdCcpIHtcbiAgICAgICAgaWYgKCFhbGxvd0FpU2NyaXB0cykge1xuICAgICAgICAgIHJlbW90ZUxvZyhgU3RlcCAke2kgKyAxfS8ke2xpc3QubGVuZ3RofTogYmxvY2tlZCBzY3JpcHQgYWN0aW9uIChhbGxvd0FpU2NyaXB0cyBpcyBmYWxzZSkuYCwgJ1dBUk4nKTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvZGUgPSBTdHJpbmcoYWN0aW9uLmNvZGUgPz8gYWN0aW9uLnNjcmlwdCA/PyBhY3Rpb24uanMgPz8gJycpLnRyaW0oKTtcbiAgICAgICAgaWYgKCFjb2RlKSB7XG4gICAgICAgICAgcmVtb3RlTG9nKGBTdGVwICR7aSArIDF9LyR7bGlzdC5sZW5ndGh9OiBza2lwcGVkIHNjcmlwdCBhY3Rpb24gKGVtcHR5IGNvZGUpLmAsICdXQVJOJyk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvZGUubGVuZ3RoID4gMTIwMDApIHtcbiAgICAgICAgICByZW1vdGVMb2coYFN0ZXAgJHtpICsgMX0vJHtsaXN0Lmxlbmd0aH06IHNraXBwZWQgc2NyaXB0IGFjdGlvbiAoY29kZSB0b28gbGFyZ2UpLmAsICdXQVJOJyk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICByZW1vdGVMb2coYFN0ZXAgJHtpICsgMX0vJHtsaXN0Lmxlbmd0aH06IHNjcmlwdCBhY3Rpb25gLCAnSU5GTycpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IEFzeW5jRnVuY3Rpb24gPSBPYmplY3QuZ2V0UHJvdG90eXBlT2YoYXN5bmMgZnVuY3Rpb24gKCkge30pLmNvbnN0cnVjdG9yO1xuICAgICAgICAgIGNvbnN0IGZuID0gbmV3IEFzeW5jRnVuY3Rpb24oJ1widXNlIHN0cmljdFwiO1xcbicgKyBjb2RlKTtcbiAgICAgICAgICBjb25zdCByZXN1bHRWYWx1ZSA9IGF3YWl0IGZuKCk7XG5cbiAgICAgICAgICBsZXQgcHJldmlldyA9ICcnO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBwcmV2aWV3ID0gdHlwZW9mIHJlc3VsdFZhbHVlID09PSAnc3RyaW5nJyA/IHJlc3VsdFZhbHVlIDogSlNPTi5zdHJpbmdpZnkocmVzdWx0VmFsdWUpO1xuICAgICAgICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgICAgICAgIHByZXZpZXcgPSBTdHJpbmcocmVzdWx0VmFsdWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBwcmV2aWV3ID0gU3RyaW5nKHByZXZpZXcgfHwgJycpLnJlcGxhY2UoL1xccysvZywgJyAnKS50cmltKCk7XG4gICAgICAgICAgaWYgKHByZXZpZXcpIHtcbiAgICAgICAgICAgIHJlbW90ZUxvZyhgU3RlcCAke2kgKyAxfS8ke2xpc3QubGVuZ3RofTogc2NyaXB0IHJlc3VsdDogJHtwcmV2aWV3LnNsaWNlKDAsIDE4MCl9YCwgJ0lORk8nKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIHJlbW90ZUxvZyhgU3RlcCAke2kgKyAxfS8ke2xpc3QubGVuZ3RofTogc2NyaXB0IGVycm9yOiAke2Vyci5tZXNzYWdlfWAsICdFUlJPUicpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcG9zdFdhaXRNcyA9IE1hdGgubWF4KDAsIE51bWJlcihhY3Rpb24ucG9zdF93YWl0X21zIHx8IDMwMCkpO1xuICAgICAgICBhd2FpdCBzbGVlcChwb3N0V2FpdE1zKTtcbiAgICAgICAgY29uc3QgaHVtYW5pemVkRGVsYXlNcyA9IG5leHRIdW1hbml6ZWREZWxheU1zKCk7XG5cdCAgICAgICAgaWYgKGh1bWFuaXplZERlbGF5TXMgPiAwICYmIGkgPCBsaXN0Lmxlbmd0aCAtIDEpIHtcblx0ICAgICAgICAgIHJlbW90ZUxvZyhgU3RlcCAke2kgKyAxfS8ke2xpc3QubGVuZ3RofTogbmF0dXJhbCBkZWxheSAke2h1bWFuaXplZERlbGF5TXN9bXNgLCAnSU5GTycpO1xuXHQgICAgICAgICAgYXdhaXQgc2xlZXAoaHVtYW5pemVkRGVsYXlNcyk7XG5cdCAgICAgICAgfVxuXHQgICAgICAgIGV4ZWN1dGVkU3RlcHMgKz0gMTtcblx0ICAgICAgICB1cGRhdGVSdW5TdGF0ZSh7IGV4ZWN1dGVkU3RlcHMgfSk7XG5cdCAgICAgICAgY29udGludWU7XG5cdCAgICAgIH1cblxuICAgICAgLy8gUmVzb2x2ZSBlbGVtZW50IHdpdGggcHJvYmUgc2Nyb2xsaW5nXG4gICAgICBsZXQgcmVzb2x2ZWQgPSByZXNvbHZlQWN0aW9uRWxlbWVudChhY3Rpb24sIGkgKyAxLCBsaXN0Lmxlbmd0aCwgdHlwZSk7XG4gICAgICBsZXQgZWxlbWVudCA9IHJlc29sdmVkLmVsZW1lbnQ7XG5cbiAgICAgIGlmICghZWxlbWVudCAmJiAodHlwZSA9PT0gJ2ZpbGwnIHx8IHR5cGUgPT09ICd0eXBlJyB8fCB0eXBlID09PSAnY2xpY2snIHx8IHR5cGUgPT09ICdzY3JvbGwnKSkge1xuICAgICAgICBjb25zdCBwcm9iZURpc3RhbmNlID0gTWF0aC5tYXgoMjQwLCBNYXRoLnJvdW5kKHdpbmRvdy5pbm5lckhlaWdodCAqIDAuOCkpO1xuICAgICAgICBjb25zdCBtYXhQcm9iZVNjcm9sbHMgPSA0O1xuICAgICAgICBmb3IgKGxldCBwcm9iZSA9IDE7IHByb2JlIDw9IG1heFByb2JlU2Nyb2xscyAmJiAhZWxlbWVudDsgcHJvYmUgKz0gMSkge1xuICAgICAgICAgIHdpbmRvdy5zY3JvbGxCeSh7IHRvcDogcHJvYmVEaXN0YW5jZSwgYmVoYXZpb3I6ICdhdXRvJyB9KTtcbiAgICAgICAgICBhd2FpdCBzbGVlcCgxMjApO1xuICAgICAgICAgIHJlc29sdmVkID0gcmVzb2x2ZUFjdGlvbkVsZW1lbnQoYWN0aW9uLCBpICsgMSwgbGlzdC5sZW5ndGgsIHR5cGUpO1xuICAgICAgICAgIGVsZW1lbnQgPSByZXNvbHZlZC5lbGVtZW50O1xuICAgICAgICAgIGlmIChlbGVtZW50KSB7XG4gICAgICAgICAgICByZW1vdGVMb2coYFN0ZXAgJHtpICsgMX0vJHtsaXN0Lmxlbmd0aH06IG1hdGNoZWQgYWZ0ZXIgcHJvYmUgc2Nyb2xsICR7cHJvYmV9LyR7bWF4UHJvYmVTY3JvbGxzfWAsICdJTkZPJyk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFlbGVtZW50KSB7XG4gICAgICAgICAgd2luZG93LnNjcm9sbFRvKHsgdG9wOiAwLCBiZWhhdmlvcjogJ2F1dG8nIH0pO1xuICAgICAgICAgIGF3YWl0IHNsZWVwKDEyMCk7XG4gICAgICAgICAgcmVzb2x2ZWQgPSByZXNvbHZlQWN0aW9uRWxlbWVudChhY3Rpb24sIGkgKyAxLCBsaXN0Lmxlbmd0aCwgdHlwZSk7XG4gICAgICAgICAgZWxlbWVudCA9IHJlc29sdmVkLmVsZW1lbnQ7XG4gICAgICAgICAgaWYgKGVsZW1lbnQpIHtcbiAgICAgICAgICAgIHJlbW90ZUxvZyhgU3RlcCAke2kgKyAxfS8ke2xpc3QubGVuZ3RofTogbWF0Y2hlZCBhZnRlciByZXNldC10by10b3AgcHJvYmVgLCAnSU5GTycpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoIWVsZW1lbnQpIHtcbiAgICAgICAgY29uc3QgdHJpZWQgPSByZXNvbHZlZC5zZWxlY3RvcnM/Lmxlbmd0aCA/IHJlc29sdmVkLnNlbGVjdG9ycy5qb2luKCcgfCAnKSA6ICcobm9uZSknO1xuICAgICAgICByZW1vdGVMb2coYFN0ZXAgJHtpICsgMX0gZmFpbGVkOiBDb3VsZCBub3QgcmVzb2x2ZSB0YXJnZXQuIHNlbGVjdG9ycyB0cmllZDogJHt0cmllZH1gLCAnV0FSTicpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gVmlzdWFsIGhpZ2hsaWdodFxuICAgICAgY29uc3Qgb3JpZ2luYWxTdHlsZSA9IHtcbiAgICAgICAgb3V0bGluZTogZWxlbWVudC5zdHlsZS5vdXRsaW5lLFxuICAgICAgICBiYWNrZ3JvdW5kQ29sb3I6IGVsZW1lbnQuc3R5bGUuYmFja2dyb3VuZENvbG9yXG4gICAgICB9O1xuXG4gICAgICBlbGVtZW50LnN0eWxlLm91dGxpbmUgPSAnM3B4IHNvbGlkICMyNTYzZWInO1xuICAgICAgZWxlbWVudC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAncmdiYSgzNywgOTksIDIzNSwgMC4xKSc7XG4gICAgICByZW1vdGVMb2coYFN0ZXAgJHtpICsgMX0vJHtsaXN0Lmxlbmd0aH06ICR7dHlwZX0gdmlhICR7cmVzb2x2ZWQubWF0Y2hlZEJ5fWAsICdJTkZPJyk7XG5cbiAgICAgIC8vIEV4ZWN1dGUgYWN0aW9uIGJ5IHR5cGVcbiAgICAgIGlmICh0eXBlID09PSAnZmlsbCcgfHwgdHlwZSA9PT0gJ3R5cGUnKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgZWxlbWVudC5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJywgYmxvY2s6ICdjZW50ZXInLCBpbmxpbmU6ICduZWFyZXN0JyB9KTtcbiAgICAgICAgICByZW1vdGVMb2coYFN0ZXAgJHtpICsgMX0vJHtsaXN0Lmxlbmd0aH06IGF1dG8tc2Nyb2xsIHRvIGFjdGl2ZSBpbnB1dGAsICdJTkZPJyk7XG4gICAgICAgIH0gY2F0Y2ggKF9lcnIpIHt9XG4gICAgICAgIGNvbnN0IGZpbGxSZXN1bHQgPSBhcHBseUZpbGwoZWxlbWVudCwgYWN0aW9uLnZhbHVlLCBhY3Rpb24pO1xuICAgICAgICBpZiAoIWZpbGxSZXN1bHQub2sgfHwgZmlsbFJlc3VsdC5za2lwcGVkKSB7XG4gICAgICAgICAgY29uc3Qgc3RhdHVzID0gZmlsbFJlc3VsdC5vayA/ICdJTkZPJyA6ICdXQVJOJztcbiAgICAgICAgICBjb25zdCByZWFzb24gPSBmaWxsUmVzdWx0LnJlYXNvbiB8fCAnZmlsbCBza2lwcGVkJztcbiAgICAgICAgICByZW1vdGVMb2coYFN0ZXAgJHtpICsgMX0vJHtsaXN0Lmxlbmd0aH06IGZpbGwgZ3VhcmQgKCR7ZmlsbFJlc3VsdC5raW5kIHx8ICd0ZXh0J30pIC0+ICR7cmVhc29ufWAsIHN0YXR1cyk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ2NsaWNrJykge1xuICAgICAgICBlbGVtZW50LnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdzbW9vdGgnLCBibG9jazogJ2NlbnRlcicgfSk7XG4gICAgICAgIGVsZW1lbnQuY2xpY2soKTtcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3Njcm9sbCcpIHtcbiAgICAgICAgZWxlbWVudC5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJywgYmxvY2s6ICdjZW50ZXInIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVtb3RlTG9nKGBTdGVwICR7aSArIDF9IHNraXBwZWQ6IFVuc3VwcG9ydGVkIGFjdGlvbiB0eXBlICR7dHlwZX1gLCAnV0FSTicpO1xuICAgICAgfVxuXG4gICAgICAvLyBQb3N0LWFjdGlvbiBkZWxheXNcbiAgICAgIGNvbnN0IHBvc3RXYWl0TXMgPSBNYXRoLm1heCgwLCBOdW1iZXIoYWN0aW9uLnBvc3Rfd2FpdF9tcyB8fCAzMDApKTtcbiAgICAgIGF3YWl0IHNsZWVwKHBvc3RXYWl0TXMpO1xuICAgICAgY29uc3QgaHVtYW5pemVkRGVsYXlNcyA9IG5leHRIdW1hbml6ZWREZWxheU1zKCk7XG4gICAgICBpZiAoaHVtYW5pemVkRGVsYXlNcyA+IDAgJiYgaSA8IGxpc3QubGVuZ3RoIC0gMSkge1xuICAgICAgICByZW1vdGVMb2coYFN0ZXAgJHtpICsgMX0vJHtsaXN0Lmxlbmd0aH06IG5hdHVyYWwgZGVsYXkgJHtodW1hbml6ZWREZWxheU1zfW1zYCwgJ0lORk8nKTtcbiAgICAgICAgYXdhaXQgc2xlZXAoaHVtYW5pemVkRGVsYXlNcyk7XG4gICAgICB9XG5cblx0ICAgICAgLy8gUmVzdG9yZSBzdHlsZVxuXHQgICAgICBlbGVtZW50LnN0eWxlLm91dGxpbmUgPSBvcmlnaW5hbFN0eWxlLm91dGxpbmU7XG5cdCAgICAgIGVsZW1lbnQuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gb3JpZ2luYWxTdHlsZS5iYWNrZ3JvdW5kQ29sb3I7XG5cdCAgICAgIGV4ZWN1dGVkU3RlcHMgKz0gMTtcblx0ICAgICAgdXBkYXRlUnVuU3RhdGUoeyBleGVjdXRlZFN0ZXBzIH0pO1xuXHQgICAgfSBjYXRjaCAoZXJyKSB7XG5cdCAgICAgIHJlbW90ZUxvZyhgU3RlcCAke2kgKyAxfSBleGVjdXRpb24gZXJyb3I6ICR7ZXJyLm1lc3NhZ2V9YCwgJ0VSUk9SJyk7XG5cdCAgICB9XG5cdCAgfVxuXG5cdCAgaWYgKGxvZ0xpZmVjeWNsZSkge1xuXHQgICAgcmVtb3RlTG9nKCdCYXRjaCBhY3Rpb24gZXhlY3V0aW9uIGZpbmlzaGVkLicsICdJTkZPJyk7XG5cdCAgfVxuXHQgIHVwZGF0ZVJ1blN0YXRlKHsgc3RhdHVzOiAnZG9uZScsIGNhbmNlbGxlZDogZmFsc2UsIGV4ZWN1dGVkU3RlcHMgfSk7XG5cdCAgcmV0dXJuIHsgb2s6IHRydWUsIGNhbmNlbGxlZDogZmFsc2UsIGV4ZWN1dGVkU3RlcHMgfTtcblx0fVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQXV0by1GaWxsIEZlYXR1cmU6IEFJLVBvd2VyZWQgRm9ybSBGaWxsaW5nXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5jb25zdCBQUk9GSUxFX1NUT1JBR0VfS0VZID0gJ2JpbGdlX3VzZXJfcHJvZmlsZSc7XG5jb25zdCBhdXRvRmlsbExvZ2dlciA9IG5ldyBCaWxnZUxvZ2dlcignYXV0by1maWxsJyk7XG5sZXQgcGVuZGluZ0F1dG9GaWxsID0gbnVsbDtcblxuLyoqXG4gKiBMb2FkIHVzZXIgcHJvZmlsZSBmcm9tIGNocm9tZS5zdG9yYWdlLmxvY2FsXG4gKiBAcmV0dXJucyB7UHJvbWlzZTxPYmplY3R8bnVsbD59IFVzZXIgcHJvZmlsZSBvciBudWxsXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGxvYWRQcm9maWxlKCkge1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChQUk9GSUxFX1NUT1JBR0VfS0VZKTtcbiAgICByZXR1cm4gcmVzdWx0W1BST0ZJTEVfU1RPUkFHRV9LRVldIHx8IG51bGw7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGF1dG9GaWxsTG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gbG9hZCBwcm9maWxlJywgeyBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuLyoqXG4gKiBTYXZlIHVzZXIgcHJvZmlsZSB0byBjaHJvbWUuc3RvcmFnZS5sb2NhbFxuICogQHBhcmFtIHtPYmplY3R9IHByb2ZpbGUgLSBVc2VyIHByb2ZpbGUgZGF0YVxuICogQHJldHVybnMge1Byb21pc2U8Ym9vbGVhbj59IFN1Y2Nlc3Mgc3RhdHVzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHNhdmVQcm9maWxlKHByb2ZpbGUpIHtcbiAgdHJ5IHtcbiAgICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBbUFJPRklMRV9TVE9SQUdFX0tFWV06IHByb2ZpbGUgfSk7XG4gICAgYXV0b0ZpbGxMb2dnZXIuaW5mbygnUHJvZmlsZSBzYXZlZCBzdWNjZXNzZnVsbHknKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgYXV0b0ZpbGxMb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBzYXZlIHByb2ZpbGUnLCB7IGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuLyoqXG4gKiBHZXQgQVBJIGtleSBmcm9tIHNldHRpbmdzIChzdG9yZWQgYnkgd2ViYXBwIGluIGxvY2FsU3RvcmFnZSwgc3luY2VkIHRvIGV4dGVuc2lvbiBzdG9yYWdlKVxuICogQHJldHVybnMge1Byb21pc2U8c3RyaW5nfG51bGw+fSBBUEkga2V5IG9yIG51bGxcbiAqL1xuYXN5bmMgZnVuY3Rpb24gZ2V0R2VtaW5pQXBpS2V5KCkge1xuICB0cnkge1xuICAgIC8vIFRyeSB0byBnZXQgZnJvbSBleHRlbnNpb24gc3RvcmFnZSAoc3luY2VkIGZyb20gd2ViYXBwIHNldHRpbmdzKVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldCgnYmlsZ2VfYXBwX3NldHRpbmdzJyk7XG4gICAgY29uc3Qgc2V0dGluZ3MgPSByZXN1bHQuYmlsZ2VfYXBwX3NldHRpbmdzO1xuICAgIGlmIChzZXR0aW5ncz8uZ2VtaW5pQXBpS2V5KSByZXR1cm4gc2V0dGluZ3MuZ2VtaW5pQXBpS2V5O1xuXG4gICAgLy8gRmFsbGJhY2sgdG8gZW52aXJvbm1lbnQgdmFyaWFibGUga2V5IGZyb20gYnVpbGRcbiAgICBjb25zdCBlbnZLZXkgPSBTdHJpbmcocHJvY2Vzcy5lbnY/LkdFTUlOSV9BUElfS0VZIHx8IHByb2Nlc3MuZW52Py5BUElfS0VZIHx8ICcnKS50cmltKCk7XG4gICAgaWYgKGVudktleSkgcmV0dXJuIGVudktleTtcblxuICAgIHJldHVybiBudWxsO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBhdXRvRmlsbExvZ2dlci5lcnJvcignRmFpbGVkIHRvIGdldCBBUEkga2V5JywgeyBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuLyoqXG4gKiBDYWxsIEdlbWluaSBBUEkgdG8gbWFwIGZvcm0gZmllbGRzIHRvIHByb2ZpbGUgZGF0YVxuICogQHBhcmFtIHtBcnJheX0gZmllbGRzIC0gRm9ybSBmaWVsZCBtZXRhZGF0YVxuICogQHBhcmFtIHtPYmplY3R9IHByb2ZpbGUgLSBVc2VyIHByb2ZpbGUgZGF0YVxuICogQHJldHVybnMge1Byb21pc2U8QXJyYXk+fSBGaWVsZCBtYXBwaW5ncyB3aXRoIHZhbHVlc1xuICovXG5hc3luYyBmdW5jdGlvbiBtYXBGaWVsZHNXaXRoQUkoZmllbGRzLCBwcm9maWxlKSB7XG4gIGNvbnN0IGFwaUtleSA9IGF3YWl0IGdldEdlbWluaUFwaUtleSgpO1xuICBpZiAoIWFwaUtleSkge1xuICAgIGF1dG9GaWxsTG9nZ2VyLndhcm4oJ05vIEdlbWluaSBBUEkga2V5IGF2YWlsYWJsZScpO1xuICAgIHJldHVybiBtYXBGaWVsZHNIZXVyaXN0aWNhbGx5KGZpZWxkcywgcHJvZmlsZSk7XG4gIH1cblxuICBjb25zdCBmaWVsZHNTdW1tYXJ5ID0gZmllbGRzLm1hcChmID0+ICh7XG4gICAgaW5kZXg6IGYuaW5kZXgsXG4gICAgc2VsZWN0b3I6IGYuc2VsZWN0b3IsXG4gICAgdHlwZTogZi50eXBlLFxuICAgIG5hbWU6IGYubmFtZSxcbiAgICBpZDogZi5pZCxcbiAgICBsYWJlbDogZi5sYWJlbCxcbiAgICBwbGFjZWhvbGRlcjogZi5wbGFjZWhvbGRlcixcbiAgICBhdXRvY29tcGxldGU6IGYuYXV0b2NvbXBsZXRlLFxuICAgIGhhc1ZhbHVlOiAhIWYuY3VycmVudFZhbHVlXG4gIH0pKTtcblxuICBjb25zdCBwcm9maWxlU3VtbWFyeSA9IHtcbiAgICBmaXJzdE5hbWU6IHByb2ZpbGUuZmlyc3ROYW1lIHx8ICcnLFxuICAgIGxhc3ROYW1lOiBwcm9maWxlLmxhc3ROYW1lIHx8ICcnLFxuICAgIG1pZGRsZU5hbWU6IHByb2ZpbGUubWlkZGxlTmFtZSB8fCAnJyxcbiAgICBlbWFpbDogcHJvZmlsZS5lbWFpbCB8fCAnJyxcbiAgICBwaG9uZTogcHJvZmlsZS5waG9uZSB8fCAnJyxcbiAgICBhZGRyZXNzMTogcHJvZmlsZS5hZGRyZXNzMSB8fCAnJyxcbiAgICBhZGRyZXNzMjogcHJvZmlsZS5hZGRyZXNzMiB8fCAnJyxcbiAgICBjaXR5OiBwcm9maWxlLmNpdHkgfHwgJycsXG4gICAgc3RhdGU6IHByb2ZpbGUuc3RhdGUgfHwgJycsXG4gICAgemlwQ29kZTogcHJvZmlsZS56aXBDb2RlIHx8ICcnLFxuICAgIGNvdW50cnk6IHByb2ZpbGUuY291bnRyeSB8fCAnVVNBJyxcbiAgICBjb21wYW55OiBwcm9maWxlLmNvbXBhbnkgfHwgJycsXG4gICAgam9iVGl0bGU6IHByb2ZpbGUuam9iVGl0bGUgfHwgJycsXG4gICAgLi4uKHByb2ZpbGUuY3VzdG9tIHx8IHt9KVxuICB9O1xuXG4gIGNvbnN0IHByb21wdCA9IGBZb3UgYXJlIGEgZm9ybS1maWxsaW5nIGFzc2lzdGFudC4gTWFwIHRoZSBmb2xsb3dpbmcgZm9ybSBmaWVsZHMgdG8gdGhlIHVzZXIncyBwcm9maWxlIGRhdGEuXG5cbkZPUk0gRklFTERTOlxuJHtKU09OLnN0cmluZ2lmeShmaWVsZHNTdW1tYXJ5LCBudWxsLCAyKX1cblxuVVNFUiBQUk9GSUxFOlxuJHtKU09OLnN0cmluZ2lmeShwcm9maWxlU3VtbWFyeSwgbnVsbCwgMil9XG5cbkZvciBlYWNoIGZpZWxkLCBkZXRlcm1pbmUgdGhlIGJlc3QgbWF0Y2hpbmcgcHJvZmlsZSB2YWx1ZSBiYXNlZCBvbjpcbjEuIGF1dG9jb21wbGV0ZSBhdHRyaWJ1dGUgKGhpZ2hlc3QgcHJpb3JpdHkgLSBlLmcuLCBcImVtYWlsXCIsIFwiZ2l2ZW4tbmFtZVwiLCBcImZhbWlseS1uYW1lXCIsIFwidGVsXCIsIFwic3RyZWV0LWFkZHJlc3NcIilcbjIuIG5hbWUgYXR0cmlidXRlXG4zLiBpZCBhdHRyaWJ1dGVcbjQuIGxhYmVsIHRleHRcbjUuIHBsYWNlaG9sZGVyIHRleHRcblxuU2tpcCBmaWVsZHMgdGhhdCBhbHJlYWR5IGhhdmUgdmFsdWVzIChoYXNWYWx1ZTogdHJ1ZSkgdW5sZXNzIHRoZXkgYXBwZWFyIGluY29ycmVjdC5cblNraXAgZmllbGRzIHRoYXQgZG9uJ3QgbWF0Y2ggYW55IHByb2ZpbGUgZGF0YS5cbkRvIE5PVCBmaWxsIHNlbnNpdGl2ZSBmaWVsZHMgbGlrZSBTU04sIGRhdGUgb2YgYmlydGgsIHBhc3Nwb3J0LCBvciBkcml2ZXIncyBsaWNlbnNlLlxuXG5SZXR1cm4gT05MWSBhIEpTT04gYXJyYXkgd2l0aCB0aGlzIGZvcm1hdCAobm8gbWFya2Rvd24sIG5vIGV4cGxhbmF0aW9uKTpcbltcbiAgeyBcImZpZWxkSW5kZXhcIjogMCwgXCJzZWxlY3RvclwiOiBcIiNlbWFpbFwiLCBcInByb2ZpbGVGaWVsZFwiOiBcImVtYWlsXCIsIFwidmFsdWVcIjogXCJ1c2VyQGV4YW1wbGUuY29tXCIsIFwiY29uZmlkZW5jZVwiOiBcImhpZ2hcIiB9XG5dXG5cbmNvbmZpZGVuY2UgbGV2ZWxzOiBcImhpZ2hcIiAoZXhhY3QgbWF0Y2ggbGlrZSBhdXRvY29tcGxldGU9XCJlbWFpbFwiKSwgXCJtZWRpdW1cIiAobmFtZS9pZCBtYXRjaCksIFwibG93XCIgKGxhYmVsL3BsYWNlaG9sZGVyIGluZmVyZW5jZSlgO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgaHR0cHM6Ly9nZW5lcmF0aXZlbGFuZ3VhZ2UuZ29vZ2xlYXBpcy5jb20vdjFiZXRhL21vZGVscy9nZW1pbmktMi4wLWZsYXNoOmdlbmVyYXRlQ29udGVudD9rZXk9JHthcGlLZXl9YCwge1xuICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgY29udGVudHM6IFt7IHBhcnRzOiBbeyB0ZXh0OiBwcm9tcHQgfV0gfV0sXG4gICAgICAgIGdlbmVyYXRpb25Db25maWc6IHtcbiAgICAgICAgICB0ZW1wZXJhdHVyZTogMC4xLFxuICAgICAgICAgIG1heE91dHB1dFRva2VuczogMjA0OFxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH0pO1xuXG4gICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgY29uc3QgZXJyb3JUZXh0ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuICAgICAgYXV0b0ZpbGxMb2dnZXIuZXJyb3IoJ0dlbWluaSBBUEkgZXJyb3InLCB7IHN0YXR1czogcmVzcG9uc2Uuc3RhdHVzLCBlcnJvcjogZXJyb3JUZXh0IH0pO1xuICAgICAgcmV0dXJuIG1hcEZpZWxkc0hldXJpc3RpY2FsbHkoZmllbGRzLCBwcm9maWxlKTtcbiAgICB9XG5cbiAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgIGNvbnN0IHRleHQgPSBkYXRhLmNhbmRpZGF0ZXM/LlswXT8uY29udGVudD8ucGFydHM/LlswXT8udGV4dCB8fCAnJztcblxuICAgIC8vIEV4dHJhY3QgSlNPTiBmcm9tIHJlc3BvbnNlIChoYW5kbGUgbWFya2Rvd24gY29kZSBibG9ja3MpXG4gICAgbGV0IGpzb25UZXh0ID0gdGV4dC50cmltKCk7XG4gICAgY29uc3QganNvbk1hdGNoID0ganNvblRleHQubWF0Y2goL2BgYCg/Ompzb24pP1xccyooW1xcc1xcU10qPylgYGAvKTtcbiAgICBpZiAoanNvbk1hdGNoKSB7XG4gICAgICBqc29uVGV4dCA9IGpzb25NYXRjaFsxXS50cmltKCk7XG4gICAgfVxuXG4gICAgLy8gQWxzbyB0cnkgdG8gZXh0cmFjdCBpZiBpdCBzdGFydHMgd2l0aCBbIGJ1dCBoYXMgZXh0cmEgdGV4dFxuICAgIGNvbnN0IGFycmF5TWF0Y2ggPSBqc29uVGV4dC5tYXRjaCgvXFxbW1xcc1xcU10qXFxdLyk7XG4gICAgaWYgKGFycmF5TWF0Y2gpIHtcbiAgICAgIGpzb25UZXh0ID0gYXJyYXlNYXRjaFswXTtcbiAgICB9XG5cbiAgICBjb25zdCByYXdNYXBwaW5ncyA9IEpTT04ucGFyc2UoanNvblRleHQpO1xuICAgIGNvbnN0IG1hcHBpbmdzID0gcmF3TWFwcGluZ3MubWFwKG0gPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBmaWVsZHNbbS5maWVsZEluZGV4XTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIC4uLm0sXG4gICAgICAgIGZpZWxkTmFtZTogZmllbGQ/Lm5hbWUgfHwgZmllbGQ/LmlkIHx8IGBmaWVsZF8ke20uZmllbGRJbmRleH1gLFxuICAgICAgICBmaWVsZExhYmVsOiBmaWVsZD8ubGFiZWwgfHwgZmllbGQ/LnBsYWNlaG9sZGVyIHx8IG0ucHJvZmlsZUZpZWxkLFxuICAgICAgICBpc1NlbnNpdGl2ZTogWydzc24nLCAncGFzc3dvcmQnLCAnY2MnLCAnY3JlZGl0Y2FyZCcsICdjdnYnLCAnYmlydGhkYXRlJywgJ2RvYiddLnNvbWUocyA9PiBcbiAgICAgICAgICAobS5wcm9maWxlRmllbGQgfHwgJycpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocykgfHwgXG4gICAgICAgICAgKGZpZWxkPy5uYW1lIHx8ICcnKS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHMpIHx8IFxuICAgICAgICAgIChmaWVsZD8uaWQgfHwgJycpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocylcbiAgICAgICAgKSxcbiAgICAgICAgY29uZmlkZW5jZTogbS5jb25maWRlbmNlID09PSAnaGlnaCcgPyAxLjAgOiBtLmNvbmZpZGVuY2UgPT09ICdtZWRpdW0nID8gMC43IDogMC40XG4gICAgICB9O1xuICAgIH0pO1xuICAgIGF1dG9GaWxsTG9nZ2VyLmluZm8oYEFJIG1hcHBlZCAke21hcHBpbmdzLmxlbmd0aH0gZmllbGRzYCk7XG4gICAgcmV0dXJuIG1hcHBpbmdzO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBhdXRvRmlsbExvZ2dlci5lcnJvcignQUkgbWFwcGluZyBmYWlsZWQnLCB7IGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICByZXR1cm4gbWFwRmllbGRzSGV1cmlzdGljYWxseShmaWVsZHMsIHByb2ZpbGUpO1xuICB9XG59XG5cbi8qKlxuICogRmFsbGJhY2sgaGV1cmlzdGljIGZpZWxkIG1hcHBpbmcgd2hlbiBBSSBpcyB1bmF2YWlsYWJsZVxuICogQHBhcmFtIHtBcnJheX0gZmllbGRzIC0gRm9ybSBmaWVsZCBtZXRhZGF0YVxuICogQHBhcmFtIHtPYmplY3R9IHByb2ZpbGUgLSBVc2VyIHByb2ZpbGUgZGF0YVxuICogQHJldHVybnMge0FycmF5fSBGaWVsZCBtYXBwaW5ncyB3aXRoIHZhbHVlc1xuICovXG5mdW5jdGlvbiBtYXBGaWVsZHNIZXVyaXN0aWNhbGx5KGZpZWxkcywgcHJvZmlsZSkge1xuICBjb25zdCBtYXBwaW5ncyA9IFtdO1xuXG4gIGNvbnN0IHBhdHRlcm5zID0ge1xuICAgIGVtYWlsOiB7IG1hdGNoOiAvZW1haWx8ZS1tYWlsL2ksIGZpZWxkOiAnZW1haWwnIH0sXG4gICAgZmlyc3ROYW1lOiB7IG1hdGNoOiAvZmlyc3RbXy1dP25hbWV8Z2l2ZW5bXy1dP25hbWV8Zm5hbWUvaSwgZmllbGQ6ICdmaXJzdE5hbWUnIH0sXG4gICAgbGFzdE5hbWU6IHsgbWF0Y2g6IC9sYXN0W18tXT9uYW1lfGZhbWlseVtfLV0/bmFtZXxzdXJuYW1lfGxuYW1lL2ksIGZpZWxkOiAnbGFzdE5hbWUnIH0sXG4gICAgbWlkZGxlTmFtZTogeyBtYXRjaDogL21pZGRsZVtfLV0/bmFtZXxtbmFtZS9pLCBmaWVsZDogJ21pZGRsZU5hbWUnIH0sXG4gICAgcGhvbmU6IHsgbWF0Y2g6IC9waG9uZXx0ZWx8bW9iaWxlfGNlbGwvaSwgZmllbGQ6ICdwaG9uZScgfSxcbiAgICBhZGRyZXNzMTogeyBtYXRjaDogL2FkZHJlc3NbXy1dPzF8c3RyZWV0W18tXT9hZGRyZXNzfGFkZHJlc3NbXy1dP2xpbmVbXy1dPzF8c3RyZWV0L2ksIGZpZWxkOiAnYWRkcmVzczEnIH0sXG4gICAgYWRkcmVzczI6IHsgbWF0Y2g6IC9hZGRyZXNzW18tXT8yfGFwdHxzdWl0ZXx1bml0fGFkZHJlc3NbXy1dP2xpbmVbXy1dPzIvaSwgZmllbGQ6ICdhZGRyZXNzMicgfSxcbiAgICBjaXR5OiB7IG1hdGNoOiAvY2l0eXxsb2NhbGl0eS9pLCBmaWVsZDogJ2NpdHknIH0sXG4gICAgc3RhdGU6IHsgbWF0Y2g6IC9zdGF0ZXxwcm92aW5jZXxyZWdpb24vaSwgZmllbGQ6ICdzdGF0ZScgfSxcbiAgICB6aXBDb2RlOiB7IG1hdGNoOiAvemlwfHBvc3RhbFtfLV0/Y29kZXxwb3N0Y29kZS9pLCBmaWVsZDogJ3ppcENvZGUnIH0sXG4gICAgY291bnRyeTogeyBtYXRjaDogL2NvdW50cnkvaSwgZmllbGQ6ICdjb3VudHJ5JyB9LFxuICAgIGNvbXBhbnk6IHsgbWF0Y2g6IC9jb21wYW55fG9yZ2FuaXphdGlvbnxlbXBsb3llci9pLCBmaWVsZDogJ2NvbXBhbnknIH0sXG4gICAgam9iVGl0bGU6IHsgbWF0Y2g6IC9qb2JbXy1dP3RpdGxlfHRpdGxlfHBvc2l0aW9ufHJvbGUvaSwgZmllbGQ6ICdqb2JUaXRsZScgfVxuICB9O1xuXG4gIC8vIEF1dG9jb21wbGV0ZSBhdHRyaWJ1dGUgbWFwcGluZ1xuICBjb25zdCBhdXRvY29tcGxldGVNYXAgPSB7XG4gICAgJ2VtYWlsJzogJ2VtYWlsJyxcbiAgICAnZ2l2ZW4tbmFtZSc6ICdmaXJzdE5hbWUnLFxuICAgICdmYW1pbHktbmFtZSc6ICdsYXN0TmFtZScsXG4gICAgJ2FkZGl0aW9uYWwtbmFtZSc6ICdtaWRkbGVOYW1lJyxcbiAgICAndGVsJzogJ3Bob25lJyxcbiAgICAndGVsLW5hdGlvbmFsJzogJ3Bob25lJyxcbiAgICAnc3RyZWV0LWFkZHJlc3MnOiAnYWRkcmVzczEnLFxuICAgICdhZGRyZXNzLWxpbmUxJzogJ2FkZHJlc3MxJyxcbiAgICAnYWRkcmVzcy1saW5lMic6ICdhZGRyZXNzMicsXG4gICAgJ2FkZHJlc3MtbGV2ZWwyJzogJ2NpdHknLFxuICAgICdhZGRyZXNzLWxldmVsMSc6ICdzdGF0ZScsXG4gICAgJ3Bvc3RhbC1jb2RlJzogJ3ppcENvZGUnLFxuICAgICdjb3VudHJ5JzogJ2NvdW50cnknLFxuICAgICdjb3VudHJ5LW5hbWUnOiAnY291bnRyeScsXG4gICAgJ29yZ2FuaXphdGlvbic6ICdjb21wYW55JyxcbiAgICAnb3JnYW5pemF0aW9uLXRpdGxlJzogJ2pvYlRpdGxlJ1xuICB9O1xuXG4gIGZvciAoY29uc3QgZmllbGQgb2YgZmllbGRzKSB7XG4gICAgaWYgKGZpZWxkLmN1cnJlbnRWYWx1ZSkgY29udGludWU7IC8vIFNraXAgcHJlLWZpbGxlZCBmaWVsZHNcblxuICAgIGNvbnN0IHNlYXJjaFRleHQgPSBgJHtmaWVsZC5hdXRvY29tcGxldGV9ICR7ZmllbGQubmFtZX0gJHtmaWVsZC5pZH0gJHtmaWVsZC5sYWJlbH0gJHtmaWVsZC5wbGFjZWhvbGRlcn1gLnRvTG93ZXJDYXNlKCk7XG4gICAgbGV0IHByb2ZpbGVGaWVsZCA9IG51bGw7XG4gICAgbGV0IGNvbmZpZGVuY2UgPSAnbG93JztcblxuICAgIC8vIFByaW9yaXR5IDE6IGF1dG9jb21wbGV0ZSBhdHRyaWJ1dGVcbiAgICBpZiAoZmllbGQuYXV0b2NvbXBsZXRlICYmIGF1dG9jb21wbGV0ZU1hcFtmaWVsZC5hdXRvY29tcGxldGUudG9Mb3dlckNhc2UoKV0pIHtcbiAgICAgIHByb2ZpbGVGaWVsZCA9IGF1dG9jb21wbGV0ZU1hcFtmaWVsZC5hdXRvY29tcGxldGUudG9Mb3dlckNhc2UoKV07XG4gICAgICBjb25maWRlbmNlID0gJ2hpZ2gnO1xuICAgIH1cblxuICAgIC8vIFByaW9yaXR5IDI6IG5hbWUvaWQvbGFiZWwgcGF0dGVybnNcbiAgICBpZiAoIXByb2ZpbGVGaWVsZCkge1xuICAgICAgZm9yIChjb25zdCBba2V5LCBwYXR0ZXJuXSBvZiBPYmplY3QuZW50cmllcyhwYXR0ZXJucykpIHtcbiAgICAgICAgaWYgKHBhdHRlcm4ubWF0Y2gudGVzdChzZWFyY2hUZXh0KSkge1xuICAgICAgICAgIHByb2ZpbGVGaWVsZCA9IHBhdHRlcm4uZmllbGQ7XG4gICAgICAgICAgY29uZmlkZW5jZSA9ICdtZWRpdW0nO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHByb2ZpbGVGaWVsZCAmJiBwcm9maWxlW3Byb2ZpbGVGaWVsZF0pIHtcbiAgICAgIG1hcHBpbmdzLnB1c2goe1xuICAgICAgICBmaWVsZEluZGV4OiBmaWVsZC5pbmRleCxcbiAgICAgICAgc2VsZWN0b3I6IGZpZWxkLnNlbGVjdG9yLFxuICAgICAgICBwcm9maWxlRmllbGQsXG4gICAgICAgIHZhbHVlOiBwcm9maWxlW3Byb2ZpbGVGaWVsZF0sXG4gICAgICAgIGNvbmZpZGVuY2VcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGF1dG9GaWxsTG9nZ2VyLmluZm8oYEhldXJpc3RpYyBtYXBwZWQgJHttYXBwaW5ncy5sZW5ndGh9IGZpZWxkc2ApO1xuICByZXR1cm4gbWFwcGluZ3M7XG59XG5cbi8qKlxuICogQ29udmVydCBmaWVsZCBtYXBwaW5ncyB0byBiYXRjaCBhY3Rpb25zIGZvciBleGVjdXRlQmF0Y2hBY3Rpb25zXG4gKiBAcGFyYW0ge0FycmF5fSBtYXBwaW5ncyAtIEZpZWxkIG1hcHBpbmdzIGZyb20gQUlcbiAqIEByZXR1cm5zIHtBcnJheX0gQmF0Y2ggYWN0aW9uc1xuICovXG5mdW5jdGlvbiBjb252ZXJ0TWFwcGluZ3NUb0JhdGNoQWN0aW9ucyhtYXBwaW5ncykge1xuICByZXR1cm4gbWFwcGluZ3MubWFwKG0gPT4gKHtcbiAgICB0eXBlOiAnZmlsbCcsXG4gICAgc2VsZWN0b3I6IG0uc2VsZWN0b3IsXG4gICAgdmFsdWU6IG0udmFsdWUsXG4gICAgZmllbGQ6IG0ucHJvZmlsZUZpZWxkLFxuICAgIHByZXNlcnZlRXhpc3Rpbmc6IHRydWVcbiAgfSkpO1xufVxuXG4vKipcbiAqIEV4dHJhY3QgZm9ybSBmaWVsZHMgZnJvbSB0aGUgYWN0aXZlIHRhYlxuICogQHBhcmFtIHtudW1iZXJ9IHRhYklkIC0gVGFiIElEXG4gKiBAcmV0dXJucyB7UHJvbWlzZTxPYmplY3Q+fSBGaWVsZHMgZGF0YSBvciBlcnJvclxuICovXG5hc3luYyBmdW5jdGlvbiBleHRyYWN0Rm9ybUZpZWxkcyh0YWJJZCkge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUudGFicy5zZW5kTWVzc2FnZSh0YWJJZCwgeyB0eXBlOiAnRVhUUkFDVF9GT1JNX0ZJRUxEUycgfSwgKHJlc3BvbnNlKSA9PiB7XG4gICAgICBjb25zdCBlcnIgPSBjaHJvbWUucnVudGltZS5sYXN0RXJyb3I7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHJlc29sdmUoeyBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXNvbHZlKHJlc3BvbnNlIHx8IHsgZXJyb3I6ICdObyByZXNwb25zZSBmcm9tIGNvbnRlbnQgc2NyaXB0JyB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG59XG5cbi8qKlxuICogTWFpbiBhdXRvLWZpbGwgb3JjaGVzdHJhdG9yXG4gKiBAcmV0dXJucyB7UHJvbWlzZTxPYmplY3Q+fSBSZXN1bHQgb2YgYXV0by1maWxsIG9wZXJhdGlvblxuICovXG5hc3luYyBmdW5jdGlvbiBwZXJmb3JtQXV0b0ZpbGwoKSB7XG4gIGF1dG9GaWxsTG9nZ2VyLmluZm8oJ0F1dG8tZmlsbCB0cmlnZ2VyZWQnKTtcblxuICAvLyBTdGVwIDE6IExvYWQgdXNlciBwcm9maWxlXG4gIGNvbnN0IHByb2ZpbGUgPSBhd2FpdCBsb2FkUHJvZmlsZSgpO1xuICBpZiAoIXByb2ZpbGUpIHtcbiAgICBhdXRvRmlsbExvZ2dlci53YXJuKCdObyBwcm9maWxlIGZvdW5kIC0gcGxlYXNlIHNldCB1cCB5b3VyIHByb2ZpbGUgZmlyc3QnKTtcbiAgICByZXR1cm4geyBlcnJvcjogJ05vIHByb2ZpbGUgY29uZmlndXJlZC4gUGxlYXNlIHNldCB1cCB5b3VyIHByb2ZpbGUgaW4gdGhlIEJpbGdlIHNpZGVwYW5lbC4nIH07XG4gIH1cblxuICAvLyBTdGVwIDI6IEdldCBhY3RpdmUgdGFiXG4gIGNvbnN0IHRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7IGFjdGl2ZTogdHJ1ZSwgY3VycmVudFdpbmRvdzogdHJ1ZSB9KTtcbiAgY29uc3QgdGFiID0gdGFic1swXTtcbiAgaWYgKCF0YWI/LmlkKSB7XG4gICAgYXV0b0ZpbGxMb2dnZXIuZXJyb3IoJ05vIGFjdGl2ZSB0YWIgZm91bmQnKTtcbiAgICByZXR1cm4geyBlcnJvcjogJ05vIGFjdGl2ZSB0YWIgZm91bmQnIH07XG4gIH1cblxuICBpZiAoaXNSZXN0cmljdGVkVXJsKHRhYi51cmwpKSB7XG4gICAgYXV0b0ZpbGxMb2dnZXIud2FybignQ2Fubm90IGF1dG8tZmlsbCBvbiByZXN0cmljdGVkIFVSTCcsIHsgdXJsOiB0YWIudXJsIH0pO1xuICAgIHJldHVybiB7IGVycm9yOiAnQ2Fubm90IGF1dG8tZmlsbCBvbiByZXN0cmljdGVkIHBhZ2VzIChDaHJvbWUgaW50ZXJuYWwgcGFnZXMsIFdlYiBTdG9yZSknIH07XG4gIH1cblxuICAvLyBTdGVwIDM6IEV4dHJhY3QgZm9ybSBmaWVsZHNcbiAgYXV0b0ZpbGxMb2dnZXIuaW5mbygnRXh0cmFjdGluZyBmb3JtIGZpZWxkcy4uLicpO1xuICBjb25zdCBleHRyYWN0aW9uID0gYXdhaXQgZXh0cmFjdEZvcm1GaWVsZHModGFiLmlkKTtcbiAgaWYgKGV4dHJhY3Rpb24uZXJyb3IpIHtcbiAgICBhdXRvRmlsbExvZ2dlci5lcnJvcignRmllbGQgZXh0cmFjdGlvbiBmYWlsZWQnLCB7IGVycm9yOiBleHRyYWN0aW9uLmVycm9yIH0pO1xuICAgIHJldHVybiB7IGVycm9yOiBgRmFpbGVkIHRvIGV4dHJhY3QgZm9ybSBmaWVsZHM6ICR7ZXh0cmFjdGlvbi5lcnJvcn1gIH07XG4gIH1cblxuICBjb25zdCBmaWVsZHMgPSBleHRyYWN0aW9uLmZpZWxkcyB8fCBbXTtcbiAgaWYgKGZpZWxkcy5sZW5ndGggPT09IDApIHtcbiAgICBhdXRvRmlsbExvZ2dlci5pbmZvKCdObyBmaWxsYWJsZSBmb3JtIGZpZWxkcyBmb3VuZCBvbiB0aGlzIHBhZ2UnKTtcbiAgICByZXR1cm4geyBlcnJvcjogJ05vIGZpbGxhYmxlIGZvcm0gZmllbGRzIGZvdW5kIG9uIHRoaXMgcGFnZScgfTtcbiAgfVxuXG4gIGF1dG9GaWxsTG9nZ2VyLmluZm8oYEZvdW5kICR7ZmllbGRzLmxlbmd0aH0gZm9ybSBmaWVsZHNgKTtcblxuICAvLyBTdGVwIDQ6IE1hcCBmaWVsZHMgdG8gcHJvZmlsZSB1c2luZyBBSVxuICBhdXRvRmlsbExvZ2dlci5pbmZvKCdNYXBwaW5nIGZpZWxkcyB3aXRoIEFJLi4uJyk7XG4gIGNvbnN0IG1hcHBpbmdzID0gYXdhaXQgbWFwRmllbGRzV2l0aEFJKGZpZWxkcywgcHJvZmlsZSk7XG4gIGlmIChtYXBwaW5ncy5sZW5ndGggPT09IDApIHtcbiAgICBhdXRvRmlsbExvZ2dlci5pbmZvKCdObyBmaWVsZHMgbWF0Y2hlZCBwcm9maWxlIGRhdGEnKTtcbiAgICByZXR1cm4geyBlcnJvcjogJ05vIGZvcm0gZmllbGRzIG1hdGNoZWQgeW91ciBwcm9maWxlIGRhdGEnIH07XG4gIH1cblxuICBhdXRvRmlsbExvZ2dlci5pbmZvKGBNYXBwZWQgJHttYXBwaW5ncy5sZW5ndGh9IGZpZWxkcyB0byBwcm9maWxlYCk7XG5cbiAgLy8gU3RvcmUgZm9yIGxhdGVyIGV4ZWN1dGlvbiBpZiBjb25maXJtZWRcbiAgcGVuZGluZ0F1dG9GaWxsID0ge1xuICAgIG1hcHBpbmdzLFxuICAgIHRhYklkOiB0YWIuaWRcbiAgfTtcblxuICAvLyBUcnkgdG8gc2hvdyBwcmV2aWV3IGluIHNpZGVwYW5lbFxuICB0cnkge1xuICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgIHR5cGU6ICdTSE9XX0FVVE9fRklMTF9QUkVWSUVXJyxcbiAgICAgIHBheWxvYWQ6IHsgbWFwcGluZ3MgfVxuICAgIH0pO1xuICAgIGF1dG9GaWxsTG9nZ2VyLmluZm8oJ1NlbnQgYXV0by1maWxsIHByZXZpZXcgdG8gc2lkZXBhbmVsJyk7XG4gICAgcmV0dXJuIHsgcHJldmlld1Nob3duOiB0cnVlLCBjb3VudDogbWFwcGluZ3MubGVuZ3RoIH07XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIC8vIElmIHNpZGVwYW5lbCBpcyBub3Qgb3BlbiBvciBkb2Vzbid0IGhhbmRsZSBpdCwgcHJvY2VlZCBkaXJlY3RseSAob2xkIGJlaGF2aW9yKVxuICAgIGF1dG9GaWxsTG9nZ2VyLndhcm4oJ0ZhaWxlZCB0byBzZW5kIHByZXZpZXcsIHByb2NlZWRpbmcgZGlyZWN0bHknLCB7IGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgfVxuXG4gIC8vIFN0ZXAgNTogQ29udmVydCB0byBiYXRjaCBhY3Rpb25zIGFuZCBleGVjdXRlXG4gIGNvbnN0IGFjdGlvbnMgPSBjb252ZXJ0TWFwcGluZ3NUb0JhdGNoQWN0aW9ucyhtYXBwaW5ncyk7XG4gIGF1dG9GaWxsTG9nZ2VyLmluZm8oYEV4ZWN1dGluZyAke2FjdGlvbnMubGVuZ3RofSBmaWxsIGFjdGlvbnMuLi5gKTtcblxuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVCYXRjaEFjdGlvbnMoYWN0aW9ucywge1xuICAgICAgaHVtYW5pemVkRGVsYXlFbmFibGVkOiB0cnVlLFxuICAgICAgaHVtYW5pemVkRGVsYXlCYXNlTXM6IDUwLFxuICAgICAgaHVtYW5pemVkRGVsYXlKaXR0ZXJNczogMTAwLFxuICAgICAgc3VwcHJlc3NMaWZlY3ljbGVMb2dzOiB0cnVlXG4gICAgfSk7XG5cbiAgICBhdXRvRmlsbExvZ2dlci5pbmZvKCdBdXRvLWZpbGwgY29tcGxldGVkJywge1xuICAgICAgZXhlY3V0ZWRTdGVwczogcmVzdWx0LmV4ZWN1dGVkU3RlcHMsXG4gICAgICBtYXBwZWRGaWVsZHM6IG1hcHBpbmdzLmxlbmd0aFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICBmaWxsZWRGaWVsZHM6IHJlc3VsdC5leGVjdXRlZFN0ZXBzLFxuICAgICAgdG90YWxNYXBwZWQ6IG1hcHBpbmdzLmxlbmd0aCxcbiAgICAgIG1hcHBpbmdzOiBtYXBwaW5ncy5tYXAobSA9PiAoeyBmaWVsZDogbS5wcm9maWxlRmllbGQsIGNvbmZpZGVuY2U6IG0uY29uZmlkZW5jZSB9KSlcbiAgICB9O1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBhdXRvRmlsbExvZ2dlci5lcnJvcignQXV0by1maWxsIGV4ZWN1dGlvbiBmYWlsZWQnLCB7IGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICByZXR1cm4geyBlcnJvcjogYEZpbGwgZXhlY3V0aW9uIGZhaWxlZDogJHtlcnIubWVzc2FnZX1gIH07XG4gIH1cbn1cblxuLy8gQ29tbWFuZCBsaXN0ZW5lciBmb3Iga2V5Ym9hcmQgc2hvcnRjdXRcbmNocm9tZS5jb21tYW5kcy5vbkNvbW1hbmQuYWRkTGlzdGVuZXIoYXN5bmMgKGNvbW1hbmQpID0+IHtcbiAgaWYgKGNvbW1hbmQgPT09ICdhdXRvX2ZpbGxfZm9ybScpIHtcbiAgICBhdXRvRmlsbExvZ2dlci5pbmZvKCdBdXRvLWZpbGwgY29tbWFuZCByZWNlaXZlZCAoQ3RybCtTaGlmdCtMKScpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHBlcmZvcm1BdXRvRmlsbCgpO1xuXG4gICAgLy8gU2VuZCByZXN1bHQgbm90aWZpY2F0aW9uIHRvIHNpZGVwYW5lbCBpZiBvcGVuXG4gICAgc2FmZVNlbmRSdW50aW1lTWVzc2FnZSh7XG4gICAgICB0eXBlOiAnQVVUT19GSUxMX1JFU1VMVCcsXG4gICAgICBwYXlsb2FkOiByZXN1bHRcbiAgICB9KTtcblxuICAgIC8vIFNob3cgbm90aWZpY2F0aW9uIGZvciB1c2VyIGZlZWRiYWNrXG4gICAgaWYgKHJlc3VsdC5lcnJvcikge1xuICAgICAgY2hyb21lLm5vdGlmaWNhdGlvbnMuY3JlYXRlKHtcbiAgICAgICAgdHlwZTogJ2Jhc2ljJyxcbiAgICAgICAgaWNvblVybDogJ2ljb25zL2ljb240OC5wbmcnLFxuICAgICAgICB0aXRsZTogJ0JpbGdlIEF1dG8tRmlsbCcsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5lcnJvclxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNocm9tZS5ub3RpZmljYXRpb25zLmNyZWF0ZSh7XG4gICAgICAgIHR5cGU6ICdiYXNpYycsXG4gICAgICAgIGljb25Vcmw6ICdpY29ucy9pY29uNDgucG5nJyxcbiAgICAgICAgdGl0bGU6ICdCaWxnZSBBdXRvLUZpbGwnLFxuICAgICAgICBtZXNzYWdlOiBgRmlsbGVkICR7cmVzdWx0LmZpbGxlZEZpZWxkc30gb2YgJHtyZXN1bHQudG90YWxNYXBwZWQgfHwgMH0gbWF0Y2hlZCBmaWVsZHNgXG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBpZiAoY29tbWFuZCA9PT0gJ29wZW5fY29tbWFuZF9pbnB1dCcpIHtcbiAgICBiZ0xvZ2dlci5pbmZvKCdDb21tYW5kOiBvcGVuX2NvbW1hbmRfaW5wdXQnKTtcbiAgICBjb25zdCBbdGFiXSA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHsgYWN0aXZlOiB0cnVlLCBjdXJyZW50V2luZG93OiB0cnVlIH0pO1xuICAgIGlmICghdGFiPy5pZCkgcmV0dXJuO1xuICAgIFxuICAgIGF3YWl0IGNocm9tZS5zaWRlUGFuZWwub3Blbih7IHRhYklkOiB0YWIuaWQgfSk7XG4gICAgLy8gU21hbGwgZGVsYXkgdG8gYWxsb3cgc2lkZXBhbmVsIHRvIGxvYWQgaWYgaXQgd2Fzbid0IG9wZW5cbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ0ZPQ1VTX0NPTU1BTkRfSU5QVVQnIH0pO1xuICAgIH0sIDUwMCk7XG4gIH1cblxuICBpZiAoY29tbWFuZCA9PT0gJ3NjcmVlbnNob3RfYW5hbHl6ZScpIHtcbiAgICBiZ0xvZ2dlci5pbmZvKCdDb21tYW5kOiBzY3JlZW5zaG90X2FuYWx5emUnKTtcbiAgICBjb25zdCBbdGFiXSA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHsgYWN0aXZlOiB0cnVlLCBjdXJyZW50V2luZG93OiB0cnVlIH0pO1xuICAgIGlmICghdGFiPy5pZCkgcmV0dXJuO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHNjcmVlbnNob3QgPSBhd2FpdCBjYXB0dXJlVmlzaWJsZVRhYkRhdGFVcmwodGFiLndpbmRvd0lkIHx8IG51bGwpO1xuICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyBcbiAgICAgICAgdHlwZTogJ0FOQUxZWkVfU0NSRUVOU0hPVCcsIFxuICAgICAgICBwYXlsb2FkOiB7IHNjcmVlbnNob3QsIHRhYklkOiB0YWIuaWQgfSBcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgYmdMb2dnZXIuZXJyb3IoJ1NjcmVlbnNob3QgYW5hbHl6ZSBmYWlsZWQnLCB7IGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICB9XG4gIH1cblxuICBpZiAoY29tbWFuZCA9PT0gJ2NhbmNlbF9hY3Rpb24nKSB7XG4gICAgYmdMb2dnZXIuaW5mbygnQ29tbWFuZDogY2FuY2VsX2FjdGlvbicpO1xuICAgIGNvbnN0IFt0YWJdID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoeyBhY3RpdmU6IHRydWUsIGN1cnJlbnRXaW5kb3c6IHRydWUgfSk7XG4gICAgaWYgKCF0YWI/LmlkKSByZXR1cm47XG4gICAgXG4gICAgY2hyb21lLnRhYnMuc2VuZE1lc3NhZ2UodGFiLmlkLCB7IHR5cGU6ICdDQU5DRUxfQ1VSUkVOVF9BQ1RJT04nIH0pO1xuICB9XG59KTtcblxuLy8gTWVzc2FnZSBoYW5kbGVyIGZvciBwcm9maWxlIG9wZXJhdGlvbnMgKGZyb20gc2lkZXBhbmVsKVxuY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKChyZXF1ZXN0LCBzZW5kZXIsIHNlbmRSZXNwb25zZSkgPT4ge1xuICBpZiAocmVxdWVzdD8udG8gPT09ICdCQUNLR1JPVU5EJyAmJiByZXF1ZXN0LnBheWxvYWQ/LmFjdGlvbiA9PT0gJ2dldF9wcm9maWxlJykge1xuICAgIGxvYWRQcm9maWxlKCkudGhlbihwcm9maWxlID0+IHNlbmRSZXNwb25zZSh7IHByb2ZpbGUgfSkpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKHJlcXVlc3Q/LnRvID09PSAnQkFDS0dST1VORCcgJiYgcmVxdWVzdC5wYXlsb2FkPy5hY3Rpb24gPT09ICdzYXZlX3Byb2ZpbGUnKSB7XG4gICAgc2F2ZVByb2ZpbGUocmVxdWVzdC5wYXlsb2FkLnByb2ZpbGUpLnRoZW4oc3VjY2VzcyA9PiBzZW5kUmVzcG9uc2UoeyBzdWNjZXNzIH0pKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChyZXF1ZXN0Py50byA9PT0gJ0JBQ0tHUk9VTkQnICYmIHJlcXVlc3QucGF5bG9hZD8uYWN0aW9uID09PSAnYXV0b19maWxsJykge1xuICAgIHBlcmZvcm1BdXRvRmlsbCgpLnRoZW4ocmVzdWx0ID0+IHNlbmRSZXNwb25zZShyZXN1bHQpKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChyZXF1ZXN0Py50eXBlID09PSAnQ09ORklSTV9BVVRPX0ZJTEwnKSB7XG4gICAgKGFzeW5jICgpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlmICghcGVuZGluZ0F1dG9GaWxsKSB7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgZXJyb3I6ICdObyBwZW5kaW5nIGF1dG8tZmlsbCBmb3VuZCcgfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgeyBzZWxlY3RlZEZpZWxkcyB9ID0gcmVxdWVzdC5wYXlsb2FkO1xuICAgICAgICBjb25zdCBmaWx0ZXJlZE1hcHBpbmdzID0gcGVuZGluZ0F1dG9GaWxsLm1hcHBpbmdzLmZpbHRlcihtID0+IFxuICAgICAgICAgIHNlbGVjdGVkRmllbGRzLmluY2x1ZGVzKG0uZmllbGROYW1lKVxuICAgICAgICApO1xuXG4gICAgICAgIGlmIChmaWx0ZXJlZE1hcHBpbmdzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IGVycm9yOiAnTm8gZmllbGRzIHNlbGVjdGVkJyB9KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBhY3Rpb25zID0gY29udmVydE1hcHBpbmdzVG9CYXRjaEFjdGlvbnMoZmlsdGVyZWRNYXBwaW5ncyk7XG4gICAgICAgIGF1dG9GaWxsTG9nZ2VyLmluZm8oYEV4ZWN1dGluZyBjb25maXJtZWQgJHthY3Rpb25zLmxlbmd0aH0gZmlsbCBhY3Rpb25zLi4uYCk7XG5cbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZUJhdGNoQWN0aW9ucyhhY3Rpb25zLCB7XG4gICAgICAgICAgdGFiSWQ6IHBlbmRpbmdBdXRvRmlsbC50YWJJZCxcbiAgICAgICAgICBodW1hbml6ZWREZWxheUVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgaHVtYW5pemVkRGVsYXlCYXNlTXM6IDUwLFxuICAgICAgICAgIGh1bWFuaXplZERlbGF5Sml0dGVyTXM6IDEwMCxcbiAgICAgICAgICBzdXBwcmVzc0xpZmVjeWNsZUxvZ3M6IHRydWVcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcGVuZGluZ0F1dG9GaWxsID0gbnVsbDtcbiAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSwgZmlsbGVkRmllbGRzOiByZXN1bHQuZXhlY3V0ZWRTdGVwcyB9KTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBhdXRvRmlsbExvZ2dlci5lcnJvcignQ29uZmlybWVkIGF1dG8tZmlsbCBmYWlsZWQnLCB7IGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgc2VuZFJlc3BvbnNlKHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgfVxuICAgIH0pKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn0pO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gTUNQIEZvcm0gRGF0YSBIYW5kbGVycyAoU2VsZi1IZWFsaW5nIEludGVncmF0aW9uKVxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKChyZXF1ZXN0LCBzZW5kZXIsIHNlbmRSZXNwb25zZSkgPT4ge1xuICAvLyBMb2FkIGZvcm0gZGF0YSBmcm9tIE1DUCBmaWxlc3lzdGVtXG4gIGlmIChyZXF1ZXN0Py50eXBlID09PSAnTE9BRF9NQ1BfRk9STV9EQVRBJykge1xuICAgIGNvbnN0IHBhdGggPSBTdHJpbmcocmVxdWVzdC5wYXlsb2FkPy5wYXRoIHx8ICdwcm9maWxlcy9kZWZhdWx0Lmpzb24nKS50cmltKCk7XG4gICAgYmdMb2dnZXIuaW5mbygnTE9BRF9NQ1BfRk9STV9EQVRBIHJlcXVlc3RlZCcsIHsgcGF0aCB9KTtcblxuICAgIChhc3luYyAoKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBhcHBTZXR0aW5ncyA9IGF3YWl0IGdldEJpbGdlQXBwU2V0dGluZ3NTbmFwc2hvdCgpO1xuICAgICAgICBjb25zdCBtY3BCYXNlVXJsID0gU3RyaW5nKGFwcFNldHRpbmdzPy5tY3BCYXNlVXJsIHx8ICcnKS50cmltKCkgfHwgJ2h0dHBzOi8vbWNwLmNhcmF2YW5mbG93LmNvbSc7XG4gICAgICAgIGNvbnN0IG1jcFRva2VuID0gU3RyaW5nKGFwcFNldHRpbmdzPy5tY3BBcGlUb2tlbiB8fCBhcHBTZXR0aW5ncz8ubWNwVG9rZW4gfHwgJycpLnRyaW0oKTtcbiAgICAgICAgY29uc3QgaGVhZGVycyA9IHtcbiAgICAgICAgICAuLi4obWNwVG9rZW4gPyB7ICdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke21jcFRva2VufWAgfSA6IHt9KSxcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nXG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHttY3BCYXNlVXJsfS9tY3AvcmVzb3VyY2U/cGF0aD0ke2VuY29kZVVSSUNvbXBvbmVudChwYXRoKX1gLCB7XG4gICAgICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgICAgICBoZWFkZXJzXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgICBiZ0xvZ2dlci53YXJuKCdNQ1AgZm9ybSBkYXRhIGZldGNoIGZhaWxlZCcsIHsgc3RhdHVzOiByZXNwb25zZS5zdGF0dXMsIHBhdGggfSk7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogYE1DUCByZXF1ZXN0IGZhaWxlZDogJHtyZXNwb25zZS5zdGF0dXN9YCB9KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgICAgICBiZ0xvZ2dlci5pbmZvKCdMT0FEX01DUF9GT1JNX0RBVEEgc3VjY2VzcycsIHsgcGF0aCwgZmllbGRzQ291bnQ6IE9iamVjdC5rZXlzKGRhdGEuZmllbGRzIHx8IGRhdGEpLmxlbmd0aCB9KTtcbiAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IHRydWUsIGZvcm1EYXRhOiBkYXRhIH0pO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGJnTG9nZ2VyLmVycm9yKCdMT0FEX01DUF9GT1JNX0RBVEEgZXJyb3InLCB7IHBhdGgsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICB9XG4gICAgfSkoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIC8vIFNhdmUgZm9ybSBkYXRhIHRvIE1DUCBmaWxlc3lzdGVtXG4gIGlmIChyZXF1ZXN0Py50eXBlID09PSAnU0FWRV9NQ1BfRk9STV9EQVRBJykge1xuICAgIGNvbnN0IHBhdGggPSBTdHJpbmcocmVxdWVzdC5wYXlsb2FkPy5wYXRoIHx8ICdwcm9maWxlcy9kZWZhdWx0Lmpzb24nKS50cmltKCk7XG4gICAgY29uc3QgZGF0YSA9IHJlcXVlc3QucGF5bG9hZD8uZGF0YTtcbiAgICBiZ0xvZ2dlci5pbmZvKCdTQVZFX01DUF9GT1JNX0RBVEEgcmVxdWVzdGVkJywgeyBwYXRoIH0pO1xuXG4gICAgKGFzeW5jICgpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGFwcFNldHRpbmdzID0gYXdhaXQgZ2V0QmlsZ2VBcHBTZXR0aW5nc1NuYXBzaG90KCk7XG4gICAgICAgIGNvbnN0IG1jcEJhc2VVcmwgPSBTdHJpbmcoYXBwU2V0dGluZ3M/Lm1jcEJhc2VVcmwgfHwgJycpLnRyaW0oKSB8fCAnaHR0cHM6Ly9tY3AuY2FyYXZhbmZsb3cuY29tJztcbiAgICAgICAgY29uc3QgbWNwVG9rZW4gPSBTdHJpbmcoYXBwU2V0dGluZ3M/Lm1jcEFwaVRva2VuIHx8IGFwcFNldHRpbmdzPy5tY3BUb2tlbiB8fCAnJykudHJpbSgpO1xuICAgICAgICBjb25zdCBoZWFkZXJzID0ge1xuICAgICAgICAgIC4uLihtY3BUb2tlbiA/IHsgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7bWNwVG9rZW59YCB9IDoge30pLFxuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbidcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke21jcEJhc2VVcmx9L21jcC9yZXNvdXJjZT9wYXRoPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHBhdGgpfWAsIHtcbiAgICAgICAgICBtZXRob2Q6ICdQVVQnLFxuICAgICAgICAgIGhlYWRlcnMsXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoZGF0YSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICAgIGJnTG9nZ2VyLndhcm4oJ01DUCBmb3JtIGRhdGEgc2F2ZSBmYWlsZWQnLCB7IHN0YXR1czogcmVzcG9uc2Uuc3RhdHVzLCBwYXRoIH0pO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6IGBNQ1Agc2F2ZSBmYWlsZWQ6ICR7cmVzcG9uc2Uuc3RhdHVzfWAgfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgYmdMb2dnZXIuaW5mbygnU0FWRV9NQ1BfRk9STV9EQVRBIHN1Y2Nlc3MnLCB7IHBhdGggfSk7XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlIH0pO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGJnTG9nZ2VyLmVycm9yKCdTQVZFX01DUF9GT1JNX0RBVEEgZXJyb3InLCB7IHBhdGgsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICB9XG4gICAgfSkoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIC8vIExpc3QgYXZhaWxhYmxlIHByb2ZpbGVzIGZyb20gTUNQXG4gIGlmIChyZXF1ZXN0Py50eXBlID09PSAnTElTVF9NQ1BfUFJPRklMRVMnKSB7XG4gICAgYmdMb2dnZXIuaW5mbygnTElTVF9NQ1BfUFJPRklMRVMgcmVxdWVzdGVkJyk7XG5cbiAgICAoYXN5bmMgKCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYXBwU2V0dGluZ3MgPSBhd2FpdCBnZXRCaWxnZUFwcFNldHRpbmdzU25hcHNob3QoKTtcbiAgICAgICAgY29uc3QgbWNwQmFzZVVybCA9IFN0cmluZyhhcHBTZXR0aW5ncz8ubWNwQmFzZVVybCB8fCAnJykudHJpbSgpIHx8ICdodHRwczovL21jcC5jYXJhdmFuZmxvdy5jb20nO1xuICAgICAgICBjb25zdCBtY3BUb2tlbiA9IFN0cmluZyhhcHBTZXR0aW5ncz8ubWNwQXBpVG9rZW4gfHwgYXBwU2V0dGluZ3M/Lm1jcFRva2VuIHx8ICcnKS50cmltKCk7XG4gICAgICAgIGNvbnN0IGhlYWRlcnMgPSB7XG4gICAgICAgICAgLi4uKG1jcFRva2VuID8geyAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHttY3BUb2tlbn1gIH0gOiB7fSksXG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJ1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7bWNwQmFzZVVybH0vbWNwL2xpc3Q/cGF0aD1wcm9maWxlcy9gLCB7XG4gICAgICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgICAgICBoZWFkZXJzXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiBgTUNQIGxpc3QgZmFpbGVkOiAke3Jlc3BvbnNlLnN0YXR1c31gLCBwcm9maWxlczogW10gfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgICAgY29uc3QgcHJvZmlsZXMgPSBBcnJheS5pc0FycmF5KGRhdGEuZmlsZXMpID8gZGF0YS5maWxlcy5maWx0ZXIoZiA9PiBmLmVuZHNXaXRoKCcuanNvbicpKSA6IFtdO1xuICAgICAgICBiZ0xvZ2dlci5pbmZvKCdMSVNUX01DUF9QUk9GSUxFUyBzdWNjZXNzJywgeyBjb3VudDogcHJvZmlsZXMubGVuZ3RoIH0pO1xuICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogdHJ1ZSwgcHJvZmlsZXMgfSk7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgYmdMb2dnZXIuZXJyb3IoJ0xJU1RfTUNQX1BST0ZJTEVTIGVycm9yJywgeyBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlLCBwcm9maWxlczogW10gfSk7XG4gICAgICB9XG4gICAgfSkoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIC8vIFJlbGF5IHNlbGYtaGVhbGluZyBtZXNzYWdlcyB0byBjb250ZW50IHNjcmlwdFxuICBpZiAocmVxdWVzdD8udHlwZSA9PT0gJ0ZJTExfRlJPTV9QUk9GSUxFJyB8fFxuICAgICAgcmVxdWVzdD8udHlwZSA9PT0gJ1NBVkVfRk9STV9TVEFURScgfHxcbiAgICAgIHJlcXVlc3Q/LnR5cGUgPT09ICdSRVNUT1JFX0ZPUk1fU1RBVEUnIHx8XG4gICAgICByZXF1ZXN0Py50eXBlID09PSAnR0VUX1NFTEZfSEVBTElOR19TVEFUUycgfHxcbiAgICAgIHJlcXVlc3Q/LnR5cGUgPT09ICdHRVRfUEFHRV9DT05URVhUJykge1xuXG4gICAgKGFzeW5jICgpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHRhYiA9IGF3YWl0IHF1ZXJ5QWN0aXZlVGFiKCk7XG4gICAgICAgIGlmICghdGFiPy5pZCkge1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgdGFiJyB9KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBzZW5kQ29udGVudE1lc3NhZ2VXaXRoUmV0cnkodGFiLmlkLCByZXF1ZXN0KTtcbiAgICAgICAgc2VuZFJlc3BvbnNlKHJlc3VsdCk7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICB9XG4gICAgfSkoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufSk7XG5cbmNocm9tZS5zdG9yYWdlLm9uQ2hhbmdlZC5hZGRMaXN0ZW5lcigoY2hhbmdlcywgYXJlYU5hbWUpID0+IHtcbiAgaWYgKGFyZWFOYW1lICE9PSAnbG9jYWwnKSByZXR1cm47XG5cbiAgaWYgKGNoYW5nZXNbUkVMQVlfQUdFTlRfSURfS0VZXSkge1xuICAgIHJlbGF5QWdlbnRJZENhY2hlID0gbm9ybWFsaXplQWdlbnRJZChjaGFuZ2VzW1JFTEFZX0FHRU5UX0lEX0tFWV0ubmV3VmFsdWUgfHwgJycpO1xuICB9XG5cbiAgY29uc3QgcmVsYXlSZWxldmFudCA9IFtcbiAgICBNQVNURVJfQUNUSVZFX0tFWSxcbiAgICBSRUxBWV9FTkRQT0lOVF9LRVksXG4gICAgUkVMQVlfV1NfVE9LRU5fS0VZLFxuICAgIFJFTEFZX0FHRU5UX0lEX0tFWVxuICBdO1xuXG4gIGlmICghcmVsYXlSZWxldmFudC5zb21lKChrZXkpID0+IGNoYW5nZXNba2V5XSkpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoY2hhbmdlc1tNQVNURVJfQUNUSVZFX0tFWV0gJiYgY2hhbmdlc1tNQVNURVJfQUNUSVZFX0tFWV0ubmV3VmFsdWUgPT09IGZhbHNlKSB7XG4gICAgZGlzY29ubmVjdFJlbGF5KCdtYXN0ZXJfb2ZmJyk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29ubmVjdFJlbGF5KCkuY2F0Y2goKGVycikgPT4ge1xuICAgIGJnTG9nZ2VyLndhcm4oJ1JlbGF5IHJlY29ubmVjdCBhZnRlciBzZXR0aW5ncyBjaGFuZ2UgZmFpbGVkJywgeyBlcnJvcjogdG9FcnJvck1lc3NhZ2UoZXJyKSB9KTtcbiAgICBzY2hlZHVsZVJlbGF5UmVjb25uZWN0KCk7XG4gIH0pO1xufSk7XG5cbi8vIFN0YXJ0IHJlbGF5IGNsaWVudCBvbiB3b3JrZXIgbG9hZC5cbmluaXRpYWxpemVSZWxheUNsaWVudCgpLmNhdGNoKChlcnIpID0+IHtcbiAgYmdMb2dnZXIud2FybignSW5pdGlhbCByZWxheSBib290c3RyYXAgZmFpbGVkJywgeyBlcnJvcjogdG9FcnJvck1lc3NhZ2UoZXJyKSB9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7OztBQUtBLElBQU0sZ0JBQU4sTUFBb0I7QUFBQSxFQUxwQixPQUtvQjtBQUFBO0FBQUE7QUFBQSxFQUNsQixjQUFjO0FBQ1osU0FBSyxXQUFXLG9CQUFJLElBQUk7QUFDeEIsU0FBSyxlQUFlLENBQUM7QUFDckIsWUFBUSxJQUFJLDZCQUE2QjtBQUFBLEVBQzNDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT0EsU0FBUyxRQUFRLFNBQVM7QUFDeEIsUUFBSSxLQUFLLFNBQVMsSUFBSSxNQUFNLEdBQUc7QUFDN0IsY0FBUSxLQUFLLG1EQUFtRCxNQUFNLEVBQUU7QUFBQSxJQUMxRTtBQUNBLFNBQUssU0FBUyxJQUFJLFFBQVEsT0FBTztBQUFBLEVBQ25DO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLGVBQWUsYUFBYTtBQUMxQixTQUFLLGFBQWEsS0FBSyxXQUFXO0FBQUEsRUFDcEM7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQU0sU0FBUyxTQUFTLFFBQVE7QUFDOUIsVUFBTSxTQUFTLFFBQVEsVUFBVyxRQUFRLFdBQVcsUUFBUSxRQUFRLFVBQVcsUUFBUTtBQUd4RixlQUFXLGVBQWUsS0FBSyxjQUFjO0FBQzNDLFVBQUksWUFBWSxTQUFTLE1BQU0sR0FBRztBQUNoQyxjQUFNLElBQUksTUFBTSxnQ0FBZ0M7QUFBQSxNQUNsRDtBQUFBLElBQ0Y7QUFFQSxVQUFNLFVBQVUsS0FBSyxTQUFTLElBQUksTUFBTTtBQUN4QyxR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
