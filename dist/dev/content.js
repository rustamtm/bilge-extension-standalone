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
    const tryParse = /* @__PURE__ */ __name((candidate) => {
      const parsed = window.BilgeCortex.parseCommand(candidate);
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
      const activeEl = document.activeElement;
      if (activeEl && activeEl !== document.body) {
        activeEl.click();
        return { status: "clicked", target: "active-element", tag: activeEl.tagName };
      }
      throw new Error("No element in context for deictic click reference");
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL2xpYi9lbnYuanMiLCAiLi4vLi4vc3JjL2xpYi9sb2dnZXIuanMiLCAiLi4vLi4vc3JjL2NvbnRlbnQuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qKlxuICogUnVudGltZSBlbnZpcm9ubWVudCB1dGlsaXRpZXNcbiAqIEZhbGxzIGJhY2sgdG8gZGVmYXVsdHMgaWYgX19CSUxHRV9FTlZfXyBub3QgaW5qZWN0ZWRcbiAqL1xuZnVuY3Rpb24gZ2V0SW5qZWN0ZWRFbnYoKSB7XG4gIHRyeSB7XG4gICAgY29uc3QgZyA9IHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyA/IGdsb2JhbFRoaXMgOiBudWxsO1xuICAgIGlmIChnICYmIGcuX19CSUxHRV9FTlZfXyAmJiB0eXBlb2YgZy5fX0JJTEdFX0VOVl9fID09PSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuIGcuX19CSUxHRV9FTlZfXztcbiAgICB9XG4gIH0gY2F0Y2gge31cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGdldEVudkZyb21CdWlsZERlZmluZXMoKSB7XG4gIC8vIFRoZXNlIGlkZW50aWZpZXJzIGFyZSByZXBsYWNlZCBhdCBidWlsZCB0aW1lIGJ5IGVzYnVpbGQgYGRlZmluZWAgaW4gYGJ1aWxkLm1qc2AuXG4gIGNvbnN0IGhhc0RlZmluZXMgPVxuICAgIHR5cGVvZiBfX0JJTEdFX0VOVl9fICE9PSAndW5kZWZpbmVkJyB8fFxuICAgIHR5cGVvZiBfX01DUF9CQVNFX1VSTF9fICE9PSAndW5kZWZpbmVkJyB8fFxuICAgIHR5cGVvZiBfX0VOQUJMRV9IT1RfUkVMT0FEX18gIT09ICd1bmRlZmluZWQnIHx8XG4gICAgdHlwZW9mIF9fVkVSU0lPTl9fICE9PSAndW5kZWZpbmVkJztcblxuICBpZiAoIWhhc0RlZmluZXMpIHJldHVybiBudWxsO1xuXG4gIC8vIE1PREUgaXMgdXNlZCBmb3IgbG9nZ2VyIGxldmVscyBhbmQgZmVhdHVyZSBnYXRpbmcuXG4gIC8vIEFjY2VwdCBib3RoIG1vZGVybiAoYGRldmVsb3BtZW50YC9gcHJvZHVjdGlvbmApIGFuZCBzaG9ydCAoYGRldmAvYHByb2RgKSBzcGVsbGluZ3MuXG4gIGNvbnN0IGluZmVycmVkTW9kZSA9XG4gICAgdHlwZW9mIF9fQklMR0VfRU5WX18gIT09ICd1bmRlZmluZWQnXG4gICAgICA/IF9fQklMR0VfRU5WX19cbiAgICAgIDogdHlwZW9mIF9fQlVJTERfTU9ERV9fICE9PSAndW5kZWZpbmVkJyAmJiBfX0JVSUxEX01PREVfXyA9PT0gJ3Byb2QnXG4gICAgICAgID8gJ3Byb2R1Y3Rpb24nXG4gICAgICAgIDogJ2RldmVsb3BtZW50JztcblxuICByZXR1cm4ge1xuICAgIE1PREU6IGluZmVycmVkTW9kZSxcbiAgICBERUJVRzogdHlwZW9mIF9fQklMR0VfREVCVUdfXyAhPT0gJ3VuZGVmaW5lZCcgPyBfX0JJTEdFX0RFQlVHX18gOiB0cnVlLFxuICAgIFZFUlNJT046IHR5cGVvZiBfX1ZFUlNJT05fXyAhPT0gJ3VuZGVmaW5lZCcgPyBfX1ZFUlNJT05fXyA6ICdkZXYnLFxuICAgIE1DUF9CQVNFX1VSTDogdHlwZW9mIF9fTUNQX0JBU0VfVVJMX18gIT09ICd1bmRlZmluZWQnID8gX19NQ1BfQkFTRV9VUkxfXyA6ICdodHRwOi8vbG9jYWxob3N0Ojg3ODcnLFxuICAgIE1DUF9XU19VUkw6IHR5cGVvZiBfX01DUF9XU19VUkxfXyAhPT0gJ3VuZGVmaW5lZCcgPyBfX01DUF9XU19VUkxfXyA6ICd3czovL2xvY2FsaG9zdDo4Nzg3L3dzJyxcbiAgICBERUZBVUxUX0JSQUlOX1BST1ZJREVSOlxuICAgICAgdHlwZW9mIF9fREVGQVVMVF9CUkFJTl9QUk9WSURFUl9fICE9PSAndW5kZWZpbmVkJyA/IF9fREVGQVVMVF9CUkFJTl9QUk9WSURFUl9fIDogJ2RlZXBzZWVrJyxcbiAgICBERUZBVUxUX0JSQUlOX01PREVMOiB0eXBlb2YgX19ERUZBVUxUX0JSQUlOX01PREVMX18gIT09ICd1bmRlZmluZWQnID8gX19ERUZBVUxUX0JSQUlOX01PREVMX18gOiAnZGVlcHNlZWstY2hhdCcsXG4gICAgRkVBVFVSRVM6IHtcbiAgICAgIERFVl9UT09MUzogdHlwZW9mIF9fRU5BQkxFX0RFVl9UT09MU19fICE9PSAndW5kZWZpbmVkJyA/IF9fRU5BQkxFX0RFVl9UT09MU19fIDogdHJ1ZSxcbiAgICAgIENPTlNPTEVfTE9HR0lORzogdHlwZW9mIF9fRU5BQkxFX0NPTlNPTEVfTE9HR0lOR19fICE9PSAndW5kZWZpbmVkJyA/IF9fRU5BQkxFX0NPTlNPTEVfTE9HR0lOR19fIDogdHJ1ZSxcbiAgICAgIFBFUkZPUk1BTkNFX01FVFJJQ1M6XG4gICAgICAgIHR5cGVvZiBfX0VOQUJMRV9QRVJGT1JNQU5DRV9NRVRSSUNTX18gIT09ICd1bmRlZmluZWQnID8gX19FTkFCTEVfUEVSRk9STUFOQ0VfTUVUUklDU19fIDogdHJ1ZSxcbiAgICAgIEhPVF9SRUxPQUQ6IHR5cGVvZiBfX0VOQUJMRV9IT1RfUkVMT0FEX18gIT09ICd1bmRlZmluZWQnID8gX19FTkFCTEVfSE9UX1JFTE9BRF9fIDogZmFsc2VcbiAgICB9LFxuICAgIFRFTEVNRVRSWToge1xuICAgICAgRU5BQkxFRDogdHlwZW9mIF9fVEVMRU1FVFJZX0VOQUJMRURfXyAhPT0gJ3VuZGVmaW5lZCcgPyBfX1RFTEVNRVRSWV9FTkFCTEVEX18gOiBmYWxzZSxcbiAgICAgIEVORFBPSU5UOiB0eXBlb2YgX19URUxFTUVUUllfRU5EUE9JTlRfXyAhPT0gJ3VuZGVmaW5lZCcgPyBfX1RFTEVNRVRSWV9FTkRQT0lOVF9fIDogJydcbiAgICB9XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRFbnYoKSB7XG4gIGNvbnN0IGluamVjdGVkID0gZ2V0SW5qZWN0ZWRFbnYoKTtcbiAgaWYgKGluamVjdGVkKSByZXR1cm4gaW5qZWN0ZWQ7XG5cbiAgY29uc3QgZnJvbURlZmluZXMgPSBnZXRFbnZGcm9tQnVpbGREZWZpbmVzKCk7XG4gIGlmIChmcm9tRGVmaW5lcykgcmV0dXJuIGZyb21EZWZpbmVzO1xuXG4gIC8vIEZhbGxiYWNrIGZvciBkaXJlY3QgbG9hZGluZ1xuICByZXR1cm4ge1xuICAgIE1PREU6ICdkZXZlbG9wbWVudCcsXG4gICAgREVCVUc6IHRydWUsXG4gICAgVkVSU0lPTjogJ2RldicsXG4gICAgTUNQX0JBU0VfVVJMOiAnaHR0cDovL2xvY2FsaG9zdDo4Nzg3JyxcbiAgICBNQ1BfV1NfVVJMOiAnd3M6Ly9sb2NhbGhvc3Q6ODc4Ny93cycsXG4gICAgREVGQVVMVF9CUkFJTl9QUk9WSURFUjogJ2RlZXBzZWVrJyxcbiAgICBERUZBVUxUX0JSQUlOX01PREVMOiAnZGVlcHNlZWstY2hhdCcsXG4gICAgRkVBVFVSRVM6IHsgREVWX1RPT0xTOiB0cnVlLCBDT05TT0xFX0xPR0dJTkc6IHRydWUsIFBFUkZPUk1BTkNFX01FVFJJQ1M6IHRydWUsIEhPVF9SRUxPQUQ6IHRydWUgfSxcbiAgICBURUxFTUVUUlk6IHsgRU5BQkxFRDogZmFsc2UsIEVORFBPSU5UOiAnJyB9XG4gIH07XG59XG5cbmV4cG9ydCBjb25zdCBFTlYgPSBnZXRFbnYoKTtcbmV4cG9ydCBjb25zdCBpc0RldiA9ICgpID0+IEVOVi5NT0RFID09PSAnZGV2ZWxvcG1lbnQnIHx8IEVOVi5NT0RFID09PSAnZGV2JztcbmV4cG9ydCBjb25zdCBpc1Byb2QgPSAoKSA9PiBFTlYuTU9ERSA9PT0gJ3Byb2R1Y3Rpb24nIHx8IEVOVi5NT0RFID09PSAncHJvZCc7XG5leHBvcnQgY29uc3QgaXNEZWJ1ZyA9ICgpID0+IEVOVi5ERUJVRyA9PT0gdHJ1ZTtcbiIsICJpbXBvcnQgeyBFTlYsIGlzRGV2IH0gZnJvbSAnLi9lbnYuanMnO1xuXG5jb25zdCBMT0dfTEVWRUxTID0geyBERUJVRzogMCwgSU5GTzogMSwgV0FSTjogMiwgRVJST1I6IDMsIE5PTkU6IDQgfTtcbmNvbnN0IGN1cnJlbnRMZXZlbCA9IGlzRGV2KCkgPyBMT0dfTEVWRUxTLkRFQlVHIDogTE9HX0xFVkVMUy5XQVJOO1xuXG5mdW5jdGlvbiBzaG91bGRMb2cobGV2ZWwpIHtcbiAgaWYgKCFFTlYuRkVBVFVSRVMuQ09OU09MRV9MT0dHSU5HKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiBsZXZlbCA+PSBjdXJyZW50TGV2ZWw7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdE1lc3NhZ2UobGV2ZWwsIG1vZHVsZSwgbWVzc2FnZSkge1xuICBjb25zdCB0aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc3BsaXQoJ1QnKVsxXS5zbGljZSgwLCAtMSk7XG4gIHJldHVybiBgWyR7dGltZXN0YW1wfV0gWyR7bGV2ZWx9XSBbJHttb2R1bGV9XSAke21lc3NhZ2V9YDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxvZ2dlcihtb2R1bGUpIHtcbiAgcmV0dXJuIHtcbiAgICBkZWJ1ZyhtZXNzYWdlLCBkYXRhKSB7XG4gICAgICBpZiAoc2hvdWxkTG9nKExPR19MRVZFTFMuREVCVUcpKSB7XG4gICAgICAgIGNvbnNvbGUuZGVidWcoZm9ybWF0TWVzc2FnZSgnREVCVUcnLCBtb2R1bGUsIG1lc3NhZ2UpLCBkYXRhID8/ICcnKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIGluZm8obWVzc2FnZSwgZGF0YSkge1xuICAgICAgaWYgKHNob3VsZExvZyhMT0dfTEVWRUxTLklORk8pKSB7XG4gICAgICAgIGNvbnNvbGUuaW5mbyhmb3JtYXRNZXNzYWdlKCdJTkZPJywgbW9kdWxlLCBtZXNzYWdlKSwgZGF0YSA/PyAnJyk7XG4gICAgICB9XG4gICAgfSxcbiAgICB3YXJuKG1lc3NhZ2UsIGRhdGEpIHtcbiAgICAgIGlmIChzaG91bGRMb2coTE9HX0xFVkVMUy5XQVJOKSkge1xuICAgICAgICBjb25zb2xlLndhcm4oZm9ybWF0TWVzc2FnZSgnV0FSTicsIG1vZHVsZSwgbWVzc2FnZSksIGRhdGEgPz8gJycpO1xuICAgICAgfVxuICAgIH0sXG4gICAgZXJyb3IobWVzc2FnZSwgZGF0YSkge1xuICAgICAgaWYgKHNob3VsZExvZyhMT0dfTEVWRUxTLkVSUk9SKSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKGZvcm1hdE1lc3NhZ2UoJ0VSUk9SJywgbW9kdWxlLCBtZXNzYWdlKSwgZGF0YSA/PyAnJyk7XG4gICAgICB9XG4gICAgfSxcbiAgICB0aW1lKGxhYmVsKSB7XG4gICAgICBpZiAoRU5WLkZFQVRVUkVTLlBFUkZPUk1BTkNFX01FVFJJQ1MpIHtcbiAgICAgICAgY29uc29sZS50aW1lKGBbJHttb2R1bGV9XSAke2xhYmVsfWApO1xuICAgICAgfVxuICAgIH0sXG4gICAgdGltZUVuZChsYWJlbCkge1xuICAgICAgaWYgKEVOVi5GRUFUVVJFUy5QRVJGT1JNQU5DRV9NRVRSSUNTKSB7XG4gICAgICAgIGNvbnNvbGUudGltZUVuZChgWyR7bW9kdWxlfV0gJHtsYWJlbH1gKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG59XG5cbmV4cG9ydCBjb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ0JpbGdlJyk7XG4iLCAiLy8gQmlsZ2UgQUkgQ29udGVudCBTY3JpcHRcbmltcG9ydCB7IEVOViwgaXNEZXYgfSBmcm9tICcuL2xpYi9lbnYuanMnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi9saWIvbG9nZ2VyLmpzJztcblxuKCgpID0+IHtcbiAgaWYgKHdpbmRvdy5fX2JpbGdlQ29udGVudFNjcmlwdE1vdW50ZWQpIHJldHVybjtcbiAgd2luZG93Ll9fYmlsZ2VDb250ZW50U2NyaXB0TW91bnRlZCA9IHRydWU7XG5cbiAgY29uc3QgY29udGVudExvZ2dlciA9IGNyZWF0ZUxvZ2dlcignQ29udGVudFNjcmlwdCcpO1xuICBjb250ZW50TG9nZ2VyLmluZm8oJ0NvbnRlbnQgc2NyaXB0IG1vdW50ZWQnKTtcblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBTZWxmLUhlYWxpbmcgTW9kdWxlIEludGVncmF0aW9uXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIE5vdGU6IE1vZHVsZXMgYXJlIGxvYWRlZCB2aWEgbWFuaWZlc3QuanNvbiBjb250ZW50X3NjcmlwdHMgYmVmb3JlIGNvbnRlbnQuanNcbiAgLy8gR2xvYmFsIHJlZmVyZW5jZXMgZm9yIHNlbGYtaGVhbGluZyBlbmdpbmUgaW50ZWdyYXRpb25cbiAgY29uc3Qgc2VsZkhlYWxpbmdFbmdpbmUgPSB3aW5kb3cuX19iaWxnZV9zZWxmSGVhbGluZ0VuZ2luZSB8fCBudWxsO1xuICBjb25zdCBmaWVsZFJlc29sdmVyID0gd2luZG93Ll9fYmlsZ2VfZmllbGRSZXNvbHZlciB8fCBudWxsO1xuICBjb25zdCBjb250ZXh0SW5mZXJlbmNlID0gd2luZG93Ll9fYmlsZ2VfY29udGV4dEluZmVyZW5jZSB8fCBudWxsO1xuICBjb25zdCBtY3BCcmlkZ2UgPSB3aW5kb3cuX19iaWxnZV9tY3BEYXRhQnJpZGdlIHx8IG51bGw7XG4gIGNvbnN0IGZvcm1QZXJzaXN0ZW5jZSA9IHdpbmRvdy5fX2JpbGdlX2Zvcm1TdGF0ZVBlcnNpc3RlbmNlIHx8IG51bGw7XG5cbiAgLy8gU2V0dXAgYXV0by1zYXZlL3Jlc3RvcmUgaWYgcGVyc2lzdGVuY2UgbW9kdWxlIGlzIGF2YWlsYWJsZVxuICBpZiAoZm9ybVBlcnNpc3RlbmNlKSB7XG4gICAgZm9ybVBlcnNpc3RlbmNlLnNldHVwQXV0b1NhdmUoKTtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xuICAgICAgZm9ybVBlcnNpc3RlbmNlLnNldHVwQXV0b1Jlc3RvcmUoKS5jYXRjaCgoZXJyKSA9PiB7XG4gICAgICAgIGNvbnRlbnRMb2dnZXIud2FybignQXV0by1yZXN0b3JlIGZhaWxlZCcsIHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyAtLS0gRVNDQVBFIFRPIENBTkNFTCAtLS1cbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4ge1xuICAgIGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIHtcbiAgICAgIGlmICh3aW5kb3cuX19iaWxnZV9ydW50aW1lKSB7XG4gICAgICAgIHdpbmRvdy5fX2JpbGdlX3J1bnRpbWUudXBkYXRlSGlnaGxpZ2h0KG51bGwpO1xuICAgICAgfVxuICAgIH1cbiAgfSwgeyBwYXNzaXZlOiB0cnVlIH0pO1xuXG4gIGNvbnN0IE1BWF9QQUdFX1RFWFRfQ0hBUlMgPSA1MDAwO1xuICBjb25zdCBNQVhfSFRNTF9DSEFSUyA9IDUwMDAwO1xuICBjb25zdCBNQVhfU0hBRE9XX0hUTUxfQ0hBUlMgPSA1MDAwMDtcbiAgY29uc3QgTUFYX1NIQURPV19ST09UUyA9IDgwO1xuICBjb25zdCBNQVhfRVhFQ1VURV9KU19DT0RFX0NIQVJTID0gMjAwMDA7XG4gIGNvbnN0IE1BWF9FWEVDVVRFX0pTX1JFU1VMVF9DSEFSUyA9IDUwMDAwO1xuICBjb25zdCBERUZBVUxUX0VYRUNVVEVfSlNfVElNRU9VVF9NUyA9IDUwMDA7XG4gIGNvbnN0IERPTV9TS0lMTF9NRU1PUllfS0VZID0gJ19fYmlsZ2VfZG9tX3NraWxsX21lbW9yeV92MSc7XG4gIGNvbnN0IERPTV9TS0lMTF9NRU1PUllfTUFYID0gMzAwO1xuICBjb25zdCBET01fU0tJTExfTUVNT1JZX1RUTF9NUyA9IDQ1ICogMjQgKiA2MCAqIDYwICogMTAwMDtcbiAgY29uc3QgTkFUVVJBTF9DT01NQU5EX01FTU9SWV9LRVkgPSAnX19iaWxnZV9uYXR1cmFsX2NvbW1hbmRfbWVtb3J5X3YxJztcbiAgY29uc3QgTkFUVVJBTF9DT01NQU5EX01FTU9SWV9NQVggPSAzMDA7XG4gIGNvbnN0IE5BVFVSQUxfQ09NTUFORF9NRU1PUllfVFRMX01TID0gNjAgKiAyNCAqIDYwICogNjAgKiAxMDAwO1xuICBsZXQgZG9tU2tpbGxNZW1vcnlDYWNoZSA9IG51bGw7XG4gIGxldCBkb21Ta2lsbE1lbW9yeUxvYWRQcm9taXNlID0gbnVsbDtcbiAgbGV0IG5hdHVyYWxDb21tYW5kTWVtb3J5Q2FjaGUgPSBudWxsO1xuICBsZXQgbmF0dXJhbENvbW1hbmRNZW1vcnlMb2FkUHJvbWlzZSA9IG51bGw7XG5cbiAgZnVuY3Rpb24gdHJ1bmNhdGUodGV4dCwgbWF4Q2hhcnMpIHtcbiAgICBjb25zdCBzdHIgPSBTdHJpbmcodGV4dCB8fCAnJyk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobWF4Q2hhcnMpIHx8IG1heENoYXJzIDw9IDApIHJldHVybiAnJztcbiAgICByZXR1cm4gc3RyLmxlbmd0aCA+IG1heENoYXJzID8gYCR7c3RyLnNsaWNlKDAsIG1heENoYXJzKX0uLi4gKHRydW5jYXRlZClgIDogc3RyO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVzY3JpYmVSZXN0cmljdGVkU2VsZWN0b3JFcnJvcihzZWxlY3RvciwgZXJyKSB7XG4gICAgY29uc3QgbWVzc2FnZSA9IGVyciAmJiBlcnIubWVzc2FnZSA/IFN0cmluZyhlcnIubWVzc2FnZSkgOiBTdHJpbmcoZXJyIHx8ICcnKTtcbiAgICByZXR1cm4geyBlcnJvcjogYEludmFsaWQgc2VsZWN0b3IgXCIke3NlbGVjdG9yfVwiOiAke21lc3NhZ2UgfHwgJ1Vua25vd24gZXJyb3InfWAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHF1ZXJ5U2VsZWN0b3JEZWVwKHNlbGVjdG9yLCByb290ID0gZG9jdW1lbnQpIHtcbiAgICBjb25zdCBwZW5kaW5nUm9vdHMgPSBbcm9vdF07XG4gICAgY29uc3Qgc2VlblJvb3RzID0gbmV3IFNldCgpO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwZW5kaW5nUm9vdHMubGVuZ3RoICYmIHBlbmRpbmdSb290cy5sZW5ndGggPD0gTUFYX1NIQURPV19ST09UUzsgaSsrKSB7XG4gICAgICBjb25zdCBjdXJyZW50Um9vdCA9IHBlbmRpbmdSb290c1tpXTtcbiAgICAgIGlmICghY3VycmVudFJvb3QgfHwgc2VlblJvb3RzLmhhcyhjdXJyZW50Um9vdCkpIGNvbnRpbnVlO1xuICAgICAgc2VlblJvb3RzLmFkZChjdXJyZW50Um9vdCk7XG5cbiAgICAgIGNvbnN0IGZvdW5kID0gY3VycmVudFJvb3QucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgICBpZiAoZm91bmQpIHJldHVybiBmb3VuZDtcblxuICAgICAgY29uc3Qgd2Fsa2VyID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihjdXJyZW50Um9vdCwgTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQpO1xuICAgICAgZm9yIChsZXQgbm9kZSA9IHdhbGtlci5jdXJyZW50Tm9kZTsgbm9kZTsgbm9kZSA9IHdhbGtlci5uZXh0Tm9kZSgpKSB7XG4gICAgICAgIGlmIChub2RlLnNoYWRvd1Jvb3QpIHBlbmRpbmdSb290cy5wdXNoKG5vZGUuc2hhZG93Um9vdCk7XG4gICAgICAgIGNvbnN0IHRhZyA9IFN0cmluZyhub2RlPy50YWdOYW1lIHx8ICcnKS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICBjb25zdCBpc0ZyYW1lID0gdGFnID09PSAnSUZSQU1FJyB8fCB0YWcgPT09ICdGUkFNRSc7XG4gICAgICAgIGlmIChpc0ZyYW1lKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmIChub2RlLmNvbnRlbnREb2N1bWVudCkgcGVuZGluZ1Jvb3RzLnB1c2gobm9kZS5jb250ZW50RG9jdW1lbnQpO1xuICAgICAgICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgICAgICAgIC8vIENyb3NzLW9yaWdpbiBmcmFtZTsgaWdub3JlLlxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAocGVuZGluZ1Jvb3RzLmxlbmd0aCA+IE1BWF9TSEFET1dfUk9PVFMpIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0TmF0aXZlVmFsdWUoZWxlbWVudCwgdmFsdWUpIHtcbiAgICBjb25zdCBuZXh0VmFsdWUgPSBTdHJpbmcodmFsdWUgPz8gJycpO1xuICAgIGNvbnN0IHRhZyA9IFN0cmluZyhlbGVtZW50Py50YWdOYW1lIHx8ICcnKS50b1VwcGVyQ2FzZSgpO1xuICAgIGNvbnN0IHZpZXcgPSBlbGVtZW50Py5vd25lckRvY3VtZW50Py5kZWZhdWx0VmlldyB8fCBudWxsO1xuXG4gICAgLy8gQ3Jvc3MtcmVhbG0gc2FmZTogaWYgdGhlIG5vZGUgY29tZXMgZnJvbSBhbiBpZnJhbWUsIHVzZSB0aGF0IGlmcmFtZSdzIHByb3RvdHlwZXMuXG4gICAgY29uc3QgcHJvdG8gPSB0YWcgPT09ICdJTlBVVCdcbiAgICAgID8gdmlldz8uSFRNTElucHV0RWxlbWVudD8ucHJvdG90eXBlXG4gICAgICA6IHRhZyA9PT0gJ1RFWFRBUkVBJ1xuICAgICAgICA/IHZpZXc/LkhUTUxUZXh0QXJlYUVsZW1lbnQ/LnByb3RvdHlwZVxuICAgICAgICA6IG51bGw7XG5cbiAgICBjb25zdCBkZXNjcmlwdG9yID0gcHJvdG8gPyBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHByb3RvLCAndmFsdWUnKSA6IG51bGw7XG4gICAgaWYgKGRlc2NyaXB0b3IgJiYgdHlwZW9mIGRlc2NyaXB0b3Iuc2V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBkZXNjcmlwdG9yLnNldC5jYWxsKGVsZW1lbnQsIG5leHRWYWx1ZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZWxlbWVudC52YWx1ZSA9IG5leHRWYWx1ZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRpc3BhdGNoSW5wdXRFdmVudHMoZWxlbWVudCkge1xuICAgIGNvbnN0IGlucHV0RXZlbnQgPSB0eXBlb2YgSW5wdXRFdmVudCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgPyBuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUsIGNvbXBvc2VkOiB0cnVlIH0pXG4gICAgICA6IG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSk7XG4gICAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KGlucHV0RXZlbnQpO1xuICAgIGVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBIZXVyaXN0aWMgRWxlbWVudCBNYXRjaGluZyAocG9ydGVkIGZyb20gQ2FyYXZhbkZsb3cpXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgZnVuY3Rpb24gbm9ybWFsaXplVGV4dCh2YWx1ZSkge1xuICAgIHJldHVybiBTdHJpbmcodmFsdWUgfHwgJycpLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW15hLXowLTldKy9nLCAnJyk7XG4gIH1cblxuICBmdW5jdGlvbiB0b2tlbml6ZSh2YWx1ZSkge1xuICAgIHJldHVybiBTdHJpbmcodmFsdWUgfHwgJycpXG4gICAgICAucmVwbGFjZSgvKFthLXpdKShbQS1aXSkvZywgJyQxICQyJylcbiAgICAgIC50b0xvd2VyQ2FzZSgpXG4gICAgICAuc3BsaXQoL1teYS16MC05XSsvKVxuICAgICAgLm1hcCgocGFydCkgPT4gcGFydC50cmltKCkpXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pO1xuICB9XG5cbiAgZnVuY3Rpb24gZXh0cmFjdFNlbGVjdG9ySGludHMoc2VsZWN0b3IpIHtcbiAgICBjb25zdCBoaW50cyA9IFtdO1xuICAgIGNvbnN0IGF0dHJNYXRjaGVzID0gc2VsZWN0b3IubWF0Y2hBbGwoXG4gICAgICAvXFxbXFxzKihuYW1lfGlkfHBsYWNlaG9sZGVyfGFyaWEtbGFiZWx8ZGF0YS10ZXN0aWR8ZGF0YS10ZXN0LWlkfGRhdGEtcWEpXFxzKig/OlsqXiR8fl0/PSlcXHMqKD86WydcIl0oW14nXCJdKylbJ1wiXXwoW15cXF1cXHNdKykpXFxzKlxcXS9naVxuICAgICk7XG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiBhdHRyTWF0Y2hlcykge1xuICAgICAgaGludHMucHVzaChtYXRjaFsyXSB8fCBtYXRjaFszXSB8fCAnJyk7XG4gICAgfVxuICAgIGNvbnN0IGlkTWF0Y2hlcyA9IHNlbGVjdG9yLm1hdGNoQWxsKC8jKFtBLVphLXowLTlfLV0rKS9nKTtcbiAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIGlkTWF0Y2hlcykge1xuICAgICAgaGludHMucHVzaChTdHJpbmcobWF0Y2hbMV0gfHwgJycpLnJlcGxhY2UoL1tfLV0rL2csICcgJykpO1xuICAgIH1cbiAgICBjb25zdCBjbGFzc01hdGNoZXMgPSBzZWxlY3Rvci5tYXRjaEFsbCgvXFwuKFtBLVphLXowLTlfLV0rKS9nKTtcbiAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIGNsYXNzTWF0Y2hlcykge1xuICAgICAgaGludHMucHVzaChTdHJpbmcobWF0Y2hbMV0gfHwgJycpLnJlcGxhY2UoL1tfLV0rL2csICcgJykpO1xuICAgIH1cbiAgICBjb25zdCB0YWdNYXRjaCA9IHNlbGVjdG9yLm1hdGNoKC9eXFxzKihbYS16XSspL2kpO1xuICAgIGNvbnN0IHByZWZlcnJlZFRhZyA9IHRhZ01hdGNoID8gU3RyaW5nKHRhZ01hdGNoWzFdKS50b0xvd2VyQ2FzZSgpIDogJyc7XG4gICAgcmV0dXJuIHsgaGludHMsIHByZWZlcnJlZFRhZyB9O1xuICB9XG5cbiAgZnVuY3Rpb24gZmluZExhYmVsVGV4dChlbGVtZW50KSB7XG4gICAgaWYgKCEoZWxlbWVudCBpbnN0YW5jZW9mIEVsZW1lbnQpKSByZXR1cm4gJyc7XG4gICAgY29uc3QgcGFydHMgPSBbXTtcbiAgICBjb25zdCBpZCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdpZCcpO1xuICAgIGlmIChpZCkge1xuICAgICAgY29uc3QgbGFiZWxGb3IgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBsYWJlbFtmb3I9XCIke0NTUy5lc2NhcGUoaWQpfVwiXWApO1xuICAgICAgaWYgKGxhYmVsRm9yPy50ZXh0Q29udGVudCkgcGFydHMucHVzaChsYWJlbEZvci50ZXh0Q29udGVudCk7XG4gICAgfVxuICAgIGNvbnN0IGNsb3Nlc3RMYWJlbCA9IGVsZW1lbnQuY2xvc2VzdCgnbGFiZWwnKTtcbiAgICBpZiAoY2xvc2VzdExhYmVsPy50ZXh0Q29udGVudCkgcGFydHMucHVzaChjbG9zZXN0TGFiZWwudGV4dENvbnRlbnQpO1xuICAgIGNvbnN0IHBhcmVudExhYmVsID0gZWxlbWVudC5wYXJlbnRFbGVtZW50Py5xdWVyeVNlbGVjdG9yPy4oJ2xhYmVsJyk7XG4gICAgaWYgKHBhcmVudExhYmVsPy50ZXh0Q29udGVudCkgcGFydHMucHVzaChwYXJlbnRMYWJlbC50ZXh0Q29udGVudCk7XG4gICAgcmV0dXJuIHBhcnRzLmpvaW4oJyAnKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVsZW1lbnRTZWFyY2hUZXh0KGVsZW1lbnQpIHtcbiAgICBjb25zdCBhdHRyS2V5cyA9IFtcbiAgICAgICduYW1lJywgJ2lkJywgJ3BsYWNlaG9sZGVyJywgJ2FyaWEtbGFiZWwnLCAnYXV0b2NvbXBsZXRlJyxcbiAgICAgICdkYXRhLXRlc3RpZCcsICdkYXRhLXRlc3QtaWQnLCAnZGF0YS1xYScsICd0aXRsZSdcbiAgICBdO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtdO1xuICAgIHZhbHVlcy5wdXNoKGVsZW1lbnQudGFnTmFtZS50b0xvd2VyQ2FzZSgpKTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBhdHRyS2V5cykge1xuICAgICAgY29uc3QgdiA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlPy4oa2V5KTtcbiAgICAgIGlmICh2KSB2YWx1ZXMucHVzaCh2KTtcbiAgICB9XG4gICAgdmFsdWVzLnB1c2goZmluZExhYmVsVGV4dChlbGVtZW50KSk7XG4gICAgY29uc3Qgcm9sZSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlPy4oJ3JvbGUnKTtcbiAgICBpZiAocm9sZSkgdmFsdWVzLnB1c2gocm9sZSk7XG4gICAgcmV0dXJuIG5vcm1hbGl6ZVRleHQodmFsdWVzLmpvaW4oJyAnKSk7XG4gIH1cblxuICBmdW5jdGlvbiBpc1VzYWJsZUZpZWxkKGVsZW1lbnQpIHtcbiAgICBpZiAoIShlbGVtZW50IGluc3RhbmNlb2YgRWxlbWVudCkpIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBkaXNhYmxlZCA9IGVsZW1lbnQuaGFzQXR0cmlidXRlKCdkaXNhYmxlZCcpIHx8IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJykgPT09ICd0cnVlJztcbiAgICBjb25zdCByZWN0ID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjb25zdCBzdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xuICAgIGlmIChkaXNhYmxlZCkgcmV0dXJuIGZhbHNlO1xuICAgIGlmIChzdHlsZS5kaXNwbGF5ID09PSAnbm9uZScgfHwgc3R5bGUudmlzaWJpbGl0eSA9PT0gJ2hpZGRlbicpIHJldHVybiBmYWxzZTtcbiAgICBpZiAocmVjdC53aWR0aCA8IDIgfHwgcmVjdC5oZWlnaHQgPCAyKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBmdW5jdGlvbiBlc2NhcGVDc3NWYWx1ZSh2YWx1ZSkge1xuICAgIGNvbnN0IHRleHQgPSBTdHJpbmcodmFsdWUgfHwgJycpO1xuICAgIGlmICh0eXBlb2YgQ1NTICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgQ1NTLmVzY2FwZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcmV0dXJuIENTUy5lc2NhcGUodGV4dCk7XG4gICAgfVxuICAgIHJldHVybiB0ZXh0LnJlcGxhY2UoL1tcIlxcXFxdL2csICdcXFxcJCYnKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG5vcm1hbGl6ZVNraWxsVGFyZ2V0KHZhbHVlKSB7XG4gICAgcmV0dXJuIFN0cmluZyh2YWx1ZSB8fCAnJylcbiAgICAgIC50b0xvd2VyQ2FzZSgpXG4gICAgICAucmVwbGFjZSgvXFxiXFxkezUsfVxcYi9nLCAnIycpXG4gICAgICAucmVwbGFjZSgvW15hLXowLTlcXHNfLV0rL2csICcgJylcbiAgICAgIC5yZXBsYWNlKC9cXHMrL2csICcgJylcbiAgICAgIC50cmltKClcbiAgICAgIC5zbGljZSgwLCAxMjApO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0UGF0aFByZWZpeChwYXRobmFtZSkge1xuICAgIGNvbnN0IHBhcnRzID0gU3RyaW5nKHBhdGhuYW1lIHx8ICcnKVxuICAgICAgLnNwbGl0KCcvJylcbiAgICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAgIC5zbGljZSgwLCAyKTtcbiAgICByZXR1cm4gcGFydHMubGVuZ3RoID8gYC8ke3BhcnRzLmpvaW4oJy8nKX1gIDogJy8nO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0RG9tU2tpbGxTY29wZSgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgaG9zdDogU3RyaW5nKHdpbmRvdy5sb2NhdGlvbj8uaG9zdCB8fCAnJykudG9Mb3dlckNhc2UoKSxcbiAgICAgIHBhdGhQcmVmaXg6IGdldFBhdGhQcmVmaXgod2luZG93LmxvY2F0aW9uPy5wYXRobmFtZSB8fCAnLycpXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBydW5lRG9tU2tpbGxNZW1vcnkoZW50cmllcykge1xuICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gICAgY29uc3Qgc2VlbiA9IG5ldyBTZXQoKTtcbiAgICBjb25zdCBub3JtYWxpemVkID0gW107XG4gICAgZm9yIChjb25zdCBlbnRyeSBvZiBBcnJheS5pc0FycmF5KGVudHJpZXMpID8gZW50cmllcyA6IFtdKSB7XG4gICAgICBpZiAoIWVudHJ5IHx8IHR5cGVvZiBlbnRyeSAhPT0gJ29iamVjdCcpIGNvbnRpbnVlO1xuICAgICAgaWYgKCFlbnRyeS5rZXkgfHwgdHlwZW9mIGVudHJ5LmtleSAhPT0gJ3N0cmluZycpIGNvbnRpbnVlO1xuICAgICAgaWYgKHNlZW4uaGFzKGVudHJ5LmtleSkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgbGFzdFVzZWQgPSBOdW1iZXIoZW50cnkubGFzdFVzZWQgfHwgZW50cnkudXBkYXRlZEF0IHx8IGVudHJ5LmNyZWF0ZWRBdCB8fCAwKTtcbiAgICAgIGlmIChsYXN0VXNlZCA+IDAgJiYgbm93IC0gbGFzdFVzZWQgPiBET01fU0tJTExfTUVNT1JZX1RUTF9NUykgY29udGludWU7XG4gICAgICBzZWVuLmFkZChlbnRyeS5rZXkpO1xuICAgICAgbm9ybWFsaXplZC5wdXNoKGVudHJ5KTtcbiAgICB9XG4gICAgbm9ybWFsaXplZC5zb3J0KChhLCBiKSA9PiBOdW1iZXIoYi5sYXN0VXNlZCB8fCAwKSAtIE51bWJlcihhLmxhc3RVc2VkIHx8IDApKTtcbiAgICByZXR1cm4gbm9ybWFsaXplZC5zbGljZSgwLCBET01fU0tJTExfTUVNT1JZX01BWCk7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiByZWFkRG9tU2tpbGxNZW1vcnkoKSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZG9tU2tpbGxNZW1vcnlDYWNoZSkpIHJldHVybiBkb21Ta2lsbE1lbW9yeUNhY2hlO1xuICAgIGlmIChkb21Ta2lsbE1lbW9yeUxvYWRQcm9taXNlKSByZXR1cm4gZG9tU2tpbGxNZW1vcnlMb2FkUHJvbWlzZTtcblxuICAgIGRvbVNraWxsTWVtb3J5TG9hZFByb21pc2UgPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFtET01fU0tJTExfTUVNT1JZX0tFWV0sIChyZXN1bHQpID0+IHtcbiAgICAgICAgICBpZiAoY2hyb21lLnJ1bnRpbWU/Lmxhc3RFcnJvcikge1xuICAgICAgICAgICAgZG9tU2tpbGxNZW1vcnlDYWNoZSA9IFtdO1xuICAgICAgICAgICAgZG9tU2tpbGxNZW1vcnlMb2FkUHJvbWlzZSA9IG51bGw7XG4gICAgICAgICAgICByZXNvbHZlKGRvbVNraWxsTWVtb3J5Q2FjaGUpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCByYXcgPSByZXN1bHQ/LltET01fU0tJTExfTUVNT1JZX0tFWV07XG4gICAgICAgICAgZG9tU2tpbGxNZW1vcnlDYWNoZSA9IHBydW5lRG9tU2tpbGxNZW1vcnkocmF3KTtcbiAgICAgICAgICBkb21Ta2lsbE1lbW9yeUxvYWRQcm9taXNlID0gbnVsbDtcbiAgICAgICAgICByZXNvbHZlKGRvbVNraWxsTWVtb3J5Q2FjaGUpO1xuICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgICAgZG9tU2tpbGxNZW1vcnlDYWNoZSA9IFtdO1xuICAgICAgICBkb21Ta2lsbE1lbW9yeUxvYWRQcm9taXNlID0gbnVsbDtcbiAgICAgICAgcmVzb2x2ZShkb21Ta2lsbE1lbW9yeUNhY2hlKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBkb21Ta2lsbE1lbW9yeUxvYWRQcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gd3JpdGVEb21Ta2lsbE1lbW9yeShlbnRyaWVzKSB7XG4gICAgY29uc3QgbmV4dCA9IHBydW5lRG9tU2tpbGxNZW1vcnkoZW50cmllcyk7XG4gICAgZG9tU2tpbGxNZW1vcnlDYWNoZSA9IG5leHQ7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IFtET01fU0tJTExfTUVNT1JZX0tFWV06IG5leHQgfSwgKCkgPT4gcmVzb2x2ZSgpKTtcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgIC8vIE5vbi1mYXRhbC4gUnVudGltZSBzdGlsbCB3b3JrcyBldmVuIGlmIHBlcnNpc3RlbmNlIGZhaWxzLlxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGV4dHJhY3RUZXh0U2lnbmF0dXJlKGVsZW1lbnQpIHtcbiAgICBjb25zdCB0ZXh0ID0gU3RyaW5nKGVsZW1lbnQ/LmlubmVyVGV4dCB8fCBlbGVtZW50Py50ZXh0Q29udGVudCB8fCAnJylcbiAgICAgIC5yZXBsYWNlKC9cXHMrL2csICcgJylcbiAgICAgIC50cmltKClcbiAgICAgIC5zbGljZSgwLCAxMjApO1xuICAgIHJldHVybiB0ZXh0O1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0RWxlbWVudEhpbnRzKGVsZW1lbnQpIHtcbiAgICBpZiAoIShlbGVtZW50IGluc3RhbmNlb2YgRWxlbWVudCkpIHJldHVybiBudWxsO1xuICAgIHJldHVybiB7XG4gICAgICB0YWc6IFN0cmluZyhlbGVtZW50LnRhZ05hbWUgfHwgJycpLnRvTG93ZXJDYXNlKCksXG4gICAgICBpZDogU3RyaW5nKGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdpZCcpIHx8ICcnKSxcbiAgICAgIG5hbWU6IFN0cmluZyhlbGVtZW50LmdldEF0dHJpYnV0ZSgnbmFtZScpIHx8ICcnKSxcbiAgICAgIHBsYWNlaG9sZGVyOiBTdHJpbmcoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3BsYWNlaG9sZGVyJykgfHwgJycpLFxuICAgICAgYXJpYUxhYmVsOiBTdHJpbmcoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCAnJyksXG4gICAgICByb2xlOiBTdHJpbmcoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3JvbGUnKSB8fCAnJyksXG4gICAgICBkYXRhVGVzdElkOiBTdHJpbmcoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGVzdGlkJykgfHwgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGVzdC1pZCcpIHx8ICcnKSxcbiAgICAgIGxhYmVsVGV4dDogU3RyaW5nKGZpbmRMYWJlbFRleHQoZWxlbWVudCkgfHwgJycpLnJlcGxhY2UoL1xccysvZywgJyAnKS50cmltKCkuc2xpY2UoMCwgMTIwKSxcbiAgICAgIHRleHQ6IGV4dHJhY3RUZXh0U2lnbmF0dXJlKGVsZW1lbnQpXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNjb3JlU2tpbGxFbnRyeShlbnRyeSwgc2NvcGUsIGludGVudCwgdGFyZ2V0Tm9ybSkge1xuICAgIGlmICghZW50cnkgfHwgZW50cnkuaW50ZW50ICE9PSBpbnRlbnQpIHJldHVybiAwO1xuICAgIGxldCBzY29yZSA9IDA7XG4gICAgaWYgKGVudHJ5Lmhvc3QgPT09IHNjb3BlLmhvc3QpIHNjb3JlICs9IDU7XG4gICAgaWYgKGVudHJ5LnBhdGhQcmVmaXggPT09IHNjb3BlLnBhdGhQcmVmaXgpIHNjb3JlICs9IDI7XG5cbiAgICBjb25zdCBlbnRyeVRhcmdldCA9IFN0cmluZyhlbnRyeS50YXJnZXQgfHwgJycpO1xuICAgIGlmIChlbnRyeVRhcmdldCAmJiB0YXJnZXROb3JtKSB7XG4gICAgICBpZiAoZW50cnlUYXJnZXQgPT09IHRhcmdldE5vcm0pIHNjb3JlICs9IDg7XG4gICAgICBjb25zdCBlbnRyeVRva2VucyA9IG5ldyBTZXQodG9rZW5pemUoZW50cnlUYXJnZXQpKTtcbiAgICAgIGNvbnN0IHRhcmdldFRva2VucyA9IHRva2VuaXplKHRhcmdldE5vcm0pO1xuICAgICAgaWYgKHRhcmdldFRva2Vucy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGxldCBvdmVybGFwID0gMDtcbiAgICAgICAgZm9yIChjb25zdCB0b2tlbiBvZiB0YXJnZXRUb2tlbnMpIHtcbiAgICAgICAgICBpZiAoZW50cnlUb2tlbnMuaGFzKHRva2VuKSkgb3ZlcmxhcCArPSAxO1xuICAgICAgICB9XG4gICAgICAgIHNjb3JlICs9IG92ZXJsYXA7XG4gICAgICB9XG4gICAgfVxuXG4gICAgc2NvcmUgKz0gTWF0aC5taW4oMywgTnVtYmVyKGVudHJ5LnN1Y2Nlc3NDb3VudCB8fCAwKSk7XG4gICAgcmV0dXJuIHNjb3JlO1xuICB9XG5cbiAgZnVuY3Rpb24gZmluZElucHV0RnJvbUxhYmVsVGV4dChsYWJlbFRleHQpIHtcbiAgICBjb25zdCBub3JtID0gbm9ybWFsaXplVGV4dChsYWJlbFRleHQpO1xuICAgIGlmICghbm9ybSkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgbGFiZWxzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdsYWJlbCcpKTtcbiAgICBmb3IgKGNvbnN0IGxhYmVsIG9mIGxhYmVscykge1xuICAgICAgY29uc3QgdGV4dCA9IG5vcm1hbGl6ZVRleHQobGFiZWwudGV4dENvbnRlbnQgfHwgJycpO1xuICAgICAgaWYgKCF0ZXh0IHx8ICF0ZXh0LmluY2x1ZGVzKG5vcm0pKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGh0bWxGb3IgPSBTdHJpbmcobGFiZWwuZ2V0QXR0cmlidXRlKCdmb3InKSB8fCAnJyk7XG4gICAgICBpZiAoaHRtbEZvcikge1xuICAgICAgICBjb25zdCBieUZvciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGh0bWxGb3IpO1xuICAgICAgICBpZiAoYnlGb3IgJiYgaXNVc2FibGVGaWVsZChieUZvcikpIHJldHVybiBieUZvcjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IG5lc3RlZCA9IGxhYmVsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCB0ZXh0YXJlYSwgc2VsZWN0LCBbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXScpO1xuICAgICAgaWYgKG5lc3RlZCAmJiBpc1VzYWJsZUZpZWxkKG5lc3RlZCkpIHJldHVybiBuZXN0ZWQ7XG4gICAgICBjb25zdCBwYXJlbnRJbnB1dCA9IGxhYmVsLnBhcmVudEVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3I/LignaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QsIFtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdJyk7XG4gICAgICBpZiAocGFyZW50SW5wdXQgJiYgaXNVc2FibGVGaWVsZChwYXJlbnRJbnB1dCkpIHJldHVybiBwYXJlbnRJbnB1dDtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBmdW5jdGlvbiByZXNvbHZlRWxlbWVudEZyb21Ta2lsbEhpbnRzKGhpbnRzLCBpbnRlbnQpIHtcbiAgICBpZiAoIWhpbnRzIHx8IHR5cGVvZiBoaW50cyAhPT0gJ29iamVjdCcpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgYnlJZCA9IGhpbnRzLmlkID8gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaGludHMuaWQpIDogbnVsbDtcbiAgICBpZiAoYnlJZCAmJiBpc1VzYWJsZUZpZWxkKGJ5SWQpKSByZXR1cm4gYnlJZDtcblxuICAgIGNvbnN0IHNlbGVjdG9yQ2FuZGlkYXRlcyA9IFtdO1xuICAgIGlmIChoaW50cy5uYW1lKSBzZWxlY3RvckNhbmRpZGF0ZXMucHVzaChgW25hbWU9XCIke2VzY2FwZUNzc1ZhbHVlKGhpbnRzLm5hbWUpfVwiXWApO1xuICAgIGlmIChoaW50cy5hcmlhTGFiZWwpIHNlbGVjdG9yQ2FuZGlkYXRlcy5wdXNoKGBbYXJpYS1sYWJlbD1cIiR7ZXNjYXBlQ3NzVmFsdWUoaGludHMuYXJpYUxhYmVsKX1cIl1gKTtcbiAgICBpZiAoaGludHMuZGF0YVRlc3RJZCkge1xuICAgICAgc2VsZWN0b3JDYW5kaWRhdGVzLnB1c2goYFtkYXRhLXRlc3RpZD1cIiR7ZXNjYXBlQ3NzVmFsdWUoaGludHMuZGF0YVRlc3RJZCl9XCJdYCk7XG4gICAgICBzZWxlY3RvckNhbmRpZGF0ZXMucHVzaChgW2RhdGEtdGVzdC1pZD1cIiR7ZXNjYXBlQ3NzVmFsdWUoaGludHMuZGF0YVRlc3RJZCl9XCJdYCk7XG4gICAgfVxuICAgIGlmIChoaW50cy5wbGFjZWhvbGRlcikgc2VsZWN0b3JDYW5kaWRhdGVzLnB1c2goYFtwbGFjZWhvbGRlcj1cIiR7ZXNjYXBlQ3NzVmFsdWUoaGludHMucGxhY2Vob2xkZXIpfVwiXWApO1xuXG4gICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvckNhbmRpZGF0ZXMpIHtcbiAgICAgIGNvbnN0IGZvdW5kID0gcXVlcnlTZWxlY3RvckRlZXAoc2VsZWN0b3IpO1xuICAgICAgaWYgKGZvdW5kICYmIGlzVXNhYmxlRmllbGQoZm91bmQpKSByZXR1cm4gZm91bmQ7XG4gICAgfVxuXG4gICAgaWYgKGhpbnRzLmxhYmVsVGV4dCkge1xuICAgICAgY29uc3QgYnlMYWJlbCA9IGZpbmRJbnB1dEZyb21MYWJlbFRleHQoaGludHMubGFiZWxUZXh0KTtcbiAgICAgIGlmIChieUxhYmVsKSByZXR1cm4gYnlMYWJlbDtcbiAgICB9XG5cbiAgICBpZiAoaW50ZW50ID09PSAnY2xpY2snICYmIGhpbnRzLnRleHQpIHtcbiAgICAgIGNvbnN0IGNsaWNrYWJsZXMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2J1dHRvbiwgYSwgW3JvbGU9XCJidXR0b25cIl0sIFtyb2xlPVwibGlua1wiXSwgaW5wdXRbdHlwZT1cImJ1dHRvblwiXSwgaW5wdXRbdHlwZT1cInN1Ym1pdFwiXScpKTtcbiAgICAgIGNvbnN0IHRhcmdldE5vcm0gPSBub3JtYWxpemVUZXh0KGhpbnRzLnRleHQpO1xuICAgICAgZm9yIChjb25zdCBub2RlIG9mIGNsaWNrYWJsZXMpIHtcbiAgICAgICAgaWYgKCFpc1VzYWJsZUZpZWxkKG5vZGUpKSBjb250aW51ZTtcbiAgICAgICAgY29uc3Qgbm9kZVRleHQgPSBub3JtYWxpemVUZXh0KG5vZGUudGV4dENvbnRlbnQgfHwgbm9kZS5nZXRBdHRyaWJ1dGUoJ3ZhbHVlJykgfHwgJycpO1xuICAgICAgICBpZiAobm9kZVRleHQgJiYgKG5vZGVUZXh0ID09PSB0YXJnZXROb3JtIHx8IG5vZGVUZXh0LmluY2x1ZGVzKHRhcmdldE5vcm0pIHx8IHRhcmdldE5vcm0uaW5jbHVkZXMobm9kZVRleHQpKSkge1xuICAgICAgICAgIHJldHVybiBub2RlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBtYXRjaERvbVNraWxsKGludGVudCwgdGFyZ2V0KSB7XG4gICAgY29uc3QgdGFyZ2V0Tm9ybSA9IG5vcm1hbGl6ZVNraWxsVGFyZ2V0KHRhcmdldCk7XG4gICAgaWYgKCFpbnRlbnQgfHwgIXRhcmdldE5vcm0pIHJldHVybiBudWxsO1xuXG4gICAgY29uc3Qgc2NvcGUgPSBnZXREb21Ta2lsbFNjb3BlKCk7XG4gICAgY29uc3QgbWVtb3J5ID0gYXdhaXQgcmVhZERvbVNraWxsTWVtb3J5KCk7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KG1lbW9yeSkgfHwgbWVtb3J5Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCByYW5rZWQgPSBtZW1vcnlcbiAgICAgIC5tYXAoKGVudHJ5KSA9PiAoeyBlbnRyeSwgc2NvcmU6IHNjb3JlU2tpbGxFbnRyeShlbnRyeSwgc2NvcGUsIGludGVudCwgdGFyZ2V0Tm9ybSkgfSkpXG4gICAgICAuZmlsdGVyKChpdGVtKSA9PiBpdGVtLnNjb3JlID49IDEwKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGIuc2NvcmUgLSBhLnNjb3JlKTtcblxuICAgIGZvciAoY29uc3QgaXRlbSBvZiByYW5rZWQpIHtcbiAgICAgIGNvbnN0IGVsZW1lbnQgPSByZXNvbHZlRWxlbWVudEZyb21Ta2lsbEhpbnRzKGl0ZW0uZW50cnkuaGludHMsIGludGVudCk7XG4gICAgICBpZiAoIWVsZW1lbnQpIGNvbnRpbnVlO1xuICAgICAgcmV0dXJuIHsgZW50cnk6IGl0ZW0uZW50cnksIGVsZW1lbnQgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGxlYXJuRG9tU2tpbGwoaW50ZW50LCB0YXJnZXQsIGVsZW1lbnQpIHtcbiAgICBjb25zdCB0YXJnZXROb3JtID0gbm9ybWFsaXplU2tpbGxUYXJnZXQodGFyZ2V0KTtcbiAgICBpZiAoIWludGVudCB8fCAhdGFyZ2V0Tm9ybSB8fCAhKGVsZW1lbnQgaW5zdGFuY2VvZiBFbGVtZW50KSkgcmV0dXJuO1xuXG4gICAgY29uc3Qgc2NvcGUgPSBnZXREb21Ta2lsbFNjb3BlKCk7XG4gICAgY29uc3QgaGludHMgPSBnZXRFbGVtZW50SGludHMoZWxlbWVudCk7XG4gICAgaWYgKCFoaW50cykgcmV0dXJuO1xuXG4gICAgY29uc3Qga2V5ID0gYCR7c2NvcGUuaG9zdH18JHtzY29wZS5wYXRoUHJlZml4fXwke2ludGVudH18JHt0YXJnZXROb3JtfWA7XG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblxuICAgIGNvbnN0IG1lbW9yeSA9IGF3YWl0IHJlYWREb21Ta2lsbE1lbW9yeSgpO1xuICAgIGNvbnN0IG5leHQgPSBBcnJheS5pc0FycmF5KG1lbW9yeSkgPyBbLi4ubWVtb3J5XSA6IFtdO1xuICAgIGNvbnN0IGlkeCA9IG5leHQuZmluZEluZGV4KChlbnRyeSkgPT4gZW50cnk/LmtleSA9PT0ga2V5KTtcblxuICAgIGlmIChpZHggPj0gMCkge1xuICAgICAgY29uc3QgcHJldiA9IG5leHRbaWR4XTtcbiAgICAgIG5leHRbaWR4XSA9IHtcbiAgICAgICAgLi4ucHJldixcbiAgICAgICAgaGludHM6IHsgLi4ucHJldi5oaW50cywgLi4uaGludHMgfSxcbiAgICAgICAgdGFyZ2V0OiB0YXJnZXROb3JtLFxuICAgICAgICBzdWNjZXNzQ291bnQ6IE51bWJlcihwcmV2LnN1Y2Nlc3NDb3VudCB8fCAwKSArIDEsXG4gICAgICAgIGxhc3RVc2VkOiBub3csXG4gICAgICAgIHVwZGF0ZWRBdDogbm93XG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXh0LnB1c2goe1xuICAgICAgICBrZXksXG4gICAgICAgIGhvc3Q6IHNjb3BlLmhvc3QsXG4gICAgICAgIHBhdGhQcmVmaXg6IHNjb3BlLnBhdGhQcmVmaXgsXG4gICAgICAgIGludGVudCxcbiAgICAgICAgdGFyZ2V0OiB0YXJnZXROb3JtLFxuICAgICAgICBoaW50cyxcbiAgICAgICAgc3VjY2Vzc0NvdW50OiAxLFxuICAgICAgICBjcmVhdGVkQXQ6IG5vdyxcbiAgICAgICAgdXBkYXRlZEF0OiBub3csXG4gICAgICAgIGxhc3RVc2VkOiBub3dcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGF3YWl0IHdyaXRlRG9tU2tpbGxNZW1vcnkobmV4dCk7XG4gIH1cblxuICBmdW5jdGlvbiBub3JtYWxpemVOYXR1cmFsQ29tbWFuZEtleSh2YWx1ZSkge1xuICAgIHJldHVybiBTdHJpbmcodmFsdWUgfHwgJycpXG4gICAgICAudG9Mb3dlckNhc2UoKVxuICAgICAgLnJlcGxhY2UoL1xcYmNvbmZpcm1hdG9uXFxiL2csICdjb25maXJtYXRpb24nKVxuICAgICAgLnJlcGxhY2UoL1xcYmNvbmZpcm10aW9uXFxiL2csICdjb25maXJtYXRpb24nKVxuICAgICAgLnJlcGxhY2UoL1xcYmNvbmZyaW1hdGlvblxcYi9nLCAnY29uZmlybWF0aW9uJylcbiAgICAgIC5yZXBsYWNlKC9cXGJjb25maW1hdGlvblxcYi9nLCAnY29uZmlybWF0aW9uJylcbiAgICAgIC5yZXBsYWNlKC9cXGJhZHJlc3NcXGIvZywgJ2FkZHJlc3MnKVxuICAgICAgLnJlcGxhY2UoL1xcYmVtaWFsXFxiL2csICdlbWFpbCcpXG4gICAgICAucmVwbGFjZSgvW15hLXowLTlcXHNfLV0rL2csICcgJylcbiAgICAgIC5yZXBsYWNlKC9cXHMrL2csICcgJylcbiAgICAgIC50cmltKClcbiAgICAgIC5zbGljZSgwLCAxODApO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJ1bmVOYXR1cmFsQ29tbWFuZE1lbW9yeShlbnRyaWVzKSB7XG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCBieUtleSA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IHJhdyBvZiBBcnJheS5pc0FycmF5KGVudHJpZXMpID8gZW50cmllcyA6IFtdKSB7XG4gICAgICBpZiAoIXJhdyB8fCB0eXBlb2YgcmF3ICE9PSAnb2JqZWN0JykgY29udGludWU7XG4gICAgICBjb25zdCBrZXkgPSBTdHJpbmcocmF3LmtleSB8fCAnJykudHJpbSgpO1xuICAgICAgaWYgKCFrZXkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgbGFzdFVzZWQgPSBOdW1iZXIocmF3Lmxhc3RVc2VkIHx8IHJhdy51cGRhdGVkQXQgfHwgcmF3LmNyZWF0ZWRBdCB8fCAwKTtcbiAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKGxhc3RVc2VkKSB8fCBsYXN0VXNlZCA8PSAwKSBjb250aW51ZTtcbiAgICAgIGlmIChub3cgLSBsYXN0VXNlZCA+IE5BVFVSQUxfQ09NTUFORF9NRU1PUllfVFRMX01TKSBjb250aW51ZTtcbiAgICAgIGJ5S2V5LnNldChrZXksIHtcbiAgICAgICAga2V5LFxuICAgICAgICBob3N0OiBTdHJpbmcocmF3Lmhvc3QgfHwgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpLFxuICAgICAgICBwYXRoUHJlZml4OiBTdHJpbmcocmF3LnBhdGhQcmVmaXggfHwgJy8nKS50cmltKCkgfHwgJy8nLFxuICAgICAgICBjb21tYW5kOiBTdHJpbmcocmF3LmNvbW1hbmQgfHwgJycpLnRyaW0oKSxcbiAgICAgICAgY2Fub25pY2FsQ29tbWFuZDogU3RyaW5nKHJhdy5jYW5vbmljYWxDb21tYW5kIHx8ICcnKS50cmltKCksXG4gICAgICAgIHN1Y2Nlc3NDb3VudDogTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihOdW1iZXIocmF3LnN1Y2Nlc3NDb3VudCB8fCAxKSkpLFxuICAgICAgICByZXBhaXJlZENvdW50OiBNYXRoLm1heCgwLCBNYXRoLmZsb29yKE51bWJlcihyYXcucmVwYWlyZWRDb3VudCB8fCAwKSkpLFxuICAgICAgICBsYXN0VXNlZFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBBcnJheS5mcm9tKGJ5S2V5LnZhbHVlcygpKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IChiLmxhc3RVc2VkIHx8IDApIC0gKGEubGFzdFVzZWQgfHwgMCkpXG4gICAgICAuc2xpY2UoMCwgTkFUVVJBTF9DT01NQU5EX01FTU9SWV9NQVgpO1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gcmVhZE5hdHVyYWxDb21tYW5kTWVtb3J5KCkge1xuICAgIGlmIChBcnJheS5pc0FycmF5KG5hdHVyYWxDb21tYW5kTWVtb3J5Q2FjaGUpKSByZXR1cm4gbmF0dXJhbENvbW1hbmRNZW1vcnlDYWNoZTtcbiAgICBpZiAobmF0dXJhbENvbW1hbmRNZW1vcnlMb2FkUHJvbWlzZSkgcmV0dXJuIG5hdHVyYWxDb21tYW5kTWVtb3J5TG9hZFByb21pc2U7XG5cbiAgICBuYXR1cmFsQ29tbWFuZE1lbW9yeUxvYWRQcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChbTkFUVVJBTF9DT01NQU5EX01FTU9SWV9LRVldLCAocmVzdWx0KSA9PiB7XG4gICAgICAgICAgaWYgKGNocm9tZS5ydW50aW1lPy5sYXN0RXJyb3IpIHtcbiAgICAgICAgICAgIG5hdHVyYWxDb21tYW5kTWVtb3J5Q2FjaGUgPSBbXTtcbiAgICAgICAgICAgIG5hdHVyYWxDb21tYW5kTWVtb3J5TG9hZFByb21pc2UgPSBudWxsO1xuICAgICAgICAgICAgcmVzb2x2ZShuYXR1cmFsQ29tbWFuZE1lbW9yeUNhY2hlKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgbmF0dXJhbENvbW1hbmRNZW1vcnlDYWNoZSA9IHBydW5lTmF0dXJhbENvbW1hbmRNZW1vcnkocmVzdWx0Py5bTkFUVVJBTF9DT01NQU5EX01FTU9SWV9LRVldKTtcbiAgICAgICAgICBuYXR1cmFsQ29tbWFuZE1lbW9yeUxvYWRQcm9taXNlID0gbnVsbDtcbiAgICAgICAgICByZXNvbHZlKG5hdHVyYWxDb21tYW5kTWVtb3J5Q2FjaGUpO1xuICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgICAgbmF0dXJhbENvbW1hbmRNZW1vcnlDYWNoZSA9IFtdO1xuICAgICAgICBuYXR1cmFsQ29tbWFuZE1lbW9yeUxvYWRQcm9taXNlID0gbnVsbDtcbiAgICAgICAgcmVzb2x2ZShuYXR1cmFsQ29tbWFuZE1lbW9yeUNhY2hlKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBuYXR1cmFsQ29tbWFuZE1lbW9yeUxvYWRQcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gd3JpdGVOYXR1cmFsQ29tbWFuZE1lbW9yeShlbnRyaWVzKSB7XG4gICAgY29uc3QgbmV4dCA9IHBydW5lTmF0dXJhbENvbW1hbmRNZW1vcnkoZW50cmllcyk7XG4gICAgbmF0dXJhbENvbW1hbmRNZW1vcnlDYWNoZSA9IG5leHQ7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IFtOQVRVUkFMX0NPTU1BTkRfTUVNT1JZX0tFWV06IG5leHQgfSwgKCkgPT4gcmVzb2x2ZSgpKTtcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgIC8vIE5vbi1mYXRhbDsgY29tbWFuZCBleGVjdXRpb24gc3RpbGwgc3VjY2VlZHMgZXZlbiBpZiBtZW1vcnkgcGVyc2lzdGVuY2UgZmFpbHMuXG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gcmVtZW1iZXJOYXR1cmFsQ29tbWFuZChjb21tYW5kLCBjYW5vbmljYWxDb21tYW5kLCByZXBhaXJlZCA9IGZhbHNlKSB7XG4gICAgY29uc3QgY29tbWFuZE5vcm0gPSBub3JtYWxpemVOYXR1cmFsQ29tbWFuZEtleShjb21tYW5kKTtcbiAgICBjb25zdCBjYW5vbmljYWxOb3JtID0gbm9ybWFsaXplTmF0dXJhbENvbW1hbmRLZXkoY2Fub25pY2FsQ29tbWFuZCB8fCBjb21tYW5kKTtcbiAgICBpZiAoIWNvbW1hbmROb3JtIHx8ICFjYW5vbmljYWxOb3JtKSByZXR1cm47XG5cbiAgICBjb25zdCBzY29wZSA9IGdldERvbVNraWxsU2NvcGUoKTtcbiAgICBjb25zdCBrZXkgPSBgJHtzY29wZS5ob3N0fXwke3Njb3BlLnBhdGhQcmVmaXh9fCR7Y29tbWFuZE5vcm19YDtcbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgIGNvbnN0IG1lbW9yeSA9IGF3YWl0IHJlYWROYXR1cmFsQ29tbWFuZE1lbW9yeSgpO1xuICAgIGNvbnN0IG5leHQgPSBBcnJheS5pc0FycmF5KG1lbW9yeSkgPyBbLi4ubWVtb3J5XSA6IFtdO1xuICAgIGNvbnN0IGlkeCA9IG5leHQuZmluZEluZGV4KChlbnRyeSkgPT4gZW50cnk/LmtleSA9PT0ga2V5KTtcblxuICAgIGlmIChpZHggPj0gMCkge1xuICAgICAgY29uc3QgcHJldiA9IG5leHRbaWR4XTtcbiAgICAgIG5leHRbaWR4XSA9IHtcbiAgICAgICAgLi4ucHJldixcbiAgICAgICAgY2Fub25pY2FsQ29tbWFuZDogY2Fub25pY2FsTm9ybSxcbiAgICAgICAgc3VjY2Vzc0NvdW50OiBOdW1iZXIocHJldi5zdWNjZXNzQ291bnQgfHwgMCkgKyAxLFxuICAgICAgICByZXBhaXJlZENvdW50OiBOdW1iZXIocHJldi5yZXBhaXJlZENvdW50IHx8IDApICsgKHJlcGFpcmVkID8gMSA6IDApLFxuICAgICAgICBsYXN0VXNlZDogbm93LFxuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dC5wdXNoKHtcbiAgICAgICAga2V5LFxuICAgICAgICBob3N0OiBzY29wZS5ob3N0LFxuICAgICAgICBwYXRoUHJlZml4OiBzY29wZS5wYXRoUHJlZml4LFxuICAgICAgICBjb21tYW5kOiBjb21tYW5kTm9ybSxcbiAgICAgICAgY2Fub25pY2FsQ29tbWFuZDogY2Fub25pY2FsTm9ybSxcbiAgICAgICAgc3VjY2Vzc0NvdW50OiAxLFxuICAgICAgICByZXBhaXJlZENvdW50OiByZXBhaXJlZCA/IDEgOiAwLFxuICAgICAgICBjcmVhdGVkQXQ6IG5vdyxcbiAgICAgICAgdXBkYXRlZEF0OiBub3csXG4gICAgICAgIGxhc3RVc2VkOiBub3dcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGF3YWl0IHdyaXRlTmF0dXJhbENvbW1hbmRNZW1vcnkobmV4dCk7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBtYXRjaE5hdHVyYWxDb21tYW5kTWVtb3J5KGNvbW1hbmQpIHtcbiAgICBjb25zdCBjb21tYW5kTm9ybSA9IG5vcm1hbGl6ZU5hdHVyYWxDb21tYW5kS2V5KGNvbW1hbmQpO1xuICAgIGlmICghY29tbWFuZE5vcm0pIHJldHVybiBudWxsO1xuXG4gICAgY29uc3Qgc2NvcGUgPSBnZXREb21Ta2lsbFNjb3BlKCk7XG4gICAgY29uc3QgbWVtb3J5ID0gYXdhaXQgcmVhZE5hdHVyYWxDb21tYW5kTWVtb3J5KCk7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KG1lbW9yeSkgfHwgbWVtb3J5Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCByYW5rZWQgPSBtZW1vcnlcbiAgICAgIC5tYXAoKGVudHJ5KSA9PiB7XG4gICAgICAgIGlmICghZW50cnkgfHwgZW50cnkuY29tbWFuZCAhPT0gY29tbWFuZE5vcm0pIHJldHVybiBudWxsO1xuICAgICAgICBsZXQgc2NvcmUgPSAwO1xuICAgICAgICBpZiAoZW50cnkuaG9zdCA9PT0gc2NvcGUuaG9zdCkgc2NvcmUgKz0gNTtcbiAgICAgICAgaWYgKGVudHJ5LnBhdGhQcmVmaXggPT09IHNjb3BlLnBhdGhQcmVmaXgpIHNjb3JlICs9IDI7XG4gICAgICAgIHNjb3JlICs9IE1hdGgubWluKDMsIE51bWJlcihlbnRyeS5zdWNjZXNzQ291bnQgfHwgMCkpO1xuICAgICAgICByZXR1cm4geyBlbnRyeSwgc2NvcmUgfTtcbiAgICAgIH0pXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAuc29ydCgoYSwgYikgPT4gYi5zY29yZSAtIGEuc2NvcmUpO1xuXG4gICAgcmV0dXJuIHJhbmtlZFswXT8uZW50cnkgfHwgbnVsbDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGJ1aWxkTmF0dXJhbENvbW1hbmRDYW5kaWRhdGVzKGNvbW1hbmQpIHtcbiAgICBjb25zdCByYXcgPSBTdHJpbmcoY29tbWFuZCB8fCAnJykudHJpbSgpO1xuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBbXTtcbiAgICBjb25zdCBzZWVuID0gbmV3IFNldCgpO1xuICAgIGNvbnN0IHB1c2ggPSAodmFsdWUpID0+IHtcbiAgICAgIGNvbnN0IHRleHQgPSBTdHJpbmcodmFsdWUgfHwgJycpLnRyaW0oKTtcbiAgICAgIGlmICghdGV4dCkgcmV0dXJuO1xuICAgICAgY29uc3Qga2V5ID0gdGV4dC50b0xvd2VyQ2FzZSgpO1xuICAgICAgaWYgKHNlZW4uaGFzKGtleSkpIHJldHVybjtcbiAgICAgIHNlZW4uYWRkKGtleSk7XG4gICAgICBjYW5kaWRhdGVzLnB1c2godGV4dCk7XG4gICAgfTtcblxuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVOYXR1cmFsQ29tbWFuZEtleShyYXcpO1xuICAgIHB1c2gocmF3KTtcbiAgICBwdXNoKG5vcm1hbGl6ZWQpO1xuXG4gICAgbGV0IGhlYWxlZCA9IHJhdztcbiAgICBoZWFsZWQgPSBoZWFsZWRcbiAgICAgIC5yZXBsYWNlKC9cXGJjb25maXJtYXRvblxcYi9naSwgJ2NvbmZpcm1hdGlvbicpXG4gICAgICAucmVwbGFjZSgvXFxiY29uZmlybXRpb25cXGIvZ2ksICdjb25maXJtYXRpb24nKVxuICAgICAgLnJlcGxhY2UoL1xcYmNvbmZyaW1hdGlvblxcYi9naSwgJ2NvbmZpcm1hdGlvbicpXG4gICAgICAucmVwbGFjZSgvXFxiY29uZmltYXRpb25cXGIvZ2ksICdjb25maXJtYXRpb24nKTtcbiAgICBwdXNoKGhlYWxlZCk7XG5cbiAgICBjb25zdCBtYXRjaEZpbGxDb3B5ID0gaGVhbGVkLm1hdGNoKC9cXGJmaWxsKD86XFxzK2luKT9cXHMrKC4rPylcXHMrY29weVxccytmcm9tXFxzKyguKykkL2kpO1xuICAgIGlmIChtYXRjaEZpbGxDb3B5KSB7XG4gICAgICBwdXNoKGBmaWxsICR7bWF0Y2hGaWxsQ29weVsxXX0gZnJvbSAke21hdGNoRmlsbENvcHlbMl19YCk7XG4gICAgfVxuXG4gICAgY29uc3QgbWF0Y2hDb3B5SW50byA9IGhlYWxlZC5tYXRjaCgvXFxiY29weVxccysoLis/KVxccysoPzppbnRvfHRvKVxccysoLispJC9pKTtcbiAgICBpZiAobWF0Y2hDb3B5SW50bykge1xuICAgICAgcHVzaChgZmlsbCAke21hdGNoQ29weUludG9bMl19IGZyb20gJHttYXRjaENvcHlJbnRvWzFdfWApO1xuICAgIH1cblxuICAgIGNvbnN0IG1hdGNoQ29weUZyb20gPSBoZWFsZWQubWF0Y2goL1xcYmNvcHlcXHMrZnJvbVxccysoLis/KVxccysoPzppbnRvfHRvKVxccysoLispJC9pKTtcbiAgICBpZiAobWF0Y2hDb3B5RnJvbSkge1xuICAgICAgcHVzaChgZmlsbCAke21hdGNoQ29weUZyb21bMl19IGZyb20gJHttYXRjaENvcHlGcm9tWzFdfWApO1xuICAgIH1cblxuICAgIHJldHVybiBjYW5kaWRhdGVzO1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZU5hdHVyYWxDb21tYW5kKGNvbW1hbmQpIHtcbiAgICBpZiAoIXdpbmRvdy5CaWxnZUNvcnRleCAmJiAhd2luZG93Ll9fYmlsZ2VfY29ydGV4X2xvYWRlZCkge1xuICAgICAgcmV0dXJuIHsgZXJyb3I6ICdDb3J0ZXggbW9kdWxlIG5vdCBsb2FkZWQnLCBwYXJzZWQ6IG51bGwsIGV4ZWN1dGFibGU6IG51bGwgfTtcbiAgICB9XG5cbiAgICBjb25zdCB0cnlQYXJzZSA9IChjYW5kaWRhdGUpID0+IHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IHdpbmRvdy5CaWxnZUNvcnRleC5wYXJzZUNvbW1hbmQoY2FuZGlkYXRlKTtcbiAgICAgIGlmICghcGFyc2VkKSByZXR1cm4gbnVsbDtcbiAgICAgIGNvbnN0IGV4ZWN1dGFibGUgPSB3aW5kb3cuQmlsZ2VDb3J0ZXgudG9FeGVjdXRhYmxlQWN0aW9uKHBhcnNlZCk7XG4gICAgICBpZiAoIWV4ZWN1dGFibGUpIHJldHVybiBudWxsO1xuICAgICAgcmV0dXJuIHsgcGFyc2VkLCBleGVjdXRhYmxlLCBjYW5vbmljYWxDb21tYW5kOiBTdHJpbmcocGFyc2VkLnJhdyB8fCBjYW5kaWRhdGUgfHwgJycpLnRyaW0oKSB8fCBTdHJpbmcoY2FuZGlkYXRlIHx8ICcnKS50cmltKCkgfTtcbiAgICB9O1xuXG4gICAgLy8gMSkgRGlyZWN0IHBhcnNlXG4gICAgY29uc3QgZGlyZWN0ID0gdHJ5UGFyc2UoY29tbWFuZCk7XG4gICAgaWYgKGRpcmVjdCkgcmV0dXJuIHsgLi4uZGlyZWN0LCByZXBhaXJlZDogZmFsc2UsIGNvbW1hbmRNZW1vcnlIaXQ6IGZhbHNlLCByZWNvdmVyeVBhdGg6ICdkaXJlY3QnIH07XG5cbiAgICAvLyAyKSBMZWFybmVkIGNvbW1hbmQgbWVtb3J5XG4gICAgY29uc3QgcmVtZW1iZXJlZCA9IGF3YWl0IG1hdGNoTmF0dXJhbENvbW1hbmRNZW1vcnkoY29tbWFuZCk7XG4gICAgaWYgKHJlbWVtYmVyZWQ/LmNhbm9uaWNhbENvbW1hbmQpIHtcbiAgICAgIGNvbnN0IGZyb21NZW1vcnkgPSB0cnlQYXJzZShyZW1lbWJlcmVkLmNhbm9uaWNhbENvbW1hbmQpO1xuICAgICAgaWYgKGZyb21NZW1vcnkpIHtcbiAgICAgICAgcmV0dXJuIHsgLi4uZnJvbU1lbW9yeSwgcmVwYWlyZWQ6IHRydWUsIGNvbW1hbmRNZW1vcnlIaXQ6IHRydWUsIHJlY292ZXJ5UGF0aDogJ21lbW9yeScgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyAzKSBIZXVyaXN0aWMgc2VsZi1oZWFsIHJld3JpdGVzXG4gICAgY29uc3QgY2FuZGlkYXRlcyA9IGJ1aWxkTmF0dXJhbENvbW1hbmRDYW5kaWRhdGVzKGNvbW1hbmQpO1xuICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgIGNvbnN0IHJlY292ZXJlZCA9IHRyeVBhcnNlKGNhbmRpZGF0ZSk7XG4gICAgICBpZiAocmVjb3ZlcmVkKSB7XG4gICAgICAgIHJldHVybiB7IC4uLnJlY292ZXJlZCwgcmVwYWlyZWQ6IHRydWUsIGNvbW1hbmRNZW1vcnlIaXQ6IGZhbHNlLCByZWNvdmVyeVBhdGg6ICdyZXdyaXRlJyB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7IGVycm9yOiAnQ291bGQgbm90IHVuZGVyc3RhbmQgY29tbWFuZCBhZnRlciByZWNvdmVyeSBhdHRlbXB0cycsIHBhcnNlZDogbnVsbCwgZXhlY3V0YWJsZTogbnVsbCB9O1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gcnVuTmF0dXJhbENvbW1hbmRBdXRvRGVidWcoY29tbWFuZCkge1xuICAgIGNvbnN0IHRleHQgPSBub3JtYWxpemVOYXR1cmFsQ29tbWFuZEtleShjb21tYW5kKTtcbiAgICBpZiAoIXRleHQpIHJldHVybiBudWxsO1xuXG4gICAgLy8gQXV0by1kZWJ1ZyBzY3JpcHQgbW9kZSBmb3IgXCJmaWxsIFggZnJvbSBZXCIgLyBcImNvcHkgWSBpbnRvIFhcIiBwYXR0ZXJucy5cbiAgICBsZXQgdGFyZ2V0ID0gJyc7XG4gICAgbGV0IHNvdXJjZSA9ICcnO1xuICAgIGxldCBtYXRjaCA9IHRleHQubWF0Y2goL1xcYmZpbGwoPzpcXHMraW4pP1xccysoLis/KVxccysoPzpjb3B5XFxzK2Zyb218ZnJvbXx1c2luZylcXHMrKC4rKSQvaSk7XG4gICAgaWYgKG1hdGNoKSB7XG4gICAgICB0YXJnZXQgPSBTdHJpbmcobWF0Y2hbMV0gfHwgJycpLnRyaW0oKTtcbiAgICAgIHNvdXJjZSA9IFN0cmluZyhtYXRjaFsyXSB8fCAnJykudHJpbSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBtYXRjaCA9IHRleHQubWF0Y2goL1xcYmNvcHlcXHMrKC4rPylcXHMrKD86aW50b3x0bylcXHMrKC4rKSQvaSk7XG4gICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgc291cmNlID0gU3RyaW5nKG1hdGNoWzFdIHx8ICcnKS50cmltKCk7XG4gICAgICAgIHRhcmdldCA9IFN0cmluZyhtYXRjaFsyXSB8fCAnJykudHJpbSgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghdGFyZ2V0IHx8ICFzb3VyY2UpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3Qgc291cmNlRWxlbWVudCA9IGZpbmRFbGVtZW50QnlIZXVyaXN0aWMoeyBsYWJlbDogc291cmNlLCBmaWVsZDogc291cmNlLCBuYW1lOiBzb3VyY2UsIHBsYWNlaG9sZGVyOiBzb3VyY2UgfSwgbnVsbCk7XG4gICAgY29uc3QgdGFyZ2V0RWxlbWVudCA9IGZpbmRFbGVtZW50QnlIZXVyaXN0aWMoeyBsYWJlbDogdGFyZ2V0LCBmaWVsZDogdGFyZ2V0LCBuYW1lOiB0YXJnZXQsIHBsYWNlaG9sZGVyOiB0YXJnZXQgfSwgbnVsbCk7XG4gICAgaWYgKCFzb3VyY2VFbGVtZW50IHx8ICF0YXJnZXRFbGVtZW50KSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IHNvdXJjZVRhZyA9IFN0cmluZyhzb3VyY2VFbGVtZW50LnRhZ05hbWUgfHwgJycpLnRvVXBwZXJDYXNlKCk7XG4gICAgbGV0IHNvdXJjZVZhbHVlID0gJyc7XG4gICAgaWYgKHNvdXJjZVRhZyA9PT0gJ0lOUFVUJyB8fCBzb3VyY2VUYWcgPT09ICdURVhUQVJFQScgfHwgc291cmNlVGFnID09PSAnU0VMRUNUJykge1xuICAgICAgc291cmNlVmFsdWUgPSBTdHJpbmcoc291cmNlRWxlbWVudC52YWx1ZSB8fCAnJyk7XG4gICAgfSBlbHNlIGlmIChzb3VyY2VFbGVtZW50LmlzQ29udGVudEVkaXRhYmxlKSB7XG4gICAgICBzb3VyY2VWYWx1ZSA9IFN0cmluZyhzb3VyY2VFbGVtZW50LnRleHRDb250ZW50IHx8ICcnKTtcbiAgICB9XG4gICAgaWYgKCFzb3VyY2VWYWx1ZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBTb3VyY2UgZmllbGQgXCIke3NvdXJjZX1cIiBpcyBlbXB0eWApO1xuICAgIH1cblxuICAgIHRhcmdldEVsZW1lbnQuZm9jdXMoKTtcbiAgICBpZiAodGFyZ2V0RWxlbWVudC50YWdOYW1lID09PSAnSU5QVVQnIHx8IHRhcmdldEVsZW1lbnQudGFnTmFtZSA9PT0gJ1RFWFRBUkVBJykge1xuICAgICAgc2V0TmF0aXZlVmFsdWUodGFyZ2V0RWxlbWVudCwgc291cmNlVmFsdWUpO1xuICAgICAgZGlzcGF0Y2hJbnB1dEV2ZW50cyh0YXJnZXRFbGVtZW50KTtcbiAgICB9IGVsc2UgaWYgKHRhcmdldEVsZW1lbnQuaXNDb250ZW50RWRpdGFibGUpIHtcbiAgICAgIHRhcmdldEVsZW1lbnQudGV4dENvbnRlbnQgPSBzb3VyY2VWYWx1ZTtcbiAgICAgIGRpc3BhdGNoSW5wdXRFdmVudHModGFyZ2V0RWxlbWVudCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgIGxlYXJuRG9tU2tpbGwoJ3R5cGUnLCBzb3VyY2UsIHNvdXJjZUVsZW1lbnQpLFxuICAgICAgbGVhcm5Eb21Ta2lsbCgndHlwZScsIHRhcmdldCwgdGFyZ2V0RWxlbWVudClcbiAgICBdKTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6ICd0eXBlZCcsXG4gICAgICB0YXJnZXQsXG4gICAgICBjb3BpZWRGcm9tOiBzb3VyY2UsXG4gICAgICB2YWx1ZTogc291cmNlVmFsdWUuc2xpY2UoMCwgNTApLFxuICAgICAgYXV0b0RlYnVnOiB0cnVlLFxuICAgICAgZGVidWdNb2RlOiAnc2NyaXB0LXJlY292ZXJ5J1xuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogRmluZCBlbGVtZW50IHVzaW5nIGhldXJpc3RpYyBtYXRjaGluZyB3aGVuIHNlbGVjdG9yIGZhaWxzXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXF1ZXN0IC0gUmVxdWVzdCB3aXRoIGZpZWxkLCBuYW1lLCBsYWJlbCwgcGxhY2Vob2xkZXIgaGludHNcbiAgICogQHBhcmFtIHtzdHJpbmd9IHNlbGVjdG9yIC0gT3JpZ2luYWwgc2VsZWN0b3IgZm9yIGhpbnQgZXh0cmFjdGlvblxuICAgKiBAcmV0dXJucyB7RWxlbWVudHxudWxsfSBNYXRjaGVkIGVsZW1lbnQgb3IgbnVsbFxuICAgKi9cbiAgZnVuY3Rpb24gZmluZEVsZW1lbnRCeUhldXJpc3RpYyhyZXF1ZXN0LCBzZWxlY3Rvcikge1xuICAgIGNvbnN0IHRva2VuU2V0ID0gbmV3IFNldCgpO1xuICAgIGNvbnN0IHJhd0hpbnRzID0gW3JlcXVlc3QuZmllbGQsIHJlcXVlc3QubmFtZSwgcmVxdWVzdC5sYWJlbCwgcmVxdWVzdC5wbGFjZWhvbGRlcl07XG4gICAgbGV0IHByZWZlcnJlZFRhZyA9ICcnO1xuXG4gICAgLy8gRXh0cmFjdCBoaW50cyBmcm9tIHNlbGVjdG9yXG4gICAgaWYgKHNlbGVjdG9yKSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBleHRyYWN0U2VsZWN0b3JIaW50cyhzZWxlY3Rvcik7XG4gICAgICByYXdIaW50cy5wdXNoKC4uLnBhcnNlZC5oaW50cyk7XG4gICAgICBpZiAoIXByZWZlcnJlZFRhZyAmJiBwYXJzZWQucHJlZmVycmVkVGFnKSBwcmVmZXJyZWRUYWcgPSBwYXJzZWQucHJlZmVycmVkVGFnO1xuICAgIH1cblxuICAgIC8vIFRva2VuaXplIGFsbCBoaW50c1xuICAgIGZvciAoY29uc3QgaGludCBvZiByYXdIaW50cykge1xuICAgICAgZm9yIChjb25zdCB0b2tlbiBvZiB0b2tlbml6ZShoaW50KSkgdG9rZW5TZXQuYWRkKHRva2VuKTtcbiAgICB9XG5cbiAgICAvLyBFeHBhbmQgc3lub255bXNcbiAgICBjb25zdCBleHBhbmRlZCA9IG5ldyBTZXQodG9rZW5TZXQpO1xuICAgIGlmIChleHBhbmRlZC5oYXMoJ2ZpcnN0JykpIGV4cGFuZGVkLmFkZCgnZ2l2ZW4nKTtcbiAgICBpZiAoZXhwYW5kZWQuaGFzKCdsYXN0JykpIHtcbiAgICAgIGV4cGFuZGVkLmFkZCgnZmFtaWx5Jyk7XG4gICAgICBleHBhbmRlZC5hZGQoJ3N1cm5hbWUnKTtcbiAgICB9XG4gICAgaWYgKGV4cGFuZGVkLmhhcygncGhvbmUnKSkgZXhwYW5kZWQuYWRkKCd0ZWwnKTtcbiAgICBpZiAoZXhwYW5kZWQuaGFzKCdtYWlsJykpIGV4cGFuZGVkLmFkZCgnZW1haWwnKTtcbiAgICBpZiAoZXhwYW5kZWQuaGFzKCdlbWFpbCcpKSBleHBhbmRlZC5hZGQoJ21haWwnKTtcblxuICAgIGNvbnN0IHRva2VucyA9IEFycmF5LmZyb20oZXhwYW5kZWQpO1xuICAgIGlmICghdG9rZW5zLmxlbmd0aCkgcmV0dXJuIG51bGw7XG5cbiAgICAvLyBGaW5kIGFsbCBjYW5kaWRhdGUgZWxlbWVudHNcbiAgICBjb25zdCBjYW5kaWRhdGVzID0gQXJyYXkuZnJvbShcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0LCB0ZXh0YXJlYSwgc2VsZWN0LCBidXR0b24sIFtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdLCBbcm9sZT1cInRleHRib3hcIl0sIFtyb2xlPVwiYnV0dG9uXCJdLCBhJylcbiAgICApLmZpbHRlcihpc1VzYWJsZUZpZWxkKTtcblxuICAgIGNvbnN0IHBocmFzZSA9IG5vcm1hbGl6ZVRleHQodG9rZW5zLmpvaW4oJycpKTtcbiAgICBsZXQgYmVzdCA9IG51bGw7XG5cbiAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgY2FuZGlkYXRlcykge1xuICAgICAgY29uc3QgaGF5c3RhY2sgPSBlbGVtZW50U2VhcmNoVGV4dChlbGVtZW50KTtcbiAgICAgIGlmICghaGF5c3RhY2spIGNvbnRpbnVlO1xuICAgICAgbGV0IHNjb3JlID0gMDtcblxuICAgICAgZm9yIChjb25zdCB0b2tlbiBvZiB0b2tlbnMpIHtcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZFRva2VuID0gbm9ybWFsaXplVGV4dCh0b2tlbik7XG4gICAgICAgIGlmICghbm9ybWFsaXplZFRva2VuKSBjb250aW51ZTtcbiAgICAgICAgaWYgKGhheXN0YWNrLmluY2x1ZGVzKG5vcm1hbGl6ZWRUb2tlbikpIHtcbiAgICAgICAgICBzY29yZSArPSBub3JtYWxpemVkVG9rZW4ubGVuZ3RoID49IDQgPyAyIDogMTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAocGhyYXNlICYmIGhheXN0YWNrLmluY2x1ZGVzKHBocmFzZSkpIHNjb3JlICs9IDM7XG4gICAgICBpZiAocHJlZmVycmVkVGFnICYmIGVsZW1lbnQudGFnTmFtZS50b0xvd2VyQ2FzZSgpID09PSBwcmVmZXJyZWRUYWcpIHNjb3JlICs9IDE7XG5cbiAgICAgIGlmICghYmVzdCB8fCBzY29yZSA+IGJlc3Quc2NvcmUpIHtcbiAgICAgICAgYmVzdCA9IHsgZWxlbWVudCwgc2NvcmUgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIWJlc3QgfHwgYmVzdC5zY29yZSA8PSAwKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gYmVzdC5lbGVtZW50O1xuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gR2xvYmFsIEV4cG9ydHMgZm9yIFNlbGYtSGVhbGluZyBFbmdpbmUgSW50ZWdyYXRpb25cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gRXhwb3NlIGtleSBmdW5jdGlvbnMgZm9yIHNlbGYtaGVhbGluZyBzdHJhdGVnaWVzIHRvIHVzZVxuICB3aW5kb3cuX19iaWxnZU1hdGNoRG9tU2tpbGwgPSBtYXRjaERvbVNraWxsO1xuICB3aW5kb3cuX19iaWxnZUZpbmRFbGVtZW50QnlIZXVyaXN0aWMgPSBmaW5kRWxlbWVudEJ5SGV1cmlzdGljO1xuICB3aW5kb3cuX19iaWxnZUxlYXJuRG9tU2tpbGwgPSBsZWFybkRvbVNraWxsO1xuICB3aW5kb3cuX19iaWxnZUlzVXNhYmxlRmllbGQgPSBpc1VzYWJsZUZpZWxkO1xuICB3aW5kb3cuX19iaWxnZVF1ZXJ5U2VsZWN0b3JEZWVwID0gcXVlcnlTZWxlY3RvckRlZXA7XG5cbiAgZnVuY3Rpb24gZWxlbWVudFN1bW1hcnkoZWxlbWVudCkge1xuICAgIGNvbnN0IHRhZyA9IGVsZW1lbnQ/LnRhZ05hbWUgPyBTdHJpbmcoZWxlbWVudC50YWdOYW1lKS50b0xvd2VyQ2FzZSgpIDogJyc7XG4gICAgY29uc3QgaWQgPSBlbGVtZW50Py5pZCA/IFN0cmluZyhlbGVtZW50LmlkKSA6ICcnO1xuICAgIGxldCBjbGFzc2VzID0gJyc7XG4gICAgdHJ5IHtcbiAgICAgIGNsYXNzZXMgPSBlbGVtZW50Py5jbGFzc0xpc3QgPyBBcnJheS5mcm9tKGVsZW1lbnQuY2xhc3NMaXN0KS5zbGljZSgwLCAxMikuam9pbignICcpIDogJyc7XG4gICAgfSBjYXRjaCAoX2Vycikge31cblxuICAgIGNvbnN0IHRleHQgPSB0cnVuY2F0ZShlbGVtZW50Py5pbm5lclRleHQgfHwgZWxlbWVudD8udGV4dENvbnRlbnQgfHwgJycsIDI0MCk7XG5cbiAgICBjb25zdCBhdHRycyA9IHt9O1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBhdHRyaWJ1dGVzID0gZWxlbWVudD8uYXR0cmlidXRlcyA/IEFycmF5LmZyb20oZWxlbWVudC5hdHRyaWJ1dGVzKSA6IFtdO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhdHRyaWJ1dGVzLmxlbmd0aCAmJiBpIDwgMTY7IGkrKykge1xuICAgICAgICBjb25zdCBhdHRyID0gYXR0cmlidXRlc1tpXTtcbiAgICAgICAgaWYgKCFhdHRyPy5uYW1lKSBjb250aW51ZTtcbiAgICAgICAgYXR0cnNbU3RyaW5nKGF0dHIubmFtZSldID0gdHJ1bmNhdGUoYXR0ci52YWx1ZSwgMjAwKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChfZXJyKSB7fVxuXG4gICAgcmV0dXJuIHsgX3R5cGU6ICdFbGVtZW50JywgdGFnLCBpZCwgY2xhc3NlcywgdGV4dCwgYXR0cnMgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGpzb25TYWZlKHZhbHVlLCBzZWVuID0gbmV3IFdlYWtTZXQoKSwgZGVwdGggPSAwKSB7XG4gICAgY29uc3QgTUFYX0RFUFRIID0gNTtcbiAgICBjb25zdCBNQVhfQVJSQVlfSVRFTVMgPSAyMDA7XG4gICAgY29uc3QgTUFYX0tFWVMgPSAyMDA7XG5cbiAgICBpZiAodmFsdWUgPT09IG51bGwpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgdCA9IHR5cGVvZiB2YWx1ZTtcbiAgICBpZiAodCA9PT0gJ3N0cmluZycpIHJldHVybiB0cnVuY2F0ZSh2YWx1ZSwgODAwMCk7XG4gICAgaWYgKHQgPT09ICdudW1iZXInIHx8IHQgPT09ICdib29sZWFuJykgcmV0dXJuIHZhbHVlO1xuICAgIGlmICh0ID09PSAnYmlnaW50JykgcmV0dXJuIHZhbHVlLnRvU3RyaW5nKCk7XG4gICAgaWYgKHQgPT09ICd1bmRlZmluZWQnKSByZXR1cm4gbnVsbDtcbiAgICBpZiAodCA9PT0gJ3N5bWJvbCcpIHJldHVybiB2YWx1ZS50b1N0cmluZygpO1xuICAgIGlmICh0ID09PSAnZnVuY3Rpb24nKSByZXR1cm4gJ1tGdW5jdGlvbl0nO1xuXG4gICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF90eXBlOiAnRXJyb3InLFxuICAgICAgICBuYW1lOiBTdHJpbmcodmFsdWUubmFtZSB8fCAnRXJyb3InKSxcbiAgICAgICAgbWVzc2FnZTogU3RyaW5nKHZhbHVlLm1lc3NhZ2UgfHwgJycpLFxuICAgICAgICBzdGFjazogdHJ1bmNhdGUoU3RyaW5nKHZhbHVlLnN0YWNrIHx8ICcnKSwgNDAwMCksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHJldHVybiB2YWx1ZS50b0lTT1N0cmluZygpO1xuXG4gICAgY29uc3QgaXNFbGVtZW50ID0gdmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZS5ub2RlVHlwZSA9PT0gMSAmJiB0eXBlb2YgdmFsdWUudGFnTmFtZSA9PT0gJ3N0cmluZyc7XG4gICAgaWYgKGlzRWxlbWVudCkgcmV0dXJuIGVsZW1lbnRTdW1tYXJ5KHZhbHVlKTtcblxuICAgIC8vIFN0b3AgcnVuYXdheSByZWN1cnNpb24gLyBjeWNsZXMuXG4gICAgaWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnKSByZXR1cm4gU3RyaW5nKHZhbHVlKTtcbiAgICBpZiAoZGVwdGggPj0gTUFYX0RFUFRIKSByZXR1cm4gJ1tNYXhEZXB0aF0nO1xuICAgIGlmIChzZWVuLmhhcyh2YWx1ZSkpIHJldHVybiAnW0NpcmN1bGFyXSc7XG4gICAgc2Vlbi5hZGQodmFsdWUpO1xuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICByZXR1cm4gdmFsdWUuc2xpY2UoMCwgTUFYX0FSUkFZX0lURU1TKS5tYXAoKHYpID0+IGpzb25TYWZlKHYsIHNlZW4sIGRlcHRoICsgMSkpO1xuICAgIH1cblxuICAgIC8vIE5vZGVMaXN0IC8gSFRNTENvbGxlY3Rpb25cbiAgICB0cnkge1xuICAgICAgY29uc3QgdGFnTmFtZSA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSk7XG4gICAgICBpZiAodGFnTmFtZSA9PT0gJ1tvYmplY3QgTm9kZUxpc3RdJyB8fCB0YWdOYW1lID09PSAnW29iamVjdCBIVE1MQ29sbGVjdGlvbl0nKSB7XG4gICAgICAgIGNvbnN0IGFyciA9IEFycmF5LmZyb20odmFsdWUpO1xuICAgICAgICByZXR1cm4gYXJyLnNsaWNlKDAsIE1BWF9BUlJBWV9JVEVNUykubWFwKCh2KSA9PiBqc29uU2FmZSh2LCBzZWVuLCBkZXB0aCArIDEpKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChfZXJyKSB7fVxuXG4gICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgTWFwKSB7XG4gICAgICBjb25zdCBlbnRyaWVzID0gW107XG4gICAgICBsZXQgaSA9IDA7XG4gICAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiB2YWx1ZS5lbnRyaWVzKCkpIHtcbiAgICAgICAgZW50cmllcy5wdXNoKFtqc29uU2FmZShrLCBzZWVuLCBkZXB0aCArIDEpLCBqc29uU2FmZSh2LCBzZWVuLCBkZXB0aCArIDEpXSk7XG4gICAgICAgIGkrKztcbiAgICAgICAgaWYgKGkgPj0gMTAwKSBicmVhaztcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IF90eXBlOiAnTWFwJywgZW50cmllcyB9O1xuICAgIH1cblxuICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIFNldCkge1xuICAgICAgY29uc3QgdmFsdWVzID0gW107XG4gICAgICBsZXQgaSA9IDA7XG4gICAgICBmb3IgKGNvbnN0IHYgb2YgdmFsdWUudmFsdWVzKCkpIHtcbiAgICAgICAgdmFsdWVzLnB1c2goanNvblNhZmUodiwgc2VlbiwgZGVwdGggKyAxKSk7XG4gICAgICAgIGkrKztcbiAgICAgICAgaWYgKGkgPj0gMjAwKSBicmVhaztcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IF90eXBlOiAnU2V0JywgdmFsdWVzIH07XG4gICAgfVxuXG4gICAgY29uc3Qgb3V0ID0ge307XG4gICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHZhbHVlKTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGtleXMubGVuZ3RoICYmIGkgPCBNQVhfS0VZUzsgaSsrKSB7XG4gICAgICBjb25zdCBrID0ga2V5c1tpXTtcbiAgICAgIHRyeSB7XG4gICAgICAgIG91dFtrXSA9IGpzb25TYWZlKHZhbHVlW2tdLCBzZWVuLCBkZXB0aCArIDEpO1xuICAgICAgfSBjYXRjaCAoX2Vycikge1xuICAgICAgICBvdXRba10gPSAnW1VucmVhZGFibGVdJztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG91dDtcbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVVc2VySmF2YVNjcmlwdChjb2RlLCB0aW1lb3V0TXMpIHtcbiAgICBjb25zdCBBc3luY0Z1bmN0aW9uID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKGFzeW5jIGZ1bmN0aW9uICgpIHt9KS5jb25zdHJ1Y3RvcjtcbiAgICBjb25zdCBmbiA9IG5ldyBBc3luY0Z1bmN0aW9uKFxuICAgICAgJ3F1ZXJ5U2VsZWN0b3JEZWVwJyxcbiAgICAgICd0cnVuY2F0ZScsXG4gICAgICAnZWxlbWVudFN1bW1hcnknLFxuICAgICAgJ1widXNlIHN0cmljdFwiO1xcbicgKyBTdHJpbmcoY29kZSB8fCAnJylcbiAgICApO1xuXG4gICAgY29uc3QgdGltZW91dCA9IE1hdGgubWF4KDAsIE1hdGgubWluKE51bWJlcih0aW1lb3V0TXMpIHx8IERFRkFVTFRfRVhFQ1VURV9KU19USU1FT1VUX01TLCAzMDAwMCkpO1xuICAgIGNvbnN0IHRhc2sgPSBQcm9taXNlLnJlc29sdmUoKS50aGVuKCgpID0+IGZuKHF1ZXJ5U2VsZWN0b3JEZWVwLCB0cnVuY2F0ZSwgZWxlbWVudFN1bW1hcnkpKTtcbiAgICBpZiAoIXRpbWVvdXQpIHJldHVybiBhd2FpdCB0YXNrO1xuXG4gICAgcmV0dXJuIGF3YWl0IFByb21pc2UucmFjZShbXG4gICAgICB0YXNrLFxuICAgICAgbmV3IFByb21pc2UoKF8sIHJlamVjdCkgPT4gc2V0VGltZW91dCgoKSA9PiByZWplY3QobmV3IEVycm9yKGBUaW1lb3V0IGFmdGVyICR7dGltZW91dH1tc2ApKSwgdGltZW91dCkpLFxuICAgIF0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEV4ZWN1dGUgYSBuYXR1cmFsIGxhbmd1YWdlIGFjdGlvbiBwYXJzZWQgYnkgY29ydGV4XG4gICAqL1xuICBhc3luYyBmdW5jdGlvbiBleGVjdXRlTmF0dXJhbEFjdGlvbihhY3Rpb24sIHBhcnNlZCkge1xuICAgIGlmICghYWN0aW9uIHx8ICFhY3Rpb24udHlwZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGFjdGlvbjogbWlzc2luZyB0eXBlJyk7XG4gICAgfVxuXG4gICAgc3dpdGNoIChhY3Rpb24udHlwZSkge1xuICAgICAgY2FzZSAnc2Nyb2xsJzpcbiAgICAgICAgcmV0dXJuIGV4ZWN1dGVTY3JvbGxBY3Rpb24oYWN0aW9uLCBwYXJzZWQpO1xuICAgICAgY2FzZSAnY2xpY2snOlxuICAgICAgICByZXR1cm4gZXhlY3V0ZUNsaWNrQWN0aW9uKGFjdGlvbiwgcGFyc2VkKTtcbiAgICAgIGNhc2UgJ3R5cGUnOlxuICAgICAgICByZXR1cm4gZXhlY3V0ZVR5cGVBY3Rpb24oYWN0aW9uLCBwYXJzZWQpO1xuICAgICAgY2FzZSAnd2FpdCc6XG4gICAgICAgIHJldHVybiBleGVjdXRlV2FpdEFjdGlvbihhY3Rpb24pO1xuICAgICAgY2FzZSAnbmF2aWdhdGUnOlxuICAgICAgICByZXR1cm4gZXhlY3V0ZU5hdmlnYXRlQWN0aW9uKGFjdGlvbik7XG4gICAgICBjYXNlICdzY3JpcHQnOlxuICAgICAgICByZXR1cm4gZXhlY3V0ZVNjcmlwdEFjdGlvbihhY3Rpb24pO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBhY3Rpb24gdHlwZTogJHthY3Rpb24udHlwZX1gKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBleGVjdXRlU2Nyb2xsQWN0aW9uKGFjdGlvbiwgcGFyc2VkKSB7XG4gICAgY29uc3QgZGlyZWN0aW9uID0gcGFyc2VkPy5kaXJlY3Rpb24gfHwgJ2Rvd24nO1xuXG4gICAgLy8gQWJzb2x1dGUgc2Nyb2xsXG4gICAgaWYgKGFjdGlvbi5zY3JvbGxUbykge1xuICAgICAgaWYgKGFjdGlvbi5zY3JvbGxUby50b3AgPT09IDApIHtcbiAgICAgICAgd2luZG93LnNjcm9sbFRvKHsgdG9wOiAwLCBiZWhhdmlvcjogJ3Ntb290aCcgfSk7XG4gICAgICB9IGVsc2UgaWYgKGFjdGlvbi5zY3JvbGxUby50b3AgPT09ICdtYXgnKSB7XG4gICAgICAgIHdpbmRvdy5zY3JvbGxUbyh7IHRvcDogZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNjcm9sbEhlaWdodCwgYmVoYXZpb3I6ICdzbW9vdGgnIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgc3RhdHVzOiAnc2Nyb2xsZWQnLCBkaXJlY3Rpb24sIHR5cGU6ICdhYnNvbHV0ZScgfTtcbiAgICB9XG5cbiAgICAvLyBSZWxhdGl2ZSBzY3JvbGxcbiAgICBjb25zdCBzY3JvbGxPcHRpb25zID0geyBiZWhhdmlvcjogJ3Ntb290aCcgfTtcbiAgICBpZiAoYWN0aW9uLmhvcml6b250YWwgIT09IHVuZGVmaW5lZCkge1xuICAgICAgc2Nyb2xsT3B0aW9ucy5sZWZ0ID0gYWN0aW9uLmhvcml6b250YWw7XG4gICAgICBzY3JvbGxPcHRpb25zLnRvcCA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNjcm9sbE9wdGlvbnMudG9wID0gYWN0aW9uLmFtb3VudCB8fCAzMDA7XG4gICAgICBzY3JvbGxPcHRpb25zLmxlZnQgPSAwO1xuICAgIH1cblxuICAgIHdpbmRvdy5zY3JvbGxCeShzY3JvbGxPcHRpb25zKTtcbiAgICByZXR1cm4geyBzdGF0dXM6ICdzY3JvbGxlZCcsIGRpcmVjdGlvbiwgYW1vdW50OiBhY3Rpb24uYW1vdW50IHx8IGFjdGlvbi5ob3Jpem9udGFsLCB0eXBlOiAncmVsYXRpdmUnIH07XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBleGVjdXRlQ2xpY2tBY3Rpb24oYWN0aW9uLCBwYXJzZWQpIHtcbiAgICAvLyBJZiB1c2luZyBkZWljdGljIHJlZmVyZW5jZSwgdHJ5IHRvIGZpbmQgZWxlbWVudCB1bmRlciBjdXJzb3Igb3IgdXNlIGxhc3QgZm9jdXNlZFxuICAgIGlmIChhY3Rpb24udXNlQ29udGV4dCkge1xuICAgICAgLy8gRm9yIFwiY2xpY2sgdGhpcy90aGF0XCIgd2UgbmVlZCBjb250ZXh0IC0gdHJ5IHRvIGZpbmQgZm9jdXNlZC9hY3RpdmUgZWxlbWVudFxuICAgICAgY29uc3QgYWN0aXZlRWwgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuICAgICAgaWYgKGFjdGl2ZUVsICYmIGFjdGl2ZUVsICE9PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgICAgIGFjdGl2ZUVsLmNsaWNrKCk7XG4gICAgICAgIHJldHVybiB7IHN0YXR1czogJ2NsaWNrZWQnLCB0YXJnZXQ6ICdhY3RpdmUtZWxlbWVudCcsIHRhZzogYWN0aXZlRWwudGFnTmFtZSB9O1xuICAgICAgfVxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBlbGVtZW50IGluIGNvbnRleHQgZm9yIGRlaWN0aWMgY2xpY2sgcmVmZXJlbmNlJyk7XG4gICAgfVxuXG4gICAgLy8gVHJ5IHRvIGZpbmQgZWxlbWVudCBieSBsYWJlbC9uYW1lL2ZpZWxkXG4gICAgY29uc3QgdGFyZ2V0ID0gYWN0aW9uLmxhYmVsIHx8IGFjdGlvbi5maWVsZCB8fCBhY3Rpb24ubmFtZTtcbiAgICBpZiAoIXRhcmdldCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyB0YXJnZXQgc3BlY2lmaWVkIGZvciBjbGljaycpO1xuICAgIH1cblxuICAgIGxldCBtZW1vcnlIaXQgPSBmYWxzZTtcbiAgICBsZXQgZWxlbWVudCA9IG51bGw7XG4gICAgY29uc3QgbWVtb3J5TWF0Y2ggPSBhd2FpdCBtYXRjaERvbVNraWxsKCdjbGljaycsIHRhcmdldCk7XG4gICAgaWYgKG1lbW9yeU1hdGNoPy5lbGVtZW50KSB7XG4gICAgICBlbGVtZW50ID0gbWVtb3J5TWF0Y2guZWxlbWVudDtcbiAgICAgIG1lbW9yeUhpdCA9IHRydWU7XG4gICAgfVxuXG4gICAgaWYgKCFlbGVtZW50KSB7XG4gICAgICBlbGVtZW50ID0gZmluZEVsZW1lbnRCeUhldXJpc3RpYyh7IGxhYmVsOiB0YXJnZXQsIGZpZWxkOiB0YXJnZXQsIG5hbWU6IHRhcmdldCB9LCBudWxsKTtcbiAgICB9XG4gICAgaWYgKCFlbGVtZW50KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCBmaW5kIGVsZW1lbnQgbWF0Y2hpbmc6IFwiJHt0YXJnZXR9XCJgKTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgZWxlbWVudC5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnYXV0bycsIGJsb2NrOiAnY2VudGVyJyB9KTtcbiAgICB9IGNhdGNoIChfZXJyKSB7fVxuXG4gICAgZWxlbWVudC5jbGljaygpO1xuICAgIGF3YWl0IGxlYXJuRG9tU2tpbGwoJ2NsaWNrJywgdGFyZ2V0LCBlbGVtZW50KTtcbiAgICByZXR1cm4geyBzdGF0dXM6ICdjbGlja2VkJywgdGFyZ2V0LCB0YWc6IGVsZW1lbnQudGFnTmFtZSwgbWVtb3J5SGl0IH07XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBleGVjdXRlVHlwZUFjdGlvbihhY3Rpb24sIHBhcnNlZCkge1xuICAgIGxldCB2YWx1ZSA9IGFjdGlvbi52YWx1ZSA/PyAnJztcbiAgICBjb25zdCB0YXJnZXQgPSBhY3Rpb24ubGFiZWwgfHwgYWN0aW9uLmZpZWxkIHx8IGFjdGlvbi5uYW1lIHx8IHBhcnNlZD8udGFyZ2V0IHx8ICcnO1xuICAgIGNvbnN0IGNvcHlGcm9tID0gU3RyaW5nKGFjdGlvbi5jb3B5RnJvbSB8fCBwYXJzZWQ/LmNvcHlGcm9tIHx8ICcnKS50cmltKCk7XG4gICAgbGV0IG1lbW9yeUhpdCA9IGZhbHNlO1xuXG4gICAgY29uc3QgcmVzb2x2ZUZpZWxkRWxlbWVudCA9IGFzeW5jIChoaW50KSA9PiB7XG4gICAgICBjb25zdCBub3JtYWxpemVkSGludCA9IFN0cmluZyhoaW50IHx8ICcnKS50cmltKCk7XG4gICAgICBpZiAoIW5vcm1hbGl6ZWRIaW50KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTWlzc2luZyBmaWVsZCBoaW50Jyk7XG4gICAgICB9XG5cbiAgICAgIGxldCByZXNvbHZlZCA9IG51bGw7XG4gICAgICBjb25zdCBtZW1vcnlNYXRjaCA9IGF3YWl0IG1hdGNoRG9tU2tpbGwoJ3R5cGUnLCBub3JtYWxpemVkSGludCk7XG4gICAgICBpZiAobWVtb3J5TWF0Y2g/LmVsZW1lbnQpIHtcbiAgICAgICAgcmVzb2x2ZWQgPSBtZW1vcnlNYXRjaC5lbGVtZW50O1xuICAgICAgICBtZW1vcnlIaXQgPSB0cnVlO1xuICAgICAgfVxuICAgICAgaWYgKCFyZXNvbHZlZCkge1xuICAgICAgICByZXNvbHZlZCA9IGZpbmRFbGVtZW50QnlIZXVyaXN0aWMoXG4gICAgICAgICAgeyBsYWJlbDogbm9ybWFsaXplZEhpbnQsIGZpZWxkOiBub3JtYWxpemVkSGludCwgbmFtZTogbm9ybWFsaXplZEhpbnQsIHBsYWNlaG9sZGVyOiBub3JtYWxpemVkSGludCB9LFxuICAgICAgICAgIG51bGxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmICghcmVzb2x2ZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgZmluZCBpbnB1dCBmaWVsZCBtYXRjaGluZzogXCIke25vcm1hbGl6ZWRIaW50fVwiYCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzb2x2ZWQ7XG4gICAgfTtcblxuICAgIGNvbnN0IHJlYWRGaWVsZFZhbHVlID0gKGVsZW1lbnQpID0+IHtcbiAgICAgIGlmICghZWxlbWVudCkgcmV0dXJuICcnO1xuICAgICAgY29uc3QgdGFnID0gU3RyaW5nKGVsZW1lbnQudGFnTmFtZSB8fCAnJykudG9VcHBlckNhc2UoKTtcbiAgICAgIGlmICh0YWcgPT09ICdJTlBVVCcgfHwgdGFnID09PSAnVEVYVEFSRUEnIHx8IHRhZyA9PT0gJ1NFTEVDVCcpIHtcbiAgICAgICAgcmV0dXJuIFN0cmluZyhlbGVtZW50LnZhbHVlID8/ICcnKTtcbiAgICAgIH1cbiAgICAgIGlmIChlbGVtZW50LmlzQ29udGVudEVkaXRhYmxlKSB7XG4gICAgICAgIHJldHVybiBTdHJpbmcoZWxlbWVudC50ZXh0Q29udGVudCA/PyAnJyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gJyc7XG4gICAgfTtcblxuICAgIGlmIChjb3B5RnJvbSkge1xuICAgICAgY29uc3Qgc291cmNlRWxlbWVudCA9IGF3YWl0IHJlc29sdmVGaWVsZEVsZW1lbnQoY29weUZyb20pO1xuICAgICAgY29uc3Qgc291cmNlVmFsdWUgPSByZWFkRmllbGRWYWx1ZShzb3VyY2VFbGVtZW50KTtcbiAgICAgIGlmICghc291cmNlVmFsdWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBTb3VyY2UgZmllbGQgXCIke2NvcHlGcm9tfVwiIGlzIGVtcHR5YCk7XG4gICAgICB9XG4gICAgICB2YWx1ZSA9IHNvdXJjZVZhbHVlO1xuICAgIH1cblxuICAgIC8vIElmIGEgZmllbGQgdGFyZ2V0IGlzIHByb3ZpZGVkLCByZXNvbHZlIHRoYXQgc3BlY2lmaWMgaW5wdXQgZGV0ZXJtaW5pc3RpY2FsbHkuXG4gICAgbGV0IGVsZW1lbnQgPSBudWxsO1xuICAgIGlmICh0YXJnZXQpIHtcbiAgICAgIGVsZW1lbnQgPSBhd2FpdCByZXNvbHZlRmllbGRFbGVtZW50KHRhcmdldCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIExlZ2FjeSBmYWxsYmFjayBwYXRoIHdoZW4gbm8gdGFyZ2V0IHdhcyBzcGVjaWZpZWQuXG4gICAgICBlbGVtZW50ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcbiAgICAgIGNvbnN0IHRhZyA9IGVsZW1lbnQ/LnRhZ05hbWU/LnRvVXBwZXJDYXNlKCk7XG4gICAgICBpZiAodGFnICE9PSAnSU5QVVQnICYmIHRhZyAhPT0gJ1RFWFRBUkVBJyAmJiAhZWxlbWVudD8uaXNDb250ZW50RWRpdGFibGUpIHtcbiAgICAgICAgY29uc3QgaW5wdXRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKTpub3QoW3R5cGU9XCJzdWJtaXRcIl0pOm5vdChbdHlwZT1cImJ1dHRvblwiXSksIHRleHRhcmVhJyk7XG4gICAgICAgIGZvciAoY29uc3QgaW5wdXQgb2YgaW5wdXRzKSB7XG4gICAgICAgICAgaWYgKGlzVXNhYmxlRmllbGQoaW5wdXQpKSB7XG4gICAgICAgICAgICBlbGVtZW50ID0gaW5wdXQ7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIWVsZW1lbnQgfHwgKGVsZW1lbnQudGFnTmFtZSAhPT0gJ0lOUFVUJyAmJiBlbGVtZW50LnRhZ05hbWUgIT09ICdURVhUQVJFQScgJiYgIWVsZW1lbnQuaXNDb250ZW50RWRpdGFibGUpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGlucHV0IGZpZWxkIGZvdW5kIHRvIHR5cGUgaW50bycpO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbmFsVmFsdWUgPSBTdHJpbmcodmFsdWUgPz8gJycpO1xuICAgIGVsZW1lbnQuZm9jdXMoKTtcbiAgICBpZiAoZWxlbWVudC50YWdOYW1lID09PSAnSU5QVVQnIHx8IGVsZW1lbnQudGFnTmFtZSA9PT0gJ1RFWFRBUkVBJykge1xuICAgICAgc2V0TmF0aXZlVmFsdWUoZWxlbWVudCwgZmluYWxWYWx1ZSk7XG4gICAgICBkaXNwYXRjaElucHV0RXZlbnRzKGVsZW1lbnQpO1xuICAgIH0gZWxzZSBpZiAoZWxlbWVudC5pc0NvbnRlbnRFZGl0YWJsZSkge1xuICAgICAgZWxlbWVudC50ZXh0Q29udGVudCA9IGZpbmFsVmFsdWU7XG4gICAgICBkaXNwYXRjaElucHV0RXZlbnRzKGVsZW1lbnQpO1xuICAgIH1cblxuICAgIGlmICh0YXJnZXQpIHtcbiAgICAgIGF3YWl0IGxlYXJuRG9tU2tpbGwoJ3R5cGUnLCB0YXJnZXQsIGVsZW1lbnQpO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6ICd0eXBlZCcsXG4gICAgICB2YWx1ZTogZmluYWxWYWx1ZS5zbGljZSgwLCA1MCksXG4gICAgICB0YXJnZXQ6IHRhcmdldCB8fCBudWxsLFxuICAgICAgY29waWVkRnJvbTogY29weUZyb20gfHwgbnVsbCxcbiAgICAgIG1lbW9yeUhpdFxuICAgIH07XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBleGVjdXRlV2FpdEFjdGlvbihhY3Rpb24pIHtcbiAgICBjb25zdCBkdXJhdGlvbiA9IGFjdGlvbi5kdXJhdGlvbiB8fCAxMDAwO1xuICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBkdXJhdGlvbikpO1xuICAgIHJldHVybiB7IHN0YXR1czogJ3dhaXRlZCcsIGR1cmF0aW9uIH07XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBleGVjdXRlTmF2aWdhdGVBY3Rpb24oYWN0aW9uKSB7XG4gICAgLy8gTmF2aWdhdGlvbiBhY3Rpb25zIGFyZSBhY3R1YWxseSBzY3JpcHRzXG4gICAgaWYgKGFjdGlvbi5jb2RlKSB7XG4gICAgICBjb25zdCBBc3luY0Z1bmN0aW9uID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKGFzeW5jIGZ1bmN0aW9uICgpIHt9KS5jb25zdHJ1Y3RvcjtcbiAgICAgIGNvbnN0IGZuID0gbmV3IEFzeW5jRnVuY3Rpb24oYWN0aW9uLmNvZGUpO1xuICAgICAgYXdhaXQgZm4oKTtcbiAgICB9XG4gICAgcmV0dXJuIHsgc3RhdHVzOiAnbmF2aWdhdGVkJywgYWN0aW9uOiBhY3Rpb24uYWN0aW9uIH07XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBleGVjdXRlU2NyaXB0QWN0aW9uKGFjdGlvbikge1xuICAgIGNvbnN0IGNvZGUgPSBhY3Rpb24uY29kZSB8fCAnJztcbiAgICBpZiAoIWNvZGUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gc2NyaXB0IGNvZGUgcHJvdmlkZWQnKTtcbiAgICB9XG5cbiAgICBjb25zdCBBc3luY0Z1bmN0aW9uID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKGFzeW5jIGZ1bmN0aW9uICgpIHt9KS5jb25zdHJ1Y3RvcjtcbiAgICBjb25zdCBmbiA9IG5ldyBBc3luY0Z1bmN0aW9uKGNvZGUpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZuKCk7XG4gICAgcmV0dXJuIHsgc3RhdHVzOiAnZXhlY3V0ZWQnLCByZXN1bHQgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGV4cGxhaW5VbnJlY29nbml6ZWROYXR1cmFsQ29tbWFuZChjb21tYW5kKSB7XG4gICAgY29uc3QgdGV4dCA9IFN0cmluZyhjb21tYW5kIHx8ICcnKS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAoIXRleHQpIHJldHVybiAnJztcblxuICAgIGlmICgvXFxiKGNvcHlcXHMrZnJvbXxmcm9tKVxcYi8udGVzdCh0ZXh0KSAmJiAvXFxiKGZpbGx8c2V0fGNvcHkpXFxiLy50ZXN0KHRleHQpKSB7XG4gICAgICByZXR1cm4gJ1RyeTogYGZpbGwgPHRhcmdldCBmaWVsZD4gZnJvbSA8c291cmNlIGZpZWxkPmAgb3IgYGNvcHkgPHNvdXJjZSBmaWVsZD4gaW50byA8dGFyZ2V0IGZpZWxkPmAuJztcbiAgICB9XG4gICAgaWYgKC9cXGIoZmlsbCg/Olxccytpbik/fHNldClcXGIvLnRlc3QodGV4dCkgJiYgIS9cXGIod2l0aHxhc3xpbnRvfGlufHRvKVxcYi8udGVzdCh0ZXh0KSkge1xuICAgICAgcmV0dXJuICdDb21tYW5kIGlzIG1pc3NpbmcgYSB2YWx1ZS4gVHJ5OiBgd3JpdGUgPHZhbHVlPiBpbnRvIDxmaWVsZD5gIG9yIGBmaWxsIDxmaWVsZD4gd2l0aCA8dmFsdWU+YC4nO1xuICAgIH1cbiAgICBpZiAoL1xcYih3cml0ZXx0eXBlfGVudGVyfGlucHV0KVxcYi8udGVzdCh0ZXh0KSAmJiAhL1xcYihpbnRvfGlufHRvKVxcYi8udGVzdCh0ZXh0KSkge1xuICAgICAgcmV0dXJuICdDb21tYW5kIGlzIG1pc3NpbmcgYSB0YXJnZXQgZmllbGQuIFRyeTogYHdyaXRlIDx2YWx1ZT4gaW50byA8ZmllbGQ+YC4nO1xuICAgIH1cblxuICAgIHJldHVybiAnJztcbiAgfVxuXG4gIC8vIFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFxuICAvLyBSRVNJTElFTlQgTkFUVVJBTCBDT01NQU5EIEVYRUNVVE9SXG4gIC8vIFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFxuXG4gIC8qKlxuICAgKiBFeGVjdXRlIG5hdHVyYWwgbGFuZ3VhZ2UgY29tbWFuZCB3aXRoIG11bHRpLWxldmVsIGZhbGxiYWNrXG4gICAqL1xuICBhc3luYyBmdW5jdGlvbiBleGVjdXRlUmVzaWxpZW50TmF0dXJhbENvbW1hbmQoY29tbWFuZCkge1xuICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG4gICAgY29uc3QgcmVzdWx0ID0ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgcHJvdG9jb2w6ICduYXR1cmFsLWNvbW1hbmQtdjMnLFxuICAgICAgY29tbWFuZDogY29tbWFuZCxcbiAgICAgIGV4ZWN1dG9yOiBudWxsLFxuICAgICAgZHVyYXRpb25NczogMFxuICAgIH07XG5cbiAgICBjb250ZW50TG9nZ2VyLmluZm8oJ0V4ZWN1dGluZyByZXNpbGllbnQgbmF0dXJhbCBjb21tYW5kJywgeyBjb21tYW5kIH0pO1xuXG4gICAgLy8gTEVWRUwgMTogVHJ5IENvcnRleCAoaW50ZWxsaWdlbnQgcm91dGluZylcbiAgICBpZiAod2luZG93LkJpbGdlQ29ydGV4Py5wYXJzZUNvbW1hbmQgfHwgd2luZG93Ll9fYmlsZ2VfY29ydGV4X2xvYWRlZCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSBhd2FpdCByZXNvbHZlTmF0dXJhbENvbW1hbmQoY29tbWFuZCk7XG4gICAgICAgIGlmIChyZXNvbHZlZCAmJiAhcmVzb2x2ZWQuZXJyb3IgJiYgcmVzb2x2ZWQuZXhlY3V0YWJsZSkge1xuICAgICAgICAgIGNvbnN0IGV4ZWNSZXN1bHQgPSBhd2FpdCBleGVjdXRlTmF0dXJhbEFjdGlvbihyZXNvbHZlZC5leGVjdXRhYmxlLCByZXNvbHZlZC5wYXJzZWQpO1xuICAgICAgICAgIGlmIChleGVjUmVzdWx0KSB7XG4gICAgICAgICAgICAvLyBQZXJzaXN0IFwicmVwYWlyZWRcIiBjb21tYW5kcyBzbyBmdXR1cmUgaW52b2NhdGlvbnMgY2FuIHNraXAgdGhlIHJlY292ZXJ5IGxvb3AuXG4gICAgICAgICAgICAvLyBXZSBvbmx5IHJlbWVtYmVyIHNlbGYtaGVhbGVkIGNvbW1hbmRzIHRvIGF2b2lkIHN0b3JpbmcgZXZlcnkgcmF3IHByb21wdCAoYW5kIHRoZWlyIHZhbHVlcykuXG4gICAgICAgICAgICBpZiAocmVzb2x2ZWQucmVwYWlyZWQpIHtcbiAgICAgICAgICAgICAgcmVtZW1iZXJOYXR1cmFsQ29tbWFuZChjb21tYW5kLCByZXNvbHZlZC5jYW5vbmljYWxDb21tYW5kLCByZXNvbHZlZC5yZXBhaXJlZCkuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzdWx0Lm9rID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlc3VsdC5leGVjdXRvciA9ICdjb3J0ZXgnO1xuICAgICAgICAgICAgcmVzdWx0LnBhcnNlZCA9IHJlc29sdmVkLnBhcnNlZDtcbiAgICAgICAgICAgIHJlc3VsdC5yZXN1bHQgPSBleGVjUmVzdWx0O1xuICAgICAgICAgICAgcmVzdWx0LmR1cmF0aW9uTXMgPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29udGVudExvZ2dlci53YXJuKCdDb3J0ZXggZXhlY3V0aW9uIGZhaWxlZCwgdHJ5aW5nIGZhbGxiYWNrcycsIHsgZXJyb3I6IGUubWVzc2FnZSB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBMRVZFTCAyOiBUcnkgSW50ZWxsaWdlbnQgRE9NIEVuZ2luZSAobm8gQUkgbmVlZGVkKVxuICAgIGlmICh3aW5kb3cuX19iaWxnZV9leGVjdXRpb25fZW5naW5lKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBlbmdpbmUgPSB3aW5kb3cuX19iaWxnZV9leGVjdXRpb25fZW5naW5lO1xuICAgICAgICBjb25zdCBleGVjUmVzdWx0ID0gYXdhaXQgZW5naW5lLnJ1bihjb21tYW5kKTtcblxuICAgICAgICBpZiAoZXhlY1Jlc3VsdCAmJiBleGVjUmVzdWx0Lm9rKSB7XG4gICAgICAgICAgcmVzdWx0Lm9rID0gdHJ1ZTtcbiAgICAgICAgICByZXN1bHQuZXhlY3V0b3IgPSAnZG9tX2VuZ2luZSc7XG4gICAgICAgICAgcmVzdWx0LnJlc3VsdCA9IGV4ZWNSZXN1bHQ7XG4gICAgICAgICAgcmVzdWx0LmR1cmF0aW9uTXMgPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29udGVudExvZ2dlci53YXJuKCdET00gRW5naW5lIGV4ZWN1dGlvbiBmYWlsZWQsIHRyeWluZyBmaW5hbCBmYWxsYmFjaycsIHsgZXJyb3I6IGUubWVzc2FnZSB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBMRVZFTCAzOiBQYXR0ZXJuLWJhc2VkIGRpcmVjdCBleGVjdXRpb24gKGxhc3QgcmVzb3J0KVxuICAgIHRyeSB7XG4gICAgICBjb25zdCBkaXJlY3RSZXN1bHQgPSBhd2FpdCBleGVjdXRlRGlyZWN0UGF0dGVybihjb21tYW5kKTtcbiAgICAgIGlmIChkaXJlY3RSZXN1bHQgJiYgZGlyZWN0UmVzdWx0Lm9rKSB7XG4gICAgICAgIHJlc3VsdC5vayA9IHRydWU7XG4gICAgICAgIHJlc3VsdC5leGVjdXRvciA9ICdkaXJlY3RfcGF0dGVybic7XG4gICAgICAgIHJlc3VsdC5yZXN1bHQgPSBkaXJlY3RSZXN1bHQ7XG4gICAgICAgIHJlc3VsdC5kdXJhdGlvbk1zID0gRGF0ZS5ub3coKSAtIHN0YXJ0VGltZTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb250ZW50TG9nZ2VyLndhcm4oJ0RpcmVjdCBwYXR0ZXJuIGV4ZWN1dGlvbiBmYWlsZWQnLCB7IGVycm9yOiBlLm1lc3NhZ2UgfSk7XG4gICAgfVxuXG4gICAgLy8gQWxsIGZhbGxiYWNrcyBleGhhdXN0ZWRcbiAgICByZXN1bHQuZXJyb3IgPSAnQWxsIGV4ZWN1dGlvbiBzdHJhdGVnaWVzIGZhaWxlZCc7XG4gICAgcmVzdWx0LmR1cmF0aW9uTXMgPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xuICAgIHJlc3VsdC5hdHRlbXB0ZWQgPSBbJ2NvcnRleCcsICdkb21fZW5naW5lJywgJ2RpcmVjdF9wYXR0ZXJuJ107XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBEaXJlY3QgcGF0dGVybiBleGVjdXRpb24gLSBubyBBSSwgbm8gY29tcGxleCBwYXJzaW5nXG4gICAqL1xuICBhc3luYyBmdW5jdGlvbiBleGVjdXRlRGlyZWN0UGF0dGVybihjb21tYW5kKSB7XG4gICAgY29uc3QgcmF3ID0gU3RyaW5nKGNvbW1hbmQgfHwgJycpO1xuICAgIGNvbnN0IGNtZCA9IHJhdy50b0xvd2VyQ2FzZSgpLnRyaW0oKTtcblxuICAgIC8vIFBlcnNpc3Qgc2ltcGxlIHN0YXRlIHBlciBwYWdlIHNvIFwiY29udGludWUvbmV4dFwiIGNhbiBhZHZhbmNlIGZpZWxkLWJ5LWZpZWxkIGZsb3dzLlxuICAgIGNvbnN0IHN0YXRlID0gKHdpbmRvdy5fX2JpbGdlX2RpcmVjdF9maWxsX2Zvcm1fc3RhdGUgPVxuICAgICAgd2luZG93Ll9fYmlsZ2VfZGlyZWN0X2ZpbGxfZm9ybV9zdGF0ZSB8fCB7IHN0ZXBNb2RlOiBmYWxzZSwgbm9TdWJtaXQ6IGZhbHNlLCB1cGRhdGVkQXQ6IDAgfSk7XG5cbiAgICBjb25zdCBzdGVwUmVxdWVzdGVkID1cbiAgICAgIC9cXGIob25lXFxzK2ZpZWxkXFxzK2F0XFxzK2FcXHMrdGltZXxmaWVsZFxccytieVxccytmaWVsZHxzdGVwXFxzK2J5XFxzK3N0ZXB8b25lXFxzK2J5XFxzK29uZXxvbmVcXHMrYXRcXHMrYVxccyt0aW1lKVxcYi9pLnRlc3QocmF3KTtcbiAgICBjb25zdCBub1N1Ym1pdFJlcXVlc3RlZCA9XG4gICAgICAvXFxiKGRvXFxzK25vdHxkb24ndHxkb250fG5vKVxccytzdWJtaXRcXGJ8XFxid2l0aG91dFxccytzdWJtaXR0aW5nXFxifFxcYm5vXFxzK3N1Ym1pc3Npb25cXGIvaS50ZXN0KHJhdyk7XG5cbiAgICBpZiAoc3RlcFJlcXVlc3RlZCkgc3RhdGUuc3RlcE1vZGUgPSB0cnVlO1xuICAgIGlmIChub1N1Ym1pdFJlcXVlc3RlZCkgc3RhdGUubm9TdWJtaXQgPSB0cnVlO1xuICAgIHN0YXRlLnVwZGF0ZWRBdCA9IERhdGUubm93KCk7XG5cbiAgICBjb25zdCB3YW50c05leHRGaWVsZCA9XG4gICAgICAvXig/OmNvbnRpbnVlfG5leHR8cHJvY2VlZCkoPzpcXHMrKD86ZmllbGR8aW5wdXQpKT9cXHMqJC9pLnRlc3QoY21kKSB8fCAvXFxibmV4dFxccytmaWVsZFxcYi9pLnRlc3QocmF3KTtcbiAgICBpZiAoc3RhdGUuc3RlcE1vZGUgJiYgd2FudHNOZXh0RmllbGQpIHtcbiAgICAgIHJldHVybiBhd2FpdCBmaWxsVmlzaWJsZUZvcm1GaWVsZHMoeyBzdGVwOiB0cnVlIH0pO1xuICAgIH1cblxuICAgIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBGSUxMIEZPUk0gUEFUVEVSTiAoQ29udmVyc2F0aW9uYWwpIFx1MjUwMFx1MjUwMFx1MjUwMFxuICAgIGNvbnN0IGxvb2tzTGlrZUZpbGxGb3JtID1cbiAgICAgIGNtZC5tYXRjaCgvXihmaWxsfGNvbXBsZXRlfHBvcHVsYXRlfHllc3xkb1xccytpdHxwbGVhc2V8Y29udGludWV8cHJvY2VlZClcXHMqKGZvcm18ZmllbGRzP3xhbGx8dGhlbXxpbik/KFxccytub3cpPyQvaSkgfHxcbiAgICAgIGNtZC5tYXRjaCgvXih5ZXNcXHMrKT9maWxsXFxzK3RoZW1cXHMraW4kL2kpIHx8XG4gICAgICBjbWQubWF0Y2goL15nb1xccythaGVhZCQvaSkgfHxcbiAgICAgICgvXFxiKGZpbGx8Y29tcGxldGV8cG9wdWxhdGUpXFxiL2kudGVzdChyYXcpICYmIC9cXGIoZm9ybXxmaWVsZHM/KVxcYi9pLnRlc3QocmF3KSk7XG5cbiAgICBpZiAobG9va3NMaWtlRmlsbEZvcm0pIHtcbiAgICAgIC8vIEFsbG93IGFuIGV4cGxpY2l0IFwiZmlsbCBhbGxcIiBjb21tYW5kIHRvIGJyZWFrIG91dCBvZiBzdGVwIG1vZGUuXG4gICAgICBjb25zdCB3YW50c0FsbCA9XG4gICAgICAgIC9cXGIoYWxsfGV2ZXJ5dGhpbmcpXFxiL2kudGVzdChyYXcpICYmIC9cXGIoZmllbGRzP3xmb3JtKVxcYi9pLnRlc3QocmF3KSAmJiAhc3RlcFJlcXVlc3RlZDtcbiAgICAgIGlmICh3YW50c0FsbCkgc3RhdGUuc3RlcE1vZGUgPSBmYWxzZTtcbiAgICAgIHJldHVybiBhd2FpdCBmaWxsVmlzaWJsZUZvcm1GaWVsZHMoeyBzdGVwOiAhIXN0YXRlLnN0ZXBNb2RlIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbGxNYXRjaCA9IGNtZC5tYXRjaCgvXihmaWxsfHR5cGV8ZW50ZXIpXFxzKyg/OmluXFxzKyk/W1wiJ10/KC4rPylbXCInXT9cXHMrKD86d2l0aHxhc3x0b3w9KVxccytbXCInXT8oLis/KVtcIiddPyQvaSk7XG4gICAgaWYgKGZpbGxNYXRjaCkge1xuICAgICAgY29uc3QgWywgLCBmaWVsZEhpbnQsIHZhbHVlXSA9IGZpbGxNYXRjaDtcbiAgICAgIHJldHVybiBhd2FpdCBmaWxsRmllbGRCeUhpbnQoZmllbGRIaW50LCB2YWx1ZSk7XG4gICAgfVxuXG4gICAgY29uc3QgY2xpY2tNYXRjaCA9IGNtZC5tYXRjaCgvXihjbGlja3xwcmVzc3x0YXB8c2VsZWN0fGNob29zZSlcXHMrKD86b25cXHMrKT9bXCInXT8oLis/KVtcIiddPyQvaSk7XG4gICAgaWYgKGNsaWNrTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssICwgdGFyZ2V0SGludF0gPSBjbGlja01hdGNoO1xuICAgICAgcmV0dXJuIGF3YWl0IGNsaWNrQnlIaW50KHRhcmdldEhpbnQpO1xuICAgIH1cblxuICAgIGlmIChjbWQubWF0Y2goL14oc3VibWl0fGNvbnRpbnVlfG5leHR8cHJvY2VlZHxzYXZlKS9pKSkge1xuICAgICAgaWYgKHN0YXRlLm5vU3VibWl0KSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdTdWJtaXNzaW9uIGJsb2NrZWQgKG5vLXN1Ym1pdCBtb2RlKS4nLCBibG9ja2VkOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gYXdhaXQgc3VibWl0Q3VycmVudEZvcm0oKTtcbiAgICB9XG5cbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnTm8gbWF0Y2hpbmcgcGF0dGVybicgfTtcbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGZpbGxWaXNpYmxlRm9ybUZpZWxkcyhvcHRpb25zID0ge30pIHtcbiAgICBjb25zdCBvcHRzID0gb3B0aW9ucyAmJiB0eXBlb2Ygb3B0aW9ucyA9PT0gJ29iamVjdCcgPyBvcHRpb25zIDoge307XG4gICAgY29uc3Qgc3RlcCA9ICEhb3B0cy5zdGVwO1xuICAgIGNvbnN0IGZpZWxkcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSk6bm90KFtkaXNhYmxlZF0pLCBzZWxlY3Q6bm90KFtkaXNhYmxlZF0pLCB0ZXh0YXJlYTpub3QoW2Rpc2FibGVkXSknKTtcbiAgICBjb25zdCByZXN1bHRzID0gW107XG4gICAgbGV0IGZpbGxlZE9rID0gMDtcbiAgICBsZXQgZWxpZ2libGUgPSAwO1xuXG4gICAgbGV0IHByb2ZpbGUgPSB7fTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFsnYmlsZ2VfdXNlcl9wcm9maWxlJ10pO1xuICAgICAgcHJvZmlsZSA9IHJlc3VsdC5iaWxnZV91c2VyX3Byb2ZpbGUgfHwge307XG4gICAgfSBjYXRjaCAoZSkge31cblxuICAgIGNvbnN0IHNhbXBsZXMgPSB7XG4gICAgICBlbWFpbDogcHJvZmlsZS5lbWFpbCB8fCAndXNlckBleGFtcGxlLmNvbScsXG4gICAgICBmaXJzdE5hbWU6IHByb2ZpbGUuZmlyc3ROYW1lIHx8ICdKb2huJyxcbiAgICAgIGxhc3ROYW1lOiBwcm9maWxlLmxhc3ROYW1lIHx8ICdEb2UnLFxuICAgICAgcGhvbmU6IHByb2ZpbGUucGhvbmUgfHwgJzU1NS0wMTAwJyxcbiAgICAgIGFkZHJlc3M6IHByb2ZpbGUuYWRkcmVzczEgfHwgcHJvZmlsZS5hZGRyZXNzIHx8ICcnLFxuICAgICAgY2l0eTogcHJvZmlsZS5jaXR5IHx8ICcnLFxuICAgICAgc3RhdGU6IHByb2ZpbGUuc3RhdGUgfHwgJycsXG4gICAgICB6aXA6IHByb2ZpbGUuemlwQ29kZSB8fCBwcm9maWxlLnppcCB8fCAnJ1xuICAgIH07XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIGZpZWxkcykge1xuICAgICAgaWYgKCFpc0VsZW1lbnRWaXNpYmxlKGZpZWxkKSkgY29udGludWU7XG4gICAgICBpZiAoZmllbGQudmFsdWUgJiYgZmllbGQudmFsdWUudHJpbSgpKSBjb250aW51ZTtcblxuICAgICAgY29uc3Qgc2VtYW50aWNUeXBlID0gaW5mZXJGaWVsZFR5cGVGcm9tSGludHMoZmllbGQpO1xuICAgICAgY29uc3QgdmFsdWUgPSBzYW1wbGVzW3NlbWFudGljVHlwZV07XG5cbiAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICBlbGlnaWJsZSArPSAxO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmaWVsZC5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJywgYmxvY2s6ICdjZW50ZXInIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHt9XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZpZWxkLmZvY3VzKCk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge31cbiAgICAgICAgICBzZXROYXRpdmVWYWx1ZShmaWVsZCwgdmFsdWUpO1xuICAgICAgICAgIGRpc3BhdGNoSW5wdXRFdmVudHMoZmllbGQpO1xuICAgICAgICAgIHJlc3VsdHMucHVzaCh7IGZpZWxkOiBnZXRGaWVsZElkKGZpZWxkKSwgdmFsdWUsIG9rOiB0cnVlIH0pO1xuICAgICAgICAgIGZpbGxlZE9rICs9IDE7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZXN1bHRzLnB1c2goeyBmaWVsZDogZ2V0RmllbGRJZChmaWVsZCksIGVycm9yOiBlLm1lc3NhZ2UsIG9rOiBmYWxzZSB9KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc3RlcCAmJiBmaWxsZWRPayA+PSAxKSBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBsZXQgbWVzc2FnZSA9ICcnO1xuICAgIGlmIChmaWxsZWRPayA9PT0gMCkge1xuICAgICAgaWYgKGVsaWdpYmxlID09PSAwKSBtZXNzYWdlID0gJ05vIGVsaWdpYmxlIGVtcHR5IGZpZWxkcyB3aXRoIGtub3duIHByb2ZpbGUvc2FtcGxlIHZhbHVlcyB3ZXJlIGZvdW5kLic7XG4gICAgICBlbHNlIG1lc3NhZ2UgPSAnTm8gZmllbGRzIHdlcmUgZmlsbGVkLic7XG4gICAgfVxuICAgIHJldHVybiB7IG9rOiB0cnVlLCBmaWxsZWQ6IGZpbGxlZE9rLCBlbGlnaWJsZSwgc3RlcCwgcmVzdWx0cywgLi4uKG1lc3NhZ2UgPyB7IG1lc3NhZ2UgfSA6IHt9KSB9O1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gZmlsbEZpZWxkQnlIaW50KGhpbnQsIHZhbHVlKSB7XG4gICAgY29uc3QgdGFyZ2V0ID0gU3RyaW5nKGhpbnQgfHwgJycpLnRyaW0oKTtcbiAgICBsZXQgZWxlbWVudCA9IG51bGw7XG4gICAgbGV0IG1lbW9yeUhpdCA9IGZhbHNlO1xuXG4gICAgY29uc3QgbWVtb3J5TWF0Y2ggPSBhd2FpdCBtYXRjaERvbVNraWxsKCd0eXBlJywgdGFyZ2V0KTtcbiAgICBpZiAobWVtb3J5TWF0Y2g/LmVsZW1lbnQpIHtcbiAgICAgIGVsZW1lbnQgPSBtZW1vcnlNYXRjaC5lbGVtZW50O1xuICAgICAgbWVtb3J5SGl0ID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoIWVsZW1lbnQpIHtcbiAgICAgIGVsZW1lbnQgPSBmaW5kRWxlbWVudEJ5SGV1cmlzdGljKHsgbGFiZWw6IHRhcmdldCwgZmllbGQ6IHRhcmdldCwgbmFtZTogdGFyZ2V0LCBwbGFjZWhvbGRlcjogdGFyZ2V0IH0sIG51bGwpO1xuICAgIH1cblxuICAgIGlmICghZWxlbWVudCkge1xuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYEZpZWxkIG5vdCBmb3VuZDogJHtoaW50fWAgfTtcbiAgICB9XG5cbiAgICBzZXROYXRpdmVWYWx1ZShlbGVtZW50LCB2YWx1ZSk7XG4gICAgZGlzcGF0Y2hJbnB1dEV2ZW50cyhlbGVtZW50KTtcbiAgICBhd2FpdCBsZWFybkRvbVNraWxsKCd0eXBlJywgdGFyZ2V0LCBlbGVtZW50KTtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgZmllbGQ6IGdldEZpZWxkSWQoZWxlbWVudCksIHZhbHVlLCBtZW1vcnlIaXQgfTtcbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGNsaWNrQnlIaW50KGhpbnQpIHtcbiAgICBjb25zdCB0YXJnZXQgPSBTdHJpbmcoaGludCB8fCAnJykudHJpbSgpO1xuICAgIGxldCBlbGVtZW50ID0gbnVsbDtcbiAgICBsZXQgbWVtb3J5SGl0ID0gZmFsc2U7XG5cbiAgICBjb25zdCBtZW1vcnlNYXRjaCA9IGF3YWl0IG1hdGNoRG9tU2tpbGwoJ2NsaWNrJywgdGFyZ2V0KTtcbiAgICBpZiAobWVtb3J5TWF0Y2g/LmVsZW1lbnQpIHtcbiAgICAgIGVsZW1lbnQgPSBtZW1vcnlNYXRjaC5lbGVtZW50O1xuICAgICAgbWVtb3J5SGl0ID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoIWVsZW1lbnQpIHtcbiAgICAgIGVsZW1lbnQgPSBmaW5kRWxlbWVudEJ5SGV1cmlzdGljKHsgbGFiZWw6IHRhcmdldCwgZmllbGQ6IHRhcmdldCwgbmFtZTogdGFyZ2V0LCBwbGFjZWhvbGRlcjogdGFyZ2V0IH0sIG51bGwpO1xuICAgIH1cblxuICAgIGlmICghZWxlbWVudCkge1xuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYENsaWNrIHRhcmdldCBub3QgZm91bmQ6ICR7aGludH1gIH07XG4gICAgfVxuXG4gICAgZWxlbWVudC5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJywgYmxvY2s6ICdjZW50ZXInIH0pO1xuICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMDApKTtcbiAgICBlbGVtZW50LmNsaWNrKCk7XG4gICAgYXdhaXQgbGVhcm5Eb21Ta2lsbCgnY2xpY2snLCB0YXJnZXQsIGVsZW1lbnQpO1xuICAgIHJldHVybiB7IG9rOiB0cnVlLCBjbGlja2VkOiBnZXRGaWVsZElkKGVsZW1lbnQpLCBtZW1vcnlIaXQgfTtcbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIHN1Ym1pdEN1cnJlbnRGb3JtKCkge1xuICAgIGNvbnN0IGJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvblt0eXBlPVwic3VibWl0XCJdLCBpbnB1dFt0eXBlPVwic3VibWl0XCJdJyk7XG4gICAgaWYgKGJ0bikge1xuICAgICAgYnRuLmNsaWNrKCk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgYWN0aW9uOiAnc3VibWl0X2NsaWNrZWQnIH07XG4gICAgfVxuICAgIGNvbnN0IGZvcm0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdmb3JtJyk7XG4gICAgaWYgKGZvcm0pIHtcbiAgICAgIGZvcm0uc3VibWl0KCk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgYWN0aW9uOiAnZm9ybV9zdWJtaXR0ZWQnIH07XG4gICAgfVxuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdObyBzdWJtaXQgYnV0dG9uIG9yIGZvcm0gZm91bmQnIH07XG4gIH1cblxuICBmdW5jdGlvbiBpbmZlckZpZWxkVHlwZUZyb21IaW50cyhmaWVsZCkge1xuICAgIGNvbnN0IHRleHQgPSAoZmllbGQubmFtZSArICcgJyArIGZpZWxkLmlkICsgJyAnICsgZmllbGQucGxhY2Vob2xkZXIpLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKHRleHQuaW5jbHVkZXMoJ2VtYWlsJykpIHJldHVybiAnZW1haWwnO1xuICAgIGlmICh0ZXh0LmluY2x1ZGVzKCdmaXJzdCcpKSByZXR1cm4gJ2ZpcnN0TmFtZSc7XG4gICAgaWYgKHRleHQuaW5jbHVkZXMoJ2xhc3QnKSkgcmV0dXJuICdsYXN0TmFtZSc7XG4gICAgaWYgKHRleHQuaW5jbHVkZXMoJ3Bob25lJykgfHwgdGV4dC5pbmNsdWRlcygndGVsJykpIHJldHVybiAncGhvbmUnO1xuICAgIGlmICh0ZXh0LmluY2x1ZGVzKCd6aXAnKSB8fCB0ZXh0LmluY2x1ZGVzKCdwb3N0JykpIHJldHVybiAnemlwJztcbiAgICBpZiAodGV4dC5pbmNsdWRlcygnY2l0eScpKSByZXR1cm4gJ2NpdHknO1xuICAgIGlmICh0ZXh0LmluY2x1ZGVzKCdzdGF0ZScpKSByZXR1cm4gJ3N0YXRlJztcbiAgICBpZiAodGV4dC5pbmNsdWRlcygnYWRkcmVzcycpKSByZXR1cm4gJ2FkZHJlc3MnO1xuICAgIHJldHVybiAndW5rbm93bic7XG4gIH1cblxuICBmdW5jdGlvbiBpc0VsZW1lbnRWaXNpYmxlKGVsKSB7XG4gICAgY29uc3QgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIHJldHVybiByZWN0LndpZHRoID4gMCAmJiByZWN0LmhlaWdodCA+IDAgJiYgZ2V0Q29tcHV0ZWRTdHlsZShlbCkuZGlzcGxheSAhPT0gJ25vbmUnO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0RmllbGRJZChlbCkge1xuICAgIHJldHVybiBlbC5pZCB8fCBlbC5uYW1lIHx8IGVsLnRhZ05hbWUudG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIGNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcigocmVxdWVzdCwgc2VuZGVyLCBzZW5kUmVzcG9uc2UpID0+IHtcbiAgICB0cnkge1xuICAgICAgaWYgKCFyZXF1ZXN0IHx8IHR5cGVvZiByZXF1ZXN0ICE9PSAnb2JqZWN0Jykge1xuICAgICAgICBzZW5kUmVzcG9uc2UoeyBlcnJvcjogJ0ludmFsaWQgcmVxdWVzdCBwYXlsb2FkLicgfSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVxdWVzdC50eXBlID09PSAnX19CSUxHRV9QSU5HX18nKSB7XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlIH0pO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ0dFVF9QQUdFX0lORk8nKSB7XG4gICAgICAgIGNvbnRlbnRMb2dnZXIuaW5mbygnR0VUX1BBR0VfSU5GTyByZXF1ZXN0ZWQnKTtcbiAgICAgICAgY29uc3QgYm9keVRleHQgPSBkb2N1bWVudC5ib2R5ID8gZG9jdW1lbnQuYm9keS5pbm5lclRleHQgOiAnJztcbiAgICAgICAgc2VuZFJlc3BvbnNlKHtcbiAgICAgICAgICB1cmw6IHdpbmRvdy5sb2NhdGlvbi5ocmVmLFxuICAgICAgICAgIHRpdGxlOiBkb2N1bWVudC50aXRsZSB8fCAnJyxcbiAgICAgICAgICBkZXNjcmlwdGlvbjogZG9jdW1lbnQucXVlcnlTZWxlY3RvcignbWV0YVtuYW1lPVwiZGVzY3JpcHRpb25cIl0nKT8uY29udGVudCB8fCAnJyxcbiAgICAgICAgICBodG1sOiB0cnVuY2F0ZShib2R5VGV4dCwgTUFYX1BBR0VfVEVYVF9DSEFSUykgLy8gVGV4dC1vbmx5IHN1bW1hcnkgZm9yIGNvbnRleHRcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVxdWVzdC50eXBlID09PSAnRVhQTE9SRV9ET00nKSB7XG4gICAgICAgIGNvbnN0IHNlbGVjdG9yID0gcmVxdWVzdC5zZWxlY3RvciB8fCAnYm9keSc7XG4gICAgICAgIGxldCBlbGVtZW50ID0gbnVsbDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBlbGVtZW50ID0gcXVlcnlTZWxlY3RvckRlZXAoc2VsZWN0b3IpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoZGVzY3JpYmVSZXN0cmljdGVkU2VsZWN0b3JFcnJvcihzZWxlY3RvciwgZXJyKSk7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWVsZW1lbnQpIHtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBlcnJvcjogYFNlbGVjdG9yICR7c2VsZWN0b3J9IG5vdCBmb3VuZC5gIH0pO1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgaHRtbCA9IGVsZW1lbnQub3V0ZXJIVE1MIHx8ICcnO1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IHtcbiAgICAgICAgICBodG1sOiB0cnVuY2F0ZShodG1sLCBNQVhfSFRNTF9DSEFSUyksXG4gICAgICAgICAgdXJsOiB3aW5kb3cubG9jYXRpb24uaHJlZlxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChlbGVtZW50LnNoYWRvd1Jvb3QpIHtcbiAgICAgICAgICByZXNwb25zZS5zaGFkb3dfaHRtbCA9IHRydW5jYXRlKGVsZW1lbnQuc2hhZG93Um9vdC5pbm5lckhUTUwgfHwgJycsIE1BWF9TSEFET1dfSFRNTF9DSEFSUyk7XG4gICAgICAgIH1cblxuICAgICAgICBzZW5kUmVzcG9uc2UocmVzcG9uc2UpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ0NMSUNLX0VMRU1FTlQnKSB7XG4gICAgICAgIGNvbnN0IHNlbGVjdG9yID0gcmVxdWVzdC5zZWxlY3RvcjtcbiAgICAgICAgY29udGVudExvZ2dlci5pbmZvKCdDTElDS19FTEVNRU5UIHJlcXVlc3RlZCcsIHsgc2VsZWN0b3IsIGZpZWxkOiByZXF1ZXN0LmZpZWxkLCBuYW1lOiByZXF1ZXN0Lm5hbWUgfSk7XG5cbiAgICAgICAgaWYgKCFzZWxlY3RvciAmJiAhcmVxdWVzdC5maWVsZCAmJiAhcmVxdWVzdC5uYW1lICYmICFyZXF1ZXN0LmxhYmVsKSB7XG4gICAgICAgICAgY29udGVudExvZ2dlci53YXJuKCdDTElDS19FTEVNRU5UIG1pc3Npbmcgc2VsZWN0b3IvaGludHMnKTtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBlcnJvcjogJ01pc3Npbmcgc2VsZWN0b3Igb3IgaGV1cmlzdGljIGhpbnRzIChmaWVsZCwgbmFtZSwgbGFiZWwpLicgfSk7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgZWxlbWVudCA9IG51bGw7XG4gICAgICAgIGxldCBtYXRjaGVkQnkgPSAnJztcblxuICAgICAgICAvLyBUcnkgc2VsZWN0b3IgZmlyc3RcbiAgICAgICAgaWYgKHNlbGVjdG9yKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGVsZW1lbnQgPSBxdWVyeVNlbGVjdG9yRGVlcChzZWxlY3Rvcik7XG4gICAgICAgICAgICBpZiAoZWxlbWVudCkgbWF0Y2hlZEJ5ID0gJ3NlbGVjdG9yJztcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGNvbnRlbnRMb2dnZXIud2FybignSW52YWxpZCBzZWxlY3RvciBmb3IgY2xpY2snLCB7IHNlbGVjdG9yLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICAvLyBJbnZhbGlkIHNlbGVjdG9yLCBidXQgbWlnaHQgaGF2ZSBoZXVyaXN0aWMgaGludHNcbiAgICAgICAgICAgIGlmICghcmVxdWVzdC5maWVsZCAmJiAhcmVxdWVzdC5uYW1lICYmICFyZXF1ZXN0LmxhYmVsKSB7XG4gICAgICAgICAgICAgIHNlbmRSZXNwb25zZShkZXNjcmliZVJlc3RyaWN0ZWRTZWxlY3RvckVycm9yKHNlbGVjdG9yLCBlcnIpKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gaGV1cmlzdGljIG1hdGNoaW5nIGlmIHNlbGVjdG9yIGZhaWxlZFxuICAgICAgICBpZiAoIWVsZW1lbnQgJiYgKHJlcXVlc3QuZmllbGQgfHwgcmVxdWVzdC5uYW1lIHx8IHJlcXVlc3QubGFiZWwgfHwgcmVxdWVzdC5wbGFjZWhvbGRlcikpIHtcbiAgICAgICAgICBlbGVtZW50ID0gZmluZEVsZW1lbnRCeUhldXJpc3RpYyhyZXF1ZXN0LCBzZWxlY3Rvcik7XG4gICAgICAgICAgaWYgKGVsZW1lbnQpIG1hdGNoZWRCeSA9ICdoZXVyaXN0aWMnO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFlbGVtZW50KSB7XG4gICAgICAgICAgY29uc3QgaGludHMgPSBbcmVxdWVzdC5maWVsZCwgcmVxdWVzdC5uYW1lLCByZXF1ZXN0LmxhYmVsXS5maWx0ZXIoQm9vbGVhbikuam9pbignLCAnKTtcbiAgICAgICAgICBjb250ZW50TG9nZ2VyLndhcm4oJ0NMSUNLX0VMRU1FTlQgZWxlbWVudCBub3QgZm91bmQnLCB7IHNlbGVjdG9yLCBoaW50cyB9KTtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBlcnJvcjogYEVsZW1lbnQgbm90IGZvdW5kLiBTZWxlY3RvcjogJHtzZWxlY3RvciB8fCAnKG5vbmUpJ30sIEhpbnRzOiAke2hpbnRzIHx8ICcobm9uZSknfWAgfSk7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgIGVsZW1lbnQuc2Nyb2xsSW50b1ZpZXcoeyBiZWhhdmlvcjogJ2F1dG8nLCBibG9jazogJ2NlbnRlcicsIGlubGluZTogJ2NlbnRlcicgfSk7XG4gICAgICAgIH0gY2F0Y2ggKF9lcnIpIHt9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBlbGVtZW50LmNsaWNrKCk7XG4gICAgICAgICAgY29udGVudExvZ2dlci5pbmZvKCdDTElDS19FTEVNRU5UIHN1Y2Nlc3MnLCB7IG1hdGNoZWRCeSwgdGFnOiBlbGVtZW50LnRhZ05hbWUgfSk7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3RhdHVzOiAnY2xpY2tlZCcsIG1hdGNoZWRCeSB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgY29udGVudExvZ2dlci5lcnJvcignQ0xJQ0tfRUxFTUVOVCBmYWlsZWQnLCB7IGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBlcnJvcjogYENsaWNrIGZhaWxlZDogJHtlcnIubWVzc2FnZX1gIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVxdWVzdC50eXBlID09PSAnVFlQRV9URVhUJykge1xuICAgICAgICBjb25zdCBzZWxlY3RvciA9IHJlcXVlc3Quc2VsZWN0b3I7XG4gICAgICAgIGNvbnN0IHRleHQgPSByZXF1ZXN0LnRleHQgPz8gJyc7XG4gICAgICAgIGNvbnN0IHRleHRQcmV2aWV3ID0gU3RyaW5nKHRleHQpLnNsaWNlKDAsIDUwKTtcbiAgICAgICAgY29udGVudExvZ2dlci5pbmZvKCdUWVBFX1RFWFQgcmVxdWVzdGVkJywgeyBzZWxlY3RvciwgdGV4dFByZXZpZXcsIGZpZWxkOiByZXF1ZXN0LmZpZWxkIH0pO1xuXG4gICAgICAgIGlmICghc2VsZWN0b3IgJiYgIXJlcXVlc3QuZmllbGQgJiYgIXJlcXVlc3QubmFtZSAmJiAhcmVxdWVzdC5sYWJlbCkge1xuICAgICAgICAgIGNvbnRlbnRMb2dnZXIud2FybignVFlQRV9URVhUIG1pc3Npbmcgc2VsZWN0b3IvaGludHMnKTtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBlcnJvcjogJ01pc3Npbmcgc2VsZWN0b3Igb3IgaGV1cmlzdGljIGhpbnRzIChmaWVsZCwgbmFtZSwgbGFiZWwpLicgfSk7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgZWxlbWVudCA9IG51bGw7XG4gICAgICAgIGxldCBtYXRjaGVkQnkgPSAnJztcblxuICAgICAgICAvLyBUcnkgc2VsZWN0b3IgZmlyc3RcbiAgICAgICAgaWYgKHNlbGVjdG9yKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGVsZW1lbnQgPSBxdWVyeVNlbGVjdG9yRGVlcChzZWxlY3Rvcik7XG4gICAgICAgICAgICBpZiAoZWxlbWVudCkgbWF0Y2hlZEJ5ID0gJ3NlbGVjdG9yJztcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGNvbnRlbnRMb2dnZXIud2FybignSW52YWxpZCBzZWxlY3RvciBmb3IgdHlwZScsIHsgc2VsZWN0b3IsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIC8vIEludmFsaWQgc2VsZWN0b3IsIGJ1dCBtaWdodCBoYXZlIGhldXJpc3RpYyBoaW50c1xuICAgICAgICAgICAgaWYgKCFyZXF1ZXN0LmZpZWxkICYmICFyZXF1ZXN0Lm5hbWUgJiYgIXJlcXVlc3QubGFiZWwpIHtcbiAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKGRlc2NyaWJlUmVzdHJpY3RlZFNlbGVjdG9yRXJyb3Ioc2VsZWN0b3IsIGVycikpO1xuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGYWxsYmFjayB0byBoZXVyaXN0aWMgbWF0Y2hpbmcgaWYgc2VsZWN0b3IgZmFpbGVkXG4gICAgICAgIGlmICghZWxlbWVudCAmJiAocmVxdWVzdC5maWVsZCB8fCByZXF1ZXN0Lm5hbWUgfHwgcmVxdWVzdC5sYWJlbCB8fCByZXF1ZXN0LnBsYWNlaG9sZGVyKSkge1xuICAgICAgICAgIGVsZW1lbnQgPSBmaW5kRWxlbWVudEJ5SGV1cmlzdGljKHJlcXVlc3QsIHNlbGVjdG9yKTtcbiAgICAgICAgICBpZiAoZWxlbWVudCkgbWF0Y2hlZEJ5ID0gJ2hldXJpc3RpYyc7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWVsZW1lbnQpIHtcbiAgICAgICAgICBjb25zdCBoaW50cyA9IFtyZXF1ZXN0LmZpZWxkLCByZXF1ZXN0Lm5hbWUsIHJlcXVlc3QubGFiZWxdLmZpbHRlcihCb29sZWFuKS5qb2luKCcsICcpO1xuICAgICAgICAgIGNvbnRlbnRMb2dnZXIud2FybignVFlQRV9URVhUIGVsZW1lbnQgbm90IGZvdW5kJywgeyBzZWxlY3RvciwgaGludHMgfSk7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgZXJyb3I6IGBFbGVtZW50IG5vdCBmb3VuZC4gU2VsZWN0b3I6ICR7c2VsZWN0b3IgfHwgJyhub25lKSd9LCBIaW50czogJHtoaW50cyB8fCAnKG5vbmUpJ31gIH0pO1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBlbGVtZW50LmZvY3VzKCk7XG5cbiAgICAgICAgICBjb25zdCB0YWcgPSBTdHJpbmcoZWxlbWVudD8udGFnTmFtZSB8fCAnJykudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICBpZiAodGFnID09PSAnSU5QVVQnIHx8IHRhZyA9PT0gJ1RFWFRBUkVBJykge1xuICAgICAgICAgICAgc2V0TmF0aXZlVmFsdWUoZWxlbWVudCwgdGV4dCk7XG4gICAgICAgICAgICBkaXNwYXRjaElucHV0RXZlbnRzKGVsZW1lbnQpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZWxlbWVudC5pc0NvbnRlbnRFZGl0YWJsZSkge1xuICAgICAgICAgICAgZWxlbWVudC50ZXh0Q29udGVudCA9IFN0cmluZyh0ZXh0KTtcbiAgICAgICAgICAgIGRpc3BhdGNoSW5wdXRFdmVudHMoZWxlbWVudCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVsZW1lbnQudGV4dENvbnRlbnQgPSBTdHJpbmcodGV4dCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29udGVudExvZ2dlci5pbmZvKCdUWVBFX1RFWFQgc3VjY2VzcycsIHsgbWF0Y2hlZEJ5LCB0YWc6IGVsZW1lbnQudGFnTmFtZSB9KTtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdGF0dXM6ICd0eXBlZCcsIG1hdGNoZWRCeSB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgY29udGVudExvZ2dlci5lcnJvcignVFlQRV9URVhUIGZhaWxlZCcsIHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IGVycm9yOiBgVHlwZSBmYWlsZWQ6ICR7ZXJyLm1lc3NhZ2V9YCB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ0VYVFJBQ1RfRk9STV9GSUVMRFMnKSB7XG4gICAgICAgIGNvbnRlbnRMb2dnZXIuaW5mbygnRVhUUkFDVF9GT1JNX0ZJRUxEUyByZXF1ZXN0ZWQnKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBmb3JtRmllbGRzID0gW107XG4gICAgICAgICAgY29uc3QgYWxsSW5wdXRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QsIFtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdJyk7XG5cbiAgICAgICAgICBsZXQgZmllbGRJbmRleCA9IDA7XG4gICAgICAgICAgZm9yIChjb25zdCBlbGVtZW50IG9mIGFsbElucHV0cykge1xuICAgICAgICAgICAgaWYgKCFpc1VzYWJsZUZpZWxkKGVsZW1lbnQpKSBjb250aW51ZTtcblxuICAgICAgICAgICAgY29uc3QgdGFnID0gZWxlbWVudC50YWdOYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICBjb25zdCB0eXBlID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3R5cGUnKSB8fCAodGFnID09PSAndGV4dGFyZWEnID8gJ3RleHRhcmVhJyA6IHRhZyA9PT0gJ3NlbGVjdCcgPyAnc2VsZWN0JyA6ICd0ZXh0Jyk7XG5cbiAgICAgICAgICAgIC8vIFNraXAgaGlkZGVuLCBzdWJtaXQsIGJ1dHRvbiwgaW1hZ2UsIGZpbGUsIHJlc2V0IHR5cGVzXG4gICAgICAgICAgICBpZiAoWydoaWRkZW4nLCAnc3VibWl0JywgJ2J1dHRvbicsICdpbWFnZScsICdmaWxlJywgJ3Jlc2V0J10uaW5jbHVkZXModHlwZSkpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBjb25zdCBpZCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdpZCcpIHx8ICcnO1xuICAgICAgICAgICAgY29uc3QgbmFtZSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCduYW1lJykgfHwgJyc7XG4gICAgICAgICAgICBjb25zdCBwbGFjZWhvbGRlciA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdwbGFjZWhvbGRlcicpIHx8ICcnO1xuICAgICAgICAgICAgY29uc3QgYXV0b2NvbXBsZXRlID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2F1dG9jb21wbGV0ZScpIHx8ICcnO1xuICAgICAgICAgICAgY29uc3QgYXJpYUxhYmVsID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCAnJztcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsVGV4dCA9IGZpbmRMYWJlbFRleHQoZWxlbWVudCk7XG5cbiAgICAgICAgICAgIC8vIEdldCBjdXJyZW50IHZhbHVlXG4gICAgICAgICAgICBsZXQgY3VycmVudFZhbHVlID0gJyc7XG4gICAgICAgICAgICBpZiAoZWxlbWVudC5pc0NvbnRlbnRFZGl0YWJsZSkge1xuICAgICAgICAgICAgICBjdXJyZW50VmFsdWUgPSBlbGVtZW50LnRleHRDb250ZW50IHx8ICcnO1xuICAgICAgICAgICAgfSBlbHNlIGlmICgndmFsdWUnIGluIGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgY3VycmVudFZhbHVlID0gZWxlbWVudC52YWx1ZSB8fCAnJztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQnVpbGQgYSB1bmlxdWUgc2VsZWN0b3IgZm9yIHRoaXMgZmllbGRcbiAgICAgICAgICAgIGxldCBzZWxlY3RvciA9ICcnO1xuICAgICAgICAgICAgaWYgKGlkKSB7XG4gICAgICAgICAgICAgIHNlbGVjdG9yID0gYCMke0NTUy5lc2NhcGUoaWQpfWA7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG5hbWUpIHtcbiAgICAgICAgICAgICAgc2VsZWN0b3IgPSBgJHt0YWd9W25hbWU9XCIke0NTUy5lc2NhcGUobmFtZSl9XCJdYDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vIEZhbGxiYWNrIHRvIG50aC1vZi10eXBlIHNlbGVjdG9yXG4gICAgICAgICAgICAgIGNvbnN0IHBhcmVudCA9IGVsZW1lbnQucGFyZW50RWxlbWVudDtcbiAgICAgICAgICAgICAgaWYgKHBhcmVudCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNpYmxpbmdzID0gQXJyYXkuZnJvbShwYXJlbnQucXVlcnlTZWxlY3RvckFsbCh0YWcpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBpbmRleCA9IHNpYmxpbmdzLmluZGV4T2YoZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgaWYgKGluZGV4ID49IDApIHtcbiAgICAgICAgICAgICAgICAgIHNlbGVjdG9yID0gYCR7dGFnfTpudGgtb2YtdHlwZSgke2luZGV4ICsgMX0pYDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9ybUZpZWxkcy5wdXNoKHtcbiAgICAgICAgICAgICAgaW5kZXg6IGZpZWxkSW5kZXgrKyxcbiAgICAgICAgICAgICAgc2VsZWN0b3IsXG4gICAgICAgICAgICAgIHRhZyxcbiAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICAgIHBsYWNlaG9sZGVyLFxuICAgICAgICAgICAgICBhdXRvY29tcGxldGUsXG4gICAgICAgICAgICAgIGFyaWFMYWJlbCxcbiAgICAgICAgICAgICAgbGFiZWw6IGxhYmVsVGV4dC50cmltKCkuc2xpY2UoMCwgMjAwKSxcbiAgICAgICAgICAgICAgY3VycmVudFZhbHVlOiBjdXJyZW50VmFsdWUuc2xpY2UoMCwgNTAwKSxcbiAgICAgICAgICAgICAgaXNSZXF1aXJlZDogZWxlbWVudC5oYXNBdHRyaWJ1dGUoJ3JlcXVpcmVkJykgfHwgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtcmVxdWlyZWQnKSA9PT0gJ3RydWUnXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb250ZW50TG9nZ2VyLmluZm8oYEVYVFJBQ1RfRk9STV9GSUVMRFMgZm91bmQgJHtmb3JtRmllbGRzLmxlbmd0aH0gZmllbGRzYCk7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHtcbiAgICAgICAgICAgIGZpZWxkczogZm9ybUZpZWxkcyxcbiAgICAgICAgICAgIHBhZ2VVcmw6IHdpbmRvdy5sb2NhdGlvbi5ocmVmLFxuICAgICAgICAgICAgcGFnZVRpdGxlOiBkb2N1bWVudC50aXRsZSB8fCAnJ1xuICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBjb25zdCBtZXNzYWdlID0gZXJyICYmIGVyci5tZXNzYWdlID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyIHx8ICdVbmtub3duIGVycm9yJyk7XG4gICAgICAgICAgY29udGVudExvZ2dlci5lcnJvcignRVhUUkFDVF9GT1JNX0ZJRUxEUyBmYWlsZWQnLCB7IGVycm9yOiBtZXNzYWdlIH0pO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IGVycm9yOiBgRXh0cmFjdCBmb3JtIGZpZWxkcyBmYWlsZWQ6ICR7bWVzc2FnZX1gIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVxdWVzdC50eXBlID09PSAnRVhFQ1VURV9KUycpIHtcbiAgICAgICAgY29uc3QgY29kZSA9IFN0cmluZyhyZXF1ZXN0LmNvZGUgfHwgJycpO1xuICAgICAgICBjb25zdCBjb2RlUHJldmlldyA9IGNvZGUuc2xpY2UoMCwgODApO1xuICAgICAgICBjb250ZW50TG9nZ2VyLmluZm8oJ0VYRUNVVEVfSlMgcmVxdWVzdGVkJywgeyBjb2RlTGVuZ3RoOiBjb2RlLmxlbmd0aCwgY29kZVByZXZpZXcgfSk7XG5cbiAgICAgICAgaWYgKCFjb2RlLnRyaW0oKSkge1xuICAgICAgICAgIGNvbnRlbnRMb2dnZXIud2FybignRVhFQ1VURV9KUyBtaXNzaW5nIGNvZGUnKTtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBlcnJvcjogJ01pc3NpbmcgY29kZS4nIH0pO1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjb2RlLmxlbmd0aCA+IE1BWF9FWEVDVVRFX0pTX0NPREVfQ0hBUlMpIHtcbiAgICAgICAgICBjb250ZW50TG9nZ2VyLndhcm4oJ0VYRUNVVEVfSlMgY29kZSB0b28gbGFyZ2UnLCB7IGNvZGVMZW5ndGg6IGNvZGUubGVuZ3RoIH0pO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IGVycm9yOiBgQ29kZSB0b28gbGFyZ2UgKCR7Y29kZS5sZW5ndGh9IGNoYXJzKS4gTWF4IGlzICR7TUFYX0VYRUNVVEVfSlNfQ09ERV9DSEFSU30uYCB9KTtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRpbWVvdXRNcyA9IHJlcXVlc3QudGltZW91dF9tcztcblxuICAgICAgICBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgIC50aGVuKCgpID0+IGV4ZWN1dGVVc2VySmF2YVNjcmlwdChjb2RlLCB0aW1lb3V0TXMpKVxuICAgICAgICAgIC50aGVuKChyZXN1bHQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHNhZmUgPSBqc29uU2FmZShyZXN1bHQpO1xuICAgICAgICAgICAgbGV0IGpzb24gPSAnJztcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGpzb24gPSBKU09OLnN0cmluZ2lmeShzYWZlKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgICAgICAgICAganNvbiA9ICcnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGpzb24pIGpzb24gPSB0cnVuY2F0ZShqc29uLCBNQVhfRVhFQ1VURV9KU19SRVNVTFRfQ0hBUlMpO1xuICAgICAgICAgICAgY29udGVudExvZ2dlci5pbmZvKCdFWEVDVVRFX0pTIHN1Y2Nlc3MnLCB7IHJlc3VsdExlbmd0aDoganNvbj8ubGVuZ3RoIHx8IDAgfSk7XG4gICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogdHJ1ZSwgcmVzdWx0OiBzYWZlLCBqc29uIH0pO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnIgJiYgZXJyLm1lc3NhZ2UgPyBTdHJpbmcoZXJyLm1lc3NhZ2UpIDogU3RyaW5nKGVyciB8fCAnVW5rbm93biBlcnJvcicpO1xuICAgICAgICAgICAgY29udGVudExvZ2dlci5lcnJvcignRVhFQ1VURV9KUyBmYWlsZWQnLCB7IGVycm9yOiBtZXNzYWdlIH0pO1xuICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgZXJyb3I6IGBFeGVjdXRlIEpTIGZhaWxlZDogJHttZXNzYWdlfWAgfSk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdDQU5DRUxfQ1VSUkVOVF9BQ1RJT04nKSB7XG4gICAgICAgIGNvbnRlbnRMb2dnZXIuaW5mbygnQ0FOQ0VMX0NVUlJFTlRfQUNUSU9OIHJlcXVlc3RlZCcpO1xuICAgICAgICAvLyBDdXJyZW50bHkgd2UgZG9uJ3QgaGF2ZSBhIHdheSB0byBzdG9wIGEgcnVubmluZyBhY3Rpb24gZWFzaWx5LFxuICAgICAgICAvLyBidXQgd2UgY2FuIGF0IGxlYXN0IGNsZWFyIGhpZ2hsaWdodHMuXG4gICAgICAgIGlmICh3aW5kb3cuX19iaWxnZV9ydW50aW1lKSB7XG4gICAgICAgICAgd2luZG93Ll9fYmlsZ2VfcnVudGltZS51cGRhdGVIaWdobGlnaHQobnVsbCk7XG4gICAgICAgIH1cbiAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IHRydWUgfSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBIYW5kbGUgbmF0dXJhbCBsYW5ndWFnZSBjb21tYW5kcyB2aWEgY29ydGV4IHdpdGggcmVzaWxpZW50IGZhbGxiYWNrXG4gICAgICBpZiAocmVxdWVzdC50eXBlID09PSAnRVhFQ1VURV9OQVRVUkFMX0NPTU1BTkQnKSB7XG4gICAgICAgIGNvbnN0IGNvbW1hbmQgPSByZXF1ZXN0LmNvbW1hbmQgfHwgJyc7XG4gICAgICAgIGNvbnN0IHBlcnNvbmEgPSBTdHJpbmcocmVxdWVzdC5wZXJzb25hIHx8ICdiaWxnZV9hZ2VudCcpLnRyaW0oKS50b0xvd2VyQ2FzZSgpIHx8ICdiaWxnZV9hZ2VudCc7XG4gICAgICAgIGNvbnRlbnRMb2dnZXIuaW5mbygnRVhFQ1VURV9OQVRVUkFMX0NPTU1BTkQgcmVxdWVzdGVkJywgeyBjb21tYW5kLCBwZXJzb25hIH0pO1xuXG4gICAgICAgIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gZXhlY3V0ZVJlc2lsaWVudE5hdHVyYWxDb21tYW5kKGNvbW1hbmQpKVxuICAgICAgICAgIC50aGVuKChyZXN1bHQpID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHQub2sgJiYgd2luZG93Ll9fYmlsZ2VfY29tbWFuZEF1dG9jb21wbGV0ZSkge1xuICAgICAgICAgICAgICB3aW5kb3cuX19iaWxnZV9jb21tYW5kQXV0b2NvbXBsZXRlLnNhdmVDb21tYW5kKGNvbW1hbmQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgLi4ucmVzdWx0LCBwZXJzb25hIH0pO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgICAgIGNvbnRlbnRMb2dnZXIuZXJyb3IoJ0VYRUNVVEVfTkFUVVJBTF9DT01NQU5EIGZhaWxlZCcsIHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgXG4gICAgICAgICAgICAgIG9rOiBmYWxzZSwgXG4gICAgICAgICAgICAgIGVycm9yOiBlcnIubWVzc2FnZSB8fCBTdHJpbmcoZXJyIHx8ICdVbmtub3duIGV4ZWN1dGlvbiBlcnJvcicpLFxuICAgICAgICAgICAgICBwZXJzb25hIFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdQQVJTRV9DT01NQU5EJykge1xuICAgICAgICBjb25zdCBjb21tYW5kID0gcmVxdWVzdC5jb21tYW5kIHx8ICcnO1xuICAgICAgICBjb250ZW50TG9nZ2VyLmluZm8oJ1BBUlNFX0NPTU1BTkQgcmVxdWVzdGVkJywgeyBjb21tYW5kIH0pO1xuXG4gICAgICAgIGlmICghd2luZG93LkJpbGdlQ29ydGV4ICYmICF3aW5kb3cuX19iaWxnZV9jb3J0ZXhfbG9hZGVkKSB7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgZXJyb3I6ICdDb3J0ZXggbW9kdWxlIG5vdCBsb2FkZWQnLCBwYXJzZWQ6IG51bGwgfSk7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBQcm9taXNlLnJlc29sdmUoKS50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IGF3YWl0IHJlc29sdmVOYXR1cmFsQ29tbWFuZChjb21tYW5kKTtcbiAgICAgICAgICBpZiAoIXJlc29sdmVkPy5wYXJzZWQgfHwgIXJlc29sdmVkPy5leGVjdXRhYmxlKSB7XG4gICAgICAgICAgICBzZW5kUmVzcG9uc2Uoe1xuICAgICAgICAgICAgICBwYXJzZWQ6IG51bGwsXG4gICAgICAgICAgICAgIGV4ZWN1dGFibGU6IG51bGwsXG4gICAgICAgICAgICAgIHJlY29nbml6ZWQ6IGZhbHNlLFxuICAgICAgICAgICAgICBwcm90b2NvbDogJ25hdHVyYWwtY29tbWFuZC12MidcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBzZW5kUmVzcG9uc2Uoe1xuICAgICAgICAgICAgcGFyc2VkOiByZXNvbHZlZC5wYXJzZWQsXG4gICAgICAgICAgICBleGVjdXRhYmxlOiByZXNvbHZlZC5leGVjdXRhYmxlLFxuICAgICAgICAgICAgcmVjb2duaXplZDogdHJ1ZSxcbiAgICAgICAgICAgIHNlbGZIZWFsZWQ6ICEhcmVzb2x2ZWQucmVwYWlyZWQsXG4gICAgICAgICAgICBjb21tYW5kTWVtb3J5SGl0OiAhIXJlc29sdmVkLmNvbW1hbmRNZW1vcnlIaXQsXG4gICAgICAgICAgICByZWNvdmVyeVBhdGg6IHJlc29sdmVkLnJlY292ZXJ5UGF0aCxcbiAgICAgICAgICAgIHByb3RvY29sOiAnbmF0dXJhbC1jb21tYW5kLXYyJ1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KS5jYXRjaCgoZXJyKSA9PiB7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHtcbiAgICAgICAgICAgIGVycm9yOiBlcnI/Lm1lc3NhZ2UgfHwgU3RyaW5nKGVyciB8fCAnUGFyc2UgY29tbWFuZCBmYWlsZWQnKSxcbiAgICAgICAgICAgIHBhcnNlZDogbnVsbCxcbiAgICAgICAgICAgIGV4ZWN1dGFibGU6IG51bGwsXG4gICAgICAgICAgICByZWNvZ25pemVkOiBmYWxzZSxcbiAgICAgICAgICAgIHByb3RvY29sOiAnbmF0dXJhbC1jb21tYW5kLXYyJ1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG5cbiAgICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgICAvLyBTZWxmLUhlYWxpbmcgTW9kdWxlIE1lc3NhZ2UgSGFuZGxlcnNcbiAgICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAgIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdGSUxMX0ZST01fUFJPRklMRScpIHtcbiAgICAgICAgY29uc3QgcHJvZmlsZVBhdGggPSByZXF1ZXN0LnByb2ZpbGVQYXRoIHx8ICdwcm9maWxlcy9kZWZhdWx0Lmpzb24nO1xuICAgICAgICBjb250ZW50TG9nZ2VyLmluZm8oJ0ZJTExfRlJPTV9QUk9GSUxFIHJlcXVlc3RlZCcsIHsgcHJvZmlsZVBhdGggfSk7XG5cbiAgICAgICAgaWYgKCFtY3BCcmlkZ2UpIHtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiAnTUNQIGJyaWRnZSBub3QgaW5pdGlhbGl6ZWQnIH0pO1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgUHJvbWlzZS5yZXNvbHZlKCkudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgICAgY29uc3QgcHJvZmlsZSA9IGF3YWl0IG1jcEJyaWRnZS5sb2FkUHJvZmlsZURhdGEocHJvZmlsZVBhdGgpO1xuICAgICAgICAgIGlmICghcHJvZmlsZSkge1xuICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogJ0ZhaWxlZCB0byBsb2FkIHByb2ZpbGUgZGF0YScgfSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gRXh0cmFjdCBmb3JtIGZpZWxkcyBmb3IgbWFwcGluZ1xuICAgICAgICAgIGNvbnN0IGZvcm1GaWVsZHMgPSBbXTtcbiAgICAgICAgICBjb25zdCBpbnB1dHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dCwgdGV4dGFyZWEsIHNlbGVjdCwgW2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl0nKTtcbiAgICAgICAgICBmb3IgKGNvbnN0IGlucHV0IG9mIGlucHV0cykge1xuICAgICAgICAgICAgaWYgKCFpc1VzYWJsZUZpZWxkKGlucHV0KSkgY29udGludWU7XG4gICAgICAgICAgICBmb3JtRmllbGRzLnB1c2goe1xuICAgICAgICAgICAgICBzZWxlY3RvcjogaW5wdXQuaWQgPyBgIyR7Q1NTLmVzY2FwZShpbnB1dC5pZCl9YCA6IChpbnB1dC5uYW1lID8gYFtuYW1lPVwiJHtDU1MuZXNjYXBlKGlucHV0Lm5hbWUpfVwiXWAgOiBudWxsKSxcbiAgICAgICAgICAgICAgbmFtZTogaW5wdXQubmFtZSB8fCAnJyxcbiAgICAgICAgICAgICAgaWQ6IGlucHV0LmlkIHx8ICcnLFxuICAgICAgICAgICAgICBwbGFjZWhvbGRlcjogaW5wdXQucGxhY2Vob2xkZXIgfHwgJycsXG4gICAgICAgICAgICAgIGF1dG9jb21wbGV0ZTogaW5wdXQuYXV0b2NvbXBsZXRlIHx8ICcnLFxuICAgICAgICAgICAgICBsYWJlbDogZmluZExhYmVsVGV4dChpbnB1dCksXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBtYXBwaW5nID0gbWNwQnJpZGdlLm1hdGNoRmllbGRzVG9Qcm9maWxlKGZvcm1GaWVsZHMsIHByb2ZpbGUpO1xuICAgICAgICAgIGNvbnN0IHJlc3VsdHMgPSB7IGZpbGxlZDogMCwgc2tpcHBlZDogMCwgZmFpbGVkOiAwIH07XG5cbiAgICAgICAgICBmb3IgKGNvbnN0IFtzZWxlY3RvciwgdmFsdWVdIG9mIG1hcHBpbmcpIHtcbiAgICAgICAgICAgIGlmICghc2VsZWN0b3IpIGNvbnRpbnVlO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgY29uc3QgZWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuICAgICAgICAgICAgICBpZiAoIWVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICByZXN1bHRzLmZhaWxlZCArPSAxO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgLy8gVXNlIGV4aXN0aW5nIGZpbGwgbG9naWNcbiAgICAgICAgICAgICAgZWxlbWVudC5mb2N1cygpO1xuICAgICAgICAgICAgICBpZiAoZWxlbWVudC50YWdOYW1lID09PSAnSU5QVVQnIHx8IGVsZW1lbnQudGFnTmFtZSA9PT0gJ1RFWFRBUkVBJykge1xuICAgICAgICAgICAgICAgIHNldE5hdGl2ZVZhbHVlKGVsZW1lbnQsIHZhbHVlKTtcbiAgICAgICAgICAgICAgICBkaXNwYXRjaElucHV0RXZlbnRzKGVsZW1lbnQpO1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGVsZW1lbnQuaXNDb250ZW50RWRpdGFibGUpIHtcbiAgICAgICAgICAgICAgICBlbGVtZW50LnRleHRDb250ZW50ID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgZGlzcGF0Y2hJbnB1dEV2ZW50cyhlbGVtZW50KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXN1bHRzLmZpbGxlZCArPSAxO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgIHJlc3VsdHMuZmFpbGVkICs9IDE7XG4gICAgICAgICAgICAgIGNvbnRlbnRMb2dnZXIud2FybignRmlsbCBmaWVsZCBmYWlsZWQnLCB7IHNlbGVjdG9yLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29udGVudExvZ2dlci5pbmZvKCdGSUxMX0ZST01fUFJPRklMRSBjb21wbGV0ZWQnLCByZXN1bHRzKTtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogdHJ1ZSwgcmVzdWx0cyB9KTtcbiAgICAgICAgfSkuY2F0Y2goKGVycikgPT4ge1xuICAgICAgICAgIGNvbnRlbnRMb2dnZXIuZXJyb3IoJ0ZJTExfRlJPTV9QUk9GSUxFIGZhaWxlZCcsIHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdTQVZFX0ZPUk1fU1RBVEUnKSB7XG4gICAgICAgIGNvbnRlbnRMb2dnZXIuaW5mbygnU0FWRV9GT1JNX1NUQVRFIHJlcXVlc3RlZCcpO1xuXG4gICAgICAgIGlmICghZm9ybVBlcnNpc3RlbmNlKSB7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogJ0Zvcm0gcGVyc2lzdGVuY2Ugbm90IGluaXRpYWxpemVkJyB9KTtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIFByb21pc2UucmVzb2x2ZSgpLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHN0YXRlID0gZm9ybVBlcnNpc3RlbmNlLmNhcHR1cmVGb3JtU3RhdGUoKTtcbiAgICAgICAgICBhd2FpdCBmb3JtUGVyc2lzdGVuY2Uuc2F2ZVRvU3RvcmFnZShzdGF0ZSk7XG4gICAgICAgICAgY29udGVudExvZ2dlci5pbmZvKCdTQVZFX0ZPUk1fU1RBVEUgY29tcGxldGVkJywgeyBmaWVsZHNDb3VudDogc3RhdGUuZmllbGRzLmxlbmd0aCB9KTtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogdHJ1ZSwgZmllbGRzQ291bnQ6IHN0YXRlLmZpZWxkcy5sZW5ndGggfSk7XG4gICAgICAgIH0pLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgICBjb250ZW50TG9nZ2VyLmVycm9yKCdTQVZFX0ZPUk1fU1RBVEUgZmFpbGVkJywgeyBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ1JFU1RPUkVfRk9STV9TVEFURScpIHtcbiAgICAgICAgY29udGVudExvZ2dlci5pbmZvKCdSRVNUT1JFX0ZPUk1fU1RBVEUgcmVxdWVzdGVkJyk7XG5cbiAgICAgICAgaWYgKCFmb3JtUGVyc2lzdGVuY2UpIHtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiAnRm9ybSBwZXJzaXN0ZW5jZSBub3QgaW5pdGlhbGl6ZWQnIH0pO1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgUHJvbWlzZS5yZXNvbHZlKCkudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgICAgY29uc3Qgc2F2ZWRTdGF0ZSA9IGF3YWl0IGZvcm1QZXJzaXN0ZW5jZS5sb2FkTWF0Y2hpbmdTdGF0ZSgpO1xuICAgICAgICAgIGlmICghc2F2ZWRTdGF0ZSkge1xuICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogJ05vIHNhdmVkIHN0YXRlIGZvdW5kIGZvciB0aGlzIFVSTCcgfSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IGZvcm1QZXJzaXN0ZW5jZS5yZXN0b3JlRm9ybVN0YXRlKHNhdmVkU3RhdGUsIHNlbGZIZWFsaW5nRW5naW5lKTtcbiAgICAgICAgICBjb250ZW50TG9nZ2VyLmluZm8oJ1JFU1RPUkVfRk9STV9TVEFURSBjb21wbGV0ZWQnLCByZXN1bHRzKTtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogdHJ1ZSwgcmVzdWx0cyB9KTtcbiAgICAgICAgfSkuY2F0Y2goKGVycikgPT4ge1xuICAgICAgICAgIGNvbnRlbnRMb2dnZXIuZXJyb3IoJ1JFU1RPUkVfRk9STV9TVEFURSBmYWlsZWQnLCB7IGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVxdWVzdC50eXBlID09PSAnR0VUX1NFTEZfSEVBTElOR19TVEFUUycpIHtcbiAgICAgICAgY29udGVudExvZ2dlci5pbmZvKCdHRVRfU0VMRl9IRUFMSU5HX1NUQVRTIHJlcXVlc3RlZCcpO1xuXG4gICAgICAgIGlmICghc2VsZkhlYWxpbmdFbmdpbmUpIHtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiAnU2VsZi1oZWFsaW5nIGVuZ2luZSBub3QgaW5pdGlhbGl6ZWQnIH0pO1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgc3RhdHMgPSBzZWxmSGVhbGluZ0VuZ2luZS5nZXRTdGF0cygpO1xuICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogdHJ1ZSwgc3RhdHMgfSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVxdWVzdC50eXBlID09PSAnR0VUX1BBR0VfQ09OVEVYVCcpIHtcbiAgICAgICAgY29udGVudExvZ2dlci5pbmZvKCdHRVRfUEFHRV9DT05URVhUIHJlcXVlc3RlZCcpO1xuXG4gICAgICAgIGlmICghY29udGV4dEluZmVyZW5jZSkge1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6ICdDb250ZXh0IGluZmVyZW5jZSBub3QgaW5pdGlhbGl6ZWQnIH0pO1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29udGV4dCA9IGNvbnRleHRJbmZlcmVuY2UuZXh0cmFjdFBhZ2VDb250ZXh0KCk7XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlLCBjb250ZXh0IH0pO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgc2VuZFJlc3BvbnNlKHsgZXJyb3I6IGBVbmtub3duIHJlcXVlc3QgdHlwZTogJHtTdHJpbmcocmVxdWVzdC50eXBlIHx8ICcnKX1gIH0pO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gZXJyICYmIGVyci5tZXNzYWdlID8gU3RyaW5nKGVyci5tZXNzYWdlKSA6IFN0cmluZyhlcnIgfHwgJ1Vua25vd24gZXJyb3InKTtcbiAgICAgIHNlbmRSZXNwb25zZSh7IGVycm9yOiBgQ29udGVudCBzY3JpcHQgZXJyb3I6ICR7bWVzc2FnZX1gIH0pO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9KTtcbn0pKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7O0FBSUEsU0FBUyxpQkFBaUI7QUFDeEIsTUFBSTtBQUNGLFVBQU0sSUFBSSxPQUFPLGVBQWUsY0FBYyxhQUFhO0FBQzNELFFBQUksS0FBSyxFQUFFLGlCQUFpQixPQUFPLEVBQUUsa0JBQWtCLFVBQVU7QUFDL0QsYUFBTyxFQUFFO0FBQUEsSUFDWDtBQUFBLEVBQ0YsUUFBUTtBQUFBLEVBQUM7QUFDVCxTQUFPO0FBQ1Q7QUFSUztBQVVULFNBQVMseUJBQXlCO0FBRWhDLFFBQU0sYUFDSjtBQUtGLE1BQUksQ0FBQyxXQUFZLFFBQU87QUFJeEIsUUFBTSxlQUNKLE9BQ0ksZ0JBQ3lDLFFBQ3ZDLGVBQ0E7QUFFUixTQUFPO0FBQUEsSUFDTCxNQUFNO0FBQUEsSUFDTixPQUFPLE9BQXlDLE9BQWtCO0FBQUEsSUFDbEUsU0FBUyxPQUFxQyxXQUFjO0FBQUEsSUFDNUQsY0FBYyxPQUEwQywwQkFBbUI7QUFBQSxJQUMzRSxZQUFZLE9BQXdDLDJCQUFpQjtBQUFBLElBQ3JFLHdCQUNFLE9BQW9ELGFBQTZCO0FBQUEsSUFDbkYscUJBQXFCLE9BQWlELGtCQUEwQjtBQUFBLElBQ2hHLFVBQVU7QUFBQSxNQUNSLFdBQVcsT0FBOEMsT0FBdUI7QUFBQSxNQUNoRixpQkFBaUIsT0FBb0QsT0FBNkI7QUFBQSxNQUNsRyxxQkFDRSxPQUF3RCxPQUFpQztBQUFBLE1BQzNGLFlBQVksT0FBK0MsT0FBd0I7QUFBQSxJQUNyRjtBQUFBLElBQ0EsV0FBVztB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
