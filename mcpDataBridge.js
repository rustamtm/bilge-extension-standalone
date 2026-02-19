var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/mcpDataBridge.js
(function() {
  "use strict";
  if (window.__bilge_mcpDataBridge) return;
  const CACHE_TTL_MS = 5 * 60 * 1e3;
  const MAX_CACHE_ENTRIES = 10;
  class MCPDataBridge {
    static {
      __name(this, "MCPDataBridge");
    }
    constructor() {
      this.cache = /* @__PURE__ */ new Map();
      this.pendingRequests = /* @__PURE__ */ new Map();
    }
    /**
     * Load profile data from MCP filesystem
     * @param {string} profilePath - Path to profile JSON file
     * @returns {Promise<Object|null>} Profile data or null if failed
     */
    async loadProfileData(profilePath = "profiles/default.json") {
      const cached = this._getFromCache(profilePath);
      if (cached) return cached;
      if (this.pendingRequests.has(profilePath)) {
        return this.pendingRequests.get(profilePath);
      }
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
        console.error("[MCPDataBridge] Failed to load profile:", err.message);
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
            type: "LOAD_MCP_FORM_DATA",
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
      if (!rawData || typeof rawData !== "object") return null;
      const normalized = {
        profile: rawData.profile || rawData.name || "default",
        fields: {},
        aliases: {},
        metadata: {
          version: rawData.version || "1.0",
          lastUpdated: rawData.lastUpdated || (/* @__PURE__ */ new Date()).toISOString()
        }
      };
      const rawFields = rawData.fields || rawData.data || rawData;
      if (typeof rawFields === "object") {
        for (const [key, value] of Object.entries(rawFields)) {
          if (["profile", "name", "version", "lastUpdated", "aliases", "metadata"].includes(key)) {
            continue;
          }
          const normalizedKey = this._normalizeFieldKey(key);
          if (typeof value === "object" && value !== null) {
            normalized.fields[normalizedKey] = {
              value: value.value ?? value.val ?? "",
              sensitive: value.sensitive ?? value.private ?? false,
              hint: value.hint ?? value.description ?? "",
              type: value.type ?? "text"
            };
          } else {
            normalized.fields[normalizedKey] = {
              value: String(value ?? ""),
              sensitive: this._isSensitiveKey(normalizedKey),
              hint: "",
              type: this._inferFieldType(normalizedKey)
            };
          }
        }
      }
      const rawAliases = rawData.aliases || {};
      if (typeof rawAliases === "object") {
        for (const [alias, canonical] of Object.entries(rawAliases)) {
          const normalizedAlias = this._normalizeFieldKey(alias);
          const normalizedCanonical = this._normalizeFieldKey(canonical);
          normalized.aliases[normalizedAlias] = normalizedCanonical;
        }
      }
      this._addBuiltinAliases(normalized.aliases);
      return normalized;
    }
    /**
     * Add built-in field aliases
     */
    _addBuiltinAliases(aliases) {
      const builtins = {
        "given_name": "first_name",
        "fname": "first_name",
        "firstname": "first_name",
        "family_name": "last_name",
        "lname": "last_name",
        "lastname": "last_name",
        "surname": "last_name",
        "mail": "email",
        "email_address": "email",
        "tel": "phone",
        "telephone": "phone",
        "mobile": "phone",
        "phone_number": "phone",
        "street": "address",
        "address1": "address",
        "street_address": "address",
        "postal": "zip",
        "postal_code": "zip",
        "zip_code": "zip",
        "postcode": "zip",
        "province": "state",
        "region": "state"
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
      const mapping = /* @__PURE__ */ new Map();
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
        if (fields[normalizedKey]) {
          const fieldData = fields[normalizedKey];
          if (!fieldData.sensitive || fieldData.value) {
            value = fieldData.value;
          }
        }
        if (!value) {
          const canonical = aliases[normalizedKey];
          if (canonical && fields[canonical]) {
            const fieldData = fields[canonical];
            if (!fieldData.sensitive || fieldData.value) {
              value = fieldData.value;
            }
          }
        }
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
        if (value !== null && value !== void 0) {
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
      if (profileData.fields[normalizedType]) {
        const field = profileData.fields[normalizedType];
        if (!field.sensitive || field.value) {
          return field.value;
        }
      }
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
            type: "SAVE_MCP_FORM_DATA",
            payload: { path: profilePath, data: profileData }
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.error("[MCPDataBridge] Save failed:", chrome.runtime.lastError.message);
              resolve(false);
              return;
            }
            if (response?.ok) {
              this._addToCache(profilePath, this._normalizeProfileData(profileData));
            }
            resolve(response?.ok || false);
          });
        } catch (err) {
          console.error("[MCPDataBridge] Save error:", err.message);
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
            type: "LIST_MCP_PROFILES",
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
      return String(key || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    }
    _extractFieldKey(field) {
      return field.name || field.id || field.autocomplete || this._normalizeFieldKey(field.label) || this._normalizeFieldKey(field.placeholder);
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
        email: "email",
        phone: "tel",
        tel: "tel",
        date: "date",
        dob: "date",
        birthday: "date",
        zip: "text",
        postal: "text"
      };
      const normalizedKey = this._normalizeFieldKey(key);
      for (const [pattern, type] of Object.entries(typeMap)) {
        if (normalizedKey.includes(pattern)) return type;
      }
      return "text";
    }
    _tokenMatch(str1, str2) {
      const tokens1 = new Set(str1.split("_").filter(Boolean));
      const tokens2 = new Set(str2.split("_").filter(Boolean));
      for (const token of tokens1) {
        if (token.length >= 3 && tokens2.has(token)) return true;
      }
      return false;
    }
  }
  window.__bilge_mcpDataBridge = new MCPDataBridge();
  console.log("[Bilge] MCPDataBridge initialized");
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21jcERhdGFCcmlkZ2UuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIG1jcERhdGFCcmlkZ2UuanMgLSBNQ1AgZmlsZXN5c3RlbSBpbnRlZ3JhdGlvbiBmb3IgZm9ybSBkYXRhIGxvYWRpbmdcbi8vIEVuYWJsZXMgbG9hZGluZyBwcm9maWxlIGRhdGEgZnJvbSBNQ1AgZm9yIGludGVsbGlnZW50IGZvcm0gZmlsbGluZ1xuXG4oZnVuY3Rpb24oKSB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBpZiAod2luZG93Ll9fYmlsZ2VfbWNwRGF0YUJyaWRnZSkgcmV0dXJuO1xuXG4gIGNvbnN0IENBQ0hFX1RUTF9NUyA9IDUgKiA2MCAqIDEwMDA7IC8vIDUgbWludXRlc1xuICBjb25zdCBNQVhfQ0FDSEVfRU5UUklFUyA9IDEwO1xuXG4gIC8qKlxuICAgKiBNQ1BEYXRhQnJpZGdlIC0gTG9hZCBhbmQgbWFuYWdlIGZvcm0gZGF0YSBmcm9tIE1DUCBmaWxlc3lzdGVtXG4gICAqL1xuICBjbGFzcyBNQ1BEYXRhQnJpZGdlIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgIHRoaXMuY2FjaGUgPSBuZXcgTWFwKCk7IC8vIHByb2ZpbGVLZXkgLT4geyBkYXRhLCB0aW1lc3RhbXAgfVxuICAgICAgdGhpcy5wZW5kaW5nUmVxdWVzdHMgPSBuZXcgTWFwKCk7IC8vIHBhdGggLT4gUHJvbWlzZVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIExvYWQgcHJvZmlsZSBkYXRhIGZyb20gTUNQIGZpbGVzeXN0ZW1cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gcHJvZmlsZVBhdGggLSBQYXRoIHRvIHByb2ZpbGUgSlNPTiBmaWxlXG4gICAgICogQHJldHVybnMge1Byb21pc2U8T2JqZWN0fG51bGw+fSBQcm9maWxlIGRhdGEgb3IgbnVsbCBpZiBmYWlsZWRcbiAgICAgKi9cbiAgICBhc3luYyBsb2FkUHJvZmlsZURhdGEocHJvZmlsZVBhdGggPSAncHJvZmlsZXMvZGVmYXVsdC5qc29uJykge1xuICAgICAgLy8gQ2hlY2sgY2FjaGUgZmlyc3RcbiAgICAgIGNvbnN0IGNhY2hlZCA9IHRoaXMuX2dldEZyb21DYWNoZShwcm9maWxlUGF0aCk7XG4gICAgICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuXG4gICAgICAvLyBDaGVjayBpZiByZXF1ZXN0IGlzIGFscmVhZHkgaW4gZmxpZ2h0XG4gICAgICBpZiAodGhpcy5wZW5kaW5nUmVxdWVzdHMuaGFzKHByb2ZpbGVQYXRoKSkge1xuICAgICAgICByZXR1cm4gdGhpcy5wZW5kaW5nUmVxdWVzdHMuZ2V0KHByb2ZpbGVQYXRoKTtcbiAgICAgIH1cblxuICAgICAgLy8gQ3JlYXRlIG5ldyByZXF1ZXN0XG4gICAgICBjb25zdCByZXF1ZXN0UHJvbWlzZSA9IHRoaXMuX2ZldGNoUHJvZmlsZURhdGEocHJvZmlsZVBhdGgpO1xuICAgICAgdGhpcy5wZW5kaW5nUmVxdWVzdHMuc2V0KHByb2ZpbGVQYXRoLCByZXF1ZXN0UHJvbWlzZSk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXF1ZXN0UHJvbWlzZTtcbiAgICAgICAgdGhpcy5wZW5kaW5nUmVxdWVzdHMuZGVsZXRlKHByb2ZpbGVQYXRoKTtcbiAgICAgICAgXG4gICAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgICAgdGhpcy5fYWRkVG9DYWNoZShwcm9maWxlUGF0aCwgZGF0YSk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiBkYXRhO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHRoaXMucGVuZGluZ1JlcXVlc3RzLmRlbGV0ZShwcm9maWxlUGF0aCk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1tNQ1BEYXRhQnJpZGdlXSBGYWlsZWQgdG8gbG9hZCBwcm9maWxlOicsIGVyci5tZXNzYWdlKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmV0Y2ggcHJvZmlsZSBkYXRhIHZpYSBiYWNrZ3JvdW5kIHNjcmlwdCAtPiBNQ1BcbiAgICAgKi9cbiAgICBhc3luYyBfZmV0Y2hQcm9maWxlRGF0YShwcm9maWxlUGF0aCkge1xuICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICB0eXBlOiAnTE9BRF9NQ1BfRk9STV9EQVRBJyxcbiAgICAgICAgICAgIHBheWxvYWQ6IHsgcGF0aDogcHJvZmlsZVBhdGggfVxuICAgICAgICAgIH0sIChyZXNwb25zZSkgPT4ge1xuICAgICAgICAgICAgaWYgKGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcikge1xuICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGNocm9tZS5ydW50aW1lLmxhc3RFcnJvci5tZXNzYWdlKSk7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHJlc3BvbnNlPy5vayAmJiByZXNwb25zZS5mb3JtRGF0YSkge1xuICAgICAgICAgICAgICByZXNvbHZlKHRoaXMuX25vcm1hbGl6ZVByb2ZpbGVEYXRhKHJlc3BvbnNlLmZvcm1EYXRhKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXNvbHZlKG51bGwpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTm9ybWFsaXplIHByb2ZpbGUgZGF0YSB0byBzdGFuZGFyZCBmb3JtYXRcbiAgICAgKi9cbiAgICBfbm9ybWFsaXplUHJvZmlsZURhdGEocmF3RGF0YSkge1xuICAgICAgaWYgKCFyYXdEYXRhIHx8IHR5cGVvZiByYXdEYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIG51bGw7XG5cbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSB7XG4gICAgICAgIHByb2ZpbGU6IHJhd0RhdGEucHJvZmlsZSB8fCByYXdEYXRhLm5hbWUgfHwgJ2RlZmF1bHQnLFxuICAgICAgICBmaWVsZHM6IHt9LFxuICAgICAgICBhbGlhc2VzOiB7fSxcbiAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICB2ZXJzaW9uOiByYXdEYXRhLnZlcnNpb24gfHwgJzEuMCcsXG4gICAgICAgICAgbGFzdFVwZGF0ZWQ6IHJhd0RhdGEubGFzdFVwZGF0ZWQgfHwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICB9LFxuICAgICAgfTtcblxuICAgICAgLy8gTm9ybWFsaXplIGZpZWxkc1xuICAgICAgY29uc3QgcmF3RmllbGRzID0gcmF3RGF0YS5maWVsZHMgfHwgcmF3RGF0YS5kYXRhIHx8IHJhd0RhdGE7XG4gICAgICBpZiAodHlwZW9mIHJhd0ZpZWxkcyA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMocmF3RmllbGRzKSkge1xuICAgICAgICAgIC8vIFNraXAgbWV0YWRhdGEga2V5c1xuICAgICAgICAgIGlmIChbJ3Byb2ZpbGUnLCAnbmFtZScsICd2ZXJzaW9uJywgJ2xhc3RVcGRhdGVkJywgJ2FsaWFzZXMnLCAnbWV0YWRhdGEnXS5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBub3JtYWxpemVkS2V5ID0gdGhpcy5fbm9ybWFsaXplRmllbGRLZXkoa2V5KTtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgLy8gQWxyZWFkeSBpbiBzdHJ1Y3R1cmVkIGZvcm1hdFxuICAgICAgICAgICAgbm9ybWFsaXplZC5maWVsZHNbbm9ybWFsaXplZEtleV0gPSB7XG4gICAgICAgICAgICAgIHZhbHVlOiB2YWx1ZS52YWx1ZSA/PyB2YWx1ZS52YWwgPz8gJycsXG4gICAgICAgICAgICAgIHNlbnNpdGl2ZTogdmFsdWUuc2Vuc2l0aXZlID8/IHZhbHVlLnByaXZhdGUgPz8gZmFsc2UsXG4gICAgICAgICAgICAgIGhpbnQ6IHZhbHVlLmhpbnQgPz8gdmFsdWUuZGVzY3JpcHRpb24gPz8gJycsXG4gICAgICAgICAgICAgIHR5cGU6IHZhbHVlLnR5cGUgPz8gJ3RleHQnLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gU2ltcGxlIGtleS12YWx1ZVxuICAgICAgICAgICAgbm9ybWFsaXplZC5maWVsZHNbbm9ybWFsaXplZEtleV0gPSB7XG4gICAgICAgICAgICAgIHZhbHVlOiBTdHJpbmcodmFsdWUgPz8gJycpLFxuICAgICAgICAgICAgICBzZW5zaXRpdmU6IHRoaXMuX2lzU2Vuc2l0aXZlS2V5KG5vcm1hbGl6ZWRLZXkpLFxuICAgICAgICAgICAgICBoaW50OiAnJyxcbiAgICAgICAgICAgICAgdHlwZTogdGhpcy5faW5mZXJGaWVsZFR5cGUobm9ybWFsaXplZEtleSksXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBOb3JtYWxpemUgYWxpYXNlc1xuICAgICAgY29uc3QgcmF3QWxpYXNlcyA9IHJhd0RhdGEuYWxpYXNlcyB8fCB7fTtcbiAgICAgIGlmICh0eXBlb2YgcmF3QWxpYXNlcyA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgZm9yIChjb25zdCBbYWxpYXMsIGNhbm9uaWNhbF0gb2YgT2JqZWN0LmVudHJpZXMocmF3QWxpYXNlcykpIHtcbiAgICAgICAgICBjb25zdCBub3JtYWxpemVkQWxpYXMgPSB0aGlzLl9ub3JtYWxpemVGaWVsZEtleShhbGlhcyk7XG4gICAgICAgICAgY29uc3Qgbm9ybWFsaXplZENhbm9uaWNhbCA9IHRoaXMuX25vcm1hbGl6ZUZpZWxkS2V5KGNhbm9uaWNhbCk7XG4gICAgICAgICAgbm9ybWFsaXplZC5hbGlhc2VzW25vcm1hbGl6ZWRBbGlhc10gPSBub3JtYWxpemVkQ2Fub25pY2FsO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIEFkZCBidWlsdC1pbiBhbGlhc2VzXG4gICAgICB0aGlzLl9hZGRCdWlsdGluQWxpYXNlcyhub3JtYWxpemVkLmFsaWFzZXMpO1xuXG4gICAgICByZXR1cm4gbm9ybWFsaXplZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGQgYnVpbHQtaW4gZmllbGQgYWxpYXNlc1xuICAgICAqL1xuICAgIF9hZGRCdWlsdGluQWxpYXNlcyhhbGlhc2VzKSB7XG4gICAgICBjb25zdCBidWlsdGlucyA9IHtcbiAgICAgICAgJ2dpdmVuX25hbWUnOiAnZmlyc3RfbmFtZScsXG4gICAgICAgICdmbmFtZSc6ICdmaXJzdF9uYW1lJyxcbiAgICAgICAgJ2ZpcnN0bmFtZSc6ICdmaXJzdF9uYW1lJyxcbiAgICAgICAgJ2ZhbWlseV9uYW1lJzogJ2xhc3RfbmFtZScsXG4gICAgICAgICdsbmFtZSc6ICdsYXN0X25hbWUnLFxuICAgICAgICAnbGFzdG5hbWUnOiAnbGFzdF9uYW1lJyxcbiAgICAgICAgJ3N1cm5hbWUnOiAnbGFzdF9uYW1lJyxcbiAgICAgICAgJ21haWwnOiAnZW1haWwnLFxuICAgICAgICAnZW1haWxfYWRkcmVzcyc6ICdlbWFpbCcsXG4gICAgICAgICd0ZWwnOiAncGhvbmUnLFxuICAgICAgICAndGVsZXBob25lJzogJ3Bob25lJyxcbiAgICAgICAgJ21vYmlsZSc6ICdwaG9uZScsXG4gICAgICAgICdwaG9uZV9udW1iZXInOiAncGhvbmUnLFxuICAgICAgICAnc3RyZWV0JzogJ2FkZHJlc3MnLFxuICAgICAgICAnYWRkcmVzczEnOiAnYWRkcmVzcycsXG4gICAgICAgICdzdHJlZXRfYWRkcmVzcyc6ICdhZGRyZXNzJyxcbiAgICAgICAgJ3Bvc3RhbCc6ICd6aXAnLFxuICAgICAgICAncG9zdGFsX2NvZGUnOiAnemlwJyxcbiAgICAgICAgJ3ppcF9jb2RlJzogJ3ppcCcsXG4gICAgICAgICdwb3N0Y29kZSc6ICd6aXAnLFxuICAgICAgICAncHJvdmluY2UnOiAnc3RhdGUnLFxuICAgICAgICAncmVnaW9uJzogJ3N0YXRlJyxcbiAgICAgIH07XG5cbiAgICAgIGZvciAoY29uc3QgW2FsaWFzLCBjYW5vbmljYWxdIG9mIE9iamVjdC5lbnRyaWVzKGJ1aWx0aW5zKSkge1xuICAgICAgICBpZiAoIWFsaWFzZXNbYWxpYXNdKSB7XG4gICAgICAgICAgYWxpYXNlc1thbGlhc10gPSBjYW5vbmljYWw7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNYXRjaCBmb3JtIGZpZWxkcyB0byBwcm9maWxlIGRhdGFcbiAgICAgKiBAcGFyYW0ge0FycmF5fSBmb3JtRmllbGRzIC0gQXJyYXkgb2YgZm9ybSBmaWVsZCBkZXNjcmlwdG9yc1xuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBwcm9maWxlRGF0YSAtIE5vcm1hbGl6ZWQgcHJvZmlsZSBkYXRhXG4gICAgICogQHJldHVybnMge01hcH0gRmllbGQgc2VsZWN0b3IgLT4gdmFsdWUgbWFwcGluZ1xuICAgICAqL1xuICAgIG1hdGNoRmllbGRzVG9Qcm9maWxlKGZvcm1GaWVsZHMsIHByb2ZpbGVEYXRhKSB7XG4gICAgICBjb25zdCBtYXBwaW5nID0gbmV3IE1hcCgpO1xuICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGZvcm1GaWVsZHMpIHx8ICFwcm9maWxlRGF0YT8uZmllbGRzKSB7XG4gICAgICAgIHJldHVybiBtYXBwaW5nO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBhbGlhc2VzID0gcHJvZmlsZURhdGEuYWxpYXNlcyB8fCB7fTtcbiAgICAgIGNvbnN0IGZpZWxkcyA9IHByb2ZpbGVEYXRhLmZpZWxkcztcblxuICAgICAgZm9yIChjb25zdCBmaWVsZCBvZiBmb3JtRmllbGRzKSB7XG4gICAgICAgIGNvbnN0IGZpZWxkS2V5ID0gdGhpcy5fZXh0cmFjdEZpZWxkS2V5KGZpZWxkKTtcbiAgICAgICAgaWYgKCFmaWVsZEtleSkgY29udGludWU7XG5cbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZEtleSA9IHRoaXMuX25vcm1hbGl6ZUZpZWxkS2V5KGZpZWxkS2V5KTtcbiAgICAgICAgbGV0IHZhbHVlID0gbnVsbDtcblxuICAgICAgICAvLyBEaXJlY3QgbWF0Y2hcbiAgICAgICAgaWYgKGZpZWxkc1tub3JtYWxpemVkS2V5XSkge1xuICAgICAgICAgIGNvbnN0IGZpZWxkRGF0YSA9IGZpZWxkc1tub3JtYWxpemVkS2V5XTtcbiAgICAgICAgICBpZiAoIWZpZWxkRGF0YS5zZW5zaXRpdmUgfHwgZmllbGREYXRhLnZhbHVlKSB7XG4gICAgICAgICAgICB2YWx1ZSA9IGZpZWxkRGF0YS52YWx1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBBbGlhcyBtYXRjaFxuICAgICAgICBpZiAoIXZhbHVlKSB7XG4gICAgICAgICAgY29uc3QgY2Fub25pY2FsID0gYWxpYXNlc1tub3JtYWxpemVkS2V5XTtcbiAgICAgICAgICBpZiAoY2Fub25pY2FsICYmIGZpZWxkc1tjYW5vbmljYWxdKSB7XG4gICAgICAgICAgICBjb25zdCBmaWVsZERhdGEgPSBmaWVsZHNbY2Fub25pY2FsXTtcbiAgICAgICAgICAgIGlmICghZmllbGREYXRhLnNlbnNpdGl2ZSB8fCBmaWVsZERhdGEudmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFsdWUgPSBmaWVsZERhdGEudmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gVG9rZW4gbWF0Y2ggKGZ1enp5KVxuICAgICAgICBpZiAoIXZhbHVlKSB7XG4gICAgICAgICAgZm9yIChjb25zdCBba2V5LCBmaWVsZERhdGFdIG9mIE9iamVjdC5lbnRyaWVzKGZpZWxkcykpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl90b2tlbk1hdGNoKG5vcm1hbGl6ZWRLZXksIGtleSkpIHtcbiAgICAgICAgICAgICAgaWYgKCFmaWVsZERhdGEuc2Vuc2l0aXZlIHx8IGZpZWxkRGF0YS52YWx1ZSkge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gZmllbGREYXRhLnZhbHVlO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHZhbHVlICE9PSBudWxsICYmIHZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBjb25zdCBzZWxlY3RvciA9IGZpZWxkLnNlbGVjdG9yIHx8IHRoaXMuX2J1aWxkU2VsZWN0b3IoZmllbGQpO1xuICAgICAgICAgIGlmIChzZWxlY3Rvcikge1xuICAgICAgICAgICAgbWFwcGluZy5zZXQoc2VsZWN0b3IsIHZhbHVlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG1hcHBpbmc7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IHZhbHVlIGZvciBhIHNwZWNpZmljIGZpZWxkIHR5cGUgZnJvbSBwcm9maWxlXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGZpZWxkVHlwZSAtIEZpZWxkIHR5cGUgKGVtYWlsLCBmaXJzdF9uYW1lLCBldGMuKVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBwcm9maWxlRGF0YSAtIE5vcm1hbGl6ZWQgcHJvZmlsZSBkYXRhXG4gICAgICogQHJldHVybnMge3N0cmluZ3xudWxsfSBGaWVsZCB2YWx1ZSBvciBudWxsXG4gICAgICovXG4gICAgZ2V0RmllbGRWYWx1ZShmaWVsZFR5cGUsIHByb2ZpbGVEYXRhKSB7XG4gICAgICBpZiAoIXByb2ZpbGVEYXRhPy5maWVsZHMpIHJldHVybiBudWxsO1xuXG4gICAgICBjb25zdCBub3JtYWxpemVkVHlwZSA9IHRoaXMuX25vcm1hbGl6ZUZpZWxkS2V5KGZpZWxkVHlwZSk7XG4gICAgICBcbiAgICAgIC8vIERpcmVjdCBtYXRjaFxuICAgICAgaWYgKHByb2ZpbGVEYXRhLmZpZWxkc1tub3JtYWxpemVkVHlwZV0pIHtcbiAgICAgICAgY29uc3QgZmllbGQgPSBwcm9maWxlRGF0YS5maWVsZHNbbm9ybWFsaXplZFR5cGVdO1xuICAgICAgICBpZiAoIWZpZWxkLnNlbnNpdGl2ZSB8fCBmaWVsZC52YWx1ZSkge1xuICAgICAgICAgIHJldHVybiBmaWVsZC52YWx1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBBbGlhcyBtYXRjaFxuICAgICAgY29uc3QgYWxpYXNlcyA9IHByb2ZpbGVEYXRhLmFsaWFzZXMgfHwge307XG4gICAgICBjb25zdCBjYW5vbmljYWwgPSBhbGlhc2VzW25vcm1hbGl6ZWRUeXBlXTtcbiAgICAgIGlmIChjYW5vbmljYWwgJiYgcHJvZmlsZURhdGEuZmllbGRzW2Nhbm9uaWNhbF0pIHtcbiAgICAgICAgY29uc3QgZmllbGQgPSBwcm9maWxlRGF0YS5maWVsZHNbY2Fub25pY2FsXTtcbiAgICAgICAgaWYgKCFmaWVsZC5zZW5zaXRpdmUgfHwgZmllbGQudmFsdWUpIHtcbiAgICAgICAgICByZXR1cm4gZmllbGQudmFsdWU7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2F2ZSBwcm9maWxlIGRhdGEgdG8gTUNQICh2aWEgYmFja2dyb3VuZCBzY3JpcHQpXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHByb2ZpbGVQYXRoIC0gUGF0aCB0byBzYXZlIHByb2ZpbGVcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcHJvZmlsZURhdGEgLSBQcm9maWxlIGRhdGEgdG8gc2F2ZVxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPGJvb2xlYW4+fSBTdWNjZXNzIHN0YXR1c1xuICAgICAqL1xuICAgIGFzeW5jIHNhdmVQcm9maWxlRGF0YShwcm9maWxlUGF0aCwgcHJvZmlsZURhdGEpIHtcbiAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdTQVZFX01DUF9GT1JNX0RBVEEnLFxuICAgICAgICAgICAgcGF5bG9hZDogeyBwYXRoOiBwcm9maWxlUGF0aCwgZGF0YTogcHJvZmlsZURhdGEgfVxuICAgICAgICAgIH0sIChyZXNwb25zZSkgPT4ge1xuICAgICAgICAgICAgaWYgKGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcikge1xuICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdbTUNQRGF0YUJyaWRnZV0gU2F2ZSBmYWlsZWQ6JywgY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yLm1lc3NhZ2UpO1xuICAgICAgICAgICAgICByZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAocmVzcG9uc2U/Lm9rKSB7XG4gICAgICAgICAgICAgIC8vIFVwZGF0ZSBjYWNoZVxuICAgICAgICAgICAgICB0aGlzLl9hZGRUb0NhY2hlKHByb2ZpbGVQYXRoLCB0aGlzLl9ub3JtYWxpemVQcm9maWxlRGF0YShwcm9maWxlRGF0YSkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXNvbHZlKHJlc3BvbnNlPy5vayB8fCBmYWxzZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1tNQ1BEYXRhQnJpZGdlXSBTYXZlIGVycm9yOicsIGVyci5tZXNzYWdlKTtcbiAgICAgICAgICByZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTGlzdCBhdmFpbGFibGUgcHJvZmlsZXNcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxBcnJheT59IExpc3Qgb2YgcHJvZmlsZSBwYXRoc1xuICAgICAqL1xuICAgIGFzeW5jIGxpc3RQcm9maWxlcygpIHtcbiAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdMSVNUX01DUF9QUk9GSUxFUycsXG4gICAgICAgICAgICBwYXlsb2FkOiB7fVxuICAgICAgICAgIH0sIChyZXNwb25zZSkgPT4ge1xuICAgICAgICAgICAgaWYgKGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcikge1xuICAgICAgICAgICAgICByZXNvbHZlKFtdKTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzb2x2ZShyZXNwb25zZT8ucHJvZmlsZXMgfHwgW10pO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChfZXJyKSB7XG4gICAgICAgICAgcmVzb2x2ZShbXSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vID09PSBDYWNoZSBtYW5hZ2VtZW50ID09PVxuXG4gICAgX2dldEZyb21DYWNoZShrZXkpIHtcbiAgICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5jYWNoZS5nZXQoa2V5KTtcbiAgICAgIGlmICghZW50cnkpIHJldHVybiBudWxsO1xuICAgICAgXG4gICAgICBpZiAoRGF0ZS5ub3coKSAtIGVudHJ5LnRpbWVzdGFtcCA+IENBQ0hFX1RUTF9NUykge1xuICAgICAgICB0aGlzLmNhY2hlLmRlbGV0ZShrZXkpO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgcmV0dXJuIGVudHJ5LmRhdGE7XG4gICAgfVxuXG4gICAgX2FkZFRvQ2FjaGUoa2V5LCBkYXRhKSB7XG4gICAgICAvLyBQcnVuZSBjYWNoZSBpZiB0b28gbGFyZ2VcbiAgICAgIGlmICh0aGlzLmNhY2hlLnNpemUgPj0gTUFYX0NBQ0hFX0VOVFJJRVMpIHtcbiAgICAgICAgY29uc3QgZmlyc3RLZXkgPSB0aGlzLmNhY2hlLmtleXMoKS5uZXh0KCkudmFsdWU7XG4gICAgICAgIHRoaXMuY2FjaGUuZGVsZXRlKGZpcnN0S2V5KTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5jYWNoZS5zZXQoa2V5LCB7XG4gICAgICAgIGRhdGEsXG4gICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY2xlYXJDYWNoZSgpIHtcbiAgICAgIHRoaXMuY2FjaGUuY2xlYXIoKTtcbiAgICAgIHRoaXMucGVuZGluZ1JlcXVlc3RzLmNsZWFyKCk7XG4gICAgfVxuXG4gICAgLy8gPT09IEhlbHBlciBtZXRob2RzID09PVxuXG4gICAgX25vcm1hbGl6ZUZpZWxkS2V5KGtleSkge1xuICAgICAgcmV0dXJuIFN0cmluZyhrZXkgfHwgJycpXG4gICAgICAgIC50b0xvd2VyQ2FzZSgpXG4gICAgICAgIC5yZXBsYWNlKC9bXmEtejAtOV0rL2csICdfJylcbiAgICAgICAgLnJlcGxhY2UoL15fK3xfKyQvZywgJycpO1xuICAgIH1cblxuICAgIF9leHRyYWN0RmllbGRLZXkoZmllbGQpIHtcbiAgICAgIHJldHVybiBmaWVsZC5uYW1lIHx8IGZpZWxkLmlkIHx8IGZpZWxkLmF1dG9jb21wbGV0ZSB8fCBcbiAgICAgICAgICAgICB0aGlzLl9ub3JtYWxpemVGaWVsZEtleShmaWVsZC5sYWJlbCkgfHwgXG4gICAgICAgICAgICAgdGhpcy5fbm9ybWFsaXplRmllbGRLZXkoZmllbGQucGxhY2Vob2xkZXIpO1xuICAgIH1cblxuICAgIF9idWlsZFNlbGVjdG9yKGZpZWxkKSB7XG4gICAgICBpZiAoZmllbGQuaWQpIHJldHVybiBgIyR7Q1NTLmVzY2FwZShmaWVsZC5pZCl9YDtcbiAgICAgIGlmIChmaWVsZC5uYW1lKSByZXR1cm4gYFtuYW1lPVwiJHtDU1MuZXNjYXBlKGZpZWxkLm5hbWUpfVwiXWA7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBfaXNTZW5zaXRpdmVLZXkoa2V5KSB7XG4gICAgICBjb25zdCBzZW5zaXRpdmVQYXR0ZXJucyA9IC9wYXNzd29yZHxwYXNzd2R8cHdkfHNzbnxzb2NpYWx8c2VjcmV0fHRva2VufGtleXxhdXRofGNhcmR8Y3Z2fGN2Y3xwaW58bWFpZGVuL2k7XG4gICAgICByZXR1cm4gc2Vuc2l0aXZlUGF0dGVybnMudGVzdChrZXkpO1xuICAgIH1cblxuICAgIF9pbmZlckZpZWxkVHlwZShrZXkpIHtcbiAgICAgIGNvbnN0IHR5cGVNYXAgPSB7XG4gICAgICAgIGVtYWlsOiAnZW1haWwnLFxuICAgICAgICBwaG9uZTogJ3RlbCcsXG4gICAgICAgIHRlbDogJ3RlbCcsXG4gICAgICAgIGRhdGU6ICdkYXRlJyxcbiAgICAgICAgZG9iOiAnZGF0ZScsXG4gICAgICAgIGJpcnRoZGF5OiAnZGF0ZScsXG4gICAgICAgIHppcDogJ3RleHQnLFxuICAgICAgICBwb3N0YWw6ICd0ZXh0JyxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWRLZXkgPSB0aGlzLl9ub3JtYWxpemVGaWVsZEtleShrZXkpO1xuICAgICAgZm9yIChjb25zdCBbcGF0dGVybiwgdHlwZV0gb2YgT2JqZWN0LmVudHJpZXModHlwZU1hcCkpIHtcbiAgICAgICAgaWYgKG5vcm1hbGl6ZWRLZXkuaW5jbHVkZXMocGF0dGVybikpIHJldHVybiB0eXBlO1xuICAgICAgfVxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICB9XG5cbiAgICBfdG9rZW5NYXRjaChzdHIxLCBzdHIyKSB7XG4gICAgICBjb25zdCB0b2tlbnMxID0gbmV3IFNldChzdHIxLnNwbGl0KCdfJykuZmlsdGVyKEJvb2xlYW4pKTtcbiAgICAgIGNvbnN0IHRva2VuczIgPSBuZXcgU2V0KHN0cjIuc3BsaXQoJ18nKS5maWx0ZXIoQm9vbGVhbikpO1xuICAgICAgXG4gICAgICAvLyBDaGVjayBpZiBhbnkgc2lnbmlmaWNhbnQgdG9rZW5zIG1hdGNoXG4gICAgICBmb3IgKGNvbnN0IHRva2VuIG9mIHRva2VuczEpIHtcbiAgICAgICAgaWYgKHRva2VuLmxlbmd0aCA+PSAzICYmIHRva2VuczIuaGFzKHRva2VuKSkgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgICBcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAvLyBDcmVhdGUgZ2xvYmFsIGluc3RhbmNlXG4gIHdpbmRvdy5fX2JpbGdlX21jcERhdGFCcmlkZ2UgPSBuZXcgTUNQRGF0YUJyaWRnZSgpO1xuXG4gIGNvbnNvbGUubG9nKCdbQmlsZ2VdIE1DUERhdGFCcmlkZ2UgaW5pdGlhbGl6ZWQnKTtcbn0pKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7O0NBR0MsV0FBVztBQUNWO0FBRUEsTUFBSSxPQUFPLHNCQUF1QjtBQUVsQyxRQUFNLGVBQWUsSUFBSSxLQUFLO0FBQzlCLFFBQU0sb0JBQW9CO0FBQUEsRUFLMUIsTUFBTSxjQUFjO0FBQUEsSUFkdEIsT0Fjc0I7QUFBQTtBQUFBO0FBQUEsSUFDbEIsY0FBYztBQUNaLFdBQUssUUFBUSxvQkFBSSxJQUFJO0FBQ3JCLFdBQUssa0JBQWtCLG9CQUFJLElBQUk7QUFBQSxJQUNqQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQU9BLE1BQU0sZ0JBQWdCLGNBQWMseUJBQXlCO0FBRTNELFlBQU0sU0FBUyxLQUFLLGNBQWMsV0FBVztBQUM3QyxVQUFJLE9BQVEsUUFBTztBQUduQixVQUFJLEtBQUssZ0JBQWdCLElBQUksV0FBVyxHQUFHO0FBQ3pDLGVBQU8sS0FBSyxnQkFBZ0IsSUFBSSxXQUFXO0FBQUEsTUFDN0M7QUFHQSxZQUFNLGlCQUFpQixLQUFLLGtCQUFrQixXQUFXO0FBQ3pELFdBQUssZ0JBQWdCLElBQUksYUFBYSxjQUFjO0FBRXBELFVBQUk7QUFDRixjQUFNLE9BQU8sTUFBTTtBQUNuQixhQUFL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
