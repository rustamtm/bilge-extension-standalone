/**
 * Bilge Intelligent Shadow DOM Execution Engine
 * Provides autonomous DOM interaction, semantic understanding, and self-healing.
 */

(function() {
  'use strict';

  if (window.__bilge_execution_engine) return;

  class BilgeExecutionEngine {
    constructor() {
      this.shadowHost = null;
      this.shadowRoot = null;
      this.domGraph = new Map();
      this.interactionLog = [];
      this.executionContext = null;
      
      console.log("[Bilge] Execution Engine Initializing...");
      this._init();
    }

    _init() {
      // Create isolated shadow DOM container (closed for maximum isolation)
      try {
        this.shadowHost = document.createElement('bilge-engine');
        this.shadowHost.style.cssText = 'display:none!important;position:absolute!important;width:0;height:0;z-index:-1;';
        this.shadowRoot = this.shadowHost.attachShadow({ mode: 'closed' });
        document.documentElement.appendChild(this.shadowHost);
      } catch (e) {
        console.warn("[Bilge] Shadow DOM isolation not supported or restricted", e);
      }

      // Initial full scan
      this.scanDOM();
      
      // Setup listener for remote commands
      this._setupMessageListener();
    }

    _setupMessageListener() {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'ENGINE_EXECUTE') {
          this.execute(request.intent, request.data)
            .then(res => sendResponse(res))
            .catch(err => sendResponse({ ok: false, error: err.message }));
          return true; // async
        }
        if (request.type === 'ENGINE_SCAN') {
          sendResponse({ ok: true, scan: this.scanDOM() });
          return false;
        }
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // DOM SCANNER
    // ═══════════════════════════════════════════════════════════════

    scanDOM(root = document) {
      const scan = {
        timestamp: Date.now(),
        url: location.href,
        title: document.title,
        fields: [],
        actions: [],
        regions: [],
        frames: [],
        shadows: []
      };

      this._scanNode(root, scan, []);
      this._buildFieldGraph(scan);
      return scan;
    }

    _scanNode(node, scan, path) {
      if (!node) return;

      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node;

        if (this._isInteractive(el)) {
          const fieldData = this._extractFieldData(el, path);
          if (['input', 'select', 'textarea'].includes(fieldData.type)) {
            scan.fields.push(fieldData);
          } else {
            scan.actions.push(fieldData);
          }
        }

        if (this._isSemanticRegion(el)) {
          scan.regions.push({
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute('role'),
            label: this._getAccessibleName(el),
            path: [...path]
          });
        }

        if (el.tagName === 'IFRAME') {
          try {
            const frameDoc = el.contentDocument || el.contentWindow?.document;
            if (frameDoc) {
              const framePath = [...path, `iframe[${scan.frames.length}]`];
              scan.frames.push({
                src: el.src,
                id: el.id,
                name: el.name,
                path: framePath,
                accessible: true
              });
              this._scanNode(frameDoc.body, scan, framePath);
            }
          } catch (e) {
            scan.frames.push({
              src: el.src,
              id: el.id,
              accessible: false,
              error: 'cross-origin'
            });
          }
        }

        if (el.shadowRoot) {
          const shadowPath = [...path, `shadow[${el.tagName.toLowerCase()}]`];
          scan.shadows.push({
            host: el.tagName.toLowerCase(),
            id: el.id,
            path: shadowPath
          });
          this._scanNode(el.shadowRoot, scan, shadowPath);
        }

        for (const child of el.children) {
          this._scanNode(child, scan, [...path, this._getNodeIdentifier(el)]);
        }
      }
    }

    _isInteractive(el) {
      const interactiveTags = ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'];
      const interactiveRoles = ['button', 'link', 'textbox', 'combobox', 'listbox', 'checkbox', 'radio', 'switch', 'tab'];

      if (interactiveTags.includes(el.tagName)) return true;
      if (el.getAttribute('role') && interactiveRoles.includes(el.getAttribute('role'))) return true;
      if (el.getAttribute('contenteditable') === 'true') return true;
      if (el.onclick || el.getAttribute('onclick')) return true;
      if (el.tabIndex >= 0) return true;

      const style = getComputedStyle(el);
      if (style.cursor === 'pointer') return true;

      return false;
    }

    _isSemanticRegion(el) {
      const regionTags = ['HEADER', 'FOOTER', 'NAV', 'MAIN', 'ASIDE', 'SECTION', 'ARTICLE', 'FORM'];
      const regionRoles = ['banner', 'contentinfo', 'navigation', 'main', 'complementary', 'region', 'article', 'form', 'search'];
      return regionTags.includes(el.tagName) || (el.getAttribute('role') && regionRoles.includes(el.getAttribute('role')));
    }

    _extractFieldData(el, path) {
      const rect = el.getBoundingClientRect();
      const computedStyle = getComputedStyle(el);

      return {
        id: el.id || null,
        name: el.name || null,
        type: this._classifyElementType(el),
        inputType: el.type || null,
        tag: el.tagName.toLowerCase(),
        label: this._findLabel(el),
        placeholder: el.placeholder || null,
        ariaLabel: el.getAttribute('aria-label'),
        value: this._getElementValue(el),
        visible: this._isVisible(el, rect, computedStyle),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        path: [...path, this._getNodeIdentifier(el)],
        selectors: this._generateSelectors(el)
      };
    }

    _classifyElementType(el) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'input') return 'input';
      if (tag === 'select') return 'select';
      if (tag === 'textarea') return 'textarea';
      if (tag === 'button' || (tag === 'input' && ['button', 'submit', 'reset'].includes(el.type))) return 'button';
      if (tag === 'a') return 'link';
      return 'other';
    }

    _getNodeIdentifier(el) {
      if (el.id) return `#${el.id}`;
      let id = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.split(/\s+/).filter(c => c && !c.match(/^(ng-|_|jsx-)/));
        if (classes.length > 0) id += `.${classes[0]}`;
      }
      return id;
    }

    // ═══════════════════════════════════════════════════════════════
    // SELECTOR GENERATOR
    // ═══════════════════════════════════════════════════════════════

    _generateSelectors(el) {
      const selectors = [];

      if (el.id) {
        selectors.push({ type: 'id', selector: `#${CSS.escape(el.id)}`, confidence: 1.0 });
      }

      const stableAttrs = ['data-testid', 'data-qa', 'data-cy', 'data-test', 'name', 'aria-label'];
      for (const attr of stableAttrs) {
        const value = el.getAttribute(attr);
        if (value) {
          const selector = `[${attr}="${CSS.escape(value)}"]`;
          try {
            if (document.querySelectorAll(selector).length === 1) {
              selectors.push({ type: attr, selector, confidence: 0.95 });
            }
          } catch(e) {}
        }
      }

      const uniquePath = this._computeUniquePath(el);
      if (uniquePath) {
        selectors.push({ type: 'path', selector: uniquePath, confidence: 0.7 });
      }

      return selectors;
    }

    _computeUniquePath(el) {
      const parts = [];
      let current = el;

      while (current && current !== document.body) {
        let selector = current.tagName.toLowerCase();
        if (current.id) {
          selector = `#${CSS.escape(current.id)}`;
          parts.unshift(selector);
          break;
        }
        const siblings = Array.from(current.parentElement?.children || []).filter(
          s => s.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
        parts.unshift(selector);
        current = current.parentElement;
      }
      return parts.join(' > ');
    }

    // ═══════════════════════════════════════════════════════════════
    // FIELD GRAPH
    // ═══════════════════════════════════════════════════════════════

    _buildFieldGraph(scan) {
      this.domGraph.clear();
      for (const field of scan.fields) {
        const semanticType = this._inferSemanticType(field);
        const node = {
          ...field,
          semanticType,
          relationships: {
            confirmationField: this._findConfirmationField(field, scan.fields)
          }
        };
        this.domGraph.set(field.selectors[0]?.selector || field.path.join('/'), node);
      }
    }

    _inferSemanticType(field) {
      const hints = [field.name, field.id, field.label, field.placeholder, field.ariaLabel]
        .filter(Boolean).map(s => s.toLowerCase());

      const patterns = {
        email: /email|e-mail/,
        password: /password|passwd|pwd/,
        firstName: /first[_-]?name|given[_-]?name|fname/,
        lastName: /last[_-]?name|family[_-]?name|lname/,
        phone: /phone|tel|mobile/,
        address: /address|street/,
        city: /city|ciudad/,
        state: /state|province/,
        zip: /zip|postal/,
        country: /country|pais/
      };

      for (const [type, pattern] of Object.entries(patterns)) {
        if (hints.some(h => pattern.test(h))) return type;
      }
      return 'unknown';
    }

    _findConfirmationField(field, allFields) {
      if (!['email', 'password'].includes(this._inferSemanticType(field))) return null;
      const confirmPatterns = /confirm|verify|repeat|retype|re-enter/i;
      return allFields.find(f => {
        if (f === field) return false;
        if (this._inferSemanticType(f) !== this._inferSemanticType(field)) return false;
        const hints = [f.name, f.id, f.label, f.placeholder].filter(Boolean);
        return hints.some(h => confirmPatterns.test(h));
      })?.selectors[0]?.selector || null;
    }

    // ═══════════════════════════════════════════════════════════════
    // INTELLIGENT EXECUTOR
    // ═══════════════════════════════════════════════════════════════

    async _loadUserProfile() {
      try {
        const result = await new Promise((resolve) => {
          try {
            chrome.storage.local.get(['bilge_user_profile'], (res) => resolve(res || {}));
          } catch (_err) {
            resolve({});
          }
        });
        return (result && result.bilge_user_profile && typeof result.bilge_user_profile === 'object')
          ? result.bilge_user_profile
          : {};
      } catch (_err) {
        return {};
      }
    }

    _normalizeUserProfile(rawProfile) {
      const p = rawProfile && typeof rawProfile === 'object' ? rawProfile : {};
      const firstName = p.firstName || p.first_name || p.givenName || p.given_name || '';
      const lastName = p.lastName || p.last_name || p.familyName || p.family_name || '';
      const email = p.email || '';
      const phone = p.phone || p.phoneNumber || p.phone_number || '';
      const address = p.address || p.address1 || p.addressLine1 || p.address_line1 || '';
      const city = p.city || '';
      const state = p.state || p.province || '';
      const zip = p.zip || p.zipCode || p.postalCode || p.postal_code || '';

      return { ...p, firstName, lastName, email, phone, address, city, state, zip };
    }

    /**
     * Lightweight natural-language entrypoint used by content.js fallback:
     * - Detect "fill form" and use semantic mapping + stored profile
     * - For other commands, fall back to _executeIntelligent heuristics
     */
    async run(command) {
      const raw = String(command || '').trim();
      if (!raw) return { ok: false, error: 'Empty command' };
      const lower = raw.toLowerCase();

      const stepRequested =
        /\b(one\s+field\s+at\s+a\s+time|field\s+by\s+field|step\s+by\s+step|one\s+by\s+one|one\s+at\s+a\s+time)\b/i.test(raw);
      const noSubmitRequested =
        /\b(do\s+not|don't|dont|no)\s+submit\b|\bwithout\s+submitting\b|\bno\s+submission\b/i.test(raw);
      const looksLikeFillForm = /\b(fill|complete|populate)\b/i.test(raw) && /\b(form|fields?)\b/i.test(raw);

      // Mirror the direct-pattern state so follow-up commands like "next" can be interpreted safely.
      const state = (window.__bilge_direct_fill_form_state =
        window.__bilge_direct_fill_form_state || { stepMode: false, noSubmit: false, updatedAt: 0 });
      if (stepRequested) state.stepMode = true;
      if (noSubmitRequested) state.noSubmit = true;
      state.updatedAt = Date.now();

      if (looksLikeFillForm) {
        const stored = await this._loadUserProfile();
        const profile = this._normalizeUserProfile(stored);
        const maxFields = stepRequested ? 1 : undefined;
        return await this.execute({ type: 'fill_form' }, { profile, maxFields });
      }

      // Extract value for "fill X with Y" so _executeIntelligent can actually fill.
      const fillMatch = raw.match(/^(?:please\s+)?(fill|type|enter|write)\s+(?:in\s+)?["']?(.+?)["']?\s+(?:with|as|to|=)\s+["']?(.+?)["']?$/i);
      if (fillMatch) {
        const value = String(fillMatch[3] || '');
        return await this.execute(raw, { value });
      }

      return await this.execute(raw, {});
    }

    async execute(intent, data = {}) {
      this.executionContext = { intent, data, startTime: Date.now(), errors: [] };
      const scan = this.scanDOM();

      switch (intent.type) {
        case 'fill_form': return await this._executeFillForm(scan, data);
        case 'click': return await this._executeClick(scan, data);
        case 'intelligent': return await this._executeIntelligent(scan, intent, data);
        default: return await this._executeIntelligent(scan, intent, data);
      }
    }

    async _executeFillForm(scan, data) {
      const profile = data.profile || {};
      const results = [];
      const fillOrder = scan.fields;
      const maxFieldsRaw = data.maxFields ?? data.max_fields ?? data.max ?? null;
      const maxFields = Number(maxFieldsRaw);
      const limit = Number.isFinite(maxFields) && maxFields > 0 ? Math.floor(maxFields) : null;
      let filledOk = 0;

      for (const field of fillOrder) {
        const node = this.domGraph.get(field.selectors[0]?.selector);
        if (!node) continue;
        const value = this._resolveProfileValue(node.semanticType, profile);
        if (!value) continue;

        const result = await this._fillFieldWithRetry(field, value);
        results.push(result);
        if (result && result.ok) filledOk += 1;
        await this._delay(100);
        if (limit && filledOk >= limit) break;
      }
      return { ok: filledOk > 0, filled: filledOk, results };
    }

    async _fillFieldWithRetry(field, value) {
      const strategies = [
        () => this._fillNative(field, value),
        () => this._fillWithEvents(field, value),
        () => this._fillWithReactOverride(field, value)
      ];

      for (const strategy of strategies) {
        try {
          const res = await strategy();
          if (res.ok) return res;
        } catch(e) {}
      }
      return { ok: false, error: 'All fill strategies failed' };
    }

    _fillNative(field, value) {
      const el = this._resolveElement(field);
      if (!el) return { ok: false };
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    }

    _fillWithEvents(field, value) {
      const el = this._resolveElement(field);
      if (!el) return { ok: false };
      el.focus();
      el.value = '';
      for (const char of value) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
        el.value += char;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    }

    _fillWithReactOverride(field, value) {
      const el = this._resolveElement(field);
      if (!el) return { ok: false };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true };
      }
      return { ok: false };
    }

    async _executeClick(scan, data) {
      const target = data.target || data.selector;
      const el = this._resolveElement({ selectors: [{ selector: target }] });
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.click();
        return { ok: true };
      }
      return { ok: false, error: 'Click target not found' };
    }

    async _executeIntelligent(scan, intent, data) {
      const text = typeof intent === 'string' ? intent : intent.text || '';
      const actionMatch = text.match(/^(fill|type|click|press|tap|scroll)\s/i);
      const action = actionMatch ? actionMatch[1].toLowerCase() : 'click';
      
      const candidates = [...scan.fields, ...scan.actions];
      const targetText = text.replace(actionMatch?.[0] || '', '').trim();
      
      const ranked = candidates.map(c => {
        let score = 0;
        const search = [c.label, c.name, c.id, c.placeholder].filter(Boolean).map(s => s.toLowerCase());
        if (search.some(s => s === targetText.toLowerCase())) score += 100;
        else if (search.some(s => s.includes(targetText.toLowerCase()))) score += 50;
        return { ...c, score };
      }).sort((a, b) => b.score - a.score);

      if (ranked[0]?.score > 0) {
        if (['fill', 'type'].includes(action)) return await this._fillFieldWithRetry(ranked[0], data.value || "");
        return await this._executeClick(scan, { selector: ranked[0].selectors[0].selector });
      }
      
      return { ok: false, error: 'Could not infer target for intelligent execution' };
    }

    _resolveElement(field) {
      for (const s of field.selectors || []) {
        try {
          const el = document.querySelector(s.selector);
          if (el) return el;
        } catch(e) {}
      }
      return null;
    }

    _resolveProfileValue(semanticType, profile) {
      const mapping = {
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone,
        address: profile.address,
        city: profile.city,
        state: profile.state,
        zip: profile.zip
      };
      return mapping[semanticType] || profile[semanticType];
    }

    _findLabel(el) {
      if (el.id) {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label) return label.textContent.trim();
      }
      const parentLabel = el.closest('label');
      if (parentLabel) return parentLabel.textContent.trim();
      return null;
    }

    _isVisible(el, rect, style) {
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0;
    }

    _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    _getAccessibleName(el) {
      return el.getAttribute('aria-label') || el.title || el.innerText || "";
    }
  }

  window.__bilge_execution_engine = new BilgeExecutionEngine();
})();
