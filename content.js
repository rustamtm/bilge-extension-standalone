var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

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
    VERSION: true ? "2.0.16" : "dev",
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

// src/content.js
(() => {
  if (window.__bilgeContentScriptMounted) return;
  window.__bilgeContentScriptMounted = true;
  const contentLogger = createLogger("ContentScript");
  contentLogger.info("Content script mounted");
  const selfHealingEngine = window.__bilge_selfHealingEngine || null;
  const fieldResolver = window.__bilge_fieldResolver || null;
  const contextInference = window.__bilge_contextInference || null;
  const mcpBridge = window.__bilge_mcpDataBridge || null;
  const formPersistence = window.__bilge_formStatePersistence || null;
  if (formPersistence) {
    formPersistence.setupAutoSave();
    document.addEventListener("DOMContentLoaded", () => {
      formPersistence.setupAutoRestore().catch((err) => {
        contentLogger.warn("Auto-restore failed", { error: err.message });
      });
    });
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (window.__bilge_runtime) {
        window.__bilge_runtime.updateHighlight(null);
      }
    }
  }, { passive: true });
  const MAX_PAGE_TEXT_CHARS = 5e3;
  const MAX_HTML_CHARS = 5e4;
  const MAX_SHADOW_HTML_CHARS = 5e4;
  const MAX_SHADOW_ROOTS = 80;
  const MAX_EXECUTE_JS_CODE_CHARS = 2e4;
  const MAX_EXECUTE_JS_RESULT_CHARS = 5e4;
  const DEFAULT_EXECUTE_JS_TIMEOUT_MS = 5e3;
  const DOM_SKILL_MEMORY_KEY = "__bilge_dom_skill_memory_v1";
  const DOM_SKILL_MEMORY_MAX = 300;
  const DOM_SKILL_MEMORY_TTL_MS = 45 * 24 * 60 * 60 * 1e3;
  const NATURAL_COMMAND_MEMORY_KEY = "__bilge_natural_command_memory_v1";
  const NATURAL_COMMAND_MEMORY_MAX = 300;
  const NATURAL_COMMAND_MEMORY_TTL_MS = 60 * 24 * 60 * 60 * 1e3;
  let domSkillMemoryCache = null;
  let domSkillMemoryLoadPromise = null;
  let naturalCommandMemoryCache = null;
  let naturalCommandMemoryLoadPromise = null;
  function truncate(text, maxChars) {
    const str = String(text || "");
    if (!Number.isFinite(maxChars) || maxChars <= 0) return "";
    return str.length > maxChars ? `${str.slice(0, maxChars)}... (truncated)` : str;
  }
  __name(truncate, "truncate");
  function describeRestrictedSelectorError(selector, err) {
    const message = err && err.message ? String(err.message) : String(err || "");
    return { error: `Invalid selector "${selector}": ${message || "Unknown error"}` };
  }
  __name(describeRestrictedSelectorError, "describeRestrictedSelectorError");
  function querySelectorDeep(selector, root = document) {
    const pendingRoots = [root];
    const seenRoots = /* @__PURE__ */ new Set();
    for (let i = 0; i < pendingRoots.length && pendingRoots.length <= MAX_SHADOW_ROOTS; i++) {
      const currentRoot = pendingRoots[i];
      if (!currentRoot || seenRoots.has(currentRoot)) continue;
      seenRoots.add(currentRoot);
      const found = currentRoot.querySelector(selector);
      if (found) return found;
      const walker = document.createTreeWalker(currentRoot, NodeFilter.SHOW_ELEMENT);
      for (let node = walker.currentNode; node; node = walker.nextNode()) {
        if (node.shadowRoot) pendingRoots.push(node.shadowRoot);
        const tag = String(node?.tagName || "").toUpperCase();
        const isFrame = tag === "IFRAME" || tag === "FRAME";
        if (isFrame) {
          try {
            if (node.contentDocument) pendingRoots.push(node.contentDocument);
          } catch (_err) {
          }
        }
        if (pendingRoots.length > MAX_SHADOW_ROOTS) break;
      }
    }
    return null;
  }
  __name(querySelectorDeep, "querySelectorDeep");
  function setNativeValue(element, value) {
    const nextValue = String(value ?? "");
    const tag = String(element?.tagName || "").toUpperCase();
    const view = element?.ownerDocument?.defaultView || null;
    const proto = tag === "INPUT" ? view?.HTMLInputElement?.prototype : tag === "TEXTAREA" ? view?.HTMLTextAreaElement?.prototype : null;
    const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(element, nextValue);
      return;
    }
    element.value = nextValue;
  }
  __name(setNativeValue, "setNativeValue");
  function dispatchInputEvents(element) {
    const inputEvent = typeof InputEvent === "function" ? new InputEvent("input", { bubbles: true, composed: true }) : new Event("input", { bubbles: true });
    element.dispatchEvent(inputEvent);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
  __name(dispatchInputEvents, "dispatchInputEvents");
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
  function escapeCssValue(value) {
    const text = String(value || "");
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(text);
    }
    return text.replace(/["\\]/g, "\\$&");
  }
  __name(escapeCssValue, "escapeCssValue");
  function normalizeSkillTarget(value) {
    return String(value || "").toLowerCase().replace(/\b\d{5,}\b/g, "#").replace(/[^a-z0-9\s_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  }
  __name(normalizeSkillTarget, "normalizeSkillTarget");
  function getPathPrefix(pathname) {
    const parts = String(pathname || "").split("/").filter(Boolean).slice(0, 2);
    return parts.length ? `/${parts.join("/")}` : "/";
  }
  __name(getPathPrefix, "getPathPrefix");
  function getDomSkillScope() {
    return {
      host: String(window.location?.host || "").toLowerCase(),
      pathPrefix: getPathPrefix(window.location?.pathname || "/")
    };
  }
  __name(getDomSkillScope, "getDomSkillScope");
  function pruneDomSkillMemory(entries) {
    const now = Date.now();
    const seen = /* @__PURE__ */ new Set();
    const normalized = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry || typeof entry !== "object") continue;
      if (!entry.key || typeof entry.key !== "string") continue;
      if (seen.has(entry.key)) continue;
      const lastUsed = Number(entry.lastUsed || entry.updatedAt || entry.createdAt || 0);
      if (lastUsed > 0 && now - lastUsed > DOM_SKILL_MEMORY_TTL_MS) continue;
      seen.add(entry.key);
      normalized.push(entry);
    }
    normalized.sort((a, b) => Number(b.lastUsed || 0) - Number(a.lastUsed || 0));
    return normalized.slice(0, DOM_SKILL_MEMORY_MAX);
  }
  __name(pruneDomSkillMemory, "pruneDomSkillMemory");
  async function readDomSkillMemory() {
    if (Array.isArray(domSkillMemoryCache)) return domSkillMemoryCache;
    if (domSkillMemoryLoadPromise) return domSkillMemoryLoadPromise;
    domSkillMemoryLoadPromise = new Promise((resolve) => {
      try {
        chrome.storage.local.get([DOM_SKILL_MEMORY_KEY], (result) => {
          if (chrome.runtime?.lastError) {
            domSkillMemoryCache = [];
            domSkillMemoryLoadPromise = null;
            resolve(domSkillMemoryCache);
            return;
          }
          const raw = result?.[DOM_SKILL_MEMORY_KEY];
          domSkillMemoryCache = pruneDomSkillMemory(raw);
          domSkillMemoryLoadPromise = null;
          resolve(domSkillMemoryCache);
        });
      } catch (_err) {
        domSkillMemoryCache = [];
        domSkillMemoryLoadPromise = null;
        resolve(domSkillMemoryCache);
      }
    });
    return domSkillMemoryLoadPromise;
  }
  __name(readDomSkillMemory, "readDomSkillMemory");
  async function writeDomSkillMemory(entries) {
    const next = pruneDomSkillMemory(entries);
    domSkillMemoryCache = next;
    try {
      await new Promise((resolve) => {
        chrome.storage.local.set({ [DOM_SKILL_MEMORY_KEY]: next }, () => resolve());
      });
    } catch (_err) {
    }
  }
  __name(writeDomSkillMemory, "writeDomSkillMemory");
  function extractTextSignature(element) {
    const text = String(element?.innerText || element?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
    return text;
  }
  __name(extractTextSignature, "extractTextSignature");
  function getElementHints(element) {
    if (!(element instanceof Element)) return null;
    return {
      tag: String(element.tagName || "").toLowerCase(),
      id: String(element.getAttribute("id") || ""),
      name: String(element.getAttribute("name") || ""),
      placeholder: String(element.getAttribute("placeholder") || ""),
      ariaLabel: String(element.getAttribute("aria-label") || ""),
      role: String(element.getAttribute("role") || ""),
      dataTestId: String(element.getAttribute("data-testid") || element.getAttribute("data-test-id") || ""),
      labelText: String(findLabelText(element) || "").replace(/\s+/g, " ").trim().slice(0, 120),
      text: extractTextSignature(element)
    };
  }
  __name(getElementHints, "getElementHints");
  function scoreSkillEntry(entry, scope, intent, targetNorm) {
    if (!entry || entry.intent !== intent) return 0;
    let score = 0;
    if (entry.host === scope.host) score += 5;
    if (entry.pathPrefix === scope.pathPrefix) score += 2;
    const entryTarget = String(entry.target || "");
    if (entryTarget && targetNorm) {
      if (entryTarget === targetNorm) score += 8;
      const entryTokens = new Set(tokenize(entryTarget));
      const targetTokens = tokenize(targetNorm);
      if (targetTokens.length > 0) {
        let overlap = 0;
        for (const token of targetTokens) {
          if (entryTokens.has(token)) overlap += 1;
        }
        score += overlap;
      }
    }
    score += Math.min(3, Number(entry.successCount || 0));
    return score;
  }
  __name(scoreSkillEntry, "scoreSkillEntry");
  function findInputFromLabelText(labelText) {
    const norm = normalizeText(labelText);
    if (!norm) return null;
    const labels = Array.from(document.querySelectorAll("label"));
    for (const label of labels) {
      const text = normalizeText(label.textContent || "");
      if (!text || !text.includes(norm)) continue;
      const htmlFor = String(label.getAttribute("for") || "");
      if (htmlFor) {
        const byFor = document.getElementById(htmlFor);
        if (byFor && isUsableField(byFor)) return byFor;
      }
      const nested = label.querySelector('input, textarea, select, [contenteditable="true"]');
      if (nested && isUsableField(nested)) return nested;
      const parentInput = label.parentElement?.querySelector?.('input, textarea, select, [contenteditable="true"]');
      if (parentInput && isUsableField(parentInput)) return parentInput;
    }
    return null;
  }
  __name(findInputFromLabelText, "findInputFromLabelText");
  function resolveElementFromSkillHints(hints, intent) {
    if (!hints || typeof hints !== "object") return null;
    const byId = hints.id ? document.getElementById(hints.id) : null;
    if (byId && isUsableField(byId)) return byId;
    const selectorCandidates = [];
    if (hints.name) selectorCandidates.push(`[name="${escapeCssValue(hints.name)}"]`);
    if (hints.ariaLabel) selectorCandidates.push(`[aria-label="${escapeCssValue(hints.ariaLabel)}"]`);
    if (hints.dataTestId) {
      selectorCandidates.push(`[data-testid="${escapeCssValue(hints.dataTestId)}"]`);
      selectorCandidates.push(`[data-test-id="${escapeCssValue(hints.dataTestId)}"]`);
    }
    if (hints.placeholder) selectorCandidates.push(`[placeholder="${escapeCssValue(hints.placeholder)}"]`);
    for (const selector of selectorCandidates) {
      const found = querySelectorDeep(selector);
      if (found && isUsableField(found)) return found;
    }
    if (hints.labelText) {
      const byLabel = findInputFromLabelText(hints.labelText);
      if (byLabel) return byLabel;
    }
    if (intent === "click" && hints.text) {
      const clickables = Array.from(document.querySelectorAll('button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]'));
      const targetNorm = normalizeText(hints.text);
      for (const node of clickables) {
        if (!isUsableField(node)) continue;
        const nodeText = normalizeText(node.textContent || node.getAttribute("value") || "");
        if (nodeText && (nodeText === targetNorm || nodeText.includes(targetNorm) || targetNorm.includes(nodeText))) {
          return node;
        }
      }
    }
    return null;
  }
  __name(resolveElementFromSkillHints, "resolveElementFromSkillHints");
  async function matchDomSkill(intent, target) {
    const targetNorm = normalizeSkillTarget(target);
    if (!intent || !targetNorm) return null;
    const scope = getDomSkillScope();
    const memory = await readDomSkillMemory();
    if (!Array.isArray(memory) || memory.length === 0) return null;
    const ranked = memory.map((entry) => ({ entry, score: scoreSkillEntry(entry, scope, intent, targetNorm) })).filter((item) => item.score >= 10).sort((a, b) => b.score - a.score);
    for (const item of ranked) {
      const element = resolveElementFromSkillHints(item.entry.hints, intent);
      if (!element) continue;
      return { entry: item.entry, element };
    }
    return null;
  }
  __name(matchDomSkill, "matchDomSkill");
  async function learnDomSkill(intent, target, element) {
    const targetNorm = normalizeSkillTarget(target);
    if (!intent || !targetNorm || !(element instanceof Element)) return;
    const scope = getDomSkillScope();
    const hints = getElementHints(element);
    if (!hints) return;
    const key = `${scope.host}|${scope.pathPrefix}|${intent}|${targetNorm}`;
    const now = Date.now();
    const memory = await readDomSkillMemory();
    const next = Array.isArray(memory) ? [...memory] : [];
    const idx = next.findIndex((entry) => entry?.key === key);
    if (idx >= 0) {
      const prev = next[idx];
      next[idx] = {
        ...prev,
        hints: { ...prev.hints, ...hints },
        target: targetNorm,
        successCount: Number(prev.successCount || 0) + 1,
        lastUsed: now,
        updatedAt: now
      };
    } else {
      next.push({
        key,
        host: scope.host,
        pathPrefix: scope.pathPrefix,
        intent,
        target: targetNorm,
        hints,
        successCount: 1,
        createdAt: now,
        updatedAt: now,
        lastUsed: now
      });
    }
    await writeDomSkillMemory(next);
  }
  __name(learnDomSkill, "learnDomSkill");
  function normalizeNaturalCommandKey(value) {
    return String(value || "").toLowerCase().replace(/\bconfirmaton\b/g, "confirmation").replace(/\bconfirmtion\b/g, "confirmation").replace(/\bconfrimation\b/g, "confirmation").replace(/\bconfimation\b/g, "confirmation").replace(/\badress\b/g, "address").replace(/\bemial\b/g, "email").replace(/[^a-z0-9\s_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
  }
  __name(normalizeNaturalCommandKey, "normalizeNaturalCommandKey");
  function pruneNaturalCommandMemory(entries) {
    const now = Date.now();
    const byKey = /* @__PURE__ */ new Map();
    for (const raw of Array.isArray(entries) ? entries : []) {
      if (!raw || typeof raw !== "object") continue;
      const key = String(raw.key || "").trim();
      if (!key) continue;
      const lastUsed = Number(raw.lastUsed || raw.updatedAt || raw.createdAt || 0);
      if (!Number.isFinite(lastUsed) || lastUsed <= 0) continue;
      if (now - lastUsed > NATURAL_COMMAND_MEMORY_TTL_MS) continue;
      byKey.set(key, {
        key,
        host: String(raw.host || "").trim().toLowerCase(),
        pathPrefix: String(raw.pathPrefix || "/").trim() || "/",
        command: String(raw.command || "").trim(),
        canonicalCommand: String(raw.canonicalCommand || "").trim(),
        successCount: Math.max(1, Math.floor(Number(raw.successCount || 1))),
        repairedCount: Math.max(0, Math.floor(Number(raw.repairedCount || 0))),
        lastUsed
      });
    }
    return Array.from(byKey.values()).sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0)).slice(0, NATURAL_COMMAND_MEMORY_MAX);
  }
  __name(pruneNaturalCommandMemory, "pruneNaturalCommandMemory");
  async function readNaturalCommandMemory() {
    if (Array.isArray(naturalCommandMemoryCache)) return naturalCommandMemoryCache;
    if (naturalCommandMemoryLoadPromise) return naturalCommandMemoryLoadPromise;
    naturalCommandMemoryLoadPromise = new Promise((resolve) => {
      try {
        chrome.storage.local.get([NATURAL_COMMAND_MEMORY_KEY], (result) => {
          if (chrome.runtime?.lastError) {
            naturalCommandMemoryCache = [];
            naturalCommandMemoryLoadPromise = null;
            resolve(naturalCommandMemoryCache);
            return;
          }
          naturalCommandMemoryCache = pruneNaturalCommandMemory(result?.[NATURAL_COMMAND_MEMORY_KEY]);
          naturalCommandMemoryLoadPromise = null;
          resolve(naturalCommandMemoryCache);
        });
      } catch (_err) {
        naturalCommandMemoryCache = [];
        naturalCommandMemoryLoadPromise = null;
        resolve(naturalCommandMemoryCache);
      }
    });
    return naturalCommandMemoryLoadPromise;
  }
  __name(readNaturalCommandMemory, "readNaturalCommandMemory");
  async function writeNaturalCommandMemory(entries) {
    const next = pruneNaturalCommandMemory(entries);
    naturalCommandMemoryCache = next;
    try {
      await new Promise((resolve) => {
        chrome.storage.local.set({ [NATURAL_COMMAND_MEMORY_KEY]: next }, () => resolve());
      });
    } catch (_err) {
    }
  }
  __name(writeNaturalCommandMemory, "writeNaturalCommandMemory");
  async function rememberNaturalCommand(command, canonicalCommand, repaired = false) {
    const commandNorm = normalizeNaturalCommandKey(command);
    const canonicalNorm = normalizeNaturalCommandKey(canonicalCommand || command);
    if (!commandNorm || !canonicalNorm) return;
    const scope = getDomSkillScope();
    const key = `${scope.host}|${scope.pathPrefix}|${commandNorm}`;
    const now = Date.now();
    const memory = await readNaturalCommandMemory();
    const next = Array.isArray(memory) ? [...memory] : [];
    const idx = next.findIndex((entry) => entry?.key === key);
    if (idx >= 0) {
      const prev = next[idx];
      next[idx] = {
        ...prev,
        canonicalCommand: canonicalNorm,
        successCount: Number(prev.successCount || 0) + 1,
        repairedCount: Number(prev.repairedCount || 0) + (repaired ? 1 : 0),
        lastUsed: now
      };
    } else {
      next.push({
        key,
        host: scope.host,
        pathPrefix: scope.pathPrefix,
        command: commandNorm,
        canonicalCommand: canonicalNorm,
        successCount: 1,
        repairedCount: repaired ? 1 : 0,
        createdAt: now,
        updatedAt: now,
        lastUsed: now
      });
    }
    await writeNaturalCommandMemory(next);
  }
  __name(rememberNaturalCommand, "rememberNaturalCommand");
  async function matchNaturalCommandMemory(command) {
    const commandNorm = normalizeNaturalCommandKey(command);
    if (!commandNorm) return null;
    const scope = getDomSkillScope();
    const memory = await readNaturalCommandMemory();
    if (!Array.isArray(memory) || memory.length === 0) return null;
    const ranked = memory.map((entry) => {
      if (!entry || entry.command !== commandNorm) return null;
      let score = 0;
      if (entry.host === scope.host) score += 5;
      if (entry.pathPrefix === scope.pathPrefix) score += 2;
      score += Math.min(3, Number(entry.successCount || 0));
      return { entry, score };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    return ranked[0]?.entry || null;
  }
  __name(matchNaturalCommandMemory, "matchNaturalCommandMemory");
  function buildNaturalCommandCandidates(command) {
    const raw = String(command || "").trim();
    const candidates = [];
    const seen = /* @__PURE__ */ new Set();
    const push = /* @__PURE__ */ __name((value) => {
      const text = String(value || "").trim();
      if (!text) return;
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(text);
    }, "push");
    const normalized = normalizeNaturalCommandKey(raw);
    push(raw);
    push(normalized);
    let healed = raw;
    healed = healed.replace(/\bconfirmaton\b/gi, "confirmation").replace(/\bconfirmtion\b/gi, "confirmation").replace(/\bconfrimation\b/gi, "confirmation").replace(/\bconfimation\b/gi, "confirmation");
    push(healed);
    const matchFillCopy = healed.match(/\bfill(?:\s+in)?\s+(.+?)\s+copy\s+from\s+(.+)$/i);
    if (matchFillCopy) {
      push(`fill ${matchFillCopy[1]} from ${matchFillCopy[2]}`);
    }
    const matchCopyInto = healed.match(/\bcopy\s+(.+?)\s+(?:into|to)\s+(.+)$/i);
    if (matchCopyInto) {
      push(`fill ${matchCopyInto[2]} from ${matchCopyInto[1]}`);
    }
    const matchCopyFrom = healed.match(/\bcopy\s+from\s+(.+?)\s+(?:into|to)\s+(.+)$/i);
    if (matchCopyFrom) {
      push(`fill ${matchCopyFrom[2]} from ${matchCopyFrom[1]}`);
    }
    return candidates;
  }
  __name(buildNaturalCommandCandidates, "buildNaturalCommandCandidates");
  async function resolveNaturalCommand(command) {
    if (!window.BilgeCortex && !window.__bilge_cortex_loaded) {
      return { error: "Cortex module not loaded", parsed: null, executable: null };
    }
    const getCortexContext = /* @__PURE__ */ __name(() => {
      const runtime = window.__bilge_runtime || null;
      const ctx = {};
      if (runtime?.cursor && Number.isFinite(runtime.cursor.x) && Number.isFinite(runtime.cursor.y)) {
        ctx.cursor = { x: runtime.cursor.x, y: runtime.cursor.y };
      }
      if (runtime?.lastElement instanceof Element) {
        ctx.lastElement = runtime.lastElement;
      }
      return ctx;
    }, "getCortexContext");
    const tryParse = /* @__PURE__ */ __name((candidate) => {
      const parsed = window.BilgeCortex.parseCommand(candidate, getCortexContext());
      if (!parsed) return null;
      const executable = window.BilgeCortex.toExecutableAction(parsed);
      if (!executable) return null;
      return { parsed, executable, canonicalCommand: String(parsed.raw || candidate || "").trim() || String(candidate || "").trim() };
    }, "tryParse");
    const direct = tryParse(command);
    if (direct) return { ...direct, repaired: false, commandMemoryHit: false, recoveryPath: "direct" };
    const remembered = await matchNaturalCommandMemory(command);
    if (remembered?.canonicalCommand) {
      const fromMemory = tryParse(remembered.canonicalCommand);
      if (fromMemory) {
        return { ...fromMemory, repaired: true, commandMemoryHit: true, recoveryPath: "memory" };
      }
    }
    const candidates = buildNaturalCommandCandidates(command);
    for (const candidate of candidates) {
      const recovered = tryParse(candidate);
      if (recovered) {
        return { ...recovered, repaired: true, commandMemoryHit: false, recoveryPath: "rewrite" };
      }
    }
    return { error: "Could not understand command after recovery attempts", parsed: null, executable: null };
  }
  __name(resolveNaturalCommand, "resolveNaturalCommand");
  async function runNaturalCommandAutoDebug(command) {
    const text = normalizeNaturalCommandKey(command);
    if (!text) return null;
    let target = "";
    let source = "";
    let match = text.match(/\bfill(?:\s+in)?\s+(.+?)\s+(?:copy\s+from|from|using)\s+(.+)$/i);
    if (match) {
      target = String(match[1] || "").trim();
      source = String(match[2] || "").trim();
    } else {
      match = text.match(/\bcopy\s+(.+?)\s+(?:into|to)\s+(.+)$/i);
      if (match) {
        source = String(match[1] || "").trim();
        target = String(match[2] || "").trim();
      }
    }
    if (!target || !source) return null;
    const sourceElement = findElementByHeuristic({ label: source, field: source, name: source, placeholder: source }, null);
    const targetElement = findElementByHeuristic({ label: target, field: target, name: target, placeholder: target }, null);
    if (!sourceElement || !targetElement) return null;
    const sourceTag = String(sourceElement.tagName || "").toUpperCase();
    let sourceValue = "";
    if (sourceTag === "INPUT" || sourceTag === "TEXTAREA" || sourceTag === "SELECT") {
      sourceValue = String(sourceElement.value || "");
    } else if (sourceElement.isContentEditable) {
      sourceValue = String(sourceElement.textContent || "");
    }
    if (!sourceValue) {
      throw new Error(`Source field "${source}" is empty`);
    }
    targetElement.focus();
    if (targetElement.tagName === "INPUT" || targetElement.tagName === "TEXTAREA") {
      setNativeValue(targetElement, sourceValue);
      dispatchInputEvents(targetElement);
    } else if (targetElement.isContentEditable) {
      targetElement.textContent = sourceValue;
      dispatchInputEvents(targetElement);
    } else {
      return null;
    }
    await Promise.all([
      learnDomSkill("type", source, sourceElement),
      learnDomSkill("type", target, targetElement)
    ]);
    return {
      status: "typed",
      target,
      copiedFrom: source,
      value: sourceValue.slice(0, 50),
      autoDebug: true,
      debugMode: "script-recovery"
    };
  }
  __name(runNaturalCommandAutoDebug, "runNaturalCommandAutoDebug");
  function findElementByHeuristic(request, selector) {
    const tokenSet = /* @__PURE__ */ new Set();
    const rawHints = [request.field, request.name, request.label, request.placeholder];
    let preferredTag = "";
    if (selector) {
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
    const tokens = Array.from(expanded);
    if (!tokens.length) return null;
    const candidates = Array.from(
      document.querySelectorAll('input, textarea, select, button, [contenteditable="true"], [role="textbox"], [role="button"], a')
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
        best = { element, score };
      }
    }
    if (!best || best.score <= 0) return null;
    return best.element;
  }
  __name(findElementByHeuristic, "findElementByHeuristic");
  window.__bilgeMatchDomSkill = matchDomSkill;
  window.__bilgeFindElementByHeuristic = findElementByHeuristic;
  window.__bilgeLearnDomSkill = learnDomSkill;
  window.__bilgeIsUsableField = isUsableField;
  window.__bilgeQuerySelectorDeep = querySelectorDeep;
  function elementSummary(element) {
    const tag = element?.tagName ? String(element.tagName).toLowerCase() : "";
    const id = element?.id ? String(element.id) : "";
    let classes = "";
    try {
      classes = element?.classList ? Array.from(element.classList).slice(0, 12).join(" ") : "";
    } catch (_err) {
    }
    const text = truncate(element?.innerText || element?.textContent || "", 240);
    const attrs = {};
    try {
      const attributes = element?.attributes ? Array.from(element.attributes) : [];
      for (let i = 0; i < attributes.length && i < 16; i++) {
        const attr = attributes[i];
        if (!attr?.name) continue;
        attrs[String(attr.name)] = truncate(attr.value, 200);
      }
    } catch (_err) {
    }
    return { _type: "Element", tag, id, classes, text, attrs };
  }
  __name(elementSummary, "elementSummary");
  function jsonSafe(value, seen = /* @__PURE__ */ new WeakSet(), depth = 0) {
    const MAX_DEPTH = 5;
    const MAX_ARRAY_ITEMS = 200;
    const MAX_KEYS = 200;
    if (value === null) return null;
    const t = typeof value;
    if (t === "string") return truncate(value, 8e3);
    if (t === "number" || t === "boolean") return value;
    if (t === "bigint") return value.toString();
    if (t === "undefined") return null;
    if (t === "symbol") return value.toString();
    if (t === "function") return "[Function]";
    if (value instanceof Error) {
      return {
        _type: "Error",
        name: String(value.name || "Error"),
        message: String(value.message || ""),
        stack: truncate(String(value.stack || ""), 4e3)
      };
    }
    if (value instanceof Date) return value.toISOString();
    const isElement = value && typeof value === "object" && value.nodeType === 1 && typeof value.tagName === "string";
    if (isElement) return elementSummary(value);
    if (!value || typeof value !== "object") return String(value);
    if (depth >= MAX_DEPTH) return "[MaxDepth]";
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    if (Array.isArray(value)) {
      return value.slice(0, MAX_ARRAY_ITEMS).map((v) => jsonSafe(v, seen, depth + 1));
    }
    try {
      const tagName = Object.prototype.toString.call(value);
      if (tagName === "[object NodeList]" || tagName === "[object HTMLCollection]") {
        const arr = Array.from(value);
        return arr.slice(0, MAX_ARRAY_ITEMS).map((v) => jsonSafe(v, seen, depth + 1));
      }
    } catch (_err) {
    }
    if (value instanceof Map) {
      const entries = [];
      let i = 0;
      for (const [k, v] of value.entries()) {
        entries.push([jsonSafe(k, seen, depth + 1), jsonSafe(v, seen, depth + 1)]);
        i++;
        if (i >= 100) break;
      }
      return { _type: "Map", entries };
    }
    if (value instanceof Set) {
      const values = [];
      let i = 0;
      for (const v of value.values()) {
        values.push(jsonSafe(v, seen, depth + 1));
        i++;
        if (i >= 200) break;
      }
      return { _type: "Set", values };
    }
    const out = {};
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length && i < MAX_KEYS; i++) {
      const k = keys[i];
      try {
        out[k] = jsonSafe(value[k], seen, depth + 1);
      } catch (_err) {
        out[k] = "[Unreadable]";
      }
    }
    return out;
  }
  __name(jsonSafe, "jsonSafe");
  async function executeUserJavaScript(code, timeoutMs) {
    const AsyncFunction = Object.getPrototypeOf(async function() {
    }).constructor;
    const fn = new AsyncFunction(
      "querySelectorDeep",
      "truncate",
      "elementSummary",
      '"use strict";\n' + String(code || "")
    );
    const timeout = Math.max(0, Math.min(Number(timeoutMs) || DEFAULT_EXECUTE_JS_TIMEOUT_MS, 3e4));
    const task = Promise.resolve().then(() => fn(querySelectorDeep, truncate, elementSummary));
    if (!timeout) return await task;
    return await Promise.race([
      task,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout))
    ]);
  }
  __name(executeUserJavaScript, "executeUserJavaScript");
  async function executeNaturalAction(action, parsed) {
    if (!action || !action.type) {
      throw new Error("Invalid action: missing type");
    }
    switch (action.type) {
      case "scroll":
        return executeScrollAction(action, parsed);
      case "click":
        return executeClickAction(action, parsed);
      case "type":
        return executeTypeAction(action, parsed);
      case "wait":
        return executeWaitAction(action);
      case "navigate":
        return executeNavigateAction(action);
      case "script":
        return executeScriptAction(action);
      default:
        throw new Error(`Unsupported action type: ${action.type}`);
    }
  }
  __name(executeNaturalAction, "executeNaturalAction");
  async function executeScrollAction(action, parsed) {
    const direction = parsed?.direction || "down";
    if (action.scrollTo) {
      if (action.scrollTo.top === 0) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (action.scrollTo.top === "max") {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      }
      return { status: "scrolled", direction, type: "absolute" };
    }
    const scrollOptions = { behavior: "smooth" };
    if (action.horizontal !== void 0) {
      scrollOptions.left = action.horizontal;
      scrollOptions.top = 0;
    } else {
      scrollOptions.top = action.amount || 300;
      scrollOptions.left = 0;
    }
    window.scrollBy(scrollOptions);
    return { status: "scrolled", direction, amount: action.amount || action.horizontal, type: "relative" };
  }
  __name(executeScrollAction, "executeScrollAction");
  async function executeClickAction(action, parsed) {
    if (action.useContext) {
      const runtime = window.__bilge_runtime || null;
      const pickClickable = /* @__PURE__ */ __name((el) => {
        if (!(el instanceof Element)) return null;
        const tag = String(el.tagName || "").toUpperCase();
        if (!tag || tag === "HTML" || tag === "BODY") return null;
        if (!el.isConnected) return null;
        const interactive = el.closest?.(
          'button, a[href], input[type="button"], input[type="submit"], input[type="reset"], [role="button"], [role="link"]'
        );
        return interactive || el;
      }, "pickClickable");
      const isVisibleSafe = /* @__PURE__ */ __name((el) => {
        try {
          return isElementVisible(el);
        } catch (_err) {
          return true;
        }
      }, "isVisibleSafe");
      const candidates = [];
      const cursor = runtime?.cursor;
      if (cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y) && (cursor.x !== 0 || cursor.y !== 0)) {
        const fromPoint = document.elementFromPoint(cursor.x, cursor.y);
        const picked = pickClickable(fromPoint);
        if (picked) candidates.push({ el: picked, reason: "cursor" });
      }
      const lastEl = runtime?.lastElement;
      const lastPicked = pickClickable(lastEl);
      if (lastPicked) candidates.push({ el: lastPicked, reason: "last-element" });
      const activeEl = document.activeElement;
      const activePicked = pickClickable(activeEl);
      if (activePicked) candidates.push({ el: activePicked, reason: "active-element" });
      for (const candidate of candidates) {
        const el = candidate?.el;
        if (!el || !el.isConnected) continue;
        if (!isVisibleSafe(el)) continue;
        try {
          el.scrollIntoView({ behavior: "auto", block: "center" });
        } catch (_err) {
        }
        el.click();
        return { status: "clicked", target: "deictic", context: candidate.reason, tag: el.tagName };
      }
      throw new Error(
        'No element in context for deictic click reference. Hover the target (or focus it) and retry "click it".'
      );
    }
    const target = action.label || action.field || action.name;
    if (!target) {
      throw new Error("No target specified for click");
    }
    let memoryHit = false;
    let element = null;
    const memoryMatch = await matchDomSkill("click", target);
    if (memoryMatch?.element) {
      element = memoryMatch.element;
      memoryHit = true;
    }
    if (!element) {
      element = findElementByHeuristic({ label: target, field: target, name: target }, null);
    }
    if (!element) {
      throw new Error(`Could not find element matching: "${target}"`);
    }
    try {
      element.scrollIntoView({ behavior: "auto", block: "center" });
    } catch (_err) {
    }
    element.click();
    await learnDomSkill("click", target, element);
    return { status: "clicked", target, tag: element.tagName, memoryHit };
  }
  __name(executeClickAction, "executeClickAction");
  async function executeTypeAction(action, parsed) {
    let value = action.value ?? "";
    const target = action.label || action.field || action.name || parsed?.target || "";
    const copyFrom = String(action.copyFrom || parsed?.copyFrom || "").trim();
    let memoryHit = false;
    const resolveFieldElement = /* @__PURE__ */ __name(async (hint) => {
      const normalizedHint = String(hint || "").trim();
      if (!normalizedHint) {
        throw new Error("Missing field hint");
      }
      let resolved = null;
      const memoryMatch = await matchDomSkill("type", normalizedHint);
      if (memoryMatch?.element) {
        resolved = memoryMatch.element;
        memoryHit = true;
      }
      if (!resolved) {
        resolved = findElementByHeuristic(
          { label: normalizedHint, field: normalizedHint, name: normalizedHint, placeholder: normalizedHint },
          null
        );
      }
      if (!resolved) {
        throw new Error(`Could not find input field matching: "${normalizedHint}"`);
      }
      return resolved;
    }, "resolveFieldElement");
    const readFieldValue = /* @__PURE__ */ __name((element2) => {
      if (!element2) return "";
      const tag = String(element2.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return String(element2.value ?? "");
      }
      if (element2.isContentEditable) {
        return String(element2.textContent ?? "");
      }
      return "";
    }, "readFieldValue");
    if (copyFrom) {
      const sourceElement = await resolveFieldElement(copyFrom);
      const sourceValue = readFieldValue(sourceElement);
      if (!sourceValue) {
        throw new Error(`Source field "${copyFrom}" is empty`);
      }
      value = sourceValue;
    }
    let element = null;
    if (target) {
      element = await resolveFieldElement(target);
    } else {
      element = document.activeElement;
      const tag = element?.tagName?.toUpperCase();
      if (tag !== "INPUT" && tag !== "TEXTAREA" && !element?.isContentEditable) {
        const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea');
        for (const input of inputs) {
          if (isUsableField(input)) {
            element = input;
            break;
          }
        }
      }
    }
    if (!element || element.tagName !== "INPUT" && element.tagName !== "TEXTAREA" && !element.isContentEditable) {
      throw new Error("No input field found to type into");
    }
    const finalValue = String(value ?? "");
    element.focus();
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      setNativeValue(element, finalValue);
      dispatchInputEvents(element);
    } else if (element.isContentEditable) {
      element.textContent = finalValue;
      dispatchInputEvents(element);
    }
    if (target) {
      await learnDomSkill("type", target, element);
    }
    return {
      status: "typed",
      value: finalValue.slice(0, 50),
      target: target || null,
      copiedFrom: copyFrom || null,
      memoryHit
    };
  }
  __name(executeTypeAction, "executeTypeAction");
  async function executeWaitAction(action) {
    const duration = action.duration || 1e3;
    await new Promise((resolve) => setTimeout(resolve, duration));
    return { status: "waited", duration };
  }
  __name(executeWaitAction, "executeWaitAction");
  async function executeNavigateAction(action) {
    if (action.code) {
      const AsyncFunction = Object.getPrototypeOf(async function() {
      }).constructor;
      const fn = new AsyncFunction(action.code);
      await fn();
    }
    return { status: "navigated", action: action.action };
  }
  __name(executeNavigateAction, "executeNavigateAction");
  async function executeScriptAction(action) {
    const code = action.code || "";
    if (!code) {
      throw new Error("No script code provided");
    }
    const AsyncFunction = Object.getPrototypeOf(async function() {
    }).constructor;
    const fn = new AsyncFunction(code);
    const result = await fn();
    return { status: "executed", result };
  }
  __name(executeScriptAction, "executeScriptAction");
  function explainUnrecognizedNaturalCommand(command) {
    const text = String(command || "").trim().toLowerCase();
    if (!text) return "";
    if (/\b(copy\s+from|from)\b/.test(text) && /\b(fill|set|copy)\b/.test(text)) {
      return "Try: `fill <target field> from <source field>` or `copy <source field> into <target field>`.";
    }
    if (/\b(fill(?:\s+in)?|set)\b/.test(text) && !/\b(with|as|into|in|to)\b/.test(text)) {
      return "Command is missing a value. Try: `write <value> into <field>` or `fill <field> with <value>`.";
    }
    if (/\b(write|type|enter|input)\b/.test(text) && !/\b(into|in|to)\b/.test(text)) {
      return "Command is missing a target field. Try: `write <value> into <field>`.";
    }
    return "";
  }
  __name(explainUnrecognizedNaturalCommand, "explainUnrecognizedNaturalCommand");
  async function executeResilientNaturalCommand(command) {
    const startTime = Date.now();
    const result = {
      ok: false,
      protocol: "natural-command-v3",
      command,
      executor: null,
      durationMs: 0
    };
    contentLogger.info("Executing resilient natural command", { command });
    if (window.BilgeCortex?.parseCommand || window.__bilge_cortex_loaded) {
      try {
        const resolved = await resolveNaturalCommand(command);
        if (resolved && !resolved.error && resolved.executable) {
          const execResult = await executeNaturalAction(resolved.executable, resolved.parsed);
          if (execResult) {
            if (resolved.repaired) {
              rememberNaturalCommand(command, resolved.canonicalCommand, resolved.repaired).catch(() => {
              });
            }
            result.ok = true;
            result.executor = "cortex";
            result.parsed = resolved.parsed;
            result.result = execResult;
            result.durationMs = Date.now() - startTime;
            return result;
          }
        }
      } catch (e) {
        contentLogger.warn("Cortex execution failed, trying fallbacks", { error: e.message });
      }
    }
    if (window.__bilge_execution_engine) {
      try {
        const engine = window.__bilge_execution_engine;
        const execResult = await engine.run(command);
        if (execResult && execResult.ok) {
          result.ok = true;
          result.executor = "dom_engine";
          result.result = execResult;
          result.durationMs = Date.now() - startTime;
          return result;
        }
      } catch (e) {
        contentLogger.warn("DOM Engine execution failed, trying final fallback", { error: e.message });
      }
    }
    try {
      const directResult = await executeDirectPattern(command);
      if (directResult && directResult.ok) {
        result.ok = true;
        result.executor = "direct_pattern";
        result.result = directResult;
        result.durationMs = Date.now() - startTime;
        return result;
      }
    } catch (e) {
      contentLogger.warn("Direct pattern execution failed", { error: e.message });
    }
    result.error = "All execution strategies failed";
    result.durationMs = Date.now() - startTime;
    result.attempted = ["cortex", "dom_engine", "direct_pattern"];
    return result;
  }
  __name(executeResilientNaturalCommand, "executeResilientNaturalCommand");
  async function executeDirectPattern(command) {
    const raw = String(command || "");
    const cmd = raw.toLowerCase().trim();
    const state = window.__bilge_direct_fill_form_state = window.__bilge_direct_fill_form_state || { stepMode: false, noSubmit: false, updatedAt: 0 };
    const stepRequested = /\b(one\s+field\s+at\s+a\s+time|field\s+by\s+field|step\s+by\s+step|one\s+by\s+one|one\s+at\s+a\s+time)\b/i.test(raw);
    const noSubmitRequested = /\b(do\s+not|don't|dont|no)\s+submit\b|\bwithout\s+submitting\b|\bno\s+submission\b/i.test(raw);
    if (stepRequested) state.stepMode = true;
    if (noSubmitRequested) state.noSubmit = true;
    state.updatedAt = Date.now();
    const wantsNextField = /^(?:continue|next|proceed)(?:\s+(?:field|input))?\s*$/i.test(cmd) || /\bnext\s+field\b/i.test(raw);
    if (state.stepMode && wantsNextField) {
      return await fillVisibleFormFields({ step: true });
    }
    const looksLikeFillForm = cmd.match(/^(fill|complete|populate|yes|do\s+it|please|continue|proceed)\s*(form|fields?|all|them|in)?(\s+now)?$/i) || cmd.match(/^(yes\s+)?fill\s+them\s+in$/i) || cmd.match(/^go\s+ahead$/i) || /\b(fill|complete|populate)\b/i.test(raw) && /\b(form|fields?)\b/i.test(raw);
    if (looksLikeFillForm) {
      const wantsAll = /\b(all|everything)\b/i.test(raw) && /\b(fields?|form)\b/i.test(raw) && !stepRequested;
      if (wantsAll) state.stepMode = false;
      return await fillVisibleFormFields({ step: !!state.stepMode });
    }
    const fillMatch = cmd.match(/^(fill|type|enter)\s+(?:in\s+)?["']?(.+?)["']?\s+(?:with|as|to|=)\s+["']?(.+?)["']?$/i);
    if (fillMatch) {
      const [, , fieldHint, value] = fillMatch;
      return await fillFieldByHint(fieldHint, value);
    }
    const clickMatch = cmd.match(/^(click|press|tap|select|choose)\s+(?:on\s+)?["']?(.+?)["']?$/i);
    if (clickMatch) {
      const [, , targetHint] = clickMatch;
      return await clickByHint(targetHint);
    }
    if (cmd.match(/^(submit|continue|next|proceed|save)/i)) {
      if (state.noSubmit) {
        return { ok: false, error: "Submission blocked (no-submit mode).", blocked: true };
      }
      return await submitCurrentForm();
    }
    return { ok: false, error: "No matching pattern" };
  }
  __name(executeDirectPattern, "executeDirectPattern");
  async function fillVisibleFormFields(options = {}) {
    const opts = options && typeof options === "object" ? options : {};
    const step = !!opts.step;
    const fields = document.querySelectorAll('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
    const results = [];
    let filledOk = 0;
    let eligible = 0;
    let profile = {};
    try {
      const result = await chrome.storage.local.get(["bilge_user_profile"]);
      profile = result.bilge_user_profile || {};
    } catch (e) {
    }
    const samples = {
      email: profile.email || "user@example.com",
      firstName: profile.firstName || "John",
      lastName: profile.lastName || "Doe",
      phone: profile.phone || "555-0100",
      address: profile.address1 || profile.address || "",
      city: profile.city || "",
      state: profile.state || "",
      zip: profile.zipCode || profile.zip || ""
    };
    for (const field of fields) {
      if (!isElementVisible(field)) continue;
      if (field.value && field.value.trim()) continue;
      const semanticType = inferFieldTypeFromHints(field);
      const value = samples[semanticType];
      if (value) {
        eligible += 1;
        try {
          try {
            field.scrollIntoView({ behavior: "smooth", block: "center" });
          } catch (e) {
          }
          try {
            field.focus();
          } catch (e) {
          }
          setNativeValue(field, value);
          dispatchInputEvents(field);
          results.push({ field: getFieldId(field), value, ok: true });
          filledOk += 1;
        } catch (e) {
          results.push({ field: getFieldId(field), error: e.message, ok: false });
        }
        if (step && filledOk >= 1) break;
      }
    }
    let message = "";
    if (filledOk === 0) {
      if (eligible === 0) message = "No eligible empty fields with known profile/sample values were found.";
      else message = "No fields were filled.";
    }
    return { ok: true, filled: filledOk, eligible, step, results, ...message ? { message } : {} };
  }
  __name(fillVisibleFormFields, "fillVisibleFormFields");
  async function fillFieldByHint(hint, value) {
    const target = String(hint || "").trim();
    let element = null;
    let memoryHit = false;
    const memoryMatch = await matchDomSkill("type", target);
    if (memoryMatch?.element) {
      element = memoryMatch.element;
      memoryHit = true;
    }
    if (!element) {
      element = findElementByHeuristic({ label: target, field: target, name: target, placeholder: target }, null);
    }
    if (!element) {
      return { ok: false, error: `Field not found: ${hint}` };
    }
    setNativeValue(element, value);
    dispatchInputEvents(element);
    await learnDomSkill("type", target, element);
    return { ok: true, field: getFieldId(element), value, memoryHit };
  }
  __name(fillFieldByHint, "fillFieldByHint");
  async function clickByHint(hint) {
    const target = String(hint || "").trim();
    let element = null;
    let memoryHit = false;
    const memoryMatch = await matchDomSkill("click", target);
    if (memoryMatch?.element) {
      element = memoryMatch.element;
      memoryHit = true;
    }
    if (!element) {
      element = findElementByHeuristic({ label: target, field: target, name: target, placeholder: target }, null);
    }
    if (!element) {
      return { ok: false, error: `Click target not found: ${hint}` };
    }
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    await new Promise((r) => setTimeout(r, 100));
    element.click();
    await learnDomSkill("click", target, element);
    return { ok: true, clicked: getFieldId(element), memoryHit };
  }
  __name(clickByHint, "clickByHint");
  async function submitCurrentForm() {
    const btn = document.querySelector('button[type="submit"], input[type="submit"]');
    if (btn) {
      btn.click();
      return { ok: true, action: "submit_clicked" };
    }
    const form = document.querySelector("form");
    if (form) {
      form.submit();
      return { ok: true, action: "form_submitted" };
    }
    return { ok: false, error: "No submit button or form found" };
  }
  __name(submitCurrentForm, "submitCurrentForm");
  function inferFieldTypeFromHints(field) {
    const text = (field.name + " " + field.id + " " + field.placeholder).toLowerCase();
    if (text.includes("email")) return "email";
    if (text.includes("first")) return "firstName";
    if (text.includes("last")) return "lastName";
    if (text.includes("phone") || text.includes("tel")) return "phone";
    if (text.includes("zip") || text.includes("post")) return "zip";
    if (text.includes("city")) return "city";
    if (text.includes("state")) return "state";
    if (text.includes("address")) return "address";
    return "unknown";
  }
  __name(inferFieldTypeFromHints, "inferFieldTypeFromHints");
  function isElementVisible(el) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(el).display !== "none";
  }
  __name(isElementVisible, "isElementVisible");
  function getFieldId(el) {
    return el.id || el.name || el.tagName.toLowerCase();
  }
  __name(getFieldId, "getFieldId");
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
      if (!request || typeof request !== "object") {
        sendResponse({ error: "Invalid request payload." });
        return true;
      }
      if (request.type === "__BILGE_PING__") {
        sendResponse({ ok: true });
        return true;
      }
      if (request.type === "GET_PAGE_INFO") {
        contentLogger.info("GET_PAGE_INFO requested");
        const bodyText = document.body ? document.body.innerText : "";
        sendResponse({
          url: window.location.href,
          title: document.title || "",
          description: document.querySelector('meta[name="description"]')?.content || "",
          html: truncate(bodyText, MAX_PAGE_TEXT_CHARS)
          // Text-only summary for context
        });
        return true;
      }
      if (request.type === "EXPLORE_DOM") {
        const selector = request.selector || "body";
        let element = null;
        try {
          element = querySelectorDeep(selector);
        } catch (err) {
          sendResponse(describeRestrictedSelectorError(selector, err));
          return true;
        }
        if (!element) {
          sendResponse({ error: `Selector ${selector} not found.` });
          return true;
        }
        const html = element.outerHTML || "";
        const response = {
          html: truncate(html, MAX_HTML_CHARS),
          url: window.location.href
        };
        if (element.shadowRoot) {
          response.shadow_html = truncate(element.shadowRoot.innerHTML || "", MAX_SHADOW_HTML_CHARS);
        }
        sendResponse(response);
        return true;
      }
      if (request.type === "CLICK_ELEMENT") {
        const selector = request.selector;
        contentLogger.info("CLICK_ELEMENT requested", { selector, field: request.field, name: request.name });
        if (!selector && !request.field && !request.name && !request.label) {
          contentLogger.warn("CLICK_ELEMENT missing selector/hints");
          sendResponse({ error: "Missing selector or heuristic hints (field, name, label)." });
          return true;
        }
        let element = null;
        let matchedBy = "";
        if (selector) {
          try {
            element = querySelectorDeep(selector);
            if (element) matchedBy = "selector";
          } catch (err) {
            contentLogger.warn("Invalid selector for click", { selector, error: err.message });
            if (!request.field && !request.name && !request.label) {
              sendResponse(describeRestrictedSelectorError(selector, err));
              return true;
            }
          }
        }
        if (!element && (request.field || request.name || request.label || request.placeholder)) {
          element = findElementByHeuristic(request, selector);
          if (element) matchedBy = "heuristic";
        }
        if (!element) {
          const hints = [request.field, request.name, request.label].filter(Boolean).join(", ");
          contentLogger.warn("CLICK_ELEMENT element not found", { selector, hints });
          sendResponse({ error: `Element not found. Selector: ${selector || "(none)"}, Hints: ${hints || "(none)"}` });
          return true;
        }
        try {
          element.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
        } catch (_err) {
        }
        try {
          element.click();
          contentLogger.info("CLICK_ELEMENT success", { matchedBy, tag: element.tagName });
          sendResponse({ status: "clicked", matchedBy });
        } catch (err) {
          contentLogger.error("CLICK_ELEMENT failed", { error: err.message });
          sendResponse({ error: `Click failed: ${err.message}` });
        }
        return true;
      }
      if (request.type === "TYPE_TEXT") {
        const selector = request.selector;
        const text = request.text ?? "";
        const textPreview = String(text).slice(0, 50);
        contentLogger.info("TYPE_TEXT requested", { selector, textPreview, field: request.field });
        if (!selector && !request.field && !request.name && !request.label) {
          contentLogger.warn("TYPE_TEXT missing selector/hints");
          sendResponse({ error: "Missing selector or heuristic hints (field, name, label)." });
          return true;
        }
        let element = null;
        let matchedBy = "";
        if (selector) {
          try {
            element = querySelectorDeep(selector);
            if (element) matchedBy = "selector";
          } catch (err) {
            contentLogger.warn("Invalid selector for type", { selector, error: err.message });
            if (!request.field && !request.name && !request.label) {
              sendResponse(describeRestrictedSelectorError(selector, err));
              return true;
            }
          }
        }
        if (!element && (request.field || request.name || request.label || request.placeholder)) {
          element = findElementByHeuristic(request, selector);
          if (element) matchedBy = "heuristic";
        }
        if (!element) {
          const hints = [request.field, request.name, request.label].filter(Boolean).join(", ");
          contentLogger.warn("TYPE_TEXT element not found", { selector, hints });
          sendResponse({ error: `Element not found. Selector: ${selector || "(none)"}, Hints: ${hints || "(none)"}` });
          return true;
        }
        try {
          element.focus();
          const tag = String(element?.tagName || "").toUpperCase();
          if (tag === "INPUT" || tag === "TEXTAREA") {
            setNativeValue(element, text);
            dispatchInputEvents(element);
          } else if (element.isContentEditable) {
            element.textContent = String(text);
            dispatchInputEvents(element);
          } else {
            element.textContent = String(text);
          }
          contentLogger.info("TYPE_TEXT success", { matchedBy, tag: element.tagName });
          sendResponse({ status: "typed", matchedBy });
        } catch (err) {
          contentLogger.error("TYPE_TEXT failed", { error: err.message });
          sendResponse({ error: `Type failed: ${err.message}` });
        }
        return true;
      }
      if (request.type === "EXTRACT_FORM_FIELDS") {
        contentLogger.info("EXTRACT_FORM_FIELDS requested");
        try {
          const formFields = [];
          const allInputs = document.querySelectorAll('input, textarea, select, [contenteditable="true"]');
          let fieldIndex = 0;
          for (const element of allInputs) {
            if (!isUsableField(element)) continue;
            const tag = element.tagName.toLowerCase();
            const type = element.getAttribute("type") || (tag === "textarea" ? "textarea" : tag === "select" ? "select" : "text");
            if (["hidden", "submit", "button", "image", "file", "reset"].includes(type)) continue;
            const id = element.getAttribute("id") || "";
            const name = element.getAttribute("name") || "";
            const placeholder = element.getAttribute("placeholder") || "";
            const autocomplete = element.getAttribute("autocomplete") || "";
            const ariaLabel = element.getAttribute("aria-label") || "";
            const labelText = findLabelText(element);
            let currentValue = "";
            if (element.isContentEditable) {
              currentValue = element.textContent || "";
            } else if ("value" in element) {
              currentValue = element.value || "";
            }
            let selector = "";
            if (id) {
              selector = `#${CSS.escape(id)}`;
            } else if (name) {
              selector = `${tag}[name="${CSS.escape(name)}"]`;
            } else {
              const parent = element.parentElement;
              if (parent) {
                const siblings = Array.from(parent.querySelectorAll(tag));
                const index = siblings.indexOf(element);
                if (index >= 0) {
                  selector = `${tag}:nth-of-type(${index + 1})`;
                }
              }
            }
            formFields.push({
              index: fieldIndex++,
              selector,
              tag,
              type,
              id,
              name,
              placeholder,
              autocomplete,
              ariaLabel,
              label: labelText.trim().slice(0, 200),
              currentValue: currentValue.slice(0, 500),
              isRequired: element.hasAttribute("required") || element.getAttribute("aria-required") === "true"
            });
          }
          contentLogger.info(`EXTRACT_FORM_FIELDS found ${formFields.length} fields`);
          sendResponse({
            fields: formFields,
            pageUrl: window.location.href,
            pageTitle: document.title || ""
          });
        } catch (err) {
          const message = err && err.message ? err.message : String(err || "Unknown error");
          contentLogger.error("EXTRACT_FORM_FIELDS failed", { error: message });
          sendResponse({ error: `Extract form fields failed: ${message}` });
        }
        return true;
      }
      if (request.type === "EXECUTE_JS") {
        const code = String(request.code || "");
        const codePreview = code.slice(0, 80);
        contentLogger.info("EXECUTE_JS requested", { codeLength: code.length, codePreview });
        if (!code.trim()) {
          contentLogger.warn("EXECUTE_JS missing code");
          sendResponse({ error: "Missing code." });
          return true;
        }
        if (code.length > MAX_EXECUTE_JS_CODE_CHARS) {
          contentLogger.warn("EXECUTE_JS code too large", { codeLength: code.length });
          sendResponse({ error: `Code too large (${code.length} chars). Max is ${MAX_EXECUTE_JS_CODE_CHARS}.` });
          return true;
        }
        const timeoutMs = request.timeout_ms;
        Promise.resolve().then(() => executeUserJavaScript(code, timeoutMs)).then((result) => {
          const safe = jsonSafe(result);
          let json = "";
          try {
            json = JSON.stringify(safe);
          } catch (_err) {
            json = "";
          }
          if (json) json = truncate(json, MAX_EXECUTE_JS_RESULT_CHARS);
          contentLogger.info("EXECUTE_JS success", { resultLength: json?.length || 0 });
          sendResponse({ ok: true, result: safe, json });
        }).catch((err) => {
          const message = err && err.message ? String(err.message) : String(err || "Unknown error");
          contentLogger.error("EXECUTE_JS failed", { error: message });
          sendResponse({ error: `Execute JS failed: ${message}` });
        });
        return true;
      }
      if (request.type === "CANCEL_CURRENT_ACTION") {
        contentLogger.info("CANCEL_CURRENT_ACTION requested");
        if (window.__bilge_runtime) {
          window.__bilge_runtime.updateHighlight(null);
        }
        sendResponse({ ok: true });
        return true;
      }
      if (request.type === "EXECUTE_NATURAL_COMMAND") {
        const command = request.command || "";
        const persona = String(request.persona || "bilge_agent").trim().toLowerCase() || "bilge_agent";
        contentLogger.info("EXECUTE_NATURAL_COMMAND requested", { command, persona });
        Promise.resolve().then(() => executeResilientNaturalCommand(command)).then((result) => {
          if (result.ok && window.__bilge_commandAutocomplete) {
            window.__bilge_commandAutocomplete.saveCommand(command);
          }
          sendResponse({ ...result, persona });
        }).catch((err) => {
          contentLogger.error("EXECUTE_NATURAL_COMMAND failed", { error: err.message });
          sendResponse({
            ok: false,
            error: err.message || String(err || "Unknown execution error"),
            persona
          });
        });
        return true;
      }
      if (request.type === "PARSE_COMMAND") {
        const command = request.command || "";
        contentLogger.info("PARSE_COMMAND requested", { command });
        if (!window.BilgeCortex && !window.__bilge_cortex_loaded) {
          sendResponse({ error: "Cortex module not loaded", parsed: null });
          return true;
        }
        Promise.resolve().then(async () => {
          const resolved = await resolveNaturalCommand(command);
          if (!resolved?.parsed || !resolved?.executable) {
            sendResponse({
              parsed: null,
              executable: null,
              recognized: false,
              protocol: "natural-command-v2"
            });
            return;
          }
          sendResponse({
            parsed: resolved.parsed,
            executable: resolved.executable,
            recognized: true,
            selfHealed: !!resolved.repaired,
            commandMemoryHit: !!resolved.commandMemoryHit,
            recoveryPath: resolved.recoveryPath,
            protocol: "natural-command-v2"
          });
        }).catch((err) => {
          sendResponse({
            error: err?.message || String(err || "Parse command failed"),
            parsed: null,
            executable: null,
            recognized: false,
            protocol: "natural-command-v2"
          });
        });
        return true;
      }
      if (request.type === "FILL_FROM_PROFILE") {
        const profilePath = request.profilePath || "profiles/default.json";
        contentLogger.info("FILL_FROM_PROFILE requested", { profilePath });
        if (!mcpBridge) {
          sendResponse({ ok: false, error: "MCP bridge not initialized" });
          return true;
        }
        Promise.resolve().then(async () => {
          const profile = await mcpBridge.loadProfileData(profilePath);
          if (!profile) {
            sendResponse({ ok: false, error: "Failed to load profile data" });
            return;
          }
          const formFields = [];
          const inputs = document.querySelectorAll('input, textarea, select, [contenteditable="true"]');
          for (const input of inputs) {
            if (!isUsableField(input)) continue;
            formFields.push({
              selector: input.id ? `#${CSS.escape(input.id)}` : input.name ? `[name="${CSS.escape(input.name)}"]` : null,
              name: input.name || "",
              id: input.id || "",
              placeholder: input.placeholder || "",
              autocomplete: input.autocomplete || "",
              label: findLabelText(input)
            });
          }
          const mapping = mcpBridge.matchFieldsToProfile(formFields, profile);
          const results = { filled: 0, skipped: 0, failed: 0 };
          for (const [selector, value] of mapping) {
            if (!selector) continue;
            try {
              const element = document.querySelector(selector);
              if (!element) {
                results.failed += 1;
                continue;
              }
              element.focus();
              if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
                setNativeValue(element, value);
                dispatchInputEvents(element);
              } else if (element.isContentEditable) {
                element.textContent = value;
                dispatchInputEvents(element);
              }
              results.filled += 1;
            } catch (err) {
              results.failed += 1;
              contentLogger.warn("Fill field failed", { selector, error: err.message });
            }
          }
          contentLogger.info("FILL_FROM_PROFILE completed", results);
          sendResponse({ ok: true, results });
        }).catch((err) => {
          contentLogger.error("FILL_FROM_PROFILE failed", { error: err.message });
          sendResponse({ ok: false, error: err.message });
        });
        return true;
      }
      if (request.type === "SAVE_FORM_STATE") {
        contentLogger.info("SAVE_FORM_STATE requested");
        if (!formPersistence) {
          sendResponse({ ok: false, error: "Form persistence not initialized" });
          return true;
        }
        Promise.resolve().then(async () => {
          const state = formPersistence.captureFormState();
          await formPersistence.saveToStorage(state);
          contentLogger.info("SAVE_FORM_STATE completed", { fieldsCount: state.fields.length });
          sendResponse({ ok: true, fieldsCount: state.fields.length });
        }).catch((err) => {
          contentLogger.error("SAVE_FORM_STATE failed", { error: err.message });
          sendResponse({ ok: false, error: err.message });
        });
        return true;
      }
      if (request.type === "RESTORE_FORM_STATE") {
        contentLogger.info("RESTORE_FORM_STATE requested");
        if (!formPersistence) {
          sendResponse({ ok: false, error: "Form persistence not initialized" });
          return true;
        }
        Promise.resolve().then(async () => {
          const savedState = await formPersistence.loadMatchingState();
          if (!savedState) {
            sendResponse({ ok: false, error: "No saved state found for this URL" });
            return;
          }
          const results = await formPersistence.restoreFormState(savedState, selfHealingEngine);
          contentLogger.info("RESTORE_FORM_STATE completed", results);
          sendResponse({ ok: true, results });
        }).catch((err) => {
          contentLogger.error("RESTORE_FORM_STATE failed", { error: err.message });
          sendResponse({ ok: false, error: err.message });
        });
        return true;
      }
      if (request.type === "GET_SELF_HEALING_STATS") {
        contentLogger.info("GET_SELF_HEALING_STATS requested");
        if (!selfHealingEngine) {
          sendResponse({ ok: false, error: "Self-healing engine not initialized" });
          return true;
        }
        const stats = selfHealingEngine.getStats();
        sendResponse({ ok: true, stats });
        return true;
      }
      if (request.type === "GET_PAGE_CONTEXT") {
        contentLogger.info("GET_PAGE_CONTEXT requested");
        if (!contextInference) {
          sendResponse({ ok: false, error: "Context inference not initialized" });
          return true;
        }
        const context = contextInference.extractPageContext();
        sendResponse({ ok: true, context });
        return true;
      }
      sendResponse({ error: `Unknown request type: ${String(request.type || "")}` });
      return true;
    } catch (err) {
      const message = err && err.message ? String(err.message) : String(err || "Unknown error");
      sendResponse({ error: `Content script error: ${message}` });
      return true;
    }
  });
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2xpYi9lbnYuanMiLCAic3JjL2xpYi9sb2dnZXIuanMiLCAic3JjL2NvbnRlbnQuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qKlxuICogUnVudGltZSBlbnZpcm9ubWVudCB1dGlsaXRpZXNcbiAqIEZhbGxzIGJhY2sgdG8gZGVmYXVsdHMgaWYgX19CSUxHRV9FTlZfXyBub3QgaW5qZWN0ZWRcbiAqL1xuZnVuY3Rpb24gZ2V0SW5qZWN0ZWRFbnYoKSB7XG4gIHRyeSB7XG4gICAgY29uc3QgZyA9IHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyA/IGdsb2JhbFRoaXMgOiBudWxsO1xuICAgIGlmIChnICYmIGcuX19CSUxHRV9FTlZfXyAmJiB0eXBlb2YgZy5fX0JJTEdFX0VOVl9fID09PSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuIGcuX19CSUxHRV9FTlZfXztcbiAgICB9XG4gIH0gY2F0Y2gge31cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGdldEVudkZyb21CdWlsZERlZmluZXMoKSB7XG4gIC8vIFRoZXNlIGlkZW50aWZpZXJzIGFyZSByZXBsYWNlZCBhdCBidWlsZCB0aW1lIGJ5IGVzYnVpbGQgYGRlZmluZWAgaW4gYGJ1aWxkLm1qc2AuXG4gIGNvbnN0IGhhc0RlZmluZXMgPVxuICAgIHR5cGVvZiBfX0JJTEdFX0VOVl9fICE9PSAndW5kZWZpbmVkJyB8fFxuICAgIHR5cGVvZiBfX01DUF9CQVNFX1VSTF9fICE9PSAndW5kZWZpbmVkJyB8fFxuICAgIHR5cGVvZiBfX0VOQUJMRV9IT1RfUkVMT0FEX18gIT09ICd1bmRlZmluZWQnIHx8XG4gICAgdHlwZW9mIF9fVkVSU0lPTl9fICE9PSAndW5kZWZpbmVkJztcblxuICBpZiAoIWhhc0RlZmluZXMpIHJldHVybiBudWxsO1xuXG4gIC8vIE1PREUgaXMgdXNlZCBmb3IgbG9nZ2VyIGxldmVscyBhbmQgZmVhdHVyZSBnYXRpbmcuXG4gIC8vIEFjY2VwdCBib3RoIG1vZGVybiAoYGRldmVsb3BtZW50YC9gcHJvZHVjdGlvbmApIGFuZCBzaG9ydCAoYGRldmAvYHByb2RgKSBzcGVsbGluZ3MuXG4gIGNvbnN0IGluZmVycmVkTW9kZSA9XG4gICAgdHlwZW9mIF9fQklMR0VfRU5WX18gIT09ICd1bmRlZmluZWQnXG4gICAgICA/IF9fQklMR0VfRU5WX19cbiAgICAgIDogdHlwZW9mIF9fQlVJTERfTU9ERV9fICE9PSAndW5kZWZpbmVkJyAmJiBfX0JVSUxEX01PREVfXyA9PT0gJ3Byb2QnXG4gICAgICAgID8gJ3Byb2R1Y3Rpb24nXG4gICAgICAgIDogJ2RldmVsb3BtZW50JztcblxuICByZXR1cm4ge1xuICAgIE1PREU6IGluZmVycmVkTW9kZSxcbiAgICBERUJVRzogdHlwZW9mIF9fQklMR0VfREVCVUdfXyAhPT0gJ3VuZGVmaW5lZCcgPyBfX0JJTEdFX0RFQlVHX18gOiB0cnVlLFxuICAgIFZFUlNJT046IHR5cGVvZiBfX1ZFUlNJT05fXyAhPT0gJ3VuZGVmaW5lZCcgPyBfX1ZFUlNJT05fXyA6ICdkZXYnLFxuICAgIE1DUF9CQVNFX1VSTDogdHlwZW9mIF9fTUNQX0JBU0VfVVJMX18gIT09ICd1bmRlZmluZWQnID8gX19NQ1BfQkFTRV9VUkxfXyA6ICdodHRwOi8vbG9jYWxob3N0Ojg3ODcnLFxuICAgIE1DUF9XU19VUkw6IHR5cGVvZiBfX01DUF9XU19VUkxfXyAhPT0gJ3VuZGVmaW5lZCcgPyBfX01DUF9XU19VUkxfXyA6ICd3czovL2xvY2FsaG9zdDo4Nzg3L3dzJyxcbiAgICBERUZBVUxUX0JSQUlOX1BST1ZJREVSOlxuICAgICAgdHlwZW9mIF9fREVGQVVMVF9CUkFJTl9QUk9WSURFUl9fICE9PSAndW5kZWZpbmVkJyA/IF9fREVGQVVMVF9CUkFJTl9QUk9WSURFUl9fIDogJ2RlZXBzZWVrJyxcbiAgICBERUZBVUxUX0JSQUlOX01PREVMOiB0eXBlb2YgX19ERUZBVUxUX0JSQUlOX01PREVMX18gIT09ICd1bmRlZmluZWQnID8gX19ERUZBVUxUX0JSQUlOX01PREVMX18gOiAnZGVlcHNlZWstY2hhdCcsXG4gICAgRkVBVFVSRVM6IHtcbiAgICAgIERFVl9UT09MUzogdHlwZW9mIF9fRU5BQkxFX0RFVl9UT09MU19fICE9PSAndW5kZWZpbmVkJyA/IF9fRU5BQkxFX0RFVl9UT09MU19fIDogdHJ1ZSxcbiAgICAgIENPTlNPTEVfTE9HR0lORzogdHlwZW9mIF9fRU5BQkxFX0NPTlNPTEVfTE9HR0lOR19fICE9PSAndW5kZWZpbmVkJyA/IF9fRU5BQkxFX0NPTlNPTEVfTE9HR0lOR19fIDogdHJ1ZSxcbiAgICAgIFBFUkZPUk1BTkNFX01FVFJJQ1M6XG4gICAgICAgIHR5cGVvZiBfX0VOQUJMRV9QRVJGT1JNQU5DRV9NRVRSSUNTX18gIT09ICd1bmRlZmluZWQnID8gX19FTkFCTEVfUEVSRk9STUFOQ0VfTUVUUklDU19fIDogdHJ1ZSxcbiAgICAgIEhPVF9SRUxPQUQ6IHR5cGVvZiBfX0VOQUJMRV9IT1RfUkVMT0FEX18gIT09ICd1bmRlZmluZWQnID8gX19FTkFCTEVfSE9UX1JFTE9BRF9fIDogZmFsc2VcbiAgICB9LFxuICAgIFRFTEVNRVRSWToge1xuICAgICAgRU5BQkxFRDogdHlwZW9mIF9fVEVMRU1FVFJZX0VOQUJMRURfXyAhPT0gJ3VuZGVmaW5lZCcgPyBfX1RFTEVNRVRSWV9FTkFCTEVEX18gOiBmYWxzZSxcbiAgICAgIEVORFBPSU5UOiB0eXBlb2YgX19URUxFTUVUUllfRU5EUE9JTlRfXyAhPT0gJ3VuZGVmaW5lZCcgPyBfX1RFTEVNRVRSWV9FTkRQT0lOVF9fIDogJydcbiAgICB9XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRFbnYoKSB7XG4gIGNvbnN0IGluamVjdGVkID0gZ2V0SW5qZWN0ZWRFbnYoKTtcbiAgaWYgKGluamVjdGVkKSByZXR1cm4gaW5qZWN0ZWQ7XG5cbiAgY29uc3QgZnJvbURlZmluZXMgPSBnZXRFbnZGcm9tQnVpbGREZWZpbmVzKCk7XG4gIGlmIChmcm9tRGVmaW5lcykgcmV0dXJuIGZyb21EZWZpbmVzO1xuXG4gIC8vIEZhbGxiYWNrIGZvciBkaXJlY3QgbG9hZGluZ1xuICByZXR1cm4ge1xuICAgIE1PREU6ICdkZXZlbG9wbWVudCcsXG4gICAgREVCVUc6IHRydWUsXG4gICAgVkVSU0lPTjogJ2RldicsXG4gICAgTUNQX0JBU0VfVVJMOiAnaHR0cDovL2xvY2FsaG9zdDo4Nzg3JyxcbiAgICBNQ1BfV1NfVVJMOiAnd3M6Ly9sb2NhbGhvc3Q6ODc4Ny93cycsXG4gICAgREVGQVVMVF9CUkFJTl9QUk9WSURFUjogJ2RlZXBzZWVrJyxcbiAgICBERUZBVUxUX0JSQUlOX01PREVMOiAnZGVlcHNlZWstY2hhdCcsXG4gICAgRkVBVFVSRVM6IHsgREVWX1RPT0xTOiB0cnVlLCBDT05TT0xFX0xPR0dJTkc6IHRydWUsIFBFUkZPUk1BTkNFX01FVFJJQ1M6IHRydWUsIEhPVF9SRUxPQUQ6IHRydWUgfSxcbiAgICBURUxFTUVUUlk6IHsgRU5BQkxFRDogZmFsc2UsIEVORFBPSU5UOiAnJyB9XG4gIH07XG59XG5cbmV4cG9ydCBjb25zdCBFTlYgPSBnZXRFbnYoKTtcbmV4cG9ydCBjb25zdCBpc0RldiA9ICgpID0+IEVOVi5NT0RFID09PSAnZGV2ZWxvcG1lbnQnIHx8IEVOVi5NT0RFID09PSAnZGV2JztcbmV4cG9ydCBjb25zdCBpc1Byb2QgPSAoKSA9PiBFTlYuTU9ERSA9PT0gJ3Byb2R1Y3Rpb24nIHx8IEVOVi5NT0RFID09PSAncHJvZCc7XG5leHBvcnQgY29uc3QgaXNEZWJ1ZyA9ICgpID0+IEVOVi5ERUJVRyA9PT0gdHJ1ZTtcbiIsICJpbXBvcnQgeyBFTlYsIGlzRGV2IH0gZnJvbSAnLi9lbnYuanMnO1xuXG5jb25zdCBMT0dfTEVWRUxTID0geyBERUJVRzogMCwgSU5GTzogMSwgV0FSTjogMiwgRVJST1I6IDMsIE5PTkU6IDQgfTtcbmNvbnN0IGN1cnJlbnRMZXZlbCA9IGlzRGV2KCkgPyBMT0dfTEVWRUxTLkRFQlVHIDogTE9HX0xFVkVMUy5XQVJOO1xuXG5mdW5jdGlvbiBzaG91bGRMb2cobGV2ZWwpIHtcbiAgaWYgKCFFTlYuRkVBVFVSRVMuQ09OU09MRV9MT0dHSU5HKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiBsZXZlbCA+PSBjdXJyZW50TGV2ZWw7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdE1lc3NhZ2UobGV2ZWwsIG1vZHVsZSwgbWVzc2FnZSkge1xuICBjb25zdCB0aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc3BsaXQoJ1QnKVsxXS5zbGljZSgwLCAtMSk7XG4gIHJldHVybiBgWyR7dGltZXN0YW1wfV0gWyR7bGV2ZWx9XSBbJHttb2R1bGV9XSAke21lc3NhZ2V9YDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxvZ2dlcihtb2R1bGUpIHtcbiAgcmV0dXJuIHtcbiAgICBkZWJ1ZyhtZXNzYWdlLCBkYXRhKSB7XG4gICAgICBpZiAoc2hvdWxkTG9nKExPR19MRVZFTFMuREVCVUcpKSB7XG4gICAgICAgIGNvbnNvbGUuZGVidWcoZm9ybWF0TWVzc2FnZSgnREVCVUcnLCBtb2R1bGUsIG1lc3NhZ2UpLCBkYXRhID8/ICcnKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIGluZm8obWVzc2FnZSwgZGF0YSkge1xuICAgICAgaWYgKHNob3VsZExvZyhMT0dfTEVWRUxTLklORk8pKSB7XG4gICAgICAgIGNvbnNvbGUuaW5mbyhmb3JtYXRNZXNzYWdlKCdJTkZPJywgbW9kdWxlLCBtZXNzYWdlKSwgZGF0YSA/PyAnJyk7XG4gICAgICB9XG4gICAgfSxcbiAgICB3YXJuKG1lc3NhZ2UsIGRhdGEpIHtcbiAgICAgIGlmIChzaG91bGRMb2coTE9HX0xFVkVMUy5XQVJOKSkge1xuICAgICAgICBjb25zb2xlLndhcm4oZm9ybWF0TWVzc2FnZSgnV0FSTicsIG1vZHVsZSwgbWVzc2FnZSksIGRhdGEgPz8gJycpO1xuICAgICAgfVxuICAgIH0sXG4gICAgZXJyb3IobWVzc2FnZSwgZGF0YSkge1xuICAgICAgaWYgKHNob3VsZExvZyhMT0dfTEVWRUxTLkVSUk9SKSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKGZvcm1hdE1lc3NhZ2UoJ0VSUk9SJywgbW9kdWxlLCBtZXNzYWdlKSwgZGF0YSA/PyAnJyk7XG4gICAgICB9XG4gICAgfSxcbiAgICB0aW1lKGxhYmVsKSB7XG4gICAgICBpZiAoRU5WLkZFQVRVUkVTLlBFUkZPUk1BTkNFX01FVFJJQ1MpIHtcbiAgICAgICAgY29uc29sZS50aW1lKGBbJHttb2R1bGV9XSAke2xhYmVsfWApO1xuICAgICAgfVxuICAgIH0sXG4gICAgdGltZUVuZChsYWJlbCkge1xuICAgICAgaWYgKEVOVi5GRUFUVVJFUy5QRVJGT1JNQU5DRV9NRVRSSUNTKSB7XG4gICAgICAgIGNvbnNvbGUudGltZUVuZChgWyR7bW9kdWxlfV0gJHtsYWJlbH1gKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG59XG5cbmV4cG9ydCBjb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ0JpbGdlJyk7XG4iLCAiLy8gQmlsZ2UgQUkgQ29udGVudCBTY3JpcHRcbmltcG9ydCB7IEVOViwgaXNEZXYgfSBmcm9tICcuL2xpYi9lbnYuanMnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi9saWIvbG9nZ2VyLmpzJztcblxuKCgpID0+IHtcbiAgaWYgKHdpbmRvdy5fX2JpbGdlQ29udGVudFNjcmlwdE1vdW50ZWQpIHJldHVybjtcbiAgd2luZG93Ll9fYmlsZ2VDb250ZW50U2NyaXB0TW91bnRlZCA9IHRydWU7XG5cbiAgY29uc3QgY29udGVudExvZ2dlciA9IGNyZWF0ZUxvZ2dlcignQ29udGVudFNjcmlwdCcpO1xuICBjb250ZW50TG9nZ2VyLmluZm8oJ0NvbnRlbnQgc2NyaXB0IG1vdW50ZWQnKTtcblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBTZWxmLUhlYWxpbmcgTW9kdWxlIEludGVncmF0aW9uXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIE5vdGU6IE1vZHVsZXMgYXJlIGxvYWRlZCB2aWEgbWFuaWZlc3QuanNvbiBjb250ZW50X3NjcmlwdHMgYmVmb3JlIGNvbnRlbnQuanNcbiAgLy8gR2xvYmFsIHJlZmVyZW5jZXMgZm9yIHNlbGYtaGVhbGluZyBlbmdpbmUgaW50ZWdyYXRpb25cbiAgY29uc3Qgc2VsZkhlYWxpbmdFbmdpbmUgPSB3aW5kb3cuX19iaWxnZV9zZWxmSGVhbGluZ0VuZ2luZSB8fCBudWxsO1xuICBjb25zdCBmaWVsZFJlc29sdmVyID0gd2luZG93Ll9fYmlsZ2VfZmllbGRSZXNvbHZlciB8fCBudWxsO1xuICBjb25zdCBjb250ZXh0SW5mZXJlbmNlID0gd2luZG93Ll9fYmlsZ2VfY29udGV4dEluZmVyZW5jZSB8fCBudWxsO1xuICBjb25zdCBtY3BCcmlkZ2UgPSB3aW5kb3cuX19iaWxnZV9tY3BEYXRhQnJpZGdlIHx8IG51bGw7XG4gIGNvbnN0IGZvcm1QZXJzaXN0ZW5jZSA9IHdpbmRvdy5fX2JpbGdlX2Zvcm1TdGF0ZVBlcnNpc3RlbmNlIHx8IG51bGw7XG5cbiAgLy8gU2V0dXAgYXV0by1zYXZlL3Jlc3RvcmUgaWYgcGVyc2lzdGVuY2UgbW9kdWxlIGlzIGF2YWlsYWJsZVxuICBpZiAoZm9ybVBlcnNpc3RlbmNlKSB7XG4gICAgZm9ybVBlcnNpc3RlbmNlLnNldHVwQXV0b1NhdmUoKTtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xuICAgICAgZm9ybVBlcnNpc3RlbmNlLnNldHVwQXV0b1Jlc3RvcmUoKS5jYXRjaCgoZXJyKSA9PiB7XG4gICAgICAgIGNvbnRlbnRMb2dnZXIud2FybignQXV0by1yZXN0b3JlIGZhaWxlZCcsIHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyAtLS0gRVNDQVBFIFRPIENBTkNFTCAtLS1cbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4ge1xuICAgIGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIHtcbiAgICAgIGlmICh3aW5kb3cuX19iaWxnZV9ydW50aW1lKSB7XG4gICAgICAgIHdpbmRvdy5fX2JpbGdlX3J1bnRpbWUudXBkYXRlSGlnaGxpZ2h0KG51bGwpO1xuICAgICAgfVxuICAgIH1cbiAgfSwgeyBwYXNzaXZlOiB0cnVlIH0pO1xuXG4gIGNvbnN0IE1BWF9QQUdFX1RFWFRfQ0hBUlMgPSA1MDAwO1xuICBjb25zdCBNQVhfSFRNTF9DSEFSUyA9IDUwMDAwO1xuICBjb25zdCBNQVhfU0hBRE9XX0hUTUxfQ0hBUlMgPSA1MDAwMDtcbiAgY29uc3QgTUFYX1NIQURPV19ST09UUyA9IDgwO1xuICBjb25zdCBNQVhfRVhFQ1VURV9KU19DT0RFX0NIQVJTID0gMjAwMDA7XG4gIGNvbnN0IE1BWF9FWEVDVVRFX0pTX1JFU1VMVF9DSEFSUyA9IDUwMDAwO1xuICBjb25zdCBERUZBVUxUX0VYRUNVVEVfSlNfVElNRU9VVF9NUyA9IDUwMDA7XG4gIGNvbnN0IERPTV9TS0lMTF9NRU1PUllfS0VZID0gJ19fYmlsZ2VfZG9tX3NraWxsX21lbW9yeV92MSc7XG4gIGNvbnN0IERPTV9TS0lMTF9NRU1PUllfTUFYID0gMzAwO1xuICBjb25zdCBET01fU0tJTExfTUVNT1JZX1RUTF9NUyA9IDQ1ICogMjQgKiA2MCAqIDYwICogMTAwMDtcbiAgY29uc3QgTkFUVVJBTF9DT01NQU5EX01FTU9SWV9LRVkgPSAnX19iaWxnZV9uYXR1cmFsX2NvbW1hbmRfbWVtb3J5X3YxJztcbiAgY29uc3QgTkFUVVJBTF9DT01NQU5EX01FTU9SWV9NQVggPSAzMDA7XG4gIGNvbnN0IE5BVFVSQUxfQ09NTUFORF9NRU1PUllfVFRMX01TID0gNjAgKiAyNCAqIDYwICogNjAgKiAxMDAwO1xuICBsZXQgZG9tU2tpbGxNZW1vcnlDYWNoZSA9IG51bGw7XG4gIGxldCBkb21Ta2lsbE1lbW9yeUxvYWRQcm9taXNlID0gbnVsbDtcbiAgbGV0IG5hdHVyYWxDb21tYW5kTWVtb3J5Q2FjaGUgPSBudWxsO1xuICBsZXQgbmF0dXJhbENvbW1hbmRNZW1vcnlMb2FkUHJvbWlzZSA9IG51bGw7XG5cbiAgZnVuY3Rpb24gdHJ1bmNhdGUodGV4dCwgbWF4Q2hhcnMpIHtcbiAgICBjb25zdCBzdHIgPSBTdHJpbmcodGV4dCB8fCAnJyk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobWF4Q2hhcnMpIHx8IG1heENoYXJzIDw9IDApIHJldHVybiAnJztcbiAgICByZXR1cm4gc3RyLmxlbmd0aCA+IG1heENoYXJzID8gYCR7c3RyLnNsaWNlKDAsIG1heENoYXJzKX0uLi4gKHRydW5jYXRlZClgIDogc3RyO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVzY3JpYmVSZXN0cmljdGVkU2VsZWN0b3JFcnJvcihzZWxlY3RvciwgZXJyKSB7XG4gICAgY29uc3QgbWVzc2FnZSA9IGVyciAmJiBlcnIubWVzc2FnZSA/IFN0cmluZyhlcnIubWVzc2FnZSkgOiBTdHJpbmcoZXJyIHx8ICcnKTtcbiAgICByZXR1cm4geyBlcnJvcjogYEludmFsaWQgc2VsZWN0b3IgXCIke3NlbGVjdG9yfVwiOiAke21lc3NhZ2UgfHwgJ1Vua25vd24gZXJyb3InfWAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHF1ZXJ5U2VsZWN0b3JEZWVwKHNlbGVjdG9yLCByb290ID0gZG9jdW1lbnQpIHtcbiAgICBjb25zdCBwZW5kaW5nUm9vdHMgPSBbcm9vdF07XG4gICAgY29uc3Qgc2VlblJvb3RzID0gbmV3IFNldCgpO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwZW5kaW5nUm9vdHMubGVuZ3RoICYmIHBlbmRpbmdSb290cy5sZW5ndGggPD0gTUFYX1NIQURPV19ST09UUzsgaSsrKSB7XG4gICAgICBjb25zdCBjdXJyZW50Um9vdCA9IHBlbmRpbmdSb290c1tpXTtcbiAgICAgIGlmICghY3VycmVudFJvb3QgfHwgc2VlblJvb3RzLmhhcyhjdXJyZW50Um9vdCkpIGNvbnRpbnVlO1xuICAgICAgc2VlblJvb3RzLmFkZChjdXJyZW50Um9vdCk7XG5cbiAgICAgIGNvbnN0IGZvdW5kID0gY3VycmVudFJvb3QucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgICBpZiAoZm91bmQpIHJldHVybiBmb3VuZDtcblxuICAgICAgY29uc3Qgd2Fsa2VyID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihjdXJyZW50Um9vdCwgTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQpO1xuICAgICAgZm9yIChsZXQgbm9kZSA9IHdhbGtlci5jdXJyZW50Tm9kZTsgbm9kZTsgbm9kZSA9IHdhbGtlci5uZXh0Tm9kZSgpKSB7XG4gICAgICAgIGlmIChub2RlLnNoYWRvd1Jvb3QpIHBlbmRpbmdSb290cy5wdXNoKG5vZGUuc2hhZG93Um9vdCk7XG4gICAgICAgIGNvbnN0IHRhZyA9IFN0cmluZyhub2RlPy50YWdOYW1lIHx8ICcnKS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICBjb25zdCBpc0ZyYW1lID0gdGFnID09PSAnSUZSQU1FJyB8fCB0YWcgPT09ICdGUkFNRSc7XG4gICAgICAgIGlmIChpc0ZyYW1lKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmIChub2RlLmNvbnRlbnREb2N1bWVudCkgcGVuZGluZ1Jvb3RzLnB1c2gobm9kZS5jb250ZW50RG9jdW1lbnQpO1xuICAgICAgICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgICAgICAgIC8vIENyb3NzLW9yaWdpbiBmcmFtZTsgaWdub3JlLlxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAocGVuZGluZ1Jvb3RzLmxlbmd0aCA+IE1BWF9TSEFET1dfUk9PVFMpIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0TmF0aXZlVmFsdWUoZWxlbWVudCwgdmFsdWUpIHtcbiAgICBjb25zdCBuZXh0VmFsdWUgPSBTdHJpbmcodmFsdWUgPz8gJycpO1xuICAgIGNvbnN0IHRhZyA9IFN0cmluZyhlbGVtZW50Py50YWdOYW1lIHx8ICcnKS50b1VwcGVyQ2FzZSgpO1xuICAgIGNvbnN0IHZpZXcgPSBlbGVtZW50Py5vd25lckRvY3VtZW50Py5kZWZhdWx0VmlldyB8fCBudWxsO1xuXG4gICAgLy8gQ3Jvc3MtcmVhbG0gc2FmZTogaWYgdGhlIG5vZGUgY29tZXMgZnJvbSBhbiBpZnJhbWUsIHVzZSB0aGF0IGlmcmFtZSdzIHByb3RvdHlwZXMuXG4gICAgY29uc3QgcHJvdG8gPSB0YWcgPT09ICdJTlBVVCdcbiAgICAgID8gdmlldz8uSFRNTElucHV0RWxlbWVudD8ucHJvdG90eXBlXG4gICAgICA6IHRhZyA9PT0gJ1RFWFRBUkVBJ1xuICAgICAgICA/IHZpZXc/LkhUTUxUZXh0QXJlYUVsZW1lbnQ/LnByb3RvdHlwZVxuICAgICAgICA6IG51bGw7XG5cbiAgICBjb25zdCBkZXNjcmlwdG9yID0gcHJvdG8gPyBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHByb3RvLCAndmFsdWUnKSA6IG51bGw7XG4gICAgaWYgKGRlc2NyaXB0b3IgJiYgdHlwZW9mIGRlc2NyaXB0b3Iuc2V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBkZXNjcmlwdG9yLnNldC5jYWxsKGVsZW1lbnQsIG5leHRWYWx1ZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZWxlbWVudC52YWx1ZSA9IG5leHRWYWx1ZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRpc3BhdGNoSW5wdXRFdmVudHMoZWxlbWVudCkge1xuICAgIGNvbnN0IGlucHV0RXZlbnQgPSB0eXBlb2YgSW5wdXRFdmVudCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgPyBuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUsIGNvbXBvc2VkOiB0cnVlIH0pXG4gICAgICA6IG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSk7XG4gICAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KGlucHV0RXZlbnQpO1xuICAgIGVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBIZXVyaXN0aWMgRWxlbWVudCBNYXRjaGluZyAocG9ydGVkIGZyb20gQ2FyYXZhbkZsb3cpXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgZnVuY3Rpb24gbm9ybWFsaXplVGV4dCh2YWx1ZSkge1xuICAgIHJldHVybiBTdHJpbmcodmFsdWUgfHwgJycpLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW15hLXowLTldKy9nLCAnJyk7XG4gIH1cblxuICBmdW5jdGlvbiB0b2tlbml6ZSh2YWx1ZSkge1xuICAgIHJldHVybiBTdHJpbmcodmFsdWUgfHwgJycpXG4gICAgICAucmVwbGFjZSgvKFthLXpdKShbQS1aXSkvZywgJyQxICQyJylcbiAgICAgIC50b0xvd2VyQ2FzZSgpXG4gICAgICAuc3BsaXQoL1teYS16MC05XSsvKVxuICAgICAgLm1hcCgocGFydCkgPT4gcGFydC50cmltKCkpXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pO1xuICB9XG5cbiAgZnVuY3Rpb24gZXh0cmFjdFNlbGVjdG9ySGludHMoc2VsZWN0b3IpIHtcbiAgICBjb25zdCBoaW50cyA9IFtdO1xuICAgIGNvbnN0IGF0dHJNYXRjaGVzID0gc2VsZWN0b3IubWF0Y2hBbGwoXG4gICAgICAvXFxbXFxzKihuYW1lfGlkfHBsYWNlaG9sZGVyfGFyaWEtbGFiZWx8ZGF0YS10ZXN0aWR8ZGF0YS10ZXN0LWlkfGRhdGEtcWEpXFxzKig/OlsqXiR8fl0/PSlcXHMqKD86WydcIl0oW14nXCJdKylbJ1wiXXwoW15cXF1cXHNdKykpXFxzKlxcXS9naVxuICAgICk7XG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiBhdHRyTWF0Y2hlcykge1xuICAgICAgaGludHMucHVzaChtYXRjaFsyXSB8fCBtYXRjaFszXSB8fCAnJyk7XG4gICAgfVxuICAgIGNvbnN0IGlkTWF0Y2hlcyA9IHNlbGVjdG9yLm1hdGNoQWxsKC8jKFtBLVphLXowLTlfLV0rKS9nKTtcbiAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIGlkTWF0Y2hlcykge1xuICAgICAgaGludHMucHVzaChTdHJpbmcobWF0Y2hbMV0gfHwgJycpLnJlcGxhY2UoL1tfLV0rL2csICcgJykpO1xuICAgIH1cbiAgICBjb25zdCBjbGFzc01hdGNoZXMgPSBzZWxlY3Rvci5tYXRjaEFsbCgvXFwuKFtBLVphLXowLTlfLV0rKS9nKTtcbiAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIGNsYXNzTWF0Y2hlcykge1xuICAgICAgaGludHMucHVzaChTdHJpbmcobWF0Y2hbMV0gfHwgJycpLnJlcGxhY2UoL1tfLV0rL2csICcgJykpO1xuICAgIH1cbiAgICBjb25zdCB0YWdNYXRjaCA9IHNlbGVjdG9yLm1hdGNoKC9eXFxzKihbYS16XSspL2kpO1xuICAgIGNvbnN0IHByZWZlcnJlZFRhZyA9IHRhZ01hdGNoID8gU3RyaW5nKHRhZ01hdGNoWzFdKS50b0xvd2VyQ2FzZSgpIDogJyc7XG4gICAgcmV0dXJuIHsgaGludHMsIHByZWZlcnJlZFRhZyB9O1xuICB9XG5cbiAgZnVuY3Rpb24gZmluZExhYmVsVGV4dChlbGVtZW50KSB7XG4gICAgaWYgKCEoZWxlbWVudCBpbnN0YW5jZW9mIEVsZW1lbnQpKSByZXR1cm4gJyc7XG4gICAgY29uc3QgcGFydHMgPSBbXTtcbiAgICBjb25zdCBpZCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdpZCcpO1xuICAgIGlmIChpZCkge1xuICAgICAgY29uc3QgbGFiZWxGb3IgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBsYWJlbFtmb3I9XCIke0NTUy5lc2NhcGUoaWQpfVwiXWApO1xuICAgICAgaWYgKGxhYmVsRm9yPy50ZXh0Q29udGVudCkgcGFydHMucHVzaChsYWJlbEZvci50ZXh0Q29udGVudCk7XG4gICAgfVxuICAgIGNvbnN0IGNsb3Nlc3RMYWJlbCA9IGVsZW1lbnQuY2xvc2VzdCgnbGFiZWwnKTtcbiAgICBpZiAoY2xvc2VzdExhYmVsPy50ZXh0Q29udGVudCkgcGFydHMucHVzaChjbG9zZXN0TGFiZWwudGV4dENvbnRlbnQpO1xuICAgIGNvbnN0IHBhcmVudExhYmVsID0gZWxlbWVudC5wYXJlbnRFbGVtZW50Py5xdWVyeVNlbGVjdG9yPy4oJ2xhYmVsJyk7XG4gICAgaWYgKHBhcmVudExhYmVsPy50ZXh0Q29udGVudCkgcGFydHMucHVzaChwYXJlbnRMYWJlbC50ZXh0Q29udGVudCk7XG4gICAgcmV0dXJuIHBhcnRzLmpvaW4oJyAnKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVsZW1lbnRTZWFyY2hUZXh0KGVsZW1lbnQpIHtcbiAgICBjb25zdCBhdHRyS2V5cyA9IFtcbiAgICAgICduYW1lJywgJ2lkJywgJ3BsYWNlaG9sZGVyJywgJ2FyaWEtbGFiZWwnLCAnYXV0b2NvbXBsZXRlJyxcbiAgICAgICdkYXRhLXRlc3RpZCcsICdkYXRhLXRlc3QtaWQnLCAnZGF0YS1xYScsICd0aXRsZSdcbiAgICBdO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtdO1xuICAgIHZhbHVlcy5wdXNoKGVsZW1lbnQudGFnTmFtZS50b0xvd2VyQ2FzZSgpKTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBhdHRyS2V5cykge1xuICAgICAgY29uc3QgdiA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlPy4oa2V5KTtcbiAgICAgIGlmICh2KSB2YWx1ZXMucHVzaCh2KTtcbiAgICB9XG4gICAgdmFsdWVzLnB1c2goZmluZExhYmVsVGV4dChlbGVtZW50KSk7XG4gICAgY29uc3Qgcm9sZSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlPy4oJ3JvbGUnKTtcbiAgICBpZiAocm9sZSkgdmFsdWVzLnB1c2gocm9sZSk7XG4gICAgcmV0dXJuIG5vcm1hbGl6ZVRleHQodmFsdWVzLmpvaW4oJyAnKSk7XG4gIH1cblxuICBmdW5jdGlvbiBpc1VzYWJsZUZpZWxkKGVsZW1lbnQpIHtcbiAgICBpZiAoIShlbGVtZW50IGluc3RhbmNlb2YgRWxlbWVudCkpIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBkaXNhYmxlZCA9IGVsZW1lbnQuaGFzQXR0cmlidXRlKCdkaXNhYmxlZCcpIHx8IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJykgPT09ICd0cnVlJztcbiAgICBjb25zdCByZWN0ID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjb25zdCBzdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xuICAgIGlmIChkaXNhYmxlZCkgcmV0dXJuIGZhbHNlO1xuICAgIGlmIChzdHlsZS5kaXNwbGF5ID09PSAnbm9uZScgfHwgc3R5bGUudmlzaWJpbGl0eSA9PT0gJ2hpZGRlbicpIHJldHVybiBmYWxzZTtcbiAgICBpZiAocmVjdC53aWR0aCA8IDIgfHwgcmVjdC5oZWlnaHQgPCAyKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBmdW5jdGlvbiBlc2NhcGVDc3NWYWx1ZSh2YWx1ZSkge1xuICAgIGNvbnN0IHRleHQgPSBTdHJpbmcodmFsdWUgfHwgJycpO1xuICAgIGlmICh0eXBlb2YgQ1NTICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgQ1NTLmVzY2FwZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcmV0dXJuIENTUy5lc2NhcGUodGV4dCk7XG4gICAgfVxuICAgIHJldHVybiB0ZXh0LnJlcGxhY2UoL1tcIlxcXFxdL2csICdcXFxcJCYnKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG5vcm1hbGl6ZVNraWxsVGFyZ2V0KHZhbHVlKSB7XG4gICAgcmV0dXJuIFN0cmluZyh2YWx1ZSB8fCAnJylcbiAgICAgIC50b0xvd2VyQ2FzZSgpXG4gICAgICAucmVwbGFjZSgvXFxiXFxkezUsfVxcYi9nLCAnIycpXG4gICAgICAucmVwbGFjZSgvW15hLXowLTlcXHNfLV0rL2csICcgJylcbiAgICAgIC5yZXBsYWNlKC9cXHMrL2csICcgJylcbiAgICAgIC50cmltKClcbiAgICAgIC5zbGljZSgwLCAxMjApO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0UGF0aFByZWZpeChwYXRobmFtZSkge1xuICAgIGNvbnN0IHBhcnRzID0gU3RyaW5nKHBhdGhuYW1lIHx8ICcnKVxuICAgICAgLnNwbGl0KCcvJylcbiAgICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAgIC5zbGljZSgwLCAyKTtcbiAgICByZXR1cm4gcGFydHMubGVuZ3RoID8gYC8ke3BhcnRzLmpvaW4oJy8nKX1gIDogJy8nO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0RG9tU2tpbGxTY29wZSgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgaG9zdDogU3RyaW5nKHdpbmRvdy5sb2NhdGlvbj8uaG9zdCB8fCAnJykudG9Mb3dlckNhc2UoKSxcbiAgICAgIHBhdGhQcmVmaXg6IGdldFBhdGhQcmVmaXgod2luZG93LmxvY2F0aW9uPy5wYXRobmFtZSB8fCAnLycpXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBydW5lRG9tU2tpbGxNZW1vcnkoZW50cmllcykge1xuICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gICAgY29uc3Qgc2VlbiA9IG5ldyBTZXQoKTtcbiAgICBjb25zdCBub3JtYWxpemVkID0gW107XG4gICAgZm9yIChjb25zdCBlbnRyeSBvZiBBcnJheS5pc0FycmF5KGVudHJpZXMpID8gZW50cmllcyA6IFtdKSB7XG4gICAgICBpZiAoIWVudHJ5IHx8IHR5cGVvZiBlbnRyeSAhPT0gJ29iamVjdCcpIGNvbnRpbnVlO1xuICAgICAgaWYgKCFlbnRyeS5rZXkgfHwgdHlwZW9mIGVudHJ5LmtleSAhPT0gJ3N0cmluZycpIGNvbnRpbnVlO1xuICAgICAgaWYgKHNlZW4uaGFzKGVudHJ5LmtleSkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgbGFzdFVzZWQgPSBOdW1iZXIoZW50cnkubGFzdFVzZWQgfHwgZW50cnkudXBkYXRlZEF0IHx8IGVudHJ5LmNyZWF0ZWRBdCB8fCAwKTtcbiAgICAgIGlmIChsYXN0VXNlZCA+IDAgJiYgbm93IC0gbGFzdFVzZWQgPiBET01fU0tJTExfTUVNT1JZX1RUTF9NUykgY29udGludWU7XG4gICAgICBzZWVuLmFkZChlbnRyeS5rZXkpO1xuICAgICAgbm9ybWFsaXplZC5wdXNoKGVudHJ5KTtcbiAgICB9XG4gICAgbm9ybWFsaXplZC5zb3J0KChhLCBiKSA9PiBOdW1iZXIoYi5sYXN0VXNlZCB8fCAwKSAtIE51bWJlcihhLmxhc3RVc2VkIHx8IDApKTtcbiAgICByZXR1cm4gbm9ybWFsaXplZC5zbGljZSgwLCBET01fU0tJTExfTUVNT1JZX01BWCk7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiByZWFkRG9tU2tpbGxNZW1vcnkoKSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZG9tU2tpbGxNZW1vcnlDYWNoZSkpIHJldHVybiBkb21Ta2lsbE1lbW9yeUNhY2hlO1xuICAgIGlmIChkb21Ta2lsbE1lbW9yeUxvYWRQcm9taXNlKSByZXR1cm4gZG9tU2tpbGxNZW1vcnlMb2FkUHJvbWlzZTtcblxuICAgIGRvbVNraWxsTWVtb3J5TG9hZFByb21pc2UgPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFtET01fU0tJTExfTUVNT1JZX0tFWV0sIChyZXN1bHQpID0+IHtcbiAgICAgICAgICBpZiAoY2hyb21lLnJ1bnRpbWU/Lmxhc3RFcnJvcikge1xuICAgICAgICAgICAgZG9tU2tpbGxNZW1vcnlDYWNoZSA9IFtdO1xuICAgICAgICAgICAgZG9tU2tpbGxNZW1vcnlMb2FkUHJvbWlzZSA9IG51bGw7XG4gICAgICAgICAgICByZXNvbHZlKGRvbVNraWxsTWVtb3J5Q2FjaGUpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCByYXcgPSByZXN1bHQ/LltET01fU0tJTExfTUVNT1JZX0tFWV07XG4gICAgICAgICAgZG9tU2tpbGxNZW1vcnlDYWNoZSA9IHBydW5lRG9tU2tpbGxNZW1vcnkocmF3KTtcbiAgICAgICAgICBkb21Ta2lsbE1lbW9yeUxvYWRQcm9taXNlID0gbnVsbDtcbiAgICAgICAgICByZXNvbHZlKGRvbVNraWxsTWVtb3J5Q2FjaGUpO1xuICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgICAgZG9tU2tpbGxNZW1vcnlDYWNoZSA9IFtdO1xuICAgICAgICBkb21Ta2lsbE1lbW9yeUxvYWRQcm9taXNlID0gbnVsbDtcbiAgICAgICAgcmVzb2x2ZShkb21Ta2lsbE1lbW9yeUNhY2hlKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBkb21Ta2lsbE1lbW9yeUxvYWRQcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gd3JpdGVEb21Ta2lsbE1lbW9yeShlbnRyaWVzKSB7XG4gICAgY29uc3QgbmV4dCA9IHBydW5lRG9tU2tpbGxNZW1vcnkoZW50cmllcyk7XG4gICAgZG9tU2tpbGxNZW1vcnlDYWNoZSA9IG5leHQ7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IFtET01fU0tJTExfTUVNT1JZX0tFWV06IG5leHQgfSwgKCkgPT4gcmVzb2x2ZSgpKTtcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgIC8vIE5vbi1mYXRhbC4gUnVudGltZSBzdGlsbCB3b3JrcyBldmVuIGlmIHBlcnNpc3RlbmNlIGZhaWxzLlxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGV4dHJhY3RUZXh0U2lnbmF0dXJlKGVsZW1lbnQpIHtcbiAgICBjb25zdCB0ZXh0ID0gU3RyaW5nKGVsZW1lbnQ/LmlubmVyVGV4dCB8fCBlbGVtZW50Py50ZXh0Q29udGVudCB8fCAnJylcbiAgICAgIC5yZXBsYWNlKC9cXHMrL2csICcgJylcbiAgICAgIC50cmltKClcbiAgICAgIC5zbGljZSgwLCAxMjApO1xuICAgIHJldHVybiB0ZXh0O1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0RWxlbWVudEhpbnRzKGVsZW1lbnQpIHtcbiAgICBpZiAoIShlbGVtZW50IGluc3RhbmNlb2YgRWxlbWVudCkpIHJldHVybiBudWxsO1xuICAgIHJldHVybiB7XG4gICAgICB0YWc6IFN0cmluZyhlbGVtZW50LnRhZ05hbWUgfHwgJycpLnRvTG93ZXJDYXNlKCksXG4gICAgICBpZDogU3RyaW5nKGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdpZCcpIHx8ICcnKSxcbiAgICAgIG5hbWU6IFN0cmluZyhlbGVtZW50LmdldEF0dHJpYnV0ZSgnbmFtZScpIHx8ICcnKSxcbiAgICAgIHBsYWNlaG9sZGVyOiBTdHJpbmcoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3BsYWNlaG9sZGVyJykgfHwgJycpLFxuICAgICAgYXJpYUxhYmVsOiBTdHJpbmcoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCAnJyksXG4gICAgICByb2xlOiBTdHJpbmcoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3JvbGUnKSB8fCAnJyksXG4gICAgICBkYXRhVGVzdElkOiBTdHJpbmcoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGVzdGlkJykgfHwgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGVzdC1pZCcpIHx8ICcnKSxcbiAgICAgIGxhYmVsVGV4dDogU3RyaW5nKGZpbmRMYWJlbFRleHQoZWxlbWVudCkgfHwgJycpLnJlcGxhY2UoL1xccysvZywgJyAnKS50cmltKCkuc2xpY2UoMCwgMTIwKSxcbiAgICAgIHRleHQ6IGV4dHJhY3RUZXh0U2lnbmF0dXJlKGVsZW1lbnQpXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNjb3JlU2tpbGxFbnRyeShlbnRyeSwgc2NvcGUsIGludGVudCwgdGFyZ2V0Tm9ybSkge1xuICAgIGlmICghZW50cnkgfHwgZW50cnkuaW50ZW50ICE9PSBpbnRlbnQpIHJldHVybiAwO1xuICAgIGxldCBzY29yZSA9IDA7XG4gICAgaWYgKGVudHJ5Lmhvc3QgPT09IHNjb3BlLmhvc3QpIHNjb3JlICs9IDU7XG4gICAgaWYgKGVudHJ5LnBhdGhQcmVmaXggPT09IHNjb3BlLnBhdGhQcmVmaXgpIHNjb3JlICs9IDI7XG5cbiAgICBjb25zdCBlbnRyeVRhcmdldCA9IFN0cmluZyhlbnRyeS50YXJnZXQgfHwgJycpO1xuICAgIGlmIChlbnRyeVRhcmdldCAmJiB0YXJnZXROb3JtKSB7XG4gICAgICBpZiAoZW50cnlUYXJnZXQgPT09IHRhcmdldE5vcm0pIHNjb3JlICs9IDg7XG4gICAgICBjb25zdCBlbnRyeVRva2VucyA9IG5ldyBTZXQodG9rZW5pemUoZW50cnlUYXJnZXQpKTtcbiAgICAgIGNvbnN0IHRhcmdldFRva2VucyA9IHRva2VuaXplKHRhcmdldE5vcm0pO1xuICAgICAgaWYgKHRhcmdldFRva2Vucy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGxldCBvdmVybGFwID0gMDtcbiAgICAgICAgZm9yIChjb25zdCB0b2tlbiBvZiB0YXJnZXRUb2tlbnMpIHtcbiAgICAgICAgICBpZiAoZW50cnlUb2tlbnMuaGFzKHRva2VuKSkgb3ZlcmxhcCArPSAxO1xuICAgICAgICB9XG4gICAgICAgIHNjb3JlICs9IG92ZXJsYXA7XG4gICAgICB9XG4gICAgfVxuXG4gICAgc2NvcmUgKz0gTWF0aC5taW4oMywgTnVtYmVyKGVudHJ5LnN1Y2Nlc3NDb3VudCB8fCAwKSk7XG4gICAgcmV0dXJuIHNjb3JlO1xuICB9XG5cbiAgZnVuY3Rpb24gZmluZElucHV0RnJvbUxhYmVsVGV4dChsYWJlbFRleHQpIHtcbiAgICBjb25zdCBub3JtID0gbm9ybWFsaXplVGV4dChsYWJlbFRleHQpO1xuICAgIGlmICghbm9ybSkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgbGFiZWxzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdsYWJlbCcpKTtcbiAgICBmb3IgKGNvbnN0IGxhYmVsIG9mIGxhYmVscykge1xuICAgICAgY29uc3QgdGV4dCA9IG5vcm1hbGl6ZVRleHQobGFiZWwudGV4dENvbnRlbnQgfHwgJycpO1xuICAgICAgaWYgKCF0ZXh0IHx8ICF0ZXh0LmluY2x1ZGVzKG5vcm0pKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGh0bWxGb3IgPSBTdHJpbmcobGFiZWwuZ2V0QXR0cmlidXRlKCdmb3InKSB8fCAnJyk7XG4gICAgICBpZiAoaHRtbEZvcikge1xuICAgICAgICBjb25zdCBieUZvciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGh0bWxGb3IpO1xuICAgICAgICBpZiAoYnlGb3IgJiYgaXNVc2FibGVGaWVsZChieUZvcikpIHJldHVybiBieUZvcjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IG5lc3RlZCA9IGxhYmVsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCB0ZXh0YXJlYSwgc2VsZWN0LCBbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXScpO1xuICAgICAgaWYgKG5lc3RlZCAmJiBpc1VzYWJsZUZpZWxkKG5lc3RlZCkpIHJldHVybiBuZXN0ZWQ7XG4gICAgICBjb25zdCBwYXJlbnRJbnB1dCA9IGxhYmVsLnBhcmVudEVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3I/LignaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QsIFtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdJyk7XG4gICAgICBpZiAocGFyZW50SW5wdXQgJiYgaXNVc2FibGVGaWVsZChwYXJlbnRJbnB1dCkpIHJldHVybiBwYXJlbnRJbnB1dDtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBmdW5jdGlvbiByZXNvbHZlRWxlbWVudEZyb21Ta2lsbEhpbnRzKGhpbnRzLCBpbnRlbnQpIHtcbiAgICBpZiAoIWhpbnRzIHx8IHR5cGVvZiBoaW50cyAhPT0gJ29iamVjdCcpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgYnlJZCA9IGhpbnRzLmlkID8gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaGludHMuaWQpIDogbnVsbDtcbiAgICBpZiAoYnlJZCAmJiBpc1VzYWJsZUZpZWxkKGJ5SWQpKSByZXR1cm4gYnlJZDtcblxuICAgIGNvbnN0IHNlbGVjdG9yQ2FuZGlkYXRlcyA9IFtdO1xuICAgIGlmIChoaW50cy5uYW1lKSBzZWxlY3RvckNhbmRpZGF0ZXMucHVzaChgW25hbWU9XCIke2VzY2FwZUNzc1ZhbHVlKGhpbnRzLm5hbWUpfVwiXWApO1xuICAgIGlmIChoaW50cy5hcmlhTGFiZWwpIHNlbGVjdG9yQ2FuZGlkYXRlcy5wdXNoKGBbYXJpYS1sYWJlbD1cIiR7ZXNjYXBlQ3NzVmFsdWUoaGludHMuYXJpYUxhYmVsKX1cIl1gKTtcbiAgICBpZiAoaGludHMuZGF0YVRlc3RJZCkge1xuICAgICAgc2VsZWN0b3JDYW5kaWRhdGVzLnB1c2goYFtkYXRhLXRlc3RpZD1cIiR7ZXNjYXBlQ3NzVmFsdWUoaGludHMuZGF0YVRlc3RJZCl9XCJdYCk7XG4gICAgICBzZWxlY3RvckNhbmRpZGF0ZXMucHVzaChgW2RhdGEtdGVzdC1pZD1cIiR7ZXNjYXBlQ3NzVmFsdWUoaGludHMuZGF0YVRlc3RJZCl9XCJdYCk7XG4gICAgfVxuICAgIGlmIChoaW50cy5wbGFjZWhvbGRlcikgc2VsZWN0b3JDYW5kaWRhdGVzLnB1c2goYFtwbGFjZWhvbGRlcj1cIiR7ZXNjYXBlQ3NzVmFsdWUoaGludHMucGxhY2Vob2xkZXIpfVwiXWApO1xuXG4gICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvckNhbmRpZGF0ZXMpIHtcbiAgICAgIGNvbnN0IGZvdW5kID0gcXVlcnlTZWxlY3RvckRlZXAoc2VsZWN0b3IpO1xuICAgICAgaWYgKGZvdW5kICYmIGlzVXNhYmxlRmllbGQoZm91bmQpKSByZXR1cm4gZm91bmQ7XG4gICAgfVxuXG4gICAgaWYgKGhpbnRzLmxhYmVsVGV4dCkge1xuICAgICAgY29uc3QgYnlMYWJlbCA9IGZpbmRJbnB1dEZyb21MYWJlbFRleHQoaGludHMubGFiZWxUZXh0KTtcbiAgICAgIGlmIChieUxhYmVsKSByZXR1cm4gYnlMYWJlbDtcbiAgICB9XG5cbiAgICBpZiAoaW50ZW50ID09PSAnY2xpY2snICYmIGhpbnRzLnRleHQpIHtcbiAgICAgIGNvbnN0IGNsaWNrYWJsZXMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2J1dHRvbiwgYSwgW3JvbGU9XCJidXR0b25cIl0sIFtyb2xlPVwibGlua1wiXSwgaW5wdXRbdHlwZT1cImJ1dHRvblwiXSwgaW5wdXRbdHlwZT1cInN1Ym1pdFwiXScpKTtcbiAgICAgIGNvbnN0IHRhcmdldE5vcm0gPSBub3JtYWxpemVUZXh0KGhpbnRzLnRleHQpO1xuICAgICAgZm9yIChjb25zdCBub2RlIG9mIGNsaWNrYWJsZXMpIHtcbiAgICAgICAgaWYgKCFpc1VzYWJsZUZpZWxkKG5vZGUpKSBjb250aW51ZTtcbiAgICAgICAgY29uc3Qgbm9kZVRleHQgPSBub3JtYWxpemVUZXh0KG5vZGUudGV4dENvbnRlbnQgfHwgbm9kZS5nZXRBdHRyaWJ1dGUoJ3ZhbHVlJykgfHwgJycpO1xuICAgICAgICBpZiAobm9kZVRleHQgJiYgKG5vZGVUZXh0ID09PSB0YXJnZXROb3JtIHx8IG5vZGVUZXh0LmluY2x1ZGVzKHRhcmdldE5vcm0pIHx8IHRhcmdldE5vcm0uaW5jbHVkZXMobm9kZVRleHQpKSkge1xuICAgICAgICAgIHJldHVybiBub2RlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBtYXRjaERvbVNraWxsKGludGVudCwgdGFyZ2V0KSB7XG4gICAgY29uc3QgdGFyZ2V0Tm9ybSA9IG5vcm1hbGl6ZVNraWxsVGFyZ2V0KHRhcmdldCk7XG4gICAgaWYgKCFpbnRlbnQgfHwgIXRhcmdldE5vcm0pIHJldHVybiBudWxsO1xuXG4gICAgY29uc3Qgc2NvcGUgPSBnZXREb21Ta2lsbFNjb3BlKCk7XG4gICAgY29uc3QgbWVtb3J5ID0gYXdhaXQgcmVhZERvbVNraWxsTWVtb3J5KCk7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KG1lbW9yeSkgfHwgbWVtb3J5Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCByYW5rZWQgPSBtZW1vcnlcbiAgICAgIC5tYXAoKGVudHJ5KSA9PiAoeyBlbnRyeSwgc2NvcmU6IHNjb3JlU2tpbGxFbnRyeShlbnRyeSwgc2NvcGUsIGludGVudCwgdGFyZ2V0Tm9ybSkgfSkpXG4gICAgICAuZmlsdGVyKChpdGVtKSA9PiBpdGVtLnNjb3JlID49IDEwKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGIuc2NvcmUgLSBhLnNjb3JlKTtcblxuICAgIGZvciAoY29uc3QgaXRlbSBvZiByYW5rZWQpIHtcbiAgICAgIGNvbnN0IGVsZW1lbnQgPSByZXNvbHZlRWxlbWVudEZyb21Ta2lsbEhpbnRzKGl0ZW0uZW50cnkuaGludHMsIGludGVudCk7XG4gICAgICBpZiAoIWVsZW1lbnQpIGNvbnRpbnVlO1xuICAgICAgcmV0dXJuIHsgZW50cnk6IGl0ZW0uZW50cnksIGVsZW1lbnQgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGxlYXJuRG9tU2tpbGwoaW50ZW50LCB0YXJnZXQsIGVsZW1lbnQpIHtcbiAgICBjb25zdCB0YXJnZXROb3JtID0gbm9ybWFsaXplU2tpbGxUYXJnZXQodGFyZ2V0KTtcbiAgICBpZiAoIWludGVudCB8fCAhdGFyZ2V0Tm9ybSB8fCAhKGVsZW1lbnQgaW5zdGFuY2VvZiBFbGVtZW50KSkgcmV0dXJuO1xuXG4gICAgY29uc3Qgc2NvcGUgPSBnZXREb21Ta2lsbFNjb3BlKCk7XG4gICAgY29uc3QgaGludHMgPSBnZXRFbGVtZW50SGludHMoZWxlbWVudCk7XG4gICAgaWYgKCFoaW50cykgcmV0dXJuO1xuXG4gICAgY29uc3Qga2V5ID0gYCR7c2NvcGUuaG9zdH18JHtzY29wZS5wYXRoUHJlZml4fXwke2ludGVudH18JHt0YXJnZXROb3JtfWA7XG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblxuICAgIGNvbnN0IG1lbW9yeSA9IGF3YWl0IHJlYWREb21Ta2lsbE1lbW9yeSgpO1xuICAgIGNvbnN0IG5leHQgPSBBcnJheS5pc0FycmF5KG1lbW9yeSkgPyBbLi4ubWVtb3J5XSA6IFtdO1xuICAgIGNvbnN0IGlkeCA9IG5leHQuZmluZEluZGV4KChlbnRyeSkgPT4gZW50cnk/LmtleSA9PT0ga2V5KTtcblxuICAgIGlmIChpZHggPj0gMCkge1xuICAgICAgY29uc3QgcHJldiA9IG5leHRbaWR4XTtcbiAgICAgIG5leHRbaWR4XSA9IHtcbiAgICAgICAgLi4ucHJldixcbiAgICAgICAgaGludHM6IHsgLi4ucHJldi5oaW50cywgLi4uaGludHMgfSxcbiAgICAgICAgdGFyZ2V0OiB0YXJnZXROb3JtLFxuICAgICAgICBzdWNjZXNzQ291bnQ6IE51bWJlcihwcmV2LnN1Y2Nlc3NDb3VudCB8fCAwKSArIDEsXG4gICAgICAgIGxhc3RVc2VkOiBub3csXG4gICAgICAgIHVwZGF0ZWRBdDogbm93XG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXh0LnB1c2goe1xuICAgICAgICBrZXksXG4gICAgICAgIGhvc3Q6IHNjb3BlLmhvc3QsXG4gICAgICAgIHBhdGhQcmVmaXg6IHNjb3BlLnBhdGhQcmVmaXgsXG4gICAgICAgIGludGVudCxcbiAgICAgICAgdGFyZ2V0OiB0YXJnZXROb3JtLFxuICAgICAgICBoaW50cyxcbiAgICAgICAgc3VjY2Vzc0NvdW50OiAxLFxuICAgICAgICBjcmVhdGVkQXQ6IG5vdyxcbiAgICAgICAgdXBkYXRlZEF0OiBub3csXG4gICAgICAgIGxhc3RVc2VkOiBub3dcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGF3YWl0IHdyaXRlRG9tU2tpbGxNZW1vcnkobmV4dCk7XG4gIH1cblxuICBmdW5jdGlvbiBub3JtYWxpemVOYXR1cmFsQ29tbWFuZEtleSh2YWx1ZSkge1xuICAgIHJldHVybiBTdHJpbmcodmFsdWUgfHwgJycpXG4gICAgICAudG9Mb3dlckNhc2UoKVxuICAgICAgLnJlcGxhY2UoL1xcYmNvbmZpcm1hdG9uXFxiL2csICdjb25maXJtYXRpb24nKVxuICAgICAgLnJlcGxhY2UoL1xcYmNvbmZpcm10aW9uXFxiL2csICdjb25maXJtYXRpb24nKVxuICAgICAgLnJlcGxhY2UoL1xcYmNvbmZyaW1hdGlvblxcYi9nLCAnY29uZmlybWF0aW9uJylcbiAgICAgIC5yZXBsYWNlKC9cXGJjb25maW1hdGlvblxcYi9nLCAnY29uZmlybWF0aW9uJylcbiAgICAgIC5yZXBsYWNlKC9cXGJhZHJlc3NcXGIvZywgJ2FkZHJlc3MnKVxuICAgICAgLnJlcGxhY2UoL1xcYmVtaWFsXFxiL2csICdlbWFpbCcpXG4gICAgICAucmVwbGFjZSgvW15hLXowLTlcXHNfLV0rL2csICcgJylcbiAgICAgIC5yZXBsYWNlKC9cXHMrL2csICcgJylcbiAgICAgIC50cmltKClcbiAgICAgIC5zbGljZSgwLCAxODApO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJ1bmVOYXR1cmFsQ29tbWFuZE1lbW9yeShlbnRyaWVzKSB7XG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCBieUtleSA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IHJhdyBvZiBBcnJheS5pc0FycmF5KGVudHJpZXMpID8gZW50cmllcyA6IFtdKSB7XG4gICAgICBpZiAoIXJhdyB8fCB0eXBlb2YgcmF3ICE9PSAnb2JqZWN0JykgY29udGludWU7XG4gICAgICBjb25zdCBrZXkgPSBTdHJpbmcocmF3LmtleSB8fCAnJykudHJpbSgpO1xuICAgICAgaWYgKCFrZXkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgbGFzdFVzZWQgPSBOdW1iZXIocmF3Lmxhc3RVc2VkIHx8IHJhdy51cGRhdGVkQXQgfHwgcmF3LmNyZWF0ZWRBdCB8fCAwKTtcbiAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKGxhc3RVc2VkKSB8fCBsYXN0VXNlZCA8PSAwKSBjb250aW51ZTtcbiAgICAgIGlmIChub3cgLSBsYXN0VXNlZCA+IE5BVFVSQUxfQ09NTUFORF9NRU1PUllfVFRMX01TKSBjb250aW51ZTtcbiAgICAgIGJ5S2V5LnNldChrZXksIHtcbiAgICAgICAga2V5LFxuICAgICAgICBob3N0OiBTdHJpbmcocmF3Lmhvc3QgfHwgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpLFxuICAgICAgICBwYXRoUHJlZml4OiBTdHJpbmcocmF3LnBhdGhQcmVmaXggfHwgJy8nKS50cmltKCkgfHwgJy8nLFxuICAgICAgICBjb21tYW5kOiBTdHJpbmcocmF3LmNvbW1hbmQgfHwgJycpLnRyaW0oKSxcbiAgICAgICAgY2Fub25pY2FsQ29tbWFuZDogU3RyaW5nKHJhdy5jYW5vbmljYWxDb21tYW5kIHx8ICcnKS50cmltKCksXG4gICAgICAgIHN1Y2Nlc3NDb3VudDogTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihOdW1iZXIocmF3LnN1Y2Nlc3NDb3VudCB8fCAxKSkpLFxuICAgICAgICByZXBhaXJlZENvdW50OiBNYXRoLm1heCgwLCBNYXRoLmZsb29yKE51bWJlcihyYXcucmVwYWlyZWRDb3VudCB8fCAwKSkpLFxuICAgICAgICBsYXN0VXNlZFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBBcnJheS5mcm9tKGJ5S2V5LnZhbHVlcygpKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IChiLmxhc3RVc2VkIHx8IDApIC0gKGEubGFzdFVzZWQgfHwgMCkpXG4gICAgICAuc2xpY2UoMCwgTkFUVVJBTF9DT01NQU5EX01FTU9SWV9NQVgpO1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gcmVhZE5hdHVyYWxDb21tYW5kTWVtb3J5KCkge1xuICAgIGlmIChBcnJheS5pc0FycmF5KG5hdHVyYWxDb21tYW5kTWVtb3J5Q2FjaGUpKSByZXR1cm4gbmF0dXJhbENvbW1hbmRNZW1vcnlDYWNoZTtcbiAgICBpZiAobmF0dXJhbENvbW1hbmRNZW1vcnlMb2FkUHJvbWlzZSkgcmV0dXJuIG5hdHVyYWxDb21tYW5kTWVtb3J5TG9hZFByb21pc2U7XG5cbiAgICBuYXR1cmFsQ29tbWFuZE1lbW9yeUxvYWRQcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChbTkFUVVJBTF9DT01NQU5EX01FTU9SWV9LRVldLCAocmVzdWx0KSA9PiB7XG4gICAgICAgICAgaWYgKGNocm9tZS5ydW50aW1lPy5sYXN0RXJyb3IpIHtcbiAgICAgICAgICAgIG5hdHVyYWxDb21tYW5kTWVtb3J5Q2FjaGUgPSBbXTtcbiAgICAgICAgICAgIG5hdHVyYWxDb21tYW5kTWVtb3J5TG9hZFByb21pc2UgPSBudWxsO1xuICAgICAgICAgICAgcmVzb2x2ZShuYXR1cmFsQ29tbWFuZE1lbW9yeUNhY2hlKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgbmF0dXJhbENvbW1hbmRNZW1vcnlDYWNoZSA9IHBydW5lTmF0dXJhbENvbW1hbmRNZW1vcnkocmVzdWx0Py5bTkFUVVJBTF9DT01NQU5EX01FTU9SWV9LRVldKTtcbiAgICAgICAgICBuYXR1cmFsQ29tbWFuZE1lbW9yeUxvYWRQcm9taXNlID0gbnVsbDtcbiAgICAgICAgICByZXNvbHZlKG5hdHVyYWxDb21tYW5kTWVtb3J5Q2FjaGUpO1xuICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgICAgbmF0dXJhbENvbW1hbmRNZW1vcnlDYWNoZSA9IFtdO1xuICAgICAgICBuYXR1cmFsQ29tbWFuZE1lbW9yeUxvYWRQcm9taXNlID0gbnVsbDtcbiAgICAgICAgcmVzb2x2ZShuYXR1cmFsQ29tbWFuZE1lbW9yeUNhY2hlKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBuYXR1cmFsQ29tbWFuZE1lbW9yeUxvYWRQcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gd3JpdGVOYXR1cmFsQ29tbWFuZE1lbW9yeShlbnRyaWVzKSB7XG4gICAgY29uc3QgbmV4dCA9IHBydW5lTmF0dXJhbENvbW1hbmRNZW1vcnkoZW50cmllcyk7XG4gICAgbmF0dXJhbENvbW1hbmRNZW1vcnlDYWNoZSA9IG5leHQ7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IFtOQVRVUkFMX0NPTU1BTkRfTUVNT1JZX0tFWV06IG5leHQgfSwgKCkgPT4gcmVzb2x2ZSgpKTtcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgIC8vIE5vbi1mYXRhbDsgY29tbWFuZCBleGVjdXRpb24gc3RpbGwgc3VjY2VlZHMgZXZlbiBpZiBtZW1vcnkgcGVyc2lzdGVuY2UgZmFpbHMuXG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gcmVtZW1iZXJOYXR1cmFsQ29tbWFuZChjb21tYW5kLCBjYW5vbmljYWxDb21tYW5kLCByZXBhaXJlZCA9IGZhbHNlKSB7XG4gICAgY29uc3QgY29tbWFuZE5vcm0gPSBub3JtYWxpemVOYXR1cmFsQ29tbWFuZEtleShjb21tYW5kKTtcbiAgICBjb25zdCBjYW5vbmljYWxOb3JtID0gbm9ybWFsaXplTmF0dXJhbENvbW1hbmRLZXkoY2Fub25pY2FsQ29tbWFuZCB8fCBjb21tYW5kKTtcbiAgICBpZiAoIWNvbW1hbmROb3JtIHx8ICFjYW5vbmljYWxOb3JtKSByZXR1cm47XG5cbiAgICBjb25zdCBzY29wZSA9IGdldERvbVNraWxsU2NvcGUoKTtcbiAgICBjb25zdCBrZXkgPSBgJHtzY29wZS5ob3N0fXwke3Njb3BlLnBhdGhQcmVmaXh9fCR7Y29tbWFuZE5vcm19YDtcbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgIGNvbnN0IG1lbW9yeSA9IGF3YWl0IHJlYWROYXR1cmFsQ29tbWFuZE1lbW9yeSgpO1xuICAgIGNvbnN0IG5leHQgPSBBcnJheS5pc0FycmF5KG1lbW9yeSkgPyBbLi4ubWVtb3J5XSA6IFtdO1xuICAgIGNvbnN0IGlkeCA9IG5leHQuZmluZEluZGV4KChlbnRyeSkgPT4gZW50cnk/LmtleSA9PT0ga2V5KTtcblxuICAgIGlmIChpZHggPj0gMCkge1xuICAgICAgY29uc3QgcHJldiA9IG5leHRbaWR4XTtcbiAgICAgIG5leHRbaWR4XSA9IHtcbiAgICAgICAgLi4ucHJldixcbiAgICAgICAgY2Fub25pY2FsQ29tbWFuZDogY2Fub25pY2FsTm9ybSxcbiAgICAgICAgc3VjY2Vzc0NvdW50OiBOdW1iZXIocHJldi5zdWNjZXNzQ291bnQgfHwgMCkgKyAxLFxuICAgICAgICByZXBhaXJlZENvdW50OiBOdW1iZXIocHJldi5yZXBhaXJlZENvdW50IHx8IDApICsgKHJlcGFpcmVkID8gMSA6IDApLFxuICAgICAgICBsYXN0VXNlZDogbm93LFxuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dC5wdXNoKHtcbiAgICAgICAga2V5LFxuICAgICAgICBob3N0OiBzY29wZS5ob3N0LFxuICAgICAgICBwYXRoUHJlZml4OiBzY29wZS5wYXRoUHJlZml4LFxuICAgICAgICBjb21tYW5kOiBjb21tYW5kTm9ybSxcbiAgICAgICAgY2Fub25pY2FsQ29tbWFuZDogY2Fub25pY2FsTm9ybSxcbiAgICAgICAgc3VjY2Vzc0NvdW50OiAxLFxuICAgICAgICByZXBhaXJlZENvdW50OiByZXBhaXJlZCA/IDEgOiAwLFxuICAgICAgICBjcmVhdGVkQXQ6IG5vdyxcbiAgICAgICAgdXBkYXRlZEF0OiBub3csXG4gICAgICAgIGxhc3RVc2VkOiBub3dcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGF3YWl0IHdyaXRlTmF0dXJhbENvbW1hbmRNZW1vcnkobmV4dCk7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBtYXRjaE5hdHVyYWxDb21tYW5kTWVtb3J5KGNvbW1hbmQpIHtcbiAgICBjb25zdCBjb21tYW5kTm9ybSA9IG5vcm1hbGl6ZU5hdHVyYWxDb21tYW5kS2V5KGNvbW1hbmQpO1xuICAgIGlmICghY29tbWFuZE5vcm0pIHJldHVybiBudWxsO1xuXG4gICAgY29uc3Qgc2NvcGUgPSBnZXREb21Ta2lsbFNjb3BlKCk7XG4gICAgY29uc3QgbWVtb3J5ID0gYXdhaXQgcmVhZE5hdHVyYWxDb21tYW5kTWVtb3J5KCk7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KG1lbW9yeSkgfHwgbWVtb3J5Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCByYW5rZWQgPSBtZW1vcnlcbiAgICAgIC5tYXAoKGVudHJ5KSA9PiB7XG4gICAgICAgIGlmICghZW50cnkgfHwgZW50cnkuY29tbWFuZCAhPT0gY29tbWFuZE5vcm0pIHJldHVybiBudWxsO1xuICAgICAgICBsZXQgc2NvcmUgPSAwO1xuICAgICAgICBpZiAoZW50cnkuaG9zdCA9PT0gc2NvcGUuaG9zdCkgc2NvcmUgKz0gNTtcbiAgICAgICAgaWYgKGVudHJ5LnBhdGhQcmVmaXggPT09IHNjb3BlLnBhdGhQcmVmaXgpIHNjb3JlICs9IDI7XG4gICAgICAgIHNjb3JlICs9IE1hdGgubWluKDMsIE51bWJlcihlbnRyeS5zdWNjZXNzQ291bnQgfHwgMCkpO1xuICAgICAgICByZXR1cm4geyBlbnRyeSwgc2NvcmUgfTtcbiAgICAgIH0pXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAuc29ydCgoYSwgYikgPT4gYi5zY29yZSAtIGEuc2NvcmUpO1xuXG4gICAgcmV0dXJuIHJhbmtlZFswXT8uZW50cnkgfHwgbnVsbDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGJ1aWxkTmF0dXJhbENvbW1hbmRDYW5kaWRhdGVzKGNvbW1hbmQpIHtcbiAgICBjb25zdCByYXcgPSBTdHJpbmcoY29tbWFuZCB8fCAnJykudHJpbSgpO1xuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBbXTtcbiAgICBjb25zdCBzZWVuID0gbmV3IFNldCgpO1xuICAgIGNvbnN0IHB1c2ggPSAodmFsdWUpID0+IHtcbiAgICAgIGNvbnN0IHRleHQgPSBTdHJpbmcodmFsdWUgfHwgJycpLnRyaW0oKTtcbiAgICAgIGlmICghdGV4dCkgcmV0dXJuO1xuICAgICAgY29uc3Qga2V5ID0gdGV4dC50b0xvd2VyQ2FzZSgpO1xuICAgICAgaWYgKHNlZW4uaGFzKGtleSkpIHJldHVybjtcbiAgICAgIHNlZW4uYWRkKGtleSk7XG4gICAgICBjYW5kaWRhdGVzLnB1c2godGV4dCk7XG4gICAgfTtcblxuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVOYXR1cmFsQ29tbWFuZEtleShyYXcpO1xuICAgIHB1c2gocmF3KTtcbiAgICBwdXNoKG5vcm1hbGl6ZWQpO1xuXG4gICAgbGV0IGhlYWxlZCA9IHJhdztcbiAgICBoZWFsZWQgPSBoZWFsZWRcbiAgICAgIC5yZXBsYWNlKC9cXGJjb25maXJtYXRvblxcYi9naSwgJ2NvbmZpcm1hdGlvbicpXG4gICAgICAucmVwbGFjZSgvXFxiY29uZmlybXRpb25cXGIvZ2ksICdjb25maXJtYXRpb24nKVxuICAgICAgLnJlcGxhY2UoL1xcYmNvbmZyaW1hdGlvblxcYi9naSwgJ2NvbmZpcm1hdGlvbicpXG4gICAgICAucmVwbGFjZSgvXFxiY29uZmltYXRpb25cXGIvZ2ksICdjb25maXJtYXRpb24nKTtcbiAgICBwdXNoKGhlYWxlZCk7XG5cbiAgICBjb25zdCBtYXRjaEZpbGxDb3B5ID0gaGVhbGVkLm1hdGNoKC9cXGJmaWxsKD86XFxzK2luKT9cXHMrKC4rPylcXHMrY29weVxccytmcm9tXFxzKyguKykkL2kpO1xuICAgIGlmIChtYXRjaEZpbGxDb3B5KSB7XG4gICAgICBwdXNoKGBmaWxsICR7bWF0Y2hGaWxsQ29weVsxXX0gZnJvbSAke21hdGNoRmlsbENvcHlbMl19YCk7XG4gICAgfVxuXG4gICAgY29uc3QgbWF0Y2hDb3B5SW50byA9IGhlYWxlZC5tYXRjaCgvXFxiY29weVxccysoLis/KVxccysoPzppbnRvfHRvKVxccysoLispJC9pKTtcbiAgICBpZiAobWF0Y2hDb3B5SW50bykge1xuICAgICAgcHVzaChgZmlsbCAke21hdGNoQ29weUludG9bMl19IGZyb20gJHttYXRjaENvcHlJbnRvWzFdfWApO1xuICAgIH1cblxuICAgIGNvbnN0IG1hdGNoQ29weUZyb20gPSBoZWFsZWQubWF0Y2goL1xcYmNvcHlcXHMrZnJvbVxccysoLis/KVxccysoPzppbnRvfHRvKVxccysoLispJC9pKTtcbiAgICBpZiAobWF0Y2hDb3B5RnJvbSkge1xuICAgICAgcHVzaChgZmlsbCAke21hdGNoQ29weUZyb21bMl19IGZyb20gJHttYXRjaENvcHlGcm9tWzFdfWApO1xuICAgIH1cblxuICAgIHJldHVybiBjYW5kaWRhdGVzO1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZU5hdHVyYWxDb21tYW5kKGNvbW1hbmQpIHtcbiAgICBpZiAoIXdpbmRvdy5CaWxnZUNvcnRleCAmJiAhd2luZG93Ll9fYmlsZ2VfY29ydGV4X2xvYWRlZCkge1xuICAgICAgcmV0dXJuIHsgZXJyb3I6ICdDb3J0ZXggbW9kdWxlIG5vdCBsb2FkZWQnLCBwYXJzZWQ6IG51bGwsIGV4ZWN1dGFibGU6IG51bGwgfTtcbiAgICB9XG5cbiAgICBjb25zdCBnZXRDb3J0ZXhDb250ZXh0ID0gKCkgPT4ge1xuICAgICAgY29uc3QgcnVudGltZSA9IHdpbmRvdy5fX2JpbGdlX3J1bnRpbWUgfHwgbnVsbDtcbiAgICAgIGNvbnN0IGN0eCA9IHt9O1xuICAgICAgaWYgKHJ1bnRpbWU/LmN1cnNvciAmJiBOdW1iZXIuaXNGaW5pdGUocnVudGltZS5jdXJzb3IueCkgJiYgTnVtYmVyLmlzRmluaXRlKHJ1bnRpbWUuY3Vyc29yLnkpKSB7XG4gICAgICAgIGN0eC5jdXJzb3IgPSB7IHg6IHJ1bnRpbWUuY3Vyc29yLngsIHk6IHJ1bnRpbWUuY3Vyc29yLnkgfTtcbiAgICAgIH1cbiAgICAgIGlmIChydW50aW1lPy5sYXN0RWxlbWVudCBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcbiAgICAgICAgY3R4Lmxhc3RFbGVtZW50ID0gcnVudGltZS5sYXN0RWxlbWVudDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBjdHg7XG4gICAgfTtcblxuICAgIGNvbnN0IHRyeVBhcnNlID0gKGNhbmRpZGF0ZSkgPT4ge1xuICAgICAgY29uc3QgcGFyc2VkID0gd2luZG93LkJpbGdlQ29ydGV4LnBhcnNlQ29tbWFuZChjYW5kaWRhdGUsIGdldENvcnRleENvbnRleHQoKSk7XG4gICAgICBpZiAoIXBhcnNlZCkgcmV0dXJuIG51bGw7XG4gICAgICBjb25zdCBleGVjdXRhYmxlID0gd2luZG93LkJpbGdlQ29ydGV4LnRvRXhlY3V0YWJsZUFjdGlvbihwYXJzZWQpO1xuICAgICAgaWYgKCFleGVjdXRhYmxlKSByZXR1cm4gbnVsbDtcbiAgICAgIHJldHVybiB7IHBhcnNlZCwgZXhlY3V0YWJsZSwgY2Fub25pY2FsQ29tbWFuZDogU3RyaW5nKHBhcnNlZC5yYXcgfHwgY2FuZGlkYXRlIHx8ICcnKS50cmltKCkgfHwgU3RyaW5nKGNhbmRpZGF0ZSB8fCAnJykudHJpbSgpIH07XG4gICAgfTtcblxuICAgIC8vIDEpIERpcmVjdCBwYXJzZVxuICAgIGNvbnN0IGRpcmVjdCA9IHRyeVBhcnNlKGNvbW1hbmQpO1xuICAgIGlmIChkaXJlY3QpIHJldHVybiB7IC4uLmRpcmVjdCwgcmVwYWlyZWQ6IGZhbHNlLCBjb21tYW5kTWVtb3J5SGl0OiBmYWxzZSwgcmVjb3ZlcnlQYXRoOiAnZGlyZWN0JyB9O1xuXG4gICAgLy8gMikgTGVhcm5lZCBjb21tYW5kIG1lbW9yeVxuICAgIGNvbnN0IHJlbWVtYmVyZWQgPSBhd2FpdCBtYXRjaE5hdHVyYWxDb21tYW5kTWVtb3J5KGNvbW1hbmQpO1xuICAgIGlmIChyZW1lbWJlcmVkPy5jYW5vbmljYWxDb21tYW5kKSB7XG4gICAgICBjb25zdCBmcm9tTWVtb3J5ID0gdHJ5UGFyc2UocmVtZW1iZXJlZC5jYW5vbmljYWxDb21tYW5kKTtcbiAgICAgIGlmIChmcm9tTWVtb3J5KSB7XG4gICAgICAgIHJldHVybiB7IC4uLmZyb21NZW1vcnksIHJlcGFpcmVkOiB0cnVlLCBjb21tYW5kTWVtb3J5SGl0OiB0cnVlLCByZWNvdmVyeVBhdGg6ICdtZW1vcnknIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gMykgSGV1cmlzdGljIHNlbGYtaGVhbCByZXdyaXRlc1xuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBidWlsZE5hdHVyYWxDb21tYW5kQ2FuZGlkYXRlcyhjb21tYW5kKTtcbiAgICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICBjb25zdCByZWNvdmVyZWQgPSB0cnlQYXJzZShjYW5kaWRhdGUpO1xuICAgICAgaWYgKHJlY292ZXJlZCkge1xuICAgICAgICByZXR1cm4geyAuLi5yZWNvdmVyZWQsIHJlcGFpcmVkOiB0cnVlLCBjb21tYW5kTWVtb3J5SGl0OiBmYWxzZSwgcmVjb3ZlcnlQYXRoOiAncmV3cml0ZScgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4geyBlcnJvcjogJ0NvdWxkIG5vdCB1bmRlcnN0YW5kIGNvbW1hbmQgYWZ0ZXIgcmVjb3ZlcnkgYXR0ZW1wdHMnLCBwYXJzZWQ6IG51bGwsIGV4ZWN1dGFibGU6IG51bGwgfTtcbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIHJ1bk5hdHVyYWxDb21tYW5kQXV0b0RlYnVnKGNvbW1hbmQpIHtcbiAgICBjb25zdCB0ZXh0ID0gbm9ybWFsaXplTmF0dXJhbENvbW1hbmRLZXkoY29tbWFuZCk7XG4gICAgaWYgKCF0ZXh0KSByZXR1cm4gbnVsbDtcblxuICAgIC8vIEF1dG8tZGVidWcgc2NyaXB0IG1vZGUgZm9yIFwiZmlsbCBYIGZyb20gWVwiIC8gXCJjb3B5IFkgaW50byBYXCIgcGF0dGVybnMuXG4gICAgbGV0IHRhcmdldCA9ICcnO1xuICAgIGxldCBzb3VyY2UgPSAnJztcbiAgICBsZXQgbWF0Y2ggPSB0ZXh0Lm1hdGNoKC9cXGJmaWxsKD86XFxzK2luKT9cXHMrKC4rPylcXHMrKD86Y29weVxccytmcm9tfGZyb218dXNpbmcpXFxzKyguKykkL2kpO1xuICAgIGlmIChtYXRjaCkge1xuICAgICAgdGFyZ2V0ID0gU3RyaW5nKG1hdGNoWzFdIHx8ICcnKS50cmltKCk7XG4gICAgICBzb3VyY2UgPSBTdHJpbmcobWF0Y2hbMl0gfHwgJycpLnRyaW0oKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbWF0Y2ggPSB0ZXh0Lm1hdGNoKC9cXGJjb3B5XFxzKyguKz8pXFxzKyg/OmludG98dG8pXFxzKyguKykkL2kpO1xuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIHNvdXJjZSA9IFN0cmluZyhtYXRjaFsxXSB8fCAnJykudHJpbSgpO1xuICAgICAgICB0YXJnZXQgPSBTdHJpbmcobWF0Y2hbMl0gfHwgJycpLnRyaW0oKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIXRhcmdldCB8fCAhc291cmNlKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IHNvdXJjZUVsZW1lbnQgPSBmaW5kRWxlbWVudEJ5SGV1cmlzdGljKHsgbGFiZWw6IHNvdXJjZSwgZmllbGQ6IHNvdXJjZSwgbmFtZTogc291cmNlLCBwbGFjZWhvbGRlcjogc291cmNlIH0sIG51bGwpO1xuICAgIGNvbnN0IHRhcmdldEVsZW1lbnQgPSBmaW5kRWxlbWVudEJ5SGV1cmlzdGljKHsgbGFiZWw6IHRhcmdldCwgZmllbGQ6IHRhcmdldCwgbmFtZTogdGFyZ2V0LCBwbGFjZWhvbGRlcjogdGFyZ2V0IH0sIG51bGwpO1xuICAgIGlmICghc291cmNlRWxlbWVudCB8fCAhdGFyZ2V0RWxlbWVudCkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBzb3VyY2VUYWcgPSBTdHJpbmcoc291cmNlRWxlbWVudC50YWdOYW1lIHx8ICcnKS50b1VwcGVyQ2FzZSgpO1xuICAgIGxldCBzb3VyY2VWYWx1ZSA9ICcnO1xuICAgIGlmIChzb3VyY2VUYWcgPT09ICdJTlBVVCcgfHwgc291cmNlVGFnID09PSAnVEVYVEFSRUEnIHx8IHNvdXJjZVRhZyA9PT0gJ1NFTEVDVCcpIHtcbiAgICAgIHNvdXJjZVZhbHVlID0gU3RyaW5nKHNvdXJjZUVsZW1lbnQudmFsdWUgfHwgJycpO1xuICAgIH0gZWxzZSBpZiAoc291cmNlRWxlbWVudC5pc0NvbnRlbnRFZGl0YWJsZSkge1xuICAgICAgc291cmNlVmFsdWUgPSBTdHJpbmcoc291cmNlRWxlbWVudC50ZXh0Q29udGVudCB8fCAnJyk7XG4gICAgfVxuICAgIGlmICghc291cmNlVmFsdWUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgU291cmNlIGZpZWxkIFwiJHtzb3VyY2V9XCIgaXMgZW1wdHlgKTtcbiAgICB9XG5cbiAgICB0YXJnZXRFbGVtZW50LmZvY3VzKCk7XG4gICAgaWYgKHRhcmdldEVsZW1lbnQudGFnTmFtZSA9PT0gJ0lOUFVUJyB8fCB0YXJnZXRFbGVtZW50LnRhZ05hbWUgPT09ICdURVhUQVJFQScpIHtcbiAgICAgIHNldE5hdGl2ZVZhbHVlKHRhcmdldEVsZW1lbnQsIHNvdXJjZVZhbHVlKTtcbiAgICAgIGRpc3BhdGNoSW5wdXRFdmVudHModGFyZ2V0RWxlbWVudCk7XG4gICAgfSBlbHNlIGlmICh0YXJnZXRFbGVtZW50LmlzQ29udGVudEVkaXRhYmxlKSB7XG4gICAgICB0YXJnZXRFbGVtZW50LnRleHRDb250ZW50ID0gc291cmNlVmFsdWU7XG4gICAgICBkaXNwYXRjaElucHV0RXZlbnRzKHRhcmdldEVsZW1lbnQpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICBsZWFybkRvbVNraWxsKCd0eXBlJywgc291cmNlLCBzb3VyY2VFbGVtZW50KSxcbiAgICAgIGxlYXJuRG9tU2tpbGwoJ3R5cGUnLCB0YXJnZXQsIHRhcmdldEVsZW1lbnQpXG4gICAgXSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzOiAndHlwZWQnLFxuICAgICAgdGFyZ2V0LFxuICAgICAgY29waWVkRnJvbTogc291cmNlLFxuICAgICAgdmFsdWU6IHNvdXJjZVZhbHVlLnNsaWNlKDAsIDUwKSxcbiAgICAgIGF1dG9EZWJ1ZzogdHJ1ZSxcbiAgICAgIGRlYnVnTW9kZTogJ3NjcmlwdC1yZWNvdmVyeSdcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEZpbmQgZWxlbWVudCB1c2luZyBoZXVyaXN0aWMgbWF0Y2hpbmcgd2hlbiBzZWxlY3RvciBmYWlsc1xuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxdWVzdCAtIFJlcXVlc3Qgd2l0aCBmaWVsZCwgbmFtZSwgbGFiZWwsIHBsYWNlaG9sZGVyIGhpbnRzXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBzZWxlY3RvciAtIE9yaWdpbmFsIHNlbGVjdG9yIGZvciBoaW50IGV4dHJhY3Rpb25cbiAgICogQHJldHVybnMge0VsZW1lbnR8bnVsbH0gTWF0Y2hlZCBlbGVtZW50IG9yIG51bGxcbiAgICovXG4gIGZ1bmN0aW9uIGZpbmRFbGVtZW50QnlIZXVyaXN0aWMocmVxdWVzdCwgc2VsZWN0b3IpIHtcbiAgICBjb25zdCB0b2tlblNldCA9IG5ldyBTZXQoKTtcbiAgICBjb25zdCByYXdIaW50cyA9IFtyZXF1ZXN0LmZpZWxkLCByZXF1ZXN0Lm5hbWUsIHJlcXVlc3QubGFiZWwsIHJlcXVlc3QucGxhY2Vob2xkZXJdO1xuICAgIGxldCBwcmVmZXJyZWRUYWcgPSAnJztcblxuICAgIC8vIEV4dHJhY3QgaGludHMgZnJvbSBzZWxlY3RvclxuICAgIGlmIChzZWxlY3Rvcikge1xuICAgICAgY29uc3QgcGFyc2VkID0gZXh0cmFjdFNlbGVjdG9ySGludHMoc2VsZWN0b3IpO1xuICAgICAgcmF3SGludHMucHVzaCguLi5wYXJzZWQuaGludHMpO1xuICAgICAgaWYgKCFwcmVmZXJyZWRUYWcgJiYgcGFyc2VkLnByZWZlcnJlZFRhZykgcHJlZmVycmVkVGFnID0gcGFyc2VkLnByZWZlcnJlZFRhZztcbiAgICB9XG5cbiAgICAvLyBUb2tlbml6ZSBhbGwgaGludHNcbiAgICBmb3IgKGNvbnN0IGhpbnQgb2YgcmF3SGludHMpIHtcbiAgICAgIGZvciAoY29uc3QgdG9rZW4gb2YgdG9rZW5pemUoaGludCkpIHRva2VuU2V0LmFkZCh0b2tlbik7XG4gICAgfVxuXG4gICAgLy8gRXhwYW5kIHN5bm9ueW1zXG4gICAgY29uc3QgZXhwYW5kZWQgPSBuZXcgU2V0KHRva2VuU2V0KTtcbiAgICBpZiAoZXhwYW5kZWQuaGFzKCdmaXJzdCcpKSBleHBhbmRlZC5hZGQoJ2dpdmVuJyk7XG4gICAgaWYgKGV4cGFuZGVkLmhhcygnbGFzdCcpKSB7XG4gICAgICBleHBhbmRlZC5hZGQoJ2ZhbWlseScpO1xuICAgICAgZXhwYW5kZWQuYWRkKCdzdXJuYW1lJyk7XG4gICAgfVxuICAgIGlmIChleHBhbmRlZC5oYXMoJ3Bob25lJykpIGV4cGFuZGVkLmFkZCgndGVsJyk7XG4gICAgaWYgKGV4cGFuZGVkLmhhcygnbWFpbCcpKSBleHBhbmRlZC5hZGQoJ2VtYWlsJyk7XG4gICAgaWYgKGV4cGFuZGVkLmhhcygnZW1haWwnKSkgZXhwYW5kZWQuYWRkKCdtYWlsJyk7XG5cbiAgICBjb25zdCB0b2tlbnMgPSBBcnJheS5mcm9tKGV4cGFuZGVkKTtcbiAgICBpZiAoIXRva2Vucy5sZW5ndGgpIHJldHVybiBudWxsO1xuXG4gICAgLy8gRmluZCBhbGwgY2FuZGlkYXRlIGVsZW1lbnRzXG4gICAgY29uc3QgY2FuZGlkYXRlcyA9IEFycmF5LmZyb20oXG4gICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dCwgdGV4dGFyZWEsIHNlbGVjdCwgYnV0dG9uLCBbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXSwgW3JvbGU9XCJ0ZXh0Ym94XCJdLCBbcm9sZT1cImJ1dHRvblwiXSwgYScpXG4gICAgKS5maWx0ZXIoaXNVc2FibGVGaWVsZCk7XG5cbiAgICBjb25zdCBwaHJhc2UgPSBub3JtYWxpemVUZXh0KHRva2Vucy5qb2luKCcnKSk7XG4gICAgbGV0IGJlc3QgPSBudWxsO1xuXG4gICAgZm9yIChjb25zdCBlbGVtZW50IG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgIGNvbnN0IGhheXN0YWNrID0gZWxlbWVudFNlYXJjaFRleHQoZWxlbWVudCk7XG4gICAgICBpZiAoIWhheXN0YWNrKSBjb250aW51ZTtcbiAgICAgIGxldCBzY29yZSA9IDA7XG5cbiAgICAgIGZvciAoY29uc3QgdG9rZW4gb2YgdG9rZW5zKSB7XG4gICAgICAgIGNvbnN0IG5vcm1hbGl6ZWRUb2tlbiA9IG5vcm1hbGl6ZVRleHQodG9rZW4pO1xuICAgICAgICBpZiAoIW5vcm1hbGl6ZWRUb2tlbikgY29udGludWU7XG4gICAgICAgIGlmIChoYXlzdGFjay5pbmNsdWRlcyhub3JtYWxpemVkVG9rZW4pKSB7XG4gICAgICAgICAgc2NvcmUgKz0gbm9ybWFsaXplZFRva2VuLmxlbmd0aCA+PSA0ID8gMiA6IDE7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHBocmFzZSAmJiBoYXlzdGFjay5pbmNsdWRlcyhwaHJhc2UpKSBzY29yZSArPSAzO1xuICAgICAgaWYgKHByZWZlcnJlZFRhZyAmJiBlbGVtZW50LnRhZ05hbWUudG9Mb3dlckNhc2UoKSA9PT0gcHJlZmVycmVkVGFnKSBzY29yZSArPSAxO1xuXG4gICAgICBpZiAoIWJlc3QgfHwgc2NvcmUgPiBiZXN0LnNjb3JlKSB7XG4gICAgICAgIGJlc3QgPSB7IGVsZW1lbnQsIHNjb3JlIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFiZXN0IHx8IGJlc3Quc2NvcmUgPD0gMCkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIGJlc3QuZWxlbWVudDtcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIEdsb2JhbCBFeHBvcnRzIGZvciBTZWxmLUhlYWxpbmcgRW5naW5lIEludGVncmF0aW9uXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIEV4cG9zZSBrZXkgZnVuY3Rpb25zIGZvciBzZWxmLWhlYWxpbmcgc3RyYXRlZ2llcyB0byB1c2VcbiAgd2luZG93Ll9fYmlsZ2VNYXRjaERvbVNraWxsID0gbWF0Y2hEb21Ta2lsbDtcbiAgd2luZG93Ll9fYmlsZ2VGaW5kRWxlbWVudEJ5SGV1cmlzdGljID0gZmluZEVsZW1lbnRCeUhldXJpc3RpYztcbiAgd2luZG93Ll9fYmlsZ2VMZWFybkRvbVNraWxsID0gbGVhcm5Eb21Ta2lsbDtcbiAgd2luZG93Ll9fYmlsZ2VJc1VzYWJsZUZpZWxkID0gaXNVc2FibGVGaWVsZDtcbiAgd2luZG93Ll9fYmlsZ2VRdWVyeVNlbGVjdG9yRGVlcCA9IHF1ZXJ5U2VsZWN0b3JEZWVwO1xuXG4gIGZ1bmN0aW9uIGVsZW1lbnRTdW1tYXJ5KGVsZW1lbnQpIHtcbiAgICBjb25zdCB0YWcgPSBlbGVtZW50Py50YWdOYW1lID8gU3RyaW5nKGVsZW1lbnQudGFnTmFtZSkudG9Mb3dlckNhc2UoKSA6ICcnO1xuICAgIGNvbnN0IGlkID0gZWxlbWVudD8uaWQgPyBTdHJpbmcoZWxlbWVudC5pZCkgOiAnJztcbiAgICBsZXQgY2xhc3NlcyA9ICcnO1xuICAgIHRyeSB7XG4gICAgICBjbGFzc2VzID0gZWxlbWVudD8uY2xhc3NMaXN0ID8gQXJyYXkuZnJvbShlbGVtZW50LmNsYXNzTGlzdCkuc2xpY2UoMCwgMTIpLmpvaW4oJyAnKSA6ICcnO1xuICAgIH0gY2F0Y2ggKF9lcnIpIHt9XG5cbiAgICBjb25zdCB0ZXh0ID0gdHJ1bmNhdGUoZWxlbWVudD8uaW5uZXJUZXh0IHx8IGVsZW1lbnQ/LnRleHRDb250ZW50IHx8ICcnLCAyNDApO1xuXG4gICAgY29uc3QgYXR0cnMgPSB7fTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgYXR0cmlidXRlcyA9IGVsZW1lbnQ/LmF0dHJpYnV0ZXMgPyBBcnJheS5mcm9tKGVsZW1lbnQuYXR0cmlidXRlcykgOiBbXTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXR0cmlidXRlcy5sZW5ndGggJiYgaSA8IDE2OyBpKyspIHtcbiAgICAgICAgY29uc3QgYXR0ciA9IGF0dHJpYnV0ZXNbaV07XG4gICAgICAgIGlmICghYXR0cj8ubmFtZSkgY29udGludWU7XG4gICAgICAgIGF0dHJzW1N0cmluZyhhdHRyLm5hbWUpXSA9IHRydW5jYXRlKGF0dHIudmFsdWUsIDIwMCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoX2Vycikge31cblxuICAgIHJldHVybiB7IF90eXBlOiAnRWxlbWVudCcsIHRhZywgaWQsIGNsYXNzZXMsIHRleHQsIGF0dHJzIH07XG4gIH1cblxuICBmdW5jdGlvbiBqc29uU2FmZSh2YWx1ZSwgc2VlbiA9IG5ldyBXZWFrU2V0KCksIGRlcHRoID0gMCkge1xuICAgIGNvbnN0IE1BWF9ERVBUSCA9IDU7XG4gICAgY29uc3QgTUFYX0FSUkFZX0lURU1TID0gMjAwO1xuICAgIGNvbnN0IE1BWF9LRVlTID0gMjAwO1xuXG4gICAgaWYgKHZhbHVlID09PSBudWxsKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IHQgPSB0eXBlb2YgdmFsdWU7XG4gICAgaWYgKHQgPT09ICdzdHJpbmcnKSByZXR1cm4gdHJ1bmNhdGUodmFsdWUsIDgwMDApO1xuICAgIGlmICh0ID09PSAnbnVtYmVyJyB8fCB0ID09PSAnYm9vbGVhbicpIHJldHVybiB2YWx1ZTtcbiAgICBpZiAodCA9PT0gJ2JpZ2ludCcpIHJldHVybiB2YWx1ZS50b1N0cmluZygpO1xuICAgIGlmICh0ID09PSAndW5kZWZpbmVkJykgcmV0dXJuIG51bGw7XG4gICAgaWYgKHQgPT09ICdzeW1ib2wnKSByZXR1cm4gdmFsdWUudG9TdHJpbmcoKTtcbiAgICBpZiAodCA9PT0gJ2Z1bmN0aW9uJykgcmV0dXJuICdbRnVuY3Rpb25dJztcblxuICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfdHlwZTogJ0Vycm9yJyxcbiAgICAgICAgbmFtZTogU3RyaW5nKHZhbHVlLm5hbWUgfHwgJ0Vycm9yJyksXG4gICAgICAgIG1lc3NhZ2U6IFN0cmluZyh2YWx1ZS5tZXNzYWdlIHx8ICcnKSxcbiAgICAgICAgc3RhY2s6IHRydW5jYXRlKFN0cmluZyh2YWx1ZS5zdGFjayB8fCAnJyksIDQwMDApLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSByZXR1cm4gdmFsdWUudG9JU09TdHJpbmcoKTtcblxuICAgIGNvbnN0IGlzRWxlbWVudCA9IHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUubm9kZVR5cGUgPT09IDEgJiYgdHlwZW9mIHZhbHVlLnRhZ05hbWUgPT09ICdzdHJpbmcnO1xuICAgIGlmIChpc0VsZW1lbnQpIHJldHVybiBlbGVtZW50U3VtbWFyeSh2YWx1ZSk7XG5cbiAgICAvLyBTdG9wIHJ1bmF3YXkgcmVjdXJzaW9uIC8gY3ljbGVzLlxuICAgIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0JykgcmV0dXJuIFN0cmluZyh2YWx1ZSk7XG4gICAgaWYgKGRlcHRoID49IE1BWF9ERVBUSCkgcmV0dXJuICdbTWF4RGVwdGhdJztcbiAgICBpZiAoc2Vlbi5oYXModmFsdWUpKSByZXR1cm4gJ1tDaXJjdWxhcl0nO1xuICAgIHNlZW4uYWRkKHZhbHVlKTtcblxuICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgcmV0dXJuIHZhbHVlLnNsaWNlKDAsIE1BWF9BUlJBWV9JVEVNUykubWFwKCh2KSA9PiBqc29uU2FmZSh2LCBzZWVuLCBkZXB0aCArIDEpKTtcbiAgICB9XG5cbiAgICAvLyBOb2RlTGlzdCAvIEhUTUxDb2xsZWN0aW9uXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHRhZ05hbWUgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpO1xuICAgICAgaWYgKHRhZ05hbWUgPT09ICdbb2JqZWN0IE5vZGVMaXN0XScgfHwgdGFnTmFtZSA9PT0gJ1tvYmplY3QgSFRNTENvbGxlY3Rpb25dJykge1xuICAgICAgICBjb25zdCBhcnIgPSBBcnJheS5mcm9tKHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIGFyci5zbGljZSgwLCBNQVhfQVJSQVlfSVRFTVMpLm1hcCgodikgPT4ganNvblNhZmUodiwgc2VlbiwgZGVwdGggKyAxKSk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoX2Vycikge31cblxuICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIE1hcCkge1xuICAgICAgY29uc3QgZW50cmllcyA9IFtdO1xuICAgICAgbGV0IGkgPSAwO1xuICAgICAgZm9yIChjb25zdCBbaywgdl0gb2YgdmFsdWUuZW50cmllcygpKSB7XG4gICAgICAgIGVudHJpZXMucHVzaChbanNvblNhZmUoaywgc2VlbiwgZGVwdGggKyAxKSwganNvblNhZmUodiwgc2VlbiwgZGVwdGggKyAxKV0pO1xuICAgICAgICBpKys7XG4gICAgICAgIGlmIChpID49IDEwMCkgYnJlYWs7XG4gICAgICB9XG4gICAgICByZXR1cm4geyBfdHlwZTogJ01hcCcsIGVudHJpZXMgfTtcbiAgICB9XG5cbiAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBTZXQpIHtcbiAgICAgIGNvbnN0IHZhbHVlcyA9IFtdO1xuICAgICAgbGV0IGkgPSAwO1xuICAgICAgZm9yIChjb25zdCB2IG9mIHZhbHVlLnZhbHVlcygpKSB7XG4gICAgICAgIHZhbHVlcy5wdXNoKGpzb25TYWZlKHYsIHNlZW4sIGRlcHRoICsgMSkpO1xuICAgICAgICBpKys7XG4gICAgICAgIGlmIChpID49IDIwMCkgYnJlYWs7XG4gICAgICB9XG4gICAgICByZXR1cm4geyBfdHlwZTogJ1NldCcsIHZhbHVlcyB9O1xuICAgIH1cblxuICAgIGNvbnN0IG91dCA9IHt9O1xuICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh2YWx1ZSk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aCAmJiBpIDwgTUFYX0tFWVM7IGkrKykge1xuICAgICAgY29uc3QgayA9IGtleXNbaV07XG4gICAgICB0cnkge1xuICAgICAgICBvdXRba10gPSBqc29uU2FmZSh2YWx1ZVtrXSwgc2VlbiwgZGVwdGggKyAxKTtcbiAgICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgICAgb3V0W2tdID0gJ1tVbnJlYWRhYmxlXSc7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBvdXQ7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBleGVjdXRlVXNlckphdmFTY3JpcHQoY29kZSwgdGltZW91dE1zKSB7XG4gICAgY29uc3QgQXN5bmNGdW5jdGlvbiA9IE9iamVjdC5nZXRQcm90b3R5cGVPZihhc3luYyBmdW5jdGlvbiAoKSB7fSkuY29uc3RydWN0b3I7XG4gICAgY29uc3QgZm4gPSBuZXcgQXN5bmNGdW5jdGlvbihcbiAgICAgICdxdWVyeVNlbGVjdG9yRGVlcCcsXG4gICAgICAndHJ1bmNhdGUnLFxuICAgICAgJ2VsZW1lbnRTdW1tYXJ5JyxcbiAgICAgICdcInVzZSBzdHJpY3RcIjtcXG4nICsgU3RyaW5nKGNvZGUgfHwgJycpXG4gICAgKTtcblxuICAgIGNvbnN0IHRpbWVvdXQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihOdW1iZXIodGltZW91dE1zKSB8fCBERUZBVUxUX0VYRUNVVEVfSlNfVElNRU9VVF9NUywgMzAwMDApKTtcbiAgICBjb25zdCB0YXNrID0gUHJvbWlzZS5yZXNvbHZlKCkudGhlbigoKSA9PiBmbihxdWVyeVNlbGVjdG9yRGVlcCwgdHJ1bmNhdGUsIGVsZW1lbnRTdW1tYXJ5KSk7XG4gICAgaWYgKCF0aW1lb3V0KSByZXR1cm4gYXdhaXQgdGFzaztcblxuICAgIHJldHVybiBhd2FpdCBQcm9taXNlLnJhY2UoW1xuICAgICAgdGFzayxcbiAgICAgIG5ldyBQcm9taXNlKChfLCByZWplY3QpID0+IHNldFRpbWVvdXQoKCkgPT4gcmVqZWN0KG5ldyBFcnJvcihgVGltZW91dCBhZnRlciAke3RpbWVvdXR9bXNgKSksIHRpbWVvdXQpKSxcbiAgICBdKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFeGVjdXRlIGEgbmF0dXJhbCBsYW5ndWFnZSBhY3Rpb24gcGFyc2VkIGJ5IGNvcnRleFxuICAgKi9cbiAgYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZU5hdHVyYWxBY3Rpb24oYWN0aW9uLCBwYXJzZWQpIHtcbiAgICBpZiAoIWFjdGlvbiB8fCAhYWN0aW9uLnR5cGUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBhY3Rpb246IG1pc3NpbmcgdHlwZScpO1xuICAgIH1cblxuICAgIHN3aXRjaCAoYWN0aW9uLnR5cGUpIHtcbiAgICAgIGNhc2UgJ3Njcm9sbCc6XG4gICAgICAgIHJldHVybiBleGVjdXRlU2Nyb2xsQWN0aW9uKGFjdGlvbiwgcGFyc2VkKTtcbiAgICAgIGNhc2UgJ2NsaWNrJzpcbiAgICAgICAgcmV0dXJuIGV4ZWN1dGVDbGlja0FjdGlvbihhY3Rpb24sIHBhcnNlZCk7XG4gICAgICBjYXNlICd0eXBlJzpcbiAgICAgICAgcmV0dXJuIGV4ZWN1dGVUeXBlQWN0aW9uKGFjdGlvbiwgcGFyc2VkKTtcbiAgICAgIGNhc2UgJ3dhaXQnOlxuICAgICAgICByZXR1cm4gZXhlY3V0ZVdhaXRBY3Rpb24oYWN0aW9uKTtcbiAgICAgIGNhc2UgJ25hdmlnYXRlJzpcbiAgICAgICAgcmV0dXJuIGV4ZWN1dGVOYXZpZ2F0ZUFjdGlvbihhY3Rpb24pO1xuICAgICAgY2FzZSAnc2NyaXB0JzpcbiAgICAgICAgcmV0dXJuIGV4ZWN1dGVTY3JpcHRBY3Rpb24oYWN0aW9uKTtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5zdXBwb3J0ZWQgYWN0aW9uIHR5cGU6ICR7YWN0aW9uLnR5cGV9YCk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZVNjcm9sbEFjdGlvbihhY3Rpb24sIHBhcnNlZCkge1xuICAgIGNvbnN0IGRpcmVjdGlvbiA9IHBhcnNlZD8uZGlyZWN0aW9uIHx8ICdkb3duJztcblxuICAgIC8vIEFic29sdXRlIHNjcm9sbFxuICAgIGlmIChhY3Rpb24uc2Nyb2xsVG8pIHtcbiAgICAgIGlmIChhY3Rpb24uc2Nyb2xsVG8udG9wID09PSAwKSB7XG4gICAgICAgIHdpbmRvdy5zY3JvbGxUbyh7IHRvcDogMCwgYmVoYXZpb3I6ICdzbW9vdGgnIH0pO1xuICAgICAgfSBlbHNlIGlmIChhY3Rpb24uc2Nyb2xsVG8udG9wID09PSAnbWF4Jykge1xuICAgICAgICB3aW5kb3cuc2Nyb2xsVG8oeyB0b3A6IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zY3JvbGxIZWlnaHQsIGJlaGF2aW9yOiAnc21vb3RoJyB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IHN0YXR1czogJ3Njcm9sbGVkJywgZGlyZWN0aW9uLCB0eXBlOiAnYWJzb2x1dGUnIH07XG4gICAgfVxuXG4gICAgLy8gUmVsYXRpdmUgc2Nyb2xsXG4gICAgY29uc3Qgc2Nyb2xsT3B0aW9ucyA9IHsgYmVoYXZpb3I6ICdzbW9vdGgnIH07XG4gICAgaWYgKGFjdGlvbi5ob3Jpem9udGFsICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjcm9sbE9wdGlvbnMubGVmdCA9IGFjdGlvbi5ob3Jpem9udGFsO1xuICAgICAgc2Nyb2xsT3B0aW9ucy50b3AgPSAwO1xuICAgIH0gZWxzZSB7XG4gICAgICBzY3JvbGxPcHRpb25zLnRvcCA9IGFjdGlvbi5hbW91bnQgfHwgMzAwO1xuICAgICAgc2Nyb2xsT3B0aW9ucy5sZWZ0ID0gMDtcbiAgICB9XG5cbiAgICB3aW5kb3cuc2Nyb2xsQnkoc2Nyb2xsT3B0aW9ucyk7XG4gICAgcmV0dXJuIHsgc3RhdHVzOiAnc2Nyb2xsZWQnLCBkaXJlY3Rpb24sIGFtb3VudDogYWN0aW9uLmFtb3VudCB8fCBhY3Rpb24uaG9yaXpvbnRhbCwgdHlwZTogJ3JlbGF0aXZlJyB9O1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZUNsaWNrQWN0aW9uKGFjdGlvbiwgcGFyc2VkKSB7XG4gICAgLy8gSWYgdXNpbmcgZGVpY3RpYyByZWZlcmVuY2UsIHRyeSB0byBmaW5kIGVsZW1lbnQgdW5kZXIgY3Vyc29yIG9yIHVzZSBsYXN0IGZvY3VzZWRcbiAgICBpZiAoYWN0aW9uLnVzZUNvbnRleHQpIHtcbiAgICAgIGNvbnN0IHJ1bnRpbWUgPSB3aW5kb3cuX19iaWxnZV9ydW50aW1lIHx8IG51bGw7XG5cbiAgICAgIGNvbnN0IHBpY2tDbGlja2FibGUgPSAoZWwpID0+IHtcbiAgICAgICAgaWYgKCEoZWwgaW5zdGFuY2VvZiBFbGVtZW50KSkgcmV0dXJuIG51bGw7XG4gICAgICAgIGNvbnN0IHRhZyA9IFN0cmluZyhlbC50YWdOYW1lIHx8ICcnKS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICBpZiAoIXRhZyB8fCB0YWcgPT09ICdIVE1MJyB8fCB0YWcgPT09ICdCT0RZJykgcmV0dXJuIG51bGw7XG4gICAgICAgIGlmICghZWwuaXNDb25uZWN0ZWQpIHJldHVybiBudWxsO1xuICAgICAgICBjb25zdCBpbnRlcmFjdGl2ZSA9IGVsLmNsb3Nlc3Q/LihcbiAgICAgICAgICAnYnV0dG9uLCBhW2hyZWZdLCBpbnB1dFt0eXBlPVwiYnV0dG9uXCJdLCBpbnB1dFt0eXBlPVwic3VibWl0XCJdLCBpbnB1dFt0eXBlPVwicmVzZXRcIl0sIFtyb2xlPVwiYnV0dG9uXCJdLCBbcm9sZT1cImxpbmtcIl0nXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBpbnRlcmFjdGl2ZSB8fCBlbDtcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IGlzVmlzaWJsZVNhZmUgPSAoZWwpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gaXNFbGVtZW50VmlzaWJsZShlbCk7XG4gICAgICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgY29uc3QgY2FuZGlkYXRlcyA9IFtdO1xuXG4gICAgICBjb25zdCBjdXJzb3IgPSBydW50aW1lPy5jdXJzb3I7XG4gICAgICBpZiAoY3Vyc29yICYmIE51bWJlci5pc0Zpbml0ZShjdXJzb3IueCkgJiYgTnVtYmVyLmlzRmluaXRlKGN1cnNvci55KSAmJiAoY3Vyc29yLnggIT09IDAgfHwgY3Vyc29yLnkgIT09IDApKSB7XG4gICAgICAgIGNvbnN0IGZyb21Qb2ludCA9IGRvY3VtZW50LmVsZW1lbnRGcm9tUG9pbnQoY3Vyc29yLngsIGN1cnNvci55KTtcbiAgICAgICAgY29uc3QgcGlja2VkID0gcGlja0NsaWNrYWJsZShmcm9tUG9pbnQpO1xuICAgICAgICBpZiAocGlja2VkKSBjYW5kaWRhdGVzLnB1c2goeyBlbDogcGlja2VkLCByZWFzb246ICdjdXJzb3InIH0pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBsYXN0RWwgPSBydW50aW1lPy5sYXN0RWxlbWVudDtcbiAgICAgIGNvbnN0IGxhc3RQaWNrZWQgPSBwaWNrQ2xpY2thYmxlKGxhc3RFbCk7XG4gICAgICBpZiAobGFzdFBpY2tlZCkgY2FuZGlkYXRlcy5wdXNoKHsgZWw6IGxhc3RQaWNrZWQsIHJlYXNvbjogJ2xhc3QtZWxlbWVudCcgfSk7XG5cbiAgICAgIGNvbnN0IGFjdGl2ZUVsID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcbiAgICAgIGNvbnN0IGFjdGl2ZVBpY2tlZCA9IHBpY2tDbGlja2FibGUoYWN0aXZlRWwpO1xuICAgICAgaWYgKGFjdGl2ZVBpY2tlZCkgY2FuZGlkYXRlcy5wdXNoKHsgZWw6IGFjdGl2ZVBpY2tlZCwgcmVhc29uOiAnYWN0aXZlLWVsZW1lbnQnIH0pO1xuXG4gICAgICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICAgIGNvbnN0IGVsID0gY2FuZGlkYXRlPy5lbDtcbiAgICAgICAgaWYgKCFlbCB8fCAhZWwuaXNDb25uZWN0ZWQpIGNvbnRpbnVlO1xuICAgICAgICBpZiAoIWlzVmlzaWJsZVNhZmUoZWwpKSBjb250aW51ZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBlbC5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnYXV0bycsIGJsb2NrOiAnY2VudGVyJyB9KTtcbiAgICAgICAgfSBjYXRjaCAoX2Vycikge31cbiAgICAgICAgZWwuY2xpY2soKTtcbiAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiAnY2xpY2tlZCcsIHRhcmdldDogJ2RlaWN0aWMnLCBjb250ZXh0OiBjYW5kaWRhdGUucmVhc29uLCB0YWc6IGVsLnRhZ05hbWUgfTtcbiAgICAgIH1cblxuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAnTm8gZWxlbWVudCBpbiBjb250ZXh0IGZvciBkZWljdGljIGNsaWNrIHJlZmVyZW5jZS4gSG92ZXIgdGhlIHRhcmdldCAob3IgZm9jdXMgaXQpIGFuZCByZXRyeSBcImNsaWNrIGl0XCIuJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBUcnkgdG8gZmluZCBlbGVtZW50IGJ5IGxhYmVsL25hbWUvZmllbGRcbiAgICBjb25zdCB0YXJnZXQgPSBhY3Rpb24ubGFiZWwgfHwgYWN0aW9uLmZpZWxkIHx8IGFjdGlvbi5uYW1lO1xuICAgIGlmICghdGFyZ2V0KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHRhcmdldCBzcGVjaWZpZWQgZm9yIGNsaWNrJyk7XG4gICAgfVxuXG4gICAgbGV0IG1lbW9yeUhpdCA9IGZhbHNlO1xuICAgIGxldCBlbGVtZW50ID0gbnVsbDtcbiAgICBjb25zdCBtZW1vcnlNYXRjaCA9IGF3YWl0IG1hdGNoRG9tU2tpbGwoJ2NsaWNrJywgdGFyZ2V0KTtcbiAgICBpZiAobWVtb3J5TWF0Y2g/LmVsZW1lbnQpIHtcbiAgICAgIGVsZW1lbnQgPSBtZW1vcnlNYXRjaC5lbGVtZW50O1xuICAgICAgbWVtb3J5SGl0ID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoIWVsZW1lbnQpIHtcbiAgICAgIGVsZW1lbnQgPSBmaW5kRWxlbWVudEJ5SGV1cmlzdGljKHsgbGFiZWw6IHRhcmdldCwgZmllbGQ6IHRhcmdldCwgbmFtZTogdGFyZ2V0IH0sIG51bGwpO1xuICAgIH1cbiAgICBpZiAoIWVsZW1lbnQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IGZpbmQgZWxlbWVudCBtYXRjaGluZzogXCIke3RhcmdldH1cImApO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBlbGVtZW50LnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdhdXRvJywgYmxvY2s6ICdjZW50ZXInIH0pO1xuICAgIH0gY2F0Y2ggKF9lcnIpIHt9XG5cbiAgICBlbGVtZW50LmNsaWNrKCk7XG4gICAgYXdhaXQgbGVhcm5Eb21Ta2lsbCgnY2xpY2snLCB0YXJnZXQsIGVsZW1lbnQpO1xuICAgIHJldHVybiB7IHN0YXR1czogJ2NsaWNrZWQnLCB0YXJnZXQsIHRhZzogZWxlbWVudC50YWdOYW1lLCBtZW1vcnlIaXQgfTtcbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVUeXBlQWN0aW9uKGFjdGlvbiwgcGFyc2VkKSB7XG4gICAgbGV0IHZhbHVlID0gYWN0aW9uLnZhbHVlID8/ICcnO1xuICAgIGNvbnN0IHRhcmdldCA9IGFjdGlvbi5sYWJlbCB8fCBhY3Rpb24uZmllbGQgfHwgYWN0aW9uLm5hbWUgfHwgcGFyc2VkPy50YXJnZXQgfHwgJyc7XG4gICAgY29uc3QgY29weUZyb20gPSBTdHJpbmcoYWN0aW9uLmNvcHlGcm9tIHx8IHBhcnNlZD8uY29weUZyb20gfHwgJycpLnRyaW0oKTtcbiAgICBsZXQgbWVtb3J5SGl0ID0gZmFsc2U7XG5cbiAgICBjb25zdCByZXNvbHZlRmllbGRFbGVtZW50ID0gYXN5bmMgKGhpbnQpID0+IHtcbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWRIaW50ID0gU3RyaW5nKGhpbnQgfHwgJycpLnRyaW0oKTtcbiAgICAgIGlmICghbm9ybWFsaXplZEhpbnQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIGZpZWxkIGhpbnQnKTtcbiAgICAgIH1cblxuICAgICAgbGV0IHJlc29sdmVkID0gbnVsbDtcbiAgICAgIGNvbnN0IG1lbW9yeU1hdGNoID0gYXdhaXQgbWF0Y2hEb21Ta2lsbCgndHlwZScsIG5vcm1hbGl6ZWRIaW50KTtcbiAgICAgIGlmIChtZW1vcnlNYXRjaD8uZWxlbWVudCkge1xuICAgICAgICByZXNvbHZlZCA9IG1lbW9yeU1hdGNoLmVsZW1lbnQ7XG4gICAgICAgIG1lbW9yeUhpdCA9IHRydWU7XG4gICAgICB9XG4gICAgICBpZiAoIXJlc29sdmVkKSB7XG4gICAgICAgIHJlc29sdmVkID0gZmluZEVsZW1lbnRCeUhldXJpc3RpYyhcbiAgICAgICAgICB7IGxhYmVsOiBub3JtYWxpemVkSGludCwgZmllbGQ6IG5vcm1hbGl6ZWRIaW50LCBuYW1lOiBub3JtYWxpemVkSGludCwgcGxhY2Vob2xkZXI6IG5vcm1hbGl6ZWRIaW50IH0sXG4gICAgICAgICAgbnVsbFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKCFyZXNvbHZlZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCBmaW5kIGlucHV0IGZpZWxkIG1hdGNoaW5nOiBcIiR7bm9ybWFsaXplZEhpbnR9XCJgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXNvbHZlZDtcbiAgICB9O1xuXG4gICAgY29uc3QgcmVhZEZpZWxkVmFsdWUgPSAoZWxlbWVudCkgPT4ge1xuICAgICAgaWYgKCFlbGVtZW50KSByZXR1cm4gJyc7XG4gICAgICBjb25zdCB0YWcgPSBTdHJpbmcoZWxlbWVudC50YWdOYW1lIHx8ICcnKS50b1VwcGVyQ2FzZSgpO1xuICAgICAgaWYgKHRhZyA9PT0gJ0lOUFVUJyB8fCB0YWcgPT09ICdURVhUQVJFQScgfHwgdGFnID09PSAnU0VMRUNUJykge1xuICAgICAgICByZXR1cm4gU3RyaW5nKGVsZW1lbnQudmFsdWUgPz8gJycpO1xuICAgICAgfVxuICAgICAgaWYgKGVsZW1lbnQuaXNDb250ZW50RWRpdGFibGUpIHtcbiAgICAgICAgcmV0dXJuIFN0cmluZyhlbGVtZW50LnRleHRDb250ZW50ID8/ICcnKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAnJztcbiAgICB9O1xuXG4gICAgaWYgKGNvcHlGcm9tKSB7XG4gICAgICBjb25zdCBzb3VyY2VFbGVtZW50ID0gYXdhaXQgcmVzb2x2ZUZpZWxkRWxlbWVudChjb3B5RnJvbSk7XG4gICAgICBjb25zdCBzb3VyY2VWYWx1ZSA9IHJlYWRGaWVsZFZhbHVlKHNvdXJjZUVsZW1lbnQpO1xuICAgICAgaWYgKCFzb3VyY2VWYWx1ZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFNvdXJjZSBmaWVsZCBcIiR7Y29weUZyb219XCIgaXMgZW1wdHlgKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlID0gc291cmNlVmFsdWU7XG4gICAgfVxuXG4gICAgLy8gSWYgYSBmaWVsZCB0YXJnZXQgaXMgcHJvdmlkZWQsIHJlc29sdmUgdGhhdCBzcGVjaWZpYyBpbnB1dCBkZXRlcm1pbmlzdGljYWxseS5cbiAgICBsZXQgZWxlbWVudCA9IG51bGw7XG4gICAgaWYgKHRhcmdldCkge1xuICAgICAgZWxlbWVudCA9IGF3YWl0IHJlc29sdmVGaWVsZEVsZW1lbnQodGFyZ2V0KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gTGVnYWN5IGZhbGxiYWNrIHBhdGggd2hlbiBubyB0YXJnZXQgd2FzIHNwZWNpZmllZC5cbiAgICAgIGVsZW1lbnQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuICAgICAgY29uc3QgdGFnID0gZWxlbWVudD8udGFnTmFtZT8udG9VcHBlckNhc2UoKTtcbiAgICAgIGlmICh0YWcgIT09ICdJTlBVVCcgJiYgdGFnICE9PSAnVEVYVEFSRUEnICYmICFlbGVtZW50Py5pc0NvbnRlbnRFZGl0YWJsZSkge1xuICAgICAgICBjb25zdCBpbnB1dHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pOm5vdChbdHlwZT1cInN1Ym1pdFwiXSk6bm90KFt0eXBlPVwiYnV0dG9uXCJdKSwgdGV4dGFyZWEnKTtcbiAgICAgICAgZm9yIChjb25zdCBpbnB1dCBvZiBpbnB1dHMpIHtcbiAgICAgICAgICBpZiAoaXNVc2FibGVGaWVsZChpbnB1dCkpIHtcbiAgICAgICAgICAgIGVsZW1lbnQgPSBpbnB1dDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghZWxlbWVudCB8fCAoZWxlbWVudC50YWdOYW1lICE9PSAnSU5QVVQnICYmIGVsZW1lbnQudGFnTmFtZSAhPT0gJ1RFWFRBUkVBJyAmJiAhZWxlbWVudC5pc0NvbnRlbnRFZGl0YWJsZSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gaW5wdXQgZmllbGQgZm91bmQgdG8gdHlwZSBpbnRvJyk7XG4gICAgfVxuXG4gICAgY29uc3QgZmluYWxWYWx1ZSA9IFN0cmluZyh2YWx1ZSA/PyAnJyk7XG4gICAgZWxlbWVudC5mb2N1cygpO1xuICAgIGlmIChlbGVtZW50LnRhZ05hbWUgPT09ICdJTlBVVCcgfHwgZWxlbWVudC50YWdOYW1lID09PSAnVEVYVEFSRUEnKSB7XG4gICAgICBzZXROYXRpdmVWYWx1ZShlbGVtZW50LCBmaW5hbFZhbHVlKTtcbiAgICAgIGRpc3BhdGNoSW5wdXRFdmVudHMoZWxlbWVudCk7XG4gICAgfSBlbHNlIGlmIChlbGVtZW50LmlzQ29udGVudEVkaXRhYmxlKSB7XG4gICAgICBlbGVtZW50LnRleHRDb250ZW50ID0gZmluYWxWYWx1ZTtcbiAgICAgIGRpc3BhdGNoSW5wdXRFdmVudHMoZWxlbWVudCk7XG4gICAgfVxuXG4gICAgaWYgKHRhcmdldCkge1xuICAgICAgYXdhaXQgbGVhcm5Eb21Ta2lsbCgndHlwZScsIHRhcmdldCwgZWxlbWVudCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogJ3R5cGVkJyxcbiAgICAgIHZhbHVlOiBmaW5hbFZhbHVlLnNsaWNlKDAsIDUwKSxcbiAgICAgIHRhcmdldDogdGFyZ2V0IHx8IG51bGwsXG4gICAgICBjb3BpZWRGcm9tOiBjb3B5RnJvbSB8fCBudWxsLFxuICAgICAgbWVtb3J5SGl0XG4gICAgfTtcbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVXYWl0QWN0aW9uKGFjdGlvbikge1xuICAgIGNvbnN0IGR1cmF0aW9uID0gYWN0aW9uLmR1cmF0aW9uIHx8IDEwMDA7XG4gICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIGR1cmF0aW9uKSk7XG4gICAgcmV0dXJuIHsgc3RhdHVzOiAnd2FpdGVkJywgZHVyYXRpb24gfTtcbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVOYXZpZ2F0ZUFjdGlvbihhY3Rpb24pIHtcbiAgICAvLyBOYXZpZ2F0aW9uIGFjdGlvbnMgYXJlIGFjdHVhbGx5IHNjcmlwdHNcbiAgICBpZiAoYWN0aW9uLmNvZGUpIHtcbiAgICAgIGNvbnN0IEFzeW5jRnVuY3Rpb24gPSBPYmplY3QuZ2V0UHJvdG90eXBlT2YoYXN5bmMgZnVuY3Rpb24gKCkge30pLmNvbnN0cnVjdG9yO1xuICAgICAgY29uc3QgZm4gPSBuZXcgQXN5bmNGdW5jdGlvbihhY3Rpb24uY29kZSk7XG4gICAgICBhd2FpdCBmbigpO1xuICAgIH1cbiAgICByZXR1cm4geyBzdGF0dXM6ICduYXZpZ2F0ZWQnLCBhY3Rpb246IGFjdGlvbi5hY3Rpb24gfTtcbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVTY3JpcHRBY3Rpb24oYWN0aW9uKSB7XG4gICAgY29uc3QgY29kZSA9IGFjdGlvbi5jb2RlIHx8ICcnO1xuICAgIGlmICghY29kZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBzY3JpcHQgY29kZSBwcm92aWRlZCcpO1xuICAgIH1cblxuICAgIGNvbnN0IEFzeW5jRnVuY3Rpb24gPSBPYmplY3QuZ2V0UHJvdG90eXBlT2YoYXN5bmMgZnVuY3Rpb24gKCkge30pLmNvbnN0cnVjdG9yO1xuICAgIGNvbnN0IGZuID0gbmV3IEFzeW5jRnVuY3Rpb24oY29kZSk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZm4oKTtcbiAgICByZXR1cm4geyBzdGF0dXM6ICdleGVjdXRlZCcsIHJlc3VsdCB9O1xuICB9XG5cbiAgZnVuY3Rpb24gZXhwbGFpblVucmVjb2duaXplZE5hdHVyYWxDb21tYW5kKGNvbW1hbmQpIHtcbiAgICBjb25zdCB0ZXh0ID0gU3RyaW5nKGNvbW1hbmQgfHwgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmICghdGV4dCkgcmV0dXJuICcnO1xuXG4gICAgaWYgKC9cXGIoY29weVxccytmcm9tfGZyb20pXFxiLy50ZXN0KHRleHQpICYmIC9cXGIoZmlsbHxzZXR8Y29weSlcXGIvLnRlc3QodGV4dCkpIHtcbiAgICAgIHJldHVybiAnVHJ5OiBgZmlsbCA8dGFyZ2V0IGZpZWxkPiBmcm9tIDxzb3VyY2UgZmllbGQ+YCBvciBgY29weSA8c291cmNlIGZpZWxkPiBpbnRvIDx0YXJnZXQgZmllbGQ+YC4nO1xuICAgIH1cbiAgICBpZiAoL1xcYihmaWxsKD86XFxzK2luKT98c2V0KVxcYi8udGVzdCh0ZXh0KSAmJiAhL1xcYih3aXRofGFzfGludG98aW58dG8pXFxiLy50ZXN0KHRleHQpKSB7XG4gICAgICByZXR1cm4gJ0NvbW1hbmQgaXMgbWlzc2luZyBhIHZhbHVlLiBUcnk6IGB3cml0ZSA8dmFsdWU+IGludG8gPGZpZWxkPmAgb3IgYGZpbGwgPGZpZWxkPiB3aXRoIDx2YWx1ZT5gLic7XG4gICAgfVxuICAgIGlmICgvXFxiKHdyaXRlfHR5cGV8ZW50ZXJ8aW5wdXQpXFxiLy50ZXN0KHRleHQpICYmICEvXFxiKGludG98aW58dG8pXFxiLy50ZXN0KHRleHQpKSB7XG4gICAgICByZXR1cm4gJ0NvbW1hbmQgaXMgbWlzc2luZyBhIHRhcmdldCBmaWVsZC4gVHJ5OiBgd3JpdGUgPHZhbHVlPiBpbnRvIDxmaWVsZD5gLic7XG4gICAgfVxuXG4gICAgcmV0dXJuICcnO1xuICB9XG5cbiAgLy8gXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXG4gIC8vIFJFU0lMSUVOVCBOQVRVUkFMIENPTU1BTkQgRVhFQ1VUT1JcbiAgLy8gXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXG5cbiAgLyoqXG4gICAqIEV4ZWN1dGUgbmF0dXJhbCBsYW5ndWFnZSBjb21tYW5kIHdpdGggbXVsdGktbGV2ZWwgZmFsbGJhY2tcbiAgICovXG4gIGFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVSZXNpbGllbnROYXR1cmFsQ29tbWFuZChjb21tYW5kKSB7XG4gICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCByZXN1bHQgPSB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICBwcm90b2NvbDogJ25hdHVyYWwtY29tbWFuZC12MycsXG4gICAgICBjb21tYW5kOiBjb21tYW5kLFxuICAgICAgZXhlY3V0b3I6IG51bGwsXG4gICAgICBkdXJhdGlvbk1zOiAwXG4gICAgfTtcblxuICAgIGNvbnRlbnRMb2dnZXIuaW5mbygnRXhlY3V0aW5nIHJlc2lsaWVudCBuYXR1cmFsIGNvbW1hbmQnLCB7IGNvbW1hbmQgfSk7XG5cbiAgICAvLyBMRVZFTCAxOiBUcnkgQ29ydGV4IChpbnRlbGxpZ2VudCByb3V0aW5nKVxuICAgIGlmICh3aW5kb3cuQmlsZ2VDb3J0ZXg/LnBhcnNlQ29tbWFuZCB8fCB3aW5kb3cuX19iaWxnZV9jb3J0ZXhfbG9hZGVkKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNvbHZlZCA9IGF3YWl0IHJlc29sdmVOYXR1cmFsQ29tbWFuZChjb21tYW5kKTtcbiAgICAgICAgaWYgKHJlc29sdmVkICYmICFyZXNvbHZlZC5lcnJvciAmJiByZXNvbHZlZC5leGVjdXRhYmxlKSB7XG4gICAgICAgICAgY29uc3QgZXhlY1Jlc3VsdCA9IGF3YWl0IGV4ZWN1dGVOYXR1cmFsQWN0aW9uKHJlc29sdmVkLmV4ZWN1dGFibGUsIHJlc29sdmVkLnBhcnNlZCk7XG4gICAgICAgICAgaWYgKGV4ZWNSZXN1bHQpIHtcbiAgICAgICAgICAgIC8vIFBlcnNpc3QgXCJyZXBhaXJlZFwiIGNvbW1hbmRzIHNvIGZ1dHVyZSBpbnZvY2F0aW9ucyBjYW4gc2tpcCB0aGUgcmVjb3ZlcnkgbG9vcC5cbiAgICAgICAgICAgIC8vIFdlIG9ubHkgcmVtZW1iZXIgc2VsZi1oZWFsZWQgY29tbWFuZHMgdG8gYXZvaWQgc3RvcmluZyBldmVyeSByYXcgcHJvbXB0IChhbmQgdGhlaXIgdmFsdWVzKS5cbiAgICAgICAgICAgIGlmIChyZXNvbHZlZC5yZXBhaXJlZCkge1xuICAgICAgICAgICAgICByZW1lbWJlck5hdHVyYWxDb21tYW5kKGNvbW1hbmQsIHJlc29sdmVkLmNhbm9uaWNhbENvbW1hbmQsIHJlc29sdmVkLnJlcGFpcmVkKS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXN1bHQub2sgPSB0cnVlO1xuICAgICAgICAgICAgcmVzdWx0LmV4ZWN1dG9yID0gJ2NvcnRleCc7XG4gICAgICAgICAgICByZXN1bHQucGFyc2VkID0gcmVzb2x2ZWQucGFyc2VkO1xuICAgICAgICAgICAgcmVzdWx0LnJlc3VsdCA9IGV4ZWNSZXN1bHQ7XG4gICAgICAgICAgICByZXN1bHQuZHVyYXRpb25NcyA9IERhdGUubm93KCkgLSBzdGFydFRpbWU7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb250ZW50TG9nZ2VyLndhcm4oJ0NvcnRleCBleGVjdXRpb24gZmFpbGVkLCB0cnlpbmcgZmFsbGJhY2tzJywgeyBlcnJvcjogZS5tZXNzYWdlIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIExFVkVMIDI6IFRyeSBJbnRlbGxpZ2VudCBET00gRW5naW5lIChubyBBSSBuZWVkZWQpXG4gICAgaWYgKHdpbmRvdy5fX2JpbGdlX2V4ZWN1dGlvbl9lbmdpbmUpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGVuZ2luZSA9IHdpbmRvdy5fX2JpbGdlX2V4ZWN1dGlvbl9lbmdpbmU7XG4gICAgICAgIGNvbnN0IGV4ZWNSZXN1bHQgPSBhd2FpdCBlbmdpbmUucnVuKGNvbW1hbmQpO1xuXG4gICAgICAgIGlmIChleGVjUmVzdWx0ICYmIGV4ZWNSZXN1bHQub2spIHtcbiAgICAgICAgICByZXN1bHQub2sgPSB0cnVlO1xuICAgICAgICAgIHJlc3VsdC5leGVjdXRvciA9ICdkb21fZW5naW5lJztcbiAgICAgICAgICByZXN1bHQucmVzdWx0ID0gZXhlY1Jlc3VsdDtcbiAgICAgICAgICByZXN1bHQuZHVyYXRpb25NcyA9IERhdGUubm93KCkgLSBzdGFydFRpbWU7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb250ZW50TG9nZ2VyLndhcm4oJ0RPTSBFbmdpbmUgZXhlY3V0aW9uIGZhaWxlZCwgdHJ5aW5nIGZpbmFsIGZhbGxiYWNrJywgeyBlcnJvcjogZS5tZXNzYWdlIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIExFVkVMIDM6IFBhdHRlcm4tYmFzZWQgZGlyZWN0IGV4ZWN1dGlvbiAobGFzdCByZXNvcnQpXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGRpcmVjdFJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVEaXJlY3RQYXR0ZXJuKGNvbW1hbmQpO1xuICAgICAgaWYgKGRpcmVjdFJlc3VsdCAmJiBkaXJlY3RSZXN1bHQub2spIHtcbiAgICAgICAgcmVzdWx0Lm9rID0gdHJ1ZTtcbiAgICAgICAgcmVzdWx0LmV4ZWN1dG9yID0gJ2RpcmVjdF9wYXR0ZXJuJztcbiAgICAgICAgcmVzdWx0LnJlc3VsdCA9IGRpcmVjdFJlc3VsdDtcbiAgICAgICAgcmVzdWx0LmR1cmF0aW9uTXMgPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnRlbnRMb2dnZXIud2FybignRGlyZWN0IHBhdHRlcm4gZXhlY3V0aW9uIGZhaWxlZCcsIHsgZXJyb3I6IGUubWVzc2FnZSB9KTtcbiAgICB9XG5cbiAgICAvLyBBbGwgZmFsbGJhY2tzIGV4aGF1c3RlZFxuICAgIHJlc3VsdC5lcnJvciA9ICdBbGwgZXhlY3V0aW9uIHN0cmF0ZWdpZXMgZmFpbGVkJztcbiAgICByZXN1bHQuZHVyYXRpb25NcyA9IERhdGUubm93KCkgLSBzdGFydFRpbWU7XG4gICAgcmVzdWx0LmF0dGVtcHRlZCA9IFsnY29ydGV4JywgJ2RvbV9lbmdpbmUnLCAnZGlyZWN0X3BhdHRlcm4nXTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIERpcmVjdCBwYXR0ZXJuIGV4ZWN1dGlvbiAtIG5vIEFJLCBubyBjb21wbGV4IHBhcnNpbmdcbiAgICovXG4gIGFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVEaXJlY3RQYXR0ZXJuKGNvbW1hbmQpIHtcbiAgICBjb25zdCByYXcgPSBTdHJpbmcoY29tbWFuZCB8fCAnJyk7XG4gICAgY29uc3QgY21kID0gcmF3LnRvTG93ZXJDYXNlKCkudHJpbSgpO1xuXG4gICAgLy8gUGVyc2lzdCBzaW1wbGUgc3RhdGUgcGVyIHBhZ2Ugc28gXCJjb250aW51ZS9uZXh0XCIgY2FuIGFkdmFuY2UgZmllbGQtYnktZmllbGQgZmxvd3MuXG4gICAgY29uc3Qgc3RhdGUgPSAod2luZG93Ll9fYmlsZ2VfZGlyZWN0X2ZpbGxfZm9ybV9zdGF0ZSA9XG4gICAgICB3aW5kb3cuX19iaWxnZV9kaXJlY3RfZmlsbF9mb3JtX3N0YXRlIHx8IHsgc3RlcE1vZGU6IGZhbHNlLCBub1N1Ym1pdDogZmFsc2UsIHVwZGF0ZWRBdDogMCB9KTtcblxuICAgIGNvbnN0IHN0ZXBSZXF1ZXN0ZWQgPVxuICAgICAgL1xcYihvbmVcXHMrZmllbGRcXHMrYXRcXHMrYVxccyt0aW1lfGZpZWxkXFxzK2J5XFxzK2ZpZWxkfHN0ZXBcXHMrYnlcXHMrc3RlcHxvbmVcXHMrYnlcXHMrb25lfG9uZVxccythdFxccythXFxzK3RpbWUpXFxiL2kudGVzdChyYXcpO1xuICAgIGNvbnN0IG5vU3VibWl0UmVxdWVzdGVkID1cbiAgICAgIC9cXGIoZG9cXHMrbm90fGRvbid0fGRvbnR8bm8pXFxzK3N1Ym1pdFxcYnxcXGJ3aXRob3V0XFxzK3N1Ym1pdHRpbmdcXGJ8XFxibm9cXHMrc3VibWlzc2lvblxcYi9pLnRlc3QocmF3KTtcblxuICAgIGlmIChzdGVwUmVxdWVzdGVkKSBzdGF0ZS5zdGVwTW9kZSA9IHRydWU7XG4gICAgaWYgKG5vU3VibWl0UmVxdWVzdGVkKSBzdGF0ZS5ub1N1Ym1pdCA9IHRydWU7XG4gICAgc3RhdGUudXBkYXRlZEF0ID0gRGF0ZS5ub3coKTtcblxuICAgIGNvbnN0IHdhbnRzTmV4dEZpZWxkID1cbiAgICAgIC9eKD86Y29udGludWV8bmV4dHxwcm9jZWVkKSg/OlxccysoPzpmaWVsZHxpbnB1dCkpP1xccyokL2kudGVzdChjbWQpIHx8IC9cXGJuZXh0XFxzK2ZpZWxkXFxiL2kudGVzdChyYXcpO1xuICAgIGlmIChzdGF0ZS5zdGVwTW9kZSAmJiB3YW50c05leHRGaWVsZCkge1xuICAgICAgcmV0dXJuIGF3YWl0IGZpbGxWaXNpYmxlRm9ybUZpZWxkcyh7IHN0ZXA6IHRydWUgfSk7XG4gICAgfVxuXG4gICAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIEZJTEwgRk9STSBQQVRURVJOIChDb252ZXJzYXRpb25hbCkgXHUyNTAwXHUyNTAwXHUyNTAwXG4gICAgY29uc3QgbG9va3NMaWtlRmlsbEZvcm0gPVxuICAgICAgY21kLm1hdGNoKC9eKGZpbGx8Y29tcGxldGV8cG9wdWxhdGV8eWVzfGRvXFxzK2l0fHBsZWFzZXxjb250aW51ZXxwcm9jZWVkKVxccyooZm9ybXxmaWVsZHM/fGFsbHx0aGVtfGluKT8oXFxzK25vdyk/JC9pKSB8fFxuICAgICAgY21kLm1hdGNoKC9eKHllc1xccyspP2ZpbGxcXHMrdGhlbVxccytpbiQvaSkgfHxcbiAgICAgIGNtZC5tYXRjaCgvXmdvXFxzK2FoZWFkJC9pKSB8fFxuICAgICAgKC9cXGIoZmlsbHxjb21wbGV0ZXxwb3B1bGF0ZSlcXGIvaS50ZXN0KHJhdykgJiYgL1xcYihmb3JtfGZpZWxkcz8pXFxiL2kudGVzdChyYXcpKTtcblxuICAgIGlmIChsb29rc0xpa2VGaWxsRm9ybSkge1xuICAgICAgLy8gQWxsb3cgYW4gZXhwbGljaXQgXCJmaWxsIGFsbFwiIGNvbW1hbmQgdG8gYnJlYWsgb3V0IG9mIHN0ZXAgbW9kZS5cbiAgICAgIGNvbnN0IHdhbnRzQWxsID1cbiAgICAgICAgL1xcYihhbGx8ZXZlcnl0aGluZylcXGIvaS50ZXN0KHJhdykgJiYgL1xcYihmaWVsZHM/fGZvcm0pXFxiL2kudGVzdChyYXcpICYmICFzdGVwUmVxdWVzdGVkO1xuICAgICAgaWYgKHdhbnRzQWxsKSBzdGF0ZS5zdGVwTW9kZSA9IGZhbHNlO1xuICAgICAgcmV0dXJuIGF3YWl0IGZpbGxWaXNpYmxlRm9ybUZpZWxkcyh7IHN0ZXA6ICEhc3RhdGUuc3RlcE1vZGUgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgZmlsbE1hdGNoID0gY21kLm1hdGNoKC9eKGZpbGx8dHlwZXxlbnRlcilcXHMrKD86aW5cXHMrKT9bXCInXT8oLis/KVtcIiddP1xccysoPzp3aXRofGFzfHRvfD0pXFxzK1tcIiddPyguKz8pW1wiJ10/JC9pKTtcbiAgICBpZiAoZmlsbE1hdGNoKSB7XG4gICAgICBjb25zdCBbLCAsIGZpZWxkSGludCwgdmFsdWVdID0gZmlsbE1hdGNoO1xuICAgICAgcmV0dXJuIGF3YWl0IGZpbGxGaWVsZEJ5SGludChmaWVsZEhpbnQsIHZhbHVlKTtcbiAgICB9XG5cbiAgICBjb25zdCBjbGlja01hdGNoID0gY21kLm1hdGNoKC9eKGNsaWNrfHByZXNzfHRhcHxzZWxlY3R8Y2hvb3NlKVxccysoPzpvblxccyspP1tcIiddPyguKz8pW1wiJ10/JC9pKTtcbiAgICBpZiAoY2xpY2tNYXRjaCkge1xuICAgICAgY29uc3QgWywgLCB0YXJnZXRIaW50XSA9IGNsaWNrTWF0Y2g7XG4gICAgICByZXR1cm4gYXdhaXQgY2xpY2tCeUhpbnQodGFyZ2V0SGludCk7XG4gICAgfVxuXG4gICAgaWYgKGNtZC5tYXRjaCgvXihzdWJtaXR8Y29udGludWV8bmV4dHxwcm9jZWVkfHNhdmUpL2kpKSB7XG4gICAgICBpZiAoc3RhdGUubm9TdWJtaXQpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ1N1Ym1pc3Npb24gYmxvY2tlZCAobm8tc3VibWl0IG1vZGUpLicsIGJsb2NrZWQ6IHRydWUgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBhd2FpdCBzdWJtaXRDdXJyZW50Rm9ybSgpO1xuICAgIH1cblxuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdObyBtYXRjaGluZyBwYXR0ZXJuJyB9O1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gZmlsbFZpc2libGVGb3JtRmllbGRzKG9wdGlvbnMgPSB7fSkge1xuICAgIGNvbnN0IG9wdHMgPSBvcHRpb25zICYmIHR5cGVvZiBvcHRpb25zID09PSAnb2JqZWN0JyA/IG9wdGlvbnMgOiB7fTtcbiAgICBjb25zdCBzdGVwID0gISFvcHRzLnN0ZXA7XG4gICAgY29uc3QgZmllbGRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKTpub3QoW2Rpc2FibGVkXSksIHNlbGVjdDpub3QoW2Rpc2FibGVkXSksIHRleHRhcmVhOm5vdChbZGlzYWJsZWRdKScpO1xuICAgIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgICBsZXQgZmlsbGVkT2sgPSAwO1xuICAgIGxldCBlbGlnaWJsZSA9IDA7XG5cbiAgICBsZXQgcHJvZmlsZSA9IHt9O1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoWydiaWxnZV91c2VyX3Byb2ZpbGUnXSk7XG4gICAgICBwcm9maWxlID0gcmVzdWx0LmJpbGdlX3VzZXJfcHJvZmlsZSB8fCB7fTtcbiAgICB9IGNhdGNoIChlKSB7fVxuXG4gICAgY29uc3Qgc2FtcGxlcyA9IHtcbiAgICAgIGVtYWlsOiBwcm9maWxlLmVtYWlsIHx8ICd1c2VyQGV4YW1wbGUuY29tJyxcbiAgICAgIGZpcnN0TmFtZTogcHJvZmlsZS5maXJzdE5hbWUgfHwgJ0pvaG4nLFxuICAgICAgbGFzdE5hbWU6IHByb2ZpbGUubGFzdE5hbWUgfHwgJ0RvZScsXG4gICAgICBwaG9uZTogcHJvZmlsZS5waG9uZSB8fCAnNTU1LTAxMDAnLFxuICAgICAgYWRkcmVzczogcHJvZmlsZS5hZGRyZXNzMSB8fCBwcm9maWxlLmFkZHJlc3MgfHwgJycsXG4gICAgICBjaXR5OiBwcm9maWxlLmNpdHkgfHwgJycsXG4gICAgICBzdGF0ZTogcHJvZmlsZS5zdGF0ZSB8fCAnJyxcbiAgICAgIHppcDogcHJvZmlsZS56aXBDb2RlIHx8IHByb2ZpbGUuemlwIHx8ICcnXG4gICAgfTtcblxuICAgIGZvciAoY29uc3QgZmllbGQgb2YgZmllbGRzKSB7XG4gICAgICBpZiAoIWlzRWxlbWVudFZpc2libGUoZmllbGQpKSBjb250aW51ZTtcbiAgICAgIGlmIChmaWVsZC52YWx1ZSAmJiBmaWVsZC52YWx1ZS50cmltKCkpIGNvbnRpbnVlO1xuXG4gICAgICBjb25zdCBzZW1hbnRpY1R5cGUgPSBpbmZlckZpZWxkVHlwZUZyb21IaW50cyhmaWVsZCk7XG4gICAgICBjb25zdCB2YWx1ZSA9IHNhbXBsZXNbc2VtYW50aWNUeXBlXTtcblxuICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgIGVsaWdpYmxlICs9IDE7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZpZWxkLnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdzbW9vdGgnLCBibG9jazogJ2NlbnRlcicgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge31cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgZmllbGQuZm9jdXMoKTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7fVxuICAgICAgICAgIHNldE5hdGl2ZVZhbHVlKGZpZWxkLCB2YWx1ZSk7XG4gICAgICAgICAgZGlzcGF0Y2hJbnB1dEV2ZW50cyhmaWVsZCk7XG4gICAgICAgICAgcmVzdWx0cy5wdXNoKHsgZmllbGQ6IGdldEZpZWxkSWQoZmllbGQpLCB2YWx1ZSwgb2s6IHRydWUgfSk7XG4gICAgICAgICAgZmlsbGVkT2sgKz0gMTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJlc3VsdHMucHVzaCh7IGZpZWxkOiBnZXRGaWVsZElkKGZpZWxkKSwgZXJyb3I6IGUubWVzc2FnZSwgb2s6IGZhbHNlIH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzdGVwICYmIGZpbGxlZE9rID49IDEpIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIGxldCBtZXNzYWdlID0gJyc7XG4gICAgaWYgKGZpbGxlZE9rID09PSAwKSB7XG4gICAgICBpZiAoZWxpZ2libGUgPT09IDApIG1lc3NhZ2UgPSAnTm8gZWxpZ2libGUgZW1wdHkgZmllbGRzIHdpdGgga25vd24gcHJvZmlsZS9zYW1wbGUgdmFsdWVzIHdlcmUgZm91bmQuJztcbiAgICAgIGVsc2UgbWVzc2FnZSA9ICdObyBmaWVsZHMgd2VyZSBmaWxsZWQuJztcbiAgICB9XG4gICAgcmV0dXJuIHsgb2s6IHRydWUsIGZpbGxlZDogZmlsbGVkT2ssIGVsaWdpYmxlLCBzdGVwLCByZXN1bHRzLCAuLi4obWVzc2FnZSA/IHsgbWVzc2FnZSB9IDoge30pIH07XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBmaWxsRmllbGRCeUhpbnQoaGludCwgdmFsdWUpIHtcbiAgICBjb25zdCB0YXJnZXQgPSBTdHJpbmcoaGludCB8fCAnJykudHJpbSgpO1xuICAgIGxldCBlbGVtZW50ID0gbnVsbDtcbiAgICBsZXQgbWVtb3J5SGl0ID0gZmFsc2U7XG5cbiAgICBjb25zdCBtZW1vcnlNYXRjaCA9IGF3YWl0IG1hdGNoRG9tU2tpbGwoJ3R5cGUnLCB0YXJnZXQpO1xuICAgIGlmIChtZW1vcnlNYXRjaD8uZWxlbWVudCkge1xuICAgICAgZWxlbWVudCA9IG1lbW9yeU1hdGNoLmVsZW1lbnQ7XG4gICAgICBtZW1vcnlIaXQgPSB0cnVlO1xuICAgIH1cblxuICAgIGlmICghZWxlbWVudCkge1xuICAgICAgZWxlbWVudCA9IGZpbmRFbGVtZW50QnlIZXVyaXN0aWMoeyBsYWJlbDogdGFyZ2V0LCBmaWVsZDogdGFyZ2V0LCBuYW1lOiB0YXJnZXQsIHBsYWNlaG9sZGVyOiB0YXJnZXQgfSwgbnVsbCk7XG4gICAgfVxuXG4gICAgaWYgKCFlbGVtZW50KSB7XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgRmllbGQgbm90IGZvdW5kOiAke2hpbnR9YCB9O1xuICAgIH1cblxuICAgIHNldE5hdGl2ZVZhbHVlKGVsZW1lbnQsIHZhbHVlKTtcbiAgICBkaXNwYXRjaElucHV0RXZlbnRzKGVsZW1lbnQpO1xuICAgIGF3YWl0IGxlYXJuRG9tU2tpbGwoJ3R5cGUnLCB0YXJnZXQsIGVsZW1lbnQpO1xuICAgIHJldHVybiB7IG9rOiB0cnVlLCBmaWVsZDogZ2V0RmllbGRJZChlbGVtZW50KSwgdmFsdWUsIG1lbW9yeUhpdCB9O1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gY2xpY2tCeUhpbnQoaGludCkge1xuICAgIGNvbnN0IHRhcmdldCA9IFN0cmluZyhoaW50IHx8ICcnKS50cmltKCk7XG4gICAgbGV0IGVsZW1lbnQgPSBudWxsO1xuICAgIGxldCBtZW1vcnlIaXQgPSBmYWxzZTtcblxuICAgIGNvbnN0IG1lbW9yeU1hdGNoID0gYXdhaXQgbWF0Y2hEb21Ta2lsbCgnY2xpY2snLCB0YXJnZXQpO1xuICAgIGlmIChtZW1vcnlNYXRjaD8uZWxlbWVudCkge1xuICAgICAgZWxlbWVudCA9IG1lbW9yeU1hdGNoLmVsZW1lbnQ7XG4gICAgICBtZW1vcnlIaXQgPSB0cnVlO1xuICAgIH1cblxuICAgIGlmICghZWxlbWVudCkge1xuICAgICAgZWxlbWVudCA9IGZpbmRFbGVtZW50QnlIZXVyaXN0aWMoeyBsYWJlbDogdGFyZ2V0LCBmaWVsZDogdGFyZ2V0LCBuYW1lOiB0YXJnZXQsIHBsYWNlaG9sZGVyOiB0YXJnZXQgfSwgbnVsbCk7XG4gICAgfVxuXG4gICAgaWYgKCFlbGVtZW50KSB7XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgQ2xpY2sgdGFyZ2V0IG5vdCBmb3VuZDogJHtoaW50fWAgfTtcbiAgICB9XG5cbiAgICBlbGVtZW50LnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdzbW9vdGgnLCBibG9jazogJ2NlbnRlcicgfSk7XG4gICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwMCkpO1xuICAgIGVsZW1lbnQuY2xpY2soKTtcbiAgICBhd2FpdCBsZWFybkRvbVNraWxsKCdjbGljaycsIHRhcmdldCwgZWxlbWVudCk7XG4gICAgcmV0dXJuIHsgb2s6IHRydWUsIGNsaWNrZWQ6IGdldEZpZWxkSWQoZWxlbWVudCksIG1lbW9yeUhpdCB9O1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gc3VibWl0Q3VycmVudEZvcm0oKSB7XG4gICAgY29uc3QgYnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignYnV0dG9uW3R5cGU9XCJzdWJtaXRcIl0sIGlucHV0W3R5cGU9XCJzdWJtaXRcIl0nKTtcbiAgICBpZiAoYnRuKSB7XG4gICAgICBidG4uY2xpY2soKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBhY3Rpb246ICdzdWJtaXRfY2xpY2tlZCcgfTtcbiAgICB9XG4gICAgY29uc3QgZm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2Zvcm0nKTtcbiAgICBpZiAoZm9ybSkge1xuICAgICAgZm9ybS5zdWJtaXQoKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBhY3Rpb246ICdmb3JtX3N1Ym1pdHRlZCcgfTtcbiAgICB9XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ05vIHN1Ym1pdCBidXR0b24gb3IgZm9ybSBmb3VuZCcgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGluZmVyRmllbGRUeXBlRnJvbUhpbnRzKGZpZWxkKSB7XG4gICAgY29uc3QgdGV4dCA9IChmaWVsZC5uYW1lICsgJyAnICsgZmllbGQuaWQgKyAnICcgKyBmaWVsZC5wbGFjZWhvbGRlcikudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAodGV4dC5pbmNsdWRlcygnZW1haWwnKSkgcmV0dXJuICdlbWFpbCc7XG4gICAgaWYgKHRleHQuaW5jbHVkZXMoJ2ZpcnN0JykpIHJldHVybiAnZmlyc3ROYW1lJztcbiAgICBpZiAodGV4dC5pbmNsdWRlcygnbGFzdCcpKSByZXR1cm4gJ2xhc3ROYW1lJztcbiAgICBpZiAodGV4dC5pbmNsdWRlcygncGhvbmUnKSB8fCB0ZXh0LmluY2x1ZGVzKCd0ZWwnKSkgcmV0dXJuICdwaG9uZSc7XG4gICAgaWYgKHRleHQuaW5jbHVkZXMoJ3ppcCcpIHx8IHRleHQuaW5jbHVkZXMoJ3Bvc3QnKSkgcmV0dXJuICd6aXAnO1xuICAgIGlmICh0ZXh0LmluY2x1ZGVzKCdjaXR5JykpIHJldHVybiAnY2l0eSc7XG4gICAgaWYgKHRleHQuaW5jbHVkZXMoJ3N0YXRlJykpIHJldHVybiAnc3RhdGUnO1xuICAgIGlmICh0ZXh0LmluY2x1ZGVzKCdhZGRyZXNzJykpIHJldHVybiAnYWRkcmVzcyc7XG4gICAgcmV0dXJuICd1bmtub3duJztcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzRWxlbWVudFZpc2libGUoZWwpIHtcbiAgICBjb25zdCByZWN0ID0gZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgcmV0dXJuIHJlY3Qud2lkdGggPiAwICYmIHJlY3QuaGVpZ2h0ID4gMCAmJiBnZXRDb21wdXRlZFN0eWxlKGVsKS5kaXNwbGF5ICE9PSAnbm9uZSc7XG4gIH1cblxuICBmdW5jdGlvbiBnZXRGaWVsZElkKGVsKSB7XG4gICAgcmV0dXJuIGVsLmlkIHx8IGVsLm5hbWUgfHwgZWwudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKChyZXF1ZXN0LCBzZW5kZXIsIHNlbmRSZXNwb25zZSkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBpZiAoIXJlcXVlc3QgfHwgdHlwZW9mIHJlcXVlc3QgIT09ICdvYmplY3QnKSB7XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IGVycm9yOiAnSW52YWxpZCByZXF1ZXN0IHBheWxvYWQuJyB9KTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdfX0JJTEdFX1BJTkdfXycpIHtcbiAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IHRydWUgfSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVxdWVzdC50eXBlID09PSAnR0VUX1BBR0VfSU5GTycpIHtcbiAgICAgICAgY29udGVudExvZ2dlci5pbmZvKCdHRVRfUEFHRV9JTkZPIHJlcXVlc3RlZCcpO1xuICAgICAgICBjb25zdCBib2R5VGV4dCA9IGRvY3VtZW50LmJvZHkgPyBkb2N1bWVudC5ib2R5LmlubmVyVGV4dCA6ICcnO1xuICAgICAgICBzZW5kUmVzcG9uc2Uoe1xuICAgICAgICAgIHVybDogd2luZG93LmxvY2F0aW9uLmhyZWYsXG4gICAgICAgICAgdGl0bGU6IGRvY3VtZW50LnRpdGxlIHx8ICcnLFxuICAgICAgICAgIGRlc2NyaXB0aW9uOiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdtZXRhW25hbWU9XCJkZXNjcmlwdGlvblwiXScpPy5jb250ZW50IHx8ICcnLFxuICAgICAgICAgIGh0bWw6IHRydW5jYXRlKGJvZHlUZXh0LCBNQVhfUEFHRV9URVhUX0NIQVJTKSAvLyBUZXh0LW9ubHkgc3VtbWFyeSBmb3IgY29udGV4dFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdFWFBMT1JFX0RPTScpIHtcbiAgICAgICAgY29uc3Qgc2VsZWN0b3IgPSByZXF1ZXN0LnNlbGVjdG9yIHx8ICdib2R5JztcbiAgICAgICAgbGV0IGVsZW1lbnQgPSBudWxsO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGVsZW1lbnQgPSBxdWVyeVNlbGVjdG9yRGVlcChzZWxlY3Rvcik7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIHNlbmRSZXNwb25zZShkZXNjcmliZVJlc3RyaWN0ZWRTZWxlY3RvckVycm9yKHNlbGVjdG9yLCBlcnIpKTtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghZWxlbWVudCkge1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IGVycm9yOiBgU2VsZWN0b3IgJHtzZWxlY3Rvcn0gbm90IGZvdW5kLmAgfSk7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBodG1sID0gZWxlbWVudC5vdXRlckhUTUwgfHwgJyc7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0ge1xuICAgICAgICAgIGh0bWw6IHRydW5jYXRlKGh0bWwsIE1BWF9IVE1MX0NIQVJTKSxcbiAgICAgICAgICB1cmw6IHdpbmRvdy5sb2NhdGlvbi5ocmVmXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGVsZW1lbnQuc2hhZG93Um9vdCkge1xuICAgICAgICAgIHJlc3BvbnNlLnNoYWRvd19odG1sID0gdHJ1bmNhdGUoZWxlbWVudC5zaGFkb3dSb290LmlubmVySFRNTCB8fCAnJywgTUFYX1NIQURPV19IVE1MX0NIQVJTKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHNlbmRSZXNwb25zZShyZXNwb25zZSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVxdWVzdC50eXBlID09PSAnQ0xJQ0tfRUxFTUVOVCcpIHtcbiAgICAgICAgY29uc3Qgc2VsZWN0b3IgPSByZXF1ZXN0LnNlbGVjdG9yO1xuICAgICAgICBjb250ZW50TG9nZ2VyLmluZm8oJ0NMSUNLX0VMRU1FTlQgcmVxdWVzdGVkJywgeyBzZWxlY3RvciwgZmllbGQ6IHJlcXVlc3QuZmllbGQsIG5hbWU6IHJlcXVlc3QubmFtZSB9KTtcblxuICAgICAgICBpZiAoIXNlbGVjdG9yICYmICFyZXF1ZXN0LmZpZWxkICYmICFyZXF1ZXN0Lm5hbWUgJiYgIXJlcXVlc3QubGFiZWwpIHtcbiAgICAgICAgICBjb250ZW50TG9nZ2VyLndhcm4oJ0NMSUNLX0VMRU1FTlQgbWlzc2luZyBzZWxlY3Rvci9oaW50cycpO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IGVycm9yOiAnTWlzc2luZyBzZWxlY3RvciBvciBoZXVyaXN0aWMgaGludHMgKGZpZWxkLCBuYW1lLCBsYWJlbCkuJyB9KTtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBlbGVtZW50ID0gbnVsbDtcbiAgICAgICAgbGV0IG1hdGNoZWRCeSA9ICcnO1xuXG4gICAgICAgIC8vIFRyeSBzZWxlY3RvciBmaXJzdFxuICAgICAgICBpZiAoc2VsZWN0b3IpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgZWxlbWVudCA9IHF1ZXJ5U2VsZWN0b3JEZWVwKHNlbGVjdG9yKTtcbiAgICAgICAgICAgIGlmIChlbGVtZW50KSBtYXRjaGVkQnkgPSAnc2VsZWN0b3InO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29udGVudExvZ2dlci53YXJuKCdJbnZhbGlkIHNlbGVjdG9yIGZvciBjbGljaycsIHsgc2VsZWN0b3IsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIC8vIEludmFsaWQgc2VsZWN0b3IsIGJ1dCBtaWdodCBoYXZlIGhldXJpc3RpYyBoaW50c1xuICAgICAgICAgICAgaWYgKCFyZXF1ZXN0LmZpZWxkICYmICFyZXF1ZXN0Lm5hbWUgJiYgIXJlcXVlc3QubGFiZWwpIHtcbiAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKGRlc2NyaWJlUmVzdHJpY3RlZFNlbGVjdG9yRXJyb3Ioc2VsZWN0b3IsIGVycikpO1xuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGYWxsYmFjayB0byBoZXVyaXN0aWMgbWF0Y2hpbmcgaWYgc2VsZWN0b3IgZmFpbGVkXG4gICAgICAgIGlmICghZWxlbWVudCAmJiAocmVxdWVzdC5maWVsZCB8fCByZXF1ZXN0Lm5hbWUgfHwgcmVxdWVzdC5sYWJlbCB8fCByZXF1ZXN0LnBsYWNlaG9sZGVyKSkge1xuICAgICAgICAgIGVsZW1lbnQgPSBmaW5kRWxlbWVudEJ5SGV1cmlzdGljKHJlcXVlc3QsIHNlbGVjdG9yKTtcbiAgICAgICAgICBpZiAoZWxlbWVudCkgbWF0Y2hlZEJ5ID0gJ2hldXJpc3RpYyc7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWVsZW1lbnQpIHtcbiAgICAgICAgICBjb25zdCBoaW50cyA9IFtyZXF1ZXN0LmZpZWxkLCByZXF1ZXN0Lm5hbWUsIHJlcXVlc3QubGFiZWxdLmZpbHRlcihCb29sZWFuKS5qb2luKCcsICcpO1xuICAgICAgICAgIGNvbnRlbnRMb2dnZXIud2FybignQ0xJQ0tfRUxFTUVOVCBlbGVtZW50IG5vdCBmb3VuZCcsIHsgc2VsZWN0b3IsIGhpbnRzIH0pO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IGVycm9yOiBgRWxlbWVudCBub3QgZm91bmQuIFNlbGVjdG9yOiAke3NlbGVjdG9yIHx8ICcobm9uZSknfSwgSGludHM6ICR7aGludHMgfHwgJyhub25lKSd9YCB9KTtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgZWxlbWVudC5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnYXV0bycsIGJsb2NrOiAnY2VudGVyJywgaW5saW5lOiAnY2VudGVyJyB9KTtcbiAgICAgICAgfSBjYXRjaCAoX2Vycikge31cblxuICAgICAgICB0cnkge1xuICAgICAgICAgIGVsZW1lbnQuY2xpY2soKTtcbiAgICAgICAgICBjb250ZW50TG9nZ2VyLmluZm8oJ0NMSUNLX0VMRU1FTlQgc3VjY2VzcycsIHsgbWF0Y2hlZEJ5LCB0YWc6IGVsZW1lbnQudGFnTmFtZSB9KTtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdGF0dXM6ICdjbGlja2VkJywgbWF0Y2hlZEJ5IH0pO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBjb250ZW50TG9nZ2VyLmVycm9yKCdDTElDS19FTEVNRU5UIGZhaWxlZCcsIHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IGVycm9yOiBgQ2xpY2sgZmFpbGVkOiAke2Vyci5tZXNzYWdlfWAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdUWVBFX1RFWFQnKSB7XG4gICAgICAgIGNvbnN0IHNlbGVjdG9yID0gcmVxdWVzdC5zZWxlY3RvcjtcbiAgICAgICAgY29uc3QgdGV4dCA9IHJlcXVlc3QudGV4dCA/PyAnJztcbiAgICAgICAgY29uc3QgdGV4dFByZXZpZXcgPSBTdHJpbmcodGV4dCkuc2xpY2UoMCwgNTApO1xuICAgICAgICBjb250ZW50TG9nZ2VyLmluZm8oJ1RZUEVfVEVYVCByZXF1ZXN0ZWQnLCB7IHNlbGVjdG9yLCB0ZXh0UHJldmlldywgZmllbGQ6IHJlcXVlc3QuZmllbGQgfSk7XG5cbiAgICAgICAgaWYgKCFzZWxlY3RvciAmJiAhcmVxdWVzdC5maWVsZCAmJiAhcmVxdWVzdC5uYW1lICYmICFyZXF1ZXN0LmxhYmVsKSB7XG4gICAgICAgICAgY29udGVudExvZ2dlci53YXJuKCdUWVBFX1RFWFQgbWlzc2luZyBzZWxlY3Rvci9oaW50cycpO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IGVycm9yOiAnTWlzc2luZyBzZWxlY3RvciBvciBoZXVyaXN0aWMgaGludHMgKGZpZWxkLCBuYW1lLCBsYWJlbCkuJyB9KTtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBlbGVtZW50ID0gbnVsbDtcbiAgICAgICAgbGV0IG1hdGNoZWRCeSA9ICcnO1xuXG4gICAgICAgIC8vIFRyeSBzZWxlY3RvciBmaXJzdFxuICAgICAgICBpZiAoc2VsZWN0b3IpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgZWxlbWVudCA9IHF1ZXJ5U2VsZWN0b3JEZWVwKHNlbGVjdG9yKTtcbiAgICAgICAgICAgIGlmIChlbGVtZW50KSBtYXRjaGVkQnkgPSAnc2VsZWN0b3InO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29udGVudExvZ2dlci53YXJuKCdJbnZhbGlkIHNlbGVjdG9yIGZvciB0eXBlJywgeyBzZWxlY3RvciwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgLy8gSW52YWxpZCBzZWxlY3RvciwgYnV0IG1pZ2h0IGhhdmUgaGV1cmlzdGljIGhpbnRzXG4gICAgICAgICAgICBpZiAoIXJlcXVlc3QuZmllbGQgJiYgIXJlcXVlc3QubmFtZSAmJiAhcmVxdWVzdC5sYWJlbCkge1xuICAgICAgICAgICAgICBzZW5kUmVzcG9uc2UoZGVzY3JpYmVSZXN0cmljdGVkU2VsZWN0b3JFcnJvcihzZWxlY3RvciwgZXJyKSk7XG4gICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIGhldXJpc3RpYyBtYXRjaGluZyBpZiBzZWxlY3RvciBmYWlsZWRcbiAgICAgICAgaWYgKCFlbGVtZW50ICYmIChyZXF1ZXN0LmZpZWxkIHx8IHJlcXVlc3QubmFtZSB8fCByZXF1ZXN0LmxhYmVsIHx8IHJlcXVlc3QucGxhY2Vob2xkZXIpKSB7XG4gICAgICAgICAgZWxlbWVudCA9IGZpbmRFbGVtZW50QnlIZXVyaXN0aWMocmVxdWVzdCwgc2VsZWN0b3IpO1xuICAgICAgICAgIGlmIChlbGVtZW50KSBtYXRjaGVkQnkgPSAnaGV1cmlzdGljJztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghZWxlbWVudCkge1xuICAgICAgICAgIGNvbnN0IGhpbnRzID0gW3JlcXVlc3QuZmllbGQsIHJlcXVlc3QubmFtZSwgcmVxdWVzdC5sYWJlbF0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJywgJyk7XG4gICAgICAgICAgY29udGVudExvZ2dlci53YXJuKCdUWVBFX1RFWFQgZWxlbWVudCBub3QgZm91bmQnLCB7IHNlbGVjdG9yLCBoaW50cyB9KTtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBlcnJvcjogYEVsZW1lbnQgbm90IGZvdW5kLiBTZWxlY3RvcjogJHtzZWxlY3RvciB8fCAnKG5vbmUpJ30sIEhpbnRzOiAke2hpbnRzIHx8ICcobm9uZSknfWAgfSk7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgIGVsZW1lbnQuZm9jdXMoKTtcblxuICAgICAgICAgIGNvbnN0IHRhZyA9IFN0cmluZyhlbGVtZW50Py50YWdOYW1lIHx8ICcnKS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgIGlmICh0YWcgPT09ICdJTlBVVCcgfHwgdGFnID09PSAnVEVYVEFSRUEnKSB7XG4gICAgICAgICAgICBzZXROYXRpdmVWYWx1ZShlbGVtZW50LCB0ZXh0KTtcbiAgICAgICAgICAgIGRpc3BhdGNoSW5wdXRFdmVudHMoZWxlbWVudCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChlbGVtZW50LmlzQ29udGVudEVkaXRhYmxlKSB7XG4gICAgICAgICAgICBlbGVtZW50LnRleHRDb250ZW50ID0gU3RyaW5nKHRleHQpO1xuICAgICAgICAgICAgZGlzcGF0Y2hJbnB1dEV2ZW50cyhlbGVtZW50KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZWxlbWVudC50ZXh0Q29udGVudCA9IFN0cmluZyh0ZXh0KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb250ZW50TG9nZ2VyLmluZm8oJ1RZUEVfVEVYVCBzdWNjZXNzJywgeyBtYXRjaGVkQnksIHRhZzogZWxlbWVudC50YWdOYW1lIH0pO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IHN0YXR1czogJ3R5cGVkJywgbWF0Y2hlZEJ5IH0pO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBjb250ZW50TG9nZ2VyLmVycm9yKCdUWVBFX1RFWFQgZmFpbGVkJywgeyBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgZXJyb3I6IGBUeXBlIGZhaWxlZDogJHtlcnIubWVzc2FnZX1gIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVxdWVzdC50eXBlID09PSAnRVhUUkFDVF9GT1JNX0ZJRUxEUycpIHtcbiAgICAgICAgY29udGVudExvZ2dlci5pbmZvKCdFWFRSQUNUX0ZPUk1fRklFTERTIHJlcXVlc3RlZCcpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGZvcm1GaWVsZHMgPSBbXTtcbiAgICAgICAgICBjb25zdCBhbGxJbnB1dHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dCwgdGV4dGFyZWEsIHNlbGVjdCwgW2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl0nKTtcblxuICAgICAgICAgIGxldCBmaWVsZEluZGV4ID0gMDtcbiAgICAgICAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgYWxsSW5wdXRzKSB7XG4gICAgICAgICAgICBpZiAoIWlzVXNhYmxlRmllbGQoZWxlbWVudCkpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBjb25zdCB0YWcgPSBlbGVtZW50LnRhZ05hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIGNvbnN0IHR5cGUgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgndHlwZScpIHx8ICh0YWcgPT09ICd0ZXh0YXJlYScgPyAndGV4dGFyZWEnIDogdGFnID09PSAnc2VsZWN0JyA/ICdzZWxlY3QnIDogJ3RleHQnKTtcblxuICAgICAgICAgICAgLy8gU2tpcCBoaWRkZW4sIHN1Ym1pdCwgYnV0dG9uLCBpbWFnZSwgZmlsZSwgcmVzZXQgdHlwZXNcbiAgICAgICAgICAgIGlmIChbJ2hpZGRlbicsICdzdWJtaXQnLCAnYnV0dG9uJywgJ2ltYWdlJywgJ2ZpbGUnLCAncmVzZXQnXS5pbmNsdWRlcyh0eXBlKSkgY29udGludWU7XG5cbiAgICAgICAgICAgIGNvbnN0IGlkID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2lkJykgfHwgJyc7XG4gICAgICAgICAgICBjb25zdCBuYW1lID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ25hbWUnKSB8fCAnJztcbiAgICAgICAgICAgIGNvbnN0IHBsYWNlaG9sZGVyID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3BsYWNlaG9sZGVyJykgfHwgJyc7XG4gICAgICAgICAgICBjb25zdCBhdXRvY29tcGxldGUgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnYXV0b2NvbXBsZXRlJykgfHwgJyc7XG4gICAgICAgICAgICBjb25zdCBhcmlhTGFiZWwgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8ICcnO1xuICAgICAgICAgICAgY29uc3QgbGFiZWxUZXh0ID0gZmluZExhYmVsVGV4dChlbGVtZW50KTtcblxuICAgICAgICAgICAgLy8gR2V0IGN1cnJlbnQgdmFsdWVcbiAgICAgICAgICAgIGxldCBjdXJyZW50VmFsdWUgPSAnJztcbiAgICAgICAgICAgIGlmIChlbGVtZW50LmlzQ29udGVudEVkaXRhYmxlKSB7XG4gICAgICAgICAgICAgIGN1cnJlbnRWYWx1ZSA9IGVsZW1lbnQudGV4dENvbnRlbnQgfHwgJyc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCd2YWx1ZScgaW4gZWxlbWVudCkge1xuICAgICAgICAgICAgICBjdXJyZW50VmFsdWUgPSBlbGVtZW50LnZhbHVlIHx8ICcnO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBCdWlsZCBhIHVuaXF1ZSBzZWxlY3RvciBmb3IgdGhpcyBmaWVsZFxuICAgICAgICAgICAgbGV0IHNlbGVjdG9yID0gJyc7XG4gICAgICAgICAgICBpZiAoaWQpIHtcbiAgICAgICAgICAgICAgc2VsZWN0b3IgPSBgIyR7Q1NTLmVzY2FwZShpZCl9YDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobmFtZSkge1xuICAgICAgICAgICAgICBzZWxlY3RvciA9IGAke3RhZ31bbmFtZT1cIiR7Q1NTLmVzY2FwZShuYW1lKX1cIl1gO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgLy8gRmFsbGJhY2sgdG8gbnRoLW9mLXR5cGUgc2VsZWN0b3JcbiAgICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gZWxlbWVudC5wYXJlbnRFbGVtZW50O1xuICAgICAgICAgICAgICBpZiAocGFyZW50KSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2libGluZ3MgPSBBcnJheS5mcm9tKHBhcmVudC5xdWVyeVNlbGVjdG9yQWxsKHRhZykpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGluZGV4ID0gc2libGluZ3MuaW5kZXhPZihlbGVtZW50KTtcbiAgICAgICAgICAgICAgICBpZiAoaW5kZXggPj0gMCkge1xuICAgICAgICAgICAgICAgICAgc2VsZWN0b3IgPSBgJHt0YWd9Om50aC1vZi10eXBlKCR7aW5kZXggKyAxfSlgO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3JtRmllbGRzLnB1c2goe1xuICAgICAgICAgICAgICBpbmRleDogZmllbGRJbmRleCsrLFxuICAgICAgICAgICAgICBzZWxlY3RvcixcbiAgICAgICAgICAgICAgdGFnLFxuICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgICAgcGxhY2Vob2xkZXIsXG4gICAgICAgICAgICAgIGF1dG9jb21wbGV0ZSxcbiAgICAgICAgICAgICAgYXJpYUxhYmVsLFxuICAgICAgICAgICAgICBsYWJlbDogbGFiZWxUZXh0LnRyaW0oKS5zbGljZSgwLCAyMDApLFxuICAgICAgICAgICAgICBjdXJyZW50VmFsdWU6IGN1cnJlbnRWYWx1ZS5zbGljZSgwLCA1MDApLFxuICAgICAgICAgICAgICBpc1JlcXVpcmVkOiBlbGVtZW50Lmhhc0F0dHJpYnV0ZSgncmVxdWlyZWQnKSB8fCBlbGVtZW50LmdldEF0dHJpYnV0ZSgnYXJpYS1yZXF1aXJlZCcpID09PSAndHJ1ZSdcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnRlbnRMb2dnZXIuaW5mbyhgRVhUUkFDVF9GT1JNX0ZJRUxEUyBmb3VuZCAke2Zvcm1GaWVsZHMubGVuZ3RofSBmaWVsZHNgKTtcbiAgICAgICAgICBzZW5kUmVzcG9uc2Uoe1xuICAgICAgICAgICAgZmllbGRzOiBmb3JtRmllbGRzLFxuICAgICAgICAgICAgcGFnZVVybDogd2luZG93LmxvY2F0aW9uLmhyZWYsXG4gICAgICAgICAgICBwYWdlVGl0bGU6IGRvY3VtZW50LnRpdGxlIHx8ICcnXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnIgJiYgZXJyLm1lc3NhZ2UgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIgfHwgJ1Vua25vd24gZXJyb3InKTtcbiAgICAgICAgICBjb250ZW50TG9nZ2VyLmVycm9yKCdFWFRSQUNUX0ZPUk1fRklFTERTIGZhaWxlZCcsIHsgZXJyb3I6IG1lc3NhZ2UgfSk7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgZXJyb3I6IGBFeHRyYWN0IGZvcm0gZmllbGRzIGZhaWxlZDogJHttZXNzYWdlfWAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdFWEVDVVRFX0pTJykge1xuICAgICAgICBjb25zdCBjb2RlID0gU3RyaW5nKHJlcXVlc3QuY29kZSB8fCAnJyk7XG4gICAgICAgIGNvbnN0IGNvZGVQcmV2aWV3ID0gY29kZS5zbGljZSgwLCA4MCk7XG4gICAgICAgIGNvbnRlbnRMb2dnZXIuaW5mbygnRVhFQ1VURV9KUyByZXF1ZXN0ZWQnLCB7IGNvZGVMZW5ndGg6IGNvZGUubGVuZ3RoLCBjb2RlUHJldmlldyB9KTtcblxuICAgICAgICBpZiAoIWNvZGUudHJpbSgpKSB7XG4gICAgICAgICAgY29udGVudExvZ2dlci53YXJuKCdFWEVDVVRFX0pTIG1pc3NpbmcgY29kZScpO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IGVycm9yOiAnTWlzc2luZyBjb2RlLicgfSk7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvZGUubGVuZ3RoID4gTUFYX0VYRUNVVEVfSlNfQ09ERV9DSEFSUykge1xuICAgICAgICAgIGNvbnRlbnRMb2dnZXIud2FybignRVhFQ1VURV9KUyBjb2RlIHRvbyBsYXJnZScsIHsgY29kZUxlbmd0aDogY29kZS5sZW5ndGggfSk7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgZXJyb3I6IGBDb2RlIHRvbyBsYXJnZSAoJHtjb2RlLmxlbmd0aH0gY2hhcnMpLiBNYXggaXMgJHtNQVhfRVhFQ1VURV9KU19DT0RFX0NIQVJTfS5gIH0pO1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdGltZW91dE1zID0gcmVxdWVzdC50aW1lb3V0X21zO1xuXG4gICAgICAgIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gZXhlY3V0ZVVzZXJKYXZhU2NyaXB0KGNvZGUsIHRpbWVvdXRNcykpXG4gICAgICAgICAgLnRoZW4oKHJlc3VsdCkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2FmZSA9IGpzb25TYWZlKHJlc3VsdCk7XG4gICAgICAgICAgICBsZXQganNvbiA9ICcnO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAganNvbiA9IEpTT04uc3RyaW5naWZ5KHNhZmUpO1xuICAgICAgICAgICAgfSBjYXRjaCAoX2Vycikge1xuICAgICAgICAgICAgICBqc29uID0gJyc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoanNvbikganNvbiA9IHRydW5jYXRlKGpzb24sIE1BWF9FWEVDVVRFX0pTX1JFU1VMVF9DSEFSUyk7XG4gICAgICAgICAgICBjb250ZW50TG9nZ2VyLmluZm8oJ0VYRUNVVEVfSlMgc3VjY2VzcycsIHsgcmVzdWx0TGVuZ3RoOiBqc29uPy5sZW5ndGggfHwgMCB9KTtcbiAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlLCByZXN1bHQ6IHNhZmUsIGpzb24gfSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuY2F0Y2goKGVycikgPT4ge1xuICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IGVyciAmJiBlcnIubWVzc2FnZSA/IFN0cmluZyhlcnIubWVzc2FnZSkgOiBTdHJpbmcoZXJyIHx8ICdVbmtub3duIGVycm9yJyk7XG4gICAgICAgICAgICBjb250ZW50TG9nZ2VyLmVycm9yKCdFWEVDVVRFX0pTIGZhaWxlZCcsIHsgZXJyb3I6IG1lc3NhZ2UgfSk7XG4gICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBlcnJvcjogYEV4ZWN1dGUgSlMgZmFpbGVkOiAke21lc3NhZ2V9YCB9KTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ0NBTkNFTF9DVVJSRU5UX0FDVElPTicpIHtcbiAgICAgICAgY29udGVudExvZ2dlci5pbmZvKCdDQU5DRUxfQ1VSUkVOVF9BQ1RJT04gcmVxdWVzdGVkJyk7XG4gICAgICAgIC8vIEN1cnJlbnRseSB3ZSBkb24ndCBoYXZlIGEgd2F5IHRvIHN0b3AgYSBydW5uaW5nIGFjdGlvbiBlYXNpbHksXG4gICAgICAgIC8vIGJ1dCB3ZSBjYW4gYXQgbGVhc3QgY2xlYXIgaGlnaGxpZ2h0cy5cbiAgICAgICAgaWYgKHdpbmRvdy5fX2JpbGdlX3J1bnRpbWUpIHtcbiAgICAgICAgICB3aW5kb3cuX19iaWxnZV9ydW50aW1lLnVwZGF0ZUhpZ2hsaWdodChudWxsKTtcbiAgICAgICAgfVxuICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogdHJ1ZSB9KTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG5cbiAgICAgIC8vIEhhbmRsZSBuYXR1cmFsIGxhbmd1YWdlIGNvbW1hbmRzIHZpYSBjb3J0ZXggd2l0aCByZXNpbGllbnQgZmFsbGJhY2tcbiAgICAgIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdFWEVDVVRFX05BVFVSQUxfQ09NTUFORCcpIHtcbiAgICAgICAgY29uc3QgY29tbWFuZCA9IHJlcXVlc3QuY29tbWFuZCB8fCAnJztcbiAgICAgICAgY29uc3QgcGVyc29uYSA9IFN0cmluZyhyZXF1ZXN0LnBlcnNvbmEgfHwgJ2JpbGdlX2FnZW50JykudHJpbSgpLnRvTG93ZXJDYXNlKCkgfHwgJ2JpbGdlX2FnZW50JztcbiAgICAgICAgY29udGVudExvZ2dlci5pbmZvKCdFWEVDVVRFX05BVFVSQUxfQ09NTUFORCByZXF1ZXN0ZWQnLCB7IGNvbW1hbmQsIHBlcnNvbmEgfSk7XG5cbiAgICAgICAgUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICAudGhlbigoKSA9PiBleGVjdXRlUmVzaWxpZW50TmF0dXJhbENvbW1hbmQoY29tbWFuZCkpXG4gICAgICAgICAgLnRoZW4oKHJlc3VsdCkgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdC5vayAmJiB3aW5kb3cuX19iaWxnZV9jb21tYW5kQXV0b2NvbXBsZXRlKSB7XG4gICAgICAgICAgICAgIHdpbmRvdy5fX2JpbGdlX2NvbW1hbmRBdXRvY29tcGxldGUuc2F2ZUNvbW1hbmQoY29tbWFuZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyAuLi5yZXN1bHQsIHBlcnNvbmEgfSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuY2F0Y2goKGVycikgPT4ge1xuICAgICAgICAgICAgY29udGVudExvZ2dlci5lcnJvcignRVhFQ1VURV9OQVRVUkFMX0NPTU1BTkQgZmFpbGVkJywgeyBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBcbiAgICAgICAgICAgICAgb2s6IGZhbHNlLCBcbiAgICAgICAgICAgICAgZXJyb3I6IGVyci5tZXNzYWdlIHx8IFN0cmluZyhlcnIgfHwgJ1Vua25vd24gZXhlY3V0aW9uIGVycm9yJyksXG4gICAgICAgICAgICAgIHBlcnNvbmEgXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ1BBUlNFX0NPTU1BTkQnKSB7XG4gICAgICAgIGNvbnN0IGNvbW1hbmQgPSByZXF1ZXN0LmNvbW1hbmQgfHwgJyc7XG4gICAgICAgIGNvbnRlbnRMb2dnZXIuaW5mbygnUEFSU0VfQ09NTUFORCByZXF1ZXN0ZWQnLCB7IGNvbW1hbmQgfSk7XG5cbiAgICAgICAgaWYgKCF3aW5kb3cuQmlsZ2VDb3J0ZXggJiYgIXdpbmRvdy5fX2JpbGdlX2NvcnRleF9sb2FkZWQpIHtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBlcnJvcjogJ0NvcnRleCBtb2R1bGUgbm90IGxvYWRlZCcsIHBhcnNlZDogbnVsbCB9KTtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIFByb21pc2UucmVzb2x2ZSgpLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcmVzb2x2ZU5hdHVyYWxDb21tYW5kKGNvbW1hbmQpO1xuICAgICAgICAgIGlmICghcmVzb2x2ZWQ/LnBhcnNlZCB8fCAhcmVzb2x2ZWQ/LmV4ZWN1dGFibGUpIHtcbiAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7XG4gICAgICAgICAgICAgIHBhcnNlZDogbnVsbCxcbiAgICAgICAgICAgICAgZXhlY3V0YWJsZTogbnVsbCxcbiAgICAgICAgICAgICAgcmVjb2duaXplZDogZmFsc2UsXG4gICAgICAgICAgICAgIHByb3RvY29sOiAnbmF0dXJhbC1jb21tYW5kLXYyJ1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHNlbmRSZXNwb25zZSh7XG4gICAgICAgICAgICBwYXJzZWQ6IHJlc29sdmVkLnBhcnNlZCxcbiAgICAgICAgICAgIGV4ZWN1dGFibGU6IHJlc29sdmVkLmV4ZWN1dGFibGUsXG4gICAgICAgICAgICByZWNvZ25pemVkOiB0cnVlLFxuICAgICAgICAgICAgc2VsZkhlYWxlZDogISFyZXNvbHZlZC5yZXBhaXJlZCxcbiAgICAgICAgICAgIGNvbW1hbmRNZW1vcnlIaXQ6ICEhcmVzb2x2ZWQuY29tbWFuZE1lbW9yeUhpdCxcbiAgICAgICAgICAgIHJlY292ZXJ5UGF0aDogcmVzb2x2ZWQucmVjb3ZlcnlQYXRoLFxuICAgICAgICAgICAgcHJvdG9jb2w6ICduYXR1cmFsLWNvbW1hbmQtdjInXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgICBzZW5kUmVzcG9uc2Uoe1xuICAgICAgICAgICAgZXJyb3I6IGVycj8ubWVzc2FnZSB8fCBTdHJpbmcoZXJyIHx8ICdQYXJzZSBjb21tYW5kIGZhaWxlZCcpLFxuICAgICAgICAgICAgcGFyc2VkOiBudWxsLFxuICAgICAgICAgICAgZXhlY3V0YWJsZTogbnVsbCxcbiAgICAgICAgICAgIHJlY29nbml6ZWQ6IGZhbHNlLFxuICAgICAgICAgICAgcHJvdG9jb2w6ICduYXR1cmFsLWNvbW1hbmQtdjInXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAgIC8vIFNlbGYtSGVhbGluZyBNb2R1bGUgTWVzc2FnZSBIYW5kbGVyc1xuICAgICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgICAgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ0ZJTExfRlJPTV9QUk9GSUxFJykge1xuICAgICAgICBjb25zdCBwcm9maWxlUGF0aCA9IHJlcXVlc3QucHJvZmlsZVBhdGggfHwgJ3Byb2ZpbGVzL2RlZmF1bHQuanNvbic7XG4gICAgICAgIGNvbnRlbnRMb2dnZXIuaW5mbygnRklMTF9GUk9NX1BST0ZJTEUgcmVxdWVzdGVkJywgeyBwcm9maWxlUGF0aCB9KTtcblxuICAgICAgICBpZiAoIW1jcEJyaWRnZSkge1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6ICdNQ1AgYnJpZGdlIG5vdCBpbml0aWFsaXplZCcgfSk7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBQcm9taXNlLnJlc29sdmUoKS50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBjb25zdCBwcm9maWxlID0gYXdhaXQgbWNwQnJpZGdlLmxvYWRQcm9maWxlRGF0YShwcm9maWxlUGF0aCk7XG4gICAgICAgICAgaWYgKCFwcm9maWxlKSB7XG4gICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiAnRmFpbGVkIHRvIGxvYWQgcHJvZmlsZSBkYXRhJyB9KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBFeHRyYWN0IGZvcm0gZmllbGRzIGZvciBtYXBwaW5nXG4gICAgICAgICAgY29uc3QgZm9ybUZpZWxkcyA9IFtdO1xuICAgICAgICAgIGNvbnN0IGlucHV0cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0LCB0ZXh0YXJlYSwgc2VsZWN0LCBbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXScpO1xuICAgICAgICAgIGZvciAoY29uc3QgaW5wdXQgb2YgaW5wdXRzKSB7XG4gICAgICAgICAgICBpZiAoIWlzVXNhYmxlRmllbGQoaW5wdXQpKSBjb250aW51ZTtcbiAgICAgICAgICAgIGZvcm1GaWVsZHMucHVzaCh7XG4gICAgICAgICAgICAgIHNlbGVjdG9yOiBpbnB1dC5pZCA/IGAjJHtDU1MuZXNjYXBlKGlucHV0LmlkKX1gIDogKGlucHV0Lm5hbWUgPyBgW25hbWU9XCIke0NTUy5lc2NhcGUoaW5wdXQubmFtZSl9XCJdYCA6IG51bGwpLFxuICAgICAgICAgICAgICBuYW1lOiBpbnB1dC5uYW1lIHx8ICcnLFxuICAgICAgICAgICAgICBpZDogaW5wdXQuaWQgfHwgJycsXG4gICAgICAgICAgICAgIHBsYWNlaG9sZGVyOiBpbnB1dC5wbGFjZWhvbGRlciB8fCAnJyxcbiAgICAgICAgICAgICAgYXV0b2NvbXBsZXRlOiBpbnB1dC5hdXRvY29tcGxldGUgfHwgJycsXG4gICAgICAgICAgICAgIGxhYmVsOiBmaW5kTGFiZWxUZXh0KGlucHV0KSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IG1hcHBpbmcgPSBtY3BCcmlkZ2UubWF0Y2hGaWVsZHNUb1Byb2ZpbGUoZm9ybUZpZWxkcywgcHJvZmlsZSk7XG4gICAgICAgICAgY29uc3QgcmVzdWx0cyA9IHsgZmlsbGVkOiAwLCBza2lwcGVkOiAwLCBmYWlsZWQ6IDAgfTtcblxuICAgICAgICAgIGZvciAoY29uc3QgW3NlbGVjdG9yLCB2YWx1ZV0gb2YgbWFwcGluZykge1xuICAgICAgICAgICAgaWYgKCFzZWxlY3RvcikgY29udGludWU7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgICAgICAgICAgIGlmICghZWxlbWVudCkge1xuICAgICAgICAgICAgICAgIHJlc3VsdHMuZmFpbGVkICs9IDE7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvLyBVc2UgZXhpc3RpbmcgZmlsbCBsb2dpY1xuICAgICAgICAgICAgICBlbGVtZW50LmZvY3VzKCk7XG4gICAgICAgICAgICAgIGlmIChlbGVtZW50LnRhZ05hbWUgPT09ICdJTlBVVCcgfHwgZWxlbWVudC50YWdOYW1lID09PSAnVEVYVEFSRUEnKSB7XG4gICAgICAgICAgICAgICAgc2V0TmF0aXZlVmFsdWUoZWxlbWVudCwgdmFsdWUpO1xuICAgICAgICAgICAgICAgIGRpc3BhdGNoSW5wdXRFdmVudHMoZWxlbWVudCk7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoZWxlbWVudC5pc0NvbnRlbnRFZGl0YWJsZSkge1xuICAgICAgICAgICAgICAgIGVsZW1lbnQudGV4dENvbnRlbnQgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICBkaXNwYXRjaElucHV0RXZlbnRzKGVsZW1lbnQpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJlc3VsdHMuZmlsbGVkICs9IDE7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgcmVzdWx0cy5mYWlsZWQgKz0gMTtcbiAgICAgICAgICAgICAgY29udGVudExvZ2dlci53YXJuKCdGaWxsIGZpZWxkIGZhaWxlZCcsIHsgc2VsZWN0b3IsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb250ZW50TG9nZ2VyLmluZm8oJ0ZJTExfRlJPTV9QUk9GSUxFIGNvbXBsZXRlZCcsIHJlc3VsdHMpO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlLCByZXN1bHRzIH0pO1xuICAgICAgICB9KS5jYXRjaCgoZXJyKSA9PiB7XG4gICAgICAgICAgY29udGVudExvZ2dlci5lcnJvcignRklMTF9GUk9NX1BST0ZJTEUgZmFpbGVkJywgeyBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ1NBVkVfRk9STV9TVEFURScpIHtcbiAgICAgICAgY29udGVudExvZ2dlci5pbmZvKCdTQVZFX0ZPUk1fU1RBVEUgcmVxdWVzdGVkJyk7XG5cbiAgICAgICAgaWYgKCFmb3JtUGVyc2lzdGVuY2UpIHtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiAnRm9ybSBwZXJzaXN0ZW5jZSBub3QgaW5pdGlhbGl6ZWQnIH0pO1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgUHJvbWlzZS5yZXNvbHZlKCkudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgICAgY29uc3Qgc3RhdGUgPSBmb3JtUGVyc2lzdGVuY2UuY2FwdHVyZUZvcm1TdGF0ZSgpO1xuICAgICAgICAgIGF3YWl0IGZvcm1QZXJzaXN0ZW5jZS5zYXZlVG9TdG9yYWdlKHN0YXRlKTtcbiAgICAgICAgICBjb250ZW50TG9nZ2VyLmluZm8oJ1NBVkVfRk9STV9TVEFURSBjb21wbGV0ZWQnLCB7IGZpZWxkc0NvdW50OiBzdGF0ZS5maWVsZHMubGVuZ3RoIH0pO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlLCBmaWVsZHNDb3VudDogc3RhdGUuZmllbGRzLmxlbmd0aCB9KTtcbiAgICAgICAgfSkuY2F0Y2goKGVycikgPT4ge1xuICAgICAgICAgIGNvbnRlbnRMb2dnZXIuZXJyb3IoJ1NBVkVfRk9STV9TVEFURSBmYWlsZWQnLCB7IGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVxdWVzdC50eXBlID09PSAnUkVTVE9SRV9GT1JNX1NUQVRFJykge1xuICAgICAgICBjb250ZW50TG9nZ2VyLmluZm8oJ1JFU1RPUkVfRk9STV9TVEFURSByZXF1ZXN0ZWQnKTtcblxuICAgICAgICBpZiAoIWZvcm1QZXJzaXN0ZW5jZSkge1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6ICdGb3JtIHBlcnNpc3RlbmNlIG5vdCBpbml0aWFsaXplZCcgfSk7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBQcm9taXNlLnJlc29sdmUoKS50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBjb25zdCBzYXZlZFN0YXRlID0gYXdhaXQgZm9ybVBlcnNpc3RlbmNlLmxvYWRNYXRjaGluZ1N0YXRlKCk7XG4gICAgICAgICAgaWYgKCFzYXZlZFN0YXRlKSB7XG4gICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiAnTm8gc2F2ZWQgc3RhdGUgZm91bmQgZm9yIHRoaXMgVVJMJyB9KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgZm9ybVBlcnNpc3RlbmNlLnJlc3RvcmVGb3JtU3RhdGUoc2F2ZWRTdGF0ZSwgc2VsZkhlYWxpbmdFbmdpbmUpO1xuICAgICAgICAgIGNvbnRlbnRMb2dnZXIuaW5mbygnUkVTVE9SRV9GT1JNX1NUQVRFIGNvbXBsZXRlZCcsIHJlc3VsdHMpO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlLCByZXN1bHRzIH0pO1xuICAgICAgICB9KS5jYXRjaCgoZXJyKSA9PiB7XG4gICAgICAgICAgY29udGVudExvZ2dlci5lcnJvcignUkVTVE9SRV9GT1JNX1NUQVRFIGZhaWxlZCcsIHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdHRVRfU0VMRl9IRUFMSU5HX1NUQVRTJykge1xuICAgICAgICBjb250ZW50TG9nZ2VyLmluZm8oJ0dFVF9TRUxGX0hFQUxJTkdfU1RBVFMgcmVxdWVzdGVkJyk7XG5cbiAgICAgICAgaWYgKCFzZWxmSGVhbGluZ0VuZ2luZSkge1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6ICdTZWxmLWhlYWxpbmcgZW5naW5lIG5vdCBpbml0aWFsaXplZCcgfSk7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzdGF0cyA9IHNlbGZIZWFsaW5nRW5naW5lLmdldFN0YXRzKCk7XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlLCBzdGF0cyB9KTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdHRVRfUEFHRV9DT05URVhUJykge1xuICAgICAgICBjb250ZW50TG9nZ2VyLmluZm8oJ0dFVF9QQUdFX0NPTlRFWFQgcmVxdWVzdGVkJyk7XG5cbiAgICAgICAgaWYgKCFjb250ZXh0SW5mZXJlbmNlKSB7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogJ0NvbnRleHQgaW5mZXJlbmNlIG5vdCBpbml0aWFsaXplZCcgfSk7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjb250ZXh0ID0gY29udGV4dEluZmVyZW5jZS5leHRyYWN0UGFnZUNvbnRleHQoKTtcbiAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IHRydWUsIGNvbnRleHQgfSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuXG4gICAgICBzZW5kUmVzcG9uc2UoeyBlcnJvcjogYFVua25vd24gcmVxdWVzdCB0eXBlOiAke1N0cmluZyhyZXF1ZXN0LnR5cGUgfHwgJycpfWAgfSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnIgJiYgZXJyLm1lc3NhZ2UgPyBTdHJpbmcoZXJyLm1lc3NhZ2UpIDogU3RyaW5nKGVyciB8fCAnVW5rbm93biBlcnJvcicpO1xuICAgICAgc2VuZFJlc3BvbnNlKHsgZXJyb3I6IGBDb250ZW50IHNjcmlwdCBlcnJvcjogJHttZXNzYWdlfWAgfSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH0pO1xufSkoKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7QUFJQSxTQUFTLGlCQUFpQjtBQUN4QixNQUFJO0FBQ0YsVUFBTSxJQUFJLE9BQU8sZUFBZSxjQUFjLGFBQWE7QUFDM0QsUUFBSSxLQUFLLEVBQUUsaUJBQWlCLE9BQU8sRUFBRSxrQkFBa0IsVUFBVTtBQUMvRCxhQUFPLEVBQUU7QUFBQSxJQUNYO0FBQUEsRUFDRixRQUFRO0FBQUEsRUFBQztBQUNULFNBQU87QUFDVDtBQVJTO0FBVVQsU0FBUyx5QkFBeUI7QUFFaEMsUUFBTSxhQUNKO0FBS0YsTUFBSSxDQUFDLFdBQVksUUFBTztBQUl4QixRQUFNLGVBQ0osT0FDSSxnQkFDeUMsUUFDdkMsZUFDQTtBQUVSLFNBQU87QUFBQSxJQUNMLE1BQU07QUFBQSxJQUNOLE9BQU8sT0FBeUMsT0FBa0I7QUFBQSxJQUNsRSxTQUFTLE9BQXFDLFdBQWM7QUFBQSxJQUM1RCxjQUFjLE9BQTBDLDBCQUFtQjtBQUFBLElBQzNFLFlBQVksT0FBd0MsMkJBQWlCO0FBQUEsSUFDckUsd0JBQ0UsT0FBb0QsYUFBNkI7QUFBQSxJQUNuRixxQkFBcUIsT0FBaUQsa0JBQTBCO0FBQUEsSUFDaEcsVUFBVTtBQUFBLE1BQ1IsV0FBVyxPQUE4QyxPQUF1QjtBQUFBLE1BQ2hGLGlCQUFpQixPQUFvRCxPQUE2QjtBQUFBLE1BQ2xHLHFCQUNFLE9BQXdELE9BQWlDO0FBQUEsTUFDM0YsWUFBWSxPQUErQyxPQUF3QjtBQUFBLElBQ3JGO0FBQUEsSUFDQSxXQUFXO0FBQUEsTUFDVCxTQUFTLE9BQStDLFFBQXdCO0FBQUEsTUFDaEYsVUFBVSxPQUFnRCxvQ0FBeUI7QUFBQSxJQUNyRjtBQUFBLEVBQ0Y7QUFDRjtBQXhDUztBQTBDRixTQUFTLFNBQVM7QUFDdkIsUUFBTSxXQUFXLGVBQWU7QUFDaEMsTUFBSSxTQUFVLFFBQU87QUFFckIsUUFBTSxjQUFjLHVCQUF1QjtBQUMzQyxNQUFJLFlBQWEsUUFBTztBQUd4QixTQUFPO0FBQUEsSUFDTCxNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsSUFDUCxTQUFTO0FBQUEsSUFDVCxjQUFjO0FBQUEsSUFDZCxZQUFZO0FBQUEsSUFDWix3QkFBd0I7QUFBQSxJQUN4QixxQkFBcUI7QUFBQSxJQUNyQixVQUFVLEVBQUUsV0FBVyxNQUFNLGlCQUFpQixNQUFNLHFCQUFxQixNQUFNLFlBQVksS0FBSztBQUFBLElBQ2hHLFdBQVcsRUFBRSxTQUFTLE9BQU8sVUFBVSxHQUFHO0FBQUEsRUFDNUM7QUFDRjtBQW5CZ0I7QUFxQlQsSUFBTSxNQUFNLE9BQU87QUFDbkIsSUFBTSxRQUFRLDZCQUFNLElBQUksU0FBUyxpQkFBaUIsSUFBSSxTQUFTLE9BQWpEOzs7QUM1RXJCLElBQU0sYUFBYSxFQUFFLE9BQU8sR0FBRyxNQUFNLEdBQUcsTUFBTSxHQUFHLE9BQU8sR0FBRyxNQUFNLEVBQUU7QUFDbkUsSUFBTSxlQUFlLE1BQU0sSUFBSSxXQUFXLFFBQVEsV0FBVztBQUU3RCxTQUFTLFVBQVUsT0FBTztBQUN4QixNQUFJLENBQUMsSUFBSSxTQUFTLGdCQUFpQixRQUFPO0FBQzFDLFNBQU8sU0FBUztBQUNsQjtBQUhTO0FBS1QsU0FBUyxjQUFjLE9BQU8sUUFBUSxTQUFTO0FBQzdDLFFBQU0sYUFBWSxvQkFBSSxLQUFLLEdBQUUsWUFBWSxFQUFFLE1BQU0sR0FBRyxFQUFFLENBQUMsRUFBRSxNQUFNLEdBQUcsRUFBRTtBQUNwRSxTQUFPLElBQUksU0FBUyxNQUFNLEtBQUssTUFBTSxNQUFNLEtBQUssT0FBTztBQUN6RDtBQUhTO0FBS0YsU0FBUyxhQUFhLFFBQVE7QUFDbkMsU0FBTztBQUFBLElBQ0wsTUFBTSxTQUFTLE1BQU07QUFDbkIsVUFBSSxVQUFVLFdBQVcsS0FBSyxHQUFHO0FBQy9CLGdCQUFRLE1BQU0sY0FBYyxTQUFTLFFBQVEsT0FBTyxHQUFHLFFBQVEsRUFBRTtBQUFBLE1BQ25FO0FBQUEsSUFDRjtBQUFBLElBQ0EsS0FBSyxTQUFTLE1BQU07QUFDbEIsVUFBSSxVQUFVLFdBQVcsSUFBSSxHQUFHO0FBQzlCLGdCQUFRLEtBQUssY0FBYyxRQUFRLFFBQVEsT0FBTyxHQUFHLFFBQVEsRUFBRTtBQUFBLE1BQ2pFO0FBQUEsSUFDRjtBQUFBLElBQ0EsS0FBSyxTQUFTLE1BQU07QUFDbEIsVUFBSSxVQUFVLFdBQVcsSUFBSSxHQUFHO0FBQzlCLGdCQUFRLEtBQUssY0FBYyxRQUFRLFFBQVEsT0FBTyxHQUFHLFFBQVEsRUFBRTtBQUFBLE1BQ2pFO0FBQUEsSUFDRjtBQUFBLElBQ0EsTUFBTSxTQUFTLE1BQU07QUFDbkIsVUFBSSxVQUFVLFdBQVcsS0FBSyxHQUFHO0FBQy9CLGdCQUFRLE1BQU0sY0FBYyxTQUFTLFFBQVEsT0FBTyxHQUFHLFFBQVEsRUFBRTtBQUFBLE1BQ25FO0FBQUEsSUFDRjtBQUFBLElBQ0EsS0FBSyxPQUFPO0FBQ1YsVUFBSSxJQUFJLFNBQVMscUJBQXFCO0FBQ3BDLGdCQUFRLEtBQUssSUFBSSxNQUFNLEtBQUssS0FBSyxFQUFFO0FBQUEsTUFDckM7QUFBQSxJQUNGO0FBQUEsSUFDQSxRQUFRLE9BQU87QUFDYixVQUFJLElBQUksU0FBUyxxQkFBcUI7QUFDcEMsZ0JBQVEsUUFBUSxJQUFJLE1BQU0sS0FBSyxLQUFLLEVBQUU7QUFBQSxNQUN4QztBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0Y7QUFqQ2dCO0FBbUNULElBQU0sU0FBUyxhQUFhLE9BQU87OztDQzlDekMsTUFBTTtBQUNMLE1BQUksT0FBTyw0QkFBNkI7QUFDeEMsU0FBTyw4QkFBOEI7QUFFckMsUUFBTSxnQkFBZ0IsYUFBYSxlQUFlO0FBQ2xELGdCQUFjLEtBQUssd0JBQXdCO0FBTzNDLFFBQU0sb0JBQW9CLE9BQU8sNkJBQTZCO0FBQzlELFFBQU0sZ0JBQWdCLE9BQU8seUJBQXlCO0FBQ3RELFFBQU0sbUJBQW1CLE9BQU8sNEJBQTRCO0FBQzVELFFBQU0sWUFBWSxPQUFPLHlCQUF5QjtBQUNsRCxRQUFNLGtCQUFrQixPQUFPLGdDQUFnQztBQUcvRCxNQUFJLGlCQUFpQjtBQUNuQixvQkFBZ0IsY0FBYztBQUM5QixhQUFTLGlCQUFpQixvQkFBb0IsTUFBTTtBQUNsRCxzQkFBZ0IsaUJBQWlCLEVBQUUsTUFBTSxDQUFDLFFBQVE7QUFDaEQsc0JBQWMsS0FBSyx1QkFBdUIsRUFBRSxPQUFPLElBQUksUUFBUSxDQUFDO0FBQUEsTUFDbEUsQ0FBQztBQUFBLElBQ0gsQ0FBQztBQUFBLEVBQ0g7QUFHQSxTQUFPLGlCQUFpQixXQUFXLENBQUMsTUFBTTtBQUN4QyxRQUFJLEVBQUUsUUFBUSxVQUFVO0FBQ3RCLFVBQUksT0FBTyxpQkFBaUI7QUFDMUIsZUFBTyxnQkFBZ0IsZ0JBQWdCLElBQUk7QUFBQSxNQUM3QztBQUFBLElBQ0Y7QUFBQSxFQUNGLEdBQUcsRUFBRSxTQUFTLEtBQUssQ0FBQztBQUVwQixRQUFNLHNCQUFzQjtBQUM1QixRQUFNLGlCQUFpQjtBQUN2QixRQUFNLHdCQUF3QjtBQUM5QixRQUFNLG1CQUFtQjtBQUN6QixRQUFNLDRCQUE0QjtBQUNsQyxRQUFNLDhCQUE4QjtBQUNwQyxRQUFNLGdDQUFnQztBQUN0QyxRQUFNLHVCQUF1QjtBQUM3QixRQUFNLHVCQUF1QjtBQUM3QixRQUFNLDBCQUEwQixLQUFLLEtBQUssS0FBSyxLQUFLO0FBQ3BELFFBQU0sNkJBQTZCO0FBQ25DLFFBQU0sNkJBQTZCO0FBQ25DLFFBQU0sZ0NBQWdDLEtBQUssS0FBSyxLQUFLLEtBQUs7QUFDMUQsTUFBSSxzQkFBc0I7QUFDMUIsTUFBSSw0QkFBNEI7QUFDaEMsTUFBSSw0QkFBNEI7QUFDaEMsTUFBSSxrQ0FBa0M7QUFFdEMsV0FBUyxTQUFTLE1BQU0sVUFBVTtBQUNoQyxVQUFNLE1BQU0sT0FBTyxRQUFRLEVBQUU7QUFDN0IsUUFBSSxDQUFDLE9BQU8sU0FBUyxRQUFRLEtBQUssWUFBWSxFQUFHLFFBQU87QUFDeEQsV0FBTyxJQUFJLFNBQVMsV0FBVyxHQUFHLElBQUksTUFBTSxHQUFHLFFBQVEsQ0FBQyxvQkFBb0I7QUFBQSxFQUM5RTtBQUpTO0FBTVQsV0FBUyxnQ0FBZ0MsVUFBVSxLQUFLO0FBQ3RELFVBQU0sVUFBVSxPQUFPLElBQUksVUFBVSxPQUFPLElBQUksT0FBTyxJQUFJLE9BQU8sT0FBTyxFQUFFO0FBQzNFLFdBQU8sRUFBRSxPQUFPLHFCQUFxQixRQUFRLE1BQU0sV0FBVyxlQUFlLEdBQUc7QUFBQSxFQUNsRjtBQUhTO0FBS1QsV0FBUyxrQkFBa0IsVUFBVSxPQUFPLFVBQVU7QUFDcEQsVUFBTSxlQUFlLENBQUMsSUFBSTtBQUMxQixVQUFNLFlBQVksb0JBQUksSUFBSTtBQUUxQixhQUFTLElBQUksR0FBRyxJQUFJLGFBQWEsVUFBVSxhQUFhLFVBQVUsa0JBQWtCLEtBQUs7QUFDdkYsWUFBTSxjQUFjLGFBQWEsQ0FBQztBQUNsQyxVQUFJLENBQUMsZUFBZSxVQUFVLElBQUksV0FBVyxFQUFHO0FBQ2hELGdCQUFVLElBQUksV0FBVztBQUV6QixZQUFNLFFBQVEsWUFBWSxjQUFjLFFBQVE7QUFDaEQsVUFBSSxNQUFPLFFBQU87QUFFbEIsWUFBTSxTQUFTLFNBQVMsaUJBQWlCLGFBQWEsV0FBVyxZQUFZO0FBQzdFLGVBQVMsT0FBTyxPQUFPLGFBQWEsTUFBTSxPQUFPLE9BQU8sU0FBUyxHQUFHO0FBQ2xFLFlBQUksS0FBSyxXQUFZLGNBQWEsS0FBSyxLQUFLLFVBQVU7QUFDdEQsY0FBTSxNQUFNLE9BQU8sTUFBTSxXQUFXLEVBQUUsRUFBRSxZQUFZO0FBQ3BELGNBQU0sVUFBVSxRQUFRLFlBQVksUUFBUTtBQUM1QyxZQUFJLFNBQVM7QUFDWCxjQUFJO0FBQ0YsZ0JBQUksS0FBSyxnQkFBaUIsY0FBYSxLQUFLLEtBQUssZUFBZTtBQUFBLFVBQ2xFLFNBQVMsTUFBTTtBQUFBLFVBRWY7QUFBQSxRQUNGO0FBQ0EsWUFBSSxhQUFhLFNBQVMsaUJBQWtCO0FBQUEsTUFDOUM7QUFBQSxJQUNGO0FBRUEsV0FBTztBQUFBLEVBQ1Q7QUE3QlM7QUErQlQsV0FBUyxlQUFlLFNBQVMsT0FBTztBQUN0QyxVQUFNLFlBQVksT0FBTyxTQUFTLEVBQUU7QUFDcEMsVUFBTSxNQUFNLE9BQU8sU0FBUyxXQUFXLEVBQUUsRUFBRSxZQUFZO0FBQ3ZELFVBQU0sT0FBTyxTQUFTLGVBQWUsZUFBZTtBQUdwRCxVQUFNLFFBQVEsUUFBUSxVQUNsQixNQUFNLGtCQUFrQixZQUN4QixRQUFRLGFBQ04sTUFBTSxxQkFBcUIsWUFDM0I7QUFFTixVQUFNLGFBQWEsUUFBUSxPQUFPLHlCQUF5QixPQUFPLE9BQU8sSUFBSTtBQUM3RSxRQUFJLGNBQWMsT0FBTyxXQUFXLFFBQVEsWUFBWTtBQUN0RCxpQkFBVyxJQUFJLEtBQUssU0FBUyxTQUFTO0FBQ3RDO0FBQUEsSUFDRjtBQUVBLFlBQVEsUUFBUTtBQUFBLEVBQ2xCO0FBbkJTO0FBcUJULFdBQVMsb0JBQW9CLFNBQVM7QUFDcEMsVUFBTSxhQUFhLE9BQU8sZUFBZSxhQUNyQyxJQUFJLFdBQVcsU0FBUyxFQUFFLFNBQVMsTUFBTSxVQUFVLEtBQUssQ0FBQyxJQUN6RCxJQUFJLE1BQU0sU0FBUyxFQUFFLFNBQVMsS0FBSyxDQUFDO0FBQ3hDLFlBQVEsY0FBYyxVQUFVO0FBQ2hDLFlBQVEsY0FBYyxJQUFJLE1BQU0sVUFBVSxFQUFFLFNBQVMsS0FBSyxDQUFDLENBQUM7QUFBQSxFQUM5RDtBQU5TO0FBWVQsV0FBUyxjQUFjLE9BQU87QUFDNUIsV0FBTyxPQUFPLFNBQVMsRUFBRSxFQUFFLFlBQVksRUFBRSxRQUFRLGVBQWUsRUFBRTtBQUFBLEVBQ3BFO0FBRlM7QUFJVCxXQUFTLFNBQVMsT0FBTztBQUN2QixXQUFPLE9BQU8sU0FBUyxFQUFFLEVBQ3RCLFFBQVEsbUJBQW1CLE9BQU8sRUFDbEMsWUFBWSxFQUNaLE1BQU0sWUFBWSxFQUNsQixJQUFJLENBQUMsU0FBUyxLQUFLLEtBQUssQ0FBQyxFQUN6QixPQUFPLE9BQU87QUFBQSxFQUNuQjtBQVBTO0FBU1QsV0FBUyxxQkFBcUIsVUFBVTtBQUN0QyxVQUFNLFFBQVEsQ0FBQztBQUNmLFVBQU0sY0FBYyxTQUFTO0FBQUEsTUFDM0I7QUFBQSxJQUNGO0FBQ0EsZUFBVyxTQUFTLGFBQWE7QUFDL0IsWUFBTSxLQUFLLE1BQU0sQ0FBQyxLQUFLLE1BQU0sQ0FBQyxLQUFLLEVBQUU7QUFBQSxJQUN2QztBQUNBLFVBQU0sWUFBWSxTQUFTLFNBQVMsb0JBQW9CO0FBQ3hELGVBQVcsU0FBUyxXQUFXO0FBQzdCLFlBQU0sS0FBSyxPQUFPLE1BQU0sQ0FBQyxLQUFLLEVBQUUsRUFBRSxRQUFRLFVBQVUsR0FBRyxDQUFDO0FBQUEsSUFDMUQ7QUFDQSxVQUFNLGVBQWUsU0FBUyxTQUFTLHFCQUFxQjtBQUM1RCxlQUFXLFNBQVMsY0FBYztBQUNoQyxZQUFNLEtBQUssT0FBTyxNQUFNLENBQUMsS0FBSyxFQUFFLEVBQUUsUUFBUSxVQUFVLEdBQUcsQ0FBQztBQUFBLElBQzFEO0FBQ0EsVUFBTSxXQUFXLFNBQVMsTUFBTSxlQUFlO0FBQy9DLFVBQU0sZUFBZSxXQUFXLE9BQU8sU0FBUyxDQUFDLENBQUMsRUFBRSxZQUFZLElBQUk7QUFDcEUsV0FBTyxFQUFFLE9BQU8sYUFBYTtBQUFBLEVBQy9CO0FBbkJTO0FBcUJULFdBQVMsY0FBYyxTQUFTO0FBQzlCLFFBQUksRUFBRSxtQkFBbUIsU0FBVSxRQUFPO0FBQzFDLFVBQU0sUUFBUSxDQUFDO0FBQ2YsVUFBTSxLQUFLLFFBQVEsYUFBYSxJQUFJO0FBQ3BDLFFBQUksSUFBSTtBQUNOLFlBQU0sV0FBVyxTQUFTLGNBQWMsY0FBYyxJQUFJLE9BQU8sRUFBRSxDQUFDLElBQUk7QUFDeEUsVUFBSSxVQUFVLFlBQWEsT0FBTSxLQUFLLFNBQVMsV0FBVztBQUFBLElBQzVEO0FBQ0EsVUFBTSxlQUFlLFFBQVEsUUFBUSxPQUFPO0FBQzVDLFFBQUksY0FBYyxZQUFhLE9BQU0sS0FBSyxhQUFhLFdBQVc7QUFDbEUsVUFBTSxjQUFjLFFBQVEsZUFBZSxnQkFBZ0IsT0FBTztBQUNsRSxRQUFJLGFBQWEsWUFBYSxPQUFNLEtBQUssWUFBWSxXQUFXO0FBQ2hFLFdBQU8sTUFBTSxLQUFLLEdBQUc7QUFBQSxFQUN2QjtBQWJTO0FBZVQsV0FBUyxrQkFBa0IsU0FBUztBQUNsQyxVQUFNLFdBQVc7QUFBQSxNQUNmO0FBQUEsTUFBUTtBQUFBLE1BQU07QUFBQSxNQUFlO0FBQUEsTUFBYztBQUFBLE1BQzNDO0FBQUEsTUFBZTtBQUFBLE1BQWdCO0FBQUEsTUFBVztBQUFBLElBQzVDO0FBQ0EsVUFBTSxTQUFTLENBQUM7QUFDaEIsV0FBTyxLQUFLLFFBQVEsUUFBUSxZQUFZLENBQUM7QUFDekMsZUFBVyxPQUFPLFVBQVU7QUFDMUIsWUFBTSxJQUFJLFFBQVEsZUFBZSxHQUFHO0FBQ3BDLFVBQUksRUFBRyxRQUFPLEtBQUssQ0FBQztBQUFBLElBQ3RCO0FBQ0EsV0FBTyxLQUFLLGNBQWMsT0FBTyxDQUFDO0FBQ2xDLFVBQU0sT0FBTyxRQUFRLGVBQWUsTUFBTTtBQUMxQyxRQUFJLEtBQU0sUUFBTyxLQUFLLElBQUk7QUFDMUIsV0FBTyxjQUFjLE9BQU8sS0FBSyxHQUFHLENBQUM7QUFBQSxFQUN2QztBQWZTO0FBaUJULFdBQVMsY0FBYyxTQUFTO0FBQzlCLFFBQUksRUFBRSxtQkFBbUIsU0FBVSxRQUFPO0FBQzFDLFVBQU0sV0FBVyxRQUFRLGFBQWEsVUFBVSxLQUFLLFFBQVEsYUFBYSxlQUFlLE1BQU07QUFDL0YsVUFBTSxPQUFPLFFBQVEsc0JBQXNCO0FBQzNDLFVBQU0sUUFBUSxPQUFPLGlCQUFpQixPQUFPO0FBQzdDLFFBQUksU0FBVSxRQUFPO0FBQ3JCLFFBQUksTUFBTSxZQUFZLFVBQVUsTUFBTSxlQUFlLFNBQVUsUUFBTztBQUN0RSxRQUFJLEtBQUssUUFBUSxLQUFLLEtBQUssU0FBUyxFQUFHLFFBQU87QUFDOUMsV0FBTztBQUFBLEVBQ1Q7QUFUUztBQVdULFdBQVMsZUFBZSxPQUFPO0FBQzdCLFVBQU0sT0FBTyxPQUFPLFNBQVMsRUFBRTtBQUMvQixRQUFJLE9BQU8sUUFBUSxlQUFlLE9BQU8sSUFBSSxXQUFXLFlBQVk7QUFDbEUsYUFBTyxJQUFJLE9BQU8sSUFBSTtBQUFBLElBQ3hCO0FBQ0EsV0FBTyxLQUFLLFFBQVEsVUFBVSxNQUFNO0FBQUEsRUFDdEM7QUFOUztBQVFULFdBQVMscUJBQXFCLE9BQU87QUFDbkMsV0FBTyxPQUFPLFNBQVMsRUFBRSxFQUN0QixZQUFZLEVBQ1osUUFBUSxlQUFlLEdBQUcsRUFDMUIsUUFBUSxtQkFBbUIsR0FBRyxFQUM5QixRQUFRLFFBQVEsR0FBRyxFQUNuQixLQUFLLEVBQ0wsTUFBTSxHQUFHLEdBQUc7QUFBQSxFQUNqQjtBQVJTO0FBVVQsV0FBUyxjQUFjLFVBQVU7QUFDL0IsVUFBTSxRQUFRLE9BQU8sWUFBWSxFQUFFLEVBQ2hDLE1BQU0sR0FBRyxFQUNULE9BQU8sT0FBTyxFQUNkLE1BQU0sR0FBRyxDQUFDO0FBQ2IsV0FBTyxNQUFNLFNBQVMsSUFBSSxNQUFNLEtBQUssR0FBRyxDQUFDLEtBQUs7QUFBQSxFQUNoRDtBQU5TO0FBUVQsV0FBUyxtQkFBbUI7QUFDMUIsV0FBTztBQUFBLE1BQ0wsTUFBTSxPQUFPLE9BQU8sVUFBVSxRQUFRLEVBQUUsRUFBRSxZQUFZO0FBQUEsTUFDdEQsWUFBWSxjQUFjLE9BQU8sVUFBVSxZQUFZLEdBQUc7QUFBQSxJQUM1RDtBQUFBLEVBQ0Y7QUFMUztBQU9ULFdBQVMsb0JBQW9CLFNBQVM7QUFDcEMsVUFBTSxNQUFNLEtBQUssSUFBSTtBQUNyQixVQUFNLE9BQU8sb0JBQUksSUFBSTtBQUNyQixVQUFNLGFBQWEsQ0FBQztBQUNwQixlQUFXLFNBQVMsTUFBTSxRQUFRLE9BQU8sSUFBSSxVQUFVLENBQUMsR0FBRztBQUN6RCxVQUFJLENBQUMsU0FBUyxPQUFPLFVBQVUsU0FBVTtBQUN6QyxVQUFJLENBQUMsTUFBTSxPQUFPLE9BQU8sTUFBTSxRQUFRLFNBQVU7QUFDakQsVUFBSSxLQUFLLElBQUksTUFBTSxHQUFHLEVBQUc7QUFDekIsWUFBTSxXQUFXLE9BQU8sTUFBTSxZQUFZLE1BQU0sYUFBYSxNQUFNLGFBQWEsQ0FBQztBQUNqRixVQUFJLFdBQVcsS0FBSyxNQUFNLFdBQVcsd0JBQXlCO0FBQzlELFdBQUssSUFBSSxNQUFNLEdBQUc7QUFDbEIsaUJBQVcsS0FBSyxLQUFLO0FBQUEsSUFDdkI7QUFDQSxlQUFXLEtBQUssQ0FBQyxHQUFHLE1BQU0sT0FBTyxFQUFFLFlBQVksQ0FBQyxJQUFJLE9BQU8sRUFBRSxZQUFZLENBQUMsQ0FBQztBQUMzRSxXQUFPLFdBQVcsTUFBTSxHQUFHLG9CQUFvQjtBQUFBLEVBQ2pEO0FBZlM7QUFpQlQsaUJBQWUscUJBQXFCO0FBQ2xDLFFBQUksTUFBTSxRQUFRLG1CQUFtQixFQUFHLFFBQU87QUFDL0MsUUFBSSwwQkFBMkIsUUFBTztBQUV0QyxnQ0FBNEIsSUFBSSxRQUFRLENBQUMsWUFBWTtBQUNuRCxVQUFJO0FBQ0YsZUFBTyxRQUFRLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixHQUFHLENBQUMsV0FBVztBQUMzRCxjQUFJLE9BQU8sU0FBUyxXQUFXO0FBQzdCLGtDQUFzQixDQUFDO0FBQ3ZCLHdDQUE0QjtBQUM1QixvQkFBUSxtQkFBbUI7QUFDM0I7QUFBQSxVQUNGO0FBQ0EsZ0JBQU0sTUFBTSxTQUFTLG9CQUFvQjtBQUN6QyxnQ0FBc0Isb0JBQW9CLEdBQUc7QUFDN0Msc0NBQTRCO0FBQzVCLGtCQUFRLG1CQUFtQjtBQUFBLFFBQzdCLENBQUM7QUFBQSxNQUNILFNBQVMsTUFBTTtBQUNiLDhCQUFzQixDQUFDO0FBQ3ZCLG9DQUE0QjtBQUM1QixnQkFBUSxtQkFBbUI7QUFBQSxNQUM3QjtBQUFBLElBQ0YsQ0FBQztBQUVELFdBQU87QUFBQSxFQUNUO0FBMUJlO0FBNEJmLGlCQUFlLG9CQUFvQixTQUFTO0FBQzFDLFVBQU0sT0FBTyxvQkFBb0IsT0FBTztBQUN4QywwQkFBc0I7QUFDdEIsUUFBSTtBQUNGLFlBQU0sSUFBSSxRQUFRLENBQUMsWUFBWTtBQUM3QixlQUFPLFFBQVEsTUFBTSxJQUFJLEVBQUUsQ0FBQyxvQkFBb0IsR0FBRyxLQUFLLEdBQUcsTUFBTSxRQUFRLENBQUM7QUFBQSxNQUM1RSxDQUFDO0FBQUEsSUFDSCxTQUFTLE1BQU07QUFBQSxJQUVmO0FBQUEsRUFDRjtBQVZlO0FBWWYsV0FBUyxxQkFBcUIsU0FBUztBQUNyQyxVQUFNLE9BQU8sT0FBTyxTQUFTLGFBQWEsU0FBUyxlQUFlLEVBQUUsRUFDakUsUUFBUSxRQUFRLEdBQUcsRUFDbkIsS0FBSyxFQUNMLE1BQU0sR0FBRyxHQUFHO0FBQ2YsV0FBTztBQUFBLEVBQ1Q7QUFOUztBQVFULFdBQVMsZ0JBQWdCLFNBQVM7QUFDaEMsUUFBSSxFQUFFLG1CQUFtQixTQUFVLFFBQU87QUFDMUMsV0FBTztBQUFBLE1BQ0wsS0FBSyxPQUFPLFFBQVEsV0FBVyxFQUFFLEVBQUUsWUFBWTtBQUFBLE1BQy9DLElBQUksT0FBTyxRQUFRLGFBQWEsSUFBSSxLQUFLLEVBQUU7QUFBQSxNQUMzQyxNQUFNLE9BQU8sUUFBUSxhQUFhLE1BQU0sS0FBSyxFQUFFO0FBQUEsTUFDL0MsYUFBYSxPQUFPLFFBQVEsYUFBYSxhQUFhLEtBQUssRUFBRTtBQUFBLE1BQzdELFdBQVcsT0FBTyxRQUFRLGFBQWEsWUFBWSxLQUFLLEVBQUU7QUFBQSxNQUMxRCxNQUFNLE9BQU8sUUFBUSxhQUFhLE1BQU0sS0FBSyxFQUFFO0FBQUEsTUFDL0MsWUFBWSxPQUFPLFFBQVEsYUFBYSxhQUFhLEtBQUssUUFBUSxhQUFhLGNBQWMsS0FBSyxFQUFFO0FBQUEsTUFDcEcsV0FBVyxPQUFPLGNBQWMsT0FBTyxLQUFLLEVBQUUsRUFBRSxRQUFRLFFBQVEsR0FBRyxFQUFFLEtBQUssRUFBRSxNQUFNLEdBQUcsR0FBRztBQUFBLE1BQ3hGLE1BQU0scUJBQXFCLE9BQU87QUFBQSxJQUNwQztBQUFBLEVBQ0Y7QUFiUztBQWVULFdBQVMsZ0JBQWdCLE9BQU8sT0FBTyxRQUFRLFlBQVk7QUFDekQsUUFBSSxDQUFDLFNBQVMsTUFBTSxXQUFXLE9BQVEsUUFBTztBQUM5QyxRQUFJLFFBQVE7QUFDWixRQUFJLE1BQU0sU0FBUyxNQUFNLEtBQU0sVUFBUztBQUN4QyxRQUFJLE1BQU0sZUFBZSxNQUFNLFdBQVksVUFBUztBQUVwRCxVQUFNLGNBQWMsT0FBTyxNQUFNLFVBQVUsRUFBRTtBQUM3QyxRQUFJLGVBQWUsWUFBWTtBQUM3QixVQUFJLGdCQUFnQixXQUFZLFVBQVM7QUFDekMsWUFBTSxjQUFjLElBQUksSUFBSSxTQUFTLFdBQVcsQ0FBQztBQUNqRCxZQUFNLGVBQWUsU0FBUyxVQUFVO0FBQ3hDLFVBQUksYUFBYSxTQUFTLEdBQUc7QUFDM0IsWUFBSSxVQUFVO0FBQ2QsbUJBQVcsU0FBUyxjQUFjO0FBQ2hDLGNBQUksWUFBWSxJQUFJLEtBQUssRUFBRyxZQUFXO0FBQUEsUUFDekM7QUFDQSxpQkFBUztBQUFBLE1BQ1g7QUFBQSxJQUNGO0FBRUEsYUFBUyxLQUFLLElBQUksR0FBRyxPQUFPLE1BQU0sZ0JBQWdCLENBQUMsQ0FBQztBQUNwRCxXQUFPO0FBQUEsRUFDVDtBQXRCUztBQXdCVCxXQUFTLHVCQUF1QixXQUFXO0FBQ3pDLFVBQU0sT0FBTyxjQUFjLFNBQVM7QUFDcEMsUUFBSSxDQUFDLEtBQU0sUUFBTztBQUNsQixVQUFNLFNBQVMsTUFBTSxLQUFLLFNBQVMsaUJBQWlCLE9BQU8sQ0FBQztBQUM1RCxlQUFXLFNBQVMsUUFBUTtBQUMxQixZQUFNLE9BQU8sY0FBYyxNQUFNLGVBQWUsRUFBRTtBQUNsRCxVQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssU0FBUyxJQUFJLEVBQUc7QUFDbkMsWUFBTSxVQUFVLE9BQU8sTUFBTSxhQUFhLEtBQUssS0FBSyxFQUFFO0FBQ3RELFVBQUksU0FBUztBQUNYLGNBQU0sUUFBUSxTQUFTLGVBQWUsT0FBTztBQUM3QyxZQUFJLFNBQVMsY0FBYyxLQUFLLEVBQUcsUUFBTztBQUFBLE1BQzVDO0FBQ0EsWUFBTSxTQUFTLE1BQU0sY0FBYyxtREFBbUQ7QUFDdEYsVUFBSSxVQUFVLGNBQWMsTUFBTSxFQUFHLFFBQU87QUFDNUMsWUFBTSxjQUFjLE1BQU0sZUFBZSxnQkFBZ0IsbURBQW1EO0FBQzVHLFVBQUksZUFBZSxjQUFjLFdBQVcsRUFBRyxRQUFPO0FBQUEsSUFDeEQ7QUFDQSxXQUFPO0FBQUEsRUFDVDtBQWxCUztBQW9CVCxXQUFTLDZCQUE2QixPQUFPLFFBQVE7QUFDbkQsUUFBSSxDQUFDLFNBQVMsT0FBTyxVQUFVLFNBQVUsUUFBTztBQUVoRCxVQUFNLE9BQU8sTUFBTSxLQUFLLFNBQVMsZUFBZSxNQUFNLEVBQUUsSUFBSTtBQUM1RCxRQUFJLFFBQVEsY0FBYyxJQUFJLEVBQUcsUUFBTztBQUV4QyxVQUFNLHFCQUFxQixDQUFDO0FBQzVCLFFBQUksTUFBTSxLQUFNLG9CQUFtQixLQUFLLFVBQVUsZUFBZSxNQUFNLElBQUksQ0FBQyxJQUFJO0FBQ2hGLFFBQUksTUFBTSxVQUFXLG9CQUFtQixLQUFLLGdCQUFnQixlQUFlLE1BQU0sU0FBUyxDQUFDLElBQUk7QUFDaEcsUUFBSSxNQUFNLFlBQVk7QUFDcEIseUJBQW1CLEtBQUssaUJBQWlCLGVBQWUsTUFBTSxVQUFVLENBQUMsSUFBSTtBQUM3RSx5QkFBbUIsS0FBSyxrQkFBa0IsZUFBZSxNQUFNLFVBQVUsQ0FBQyxJQUFJO0FBQUEsSUFDaEY7QUFDQSxRQUFJLE1BQU0sWUFBYSxvQkFBbUIsS0FBSyxpQkFBaUIsZUFBZSxNQUFNLFdBQVcsQ0FBQyxJQUFJO0FBRXJHLGVBQVcsWUFBWSxvQkFBb0I7QUFDekMsWUFBTSxRQUFRLGtCQUFrQixRQUFRO0FBQ3hDLFVBQUksU0FBUyxjQUFjLEtBQUssRUFBRyxRQUFPO0FBQUEsSUFDNUM7QUFFQSxRQUFJLE1BQU0sV0FBVztBQUNuQixZQUFNLFVBQVUsdUJBQXVCLE1BQU0sU0FBUztBQUN0RCxVQUFJLFFBQVMsUUFBTztBQUFBLElBQ3RCO0FBRUEsUUFBSSxXQUFXLFdBQVcsTUFBTSxNQUFNO0FBQ3BDLFlBQU0sYUFBYSxNQUFNLEtBQUssU0FBUyxpQkFBaUIsdUZBQXVGLENBQUM7QUFDaEosWUFBTSxhQUFhLGNBQWMsTUFBTSxJQUFJO0FBQzNDLGlCQUFXLFFBQVEsWUFBWTtBQUM3QixZQUFJLENBQUMsY0FBYyxJQUFJLEVBQUc7QUFDMUIsY0FBTSxXQUFXLGNBQWMsS0FBSyxlQUFlLEtBQUssYUFBYSxPQUFPLEtBQUssRUFBRTtBQUNuRixZQUFJLGFBQWEsYUFBYSxjQUFjLFNBQVMsU0FBUyxVQUFVLEtBQUssV0FBVyxTQUFTLFFBQVEsSUFBSTtBQUMzRyxpQkFBTztBQUFBLFFBQ1Q7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUVBLFdBQU87QUFBQSxFQUNUO0FBdENTO0FBd0NULGlCQUFlLGNBQWMsUUFBUSxRQUFRO0FBQzNDLFVBQU0sYUFBYSxxQkFBcUIsTUFBTTtBQUM5QyxRQUFJLENBQUMsVUFBVSxDQUFDLFdBQVksUUFBTztBQUVuQyxVQUFNLFFBQVEsaUJBQWlCO0FBQy9CLFVBQU0sU0FBUyxNQUFNLG1CQUFtQjtBQUN4QyxRQUFJLENBQUMsTUFBTSxRQUFRLE1BQU0sS0FBSyxPQUFPLFdBQVcsRUFBRyxRQUFPO0FBRTFELFVBQU0sU0FBUyxPQUNaLElBQUksQ0FBQyxXQUFXLEVBQUUsT0FBTyxPQUFPLGdCQUFnQixPQUFPLE9BQU8sUUFBUSxVQUFVLEVBQUUsRUFBRSxFQUNwRixPQUFPLENBQUMsU0FBUyxLQUFLLFNBQVMsRUFBRSxFQUNqQyxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsUUFBUSxFQUFFLEtBQUs7QUFFbkMsZUFBVyxRQUFRLFFBQVE7QUFDekIsWUFBTSxVQUFVLDZCQUE2QixLQUFLLE1BQU0sT0FBTyxNQUFNO0FBQ3JFLFVBQUksQ0FBQyxRQUFTO0FBQ2QsYUFBTyxFQUFFLE9BQU8sS0FBSyxPQUFPLFFBQVE7QUFBQSxJQUN0QztBQUVBLFdBQU87QUFBQSxFQUNUO0FBcEJlO0FBc0JmLGlCQUFlLGNBQWMsUUFBUSxRQUFRLFNBQVM7QUFDcEQsVUFBTSxhQUFhLHFCQUFxQixNQUFNO0FBQzlDLFFBQUksQ0FBQyxVQUFVLENBQUMsY0FBYyxFQUFFLG1CQUFtQixTQUFVO0FBRTdELFVBQU0sUUFBUSxpQkFBaUI7QUFDL0IsVUFBTSxRQUFRLGdCQUFnQixPQUFPO0FBQ3JDLFFBQUksQ0FBQyxNQUFPO0FBRVosVUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLElBQUksTUFBTSxVQUFVLElBQUksTUFBTSxJQUFJLFVBQVU7QUFDckUsVUFBTSxNQUFNLEtBQUssSUFBSTtBQUVyQixVQUFNLFNBQVMsTUFBTSxtQkFBbUI7QUFDeEMsVUFBTSxPQUFPLE1BQU0sUUFBUSxNQUFNLElBQUksQ0FBQyxHQUFHLE1BQU0sSUFBSSxDQUFDO0FBQ3BELFVBQU0sTUFBTSxLQUFLLFVBQVUsQ0FBQyxVQUFVLE9BQU8sUUFBUSxHQUFHO0FBRXhELFFBQUksT0FBTyxHQUFHO0FBQ1osWUFBTSxPQUFPLEtBQUssR0FBRztBQUNyQixXQUFLLEdBQUcsSUFBSTtBQUFBLFFBQ1YsR0FBRztBQUFBLFFBQ0gsT0FBTyxFQUFFLEdBQUcsS0FBSyxPQUFPLEdBQUcsTUFBTTtBQUFBLFFBQ2pDLFFBQVE7QUFBQSxRQUNSLGNBQWMsT0FBTyxLQUFLLGdCQUFnQixDQUFDLElBQUk7QUFBQSxRQUMvQyxVQUFVO0FBQUEsUUFDVixXQUFXO0FBQUEsTUFDYjtBQUFBLElBQ0YsT0FBTztBQUNMLFdBQUssS0FBSztBQUFBLFFBQ1I7QUFBQSxRQUNBLE1BQU0sTUFBTTtBQUFBLFFBQ1osWUFBWSxNQUFNO0FBQUEsUUFDbEI7QUFBQSxRQUNBLFFBQVE7QUFBQSxRQUNSO0FBQUEsUUFDQSxjQUFjO0FBQUEsUUFDZCxXQUFXO0FBQUEsUUFDWCxXQUFXO0FBQUEsUUFDWCxVQUFVO0FBQUEsTUFDWixDQUFDO0FBQUEsSUFDSDtBQUVBLFVBQU0sb0JBQW9CLElBQUk7QUFBQSxFQUNoQztBQXpDZTtBQTJDZixXQUFTLDJCQUEyQixPQUFPO0FBQ3pDLFdBQU8sT0FBTyxTQUFTLEVBQUUsRUFDdEIsWUFBWSxFQUNaLFFBQVEsb0JBQW9CLGNBQWMsRUFDMUMsUUFBUSxvQkFBb0IsY0FBYyxFQUMxQyxRQUFRLHFCQUFxQixjQUFjLEVBQzNDLFFBQVEsb0JBQW9CLGNBQWMsRUFDMUMsUUFBUSxlQUFlLFNBQVMsRUFDaEMsUUFBUSxjQUFjLE9BQU8sRUFDN0IsUUFBUSxtQkFBbUIsR0FBRyxFQUM5QixRQUFRLFFBQVEsR0FBRyxFQUNuQixLQUFLLEVBQ0wsTUFBTSxHQUFHLEdBQUc7QUFBQSxFQUNqQjtBQWJTO0FBZVQsV0FBUywwQkFBMEIsU0FBUztBQUMxQyxVQUFNLE1BQU0sS0FBSyxJQUFJO0FBQ3JCLFVBQU0sUUFBUSxvQkFBSSxJQUFJO0FBQ3RCLGVBQVcsT0FBTyxNQUFNLFFBQVEsT0FBTyxJQUFJLFVBQVUsQ0FBQyxHQUFHO0FBQ3ZELFVBQUksQ0FBQyxPQUFPLE9BQU8sUUFBUSxTQUFVO0FBQ3JDLFlBQU0sTUFBTSxPQUFPLElBQUksT0FBTyxFQUFFLEVBQUUsS0FBSztBQUN2QyxVQUFJLENBQUMsSUFBSztBQUNWLFlBQU0sV0FBVyxPQUFPLElBQUksWUFBWSxJQUFJLGFBQWEsSUFBSSxhQUFhLENBQUM7QUFDM0UsVUFBSSxDQUFDLE9BQU8sU0FBUyxRQUFRLEtBQUssWUFBWSxFQUFHO0FBQ2pELFVBQUksTUFBTSxXQUFXLDhCQUErQjtBQUNwRCxZQUFNLElBQUksS0FBSztBQUFBLFFBQ2I7QUFBQSxRQUNBLE1BQU0sT0FBTyxJQUFJLFFBQVEsRUFBRSxFQUFFLEtBQUssRUFBRSxZQUFZO0FBQUEsUUFDaEQsWUFBWSxPQUFPLElBQUksY0FBYyxHQUFHLEVBQUUsS0FBSyxLQUFLO0FBQUEsUUFDcEQsU0FBUyxPQUFPLElBQUksV0FBVyxFQUFFLEVBQUUsS0FBSztBQUFBLFFBQ3hDLGtCQUFrQixPQUFPLElBQUksb0JBQW9CLEVBQUUsRUFBRSxLQUFLO0FBQUEsUUFDMUQsY0FBYyxLQUFLLElBQUksR0FBRyxLQUFLLE1BQU0sT0FBTyxJQUFJLGdCQUFnQixDQUFDLENBQUMsQ0FBQztBQUFBLFFBQ25FLGVBQWUsS0FBSyxJQUFJLEdBQUcsS0FBSyxNQUFNLE9BQU8sSUFBSSxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7QUFBQSxRQUNyRTtBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0g7QUFDQSxXQUFPLE1BQU0sS0FBSyxNQUFNLE9BQU8sQ0FBQyxFQUM3QixLQUFLLENBQUMsR0FBRyxPQUFPLEVBQUUsWUFBWSxNQUFNLEVBQUUsWUFBWSxFQUFFLEVBQ3BELE1BQU0sR0FBRywwQkFBMEI7QUFBQSxFQUN4QztBQXhCUztBQTBCVCxpQkFBZSwyQkFBMkI7QUFDeEMsUUFBSSxNQUFNLFFBQVEseUJBQXlCLEVBQUcsUUFBTztBQUNyRCxRQUFJLGdDQUFpQyxRQUFPO0FBRTVDLHNDQUFrQyxJQUFJLFFBQVEsQ0FBQyxZQUFZO0FBQ3pELFVBQUk7QUFDRixlQUFPLFFBQVEsTUFBTSxJQUFJLENBQUMsMEJBQTBCLEdBQUcsQ0FBQyxXQUFXO0FBQ2pFLGNBQUksT0FBTyxTQUFTLFdBQVc7QUFDN0Isd0NBQTRCLENBQUM7QUFDN0IsOENBQWtDO0FBQ2xDLG9CQUFRLHlCQUF5QjtBQUNqQztBQUFBLFVBQ0Y7QUFDQSxzQ0FBNEIsMEJBQTBCLFNBQVMsMEJBQTBCLENBQUM7QUFDMUYsNENBQWtDO0FBQ2xDLGtCQUFRLHlCQUF5QjtBQUFBLFFBQ25DLENBQUM7QUFBQSxNQUNILFNBQVMsTUFBTTtBQUNiLG9DQUE0QixDQUFDO0FBQzdCLDBDQUFrQztBQUNsQyxnQkFBUSx5QkFBeUI7QUFBQSxNQUNuQztBQUFBLElBQ0YsQ0FBQztBQUVELFdBQU87QUFBQSxFQUNUO0FBekJlO0FBMkJmLGlCQUFlLDBCQUEwQixTQUFTO0FBQ2hELFVBQU0sT0FBTywwQkFBMEIsT0FBTztBQUM5QyxnQ0FBNEI7QUFDNUIsUUFBSTtBQUNGLFlBQU0sSUFBSSxRQUFRLENBQUMsWUFBWTtBQUM3QixlQUFPLFFBQVEsTUFBTSxJQUFJLEVBQUUsQ0FBQywwQkFBMEIsR0FBRyxLQUFLLEdBQUcsTUFBTSxRQUFRLENBQUM7QUFBQSxNQUNsRixDQUFDO0FBQUEsSUFDSCxTQUFTLE1BQU07QUFBQSxJQUVmO0FBQUEsRUFDRjtBQVZlO0FBWWYsaUJBQWUsdUJBQXVCLFNBQVMsa0JBQWtCLFdBQVcsT0FBTztBQUNqRixVQUFNLGNBQWMsMkJBQTJCLE9BQU87QUFDdEQsVUFBTSxnQkFBZ0IsMkJBQTJCLG9CQUFvQixPQUFPO0FBQzVFLFFBQUksQ0FBQyxlQUFlLENBQUMsY0FBZTtBQUVwQyxVQUFNLFFBQVEsaUJBQWlCO0FBQy9CLFVBQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxJQUFJLE1BQU0sVUFBVSxJQUFJLFdBQVc7QUFDNUQsVUFBTSxNQUFNLEtBQUssSUFBSTtBQUNyQixVQUFNLFNBQVMsTUFBTSx5QkFBeUI7QUFDOUMsVUFBTSxPQUFPLE1BQU0sUUFBUSxNQUFNLElBQUksQ0FBQyxHQUFHLE1BQU0sSUFBSSxDQUFDO0FBQ3BELFVBQU0sTUFBTSxLQUFLLFVBQVUsQ0FBQyxVQUFVLE9BQU8sUUFBUSxHQUFHO0FBRXhELFFBQUksT0FBTyxHQUFHO0FBQ1osWUFBTSxPQUFPLEtBQUssR0FBRztBQUNyQixXQUFLLEdBQUcsSUFBSTtBQUFBLFFBQ1YsR0FBRztBQUFBLFFBQ0gsa0JBQWtCO0FBQUEsUUFDbEIsY0FBYyxPQUFPLEtBQUssZ0JBQWdCLENBQUMsSUFBSTtBQUFBLFFBQy9DLGVBQWUsT0FBTyxLQUFLLGlCQUFpQixDQUFDLEtBQUssV0FBVyxJQUFJO0FBQUEsUUFDakUsVUFBVTtBQUFBLE1BQ1o7QUFBQSxJQUNGLE9BQU87QUFDTCxXQUFLLEtBQUs7QUFBQSxRQUNSO0FBQUEsUUFDQSxNQUFNLE1BQU07QUFBQSxRQUNaLFlBQVksTUFBTTtBQUFBLFFBQ2xCLFNBQVM7QUFBQSxRQUNULGtCQUFrQjtBQUFBLFFBQ2xCLGNBQWM7QUFBQSxRQUNkLGVBQWUsV0FBVyxJQUFJO0FBQUEsUUFDOUIsV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsVUFBVTtBQUFBLE1BQ1osQ0FBQztBQUFBLElBQ0g7QUFFQSxVQUFNLDBCQUEwQixJQUFJO0FBQUEsRUFDdEM7QUFyQ2U7QUF1Q2YsaUJBQWUsMEJBQTBCLFNBQVM7QUFDaEQsVUFBTSxjQUFjLDJCQUEyQixPQUFPO0FBQ3RELFFBQUksQ0FBQyxZQUFhLFFBQU87QUFFekIsVUFBTSxRQUFRLGlCQUFpQjtBQUMvQixVQUFNLFNBQVMsTUFBTSx5QkFBeUI7QUFDOUMsUUFBSSxDQUFDLE1BQU0sUUFBUSxNQUFNLEtBQUssT0FBTyxXQUFXLEVBQUcsUUFBTztBQUUxRCxVQUFNLFNBQVMsT0FDWixJQUFJLENBQUMsVUFBVTtBQUNkLFVBQUksQ0FBQyxTQUFTLE1BQU0sWUFBWSxZQUFhLFFBQU87QUFDcEQsVUFBSSxRQUFRO0FBQ1osVUFBSSxNQUFNLFNBQVMsTUFBTSxLQUFNLFVBQVM7QUFDeEMsVUFBSSxNQUFNLGVBQWUsTUFBTSxXQUFZLFVBQVM7QUFDcEQsZUFBUyxLQUFLLElBQUksR0FBRyxPQUFPLE1BQU0sZ0JBQWdCLENBQUMsQ0FBQztBQUNwRCxhQUFPLEVBQUUsT0FBTyxNQUFNO0FBQUEsSUFDeEIsQ0FBQyxFQUNBLE9BQU8sT0FBTyxFQUNkLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxRQUFRLEVBQUUsS0FBSztBQUVuQyxXQUFPLE9BQU8sQ0FBQyxHQUFHLFNBQVM7QUFBQSxFQUM3QjtBQXJCZTtBQXVCZixXQUFTLDhCQUE4QixTQUFTO0FBQzlDLFVBQU0sTUFBTSxPQUFPLFdBQVcsRUFBRSxFQUFFLEtBQUs7QUFDdkMsVUFBTSxhQUFhLENBQUM7QUFDcEIsVUFBTSxPQUFPLG9CQUFJLElBQUk7QUFDckIsVUFBTSxPQUFPLHdCQUFDLFVBQVU7QUFDdEIsWUFBTSxPQUFPLE9BQU8sU0FBUyxFQUFFLEVBQUUsS0FBSztBQUN0QyxVQUFJLENBQUMsS0FBTTtBQUNYLFlBQU0sTUFBTSxLQUFLLFlBQVk7QUFDN0IsVUFBSSxLQUFLLElBQUksR0FBRyxFQUFHO0FBQ25CLFdBQUssSUFBSSxHQUFHO0FBQ1osaUJBQVcsS0FBSyxJQUFJO0FBQUEsSUFDdEIsR0FQYTtBQVNiLFVBQU0sYUFBYSwyQkFBMkIsR0FBRztBQUNqRCxTQUFLLEdBQUc7QUFDUixTQUFLLFVBQVU7QUFFZixRQUFJLFNBQVM7QUFDYixhQUFTLE9BQ04sUUFBUSxxQkFBcUIsY0FBYyxFQUMzQyxRQUFRLHFCQUFxQixjQUFjLEVBQzNDLFFBQVEsc0JBQXNCLGNBQWMsRUFDNUMsUUFBUSxxQkFBcUIsY0FBYztBQUM5QyxTQUFLLE1BQU07QUFFWCxVQUFNLGdCQUFnQixPQUFPLE1BQU0saURBQWlEO0FBQ3BGLFFBQUksZUFBZTtBQUNqQixXQUFLLFFBQVEsY0FBYyxDQUFDLENBQUMsU0FBUyxjQUFjLENBQUMsQ0FBQyxFQUFFO0FBQUEsSUFDMUQ7QUFFQSxVQUFNLGdCQUFnQixPQUFPLE1BQU0sdUNBQXVDO0FBQzFFLFFBQUksZUFBZTtBQUNqQixXQUFLLFFBQVEsY0FBYyxDQUFDLENBQUMsU0FBUyxjQUFjLENBQUMsQ0FBQyxFQUFFO0FBQUEsSUFDMUQ7QUFFQSxVQUFNLGdCQUFnQixPQUFPLE1BQU0sOENBQThDO0FBQ2pGLFFBQUksZUFBZTtBQUNqQixXQUFLLFFBQVEsY0FBYyxDQUFDLENBQUMsU0FBUyxjQUFjLENBQUMsQ0FBQyxFQUFFO0FBQUEsSUFDMUQ7QUFFQSxXQUFPO0FBQUEsRUFDVDtBQXpDUztBQTJDVCxpQkFBZSxzQkFBc0IsU0FBUztBQUM1QyxRQUFJLENBQUMsT0FBTyxlQUFlLENBQUMsT0FBTyx1QkFBdUI7QUFDeEQsYUFBTyxFQUFFLE9BQU8sNEJBQTRCLFFBQVEsTUFBTSxZQUFZLEtBQUs7QUFBQSxJQUM3RTtBQUVBLFVBQU0sbUJBQW1CLDZCQUFNO0FBQzdCLFlBQU0sVUFBVSxPQUFPLG1CQUFtQjtBQUMxQyxZQUFNLE1BQU0sQ0FBQztBQUNiLFVBQUksU0FBUyxVQUFVLE9BQU8sU0FBUyxRQUFRLE9BQU8sQ0FBQyxLQUFLLE9BQU8sU0FBUyxRQUFRLE9BQU8sQ0FBQyxHQUFHO0FBQzdGLFlBQUksU0FBUyxFQUFFLEdBQUcsUUFBUSxPQUFPLEdBQUcsR0FBRyxRQUFRLE9BQU8sRUFBRTtBQUFBLE1BQzFEO0FBQ0EsVUFBSSxTQUFTLHVCQUF1QixTQUFTO0FBQzNDLFlBQUksY0FBYyxRQUFRO0FBQUEsTUFDNUI7QUFDQSxhQUFPO0FBQUEsSUFDVCxHQVZ5QjtBQVl6QixVQUFNLFdBQVcsd0JBQUMsY0FBYztBQUM5QixZQUFNLFNBQVMsT0FBTyxZQUFZLGFBQWEsV0FBVyxpQkFBaUIsQ0FBQztBQUM1RSxVQUFJLENBQUMsT0FBUSxRQUFPO0FBQ3BCLFlBQU0sYUFBYSxPQUFPLFlBQVksbUJBQW1CLE1BQU07QUFDL0QsVUFBSSxDQUFDLFdBQVksUUFBTztBQUN4QixhQUFPLEVBQUUsUUFBUSxZQUFZLGtCQUFrQixPQUFPLE9BQU8sT0FBTyxhQUFhLEVBQUUsRUFBRSxLQUFLLEtBQUssT0FBTyxhQUFhLEVBQUUsRUFBRSxLQUFLLEVBQUU7QUFBQSxJQUNoSSxHQU5pQjtBQVNqQixVQUFNLFNBQVMsU0FBUyxPQUFPO0FBQy9CLFFBQUksT0FBUSxRQUFPLEVBQUUsR0FBRyxRQUFRLFVBQVUsT0FBTyxrQkFBa0IsT0FBTyxjQUFjLFNBQVM7QUFHakcsVUFBTSxhQUFhLE1BQU0sMEJBQTBCLE9BQU87QUFDMUQsUUFBSSxZQUFZLGtCQUFrQjtBQUNoQyxZQUFNLGFBQWEsU0FBUyxXQUFXLGdCQUFnQjtBQUN2RCxVQUFJLFlBQVk7QUFDZCxlQUFPLEVBQUUsR0FBRyxZQUFZLFVBQVUsTUFBTSxrQkFBa0IsTUFBTSxjQUFjLFNBQVM7QUFBQSxNQUN6RjtBQUFBLElBQ0Y7QUFHQSxVQUFNLGFBQWEsOEJBQThCLE9BQU87QUFDeEQsZUFBVyxhQUFhLFlBQVk7QUFDbEMsWUFBTSxZQUFZLFNBQVMsU0FBUztBQUNwQyxVQUFJLFdBQVc7QUFDYixlQUFPLEVBQUUsR0FBRyxXQUFXLFVBQVUsTUFBTSxrQkFBa0IsT0FBTyxjQUFjLFVBQVU7QUFBQSxNQUMxRjtBQUFBLElBQ0Y7QUFFQSxXQUFPLEVBQUUsT0FBTyx3REFBd0QsUUFBUSxNQUFNLFlBQVksS0FBSztBQUFBLEVBQ3pHO0FBaERlO0FBa0RmLGlCQUFlLDJCQUEyQixTQUFTO0FBQ2pELFVBQU0sT0FBTywyQkFBMkIsT0FBTztBQUMvQyxRQUFJLENBQUMsS0FBTSxRQUFPO0FBR2xCLFFBQUksU0FBUztBQUNiLFFBQUksU0FBUztBQUNiLFFBQUksUUFBUSxLQUFLLE1BQU0sZ0VBQWdFO0FBQ3ZGLFFBQUksT0FBTztBQUNULGVBQVMsT0FBTyxNQUFNLENBQUMsS0FBSyxFQUFFLEVBQUUsS0FBSztBQUNyQyxlQUFTLE9BQU8sTUFBTSxDQUFDLEtBQUssRUFBRSxFQUFFLEtBQUs7QUFBQSxJQUN2QyxPQUFPO0FBQ0wsY0FBUSxLQUFLLE1BQU0sdUNBQXVDO0FBQzFELFVBQUksT0FBTztBQUNULGlCQUFTLE9BQU8sTUFBTSxDQUFDLEtBQUssRUFBRSxFQUFFLEtBQUs7QUFDckMsaUJBQVMsT0FBTyxNQUFNLENBQUMsS0FBSyxFQUFFLEVBQUUsS0FBSztBQUFBLE1BQ3ZDO0FBQUEsSUFDRjtBQUVBLFFBQUksQ0FBQyxVQUFVLENBQUMsT0FBUSxRQUFPO0FBRS9CLFVBQU0sZ0JBQWdCLHVCQUF1QixFQUFFLE9BQU8sUUFBUSxPQUFPLFFBQVEsTUFBTSxRQUFRLGFBQWEsT0FBTyxHQUFHLElBQUk7QUFDdEgsVUFBTSxnQkFBZ0IsdUJBQXVCLEVBQUUsT0FBTyxRQUFRLE9BQU8sUUFBUSxNQUFNLFFBQVEsYUFBYSxPQUFPLEdBQUcsSUFBSTtBQUN0SCxRQUFJLENBQUMsaUJBQWlCLENBQUMsY0FBZSxRQUFPO0FBRTdDLFVBQU0sWUFBWSxPQUFPLGNBQWMsV0FBVyxFQUFFLEVBQUUsWUFBWTtBQUNsRSxRQUFJLGNBQWM7QUFDbEIsUUFBSSxjQUFjLFdBQVcsY0FBYyxjQUFjLGNBQWMsVUFBVTtBQUMvRSxvQkFBYyxPQUFPLGNBQWMsU0FBUyxFQUFFO0FBQUEsSUFDaEQsV0FBVyxjQUFjLG1CQUFtQjtBQUMxQyxvQkFBYyxPQUFPLGNBQWMsZUFBZSxFQUFFO0FBQUEsSUFDdEQ7QUFDQSxRQUFJLENBQUMsYUFBYTtBQUNoQixZQUFNLElBQUksTUFBTSxpQkFBaUIsTUFBTSxZQUFZO0FBQUEsSUFDckQ7QUFFQSxrQkFBYyxNQUFNO0FBQ3BCLFFBQUksY0FBYyxZQUFZLFdBQVcsY0FBYyxZQUFZLFlBQVk7QUFDN0UscUJBQWUsZUFBZSxXQUFXO0FBQ3pDLDBCQUFvQixhQUFhO0FBQUEsSUFDbkMsV0FBVyxjQUFjLG1CQUFtQjtBQUMxQyxvQkFBYyxjQUFjO0FBQzVCLDBCQUFvQixhQUFhO0FBQUEsSUFDbkMsT0FBTztBQUNMLGFBQU87QUFBQSxJQUNUO0FBRUEsVUFBTSxRQUFRLElBQUk7QUFBQSxNQUNoQixjQUFjLFFBQVEsUUFBUSxhQUFhO0FBQUEsTUFDM0MsY0FBYyxRQUFRLFFBQVEsYUFBYTtBQUFBLElBQzdDLENBQUM7QUFFRCxXQUFPO0FBQUEsTUFDTCxRQUFRO0FBQUEsTUFDUjtBQUFBLE1BQ0EsWUFBWTtBQUFBLE1BQ1osT0FBTyxZQUFZLE1BQU0sR0FBRyxFQUFFO0FBQUEsTUFDOUIsV0FBVztBQUFBLE1BQ1gsV0FBVztBQUFBLElBQ2I7QUFBQSxFQUNGO0FBNURlO0FBb0VmLFdBQVMsdUJBQXVCLFNBQVMsVUFBVTtBQUNqRCxVQUFNLFdBQVcsb0JBQUksSUFBSTtBQUN6QixVQUFNLFdBQVcsQ0FBQyxRQUFRLE9BQU8sUUFBUSxNQUFNLFFBQVEsT0FBTyxRQUFRLFdBQVc7QUFDakYsUUFBSSxlQUFlO0FBR25CLFFBQUksVUFBVTtBQUNaLFlBQU0sU0FBUyxxQkFBcUIsUUFBUTtBQUM1QyxlQUFTLEtBQUssR0FBRyxPQUFPLEtBQUs7QUFDN0IsVUFBSSxDQUFDLGdCQUFnQixPQUFPLGFBQWMsZ0JBQWUsT0FBTztBQUFBLElBQ2xFO0FBR0EsZUFBVyxRQUFRLFVBQVU7QUFDM0IsaUJBQVcsU0FBUyxTQUFTLElBQUksRUFBRyxVQUFTLElBQUksS0FBSztBQUFBLElBQ3hEO0FBR0EsVUFBTSxXQUFXLElBQUksSUFBSSxRQUFRO0FBQ2pDLFFBQUksU0FBUyxJQUFJLE9BQU8sRUFBRyxVQUFTLElBQUksT0FBTztBQUMvQyxRQUFJLFNBQVMsSUFBSSxNQUFNLEdBQUc7QUFDeEIsZUFBUyxJQUFJLFFBQVE7QUFDckIsZUFBUyxJQUFJLFNBQVM7QUFBQSxJQUN4QjtBQUNBLFFBQUksU0FBUyxJQUFJLE9BQU8sRUFBRyxVQUFTLElBQUksS0FBSztBQUM3QyxRQUFJLFNBQVMsSUFBSSxNQUFNLEVBQUcsVUFBUyxJQUFJLE9BQU87QUFDOUMsUUFBSSxTQUFTLElBQUksT0FBTyxFQUFHLFVBQVMsSUFBSSxNQUFNO0FBRTlDLFVBQU0sU0FBUyxNQUFNLEtBQUssUUFBUTtBQUNsQyxRQUFJLENBQUMsT0FBTyxPQUFRLFFBQU87QUFHM0IsVUFBTSxhQUFhLE1BQU07QUFBQSxNQUN2QixTQUFTLGlCQUFpQixpR0FBaUc7QUFBQSxJQUM3SCxFQUFFLE9BQU8sYUFBYTtBQUV0QixVQUFNLFNBQVMsY0FBYyxPQUFPLEtBQUssRUFBRSxDQUFDO0FBQzVDLFFBQUksT0FBTztBQUVYLGVBQVcsV0FBVyxZQUFZO0FBQ2hDLFlBQU0sV0FBVyxrQkFBa0IsT0FBTztBQUMxQyxVQUFJLENBQUMsU0FBVTtBQUNmLFVBQUksUUFBUTtBQUVaLGlCQUFXLFNBQVMsUUFBUTtBQUMxQixjQUFNLGtCQUFrQixjQUFjLEtBQUs7QUFDM0MsWUFBSSxDQUFDLGdCQUFpQjtBQUN0QixZQUFJLFNBQVMsU0FBUyxlQUFlLEdBQUc7QUFDdEMsbUJBQVMsZ0JBQWdCLFVBQVUsSUFBSSxJQUFJO0FBQUEsUUFDN0M7QUFBQSxNQUNGO0FBRUEsVUFBSSxVQUFVLFNBQVMsU0FBUyxNQUFNLEVBQUcsVUFBUztBQUNsRCxVQUFJLGdCQUFnQixRQUFRLFFBQVEsWUFBWSxNQUFNLGFBQWMsVUFBUztBQUU3RSxVQUFJLENBQUMsUUFBUSxRQUFRLEtBQUssT0FBTztBQUMvQixlQUFPLEVBQUUsU0FBUyxNQUFNO0FBQUEsTUFDMUI7QUFBQSxJQUNGO0FBRUEsUUFBSSxDQUFDLFFBQVEsS0FBSyxTQUFTLEVBQUcsUUFBTztBQUNyQyxXQUFPLEtBQUs7QUFBQSxFQUNkO0FBOURTO0FBb0VULFNBQU8sdUJBQXVCO0FBQzlCLFNBQU8sZ0NBQWdDO0FBQ3ZDLFNBQU8sdUJBQXVCO0FBQzlCLFNBQU8sdUJBQXVCO0FBQzlCLFNBQU8sMkJBQTJCO0FBRWxDLFdBQVMsZUFBZSxTQUFTO0FBQy9CLFVBQU0sTUFBTSxTQUFTLFVBQVUsT0FBTyxRQUFRLE9BQU8sRUFBRSxZQUFZLElBQUk7QUFDdkUsVUFBTSxLQUFLLFNBQVMsS0FBSyxPQUFPLFFBQVEsRUFBRSxJQUFJO0FBQzlDLFFBQUksVUFBVTtBQUNkLFFBQUk7QUFDRixnQkFBVSxTQUFTLFlBQVksTUFBTSxLQUFLLFFBQVEsU0FBUyxFQUFFLE1BQU0sR0FBRyxFQUFFLEVBQUUsS0FBSyxHQUFHLElBQUk7QUFBQSxJQUN4RixTQUFTLE1BQU07QUFBQSxJQUFDO0FBRWhCLFVBQU0sT0FBTyxTQUFTLFNBQVMsYUFBYSxTQUFTLGVBQWUsSUFBSSxHQUFHO0FBRTNFLFVBQU0sUUFBUSxDQUFDO0FBQ2YsUUFBSTtBQUNGLFlBQU0sYUFBYSxTQUFTLGFBQWEsTUFBTSxLQUFLLFFBQVEsVUFBVSxJQUFJLENBQUM7QUFDM0UsZUFBUyxJQUFJLEdBQUcsSUFBSSxXQUFXLFVBQVUsSUFBSSxJQUFJLEtBQUs7QUFDcEQsY0FBTSxPQUFPLFdBQVcsQ0FBQztBQUN6QixZQUFJLENBQUMsTUFBTSxLQUFNO0FBQ2pCLGNBQU0sT0FBTyxLQUFLLElBQUksQ0FBQyxJQUFJLFNBQVMsS0FBSyxPQUFPLEdBQUc7QUFBQSxNQUNyRDtBQUFBLElBQ0YsU0FBUyxNQUFNO0FBQUEsSUFBQztBQUVoQixXQUFPLEVBQUUsT0FBTyxXQUFXLEtBQUssSUFBSSxTQUFTLE1BQU0sTUFBTTtBQUFBLEVBQzNEO0FBckJTO0FBdUJULFdBQVMsU0FBUyxPQUFPLE9BQU8sb0JBQUksUUFBUSxHQUFHLFFBQVEsR0FBRztBQUN4RCxVQUFNLFlBQVk7QUFDbEIsVUFBTSxrQkFBa0I7QUFDeEIsVUFBTSxXQUFXO0FBRWpCLFFBQUksVUFBVSxLQUFNLFFBQU87QUFFM0IsVUFBTSxJQUFJLE9BQU87QUFDakIsUUFBSSxNQUFNLFNBQVUsUUFBTyxTQUFTLE9BQU8sR0FBSTtBQUMvQyxRQUFJLE1BQU0sWUFBWSxNQUFNLFVBQVcsUUFBTztBQUM5QyxRQUFJLE1BQU0sU0FBVSxRQUFPLE1BQU0sU0FBUztBQUMxQyxRQUFJLE1BQU0sWUFBYSxRQUFPO0FBQzlCLFFBQUksTUFBTSxTQUFVLFFBQU8sTUFBTSxTQUFTO0FBQzFDLFFBQUksTUFBTSxXQUFZLFFBQU87QUFFN0IsUUFBSSxpQkFBaUIsT0FBTztBQUMxQixhQUFPO0FBQUEsUUFDTCxPQUFPO0FBQUEsUUFDUCxNQUFNLE9BQU8sTUFBTSxRQUFRLE9BQU87QUFBQSxRQUNsQyxTQUFTLE9BQU8sTUFBTSxXQUFXLEVBQUU7QUFBQSxRQUNuQyxPQUFPLFNBQVMsT0FBTyxNQUFNLFNBQVMsRUFBRSxHQUFHLEdBQUk7QUFBQSxNQUNqRDtBQUFBLElBQ0Y7QUFFQSxRQUFJLGlCQUFpQixLQUFNLFFBQU8sTUFBTSxZQUFZO0FBRXBELFVBQU0sWUFBWSxTQUFTLE9BQU8sVUFBVSxZQUFZLE1BQU0sYUFBYSxLQUFLLE9BQU8sTUFBTSxZQUFZO0FBQ3pHLFFBQUksVUFBVyxRQUFPLGVBQWUsS0FBSztBQUcxQyxRQUFJLENBQUMsU0FBUyxPQUFPLFVBQVUsU0FBVSxRQUFPLE9BQU8sS0FBSztBQUM1RCxRQUFJLFNBQVMsVUFBVyxRQUFPO0FBQy9CLFFBQUksS0FBSyxJQUFJLEtBQUssRUFBRyxRQUFPO0FBQzVCLFNBQUssSUFBSSxLQUFLO0FBRWQsUUFBSSxNQUFNLFFBQVEsS0FBSyxHQUFHO0FBQ3hCLGFBQU8sTUFBTSxNQUFNLEdBQUcsZUFBZSxFQUFFLElBQUksQ0FBQyxNQUFNLFNBQVMsR0FBRyxNQUFNLFFBQVEsQ0FBQyxDQUFDO0FBQUEsSUFDaEY7QUFHQSxRQUFJO0FBQ0YsWUFBTSxVQUFVLE9BQU8sVUFBVSxTQUFTLEtBQUssS0FBSztBQUNwRCxVQUFJLFlBQVksdUJBQXVCLFlBQVksMkJBQTJCO0FBQzVFLGNBQU0sTUFBTSxNQUFNLEtBQUssS0FBSztBQUM1QixlQUFPLElBQUksTUFBTSxHQUFHLGVBQWUsRUFBRSxJQUFJLENBQUMsTUFBTSxTQUFTLEdBQUcsTUFBTSxRQUFRLENBQUMsQ0FBQztBQUFBLE1BQzlFO0FBQUEsSUFDRixTQUFTLE1BQU07QUFBQSxJQUFDO0FBRWhCLFFBQUksaUJBQWlCLEtBQUs7QUFDeEIsWUFBTSxVQUFVLENBQUM7QUFDakIsVUFBSSxJQUFJO0FBQ1IsaUJBQVcsQ0FBQyxHQUFHLENBQUMsS0FBSyxNQUFNLFFBQVEsR0FBRztBQUNwQyxnQkFBUSxLQUFLLENBQUMsU0FBUyxHQUFHLE1BQU0sUUFBUSxDQUFDLEdBQUcsU0FBUyxHQUFHLE1BQU0sUUFBUSxDQUFDLENBQUMsQ0FBQztBQUN6RTtBQUNBLFlBQUksS0FBSyxJQUFLO0FBQUEsTUFDaEI7QUFDQSxhQUFPLEVBQUUsT0FBTyxPQUFPLFFBQVE7QUFBQSxJQUNqQztBQUVBLFFBQUksaUJBQWlCLEtBQUs7QUFDeEIsWUFBTSxTQUFTLENBQUM7QUFDaEIsVUFBSSxJQUFJO0FBQ1IsaUJBQVcsS0FBSyxNQUFNLE9BQU8sR0FBRztBQUM5QixlQUFPLEtBQUssU0FBUyxHQUFHLE1BQU0sUUFBUSxDQUFDLENBQUM7QUFDeEM7QUFDQSxZQUFJLEtBQUssSUFBSztBQUFBLE1BQ2hCO0FBQ0EsYUFBTyxFQUFFLE9BQU8sT0FBTyxPQUFPO0FBQUEsSUFDaEM7QUFFQSxVQUFNLE1BQU0sQ0FBQztBQUNiLFVBQU0sT0FBTyxPQUFPLEtBQUssS0FBSztBQUM5QixhQUFTLElBQUksR0FBRyxJQUFJLEtBQUssVUFBVSxJQUFJLFVBQVUsS0FBSztBQUNwRCxZQUFNLElBQUksS0FBSyxDQUFDO0FBQ2hCLFVBQUk7QUFDRixZQUFJLENBQUMsSUFBSSxTQUFTLE1BQU0sQ0FBQyxHQUFHLE1BQU0sUUFBUSxDQUFDO0FBQUEsTUFDN0MsU0FBUyxNQUFNO0FBQ2IsWUFBSSxDQUFDLElBQUk7QUFBQSxNQUNYO0FBQUEsSUFDRjtBQUNBLFdBQU87QUFBQSxFQUNUO0FBakZTO0FBbUZULGlCQUFlLHNCQUFzQixNQUFNLFdBQVc7QUFDcEQsVUFBTSxnQkFBZ0IsT0FBTyxlQUFlLGlCQUFrQjtBQUFBLElBQUMsQ0FBQyxFQUFFO0FBQ2xFLFVBQU0sS0FBSyxJQUFJO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxvQkFBb0IsT0FBTyxRQUFRLEVBQUU7QUFBQSxJQUN2QztBQUVBLFVBQU0sVUFBVSxLQUFLLElBQUksR0FBRyxLQUFLLElBQUksT0FBTyxTQUFTLEtBQUssK0JBQStCLEdBQUssQ0FBQztBQUMvRixVQUFNLE9BQU8sUUFBUSxRQUFRLEVBQUUsS0FBSyxNQUFNLEdBQUcsbUJBQW1CLFVBQVUsY0FBYyxDQUFDO0FBQ3pGLFFBQUksQ0FBQyxRQUFTLFFBQU8sTUFBTTtBQUUzQixXQUFPLE1BQU0sUUFBUSxLQUFLO0FBQUEsTUFDeEI7QUFBQSxNQUNBLElBQUksUUFBUSxDQUFDLEdBQUcsV0FBVyxXQUFXLE1BQU0sT0FBTyxJQUFJLE1BQU0saUJBQWlCLE9BQU8sSUFBSSxDQUFDLEdBQUcsT0FBTyxDQUFDO0FBQUEsSUFDdkcsQ0FBQztBQUFBLEVBQ0g7QUFqQmU7QUFzQmYsaUJBQWUscUJBQXFCLFFBQVEsUUFBUTtBQUNsRCxRQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sTUFBTTtBQUMzQixZQUFNLElBQUksTUFBTSw4QkFBOEI7QUFBQSxJQUNoRDtBQUVBLFlBQVEsT0FBTyxNQUFNO0FBQUEsTUFDbkIsS0FBSztBQUNILGVBQU8sb0JBQW9CLFFBQVEsTUFBTTtBQUFBLE1BQzNDLEtBQUs7QUFDSCxlQUFPLG1CQUFtQixRQUFRLE1BQU07QUFBQSxNQUMxQyxLQUFLO0FBQ0gsZUFBTyxrQkFBa0IsUUFBUSxNQUFNO0FBQUEsTUFDekMsS0FBSztBQUNILGVBQU8sa0JBQWtCLE1BQU07QUFBQSxNQUNqQyxLQUFLO0FBQ0gsZUFBTyxzQkFBc0IsTUFBTTtBQUFBLE1BQ3JDLEtBQUs7QUFDSCxlQUFPLG9CQUFvQixNQUFNO0FBQUEsTUFDbkM7QUFDRSxjQUFNLElBQUksTUFBTSw0QkFBNEIsT0FBTyxJQUFJLEVBQUU7QUFBQSxJQUM3RDtBQUFBLEVBQ0Y7QUFyQmU7QUF1QmYsaUJBQWUsb0JBQW9CLFFBQVEsUUFBUTtBQUNqRCxVQUFNLFlBQVksUUFBUSxhQUFhO0FBR3ZDLFFBQUksT0FBTyxVQUFVO0FBQ25CLFVBQUksT0FBTyxTQUFTLFFBQVEsR0FBRztBQUM3QixlQUFPLFNBQVMsRUFBRSxLQUFLLEdBQUcsVUFBVSxTQUFTLENBQUM7QUFBQSxNQUNoRCxXQUFXLE9BQU8sU0FBUyxRQUFRLE9BQU87QUFDeEMsZUFBTyxTQUFTLEVBQUUsS0FBSyxTQUFTLGdCQUFnQixjQUFjLFVBQVUsU0FBUyxDQUFDO0FBQUEsTUFDcEY7QUFDQSxhQUFPLEVBQUUsUUFBUSxZQUFZLFdBQVcsTUFBTSxXQUFXO0FBQUEsSUFDM0Q7QUFHQSxVQUFNLGdCQUFnQixFQUFFLFVBQVUsU0FBUztBQUMzQyxRQUFJLE9BQU8sZUFBZSxRQUFXO0FBQ25DLG9CQUFjLE9BQU8sT0FBTztBQUM1QixvQkFBYyxNQUFNO0FBQUEsSUFDdEIsT0FBTztBQUNMLG9CQUFjLE1BQU0sT0FBTyxVQUFVO0FBQ3JDLG9CQUFjLE9BQU87QUFBQSxJQUN2QjtBQUVBLFdBQU8sU0FBUyxhQUFhO0FBQzdCLFdBQU8sRUFBRSxRQUFRLFlBQVksV0FBVyxRQUFRLE9BQU8sVUFBVSxPQUFPLFlBQVksTUFBTSxXQUFXO0FBQUEsRUFDdkc7QUF6QmU7QUEyQmYsaUJBQWUsbUJBQW1CLFFBQVEsUUFBUTtBQUVoRCxRQUFJLE9BQU8sWUFBWTtBQUNyQixZQUFNLFVBQVUsT0FBTyxtQkFBbUI7QUFFMUMsWUFBTSxnQkFBZ0Isd0JBQUMsT0FBTztBQUM1QixZQUFJLEVBQUUsY0FBYyxTQUFVLFFBQU87QUFDckMsY0FBTSxNQUFNLE9BQU8sR0FBRyxXQUFXLEVBQUUsRUFBRSxZQUFZO0FBQ2pELFlBQUksQ0FBQyxPQUFPLFFBQVEsVUFBVSxRQUFRLE9BQVEsUUFBTztBQUNyRCxZQUFJLENBQUMsR0FBRyxZQUFhLFFBQU87QUFDNUIsY0FBTSxjQUFjLEdBQUc7QUFBQSxVQUNyQjtBQUFBLFFBQ0Y7QUFDQSxlQUFPLGVBQWU7QUFBQSxNQUN4QixHQVRzQjtBQVd0QixZQUFNLGdCQUFnQix3QkFBQyxPQUFPO0FBQzVCLFlBQUk7QUFDRixpQkFBTyxpQkFBaUIsRUFBRTtBQUFBLFFBQzVCLFNBQVMsTUFBTTtBQUNiLGlCQUFPO0FBQUEsUUFDVDtBQUFBLE1BQ0YsR0FOc0I7QUFRdEIsWUFBTSxhQUFhLENBQUM7QUFFcEIsWUFBTSxTQUFTLFNBQVM7QUFDeEIsVUFBSSxVQUFVLE9BQU8sU0FBUyxPQUFPLENBQUMsS0FBSyxPQUFPLFNBQVMsT0FBTyxDQUFDLE1BQU0sT0FBTyxNQUFNLEtBQUssT0FBTyxNQUFNLElBQUk7QUFDMUcsY0FBTSxZQUFZLFNBQVMsaUJBQWlCLE9BQU8sR0FBRyxPQUFPLENBQUM7QUFDOUQsY0FBTSxTQUFTLGNBQWMsU0FBUztBQUN0QyxZQUFJLE9BQVEsWUFBVyxLQUFLLEVBQUUsSUFBSSxRQUFRLFFBQVEsU0FBUyxDQUFDO0FBQUEsTUFDOUQ7QUFFQSxZQUFNLFNBQVMsU0FBUztBQUN4QixZQUFNLGFBQWEsY0FBYyxNQUFNO0FBQ3ZDLFVBQUksV0FBWSxZQUFXLEtBQUssRUFBRSxJQUFJLFlBQVksUUFBUSxlQUFlLENBQUM7QUFFMUUsWUFBTSxXQUFXLFNBQVM7QUFDMUIsWUFBTSxlQUFlLGNBQWMsUUFBUTtBQUMzQyxVQUFJLGFBQWMsWUFBVyxLQUFLLEVBQUUsSUFBSSxjQUFjLFFBQVEsaUJBQWlCLENBQUM7QUFFaEYsaUJBQVcsYUFBYSxZQUFZO0FBQ2xDLGNBQU0sS0FBSyxXQUFXO0FBQ3RCLFlBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxZQUFhO0FBQzVCLFlBQUksQ0FBQyxjQUFjLEVBQUUsRUFBRztBQUN4QixZQUFJO0FBQ0YsYUFBRyxlQUFlLEVBQUUsVUFBVSxRQUFRLE9BQU8sU0FBUyxDQUFDO0FBQUEsUUFDekQsU0FBUyxNQUFNO0FBQUEsUUFBQztBQUNoQixXQUFHLE1BQU07QUFDVCxlQUFPLEVBQUUsUUFBUSxXQUFXLFFBQVEsV0FBVyxTQUFTLFVBQVUsUUFBUSxLQUFLLEdBQUcsUUFBUTtBQUFBLE1BQzVGO0FBRUEsWUFBTSxJQUFJO0FBQUEsUUFDUjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBR0EsVUFBTSxTQUFTLE9BQU8sU0FBUyxPQUFPLFNBQVMsT0FBTztBQUN0RCxRQUFJLENBQUMsUUFBUTtBQUNYLFlBQU0sSUFBSSxNQUFNLCtCQUErQjtBQUFBLElBQ2pEO0FBRUEsUUFBSSxZQUFZO0FBQ2hCLFFBQUksVUFBVTtBQUNkLFVBQU0sY0FBYyxNQUFNLGNBQWMsU0FBUyxNQUFNO0FBQ3ZELFFBQUksYUFBYSxTQUFTO0FBQ3hCLGdCQUFVLFlBQVk7QUFDdEIsa0JBQVk7QUFBQSxJQUNkO0FBRUEsUUFBSSxDQUFDLFNBQVM7QUFDWixnQkFBVSx1QkFBdUIsRUFBRSxPQUFPLFFBQVEsT0FBTyxRQUFRLE1BQU0sT0FBTyxHQUFHLElBQUk7QUFBQSxJQUN2RjtBQUNBLFFBQUksQ0FBQyxTQUFTO0FBQ1osWUFBTSxJQUFJLE1BQU0scUNBQXFDLE1BQU0sR0FBRztBQUFBLElBQ2hFO0FBRUEsUUFBSTtBQUNGLGNBQVEsZUFBZSxFQUFFLFVBQVUsUUFBUSxPQUFPLFNBQVMsQ0FBQztBQUFBLElBQzlELFNBQVMsTUFBTTtBQUFBLElBQUM7QUFFaEIsWUFBUSxNQUFNO0FBQ2QsVUFBTSxjQUFjLFNBQVMsUUFBUSxPQUFPO0FBQzVDLFdBQU8sRUFBRSxRQUFRLFdBQVcsUUFBUSxLQUFLLFFBQVEsU0FBUyxVQUFVO0FBQUEsRUFDdEU7QUFyRmU7QUF1RmYsaUJBQWUsa0JBQWtCLFFBQVEsUUFBUTtBQUMvQyxRQUFJLFFBQVEsT0FBTyxTQUFTO0FBQzVCLFVBQU0sU0FBUyxPQUFPLFNBQVMsT0FBTyxTQUFTLE9BQU8sUUFBUSxRQUFRLFVBQVU7QUFDaEYsVUFBTSxXQUFXLE9BQU8sT0FBTyxZQUFZLFFBQVEsWUFBWSxFQUFFLEVBQUUsS0FBSztBQUN4RSxRQUFJLFlBQVk7QUFFaEIsVUFBTSxzQkFBc0IsOEJBQU8sU0FBUztBQUMxQyxZQUFNLGlCQUFpQixPQUFPLFFBQVEsRUFBRSxFQUFFLEtBQUs7QUFDL0MsVUFBSSxDQUFDLGdCQUFnQjtBQUNuQixjQUFNLElBQUksTUFBTSxvQkFBb0I7QUFBQSxNQUN0QztBQUVBLFVBQUksV0FBVztBQUNmLFlBQU0sY0FBYyxNQUFNLGNBQWMsUUFBUSxjQUFjO0FBQzlELFVBQUksYUFBYSxTQUFTO0FBQ3hCLG1CQUFXLFlBQVk7QUFDdkIsb0JBQVk7QUFBQSxNQUNkO0FBQ0EsVUFBSSxDQUFDLFVBQVU7QUFDYixtQkFBVztBQUFBLFVBQ1QsRUFBRSxPQUFPLGdCQUFnQixPQUFPLGdCQUFnQixNQUFNLGdCQUFnQixhQUFhLGVBQWU7QUFBQSxVQUNsRztBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBQ0EsVUFBSSxDQUFDLFVBQVU7QUFDYixjQUFNLElBQUksTUFBTSx5Q0FBeUMsY0FBYyxHQUFHO0FBQUEsTUFDNUU7QUFDQSxhQUFPO0FBQUEsSUFDVCxHQXRCNEI7QUF3QjVCLFVBQU0saUJBQWlCLHdCQUFDQSxhQUFZO0FBQ2xDLFVBQUksQ0FBQ0EsU0FBUyxRQUFPO0FBQ3JCLFlBQU0sTUFBTSxPQUFPQSxTQUFRLFdBQVcsRUFBRSxFQUFFLFlBQVk7QUFDdEQsVUFBSSxRQUFRLFdBQVcsUUFBUSxjQUFjLFFBQVEsVUFBVTtBQUM3RCxlQUFPLE9BQU9BLFNBQVEsU0FBUyxFQUFFO0FBQUEsTUFDbkM7QUFDQSxVQUFJQSxTQUFRLG1CQUFtQjtBQUM3QixlQUFPLE9BQU9BLFNBQVEsZUFBZSxFQUFFO0FBQUEsTUFDekM7QUFDQSxhQUFPO0FBQUEsSUFDVCxHQVZ1QjtBQVl2QixRQUFJLFVBQVU7QUFDWixZQUFNLGdCQUFnQixNQUFNLG9CQUFvQixRQUFRO0FBQ3hELFlBQU0sY0FBYyxlQUFlLGFBQWE7QUFDaEQsVUFBSSxDQUFDLGFBQWE7QUFDaEIsY0FBTSxJQUFJLE1BQU0saUJBQWlCLFFBQVEsWUFBWTtBQUFBLE1BQ3ZEO0FBQ0EsY0FBUTtBQUFBLElBQ1Y7QUFHQSxRQUFJLFVBQVU7QUFDZCxRQUFJLFFBQVE7QUFDVixnQkFBVSxNQUFNLG9CQUFvQixNQUFNO0FBQUEsSUFDNUMsT0FBTztBQUVMLGdCQUFVLFNBQVM7QUFDbkIsWUFBTSxNQUFNLFNBQVMsU0FBUyxZQUFZO0FBQzFDLFVBQUksUUFBUSxXQUFXLFFBQVEsY0FBYyxDQUFDLFNBQVMsbUJBQW1CO0FBQ3hFLGNBQU0sU0FBUyxTQUFTLGlCQUFpQixnRkFBZ0Y7QUFDekgsbUJBQVcsU0FBUyxRQUFRO0FBQzFCLGNBQUksY0FBYyxLQUFLLEdBQUc7QUFDeEIsc0JBQVU7QUFDVjtBQUFBLFVBQ0Y7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFFQSxRQUFJLENBQUMsV0FBWSxRQUFRLFlBQVksV0FBVyxRQUFRLFlBQVksY0FBYyxDQUFDLFFBQVEsbUJBQW9CO0FBQzdHLFlBQU0sSUFBSSxNQUFNLG1DQUFtQztBQUFBLElBQ3JEO0FBRUEsVUFBTSxhQUFhLE9BQU8sU0FBUyxFQUFFO0FBQ3JDLFlBQVEsTUFBTTtBQUNkLFFBQUksUUFBUSxZQUFZLFdBQVcsUUFBUSxZQUFZLFlBQVk7QUFDakUscUJBQWUsU0FBUyxVQUFVO0FBQ2xDLDBCQUFvQixPQUFPO0FBQUEsSUFDN0IsV0FBVyxRQUFRLG1CQUFtQjtBQUNwQyxjQUFRLGNBQWM7QUFDdEIsMEJBQW9CLE9BQU87QUFBQSxJQUM3QjtBQUVBLFFBQUksUUFBUTtBQUNWLFlBQU0sY0FBYyxRQUFRLFFBQVEsT0FBTztBQUFBLElBQzdDO0FBRUEsV0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLE1BQ1IsT0FBTyxXQUFXLE1BQU0sR0FBRyxFQUFFO0FBQUEsTUFDN0IsUUFBUSxVQUFVO0FBQUEsTUFDbEIsWUFBWSxZQUFZO0FBQUEsTUFDeEI7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQS9GZTtBQWlHZixpQkFBZSxrQkFBa0IsUUFBUTtBQUN2QyxVQUFNLFdBQVcsT0FBTyxZQUFZO0FBQ3BDLFVBQU0sSUFBSSxRQUFRLGFBQVcsV0FBVyxTQUFTLFFBQVEsQ0FBQztBQUMxRCxXQUFPLEVBQUUsUUFBUSxVQUFVLFNBQVM7QUFBQSxFQUN0QztBQUplO0FBTWYsaUJBQWUsc0JBQXNCLFFBQVE7QUFFM0MsUUFBSSxPQUFPLE1BQU07QUFDZixZQUFNLGdCQUFnQixPQUFPLGVBQWUsaUJBQWtCO0FBQUEsTUFBQyxDQUFDLEVBQUU7QUFDbEUsWUFBTSxLQUFLLElBQUksY0FBYyxPQUFPLElBQUk7QUFDeEMsWUFBTSxHQUFHO0FBQUEsSUFDWDtBQUNBLFdBQU8sRUFBRSxRQUFRLGFBQWEsUUFBUSxPQUFPLE9BQU87QUFBQSxFQUN0RDtBQVJlO0FBVWYsaUJBQWUsb0JBQW9CLFFBQVE7QUFDekMsVUFBTSxPQUFPLE9BQU8sUUFBUTtBQUM1QixRQUFJLENBQUMsTUFBTTtBQUNULFlBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLElBQzNDO0FBRUEsVUFBTSxnQkFBZ0IsT0FBTyxlQUFlLGlCQUFrQjtBQUFBLElBQUMsQ0FBQyxFQUFFO0FBQ2xFLFVBQU0sS0FBSyxJQUFJLGNBQWMsSUFBSTtBQUNqQyxVQUFNLFNBQVMsTUFBTSxHQUFHO0FBQ3hCLFdBQU8sRUFBRSxRQUFRLFlBQVksT0FBTztBQUFBLEVBQ3RDO0FBVmU7QUFZZixXQUFTLGtDQUFrQyxTQUFTO0FBQ2xELFVBQU0sT0FBTyxPQUFPLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxZQUFZO0FBQ3RELFFBQUksQ0FBQyxLQUFNLFFBQU87QUFFbEIsUUFBSSx5QkFBeUIsS0FBSyxJQUFJLEtBQUssc0JBQXNCLEtBQUssSUFBSSxHQUFHO0FBQzNFLGFBQU87QUFBQSxJQUNUO0FBQ0EsUUFBSSwyQkFBMkIsS0FBSyxJQUFJLEtBQUssQ0FBQywyQkFBMkIsS0FBSyxJQUFJLEdBQUc7QUFDbkYsYUFBTztBQUFBLElBQ1Q7QUFDQSxRQUFJLCtCQUErQixLQUFLLElBQUksS0FBSyxDQUFDLG1CQUFtQixLQUFLLElBQUksR0FBRztBQUMvRSxhQUFPO0FBQUEsSUFDVDtBQUVBLFdBQU87QUFBQSxFQUNUO0FBZlM7QUF3QlQsaUJBQWUsK0JBQStCLFNBQVM7QUFDckQsVUFBTSxZQUFZLEtBQUssSUFBSTtBQUMzQixVQUFNLFNBQVM7QUFBQSxNQUNiLElBQUk7QUFBQSxNQUNKLFVBQVU7QUFBQSxNQUNWO0FBQUEsTUFDQSxVQUFVO0FBQUEsTUFDVixZQUFZO0FBQUEsSUFDZDtBQUVBLGtCQUFjLEtBQUssdUNBQXVDLEVBQUUsUUFBUSxDQUFDO0FBR3JFLFFBQUksT0FBTyxhQUFhLGdCQUFnQixPQUFPLHVCQUF1QjtBQUNwRSxVQUFJO0FBQ0YsY0FBTSxXQUFXLE1BQU0sc0JBQXNCLE9BQU87QUFDcEQsWUFBSSxZQUFZLENBQUMsU0FBUyxTQUFTLFNBQVMsWUFBWTtBQUN0RCxnQkFBTSxhQUFhLE1BQU0scUJBQXFCLFNBQVMsWUFBWSxTQUFTLE1BQU07QUFDbEYsY0FBSSxZQUFZO0FBR2QsZ0JBQUksU0FBUyxVQUFVO0FBQ3JCLHFDQUF1QixTQUFTLFNBQVMsa0JBQWtCLFNBQVMsUUFBUSxFQUFFLE1BQU0sTUFBTTtBQUFBLGNBQUMsQ0FBQztBQUFBLFlBQzlGO0FBQ0EsbUJBQU8sS0FBSztBQUNaLG1CQUFPLFdBQVc7QUFDbEIsbUJBQU8sU0FBUyxTQUFTO0FBQ3pCLG1CQUFPLFNBQVM7QUFDaEIsbUJBQU8sYUFBYSxLQUFLLElBQUksSUFBSTtBQUNqQyxtQkFBTztBQUFBLFVBQ1Q7QUFBQSxRQUNGO0FBQUEsTUFDRixTQUFTLEdBQUc7QUFDVixzQkFBYyxLQUFLLDZDQUE2QyxFQUFFLE9BQU8sRUFBRSxRQUFRLENBQUM7QUFBQSxNQUN0RjtBQUFBLElBQ0Y7QUFHQSxRQUFJLE9BQU8sMEJBQTBCO0FBQ25DLFVBQUk7QUFDRixjQUFNLFNBQVMsT0FBTztBQUN0QixjQUFNLGFBQWEsTUFBTSxPQUFPLElBQUksT0FBTztBQUUzQyxZQUFJLGNBQWMsV0FBVyxJQUFJO0FBQy9CLGlCQUFPLEtBQUs7QUFDWixpQkFBTyxXQUFXO0FBQ2xCLGlCQUFPLFNBQVM7QUFDaEIsaUJBQU8sYUFBYSxLQUFLLElBQUksSUFBSTtBQUNqQyxpQkFBTztBQUFBLFFBQ1Q7QUFBQSxNQUNGLFNBQVMsR0FBRztBQUNWLHNCQUFjLEtBQUssc0RBQXNELEVBQUUsT0FBTyxFQUFFLFFBQVEsQ0FBQztBQUFBLE1BQy9GO0FBQUEsSUFDRjtBQUdBLFFBQUk7QUFDRixZQUFNLGVBQWUsTUFBTSxxQkFBcUIsT0FBTztBQUN2RCxVQUFJLGdCQUFnQixhQUFhLElBQUk7QUFDbkMsZUFBTyxLQUFLO0FBQ1osZUFBTyxXQUFXO0FBQ2xCLGVBQU8sU0FBUztBQUNoQixlQUFPLGFBQWEsS0FBSyxJQUFJLElBQUk7QUFDakMsZUFBTztBQUFBLE1BQ1Q7QUFBQSxJQUNGLFNBQVMsR0FBRztBQUNWLG9CQUFjLEtBQUssbUNBQW1DLEVBQUUsT0FBTyxFQUFFLFFBQVEsQ0FBQztBQUFBLElBQzVFO0FBR0EsV0FBTyxRQUFRO0FBQ2YsV0FBTyxhQUFhLEtBQUssSUFBSSxJQUFJO0FBQ2pDLFdBQU8sWUFBWSxDQUFDLFVBQVUsY0FBYyxnQkFBZ0I7QUFDNUQsV0FBTztBQUFBLEVBQ1Q7QUExRWU7QUErRWYsaUJBQWUscUJBQXFCLFNBQVM7QUFDM0MsVUFBTSxNQUFNLE9BQU8sV0FBVyxFQUFFO0FBQ2hDLFVBQU0sTUFBTSxJQUFJLFlBQVksRUFBRSxLQUFLO0FBR25DLFVBQU0sUUFBUyxPQUFPLGlDQUNwQixPQUFPLGtDQUFrQyxFQUFFLFVBQVUsT0FBTyxVQUFVLE9BQU8sV0FBVyxFQUFFO0FBRTVGLFVBQU0sZ0JBQ0osNEdBQTRHLEtBQUssR0FBRztBQUN0SCxVQUFNLG9CQUNKLHNGQUFzRixLQUFLLEdBQUc7QUFFaEcsUUFBSSxjQUFlLE9BQU0sV0FBVztBQUNwQyxRQUFJLGtCQUFtQixPQUFNLFdBQVc7QUFDeEMsVUFBTSxZQUFZLEtBQUssSUFBSTtBQUUzQixVQUFNLGlCQUNKLHlEQUF5RCxLQUFLLEdBQUcsS0FBSyxvQkFBb0IsS0FBSyxHQUFHO0FBQ3BHLFFBQUksTUFBTSxZQUFZLGdCQUFnQjtBQUNwQyxhQUFPLE1BQU0sc0JBQXNCLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFBQSxJQUNuRDtBQUdBLFVBQU0sb0JBQ0osSUFBSSxNQUFNLHdHQUF3RyxLQUNsSCxJQUFJLE1BQU0sOEJBQThCLEtBQ3hDLElBQUksTUFBTSxlQUFlLEtBQ3hCLGdDQUFnQyxLQUFLLEdBQUcsS0FBSyxzQkFBc0IsS0FBSyxHQUFHO0FBRTlFLFFBQUksbUJBQW1CO0FBRXJCLFlBQU0sV0FDSix3QkFBd0IsS0FBSyxHQUFHLEtBQUssc0JBQXNCLEtBQUssR0FBRyxLQUFLLENBQUM7QUFDM0UsVUFBSSxTQUFVLE9BQU0sV0FBVztBQUMvQixhQUFPLE1BQU0sc0JBQXNCLEVBQUUsTUFBTSxDQUFDLENBQUMsTUFBTSxTQUFTLENBQUM7QUFBQSxJQUMvRDtBQUVBLFVBQU0sWUFBWSxJQUFJLE1BQU0sdUZBQXVGO0FBQ25ILFFBQUksV0FBVztBQUNiLFlBQU0sQ0FBQyxFQUFFLEVBQUUsV0FBVyxLQUFLLElBQUk7QUFDL0IsYUFBTyxNQUFNLGdCQUFnQixXQUFXLEtBQUs7QUFBQSxJQUMvQztBQUVBLFVBQU0sYUFBYSxJQUFJLE1BQU0sZ0VBQWdFO0FBQzdGLFFBQUksWUFBWTtBQUNkLFlBQU0sQ0FBQyxFQUFFLEVBQUUsVUFBVSxJQUFJO0FBQ3pCLGFBQU8sTUFBTSxZQUFZLFVBQVU7QUFBQSxJQUNyQztBQUVBLFFBQUksSUFBSSxNQUFNLHVDQUF1QyxHQUFHO0FBQ3RELFVBQUksTUFBTSxVQUFVO0FBQ2xCLGVBQU8sRUFBRSxJQUFJLE9BQU8sT0FBTyx3Q0FBd0MsU0FBUyxLQUFLO0FBQUEsTUFDbkY7QUFDQSxhQUFPLE1BQU0sa0JBQWtCO0FBQUEsSUFDakM7QUFFQSxXQUFPLEVBQUUsSUFBSSxPQUFPLE9BQU8sc0JBQXNCO0FBQUEsRUFDbkQ7QUExRGU7QUE0RGYsaUJBQWUsc0JBQXNCLFVBQVUsQ0FBQyxHQUFHO0FBQ2pELFVBQU0sT0FBTyxXQUFXLE9BQU8sWUFBWSxXQUFXLFVBQVUsQ0FBQztBQUNqRSxVQUFNLE9BQU8sQ0FBQyxDQUFDLEtBQUs7QUFDcEIsVUFBTSxTQUFTLFNBQVMsaUJBQWlCLDhGQUE4RjtBQUN2SSxVQUFNLFVBQVUsQ0FBQztBQUNqQixRQUFJLFdBQVc7QUFDZixRQUFJLFdBQVc7QUFFZixRQUFJLFVBQVUsQ0FBQztBQUNmLFFBQUk7QUFDRixZQUFNLFNBQVMsTUFBTSxPQUFPLFFBQVEsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUM7QUFDcEUsZ0JBQVUsT0FBTyxzQkFBc0IsQ0FBQztBQUFBLElBQzFDLFNBQVMsR0FBRztBQUFBLElBQUM7QUFFYixVQUFNLFVBQVU7QUFBQSxNQUNkLE9BQU8sUUFBUSxTQUFTO0FBQUEsTUFDeEIsV0FBVyxRQUFRLGFBQWE7QUFBQSxNQUNoQyxVQUFVLFFBQVEsWUFBWTtBQUFBLE1BQzlCLE9BQU8sUUFBUSxTQUFTO0FBQUEsTUFDeEIsU0FBUyxRQUFRLFlBQVksUUFBUSxXQUFXO0FBQUEsTUFDaEQsTUFBTSxRQUFRLFFBQVE7QUFBQSxNQUN0QixPQUFPLFFBQVEsU0FBUztBQUFBLE1BQ3hCLEtBQUssUUFBUSxXQUFXLFFBQVEsT0FBTztBQUFBLElBQ3pDO0FBRUEsZUFBVyxTQUFTLFFBQVE7QUFDMUIsVUFBSSxDQUFDLGlCQUFpQixLQUFLLEVBQUc7QUFDOUIsVUFBSSxNQUFNLFNBQVMsTUFBTSxNQUFNLEtBQUssRUFBRztBQUV2QyxZQUFNLGVBQWUsd0JBQXdCLEtBQUs7QUFDbEQsWUFBTSxRQUFRLFFBQVEsWUFBWTtBQUVsQyxVQUFJLE9BQU87QUFDVCxvQkFBWTtBQUNaLFlBQUk7QUFDRixjQUFJO0FBQ0Ysa0JBQU0sZUFBZSxFQUFFLFVBQVUsVUFBVSxPQUFPLFNBQVMsQ0FBQztBQUFBLFVBQzlELFNBQVMsR0FBRztBQUFBLFVBQUM7QUFDYixjQUFJO0FBQ0Ysa0JBQU0sTUFBTTtBQUFBLFVBQ2QsU0FBUyxHQUFHO0FBQUEsVUFBQztBQUNiLHlCQUFlLE9BQU8sS0FBSztBQUMzQiw4QkFBb0IsS0FBSztBQUN6QixrQkFBUSxLQUFLLEVBQUUsT0FBTyxXQUFXLEtBQUssR0FBRyxPQUFPLElBQUksS0FBSyxDQUFDO0FBQzFELHNCQUFZO0FBQUEsUUFDZCxTQUFTLEdBQUc7QUFDVixrQkFBUSxLQUFLLEVBQUUsT0FBTyxXQUFXLEtBQUssR0FBRyxPQUFPLEVBQUUsU0FBUyxJQUFJLE1BQU0sQ0FBQztBQUFBLFFBQ3hFO0FBQ0EsWUFBSSxRQUFRLFlBQVksRUFBRztBQUFBLE1BQzdCO0FBQUEsSUFDRjtBQUVBLFFBQUksVUFBVTtBQUNkLFFBQUksYUFBYSxHQUFHO0FBQ2xCLFVBQUksYUFBYSxFQUFHLFdBQVU7QUFBQSxVQUN6QixXQUFVO0FBQUEsSUFDakI7QUFDQSxXQUFPLEVBQUUsSUFBSSxNQUFNLFFBQVEsVUFBVSxVQUFVLE1BQU0sU0FBUyxHQUFJLFVBQVUsRUFBRSxRQUFRLElBQUksQ0FBQyxFQUFHO0FBQUEsRUFDaEc7QUExRGU7QUE0RGYsaUJBQWUsZ0JBQWdCLE1BQU0sT0FBTztBQUMxQyxVQUFNLFNBQVMsT0FBTyxRQUFRLEVBQUUsRUFBRSxLQUFLO0FBQ3ZDLFFBQUksVUFBVTtBQUNkLFFBQUksWUFBWTtBQUVoQixVQUFNLGNBQWMsTUFBTSxjQUFjLFFBQVEsTUFBTTtBQUN0RCxRQUFJLGFBQWEsU0FBUztBQUN4QixnQkFBVSxZQUFZO0FBQ3RCLGtCQUFZO0FBQUEsSUFDZDtBQUVBLFFBQUksQ0FBQyxTQUFTO0FBQ1osZ0JBQVUsdUJBQXVCLEVBQUUsT0FBTyxRQUFRLE9BQU8sUUFBUSxNQUFNLFFBQVEsYUFBYSxPQUFPLEdBQUcsSUFBSTtBQUFBLElBQzVHO0FBRUEsUUFBSSxDQUFDLFNBQVM7QUFDWixhQUFPLEVBQUUsSUFBSSxPQUFPLE9BQU8sb0JBQW9CLElBQUksR0FBRztBQUFBLElBQ3hEO0FBRUEsbUJBQWUsU0FBUyxLQUFLO0FBQzdCLHdCQUFvQixPQUFPO0FBQzNCLFVBQU0sY0FBYyxRQUFRLFFBQVEsT0FBTztBQUMzQyxXQUFPLEVBQUUsSUFBSSxNQUFNLE9BQU8sV0FBVyxPQUFPLEdBQUcsT0FBTyxVQUFVO0FBQUEsRUFDbEU7QUF2QmU7QUF5QmYsaUJBQWUsWUFBWSxNQUFNO0FBQy9CLFVBQU0sU0FBUyxPQUFPLFFBQVEsRUFBRSxFQUFFLEtBQUs7QUFDdkMsUUFBSSxVQUFVO0FBQ2QsUUFBSSxZQUFZO0FBRWhCLFVBQU0sY0FBYyxNQUFNLGNBQWMsU0FBUyxNQUFNO0FBQ3ZELFFBQUksYUFBYSxTQUFTO0FBQ3hCLGdCQUFVLFlBQVk7QUFDdEIsa0JBQVk7QUFBQSxJQUNkO0FBRUEsUUFBSSxDQUFDLFNBQVM7QUFDWixnQkFBVSx1QkFBdUIsRUFBRSxPQUFPLFFBQVEsT0FBTyxRQUFRLE1BQU0sUUFBUSxhQUFhLE9BQU8sR0FBRyxJQUFJO0FBQUEsSUFDNUc7QUFFQSxRQUFJLENBQUMsU0FBUztBQUNaLGFBQU8sRUFBRSxJQUFJLE9BQU8sT0FBTywyQkFBMkIsSUFBSSxHQUFHO0FBQUEsSUFDL0Q7QUFFQSxZQUFRLGVBQWUsRUFBRSxVQUFVLFVBQVUsT0FBTyxTQUFTLENBQUM7QUFDOUQsVUFBTSxJQUFJLFFBQVEsT0FBSyxXQUFXLEdBQUcsR0FBRyxDQUFDO0FBQ3pDLFlBQVEsTUFBTTtBQUNkLFVBQU0sY0FBYyxTQUFTLFFBQVEsT0FBTztBQUM1QyxXQUFPLEVBQUUsSUFBSSxNQUFNLFNBQVMsV0FBVyxPQUFPLEdBQUcsVUFBVTtBQUFBLEVBQzdEO0FBeEJlO0FBMEJmLGlCQUFlLG9CQUFvQjtBQUNqQyxVQUFNLE1BQU0sU0FBUyxjQUFjLDZDQUE2QztBQUNoRixRQUFJLEtBQUs7QUFDUCxVQUFJLE1BQU07QUFDVixhQUFPLEVBQUUsSUFBSSxNQUFNLFFBQVEsaUJBQWlCO0FBQUEsSUFDOUM7QUFDQSxVQUFNLE9BQU8sU0FBUyxjQUFjLE1BQU07QUFDMUMsUUFBSSxNQUFNO0FBQ1IsV0FBSyxPQUFPO0FBQ1osYUFBTyxFQUFFLElBQUksTUFBTSxRQUFRLGlCQUFpQjtBQUFBLElBQzlDO0FBQ0EsV0FBTyxFQUFFLElBQUksT0FBTyxPQUFPLGlDQUFpQztBQUFBLEVBQzlEO0FBWmU7QUFjZixXQUFTLHdCQUF3QixPQUFPO0FBQ3RDLFVBQU0sUUFBUSxNQUFNLE9BQU8sTUFBTSxNQUFNLEtBQUssTUFBTSxNQUFNLGFBQWEsWUFBWTtBQUNqRixRQUFJLEtBQUssU0FBUyxPQUFPLEVBQUcsUUFBTztBQUNuQyxRQUFJLEtBQUssU0FBUyxPQUFPLEVBQUcsUUFBTztBQUNuQyxRQUFJLEtBQUssU0FBUyxNQUFNLEVBQUcsUUFBTztBQUNsQyxRQUFJLEtBQUssU0FBUyxPQUFPLEtBQUssS0FBSyxTQUFTLEtBQUssRUFBRyxRQUFPO0FBQzNELFFBQUksS0FBSyxTQUFTLEtBQUssS0FBSyxLQUFLLFNBQVMsTUFBTSxFQUFHLFFBQU87QUFDMUQsUUFBSSxLQUFLLFNBQVMsTUFBTSxFQUFHLFFBQU87QUFDbEMsUUFBSSxLQUFLLFNBQVMsT0FBTyxFQUFHLFFBQU87QUFDbkMsUUFBSSxLQUFLLFNBQVMsU0FBUyxFQUFHLFFBQU87QUFDckMsV0FBTztBQUFBLEVBQ1Q7QUFYUztBQWFULFdBQVMsaUJBQWlCLElBQUk7QUFDNUIsVUFBTSxPQUFPLEdBQUcsc0JBQXNCO0FBQ3RDLFdBQU8sS0FBSyxRQUFRLEtBQUssS0FBSyxTQUFTLEtBQUssaUJBQWlCLEVBQUUsRUFBRSxZQUFZO0FBQUEsRUFDL0U7QUFIUztBQUtULFdBQVMsV0FBVyxJQUFJO0FBQ3RCLFdBQU8sR0FBRyxNQUFNLEdBQUcsUUFBUSxHQUFHLFFBQVEsWUFBWTtBQUFBLEVBQ3BEO0FBRlM7QUFJVCxTQUFPLFFBQVEsVUFBVSxZQUFZLENBQUMsU0FBUyxRQUFRLGlCQUFpQjtBQUN0RSxRQUFJO0FBQ0YsVUFBSSxDQUFDLFdBQVcsT0FBTyxZQUFZLFVBQVU7QUFDM0MscUJBQWEsRUFBRSxPQUFPLDJCQUEyQixDQUFDO0FBQ2xELGVBQU87QUFBQSxNQUNUO0FBRUEsVUFBSSxRQUFRLFNBQVMsa0JBQWtCO0FBQ3JDLHFCQUFhLEVBQUUsSUFBSSxLQUFLLENBQUM7QUFDekIsZUFBTztBQUFBLE1BQ1Q7QUFFQSxVQUFJLFFBQVEsU0FBUyxpQkFBaUI7QUFDcEMsc0JBQWMsS0FBSyx5QkFBeUI7QUFDNUMsY0FBTSxXQUFXLFNBQVMsT0FBTyxTQUFTLEtBQUssWUFBWTtBQUMzRCxxQkFBYTtBQUFBLFVBQ1gsS0FBSyxPQUFPLFNBQVM7QUFBQSxVQUNyQixPQUFPLFNBQVMsU0FBUztBQUFBLFVBQ3pCLGFBQWEsU0FBUyxjQUFjLDBCQUEwQixHQUFHLFdBQVc7QUFBQSxVQUM1RSxNQUFNLFNBQVMsVUFBVSxtQkFBbUI7QUFBQTtBQUFBLFFBQzlDLENBQUM7QUFDRCxlQUFPO0FBQUEsTUFDVDtBQUVBLFVBQUksUUFBUSxTQUFTLGVBQWU7QUFDbEMsY0FBTSxXQUFXLFFBQVEsWUFBWTtBQUNyQyxZQUFJLFVBQVU7QUFDZCxZQUFJO0FBQ0Ysb0JBQVUsa0JBQWtCLFFBQVE7QUFBQSxRQUN0QyxTQUFTLEtBQUs7QUFDWix1QkFBYSxnQ0FBZ0MsVUFBVSxHQUFHLENBQUM7QUFDM0QsaUJBQU87QUFBQSxRQUNUO0FBRUEsWUFBSSxDQUFDLFNBQVM7QUFDWix1QkFBYSxFQUFFLE9BQU8sWUFBWSxRQUFRLGNBQWMsQ0FBQztBQUN6RCxpQkFBTztBQUFBLFFBQ1Q7QUFFQSxjQUFNLE9BQU8sUUFBUSxhQUFhO0FBQ2xDLGNBQU0sV0FBVztBQUFBLFVBQ2YsTUFBTSxTQUFTLE1BQU0sY0FBYztBQUFBLFVBQ25DLEtBQUssT0FBTyxTQUFTO0FBQUEsUUFDdkI7QUFFQSxZQUFJLFFBQVEsWUFBWTtBQUN0QixtQkFBUyxjQUFjLFNBQVMsUUFBUSxXQUFXLGFBQWEsSUFBSSxxQkFBcUI7QUFBQSxRQUMzRjtBQUVBLHFCQUFhLFFBQVE7QUFDckIsZUFBTztBQUFBLE1BQ1Q7QUFFQSxVQUFJLFFBQVEsU0FBUyxpQkFBaUI7QUFDcEMsY0FBTSxXQUFXLFFBQVE7QUFDekIsc0JBQWMsS0FBSywyQkFBMkIsRUFBRSxVQUFVLE9BQU8sUUFBUSxPQUFPLE1BQU0sUUFBUSxLQUFLLENBQUM7QUFFcEcsWUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLFNBQVMsQ0FBQyxRQUFRLFFBQVEsQ0FBQyxRQUFRLE9BQU87QUFDbEUsd0JBQWMsS0FBSyxzQ0FBc0M7QUFDekQsdUJBQWEsRUFBRSxPQUFPLDREQUE0RCxDQUFDO0FBQ25GLGlCQUFPO0FBQUEsUUFDVDtBQUVBLFlBQUksVUFBVTtBQUNkLFlBQUksWUFBWTtBQUdoQixZQUFJLFVBQVU7QUFDWixjQUFJO0FBQ0Ysc0JBQVUsa0JBQWtCLFFBQVE7QUFDcEMsZ0JBQUksUUFBUyxhQUFZO0FBQUEsVUFDM0IsU0FBUyxLQUFLO0FBQ1osMEJBQWMsS0FBSyw4QkFBOEIsRUFBRSxVQUFVLE9BQU8sSUFBSSxRQUFRLENBQUM7QUFFakYsZ0JBQUksQ0FBQyxRQUFRLFNBQVMsQ0FBQyxRQUFRLFFBQVEsQ0FBQyxRQUFRLE9BQU87QUFDckQsMkJBQWEsZ0NBQWdDLFVBQVUsR0FBRyxDQUFDO0FBQzNELHFCQUFPO0FBQUEsWUFDVDtBQUFBLFVBQ0Y7QUFBQSxRQUNGO0FBR0EsWUFBSSxDQUFDLFlBQVksUUFBUSxTQUFTLFFBQVEsUUFBUSxRQUFRLFNBQVMsUUFBUSxjQUFjO0FBQ3ZGLG9CQUFVLHVCQUF1QixTQUFTLFFBQVE7QUFDbEQsY0FBSSxRQUFTLGFBQVk7QUFBQSxRQUMzQjtBQUVBLFlBQUksQ0FBQyxTQUFTO0FBQ1osZ0JBQU0sUUFBUSxDQUFDLFFBQVEsT0FBTyxRQUFRLE1BQU0sUUFBUSxLQUFLLEVBQUUsT0FBTyxPQUFPLEVBQUUsS0FBSyxJQUFJO0FBQ3BGLHdCQUFjLEtBQUssbUNBQW1DLEVBQUUsVUFBVSxNQUFNLENBQUM7QUFDekUsdUJBQWEsRUFBRSxPQUFPLGdDQUFnQyxZQUFZLFFBQVEsWUFBWSxTQUFTLFFBQVEsR0FBRyxDQUFDO0FBQzNHLGlCQUFPO0FBQUEsUUFDVDtBQUVBLFlBQUk7QUFDRixrQkFBUSxlQUFlLEVBQUUsVUFBVSxRQUFRLE9BQU8sVUFBVSxRQUFRLFNBQVMsQ0FBQztBQUFBLFFBQ2hGLFNBQVMsTUFBTTtBQUFBLFFBQUM7QUFFaEIsWUFBSTtBQUNGLGtCQUFRLE1BQU07QUFDZCx3QkFBYyxLQUFLLHlCQUF5QixFQUFFLFdBQVcsS0FBSyxRQUFRLFFBQVEsQ0FBQztBQUMvRSx1QkFBYSxFQUFFLFFBQVEsV0FBVyxVQUFVLENBQUM7QUFBQSxRQUMvQyxTQUFTLEtBQUs7QUFDWix3QkFBYyxNQUFNLHdCQUF3QixFQUFFLE9BQU8sSUFBSSxRQUFRLENBQUM7QUFDbEUsdUJBQWEsRUFBRSxPQUFPLGlCQUFpQixJQUFJLE9BQU8sR0FBRyxDQUFDO0FBQUEsUUFDeEQ7QUFDQSxlQUFPO0FBQUEsTUFDVDtBQUVBLFVBQUksUUFBUSxTQUFTLGFBQWE7QUFDaEMsY0FBTSxXQUFXLFFBQVE7QUFDekIsY0FBTSxPQUFPLFFBQVEsUUFBUTtBQUM3QixjQUFNLGNBQWMsT0FBTyxJQUFJLEVBQUUsTUFBTSxHQUFHLEVBQUU7QUFDNUMsc0JBQWMsS0FBSyx1QkFBdUIsRUFBRSxVQUFVLGFBQWEsT0FBTyxRQUFRLE1BQU0sQ0FBQztBQUV6RixZQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsU0FBUyxDQUFDLFFBQVEsUUFBUSxDQUFDLFFBQVEsT0FBTztBQUNsRSx3QkFBYyxLQUFLLGtDQUFrQztBQUNyRCx1QkFBYSxFQUFFLE9BQU8sNERBQTRELENBQUM7QUFDbkYsaUJBQU87QUFBQSxRQUNUO0FBRUEsWUFBSSxVQUFVO0FBQ2QsWUFBSSxZQUFZO0FBR2hCLFlBQUksVUFBVTtBQUNaLGNBQUk7QUFDRixzQkFBVSxrQkFBa0IsUUFBUTtBQUNwQyxnQkFBSSxRQUFTLGFBQVk7QUFBQSxVQUMzQixTQUFTLEtBQUs7QUFDWiwwQkFBYyxLQUFLLDZCQUE2QixFQUFFLFVBQVUsT0FBTyxJQUFJLFFBQVEsQ0FBQztBQUVoRixnQkFBSSxDQUFDLFFBQVEsU0FBUyxDQUFDLFFBQVEsUUFBUSxDQUFDLFFBQVEsT0FBTztBQUNyRCwyQkFBYSxnQ0FBZ0MsVUFBVSxHQUFHLENBQUM7QUFDM0QscUJBQU87QUFBQSxZQUNUO0FBQUEsVUFDRjtBQUFBLFFBQ0Y7QUFHQSxZQUFJLENBQUMsWUFBWSxRQUFRLFNBQVMsUUFBUSxRQUFRLFFBQVEsU0FBUyxRQUFRLGNBQWM7QUFDdkYsb0JBQVUsdUJBQXVCLFNBQVMsUUFBUTtBQUNsRCxjQUFJLFFBQVMsYUFBWTtBQUFBLFFBQzNCO0FBRUEsWUFBSSxDQUFDLFNBQVM7QUFDWixnQkFBTSxRQUFRLENBQUMsUUFBUSxPQUFPLFFBQVEsTUFBTSxRQUFRLEtBQUssRUFBRSxPQUFPLE9BQU8sRUFBRSxLQUFLLElBQUk7QUFDcEYsd0JBQWMsS0FBSywrQkFBK0IsRUFBRSxVQUFVLE1BQU0sQ0FBQztBQUNyRSx1QkFBYSxFQUFFLE9BQU8sZ0NBQWdDLFlBQVksUUFBUSxZQUFZLFNBQVMsUUFBUSxHQUFHLENBQUM7QUFDM0csaUJBQU87QUFBQSxRQUNUO0FBRUEsWUFBSTtBQUNGLGtCQUFRLE1BQU07QUFFZCxnQkFBTSxNQUFNLE9BQU8sU0FBUyxXQUFXLEVBQUUsRUFBRSxZQUFZO0FBQ3ZELGNBQUksUUFBUSxXQUFXLFFBQVEsWUFBWTtBQUN6QywyQkFBZSxTQUFTLElBQUk7QUFDNUIsZ0NBQW9CLE9BQU87QUFBQSxVQUM3QixXQUFXLFFBQVEsbUJBQW1CO0FBQ3BDLG9CQUFRLGNBQWMsT0FBTyxJQUFJO0FBQ2pDLGdDQUFvQixPQUFPO0FBQUEsVUFDN0IsT0FBTztBQUNMLG9CQUFRLGNBQWMsT0FBTyxJQUFJO0FBQUEsVUFDbkM7QUFFQSx3QkFBYyxLQUFLLHFCQUFxQixFQUFFLFdBQVcsS0FBSyxRQUFRLFFBQVEsQ0FBQztBQUMzRSx1QkFBYSxFQUFFLFFBQVEsU0FBUyxVQUFVLENBQUM7QUFBQSxRQUM3QyxTQUFTLEtBQUs7QUFDWix3QkFBYyxNQUFNLG9CQUFvQixFQUFFLE9BQU8sSUFBSSxRQUFRLENBQUM7QUFDOUQsdUJBQWEsRUFBRSxPQUFPLGdCQUFnQixJQUFJLE9BQU8sR0FBRyxDQUFDO0FBQUEsUUFDdkQ7QUFDQSxlQUFPO0FBQUEsTUFDVDtBQUVBLFVBQUksUUFBUSxTQUFTLHVCQUF1QjtBQUMxQyxzQkFBYyxLQUFLLCtCQUErQjtBQUNsRCxZQUFJO0FBQ0YsZ0JBQU0sYUFBYSxDQUFDO0FBQ3BCLGdCQUFNLFlBQVksU0FBUyxpQkFBaUIsbURBQW1EO0FBRS9GLGNBQUksYUFBYTtBQUNqQixxQkFBVyxXQUFXLFdBQVc7QUFDL0IsZ0JBQUksQ0FBQyxjQUFjLE9BQU8sRUFBRztBQUU3QixrQkFBTSxNQUFNLFFBQVEsUUFBUSxZQUFZO0FBQ3hDLGtCQUFNLE9BQU8sUUFBUSxhQUFhLE1BQU0sTUFBTSxRQUFRLGFBQWEsYUFBYSxRQUFRLFdBQVcsV0FBVztBQUc5RyxnQkFBSSxDQUFDLFVBQVUsVUFBVSxVQUFVLFNBQVMsUUFBUSxPQUFPLEVBQUUsU0FBUyxJQUFJLEVBQUc7QUFFN0Usa0JBQU0sS0FBSyxRQUFRLGFBQWEsSUFBSSxLQUFLO0FBQ3pDLGtCQUFNLE9BQU8sUUFBUSxhQUFhLE1BQU0sS0FBSztBQUM3QyxrQkFBTSxjQUFjLFFBQVEsYUFBYSxhQUFhLEtBQUs7QUFDM0Qsa0JBQU0sZUFBZSxRQUFRLGFBQWEsY0FBYyxLQUFLO0FBQzdELGtCQUFNLFlBQVksUUFBUSxhQUFhLFlBQVksS0FBSztBQUN4RCxrQkFBTSxZQUFZLGNBQWMsT0FBTztBQUd2QyxnQkFBSSxlQUFlO0FBQ25CLGdCQUFJLFFBQVEsbUJBQW1CO0FBQzdCLDZCQUFlLFFBQVEsZUFBZTtBQUFBLFlBQ3hDLFdBQVcsV0FBVyxTQUFTO0FBQzdCLDZCQUFlLFFBQVEsU0FBUztBQUFBLFlBQ2xDO0FBR0EsZ0JBQUksV0FBVztBQUNmLGdCQUFJLElBQUk7QUFDTix5QkFBVyxJQUFJLElBQUksT0FBTyxFQUFFLENBQUM7QUFBQSxZQUMvQixXQUFXLE1BQU07QUFDZix5QkFBVyxHQUFHLEdBQUcsVUFBVSxJQUFJLE9BQU8sSUFBSSxDQUFDO0FBQUEsWUFDN0MsT0FBTztBQUVMLG9CQUFNLFNBQVMsUUFBUTtBQUN2QixrQkFBSSxRQUFRO0FBQ1Ysc0JBQU0sV0FBVyxNQUFNLEtBQUssT0FBTyxpQkFBaUIsR0FBRyxDQUFDO0FBQ3hELHNCQUFNLFFBQVEsU0FBUyxRQUFRLE9BQU87QUFDdEMsb0JBQUksU0FBUyxHQUFHO0FBQ2QsNkJBQVcsR0FBRyxHQUFHLGdCQUFnQixRQUFRLENBQUM7QUFBQSxnQkFDNUM7QUFBQSxjQUNGO0FBQUEsWUFDRjtBQUVBLHVCQUFXLEtBQUs7QUFBQSxjQUNkLE9BQU87QUFBQSxjQUNQO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0EsT0FBTyxVQUFVLEtBQUssRUFBRSxNQUFNLEdBQUcsR0FBRztBQUFBLGNBQ3BDLGNBQWMsYUFBYSxNQUFNLEdBQUcsR0FBRztBQUFBLGNBQ3ZDLFlBQVksUUFBUSxhQUFhLFVBQVUsS0FBSyxRQUFRLGFBQWEsZUFBZSxNQUFNO0FBQUEsWUFDNUYsQ0FBQztBQUFBLFVBQ0g7QUFFQSx3QkFBYyxLQUFLLDZCQUE2QixXQUFXLE1BQU0sU0FBUztBQUMxRSx1QkFBYTtBQUFBLFlBQ1gsUUFBUTtBQUFBLFlBQ1IsU0FBUyxPQUFPLFNBQVM7QUFBQSxZQUN6QixXQUFXLFNBQVMsU0FBUztBQUFBLFVBQy9CLENBQUM7QUFBQSxRQUNILFNBQVMsS0FBSztBQUNaLGdCQUFNLFVBQVUsT0FBTyxJQUFJLFVBQVUsSUFBSSxVQUFVLE9BQU8sT0FBTyxlQUFlO0FBQ2hGLHdCQUFjLE1BQU0sOEJBQThCLEVBQUUsT0FBTyxRQUFRLENBQUM7QUFDcEUsdUJBQWEsRUFBRSxPQUFPLCtCQUErQixPQUFPLEdBQUcsQ0FBQztBQUFBLFFBQ2xFO0FBQ0EsZUFBTztBQUFBLE1BQ1Q7QUFFQSxVQUFJLFFBQVEsU0FBUyxjQUFjO0FBQ2pDLGNBQU0sT0FBTyxPQUFPLFFBQVEsUUFBUSxFQUFFO0FBQ3RDLGNBQU0sY0FBYyxLQUFLLE1BQU0sR0FBRyxFQUFFO0FBQ3BDLHNCQUFjLEtBQUssd0JBQXdCLEVBQUUsWUFBWSxLQUFLLFFBQVEsWUFBWSxDQUFDO0FBRW5GLFlBQUksQ0FBQyxLQUFLLEtBQUssR0FBRztBQUNoQix3QkFBYyxLQUFLLHlCQUF5QjtBQUM1Qyx1QkFBYSxFQUFFLE9BQU8sZ0JBQWdCLENBQUM7QUFDdkMsaUJBQU87QUFBQSxRQUNUO0FBQ0EsWUFBSSxLQUFLLFNBQVMsMkJBQTJCO0FBQzNDLHdCQUFjLEtBQUssNkJBQTZCLEVBQUUsWUFBWSxLQUFLLE9BQU8sQ0FBQztBQUMzRSx1QkFBYSxFQUFFLE9BQU8sbUJBQW1CLEtBQUssTUFBTSxtQkFBbUIseUJBQXlCLElBQUksQ0FBQztBQUNyRyxpQkFBTztBQUFBLFFBQ1Q7QUFFQSxjQUFNLFlBQVksUUFBUTtBQUUxQixnQkFBUSxRQUFRLEVBQ2IsS0FBSyxNQUFNLHNCQUFzQixNQUFNLFNBQVMsQ0FBQyxFQUNqRCxLQUFLLENBQUMsV0FBVztBQUNoQixnQkFBTSxPQUFPLFNBQVMsTUFBTTtBQUM1QixjQUFJLE9BQU87QUFDWCxjQUFJO0FBQ0YsbUJBQU8sS0FBSyxVQUFVLElBQUk7QUFBQSxVQUM1QixTQUFTLE1BQU07QUFDYixtQkFBTztBQUFBLFVBQ1Q7QUFDQSxjQUFJLEtBQU0sUUFBTyxTQUFTLE1BQU0sMkJBQTJCO0FBQzNELHdCQUFjLEtBQUssc0JBQXNCLEVBQUUsY0FBYyxNQUFNLFVBQVUsRUFBRSxDQUFDO0FBQzVFLHVCQUFhLEVBQUUsSUFBSSxNQUFNLFFBQVEsTUFBTSxLQUFLLENBQUM7QUFBQSxRQUMvQyxDQUFDLEVBQ0EsTUFBTSxDQUFDLFFBQVE7QUFDZCxnQkFBTSxVQUFVLE9BQU8sSUFBSSxVQUFVLE9BQU8sSUFBSSxPQUFPLElBQUksT0FBTyxPQUFPLGVBQWU7QUFDeEYsd0JBQWMsTUFBTSxxQkFBcUIsRUFBRSxPQUFPLFFBQVEsQ0FBQztBQUMzRCx1QkFBYSxFQUFFLE9BQU8sc0JBQXNCLE9BQU8sR0FBRyxDQUFDO0FBQUEsUUFDekQsQ0FBQztBQUVILGVBQU87QUFBQSxNQUNUO0FBRUEsVUFBSSxRQUFRLFNBQVMseUJBQXlCO0FBQzVDLHNCQUFjLEtBQUssaUNBQWlDO0FBR3BELFlBQUksT0FBTyxpQkFBaUI7QUFDMUIsaUJBQU8sZ0JBQWdCLGdCQUFnQixJQUFJO0FBQUEsUUFDN0M7QUFDQSxxQkFBYSxFQUFFLElBQUksS0FBSyxDQUFDO0FBQ3pCLGVBQU87QUFBQSxNQUNUO0FBR0EsVUFBSSxRQUFRLFNBQVMsMkJBQTJCO0FBQzlDLGNBQU0sVUFBVSxRQUFRLFdBQVc7QUFDbkMsY0FBTSxVQUFVLE9BQU8sUUFBUSxXQUFXLGFBQWEsRUFBRSxLQUFLLEVBQUUsWUFBWSxLQUFLO0FBQ2pGLHNCQUFjLEtBQUsscUNBQXFDLEVBQUUsU0FBUyxRQUFRLENBQUM7QUFFNUUsZ0JBQVEsUUFBUSxFQUNiLEtBQUssTUFBTSwrQkFBK0IsT0FBTyxDQUFDLEVBQ2xELEtBQUssQ0FBQyxXQUFXO0FBQ2hCLGNBQUksT0FBTyxNQUFNLE9BQU8sNkJBQTZCO0FBQ25ELG1CQUFPLDRCQUE0QixZQUFZLE9BQU87QUFBQSxVQUN4RDtBQUNBLHVCQUFhLEVBQUUsR0FBRyxRQUFRLFFBQVEsQ0FBQztBQUFBLFFBQ3JDLENBQUMsRUFDQSxNQUFNLENBQUMsUUFBUTtBQUNkLHdCQUFjLE1BQU0sa0NBQWtDLEVBQUUsT0FBTyxJQUFJLFFBQVEsQ0FBQztBQUM1RSx1QkFBYTtBQUFBLFlBQ1gsSUFBSTtBQUFBLFlBQ0osT0FBTyxJQUFJLFdBQVcsT0FBTyxPQUFPLHlCQUF5QjtBQUFBLFlBQzdEO0FBQUEsVUFDRixDQUFDO0FBQUEsUUFDSCxDQUFDO0FBRUgsZUFBTztBQUFBLE1BQ1Q7QUFFQSxVQUFJLFFBQVEsU0FBUyxpQkFBaUI7QUFDcEMsY0FBTSxVQUFVLFFBQVEsV0FBVztBQUNuQyxzQkFBYyxLQUFLLDJCQUEyQixFQUFFLFFBQVEsQ0FBQztBQUV6RCxZQUFJLENBQUMsT0FBTyxlQUFlLENBQUMsT0FBTyx1QkFBdUI7QUFDeEQsdUJBQWEsRUFBRSxPQUFPLDRCQUE0QixRQUFRLEtBQUssQ0FBQztBQUNoRSxpQkFBTztBQUFBLFFBQ1Q7QUFFQSxnQkFBUSxRQUFRLEVBQUUsS0FBSyxZQUFZO0FBQ2pDLGdCQUFNLFdBQVcsTUFBTSxzQkFBc0IsT0FBTztBQUNwRCxjQUFJLENBQUMsVUFBVSxVQUFVLENBQUMsVUFBVSxZQUFZO0FBQzlDLHlCQUFhO0FBQUEsY0FDWCxRQUFRO0FBQUEsY0FDUixZQUFZO0FBQUEsY0FDWixZQUFZO0FBQUEsY0FDWixVQUFVO0FBQUEsWUFDWixDQUFDO0FBQ0Q7QUFBQSxVQUNGO0FBQ0EsdUJBQWE7QUFBQSxZQUNYLFFBQVEsU0FBUztBQUFBLFlBQ2pCLFlBQVksU0FBUztBQUFBLFlBQ3JCLFlBQVk7QUFBQSxZQUNaLFlBQVksQ0FBQyxDQUFDLFNBQVM7QUFBQSxZQUN2QixrQkFBa0IsQ0FBQyxDQUFDLFNBQVM7QUFBQSxZQUM3QixjQUFjLFNBQVM7QUFBQSxZQUN2QixVQUFVO0FBQUEsVUFDWixDQUFDO0FBQUEsUUFDSCxDQUFDLEVBQUUsTUFBTSxDQUFDLFFBQVE7QUFDaEIsdUJBQWE7QUFBQSxZQUNYLE9BQU8sS0FBSyxXQUFXLE9BQU8sT0FBTyxzQkFBc0I7QUFBQSxZQUMzRCxRQUFRO0FBQUEsWUFDUixZQUFZO0FBQUEsWUFDWixZQUFZO0FBQUEsWUFDWixVQUFVO0FBQUEsVUFDWixDQUFDO0FBQUEsUUFDSCxDQUFDO0FBQ0QsZUFBTztBQUFBLE1BQ1Q7QUFNQSxVQUFJLFFBQVEsU0FBUyxxQkFBcUI7QUFDeEMsY0FBTSxjQUFjLFFBQVEsZUFBZTtBQUMzQyxzQkFBYyxLQUFLLCtCQUErQixFQUFFLFlBQVksQ0FBQztBQUVqRSxZQUFJLENBQUMsV0FBVztBQUNkLHVCQUFhLEVBQUUsSUFBSSxPQUFPLE9BQU8sNkJBQTZCLENBQUM7QUFDL0QsaUJBQU87QUFBQSxRQUNUO0FBRUEsZ0JBQVEsUUFBUSxFQUFFLEtBQUssWUFBWTtBQUNqQyxnQkFBTSxVQUFVLE1BQU0sVUFBVSxnQkFBZ0IsV0FBVztBQUMzRCxjQUFJLENBQUMsU0FBUztBQUNaLHlCQUFhLEVBQUUsSUFBSSxPQUFPLE9BQU8sOEJBQThCLENBQUM7QUFDaEU7QUFBQSxVQUNGO0FBR0EsZ0JBQU0sYUFBYSxDQUFDO0FBQ3BCLGdCQUFNLFNBQVMsU0FBUyxpQkFBaUIsbURBQW1EO0FBQzVGLHFCQUFXLFNBQVMsUUFBUTtBQUMxQixnQkFBSSxDQUFDLGNBQWMsS0FBSyxFQUFHO0FBQzNCLHVCQUFXLEtBQUs7QUFBQSxjQUNkLFVBQVUsTUFBTSxLQUFLLElBQUksSUFBSSxPQUFPLE1BQU0sRUFBRSxDQUFDLEtBQU0sTUFBTSxPQUFPLFVBQVUsSUFBSSxPQUFPLE1BQU0sSUFBSSxDQUFDLE9BQU87QUFBQSxjQUN2RyxNQUFNLE1BQU0sUUFBUTtBQUFBLGNBQ3BCLElBQUksTUFBTSxNQUFNO0FBQUEsY0FDaEIsYUFBYSxNQUFNLGVBQWU7QUFBQSxjQUNsQyxjQUFjLE1BQU0sZ0JBQWdCO0FBQUEsY0FDcEMsT0FBTyxjQUFjLEtBQUs7QUFBQSxZQUM1QixDQUFDO0FBQUEsVUFDSDtBQUVBLGdCQUFNLFVBQVUsVUFBVSxxQkFBcUIsWUFBWSxPQUFPO0FBQ2xFLGdCQUFNLFVBQVUsRUFBRSxRQUFRLEdBQUcsU0FBUyxHQUFHLFFBQVEsRUFBRTtBQUVuRCxxQkFBVyxDQUFDLFVBQVUsS0FBSyxLQUFLLFNBQVM7QUFDdkMsZ0JBQUksQ0FBQyxTQUFVO0FBQ2YsZ0JBQUk7QUFDRixvQkFBTSxVQUFVLFNBQVMsY0FBYyxRQUFRO0FBQy9DLGtCQUFJLENBQUMsU0FBUztBQUNaLHdCQUFRLFVBQVU7QUFDbEI7QUFBQSxjQUNGO0FBR0Esc0JBQVEsTUFBTTtBQUNkLGtCQUFJLFFBQVEsWUFBWSxXQUFXLFFBQVEsWUFBWSxZQUFZO0FBQ2pFLCtCQUFlLFNBQVMsS0FBSztBQUM3QixvQ0FBb0IsT0FBTztBQUFBLGNBQzdCLFdBQVcsUUFBUSxtQkFBbUI7QUFDcEMsd0JBQVEsY0FBYztBQUN0QixvQ0FBb0IsT0FBTztBQUFBLGNBQzdCO0FBQ0Esc0JBQVEsVUFBVTtBQUFBLFlBQ3BCLFNBQVMsS0FBSztBQUNaLHNCQUFRLFVBQVU7QUFDbEIsNEJBQWMsS0FBSyxxQkFBcUIsRUFBRSxVQUFVLE9BQU8sSUFBSSxRQUFRLENBQUM7QUFBQSxZQUMxRTtBQUFBLFVBQ0Y7QUFFQSx3QkFBYyxLQUFLLCtCQUErQixPQUFPO0FBQ3pELHVCQUFhLEVBQUUsSUFBSSxNQUFNLFFBQVEsQ0FBQztBQUFBLFFBQ3BDLENBQUMsRUFBRSxNQUFNLENBQUMsUUFBUTtBQUNoQix3QkFBYyxNQUFNLDRCQUE0QixFQUFFLE9BQU8sSUFBSSxRQUFRLENBQUM7QUFDdEUsdUJBQWEsRUFBRSxJQUFJLE9BQU8sT0FBTyxJQUFJLFFBQVEsQ0FBQztBQUFBLFFBQ2hELENBQUM7QUFDRCxlQUFPO0FBQUEsTUFDVDtBQUVBLFVBQUksUUFBUSxTQUFTLG1CQUFtQjtBQUN0QyxzQkFBYyxLQUFLLDJCQUEyQjtBQUU5QyxZQUFJLENBQUMsaUJBQWlCO0FBQ3BCLHVCQUFhLEVBQUUsSUFBSSxPQUFPLE9BQU8sbUNBQW1DLENBQUM7QUFDckUsaUJBQU87QUFBQSxRQUNUO0FBRUEsZ0JBQVEsUUFBUSxFQUFFLEtBQUssWUFBWTtBQUNqQyxnQkFBTSxRQUFRLGdCQUFnQixpQkFBaUI7QUFDL0MsZ0JBQU0sZ0JBQWdCLGNBQWMsS0FBSztBQUN6Qyx3QkFBYyxLQUFLLDZCQUE2QixFQUFFLGFBQWEsTUFBTSxPQUFPLE9BQU8sQ0FBQztBQUNwRix1QkFBYSxFQUFFLElBQUksTUFBTSxhQUFhLE1BQU0sT0FBTyxPQUFPLENBQUM7QUFBQSxRQUM3RCxDQUFDLEVBQUUsTUFBTSxDQUFDLFFBQVE7QUFDaEIsd0JBQWMsTUFBTSwwQkFBMEIsRUFBRSxPQUFPLElBQUksUUFBUSxDQUFDO0FBQ3BFLHVCQUFhLEVBQUUsSUFBSSxPQUFPLE9BQU8sSUFBSSxRQUFRLENBQUM7QUFBQSxRQUNoRCxDQUFDO0FBQ0QsZUFBTztBQUFBLE1BQ1Q7QUFFQSxVQUFJLFFBQVEsU0FBUyxzQkFBc0I7QUFDekMsc0JBQWMsS0FBSyw4QkFBOEI7QUFFakQsWUFBSSxDQUFDLGlCQUFpQjtBQUNwQix1QkFBYSxFQUFFLElBQUksT0FBTyxPQUFPLG1DQUFtQyxDQUFDO0FBQ3JFLGlCQUFPO0FBQUEsUUFDVDtBQUVBLGdCQUFRLFFBQVEsRUFBRSxLQUFLLFlBQVk7QUFDakMsZ0JBQU0sYUFBYSxNQUFNLGdCQUFnQixrQkFBa0I7QUFDM0QsY0FBSSxDQUFDLFlBQVk7QUFDZix5QkFBYSxFQUFFLElBQUksT0FBTyxPQUFPLG9DQUFvQyxDQUFDO0FBQ3RFO0FBQUEsVUFDRjtBQUVBLGdCQUFNLFVBQVUsTUFBTSxnQkFBZ0IsaUJBQWlCLFlBQVksaUJBQWlCO0FBQ3BGLHdCQUFjLEtBQUssZ0NBQWdDLE9BQU87QUFDMUQsdUJBQWEsRUFBRSxJQUFJLE1BQU0sUUFBUSxDQUFDO0FBQUEsUUFDcEMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxRQUFRO0FBQ2hCLHdCQUFjLE1BQU0sNkJBQTZCLEVBQUUsT0FBTyxJQUFJLFFBQVEsQ0FBQztBQUN2RSx1QkFBYSxFQUFFLElBQUksT0FBTyxPQUFPLElBQUksUUFBUSxDQUFDO0FBQUEsUUFDaEQsQ0FBQztBQUNELGVBQU87QUFBQSxNQUNUO0FBRUEsVUFBSSxRQUFRLFNBQVMsMEJBQTBCO0FBQzdDLHNCQUFjLEtBQUssa0NBQWtDO0FBRXJELFlBQUksQ0FBQyxtQkFBbUI7QUFDdEIsdUJBQWEsRUFBRSxJQUFJLE9BQU8sT0FBTyxzQ0FBc0MsQ0FBQztBQUN4RSxpQkFBTztBQUFBLFFBQ1Q7QUFFQSxjQUFNLFFBQVEsa0JBQWtCLFNBQVM7QUFDekMscUJBQWEsRUFBRSxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBQ2hDLGVBQU87QUFBQSxNQUNUO0FBRUEsVUFBSSxRQUFRLFNBQVMsb0JBQW9CO0FBQ3ZDLHNCQUFjLEtBQUssNEJBQTRCO0FBRS9DLFlBQUksQ0FBQyxrQkFBa0I7QUFDckIsdUJBQWEsRUFBRSxJQUFJLE9BQU8sT0FBTyxvQ0FBb0MsQ0FBQztBQUN0RSxpQkFBTztBQUFBLFFBQ1Q7QUFFQSxjQUFNLFVBQVUsaUJBQWlCLG1CQUFtQjtBQUNwRCxxQkFBYSxFQUFFLElBQUksTUFBTSxRQUFRLENBQUM7QUFDbEMsZUFBTztBQUFBLE1BQ1Q7QUFFQSxtQkFBYSxFQUFFLE9BQU8seUJBQXlCLE9BQU8sUUFBUSxRQUFRLEVBQUUsQ0FBQyxHQUFHLENBQUM7QUFDN0UsYUFBTztBQUFBLElBQ1QsU0FBUyxLQUFLO0FBQ1osWUFBTSxVQUFVLE9BQU8sSUFBSSxVQUFVLE9BQU8sSUFBSSxPQUFPLElBQUksT0FBTyxPQUFPLGVBQWU7QUFDeEYsbUJBQWEsRUFBRSxPQUFPLHlCQUF5QixPQUFPLEdBQUcsQ0FBQztBQUMxRCxhQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0YsQ0FBQztBQUNILEdBQUc7IiwKICAibmFtZXMiOiBbImVsZW1lbnQiXQp9Cg==
