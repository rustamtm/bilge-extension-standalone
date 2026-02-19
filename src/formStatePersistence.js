// formStatePersistence.js - Form state save/restore for recovery after page reloads
// Captures form state with fingerprinting and restores values using self-healing

(function() {
  'use strict';

  if (window.__bilge_formStatePersistence) return;

  const STORAGE_KEY = '__bilge_form_state_v1';
  const MAX_STATES = 50;
  const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  const DEBOUNCE_MS = 1000;

  /**
   * FormStatePersistence - Save and restore form state across page reloads
   */
  class FormStatePersistence {
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
        fields: [],
      };

      const inputs = scope.querySelectorAll('input, textarea, select, [contenteditable="true"]');
      
      for (const element of inputs) {
        if (!this._shouldCapture(element)) continue;

        const field = {
          fingerprint: this._generateFingerprint(element),
          selector: this._generateSelector(element),
          value: this._extractValue(element),
          type: element.type || element.tagName.toLowerCase(),
          name: element.name || '',
          id: element.id || '',
          placeholder: element.placeholder || '',
          autocomplete: element.autocomplete || '',
          checked: element.type === 'checkbox' || element.type === 'radio' ? element.checked : undefined,
        };

        // Only save non-empty values
        if (field.value || field.checked !== undefined) {
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
        element.getAttribute('aria-label'),
        element.placeholder,
        element.getAttribute('data-testid'),
        element.autocomplete,
        this._getFieldLabel(element),
        element.type || element.tagName.toLowerCase(),
      ].filter(Boolean);

      return parts.join('|').slice(0, 200);
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

      // Fallback to nth-of-type
      const parent = element.parentElement;
      if (parent) {
        const tag = element.tagName.toLowerCase();
        const siblings = Array.from(parent.querySelectorAll(tag));
        const index = siblings.indexOf(element);
        if (index >= 0) {
          return `${tag}:nth-of-type(${index + 1})`;
        }
      }

      return '';
    }

    /**
     * Extract value from form element
     * @param {Element} element - Form element
     * @returns {string} Element value
     */
    _extractValue(element) {
      if (element.isContentEditable) {
        return String(element.textContent || '').trim();
      }
      
      if (element.tagName.toLowerCase() === 'select') {
        return element.value;
      }

      if (element.type === 'checkbox' || element.type === 'radio') {
        return element.value; // Actual value, checked state tracked separately
      }

      return String(element.value || '').trim();
    }

    /**
     * Determine if element should be captured
     * @param {Element} element - Form element
     * @returns {boolean} Should capture
     */
    _shouldCapture(element) {
      // Skip hidden, disabled, and special types
      const type = element.type || '';
      if (['hidden', 'submit', 'button', 'image', 'file', 'reset', 'password'].includes(type)) {
        return false;
      }

      // Skip disabled
      if (element.disabled || element.getAttribute('aria-disabled') === 'true') {
        return false;
      }

      // Skip invisible
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
      if (rect.width < 2 || rect.height < 2) {
        return false;
      }

      // Skip sensitive fields
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
        element.getAttribute('aria-label'),
      ].join(' ').toLowerCase();

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
        details: [],
      };

      if (!savedState?.fields || !Array.isArray(savedState.fields)) {
        return results;
      }

      for (const field of savedState.fields) {
        try {
          // Try exact selector first
          let element = null;
          
          if (field.selector) {
            try {
              element = document.querySelector(field.selector);
            } catch (_err) {}
          }

          // Fallback to fingerprint matching via healing engine
          if (!element && healingEngine) {
            const recovery = await healingEngine.attemptRecovery(
              'restore',
              field.fingerprint,
              field.selector ? [field.selector] : [],
              {
                hints: {
                  id: field.id,
                  name: field.name,
                  placeholder: field.placeholder,
                  autocomplete: field.autocomplete,
                },
              }
            );
            
            if (recovery.success && recovery.element) {
              element = recovery.element;
            }
          }

          // Fallback to basic matching
          if (!element) {
            element = this._findByFingerprint(field);
          }

          if (element && this._shouldRestore(element, field)) {
            this._fillField(element, field);
            results.restored += 1;
            results.details.push({
              status: 'restored',
              field: field.name || field.id || 'unknown',
              matchedBy: element === document.querySelector(field.selector) ? 'selector' : 'fingerprint',
            });
          } else if (element) {
            results.skipped += 1;
            results.details.push({
              status: 'skipped',
              field: field.name || field.id || 'unknown',
              reason: 'field has existing value',
            });
          } else {
            results.failed += 1;
            results.details.push({
              status: 'failed',
              field: field.name || field.id || 'unknown',
              reason: 'element not found',
            });
          }
        } catch (err) {
          results.failed += 1;
          results.details.push({
            status: 'failed',
            field: field.name || field.id || 'unknown',
            reason: err.message,
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
        
        // Exact match
        if (fingerprint === field.fingerprint) {
          return element;
        }

        // Partial match (key parts)
        const fieldParts = field.fingerprint.split('|').filter(Boolean);
        const elemParts = fingerprint.split('|').filter(Boolean);
        
        let matchCount = 0;
        for (const part of fieldParts) {
          if (part && elemParts.includes(part)) {
            matchCount += 1;
          }
        }

        // Consider match if >50% parts match and at least 2 parts
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
      // Skip if element has a non-empty value already
      const currentValue = this._extractValue(element);
      if (currentValue && currentValue !== field.value) {
        return false; // Don't overwrite existing values
      }

      // Skip if disabled
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
      } else if (element.type === 'checkbox' || element.type === 'radio') {
        element.checked = field.checked ?? false;
      } else {
        element.value = field.value;
      }

      // Dispatch events
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /**
     * Save current form state to storage
     */
    async saveCurrentState() {
      if (!chrome.runtime?.id) {
        console.debug('[FormStatePersistence] Skipping save: Extension context invalidated.');
        return;
      }
      const state = this.captureFormState();
      if (state.fields.length === 0) return;

      try {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        let states = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];

        // Remove old state for same URL pattern
        states = states.filter(s => s.urlPattern !== state.urlPattern);

        // Add new state
        states.push(state);

        // Prune old states
        const now = Date.now();
        states = states
          .filter(s => now - s.timestamp < TTL_MS)
          .slice(-MAX_STATES);

        await chrome.storage.local.set({ [STORAGE_KEY]: states });
        this.lastSaveTime = now;
      } catch (err) {
        console.error('[FormStatePersistence] Save failed:', err.message);
      }
    }

    /**
     * Load matching state for current URL
     * @returns {Promise<Object|null>} Matching state or null
     */
    async loadMatchingState() {
      if (!chrome.runtime?.id) return null;
      try {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        const states = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
        const currentPattern = this._normalizeUrl(location.href);
        const now = Date.now();

        // Find most recent matching state
        const matching = states
          .filter(s => s.urlPattern === currentPattern && now - s.timestamp < TTL_MS)
          .sort((a, b) => b.timestamp - a.timestamp);

        return matching[0] || null;
      } catch (err) {
        console.error('[FormStatePersistence] Load failed:', err.message);
        return null;
      }
    }

    /**
     * Save state to storage (public method)
     * @param {Object} state - State to save
     */
    async saveToStorage(state) {
      if (!chrome.runtime?.id) return;
      if (!state?.fields?.length) return;

      try {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        let states = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];

        states = states.filter(s => s.urlPattern !== state.urlPattern);
        states.push(state);

        const now = Date.now();
        states = states
          .filter(s => now - s.timestamp < TTL_MS)
          .slice(-MAX_STATES);

        await chrome.storage.local.set({ [STORAGE_KEY]: states });
      } catch (err) {
        console.error('[FormStatePersistence] Save to storage failed:', err.message);
      }
    }

    /**
     * Setup auto-save on form changes
     */
    setupAutoSave() {
      if (this.autoSaveEnabled) return;
      this.autoSaveEnabled = true;

      const debouncedSave = () => {
        if (this.saveTimeout) {
          clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => {
          this.saveCurrentState();
        }, DEBOUNCE_MS);
      };

      // Save on input changes
      document.addEventListener('input', debouncedSave, { passive: true });
      document.addEventListener('change', debouncedSave, { passive: true });

      // Save before unload
      window.addEventListener('beforeunload', () => {
        if (this.saveTimeout) {
          clearTimeout(this.saveTimeout);
        }
        this.saveCurrentState();
      });

      window.addEventListener('pagehide', () => {
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
          urls: states.map(s => s.urlPattern),
          oldest: states.length > 0 ? new Date(Math.min(...states.map(s => s.timestamp))).toISOString() : null,
          newest: states.length > 0 ? new Date(Math.max(...states.map(s => s.timestamp))).toISOString() : null,
        };
      } catch (err) {
        return { count: 0, error: err.message };
      }
    }

    // === Helper methods ===

    _normalizeUrl(url) {
      try {
        const parsed = new URL(url);
        // Normalize by removing common tracking params
        const searchParams = new URLSearchParams(parsed.search);
        const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid', 'ref', 'source'];
        paramsToRemove.forEach(p => searchParams.delete(p));
        
        return `${parsed.hostname}${parsed.pathname}${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
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
      const closestLabel = element.closest('label');
      if (closestLabel?.textContent) return closestLabel.textContent.trim().slice(0, 100);
      return '';
    }
  }

  // Create global instance
  window.__bilge_formStatePersistence = new FormStatePersistence();

  console.log('[Bilge] FormStatePersistence initialized');
})();
