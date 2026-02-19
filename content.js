(() => {
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
  function getEnvFromBuildDefines() {
    const hasDefines = typeof __BILGE_ENV__ !== "undefined" || typeof __MCP_BASE_URL__ !== "undefined" || typeof __ENABLE_HOT_RELOAD__ !== "undefined" || typeof __VERSION__ !== "undefined";
    if (!hasDefines) return null;
    const inferredMode = typeof __BILGE_ENV__ !== "undefined" ? __BILGE_ENV__ : typeof __BUILD_MODE__ !== "undefined" && __BUILD_MODE__ === "prod" ? "production" : "development";
    return {
      MODE: inferredMode,
      DEBUG: typeof __BILGE_DEBUG__ !== "undefined" ? __BILGE_DEBUG__ : true,
      VERSION: typeof __VERSION__ !== "undefined" ? __VERSION__ : "dev",
      MCP_BASE_URL: typeof __MCP_BASE_URL__ !== "undefined" ? __MCP_BASE_URL__ : "http://localhost:8787",
      MCP_WS_URL: typeof __MCP_WS_URL__ !== "undefined" ? __MCP_WS_URL__ : "ws://localhost:8787/ws",
      DEFAULT_BRAIN_PROVIDER: typeof __DEFAULT_BRAIN_PROVIDER__ !== "undefined" ? __DEFAULT_BRAIN_PROVIDER__ : "deepseek",
      DEFAULT_BRAIN_MODEL: typeof __DEFAULT_BRAIN_MODEL__ !== "undefined" ? __DEFAULT_BRAIN_MODEL__ : "deepseek-chat",
      FEATURES: {
        DEV_TOOLS: typeof __ENABLE_DEV_TOOLS__ !== "undefined" ? __ENABLE_DEV_TOOLS__ : true,
        CONSOLE_LOGGING: typeof __ENABLE_CONSOLE_LOGGING__ !== "undefined" ? __ENABLE_CONSOLE_LOGGING__ : true,
        PERFORMANCE_METRICS: typeof __ENABLE_PERFORMANCE_METRICS__ !== "undefined" ? __ENABLE_PERFORMANCE_METRICS__ : true,
        HOT_RELOAD: typeof __ENABLE_HOT_RELOAD__ !== "undefined" ? __ENABLE_HOT_RELOAD__ : false
      },
      TELEMETRY: {
        ENABLED: typeof __TELEMETRY_ENABLED__ !== "undefined" ? __TELEMETRY_ENABLED__ : false,
        ENDPOINT: typeof __TELEMETRY_ENDPOINT__ !== "undefined" ? __TELEMETRY_ENDPOINT__ : ""
      }
    };
  }
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
  var ENV = getEnv();
  var isDev = () => ENV.MODE === "development" || ENV.MODE === "dev";

  // src/lib/logger.js
  var LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 };
  var currentLevel = isDev() ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN;
  function shouldLog(level) {
    if (!ENV.FEATURES.CONSOLE_LOGGING) return false;
    return level >= currentLevel;
  }
  function formatMessage(level, module, message) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().split("T")[1].slice(0, -1);
    return `[${timestamp}] [${level}] [${module}] ${message}`;
  }
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
    function describeRestrictedSelectorError(selector, err) {
      const message = err && err.message ? String(err.message) : String(err || "");
      return { error: `Invalid selector "${selector}": ${message || "Unknown error"}` };
    }
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
    function dispatchInputEvents(element) {
      const inputEvent = typeof InputEvent === "function" ? new InputEvent("input", { bubbles: true, composed: true }) : new Event("input", { bubbles: true });
      element.dispatchEvent(inputEvent);
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
    function normalizeText(value) {
      return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    }
    function tokenize(value) {
      return String(value || "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).map((part) => part.trim()).filter(Boolean);
    }
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
    function escapeCssValue(value) {
      const text = String(value || "");
      if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(text);
      }
      return text.replace(/["\\]/g, "\\$&");
    }
    function normalizeSkillTarget(value) {
      return String(value || "").toLowerCase().replace(/\b\d{5,}\b/g, "#").replace(/[^a-z0-9\s_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
    }
    function getPathPrefix(pathname) {
      const parts = String(pathname || "").split("/").filter(Boolean).slice(0, 2);
      return parts.length ? `/${parts.join("/")}` : "/";
    }
    function getDomSkillScope() {
      return {
        host: String(window.location?.host || "").toLowerCase(),
        pathPrefix: getPathPrefix(window.location?.pathname || "/")
      };
    }
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
    function extractTextSignature(element) {
      const text = String(element?.innerText || element?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
      return text;
    }
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
    function normalizeNaturalCommandKey(value) {
      return String(value || "").toLowerCase().replace(/\bconfirmaton\b/g, "confirmation").replace(/\bconfirmtion\b/g, "confirmation").replace(/\bconfrimation\b/g, "confirmation").replace(/\bconfimation\b/g, "confirmation").replace(/\badress\b/g, "address").replace(/\bemial\b/g, "email").replace(/[^a-z0-9\s_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
    }
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
    function buildNaturalCommandCandidates(command) {
      const raw = String(command || "").trim();
      const candidates = [];
      const seen = /* @__PURE__ */ new Set();
      const push = (value) => {
        const text = String(value || "").trim();
        if (!text) return;
        const key = text.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push(text);
      };
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
    async function resolveNaturalCommand(command) {
      if (!window.BilgeCortex && !window.__bilge_cortex_loaded) {
        return { error: "Cortex module not loaded", parsed: null, executable: null };
      }
      const getCortexContext = () => {
        const runtime = window.__bilge_runtime || null;
        const ctx = {};
        if (runtime?.cursor && Number.isFinite(runtime.cursor.x) && Number.isFinite(runtime.cursor.y)) {
          ctx.cursor = { x: runtime.cursor.x, y: runtime.cursor.y };
        }
        if (runtime?.lastElement instanceof Element) {
          ctx.lastElement = runtime.lastElement;
        }
        return ctx;
      };
      const tryParse = (candidate) => {
        const parsed = window.BilgeCortex.parseCommand(candidate, getCortexContext());
        if (!parsed) return null;
        const executable = window.BilgeCortex.toExecutableAction(parsed);
        if (!executable) return null;
        return { parsed, executable, canonicalCommand: String(parsed.raw || candidate || "").trim() || String(candidate || "").trim() };
      };
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
    async function executeClickAction(action, parsed) {
      if (action.useContext) {
        const runtime = window.__bilge_runtime || null;
        const pickClickable = (el) => {
          if (!(el instanceof Element)) return null;
          const tag = String(el.tagName || "").toUpperCase();
          if (!tag || tag === "HTML" || tag === "BODY") return null;
          if (!el.isConnected) return null;
          const interactive = el.closest?.(
            'button, a[href], input[type="button"], input[type="submit"], input[type="reset"], [role="button"], [role="link"]'
          );
          return interactive || el;
        };
        const isVisibleSafe = (el) => {
          try {
            return isElementVisible(el);
          } catch (_err) {
            return true;
          }
        };
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
    async function executeTypeAction(action, parsed) {
      let value = action.value ?? "";
      const target = action.label || action.field || action.name || parsed?.target || "";
      const copyFrom = String(action.copyFrom || parsed?.copyFrom || "").trim();
      let memoryHit = false;
      const resolveFieldElement = async (hint) => {
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
      };
      const readFieldValue = (element2) => {
        if (!element2) return "";
        const tag = String(element2.tagName || "").toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
          return String(element2.value ?? "");
        }
        if (element2.isContentEditable) {
          return String(element2.textContent ?? "");
        }
        return "";
      };
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
    async function executeWaitAction(action) {
      const duration = action.duration || 1e3;
      await new Promise((resolve) => setTimeout(resolve, duration));
      return { status: "waited", duration };
    }
    async function executeNavigateAction(action) {
      if (action.code) {
        const AsyncFunction = Object.getPrototypeOf(async function() {
        }).constructor;
        const fn = new AsyncFunction(action.code);
        await fn();
      }
      return { status: "navigated", action: action.action };
    }
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
    function isElementVisible(el) {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(el).display !== "none";
    }
    function getFieldId(el) {
      return el.id || el.name || el.tagName.toLowerCase();
    }
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
})();
