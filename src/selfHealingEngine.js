// selfHealingEngine.js - Centralized recovery coordinator for resilient form automation
// Orchestrates existing + new recovery strategies with priority-based execution

(function() {
  'use strict';

  if (window.__bilge_selfHealingEngine) return;

  const STORAGE_KEY_TELEMETRY = '__bilge_recovery_telemetry_v1';
  const MAX_TELEMETRY_ENTRIES = 200;
  const TELEMETRY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  /**
   * Self-Healing Engine - coordinates multiple recovery strategies
   */
  class SelfHealingEngine {
    constructor() {
      this.strategies = new Map();
      this.failureHistory = new Map(); // selector -> { attempts, lastAttempt }
      this.recoveryTelemetry = [];
      this.initialized = false;

      this._registerBuiltinStrategies();
    }

    // Strategy priority constants (higher = tried first)
    static STRATEGY_PRIORITIES = {
      DOM_SKILL_MEMORY: 100,      // Existing: learned hints from content.js
      HEURISTIC_MATCH: 90,         // Existing: token scoring from content.js
      SELECTOR_PERMUTATION: 80,    // NEW: auto-generate alternatives
      PROBE_SCROLL: 70,            // Existing: scroll discovery from dom_runtime.js
      MUTATION_WAIT: 60,           // NEW: wait for DOM changes
      FRAME_TRAVERSAL: 50,         // Existing + enhanced
      LABEL_PROXIMITY: 40,         // NEW: nearby label text
      VALIDATION_RETRY: 30,        // NEW: post-validation fix
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
      return Array.from(this.strategies.values())
        .sort((a, b) => b.priority - a.priority);
    }

    /**
     * Register built-in recovery strategies
     */
    _registerBuiltinStrategies() {
      const priorities = SelfHealingEngine.STRATEGY_PRIORITIES;

      // DOM_SKILL_MEMORY - leverages existing learned hints
      this.registerStrategy('DOM_SKILL_MEMORY', priorities.DOM_SKILL_MEMORY, async (ctx) => {
        if (!ctx.intent || !ctx.target) return { success: false };
        
        // Use existing matchDomSkill from content.js if available
        if (typeof window.__bilgeMatchDomSkill === 'function') {
          const result = await window.__bilgeMatchDomSkill(ctx.intent, ctx.target);
          if (result?.element) {
            return { success: true, element: result.element, info: { entry: result.entry } };
          }
        }
        return { success: false };
      });

      // HEURISTIC_MATCH - leverages existing token-based scoring
      this.registerStrategy('HEURISTIC_MATCH', priorities.HEURISTIC_MATCH, async (ctx) => {
        if (typeof window.__bilgeFindElementByHeuristic !== 'function') {
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
          return { success: true, element, info: { matchedBy: 'heuristic' } };
        }
        return { success: false };
      });

      // SELECTOR_PERMUTATION - generate alternative selectors
      this.registerStrategy('SELECTOR_PERMUTATION', priorities.SELECTOR_PERMUTATION, async (ctx) => {
        const permutations = this.generateSelectorPermutations(ctx.hints, ctx.failedSelectors);
        
        for (const selector of permutations) {
          try {
            const element = document.querySelector(selector);
            if (element && this._isUsable(element)) {
              return { success: true, element, info: { matchedBy: 'permutation', selector } };
            }
          } catch (_err) {
            // Invalid selector, skip
          }
        }
        return { success: false };
      });

      // PROBE_SCROLL - scroll to find off-screen elements
      this.registerStrategy('PROBE_SCROLL', priorities.PROBE_SCROLL, async (ctx) => {
        if (!ctx.target && !ctx.hints) return { success: false };

        const probeDistance = Math.max(240, Math.round(window.innerHeight * 0.8));
        const maxProbes = 4;
        const originalScroll = window.scrollY;

        for (let probe = 1; probe <= maxProbes; probe++) {
          window.scrollBy({ top: probeDistance, behavior: 'auto' });
          await this._sleep(150);

          // Try to find element after scrolling
          const element = await this._tryFindElement(ctx);
          if (element) {
            return { success: true, element, info: { matchedBy: 'probe_scroll', probe } };
          }
        }

        // Reset scroll and try from top
        window.scrollTo({ top: 0, behavior: 'auto' });
        await this._sleep(150);

        const elementFromTop = await this._tryFindElement(ctx);
        if (elementFromTop) {
          return { success: true, element: elementFromTop, info: { matchedBy: 'probe_scroll_reset' } };
        }

        // Restore original position
        window.scrollTo({ top: originalScroll, behavior: 'auto' });
        return { success: false };
      });

      // MUTATION_WAIT - wait for dynamic content
      this.registerStrategy('MUTATION_WAIT', priorities.MUTATION_WAIT, async (ctx) => {
        const timeout = ctx.waitTimeout || 3000;
        const selectors = this._buildSelectors(ctx);

        if (selectors.length === 0) return { success: false };

        return new Promise((resolve) => {
          let resolved = false;
          
          const checkForElement = () => {
            for (const selector of selectors) {
              try {
                const element = document.querySelector(selector);
                if (element && this._isUsable(element)) {
                  return element;
                }
              } catch (_err) {}
            }
            return null;
          };

          // Check immediately
          const immediate = checkForElement();
          if (immediate) {
            resolve({ success: true, element: immediate, info: { matchedBy: 'mutation_immediate' } });
            return;
          }

          const observer = new MutationObserver(() => {
            if (resolved) return;
            const found = checkForElement();
            if (found) {
              resolved = true;
              observer.disconnect();
              resolve({ success: true, element: found, info: { matchedBy: 'mutation_observed' } });
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

      // FRAME_TRAVERSAL - search in iframes and shadow roots
      this.registerStrategy('FRAME_TRAVERSAL', priorities.FRAME_TRAVERSAL, async (ctx) => {
        const selectors = this._buildSelectors(ctx);
        if (selectors.length === 0) return { success: false };

        const element = this._querySelectorDeepAll(selectors[0]);
        if (element && this._isUsable(element)) {
          return { success: true, element, info: { matchedBy: 'frame_traversal' } };
        }
        return { success: false };
      });

      // LABEL_PROXIMITY - find by associated label text
      this.registerStrategy('LABEL_PROXIMITY', priorities.LABEL_PROXIMITY, async (ctx) => {
        const labelText = ctx.hints?.label || ctx.hints?.labelText || ctx.target;
        if (!labelText) return { success: false };

        const element = this._findInputFromLabelText(labelText);
        if (element && this._isUsable(element)) {
          return { success: true, element, info: { matchedBy: 'label_proximity', labelText } };
        }
        return { success: false };
      });

      // VALIDATION_RETRY - retry with adjusted approach
      this.registerStrategy('VALIDATION_RETRY', priorities.VALIDATION_RETRY, async (ctx) => {
        if (!ctx.validationError) return { success: false };

        // Try relaxed matching if validation failed
        const hints = ctx.hints || {};
        const relaxedHints = {
          ...hints,
          label: hints.label?.split(' ').slice(0, 2).join(' '), // Shorten label
        };

        if (typeof window.__bilgeFindElementByHeuristic === 'function') {
          const element = window.__bilgeFindElementByHeuristic({
            label: relaxedHints.label,
            field: relaxedHints.field,
            name: relaxedHints.name,
            placeholder: relaxedHints.placeholder
          }, null);

          if (element && this._isUsable(element)) {
            return { success: true, element, info: { matchedBy: 'validation_retry', relaxed: true } };
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
        waitTimeout: context.waitTimeout || 3000,
        validationError: context.validationError || null,
      };

      for (const strategy of this.getSortedStrategies()) {
        try {
          const result = await strategy.handler(recoveryContext);
          
          if (result.success && result.element) {
            const duration = Date.now() - startTime;
            this._recordSuccess(strategy.name, target, duration, result.info);
            
            return {
              success: true,
              element: result.element,
              strategy: strategy.name,
              info: result.info || {},
              duration,
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
        error: 'All recovery strategies exhausted',
        strategiesAttempted: this.strategies.size,
        duration,
      };
    }

    /**
     * Generate alternative selectors from hints
     */
    generateSelectorPermutations(hints = {}, failedSelectors = []) {
      const alternatives = [];
      const failed = new Set(failedSelectors || []);

      const addIfValid = (selector) => {
        if (selector && !failed.has(selector)) {
          alternatives.push(selector);
        }
      };

      // ID-based
      if (hints.id) {
        addIfValid(`#${CSS.escape(hints.id)}`);
        addIfValid(`[id="${CSS.escape(hints.id)}"]`);
        addIfValid(`[id*="${CSS.escape(hints.id)}"]`);
      }

      // Name-based
      if (hints.name) {
        addIfValid(`[name="${CSS.escape(hints.name)}"]`);
        addIfValid(`[name*="${CSS.escape(hints.name)}"]`);
        addIfValid(`input[name="${CSS.escape(hints.name)}"]`);
        addIfValid(`textarea[name="${CSS.escape(hints.name)}"]`);
        addIfValid(`select[name="${CSS.escape(hints.name)}"]`);
      }

      // Aria-label
      if (hints.ariaLabel) {
        addIfValid(`[aria-label="${CSS.escape(hints.ariaLabel)}"]`);
        addIfValid(`[aria-label*="${CSS.escape(hints.ariaLabel)}"]`);
      }

      // Placeholder
      if (hints.placeholder) {
        addIfValid(`[placeholder="${CSS.escape(hints.placeholder)}"]`);
        addIfValid(`[placeholder*="${CSS.escape(hints.placeholder)}"]`);
      }

      // Data test ID
      if (hints.dataTestId) {
        addIfValid(`[data-testid="${CSS.escape(hints.dataTestId)}"]`);
        addIfValid(`[data-test-id="${CSS.escape(hints.dataTestId)}"]`);
        addIfValid(`[data-qa="${CSS.escape(hints.dataTestId)}"]`);
      }

      // Autocomplete attribute
      if (hints.autocomplete) {
        addIfValid(`[autocomplete="${CSS.escape(hints.autocomplete)}"]`);
      }

      // Type + name combinations
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
        type: 'success',
        strategy: strategyName,
        target: String(target || '').slice(0, 100),
        duration,
        timestamp: Date.now(),
        info: info || {},
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
        type: 'failure',
        intent,
        target: String(target || '').slice(0, 100),
        failedSelectors: (failedSelectors || []).slice(0, 5),
        duration,
        timestamp: Date.now(),
      });

      this._pruneAndSaveTelemetry();
    }

    /**
     * Prune and save telemetry to storage
     */
    async _pruneAndSaveTelemetry() {
      const now = Date.now();
      this.recoveryTelemetry = this.recoveryTelemetry
        .filter(entry => now - entry.timestamp < TELEMETRY_TTL_MS)
        .slice(-MAX_TELEMETRY_ENTRIES);

      try {
        await chrome.storage.local.set({
          [STORAGE_KEY_TELEMETRY]: this.recoveryTelemetry
        });
      } catch (_err) {
        // Non-fatal
      }
    }

    /**
     * Load telemetry from storage
     */
    async loadTelemetry() {
      try {
        const result = await chrome.storage.local.get([STORAGE_KEY_TELEMETRY]);
        this.recoveryTelemetry = Array.isArray(result[STORAGE_KEY_TELEMETRY])
          ? result[STORAGE_KEY_TELEMETRY]
          : [];
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
        avgDuration: 0,
      };

      let totalDuration = 0;
      for (const entry of this.recoveryTelemetry) {
        if (entry.type === 'success') {
          stats.successCount += 1;
          stats.byStrategy[entry.strategy] = (stats.byStrategy[entry.strategy] || 0) + 1;
        } else {
          stats.failureCount += 1;
        }
        totalDuration += entry.duration || 0;
      }

      if (stats.totalRecoveries > 0) {
        stats.avgDuration = Math.round(totalDuration / stats.totalRecoveries);
        stats.successRate = Math.round((stats.successCount / stats.totalRecoveries) * 100);
      }

      return stats;
    }

    // === Helper methods ===

    _sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    _isUsable(element) {
      if (!(element instanceof Element)) return false;
      const disabled = element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
      if (disabled) return false;
      
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
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
      // Try heuristic matching
      if (typeof window.__bilgeFindElementByHeuristic === 'function') {
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
      const seenRoots = new WeakSet();

      while (pendingRoots.length > 0) {
        const { root: currentRoot, depth } = pendingRoots.shift();
        if (!currentRoot || seenRoots.has(currentRoot) || depth > MAX_DEPTH) continue;
        seenRoots.add(currentRoot);

        try {
          const found = currentRoot.querySelector(selector);
          if (found) return found;
        } catch (_err) {
          // Invalid selector
        }

        // Check shadow roots and iframes
        try {
          const walker = document.createTreeWalker(currentRoot, NodeFilter.SHOW_ELEMENT);
          for (let node = walker.currentNode; node; node = walker.nextNode()) {
            if (node.shadowRoot) {
              pendingRoots.push({ root: node.shadowRoot, depth: depth + 1 });
            }
            const tag = String(node?.tagName || '').toUpperCase();
            if (tag === 'IFRAME' || tag === 'FRAME') {
              try {
                if (node.contentDocument) {
                  pendingRoots.push({ root: node.contentDocument, depth: depth + 1 });
                }
              } catch (_err) {
                // Cross-origin frame
              }
            }
          }
        } catch (_err) {}
      }

      return null;
    }

    /**
     * Find input from associated label text
     */
    _findInputFromLabelText(labelText) {
      const norm = String(labelText || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      if (!norm) return null;

      const labels = Array.from(document.querySelectorAll('label'));
      for (const label of labels) {
        const text = String(label.textContent || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (!text || !text.includes(norm)) continue;

        const htmlFor = String(label.getAttribute('for') || '');
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

  // Create global instance
  window.__bilge_selfHealingEngine = new SelfHealingEngine();

  // Load telemetry on init
  window.__bilge_selfHealingEngine.loadTelemetry().catch(() => {});

  console.log('[Bilge] SelfHealingEngine initialized');
})();
