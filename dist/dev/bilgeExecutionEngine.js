var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/bilgeExecutionEngine.js
(function() {
  "use strict";
  if (window.__bilge_execution_engine) return;
  class BilgeExecutionEngine {
    static {
      __name(this, "BilgeExecutionEngine");
    }
    constructor() {
      this.shadowHost = null;
      this.shadowRoot = null;
      this.domGraph = /* @__PURE__ */ new Map();
      this.interactionLog = [];
      this.executionContext = null;
      console.log("[Bilge] Execution Engine Initializing...");
      this._init();
    }
    _init() {
      try {
        this.shadowHost = document.createElement("bilge-engine");
        this.shadowHost.style.cssText = "display:none!important;position:absolute!important;width:0;height:0;z-index:-1;";
        this.shadowRoot = this.shadowHost.attachShadow({ mode: "closed" });
        document.documentElement.appendChild(this.shadowHost);
      } catch (e) {
        console.warn("[Bilge] Shadow DOM isolation not supported or restricted", e);
      }
      this.scanDOM();
      this._setupMessageListener();
    }
    _setupMessageListener() {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === "ENGINE_EXECUTE") {
          this.execute(request.intent, request.data).then((res) => sendResponse(res)).catch((err) => sendResponse({ ok: false, error: err.message }));
          return true;
        }
        if (request.type === "ENGINE_SCAN") {
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
          if (["input", "select", "textarea"].includes(fieldData.type)) {
            scan.fields.push(fieldData);
          } else {
            scan.actions.push(fieldData);
          }
        }
        if (this._isSemanticRegion(el)) {
          scan.regions.push({
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute("role"),
            label: this._getAccessibleName(el),
            path: [...path]
          });
        }
        if (el.tagName === "IFRAME") {
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
              error: "cross-origin"
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
      const interactiveTags = ["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"];
      const interactiveRoles = ["button", "link", "textbox", "combobox", "listbox", "checkbox", "radio", "switch", "tab"];
      if (interactiveTags.includes(el.tagName)) return true;
      if (el.getAttribute("role") && interactiveRoles.includes(el.getAttribute("role"))) return true;
      if (el.getAttribute("contenteditable") === "true") return true;
      if (el.onclick || el.getAttribute("onclick")) return true;
      if (el.tabIndex >= 0) return true;
      const style = getComputedStyle(el);
      if (style.cursor === "pointer") return true;
      return false;
    }
    _isSemanticRegion(el) {
      const regionTags = ["HEADER", "FOOTER", "NAV", "MAIN", "ASIDE", "SECTION", "ARTICLE", "FORM"];
      const regionRoles = ["banner", "contentinfo", "navigation", "main", "complementary", "region", "article", "form", "search"];
      return regionTags.includes(el.tagName) || el.getAttribute("role") && regionRoles.includes(el.getAttribute("role"));
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
        ariaLabel: el.getAttribute("aria-label"),
        value: this._getElementValue(el),
        visible: this._isVisible(el, rect, computedStyle),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        path: [...path, this._getNodeIdentifier(el)],
        selectors: this._generateSelectors(el)
      };
    }
    _classifyElementType(el) {
      const tag = el.tagName.toLowerCase();
      if (tag === "input") return "input";
      if (tag === "select") return "select";
      if (tag === "textarea") return "textarea";
      if (tag === "button" || tag === "input" && ["button", "submit", "reset"].includes(el.type)) return "button";
      if (tag === "a") return "link";
      return "other";
    }
    _getNodeIdentifier(el) {
      if (el.id) return `#${el.id}`;
      let id = el.tagName.toLowerCase();
      if (el.className && typeof el.className === "string") {
        const classes = el.className.split(/\s+/).filter((c) => c && !c.match(/^(ng-|_|jsx-)/));
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
        selectors.push({ type: "id", selector: `#${CSS.escape(el.id)}`, confidence: 1 });
      }
      const stableAttrs = ["data-testid", "data-qa", "data-cy", "data-test", "name", "aria-label"];
      for (const attr of stableAttrs) {
        const value = el.getAttribute(attr);
        if (value) {
          const selector = `[${attr}="${CSS.escape(value)}"]`;
          try {
            if (document.querySelectorAll(selector).length === 1) {
              selectors.push({ type: attr, selector, confidence: 0.95 });
            }
          } catch (e) {
          }
        }
      }
      const uniquePath = this._computeUniquePath(el);
      if (uniquePath) {
        selectors.push({ type: "path", selector: uniquePath, confidence: 0.7 });
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
          (s) => s.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
        parts.unshift(selector);
        current = current.parentElement;
      }
      return parts.join(" > ");
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
        this.domGraph.set(field.selectors[0]?.selector || field.path.join("/"), node);
      }
    }
    _inferSemanticType(field) {
      const hints = [field.name, field.id, field.label, field.placeholder, field.ariaLabel].filter(Boolean).map((s) => s.toLowerCase());
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
        if (hints.some((h) => pattern.test(h))) return type;
      }
      return "unknown";
    }
    _findConfirmationField(field, allFields) {
      if (!["email", "password"].includes(this._inferSemanticType(field))) return null;
      const confirmPatterns = /confirm|verify|repeat|retype|re-enter/i;
      return allFields.find((f) => {
        if (f === field) return false;
        if (this._inferSemanticType(f) !== this._inferSemanticType(field)) return false;
        const hints = [f.name, f.id, f.label, f.placeholder].filter(Boolean);
        return hints.some((h) => confirmPatterns.test(h));
      })?.selectors[0]?.selector || null;
    }
    // ═══════════════════════════════════════════════════════════════
    // INTELLIGENT EXECUTOR
    // ═══════════════════════════════════════════════════════════════
    async _loadUserProfile() {
      try {
        const result = await new Promise((resolve) => {
          try {
            chrome.storage.local.get(["bilge_user_profile"], (res) => resolve(res || {}));
          } catch (_err) {
            resolve({});
          }
        });
        return result && result.bilge_user_profile && typeof result.bilge_user_profile === "object" ? result.bilge_user_profile : {};
      } catch (_err) {
        return {};
      }
    }
    _normalizeUserProfile(rawProfile) {
      const p = rawProfile && typeof rawProfile === "object" ? rawProfile : {};
      const firstName = p.firstName || p.first_name || p.givenName || p.given_name || "";
      const lastName = p.lastName || p.last_name || p.familyName || p.family_name || "";
      const email = p.email || "";
      const phone = p.phone || p.phoneNumber || p.phone_number || "";
      const address = p.address || p.address1 || p.addressLine1 || p.address_line1 || "";
      const city = p.city || "";
      const state = p.state || p.province || "";
      const zip = p.zip || p.zipCode || p.postalCode || p.postal_code || "";
      return { ...p, firstName, lastName, email, phone, address, city, state, zip };
    }
    /**
     * Lightweight natural-language entrypoint used by content.js fallback:
     * - Detect "fill form" and use semantic mapping + stored profile
     * - For other commands, fall back to _executeIntelligent heuristics
     */
    async run(command) {
      const raw = String(command || "").trim();
      if (!raw) return { ok: false, error: "Empty command" };
      const lower = raw.toLowerCase();
      const stepRequested = /\b(one\s+field\s+at\s+a\s+time|field\s+by\s+field|step\s+by\s+step|one\s+by\s+one|one\s+at\s+a\s+time)\b/i.test(raw);
      const noSubmitRequested = /\b(do\s+not|don't|dont|no)\s+submit\b|\bwithout\s+submitting\b|\bno\s+submission\b/i.test(raw);
      const looksLikeFillForm = /\b(fill|complete|populate)\b/i.test(raw) && /\b(form|fields?)\b/i.test(raw);
      const state = window.__bilge_direct_fill_form_state = window.__bilge_direct_fill_form_state || { stepMode: false, noSubmit: false, updatedAt: 0 };
      if (stepRequested) state.stepMode = true;
      if (noSubmitRequested) state.noSubmit = true;
      state.updatedAt = Date.now();
      if (looksLikeFillForm) {
        const stored = await this._loadUserProfile();
        const profile = this._normalizeUserProfile(stored);
        const maxFields = stepRequested ? 1 : void 0;
        return await this.execute({ type: "fill_form" }, { profile, maxFields });
      }
      const fillMatch = raw.match(/^(?:please\s+)?(fill|type|enter|write)\s+(?:in\s+)?["']?(.+?)["']?\s+(?:with|as|to|=)\s+["']?(.+?)["']?$/i);
      if (fillMatch) {
        const value = String(fillMatch[3] || "");
        return await this.execute(raw, { value });
      }
      return await this.execute(raw, {});
    }
    async execute(intent, data = {}) {
      this.executionContext = { intent, data, startTime: Date.now(), errors: [] };
      const scan = this.scanDOM();
      switch (intent.type) {
        case "fill_form":
          return await this._executeFillForm(scan, data);
        case "click":
          return await this._executeClick(scan, data);
        case "intelligent":
          return await this._executeIntelligent(scan, intent, data);
        default:
          return await this._executeIntelligent(scan, intent, data);
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
        } catch (e) {
        }
      }
      return { ok: false, error: "All fill strategies failed" };
    }
    _fillNative(field, value) {
      const el = this._resolveElement(field);
      if (!el) return { ok: false };
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    }
    _fillWithEvents(field, value) {
      const el = this._resolveElement(field);
      if (!el) return { ok: false };
      el.focus();
      el.value = "";
      for (const char of value) {
        el.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
        el.value += char;
        el.dispatchEvent(new InputEvent("input", { bubbles: true, data: char, inputType: "insertText" }));
        el.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
      }
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    }
    _fillWithReactOverride(field, value) {
      const el = this._resolveElement(field);
      if (!el) return { ok: false };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      if (setter) {
        setter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true };
      }
      return { ok: false };
    }
    async _executeClick(scan, data) {
      const target = data.target || data.selector;
      const el = this._resolveElement({ selectors: [{ selector: target }] });
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.click();
        return { ok: true };
      }
      return { ok: false, error: "Click target not found" };
    }
    async _executeIntelligent(scan, intent, data) {
      const text = typeof intent === "string" ? intent : intent.text || "";
      const actionMatch = text.match(/^(fill|type|click|press|tap|scroll)\s/i);
      const action = actionMatch ? actionMatch[1].toLowerCase() : "click";
      const candidates = [...scan.fields, ...scan.actions];
      const targetText = text.replace(actionMatch?.[0] || "", "").trim();
      const ranked = candidates.map((c) => {
        let score = 0;
        const search = [c.label, c.name, c.id, c.placeholder].filter(Boolean).map((s) => s.toLowerCase());
        if (search.some((s) => s === targetText.toLowerCase())) score += 100;
        else if (search.some((s) => s.includes(targetText.toLowerCase()))) score += 50;
        return { ...c, score };
      }).sort((a, b) => b.score - a.score);
      if (ranked[0]?.score > 0) {
        if (["fill", "type"].includes(action)) return await this._fillFieldWithRetry(ranked[0], data.value || "");
        return await this._executeClick(scan, { selector: ranked[0].selectors[0].selector });
      }
      return { ok: false, error: "Could not infer target for intelligent execution" };
    }
    _resolveElement(field) {
      for (const s of field.selectors || []) {
        try {
          const el = document.querySelector(s.selector);
          if (el) return el;
        } catch (e) {
        }
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
      const parentLabel = el.closest("label");
      if (parentLabel) return parentLabel.textContent.trim();
      return null;
    }
    _isVisible(el, rect, style) {
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0;
    }
    _delay(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }
    _getAccessibleName(el) {
      return el.getAttribute("aria-label") || el.title || el.innerText || "";
    }
  }
  window.__bilge_execution_engine = new BilgeExecutionEngine();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL2JpbGdlRXhlY3V0aW9uRW5naW5lLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKipcbiAqIEJpbGdlIEludGVsbGlnZW50IFNoYWRvdyBET00gRXhlY3V0aW9uIEVuZ2luZVxuICogUHJvdmlkZXMgYXV0b25vbW91cyBET00gaW50ZXJhY3Rpb24sIHNlbWFudGljIHVuZGVyc3RhbmRpbmcsIGFuZCBzZWxmLWhlYWxpbmcuXG4gKi9cblxuKGZ1bmN0aW9uKCkge1xuICAndXNlIHN0cmljdCc7XG5cbiAgaWYgKHdpbmRvdy5fX2JpbGdlX2V4ZWN1dGlvbl9lbmdpbmUpIHJldHVybjtcblxuICBjbGFzcyBCaWxnZUV4ZWN1dGlvbkVuZ2luZSB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICB0aGlzLnNoYWRvd0hvc3QgPSBudWxsO1xuICAgICAgdGhpcy5zaGFkb3dSb290ID0gbnVsbDtcbiAgICAgIHRoaXMuZG9tR3JhcGggPSBuZXcgTWFwKCk7XG4gICAgICB0aGlzLmludGVyYWN0aW9uTG9nID0gW107XG4gICAgICB0aGlzLmV4ZWN1dGlvbkNvbnRleHQgPSBudWxsO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhcIltCaWxnZV0gRXhlY3V0aW9uIEVuZ2luZSBJbml0aWFsaXppbmcuLi5cIik7XG4gICAgICB0aGlzLl9pbml0KCk7XG4gICAgfVxuXG4gICAgX2luaXQoKSB7XG4gICAgICAvLyBDcmVhdGUgaXNvbGF0ZWQgc2hhZG93IERPTSBjb250YWluZXIgKGNsb3NlZCBmb3IgbWF4aW11bSBpc29sYXRpb24pXG4gICAgICB0cnkge1xuICAgICAgICB0aGlzLnNoYWRvd0hvc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdiaWxnZS1lbmdpbmUnKTtcbiAgICAgICAgdGhpcy5zaGFkb3dIb3N0LnN0eWxlLmNzc1RleHQgPSAnZGlzcGxheTpub25lIWltcG9ydGFudDtwb3NpdGlvbjphYnNvbHV0ZSFpbXBvcnRhbnQ7d2lkdGg6MDtoZWlnaHQ6MDt6LWluZGV4Oi0xOyc7XG4gICAgICAgIHRoaXMuc2hhZG93Um9vdCA9IHRoaXMuc2hhZG93SG9zdC5hdHRhY2hTaGFkb3coeyBtb2RlOiAnY2xvc2VkJyB9KTtcbiAgICAgICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuc2hhZG93SG9zdCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcIltCaWxnZV0gU2hhZG93IERPTSBpc29sYXRpb24gbm90IHN1cHBvcnRlZCBvciByZXN0cmljdGVkXCIsIGUpO1xuICAgICAgfVxuXG4gICAgICAvLyBJbml0aWFsIGZ1bGwgc2NhblxuICAgICAgdGhpcy5zY2FuRE9NKCk7XG4gICAgICBcbiAgICAgIC8vIFNldHVwIGxpc3RlbmVyIGZvciByZW1vdGUgY29tbWFuZHNcbiAgICAgIHRoaXMuX3NldHVwTWVzc2FnZUxpc3RlbmVyKCk7XG4gICAgfVxuXG4gICAgX3NldHVwTWVzc2FnZUxpc3RlbmVyKCkge1xuICAgICAgY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKChyZXF1ZXN0LCBzZW5kZXIsIHNlbmRSZXNwb25zZSkgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC50eXBlID09PSAnRU5HSU5FX0VYRUNVVEUnKSB7XG4gICAgICAgICAgdGhpcy5leGVjdXRlKHJlcXVlc3QuaW50ZW50LCByZXF1ZXN0LmRhdGEpXG4gICAgICAgICAgICAudGhlbihyZXMgPT4gc2VuZFJlc3BvbnNlKHJlcykpXG4gICAgICAgICAgICAuY2F0Y2goZXJyID0+IHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pKTtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTsgLy8gYXN5bmNcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdC50eXBlID09PSAnRU5HSU5FX1NDQU4nKSB7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IHRydWUsIHNjYW46IHRoaXMuc2NhbkRPTSgpIH0pO1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXG4gICAgLy8gRE9NIFNDQU5ORVJcbiAgICAvLyBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcblxuICAgIHNjYW5ET00ocm9vdCA9IGRvY3VtZW50KSB7XG4gICAgICBjb25zdCBzY2FuID0ge1xuICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICAgIHVybDogbG9jYXRpb24uaHJlZixcbiAgICAgICAgdGl0bGU6IGRvY3VtZW50LnRpdGxlLFxuICAgICAgICBmaWVsZHM6IFtdLFxuICAgICAgICBhY3Rpb25zOiBbXSxcbiAgICAgICAgcmVnaW9uczogW10sXG4gICAgICAgIGZyYW1lczogW10sXG4gICAgICAgIHNoYWRvd3M6IFtdXG4gICAgICB9O1xuXG4gICAgICB0aGlzLl9zY2FuTm9kZShyb290LCBzY2FuLCBbXSk7XG4gICAgICB0aGlzLl9idWlsZEZpZWxkR3JhcGgoc2Nhbik7XG4gICAgICByZXR1cm4gc2NhbjtcbiAgICB9XG5cbiAgICBfc2Nhbk5vZGUobm9kZSwgc2NhbiwgcGF0aCkge1xuICAgICAgaWYgKCFub2RlKSByZXR1cm47XG5cbiAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERSkge1xuICAgICAgICBjb25zdCBlbCA9IG5vZGU7XG5cbiAgICAgICAgaWYgKHRoaXMuX2lzSW50ZXJhY3RpdmUoZWwpKSB7XG4gICAgICAgICAgY29uc3QgZmllbGREYXRhID0gdGhpcy5fZXh0cmFjdEZpZWxkRGF0YShlbCwgcGF0aCk7XG4gICAgICAgICAgaWYgKFsnaW5wdXQnLCAnc2VsZWN0JywgJ3RleHRhcmVhJ10uaW5jbHVkZXMoZmllbGREYXRhLnR5cGUpKSB7XG4gICAgICAgICAgICBzY2FuLmZpZWxkcy5wdXNoKGZpZWxkRGF0YSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNjYW4uYWN0aW9ucy5wdXNoKGZpZWxkRGF0YSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX2lzU2VtYW50aWNSZWdpb24oZWwpKSB7XG4gICAgICAgICAgc2Nhbi5yZWdpb25zLnB1c2goe1xuICAgICAgICAgICAgdGFnOiBlbC50YWdOYW1lLnRvTG93ZXJDYXNlKCksXG4gICAgICAgICAgICByb2xlOiBlbC5nZXRBdHRyaWJ1dGUoJ3JvbGUnKSxcbiAgICAgICAgICAgIGxhYmVsOiB0aGlzLl9nZXRBY2Nlc3NpYmxlTmFtZShlbCksXG4gICAgICAgICAgICBwYXRoOiBbLi4ucGF0aF1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChlbC50YWdOYW1lID09PSAnSUZSQU1FJykge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmcmFtZURvYyA9IGVsLmNvbnRlbnREb2N1bWVudCB8fCBlbC5jb250ZW50V2luZG93Py5kb2N1bWVudDtcbiAgICAgICAgICAgIGlmIChmcmFtZURvYykge1xuICAgICAgICAgICAgICBjb25zdCBmcmFtZVBhdGggPSBbLi4ucGF0aCwgYGlmcmFtZVske3NjYW4uZnJhbWVzLmxlbmd0aH1dYF07XG4gICAgICAgICAgICAgIHNjYW4uZnJhbWVzLnB1c2goe1xuICAgICAgICAgICAgICAgIHNyYzogZWwuc3JjLFxuICAgICAgICAgICAgICAgIGlkOiBlbC5pZCxcbiAgICAgICAgICAgICAgICBuYW1lOiBlbC5uYW1lLFxuICAgICAgICAgICAgICAgIHBhdGg6IGZyYW1lUGF0aCxcbiAgICAgICAgICAgICAgICBhY2Nlc3NpYmxlOiB0cnVlXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB0aGlzLl9zY2FuTm9kZShmcmFtZURvYy5ib2R5LCBzY2FuLCBmcmFtZVBhdGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHNjYW4uZnJhbWVzLnB1c2goe1xuICAgICAgICAgICAgICBzcmM6IGVsLnNyYyxcbiAgICAgICAgICAgICAgaWQ6IGVsLmlkLFxuICAgICAgICAgICAgICBhY2Nlc3NpYmxlOiBmYWxzZSxcbiAgICAgICAgICAgICAgZXJyb3I6ICdjcm9zcy1vcmlnaW4nXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZWwuc2hhZG93Um9vdCkge1xuICAgICAgICAgIGNvbnN0IHNoYWRvd1BhdGggPSBbLi4ucGF0aCwgYHNoYWRvd1ske2VsLnRhZ05hbWUudG9Mb3dlckNhc2UoKX1dYF07XG4gICAgICAgICAgc2Nhbi5zaGFkb3dzLnB1c2goe1xuICAgICAgICAgICAgaG9zdDogZWwudGFnTmFtZS50b0xvd2VyQ2FzZSgpLFxuICAgICAgICAgICAgaWQ6IGVsLmlkLFxuICAgICAgICAgICAgcGF0aDogc2hhZG93UGF0aFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHRoaXMuX3NjYW5Ob2RlKGVsLnNoYWRvd1Jvb3QsIHNjYW4sIHNoYWRvd1BhdGgpO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBlbC5jaGlsZHJlbikge1xuICAgICAgICAgIHRoaXMuX3NjYW5Ob2RlKGNoaWxkLCBzY2FuLCBbLi4ucGF0aCwgdGhpcy5fZ2V0Tm9kZUlkZW50aWZpZXIoZWwpXSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBfaXNJbnRlcmFjdGl2ZShlbCkge1xuICAgICAgY29uc3QgaW50ZXJhY3RpdmVUYWdzID0gWydJTlBVVCcsICdTRUxFQ1QnLCAnVEVYVEFSRUEnLCAnQlVUVE9OJywgJ0EnXTtcbiAgICAgIGNvbnN0IGludGVyYWN0aXZlUm9sZXMgPSBbJ2J1dHRvbicsICdsaW5rJywgJ3RleHRib3gnLCAnY29tYm9ib3gnLCAnbGlzdGJveCcsICdjaGVja2JveCcsICdyYWRpbycsICdzd2l0Y2gnLCAndGFiJ107XG5cbiAgICAgIGlmIChpbnRlcmFjdGl2ZVRhZ3MuaW5jbHVkZXMoZWwudGFnTmFtZSkpIHJldHVybiB0cnVlO1xuICAgICAgaWYgKGVsLmdldEF0dHJpYnV0ZSgncm9sZScpICYmIGludGVyYWN0aXZlUm9sZXMuaW5jbHVkZXMoZWwuZ2V0QXR0cmlidXRlKCdyb2xlJykpKSByZXR1cm4gdHJ1ZTtcbiAgICAgIGlmIChlbC5nZXRBdHRyaWJ1dGUoJ2NvbnRlbnRlZGl0YWJsZScpID09PSAndHJ1ZScpIHJldHVybiB0cnVlO1xuICAgICAgaWYgKGVsLm9uY2xpY2sgfHwgZWwuZ2V0QXR0cmlidXRlKCdvbmNsaWNrJykpIHJldHVybiB0cnVlO1xuICAgICAgaWYgKGVsLnRhYkluZGV4ID49IDApIHJldHVybiB0cnVlO1xuXG4gICAgICBjb25zdCBzdHlsZSA9IGdldENvbXB1dGVkU3R5bGUoZWwpO1xuICAgICAgaWYgKHN0eWxlLmN1cnNvciA9PT0gJ3BvaW50ZXInKSByZXR1cm4gdHJ1ZTtcblxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIF9pc1NlbWFudGljUmVnaW9uKGVsKSB7XG4gICAgICBjb25zdCByZWdpb25UYWdzID0gWydIRUFERVInLCAnRk9PVEVSJywgJ05BVicsICdNQUlOJywgJ0FTSURFJywgJ1NFQ1RJT04nLCAnQVJUSUNMRScsICdGT1JNJ107XG4gICAgICBjb25zdCByZWdpb25Sb2xlcyA9IFsnYmFubmVyJywgJ2NvbnRlbnRpbmZvJywgJ25hdmlnYXRpb24nLCAnbWFpbicsICdjb21wbGVtZW50YXJ5JywgJ3JlZ2lvbicsICdhcnRpY2xlJywgJ2Zvcm0nLCAnc2VhcmNoJ107XG4gICAgICByZXR1cm4gcmVnaW9uVGFncy5pbmNsdWRlcyhlbC50YWdOYW1lKSB8fCAoZWwuZ2V0QXR0cmlidXRlKCdyb2xlJykgJiYgcmVnaW9uUm9sZXMuaW5jbHVkZXMoZWwuZ2V0QXR0cmlidXRlKCdyb2xlJykpKTtcbiAgICB9XG5cbiAgICBfZXh0cmFjdEZpZWxkRGF0YShlbCwgcGF0aCkge1xuICAgICAgY29uc3QgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgY29uc3QgY29tcHV0ZWRTdHlsZSA9IGdldENvbXB1dGVkU3R5bGUoZWwpO1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBpZDogZWwuaWQgfHwgbnVsbCxcbiAgICAgICAgbmFtZTogZWwubmFtZSB8fCBudWxsLFxuICAgICAgICB0eXBlOiB0aGlzLl9jbGFzc2lmeUVsZW1lbnRUeXBlKGVsKSxcbiAgICAgICAgaW5wdXRUeXBlOiBlbC50eXBlIHx8IG51bGwsXG4gICAgICAgIHRhZzogZWwudGFnTmFtZS50b0xvd2VyQ2FzZSgpLFxuICAgICAgICBsYWJlbDogdGhpcy5fZmluZExhYmVsKGVsKSxcbiAgICAgICAgcGxhY2Vob2xkZXI6IGVsLnBsYWNlaG9sZGVyIHx8IG51bGwsXG4gICAgICAgIGFyaWFMYWJlbDogZWwuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG4gICAgICAgIHZhbHVlOiB0aGlzLl9nZXRFbGVtZW50VmFsdWUoZWwpLFxuICAgICAgICB2aXNpYmxlOiB0aGlzLl9pc1Zpc2libGUoZWwsIHJlY3QsIGNvbXB1dGVkU3R5bGUpLFxuICAgICAgICByZWN0OiB7IHg6IHJlY3QueCwgeTogcmVjdC55LCB3aWR0aDogcmVjdC53aWR0aCwgaGVpZ2h0OiByZWN0LmhlaWdodCB9LFxuICAgICAgICBwYXRoOiBbLi4ucGF0aCwgdGhpcy5fZ2V0Tm9kZUlkZW50aWZpZXIoZWwpXSxcbiAgICAgICAgc2VsZWN0b3JzOiB0aGlzLl9nZW5lcmF0ZVNlbGVjdG9ycyhlbClcbiAgICAgIH07XG4gICAgfVxuXG4gICAgX2NsYXNzaWZ5RWxlbWVudFR5cGUoZWwpIHtcbiAgICAgIGNvbnN0IHRhZyA9IGVsLnRhZ05hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgIGlmICh0YWcgPT09ICdpbnB1dCcpIHJldHVybiAnaW5wdXQnO1xuICAgICAgaWYgKHRhZyA9PT0gJ3NlbGVjdCcpIHJldHVybiAnc2VsZWN0JztcbiAgICAgIGlmICh0YWcgPT09ICd0ZXh0YXJlYScpIHJldHVybiAndGV4dGFyZWEnO1xuICAgICAgaWYgKHRhZyA9PT0gJ2J1dHRvbicgfHwgKHRhZyA9PT0gJ2lucHV0JyAmJiBbJ2J1dHRvbicsICdzdWJtaXQnLCAncmVzZXQnXS5pbmNsdWRlcyhlbC50eXBlKSkpIHJldHVybiAnYnV0dG9uJztcbiAgICAgIGlmICh0YWcgPT09ICdhJykgcmV0dXJuICdsaW5rJztcbiAgICAgIHJldHVybiAnb3RoZXInO1xuICAgIH1cblxuICAgIF9nZXROb2RlSWRlbnRpZmllcihlbCkge1xuICAgICAgaWYgKGVsLmlkKSByZXR1cm4gYCMke2VsLmlkfWA7XG4gICAgICBsZXQgaWQgPSBlbC50YWdOYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICBpZiAoZWwuY2xhc3NOYW1lICYmIHR5cGVvZiBlbC5jbGFzc05hbWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGNvbnN0IGNsYXNzZXMgPSBlbC5jbGFzc05hbWUuc3BsaXQoL1xccysvKS5maWx0ZXIoYyA9PiBjICYmICFjLm1hdGNoKC9eKG5nLXxffGpzeC0pLykpO1xuICAgICAgICBpZiAoY2xhc3Nlcy5sZW5ndGggPiAwKSBpZCArPSBgLiR7Y2xhc3Nlc1swXX1gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGlkO1xuICAgIH1cblxuICAgIC8vIFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFxuICAgIC8vIFNFTEVDVE9SIEdFTkVSQVRPUlxuICAgIC8vIFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFxuXG4gICAgX2dlbmVyYXRlU2VsZWN0b3JzKGVsKSB7XG4gICAgICBjb25zdCBzZWxlY3RvcnMgPSBbXTtcblxuICAgICAgaWYgKGVsLmlkKSB7XG4gICAgICAgIHNlbGVjdG9ycy5wdXNoKHsgdHlwZTogJ2lkJywgc2VsZWN0b3I6IGAjJHtDU1MuZXNjYXBlKGVsLmlkKX1gLCBjb25maWRlbmNlOiAxLjAgfSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHN0YWJsZUF0dHJzID0gWydkYXRhLXRlc3RpZCcsICdkYXRhLXFhJywgJ2RhdGEtY3knLCAnZGF0YS10ZXN0JywgJ25hbWUnLCAnYXJpYS1sYWJlbCddO1xuICAgICAgZm9yIChjb25zdCBhdHRyIG9mIHN0YWJsZUF0dHJzKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gZWwuZ2V0QXR0cmlidXRlKGF0dHIpO1xuICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICBjb25zdCBzZWxlY3RvciA9IGBbJHthdHRyfT1cIiR7Q1NTLmVzY2FwZSh2YWx1ZSl9XCJdYDtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgICBzZWxlY3RvcnMucHVzaCh7IHR5cGU6IGF0dHIsIHNlbGVjdG9yLCBjb25maWRlbmNlOiAwLjk1IH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2goZSkge31cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCB1bmlxdWVQYXRoID0gdGhpcy5fY29tcHV0ZVVuaXF1ZVBhdGgoZWwpO1xuICAgICAgaWYgKHVuaXF1ZVBhdGgpIHtcbiAgICAgICAgc2VsZWN0b3JzLnB1c2goeyB0eXBlOiAncGF0aCcsIHNlbGVjdG9yOiB1bmlxdWVQYXRoLCBjb25maWRlbmNlOiAwLjcgfSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzZWxlY3RvcnM7XG4gICAgfVxuXG4gICAgX2NvbXB1dGVVbmlxdWVQYXRoKGVsKSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IFtdO1xuICAgICAgbGV0IGN1cnJlbnQgPSBlbDtcblxuICAgICAgd2hpbGUgKGN1cnJlbnQgJiYgY3VycmVudCAhPT0gZG9jdW1lbnQuYm9keSkge1xuICAgICAgICBsZXQgc2VsZWN0b3IgPSBjdXJyZW50LnRhZ05hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgaWYgKGN1cnJlbnQuaWQpIHtcbiAgICAgICAgICBzZWxlY3RvciA9IGAjJHtDU1MuZXNjYXBlKGN1cnJlbnQuaWQpfWA7XG4gICAgICAgICAgcGFydHMudW5zaGlmdChzZWxlY3Rvcik7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc2libGluZ3MgPSBBcnJheS5mcm9tKGN1cnJlbnQucGFyZW50RWxlbWVudD8uY2hpbGRyZW4gfHwgW10pLmZpbHRlcihcbiAgICAgICAgICBzID0+IHMudGFnTmFtZSA9PT0gY3VycmVudC50YWdOYW1lXG4gICAgICAgICk7XG4gICAgICAgIGlmIChzaWJsaW5ncy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgY29uc3QgaW5kZXggPSBzaWJsaW5ncy5pbmRleE9mKGN1cnJlbnQpICsgMTtcbiAgICAgICAgICBzZWxlY3RvciArPSBgOm50aC1vZi10eXBlKCR7aW5kZXh9KWA7XG4gICAgICAgIH1cbiAgICAgICAgcGFydHMudW5zaGlmdChzZWxlY3Rvcik7XG4gICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LnBhcmVudEVsZW1lbnQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gcGFydHMuam9pbignID4gJyk7XG4gICAgfVxuXG4gICAgLy8gXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXHUyNTUwXG4gICAgLy8gRklFTEQgR1JBUEhcbiAgICAvLyBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcblxuICAgIF9idWlsZEZpZWxkR3JhcGgoc2Nhbikge1xuICAgICAgdGhpcy5kb21HcmFwaC5jbGVhcigpO1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBvZiBzY2FuLmZpZWxkcykge1xuICAgICAgICBjb25zdCBzZW1hbnRpY1R5cGUgPSB0aGlzLl9pbmZlclNlbWFudGljVHlwZShmaWVsZCk7XG4gICAgICAgIGNvbnN0IG5vZGUgPSB7XG4gICAgICAgICAgLi4uZmllbGQsXG4gICAgICAgICAgc2VtYW50aWNUeXBlLFxuICAgICAgICAgIHJlbGF0aW9uc2hpcHM6IHtcbiAgICAgICAgICAgIGNvbmZpcm1hdGlvbkZpZWxkOiB0aGlzLl9maW5kQ29uZmlybWF0aW9uRmllbGQoZmllbGQsIHNjYW4uZmllbGRzKVxuICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5kb21HcmFwaC5zZXQoZmllbGQuc2VsZWN0b3JzWzBdPy5zZWxlY3RvciB8fCBmaWVsZC5wYXRoLmpvaW4oJy8nKSwgbm9kZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgX2luZmVyU2VtYW50aWNUeXBlKGZpZWxkKSB7XG4gICAgICBjb25zdCBoaW50cyA9IFtmaWVsZC5uYW1lLCBmaWVsZC5pZCwgZmllbGQubGFiZWwsIGZpZWxkLnBsYWNlaG9sZGVyLCBmaWVsZC5hcmlhTGFiZWxdXG4gICAgICAgIC5maWx0ZXIoQm9vbGVhbikubWFwKHMgPT4gcy50b0xvd2VyQ2FzZSgpKTtcblxuICAgICAgY29uc3QgcGF0dGVybnMgPSB7XG4gICAgICAgIGVtYWlsOiAvZW1haWx8ZS1tYWlsLyxcbiAgICAgICAgcGFzc3dvcmQ6IC9wYXNzd29yZHxwYXNzd2R8cHdkLyxcbiAgICAgICAgZmlyc3ROYW1lOiAvZmlyc3RbXy1dP25hbWV8Z2l2ZW5bXy1dP25hbWV8Zm5hbWUvLFxuICAgICAgICBsYXN0TmFtZTogL2xhc3RbXy1dP25hbWV8ZmFtaWx5W18tXT9uYW1lfGxuYW1lLyxcbiAgICAgICAgcGhvbmU6IC9waG9uZXx0ZWx8bW9iaWxlLyxcbiAgICAgICAgYWRkcmVzczogL2FkZHJlc3N8c3RyZWV0LyxcbiAgICAgICAgY2l0eTogL2NpdHl8Y2l1ZGFkLyxcbiAgICAgICAgc3RhdGU6IC9zdGF0ZXxwcm92aW5jZS8sXG4gICAgICAgIHppcDogL3ppcHxwb3N0YWwvLFxuICAgICAgICBjb3VudHJ5OiAvY291bnRyeXxwYWlzL1xuICAgICAgfTtcblxuICAgICAgZm9yIChjb25zdCBbdHlwZSwgcGF0dGVybl0gb2YgT2JqZWN0LmVudHJpZXMocGF0dGVybnMpKSB7XG4gICAgICAgIGlmIChoaW50cy5zb21lKGggPT4gcGF0dGVybi50ZXN0KGgpKSkgcmV0dXJuIHR5cGU7XG4gICAgICB9XG4gICAgICByZXR1cm4gJ3Vua25vd24nO1xuICAgIH1cblxuICAgIF9maW5kQ29uZmlybWF0aW9uRmllbGQoZmllbGQsIGFsbEZpZWxkcykge1xuICAgICAgaWYgKCFbJ2VtYWlsJywgJ3Bhc3N3b3JkJ10uaW5jbHVkZXModGhpcy5faW5mZXJTZW1hbnRpY1R5cGUoZmllbGQpKSkgcmV0dXJuIG51bGw7XG4gICAgICBjb25zdCBjb25maXJtUGF0dGVybnMgPSAvY29uZmlybXx2ZXJpZnl8cmVwZWF0fHJldHlwZXxyZS1lbnRlci9pO1xuICAgICAgcmV0dXJuIGFsbEZpZWxkcy5maW5kKGYgPT4ge1xuICAgICAgICBpZiAoZiA9PT0gZmllbGQpIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKHRoaXMuX2luZmVyU2VtYW50aWNUeXBlKGYpICE9PSB0aGlzLl9pbmZlclNlbWFudGljVHlwZShmaWVsZCkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgY29uc3QgaGludHMgPSBbZi5uYW1lLCBmLmlkLCBmLmxhYmVsLCBmLnBsYWNlaG9sZGVyXS5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAgIHJldHVybiBoaW50cy5zb21lKGggPT4gY29uZmlybVBhdHRlcm5zLnRlc3QoaCkpO1xuICAgICAgfSk/LnNlbGVjdG9yc1swXT8uc2VsZWN0b3IgfHwgbnVsbDtcbiAgICB9XG5cbiAgICAvLyBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcdTI1NTBcbiAgICAvLyBJTlRFTExJR0VOVCBFWEVDVVRPUlxuICAgIC8vIFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFx1MjU1MFxuXG4gICAgYXN5bmMgX2xvYWRVc2VyUHJvZmlsZSgpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChbJ2JpbGdlX3VzZXJfcHJvZmlsZSddLCAocmVzKSA9PiByZXNvbHZlKHJlcyB8fCB7fSkpO1xuICAgICAgICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgICAgICAgIHJlc29sdmUoe30pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiAocmVzdWx0ICYmIHJlc3VsdC5iaWxnZV91c2VyX3Byb2ZpbGUgJiYgdHlwZW9mIHJlc3VsdC5iaWxnZV91c2VyX3Byb2ZpbGUgPT09ICdvYmplY3QnKVxuICAgICAgICAgID8gcmVzdWx0LmJpbGdlX3VzZXJfcHJvZmlsZVxuICAgICAgICAgIDoge307XG4gICAgICB9IGNhdGNoIChfZXJyKSB7XG4gICAgICAgIHJldHVybiB7fTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBfbm9ybWFsaXplVXNlclByb2ZpbGUocmF3UHJvZmlsZSkge1xuICAgICAgY29uc3QgcCA9IHJhd1Byb2ZpbGUgJiYgdHlwZW9mIHJhd1Byb2ZpbGUgPT09ICdvYmplY3QnID8gcmF3UHJvZmlsZSA6IHt9O1xuICAgICAgY29uc3QgZmlyc3ROYW1lID0gcC5maXJzdE5hbWUgfHwgcC5maXJzdF9uYW1lIHx8IHAuZ2l2ZW5OYW1lIHx8IHAuZ2l2ZW5fbmFtZSB8fCAnJztcbiAgICAgIGNvbnN0IGxhc3ROYW1lID0gcC5sYXN0TmFtZSB8fCBwLmxhc3RfbmFtZSB8fCBwLmZhbWlseU5hbWUgfHwgcC5mYW1pbHlfbmFtZSB8fCAnJztcbiAgICAgIGNvbnN0IGVtYWlsID0gcC5lbWFpbCB8fCAnJztcbiAgICAgIGNvbnN0IHBob25lID0gcC5waG9uZSB8fCBwLnBob25lTnVtYmVyIHx8IHAucGhvbmVfbnVtYmVyIHx8ICcnO1xuICAgICAgY29uc3QgYWRkcmVzcyA9IHAuYWRkcmVzcyB8fCBwLmFkZHJlc3MxIHx8IHAuYWRkcmVzc0xpbmUxIHx8IHAuYWRkcmVzc19saW5lMSB8fCAnJztcbiAgICAgIGNvbnN0IGNpdHkgPSBwLmNpdHkgfHwgJyc7XG4gICAgICBjb25zdCBzdGF0ZSA9IHAuc3RhdGUgfHwgcC5wcm92aW5jZSB8fCAnJztcbiAgICAgIGNvbnN0IHppcCA9IHAuemlwIHx8IHAuemlwQ29kZSB8fCBwLnBvc3RhbENvZGUgfHwgcC5wb3N0YWxfY29kZSB8fCAnJztcblxuICAgICAgcmV0dXJuIHsgLi4ucCwgZmlyc3ROYW1lLCBsYXN0TmFtZSwgZW1haWwsIHBob25lLCBhZGRyZXNzLCBjaXR5LCBzdGF0ZSwgemlwIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTGlnaHR3ZWlnaHQgbmF0dXJhbC1sYW5ndWFnZSBlbnRyeXBvaW50IHVzZWQgYnkgY29udGVudC5qcyBmYWxsYmFjazpcbiAgICAgKiAtIERldGVjdCBcImZpbGwgZm9ybVwiIGFuZCB1c2Ugc2VtYW50aWMgbWFwcGluZyArIHN0b3JlZCBwcm9maWxlXG4gICAgICogLSBGb3Igb3RoZXIgY29tbWFuZHMsIGZhbGwgYmFjayB0byBfZXhlY3V0ZUludGVsbGlnZW50IGhldXJpc3RpY3NcbiAgICAgKi9cbiAgICBhc3luYyBydW4oY29tbWFuZCkge1xuICAgICAgY29uc3QgcmF3ID0gU3RyaW5nKGNvbW1hbmQgfHwgJycpLnRyaW0oKTtcbiAgICAgIGlmICghcmF3KSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnRW1wdHkgY29tbWFuZCcgfTtcbiAgICAgIGNvbnN0IGxvd2VyID0gcmF3LnRvTG93ZXJDYXNlKCk7XG5cbiAgICAgIGNvbnN0IHN0ZXBSZXF1ZXN0ZWQgPVxuICAgICAgICAvXFxiKG9uZVxccytmaWVsZFxccythdFxccythXFxzK3RpbWV8ZmllbGRcXHMrYnlcXHMrZmllbGR8c3RlcFxccytieVxccytzdGVwfG9uZVxccytieVxccytvbmV8b25lXFxzK2F0XFxzK2FcXHMrdGltZSlcXGIvaS50ZXN0KHJhdyk7XG4gICAgICBjb25zdCBub1N1Ym1pdFJlcXVlc3RlZCA9XG4gICAgICAgIC9cXGIoZG9cXHMrbm90fGRvbid0fGRvbnR8bm8pXFxzK3N1Ym1pdFxcYnxcXGJ3aXRob3V0XFxzK3N1Ym1pdHRpbmdcXGJ8XFxibm9cXHMrc3VibWlzc2lvblxcYi9pLnRlc3QocmF3KTtcbiAgICAgIGNvbnN0IGxvb2tzTGlrZUZpbGxGb3JtID0gL1xcYihmaWxsfGNvbXBsZXRlfHBvcHVsYXRlKVxcYi9pLnRlc3QocmF3KSAmJiAvXFxiKGZvcm18ZmllbGRzPylcXGIvaS50ZXN0KHJhdyk7XG5cbiAgICAgIC8vIE1pcnJvciB0aGUgZGlyZWN0LXBhdHRlcm4gc3RhdGUgc28gZm9sbG93LXVwIGNvbW1hbmRzIGxpa2UgXCJuZXh0XCIgY2FuIGJlIGludGVycHJldGVkIHNhZmVseS5cbiAgICAgIGNvbnN0IHN0YXRlID0gKHdpbmRvdy5fX2JpbGdlX2RpcmVjdF9maWxsX2Zvcm1fc3RhdGUgPVxuICAgICAgICB3aW5kb3cuX19iaWxnZV9kaXJlY3RfZmlsbF9mb3JtX3N0YXRlIHx8IHsgc3RlcE1vZGU6IGZhbHNlLCBub1N1Ym1pdDogZmFsc2UsIHVwZGF0ZWRBdDogMCB9KTtcbiAgICAgIGlmIChzdGVwUmVxdWVzdGVkKSBzdGF0ZS5zdGVwTW9kZSA9IHRydWU7XG4gICAgICBpZiAobm9TdWJtaXRSZXF1ZXN0ZWQpIHN0YXRlLm5vU3VibWl0ID0gdHJ1ZTtcbiAgICAgIHN0YXRlLnVwZGF0ZWRBdCA9IERhdGUubm93KCk7XG5cbiAgICAgIGlmIChsb29rc0xpa2VGaWxsRm9ybSkge1xuICAgICAgICBjb25zdCBzdG9yZWQgPSBhd2FpdCB0aGlzLl9sb2FkVXNlclByb2ZpbGUoKTtcbiAgICAgICAgY29uc3QgcHJvZmlsZSA9IHRoaXMuX25vcm1hbGl6ZVVzZXJQcm9maWxlKHN0b3JlZCk7XG4gICAgICAgIGNvbnN0IG1heEZpZWxkcyA9IHN0ZXBSZXF1ZXN0ZWQgPyAxIDogdW5kZWZpbmVkO1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5leGVjdXRlKHsgdHlwZTogJ2ZpbGxfZm9ybScgfSwgeyBwcm9maWxlLCBtYXhGaWVsZHMgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIEV4dHJhY3QgdmFsdWUgZm9yIFwiZmlsbCBYIHdpdGggWVwiIHNvIF9leGVjdXRlSW50ZWxsaWdlbnQgY2FuIGFjdHVhbGx5IGZpbGwuXG4gICAgICBjb25zdCBmaWxsTWF0Y2ggPSByYXcubWF0Y2goL14oPzpwbGVhc2VcXHMrKT8oZmlsbHx0eXBlfGVudGVyfHdyaXRlKVxccysoPzppblxccyspP1tcIiddPyguKz8pW1wiJ10/XFxzKyg/OndpdGh8YXN8dG98PSlcXHMrW1wiJ10/KC4rPylbXCInXT8kL2kpO1xuICAgICAgaWYgKGZpbGxNYXRjaCkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IFN0cmluZyhmaWxsTWF0Y2hbM10gfHwgJycpO1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5leGVjdXRlKHJhdywgeyB2YWx1ZSB9KTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZXhlY3V0ZShyYXcsIHt9KTtcbiAgICB9XG5cbiAgICBhc3luYyBleGVjdXRlKGludGVudCwgZGF0YSA9IHt9KSB7XG4gICAgICB0aGlzLmV4ZWN1dGlvbkNvbnRleHQgPSB7IGludGVudCwgZGF0YSwgc3RhcnRUaW1lOiBEYXRlLm5vdygpLCBlcnJvcnM6IFtdIH07XG4gICAgICBjb25zdCBzY2FuID0gdGhpcy5zY2FuRE9NKCk7XG5cbiAgICAgIHN3aXRjaCAoaW50ZW50LnR5cGUpIHtcbiAgICAgICAgY2FzZSAnZmlsbF9mb3JtJzogcmV0dXJuIGF3YWl0IHRoaXMuX2V4ZWN1dGVGaWxsRm9ybShzY2FuLCBkYXRhKTtcbiAgICAgICAgY2FzZSAnY2xpY2snOiByZXR1cm4gYXdhaXQgdGhpcy5fZXhlY3V0ZUNsaWNrKHNjYW4sIGRhdGEpO1xuICAgICAgICBjYXNlICdpbnRlbGxpZ2VudCc6IHJldHVybiBhd2FpdCB0aGlzLl9leGVjdXRlSW50ZWxsaWdlbnQoc2NhbiwgaW50ZW50LCBkYXRhKTtcbiAgICAgICAgZGVmYXVsdDogcmV0dXJuIGF3YWl0IHRoaXMuX2V4ZWN1dGVJbnRlbGxpZ2VudChzY2FuLCBpbnRlbnQsIGRhdGEpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGFzeW5jIF9leGVjdXRlRmlsbEZvcm0oc2NhbiwgZGF0YSkge1xuICAgICAgY29uc3QgcHJvZmlsZSA9IGRhdGEucHJvZmlsZSB8fCB7fTtcbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgICAgIGNvbnN0IGZpbGxPcmRlciA9IHNjYW4uZmllbGRzO1xuICAgICAgY29uc3QgbWF4RmllbGRzUmF3ID0gZGF0YS5tYXhGaWVsZHMgPz8gZGF0YS5tYXhfZmllbGRzID8/IGRhdGEubWF4ID8/IG51bGw7XG4gICAgICBjb25zdCBtYXhGaWVsZHMgPSBOdW1iZXIobWF4RmllbGRzUmF3KTtcbiAgICAgIGNvbnN0IGxpbWl0ID0gTnVtYmVyLmlzRmluaXRlKG1heEZpZWxkcykgJiYgbWF4RmllbGRzID4gMCA/IE1hdGguZmxvb3IobWF4RmllbGRzKSA6IG51bGw7XG4gICAgICBsZXQgZmlsbGVkT2sgPSAwO1xuXG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIGZpbGxPcmRlcikge1xuICAgICAgICBjb25zdCBub2RlID0gdGhpcy5kb21HcmFwaC5nZXQoZmllbGQuc2VsZWN0b3JzWzBdPy5zZWxlY3Rvcik7XG4gICAgICAgIGlmICghbm9kZSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gdGhpcy5fcmVzb2x2ZVByb2ZpbGVWYWx1ZShub2RlLnNlbWFudGljVHlwZSwgcHJvZmlsZSk7XG4gICAgICAgIGlmICghdmFsdWUpIGNvbnRpbnVlO1xuXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2ZpbGxGaWVsZFdpdGhSZXRyeShmaWVsZCwgdmFsdWUpO1xuICAgICAgICByZXN1bHRzLnB1c2gocmVzdWx0KTtcbiAgICAgICAgaWYgKHJlc3VsdCAmJiByZXN1bHQub2spIGZpbGxlZE9rICs9IDE7XG4gICAgICAgIGF3YWl0IHRoaXMuX2RlbGF5KDEwMCk7XG4gICAgICAgIGlmIChsaW1pdCAmJiBmaWxsZWRPayA+PSBsaW1pdCkgYnJlYWs7XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmlsbGVkT2sgPiAwLCBmaWxsZWQ6IGZpbGxlZE9rLCByZXN1bHRzIH07XG4gICAgfVxuXG4gICAgYXN5bmMgX2ZpbGxGaWVsZFdpdGhSZXRyeShmaWVsZCwgdmFsdWUpIHtcbiAgICAgIGNvbnN0IHN0cmF0ZWdpZXMgPSBbXG4gICAgICAgICgpID0+IHRoaXMuX2ZpbGxOYXRpdmUoZmllbGQsIHZhbHVlKSxcbiAgICAgICAgKCkgPT4gdGhpcy5fZmlsbFdpdGhFdmVudHMoZmllbGQsIHZhbHVlKSxcbiAgICAgICAgKCkgPT4gdGhpcy5fZmlsbFdpdGhSZWFjdE92ZXJyaWRlKGZpZWxkLCB2YWx1ZSlcbiAgICAgIF07XG5cbiAgICAgIGZvciAoY29uc3Qgc3RyYXRlZ3kgb2Ygc3RyYXRlZ2llcykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHN0cmF0ZWd5KCk7XG4gICAgICAgICAgaWYgKHJlcy5vaykgcmV0dXJuIHJlcztcbiAgICAgICAgfSBjYXRjaChlKSB7fVxuICAgICAgfVxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ0FsbCBmaWxsIHN0cmF0ZWdpZXMgZmFpbGVkJyB9O1xuICAgIH1cblxuICAgIF9maWxsTmF0aXZlKGZpZWxkLCB2YWx1ZSkge1xuICAgICAgY29uc3QgZWwgPSB0aGlzLl9yZXNvbHZlRWxlbWVudChmaWVsZCk7XG4gICAgICBpZiAoIWVsKSByZXR1cm4geyBvazogZmFsc2UgfTtcbiAgICAgIGVsLmZvY3VzKCk7XG4gICAgICBlbC52YWx1ZSA9IHZhbHVlO1xuICAgICAgZWwuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgICAgIGVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9XG5cbiAgICBfZmlsbFdpdGhFdmVudHMoZmllbGQsIHZhbHVlKSB7XG4gICAgICBjb25zdCBlbCA9IHRoaXMuX3Jlc29sdmVFbGVtZW50KGZpZWxkKTtcbiAgICAgIGlmICghZWwpIHJldHVybiB7IG9rOiBmYWxzZSB9O1xuICAgICAgZWwuZm9jdXMoKTtcbiAgICAgIGVsLnZhbHVlID0gJyc7XG4gICAgICBmb3IgKGNvbnN0IGNoYXIgb2YgdmFsdWUpIHtcbiAgICAgICAgZWwuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiBjaGFyLCBidWJibGVzOiB0cnVlIH0pKTtcbiAgICAgICAgZWwudmFsdWUgKz0gY2hhcjtcbiAgICAgICAgZWwuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUsIGRhdGE6IGNoYXIsIGlucHV0VHlwZTogJ2luc2VydFRleHQnIH0pKTtcbiAgICAgICAgZWwuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogY2hhciwgYnViYmxlczogdHJ1ZSB9KSk7XG4gICAgICB9XG4gICAgICBlbC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgfVxuXG4gICAgX2ZpbGxXaXRoUmVhY3RPdmVycmlkZShmaWVsZCwgdmFsdWUpIHtcbiAgICAgIGNvbnN0IGVsID0gdGhpcy5fcmVzb2x2ZUVsZW1lbnQoZmllbGQpO1xuICAgICAgaWYgKCFlbCkgcmV0dXJuIHsgb2s6IGZhbHNlIH07XG4gICAgICBjb25zdCBzZXR0ZXIgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHdpbmRvdy5IVE1MSW5wdXRFbGVtZW50LnByb3RvdHlwZSwgJ3ZhbHVlJyk/LnNldDtcbiAgICAgIGlmIChzZXR0ZXIpIHtcbiAgICAgICAgc2V0dGVyLmNhbGwoZWwsIHZhbHVlKTtcbiAgICAgICAgZWwuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgICAgICAgZWwuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UgfTtcbiAgICB9XG5cbiAgICBhc3luYyBfZXhlY3V0ZUNsaWNrKHNjYW4sIGRhdGEpIHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGRhdGEudGFyZ2V0IHx8IGRhdGEuc2VsZWN0b3I7XG4gICAgICBjb25zdCBlbCA9IHRoaXMuX3Jlc29sdmVFbGVtZW50KHsgc2VsZWN0b3JzOiBbeyBzZWxlY3RvcjogdGFyZ2V0IH1dIH0pO1xuICAgICAgaWYgKGVsKSB7XG4gICAgICAgIGVsLnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdzbW9vdGgnLCBibG9jazogJ2NlbnRlcicgfSk7XG4gICAgICAgIGVsLmNsaWNrKCk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnQ2xpY2sgdGFyZ2V0IG5vdCBmb3VuZCcgfTtcbiAgICB9XG5cbiAgICBhc3luYyBfZXhlY3V0ZUludGVsbGlnZW50KHNjYW4sIGludGVudCwgZGF0YSkge1xuICAgICAgY29uc3QgdGV4dCA9IHR5cGVvZiBpbnRlbnQgPT09ICdzdHJpbmcnID8gaW50ZW50IDogaW50ZW50LnRleHQgfHwgJyc7XG4gICAgICBjb25zdCBhY3Rpb25NYXRjaCA9IHRleHQubWF0Y2goL14oZmlsbHx0eXBlfGNsaWNrfHByZXNzfHRhcHxzY3JvbGwpXFxzL2kpO1xuICAgICAgY29uc3QgYWN0aW9uID0gYWN0aW9uTWF0Y2ggPyBhY3Rpb25NYXRjaFsxXS50b0xvd2VyQ2FzZSgpIDogJ2NsaWNrJztcbiAgICAgIFxuICAgICAgY29uc3QgY2FuZGlkYXRlcyA9IFsuLi5zY2FuLmZpZWxkcywgLi4uc2Nhbi5hY3Rpb25zXTtcbiAgICAgIGNvbnN0IHRhcmdldFRleHQgPSB0ZXh0LnJlcGxhY2UoYWN0aW9uTWF0Y2g/LlswXSB8fCAnJywgJycpLnRyaW0oKTtcbiAgICAgIFxuICAgICAgY29uc3QgcmFua2VkID0gY2FuZGlkYXRlcy5tYXAoYyA9PiB7XG4gICAgICAgIGxldCBzY29yZSA9IDA7XG4gICAgICAgIGNvbnN0IHNlYXJjaCA9IFtjLmxhYmVsLCBjLm5hbWUsIGMuaWQsIGMucGxhY2Vob2xkZXJdLmZpbHRlcihCb29sZWFuKS5tYXAocyA9PiBzLnRvTG93ZXJDYXNlKCkpO1xuICAgICAgICBpZiAoc2VhcmNoLnNvbWUocyA9PiBzID09PSB0YXJnZXRUZXh0LnRvTG93ZXJDYXNlKCkpKSBzY29yZSArPSAxMDA7XG4gICAgICAgIGVsc2UgaWYgKHNlYXJjaC5zb21lKHMgPT4gcy5pbmNsdWRlcyh0YXJnZXRUZXh0LnRvTG93ZXJDYXNlKCkpKSkgc2NvcmUgKz0gNTA7XG4gICAgICAgIHJldHVybiB7IC4uLmMsIHNjb3JlIH07XG4gICAgICB9KS5zb3J0KChhLCBiKSA9PiBiLnNjb3JlIC0gYS5zY29yZSk7XG5cbiAgICAgIGlmIChyYW5rZWRbMF0/LnNjb3JlID4gMCkge1xuICAgICAgICBpZiAoWydmaWxsJywgJ3R5cGUnXS5pbmNsdWRlcyhhY3Rpb24pKSByZXR1cm4gYXdhaXQgdGhpcy5fZmlsbEZpZWxkV2l0aFJldHJ5KHJhbmtlZFswXSwgZGF0YS52YWx1ZSB8fCBcIlwiKTtcbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuX2V4ZWN1dGVDbGljayhzY2FuLCB7IHNlbGVjdG9yOiByYW5rZWRbMF0uc2VsZWN0b3JzWzBdLnNlbGVjdG9yIH0pO1xuICAgICAgfVxuICAgICAgXG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnQ291bGQgbm90IGluZmVyIHRhcmdldCBmb3IgaW50ZWxsaWdlbnQgZXhlY3V0aW9uJyB9O1xuICAgIH1cblxuICAgIF9yZXNvbHZlRWxlbWVudChmaWVsZCkge1xuICAgICAgZm9yIChjb25zdCBzIG9mIGZpZWxkLnNlbGVjdG9ycyB8fCBbXSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzLnNlbGVjdG9yKTtcbiAgICAgICAgICBpZiAoZWwpIHJldHVybiBlbDtcbiAgICAgICAgfSBjYXRjaChlKSB7fVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgX3Jlc29sdmVQcm9maWxlVmFsdWUoc2VtYW50aWNUeXBlLCBwcm9maWxlKSB7XG4gICAgICBjb25zdCBtYXBwaW5nID0ge1xuICAgICAgICBlbWFpbDogcHJvZmlsZS5lbWFpbCxcbiAgICAgICAgZmlyc3ROYW1lOiBwcm9maWxlLmZpcnN0TmFtZSxcbiAgICAgICAgbGFzdE5hbWU6IHByb2ZpbGUubGFzdE5hbWUsXG4gICAgICAgIHBob25lOiBwcm9maWxlLnBob25lLFxuICAgICAgICBhZGRyZXNzOiBwcm9maWxlLmFkZHJlc3MsXG4gICAgICAgIGNpdHk6IHByb2ZpbGUuY2l0eSxcbiAgICAgICAgc3RhdGU6IHByb2ZpbGUuc3RhdGUsXG4gICAgICAgIHppcDogcHJvZmlsZS56aXBcbiAgICAgIH07XG4gICAgICByZXR1cm4gbWFwcGluZ1tzZW1hbnRpY1R5cGVdIHx8IHByb2ZpbGVbc2VtYW50aWNUeXBlXTtcbiAgICB9XG5cbiAgICBfZmluZExhYmVsKGVsKSB7XG4gICAgICBpZiAoZWwuaWQpIHtcbiAgICAgICAgY29uc3QgbGFiZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBsYWJlbFtmb3I9XCIke0NTUy5lc2NhcGUoZWwuaWQpfVwiXWApO1xuICAgICAgICBpZiAobGFiZWwpIHJldHVybiBsYWJlbC50ZXh0Q29udGVudC50cmltKCk7XG4gICAgICB9XG4gICAgICBjb25zdCBwYXJlbnRMYWJlbCA9IGVsLmNsb3Nlc3QoJ2xhYmVsJyk7XG4gICAgICBpZiAocGFyZW50TGFiZWwpIHJldHVybiBwYXJlbnRMYWJlbC50ZXh0Q29udGVudC50cmltKCk7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBfaXNWaXNpYmxlKGVsLCByZWN0LCBzdHlsZSkge1xuICAgICAgcmV0dXJuIHN0eWxlLmRpc3BsYXkgIT09ICdub25lJyAmJiBzdHlsZS52aXNpYmlsaXR5ICE9PSAnaGlkZGVuJyAmJiByZWN0LndpZHRoID4gMDtcbiAgICB9XG5cbiAgICBfZGVsYXkobXMpIHsgcmV0dXJuIG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCBtcykpOyB9XG5cbiAgICBfZ2V0QWNjZXNzaWJsZU5hbWUoZWwpIHtcbiAgICAgIHJldHVybiBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCBlbC50aXRsZSB8fCBlbC5pbm5lclRleHQgfHwgXCJcIjtcbiAgICB9XG4gIH1cblxuICB3aW5kb3cuX19iaWxnZV9leGVjdXRpb25fZW5naW5lID0gbmV3IEJpbGdlRXhlY3V0aW9uRW5naW5lKCk7XG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7OztDQUtDLFdBQVc7QUFDVjtBQUVBLE1BQUksT0FBTyx5QkFBMEI7QUFBQSxFQUVyQyxNQUFNLHFCQUFxQjtBQUFBLElBVjdCLE9BVTZCO0FBQUE7QUFBQTtBQUFBLElBQ3pCLGNBQWM7QUFDWixXQUFLLGFBQWE7QUFDbEIsV0FBSyxhQUFhO0FBQ2xCLFdBQUssV0FBVyxvQkFBSSxJQUFJO0FBQ3hCLFdB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
