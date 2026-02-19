// mcpDataBridge.js - MCP filesystem integration for form data loading
// Enables loading profile data from MCP for intelligent form filling

(function() {
  'use strict';

  if (window.__bilge_mcpDataBridge) return;

  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  const MAX_CACHE_ENTRIES = 10;

  /**
   * MCPDataBridge - Load and manage form data from MCP filesystem
   */
  class MCPDataBridge {
    constructor() {
      this.cache = new Map(); // profileKey -> { data, timestamp }
      this.pendingRequests = new Map(); // path -> Promise
    }

    /**
     * Load profile data from MCP filesystem
     * @param {string} profilePath - Path to profile JSON file
     * @returns {Promise<Object|null>} Profile data or null if failed
     */
    async loadProfileData(profilePath = 'profiles/default.json') {
      // Check cache first
      const cached = this._getFromCache(profilePath);
      if (cached) return cached;

      // Check if request is already in flight
      if (this.pendingRequests.has(profilePath)) {
        return this.pendingRequests.get(profilePath);
      }

      // Create new request
      const requestPromise = this._fetchProfileData(profilePath);
      this.pendingRequests.set(profilePath, requestPromise);

      try {
        const data = await requestPromise;
        this.pendingRequests.delete(profilePath);
        
        if (data) {
          this._addToCache(profilePath, data);
        }
        
        return data;
      } catch (err) {
        this.pendingRequests.delete(profilePath);
        console.error('[MCPDataBridge] Failed to load profile:', err.message);
        return null;
      }
    }

    /**
     * Fetch profile data via background script -> MCP
     */
    async _fetchProfileData(profilePath) {
      return new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage({
            type: 'LOAD_MCP_FORM_DATA',
            payload: { path: profilePath }
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }

            if (response?.ok && response.formData) {
              resolve(this._normalizeProfileData(response.formData));
            } else {
              resolve(null);
            }
          });
        } catch (err) {
          reject(err);
        }
      });
    }

    /**
     * Normalize profile data to standard format
     */
    _normalizeProfileData(rawData) {
      if (!rawData || typeof rawData !== 'object') return null;

      const normalized = {
        profile: rawData.profile || rawData.name || 'default',
        fields: {},
        aliases: {},
        metadata: {
          version: rawData.version || '1.0',
          lastUpdated: rawData.lastUpdated || new Date().toISOString(),
        },
      };

      // Normalize fields
      const rawFields = rawData.fields || rawData.data || rawData;
      if (typeof rawFields === 'object') {
        for (const [key, value] of Object.entries(rawFields)) {
          // Skip metadata keys
          if (['profile', 'name', 'version', 'lastUpdated', 'aliases', 'metadata'].includes(key)) {
            continue;
          }

          const normalizedKey = this._normalizeFieldKey(key);
          
          if (typeof value === 'object' && value !== null) {
            // Already in structured format
            normalized.fields[normalizedKey] = {
              value: value.value ?? value.val ?? '',
              sensitive: value.sensitive ?? value.private ?? false,
              hint: value.hint ?? value.description ?? '',
              type: value.type ?? 'text',
            };
          } else {
            // Simple key-value
            normalized.fields[normalizedKey] = {
              value: String(value ?? ''),
              sensitive: this._isSensitiveKey(normalizedKey),
              hint: '',
              type: this._inferFieldType(normalizedKey),
            };
          }
        }
      }

      // Normalize aliases
      const rawAliases = rawData.aliases || {};
      if (typeof rawAliases === 'object') {
        for (const [alias, canonical] of Object.entries(rawAliases)) {
          const normalizedAlias = this._normalizeFieldKey(alias);
          const normalizedCanonical = this._normalizeFieldKey(canonical);
          normalized.aliases[normalizedAlias] = normalizedCanonical;
        }
      }

      // Add built-in aliases
      this._addBuiltinAliases(normalized.aliases);

      return normalized;
    }

    /**
     * Add built-in field aliases
     */
    _addBuiltinAliases(aliases) {
      const builtins = {
        'given_name': 'first_name',
        'fname': 'first_name',
        'firstname': 'first_name',
        'family_name': 'last_name',
        'lname': 'last_name',
        'lastname': 'last_name',
        'surname': 'last_name',
        'mail': 'email',
        'email_address': 'email',
        'tel': 'phone',
        'telephone': 'phone',
        'mobile': 'phone',
        'phone_number': 'phone',
        'street': 'address',
        'address1': 'address',
        'street_address': 'address',
        'postal': 'zip',
        'postal_code': 'zip',
        'zip_code': 'zip',
        'postcode': 'zip',
        'province': 'state',
        'region': 'state',
      };

      for (const [alias, canonical] of Object.entries(builtins)) {
        if (!aliases[alias]) {
          aliases[alias] = canonical;
        }
      }
    }

    /**
     * Match form fields to profile data
     * @param {Array} formFields - Array of form field descriptors
     * @param {Object} profileData - Normalized profile data
     * @returns {Map} Field selector -> value mapping
     */
    matchFieldsToProfile(formFields, profileData) {
      const mapping = new Map();
      if (!Array.isArray(formFields) || !profileData?.fields) {
        return mapping;
      }

      const aliases = profileData.aliases || {};
      const fields = profileData.fields;

      for (const field of formFields) {
        const fieldKey = this._extractFieldKey(field);
        if (!fieldKey) continue;

        const normalizedKey = this._normalizeFieldKey(fieldKey);
        let value = null;

        // Direct match
        if (fields[normalizedKey]) {
          const fieldData = fields[normalizedKey];
          if (!fieldData.sensitive || fieldData.value) {
            value = fieldData.value;
          }
        }

        // Alias match
        if (!value) {
          const canonical = aliases[normalizedKey];
          if (canonical && fields[canonical]) {
            const fieldData = fields[canonical];
            if (!fieldData.sensitive || fieldData.value) {
              value = fieldData.value;
            }
          }
        }

        // Token match (fuzzy)
        if (!value) {
          for (const [key, fieldData] of Object.entries(fields)) {
            if (this._tokenMatch(normalizedKey, key)) {
              if (!fieldData.sensitive || fieldData.value) {
                value = fieldData.value;
                break;
              }
            }
          }
        }

        if (value !== null && value !== undefined) {
          const selector = field.selector || this._buildSelector(field);
          if (selector) {
            mapping.set(selector, value);
          }
        }
      }

      return mapping;
    }

    /**
     * Get value for a specific field type from profile
     * @param {string} fieldType - Field type (email, first_name, etc.)
     * @param {Object} profileData - Normalized profile data
     * @returns {string|null} Field value or null
     */
    getFieldValue(fieldType, profileData) {
      if (!profileData?.fields) return null;

      const normalizedType = this._normalizeFieldKey(fieldType);
      
      // Direct match
      if (profileData.fields[normalizedType]) {
        const field = profileData.fields[normalizedType];
        if (!field.sensitive || field.value) {
          return field.value;
        }
      }

      // Alias match
      const aliases = profileData.aliases || {};
      const canonical = aliases[normalizedType];
      if (canonical && profileData.fields[canonical]) {
        const field = profileData.fields[canonical];
        if (!field.sensitive || field.value) {
          return field.value;
        }
      }

      return null;
    }

    /**
     * Save profile data to MCP (via background script)
     * @param {string} profilePath - Path to save profile
     * @param {Object} profileData - Profile data to save
     * @returns {Promise<boolean>} Success status
     */
    async saveProfileData(profilePath, profileData) {
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({
            type: 'SAVE_MCP_FORM_DATA',
            payload: { path: profilePath, data: profileData }
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.error('[MCPDataBridge] Save failed:', chrome.runtime.lastError.message);
              resolve(false);
              return;
            }

            if (response?.ok) {
              // Update cache
              this._addToCache(profilePath, this._normalizeProfileData(profileData));
            }

            resolve(response?.ok || false);
          });
        } catch (err) {
          console.error('[MCPDataBridge] Save error:', err.message);
          resolve(false);
        }
      });
    }

    /**
     * List available profiles
     * @returns {Promise<Array>} List of profile paths
     */
    async listProfiles() {
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({
            type: 'LIST_MCP_PROFILES',
            payload: {}
          }, (response) => {
            if (chrome.runtime.lastError) {
              resolve([]);
              return;
            }
            resolve(response?.profiles || []);
          });
        } catch (_err) {
          resolve([]);
        }
      });
    }

    // === Cache management ===

    _getFromCache(key) {
      const entry = this.cache.get(key);
      if (!entry) return null;
      
      if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        this.cache.delete(key);
        return null;
      }
      
      return entry.data;
    }

    _addToCache(key, data) {
      // Prune cache if too large
      if (this.cache.size >= MAX_CACHE_ENTRIES) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }

      this.cache.set(key, {
        data,
        timestamp: Date.now()
      });
    }

    clearCache() {
      this.cache.clear();
      this.pendingRequests.clear();
    }

    // === Helper methods ===

    _normalizeFieldKey(key) {
      return String(key || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    }

    _extractFieldKey(field) {
      return field.name || field.id || field.autocomplete || 
             this._normalizeFieldKey(field.label) || 
             this._normalizeFieldKey(field.placeholder);
    }

    _buildSelector(field) {
      if (field.id) return `#${CSS.escape(field.id)}`;
      if (field.name) return `[name="${CSS.escape(field.name)}"]`;
      return null;
    }

    _isSensitiveKey(key) {
      const sensitivePatterns = /password|passwd|pwd|ssn|social|secret|token|key|auth|card|cvv|cvc|pin|maiden/i;
      return sensitivePatterns.test(key);
    }

    _inferFieldType(key) {
      const typeMap = {
        email: 'email',
        phone: 'tel',
        tel: 'tel',
        date: 'date',
        dob: 'date',
        birthday: 'date',
        zip: 'text',
        postal: 'text',
      };

      const normalizedKey = this._normalizeFieldKey(key);
      for (const [pattern, type] of Object.entries(typeMap)) {
        if (normalizedKey.includes(pattern)) return type;
      }
      return 'text';
    }

    _tokenMatch(str1, str2) {
      const tokens1 = new Set(str1.split('_').filter(Boolean));
      const tokens2 = new Set(str2.split('_').filter(Boolean));
      
      // Check if any significant tokens match
      for (const token of tokens1) {
        if (token.length >= 3 && tokens2.has(token)) return true;
      }
      
      return false;
    }
  }

  // Create global instance
  window.__bilge_mcpDataBridge = new MCPDataBridge();

  console.log('[Bilge] MCPDataBridge initialized');
})();
