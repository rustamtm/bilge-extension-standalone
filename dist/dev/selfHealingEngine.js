var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/selfHealingEngine.js
(function() {
  "use strict";
  if (window.__bilge_selfHealingEngine) return;
  const STORAGE_KEY_TELEMETRY = "__bilge_recovery_telemetry_v1";
  const MAX_TELEMETRY_ENTRIES = 200;
  const TELEMETRY_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
  class SelfHealingEngine {
    static {
      __name(this, "SelfHealingEngine");
    }
    constructor() {
      this.strategies = /* @__PURE__ */ new Map();
      this.failureHistory = /* @__PURE__ */ new Map();
      this.recoveryTelemetry = [];
      this.initialized = false;
      this._registerBuiltinStrategies();
    }
    // Strategy priority constants (higher = tried first)
    static STRATEGY_PRIORITIES = {
      DOM_SKILL_MEMORY: 100,
      // Existing: learned hints from content.js
      HEURISTIC_MATCH: 90,
      // Existing: token scoring from content.js
      SELECTOR_PERMUTATION: 80,
      // NEW: auto-generate alternatives
      PROBE_SCROLL: 70,
      // Existing: scroll discovery from dom_runtime.js
      MUTATION_WAIT: 60,
      // NEW: wait for DOM changes
      FRAME_TRAVERSAL: 50,
      // Existing + enhanced
      LABEL_PROXIMITY: 40,
      // NEW: nearby label text
      VALIDATION_RETRY: 30
      // NEW: post-validation fix
    };
    /**
     * Register a recovery strategy
     * @param {string} name - Strategy identifier
     * @param {number} priority - Higher = tried first
     * @param {Function} handler - async (context) => { success, element?, info? }
     */
    registerStrategy(name, priority, handler) {
      this.strategies.set(name, { name, priority, handler });
    }
    /**
     * Get strategies sorted by priority (highest first)
     */
    getSortedStrategies() {
      return Array.from(this.strategies.values()).sort((a, b) => b.priority - a.priority);
    }
    /**
     * Register built-in recovery strategies
     */
    _registerBuiltinStrategies() {
      const priorities = SelfHealingEngine.STRATEGY_PRIORITIES;
      this.registerStrategy("DOM_SKILL_MEMORY", priorities.DOM_SKILL_MEMORY, async (ctx) => {
        if (!ctx.intent || !ctx.target) return { success: false };
        if (typeof window.__bilgeMatchDomSkill === "function") {
          const result = await window.__bilgeMatchDomSkill(ctx.intent, ctx.target);
          if (result?.element) {
            return { success: true, element: result.element, info: { entry: result.entry } };
          }
        }
        return { success: false };
      });
      this.registerStrategy("HEURISTIC_MATCH", priorities.HEURISTIC_MATCH, async (ctx) => {
        if (typeof window.__bilgeFindElementByHeuristic !== "function") {
          return { success: false };
        }
        const hints = ctx.hints || {};
        const element = window.__bilgeFindElementByHeuristic({
          label: hints.label || ctx.target,
          field: hints.field || ctx.target,
          name: hints.name,
          placeholder: hints.placeholder
        }, ctx.failedSelectors?.[0] || null);
        if (element && this._isUsable(element)) {
          return { success: true, element, info: { matchedBy: "heuristic" } };
        }
        return { success: false };
      });
      this.registerStrategy("SELECTOR_PERMUTATION", priorities.SELECTOR_PERMUTATION, async (ctx) => {
        const permutations = this.generateSelectorPermutations(ctx.hints, ctx.failedSelectors);
        for (const selector of permutations) {
          try {
            const element = document.querySelector(selector);
            if (element && this._isUsable(element)) {
              return { success: true, element, info: { matchedBy: "permutation", selector } };
            }
          } catch (_err) {
          }
        }
        return { success: false };
      });
      this.registerStrategy("PROBE_SCROLL", priorities.PROBE_SCROLL, async (ctx) => {
        if (!ctx.target && !ctx.hints) return { success: false };
        const probeDistance = Math.max(240, Math.round(window.innerHeight * 0.8));
        const maxProbes = 4;
        const originalScroll = window.scrollY;
        for (let probe = 1; probe <= maxProbes; probe++) {
          window.scrollBy({ top: probeDistance, behavior: "auto" });
          await this._sleep(150);
          const element = await this._tryFindElement(ctx);
          if (element) {
            return { success: true, element, info: { matchedBy: "probe_scroll", probe } };
          }
        }
        window.scrollTo({ top: 0, behavior: "auto" });
        await this._sleep(150);
        const elementFromTop = await this._tryFindElement(ctx);
        if (elementFromTop) {
          return { success: true, element: elementFromTop, info: { matchedBy: "probe_scroll_reset" } };
        }
        window.scrollTo({ top: originalScroll, behavior: "auto" });
        return { success: false };
      });
      this.registerStrategy("MUTATION_WAIT", priorities.MUTATION_WAIT, async (ctx) => {
        const timeout = ctx.waitTimeout || 3e3;
        const selectors = this._buildSelectors(ctx);
        if (selectors.length === 0) return { success: false };
        return new Promise((resolve) => {
          let resolved = false;
          const checkForElement = /* @__PURE__ */ __name(() => {
            for (const selector of selectors) {
              try {
                const element = document.querySelector(selector);
                if (element && this._isUsable(element)) {
                  return element;
                }
              } catch (_err) {
              }
            }
            return null;
          }, "checkForElement");
          const immediate = checkForElement();
          if (immediate) {
            resolve({ success: true, element: immediate, info: { matchedBy: "mutation_immediate" } });
            return;
          }
          const observer = new MutationObserver(() => {
            if (resolved) return;
            const found = checkForElement();
            if (found) {
              resolved = true;
              observer.disconnect();
              resolve({ success: true, element: found, info: { matchedBy: "mutation_observed" } });
            }
          });
          observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true
          });
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              observer.disconnect();
              resolve({ success: false });
            }
          }, timeout);
        });
      });
      this.registerStrategy("FRAME_TRAVERSAL", priorities.FRAME_TRAVERSAL, async (ctx) => {
        const selectors = this._buildSelectors(ctx);
        if (selectors.length === 0) return { success: false };
        const element = this._querySelectorDeepAll(selectors[0]);
        if (element && this._isUsable(element)) {
          return { success: true, element, info: { matchedBy: "frame_traversal" } };
        }
        return { success: false };
      });
      this.registerStrategy("LABEL_PROXIMITY", priorities.LABEL_PROXIMITY, async (ctx) => {
        const labelText = ctx.hints?.label || ctx.hints?.labelText || ctx.target;
        if (!labelText) return { success: false };
        const element = this._findInputFromLabelText(labelText);
        if (element && this._isUsable(element)) {
          return { success: true, element, info: { matchedBy: "label_proximity", labelText } };
        }
        return { success: false };
      });
      this.registerStrategy("VALIDATION_RETRY", priorities.VALIDATION_RETRY, async (ctx) => {
        if (!ctx.validationError) return { success: false };
        const hints = ctx.hints || {};
        const relaxedHints = {
          ...hints,
          label: hints.label?.split(" ").slice(0, 2).join(" ")
          // Shorten label
        };
        if (typeof window.__bilgeFindElementByHeuristic === "function") {
          const element = window.__bilgeFindElementByHeuristic({
            label: relaxedHints.label,
            field: relaxedHints.field,
            name: relaxedHints.name,
            placeholder: relaxedHints.placeholder
          }, null);
          if (element && this._isUsable(element)) {
            return { success: true, element, info: { matchedBy: "validation_retry", relaxed: true } };
          }
        }
        return { success: false };
      });
    }
    /**
     * Main recovery pipeline - attempt all strategies in priority order
     * @param {string} intent - 'type', 'click', 'fill', etc.
     * @param {string} target - Target identifier (field name, label, etc.)
     * @param {string[]} failedSelectors - Selectors that already failed
     * @param {Object} context - Additional context (hints, pageContext, etc.)
     * @returns {Promise<{success: boolean, element?: Element, strategy?: string, info?: Object}>}
     */
    async attemptRecovery(intent, target, failedSelectors = [], context = {}) {
      const startTime = Date.now();
      const recoveryContext = {
        intent,
        target,
        failedSelectors,
        hints: context.hints || {},
        pageContext: context.pageContext || {},
        waitTimeout: context.waitTimeout || 3e3,
        validationError: context.validationError || null
      };
      for (const strategy of this.getSortedStrategies()) {
        try {
          const result = await strategy.handler(recoveryContext);
          if (result.success && result.element) {
            const duration2 = Date.now() - startTime;
            this._recordSuccess(strategy.name, target, duration2, result.info);
            return {
              success: true,
              element: result.element,
              strategy: strategy.name,
              info: result.info || {},
              duration: duration2
            };
          }
        } catch (err) {
          console.warn(`[SelfHealingEngine] Strategy ${strategy.name} error:`, err.message);
        }
      }
      const duration = Date.now() - startTime;
      this._recordFailure(intent, target, failedSelectors, duration);
      return {
        success: false,
        error: "All recovery strategies exhausted",
        strategiesAttempted: this.strategies.size,
        duration
      };
    }
    /**
     * Generate alternative selectors from hints
     */
    generateSelectorPermutations(hints = {}, failedSelectors = []) {
      const alternatives = [];
      const failed = new Set(failedSelectors || []);
      const addIfValid = /* @__PURE__ */ __name((selector) => {
        if (selector && !failed.has(selector)) {
          alternatives.push(selector);
        }
      }, "addIfValid");
      if (hints.id) {
        addIfValid(`#${CSS.escape(hints.id)}`);
        addIfValid(`[id="${CSS.escape(hints.id)}"]`);
        addIfValid(`[id*="${CSS.escape(hints.id)}"]`);
      }
      if (hints.name) {
        addIfValid(`[name="${CSS.escape(hints.name)}"]`);
        addIfValid(`[name*="${CSS.escape(hints.name)}"]`);
        addIfValid(`input[name="${CSS.escape(hints.name)}"]`);
        addIfValid(`textarea[name="${CSS.escape(hints.name)}"]`);
        addIfValid(`select[name="${CSS.escape(hints.name)}"]`);
      }
      if (hints.ariaLabel) {
        addIfValid(`[aria-label="${CSS.escape(hints.ariaLabel)}"]`);
        addIfValid(`[aria-label*="${CSS.escape(hints.ariaLabel)}"]`);
      }
      if (hints.placeholder) {
        addIfValid(`[placeholder="${CSS.escape(hints.placeholder)}"]`);
        addIfValid(`[placeholder*="${CSS.escape(hints.placeholder)}"]`);
      }
      if (hints.dataTestId) {
        addIfValid(`[data-testid="${CSS.escape(hints.dataTestId)}"]`);
        addIfValid(`[data-test-id="${CSS.escape(hints.dataTestId)}"]`);
        addIfValid(`[data-qa="${CSS.escape(hints.dataTestId)}"]`);
      }
      if (hints.autocomplete) {
        addIfValid(`[autocomplete="${CSS.escape(hints.autocomplete)}"]`);
      }
      if (hints.type && hints.name) {
        addIfValid(`input[type="${CSS.escape(hints.type)}"][name*="${CSS.escape(hints.name)}"]`);
      }
      return alternatives;
    }
    /**
     * Record successful recovery for telemetry
     */
    _recordSuccess(strategyName, target, duration, info = {}) {
      this.recoveryTelemetry.push({
        type: "success",
        strategy: strategyName,
        target: String(target || "").slice(0, 100),
        duration,
        timestamp: Date.now(),
        info: info || {}
      });
      this._pruneAndSaveTelemetry();
    }
    /**
     * Record failed recovery attempt
     */
    _recordFailure(intent, target, failedSelectors, duration) {
      const key = `${intent}:${target}`;
      const history = this.failureHistory.get(key) || { attempts: 0, lastAttempt: 0 };
      history.attempts += 1;
      history.lastAttempt = Date.now();
      this.failureHistory.set(key, history);
      this.recoveryTelemetry.push({
        type: "failure",
        intent,
        target: String(target || "").slice(0, 100),
        failedSelectors: (failedSelectors || []).slice(0, 5),
        duration,
        timestamp: Date.now()
      });
      this._pruneAndSaveTelemetry();
    }
    /**
     * Prune and save telemetry to storage
     */
    async _pruneAndSaveTelemetry() {
      const now = Date.now();
      this.recoveryTelemetry = this.recoveryTelemetry.filter((entry) => now - entry.timestamp < TELEMETRY_TTL_MS).slice(-MAX_TELEMETRY_ENTRIES);
      try {
        await chrome.storage.local.set({
          [STORAGE_KEY_TELEMETRY]: this.recoveryTelemetry
        });
      } catch (_err) {
      }
    }
    /**
     * Load telemetry from storage
     */
    async loadTelemetry() {
      try {
        const result = await chrome.storage.local.get([STORAGE_KEY_TELEMETRY]);
        this.recoveryTelemetry = Array.isArray(result[STORAGE_KEY_TELEMETRY]) ? result[STORAGE_KEY_TELEMETRY] : [];
      } catch (_err) {
        this.recoveryTelemetry = [];
      }
    }
    /**
     * Get recovery statistics
     */
    getStats() {
      const stats = {
        totalRecoveries: this.recoveryTelemetry.length,
        successCount: 0,
        failureCount: 0,
        byStrategy: {},
        avgDuration: 0
      };
      let totalDuration = 0;
      for (const entry of this.recoveryTelemetry) {
        if (entry.type === "success") {
          stats.successCount += 1;
          stats.byStrategy[entry.strategy] = (stats.byStrategy[entry.strategy] || 0) + 1;
        } else {
          stats.failureCount += 1;
        }
        totalDuration += entry.duration || 0;
      }
      if (stats.totalRecoveries > 0) {
        stats.avgDuration = Math.round(totalDuration / stats.totalRecoveries);
        stats.successRate = Math.round(stats.successCount / stats.totalRecoveries * 100);
      }
      return stats;
    }
    // === Helper methods ===
    _sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    _isUsable(element) {
      if (!(element instanceof Element)) return false;
      const disabled = element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
      if (disabled) return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (rect.width < 2 || rect.height < 2) return false;
      return true;
    }
    _buildSelectors(ctx) {
      const selectors = [];
      const hints = ctx.hints || {};
      if (hints.id) selectors.push(`#${CSS.escape(hints.id)}`);
      if (hints.name) selectors.push(`[name="${CSS.escape(hints.name)}"]`);
      if (hints.ariaLabel) selectors.push(`[aria-label="${CSS.escape(hints.ariaLabel)}"]`);
      if (hints.dataTestId) selectors.push(`[data-testid="${CSS.escape(hints.dataTestId)}"]`);
      return selectors;
    }
    async _tryFindElement(ctx) {
      if (typeof window.__bilgeFindElementByHeuristic === "function") {
        const hints = ctx.hints || {};
        return window.__bilgeFindElementByHeuristic({
          label: hints.label || ctx.target,
          field: hints.field || ctx.target,
          name: hints.name,
          placeholder: hints.placeholder
        }, null);
      }
      return null;
    }
    /**
     * Deep query selector that traverses shadow roots and iframes
     */
    _querySelectorDeepAll(selector, root = document) {
      const MAX_DEPTH = 100;
      const pendingRoots = [{ root, depth: 0 }];
      const seenRoots = /* @__PURE__ */ new WeakSet();
      while (pendingRoots.length > 0) {
        const { root: currentRoot, depth } = pendingRoots.shift();
        if (!currentRoot || seenRoots.has(currentRoot) || depth > MAX_DEPTH) continue;
        seenRoots.add(currentRoot);
        try {
          const found = currentRoot.querySelector(selector);
          if (found) return found;
        } catch (_err) {
        }
        try {
          const walker = document.createTreeWalker(currentRoot, NodeFilter.SHOW_ELEMENT);
          for (let node = walker.currentNode; node; node = walker.nextNode()) {
            if (node.shadowRoot) {
              pendingRoots.push({ root: node.shadowRoot, depth: depth + 1 });
            }
            const tag = String(node?.tagName || "").toUpperCase();
            if (tag === "IFRAME" || tag === "FRAME") {
              try {
                if (node.contentDocument) {
                  pendingRoots.push({ root: node.contentDocument, depth: depth + 1 });
                }
              } catch (_err) {
              }
            }
          }
        } catch (_err) {
        }
      }
      return null;
    }
    /**
     * Find input from associated label text
     */
    _findInputFromLabelText(labelText) {
      const norm = String(labelText || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (!norm) return null;
      const labels = Array.from(document.querySelectorAll("label"));
      for (const label of labels) {
        const text = String(label.textContent || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
        if (!text || !text.includes(norm)) continue;
        const htmlFor = String(label.getAttribute("for") || "");
        if (htmlFor) {
          const byFor = document.getElementById(htmlFor);
          if (byFor && this._isUsable(byFor)) return byFor;
        }
        const nested = label.querySelector('input, textarea, select, [contenteditable="true"]');
        if (nested && this._isUsable(nested)) return nested;
        const parentInput = label.parentElement?.querySelector?.('input, textarea, select, [contenteditable="true"]');
        if (parentInput && this._isUsable(parentInput)) return parentInput;
      }
      return null;
    }
  }
  window.__bilge_selfHealingEngine = new SelfHealingEngine();
  window.__bilge_selfHealingEngine.loadTelemetry().catch(() => {
  });
  console.log("[Bilge] SelfHealingEngine initialized");
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NlbGZIZWFsaW5nRW5naW5lLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBzZWxmSGVhbGluZ0VuZ2luZS5qcyAtIENlbnRyYWxpemVkIHJlY292ZXJ5IGNvb3JkaW5hdG9yIGZvciByZXNpbGllbnQgZm9ybSBhdXRvbWF0aW9uXG4vLyBPcmNoZXN0cmF0ZXMgZXhpc3RpbmcgKyBuZXcgcmVjb3Zlcnkgc3RyYXRlZ2llcyB3aXRoIHByaW9yaXR5LWJhc2VkIGV4ZWN1dGlvblxuXG4oZnVuY3Rpb24oKSB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBpZiAod2luZG93Ll9fYmlsZ2Vfc2VsZkhlYWxpbmdFbmdpbmUpIHJldHVybjtcblxuICBjb25zdCBTVE9SQUdFX0tFWV9URUxFTUVUUlkgPSAnX19iaWxnZV9yZWNvdmVyeV90ZWxlbWV0cnlfdjEnO1xuICBjb25zdCBNQVhfVEVMRU1FVFJZX0VOVFJJRVMgPSAyMDA7XG4gIGNvbnN0IFRFTEVNRVRSWV9UVExfTVMgPSA3ICogMjQgKiA2MCAqIDYwICogMTAwMDsgLy8gNyBkYXlzXG5cbiAgLyoqXG4gICAqIFNlbGYtSGVhbGluZyBFbmdpbmUgLSBjb29yZGluYXRlcyBtdWx0aXBsZSByZWNvdmVyeSBzdHJhdGVnaWVzXG4gICAqL1xuICBjbGFzcyBTZWxmSGVhbGluZ0VuZ2luZSB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICB0aGlzLnN0cmF0ZWdpZXMgPSBuZXcgTWFwKCk7XG4gICAgICB0aGlzLmZhaWx1cmVIaXN0b3J5ID0gbmV3IE1hcCgpOyAvLyBzZWxlY3RvciAtPiB7IGF0dGVtcHRzLCBsYXN0QXR0ZW1wdCB9XG4gICAgICB0aGlzLnJlY292ZXJ5VGVsZW1ldHJ5ID0gW107XG4gICAgICB0aGlzLmluaXRpYWxpemVkID0gZmFsc2U7XG5cbiAgICAgIHRoaXMuX3JlZ2lzdGVyQnVpbHRpblN0cmF0ZWdpZXMoKTtcbiAgICB9XG5cbiAgICAvLyBTdHJhdGVneSBwcmlvcml0eSBjb25zdGFudHMgKGhpZ2hlciA9IHRyaWVkIGZpcnN0KVxuICAgIHN0YXRpYyBTVFJBVEVHWV9QUklPUklUSUVTID0ge1xuICAgICAgRE9NX1NLSUxMX01FTU9SWTogMTAwLCAgICAgIC8vIEV4aXN0aW5nOiBsZWFybmVkIGhpbnRzIGZyb20gY29udGVudC5qc1xuICAgICAgSEVVUklTVElDX01BVENIOiA5MCwgICAgICAgICAvLyBFeGlzdGluZzogdG9rZW4gc2NvcmluZyBmcm9tIGNvbnRlbnQuanNcbiAgICAgIFNFTEVDVE9SX1BFUk1VVEFUSU9OOiA4MCwgICAgLy8gTkVXOiBhdXRvLWdlbmVyYXRlIGFsdGVybmF0aXZlc1xuICAgICAgUFJPQkVfU0NST0xMOiA3MCwgICAgICAgICAgICAvLyBFeGlzdGluZzogc2Nyb2xsIGRpc2NvdmVyeSBmcm9tIGRvbV9ydW50aW1lLmpzXG4gICAgICBNVVRBVElPTl9XQUlUOiA2MCwgICAgICAgICAgIC8vIE5FVzogd2FpdCBmb3IgRE9NIGNoYW5nZXNcbiAgICAgIEZSQU1FX1RSQVZFUlNBTDogNTAsICAgICAgICAgLy8gRXhpc3RpbmcgKyBlbmhhbmNlZFxuICAgICAgTEFCRUxfUFJPWElNSVRZOiA0MCwgICAgICAgICAvLyBORVc6IG5lYXJieSBsYWJlbCB0ZXh0XG4gICAgICBWQUxJREFUSU9OX1JFVFJZOiAzMCwgICAgICAgIC8vIE5FVzogcG9zdC12YWxpZGF0aW9uIGZpeFxuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBSZWdpc3RlciBhIHJlY292ZXJ5IHN0cmF0ZWd5XG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBTdHJhdGVneSBpZGVudGlmaWVyXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHByaW9yaXR5IC0gSGlnaGVyID0gdHJpZWQgZmlyc3RcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBoYW5kbGVyIC0gYXN5bmMgKGNvbnRleHQpID0+IHsgc3VjY2VzcywgZWxlbWVudD8sIGluZm8/IH1cbiAgICAgKi9cbiAgICByZWdpc3RlclN0cmF0ZWd5KG5hbWUsIHByaW9yaXR5LCBoYW5kbGVyKSB7XG4gICAgICB0aGlzLnN0cmF0ZWdpZXMuc2V0KG5hbWUsIHsgbmFtZSwgcHJpb3JpdHksIGhhbmRsZXIgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IHN0cmF0ZWdpZXMgc29ydGVkIGJ5IHByaW9yaXR5IChoaWdoZXN0IGZpcnN0KVxuICAgICAqL1xuICAgIGdldFNvcnRlZFN0cmF0ZWdpZXMoKSB7XG4gICAgICByZXR1cm4gQXJyYXkuZnJvbSh0aGlzLnN0cmF0ZWdpZXMudmFsdWVzKCkpXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBiLnByaW9yaXR5IC0gYS5wcmlvcml0eSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVnaXN0ZXIgYnVpbHQtaW4gcmVjb3Zlcnkgc3RyYXRlZ2llc1xuICAgICAqL1xuICAgIF9yZWdpc3RlckJ1aWx0aW5TdHJhdGVnaWVzKCkge1xuICAgICAgY29uc3QgcHJpb3JpdGllcyA9IFNlbGZIZWFsaW5nRW5naW5lLlNUUkFURUdZX1BSSU9SSVRJRVM7XG5cbiAgICAgIC8vIERPTV9TS0lMTF9NRU1PUlkgLSBsZXZlcmFnZXMgZXhpc3RpbmcgbGVhcm5lZCBoaW50c1xuICAgICAgdGhpcy5yZWdpc3RlclN0cmF0ZWd5KCdET01fU0tJTExfTUVNT1JZJywgcHJpb3JpdGllcy5ET01fU0tJTExfTUVNT1JZLCBhc3luYyAoY3R4KSA9PiB7XG4gICAgICAgIGlmICghY3R4LmludGVudCB8fCAhY3R4LnRhcmdldCkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UgfTtcbiAgICAgICAgXG4gICAgICAgIC8vIFVzZSBleGlzdGluZyBtYXRjaERvbVNraWxsIGZyb20gY29udGVudC5qcyBpZiBhdmFpbGFibGVcbiAgICAgICAgaWYgKHR5cGVvZiB3aW5kb3cuX19iaWxnZU1hdGNoRG9tU2tpbGwgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB3aW5kb3cuX19iaWxnZU1hdGNoRG9tU2tpbGwoY3R4LmludGVudCwgY3R4LnRhcmdldCk7XG4gICAgICAgICAgaWYgKHJlc3VsdD8uZWxlbWVudCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZWxlbWVudDogcmVzdWx0LmVsZW1lbnQsIGluZm86IHsgZW50cnk6IHJlc3VsdC5lbnRyeSB9IH07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlIH07XG4gICAgICB9KTtcblxuICAgICAgLy8gSEVVUklTVElDX01BVENIIC0gbGV2ZXJhZ2VzIGV4aXN0aW5nIHRva2VuLWJhc2VkIHNjb3JpbmdcbiAgICAgIHRoaXMucmVnaXN0ZXJTdHJhdGVneSgnSEVVUklTVElDX01BVENIJywgcHJpb3JpdGllcy5IRVVSSVNUSUNfTUFUQ0gsIGFzeW5jIChjdHgpID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiB3aW5kb3cuX19iaWxnZUZpbmRFbGVtZW50QnlIZXVyaXN0aWMgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSB9O1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgaGludHMgPSBjdHguaGludHMgfHwge307XG4gICAgICAgIGNvbnN0IGVsZW1lbnQgPSB3aW5kb3cuX19iaWxnZUZpbmRFbGVtZW50QnlIZXVyaXN0aWMoe1xuICAgICAgICAgIGxhYmVsOiBoaW50cy5sYWJlbCB8fCBjdHgudGFyZ2V0LFxuICAgICAgICAgIGZpZWxkOiBoaW50cy5maWVsZCB8fCBjdHgudGFyZ2V0LFxuICAgICAgICAgIG5hbWU6IGhpbnRzLm5hbWUsXG4gICAgICAgICAgcGxhY2Vob2xkZXI6IGhpbnRzLnBsYWNlaG9sZGVyXG4gICAgICAgIH0sIGN0eC5mYWlsZWRTZWxlY3RvcnM/LlswXSB8fCBudWxsKTtcblxuICAgICAgICBpZiAoZWxlbWVudCAmJiB0aGlzLl9pc1VzYWJsZShlbGVtZW50KSkge1xuICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGVsZW1lbnQsIGluZm86IHsgbWF0Y2hlZEJ5OiAnaGV1cmlzdGljJyB9IH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UgfTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBTRUxFQ1RPUl9QRVJNVVRBVElPTiAtIGdlbmVyYXRlIGFsdGVybmF0aXZlIHNlbGVjdG9yc1xuICAgICAgdGhpcy5yZWdpc3RlclN0cmF0ZWd5KCdTRUxFQ1RPUl9QRVJNVVRBVElPTicsIHByaW9yaXRpZXMuU0VMRUNUT1JfUEVSTVVUQVRJT04sIGFzeW5jIChjdHgpID0+IHtcbiAgICAgICAgY29uc3QgcGVybXV0YXRpb25zID0gdGhpcy5nZW5lcmF0ZVNlbGVjdG9yUGVybXV0YXRpb25zKGN0eC5oaW50cywgY3R4LmZhaWxlZFNlbGVjdG9ycyk7XG4gICAgICAgIFxuICAgICAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHBlcm11dGF0aW9ucykge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgICAgICAgICBpZiAoZWxlbWVudCAmJiB0aGlzLl9pc1VzYWJsZShlbGVtZW50KSkge1xuICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBlbGVtZW50LCBpbmZvOiB7IG1hdGNoZWRCeTogJ3Blcm11dGF0aW9uJywgc2VsZWN0b3IgfSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgICAgICAgIC8vIEludmFsaWQgc2VsZWN0b3IsIHNraXBcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UgfTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBQUk9CRV9TQ1JPTEwgLSBzY3JvbGwgdG8gZmluZCBvZmYtc2NyZWVuIGVsZW1lbnRzXG4gICAgICB0aGlzLnJlZ2lzdGVyU3RyYXRlZ3koJ1BST0JFX1NDUk9MTCcsIHByaW9yaXRpZXMuUFJPQkVfU0NST0xMLCBhc3luYyAoY3R4KSA9PiB7XG4gICAgICAgIGlmICghY3R4LnRhcmdldCAmJiAhY3R4LmhpbnRzKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSB9O1xuXG4gICAgICAgIGNvbnN0IHByb2JlRGlzdGFuY2UgPSBNYXRoLm1heCgyNDAsIE1hdGgucm91bmQod2luZG93LmlubmVySGVpZ2h0ICogMC44KSk7XG4gICAgICAgIGNvbnN0IG1heFByb2JlcyA9IDQ7XG4gICAgICAgIGNvbnN0IG9yaWdpbmFsU2Nyb2xsID0gd2luZG93LnNjcm9sbFk7XG5cbiAgICAgICAgZm9yIChsZXQgcHJvYmUgPSAxOyBwcm9iZSA8PSBtYXhQcm9iZXM7IHByb2JlKyspIHtcbiAgICAgICAgICB3aW5kb3cuc2Nyb2xsQnkoeyB0b3A6IHByb2JlRGlzdGFuY2UsIGJlaGF2aW9yOiAnYXV0bycgfSk7XG4gICAgICAgICAgYXdhaXQgdGhpcy5fc2xlZXAoMTUwKTtcblxuICAgICAgICAgIC8vIFRyeSB0byBmaW5kIGVsZW1lbnQgYWZ0ZXIgc2Nyb2xsaW5nXG4gICAgICAgICAgY29uc3QgZWxlbWVudCA9IGF3YWl0IHRoaXMuX3RyeUZpbmRFbGVtZW50KGN0eCk7XG4gICAgICAgICAgaWYgKGVsZW1lbnQpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGVsZW1lbnQsIGluZm86IHsgbWF0Y2hlZEJ5OiAncHJvYmVfc2Nyb2xsJywgcHJvYmUgfSB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJlc2V0IHNjcm9sbCBhbmQgdHJ5IGZyb20gdG9wXG4gICAgICAgIHdpbmRvdy5zY3JvbGxUbyh7IHRvcDogMCwgYmVoYXZpb3I6ICdhdXRvJyB9KTtcbiAgICAgICAgYXdhaXQgdGhpcy5fc2xlZXAoMTUwKTtcblxuICAgICAgICBjb25zdCBlbGVtZW50RnJvbVRvcCA9IGF3YWl0IHRoaXMuX3RyeUZpbmRFbGVtZW50KGN0eCk7XG4gICAgICAgIGlmIChlbGVtZW50RnJvbVRvcCkge1xuICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGVsZW1lbnQ6IGVsZW1lbnRGcm9tVG9wLCBpbmZvOiB7IG1hdGNoZWRCeTogJ3Byb2JlX3Njcm9sbF9yZXNldCcgfSB9O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVzdG9yZSBvcmlnaW5hbCBwb3NpdGlvblxuICAgICAgICB3aW5kb3cuc2Nyb2xsVG8oeyB0b3A6IG9yaWdpbmFsU2Nyb2xsLCBiZWhhdmlvcjogJ2F1dG8nIH0pO1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSB9O1xuICAgICAgfSk7XG5cbiAgICAgIC8vIE1VVEFUSU9OX1dBSVQgLSB3YWl0IGZvciBkeW5hbWljIGNvbnRlbnRcbiAgICAgIHRoaXMucmVnaXN0ZXJTdHJhdGVneSgnTVVUQVRJT05fV0FJVCcsIHByaW9yaXRpZXMuTVVUQVRJT05fV0FJVCwgYXN5bmMgKGN0eCkgPT4ge1xuICAgICAgICBjb25zdCB0aW1lb3V0ID0gY3R4LndhaXRUaW1lb3V0IHx8IDMwMDA7XG4gICAgICAgIGNvbnN0IHNlbGVjdG9ycyA9IHRoaXMuX2J1aWxkU2VsZWN0b3JzKGN0eCk7XG5cbiAgICAgICAgaWYgKHNlbGVjdG9ycy5sZW5ndGggPT09IDApIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlIH07XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgbGV0IHJlc29sdmVkID0gZmFsc2U7XG4gICAgICAgICAgXG4gICAgICAgICAgY29uc3QgY2hlY2tGb3JFbGVtZW50ID0gKCkgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcbiAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgICAgICAgICAgICAgaWYgKGVsZW1lbnQgJiYgdGhpcy5faXNVc2FibGUoZWxlbWVudCkpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBlbGVtZW50O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBjYXRjaCAoX2Vycikge31cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgIH07XG5cbiAgICAgICAgICAvLyBDaGVjayBpbW1lZGlhdGVseVxuICAgICAgICAgIGNvbnN0IGltbWVkaWF0ZSA9IGNoZWNrRm9yRWxlbWVudCgpO1xuICAgICAgICAgIGlmIChpbW1lZGlhdGUpIHtcbiAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiB0cnVlLCBlbGVtZW50OiBpbW1lZGlhdGUsIGluZm86IHsgbWF0Y2hlZEJ5OiAnbXV0YXRpb25faW1tZWRpYXRlJyB9IH0pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc29sdmVkKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBmb3VuZCA9IGNoZWNrRm9yRWxlbWVudCgpO1xuICAgICAgICAgICAgaWYgKGZvdW5kKSB7XG4gICAgICAgICAgICAgIHJlc29sdmVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgb2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogdHJ1ZSwgZWxlbWVudDogZm91bmQsIGluZm86IHsgbWF0Y2hlZEJ5OiAnbXV0YXRpb25fb2JzZXJ2ZWQnIH0gfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBvYnNlcnZlci5vYnNlcnZlKGRvY3VtZW50LmJvZHkgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LCB7XG4gICAgICAgICAgICBjaGlsZExpc3Q6IHRydWUsXG4gICAgICAgICAgICBzdWJ0cmVlOiB0cnVlLFxuICAgICAgICAgICAgYXR0cmlidXRlczogdHJ1ZVxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICBpZiAoIXJlc29sdmVkKSB7XG4gICAgICAgICAgICAgIHJlc29sdmVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgb2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSwgdGltZW91dCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIEZSQU1FX1RSQVZFUlNBTCAtIHNlYXJjaCBpbiBpZnJhbWVzIGFuZCBzaGFkb3cgcm9vdHNcbiAgICAgIHRoaXMucmVnaXN0ZXJTdHJhdGVneSgnRlJBTUVfVFJBVkVSU0FMJywgcHJpb3JpdGllcy5GUkFNRV9UUkFWRVJTQUwsIGFzeW5jIChjdHgpID0+IHtcbiAgICAgICAgY29uc3Qgc2VsZWN0b3JzID0gdGhpcy5fYnVpbGRTZWxlY3RvcnMoY3R4KTtcbiAgICAgICAgaWYgKHNlbGVjdG9ycy5sZW5ndGggPT09IDApIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlIH07XG5cbiAgICAgICAgY29uc3QgZWxlbWVudCA9IHRoaXMuX3F1ZXJ5U2VsZWN0b3JEZWVwQWxsKHNlbGVjdG9yc1swXSk7XG4gICAgICAgIGlmIChlbGVtZW50ICYmIHRoaXMuX2lzVXNhYmxlKGVsZW1lbnQpKSB7XG4gICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZWxlbWVudCwgaW5mbzogeyBtYXRjaGVkQnk6ICdmcmFtZV90cmF2ZXJzYWwnIH0gfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSB9O1xuICAgICAgfSk7XG5cbiAgICAgIC8vIExBQkVMX1BST1hJTUlUWSAtIGZpbmQgYnkgYXNzb2NpYXRlZCBsYWJlbCB0ZXh0XG4gICAgICB0aGlzLnJlZ2lzdGVyU3RyYXRlZ3koJ0xBQkVMX1BST1hJTUlUWScsIHByaW9yaXRpZXMuTEFCRUxfUFJPWElNSVRZLCBhc3luYyAoY3R4KSA9PiB7XG4gICAgICAgIGNvbnN0IGxhYmVsVGV4dCA9IGN0eC5oaW50cz8ubGFiZWwgfHwgY3R4LmhpbnRzPy5sYWJlbFRleHQgfHwgY3R4LnRhcmdldDtcbiAgICAgICAgaWYgKCFsYWJlbFRleHQpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlIH07XG5cbiAgICAgICAgY29uc3QgZWxlbWVudCA9IHRoaXMuX2ZpbmRJbnB1dEZyb21MYWJlbFRleHQobGFiZWxUZXh0KTtcbiAgICAgICAgaWYgKGVsZW1lbnQgJiYgdGhpcy5faXNVc2FibGUoZWxlbWVudCkpIHtcbiAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBlbGVtZW50LCBpbmZvOiB7IG1hdGNoZWRCeTogJ2xhYmVsX3Byb3hpbWl0eScsIGxhYmVsVGV4dCB9IH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UgfTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBWQUxJREFUSU9OX1JFVFJZIC0gcmV0cnkgd2l0aCBhZGp1c3RlZCBhcHByb2FjaFxuICAgICAgdGhpcy5yZWdpc3RlclN0cmF0ZWd5KCdWQUxJREFUSU9OX1JFVFJZJywgcHJpb3JpdGllcy5WQUxJREFUSU9OX1JFVFJZLCBhc3luYyAoY3R4KSA9PiB7XG4gICAgICAgIGlmICghY3R4LnZhbGlkYXRpb25FcnJvcikgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UgfTtcblxuICAgICAgICAvLyBUcnkgcmVsYXhlZCBtYXRjaGluZyBpZiB2YWxpZGF0aW9uIGZhaWxlZFxuICAgICAgICBjb25zdCBoaW50cyA9IGN0eC5oaW50cyB8fCB7fTtcbiAgICAgICAgY29uc3QgcmVsYXhlZEhpbnRzID0ge1xuICAgICAgICAgIC4uLmhpbnRzLFxuICAgICAgICAgIGxhYmVsOiBoaW50cy5sYWJlbD8uc3BsaXQoJyAnKS5zbGljZSgwLCAyKS5qb2luKCcgJyksIC8vIFNob3J0ZW4gbGFiZWxcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAodHlwZW9mIHdpbmRvdy5fX2JpbGdlRmluZEVsZW1lbnRCeUhldXJpc3RpYyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIGNvbnN0IGVsZW1lbnQgPSB3aW5kb3cuX19iaWxnZUZpbmRFbGVtZW50QnlIZXVyaXN0aWMoe1xuICAgICAgICAgICAgbGFiZWw6IHJlbGF4ZWRIaW50cy5sYWJlbCxcbiAgICAgICAgICAgIGZpZWxkOiByZWxheGVkSGludHMuZmllbGQsXG4gICAgICAgICAgICBuYW1lOiByZWxheGVkSGludHMubmFtZSxcbiAgICAgICAgICAgIHBsYWNlaG9sZGVyOiByZWxheGVkSGludHMucGxhY2Vob2xkZXJcbiAgICAgICAgICB9LCBudWxsKTtcblxuICAgICAgICAgIGlmIChlbGVtZW50ICYmIHRoaXMuX2lzVXNhYmxlKGVsZW1lbnQpKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBlbGVtZW50LCBpbmZvOiB7IG1hdGNoZWRCeTogJ3ZhbGlkYXRpb25fcmV0cnknLCByZWxheGVkOiB0cnVlIH0gfTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UgfTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1haW4gcmVjb3ZlcnkgcGlwZWxpbmUgLSBhdHRlbXB0IGFsbCBzdHJhdGVnaWVzIGluIHByaW9yaXR5IG9yZGVyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGludGVudCAtICd0eXBlJywgJ2NsaWNrJywgJ2ZpbGwnLCBldGMuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHRhcmdldCAtIFRhcmdldCBpZGVudGlmaWVyIChmaWVsZCBuYW1lLCBsYWJlbCwgZXRjLilcbiAgICAgKiBAcGFyYW0ge3N0cmluZ1tdfSBmYWlsZWRTZWxlY3RvcnMgLSBTZWxlY3RvcnMgdGhhdCBhbHJlYWR5IGZhaWxlZFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBjb250ZXh0IC0gQWRkaXRpb25hbCBjb250ZXh0IChoaW50cywgcGFnZUNvbnRleHQsIGV0Yy4pXG4gICAgICogQHJldHVybnMge1Byb21pc2U8e3N1Y2Nlc3M6IGJvb2xlYW4sIGVsZW1lbnQ/OiBFbGVtZW50LCBzdHJhdGVneT86IHN0cmluZywgaW5mbz86IE9iamVjdH0+fVxuICAgICAqL1xuICAgIGFzeW5jIGF0dGVtcHRSZWNvdmVyeShpbnRlbnQsIHRhcmdldCwgZmFpbGVkU2VsZWN0b3JzID0gW10sIGNvbnRleHQgPSB7fSkge1xuICAgICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICAgIGNvbnN0IHJlY292ZXJ5Q29udGV4dCA9IHtcbiAgICAgICAgaW50ZW50LFxuICAgICAgICB0YXJnZXQsXG4gICAgICAgIGZhaWxlZFNlbGVjdG9ycyxcbiAgICAgICAgaGludHM6IGNvbnRleHQuaGludHMgfHwge30sXG4gICAgICAgIHBhZ2VDb250ZXh0OiBjb250ZXh0LnBhZ2VDb250ZXh0IHx8IHt9LFxuICAgICAgICB3YWl0VGltZW91dDogY29udGV4dC53YWl0VGltZW91dCB8fCAzMDAwLFxuICAgICAgICB2YWxpZGF0aW9uRXJyb3I6IGNvbnRleHQudmFsaWRhdGlvbkVycm9yIHx8IG51bGwsXG4gICAgICB9O1xuXG4gICAgICBmb3IgKGNvbnN0IHN0cmF0ZWd5IG9mIHRoaXMuZ2V0U29ydGVkU3RyYXRlZ2llcygpKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgc3RyYXRlZ3kuaGFuZGxlcihyZWNvdmVyeUNvbnRleHQpO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChyZXN1bHQuc3VjY2VzcyAmJiByZXN1bHQuZWxlbWVudCkge1xuICAgICAgICAgICAgY29uc3QgZHVyYXRpb24gPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xuICAgICAgICAgICAgdGhpcy5fcmVjb3JkU3VjY2VzcyhzdHJhdGVneS5uYW1lLCB0YXJnZXQsIGR1cmF0aW9uLCByZXN1bHQuaW5mbyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgIGVsZW1lbnQ6IHJlc3VsdC5lbGVtZW50LFxuICAgICAgICAgICAgICBzdHJhdGVneTogc3RyYXRlZ3kubmFtZSxcbiAgICAgICAgICAgICAgaW5mbzogcmVzdWx0LmluZm8gfHwge30sXG4gICAgICAgICAgICAgIGR1cmF0aW9uLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIGNvbnNvbGUud2FybihgW1NlbGZIZWFsaW5nRW5naW5lXSBTdHJhdGVneSAke3N0cmF0ZWd5Lm5hbWV9IGVycm9yOmAsIGVyci5tZXNzYWdlKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBkdXJhdGlvbiA9IERhdGUubm93KCkgLSBzdGFydFRpbWU7XG4gICAgICB0aGlzLl9yZWNvcmRGYWlsdXJlKGludGVudCwgdGFyZ2V0LCBmYWlsZWRTZWxlY3RvcnMsIGR1cmF0aW9uKTtcbiAgICAgIFxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgIGVycm9yOiAnQWxsIHJlY292ZXJ5IHN0cmF0ZWdpZXMgZXhoYXVzdGVkJyxcbiAgICAgICAgc3RyYXRlZ2llc0F0dGVtcHRlZDogdGhpcy5zdHJhdGVnaWVzLnNpemUsXG4gICAgICAgIGR1cmF0aW9uLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZW5lcmF0ZSBhbHRlcm5hdGl2ZSBzZWxlY3RvcnMgZnJvbSBoaW50c1xuICAgICAqL1xuICAgIGdlbmVyYXRlU2VsZWN0b3JQZXJtdXRhdGlvbnMoaGludHMgPSB7fSwgZmFpbGVkU2VsZWN0b3JzID0gW10pIHtcbiAgICAgIGNvbnN0IGFsdGVybmF0aXZlcyA9IFtdO1xuICAgICAgY29uc3QgZmFpbGVkID0gbmV3IFNldChmYWlsZWRTZWxlY3RvcnMgfHwgW10pO1xuXG4gICAgICBjb25zdCBhZGRJZlZhbGlkID0gKHNlbGVjdG9yKSA9PiB7XG4gICAgICAgIGlmIChzZWxlY3RvciAmJiAhZmFpbGVkLmhhcyhzZWxlY3RvcikpIHtcbiAgICAgICAgICBhbHRlcm5hdGl2ZXMucHVzaChzZWxlY3Rvcik7XG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIC8vIElELWJhc2VkXG4gICAgICBpZiAoaGludHMuaWQpIHtcbiAgICAgICAgYWRkSWZWYWxpZChgIyR7Q1NTLmVzY2FwZShoaW50cy5pZCl9YCk7XG4gICAgICAgIGFkZElmVmFsaWQoYFtpZD1cIiR7Q1NTLmVzY2FwZShoaW50cy5pZCl9XCJdYCk7XG4gICAgICAgIGFkZElmVmFsaWQoYFtpZCo9XCIke0NTUy5lc2NhcGUoaGludHMuaWQpfVwiXWApO1xuICAgICAgfVxuXG4gICAgICAvLyBOYW1lLWJhc2VkXG4gICAgICBpZiAoaGludHMubmFtZSkge1xuICAgICAgICBhZGRJZlZhbGlkKGBbbmFtZT1cIiR7Q1NTLmVzY2FwZShoaW50cy5uYW1lKX1cIl1gKTtcbiAgICAgICAgYWRkSWZWYWxpZChgW25hbWUqPVwiJHtDU1MuZXNjYXBlKGhpbnRzLm5hbWUpfVwiXWApO1xuICAgICAgICBhZGRJZlZhbGlkKGBpbnB1dFtuYW1lPVwiJHtDU1MuZXNjYXBlKGhpbnRzLm5hbWUpfVwiXWApO1xuICAgICAgICBhZGRJZlZhbGlkKGB0ZXh0YXJlYVtuYW1lPVwiJHtDU1MuZXNjYXBlKGhpbnRzLm5hbWUpfVwiXWApO1xuICAgICAgICBhZGRJZlZhbGlkKGBzZWxlY3RbbmFtZT1cIiR7Q1NTLmVzY2FwZShoaW50cy5uYW1lKX1cIl1gKTtcbiAgICAgIH1cblxuICAgICAgLy8gQXJpYS1sYWJlbFxuICAgICAgaWYgKGhpbnRzLmFyaWFMYWJlbCkge1xuICAgICAgICBhZGRJZlZhbGlkKGBbYXJpYS1sYWJlbD1cIiR7Q1NTLmVzY2FwZShoaW50cy5hcmlhTGFiZWwpfVwiXWApO1xuICAgICAgICBhZGRJZlZhbGlkKGBbYXJpYS1sYWJlbCo9XCIke0NTUy5lc2NhcGUoaGludHMuYXJpYUxhYmVsKX1cIl1gKTtcbiAgICAgIH1cblxuICAgICAgLy8gUGxhY2Vob2xkZXJcbiAgICAgIGlmIChoaW50cy5wbGFjZWhvbGRlcikge1xuICAgICAgICBhZGRJZlZhbGlkKGBbcGxhY2Vob2xkZXI9XCIke0NTUy5lc2NhcGUoaGludHMucGxhY2Vob2xkZXIpfVwiXWApO1xuICAgICAgICBhZGRJZlZhbGlkKGBbcGxhY2Vob2xkZXIqPVwiJHtDU1MuZXNjYXBlKGhpbnRzLnBsYWNlaG9sZGVyKX1cIl1gKTtcbiAgICAgIH1cblxuICAgICAgLy8gRGF0YSB0ZXN0IElEXG4gICAgICBpZiAoaGludHMuZGF0YVRlc3RJZCkge1xuICAgICAgICBhZGRJZlZhbGlkKGBbZGF0YS10ZXN0aWQ9XCIke0NTUy5lc2NhcGUoaGludHMuZGF0YVRlc3RJZCl9XCJdYCk7XG4gICAgICAgIGFkZElmVmFsaWQoYFtkYXRhLXRlc3QtaWQ9XCIke0NTUy5lc2NhcGUoaGludHMuZGF0YVRlc3RJZCl9XCJdYCk7XG4gICAgICAgIGFkZElmVmFsaWQoYFtkYXRhLXFhPVwiJHtDU1MuZXNjYXBlKGhpbnRzLmRhdGFUZXN0SWQpfVwiXWApO1xuICAgICAgfVxuXG4gICAgICAvLyBBdXRvY29tcGxldGUgYXR0cmlidXRlXG4gICAgICBpZiAoaGludHMuYXV0b2NvbXBsZXRlKSB7XG4gICAgICAgIGFkZElmVmFsaWQoYFthdXRvY29tcGxldGU9XCIke0NTUy5lc2NhcGUoaGludHMuYXV0b2NvbXBsZXRlKX1cIl1gKTtcbiAgICAgIH1cblxuICAgICAgLy8gVHlwZSArIG5hbWUgY29tYmluYXRpb25zXG4gICAgICBpZiAoaGludHMudHlwZSAmJiBoaW50cy5uYW1lKSB7XG4gICAgICAgIGFkZElmVmFsaWQoYGlucHV0W3R5cGU9XCIke0NTUy5lc2NhcGUoaGludHMudHlwZSl9XCJdW25hbWUqPVwiJHtDU1MuZXNjYXBlKGhpbnRzLm5hbWUpfVwiXWApO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gYWx0ZXJuYXRpdmVzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlY29yZCBzdWNjZXNzZnVsIHJlY292ZXJ5IGZvciB0ZWxlbWV0cnlcbiAgICAgKi9cbiAgICBfcmVjb3JkU3VjY2VzcyhzdHJhdGVneU5hbWUsIHRhcmdldCwgZHVyYXRpb24sIGluZm8gPSB7fSkge1xuICAgICAgdGhpcy5yZWNvdmVyeVRlbGVtZXRyeS5wdXNoKHtcbiAgICAgICAgdHlwZTogJ3N1Y2Nlc3MnLFxuICAgICAgICBzdHJhdGVneTogc3RyYXRlZ3lOYW1lLFxuICAgICAgICB0YXJnZXQ6IFN0cmluZyh0YXJnZXQgfHwgJycpLnNsaWNlKDAsIDEwMCksXG4gICAgICAgIGR1cmF0aW9uLFxuICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICAgIGluZm86IGluZm8gfHwge30sXG4gICAgICB9KTtcblxuICAgICAgdGhpcy5fcHJ1bmVBbmRTYXZlVGVsZW1ldHJ5KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVjb3JkIGZhaWxlZCByZWNvdmVyeSBhdHRlbXB0XG4gICAgICovXG4gICAgX3JlY29yZEZhaWx1cmUoaW50ZW50LCB0YXJnZXQsIGZhaWxlZFNlbGVjdG9ycywgZHVyYXRpb24pIHtcbiAgICAgIGNvbnN0IGtleSA9IGAke2ludGVudH06JHt0YXJnZXR9YDtcbiAgICAgIGNvbnN0IGhpc3RvcnkgPSB0aGlzLmZhaWx1cmVIaXN0b3J5LmdldChrZXkpIHx8IHsgYXR0ZW1wdHM6IDAsIGxhc3RBdHRlbXB0OiAwIH07XG4gICAgICBoaXN0b3J5LmF0dGVtcHRzICs9IDE7XG4gICAgICBoaXN0b3J5Lmxhc3RBdHRlbXB0ID0gRGF0ZS5ub3coKTtcbiAgICAgIHRoaXMuZmFpbHVyZUhpc3Rvcnkuc2V0KGtleSwgaGlzdG9yeSk7XG5cbiAgICAgIHRoaXMucmVjb3ZlcnlUZWxlbWV0cnkucHVzaCh7XG4gICAgICAgIHR5cGU6ICdmYWlsdXJlJyxcbiAgICAgICAgaW50ZW50LFxuICAgICAgICB0YXJnZXQ6IFN0cmluZyh0YXJnZXQgfHwgJycpLnNsaWNlKDAsIDEwMCksXG4gICAgICAgIGZhaWxlZFNlbGVjdG9yczogKGZhaWxlZFNlbGVjdG9ycyB8fCBbXSkuc2xpY2UoMCwgNSksXG4gICAgICAgIGR1cmF0aW9uLFxuICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICB9KTtcblxuICAgICAgdGhpcy5fcHJ1bmVBbmRTYXZlVGVsZW1ldHJ5KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUHJ1bmUgYW5kIHNhdmUgdGVsZW1ldHJ5IHRvIHN0b3JhZ2VcbiAgICAgKi9cbiAgICBhc3luYyBfcHJ1bmVBbmRTYXZlVGVsZW1ldHJ5KCkge1xuICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICAgIHRoaXMucmVjb3ZlcnlUZWxlbWV0cnkgPSB0aGlzLnJlY292ZXJ5VGVsZW1ldHJ5XG4gICAgICAgIC5maWx0ZXIoZW50cnkgPT4gbm93IC0gZW50cnkudGltZXN0YW1wIDwgVEVMRU1FVFJZX1RUTF9NUylcbiAgICAgICAgLnNsaWNlKC1NQVhfVEVMRU1FVFJZX0VOVFJJRVMpO1xuXG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoe1xuICAgICAgICAgIFtTVE9SQUdFX0tFWV9URUxFTUVUUlldOiB0aGlzLnJlY292ZXJ5VGVsZW1ldHJ5XG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoX2Vycikge1xuICAgICAgICAvLyBOb24tZmF0YWxcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBMb2FkIHRlbGVtZXRyeSBmcm9tIHN0b3JhZ2VcbiAgICAgKi9cbiAgICBhc3luYyBsb2FkVGVsZW1ldHJ5KCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFtTVE9SQUdFX0tFWV9URUxFTUVUUlldKTtcbiAgICAgICAgdGhpcy5yZWNvdmVyeVRlbGVtZXRyeSA9IEFycmF5LmlzQXJyYXkocmVzdWx0W1NUT1JBR0VfS0VZX1RFTEVNRVRSWV0pXG4gICAgICAgICAgPyByZXN1bHRbU1RPUkFHRV9LRVlfVEVMRU1FVFJZXVxuICAgICAgICAgIDogW107XG4gICAgICB9IGNhdGNoIChfZXJyKSB7XG4gICAgICAgIHRoaXMucmVjb3ZlcnlUZWxlbWV0cnkgPSBbXTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgcmVjb3Zlcnkgc3RhdGlzdGljc1xuICAgICAqL1xuICAgIGdldFN0YXRzKCkge1xuICAgICAgY29uc3Qgc3RhdHMgPSB7XG4gICAgICAgIHRvdGFsUmVjb3ZlcmllczogdGhpcy5yZWNvdmVyeVRlbGVtZXRyeS5sZW5ndGgsXG4gICAgICAgIHN1Y2Nlc3NDb3VudDogMCxcbiAgICAgICAgZmFpbHVyZUNvdW50OiAwLFxuICAgICAgICBieVN0cmF0ZWd5OiB7fSxcbiAgICAgICAgYXZnRHVyYXRpb246IDAsXG4gICAgICB9O1xuXG4gICAgICBsZXQgdG90YWxEdXJhdGlvbiA9IDA7XG4gICAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMucmVjb3ZlcnlUZWxlbWV0cnkpIHtcbiAgICAgICAgaWYgKGVudHJ5LnR5cGUgPT09ICdzdWNjZXNzJykge1xuICAgICAgICAgIHN0YXRzLnN1Y2Nlc3NDb3VudCArPSAxO1xuICAgICAgICAgIHN0YXRzLmJ5U3RyYXRlZ3lbZW50cnkuc3RyYXRlZ3ldID0gKHN0YXRzLmJ5U3RyYXRlZ3lbZW50cnkuc3RyYXRlZ3ldIHx8IDApICsgMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdGF0cy5mYWlsdXJlQ291bnQgKz0gMTtcbiAgICAgICAgfVxuICAgICAgICB0b3RhbER1cmF0aW9uICs9IGVudHJ5LmR1cmF0aW9uIHx8IDA7XG4gICAgICB9XG5cbiAgICAgIGlmIChzdGF0cy50b3RhbFJlY292ZXJpZXMgPiAwKSB7XG4gICAgICAgIHN0YXRzLmF2Z0R1cmF0aW9uID0gTWF0aC5yb3VuZCh0b3RhbER1cmF0aW9uIC8gc3RhdHMudG90YWxSZWNvdmVyaWVzKTtcbiAgICAgICAgc3RhdHMuc3VjY2Vzc1JhdGUgPSBNYXRoLnJvdW5kKChzdGF0cy5zdWNjZXNzQ291bnQgLyBzdGF0cy50b3RhbFJlY292ZXJpZXMpICogMTAwKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHN0YXRzO1xuICAgIH1cblxuICAgIC8vID09PSBIZWxwZXIgbWV0aG9kcyA9PT1cblxuICAgIF9zbGVlcChtcykge1xuICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBtcykpO1xuICAgIH1cblxuICAgIF9pc1VzYWJsZShlbGVtZW50KSB7XG4gICAgICBpZiAoIShlbGVtZW50IGluc3RhbmNlb2YgRWxlbWVudCkpIHJldHVybiBmYWxzZTtcbiAgICAgIGNvbnN0IGRpc2FibGVkID0gZWxlbWVudC5oYXNBdHRyaWJ1dGUoJ2Rpc2FibGVkJykgfHwgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnKSA9PT0gJ3RydWUnO1xuICAgICAgaWYgKGRpc2FibGVkKSByZXR1cm4gZmFsc2U7XG4gICAgICBcbiAgICAgIGNvbnN0IHJlY3QgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgY29uc3Qgc3R5bGUgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KTtcbiAgICAgIGlmIChzdHlsZS5kaXNwbGF5ID09PSAnbm9uZScgfHwgc3R5bGUudmlzaWJpbGl0eSA9PT0gJ2hpZGRlbicpIHJldHVybiBmYWxzZTtcbiAgICAgIGlmIChyZWN0LndpZHRoIDwgMiB8fCByZWN0LmhlaWdodCA8IDIpIHJldHVybiBmYWxzZTtcbiAgICAgIFxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgX2J1aWxkU2VsZWN0b3JzKGN0eCkge1xuICAgICAgY29uc3Qgc2VsZWN0b3JzID0gW107XG4gICAgICBjb25zdCBoaW50cyA9IGN0eC5oaW50cyB8fCB7fTtcblxuICAgICAgaWYgKGhpbnRzLmlkKSBzZWxlY3RvcnMucHVzaChgIyR7Q1NTLmVzY2FwZShoaW50cy5pZCl9YCk7XG4gICAgICBpZiAoaGludHMubmFtZSkgc2VsZWN0b3JzLnB1c2goYFtuYW1lPVwiJHtDU1MuZXNjYXBlKGhpbnRzLm5hbWUpfVwiXWApO1xuICAgICAgaWYgKGhpbnRzLmFyaWFMYWJlbCkgc2VsZWN0b3JzLnB1c2goYFthcmlhLWxhYmVsPVwiJHtDU1MuZXNjYXBlKGhpbnRzLmFyaWFMYWJlbCl9XCJdYCk7XG4gICAgICBpZiAoaGludHMuZGF0YVRlc3RJZCkgc2VsZWN0b3JzLnB1c2goYFtkYXRhLXRlc3RpZD1cIiR7Q1NTLmVzY2FwZShoaW50cy5kYXRhVGVzdElkKX1cIl1gKTtcblxuICAgICAgcmV0dXJuIHNlbGVjdG9ycztcbiAgICB9XG5cbiAgICBhc3luYyBfdHJ5RmluZEVsZW1lbnQoY3R4KSB7XG4gICAgICAvLyBUcnkgaGV1cmlzdGljIG1hdGNoaW5nXG4gICAgICBpZiAodHlwZW9mIHdpbmRvdy5fX2JpbGdlRmluZEVsZW1lbnRCeUhldXJpc3RpYyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBjb25zdCBoaW50cyA9IGN0eC5oaW50cyB8fCB7fTtcbiAgICAgICAgcmV0dXJuIHdpbmRvdy5fX2JpbGdlRmluZEVsZW1lbnRCeUhldXJpc3RpYyh7XG4gICAgICAgICAgbGFiZWw6IGhpbnRzLmxhYmVsIHx8IGN0eC50YXJnZXQsXG4gICAgICAgICAgZmllbGQ6IGhpbnRzLmZpZWxkIHx8IGN0eC50YXJnZXQsXG4gICAgICAgICAgbmFtZTogaGludHMubmFtZSxcbiAgICAgICAgICBwbGFjZWhvbGRlcjogaGludHMucGxhY2Vob2xkZXJcbiAgICAgICAgfSwgbnVsbCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZWVwIHF1ZXJ5IHNlbGVjdG9yIHRoYXQgdHJhdmVyc2VzIHNoYWRvdyByb290cyBhbmQgaWZyYW1lc1xuICAgICAqL1xuICAgIF9xdWVyeVNlbGVjdG9yRGVlcEFsbChzZWxlY3Rvciwgcm9vdCA9IGRvY3VtZW50KSB7XG4gICAgICBjb25zdCBNQVhfREVQVEggPSAxMDA7XG4gICAgICBjb25zdCBwZW5kaW5nUm9vdHMgPSBbeyByb290LCBkZXB0aDogMCB9XTtcbiAgICAgIGNvbnN0IHNlZW5Sb290cyA9IG5ldyBXZWFrU2V0KCk7XG5cbiAgICAgIHdoaWxlIChwZW5kaW5nUm9vdHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCB7IHJvb3Q6IGN1cnJlbnRSb290LCBkZXB0aCB9ID0gcGVuZGluZ1Jvb3RzLnNoaWZ0KCk7XG4gICAgICAgIGlmICghY3VycmVudFJvb3QgfHwgc2VlblJvb3RzLmhhcyhjdXJyZW50Um9vdCkgfHwgZGVwdGggPiBNQVhfREVQVEgpIGNvbnRpbnVlO1xuICAgICAgICBzZWVuUm9vdHMuYWRkKGN1cnJlbnRSb290KTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGZvdW5kID0gY3VycmVudFJvb3QucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgICAgICAgaWYgKGZvdW5kKSByZXR1cm4gZm91bmQ7XG4gICAgICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgICAgICAvLyBJbnZhbGlkIHNlbGVjdG9yXG4gICAgICAgIH1cblxuICAgICAgICAvLyBDaGVjayBzaGFkb3cgcm9vdHMgYW5kIGlmcmFtZXNcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB3YWxrZXIgPSBkb2N1bWVudC5jcmVhdGVUcmVlV2Fsa2VyKGN1cnJlbnRSb290LCBOb2RlRmlsdGVyLlNIT1dfRUxFTUVOVCk7XG4gICAgICAgICAgZm9yIChsZXQgbm9kZSA9IHdhbGtlci5jdXJyZW50Tm9kZTsgbm9kZTsgbm9kZSA9IHdhbGtlci5uZXh0Tm9kZSgpKSB7XG4gICAgICAgICAgICBpZiAobm9kZS5zaGFkb3dSb290KSB7XG4gICAgICAgICAgICAgIHBlbmRpbmdSb290cy5wdXNoKHsgcm9vdDogbm9kZS5zaGFkb3dSb290LCBkZXB0aDogZGVwdGggKyAxIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgdGFnID0gU3RyaW5nKG5vZGU/LnRhZ05hbWUgfHwgJycpLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICBpZiAodGFnID09PSAnSUZSQU1FJyB8fCB0YWcgPT09ICdGUkFNRScpIHtcbiAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBpZiAobm9kZS5jb250ZW50RG9jdW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgIHBlbmRpbmdSb290cy5wdXNoKHsgcm9vdDogbm9kZS5jb250ZW50RG9jdW1lbnQsIGRlcHRoOiBkZXB0aCArIDEgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGNhdGNoIChfZXJyKSB7XG4gICAgICAgICAgICAgICAgLy8gQ3Jvc3Mtb3JpZ2luIGZyYW1lXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKF9lcnIpIHt9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZpbmQgaW5wdXQgZnJvbSBhc3NvY2lhdGVkIGxhYmVsIHRleHRcbiAgICAgKi9cbiAgICBfZmluZElucHV0RnJvbUxhYmVsVGV4dChsYWJlbFRleHQpIHtcbiAgICAgIGNvbnN0IG5vcm0gPSBTdHJpbmcobGFiZWxUZXh0IHx8ICcnKS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1teYS16MC05XSsvZywgJycpO1xuICAgICAgaWYgKCFub3JtKSByZXR1cm4gbnVsbDtcblxuICAgICAgY29uc3QgbGFiZWxzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdsYWJlbCcpKTtcbiAgICAgIGZvciAoY29uc3QgbGFiZWwgb2YgbGFiZWxzKSB7XG4gICAgICAgIGNvbnN0IHRleHQgPSBTdHJpbmcobGFiZWwudGV4dENvbnRlbnQgfHwgJycpLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW15hLXowLTldKy9nLCAnJyk7XG4gICAgICAgIGlmICghdGV4dCB8fCAhdGV4dC5pbmNsdWRlcyhub3JtKSkgY29udGludWU7XG5cbiAgICAgICAgY29uc3QgaHRtbEZvciA9IFN0cmluZyhsYWJlbC5nZXRBdHRyaWJ1dGUoJ2ZvcicpIHx8ICcnKTtcbiAgICAgICAgaWYgKGh0bWxGb3IpIHtcbiAgICAgICAgICBjb25zdCBieUZvciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGh0bWxGb3IpO1xuICAgICAgICAgIGlmIChieUZvciAmJiB0aGlzLl9pc1VzYWJsZShieUZvcikpIHJldHVybiBieUZvcjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IG5lc3RlZCA9IGxhYmVsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCB0ZXh0YXJlYSwgc2VsZWN0LCBbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXScpO1xuICAgICAgICBpZiAobmVzdGVkICYmIHRoaXMuX2lzVXNhYmxlKG5lc3RlZCkpIHJldHVybiBuZXN0ZWQ7XG5cbiAgICAgICAgY29uc3QgcGFyZW50SW5wdXQgPSBsYWJlbC5wYXJlbnRFbGVtZW50Py5xdWVyeVNlbGVjdG9yPy4oJ2lucHV0LCB0ZXh0YXJlYSwgc2VsZWN0LCBbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXScpO1xuICAgICAgICBpZiAocGFyZW50SW5wdXQgJiYgdGhpcy5faXNVc2FibGUocGFyZW50SW5wdXQpKSByZXR1cm4gcGFyZW50SW5wdXQ7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8vIENyZWF0ZSBnbG9iYWwgaW5zdGFuY2VcbiAgd2luZG93Ll9fYmlsZ2Vfc2VsZkhlYWxpbmdFbmdpbmUgPSBuZXcgU2VsZkhlYWxpbmdFbmdpbmUoKTtcblxuICAvLyBMb2FkIHRlbGVtZXRyeSBvbiBpbml0XG4gIHdpbmRvdy5fX2JpbGdlX3NlbGZIZWFsaW5nRW5naW5lLmxvYWRUZWxlbWV0cnkoKS5jYXRjaCgoKSA9PiB7fSk7XG5cbiAgY29uc29sZS5sb2coJ1tCaWxnZV0gU2VsZkhlYWxpbmdFbmdpbmUgaW5pdGlhbGl6ZWQnKTtcbn0pKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7O0NBR0MsV0FBVztBQUNWO0FBRUEsTUFBSSxPQUFPLDBCQUEyQjtBQUV0QyxRQUFNLHdCQUF3QjtBQUM5QixRQUFNLHdCQUF3QjtBQUM5QixRQUFNLG1CQUFtQixJQUFJLEtBQUssS0FBSyxLQUFLO0FBQUEsRUFLNUMsTUFBTSxrQkFBa0I7QUFBQSxJQWYxQixPQWUwQjtBQUFBO0FBQUE7QUFBQSxJQUN0QixjQUFjO0FBQ1osV0FBSyxhQUFhLG9CQUFJLElBQUk7QUFDMUIsV0FBSyxpQkFBaUIsb0JBQUksSUFBSTtBQUM5QixXQUFLLG9CQUFvQixDQUFDO0FBQzFCLFdBQUssY0FBYztBQUVuQixXQUFLLDJCQUEyQjtBQUFBLElBQ2xDO0FBQUE7QUFBQSxJQUdBLE9BQU8sc0JBQXNCO0FBQUEsTUFDM0Isa0JBQWtCO0FBQUE7QUFBQSxNQUNsQixpQkFBaUI7QUFBQTtBQUFBLE1BQ2pCLHNCQUFzQjtBQUFBO0FBQUEsTUFDdEIsY0FBYztBQUFBO0FBQUEsTUFDZCxlQUFlO0FBQUE7QUFBQSxNQUNmLGlCQUFpQjtBQUFBO0FBQUEsTUFDakIsaUJBQWlCO0FBQUE7QUFBQSxNQUNqQixrQkFBa0I7QUFBQTtBQUFBLElBQ3BCO0FBQUE7QUFB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QUFDN0UsbUJBQVMsT0FBTyxPQUFPLGFBQWEsTUFBTSxPQUFPLE9BQU8sU0FBUyxHQUFHO0FBQ2xFLGdCQUFJLEtBQUssWUFBWTtBQUNuQiwyQkFBYSxLQUFLLEVBQUUsTUFBTSxLQUFLLFlBQVksT0FBTyxRQUFRLEVBQUUsQ0FBQztBQUFBLFlBQy9EO0FBQ0Esa0JBQU0sTUFBTSxPQUFPLE1BQU0sV0FBVyxFQUFFLEVBQUUsWUFBWTtBQUNwRCxnQkFBSSxRQUFRLFlBQVksUUFBUSxTQUFTO0FBQ3ZDLGtCQUFJO0FBQ0Ysb0JBQUksS0FBSyxpQkFBaUI7QUFDeEIsK0JBQWEsS0FBSyxFQUFFLE1BQU0sS0FBSyxpQkFBaUIsT0FBTyxRQUFRLEVBQUUsQ0FBQztBQUFBLGdCQUNwRTtBQUFBLGNBQ0YsU0FBUyxNQUFNO0FBQUEsY0FFZjtBQUFBLFlBQ0Y7QUFBQSxVQUNGO0FBQUEsUUFDRixTQUFTLE1BQU07QUFBQSxRQUFDO0FBQUEsTUFDbEI7QUFFQSxhQUFPO0FBQUEsSUFDVDtBQUFBO0FBQUE7QUFBQTtBQUFBLElBS0Esd0JBQXdCLFdBQVc7QUFDakMsWUFBTSxPQUFPLE9BQU8sYUFBYSxFQUFFLEVBQUUsWUFBWSxFQUFFLFFBQVEsZUFBZSxFQUFFO0FBQzVFLFVBQUksQ0FBQyxLQUFNLFFBQU87QUFFbEIsWUFBTSxTQUFTLE1BQU0sS0FBSyxTQUFTLGlCQUFpQixPQUFPLENBQUM7QUFDNUQsaUJBQVcsU0FBUyxRQUFRO0FBQzFCLGNBQU0sT0FBTyxPQUFPLE1BQU0sZUFBZSxFQUFFLEVBQUUsWUFBWSxFQUFFLFFBQVEsZUFBZSxFQUFFO0FBQ3BGLFlBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxTQUFTLElBQUksRUFBRztBQUVuQyxjQUFNLFVBQVUsT0FBTyxNQUFNLGFBQWEsS0FBSyxLQUFLLEVBQUU7QUFDdEQsWUFBSSxTQUFTO0FBQ1gsZ0JBQU0sUUFBUSxTQUFTLGVBQWUsT0FBTztBQUM3QyxjQUFJLFNBQVMsS0FBSyxVQUFVLEtBQUssRUFBRyxRQUFPO0FBQUEsUUFDN0M7QUFFQSxjQUFNLFNBQVMsTUFBTSxjQUFjLG1EQUFtRDtBQUN0RixZQUFJLFVBQVUsS0FBSyxVQUFVLE1BQU0sRUFBRyxRQUFPO0FBRTdDLGNBQU0sY0FBYyxNQUFNLGVBQWUsZ0JBQWdCLG1EQUFtRDtBQUM1RyxZQUFJLGVBQWUsS0FBSyxVQUFVLFdBQVcsRUFBRyxRQUFPO0FBQUEsTUFDekQ7QUFFQSxhQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0Y7QUFHQSxTQUFPLDRCQUE0QixJQUFJLGtCQUFrQjtBQUd6RCxTQUFPLDBCQUEwQixjQUFjLEVBQUUsTUFBTSxNQUFNO0FBQUEsRUFBQyxDQUFDO0FBRS9ELFVBQVEsSUFBSSx1Q0FBdUM7QUFDckQsR0FBRzsiLAogICJuYW1lcyI6IFsiZHVyYXRpb24iXQp9Cg==
