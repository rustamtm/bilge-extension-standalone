var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/contextInference.js
(function() {
  "use strict";
  if (window.__bilge_contextInference) return;
  class ContextInference {
    static {
      __name(this, "ContextInference");
    }
    constructor() {
      this.pageContextCache = null;
      this.pageContextCacheExpiry = 0;
      this.cacheTTL = 1e4;
    }
    // Inference sources in priority order
    static SOURCES = ["url_params", "page_text", "nearby_text", "autocomplete", "storage"];
    // Form purpose patterns
    static PURPOSE_PATTERNS = {
      registration: /register|signup|sign[_\-\s]?up|create[_\-\s]?account|join/i,
      login: /login|signin|sign[_\-\s]?in|auth/i,
      checkout: /checkout|payment|order|purchase|buy|cart/i,
      contact: /contact|inquiry|message|feedback|support/i,
      application: /apply|application|submit|form|request/i,
      profile: /profile|settings|account|preferences/i,
      search: /search|find|lookup|query/i,
      subscription: /subscribe|newsletter|email[_\-\s]?list|mailing/i
    };
    // Field type aliases for matching
    static FIELD_ALIASES = {
      first_name: ["given_name", "fname", "firstname", "first"],
      last_name: ["family_name", "lname", "lastname", "surname", "last"],
      email: ["mail", "email_address", "e_mail", "emailaddress"],
      phone: ["tel", "telephone", "mobile", "cell", "phone_number", "phonenumber"],
      address: ["street", "address1", "street_address", "address_line_1"],
      city: ["town", "locality"],
      state: ["province", "region", "state_province"],
      zip: ["postal", "postal_code", "zip_code", "zipcode", "postcode"],
      country: ["nation", "country_code"],
      company: ["organization", "org", "business", "employer"],
      date_of_birth: ["dob", "birthdate", "birth_date", "birthday"]
    };
    /**
     * Extract comprehensive page context
     * @returns {Object} Page context including URL, form purpose, extracted values
     */
    extractPageContext() {
      const now = Date.now();
      if (this.pageContextCache && now < this.pageContextCacheExpiry) {
        return this.pageContextCache;
      }
      const context = {
        url: location.href,
        domain: location.hostname,
        pathname: location.pathname,
        title: document.title,
        formPurpose: this.inferFormPurpose(),
        urlParams: this.parseUrlParams(),
        existingValues: this.collectExistingValues(),
        pageTextValues: this.extractValuesFromPageText(),
        storageHints: this.scanLocalStorage(),
        formFields: this.extractFormFieldsSummary(),
        timestamp: now
      };
      this.pageContextCache = context;
      this.pageContextCacheExpiry = now + this.cacheTTL;
      return context;
    }
    /**
     * Infer form purpose from page signals
     * @returns {string} Purpose identifier (registration, login, checkout, etc.)
     */
    inferFormPurpose() {
      const signals = [
        location.pathname,
        location.href,
        document.title,
        this._getFormAction(),
        this._getMainHeading(),
        this._getButtonTexts()
      ].join(" ").toLowerCase();
      for (const [purpose, pattern] of Object.entries(ContextInference.PURPOSE_PATTERNS)) {
        if (pattern.test(signals)) {
          return purpose;
        }
      }
      return "general";
    }
    /**
     * Parse URL query parameters
     * @returns {Object} Key-value pairs from URL
     */
    parseUrlParams() {
      const params = new URLSearchParams(location.search);
      const values = {};
      for (const [key, value] of params) {
        const normalizedKey = this._normalizeFieldKey(key);
        if (this._isValidValue(value) && !this._isSensitiveKey(normalizedKey)) {
          values[normalizedKey] = value;
        }
      }
      if (location.hash.includes("?")) {
        const hashParams = new URLSearchParams(location.hash.split("?")[1]);
        for (const [key, value] of hashParams) {
          const normalizedKey = this._normalizeFieldKey(key);
          if (this._isValidValue(value) && !this._isSensitiveKey(normalizedKey)) {
            values[normalizedKey] = value;
          }
        }
      }
      return values;
    }
    /**
     * Collect existing values from form fields
     * @returns {Object} Field identifiers mapped to current values
     */
    collectExistingValues() {
      const values = {};
      const inputs = document.querySelectorAll('input, textarea, select, [contenteditable="true"]');
      for (const input of inputs) {
        const key = this._getFieldKey(input);
        if (!key) continue;
        let value = "";
        if (input.isContentEditable) {
          value = String(input.textContent || "").trim();
        } else if ("value" in input) {
          value = String(input.value || "").trim();
        }
        if (value && !this._isSensitiveKey(key)) {
          values[key] = value;
        }
      }
      return values;
    }
    /**
     * Extract potential values from visible page text
     * @returns {Object} Detected values by type (email, phone, etc.)
     */
    extractValuesFromPageText() {
      const text = document.body?.innerText || "";
      const extracted = {};
      const emailMatches = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
      if (emailMatches?.length) {
        extracted.email = emailMatches.find((e) => !e.includes("noreply") && !e.includes("no-reply")) || emailMatches[0];
      }
      const phoneMatch = text.match(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/);
      if (phoneMatch) {
        extracted.phone = phoneMatch[0].replace(/\D+/g, "").slice(-10);
      }
      const yourPatterns = [
        { pattern: /your\s+(?:email|e-mail)[:\s]+([^\n<]+)/gi, key: "email" },
        { pattern: /your\s+(?:phone|tel|mobile)[:\s]+([^\n<]+)/gi, key: "phone" },
        { pattern: /your\s+name[:\s]+([^\n<]+)/gi, key: "name" },
        { pattern: /welcome,?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g, key: "name" },
        { pattern: /hi,?\s+([A-Z][a-z]+)/gi, key: "first_name" },
        { pattern: /logged\s+in\s+as[:\s]+([^\n<]+)/gi, key: "username" }
      ];
      for (const { pattern, key } of yourPatterns) {
        const match = text.match(pattern);
        if (match?.[1]) {
          extracted[key] = match[1].trim().slice(0, 100);
        }
      }
      const addressMatch = text.match(/\d+\s+[A-Za-z]+(?:\s+[A-Za-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd)/i);
      if (addressMatch) {
        extracted.address = addressMatch[0].slice(0, 150);
      }
      const zipMatch = text.match(/\b\d{5}(?:-\d{4})?\b/);
      if (zipMatch) {
        extracted.zip = zipMatch[0].slice(0, 5);
      }
      return extracted;
    }
    /**
     * Scan localStorage for potential hints
     * @returns {Object} Relevant values from localStorage
     */
    scanLocalStorage() {
      const hints = {};
      try {
        const relevantKeys = ["user", "profile", "email", "name", "phone", "address", "preferences"];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key) continue;
          const lowKey = key.toLowerCase();
          const isRelevant = relevantKeys.some((k) => lowKey.includes(k));
          if (!isRelevant) continue;
          try {
            const value = localStorage.getItem(key);
            if (!value || value.length > 1e3) continue;
            const parsed = JSON.parse(value);
            if (typeof parsed === "object" && parsed !== null) {
              for (const [k, v] of Object.entries(parsed)) {
                if (typeof v === "string" && this._isValidValue(v) && !this._isSensitiveKey(k)) {
                  hints[this._normalizeFieldKey(k)] = v;
                }
              }
            }
          } catch (_err) {
          }
        }
      } catch (_err) {
      }
      return hints;
    }
    /**
     * Extract summary of form fields on the page
     * @returns {Array} Field summaries with type, name, label info
     */
    extractFormFieldsSummary() {
      const fields = [];
      const inputs = document.querySelectorAll("input, textarea, select");
      for (const input of inputs) {
        const type = input.type || input.tagName.toLowerCase();
        if (["hidden", "submit", "button", "image", "file", "reset"].includes(type)) continue;
        const field = {
          type,
          name: input.name || "",
          id: input.id || "",
          placeholder: input.placeholder || "",
          label: this._getFieldLabel(input),
          autocomplete: input.autocomplete || "",
          required: input.required || input.getAttribute("aria-required") === "true"
        };
        fields.push(field);
      }
      return fields;
    }
    /**
     * Suggest value for a field based on type and context
     * @param {string} fieldType - Field type or name
     * @param {Object} pageContext - Page context from extractPageContext()
     * @param {Object} profileData - User profile data (from MCP)
     * @returns {string|null} Suggested value
     */
    suggestValue(fieldType, pageContext = null, profileData = null) {
      const context = pageContext || this.extractPageContext();
      const normalizedType = this._normalizeFieldKey(fieldType);
      if (context.urlParams[normalizedType]) {
        return context.urlParams[normalizedType];
      }
      if (context.pageTextValues[normalizedType]) {
        return context.pageTextValues[normalizedType];
      }
      if (profileData?.fields?.[normalizedType]) {
        const field = profileData.fields[normalizedType];
        if (!field.sensitive || field.value) {
          return field.value;
        }
      }
      if (profileData?.aliases) {
        for (const [alias, canonical] of Object.entries(profileData.aliases)) {
          if (this._tokenMatch(normalizedType, alias) && profileData.fields?.[canonical]) {
            const field = profileData.fields[canonical];
            if (!field.sensitive || field.value) {
              return field.value;
            }
          }
        }
      }
      const aliasKey = this._findAliasKey(normalizedType);
      if (aliasKey !== normalizedType) {
        if (context.urlParams[aliasKey]) return context.urlParams[aliasKey];
        if (context.pageTextValues[aliasKey]) return context.pageTextValues[aliasKey];
        if (profileData?.fields?.[aliasKey]) return profileData.fields[aliasKey].value;
      }
      if (context.storageHints[normalizedType]) {
        return context.storageHints[normalizedType];
      }
      return null;
    }
    /**
     * Get field type recommendations based on page context
     * @param {Element} element - Input element
     * @returns {Object} Type info and suggestions
     */
    analyzeField(element) {
      const analysis = {
        inferredType: "text",
        confidence: 0,
        suggestions: [],
        validation: null
      };
      const hints = this._collectFieldHints(element);
      const combined = hints.join(" ").toLowerCase();
      const typePatterns = [
        { type: "email", pattern: /email|e-mail|mail/i, confidence: 90 },
        { type: "phone", pattern: /phone|tel|mobile|cell/i, confidence: 90 },
        { type: "first_name", pattern: /first[_\s-]?name|given|fname/i, confidence: 85 },
        { type: "last_name", pattern: /last[_\s-]?name|family|surname|lname/i, confidence: 85 },
        { type: "address", pattern: /address|street/i, confidence: 80 },
        { type: "city", pattern: /city|town/i, confidence: 85 },
        { type: "state", pattern: /state|province|region/i, confidence: 85 },
        { type: "zip", pattern: /zip|postal/i, confidence: 90 },
        { type: "country", pattern: /country|nation/i, confidence: 85 },
        { type: "company", pattern: /company|organization|employer/i, confidence: 80 },
        { type: "date_of_birth", pattern: /dob|birth|birthday/i, confidence: 85 },
        { type: "ssn", pattern: /ssn|social[_\s-]?security/i, confidence: 95, sensitive: true },
        { type: "password", pattern: /password|passwd|pwd/i, confidence: 95, sensitive: true }
      ];
      for (const { type, pattern, confidence, sensitive } of typePatterns) {
        if (pattern.test(combined)) {
          analysis.inferredType = type;
          analysis.confidence = confidence;
          analysis.sensitive = sensitive || false;
          break;
        }
      }
      const inputType = element.type?.toLowerCase();
      if (inputType && inputType !== "text") {
        analysis.htmlType = inputType;
        if (["email", "tel", "date", "number", "password"].includes(inputType)) {
          analysis.inferredType = inputType === "tel" ? "phone" : inputType;
          analysis.confidence = Math.max(analysis.confidence, 95);
        }
      }
      const autocomplete = element.autocomplete;
      if (autocomplete && autocomplete !== "off") {
        analysis.autocomplete = autocomplete;
        analysis.confidence = Math.max(analysis.confidence, 90);
      }
      return analysis;
    }
    // === Helper methods ===
    _normalizeFieldKey(key) {
      return String(key || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    }
    _getFieldKey(element) {
      return element.name || element.id || element.getAttribute("data-testid") || "";
    }
    _getFieldLabel(element) {
      const id = element.id;
      if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label?.textContent) return label.textContent.trim();
      }
      const closestLabel = element.closest("label");
      if (closestLabel?.textContent) return closestLabel.textContent.trim();
      return "";
    }
    _getFormAction() {
      const form = document.querySelector("form");
      return form?.action || "";
    }
    _getMainHeading() {
      const h1 = document.querySelector("h1");
      return h1?.textContent || "";
    }
    _getButtonTexts() {
      const buttons = document.querySelectorAll('button, input[type="submit"], [role="button"]');
      return Array.from(buttons).map((b) => b.textContent || b.value || "").join(" ");
    }
    _isValidValue(value) {
      const text = String(value || "").trim();
      return text.length > 0 && text.length < 500;
    }
    _isSensitiveKey(key) {
      const sensitivePatterns = /password|passwd|pwd|ssn|social|secret|token|key|auth|card|cvv|cvc|pin/i;
      return sensitivePatterns.test(key);
    }
    _tokenMatch(str1, str2) {
      const norm1 = this._normalizeFieldKey(str1);
      const norm2 = this._normalizeFieldKey(str2);
      return norm1 === norm2 || norm1.includes(norm2) || norm2.includes(norm1);
    }
    _findAliasKey(key) {
      for (const [canonical, aliases] of Object.entries(ContextInference.FIELD_ALIASES)) {
        if (key === canonical) return canonical;
        if (aliases.includes(key)) return canonical;
      }
      return key;
    }
    _collectFieldHints(element) {
      const hints = [];
      const attrs = ["name", "id", "placeholder", "aria-label", "autocomplete", "title", "data-testid"];
      for (const attr of attrs) {
        const value = element.getAttribute(attr);
        if (value) hints.push(value);
      }
      hints.push(this._getFieldLabel(element));
      return hints.filter(Boolean);
    }
    /**
     * Clear cached context
     */
    clearCache() {
      this.pageContextCache = null;
      this.pageContextCacheExpiry = 0;
    }
  }
  window.__bilge_contextInference = new ContextInference();
  console.log("[Bilge] ContextInference initialized");
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL2NvbnRleHRJbmZlcmVuY2UuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIGNvbnRleHRJbmZlcmVuY2UuanMgLSBDb250ZXh0LWF3YXJlIHZhbHVlIGluZmVyZW5jZSBmb3IgaW50ZWxsaWdlbnQgZm9ybSBmaWxsaW5nXG4vLyBFeHRlbmRzIGV4aXN0aW5nIGNvbnRleHRBbmFseXplci5qcyB3aXRoIHBhZ2UgY29udGV4dCBleHRyYWN0aW9uIGFuZCB2YWx1ZSBzdWdnZXN0aW9uc1xuXG4oZnVuY3Rpb24oKSB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBpZiAod2luZG93Ll9fYmlsZ2VfY29udGV4dEluZmVyZW5jZSkgcmV0dXJuO1xuXG4gIC8qKlxuICAgKiBDb250ZXh0SW5mZXJlbmNlIC0gRXh0cmFjdCBwYWdlIGNvbnRleHQgYW5kIGluZmVyIGZpZWxkIHZhbHVlc1xuICAgKi9cbiAgY2xhc3MgQ29udGV4dEluZmVyZW5jZSB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICB0aGlzLnBhZ2VDb250ZXh0Q2FjaGUgPSBudWxsO1xuICAgICAgdGhpcy5wYWdlQ29udGV4dENhY2hlRXhwaXJ5ID0gMDtcbiAgICAgIHRoaXMuY2FjaGVUVEwgPSAxMDAwMDsgLy8gMTAgc2Vjb25kc1xuICAgIH1cblxuICAgIC8vIEluZmVyZW5jZSBzb3VyY2VzIGluIHByaW9yaXR5IG9yZGVyXG4gICAgc3RhdGljIFNPVVJDRVMgPSBbJ3VybF9wYXJhbXMnLCAncGFnZV90ZXh0JywgJ25lYXJieV90ZXh0JywgJ2F1dG9jb21wbGV0ZScsICdzdG9yYWdlJ107XG5cbiAgICAvLyBGb3JtIHB1cnBvc2UgcGF0dGVybnNcbiAgICBzdGF0aWMgUFVSUE9TRV9QQVRURVJOUyA9IHtcbiAgICAgIHJlZ2lzdHJhdGlvbjogL3JlZ2lzdGVyfHNpZ251cHxzaWduW19cXC1cXHNdP3VwfGNyZWF0ZVtfXFwtXFxzXT9hY2NvdW50fGpvaW4vaSxcbiAgICAgIGxvZ2luOiAvbG9naW58c2lnbmlufHNpZ25bX1xcLVxcc10/aW58YXV0aC9pLFxuICAgICAgY2hlY2tvdXQ6IC9jaGVja291dHxwYXltZW50fG9yZGVyfHB1cmNoYXNlfGJ1eXxjYXJ0L2ksXG4gICAgICBjb250YWN0OiAvY29udGFjdHxpbnF1aXJ5fG1lc3NhZ2V8ZmVlZGJhY2t8c3VwcG9ydC9pLFxuICAgICAgYXBwbGljYXRpb246IC9hcHBseXxhcHBsaWNhdGlvbnxzdWJtaXR8Zm9ybXxyZXF1ZXN0L2ksXG4gICAgICBwcm9maWxlOiAvcHJvZmlsZXxzZXR0aW5nc3xhY2NvdW50fHByZWZlcmVuY2VzL2ksXG4gICAgICBzZWFyY2g6IC9zZWFyY2h8ZmluZHxsb29rdXB8cXVlcnkvaSxcbiAgICAgIHN1YnNjcmlwdGlvbjogL3N1YnNjcmliZXxuZXdzbGV0dGVyfGVtYWlsW19cXC1cXHNdP2xpc3R8bWFpbGluZy9pLFxuICAgIH07XG5cbiAgICAvLyBGaWVsZCB0eXBlIGFsaWFzZXMgZm9yIG1hdGNoaW5nXG4gICAgc3RhdGljIEZJRUxEX0FMSUFTRVMgPSB7XG4gICAgICBmaXJzdF9uYW1lOiBbJ2dpdmVuX25hbWUnLCAnZm5hbWUnLCAnZmlyc3RuYW1lJywgJ2ZpcnN0J10sXG4gICAgICBsYXN0X25hbWU6IFsnZmFtaWx5X25hbWUnLCAnbG5hbWUnLCAnbGFzdG5hbWUnLCAnc3VybmFtZScsICdsYXN0J10sXG4gICAgICBlbWFpbDogWydtYWlsJywgJ2VtYWlsX2FkZHJlc3MnLCAnZV9tYWlsJywgJ2VtYWlsYWRkcmVzcyddLFxuICAgICAgcGhvbmU6IFsndGVsJywgJ3RlbGVwaG9uZScsICdtb2JpbGUnLCAnY2VsbCcsICdwaG9uZV9udW1iZXInLCAncGhvbmVudW1iZXInXSxcbiAgICAgIGFkZHJlc3M6IFsnc3RyZWV0JywgJ2FkZHJlc3MxJywgJ3N0cmVldF9hZGRyZXNzJywgJ2FkZHJlc3NfbGluZV8xJ10sXG4gICAgICBjaXR5OiBbJ3Rvd24nLCAnbG9jYWxpdHknXSxcbiAgICAgIHN0YXRlOiBbJ3Byb3ZpbmNlJywgJ3JlZ2lvbicsICdzdGF0ZV9wcm92aW5jZSddLFxuICAgICAgemlwOiBbJ3Bvc3RhbCcsICdwb3N0YWxfY29kZScsICd6aXBfY29kZScsICd6aXBjb2RlJywgJ3Bvc3Rjb2RlJ10sXG4gICAgICBjb3VudHJ5OiBbJ25hdGlvbicsICdjb3VudHJ5X2NvZGUnXSxcbiAgICAgIGNvbXBhbnk6IFsnb3JnYW5pemF0aW9uJywgJ29yZycsICdidXNpbmVzcycsICdlbXBsb3llciddLFxuICAgICAgZGF0ZV9vZl9iaXJ0aDogWydkb2InLCAnYmlydGhkYXRlJywgJ2JpcnRoX2RhdGUnLCAnYmlydGhkYXknXSxcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXh0cmFjdCBjb21wcmVoZW5zaXZlIHBhZ2UgY29udGV4dFxuICAgICAqIEByZXR1cm5zIHtPYmplY3R9IFBhZ2UgY29udGV4dCBpbmNsdWRpbmcgVVJMLCBmb3JtIHB1cnBvc2UsIGV4dHJhY3RlZCB2YWx1ZXNcbiAgICAgKi9cbiAgICBleHRyYWN0UGFnZUNvbnRleHQoKSB7XG4gICAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgICAgaWYgKHRoaXMucGFnZUNvbnRleHRDYWNoZSAmJiBub3cgPCB0aGlzLnBhZ2VDb250ZXh0Q2FjaGVFeHBpcnkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucGFnZUNvbnRleHRDYWNoZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgY29udGV4dCA9IHtcbiAgICAgICAgdXJsOiBsb2NhdGlvbi5ocmVmLFxuICAgICAgICBkb21haW46IGxvY2F0aW9uLmhvc3RuYW1lLFxuICAgICAgICBwYXRobmFtZTogbG9jYXRpb24ucGF0aG5hbWUsXG4gICAgICAgIHRpdGxlOiBkb2N1bWVudC50aXRsZSxcbiAgICAgICAgZm9ybVB1cnBvc2U6IHRoaXMuaW5mZXJGb3JtUHVycG9zZSgpLFxuICAgICAgICB1cmxQYXJhbXM6IHRoaXMucGFyc2VVcmxQYXJhbXMoKSxcbiAgICAgICAgZXhpc3RpbmdWYWx1ZXM6IHRoaXMuY29sbGVjdEV4aXN0aW5nVmFsdWVzKCksXG4gICAgICAgIHBhZ2VUZXh0VmFsdWVzOiB0aGlzLmV4dHJhY3RWYWx1ZXNGcm9tUGFnZVRleHQoKSxcbiAgICAgICAgc3RvcmFnZUhpbnRzOiB0aGlzLnNjYW5Mb2NhbFN0b3JhZ2UoKSxcbiAgICAgICAgZm9ybUZpZWxkczogdGhpcy5leHRyYWN0Rm9ybUZpZWxkc1N1bW1hcnkoKSxcbiAgICAgICAgdGltZXN0YW1wOiBub3csXG4gICAgICB9O1xuXG4gICAgICB0aGlzLnBhZ2VDb250ZXh0Q2FjaGUgPSBjb250ZXh0O1xuICAgICAgdGhpcy5wYWdlQ29udGV4dENhY2hlRXhwaXJ5ID0gbm93ICsgdGhpcy5jYWNoZVRUTDtcblxuICAgICAgcmV0dXJuIGNvbnRleHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5mZXIgZm9ybSBwdXJwb3NlIGZyb20gcGFnZSBzaWduYWxzXG4gICAgICogQHJldHVybnMge3N0cmluZ30gUHVycG9zZSBpZGVudGlmaWVyIChyZWdpc3RyYXRpb24sIGxvZ2luLCBjaGVja291dCwgZXRjLilcbiAgICAgKi9cbiAgICBpbmZlckZvcm1QdXJwb3NlKCkge1xuICAgICAgY29uc3Qgc2lnbmFscyA9IFtcbiAgICAgICAgbG9jYXRpb24ucGF0aG5hbWUsXG4gICAgICAgIGxvY2F0aW9uLmhyZWYsXG4gICAgICAgIGRvY3VtZW50LnRpdGxlLFxuICAgICAgICB0aGlzLl9nZXRGb3JtQWN0aW9uKCksXG4gICAgICAgIHRoaXMuX2dldE1haW5IZWFkaW5nKCksXG4gICAgICAgIHRoaXMuX2dldEJ1dHRvblRleHRzKCksXG4gICAgICBdLmpvaW4oJyAnKS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgICBmb3IgKGNvbnN0IFtwdXJwb3NlLCBwYXR0ZXJuXSBvZiBPYmplY3QuZW50cmllcyhDb250ZXh0SW5mZXJlbmNlLlBVUlBPU0VfUEFUVEVSTlMpKSB7XG4gICAgICAgIGlmIChwYXR0ZXJuLnRlc3Qoc2lnbmFscykpIHtcbiAgICAgICAgICByZXR1cm4gcHVycG9zZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gJ2dlbmVyYWwnO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhcnNlIFVSTCBxdWVyeSBwYXJhbWV0ZXJzXG4gICAgICogQHJldHVybnMge09iamVjdH0gS2V5LXZhbHVlIHBhaXJzIGZyb20gVVJMXG4gICAgICovXG4gICAgcGFyc2VVcmxQYXJhbXMoKSB7XG4gICAgICBjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKGxvY2F0aW9uLnNlYXJjaCk7XG4gICAgICBjb25zdCB2YWx1ZXMgPSB7fTtcblxuICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgcGFyYW1zKSB7XG4gICAgICAgIGNvbnN0IG5vcm1hbGl6ZWRLZXkgPSB0aGlzLl9ub3JtYWxpemVGaWVsZEtleShrZXkpO1xuICAgICAgICBpZiAodGhpcy5faXNWYWxpZFZhbHVlKHZhbHVlKSAmJiAhdGhpcy5faXNTZW5zaXRpdmVLZXkobm9ybWFsaXplZEtleSkpIHtcbiAgICAgICAgICB2YWx1ZXNbbm9ybWFsaXplZEtleV0gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBBbHNvIGNoZWNrIGhhc2ggcGFyYW1zIChTUEEgcm91dGluZylcbiAgICAgIGlmIChsb2NhdGlvbi5oYXNoLmluY2x1ZGVzKCc/JykpIHtcbiAgICAgICAgY29uc3QgaGFzaFBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMobG9jYXRpb24uaGFzaC5zcGxpdCgnPycpWzFdKTtcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgaGFzaFBhcmFtcykge1xuICAgICAgICAgIGNvbnN0IG5vcm1hbGl6ZWRLZXkgPSB0aGlzLl9ub3JtYWxpemVGaWVsZEtleShrZXkpO1xuICAgICAgICAgIGlmICh0aGlzLl9pc1ZhbGlkVmFsdWUodmFsdWUpICYmICF0aGlzLl9pc1NlbnNpdGl2ZUtleShub3JtYWxpemVkS2V5KSkge1xuICAgICAgICAgICAgdmFsdWVzW25vcm1hbGl6ZWRLZXldID0gdmFsdWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB2YWx1ZXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29sbGVjdCBleGlzdGluZyB2YWx1ZXMgZnJvbSBmb3JtIGZpZWxkc1xuICAgICAqIEByZXR1cm5zIHtPYmplY3R9IEZpZWxkIGlkZW50aWZpZXJzIG1hcHBlZCB0byBjdXJyZW50IHZhbHVlc1xuICAgICAqL1xuICAgIGNvbGxlY3RFeGlzdGluZ1ZhbHVlcygpIHtcbiAgICAgIGNvbnN0IHZhbHVlcyA9IHt9O1xuICAgICAgY29uc3QgaW5wdXRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QsIFtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdJyk7XG5cbiAgICAgIGZvciAoY29uc3QgaW5wdXQgb2YgaW5wdXRzKSB7XG4gICAgICAgIGNvbnN0IGtleSA9IHRoaXMuX2dldEZpZWxkS2V5KGlucHV0KTtcbiAgICAgICAgaWYgKCFrZXkpIGNvbnRpbnVlO1xuXG4gICAgICAgIGxldCB2YWx1ZSA9ICcnO1xuICAgICAgICBpZiAoaW5wdXQuaXNDb250ZW50RWRpdGFibGUpIHtcbiAgICAgICAgICB2YWx1ZSA9IFN0cmluZyhpbnB1dC50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICB9IGVsc2UgaWYgKCd2YWx1ZScgaW4gaW5wdXQpIHtcbiAgICAgICAgICB2YWx1ZSA9IFN0cmluZyhpbnB1dC52YWx1ZSB8fCAnJykudHJpbSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHZhbHVlICYmICF0aGlzLl9pc1NlbnNpdGl2ZUtleShrZXkpKSB7XG4gICAgICAgICAgdmFsdWVzW2tleV0gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gdmFsdWVzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4dHJhY3QgcG90ZW50aWFsIHZhbHVlcyBmcm9tIHZpc2libGUgcGFnZSB0ZXh0XG4gICAgICogQHJldHVybnMge09iamVjdH0gRGV0ZWN0ZWQgdmFsdWVzIGJ5IHR5cGUgKGVtYWlsLCBwaG9uZSwgZXRjLilcbiAgICAgKi9cbiAgICBleHRyYWN0VmFsdWVzRnJvbVBhZ2VUZXh0KCkge1xuICAgICAgY29uc3QgdGV4dCA9IGRvY3VtZW50LmJvZHk/LmlubmVyVGV4dCB8fCAnJztcbiAgICAgIGNvbnN0IGV4dHJhY3RlZCA9IHt9O1xuXG4gICAgICAvLyBFbWFpbCBwYXR0ZXJuc1xuICAgICAgY29uc3QgZW1haWxNYXRjaGVzID0gdGV4dC5tYXRjaCgvXFxiW0EtWmEtejAtOS5fJSstXStAW0EtWmEtejAtOS4tXStcXC5bQS1afGEtel17Mix9XFxiL2cpO1xuICAgICAgaWYgKGVtYWlsTWF0Y2hlcz8ubGVuZ3RoKSB7XG4gICAgICAgIC8vIFRha2UgZmlyc3Qgbm9uLW5vcmVwbHkgZW1haWxcbiAgICAgICAgZXh0cmFjdGVkLmVtYWlsID0gZW1haWxNYXRjaGVzLmZpbmQoZSA9PiAhZS5pbmNsdWRlcygnbm9yZXBseScpICYmICFlLmluY2x1ZGVzKCduby1yZXBseScpKSB8fCBlbWFpbE1hdGNoZXNbMF07XG4gICAgICB9XG5cbiAgICAgIC8vIFBob25lIHBhdHRlcm5zIChVUyBmb3JtYXQpXG4gICAgICBjb25zdCBwaG9uZU1hdGNoID0gdGV4dC5tYXRjaCgvXFxiKD86XFwrPzFbLS5cXHNdPyk/XFwoP1xcZHszfVxcKT9bLS5cXHNdP1xcZHszfVstLlxcc10/XFxkezR9XFxiLyk7XG4gICAgICBpZiAocGhvbmVNYXRjaCkge1xuICAgICAgICBleHRyYWN0ZWQucGhvbmUgPSBwaG9uZU1hdGNoWzBdLnJlcGxhY2UoL1xcRCsvZywgJycpLnNsaWNlKC0xMCk7XG4gICAgICB9XG5cbiAgICAgIC8vIFwiWW91ciBYOiB2YWx1ZVwiIHBhdHRlcm5zXG4gICAgICBjb25zdCB5b3VyUGF0dGVybnMgPSBbXG4gICAgICAgIHsgcGF0dGVybjogL3lvdXJcXHMrKD86ZW1haWx8ZS1tYWlsKVs6XFxzXSsoW15cXG48XSspL2dpLCBrZXk6ICdlbWFpbCcgfSxcbiAgICAgICAgeyBwYXR0ZXJuOiAveW91clxccysoPzpwaG9uZXx0ZWx8bW9iaWxlKVs6XFxzXSsoW15cXG48XSspL2dpLCBrZXk6ICdwaG9uZScgfSxcbiAgICAgICAgeyBwYXR0ZXJuOiAveW91clxccytuYW1lWzpcXHNdKyhbXlxcbjxdKykvZ2ksIGtleTogJ25hbWUnIH0sXG4gICAgICAgIHsgcGF0dGVybjogL3dlbGNvbWUsP1xccysoW0EtWl1bYS16XSsoPzpcXHMrW0EtWl1bYS16XSspPykvZywga2V5OiAnbmFtZScgfSxcbiAgICAgICAgeyBwYXR0ZXJuOiAvaGksP1xccysoW0EtWl1bYS16XSspL2dpLCBrZXk6ICdmaXJzdF9uYW1lJyB9LFxuICAgICAgICB7IHBhdHRlcm46IC9sb2dnZWRcXHMraW5cXHMrYXNbOlxcc10rKFteXFxuPF0rKS9naSwga2V5OiAndXNlcm5hbWUnIH0sXG4gICAgICBdO1xuXG4gICAgICBmb3IgKGNvbnN0IHsgcGF0dGVybiwga2V5IH0gb2YgeW91clBhdHRlcm5zKSB7XG4gICAgICAgIGNvbnN0IG1hdGNoID0gdGV4dC5tYXRjaChwYXR0ZXJuKTtcbiAgICAgICAgaWYgKG1hdGNoPy5bMV0pIHtcbiAgICAgICAgICBleHRyYWN0ZWRba2V5XSA9IG1hdGNoWzFdLnRyaW0oKS5zbGljZSgwLCAxMDApO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIEFkZHJlc3MgcGF0dGVybnMgKGJhc2ljKVxuICAgICAgY29uc3QgYWRkcmVzc01hdGNoID0gdGV4dC5tYXRjaCgvXFxkK1xccytbQS1aYS16XSsoPzpcXHMrW0EtWmEtel0rKSpcXHMrKD86U3RyZWV0fFN0fEF2ZW51ZXxBdmV8Um9hZHxSZHxEcml2ZXxEcnxMYW5lfExufEJvdWxldmFyZHxCbHZkKS9pKTtcbiAgICAgIGlmIChhZGRyZXNzTWF0Y2gpIHtcbiAgICAgICAgZXh0cmFjdGVkLmFkZHJlc3MgPSBhZGRyZXNzTWF0Y2hbMF0uc2xpY2UoMCwgMTUwKTtcbiAgICAgIH1cblxuICAgICAgLy8gWmlwIGNvZGUgcGF0dGVybnMgKFVTKVxuICAgICAgY29uc3QgemlwTWF0Y2ggPSB0ZXh0Lm1hdGNoKC9cXGJcXGR7NX0oPzotXFxkezR9KT9cXGIvKTtcbiAgICAgIGlmICh6aXBNYXRjaCkge1xuICAgICAgICBleHRyYWN0ZWQuemlwID0gemlwTWF0Y2hbMF0uc2xpY2UoMCwgNSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBleHRyYWN0ZWQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2NhbiBsb2NhbFN0b3JhZ2UgZm9yIHBvdGVudGlhbCBoaW50c1xuICAgICAqIEByZXR1cm5zIHtPYmplY3R9IFJlbGV2YW50IHZhbHVlcyBmcm9tIGxvY2FsU3RvcmFnZVxuICAgICAqL1xuICAgIHNjYW5Mb2NhbFN0b3JhZ2UoKSB7XG4gICAgICBjb25zdCBoaW50cyA9IHt9O1xuXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZWxldmFudEtleXMgPSBbJ3VzZXInLCAncHJvZmlsZScsICdlbWFpbCcsICduYW1lJywgJ3Bob25lJywgJ2FkZHJlc3MnLCAncHJlZmVyZW5jZXMnXTtcbiAgICAgICAgXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbG9jYWxTdG9yYWdlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgY29uc3Qga2V5ID0gbG9jYWxTdG9yYWdlLmtleShpKTtcbiAgICAgICAgICBpZiAoIWtleSkgY29udGludWU7XG5cbiAgICAgICAgICBjb25zdCBsb3dLZXkgPSBrZXkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICBjb25zdCBpc1JlbGV2YW50ID0gcmVsZXZhbnRLZXlzLnNvbWUoayA9PiBsb3dLZXkuaW5jbHVkZXMoaykpO1xuICAgICAgICAgIGlmICghaXNSZWxldmFudCkgY29udGludWU7XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShrZXkpO1xuICAgICAgICAgICAgaWYgKCF2YWx1ZSB8fCB2YWx1ZS5sZW5ndGggPiAxMDAwKSBjb250aW51ZTtcblxuICAgICAgICAgICAgLy8gVHJ5IHRvIHBhcnNlIGFzIEpTT05cbiAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UodmFsdWUpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBwYXJzZWQgPT09ICdvYmplY3QnICYmIHBhcnNlZCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhwYXJzZWQpKSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2ID09PSAnc3RyaW5nJyAmJiB0aGlzLl9pc1ZhbGlkVmFsdWUodikgJiYgIXRoaXMuX2lzU2Vuc2l0aXZlS2V5KGspKSB7XG4gICAgICAgICAgICAgICAgICBoaW50c1t0aGlzLl9ub3JtYWxpemVGaWVsZEtleShrKV0gPSB2O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgICAgICAgIC8vIE5vdCBKU09OIG9yIHBhcnNlIGVycm9yXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChfZXJyKSB7XG4gICAgICAgIC8vIGxvY2FsU3RvcmFnZSBhY2Nlc3MgZXJyb3JcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGhpbnRzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4dHJhY3Qgc3VtbWFyeSBvZiBmb3JtIGZpZWxkcyBvbiB0aGUgcGFnZVxuICAgICAqIEByZXR1cm5zIHtBcnJheX0gRmllbGQgc3VtbWFyaWVzIHdpdGggdHlwZSwgbmFtZSwgbGFiZWwgaW5mb1xuICAgICAqL1xuICAgIGV4dHJhY3RGb3JtRmllbGRzU3VtbWFyeSgpIHtcbiAgICAgIGNvbnN0IGZpZWxkcyA9IFtdO1xuICAgICAgY29uc3QgaW5wdXRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QnKTtcblxuICAgICAgZm9yIChjb25zdCBpbnB1dCBvZiBpbnB1dHMpIHtcbiAgICAgICAgY29uc3QgdHlwZSA9IGlucHV0LnR5cGUgfHwgaW5wdXQudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBpZiAoWydoaWRkZW4nLCAnc3VibWl0JywgJ2J1dHRvbicsICdpbWFnZScsICdmaWxlJywgJ3Jlc2V0J10uaW5jbHVkZXModHlwZSkpIGNvbnRpbnVlO1xuXG4gICAgICAgIGNvbnN0IGZpZWxkID0ge1xuICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgbmFtZTogaW5wdXQubmFtZSB8fCAnJyxcbiAgICAgICAgICBpZDogaW5wdXQuaWQgfHwgJycsXG4gICAgICAgICAgcGxhY2Vob2xkZXI6IGlucHV0LnBsYWNlaG9sZGVyIHx8ICcnLFxuICAgICAgICAgIGxhYmVsOiB0aGlzLl9nZXRGaWVsZExhYmVsKGlucHV0KSxcbiAgICAgICAgICBhdXRvY29tcGxldGU6IGlucHV0LmF1dG9jb21wbGV0ZSB8fCAnJyxcbiAgICAgICAgICByZXF1aXJlZDogaW5wdXQucmVxdWlyZWQgfHwgaW5wdXQuZ2V0QXR0cmlidXRlKCdhcmlhLXJlcXVpcmVkJykgPT09ICd0cnVlJyxcbiAgICAgICAgfTtcblxuICAgICAgICBmaWVsZHMucHVzaChmaWVsZCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3VnZ2VzdCB2YWx1ZSBmb3IgYSBmaWVsZCBiYXNlZCBvbiB0eXBlIGFuZCBjb250ZXh0XG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGZpZWxkVHlwZSAtIEZpZWxkIHR5cGUgb3IgbmFtZVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBwYWdlQ29udGV4dCAtIFBhZ2UgY29udGV4dCBmcm9tIGV4dHJhY3RQYWdlQ29udGV4dCgpXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHByb2ZpbGVEYXRhIC0gVXNlciBwcm9maWxlIGRhdGEgKGZyb20gTUNQKVxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd8bnVsbH0gU3VnZ2VzdGVkIHZhbHVlXG4gICAgICovXG4gICAgc3VnZ2VzdFZhbHVlKGZpZWxkVHlwZSwgcGFnZUNvbnRleHQgPSBudWxsLCBwcm9maWxlRGF0YSA9IG51bGwpIHtcbiAgICAgIGNvbnN0IGNvbnRleHQgPSBwYWdlQ29udGV4dCB8fCB0aGlzLmV4dHJhY3RQYWdlQ29udGV4dCgpO1xuICAgICAgY29uc3Qgbm9ybWFsaXplZFR5cGUgPSB0aGlzLl9ub3JtYWxpemVGaWVsZEtleShmaWVsZFR5cGUpO1xuXG4gICAgICAvLyAxLiBDaGVjayBVUkwgcGFyYW1zIGZpcnN0XG4gICAgICBpZiAoY29udGV4dC51cmxQYXJhbXNbbm9ybWFsaXplZFR5cGVdKSB7XG4gICAgICAgIHJldHVybiBjb250ZXh0LnVybFBhcmFtc1tub3JtYWxpemVkVHlwZV07XG4gICAgICB9XG5cbiAgICAgIC8vIDIuIENoZWNrIHBhZ2UgdGV4dCBleHRyYWN0aW9uXG4gICAgICBpZiAoY29udGV4dC5wYWdlVGV4dFZhbHVlc1tub3JtYWxpemVkVHlwZV0pIHtcbiAgICAgICAgcmV0dXJuIGNvbnRleHQucGFnZVRleHRWYWx1ZXNbbm9ybWFsaXplZFR5cGVdO1xuICAgICAgfVxuXG4gICAgICAvLyAzLiBDaGVjayBwcm9maWxlIGRhdGEgKGZyb20gTUNQKVxuICAgICAgaWYgKHByb2ZpbGVEYXRhPy5maWVsZHM/Lltub3JtYWxpemVkVHlwZV0pIHtcbiAgICAgICAgY29uc3QgZmllbGQgPSBwcm9maWxlRGF0YS5maWVsZHNbbm9ybWFsaXplZFR5cGVdO1xuICAgICAgICBpZiAoIWZpZWxkLnNlbnNpdGl2ZSB8fCBmaWVsZC52YWx1ZSkge1xuICAgICAgICAgIHJldHVybiBmaWVsZC52YWx1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyA0LiBDaGVjayBhbGlhc2VzIGluIHByb2ZpbGVcbiAgICAgIGlmIChwcm9maWxlRGF0YT8uYWxpYXNlcykge1xuICAgICAgICBmb3IgKGNvbnN0IFthbGlhcywgY2Fub25pY2FsXSBvZiBPYmplY3QuZW50cmllcyhwcm9maWxlRGF0YS5hbGlhc2VzKSkge1xuICAgICAgICAgIGlmICh0aGlzLl90b2tlbk1hdGNoKG5vcm1hbGl6ZWRUeXBlLCBhbGlhcykgJiYgcHJvZmlsZURhdGEuZmllbGRzPy5bY2Fub25pY2FsXSkge1xuICAgICAgICAgICAgY29uc3QgZmllbGQgPSBwcm9maWxlRGF0YS5maWVsZHNbY2Fub25pY2FsXTtcbiAgICAgICAgICAgIGlmICghZmllbGQuc2Vuc2l0aXZlIHx8IGZpZWxkLnZhbHVlKSB7XG4gICAgICAgICAgICAgIHJldHVybiBmaWVsZC52YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gNS4gQ2hlY2sgYnVpbHQtaW4gYWxpYXNlc1xuICAgICAgY29uc3QgYWxpYXNLZXkgPSB0aGlzLl9maW5kQWxpYXNLZXkobm9ybWFsaXplZFR5cGUpO1xuICAgICAgaWYgKGFsaWFzS2V5ICE9PSBub3JtYWxpemVkVHlwZSkge1xuICAgICAgICBpZiAoY29udGV4dC51cmxQYXJhbXNbYWxpYXNLZXldKSByZXR1cm4gY29udGV4dC51cmxQYXJhbXNbYWxpYXNLZXldO1xuICAgICAgICBpZiAoY29udGV4dC5wYWdlVGV4dFZhbHVlc1thbGlhc0tleV0pIHJldHVybiBjb250ZXh0LnBhZ2VUZXh0VmFsdWVzW2FsaWFzS2V5XTtcbiAgICAgICAgaWYgKHByb2ZpbGVEYXRhPy5maWVsZHM/LlthbGlhc0tleV0pIHJldHVybiBwcm9maWxlRGF0YS5maWVsZHNbYWxpYXNLZXldLnZhbHVlO1xuICAgICAgfVxuXG4gICAgICAvLyA2LiBDaGVjayBsb2NhbFN0b3JhZ2UgaGludHNcbiAgICAgIGlmIChjb250ZXh0LnN0b3JhZ2VIaW50c1tub3JtYWxpemVkVHlwZV0pIHtcbiAgICAgICAgcmV0dXJuIGNvbnRleHQuc3RvcmFnZUhpbnRzW25vcm1hbGl6ZWRUeXBlXTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IGZpZWxkIHR5cGUgcmVjb21tZW5kYXRpb25zIGJhc2VkIG9uIHBhZ2UgY29udGV4dFxuICAgICAqIEBwYXJhbSB7RWxlbWVudH0gZWxlbWVudCAtIElucHV0IGVsZW1lbnRcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUeXBlIGluZm8gYW5kIHN1Z2dlc3Rpb25zXG4gICAgICovXG4gICAgYW5hbHl6ZUZpZWxkKGVsZW1lbnQpIHtcbiAgICAgIGNvbnN0IGFuYWx5c2lzID0ge1xuICAgICAgICBpbmZlcnJlZFR5cGU6ICd0ZXh0JyxcbiAgICAgICAgY29uZmlkZW5jZTogMCxcbiAgICAgICAgc3VnZ2VzdGlvbnM6IFtdLFxuICAgICAgICB2YWxpZGF0aW9uOiBudWxsLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgaGludHMgPSB0aGlzLl9jb2xsZWN0RmllbGRIaW50cyhlbGVtZW50KTtcbiAgICAgIGNvbnN0IGNvbWJpbmVkID0gaGludHMuam9pbignICcpLnRvTG93ZXJDYXNlKCk7XG5cbiAgICAgIC8vIFR5cGUgaW5mZXJlbmNlXG4gICAgICBjb25zdCB0eXBlUGF0dGVybnMgPSBbXG4gICAgICAgIHsgdHlwZTogJ2VtYWlsJywgcGF0dGVybjogL2VtYWlsfGUtbWFpbHxtYWlsL2ksIGNvbmZpZGVuY2U6IDkwIH0sXG4gICAgICAgIHsgdHlwZTogJ3Bob25lJywgcGF0dGVybjogL3Bob25lfHRlbHxtb2JpbGV8Y2VsbC9pLCBjb25maWRlbmNlOiA5MCB9LFxuICAgICAgICB7IHR5cGU6ICdmaXJzdF9uYW1lJywgcGF0dGVybjogL2ZpcnN0W19cXHMtXT9uYW1lfGdpdmVufGZuYW1lL2ksIGNvbmZpZGVuY2U6IDg1IH0sXG4gICAgICAgIHsgdHlwZTogJ2xhc3RfbmFtZScsIHBhdHRlcm46IC9sYXN0W19cXHMtXT9uYW1lfGZhbWlseXxzdXJuYW1lfGxuYW1lL2ksIGNvbmZpZGVuY2U6IDg1IH0sXG4gICAgICAgIHsgdHlwZTogJ2FkZHJlc3MnLCBwYXR0ZXJuOiAvYWRkcmVzc3xzdHJlZXQvaSwgY29uZmlkZW5jZTogODAgfSxcbiAgICAgICAgeyB0eXBlOiAnY2l0eScsIHBhdHRlcm46IC9jaXR5fHRvd24vaSwgY29uZmlkZW5jZTogODUgfSxcbiAgICAgICAgeyB0eXBlOiAnc3RhdGUnLCBwYXR0ZXJuOiAvc3RhdGV8cHJvdmluY2V8cmVnaW9uL2ksIGNvbmZpZGVuY2U6IDg1IH0sXG4gICAgICAgIHsgdHlwZTogJ3ppcCcsIHBhdHRlcm46IC96aXB8cG9zdGFsL2ksIGNvbmZpZGVuY2U6IDkwIH0sXG4gICAgICAgIHsgdHlwZTogJ2NvdW50cnknLCBwYXR0ZXJuOiAvY291bnRyeXxuYXRpb24vaSwgY29uZmlkZW5jZTogODUgfSxcbiAgICAgICAgeyB0eXBlOiAnY29tcGFueScsIHBhdHRlcm46IC9jb21wYW55fG9yZ2FuaXphdGlvbnxlbXBsb3llci9pLCBjb25maWRlbmNlOiA4MCB9LFxuICAgICAgICB7IHR5cGU6ICdkYXRlX29mX2JpcnRoJywgcGF0dGVybjogL2RvYnxiaXJ0aHxiaXJ0aGRheS9pLCBjb25maWRlbmNlOiA4NSB9LFxuICAgICAgICB7IHR5cGU6ICdzc24nLCBwYXR0ZXJuOiAvc3NufHNvY2lhbFtfXFxzLV0/c2VjdXJpdHkvaSwgY29uZmlkZW5jZTogOTUsIHNlbnNpdGl2ZTogdHJ1ZSB9LFxuICAgICAgICB7IHR5cGU6ICdwYXNzd29yZCcsIHBhdHRlcm46IC9wYXNzd29yZHxwYXNzd2R8cHdkL2ksIGNvbmZpZGVuY2U6IDk1LCBzZW5zaXRpdmU6IHRydWUgfSxcbiAgICAgIF07XG5cbiAgICAgIGZvciAoY29uc3QgeyB0eXBlLCBwYXR0ZXJuLCBjb25maWRlbmNlLCBzZW5zaXRpdmUgfSBvZiB0eXBlUGF0dGVybnMpIHtcbiAgICAgICAgaWYgKHBhdHRlcm4udGVzdChjb21iaW5lZCkpIHtcbiAgICAgICAgICBhbmFseXNpcy5pbmZlcnJlZFR5cGUgPSB0eXBlO1xuICAgICAgICAgIGFuYWx5c2lzLmNvbmZpZGVuY2UgPSBjb25maWRlbmNlO1xuICAgICAgICAgIGFuYWx5c2lzLnNlbnNpdGl2ZSA9IHNlbnNpdGl2ZSB8fCBmYWxzZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBIVE1MNSBpbnB1dCB0eXBlXG4gICAgICBjb25zdCBpbnB1dFR5cGUgPSBlbGVtZW50LnR5cGU/LnRvTG93ZXJDYXNlKCk7XG4gICAgICBpZiAoaW5wdXRUeXBlICYmIGlucHV0VHlwZSAhPT0gJ3RleHQnKSB7XG4gICAgICAgIGFuYWx5c2lzLmh0bWxUeXBlID0gaW5wdXRUeXBlO1xuICAgICAgICBpZiAoWydlbWFpbCcsICd0ZWwnLCAnZGF0ZScsICdudW1iZXInLCAncGFzc3dvcmQnXS5pbmNsdWRlcyhpbnB1dFR5cGUpKSB7XG4gICAgICAgICAgYW5hbHlzaXMuaW5mZXJyZWRUeXBlID0gaW5wdXRUeXBlID09PSAndGVsJyA/ICdwaG9uZScgOiBpbnB1dFR5cGU7XG4gICAgICAgICAgYW5hbHlzaXMuY29uZmlkZW5jZSA9IE1hdGgubWF4KGFuYWx5c2lzLmNvbmZpZGVuY2UsIDk1KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBhdXRvY29tcGxldGUgYXR0cmlidXRlXG4gICAgICBjb25zdCBhdXRvY29tcGxldGUgPSBlbGVtZW50LmF1dG9jb21wbGV0ZTtcbiAgICAgIGlmIChhdXRvY29tcGxldGUgJiYgYXV0b2NvbXBsZXRlICE9PSAnb2ZmJykge1xuICAgICAgICBhbmFseXNpcy5hdXRvY29tcGxldGUgPSBhdXRvY29tcGxldGU7XG4gICAgICAgIGFuYWx5c2lzLmNvbmZpZGVuY2UgPSBNYXRoLm1heChhbmFseXNpcy5jb25maWRlbmNlLCA5MCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBhbmFseXNpcztcbiAgICB9XG5cbiAgICAvLyA9PT0gSGVscGVyIG1ldGhvZHMgPT09XG5cbiAgICBfbm9ybWFsaXplRmllbGRLZXkoa2V5KSB7XG4gICAgICByZXR1cm4gU3RyaW5nKGtleSB8fCAnJylcbiAgICAgICAgLnRvTG93ZXJDYXNlKClcbiAgICAgICAgLnJlcGxhY2UoL1teYS16MC05XSsvZywgJ18nKVxuICAgICAgICAucmVwbGFjZSgvXl8rfF8rJC9nLCAnJyk7XG4gICAgfVxuXG4gICAgX2dldEZpZWxkS2V5KGVsZW1lbnQpIHtcbiAgICAgIHJldHVybiBlbGVtZW50Lm5hbWUgfHwgZWxlbWVudC5pZCB8fCBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS10ZXN0aWQnKSB8fCAnJztcbiAgICB9XG5cbiAgICBfZ2V0RmllbGRMYWJlbChlbGVtZW50KSB7XG4gICAgICBjb25zdCBpZCA9IGVsZW1lbnQuaWQ7XG4gICAgICBpZiAoaWQpIHtcbiAgICAgICAgY29uc3QgbGFiZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBsYWJlbFtmb3I9XCIke0NTUy5lc2NhcGUoaWQpfVwiXWApO1xuICAgICAgICBpZiAobGFiZWw/LnRleHRDb250ZW50KSByZXR1cm4gbGFiZWwudGV4dENvbnRlbnQudHJpbSgpO1xuICAgICAgfVxuICAgICAgY29uc3QgY2xvc2VzdExhYmVsID0gZWxlbWVudC5jbG9zZXN0KCdsYWJlbCcpO1xuICAgICAgaWYgKGNsb3Nlc3RMYWJlbD8udGV4dENvbnRlbnQpIHJldHVybiBjbG9zZXN0TGFiZWwudGV4dENvbnRlbnQudHJpbSgpO1xuICAgICAgcmV0dXJuICcnO1xuICAgIH1cblxuICAgIF9nZXRGb3JtQWN0aW9uKCkge1xuICAgICAgY29uc3QgZm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2Zvcm0nKTtcbiAgICAgIHJldHVybiBmb3JtPy5hY3Rpb24gfHwgJyc7XG4gICAgfVxuXG4gICAgX2dldE1haW5IZWFkaW5nKCkge1xuICAgICAgY29uc3QgaDEgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdoMScpO1xuICAgICAgcmV0dXJuIGgxPy50ZXh0Q29udGVudCB8fCAnJztcbiAgICB9XG5cbiAgICBfZ2V0QnV0dG9uVGV4dHMoKSB7XG4gICAgICBjb25zdCBidXR0b25zID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnYnV0dG9uLCBpbnB1dFt0eXBlPVwic3VibWl0XCJdLCBbcm9sZT1cImJ1dHRvblwiXScpO1xuICAgICAgcmV0dXJuIEFycmF5LmZyb20oYnV0dG9ucykubWFwKGIgPT4gYi50ZXh0Q29udGVudCB8fCBiLnZhbHVlIHx8ICcnKS5qb2luKCcgJyk7XG4gICAgfVxuXG4gICAgX2lzVmFsaWRWYWx1ZSh2YWx1ZSkge1xuICAgICAgY29uc3QgdGV4dCA9IFN0cmluZyh2YWx1ZSB8fCAnJykudHJpbSgpO1xuICAgICAgcmV0dXJuIHRleHQubGVuZ3RoID4gMCAmJiB0ZXh0Lmxlbmd0aCA8IDUwMDtcbiAgICB9XG5cbiAgICBfaXNTZW5zaXRpdmVLZXkoa2V5KSB7XG4gICAgICBjb25zdCBzZW5zaXRpdmVQYXR0ZXJucyA9IC9wYXNzd29yZHxwYXNzd2R8cHdkfHNzbnxzb2NpYWx8c2VjcmV0fHRva2VufGtleXxhdXRofGNhcmR8Y3Z2fGN2Y3xwaW4vaTtcbiAgICAgIHJldHVybiBzZW5zaXRpdmVQYXR0ZXJucy50ZXN0KGtleSk7XG4gICAgfVxuXG4gICAgX3Rva2VuTWF0Y2goc3RyMSwgc3RyMikge1xuICAgICAgY29uc3Qgbm9ybTEgPSB0aGlzLl9ub3JtYWxpemVGaWVsZEtleShzdHIxKTtcbiAgICAgIGNvbnN0IG5vcm0yID0gdGhpcy5fbm9ybWFsaXplRmllbGRLZXkoc3RyMik7XG4gICAgICByZXR1cm4gbm9ybTEgPT09IG5vcm0yIHx8IG5vcm0xLmluY2x1ZGVzKG5vcm0yKSB8fCBub3JtMi5pbmNsdWRlcyhub3JtMSk7XG4gICAgfVxuXG4gICAgX2ZpbmRBbGlhc0tleShrZXkpIHtcbiAgICAgIGZvciAoY29uc3QgW2Nhbm9uaWNhbCwgYWxpYXNlc10gb2YgT2JqZWN0LmVudHJpZXMoQ29udGV4dEluZmVyZW5jZS5GSUVMRF9BTElBU0VTKSkge1xuICAgICAgICBpZiAoa2V5ID09PSBjYW5vbmljYWwpIHJldHVybiBjYW5vbmljYWw7XG4gICAgICAgIGlmIChhbGlhc2VzLmluY2x1ZGVzKGtleSkpIHJldHVybiBjYW5vbmljYWw7XG4gICAgICB9XG4gICAgICByZXR1cm4ga2V5O1xuICAgIH1cblxuICAgIF9jb2xsZWN0RmllbGRIaW50cyhlbGVtZW50KSB7XG4gICAgICBjb25zdCBoaW50cyA9IFtdO1xuICAgICAgY29uc3QgYXR0cnMgPSBbJ25hbWUnLCAnaWQnLCAncGxhY2Vob2xkZXInLCAnYXJpYS1sYWJlbCcsICdhdXRvY29tcGxldGUnLCAndGl0bGUnLCAnZGF0YS10ZXN0aWQnXTtcbiAgICAgIFxuICAgICAgZm9yIChjb25zdCBhdHRyIG9mIGF0dHJzKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoYXR0cik7XG4gICAgICAgIGlmICh2YWx1ZSkgaGludHMucHVzaCh2YWx1ZSk7XG4gICAgICB9XG5cbiAgICAgIGhpbnRzLnB1c2godGhpcy5fZ2V0RmllbGRMYWJlbChlbGVtZW50KSk7XG4gICAgICByZXR1cm4gaGludHMuZmlsdGVyKEJvb2xlYW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENsZWFyIGNhY2hlZCBjb250ZXh0XG4gICAgICovXG4gICAgY2xlYXJDYWNoZSgpIHtcbiAgICAgIHRoaXMucGFnZUNvbnRleHRDYWNoZSA9IG51bGw7XG4gICAgICB0aGlzLnBhZ2VDb250ZXh0Q2FjaGVFeHBpcnkgPSAwO1xuICAgIH1cbiAgfVxuXG4gIC8vIENyZWF0ZSBnbG9iYWwgaW5zdGFuY2VcbiAgd2luZG93Ll9fYmlsZ2VfY29udGV4dEluZmVyZW5jZSA9IG5ldyBDb250ZXh0SW5mZXJlbmNlKCk7XG5cbiAgY29uc29sZS5sb2coJ1tCaWxnZV0gQ29udGV4dEluZmVyZW5jZSBpbml0aWFsaXplZCcpO1xufSkoKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Q0FHQyxXQUFXO0FBQ1Y7QUFFQSxNQUFJLE9BQU8seUJBQTBCO0FBQUEsRUFLckMsTUFBTSxpQkFBaUI7QUFBQSxJQVh6QixPQVd5QjtBQUFBO0FBQUE7QUFBQSxJQUNyQixjQUFjO0FBQ1osV0FBSyxtQkFBbUI7QUFDeEIsV0FBSyx5QkFBeUI7QUFDOUIsV0FBSyxXQUFXO0FBQUEsSUFDbEI7QUFBQTtBQUFBLElBR0EsT0FBTyxVQUFVLENBQUMsY0FBYyxhQUFhLGVBQWUsZ0JBQWdCLFNBQVM7QUFBQTtBQUFBLElBR3JGLE9BQU8sbUJBQW1CO0FBQUEsTUFDeEIsY0FBYztBQUFBLE1BQ2QsT0FBTztBQUFBLE1BQ1AsVUFBVTtBQUFBLE1BQ1YsU0FBUztBQUFBLE1BQ1QsYUFBYTtBQUFBLE1BQ2IsU0FBUztBQUFBLE1BQ1QsUUFBUTtBQUFBLE1BQ1IsY0FBYztBQUFBLElBQ2hCO0FBQUE7QUFBQSxJQUdBLE9BQU8sZ0JBQWdCO0FBQUEsTUFDckIsWUFBWSxDQUFDLGNBQWMsU0FBUyxhQUFhLE9BQU87QUFBQSxNQUN4RCxXQUFXLENBQUMsZUFBZSxTQUFTLFlBQVksV0FBVyxNQUFNO0FBQUEsTUFDakUsT0FBTyxDQUFDLFFBQVEsaUJBQWlCLFVBQVUsY0FBYztBQUFBLE1BQ3pELE9BQU8sQ0FBQyxPQUFPLGFBQWEsVUFBVSxRQUFRLGdCQUFnQixhQUFhO0FBQUEsTUFDM0UsU0FBUyxDQUFDLFVBQVUsWUFBWSxrQkFBa0IsZ0JBQWdCO0FBQUEsTUFDbEUsTUFBTSxDQUFDLFFBQVEsVUFBVTtBQUFBLE1BQ3pCLE9BQU8sQ0FBQyxZQUFZLFVBQVUsZ0JBQWdCO0FBQUEsTUFDOUMsS0FBSyxDQUFDLFVBQVUsZUFBZSxZQUFZLFdBQVcsVUFB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
