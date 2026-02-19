var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/formStatePersistence.js
(function() {
  "use strict";
  if (window.__bilge_formStatePersistence) return;
  const STORAGE_KEY = "__bilge_form_state_v1";
  const MAX_STATES = 50;
  const TTL_MS = 24 * 60 * 60 * 1e3;
  const DEBOUNCE_MS = 1e3;
  class FormStatePersistence {
    static {
      __name(this, "FormStatePersistence");
    }
    constructor() {
      this.saveTimeout = null;
      this.autoSaveEnabled = false;
      this.lastSaveTime = 0;
    }
    /**
     * Capture current form state
     * @param {Element} scope - Root element to capture (default: document)
     * @returns {Object} Captured form state
     */
    captureFormState(scope = document) {
      const state = {
        url: location.href,
        urlPattern: this._normalizeUrl(location.href),
        title: document.title,
        timestamp: Date.now(),
        fields: []
      };
      const inputs = scope.querySelectorAll('input, textarea, select, [contenteditable="true"]');
      for (const element of inputs) {
        if (!this._shouldCapture(element)) continue;
        const field = {
          fingerprint: this._generateFingerprint(element),
          selector: this._generateSelector(element),
          value: this._extractValue(element),
          type: element.type || element.tagName.toLowerCase(),
          name: element.name || "",
          id: element.id || "",
          placeholder: element.placeholder || "",
          autocomplete: element.autocomplete || "",
          checked: element.type === "checkbox" || element.type === "radio" ? element.checked : void 0
        };
        if (field.value || field.checked !== void 0) {
          state.fields.push(field);
        }
      }
      return state;
    }
    /**
     * Generate unique fingerprint for field matching
     * @param {Element} element - Form element
     * @returns {string} Fingerprint string
     */
    _generateFingerprint(element) {
      const parts = [
        element.id,
        element.name,
        element.getAttribute("aria-label"),
        element.placeholder,
        element.getAttribute("data-testid"),
        element.autocomplete,
        this._getFieldLabel(element),
        element.type || element.tagName.toLowerCase()
      ].filter(Boolean);
      return parts.join("|").slice(0, 200);
    }
    /**
     * Generate CSS selector for element
     * @param {Element} element - Form element
     * @returns {string} CSS selector
     */
    _generateSelector(element) {
      if (element.id) {
        return `#${CSS.escape(element.id)}`;
      }
      if (element.name) {
        const tag = element.tagName.toLowerCase();
        return `${tag}[name="${CSS.escape(element.name)}"]`;
      }
      const parent = element.parentElement;
      if (parent) {
        const tag = element.tagName.toLowerCase();
        const siblings = Array.from(parent.querySelectorAll(tag));
        const index = siblings.indexOf(element);
        if (index >= 0) {
          return `${tag}:nth-of-type(${index + 1})`;
        }
      }
      return "";
    }
    /**
     * Extract value from form element
     * @param {Element} element - Form element
     * @returns {string} Element value
     */
    _extractValue(element) {
      if (element.isContentEditable) {
        return String(element.textContent || "").trim();
      }
      if (element.tagName.toLowerCase() === "select") {
        return element.value;
      }
      if (element.type === "checkbox" || element.type === "radio") {
        return element.value;
      }
      return String(element.value || "").trim();
    }
    /**
     * Determine if element should be captured
     * @param {Element} element - Form element
     * @returns {boolean} Should capture
     */
    _shouldCapture(element) {
      const type = element.type || "";
      if (["hidden", "submit", "button", "image", "file", "reset", "password"].includes(type)) {
        return false;
      }
      if (element.disabled || element.getAttribute("aria-disabled") === "true") {
        return false;
      }
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
      if (rect.width < 2 || rect.height < 2) {
        return false;
      }
      if (this._isSensitiveField(element)) {
        return false;
      }
      return true;
    }
    /**
     * Check if field is sensitive (SSN, password, etc.)
     * @param {Element} element - Form element
     * @returns {boolean} Is sensitive
     */
    _isSensitiveField(element) {
      const hints = [
        element.name,
        element.id,
        element.autocomplete,
        element.placeholder,
        element.getAttribute("aria-label")
      ].join(" ").toLowerCase();
      const sensitivePatterns = /password|passwd|pwd|ssn|social[_\s-]?security|credit[_\s-]?card|cvv|cvc|pin|secret|token/i;
      return sensitivePatterns.test(hints);
    }
    /**
     * Restore form state after reload
     * @param {Object} savedState - Previously saved state
     * @param {Object} healingEngine - Self-healing engine instance (optional)
     * @returns {Promise<Object>} Restoration results
     */
    async restoreFormState(savedState, healingEngine = null) {
      const results = {
        restored: 0,
        failed: 0,
        skipped: 0,
        details: []
      };
      if (!savedState?.fields || !Array.isArray(savedState.fields)) {
        return results;
      }
      for (const field of savedState.fields) {
        try {
          let element = null;
          if (field.selector) {
            try {
              element = document.querySelector(field.selector);
            } catch (_err) {
            }
          }
          if (!element && healingEngine) {
            const recovery = await healingEngine.attemptRecovery(
              "restore",
              field.fingerprint,
              field.selector ? [field.selector] : [],
              {
                hints: {
                  id: field.id,
                  name: field.name,
                  placeholder: field.placeholder,
                  autocomplete: field.autocomplete
                }
              }
            );
            if (recovery.success && recovery.element) {
              element = recovery.element;
            }
          }
          if (!element) {
            element = this._findByFingerprint(field);
          }
          if (element && this._shouldRestore(element, field)) {
            this._fillField(element, field);
            results.restored += 1;
            results.details.push({
              status: "restored",
              field: field.name || field.id || "unknown",
              matchedBy: element === document.querySelector(field.selector) ? "selector" : "fingerprint"
            });
          } else if (element) {
            results.skipped += 1;
            results.details.push({
              status: "skipped",
              field: field.name || field.id || "unknown",
              reason: "field has existing value"
            });
          } else {
            results.failed += 1;
            results.details.push({
              status: "failed",
              field: field.name || field.id || "unknown",
              reason: "element not found"
            });
          }
        } catch (err) {
          results.failed += 1;
          results.details.push({
            status: "failed",
            field: field.name || field.id || "unknown",
            reason: err.message
          });
        }
      }
      return results;
    }
    /**
     * Find element by fingerprint matching
     * @param {Object} field - Field descriptor
     * @returns {Element|null} Matched element
     */
    _findByFingerprint(field) {
      const candidates = document.querySelectorAll('input, textarea, select, [contenteditable="true"]');
      for (const element of candidates) {
        const fingerprint = this._generateFingerprint(element);
        if (fingerprint === field.fingerprint) {
          return element;
        }
        const fieldParts = field.fingerprint.split("|").filter(Boolean);
        const elemParts = fingerprint.split("|").filter(Boolean);
        let matchCount = 0;
        for (const part of fieldParts) {
          if (part && elemParts.includes(part)) {
            matchCount += 1;
          }
        }
        if (matchCount >= 2 && matchCount >= fieldParts.length * 0.5) {
          return element;
        }
      }
      return null;
    }
    /**
     * Check if field should be restored
     * @param {Element} element - Form element
     * @param {Object} field - Saved field data
     * @returns {boolean} Should restore
     */
    _shouldRestore(element, field) {
      const currentValue = this._extractValue(element);
      if (currentValue && currentValue !== field.value) {
        return false;
      }
      if (element.disabled) {
        return false;
      }
      return true;
    }
    /**
     * Fill field with saved value
     * @param {Element} element - Form element
     * @param {Object} field - Saved field data
     */
    _fillField(element, field) {
      if (element.isContentEditable) {
        element.textContent = field.value;
      } else if (element.type === "checkbox" || element.type === "radio") {
        element.checked = field.checked ?? false;
      } else {
        element.value = field.value;
      }
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
    /**
     * Save current form state to storage
     */
    async saveCurrentState() {
      const state = this.captureFormState();
      if (state.fields.length === 0) return;
      try {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        let states = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
        states = states.filter((s) => s.urlPattern !== state.urlPattern);
        states.push(state);
        const now = Date.now();
        states = states.filter((s) => now - s.timestamp < TTL_MS).slice(-MAX_STATES);
        await chrome.storage.local.set({ [STORAGE_KEY]: states });
        this.lastSaveTime = now;
      } catch (err) {
        console.error("[FormStatePersistence] Save failed:", err.message);
      }
    }
    /**
     * Load matching state for current URL
     * @returns {Promise<Object|null>} Matching state or null
     */
    async loadMatchingState() {
      try {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        const states = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
        const currentPattern = this._normalizeUrl(location.href);
        const now = Date.now();
        const matching = states.filter((s) => s.urlPattern === currentPattern && now - s.timestamp < TTL_MS).sort((a, b) => b.timestamp - a.timestamp);
        return matching[0] || null;
      } catch (err) {
        console.error("[FormStatePersistence] Load failed:", err.message);
        return null;
      }
    }
    /**
     * Save state to storage (public method)
     * @param {Object} state - State to save
     */
    async saveToStorage(state) {
      if (!state?.fields?.length) return;
      try {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        let states = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
        states = states.filter((s) => s.urlPattern !== state.urlPattern);
        states.push(state);
        const now = Date.now();
        states = states.filter((s) => now - s.timestamp < TTL_MS).slice(-MAX_STATES);
        await chrome.storage.local.set({ [STORAGE_KEY]: states });
      } catch (err) {
        console.error("[FormStatePersistence] Save to storage failed:", err.message);
      }
    }
    /**
     * Setup auto-save on form changes
     */
    setupAutoSave() {
      if (this.autoSaveEnabled) return;
      this.autoSaveEnabled = true;
      const debouncedSave = /* @__PURE__ */ __name(() => {
        if (this.saveTimeout) {
          clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => {
          this.saveCurrentState();
        }, DEBOUNCE_MS);
      }, "debouncedSave");
      document.addEventListener("input", debouncedSave, { passive: true });
      document.addEventListener("change", debouncedSave, { passive: true });
      window.addEventListener("beforeunload", () => {
        if (this.saveTimeout) {
          clearTimeout(this.saveTimeout);
        }
        this.saveCurrentState();
      });
      window.addEventListener("pagehide", () => {
        if (this.saveTimeout) {
          clearTimeout(this.saveTimeout);
        }
        this.saveCurrentState();
      });
    }
    /**
     * Setup auto-restore on page load
     */
    async setupAutoRestore() {
      const state = await this.loadMatchingState();
      if (state) {
        const healingEngine = window.__bilge_selfHealingEngine || null;
        return this.restoreFormState(state, healingEngine);
      }
      return { restored: 0, failed: 0, skipped: 0 };
    }
    /**
     * Clear all saved states
     */
    async clearAllStates() {
      try {
        await chrome.storage.local.remove(STORAGE_KEY);
        return { cleared: true };
      } catch (err) {
        return { cleared: false, error: err.message };
      }
    }
    /**
     * Get saved states summary
     */
    async getStatesSummary() {
      try {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        const states = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
        return {
          count: states.length,
          urls: states.map((s) => s.urlPattern),
          oldest: states.length > 0 ? new Date(Math.min(...states.map((s) => s.timestamp))).toISOString() : null,
          newest: states.length > 0 ? new Date(Math.max(...states.map((s) => s.timestamp))).toISOString() : null
        };
      } catch (err) {
        return { count: 0, error: err.message };
      }
    }
    // === Helper methods ===
    _normalizeUrl(url) {
      try {
        const parsed = new URL(url);
        const searchParams = new URLSearchParams(parsed.search);
        const paramsToRemove = ["utm_source", "utm_medium", "utm_campaign", "fbclid", "gclid", "ref", "source"];
        paramsToRemove.forEach((p) => searchParams.delete(p));
        return `${parsed.hostname}${parsed.pathname}${searchParams.toString() ? "?" + searchParams.toString() : ""}`;
      } catch (_err) {
        return url;
      }
    }
    _getFieldLabel(element) {
      const id = element.id;
      if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label?.textContent) return label.textContent.trim().slice(0, 100);
      }
      const closestLabel = element.closest("label");
      if (closestLabel?.textContent) return closestLabel.textContent.trim().slice(0, 100);
      return "";
    }
  }
  window.__bilge_formStatePersistence = new FormStatePersistence();
  console.log("[Bilge] FormStatePersistence initialized");
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL2Zvcm1TdGF0ZVBlcnNpc3RlbmNlLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBmb3JtU3RhdGVQZXJzaXN0ZW5jZS5qcyAtIEZvcm0gc3RhdGUgc2F2ZS9yZXN0b3JlIGZvciByZWNvdmVyeSBhZnRlciBwYWdlIHJlbG9hZHNcbi8vIENhcHR1cmVzIGZvcm0gc3RhdGUgd2l0aCBmaW5nZXJwcmludGluZyBhbmQgcmVzdG9yZXMgdmFsdWVzIHVzaW5nIHNlbGYtaGVhbGluZ1xuXG4oZnVuY3Rpb24oKSB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBpZiAod2luZG93Ll9fYmlsZ2VfZm9ybVN0YXRlUGVyc2lzdGVuY2UpIHJldHVybjtcblxuICBjb25zdCBTVE9SQUdFX0tFWSA9ICdfX2JpbGdlX2Zvcm1fc3RhdGVfdjEnO1xuICBjb25zdCBNQVhfU1RBVEVTID0gNTA7XG4gIGNvbnN0IFRUTF9NUyA9IDI0ICogNjAgKiA2MCAqIDEwMDA7IC8vIDI0IGhvdXJzXG4gIGNvbnN0IERFQk9VTkNFX01TID0gMTAwMDtcblxuICAvKipcbiAgICogRm9ybVN0YXRlUGVyc2lzdGVuY2UgLSBTYXZlIGFuZCByZXN0b3JlIGZvcm0gc3RhdGUgYWNyb3NzIHBhZ2UgcmVsb2Fkc1xuICAgKi9cbiAgY2xhc3MgRm9ybVN0YXRlUGVyc2lzdGVuY2Uge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgdGhpcy5zYXZlVGltZW91dCA9IG51bGw7XG4gICAgICB0aGlzLmF1dG9TYXZlRW5hYmxlZCA9IGZhbHNlO1xuICAgICAgdGhpcy5sYXN0U2F2ZVRpbWUgPSAwO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENhcHR1cmUgY3VycmVudCBmb3JtIHN0YXRlXG4gICAgICogQHBhcmFtIHtFbGVtZW50fSBzY29wZSAtIFJvb3QgZWxlbWVudCB0byBjYXB0dXJlIChkZWZhdWx0OiBkb2N1bWVudClcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSBDYXB0dXJlZCBmb3JtIHN0YXRlXG4gICAgICovXG4gICAgY2FwdHVyZUZvcm1TdGF0ZShzY29wZSA9IGRvY3VtZW50KSB7XG4gICAgICBjb25zdCBzdGF0ZSA9IHtcbiAgICAgICAgdXJsOiBsb2NhdGlvbi5ocmVmLFxuICAgICAgICB1cmxQYXR0ZXJuOiB0aGlzLl9ub3JtYWxpemVVcmwobG9jYXRpb24uaHJlZiksXG4gICAgICAgIHRpdGxlOiBkb2N1bWVudC50aXRsZSxcbiAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgICBmaWVsZHM6IFtdLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgaW5wdXRzID0gc2NvcGUucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QsIFtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdJyk7XG4gICAgICBcbiAgICAgIGZvciAoY29uc3QgZWxlbWVudCBvZiBpbnB1dHMpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9zaG91bGRDYXB0dXJlKGVsZW1lbnQpKSBjb250aW51ZTtcblxuICAgICAgICBjb25zdCBmaWVsZCA9IHtcbiAgICAgICAgICBmaW5nZXJwcmludDogdGhpcy5fZ2VuZXJhdGVGaW5nZXJwcmludChlbGVtZW50KSxcbiAgICAgICAgICBzZWxlY3RvcjogdGhpcy5fZ2VuZXJhdGVTZWxlY3RvcihlbGVtZW50KSxcbiAgICAgICAgICB2YWx1ZTogdGhpcy5fZXh0cmFjdFZhbHVlKGVsZW1lbnQpLFxuICAgICAgICAgIHR5cGU6IGVsZW1lbnQudHlwZSB8fCBlbGVtZW50LnRhZ05hbWUudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgICBuYW1lOiBlbGVtZW50Lm5hbWUgfHwgJycsXG4gICAgICAgICAgaWQ6IGVsZW1lbnQuaWQgfHwgJycsXG4gICAgICAgICAgcGxhY2Vob2xkZXI6IGVsZW1lbnQucGxhY2Vob2xkZXIgfHwgJycsXG4gICAgICAgICAgYXV0b2NvbXBsZXRlOiBlbGVtZW50LmF1dG9jb21wbGV0ZSB8fCAnJyxcbiAgICAgICAgICBjaGVja2VkOiBlbGVtZW50LnR5cGUgPT09ICdjaGVja2JveCcgfHwgZWxlbWVudC50eXBlID09PSAncmFkaW8nID8gZWxlbWVudC5jaGVja2VkIDogdW5kZWZpbmVkLFxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIE9ubHkgc2F2ZSBub24tZW1wdHkgdmFsdWVzXG4gICAgICAgIGlmIChmaWVsZC52YWx1ZSB8fCBmaWVsZC5jaGVja2VkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBzdGF0ZS5maWVsZHMucHVzaChmaWVsZCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHN0YXRlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdlbmVyYXRlIHVuaXF1ZSBmaW5nZXJwcmludCBmb3IgZmllbGQgbWF0Y2hpbmdcbiAgICAgKiBAcGFyYW0ge0VsZW1lbnR9IGVsZW1lbnQgLSBGb3JtIGVsZW1lbnRcbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfSBGaW5nZXJwcmludCBzdHJpbmdcbiAgICAgKi9cbiAgICBfZ2VuZXJhdGVGaW5nZXJwcmludChlbGVtZW50KSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IFtcbiAgICAgICAgZWxlbWVudC5pZCxcbiAgICAgICAgZWxlbWVudC5uYW1lLFxuICAgICAgICBlbGVtZW50LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpLFxuICAgICAgICBlbGVtZW50LnBsYWNlaG9sZGVyLFxuICAgICAgICBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS10ZXN0aWQnKSxcbiAgICAgICAgZWxlbWVudC5hdXRvY29tcGxldGUsXG4gICAgICAgIHRoaXMuX2dldEZpZWxkTGFiZWwoZWxlbWVudCksXG4gICAgICAgIGVsZW1lbnQudHlwZSB8fCBlbGVtZW50LnRhZ05hbWUudG9Mb3dlckNhc2UoKSxcbiAgICAgIF0uZmlsdGVyKEJvb2xlYW4pO1xuXG4gICAgICByZXR1cm4gcGFydHMuam9pbignfCcpLnNsaWNlKDAsIDIwMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2VuZXJhdGUgQ1NTIHNlbGVjdG9yIGZvciBlbGVtZW50XG4gICAgICogQHBhcmFtIHtFbGVtZW50fSBlbGVtZW50IC0gRm9ybSBlbGVtZW50XG4gICAgICogQHJldHVybnMge3N0cmluZ30gQ1NTIHNlbGVjdG9yXG4gICAgICovXG4gICAgX2dlbmVyYXRlU2VsZWN0b3IoZWxlbWVudCkge1xuICAgICAgaWYgKGVsZW1lbnQuaWQpIHtcbiAgICAgICAgcmV0dXJuIGAjJHtDU1MuZXNjYXBlKGVsZW1lbnQuaWQpfWA7XG4gICAgICB9XG5cbiAgICAgIGlmIChlbGVtZW50Lm5hbWUpIHtcbiAgICAgICAgY29uc3QgdGFnID0gZWxlbWVudC50YWdOYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIHJldHVybiBgJHt0YWd9W25hbWU9XCIke0NTUy5lc2NhcGUoZWxlbWVudC5uYW1lKX1cIl1gO1xuICAgICAgfVxuXG4gICAgICAvLyBGYWxsYmFjayB0byBudGgtb2YtdHlwZVxuICAgICAgY29uc3QgcGFyZW50ID0gZWxlbWVudC5wYXJlbnRFbGVtZW50O1xuICAgICAgaWYgKHBhcmVudCkge1xuICAgICAgICBjb25zdCB0YWcgPSBlbGVtZW50LnRhZ05hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgY29uc3Qgc2libGluZ3MgPSBBcnJheS5mcm9tKHBhcmVudC5xdWVyeVNlbGVjdG9yQWxsKHRhZykpO1xuICAgICAgICBjb25zdCBpbmRleCA9IHNpYmxpbmdzLmluZGV4T2YoZWxlbWVudCk7XG4gICAgICAgIGlmIChpbmRleCA+PSAwKSB7XG4gICAgICAgICAgcmV0dXJuIGAke3RhZ306bnRoLW9mLXR5cGUoJHtpbmRleCArIDF9KWA7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuICcnO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4dHJhY3QgdmFsdWUgZnJvbSBmb3JtIGVsZW1lbnRcbiAgICAgKiBAcGFyYW0ge0VsZW1lbnR9IGVsZW1lbnQgLSBGb3JtIGVsZW1lbnRcbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfSBFbGVtZW50IHZhbHVlXG4gICAgICovXG4gICAgX2V4dHJhY3RWYWx1ZShlbGVtZW50KSB7XG4gICAgICBpZiAoZWxlbWVudC5pc0NvbnRlbnRFZGl0YWJsZSkge1xuICAgICAgICByZXR1cm4gU3RyaW5nKGVsZW1lbnQudGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgaWYgKGVsZW1lbnQudGFnTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnc2VsZWN0Jykge1xuICAgICAgICByZXR1cm4gZWxlbWVudC52YWx1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGVsZW1lbnQudHlwZSA9PT0gJ2NoZWNrYm94JyB8fCBlbGVtZW50LnR5cGUgPT09ICdyYWRpbycpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQudmFsdWU7IC8vIEFjdHVhbCB2YWx1ZSwgY2hlY2tlZCBzdGF0ZSB0cmFja2VkIHNlcGFyYXRlbHlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIFN0cmluZyhlbGVtZW50LnZhbHVlIHx8ICcnKS50cmltKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGV0ZXJtaW5lIGlmIGVsZW1lbnQgc2hvdWxkIGJlIGNhcHR1cmVkXG4gICAgICogQHBhcmFtIHtFbGVtZW50fSBlbGVtZW50IC0gRm9ybSBlbGVtZW50XG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFNob3VsZCBjYXB0dXJlXG4gICAgICovXG4gICAgX3Nob3VsZENhcHR1cmUoZWxlbWVudCkge1xuICAgICAgLy8gU2tpcCBoaWRkZW4sIGRpc2FibGVkLCBhbmQgc3BlY2lhbCB0eXBlc1xuICAgICAgY29uc3QgdHlwZSA9IGVsZW1lbnQudHlwZSB8fCAnJztcbiAgICAgIGlmIChbJ2hpZGRlbicsICdzdWJtaXQnLCAnYnV0dG9uJywgJ2ltYWdlJywgJ2ZpbGUnLCAncmVzZXQnLCAncGFzc3dvcmQnXS5pbmNsdWRlcyh0eXBlKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIC8vIFNraXAgZGlzYWJsZWRcbiAgICAgIGlmIChlbGVtZW50LmRpc2FibGVkIHx8IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJykgPT09ICd0cnVlJykge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIC8vIFNraXAgaW52aXNpYmxlXG4gICAgICBjb25zdCByZWN0ID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGNvbnN0IHN0eWxlID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWxlbWVudCk7XG4gICAgICBpZiAoc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnIHx8IHN0eWxlLnZpc2liaWxpdHkgPT09ICdoaWRkZW4nKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIGlmIChyZWN0LndpZHRoIDwgMiB8fCByZWN0LmhlaWdodCA8IDIpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICAvLyBTa2lwIHNlbnNpdGl2ZSBmaWVsZHNcbiAgICAgIGlmICh0aGlzLl9pc1NlbnNpdGl2ZUZpZWxkKGVsZW1lbnQpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2hlY2sgaWYgZmllbGQgaXMgc2Vuc2l0aXZlIChTU04sIHBhc3N3b3JkLCBldGMuKVxuICAgICAqIEBwYXJhbSB7RWxlbWVudH0gZWxlbWVudCAtIEZvcm0gZWxlbWVudFxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBJcyBzZW5zaXRpdmVcbiAgICAgKi9cbiAgICBfaXNTZW5zaXRpdmVGaWVsZChlbGVtZW50KSB7XG4gICAgICBjb25zdCBoaW50cyA9IFtcbiAgICAgICAgZWxlbWVudC5uYW1lLFxuICAgICAgICBlbGVtZW50LmlkLFxuICAgICAgICBlbGVtZW50LmF1dG9jb21wbGV0ZSxcbiAgICAgICAgZWxlbWVudC5wbGFjZWhvbGRlcixcbiAgICAgICAgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSxcbiAgICAgIF0uam9pbignICcpLnRvTG93ZXJDYXNlKCk7XG5cbiAgICAgIGNvbnN0IHNlbnNpdGl2ZVBhdHRlcm5zID0gL3Bhc3N3b3JkfHBhc3N3ZHxwd2R8c3NufHNvY2lhbFtfXFxzLV0/c2VjdXJpdHl8Y3JlZGl0W19cXHMtXT9jYXJkfGN2dnxjdmN8cGlufHNlY3JldHx0b2tlbi9pO1xuICAgICAgcmV0dXJuIHNlbnNpdGl2ZVBhdHRlcm5zLnRlc3QoaGludHMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlc3RvcmUgZm9ybSBzdGF0ZSBhZnRlciByZWxvYWRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gc2F2ZWRTdGF0ZSAtIFByZXZpb3VzbHkgc2F2ZWQgc3RhdGVcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gaGVhbGluZ0VuZ2luZSAtIFNlbGYtaGVhbGluZyBlbmdpbmUgaW5zdGFuY2UgKG9wdGlvbmFsKVxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPE9iamVjdD59IFJlc3RvcmF0aW9uIHJlc3VsdHNcbiAgICAgKi9cbiAgICBhc3luYyByZXN0b3JlRm9ybVN0YXRlKHNhdmVkU3RhdGUsIGhlYWxpbmdFbmdpbmUgPSBudWxsKSB7XG4gICAgICBjb25zdCByZXN1bHRzID0ge1xuICAgICAgICByZXN0b3JlZDogMCxcbiAgICAgICAgZmFpbGVkOiAwLFxuICAgICAgICBza2lwcGVkOiAwLFxuICAgICAgICBkZXRhaWxzOiBbXSxcbiAgICAgIH07XG5cbiAgICAgIGlmICghc2F2ZWRTdGF0ZT8uZmllbGRzIHx8ICFBcnJheS5pc0FycmF5KHNhdmVkU3RhdGUuZmllbGRzKSkge1xuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgIH1cblxuICAgICAgZm9yIChjb25zdCBmaWVsZCBvZiBzYXZlZFN0YXRlLmZpZWxkcykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIC8vIFRyeSBleGFjdCBzZWxlY3RvciBmaXJzdFxuICAgICAgICAgIGxldCBlbGVtZW50ID0gbnVsbDtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoZmllbGQuc2VsZWN0b3IpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGZpZWxkLnNlbGVjdG9yKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKF9lcnIpIHt9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gRmFsbGJhY2sgdG8gZmluZ2VycHJpbnQgbWF0Y2hpbmcgdmlhIGhlYWxpbmcgZW5naW5lXG4gICAgICAgICAgaWYgKCFlbGVtZW50ICYmIGhlYWxpbmdFbmdpbmUpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlY292ZXJ5ID0gYXdhaXQgaGVhbGluZ0VuZ2luZS5hdHRlbXB0UmVjb3ZlcnkoXG4gICAgICAgICAgICAgICdyZXN0b3JlJyxcbiAgICAgICAgICAgICAgZmllbGQuZmluZ2VycHJpbnQsXG4gICAgICAgICAgICAgIGZpZWxkLnNlbGVjdG9yID8gW2ZpZWxkLnNlbGVjdG9yXSA6IFtdLFxuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgaGludHM6IHtcbiAgICAgICAgICAgICAgICAgIGlkOiBmaWVsZC5pZCxcbiAgICAgICAgICAgICAgICAgIG5hbWU6IGZpZWxkLm5hbWUsXG4gICAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcjogZmllbGQucGxhY2Vob2xkZXIsXG4gICAgICAgICAgICAgICAgICBhdXRvY29tcGxldGU6IGZpZWxkLmF1dG9jb21wbGV0ZSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAocmVjb3Zlcnkuc3VjY2VzcyAmJiByZWNvdmVyeS5lbGVtZW50KSB7XG4gICAgICAgICAgICAgIGVsZW1lbnQgPSByZWNvdmVyeS5lbGVtZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIEZhbGxiYWNrIHRvIGJhc2ljIG1hdGNoaW5nXG4gICAgICAgICAgaWYgKCFlbGVtZW50KSB7XG4gICAgICAgICAgICBlbGVtZW50ID0gdGhpcy5fZmluZEJ5RmluZ2VycHJpbnQoZmllbGQpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChlbGVtZW50ICYmIHRoaXMuX3Nob3VsZFJlc3RvcmUoZWxlbWVudCwgZmllbGQpKSB7XG4gICAgICAgICAgICB0aGlzLl9maWxsRmllbGQoZWxlbWVudCwgZmllbGQpO1xuICAgICAgICAgICAgcmVzdWx0cy5yZXN0b3JlZCArPSAxO1xuICAgICAgICAgICAgcmVzdWx0cy5kZXRhaWxzLnB1c2goe1xuICAgICAgICAgICAgICBzdGF0dXM6ICdyZXN0b3JlZCcsXG4gICAgICAgICAgICAgIGZpZWxkOiBmaWVsZC5uYW1lIHx8IGZpZWxkLmlkIHx8ICd1bmtub3duJyxcbiAgICAgICAgICAgICAgbWF0Y2hlZEJ5OiBlbGVtZW50ID09PSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGZpZWxkLnNlbGVjdG9yKSA/ICdzZWxlY3RvcicgOiAnZmluZ2VycHJpbnQnLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChlbGVtZW50KSB7XG4gICAgICAgICAgICByZXN1bHRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgICAgIHJlc3VsdHMuZGV0YWlscy5wdXNoKHtcbiAgICAgICAgICAgICAgc3RhdHVzOiAnc2tpcHBlZCcsXG4gICAgICAgICAgICAgIGZpZWxkOiBmaWVsZC5uYW1lIHx8IGZpZWxkLmlkIHx8ICd1bmtub3duJyxcbiAgICAgICAgICAgICAgcmVhc29uOiAnZmllbGQgaGFzIGV4aXN0aW5nIHZhbHVlJyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXN1bHRzLmZhaWxlZCArPSAxO1xuICAgICAgICAgICAgcmVzdWx0cy5kZXRhaWxzLnB1c2goe1xuICAgICAgICAgICAgICBzdGF0dXM6ICdmYWlsZWQnLFxuICAgICAgICAgICAgICBmaWVsZDogZmllbGQubmFtZSB8fCBmaWVsZC5pZCB8fCAndW5rbm93bicsXG4gICAgICAgICAgICAgIHJlYXNvbjogJ2VsZW1lbnQgbm90IGZvdW5kJyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgcmVzdWx0cy5mYWlsZWQgKz0gMTtcbiAgICAgICAgICByZXN1bHRzLmRldGFpbHMucHVzaCh7XG4gICAgICAgICAgICBzdGF0dXM6ICdmYWlsZWQnLFxuICAgICAgICAgICAgZmllbGQ6IGZpZWxkLm5hbWUgfHwgZmllbGQuaWQgfHwgJ3Vua25vd24nLFxuICAgICAgICAgICAgcmVhc29uOiBlcnIubWVzc2FnZSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGaW5kIGVsZW1lbnQgYnkgZmluZ2VycHJpbnQgbWF0Y2hpbmdcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZmllbGQgLSBGaWVsZCBkZXNjcmlwdG9yXG4gICAgICogQHJldHVybnMge0VsZW1lbnR8bnVsbH0gTWF0Y2hlZCBlbGVtZW50XG4gICAgICovXG4gICAgX2ZpbmRCeUZpbmdlcnByaW50KGZpZWxkKSB7XG4gICAgICBjb25zdCBjYW5kaWRhdGVzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QsIFtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdJyk7XG4gICAgICBcbiAgICAgIGZvciAoY29uc3QgZWxlbWVudCBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICAgIGNvbnN0IGZpbmdlcnByaW50ID0gdGhpcy5fZ2VuZXJhdGVGaW5nZXJwcmludChlbGVtZW50KTtcbiAgICAgICAgXG4gICAgICAgIC8vIEV4YWN0IG1hdGNoXG4gICAgICAgIGlmIChmaW5nZXJwcmludCA9PT0gZmllbGQuZmluZ2VycHJpbnQpIHtcbiAgICAgICAgICByZXR1cm4gZWxlbWVudDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFBhcnRpYWwgbWF0Y2ggKGtleSBwYXJ0cylcbiAgICAgICAgY29uc3QgZmllbGRQYXJ0cyA9IGZpZWxkLmZpbmdlcnByaW50LnNwbGl0KCd8JykuZmlsdGVyKEJvb2xlYW4pO1xuICAgICAgICBjb25zdCBlbGVtUGFydHMgPSBmaW5nZXJwcmludC5zcGxpdCgnfCcpLmZpbHRlcihCb29sZWFuKTtcbiAgICAgICAgXG4gICAgICAgIGxldCBtYXRjaENvdW50ID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBwYXJ0IG9mIGZpZWxkUGFydHMpIHtcbiAgICAgICAgICBpZiAocGFydCAmJiBlbGVtUGFydHMuaW5jbHVkZXMocGFydCkpIHtcbiAgICAgICAgICAgIG1hdGNoQ291bnQgKz0gMTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDb25zaWRlciBtYXRjaCBpZiA+NTAlIHBhcnRzIG1hdGNoIGFuZCBhdCBsZWFzdCAyIHBhcnRzXG4gICAgICAgIGlmIChtYXRjaENvdW50ID49IDIgJiYgbWF0Y2hDb3VudCA+PSBmaWVsZFBhcnRzLmxlbmd0aCAqIDAuNSkge1xuICAgICAgICAgIHJldHVybiBlbGVtZW50O1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENoZWNrIGlmIGZpZWxkIHNob3VsZCBiZSByZXN0b3JlZFxuICAgICAqIEBwYXJhbSB7RWxlbWVudH0gZWxlbWVudCAtIEZvcm0gZWxlbWVudFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBmaWVsZCAtIFNhdmVkIGZpZWxkIGRhdGFcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gU2hvdWxkIHJlc3RvcmVcbiAgICAgKi9cbiAgICBfc2hvdWxkUmVzdG9yZShlbGVtZW50LCBmaWVsZCkge1xuICAgICAgLy8gU2tpcCBpZiBlbGVtZW50IGhhcyBhIG5vbi1lbXB0eSB2YWx1ZSBhbHJlYWR5XG4gICAgICBjb25zdCBjdXJyZW50VmFsdWUgPSB0aGlzLl9leHRyYWN0VmFsdWUoZWxlbWVudCk7XG4gICAgICBpZiAoY3VycmVudFZhbHVlICYmIGN1cnJlbnRWYWx1ZSAhPT0gZmllbGQudmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlOyAvLyBEb24ndCBvdmVyd3JpdGUgZXhpc3RpbmcgdmFsdWVzXG4gICAgICB9XG5cbiAgICAgIC8vIFNraXAgaWYgZGlzYWJsZWRcbiAgICAgIGlmIChlbGVtZW50LmRpc2FibGVkKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmlsbCBmaWVsZCB3aXRoIHNhdmVkIHZhbHVlXG4gICAgICogQHBhcmFtIHtFbGVtZW50fSBlbGVtZW50IC0gRm9ybSBlbGVtZW50XG4gICAgICogQHBhcmFtIHtPYmplY3R9IGZpZWxkIC0gU2F2ZWQgZmllbGQgZGF0YVxuICAgICAqL1xuICAgIF9maWxsRmllbGQoZWxlbWVudCwgZmllbGQpIHtcbiAgICAgIGlmIChlbGVtZW50LmlzQ29udGVudEVkaXRhYmxlKSB7XG4gICAgICAgIGVsZW1lbnQudGV4dENvbnRlbnQgPSBmaWVsZC52YWx1ZTtcbiAgICAgIH0gZWxzZSBpZiAoZWxlbWVudC50eXBlID09PSAnY2hlY2tib3gnIHx8IGVsZW1lbnQudHlwZSA9PT0gJ3JhZGlvJykge1xuICAgICAgICBlbGVtZW50LmNoZWNrZWQgPSBmaWVsZC5jaGVja2VkID8/IGZhbHNlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZWxlbWVudC52YWx1ZSA9IGZpZWxkLnZhbHVlO1xuICAgICAgfVxuXG4gICAgICAvLyBEaXNwYXRjaCBldmVudHNcbiAgICAgIGVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgICAgIGVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2F2ZSBjdXJyZW50IGZvcm0gc3RhdGUgdG8gc3RvcmFnZVxuICAgICAqL1xuICAgIGFzeW5jIHNhdmVDdXJyZW50U3RhdGUoKSB7XG4gICAgICBjb25zdCBzdGF0ZSA9IHRoaXMuY2FwdHVyZUZvcm1TdGF0ZSgpO1xuICAgICAgaWYgKHN0YXRlLmZpZWxkcy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFtTVE9SQUdFX0tFWV0pO1xuICAgICAgICBsZXQgc3RhdGVzID0gQXJyYXkuaXNBcnJheShyZXN1bHRbU1RPUkFHRV9LRVldKSA/IHJlc3VsdFtTVE9SQUdFX0tFWV0gOiBbXTtcblxuICAgICAgICAvLyBSZW1vdmUgb2xkIHN0YXRlIGZvciBzYW1lIFVSTCBwYXR0ZXJuXG4gICAgICAgIHN0YXRlcyA9IHN0YXRlcy5maWx0ZXIocyA9PiBzLnVybFBhdHRlcm4gIT09IHN0YXRlLnVybFBhdHRlcm4pO1xuXG4gICAgICAgIC8vIEFkZCBuZXcgc3RhdGVcbiAgICAgICAgc3RhdGVzLnB1c2goc3RhdGUpO1xuXG4gICAgICAgIC8vIFBydW5lIG9sZCBzdGF0ZXNcbiAgICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgc3RhdGVzID0gc3RhdGVzXG4gICAgICAgICAgLmZpbHRlcihzID0+IG5vdyAtIHMudGltZXN0YW1wIDwgVFRMX01TKVxuICAgICAgICAgIC5zbGljZSgtTUFYX1NUQVRFUyk7XG5cbiAgICAgICAgYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgW1NUT1JBR0VfS0VZXTogc3RhdGVzIH0pO1xuICAgICAgICB0aGlzLmxhc3RTYXZlVGltZSA9IG5vdztcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdbRm9ybVN0YXRlUGVyc2lzdGVuY2VdIFNhdmUgZmFpbGVkOicsIGVyci5tZXNzYWdlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBMb2FkIG1hdGNoaW5nIHN0YXRlIGZvciBjdXJyZW50IFVSTFxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPE9iamVjdHxudWxsPn0gTWF0Y2hpbmcgc3RhdGUgb3IgbnVsbFxuICAgICAqL1xuICAgIGFzeW5jIGxvYWRNYXRjaGluZ1N0YXRlKCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFtTVE9SQUdFX0tFWV0pO1xuICAgICAgICBjb25zdCBzdGF0ZXMgPSBBcnJheS5pc0FycmF5KHJlc3VsdFtTVE9SQUdFX0tFWV0pID8gcmVzdWx0W1NUT1JBR0VfS0VZXSA6IFtdO1xuICAgICAgICBjb25zdCBjdXJyZW50UGF0dGVybiA9IHRoaXMuX25vcm1hbGl6ZVVybChsb2NhdGlvbi5ocmVmKTtcbiAgICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblxuICAgICAgICAvLyBGaW5kIG1vc3QgcmVjZW50IG1hdGNoaW5nIHN0YXRlXG4gICAgICAgIGNvbnN0IG1hdGNoaW5nID0gc3RhdGVzXG4gICAgICAgICAgLmZpbHRlcihzID0+IHMudXJsUGF0dGVybiA9PT0gY3VycmVudFBhdHRlcm4gJiYgbm93IC0gcy50aW1lc3RhbXAgPCBUVExfTVMpXG4gICAgICAgICAgLnNvcnQoKGEsIGIpID0+IGIudGltZXN0YW1wIC0gYS50aW1lc3RhbXApO1xuXG4gICAgICAgIHJldHVybiBtYXRjaGluZ1swXSB8fCBudWxsO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1tGb3JtU3RhdGVQZXJzaXN0ZW5jZV0gTG9hZCBmYWlsZWQ6JywgZXJyLm1lc3NhZ2UpO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTYXZlIHN0YXRlIHRvIHN0b3JhZ2UgKHB1YmxpYyBtZXRob2QpXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHN0YXRlIC0gU3RhdGUgdG8gc2F2ZVxuICAgICAqL1xuICAgIGFzeW5jIHNhdmVUb1N0b3JhZ2Uoc3RhdGUpIHtcbiAgICAgIGlmICghc3RhdGU/LmZpZWxkcz8ubGVuZ3RoKSByZXR1cm47XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChbU1RPUkFHRV9LRVldKTtcbiAgICAgICAgbGV0IHN0YXRlcyA9IEFycmF5LmlzQXJyYXkocmVzdWx0W1NUT1JBR0VfS0VZXSkgPyByZXN1bHRbU1RPUkFHRV9LRVldIDogW107XG5cbiAgICAgICAgc3RhdGVzID0gc3RhdGVzLmZpbHRlcihzID0+IHMudXJsUGF0dGVybiAhPT0gc3RhdGUudXJsUGF0dGVybik7XG4gICAgICAgIHN0YXRlcy5wdXNoKHN0YXRlKTtcblxuICAgICAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgICAgICBzdGF0ZXMgPSBzdGF0ZXNcbiAgICAgICAgICAuZmlsdGVyKHMgPT4gbm93IC0gcy50aW1lc3RhbXAgPCBUVExfTVMpXG4gICAgICAgICAgLnNsaWNlKC1NQVhfU1RBVEVTKTtcblxuICAgICAgICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBbU1RPUkFHRV9LRVldOiBzdGF0ZXMgfSk7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignW0Zvcm1TdGF0ZVBlcnNpc3RlbmNlXSBTYXZlIHRvIHN0b3JhZ2UgZmFpbGVkOicsIGVyci5tZXNzYWdlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXR1cCBhdXRvLXNhdmUgb24gZm9ybSBjaGFuZ2VzXG4gICAgICovXG4gICAgc2V0dXBBdXRvU2F2ZSgpIHtcbiAgICAgIGlmICh0aGlzLmF1dG9TYXZlRW5hYmxlZCkgcmV0dXJuO1xuICAgICAgdGhpcy5hdXRvU2F2ZUVuYWJsZWQgPSB0cnVlO1xuXG4gICAgICBjb25zdCBkZWJvdW5jZWRTYXZlID0gKCkgPT4ge1xuICAgICAgICBpZiAodGhpcy5zYXZlVGltZW91dCkge1xuICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnNhdmVUaW1lb3V0KTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNhdmVUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgdGhpcy5zYXZlQ3VycmVudFN0YXRlKCk7XG4gICAgICAgIH0sIERFQk9VTkNFX01TKTtcbiAgICAgIH07XG5cbiAgICAgIC8vIFNhdmUgb24gaW5wdXQgY2hhbmdlc1xuICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCBkZWJvdW5jZWRTYXZlLCB7IHBhc3NpdmU6IHRydWUgfSk7XG4gICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBkZWJvdW5jZWRTYXZlLCB7IHBhc3NpdmU6IHRydWUgfSk7XG5cbiAgICAgIC8vIFNhdmUgYmVmb3JlIHVubG9hZFxuICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2JlZm9yZXVubG9hZCcsICgpID0+IHtcbiAgICAgICAgaWYgKHRoaXMuc2F2ZVRpbWVvdXQpIHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5zYXZlVGltZW91dCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zYXZlQ3VycmVudFN0YXRlKCk7XG4gICAgICB9KTtcblxuICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3BhZ2VoaWRlJywgKCkgPT4ge1xuICAgICAgICBpZiAodGhpcy5zYXZlVGltZW91dCkge1xuICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnNhdmVUaW1lb3V0KTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNhdmVDdXJyZW50U3RhdGUoKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHVwIGF1dG8tcmVzdG9yZSBvbiBwYWdlIGxvYWRcbiAgICAgKi9cbiAgICBhc3luYyBzZXR1cEF1dG9SZXN0b3JlKCkge1xuICAgICAgY29uc3Qgc3RhdGUgPSBhd2FpdCB0aGlzLmxvYWRNYXRjaGluZ1N0YXRlKCk7XG4gICAgICBpZiAoc3RhdGUpIHtcbiAgICAgICAgY29uc3QgaGVhbGluZ0VuZ2luZSA9IHdpbmRvdy5fX2JpbGdlX3NlbGZIZWFsaW5nRW5naW5lIHx8IG51bGw7XG4gICAgICAgIHJldHVybiB0aGlzLnJlc3RvcmVGb3JtU3RhdGUoc3RhdGUsIGhlYWxpbmdFbmdpbmUpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgcmVzdG9yZWQ6IDAsIGZhaWxlZDogMCwgc2tpcHBlZDogMCB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENsZWFyIGFsbCBzYXZlZCBzdGF0ZXNcbiAgICAgKi9cbiAgICBhc3luYyBjbGVhckFsbFN0YXRlcygpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLnJlbW92ZShTVE9SQUdFX0tFWSk7XG4gICAgICAgIHJldHVybiB7IGNsZWFyZWQ6IHRydWUgfTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICByZXR1cm4geyBjbGVhcmVkOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IHNhdmVkIHN0YXRlcyBzdW1tYXJ5XG4gICAgICovXG4gICAgYXN5bmMgZ2V0U3RhdGVzU3VtbWFyeSgpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChbU1RPUkFHRV9LRVldKTtcbiAgICAgICAgY29uc3Qgc3RhdGVzID0gQXJyYXkuaXNBcnJheShyZXN1bHRbU1RPUkFHRV9LRVldKSA/IHJlc3VsdFtTVE9SQUdFX0tFWV0gOiBbXTtcbiAgICAgICAgXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgY291bnQ6IHN0YXRlcy5sZW5ndGgsXG4gICAgICAgICAgdXJsczogc3RhdGVzLm1hcChzID0+IHMudXJsUGF0dGVybiksXG4gICAgICAgICAgb2xkZXN0OiBzdGF0ZXMubGVuZ3RoID4gMCA/IG5ldyBEYXRlKE1hdGgubWluKC4uLnN0YXRlcy5tYXAocyA9PiBzLnRpbWVzdGFtcCkpKS50b0lTT1N0cmluZygpIDogbnVsbCxcbiAgICAgICAgICBuZXdlc3Q6IHN0YXRlcy5sZW5ndGggPiAwID8gbmV3IERhdGUoTWF0aC5tYXgoLi4uc3RhdGVzLm1hcChzID0+IHMudGltZXN0YW1wKSkpLnRvSVNPU3RyaW5nKCkgOiBudWxsLFxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHJldHVybiB7IGNvdW50OiAwLCBlcnJvcjogZXJyLm1lc3NhZ2UgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyA9PT0gSGVscGVyIG1ldGhvZHMgPT09XG5cbiAgICBfbm9ybWFsaXplVXJsKHVybCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgICAgICAvLyBOb3JtYWxpemUgYnkgcmVtb3ZpbmcgY29tbW9uIHRyYWNraW5nIHBhcmFtc1xuICAgICAgICBjb25zdCBzZWFyY2hQYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHBhcnNlZC5zZWFyY2gpO1xuICAgICAgICBjb25zdCBwYXJhbXNUb1JlbW92ZSA9IFsndXRtX3NvdXJjZScsICd1dG1fbWVkaXVtJywgJ3V0bV9jYW1wYWlnbicsICdmYmNsaWQnLCAnZ2NsaWQnLCAncmVmJywgJ3NvdXJjZSddO1xuICAgICAgICBwYXJhbXNUb1JlbW92ZS5mb3JFYWNoKHAgPT4gc2VhcmNoUGFyYW1zLmRlbGV0ZShwKSk7XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gYCR7cGFyc2VkLmhvc3RuYW1lfSR7cGFyc2VkLnBhdGhuYW1lfSR7c2VhcmNoUGFyYW1zLnRvU3RyaW5nKCkgPyAnPycgKyBzZWFyY2hQYXJhbXMudG9TdHJpbmcoKSA6ICcnfWA7XG4gICAgICB9IGNhdGNoIChfZXJyKSB7XG4gICAgICAgIHJldHVybiB1cmw7XG4gICAgICB9XG4gICAgfVxuXG4gICAgX2dldEZpZWxkTGFiZWwoZWxlbWVudCkge1xuICAgICAgY29uc3QgaWQgPSBlbGVtZW50LmlkO1xuICAgICAgaWYgKGlkKSB7XG4gICAgICAgIGNvbnN0IGxhYmVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgbGFiZWxbZm9yPVwiJHtDU1MuZXNjYXBlKGlkKX1cIl1gKTtcbiAgICAgICAgaWYgKGxhYmVsPy50ZXh0Q29udGVudCkgcmV0dXJuIGxhYmVsLnRleHRDb250ZW50LnRyaW0oKS5zbGljZSgwLCAxMDApO1xuICAgICAgfVxuICAgICAgY29uc3QgY2xvc2VzdExhYmVsID0gZWxlbWVudC5jbG9zZXN0KCdsYWJlbCcpO1xuICAgICAgaWYgKGNsb3Nlc3RMYWJlbD8udGV4dENvbnRlbnQpIHJldHVybiBjbG9zZXN0TGFiZWwudGV4dENvbnRlbnQudHJpbSgpLnNsaWNlKDAsIDEwMCk7XG4gICAgICByZXR1cm4gJyc7XG4gICAgfVxuICB9XG5cbiAgLy8gQ3JlYXRlIGdsb2JhbCBpbnN0YW5jZVxuICB3aW5kb3cuX19iaWxnZV9mb3JtU3RhdGVQZXJzaXN0ZW5jZSA9IG5ldyBGb3JtU3RhdGVQZXJzaXN0ZW5jZSgpO1xuXG4gIGNvbnNvbGUubG9nKCdbQmlsZ2VdIEZvcm1TdGF0ZVBlcnNpc3RlbmNlIGluaXRpYWxpemVkJyk7XG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7OztDQUdDLFdBQVc7QUFDVjtBQUVBLE1BQUksT0FBTyw2QkFBOEI7QUFFekMsUUFBTSxjQUFjO0FBQ3BCLFFBQU0sYUFBYTtBQUNuQixRQUFNLFNBQVMsS0FBSyxLQUFLLEtBQUs7QUFDOUIsUUFBTSxjQUFjO0FBQUEsRUFLcEIsTUFBTSxxQkFBcUI7QUFBQSxJQWhCN0IsT0FnQjZCO0FBQUE7QUFBQTtBQUFBLElBQ3pCLGNBQWM7QUFDWixXQUFLLGNBQWM7QUFDbkIsV0FBSyxrQkFBa0I7QUFDdkIsV0FBSyxlQUFlO0FBQUEsSUFDdEI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFPQSxpQkFBaUIsUUFBUSxVQUFVO0FBQ2pDLFlBQU0sUUFBUTtBQUFBLFFBQ1osS0FBSyxTQUFTO0FBQUEsUUFDZCxZQUFZLEtBQUssY0FBYyxTQUFTLElBQUk7QUFBQSxRQUM1QyxPQUFPLFNBQVM7QUFBQSxRQUNoQixXQUFXLEtBQUssSUFBSTtBQUFBLFFBQ3BCLFFBQVEsQ0FBQztBQUFBLE1BQ1g7QUFFQSxZQUFNLFNBQVMsTUFBTSxpQkFBaUIsbURBQW1EO0FBRXpGLGlCQUFXLFdBQVcsUUFBUTtBQUM1QixZQUFJLENBQUMsS0FBSyxlQUFlLE9BQU8sRUFBRztBQUVuQyxjQUFNLFFBQVE7QUFBQSxVQUNaLGFBQWEsS0FBSyxxQkFBcUIsT0FBTztBQUFBLFVBQzlDLFVBQVUsS0FBSyxrQkFBa0IsT0FBTztBQUFBLFVBQ3hDLE9BQU8sS0FBSyxjQUFjLE9BQU87QUFBQSxVQUNqQyxNQUFNLFFBQVEsUUFBUSxRQUFRLFFBQVEsWUFBWTtBQUFBLFVBQ2xELE1BQU0sUUFBUSxRQUFRO0FBQUEsVUFDdEIsSUFBSSxRQUFRLE1BQU07QUFBQSxVQUNsQixhQUFhLFFBQVEsZUFBZTtBQUFBLFVBQ3BDLGNBQWMsUUFBUSxnQkFBZ0I7QUFBQSxVQUN0QyxTQUFTLFFBQVEsU0FBUyxjQUFjLFFBQVEsU0FBUyxVQUFVLFFBQVEsVUFBVTtBQUFBLFFBQ3ZGO0FBR0EsWUFBSSxNQUFNLFNBQVMsTUFBTSxZQUFZLFFBQVc7QUFDOUMsZ0JBQU0sT0FBTyxLQUFLLEtBQUs7QUFBQSxRQUN6QjtBQUFBLE1BQ0Y7QUFFQSxhQUFPO0FBQUEsSUFDVDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQU9BLHFCQUFxQixTQUFTO0FBQzVCLFlBQU0sUUFBUTtBQUFBLFFBQ1osUUFBUTtBQUFBLFFBQ1IsUUFBUTtBQUFBLFFBQ1IsUUFBUSxhQUFhLFlBQVk7QUFBQSxRQUNqQyxRQUFRO0FBQUEsUUFDUixRQUFRLGFBQWEsYUFBYTtBQUFBLFFBQ2xDLFFBQVE7QUFBQSxRQUNSLEtBQUssZUFBZSxPQUFPO0FBQUEsUUFDM0IsUUFBUSxRQUFRLFFBQVEsUUFBUSxZQUFZO0FBQUEsTUFDOUMsRUFBRSxPQUFPLE9BQU87QUFFaEIsYUFBTyxNQUFNLEtBQUssR0FBRyxFQUFFLE1BQU0sR0FBRyxHQUFHO0FBQUEsSUFDckM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFPQSxrQkFBa0IsU0FBUztBQUN6QixVQUFJLFFBQVEsSUFBSTtBQUNkLGVBQU8sSUFBSSxJQUFJLE9BQU8sUUFBUSxFQUFFLENBQUM7QUFBQSxNQUNuQztBQUVBLFVBQUksUUFBUSxNQUFNO0FBQ2hCLGNBQU0sTUFBTSxRQUFRLFFBQVEsWUFBWTtBQUN4QyxlQUFPLEdBQUcsR0FBRyxVQUFVLElBQUksT0FBTyxRQUFRLElBQUksQ0FBQztBQUFBLE1BQ2pEO0FBR0EsWUFBTSxTQUFTLFFBQVE7QUFDdkIsVUFBSSxRQUFRO0FBQ1YsY0FBTSxNQUFNLFFBQVEsUUFBUSxZQUFZO0FBQ3hDLGNBQU0sV0FBVyxNQUFNLEtBQUssT0FBTyxpQkFBaUIsR0FBRyxDQUFDO0FBQ3hELGNBQU0sUUFBUSxTQUFTLFFBQVEsT0FBTztBQUN0QyxZQUFJLFNBQVMsR0FBRztBQUNkLGlCQUFPLEdBQUcsR0FBRyxnQkFBZ0IsUUFBUSxDQUFDO0FBQUEsUUFDeEM7QUFBQSxNQUNGO0FBRUEsYUFBTztBQUFBLElBQ1Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFPQSxjQUFjLFNBQVM7QUFDckIsVUFBSSxRQUFRLG1CQUFtQjtBQUM3QixlQUFPLE9BQU8sUUFBUSxlQUFlLEVBQUUsRUFBRSxLQUFLO0FBQUEsTUFDaEQ7QUFFQSxVQUFJLFFBQVEsUUFBUSxZQUFZLE1BQU0sVUFBVTtBQUM5QyxlQUFPLFFBQVE7QUFBQSxNQUNqQjtBQUVBLFVBQUksUUFBUSxTQUFTLGNBQWMsUUFBUSxTQUFTLFNBQVM7QUFDM0QsZUFBTyxRQUFRO0FBQUEsTUFDakI7QUFFQSxhQUFPLE9BQU8sUUFBUSxTQUFTLEVBQUUsRUFBRSxLQUFLO0FBQUEsSUFDMUM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFPQSxlQUFlLFNBQVM7QUFFdEIsWUFBTSxPQUFPLFFBQVEsUUFBUTtBQUM3QixVQUFJLENBQUMsVUFBVSxVQUFVLFVBQVUsU0FBUyxRQUFRLFNBQVMsVUFBVSxFQUFFLFNBQVMsSUFBSSxHQUFHO0FBQ3ZGLGVBQU87QUFBQSxNQUNUO0FBR0EsVUFBSSxRQUFRLFlBQVksUUFBUSxhQUFhLGVBQWUsTUFBTSxRQUFRO0FBQ3hFLGVBQU87QUFBQSxNQUNUO0FBR0EsWUFBTSxPQUFPLFFBQVEsc0JBQXNCO0FBQzNDLFlBQU0sUUFBUSxPQUFPLGlCQUFpQixPQUFPO0FBQzdDLFVBQUksTUFBTSxZQUFZLFVBQVUsTUFBTSxlQUFlLFVBQVU7QUFDN0QsZUFBTztBQUFBLE1BQ1Q7QUFDQSxVQUFJLEtBQUssUUFBUSxLQUFLLEtBQUssU0FBUyxHQUFHO0FBQ3JDLGVBQU87QUFBQSxNQUNUO0FBR0EsVUFBSSxLQUFLLGtCQUFrQixPQUFPLEdBQUc7QUFDbkMsZUFBTztBQUFBLE1BQ1Q7QUFFQSxhQUFPO0FBQUEsSUFDVDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQU9BLGtCQUFrQixTQUFTO0FBQ3pCLFlBQU0sUUFBUTtBQUFBLFFBQ1osUUFBUTtBQUFBLFFBQ1IsUUFBUTtBQUFBLFFBQ1IsUUFBUTtBQUFBLFFBQ1IsUUFBUTtBQUFBLFFBQ1IsUUFBUSxhQUFhLFlBQVk7QUFBQSxNQUNuQyxFQUFFLEtBQUssR0FBRyxFQUFFLFlBQVk7QUFFeEIsWUFBTSxvQkFBb0I7QUFDMUIsYUFBTyxrQkFBa0IsS0FBSyxLQUFLO0FBQUEsSUFDckM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQVFBLE1BQU0saUJBQWlCLFlBQVksZ0JBQWdCLE1BQU07QUFDdkQsWUFBTSxVQUFVO0FBQUEsUUFDZCxVQUFVO0FBQUEsUUFDVixRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsUUFDVCxTQUFTLENBQUM7QUFBQSxNQUNaO0FBRUEsVUFBSSxDQUFDLFlBQVksVUFBVSxDQUFDLE1BQU0sUUFBUSxXQUFXLE1BQU0sR0FBRztBQUM1RCxlQUFPO0FBQUEsTUFDVDtBQUVBLGlCQUFXLFNBQVMsV0FBVyxRQUFRO0FBQ3JDLFlBQUk7QUFFRixjQUFJLFVBQVU7QUFFZCxjQUFJLE1BQU0sVUFBVTtBQUNsQixnQkFBSTtBQUNGLHdCQUFVLFNBQVMsY0FBYyxNQUFNLFFBQVE7QUFBQSxZQUNqRCxTQUFTLE1BQU07QUFBQSxZQUFDO0FBQUEsVUFDbEI7QUFHQSxjQUFJLENBQUMsV0FBVyxlQUFlO0FBQzdCLGtCQUFNLFdBQVcsTUFBTSxjQUFjO0FBQUEsY0FDbkM7QUFBQSxjQUNBLE1BQU07QUFBQSxjQUNOLE1BQU0sV0FBVyxDQUFDLE1BQU0sUUFBUSxJQUFJLENBQUM7QUFBQSxjQUNyQztBQUFBLGdCQUNFLE9BQU87QUFBQSxrQkFDTCxJQUFJLE1BQU07QUFBQSxrQkFDVixNQUFNLE1BQU07QUFBQSxrQkFDWixhQUFhLE1BQU07QUFBQSxrQkFDbkIsY0FBYyxNQUFNO0FBQUEsZ0JBQ3RCO0FBQUEsY0FDRjtBQUFBLFlBQ0Y7QUFFQSxnQkFBSSxTQUFTLFdBQVcsU0FBUyxTQUFTO0FBQ3hDLHdCQUFVLFNBQVM7QUFBQSxZQUNyQjtBQUFBLFVBQ0Y7QUFHQSxjQUFJLENBQUMsU0FBUztBQUNaLHNCQUFVLEtBQUssbUJBQW1CLEtBQUs7QUFBQSxVQUN6QztBQUVBLGNBQUksV0FBVyxLQUFLLGVBQWUsU0FBUyxLQUFLLEdBQUc7QUFDbEQsaUJBQUssV0FBVyxTQUFTLEtBQUs7QUFDOUIsb0JBQVEsWUFBWTtBQUNwQixvQkFBUSxRQUFRLEtBQUs7QUFBQSxjQUNuQixRQUFRO0FBQUEsY0FDUixPQUFPLE1BQU0sUUFBUSxNQUFNLE1BQU07QUFBQSxjQUNqQyxXQUFXLFlBQVksU0FBUyxjQUFjLE1BQU0sUUFBUSxJQUFJLGFBQWE7QUFBQSxZQUMvRSxDQUFDO0FBQUEsVUFDSCxXQUFXLFNBQVM7QUFDbEIsb0JBQVEsV0FBVztBQUNuQixvQkFBUSxRQUFRLEtBQUs7QUFBQSxjQUNuQixRQUFRO0FBQUEsY0FDUixPQUFPLE1BQU0sUUFBUSxNQUFNLE1BQU07QUFBQSxjQUNqQyxRQUFRO0FBQUEsWUFDVixDQUFDO0FBQUEsVUFDSCxPQUFPO0FBQ0wsb0JBQVEsVUFBVTtBQUNsQixvQkFBUSxRQUFRLEtBQUs7QUFBQSxjQUNuQixRQUFRO0FBQUEsY0FDUixPQUFPLE1BQU0sUUFBUSxNQUFNLE1BQU07QUFBQSxjQUNqQyxRQUFRO0FBQUEsWUFDVixDQUFDO0FBQUEsVUFDSDtBQUFBLFFBQ0YsU0FBUyxLQUFLO0FBQ1osa0JBQVEsVUFBVTtBQUNsQixrQkFBUSxRQUFRLEtBQUs7QUFBQSxZQUNuQixRQUFRO0FBQUEsWUFDUixPQUFPLE1BQU0sUUFBUSxNQUFNLE1BQU07QUFBQSxZQUNqQyxRQUFRLElBQUk7QUFBQSxVQUNkLENBQUM7QUFBQSxRQUNIO0FBQUEsTUFDRjtBQUVBLGFBQU87QUFBQSxJQUNUO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBT0EsbUJBQW1CLE9BQU87QUFDeEIsWUFBTSxhQUFhLFNBQVMsaUJBQWlCLG1EQUFtRDtBQUVoRyxpQkFBVyxXQUFXLFlBQVk7QUFDaEMsY0FBTSxjQUFjLEtBQUsscUJBQXFCLE9BQU87QUFHckQsWUFBSSxnQkFBZ0IsTUFBTSxhQUFhO0FBQ3JDLGlCQUFPO0FBQUEsUUFDVDtBQUdBLGNBQU0sYUFBYSxNQUFNLFlBQVksTUFBTSxHQUFHLEVBQUUsT0FBTyxPQUFPO0FBQzlELGNBQU0sWUFBWSxZQUFZLE1BQU0sR0FBRyxFQUFFLE9BQU8sT0FBTztBQUV2RCxZQUFJLGFBQWE7QUFDakIsbUJBQVcsUUFBUSxZQUFZO0FBQzdCLGNBQUksUUFBUSxVQUFVLFNBQVMsSUFBSSxHQUFHO0FBQ3BDLDBCQUFjO0FBQUEsVUFDaEI7QUFBQSxRQUNGO0FBR0EsWUFBSSxjQUFjLEtBQUssY0FBYyxXQUFXLFNBQVMsS0FBSztBQUM1RCxpQkFBTztBQUFBLFFBQ1Q7QUFBQSxNQUNGO0FBRUEsYUFBTztBQUFBLElBQ1Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQVFBLGVBQWUsU0FBUyxPQUFPO0FBRTdCLFlBQU0sZUFBZSxLQUFLLGNBQWMsT0FBTztBQUMvQyxVQUFJLGdCQUFnQixpQkFBaUIsTUFBTSxPQUFPO0FBQ2hELGVBQU87QUFBQSxNQUNUO0FBR0EsVUFBSSxRQUFRLFVBQVU7QUFDcEIsZUFBTztBQUFBLE1BQ1Q7QUFFQSxhQUFPO0FBQUEsSUFDVDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQU9BLFdBQVcsU0FBUyxPQUFPO0FBQ3pCLFVBQUksUUFBUSxtQkFBbUI7QUFDN0IsZ0JBQVEsY0FBYyxNQUFNO0FBQUEsTUFDOUIsV0FBVyxRQUFRLFNBQVMsY0FBYyxRQUFRLFNBQVMsU0FBUztBQUNsRSxnQkFBUSxVQUFVLE1BQU0sV0FBVztBQUFBLE1BQ3JDLE9BQU87QUFDTCxnQkFBUSxRQUFRLE1BQU07QUFBQSxNQUN4QjtBQUdBLGNBQVEsY0FBYyxJQUFJLE1BQU0sU0FBUyxFQUFFLFNBQVMsS0FBSyxDQUFDLENBQUM7QUFDM0QsY0FBUSxjQUFjLElBQUksTUFBTSxVQUFVLEVBQUUsU0FBUyxLQUFLLENBQUMsQ0FBQztBQUFBLElBQzlEO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFLQSxNQUFNLG1CQUFtQjtBQUN2QixZQUFNLFFBQVEsS0FBSyxpQkFBaUI7QUFDcEMsVUFBSSxNQUFNLE9BQU8sV0FBVyxFQUFHO0FBRS9CLFVBQUk7QUFDRixjQUFNLFNBQVMsTUFBTSxPQUFPLFFBQVEsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDO0FBQzNELFlBQUksU0FBUyxNQUFNLFFBQVEsT0FBTyxXQUFXLENBQUMsSUFBSSxPQUFPLFdBQVcsSUFBSSxDQUFDO0FBR3pFLGlCQUFTLE9BQU8sT0FBTyxPQUFLLEVBQUUsZUFBZSxNQUFNLFVBQVU7QUFHN0QsZUFBTyxLQUFLLEtBQUs7QUFHakIsY0FBTSxNQUFNLEtBQUssSUFBSTtBQUNyQixpQkFBUyxPQUNOLE9BQU8sT0FBSyxNQUFNLEVBQUUsWUFBWSxNQUFNLEVBQ3RDLE1BQU0sQ0FBQyxVQUFVO0FBRXBCLGNBQU0sT0FBTyxRQUFRLE1BQU0sSUFBSSxFQUFFLENBQUMsV0FBVyxHQUFHLE9BQU8sQ0FBQztBQUN4RCxhQUFLLGVBQWU7QUFBQSxNQUN0QixTQUFTLEtBQUs7QUFDWixnQkFBUSxNQUFNLHVDQUF1QyxJQUFJLE9BQU87QUFBQSxNQUNsRTtBQUFBLElBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBTUEsTUFBTSxvQkFBb0I7QUFDeEIsVUFBSTtBQUNGLGNBQU0sU0FBUyxNQUFNLE9BQU8sUUFBUSxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUM7QUFDM0QsY0FBTSxTQUFTLE1BQU0sUUFBUSxPQUFPLFdBQVcsQ0FBQyxJQUFJLE9BQU8sV0FBVyxJQUFJLENBQUM7QUFDM0UsY0FBTSxpQkFBaUIsS0FBSyxjQUFjLFNBQVMsSUFBSTtBQUN2RCxjQUFNLE1BQU0sS0FBSyxJQUFJO0FBR3JCLGNBQU0sV0FBVyxPQUNkLE9BQU8sT0FBSyxFQUFFLGVBQWUsa0JBQWtCLE1BQU0sRUFBRSxZQUFZLE1BQU0sRUFDekUsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLFlBQVksRUFBRSxTQUFTO0FBRTNDLGVBQU8sU0FBUyxDQUFDLEtBQUs7QUFBQSxNQUN4QixTQUFTLEtBQUs7QUFDWixnQkFBUSxNQUFNLHVDQUF1QyxJQUFJLE9BQU87QUFDaEUsZUFBTztBQUFBLE1BQ1Q7QUFBQSxJQUNGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQU1BLE1BQU0sY0FBYyxPQUFPO0FBQ3pCLFVBQUksQ0FBQyxPQUFPLFFBQVEsT0FBUTtBQUU1QixVQUFJO0FBQ0YsY0FBTSxTQUFTLE1BQU0sT0FBTyxRQUFRLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQztBQUMzRCxZQUFJLFNBQVMsTUFBTSxRQUFRLE9BQU8sV0FBVyxDQUFDLElBQUksT0FBTyxXQUFXLElBQUksQ0FBQztBQUV6RSxpQkFBUyxPQUFPLE9BQU8sT0FBSyxFQUFFLGVBQWUsTUFBTSxVQUFVO0FBQzdELGVBQU8sS0FBSyxLQUFLO0FBRWpCLGNBQU0sTUFBTSxLQUFLLElBQUk7QUFDckIsaUJBQVMsT0FDTixPQUFPLE9BQUssTUFBTSxFQUFFLFlBQVksTUFBTSxFQUN0QyxNQUFNLENBQUMsVUFBVTtBQUVwQixjQUFNLE9BQU8sUUFBUSxNQUFNLElBQUksRUFBRSxDQUFDLFdBQVcsR0FBRyxPQUFPLENBQUM7QUFBQSxNQUMxRCxTQUFTLEtBQUs7QUFDWixnQkFBUSxNQUFNLGtEQUFrRCxJQUFJLE9BQU87QUFBQSxNQUM3RTtBQUFBLElBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQUtBLGdCQUFnQjtBQUNkLFVBQUksS0FBSyxnQkFBaUI7QUFDMUIsV0FBSyxrQkFBa0I7QUFFdkIsWUFBTSxnQkFBZ0IsNkJBQU07QUFDMUIsWUFBSSxLQUFLLGFBQWE7QUFDcEIsdUJBQWEsS0FBSyxXQUFXO0FBQUEsUUFDL0I7QUFDQSxhQUFLLGNBQWMsV0FBVyxNQUFNO0FBQ2xDLGVBQUssaUJBQWlCO0FBQUEsUUFDeEIsR0FBRyxXQUFXO0FBQUEsTUFDaEIsR0FQc0I7QUFVdEIsZUFBUyxpQkFBaUIsU0FBUyxlQUFlLEVBQUUsU0FBUyxLQUFLLENBQUM7QUFDbkUsZUFBUyxpQkFBaUIsVUFBVSxlQUFlLEVBQUUsU0FBUyxLQUFLLENBQUM7QUFHcEUsYUFBTyxpQkFBaUIsZ0JBQWdCLE1BQU07QUFDNUMsWUFBSSxLQUFLLGFBQWE7QUFDcEIsdUJBQWEsS0FBSyxXQUFXO0FBQUEsUUFDL0I7QUFDQSxhQUFLLGlCQUFpQjtBQUFBLE1BQ3hCLENBQUM7QUFFRCxhQUFPLGlCQUFpQixZQUFZLE1BQU07QUFDeEMsWUFBSSxLQUFLLGFBQWE7QUFDcEIsdUJBQWEsS0FBSyxXQUFXO0FBQUEsUUFDL0I7QUFDQSxhQUFLLGlCQUFpQjtBQUFBLE1BQ3hCLENBQUM7QUFBQSxJQUNIO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFLQSxNQUFNLG1CQUFtQjtBQUN2QixZQUFNLFFBQVEsTUFBTSxLQUFLLGtCQUFrQjtBQUMzQyxVQUFJLE9BQU87QUFDVCxjQUFNLGdCQUFnQixPQUFPLDZCQUE2QjtBQUMxRCxlQUFPLEtBQUssaUJBQWlCLE9BQU8sYUFBYTtBQUFBLE1BQ25EO0FBQ0EsYUFBTyxFQUFFLFVBQVUsR0FBRyxRQUFRLEdBQUcsU0FBUyxFQUFFO0FBQUEsSUFDOUM7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQUtBLE1BQU0saUJBQWlCO0FBQ3JCLFVBQUk7QUFDRixjQUFNLE9BQU8sUUFBUSxNQUFNLE9BQU8sV0FBVztBQUM3QyxlQUFPLEVBQUUsU0FBUyxLQUFLO0FBQUEsTUFDekIsU0FBUyxLQUFLO0FBQ1osZUFBTyxFQUFFLFNBQVMsT0FBTyxPQUFPLElBQUksUUFBUTtBQUFBLE1BQzlDO0FBQUEsSUFDRjtBQUFBO0FBQUE7QUFBQTtBQUFBLElBS0EsTUFBTSxtQkFBbUI7QUFDdkIsVUFBSTtBQUNGLGNBQU0sU0FBUyxNQUFNLE9BQU8sUUFBUSxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUM7QUFDM0QsY0FBTSxTQUFTLE1BQU0sUUFBUSxPQUFPLFdBQVcsQ0FBQyxJQUFJLE9BQU8sV0FBVyxJQUFJLENBQUM7QUFFM0UsZUFBTztBQUFBLFVBQ0wsT0FBTyxPQUFPO0FBQUEsVUFDZCxNQUFNLE9BQU8sSUFBSSxPQUFLLEVBQUUsVUFBVTtBQUFBLFVBQ2xDLFFBQVEsT0FBTyxTQUFTLElBQUksSUFBSSxLQUFLLEtBQUssSUFBSSxHQUFHLE9BQU8sSUFBSSxPQUFLLEVBQUUsU0FBUyxDQUFDLENBQUMsRUFBRSxZQUFZLElBQUk7QUFBQSxVQUNoRyxRQUFRLE9BQU8sU0FBUyxJQUFJLElBQUksS0FBSyxLQUFLLElBQUksR0FBRyxPQUFPLElBQUksT0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDLEVBQUUsWUFBWSxJQUFJO0FBQUEsUUFDbEc7QUFBQSxNQUNGLFNBQVMsS0FBSztBQUNaLGVBQU8sRUFBRSxPQUFPLEdBQUcsT0FBTyxJQUFJLFFBQVE7QUFBQSxNQUN4QztBQUFBLElBQ0Y7QUFBQTtBQUFBLElBSUEsY0FBYyxLQUFLO0FBQ2pCLFVBQUk7QUFDRixjQUFNLFNBQVMsSUFBSSxJQUFJLEdBQUc7QUFFMUIsY0FBTSxlQUFlLElBQUksZ0JBQWdCLE9BQU8sTUFBTTtBQUN0RCxjQUFNLGlCQUFpQixDQUFDLGNBQWMsY0FBYyxnQkFBZ0IsVUFBVSxTQUFTLE9BQU8sUUFBUTtBQUN0Ryx1QkFBZSxRQUFRLE9BQUssYUFBYSxPQUFPLENBQUMsQ0FBQztBQUVsRCxlQUFPLEdBQUcsT0FBTyxRQUFRLEdBQUcsT0FBTyxRQUFRLEdBQUcsYUFBYSxTQUFTLElBQUksTUFBTSxhQUFhLFNBQVMsSUFBSSxFQUFFO0FBQUEsTUFDNUcsU0FBUyxNQUFNO0FBQ2IsZUFBTztBQUFBLE1BQ1Q7QUFBQSxJQUNGO0FBQUEsSUFFQSxlQUFlLFNBQVM7QUFDdEIsWUFBTSxLQUFLLFFBQVE7QUFDbkIsVUFBSSxJQUFJO0FBQ04sY0FBTSxRQUFRLFNBQVMsY0FBYyxjQUFjLElBQUksT0FBTyxFQUFFLENBQUMsSUFBSTtBQUNyRSxZQUFJLE9BQU8sWUFBYSxRQUFPLE1BQU0sWUFBWSxLQUFLLEVBQUUsTUFBTSxHQUFHLEdBQUc7QUFBQSxNQUN0RTtBQUNBLFlBQU0sZUFBZSxRQUFRLFFBQVEsT0FBTztBQUM1QyxVQUFJLGNBQWMsWUFBYSxRQUFPLGFBQWEsWUFBWSxLQUFLLEVBQUUsTUFBTSxHQUFHLEdBQUc7QUFDbEYsYUFBTztBQUFBLElBQ1Q7QUFBQSxFQUNGO0FBR0EsU0FBTywrQkFBK0IsSUFBSSxxQkFBcUI7QUFFL0QsVUFBUSxJQUFJLDBDQUEwQztBQUN4RCxHQUFHOyIsCiAgIm5hbWVzIjogW10KfQo=
