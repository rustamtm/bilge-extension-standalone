var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/cortex_config.js
(/* @__PURE__ */ __name(function initCortexExtConfig() {
  "use strict";
  const STORAGE_KEY = "cortexExtConfigV1";
  const VERSION = 1;
  function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }
  __name(clampInt, "clampInt");
  function toBool(value, fallback = false) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (!normalized) return fallback;
      if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
      if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;
    }
    return fallback;
  }
  __name(toBool, "toBool");
  function normalizePresetId(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";
    return value;
  }
  __name(normalizePresetId, "normalizePresetId");
  const DEFAULT_BRAIN_SYSTEM_TEMPLATE = [
    "You are the Brain for a Chrome extension web automation agent.",
    "",
    "Context:",
    "- Goal: {goal}",
    "- URL: {url}",
    "- Title: {title}",
    "- Mode: {mode}",
    "- Script actions allowed: {allow_script_actions}",
    "",
    "Default conditioning:",
    "- Be recovery-first: handle minor typos and imperfect phrasing as valid intent when possible.",
    "- Prefer short, directly executable actions over explanation.",
    "- Avoid parser-style failure language; degrade gracefully with safe fallback actions.",
    "- For browser commands (scroll/click/type/navigation/screenshot), prioritize direct DOM execution flow.",
    "",
    "Cortex routing (FYI):",
    "- Intent: {cortex_intent}",
    "- Strategy: {cortex_strategy}",
    "- Hints: {cortex_hints}",
    "",
    "Return ONLY a single JSON object with:",
    '- "description": short summary of what you see and what you will do next',
    '- "actions": an array of DOM actions',
    "",
    "Allowed action types: click, fill, scroll, wait, script.",
    'Only include "script" actions when Script actions allowed is true.',
    "",
    "Action schema examples:",
    '- click: { "type": "click", "selector": "..." }',
    '- fill: { "type": "fill", "selector": "...", "value": "..." }',
    '- scroll: { "type": "scroll", "selector": "..." }',
    '- wait: { "type": "wait", "duration": 1000 }',
    '- script: { "type": "script", "code": "return document.querySelectorAll(\\"input\\").length;" }',
    "",
    "Selector rules:",
    "- Prefer stable attributes: id, name, aria-label, data-testid, data-qa.",
    "- Avoid brittle nth-child selectors.",
    "",
    'If the goal is unclear or you are not confident, return {"actions": [], "description": "Goal unclear."}.'
  ].join("\n");
  const FLOW_PRESETS = Object.freeze({
    browser_default: Object.freeze({
      id: "browser_default",
      label: "Browser Default",
      description: "Balanced routing for normal web tasks.",
      steps: Object.freeze(["Capture", "Cortex Route", "Brain Plan", "Executor Run", "Report"]),
      defaults: Object.freeze({
        thinkingEnabled: false,
        cortexMaxAttempts: 4,
        cortexPreferSpeed: false,
        cortexPreferCost: false,
        executionMode: "batch",
        // batch | step
        liveOverlayEnabled: true,
        liveOverlayFlash: false,
        flashUiEnabled: false,
        brainSystemTemplate: DEFAULT_BRAIN_SYSTEM_TEMPLATE
      })
    }),
    browser_trainer: Object.freeze({
      id: "browser_trainer",
      label: "Trainer / Debug",
      description: "More verbose debugging; optimized for iteration.",
      steps: Object.freeze(["Capture", "Cortex Route", "Brain Plan (Debug)", "Executor Run", "Report"]),
      defaults: Object.freeze({
        thinkingEnabled: true,
        cortexMaxAttempts: 4,
        cortexPreferSpeed: true,
        cortexPreferCost: false,
        executionMode: "step",
        liveOverlayEnabled: true,
        liveOverlayFlash: true,
        flashUiEnabled: true,
        brainSystemTemplate: DEFAULT_BRAIN_SYSTEM_TEMPLATE + "\n\nExtra trainer guidance:\n- Prefer smaller, verifiable action batches (1-5 actions).\n- If selectors are uncertain, return fewer actions and explain what is missing."
      })
    }),
    browser_safe: Object.freeze({
      id: "browser_safe",
      label: "Safe Mode",
      description: "More conservative behavior (less clicking, more checking).",
      steps: Object.freeze(["Capture", "Cortex Route", "Brain Plan (Safe)", "Executor Run", "Report"]),
      defaults: Object.freeze({
        thinkingEnabled: false,
        cortexMaxAttempts: 3,
        cortexPreferSpeed: false,
        cortexPreferCost: false,
        executionMode: "batch",
        liveOverlayEnabled: true,
        liveOverlayFlash: false,
        flashUiEnabled: false,
        brainSystemTemplate: DEFAULT_BRAIN_SYSTEM_TEMPLATE + "\n\nSafety rules:\n- Do NOT submit purchases or irreversible actions.\n- If you might submit a form, instead return actions that collect/verify fields and stop."
      })
    })
  });
  const DEFAULT_PRESET_ID = "browser_default";
  function getPreset(presetId) {
    const normalized = normalizePresetId(presetId);
    if (normalized && FLOW_PRESETS[normalized]) return FLOW_PRESETS[normalized];
    return FLOW_PRESETS[DEFAULT_PRESET_ID];
  }
  __name(getPreset, "getPreset");
  function buildDefaultConfig(presetId) {
    const preset = getPreset(presetId);
    return {
      version: VERSION,
      presetId: preset.id,
      thinkingEnabled: Boolean(preset.defaults.thinkingEnabled),
      cortexMaxAttempts: clampInt(preset.defaults.cortexMaxAttempts, 1, 4, 4),
      cortexPreferSpeed: Boolean(preset.defaults.cortexPreferSpeed),
      cortexPreferCost: Boolean(preset.defaults.cortexPreferCost),
      executionMode: String(preset.defaults.executionMode || "batch"),
      liveOverlayEnabled: Boolean(preset.defaults.liveOverlayEnabled),
      liveOverlayFlash: Boolean(preset.defaults.liveOverlayFlash),
      flashUiEnabled: Boolean(preset.defaults.flashUiEnabled),
      brainSystemTemplate: String(preset.defaults.brainSystemTemplate || DEFAULT_BRAIN_SYSTEM_TEMPLATE)
    };
  }
  __name(buildDefaultConfig, "buildDefaultConfig");
  function normalizeExecutionMode(raw) {
    const value = String(raw || "").trim().toLowerCase();
    if (value === "step" || value === "interactive") return "step";
    return "batch";
  }
  __name(normalizeExecutionMode, "normalizeExecutionMode");
  function normalizeConfig(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const preset = getPreset(input.presetId);
    const base = buildDefaultConfig(preset.id);
    const brainTemplate = String(input.brainSystemTemplate || "").trim();
    return {
      version: VERSION,
      presetId: preset.id,
      thinkingEnabled: toBool(input.thinkingEnabled, base.thinkingEnabled),
      cortexMaxAttempts: clampInt(input.cortexMaxAttempts, 1, 4, base.cortexMaxAttempts),
      cortexPreferSpeed: toBool(input.cortexPreferSpeed, base.cortexPreferSpeed),
      cortexPreferCost: toBool(input.cortexPreferCost, base.cortexPreferCost),
      executionMode: normalizeExecutionMode(input.executionMode || base.executionMode),
      liveOverlayEnabled: toBool(input.liveOverlayEnabled, base.liveOverlayEnabled),
      liveOverlayFlash: toBool(input.liveOverlayFlash, base.liveOverlayFlash),
      flashUiEnabled: toBool(input.flashUiEnabled, base.flashUiEnabled),
      brainSystemTemplate: brainTemplate || base.brainSystemTemplate
    };
  }
  __name(normalizeConfig, "normalizeConfig");
  function renderTemplate(template, vars) {
    const text = String(template || "");
    if (!text) return "";
    const safeVars = vars && typeof vars === "object" ? vars : {};
    return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
      const value = safeVars[key];
      if (value === void 0 || value === null) return "";
      return String(value);
    });
  }
  __name(renderTemplate, "renderTemplate");
  globalThis.CortexExtConfig = Object.freeze({
    VERSION,
    STORAGE_KEY,
    FLOW_PRESETS,
    DEFAULT_PRESET_ID,
    DEFAULT_BRAIN_SYSTEM_TEMPLATE,
    getPreset,
    buildDefaultConfig,
    normalizeConfig,
    renderTemplate
  });
}, "initCortexExtConfig"))();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2NvcnRleF9jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qKlxuICogQ29ydGV4IEV4dGVuc2lvbiBDb25maWcgKHYxKVxuICpcbiAqIFNoYXJlZCBieTpcbiAqIC0gYmFja2dyb3VuZC5qcyAoc2VydmljZSB3b3JrZXIpXG4gKiAtIHNpZGVwYW5lbC5odG1sL3NpZGVwYW5lbC5qcyAoVUkpXG4gKlxuICogR29hbDogZWRpdGFibGUgXCJmbG93IHByZXNldFwiICsgcHJvbXB0IG92ZXJyaWRlICsgdGhpbmtpbmctbW9kZSB0b2dnbGUgdGhhdFxuICogbWF0Y2hlcyBob3cgdGhlIENocm9tZSBleHRlbnNpb24gYWN0dWFsbHkgb3BlcmF0ZXM6XG4gKiBDYXB0dXJlIC0+IENvcnRleCBSb3V0ZSAtPiBCcmFpbiAoYmFja2VuZCkgLT4gRXhlY3V0b3IgLT4gUmVwb3J0XG4gKi9cblxuKGZ1bmN0aW9uIGluaXRDb3J0ZXhFeHRDb25maWcoKSB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBjb25zdCBTVE9SQUdFX0tFWSA9ICdjb3J0ZXhFeHRDb25maWdWMSc7XG4gIGNvbnN0IFZFUlNJT04gPSAxO1xuXG4gIGZ1bmN0aW9uIGNsYW1wSW50KHZhbHVlLCBtaW4sIG1heCwgZmFsbGJhY2spIHtcbiAgICBjb25zdCBuID0gTnVtYmVyKHZhbHVlKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShuKSkgcmV0dXJuIGZhbGxiYWNrO1xuICAgIHJldHVybiBNYXRoLm1pbihtYXgsIE1hdGgubWF4KG1pbiwgTWF0aC5yb3VuZChuKSkpO1xuICB9XG5cbiAgZnVuY3Rpb24gdG9Cb29sKHZhbHVlLCBmYWxsYmFjayA9IGZhbHNlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4gdmFsdWU7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHJldHVybiB2YWx1ZSAhPT0gMDtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IHZhbHVlLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgaWYgKCFub3JtYWxpemVkKSByZXR1cm4gZmFsbGJhY2s7XG4gICAgICBpZiAoWycxJywgJ3RydWUnLCAneWVzJywgJ29uJywgJ2VuYWJsZWQnXS5pbmNsdWRlcyhub3JtYWxpemVkKSkgcmV0dXJuIHRydWU7XG4gICAgICBpZiAoWycwJywgJ2ZhbHNlJywgJ25vJywgJ29mZicsICdkaXNhYmxlZCddLmluY2x1ZGVzKG5vcm1hbGl6ZWQpKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBmYWxsYmFjaztcbiAgfVxuXG4gIGZ1bmN0aW9uIG5vcm1hbGl6ZVByZXNldElkKHJhdykge1xuICAgIGNvbnN0IHZhbHVlID0gU3RyaW5nKHJhdyB8fCAnJykudHJpbSgpO1xuICAgIGlmICghdmFsdWUpIHJldHVybiAnJztcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICBjb25zdCBERUZBVUxUX0JSQUlOX1NZU1RFTV9URU1QTEFURSA9XG4gICAgW1xuICAgICAgJ1lvdSBhcmUgdGhlIEJyYWluIGZvciBhIENocm9tZSBleHRlbnNpb24gd2ViIGF1dG9tYXRpb24gYWdlbnQuJyxcbiAgICAgICcnLFxuICAgICAgJ0NvbnRleHQ6JyxcbiAgICAgICctIEdvYWw6IHtnb2FsfScsXG4gICAgICAnLSBVUkw6IHt1cmx9JyxcbiAgICAgICctIFRpdGxlOiB7dGl0bGV9JyxcbiAgICAgICctIE1vZGU6IHttb2RlfScsXG4gICAgICAnLSBTY3JpcHQgYWN0aW9ucyBhbGxvd2VkOiB7YWxsb3dfc2NyaXB0X2FjdGlvbnN9JyxcbiAgICAgICcnLFxuICAgICAgJ0RlZmF1bHQgY29uZGl0aW9uaW5nOicsXG4gICAgICAnLSBCZSByZWNvdmVyeS1maXJzdDogaGFuZGxlIG1pbm9yIHR5cG9zIGFuZCBpbXBlcmZlY3QgcGhyYXNpbmcgYXMgdmFsaWQgaW50ZW50IHdoZW4gcG9zc2libGUuJyxcbiAgICAgICctIFByZWZlciBzaG9ydCwgZGlyZWN0bHkgZXhlY3V0YWJsZSBhY3Rpb25zIG92ZXIgZXhwbGFuYXRpb24uJyxcbiAgICAgICctIEF2b2lkIHBhcnNlci1zdHlsZSBmYWlsdXJlIGxhbmd1YWdlOyBkZWdyYWRlIGdyYWNlZnVsbHkgd2l0aCBzYWZlIGZhbGxiYWNrIGFjdGlvbnMuJyxcbiAgICAgICctIEZvciBicm93c2VyIGNvbW1hbmRzIChzY3JvbGwvY2xpY2svdHlwZS9uYXZpZ2F0aW9uL3NjcmVlbnNob3QpLCBwcmlvcml0aXplIGRpcmVjdCBET00gZXhlY3V0aW9uIGZsb3cuJyxcbiAgICAgICcnLFxuICAgICAgJ0NvcnRleCByb3V0aW5nIChGWUkpOicsXG4gICAgICAnLSBJbnRlbnQ6IHtjb3J0ZXhfaW50ZW50fScsXG4gICAgICAnLSBTdHJhdGVneToge2NvcnRleF9zdHJhdGVneX0nLFxuICAgICAgJy0gSGludHM6IHtjb3J0ZXhfaGludHN9JyxcbiAgICAgICcnLFxuICAgICAgJ1JldHVybiBPTkxZIGEgc2luZ2xlIEpTT04gb2JqZWN0IHdpdGg6JyxcbiAgICAgICctIFwiZGVzY3JpcHRpb25cIjogc2hvcnQgc3VtbWFyeSBvZiB3aGF0IHlvdSBzZWUgYW5kIHdoYXQgeW91IHdpbGwgZG8gbmV4dCcsXG4gICAgICAnLSBcImFjdGlvbnNcIjogYW4gYXJyYXkgb2YgRE9NIGFjdGlvbnMnLFxuICAgICAgJycsXG4gICAgICAnQWxsb3dlZCBhY3Rpb24gdHlwZXM6IGNsaWNrLCBmaWxsLCBzY3JvbGwsIHdhaXQsIHNjcmlwdC4nLFxuICAgICAgJ09ubHkgaW5jbHVkZSBcInNjcmlwdFwiIGFjdGlvbnMgd2hlbiBTY3JpcHQgYWN0aW9ucyBhbGxvd2VkIGlzIHRydWUuJyxcbiAgICAgICcnLFxuICAgICAgJ0FjdGlvbiBzY2hlbWEgZXhhbXBsZXM6JyxcbiAgICAgICctIGNsaWNrOiB7IFwidHlwZVwiOiBcImNsaWNrXCIsIFwic2VsZWN0b3JcIjogXCIuLi5cIiB9JyxcbiAgICAgICctIGZpbGw6IHsgXCJ0eXBlXCI6IFwiZmlsbFwiLCBcInNlbGVjdG9yXCI6IFwiLi4uXCIsIFwidmFsdWVcIjogXCIuLi5cIiB9JyxcbiAgICAgICctIHNjcm9sbDogeyBcInR5cGVcIjogXCJzY3JvbGxcIiwgXCJzZWxlY3RvclwiOiBcIi4uLlwiIH0nLFxuICAgICAgJy0gd2FpdDogeyBcInR5cGVcIjogXCJ3YWl0XCIsIFwiZHVyYXRpb25cIjogMTAwMCB9JyxcbiAgICAgICctIHNjcmlwdDogeyBcInR5cGVcIjogXCJzY3JpcHRcIiwgXCJjb2RlXCI6IFwicmV0dXJuIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoXFxcXFxcXCJpbnB1dFxcXFxcXFwiKS5sZW5ndGg7XCIgfScsXG4gICAgICAnJyxcbiAgICAgICdTZWxlY3RvciBydWxlczonLFxuICAgICAgJy0gUHJlZmVyIHN0YWJsZSBhdHRyaWJ1dGVzOiBpZCwgbmFtZSwgYXJpYS1sYWJlbCwgZGF0YS10ZXN0aWQsIGRhdGEtcWEuJyxcbiAgICAgICctIEF2b2lkIGJyaXR0bGUgbnRoLWNoaWxkIHNlbGVjdG9ycy4nLFxuICAgICAgJycsXG4gICAgICAnSWYgdGhlIGdvYWwgaXMgdW5jbGVhciBvciB5b3UgYXJlIG5vdCBjb25maWRlbnQsIHJldHVybiB7XCJhY3Rpb25zXCI6IFtdLCBcImRlc2NyaXB0aW9uXCI6IFwiR29hbCB1bmNsZWFyLlwifS4nXG4gICAgXS5qb2luKCdcXG4nKTtcblxuICBjb25zdCBGTE9XX1BSRVNFVFMgPSBPYmplY3QuZnJlZXplKHtcbiAgICBicm93c2VyX2RlZmF1bHQ6IE9iamVjdC5mcmVlemUoe1xuICAgICAgaWQ6ICdicm93c2VyX2RlZmF1bHQnLFxuICAgICAgbGFiZWw6ICdCcm93c2VyIERlZmF1bHQnLFxuICAgICAgZGVzY3JpcHRpb246ICdCYWxhbmNlZCByb3V0aW5nIGZvciBub3JtYWwgd2ViIHRhc2tzLicsXG4gICAgICBzdGVwczogT2JqZWN0LmZyZWV6ZShbJ0NhcHR1cmUnLCAnQ29ydGV4IFJvdXRlJywgJ0JyYWluIFBsYW4nLCAnRXhlY3V0b3IgUnVuJywgJ1JlcG9ydCddKSxcbiAgICAgIGRlZmF1bHRzOiBPYmplY3QuZnJlZXplKHtcbiAgICAgICAgdGhpbmtpbmdFbmFibGVkOiBmYWxzZSxcbiAgICAgICAgY29ydGV4TWF4QXR0ZW1wdHM6IDQsXG4gICAgICAgIGNvcnRleFByZWZlclNwZWVkOiBmYWxzZSxcbiAgICAgICAgY29ydGV4UHJlZmVyQ29zdDogZmFsc2UsXG4gICAgICAgIGV4ZWN1dGlvbk1vZGU6ICdiYXRjaCcsIC8vIGJhdGNoIHwgc3RlcFxuICAgICAgICBsaXZlT3ZlcmxheUVuYWJsZWQ6IHRydWUsXG4gICAgICAgIGxpdmVPdmVybGF5Rmxhc2g6IGZhbHNlLFxuICAgICAgICBmbGFzaFVpRW5hYmxlZDogZmFsc2UsXG4gICAgICAgIGJyYWluU3lzdGVtVGVtcGxhdGU6IERFRkFVTFRfQlJBSU5fU1lTVEVNX1RFTVBMQVRFXG4gICAgICB9KVxuICAgIH0pLFxuICAgIGJyb3dzZXJfdHJhaW5lcjogT2JqZWN0LmZyZWV6ZSh7XG4gICAgICBpZDogJ2Jyb3dzZXJfdHJhaW5lcicsXG4gICAgICBsYWJlbDogJ1RyYWluZXIgLyBEZWJ1ZycsXG4gICAgICBkZXNjcmlwdGlvbjogJ01vcmUgdmVyYm9zZSBkZWJ1Z2dpbmc7IG9wdGltaXplZCBmb3IgaXRlcmF0aW9uLicsXG4gICAgICBzdGVwczogT2JqZWN0LmZyZWV6ZShbJ0NhcHR1cmUnLCAnQ29ydGV4IFJvdXRlJywgJ0JyYWluIFBsYW4gKERlYnVnKScsICdFeGVjdXRvciBSdW4nLCAnUmVwb3J0J10pLFxuICAgICAgZGVmYXVsdHM6IE9iamVjdC5mcmVlemUoe1xuICAgICAgICB0aGlua2luZ0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIGNvcnRleE1heEF0dGVtcHRzOiA0LFxuICAgICAgICBjb3J0ZXhQcmVmZXJTcGVlZDogdHJ1ZSxcbiAgICAgICAgY29ydGV4UHJlZmVyQ29zdDogZmFsc2UsXG4gICAgICAgIGV4ZWN1dGlvbk1vZGU6ICdzdGVwJyxcbiAgICAgICAgbGl2ZU92ZXJsYXlFbmFibGVkOiB0cnVlLFxuICAgICAgICBsaXZlT3ZlcmxheUZsYXNoOiB0cnVlLFxuICAgICAgICBmbGFzaFVpRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgYnJhaW5TeXN0ZW1UZW1wbGF0ZTpcbiAgICAgICAgICBERUZBVUxUX0JSQUlOX1NZU1RFTV9URU1QTEFURSArXG4gICAgICAgICAgJ1xcblxcbkV4dHJhIHRyYWluZXIgZ3VpZGFuY2U6XFxuLSBQcmVmZXIgc21hbGxlciwgdmVyaWZpYWJsZSBhY3Rpb24gYmF0Y2hlcyAoMS01IGFjdGlvbnMpLlxcbi0gSWYgc2VsZWN0b3JzIGFyZSB1bmNlcnRhaW4sIHJldHVybiBmZXdlciBhY3Rpb25zIGFuZCBleHBsYWluIHdoYXQgaXMgbWlzc2luZy4nXG4gICAgICB9KVxuICAgIH0pLFxuICAgIGJyb3dzZXJfc2FmZTogT2JqZWN0LmZyZWV6ZSh7XG4gICAgICBpZDogJ2Jyb3dzZXJfc2FmZScsXG4gICAgICBsYWJlbDogJ1NhZmUgTW9kZScsXG4gICAgICBkZXNjcmlwdGlvbjogJ01vcmUgY29uc2VydmF0aXZlIGJlaGF2aW9yIChsZXNzIGNsaWNraW5nLCBtb3JlIGNoZWNraW5nKS4nLFxuICAgICAgc3RlcHM6IE9iamVjdC5mcmVlemUoWydDYXB0dXJlJywgJ0NvcnRleCBSb3V0ZScsICdCcmFpbiBQbGFuIChTYWZlKScsICdFeGVjdXRvciBSdW4nLCAnUmVwb3J0J10pLFxuICAgICAgZGVmYXVsdHM6IE9iamVjdC5mcmVlemUoe1xuICAgICAgICB0aGlua2luZ0VuYWJsZWQ6IGZhbHNlLFxuICAgICAgICBjb3J0ZXhNYXhBdHRlbXB0czogMyxcbiAgICAgICAgY29ydGV4UHJlZmVyU3BlZWQ6IGZhbHNlLFxuICAgICAgICBjb3J0ZXhQcmVmZXJDb3N0OiBmYWxzZSxcbiAgICAgICAgZXhlY3V0aW9uTW9kZTogJ2JhdGNoJyxcbiAgICAgICAgbGl2ZU92ZXJsYXlFbmFibGVkOiB0cnVlLFxuICAgICAgICBsaXZlT3ZlcmxheUZsYXNoOiBmYWxzZSxcbiAgICAgICAgZmxhc2hVaUVuYWJsZWQ6IGZhbHNlLFxuICAgICAgICBicmFpblN5c3RlbVRlbXBsYXRlOlxuICAgICAgICAgIERFRkFVTFRfQlJBSU5fU1lTVEVNX1RFTVBMQVRFICtcbiAgICAgICAgICAnXFxuXFxuU2FmZXR5IHJ1bGVzOlxcbi0gRG8gTk9UIHN1Ym1pdCBwdXJjaGFzZXMgb3IgaXJyZXZlcnNpYmxlIGFjdGlvbnMuXFxuLSBJZiB5b3UgbWlnaHQgc3VibWl0IGEgZm9ybSwgaW5zdGVhZCByZXR1cm4gYWN0aW9ucyB0aGF0IGNvbGxlY3QvdmVyaWZ5IGZpZWxkcyBhbmQgc3RvcC4nXG4gICAgICB9KVxuICAgIH0pXG4gIH0pO1xuXG4gIGNvbnN0IERFRkFVTFRfUFJFU0VUX0lEID0gJ2Jyb3dzZXJfZGVmYXVsdCc7XG5cbiAgZnVuY3Rpb24gZ2V0UHJlc2V0KHByZXNldElkKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVByZXNldElkKHByZXNldElkKTtcbiAgICBpZiAobm9ybWFsaXplZCAmJiBGTE9XX1BSRVNFVFNbbm9ybWFsaXplZF0pIHJldHVybiBGTE9XX1BSRVNFVFNbbm9ybWFsaXplZF07XG4gICAgcmV0dXJuIEZMT1dfUFJFU0VUU1tERUZBVUxUX1BSRVNFVF9JRF07XG4gIH1cblxuICBmdW5jdGlvbiBidWlsZERlZmF1bHRDb25maWcocHJlc2V0SWQpIHtcbiAgICBjb25zdCBwcmVzZXQgPSBnZXRQcmVzZXQocHJlc2V0SWQpO1xuICAgIHJldHVybiB7XG4gICAgICB2ZXJzaW9uOiBWRVJTSU9OLFxuICAgICAgcHJlc2V0SWQ6IHByZXNldC5pZCxcbiAgICAgIHRoaW5raW5nRW5hYmxlZDogQm9vbGVhbihwcmVzZXQuZGVmYXVsdHMudGhpbmtpbmdFbmFibGVkKSxcbiAgICAgIGNvcnRleE1heEF0dGVtcHRzOiBjbGFtcEludChwcmVzZXQuZGVmYXVsdHMuY29ydGV4TWF4QXR0ZW1wdHMsIDEsIDQsIDQpLFxuICAgICAgY29ydGV4UHJlZmVyU3BlZWQ6IEJvb2xlYW4ocHJlc2V0LmRlZmF1bHRzLmNvcnRleFByZWZlclNwZWVkKSxcbiAgICAgIGNvcnRleFByZWZlckNvc3Q6IEJvb2xlYW4ocHJlc2V0LmRlZmF1bHRzLmNvcnRleFByZWZlckNvc3QpLFxuICAgICAgZXhlY3V0aW9uTW9kZTogU3RyaW5nKHByZXNldC5kZWZhdWx0cy5leGVjdXRpb25Nb2RlIHx8ICdiYXRjaCcpLFxuICAgICAgbGl2ZU92ZXJsYXlFbmFibGVkOiBCb29sZWFuKHByZXNldC5kZWZhdWx0cy5saXZlT3ZlcmxheUVuYWJsZWQpLFxuICAgICAgbGl2ZU92ZXJsYXlGbGFzaDogQm9vbGVhbihwcmVzZXQuZGVmYXVsdHMubGl2ZU92ZXJsYXlGbGFzaCksXG4gICAgICBmbGFzaFVpRW5hYmxlZDogQm9vbGVhbihwcmVzZXQuZGVmYXVsdHMuZmxhc2hVaUVuYWJsZWQpLFxuICAgICAgYnJhaW5TeXN0ZW1UZW1wbGF0ZTogU3RyaW5nKHByZXNldC5kZWZhdWx0cy5icmFpblN5c3RlbVRlbXBsYXRlIHx8IERFRkFVTFRfQlJBSU5fU1lTVEVNX1RFTVBMQVRFKVxuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiBub3JtYWxpemVFeGVjdXRpb25Nb2RlKHJhdykge1xuICAgIGNvbnN0IHZhbHVlID0gU3RyaW5nKHJhdyB8fCAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKHZhbHVlID09PSAnc3RlcCcgfHwgdmFsdWUgPT09ICdpbnRlcmFjdGl2ZScpIHJldHVybiAnc3RlcCc7XG4gICAgcmV0dXJuICdiYXRjaCc7XG4gIH1cblxuICBmdW5jdGlvbiBub3JtYWxpemVDb25maWcocmF3KSB7XG4gICAgY29uc3QgaW5wdXQgPSByYXcgJiYgdHlwZW9mIHJhdyA9PT0gJ29iamVjdCcgPyByYXcgOiB7fTtcbiAgICBjb25zdCBwcmVzZXQgPSBnZXRQcmVzZXQoaW5wdXQucHJlc2V0SWQpO1xuICAgIGNvbnN0IGJhc2UgPSBidWlsZERlZmF1bHRDb25maWcocHJlc2V0LmlkKTtcbiAgICBjb25zdCBicmFpblRlbXBsYXRlID0gU3RyaW5nKGlucHV0LmJyYWluU3lzdGVtVGVtcGxhdGUgfHwgJycpLnRyaW0oKTtcbiAgICByZXR1cm4ge1xuICAgICAgdmVyc2lvbjogVkVSU0lPTixcbiAgICAgIHByZXNldElkOiBwcmVzZXQuaWQsXG4gICAgICB0aGlua2luZ0VuYWJsZWQ6IHRvQm9vbChpbnB1dC50aGlua2luZ0VuYWJsZWQsIGJhc2UudGhpbmtpbmdFbmFibGVkKSxcbiAgICAgIGNvcnRleE1heEF0dGVtcHRzOiBjbGFtcEludChpbnB1dC5jb3J0ZXhNYXhBdHRlbXB0cywgMSwgNCwgYmFzZS5jb3J0ZXhNYXhBdHRlbXB0cyksXG4gICAgICBjb3J0ZXhQcmVmZXJTcGVlZDogdG9Cb29sKGlucHV0LmNvcnRleFByZWZlclNwZWVkLCBiYXNlLmNvcnRleFByZWZlclNwZWVkKSxcbiAgICAgIGNvcnRleFByZWZlckNvc3Q6IHRvQm9vbChpbnB1dC5jb3J0ZXhQcmVmZXJDb3N0LCBiYXNlLmNvcnRleFByZWZlckNvc3QpLFxuICAgICAgZXhlY3V0aW9uTW9kZTogbm9ybWFsaXplRXhlY3V0aW9uTW9kZShpbnB1dC5leGVjdXRpb25Nb2RlIHx8IGJhc2UuZXhlY3V0aW9uTW9kZSksXG4gICAgICBsaXZlT3ZlcmxheUVuYWJsZWQ6IHRvQm9vbChpbnB1dC5saXZlT3ZlcmxheUVuYWJsZWQsIGJhc2UubGl2ZU92ZXJsYXlFbmFibGVkKSxcbiAgICAgIGxpdmVPdmVybGF5Rmxhc2g6IHRvQm9vbChpbnB1dC5saXZlT3ZlcmxheUZsYXNoLCBiYXNlLmxpdmVPdmVybGF5Rmxhc2gpLFxuICAgICAgZmxhc2hVaUVuYWJsZWQ6IHRvQm9vbChpbnB1dC5mbGFzaFVpRW5hYmxlZCwgYmFzZS5mbGFzaFVpRW5hYmxlZCksXG4gICAgICBicmFpblN5c3RlbVRlbXBsYXRlOiBicmFpblRlbXBsYXRlIHx8IGJhc2UuYnJhaW5TeXN0ZW1UZW1wbGF0ZVxuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiByZW5kZXJUZW1wbGF0ZSh0ZW1wbGF0ZSwgdmFycykge1xuICAgIGNvbnN0IHRleHQgPSBTdHJpbmcodGVtcGxhdGUgfHwgJycpO1xuICAgIGlmICghdGV4dCkgcmV0dXJuICcnO1xuICAgIGNvbnN0IHNhZmVWYXJzID0gdmFycyAmJiB0eXBlb2YgdmFycyA9PT0gJ29iamVjdCcgPyB2YXJzIDoge307XG4gICAgcmV0dXJuIHRleHQucmVwbGFjZSgvXFx7KFthLXpBLVowLTlfXSspXFx9L2csIChfbWF0Y2gsIGtleSkgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBzYWZlVmFyc1trZXldO1xuICAgICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHJldHVybiAnJztcbiAgICAgIHJldHVybiBTdHJpbmcodmFsdWUpO1xuICAgIH0pO1xuICB9XG5cbiAgZ2xvYmFsVGhpcy5Db3J0ZXhFeHRDb25maWcgPSBPYmplY3QuZnJlZXplKHtcbiAgICBWRVJTSU9OLFxuICAgIFNUT1JBR0VfS0VZLFxuICAgIEZMT1dfUFJFU0VUUyxcbiAgICBERUZBVUxUX1BSRVNFVF9JRCxcbiAgICBERUZBVUxUX0JSQUlOX1NZU1RFTV9URU1QTEFURSxcbiAgICBnZXRQcmVzZXQsXG4gICAgYnVpbGREZWZhdWx0Q29uZmlnLFxuICAgIG5vcm1hbGl6ZUNvbmZpZyxcbiAgICByZW5kZXJUZW1wbGF0ZVxuICB9KTtcbn0pKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7O0NBWUMsZ0NBQVMsc0JBQXNCO0FBQzlCO0FBRUEsUUFBTSxjQUFjO0FBQ3BCLFFBQU0sVUFBVTtBQUVoQixXQUFTLFNBQVMsT0FBTyxLQUFLLEtBQUssVUFBVTtBQUMzQyxVQUFNLElBQUksT0FBTyxLQUFLO0FBQ3RCLFFBQUksQ0FBQyxPQUFPLFNBQVMsQ0FBQyxFQUFHLFFBQU87QUFDaEMs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
