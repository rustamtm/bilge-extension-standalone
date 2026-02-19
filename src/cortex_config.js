/**
 * Cortex Extension Config (v1)
 *
 * Shared by:
 * - background.js (service worker)
 * - sidepanel.html/sidepanel.js (UI)
 *
 * Goal: editable "flow preset" + prompt override + thinking-mode toggle that
 * matches how the Chrome extension actually operates:
 * Capture -> Cortex Route -> Brain (backend) -> Executor -> Report
 */

(function initCortexExtConfig() {
  'use strict';

  const STORAGE_KEY = 'cortexExtConfigV1';
  const VERSION = 1;

  function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  function toBool(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (!normalized) return fallback;
      if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
      if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
    }
    return fallback;
  }

  function normalizePresetId(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    return value;
  }

  const DEFAULT_BRAIN_SYSTEM_TEMPLATE =
    [
      'You are the Brain for a Chrome extension web automation agent.',
      '',
      'Context:',
      '- Goal: {goal}',
      '- URL: {url}',
      '- Title: {title}',
      '- Mode: {mode}',
      '- Script actions allowed: {allow_script_actions}',
      '',
      'Default conditioning:',
      '- Be recovery-first: handle minor typos and imperfect phrasing as valid intent when possible.',
      '- Prefer short, directly executable actions over explanation.',
      '- Avoid parser-style failure language; degrade gracefully with safe fallback actions.',
      '- For browser commands (scroll/click/type/navigation/screenshot), prioritize direct DOM execution flow.',
      '',
      'Cortex routing (FYI):',
      '- Intent: {cortex_intent}',
      '- Strategy: {cortex_strategy}',
      '- Hints: {cortex_hints}',
      '',
      'Return ONLY a single JSON object with:',
      '- "description": short summary of what you see and what you will do next',
      '- "actions": an array of DOM actions',
      '',
      'Allowed action types: click, fill, scroll, wait, script.',
      'Only include "script" actions when Script actions allowed is true.',
      '',
      'Action schema examples:',
      '- click: { "type": "click", "selector": "..." }',
      '- fill: { "type": "fill", "selector": "...", "value": "..." }',
      '- scroll: { "type": "scroll", "selector": "..." }',
      '- wait: { "type": "wait", "duration": 1000 }',
      '- script: { "type": "script", "code": "return document.querySelectorAll(\\\"input\\\").length;" }',
      '',
      'Selector rules:',
      '- Prefer stable attributes: id, name, aria-label, data-testid, data-qa.',
      '- Avoid brittle nth-child selectors.',
      '',
      'If the goal is unclear or you are not confident, return {"actions": [], "description": "Goal unclear."}.'
    ].join('\n');

  const FLOW_PRESETS = Object.freeze({
    browser_default: Object.freeze({
      id: 'browser_default',
      label: 'Browser Default',
      description: 'Balanced routing for normal web tasks.',
      steps: Object.freeze(['Capture', 'Cortex Route', 'Brain Plan', 'Executor Run', 'Report']),
      defaults: Object.freeze({
        thinkingEnabled: false,
        cortexMaxAttempts: 4,
        cortexPreferSpeed: false,
        cortexPreferCost: false,
        executionMode: 'batch', // batch | step
        liveOverlayEnabled: true,
        liveOverlayFlash: false,
        flashUiEnabled: false,
        brainSystemTemplate: DEFAULT_BRAIN_SYSTEM_TEMPLATE
      })
    }),
    browser_trainer: Object.freeze({
      id: 'browser_trainer',
      label: 'Trainer / Debug',
      description: 'More verbose debugging; optimized for iteration.',
      steps: Object.freeze(['Capture', 'Cortex Route', 'Brain Plan (Debug)', 'Executor Run', 'Report']),
      defaults: Object.freeze({
        thinkingEnabled: true,
        cortexMaxAttempts: 4,
        cortexPreferSpeed: true,
        cortexPreferCost: false,
        executionMode: 'step',
        liveOverlayEnabled: true,
        liveOverlayFlash: true,
        flashUiEnabled: true,
        brainSystemTemplate:
          DEFAULT_BRAIN_SYSTEM_TEMPLATE +
          '\n\nExtra trainer guidance:\n- Prefer smaller, verifiable action batches (1-5 actions).\n- If selectors are uncertain, return fewer actions and explain what is missing.'
      })
    }),
    browser_safe: Object.freeze({
      id: 'browser_safe',
      label: 'Safe Mode',
      description: 'More conservative behavior (less clicking, more checking).',
      steps: Object.freeze(['Capture', 'Cortex Route', 'Brain Plan (Safe)', 'Executor Run', 'Report']),
      defaults: Object.freeze({
        thinkingEnabled: false,
        cortexMaxAttempts: 3,
        cortexPreferSpeed: false,
        cortexPreferCost: false,
        executionMode: 'batch',
        liveOverlayEnabled: true,
        liveOverlayFlash: false,
        flashUiEnabled: false,
        brainSystemTemplate:
          DEFAULT_BRAIN_SYSTEM_TEMPLATE +
          '\n\nSafety rules:\n- Do NOT submit purchases or irreversible actions.\n- If you might submit a form, instead return actions that collect/verify fields and stop.'
      })
    })
  });

  const DEFAULT_PRESET_ID = 'browser_default';

  function getPreset(presetId) {
    const normalized = normalizePresetId(presetId);
    if (normalized && FLOW_PRESETS[normalized]) return FLOW_PRESETS[normalized];
    return FLOW_PRESETS[DEFAULT_PRESET_ID];
  }

  function buildDefaultConfig(presetId) {
    const preset = getPreset(presetId);
    return {
      version: VERSION,
      presetId: preset.id,
      thinkingEnabled: Boolean(preset.defaults.thinkingEnabled),
      cortexMaxAttempts: clampInt(preset.defaults.cortexMaxAttempts, 1, 4, 4),
      cortexPreferSpeed: Boolean(preset.defaults.cortexPreferSpeed),
      cortexPreferCost: Boolean(preset.defaults.cortexPreferCost),
      executionMode: String(preset.defaults.executionMode || 'batch'),
      liveOverlayEnabled: Boolean(preset.defaults.liveOverlayEnabled),
      liveOverlayFlash: Boolean(preset.defaults.liveOverlayFlash),
      flashUiEnabled: Boolean(preset.defaults.flashUiEnabled),
      brainSystemTemplate: String(preset.defaults.brainSystemTemplate || DEFAULT_BRAIN_SYSTEM_TEMPLATE)
    };
  }

  function normalizeExecutionMode(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'step' || value === 'interactive') return 'step';
    return 'batch';
  }

  function normalizeConfig(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const preset = getPreset(input.presetId);
    const base = buildDefaultConfig(preset.id);
    const brainTemplate = String(input.brainSystemTemplate || '').trim();
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

  function renderTemplate(template, vars) {
    const text = String(template || '');
    if (!text) return '';
    const safeVars = vars && typeof vars === 'object' ? vars : {};
    return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
      const value = safeVars[key];
      if (value === undefined || value === null) return '';
      return String(value);
    });
  }

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
})();
