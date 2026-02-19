// fieldResolver.js - Enhanced field resolution with deep traversal and priority-based strategies
// Extends existing querySelectorDeep with MutationObserver, priority scoring, and self-healing integration

(function() {
  'use strict';

  if (window.__bilge_fieldResolver) return;

  const MAX_DEPTH = 100;
  const DEFAULT_WAIT_TIMEOUT = 5000;

  // Frame priority scoring for deep traversal
  const FRAME_PRIORITY = {
    document: 100,
    sameOriginIframe: 80,
    shadowRoot: 60,
    crossOriginIframe: 20, // Can't access, but track for reporting
  };

  /**
   * FieldResolver - Enhanced field resolution with multiple strategies
   */
  class FieldResolver {
    constructor() {
      this.cache = new Map(); // Simple LRU cache for recent resolutions
      this.cacheMaxSize = 50;
      this.cacheTTL = 30000; // 30 seconds
    }

    /**
     * Main resolution method - tries strategies in priority order
     * @param {Object} hint - Resolution hints (selector, id, name, ariaLabel, etc.)
     * @param {Object} options - Resolution options
     * @returns {Promise<Element|null>}
     */
    async resolve(hint, options = {}) {
      if (!hint) return null;

      const cacheKey = this._buildCacheKey(hint);
      const cached = this._getFromCache(cacheKey);
      if (cached && this._isUsable(cached)) return cached;

      const strategies = [
        () => this.exactSelector(hint.selector),
        () => this.byId(hint.id),
        () => this.byName(hint.name),
        () => this.byAriaLabel(hint.ariaLabel),
        () => this.byDataTestId(hint.dataTestId),
        () => this.byLabelAssociation(hint.label || hint.labelText),
        () => this.byPlaceholder(hint.placeholder),
        () => this.byAutocomplete(hint.autocomplete),
        () => this.heuristicMatch(hint),
        () => this.proximityMatch(hint),
        () => this.deepShadowSearch(hint),
        () => this.frameSearch(hint),
      ];

      for (const strategy of strategies) {
        try {
          const element = await strategy();
          if (element && this._isUsable(element)) {
            this._addToCache(cacheKey, element);
            return element;
          }
        } catch (_err) {
          // Strategy failed, try next
        }
      }

      // If all strategies fail and we have a self-healing engine, delegate to it
      if (window.__bilge_selfHealingEngine && options.useSelfHealing !== false) {
        const intent = options.intent || 'type';
        const target = hint.label || hint.name || hint.placeholder || hint.id || '';
        
        const recovery = await window.__bilge_selfHealingEngine.attemptRecovery(
          intent,
          target,
          hint.selector ? [hint.selector] : [],
          { hints: hint, waitTimeout: options.waitTimeout || DEFAULT_WAIT_TIMEOUT }
        );

        if (recovery.success && recovery.element) {
          this._addToCache(cacheKey, recovery.element);
          return recovery.element;
        }
      }

      return null;
    }

    /**
     * Exact selector match
     */
    exactSelector(selector) {
      if (!selector) return null;
      try {
        return document.querySelector(selector);
      } catch (_err) {
        return null;
      }
    }

    /**
     * Find by ID
     */
    byId(id) {
      if (!id) return null;
      return document.getElementById(id);
    }

    /**
     * Find by name attribute
     */
    byName(name) {
      if (!name) return null;
      return document.querySelector(`[name="${CSS.escape(name)}"]`);
    }

    /**
     * Find by aria-label
     */
    byAriaLabel(ariaLabel) {
      if (!ariaLabel) return null;
      return document.querySelector(`[aria-label="${CSS.escape(ariaLabel)}"]`) ||
             document.querySelector(`[aria-label*="${CSS.escape(ariaLabel)}"]`);
    }

    /**
     * Find by data-testid
     */
    byDataTestId(dataTestId) {
      if (!dataTestId) return null;
      return document.querySelector(`[data-testid="${CSS.escape(dataTestId)}"]`) ||
             document.querySelector(`[data-test-id="${CSS.escape(dataTestId)}"]`) ||
             document.querySelector(`[data-qa="${CSS.escape(dataTestId)}"]`);
    }

    /**
     * Find by associated label text
     */
    byLabelAssociation(labelText) {
      if (!labelText) return null;
      const norm = this._normalizeText(labelText);
      if (!norm) return null;

      const labels = Array.from(document.querySelectorAll('label'));
      for (const label of labels) {
        const text = this._normalizeText(label.textContent || '');
        if (!text.includes(norm) && !norm.includes(text)) continue;

        // Check for= attribute
        const htmlFor = label.getAttribute('for');
        if (htmlFor) {
          const element = document.getElementById(htmlFor);
          if (element && this._isUsable(element)) return element;
        }

        // Check nested input
        const nested = label.querySelector('input, textarea, select, [contenteditable="true"]');
        if (nested && this._isUsable(nested)) return nested;

        // Check sibling/nearby inputs
        const parent = label.parentElement;
        if (parent) {
          const nearby = parent.querySelector('input, textarea, select, [contenteditable="true"]');
          if (nearby && this._isUsable(nearby)) return nearby;
        }
      }

      return null;
    }

    /**
     * Find by placeholder
     */
    byPlaceholder(placeholder) {
      if (!placeholder) return null;
      return document.querySelector(`[placeholder="${CSS.escape(placeholder)}"]`) ||
             document.querySelector(`[placeholder*="${CSS.escape(placeholder)}"]`);
    }

    /**
     * Find by autocomplete attribute
     */
    byAutocomplete(autocomplete) {
      if (!autocomplete) return null;
      return document.querySelector(`[autocomplete="${CSS.escape(autocomplete)}"]`);
    }

    /**
     * Heuristic token-based matching (leverages existing implementation)
     */
    heuristicMatch(hint) {
      if (typeof window.__bilgeFindElementByHeuristic === 'function') {
        return window.__bilgeFindElementByHeuristic(hint, hint.selector);
      }
      return this._basicHeuristicMatch(hint);
    }

    /**
     * Basic heuristic match as fallback
     */
    _basicHeuristicMatch(hint) {
      const tokens = new Set();
      const rawHints = [hint.field, hint.name, hint.label, hint.placeholder, hint.id];
      
      for (const h of rawHints) {
        if (!h) continue;
        const parts = String(h)
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter(Boolean);
        parts.forEach(p => tokens.add(p));
      }

      if (tokens.size === 0) return null;

      // Expand synonyms
      if (tokens.has('first')) tokens.add('given');
      if (tokens.has('last')) { tokens.add('family'); tokens.add('surname'); }
      if (tokens.has('phone')) tokens.add('tel');
      if (tokens.has('mail')) tokens.add('email');
      if (tokens.has('email')) tokens.add('mail');

      const candidates = Array.from(
        document.querySelectorAll('input, textarea, select, [contenteditable="true"], [role="textbox"]')
      ).filter(el => this._isUsable(el));

      let best = null;
      let bestScore = 0;

      for (const element of candidates) {
        const haystack = this._elementSearchText(element);
        let score = 0;

        for (const token of tokens) {
          if (haystack.includes(token)) {
            score += token.length >= 4 ? 2 : 1;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          best = element;
        }
      }

      return bestScore > 0 ? best : null;
    }

    /**
     * Proximity-based matching - find fields near matching labels/text
     */
    proximityMatch(hint) {
      const searchText = hint.label || hint.field || hint.name;
      if (!searchText) return null;

      const norm = this._normalizeText(searchText);
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      );

      let textNode;
      while ((textNode = walker.nextNode())) {
        const nodeText = this._normalizeText(textNode.textContent || '');
        if (!nodeText.includes(norm)) continue;

        // Found matching text, look for nearby inputs
        const container = textNode.parentElement;
        if (!container) continue;

        // Check siblings
        const input = container.querySelector('input, textarea, select, [contenteditable="true"]') ||
                     container.parentElement?.querySelector('input, textarea, select, [contenteditable="true"]');
        
        if (input && this._isUsable(input)) return input;
      }

      return null;
    }

    /**
     * Deep shadow DOM search with priority scoring
     */
    deepShadowSearch(hint) {
      const selector = this._buildBestSelector(hint);
      if (!selector) return null;

      return this.querySelectorDeepAll(selector);
    }

    /**
     * Search across frames
     */
    frameSearch(hint) {
      const selector = this._buildBestSelector(hint);
      if (!selector) return null;

      const frames = Array.from(document.querySelectorAll('iframe, frame'));
      for (const frame of frames) {
        try {
          if (frame.contentDocument) {
            const element = frame.contentDocument.querySelector(selector);
            if (element && this._isUsable(element)) return element;
          }
        } catch (_err) {
          // Cross-origin frame
        }
      }

      return null;
    }

    /**
     * Enhanced deep traversal with priority scoring
     * @param {string} selector - CSS selector
     * @param {Element|Document} root - Starting root
     * @returns {Element|null}
     */
    querySelectorDeepAll(selector, root = document) {
      const results = [];
      const queue = [{ root, depth: 0, priority: FRAME_PRIORITY.document }];
      const seen = new WeakSet();

      while (queue.length > 0 && results.length < 10) {
        const { root: currentRoot, depth, priority } = queue.shift();
        if (depth > MAX_DEPTH || !currentRoot || seen.has(currentRoot)) continue;
        seen.add(currentRoot);

        // Query in current root
        try {
          const matches = currentRoot.querySelectorAll(selector);
          for (const el of matches) {
            if (this._isUsable(el)) {
              results.push({ element: el, priority, depth });
            }
          }
        } catch (_err) {
          // Invalid selector
        }

        // Enqueue shadow roots and frames
        try {
          const walker = document.createTreeWalker(currentRoot, NodeFilter.SHOW_ELEMENT);
          for (let node = walker.currentNode; node; node = walker.nextNode()) {
            if (node.shadowRoot) {
              queue.push({
                root: node.shadowRoot,
                depth: depth + 1,
                priority: FRAME_PRIORITY.shadowRoot
              });
            }
            
            const tag = String(node?.tagName || '').toUpperCase();
            if (tag === 'IFRAME' || tag === 'FRAME') {
              try {
                if (node.contentDocument) {
                  queue.push({
                    root: node.contentDocument,
                    depth: depth + 1,
                    priority: FRAME_PRIORITY.sameOriginIframe
                  });
                }
              } catch (_err) {
                // Cross-origin frame
              }
            }
          }
        } catch (_err) {}
      }

      // Return highest priority match
      results.sort((a, b) => b.priority - a.priority || a.depth - b.depth);
      return results[0]?.element || null;
    }

    /**
     * Wait for element to appear (MutationObserver based)
     * @param {string} selector - CSS selector to wait for
     * @param {number} timeout - Max wait time in ms
     * @returns {Promise<Element|null>}
     */
    async waitForElement(selector, timeout = DEFAULT_WAIT_TIMEOUT) {
      // Check if already exists
      const existing = this.exactSelector(selector);
      if (existing && this._isUsable(existing)) return existing;

      return new Promise((resolve) => {
        let resolved = false;

        const observer = new MutationObserver(() => {
          if (resolved) return;
          const found = this.exactSelector(selector);
          if (found && this._isUsable(found)) {
            resolved = true;
            observer.disconnect();
            resolve(found);
          }
        });

        observer.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['id', 'name', 'class', 'style', 'hidden', 'disabled']
        });

        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            observer.disconnect();
            resolve(null);
          }
        }, timeout);
      });
    }

    /**
     * Wait for any of multiple selectors
     * @param {string[]} selectors - Array of selectors to wait for
     * @param {number} timeout - Max wait time
     * @returns {Promise<{element: Element|null, selector: string|null}>}
     */
    async waitForAnyElement(selectors, timeout = DEFAULT_WAIT_TIMEOUT) {
      // Check if any already exists
      for (const selector of selectors) {
        const existing = this.exactSelector(selector);
        if (existing && this._isUsable(existing)) {
          return { element: existing, selector };
        }
      }

      return new Promise((resolve) => {
        let resolved = false;

        const checkAll = () => {
          for (const selector of selectors) {
            try {
              const found = document.querySelector(selector);
              if (found && this._isUsable(found)) {
                return { element: found, selector };
              }
            } catch (_err) {}
          }
          return null;
        };

        const observer = new MutationObserver(() => {
          if (resolved) return;
          const result = checkAll();
          if (result) {
            resolved = true;
            observer.disconnect();
            resolve(result);
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
            resolve({ element: null, selector: null });
          }
        }, timeout);
      });
    }

    // === Helper methods ===

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

    _normalizeText(text) {
      return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    _elementSearchText(element) {
      const attrKeys = ['name', 'id', 'placeholder', 'aria-label', 'autocomplete', 'data-testid', 'title'];
      const values = [element.tagName.toLowerCase()];
      
      for (const key of attrKeys) {
        const v = element.getAttribute?.(key);
        if (v) values.push(v);
      }

      // Get label text
      const id = element.getAttribute('id');
      if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label?.textContent) values.push(label.textContent);
      }
      const closestLabel = element.closest('label');
      if (closestLabel?.textContent) values.push(closestLabel.textContent);

      return this._normalizeText(values.join(' '));
    }

    _buildBestSelector(hint) {
      if (hint.selector) return hint.selector;
      if (hint.id) return `#${CSS.escape(hint.id)}`;
      if (hint.name) return `[name="${CSS.escape(hint.name)}"]`;
      if (hint.ariaLabel) return `[aria-label="${CSS.escape(hint.ariaLabel)}"]`;
      if (hint.dataTestId) return `[data-testid="${CSS.escape(hint.dataTestId)}"]`;
      if (hint.placeholder) return `[placeholder*="${CSS.escape(hint.placeholder)}"]`;
      return null;
    }

    _buildCacheKey(hint) {
      const parts = [
        hint.selector,
        hint.id,
        hint.name,
        hint.ariaLabel,
        hint.label,
        hint.placeholder
      ].filter(Boolean);
      return parts.join('|').slice(0, 200);
    }

    _getFromCache(key) {
      const entry = this.cache.get(key);
      if (!entry) return null;
      if (Date.now() - entry.timestamp > this.cacheTTL) {
        this.cache.delete(key);
        return null;
      }
      return entry.element;
    }

    _addToCache(key, element) {
      if (this.cache.size >= this.cacheMaxSize) {
        // Remove oldest entry
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(key, { element, timestamp: Date.now() });
    }

    clearCache() {
      this.cache.clear();
    }
  }

  // Create global instance
  window.__bilge_fieldResolver = new FieldResolver();

  console.log('[Bilge] FieldResolver initialized');
})();
