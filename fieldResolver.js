var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/fieldResolver.js
(function() {
  "use strict";
  if (window.__bilge_fieldResolver) return;
  const MAX_DEPTH = 100;
  const DEFAULT_WAIT_TIMEOUT = 5e3;
  const FRAME_PRIORITY = {
    document: 100,
    sameOriginIframe: 80,
    shadowRoot: 60,
    crossOriginIframe: 20
    // Can't access, but track for reporting
  };
  class FieldResolver {
    static {
      __name(this, "FieldResolver");
    }
    constructor() {
      this.cache = /* @__PURE__ */ new Map();
      this.cacheMaxSize = 50;
      this.cacheTTL = 3e4;
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
        () => this.frameSearch(hint)
      ];
      for (const strategy of strategies) {
        try {
          const element = await strategy();
          if (element && this._isUsable(element)) {
            this._addToCache(cacheKey, element);
            return element;
          }
        } catch (_err) {
        }
      }
      if (window.__bilge_selfHealingEngine && options.useSelfHealing !== false) {
        const intent = options.intent || "type";
        const target = hint.label || hint.name || hint.placeholder || hint.id || "";
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
      return document.querySelector(`[aria-label="${CSS.escape(ariaLabel)}"]`) || document.querySelector(`[aria-label*="${CSS.escape(ariaLabel)}"]`);
    }
    /**
     * Find by data-testid
     */
    byDataTestId(dataTestId) {
      if (!dataTestId) return null;
      return document.querySelector(`[data-testid="${CSS.escape(dataTestId)}"]`) || document.querySelector(`[data-test-id="${CSS.escape(dataTestId)}"]`) || document.querySelector(`[data-qa="${CSS.escape(dataTestId)}"]`);
    }
    /**
     * Find by associated label text
     */
    byLabelAssociation(labelText) {
      if (!labelText) return null;
      const norm = this._normalizeText(labelText);
      if (!norm) return null;
      const labels = Array.from(document.querySelectorAll("label"));
      for (const label of labels) {
        const text = this._normalizeText(label.textContent || "");
        if (!text.includes(norm) && !norm.includes(text)) continue;
        const htmlFor = label.getAttribute("for");
        if (htmlFor) {
          const element = document.getElementById(htmlFor);
          if (element && this._isUsable(element)) return element;
        }
        const nested = label.querySelector('input, textarea, select, [contenteditable="true"]');
        if (nested && this._isUsable(nested)) return nested;
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
      return document.querySelector(`[placeholder="${CSS.escape(placeholder)}"]`) || document.querySelector(`[placeholder*="${CSS.escape(placeholder)}"]`);
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
      if (typeof window.__bilgeFindElementByHeuristic === "function") {
        return window.__bilgeFindElementByHeuristic(hint, hint.selector);
      }
      return this._basicHeuristicMatch(hint);
    }
    /**
     * Basic heuristic match as fallback
     */
    _basicHeuristicMatch(hint) {
      const tokens = /* @__PURE__ */ new Set();
      const rawHints = [hint.field, hint.name, hint.label, hint.placeholder, hint.id];
      for (const h of rawHints) {
        if (!h) continue;
        const parts = String(h).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        parts.forEach((p) => tokens.add(p));
      }
      if (tokens.size === 0) return null;
      if (tokens.has("first")) tokens.add("given");
      if (tokens.has("last")) {
        tokens.add("family");
        tokens.add("surname");
      }
      if (tokens.has("phone")) tokens.add("tel");
      if (tokens.has("mail")) tokens.add("email");
      if (tokens.has("email")) tokens.add("mail");
      const candidates = Array.from(
        document.querySelectorAll('input, textarea, select, [contenteditable="true"], [role="textbox"]')
      ).filter((el) => this._isUsable(el));
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
      while (textNode = walker.nextNode()) {
        const nodeText = this._normalizeText(textNode.textContent || "");
        if (!nodeText.includes(norm)) continue;
        const container = textNode.parentElement;
        if (!container) continue;
        const input = container.querySelector('input, textarea, select, [contenteditable="true"]') || container.parentElement?.querySelector('input, textarea, select, [contenteditable="true"]');
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
      const frames = Array.from(document.querySelectorAll("iframe, frame"));
      for (const frame of frames) {
        try {
          if (frame.contentDocument) {
            const element = frame.contentDocument.querySelector(selector);
            if (element && this._isUsable(element)) return element;
          }
        } catch (_err) {
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
      const seen = /* @__PURE__ */ new WeakSet();
      while (queue.length > 0 && results.length < 10) {
        const { root: currentRoot, depth, priority } = queue.shift();
        if (depth > MAX_DEPTH || !currentRoot || seen.has(currentRoot)) continue;
        seen.add(currentRoot);
        try {
          const matches = currentRoot.querySelectorAll(selector);
          for (const el of matches) {
            if (this._isUsable(el)) {
              results.push({ element: el, priority, depth });
            }
          }
        } catch (_err) {
        }
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
            const tag = String(node?.tagName || "").toUpperCase();
            if (tag === "IFRAME" || tag === "FRAME") {
              try {
                if (node.contentDocument) {
                  queue.push({
                    root: node.contentDocument,
                    depth: depth + 1,
                    priority: FRAME_PRIORITY.sameOriginIframe
                  });
                }
              } catch (_err) {
              }
            }
          }
        } catch (_err) {
        }
      }
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
          attributeFilter: ["id", "name", "class", "style", "hidden", "disabled"]
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
      for (const selector of selectors) {
        const existing = this.exactSelector(selector);
        if (existing && this._isUsable(existing)) {
          return { element: existing, selector };
        }
      }
      return new Promise((resolve) => {
        let resolved = false;
        const checkAll = /* @__PURE__ */ __name(() => {
          for (const selector of selectors) {
            try {
              const found = document.querySelector(selector);
              if (found && this._isUsable(found)) {
                return { element: found, selector };
              }
            } catch (_err) {
            }
          }
          return null;
        }, "checkAll");
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
      const disabled = element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
      if (disabled) return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (rect.width < 2 || rect.height < 2) return false;
      return true;
    }
    _normalizeText(text) {
      return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    }
    _elementSearchText(element) {
      const attrKeys = ["name", "id", "placeholder", "aria-label", "autocomplete", "data-testid", "title"];
      const values = [element.tagName.toLowerCase()];
      for (const key of attrKeys) {
        const v = element.getAttribute?.(key);
        if (v) values.push(v);
      }
      const id = element.getAttribute("id");
      if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label?.textContent) values.push(label.textContent);
      }
      const closestLabel = element.closest("label");
      if (closestLabel?.textContent) values.push(closestLabel.textContent);
      return this._normalizeText(values.join(" "));
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
      return parts.join("|").slice(0, 200);
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
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(key, { element, timestamp: Date.now() });
    }
    clearCache() {
      this.cache.clear();
    }
  }
  window.__bilge_fieldResolver = new FieldResolver();
  console.log("[Bilge] FieldResolver initialized");
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2ZpZWxkUmVzb2x2ZXIuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIGZpZWxkUmVzb2x2ZXIuanMgLSBFbmhhbmNlZCBmaWVsZCByZXNvbHV0aW9uIHdpdGggZGVlcCB0cmF2ZXJzYWwgYW5kIHByaW9yaXR5LWJhc2VkIHN0cmF0ZWdpZXNcbi8vIEV4dGVuZHMgZXhpc3RpbmcgcXVlcnlTZWxlY3RvckRlZXAgd2l0aCBNdXRhdGlvbk9ic2VydmVyLCBwcmlvcml0eSBzY29yaW5nLCBhbmQgc2VsZi1oZWFsaW5nIGludGVncmF0aW9uXG5cbihmdW5jdGlvbigpIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGlmICh3aW5kb3cuX19iaWxnZV9maWVsZFJlc29sdmVyKSByZXR1cm47XG5cbiAgY29uc3QgTUFYX0RFUFRIID0gMTAwO1xuICBjb25zdCBERUZBVUxUX1dBSVRfVElNRU9VVCA9IDUwMDA7XG5cbiAgLy8gRnJhbWUgcHJpb3JpdHkgc2NvcmluZyBmb3IgZGVlcCB0cmF2ZXJzYWxcbiAgY29uc3QgRlJBTUVfUFJJT1JJVFkgPSB7XG4gICAgZG9jdW1lbnQ6IDEwMCxcbiAgICBzYW1lT3JpZ2luSWZyYW1lOiA4MCxcbiAgICBzaGFkb3dSb290OiA2MCxcbiAgICBjcm9zc09yaWdpbklmcmFtZTogMjAsIC8vIENhbid0IGFjY2VzcywgYnV0IHRyYWNrIGZvciByZXBvcnRpbmdcbiAgfTtcblxuICAvKipcbiAgICogRmllbGRSZXNvbHZlciAtIEVuaGFuY2VkIGZpZWxkIHJlc29sdXRpb24gd2l0aCBtdWx0aXBsZSBzdHJhdGVnaWVzXG4gICAqL1xuICBjbGFzcyBGaWVsZFJlc29sdmVyIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgIHRoaXMuY2FjaGUgPSBuZXcgTWFwKCk7IC8vIFNpbXBsZSBMUlUgY2FjaGUgZm9yIHJlY2VudCByZXNvbHV0aW9uc1xuICAgICAgdGhpcy5jYWNoZU1heFNpemUgPSA1MDtcbiAgICAgIHRoaXMuY2FjaGVUVEwgPSAzMDAwMDsgLy8gMzAgc2Vjb25kc1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1haW4gcmVzb2x1dGlvbiBtZXRob2QgLSB0cmllcyBzdHJhdGVnaWVzIGluIHByaW9yaXR5IG9yZGVyXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGhpbnQgLSBSZXNvbHV0aW9uIGhpbnRzIChzZWxlY3RvciwgaWQsIG5hbWUsIGFyaWFMYWJlbCwgZXRjLilcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIFJlc29sdXRpb24gb3B0aW9uc1xuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPEVsZW1lbnR8bnVsbD59XG4gICAgICovXG4gICAgYXN5bmMgcmVzb2x2ZShoaW50LCBvcHRpb25zID0ge30pIHtcbiAgICAgIGlmICghaGludCkgcmV0dXJuIG51bGw7XG5cbiAgICAgIGNvbnN0IGNhY2hlS2V5ID0gdGhpcy5fYnVpbGRDYWNoZUtleShoaW50KTtcbiAgICAgIGNvbnN0IGNhY2hlZCA9IHRoaXMuX2dldEZyb21DYWNoZShjYWNoZUtleSk7XG4gICAgICBpZiAoY2FjaGVkICYmIHRoaXMuX2lzVXNhYmxlKGNhY2hlZCkpIHJldHVybiBjYWNoZWQ7XG5cbiAgICAgIGNvbnN0IHN0cmF0ZWdpZXMgPSBbXG4gICAgICAgICgpID0+IHRoaXMuZXhhY3RTZWxlY3RvcihoaW50LnNlbGVjdG9yKSxcbiAgICAgICAgKCkgPT4gdGhpcy5ieUlkKGhpbnQuaWQpLFxuICAgICAgICAoKSA9PiB0aGlzLmJ5TmFtZShoaW50Lm5hbWUpLFxuICAgICAgICAoKSA9PiB0aGlzLmJ5QXJpYUxhYmVsKGhpbnQuYXJpYUxhYmVsKSxcbiAgICAgICAgKCkgPT4gdGhpcy5ieURhdGFUZXN0SWQoaGludC5kYXRhVGVzdElkKSxcbiAgICAgICAgKCkgPT4gdGhpcy5ieUxhYmVsQXNzb2NpYXRpb24oaGludC5sYWJlbCB8fCBoaW50LmxhYmVsVGV4dCksXG4gICAgICAgICgpID0+IHRoaXMuYnlQbGFjZWhvbGRlcihoaW50LnBsYWNlaG9sZGVyKSxcbiAgICAgICAgKCkgPT4gdGhpcy5ieUF1dG9jb21wbGV0ZShoaW50LmF1dG9jb21wbGV0ZSksXG4gICAgICAgICgpID0+IHRoaXMuaGV1cmlzdGljTWF0Y2goaGludCksXG4gICAgICAgICgpID0+IHRoaXMucHJveGltaXR5TWF0Y2goaGludCksXG4gICAgICAgICgpID0+IHRoaXMuZGVlcFNoYWRvd1NlYXJjaChoaW50KSxcbiAgICAgICAgKCkgPT4gdGhpcy5mcmFtZVNlYXJjaChoaW50KSxcbiAgICAgIF07XG5cbiAgICAgIGZvciAoY29uc3Qgc3RyYXRlZ3kgb2Ygc3RyYXRlZ2llcykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGVsZW1lbnQgPSBhd2FpdCBzdHJhdGVneSgpO1xuICAgICAgICAgIGlmIChlbGVtZW50ICYmIHRoaXMuX2lzVXNhYmxlKGVsZW1lbnQpKSB7XG4gICAgICAgICAgICB0aGlzLl9hZGRUb0NhY2hlKGNhY2hlS2V5LCBlbGVtZW50KTtcbiAgICAgICAgICAgIHJldHVybiBlbGVtZW50O1xuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoX2Vycikge1xuICAgICAgICAgIC8vIFN0cmF0ZWd5IGZhaWxlZCwgdHJ5IG5leHRcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBJZiBhbGwgc3RyYXRlZ2llcyBmYWlsIGFuZCB3ZSBoYXZlIGEgc2VsZi1oZWFsaW5nIGVuZ2luZSwgZGVsZWdhdGUgdG8gaXRcbiAgICAgIGlmICh3aW5kb3cuX19iaWxnZV9zZWxmSGVhbGluZ0VuZ2luZSAmJiBvcHRpb25zLnVzZVNlbGZIZWFsaW5nICE9PSBmYWxzZSkge1xuICAgICAgICBjb25zdCBpbnRlbnQgPSBvcHRpb25zLmludGVudCB8fCAndHlwZSc7XG4gICAgICAgIGNvbnN0IHRhcmdldCA9IGhpbnQubGFiZWwgfHwgaGludC5uYW1lIHx8IGhpbnQucGxhY2Vob2xkZXIgfHwgaGludC5pZCB8fCAnJztcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IHJlY292ZXJ5ID0gYXdhaXQgd2luZG93Ll9fYmlsZ2Vfc2VsZkhlYWxpbmdFbmdpbmUuYXR0ZW1wdFJlY292ZXJ5KFxuICAgICAgICAgIGludGVudCxcbiAgICAgICAgICB0YXJnZXQsXG4gICAgICAgICAgaGludC5zZWxlY3RvciA/IFtoaW50LnNlbGVjdG9yXSA6IFtdLFxuICAgICAgICAgIHsgaGludHM6IGhpbnQsIHdhaXRUaW1lb3V0OiBvcHRpb25zLndhaXRUaW1lb3V0IHx8IERFRkFVTFRfV0FJVF9USU1FT1VUIH1cbiAgICAgICAgKTtcblxuICAgICAgICBpZiAocmVjb3Zlcnkuc3VjY2VzcyAmJiByZWNvdmVyeS5lbGVtZW50KSB7XG4gICAgICAgICAgdGhpcy5fYWRkVG9DYWNoZShjYWNoZUtleSwgcmVjb3ZlcnkuZWxlbWVudCk7XG4gICAgICAgICAgcmV0dXJuIHJlY292ZXJ5LmVsZW1lbnQ7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRXhhY3Qgc2VsZWN0b3IgbWF0Y2hcbiAgICAgKi9cbiAgICBleGFjdFNlbGVjdG9yKHNlbGVjdG9yKSB7XG4gICAgICBpZiAoIXNlbGVjdG9yKSByZXR1cm4gbnVsbDtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcbiAgICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmluZCBieSBJRFxuICAgICAqL1xuICAgIGJ5SWQoaWQpIHtcbiAgICAgIGlmICghaWQpIHJldHVybiBudWxsO1xuICAgICAgcmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGaW5kIGJ5IG5hbWUgYXR0cmlidXRlXG4gICAgICovXG4gICAgYnlOYW1lKG5hbWUpIHtcbiAgICAgIGlmICghbmFtZSkgcmV0dXJuIG51bGw7XG4gICAgICByZXR1cm4gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW25hbWU9XCIke0NTUy5lc2NhcGUobmFtZSl9XCJdYCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmluZCBieSBhcmlhLWxhYmVsXG4gICAgICovXG4gICAgYnlBcmlhTGFiZWwoYXJpYUxhYmVsKSB7XG4gICAgICBpZiAoIWFyaWFMYWJlbCkgcmV0dXJuIG51bGw7XG4gICAgICByZXR1cm4gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2FyaWEtbGFiZWw9XCIke0NTUy5lc2NhcGUoYXJpYUxhYmVsKX1cIl1gKSB8fFxuICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFthcmlhLWxhYmVsKj1cIiR7Q1NTLmVzY2FwZShhcmlhTGFiZWwpfVwiXWApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZpbmQgYnkgZGF0YS10ZXN0aWRcbiAgICAgKi9cbiAgICBieURhdGFUZXN0SWQoZGF0YVRlc3RJZCkge1xuICAgICAgaWYgKCFkYXRhVGVzdElkKSByZXR1cm4gbnVsbDtcbiAgICAgIHJldHVybiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS10ZXN0aWQ9XCIke0NTUy5lc2NhcGUoZGF0YVRlc3RJZCl9XCJdYCkgfHxcbiAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS10ZXN0LWlkPVwiJHtDU1MuZXNjYXBlKGRhdGFUZXN0SWQpfVwiXWApIHx8XG4gICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtcWE9XCIke0NTUy5lc2NhcGUoZGF0YVRlc3RJZCl9XCJdYCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmluZCBieSBhc3NvY2lhdGVkIGxhYmVsIHRleHRcbiAgICAgKi9cbiAgICBieUxhYmVsQXNzb2NpYXRpb24obGFiZWxUZXh0KSB7XG4gICAgICBpZiAoIWxhYmVsVGV4dCkgcmV0dXJuIG51bGw7XG4gICAgICBjb25zdCBub3JtID0gdGhpcy5fbm9ybWFsaXplVGV4dChsYWJlbFRleHQpO1xuICAgICAgaWYgKCFub3JtKSByZXR1cm4gbnVsbDtcblxuICAgICAgY29uc3QgbGFiZWxzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdsYWJlbCcpKTtcbiAgICAgIGZvciAoY29uc3QgbGFiZWwgb2YgbGFiZWxzKSB7XG4gICAgICAgIGNvbnN0IHRleHQgPSB0aGlzLl9ub3JtYWxpemVUZXh0KGxhYmVsLnRleHRDb250ZW50IHx8ICcnKTtcbiAgICAgICAgaWYgKCF0ZXh0LmluY2x1ZGVzKG5vcm0pICYmICFub3JtLmluY2x1ZGVzKHRleHQpKSBjb250aW51ZTtcblxuICAgICAgICAvLyBDaGVjayBmb3I9IGF0dHJpYnV0ZVxuICAgICAgICBjb25zdCBodG1sRm9yID0gbGFiZWwuZ2V0QXR0cmlidXRlKCdmb3InKTtcbiAgICAgICAgaWYgKGh0bWxGb3IpIHtcbiAgICAgICAgICBjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaHRtbEZvcik7XG4gICAgICAgICAgaWYgKGVsZW1lbnQgJiYgdGhpcy5faXNVc2FibGUoZWxlbWVudCkpIHJldHVybiBlbGVtZW50O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgbmVzdGVkIGlucHV0XG4gICAgICAgIGNvbnN0IG5lc3RlZCA9IGxhYmVsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCB0ZXh0YXJlYSwgc2VsZWN0LCBbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXScpO1xuICAgICAgICBpZiAobmVzdGVkICYmIHRoaXMuX2lzVXNhYmxlKG5lc3RlZCkpIHJldHVybiBuZXN0ZWQ7XG5cbiAgICAgICAgLy8gQ2hlY2sgc2libGluZy9uZWFyYnkgaW5wdXRzXG4gICAgICAgIGNvbnN0IHBhcmVudCA9IGxhYmVsLnBhcmVudEVsZW1lbnQ7XG4gICAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgICBjb25zdCBuZWFyYnkgPSBwYXJlbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QsIFtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdJyk7XG4gICAgICAgICAgaWYgKG5lYXJieSAmJiB0aGlzLl9pc1VzYWJsZShuZWFyYnkpKSByZXR1cm4gbmVhcmJ5O1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZpbmQgYnkgcGxhY2Vob2xkZXJcbiAgICAgKi9cbiAgICBieVBsYWNlaG9sZGVyKHBsYWNlaG9sZGVyKSB7XG4gICAgICBpZiAoIXBsYWNlaG9sZGVyKSByZXR1cm4gbnVsbDtcbiAgICAgIHJldHVybiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbcGxhY2Vob2xkZXI9XCIke0NTUy5lc2NhcGUocGxhY2Vob2xkZXIpfVwiXWApIHx8XG4gICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW3BsYWNlaG9sZGVyKj1cIiR7Q1NTLmVzY2FwZShwbGFjZWhvbGRlcil9XCJdYCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmluZCBieSBhdXRvY29tcGxldGUgYXR0cmlidXRlXG4gICAgICovXG4gICAgYnlBdXRvY29tcGxldGUoYXV0b2NvbXBsZXRlKSB7XG4gICAgICBpZiAoIWF1dG9jb21wbGV0ZSkgcmV0dXJuIG51bGw7XG4gICAgICByZXR1cm4gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2F1dG9jb21wbGV0ZT1cIiR7Q1NTLmVzY2FwZShhdXRvY29tcGxldGUpfVwiXWApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEhldXJpc3RpYyB0b2tlbi1iYXNlZCBtYXRjaGluZyAobGV2ZXJhZ2VzIGV4aXN0aW5nIGltcGxlbWVudGF0aW9uKVxuICAgICAqL1xuICAgIGhldXJpc3RpY01hdGNoKGhpbnQpIHtcbiAgICAgIGlmICh0eXBlb2Ygd2luZG93Ll9fYmlsZ2VGaW5kRWxlbWVudEJ5SGV1cmlzdGljID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHJldHVybiB3aW5kb3cuX19iaWxnZUZpbmRFbGVtZW50QnlIZXVyaXN0aWMoaGludCwgaGludC5zZWxlY3Rvcik7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5fYmFzaWNIZXVyaXN0aWNNYXRjaChoaW50KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBCYXNpYyBoZXVyaXN0aWMgbWF0Y2ggYXMgZmFsbGJhY2tcbiAgICAgKi9cbiAgICBfYmFzaWNIZXVyaXN0aWNNYXRjaChoaW50KSB7XG4gICAgICBjb25zdCB0b2tlbnMgPSBuZXcgU2V0KCk7XG4gICAgICBjb25zdCByYXdIaW50cyA9IFtoaW50LmZpZWxkLCBoaW50Lm5hbWUsIGhpbnQubGFiZWwsIGhpbnQucGxhY2Vob2xkZXIsIGhpbnQuaWRdO1xuICAgICAgXG4gICAgICBmb3IgKGNvbnN0IGggb2YgcmF3SGludHMpIHtcbiAgICAgICAgaWYgKCFoKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgcGFydHMgPSBTdHJpbmcoaClcbiAgICAgICAgICAucmVwbGFjZSgvKFthLXpdKShbQS1aXSkvZywgJyQxICQyJylcbiAgICAgICAgICAudG9Mb3dlckNhc2UoKVxuICAgICAgICAgIC5zcGxpdCgvW15hLXowLTldKy8pXG4gICAgICAgICAgLmZpbHRlcihCb29sZWFuKTtcbiAgICAgICAgcGFydHMuZm9yRWFjaChwID0+IHRva2Vucy5hZGQocCkpO1xuICAgICAgfVxuXG4gICAgICBpZiAodG9rZW5zLnNpemUgPT09IDApIHJldHVybiBudWxsO1xuXG4gICAgICAvLyBFeHBhbmQgc3lub255bXNcbiAgICAgIGlmICh0b2tlbnMuaGFzKCdmaXJzdCcpKSB0b2tlbnMuYWRkKCdnaXZlbicpO1xuICAgICAgaWYgKHRva2Vucy5oYXMoJ2xhc3QnKSkgeyB0b2tlbnMuYWRkKCdmYW1pbHknKTsgdG9rZW5zLmFkZCgnc3VybmFtZScpOyB9XG4gICAgICBpZiAodG9rZW5zLmhhcygncGhvbmUnKSkgdG9rZW5zLmFkZCgndGVsJyk7XG4gICAgICBpZiAodG9rZW5zLmhhcygnbWFpbCcpKSB0b2tlbnMuYWRkKCdlbWFpbCcpO1xuICAgICAgaWYgKHRva2Vucy5oYXMoJ2VtYWlsJykpIHRva2Vucy5hZGQoJ21haWwnKTtcblxuICAgICAgY29uc3QgY2FuZGlkYXRlcyA9IEFycmF5LmZyb20oXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0LCB0ZXh0YXJlYSwgc2VsZWN0LCBbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXSwgW3JvbGU9XCJ0ZXh0Ym94XCJdJylcbiAgICAgICkuZmlsdGVyKGVsID0+IHRoaXMuX2lzVXNhYmxlKGVsKSk7XG5cbiAgICAgIGxldCBiZXN0ID0gbnVsbDtcbiAgICAgIGxldCBiZXN0U2NvcmUgPSAwO1xuXG4gICAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgY2FuZGlkYXRlcykge1xuICAgICAgICBjb25zdCBoYXlzdGFjayA9IHRoaXMuX2VsZW1lbnRTZWFyY2hUZXh0KGVsZW1lbnQpO1xuICAgICAgICBsZXQgc2NvcmUgPSAwO1xuXG4gICAgICAgIGZvciAoY29uc3QgdG9rZW4gb2YgdG9rZW5zKSB7XG4gICAgICAgICAgaWYgKGhheXN0YWNrLmluY2x1ZGVzKHRva2VuKSkge1xuICAgICAgICAgICAgc2NvcmUgKz0gdG9rZW4ubGVuZ3RoID49IDQgPyAyIDogMTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2NvcmUgPiBiZXN0U2NvcmUpIHtcbiAgICAgICAgICBiZXN0U2NvcmUgPSBzY29yZTtcbiAgICAgICAgICBiZXN0ID0gZWxlbWVudDtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gYmVzdFNjb3JlID4gMCA/IGJlc3QgOiBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFByb3hpbWl0eS1iYXNlZCBtYXRjaGluZyAtIGZpbmQgZmllbGRzIG5lYXIgbWF0Y2hpbmcgbGFiZWxzL3RleHRcbiAgICAgKi9cbiAgICBwcm94aW1pdHlNYXRjaChoaW50KSB7XG4gICAgICBjb25zdCBzZWFyY2hUZXh0ID0gaGludC5sYWJlbCB8fCBoaW50LmZpZWxkIHx8IGhpbnQubmFtZTtcbiAgICAgIGlmICghc2VhcmNoVGV4dCkgcmV0dXJuIG51bGw7XG5cbiAgICAgIGNvbnN0IG5vcm0gPSB0aGlzLl9ub3JtYWxpemVUZXh0KHNlYXJjaFRleHQpO1xuICAgICAgY29uc3Qgd2Fsa2VyID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihcbiAgICAgICAgZG9jdW1lbnQuYm9keSxcbiAgICAgICAgTm9kZUZpbHRlci5TSE9XX1RFWFQsXG4gICAgICAgIG51bGxcbiAgICAgICk7XG5cbiAgICAgIGxldCB0ZXh0Tm9kZTtcbiAgICAgIHdoaWxlICgodGV4dE5vZGUgPSB3YWxrZXIubmV4dE5vZGUoKSkpIHtcbiAgICAgICAgY29uc3Qgbm9kZVRleHQgPSB0aGlzLl9ub3JtYWxpemVUZXh0KHRleHROb2RlLnRleHRDb250ZW50IHx8ICcnKTtcbiAgICAgICAgaWYgKCFub2RlVGV4dC5pbmNsdWRlcyhub3JtKSkgY29udGludWU7XG5cbiAgICAgICAgLy8gRm91bmQgbWF0Y2hpbmcgdGV4dCwgbG9vayBmb3IgbmVhcmJ5IGlucHV0c1xuICAgICAgICBjb25zdCBjb250YWluZXIgPSB0ZXh0Tm9kZS5wYXJlbnRFbGVtZW50O1xuICAgICAgICBpZiAoIWNvbnRhaW5lcikgY29udGludWU7XG5cbiAgICAgICAgLy8gQ2hlY2sgc2libGluZ3NcbiAgICAgICAgY29uc3QgaW5wdXQgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QsIFtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdJykgfHxcbiAgICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lci5wYXJlbnRFbGVtZW50Py5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgdGV4dGFyZWEsIHNlbGVjdCwgW2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl0nKTtcbiAgICAgICAgXG4gICAgICAgIGlmIChpbnB1dCAmJiB0aGlzLl9pc1VzYWJsZShpbnB1dCkpIHJldHVybiBpbnB1dDtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGVlcCBzaGFkb3cgRE9NIHNlYXJjaCB3aXRoIHByaW9yaXR5IHNjb3JpbmdcbiAgICAgKi9cbiAgICBkZWVwU2hhZG93U2VhcmNoKGhpbnQpIHtcbiAgICAgIGNvbnN0IHNlbGVjdG9yID0gdGhpcy5fYnVpbGRCZXN0U2VsZWN0b3IoaGludCk7XG4gICAgICBpZiAoIXNlbGVjdG9yKSByZXR1cm4gbnVsbDtcblxuICAgICAgcmV0dXJuIHRoaXMucXVlcnlTZWxlY3RvckRlZXBBbGwoc2VsZWN0b3IpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNlYXJjaCBhY3Jvc3MgZnJhbWVzXG4gICAgICovXG4gICAgZnJhbWVTZWFyY2goaGludCkge1xuICAgICAgY29uc3Qgc2VsZWN0b3IgPSB0aGlzLl9idWlsZEJlc3RTZWxlY3RvcihoaW50KTtcbiAgICAgIGlmICghc2VsZWN0b3IpIHJldHVybiBudWxsO1xuXG4gICAgICBjb25zdCBmcmFtZXMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lmcmFtZSwgZnJhbWUnKSk7XG4gICAgICBmb3IgKGNvbnN0IGZyYW1lIG9mIGZyYW1lcykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGlmIChmcmFtZS5jb250ZW50RG9jdW1lbnQpIHtcbiAgICAgICAgICAgIGNvbnN0IGVsZW1lbnQgPSBmcmFtZS5jb250ZW50RG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgICAgICAgICBpZiAoZWxlbWVudCAmJiB0aGlzLl9pc1VzYWJsZShlbGVtZW50KSkgcmV0dXJuIGVsZW1lbnQ7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChfZXJyKSB7XG4gICAgICAgICAgLy8gQ3Jvc3Mtb3JpZ2luIGZyYW1lXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW5oYW5jZWQgZGVlcCB0cmF2ZXJzYWwgd2l0aCBwcmlvcml0eSBzY29yaW5nXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHNlbGVjdG9yIC0gQ1NTIHNlbGVjdG9yXG4gICAgICogQHBhcmFtIHtFbGVtZW50fERvY3VtZW50fSByb290IC0gU3RhcnRpbmcgcm9vdFxuICAgICAqIEByZXR1cm5zIHtFbGVtZW50fG51bGx9XG4gICAgICovXG4gICAgcXVlcnlTZWxlY3RvckRlZXBBbGwoc2VsZWN0b3IsIHJvb3QgPSBkb2N1bWVudCkge1xuICAgICAgY29uc3QgcmVzdWx0cyA9IFtdO1xuICAgICAgY29uc3QgcXVldWUgPSBbeyByb290LCBkZXB0aDogMCwgcHJpb3JpdHk6IEZSQU1FX1BSSU9SSVRZLmRvY3VtZW50IH1dO1xuICAgICAgY29uc3Qgc2VlbiA9IG5ldyBXZWFrU2V0KCk7XG5cbiAgICAgIHdoaWxlIChxdWV1ZS5sZW5ndGggPiAwICYmIHJlc3VsdHMubGVuZ3RoIDwgMTApIHtcbiAgICAgICAgY29uc3QgeyByb290OiBjdXJyZW50Um9vdCwgZGVwdGgsIHByaW9yaXR5IH0gPSBxdWV1ZS5zaGlmdCgpO1xuICAgICAgICBpZiAoZGVwdGggPiBNQVhfREVQVEggfHwgIWN1cnJlbnRSb290IHx8IHNlZW4uaGFzKGN1cnJlbnRSb290KSkgY29udGludWU7XG4gICAgICAgIHNlZW4uYWRkKGN1cnJlbnRSb290KTtcblxuICAgICAgICAvLyBRdWVyeSBpbiBjdXJyZW50IHJvb3RcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBtYXRjaGVzID0gY3VycmVudFJvb3QucXVlcnlTZWxlY3RvckFsbChzZWxlY3Rvcik7XG4gICAgICAgICAgZm9yIChjb25zdCBlbCBvZiBtYXRjaGVzKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5faXNVc2FibGUoZWwpKSB7XG4gICAgICAgICAgICAgIHJlc3VsdHMucHVzaCh7IGVsZW1lbnQ6IGVsLCBwcmlvcml0eSwgZGVwdGggfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChfZXJyKSB7XG4gICAgICAgICAgLy8gSW52YWxpZCBzZWxlY3RvclxuICAgICAgICB9XG5cbiAgICAgICAgLy8gRW5xdWV1ZSBzaGFkb3cgcm9vdHMgYW5kIGZyYW1lc1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHdhbGtlciA9IGRvY3VtZW50LmNyZWF0ZVRyZWVXYWxrZXIoY3VycmVudFJvb3QsIE5vZGVGaWx0ZXIuU0hPV19FTEVNRU5UKTtcbiAgICAgICAgICBmb3IgKGxldCBub2RlID0gd2Fsa2VyLmN1cnJlbnROb2RlOyBub2RlOyBub2RlID0gd2Fsa2VyLm5leHROb2RlKCkpIHtcbiAgICAgICAgICAgIGlmIChub2RlLnNoYWRvd1Jvb3QpIHtcbiAgICAgICAgICAgICAgcXVldWUucHVzaCh7XG4gICAgICAgICAgICAgICAgcm9vdDogbm9kZS5zaGFkb3dSb290LFxuICAgICAgICAgICAgICAgIGRlcHRoOiBkZXB0aCArIDEsXG4gICAgICAgICAgICAgICAgcHJpb3JpdHk6IEZSQU1FX1BSSU9SSVRZLnNoYWRvd1Jvb3RcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IHRhZyA9IFN0cmluZyhub2RlPy50YWdOYW1lIHx8ICcnKS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgaWYgKHRhZyA9PT0gJ0lGUkFNRScgfHwgdGFnID09PSAnRlJBTUUnKSB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgaWYgKG5vZGUuY29udGVudERvY3VtZW50KSB7XG4gICAgICAgICAgICAgICAgICBxdWV1ZS5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgcm9vdDogbm9kZS5jb250ZW50RG9jdW1lbnQsXG4gICAgICAgICAgICAgICAgICAgIGRlcHRoOiBkZXB0aCArIDEsXG4gICAgICAgICAgICAgICAgICAgIHByaW9yaXR5OiBGUkFNRV9QUklPUklUWS5zYW1lT3JpZ2luSWZyYW1lXG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgICAgICAgICAgICAvLyBDcm9zcy1vcmlnaW4gZnJhbWVcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoX2Vycikge31cbiAgICAgIH1cblxuICAgICAgLy8gUmV0dXJuIGhpZ2hlc3QgcHJpb3JpdHkgbWF0Y2hcbiAgICAgIHJlc3VsdHMuc29ydCgoYSwgYikgPT4gYi5wcmlvcml0eSAtIGEucHJpb3JpdHkgfHwgYS5kZXB0aCAtIGIuZGVwdGgpO1xuICAgICAgcmV0dXJuIHJlc3VsdHNbMF0/LmVsZW1lbnQgfHwgbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBXYWl0IGZvciBlbGVtZW50IHRvIGFwcGVhciAoTXV0YXRpb25PYnNlcnZlciBiYXNlZClcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gc2VsZWN0b3IgLSBDU1Mgc2VsZWN0b3IgdG8gd2FpdCBmb3JcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gdGltZW91dCAtIE1heCB3YWl0IHRpbWUgaW4gbXNcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxFbGVtZW50fG51bGw+fVxuICAgICAqL1xuICAgIGFzeW5jIHdhaXRGb3JFbGVtZW50KHNlbGVjdG9yLCB0aW1lb3V0ID0gREVGQVVMVF9XQUlUX1RJTUVPVVQpIHtcbiAgICAgIC8vIENoZWNrIGlmIGFscmVhZHkgZXhpc3RzXG4gICAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuZXhhY3RTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgICBpZiAoZXhpc3RpbmcgJiYgdGhpcy5faXNVc2FibGUoZXhpc3RpbmcpKSByZXR1cm4gZXhpc3Rpbmc7XG5cbiAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICBsZXQgcmVzb2x2ZWQgPSBmYWxzZTtcblxuICAgICAgICBjb25zdCBvYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHtcbiAgICAgICAgICBpZiAocmVzb2x2ZWQpIHJldHVybjtcbiAgICAgICAgICBjb25zdCBmb3VuZCA9IHRoaXMuZXhhY3RTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgICAgICAgaWYgKGZvdW5kICYmIHRoaXMuX2lzVXNhYmxlKGZvdW5kKSkge1xuICAgICAgICAgICAgcmVzb2x2ZWQgPSB0cnVlO1xuICAgICAgICAgICAgb2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgcmVzb2x2ZShmb3VuZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBvYnNlcnZlci5vYnNlcnZlKGRvY3VtZW50LmJvZHkgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LCB7XG4gICAgICAgICAgY2hpbGRMaXN0OiB0cnVlLFxuICAgICAgICAgIHN1YnRyZWU6IHRydWUsXG4gICAgICAgICAgYXR0cmlidXRlczogdHJ1ZSxcbiAgICAgICAgICBhdHRyaWJ1dGVGaWx0ZXI6IFsnaWQnLCAnbmFtZScsICdjbGFzcycsICdzdHlsZScsICdoaWRkZW4nLCAnZGlzYWJsZWQnXVxuICAgICAgICB9KTtcblxuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICBpZiAoIXJlc29sdmVkKSB7XG4gICAgICAgICAgICByZXNvbHZlZCA9IHRydWU7XG4gICAgICAgICAgICBvYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICByZXNvbHZlKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgdGltZW91dCk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBXYWl0IGZvciBhbnkgb2YgbXVsdGlwbGUgc2VsZWN0b3JzXG4gICAgICogQHBhcmFtIHtzdHJpbmdbXX0gc2VsZWN0b3JzIC0gQXJyYXkgb2Ygc2VsZWN0b3JzIHRvIHdhaXQgZm9yXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHRpbWVvdXQgLSBNYXggd2FpdCB0aW1lXG4gICAgICogQHJldHVybnMge1Byb21pc2U8e2VsZW1lbnQ6IEVsZW1lbnR8bnVsbCwgc2VsZWN0b3I6IHN0cmluZ3xudWxsfT59XG4gICAgICovXG4gICAgYXN5bmMgd2FpdEZvckFueUVsZW1lbnQoc2VsZWN0b3JzLCB0aW1lb3V0ID0gREVGQVVMVF9XQUlUX1RJTUVPVVQpIHtcbiAgICAgIC8vIENoZWNrIGlmIGFueSBhbHJlYWR5IGV4aXN0c1xuICAgICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmV4YWN0U2VsZWN0b3Ioc2VsZWN0b3IpO1xuICAgICAgICBpZiAoZXhpc3RpbmcgJiYgdGhpcy5faXNVc2FibGUoZXhpc3RpbmcpKSB7XG4gICAgICAgICAgcmV0dXJuIHsgZWxlbWVudDogZXhpc3RpbmcsIHNlbGVjdG9yIH07XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgIGxldCByZXNvbHZlZCA9IGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IGNoZWNrQWxsID0gKCkgPT4ge1xuICAgICAgICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBjb25zdCBmb3VuZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuICAgICAgICAgICAgICBpZiAoZm91bmQgJiYgdGhpcy5faXNVc2FibGUoZm91bmQpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgZWxlbWVudDogZm91bmQsIHNlbGVjdG9yIH07XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKF9lcnIpIHt9XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xuICAgICAgICAgIGlmIChyZXNvbHZlZCkgcmV0dXJuO1xuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGNoZWNrQWxsKCk7XG4gICAgICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAgICAgcmVzb2x2ZWQgPSB0cnVlO1xuICAgICAgICAgICAgb2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgb2JzZXJ2ZXIub2JzZXJ2ZShkb2N1bWVudC5ib2R5IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCwge1xuICAgICAgICAgIGNoaWxkTGlzdDogdHJ1ZSxcbiAgICAgICAgICBzdWJ0cmVlOiB0cnVlLFxuICAgICAgICAgIGF0dHJpYnV0ZXM6IHRydWVcbiAgICAgICAgfSk7XG5cbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgaWYgKCFyZXNvbHZlZCkge1xuICAgICAgICAgICAgcmVzb2x2ZWQgPSB0cnVlO1xuICAgICAgICAgICAgb2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgcmVzb2x2ZSh7IGVsZW1lbnQ6IG51bGwsIHNlbGVjdG9yOiBudWxsIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgdGltZW91dCk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyA9PT0gSGVscGVyIG1ldGhvZHMgPT09XG5cbiAgICBfaXNVc2FibGUoZWxlbWVudCkge1xuICAgICAgaWYgKCEoZWxlbWVudCBpbnN0YW5jZW9mIEVsZW1lbnQpKSByZXR1cm4gZmFsc2U7XG4gICAgICBjb25zdCBkaXNhYmxlZCA9IGVsZW1lbnQuaGFzQXR0cmlidXRlKCdkaXNhYmxlZCcpIHx8IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJykgPT09ICd0cnVlJztcbiAgICAgIGlmIChkaXNhYmxlZCkgcmV0dXJuIGZhbHNlO1xuXG4gICAgICBjb25zdCByZWN0ID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGNvbnN0IHN0eWxlID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWxlbWVudCk7XG4gICAgICBpZiAoc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnIHx8IHN0eWxlLnZpc2liaWxpdHkgPT09ICdoaWRkZW4nKSByZXR1cm4gZmFsc2U7XG4gICAgICBpZiAocmVjdC53aWR0aCA8IDIgfHwgcmVjdC5oZWlnaHQgPCAyKSByZXR1cm4gZmFsc2U7XG5cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIF9ub3JtYWxpemVUZXh0KHRleHQpIHtcbiAgICAgIHJldHVybiBTdHJpbmcodGV4dCB8fCAnJykudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9bXmEtejAtOV0rL2csICcnKTtcbiAgICB9XG5cbiAgICBfZWxlbWVudFNlYXJjaFRleHQoZWxlbWVudCkge1xuICAgICAgY29uc3QgYXR0cktleXMgPSBbJ25hbWUnLCAnaWQnLCAncGxhY2Vob2xkZXInLCAnYXJpYS1sYWJlbCcsICdhdXRvY29tcGxldGUnLCAnZGF0YS10ZXN0aWQnLCAndGl0bGUnXTtcbiAgICAgIGNvbnN0IHZhbHVlcyA9IFtlbGVtZW50LnRhZ05hbWUudG9Mb3dlckNhc2UoKV07XG4gICAgICBcbiAgICAgIGZvciAoY29uc3Qga2V5IG9mIGF0dHJLZXlzKSB7XG4gICAgICAgIGNvbnN0IHYgPSBlbGVtZW50LmdldEF0dHJpYnV0ZT8uKGtleSk7XG4gICAgICAgIGlmICh2KSB2YWx1ZXMucHVzaCh2KTtcbiAgICAgIH1cblxuICAgICAgLy8gR2V0IGxhYmVsIHRleHRcbiAgICAgIGNvbnN0IGlkID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2lkJyk7XG4gICAgICBpZiAoaWQpIHtcbiAgICAgICAgY29uc3QgbGFiZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBsYWJlbFtmb3I9XCIke0NTUy5lc2NhcGUoaWQpfVwiXWApO1xuICAgICAgICBpZiAobGFiZWw/LnRleHRDb250ZW50KSB2YWx1ZXMucHVzaChsYWJlbC50ZXh0Q29udGVudCk7XG4gICAgICB9XG4gICAgICBjb25zdCBjbG9zZXN0TGFiZWwgPSBlbGVtZW50LmNsb3Nlc3QoJ2xhYmVsJyk7XG4gICAgICBpZiAoY2xvc2VzdExhYmVsPy50ZXh0Q29udGVudCkgdmFsdWVzLnB1c2goY2xvc2VzdExhYmVsLnRleHRDb250ZW50KTtcblxuICAgICAgcmV0dXJuIHRoaXMuX25vcm1hbGl6ZVRleHQodmFsdWVzLmpvaW4oJyAnKSk7XG4gICAgfVxuXG4gICAgX2J1aWxkQmVzdFNlbGVjdG9yKGhpbnQpIHtcbiAgICAgIGlmIChoaW50LnNlbGVjdG9yKSByZXR1cm4gaGludC5zZWxlY3RvcjtcbiAgICAgIGlmIChoaW50LmlkKSByZXR1cm4gYCMke0NTUy5lc2NhcGUoaGludC5pZCl9YDtcbiAgICAgIGlmIChoaW50Lm5hbWUpIHJldHVybiBgW25hbWU9XCIke0NTUy5lc2NhcGUoaGludC5uYW1lKX1cIl1gO1xuICAgICAgaWYgKGhpbnQuYXJpYUxhYmVsKSByZXR1cm4gYFthcmlhLWxhYmVsPVwiJHtDU1MuZXNjYXBlKGhpbnQuYXJpYUxhYmVsKX1cIl1gO1xuICAgICAgaWYgKGhpbnQuZGF0YVRlc3RJZCkgcmV0dXJuIGBbZGF0YS10ZXN0aWQ9XCIke0NTUy5lc2NhcGUoaGludC5kYXRhVGVzdElkKX1cIl1gO1xuICAgICAgaWYgKGhpbnQucGxhY2Vob2xkZXIpIHJldHVybiBgW3BsYWNlaG9sZGVyKj1cIiR7Q1NTLmVzY2FwZShoaW50LnBsYWNlaG9sZGVyKX1cIl1gO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgX2J1aWxkQ2FjaGVLZXkoaGludCkge1xuICAgICAgY29uc3QgcGFydHMgPSBbXG4gICAgICAgIGhpbnQuc2VsZWN0b3IsXG4gICAgICAgIGhpbnQuaWQsXG4gICAgICAgIGhpbnQubmFtZSxcbiAgICAgICAgaGludC5hcmlhTGFiZWwsXG4gICAgICAgIGhpbnQubGFiZWwsXG4gICAgICAgIGhpbnQucGxhY2Vob2xkZXJcbiAgICAgIF0uZmlsdGVyKEJvb2xlYW4pO1xuICAgICAgcmV0dXJuIHBhcnRzLmpvaW4oJ3wnKS5zbGljZSgwLCAyMDApO1xuICAgIH1cblxuICAgIF9nZXRGcm9tQ2FjaGUoa2V5KSB7XG4gICAgICBjb25zdCBlbnRyeSA9IHRoaXMuY2FjaGUuZ2V0KGtleSk7XG4gICAgICBpZiAoIWVudHJ5KSByZXR1cm4gbnVsbDtcbiAgICAgIGlmIChEYXRlLm5vdygpIC0gZW50cnkudGltZXN0YW1wID4gdGhpcy5jYWNoZVRUTCkge1xuICAgICAgICB0aGlzLmNhY2hlLmRlbGV0ZShrZXkpO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBlbnRyeS5lbGVtZW50O1xuICAgIH1cblxuICAgIF9hZGRUb0NhY2hlKGtleSwgZWxlbWVudCkge1xuICAgICAgaWYgKHRoaXMuY2FjaGUuc2l6ZSA+PSB0aGlzLmNhY2hlTWF4U2l6ZSkge1xuICAgICAgICAvLyBSZW1vdmUgb2xkZXN0IGVudHJ5XG4gICAgICAgIGNvbnN0IGZpcnN0S2V5ID0gdGhpcy5jYWNoZS5rZXlzKCkubmV4dCgpLnZhbHVlO1xuICAgICAgICB0aGlzLmNhY2hlLmRlbGV0ZShmaXJzdEtleSk7XG4gICAgICB9XG4gICAgICB0aGlzLmNhY2hlLnNldChrZXksIHsgZWxlbWVudCwgdGltZXN0YW1wOiBEYXRlLm5vdygpIH0pO1xuICAgIH1cblxuICAgIGNsZWFyQ2FjaGUoKSB7XG4gICAgICB0aGlzLmNhY2hlLmNsZWFyKCk7XG4gICAgfVxuICB9XG5cbiAgLy8gQ3JlYXRlIGdsb2JhbCBpbnN0YW5jZVxuICB3aW5kb3cuX19iaWxnZV9maWVsZFJlc29sdmVyID0gbmV3IEZpZWxkUmVzb2x2ZXIoKTtcblxuICBjb25zb2xlLmxvZygnW0JpbGdlXSBGaWVsZFJlc29sdmVyIGluaXRpYWxpemVkJyk7XG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7OztDQUdDLFdBQVc7QUFDVjtBQUVBLE1BQUksT0FBTyxzQkFBdUI7QUFFbEMsUUFBTSxZQUFZO0FBQ2xCLFFBQU0sdUJBQXVCO0FBRzdCLFFBQU0saUJBQWlCO0FBQUEsSUFDckIsVUFBVTtBQUFBLElBQ1Ysa0JBQWtCO0FBQUEsSUFDbEIsWUFBWTtBQUFBLElBQ1osbUJBQW1CO0FBQUE7QUFBQSxFQUNyQjtBQUFBLEVBS0EsTUFBTSxjQUFjO0FBQUEsSUF0QnRCLE9Bc0JzQjtBQUFBO0FBQUE7QUFBQSxJQUNsQixjQUFjO0FBQ1osV0FBSyxRQUFRLG9CQUFJLElBQUk7QUFDckIsV0FBSyxlQUFlO0FBQ3BCLFdBQUssV0FBVztBQUFBLElBQ2xCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFRQSxNQUFNLFFBQVEsTUFBTSxVQUFVLENBQUMsR0FBRztBQUNoQyxVQUFJLENBQUMsS0FBTSxRQUFPO0FBRWxCLFlBQU0sV0FBVyxLQUFLLGVBQWUsSUFBSTtBQUN6QyxZQUFNLFNBQVMsS0FBSyxjQUFjLFFBQVE7QUFDMUMsVUFBSSxVQUFVLEtBQUssVUFBVSxNQUFNLEVBQUcsUUFBTztBQUU3QyxZQUFNLGFBQWE7QUFBQSxRQUNqQixNQUFNLEtBQUssY0FBYyxLQUFLLFFBQVE7QUFBQSxRQUN0QyxNQUFNLEtBQUssS0FBSyxLQUFLLEVBQUU7QUFBQSxRQUN2QixNQUFNLEtBQUssT0FBTyxLQUFLLElBQUk7QUFBQSxRQUMzQixNQUFNLEtBQUssWUFBWSxLQUFLLFNBQVM7QUFBQSxRQUNyQyxNQUFN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
