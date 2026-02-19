(function() {
  'use strict';
  if (window.__bilge_commandAutocomplete) return;

  const AUTOCOMPLETE_STORAGE_KEY = '__bilge_command_autocomplete_v1';
  const MAX_SUGGESTIONS = 6;

  class CommandAutocomplete {
    constructor() {
      this.commandHistory = [];
      this.fieldCache = new Map(); // pageUrl -> detected fields
      this.commonPatterns = [
        { prefix: 'fill ', completions: ['from profile', 'with ', 'from '] },
        { prefix: 'click ', completions: ['submit', 'next', 'continue', 'login', 'button'] },
        { prefix: 'scroll ', completions: ['down', 'up', 'to top', 'to bottom'] },
        { prefix: 'type ', completions: ['into ', 'in '] },
      ];
    }

    async loadHistory() {
      try {
        const result = await chrome.storage.local.get([AUTOCOMPLETE_STORAGE_KEY]);
        this.commandHistory = Array.isArray(result[AUTOCOMPLETE_STORAGE_KEY]) ? result[AUTOCOMPLETE_STORAGE_KEY] : [];
      } catch (_err) {
        this.commandHistory = [];
      }
    }

    async saveCommand(command) {
      const normalized = command.toLowerCase().trim();
      if (!normalized || normalized.length < 3) return;

      // Remove duplicates, add to front
      this.commandHistory = [
        normalized,
        ...this.commandHistory.filter(c => c !== normalized)
      ].slice(0, 100);

      await chrome.storage.local.set({ [AUTOCOMPLETE_STORAGE_KEY]: this.commandHistory });
    }

    getSuggestions(input, pageFields = []) {
      const query = input.toLowerCase().trim();
      if (!query) return [];

      const suggestions = new Set();
      const scores = new Map();

      // 1. History matches (highest priority)
      for (const cmd of this.commandHistory) {
        if (cmd.startsWith(query)) {
          suggestions.add(cmd);
          scores.set(cmd, 100);
        } else if (cmd.includes(query)) {
          suggestions.add(cmd);
          scores.set(cmd, 50);
        }
      }

      // 2. Pattern completions
      for (const pattern of this.commonPatterns) {
        if (query.startsWith(pattern.prefix)) {
          const remainder = query.slice(pattern.prefix.length);
          for (const completion of pattern.completions) {
            if (completion.startsWith(remainder)) {
              const full = pattern.prefix + completion;
              suggestions.add(full);
              scores.set(full, scores.get(full) || 30);
            }
          }
        }
      }

      // 3. Field-aware suggestions
      if (pageFields.length > 0) {
        const fieldKeywords = ['fill ', 'click ', 'type into '];
        for (const keyword of fieldKeywords) {
          if (query.startsWith(keyword)) {
            const fieldQuery = query.slice(keyword.length);
            for (const field of pageFields) {
              const fieldName = field.name || field.label || field.placeholder || '';
              if (fieldName.toLowerCase().includes(fieldQuery)) {
                const suggestion = `${keyword}${fieldName}`;
                suggestions.add(suggestion);
                scores.set(suggestion, 25);
              }
            }
          }
        }
      }

      // Sort by score and return top N
      return Array.from(suggestions)
        .sort((a, b) => (scores.get(b) || 0) - (scores.get(a) || 0))
        .slice(0, MAX_SUGGESTIONS);
    }

    cachePageFields(pageUrl, fields) {
      this.fieldCache.set(pageUrl, fields);
    }

    getPageFields(pageUrl) {
      return this.fieldCache.get(pageUrl) || [];
    }
  }

  window.__bilge_commandAutocomplete = new CommandAutocomplete();
  window.__bilge_commandAutocomplete.loadHistory().catch(() => {});
})();
