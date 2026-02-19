// contextInference.js - Context-aware value inference for intelligent form filling
// Extends existing contextAnalyzer.js with page context extraction and value suggestions

(function() {
  'use strict';

  if (window.__bilge_contextInference) return;

  /**
   * ContextInference - Extract page context and infer field values
   */
  class ContextInference {
    constructor() {
      this.pageContextCache = null;
      this.pageContextCacheExpiry = 0;
      this.cacheTTL = 10000; // 10 seconds
    }

    // Inference sources in priority order
    static SOURCES = ['url_params', 'page_text', 'nearby_text', 'autocomplete', 'storage'];

    // Form purpose patterns
    static PURPOSE_PATTERNS = {
      registration: /register|signup|sign[_\-\s]?up|create[_\-\s]?account|join/i,
      login: /login|signin|sign[_\-\s]?in|auth/i,
      checkout: /checkout|payment|order|purchase|buy|cart/i,
      contact: /contact|inquiry|message|feedback|support/i,
      application: /apply|application|submit|form|request/i,
      profile: /profile|settings|account|preferences/i,
      search: /search|find|lookup|query/i,
      subscription: /subscribe|newsletter|email[_\-\s]?list|mailing/i,
    };

    // Field type aliases for matching
    static FIELD_ALIASES = {
      first_name: ['given_name', 'fname', 'firstname', 'first'],
      last_name: ['family_name', 'lname', 'lastname', 'surname', 'last'],
      email: ['mail', 'email_address', 'e_mail', 'emailaddress'],
      phone: ['tel', 'telephone', 'mobile', 'cell', 'phone_number', 'phonenumber'],
      address: ['street', 'address1', 'street_address', 'address_line_1'],
      city: ['town', 'locality'],
      state: ['province', 'region', 'state_province'],
      zip: ['postal', 'postal_code', 'zip_code', 'zipcode', 'postcode'],
      country: ['nation', 'country_code'],
      company: ['organization', 'org', 'business', 'employer'],
      date_of_birth: ['dob', 'birthdate', 'birth_date', 'birthday'],
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
        timestamp: now,
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
        this._getButtonTexts(),
      ].join(' ').toLowerCase();

      for (const [purpose, pattern] of Object.entries(ContextInference.PURPOSE_PATTERNS)) {
        if (pattern.test(signals)) {
          return purpose;
        }
      }

      return 'general';
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

      // Also check hash params (SPA routing)
      if (location.hash.includes('?')) {
        const hashParams = new URLSearchParams(location.hash.split('?')[1]);
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

        let value = '';
        if (input.isContentEditable) {
          value = String(input.textContent || '').trim();
        } else if ('value' in input) {
          value = String(input.value || '').trim();
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
      const text = document.body?.innerText || '';
      const extracted = {};

      // Email patterns
      const emailMatches = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
      if (emailMatches?.length) {
        // Take first non-noreply email
        extracted.email = emailMatches.find(e => !e.includes('noreply') && !e.includes('no-reply')) || emailMatches[0];
      }

      // Phone patterns (US format)
      const phoneMatch = text.match(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/);
      if (phoneMatch) {
        extracted.phone = phoneMatch[0].replace(/\D+/g, '').slice(-10);
      }

      // "Your X: value" patterns
      const yourPatterns = [
        { pattern: /your\s+(?:email|e-mail)[:\s]+([^\n<]+)/gi, key: 'email' },
        { pattern: /your\s+(?:phone|tel|mobile)[:\s]+([^\n<]+)/gi, key: 'phone' },
        { pattern: /your\s+name[:\s]+([^\n<]+)/gi, key: 'name' },
        { pattern: /welcome,?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g, key: 'name' },
        { pattern: /hi,?\s+([A-Z][a-z]+)/gi, key: 'first_name' },
        { pattern: /logged\s+in\s+as[:\s]+([^\n<]+)/gi, key: 'username' },
      ];

      for (const { pattern, key } of yourPatterns) {
        const match = text.match(pattern);
        if (match?.[1]) {
          extracted[key] = match[1].trim().slice(0, 100);
        }
      }

      // Address patterns (basic)
      const addressMatch = text.match(/\d+\s+[A-Za-z]+(?:\s+[A-Za-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd)/i);
      if (addressMatch) {
        extracted.address = addressMatch[0].slice(0, 150);
      }

      // Zip code patterns (US)
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
        const relevantKeys = ['user', 'profile', 'email', 'name', 'phone', 'address', 'preferences'];
        
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key) continue;

          const lowKey = key.toLowerCase();
          const isRelevant = relevantKeys.some(k => lowKey.includes(k));
          if (!isRelevant) continue;

          try {
            const value = localStorage.getItem(key);
            if (!value || value.length > 1000) continue;

            // Try to parse as JSON
            const parsed = JSON.parse(value);
            if (typeof parsed === 'object' && parsed !== null) {
              for (const [k, v] of Object.entries(parsed)) {
                if (typeof v === 'string' && this._isValidValue(v) && !this._isSensitiveKey(k)) {
                  hints[this._normalizeFieldKey(k)] = v;
                }
              }
            }
          } catch (_err) {
            // Not JSON or parse error
          }
        }
      } catch (_err) {
        // localStorage access error
      }

      return hints;
    }

    /**
     * Extract summary of form fields on the page
     * @returns {Array} Field summaries with type, name, label info
     */
    extractFormFieldsSummary() {
      const fields = [];
      const inputs = document.querySelectorAll('input, textarea, select');

      for (const input of inputs) {
        const type = input.type || input.tagName.toLowerCase();
        if (['hidden', 'submit', 'button', 'image', 'file', 'reset'].includes(type)) continue;

        const field = {
          type,
          name: input.name || '',
          id: input.id || '',
          placeholder: input.placeholder || '',
          label: this._getFieldLabel(input),
          autocomplete: input.autocomplete || '',
          required: input.required || input.getAttribute('aria-required') === 'true',
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

      // 1. Check URL params first
      if (context.urlParams[normalizedType]) {
        return context.urlParams[normalizedType];
      }

      // 2. Check page text extraction
      if (context.pageTextValues[normalizedType]) {
        return context.pageTextValues[normalizedType];
      }

      // 3. Check profile data (from MCP)
      if (profileData?.fields?.[normalizedType]) {
        const field = profileData.fields[normalizedType];
        if (!field.sensitive || field.value) {
          return field.value;
        }
      }

      // 4. Check aliases in profile
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

      // 5. Check built-in aliases
      const aliasKey = this._findAliasKey(normalizedType);
      if (aliasKey !== normalizedType) {
        if (context.urlParams[aliasKey]) return context.urlParams[aliasKey];
        if (context.pageTextValues[aliasKey]) return context.pageTextValues[aliasKey];
        if (profileData?.fields?.[aliasKey]) return profileData.fields[aliasKey].value;
      }

      // 6. Check localStorage hints
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
        inferredType: 'text',
        confidence: 0,
        suggestions: [],
        validation: null,
      };

      const hints = this._collectFieldHints(element);
      const combined = hints.join(' ').toLowerCase();

      // Type inference
      const typePatterns = [
        { type: 'email', pattern: /email|e-mail|mail/i, confidence: 90 },
        { type: 'phone', pattern: /phone|tel|mobile|cell/i, confidence: 90 },
        { type: 'first_name', pattern: /first[_\s-]?name|given|fname/i, confidence: 85 },
        { type: 'last_name', pattern: /last[_\s-]?name|family|surname|lname/i, confidence: 85 },
        { type: 'address', pattern: /address|street/i, confidence: 80 },
        { type: 'city', pattern: /city|town/i, confidence: 85 },
        { type: 'state', pattern: /state|province|region/i, confidence: 85 },
        { type: 'zip', pattern: /zip|postal/i, confidence: 90 },
        { type: 'country', pattern: /country|nation/i, confidence: 85 },
        { type: 'company', pattern: /company|organization|employer/i, confidence: 80 },
        { type: 'date_of_birth', pattern: /dob|birth|birthday/i, confidence: 85 },
        { type: 'ssn', pattern: /ssn|social[_\s-]?security/i, confidence: 95, sensitive: true },
        { type: 'password', pattern: /password|passwd|pwd/i, confidence: 95, sensitive: true },
      ];

      for (const { type, pattern, confidence, sensitive } of typePatterns) {
        if (pattern.test(combined)) {
          analysis.inferredType = type;
          analysis.confidence = confidence;
          analysis.sensitive = sensitive || false;
          break;
        }
      }

      // Check HTML5 input type
      const inputType = element.type?.toLowerCase();
      if (inputType && inputType !== 'text') {
        analysis.htmlType = inputType;
        if (['email', 'tel', 'date', 'number', 'password'].includes(inputType)) {
          analysis.inferredType = inputType === 'tel' ? 'phone' : inputType;
          analysis.confidence = Math.max(analysis.confidence, 95);
        }
      }

      // Check autocomplete attribute
      const autocomplete = element.autocomplete;
      if (autocomplete && autocomplete !== 'off') {
        analysis.autocomplete = autocomplete;
        analysis.confidence = Math.max(analysis.confidence, 90);
      }

      return analysis;
    }

    // === Helper methods ===

    _normalizeFieldKey(key) {
      return String(key || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    }

    _getFieldKey(element) {
      return element.name || element.id || element.getAttribute('data-testid') || '';
    }

    _getFieldLabel(element) {
      const id = element.id;
      if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label?.textContent) return label.textContent.trim();
      }
      const closestLabel = element.closest('label');
      if (closestLabel?.textContent) return closestLabel.textContent.trim();
      return '';
    }

    _getFormAction() {
      const form = document.querySelector('form');
      return form?.action || '';
    }

    _getMainHeading() {
      const h1 = document.querySelector('h1');
      return h1?.textContent || '';
    }

    _getButtonTexts() {
      const buttons = document.querySelectorAll('button, input[type="submit"], [role="button"]');
      return Array.from(buttons).map(b => b.textContent || b.value || '').join(' ');
    }

    _isValidValue(value) {
      const text = String(value || '').trim();
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
      const attrs = ['name', 'id', 'placeholder', 'aria-label', 'autocomplete', 'title', 'data-testid'];
      
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

  // Create global instance
  window.__bilge_contextInference = new ContextInference();

  console.log('[Bilge] ContextInference initialized');
})();
