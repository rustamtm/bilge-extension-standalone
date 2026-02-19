var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/commandAutocomplete.js
(function() {
  "use strict";
  if (window.__bilge_commandAutocomplete) return;
  const AUTOCOMPLETE_STORAGE_KEY = "__bilge_command_autocomplete_v1";
  const MAX_SUGGESTIONS = 6;
  class CommandAutocomplete {
    static {
      __name(this, "CommandAutocomplete");
    }
    constructor() {
      this.commandHistory = [];
      this.fieldCache = /* @__PURE__ */ new Map();
      this.commonPatterns = [
        { prefix: "fill ", completions: ["from profile", "with ", "from "] },
        { prefix: "click ", completions: ["submit", "next", "continue", "login", "button"] },
        { prefix: "scroll ", completions: ["down", "up", "to top", "to bottom"] },
        { prefix: "type ", completions: ["into ", "in "] }
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
      this.commandHistory = [
        normalized,
        ...this.commandHistory.filter((c) => c !== normalized)
      ].slice(0, 100);
      await chrome.storage.local.set({ [AUTOCOMPLETE_STORAGE_KEY]: this.commandHistory });
    }
    getSuggestions(input, pageFields = []) {
      const query = input.toLowerCase().trim();
      if (!query) return [];
      const suggestions = /* @__PURE__ */ new Set();
      const scores = /* @__PURE__ */ new Map();
      for (const cmd of this.commandHistory) {
        if (cmd.startsWith(query)) {
          suggestions.add(cmd);
          scores.set(cmd, 100);
        } else if (cmd.includes(query)) {
          suggestions.add(cmd);
          scores.set(cmd, 50);
        }
      }
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
      if (pageFields.length > 0) {
        const fieldKeywords = ["fill ", "click ", "type into "];
        for (const keyword of fieldKeywords) {
          if (query.startsWith(keyword)) {
            const fieldQuery = query.slice(keyword.length);
            for (const field of pageFields) {
              const fieldName = field.name || field.label || field.placeholder || "";
              if (fieldName.toLowerCase().includes(fieldQuery)) {
                const suggestion = `${keyword}${fieldName}`;
                suggestions.add(suggestion);
                scores.set(suggestion, 25);
              }
            }
          }
        }
      }
      return Array.from(suggestions).sort((a, b) => (scores.get(b) || 0) - (scores.get(a) || 0)).slice(0, MAX_SUGGESTIONS);
    }
    cachePageFields(pageUrl, fields) {
      this.fieldCache.set(pageUrl, fields);
    }
    getPageFields(pageUrl) {
      return this.fieldCache.get(pageUrl) || [];
    }
  }
  window.__bilge_commandAutocomplete = new CommandAutocomplete();
  window.__bilge_commandAutocomplete.loadHistory().catch(() => {
  });
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL2NvbW1hbmRBdXRvY29tcGxldGUuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIihmdW5jdGlvbigpIHtcbiAgJ3VzZSBzdHJpY3QnO1xuICBpZiAod2luZG93Ll9fYmlsZ2VfY29tbWFuZEF1dG9jb21wbGV0ZSkgcmV0dXJuO1xuXG4gIGNvbnN0IEFVVE9DT01QTEVURV9TVE9SQUdFX0tFWSA9ICdfX2JpbGdlX2NvbW1hbmRfYXV0b2NvbXBsZXRlX3YxJztcbiAgY29uc3QgTUFYX1NVR0dFU1RJT05TID0gNjtcblxuICBjbGFzcyBDb21tYW5kQXV0b2NvbXBsZXRlIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgIHRoaXMuY29tbWFuZEhpc3RvcnkgPSBbXTtcbiAgICAgIHRoaXMuZmllbGRDYWNoZSA9IG5ldyBNYXAoKTsgLy8gcGFnZVVybCAtPiBkZXRlY3RlZCBmaWVsZHNcbiAgICAgIHRoaXMuY29tbW9uUGF0dGVybnMgPSBbXG4gICAgICAgIHsgcHJlZml4OiAnZmlsbCAnLCBjb21wbGV0aW9uczogWydmcm9tIHByb2ZpbGUnLCAnd2l0aCAnLCAnZnJvbSAnXSB9LFxuICAgICAgICB7IHByZWZpeDogJ2NsaWNrICcsIGNvbXBsZXRpb25zOiBbJ3N1Ym1pdCcsICduZXh0JywgJ2NvbnRpbnVlJywgJ2xvZ2luJywgJ2J1dHRvbiddIH0sXG4gICAgICAgIHsgcHJlZml4OiAnc2Nyb2xsICcsIGNvbXBsZXRpb25zOiBbJ2Rvd24nLCAndXAnLCAndG8gdG9wJywgJ3RvIGJvdHRvbSddIH0sXG4gICAgICAgIHsgcHJlZml4OiAndHlwZSAnLCBjb21wbGV0aW9uczogWydpbnRvICcsICdpbiAnXSB9LFxuICAgICAgXTtcbiAgICB9XG5cbiAgICBhc3luYyBsb2FkSGlzdG9yeSgpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChbQVVUT0NPTVBMRVRFX1NUT1JBR0VfS0VZXSk7XG4gICAgICAgIHRoaXMuY29tbWFuZEhpc3RvcnkgPSBBcnJheS5pc0FycmF5KHJlc3VsdFtBVVRPQ09NUExFVEVfU1RPUkFHRV9LRVldKSA/IHJlc3VsdFtBVVRPQ09NUExFVEVfU1RPUkFHRV9LRVldIDogW107XG4gICAgICB9IGNhdGNoIChfZXJyKSB7XG4gICAgICAgIHRoaXMuY29tbWFuZEhpc3RvcnkgPSBbXTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBhc3luYyBzYXZlQ29tbWFuZChjb21tYW5kKSB7XG4gICAgICBjb25zdCBub3JtYWxpemVkID0gY29tbWFuZC50b0xvd2VyQ2FzZSgpLnRyaW0oKTtcbiAgICAgIGlmICghbm9ybWFsaXplZCB8fCBub3JtYWxpemVkLmxlbmd0aCA8IDMpIHJldHVybjtcblxuICAgICAgLy8gUmVtb3ZlIGR1cGxpY2F0ZXMsIGFkZCB0byBmcm9udFxuICAgICAgdGhpcy5jb21tYW5kSGlzdG9yeSA9IFtcbiAgICAgICAgbm9ybWFsaXplZCxcbiAgICAgICAgLi4udGhpcy5jb21tYW5kSGlzdG9yeS5maWx0ZXIoYyA9PiBjICE9PSBub3JtYWxpemVkKVxuICAgICAgXS5zbGljZSgwLCAxMDApO1xuXG4gICAgICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBbQVVUT0NPTVBMRVRFX1NUT1JBR0VfS0VZXTogdGhpcy5jb21tYW5kSGlzdG9yeSB9KTtcbiAgICB9XG5cbiAgICBnZXRTdWdnZXN0aW9ucyhpbnB1dCwgcGFnZUZpZWxkcyA9IFtdKSB7XG4gICAgICBjb25zdCBxdWVyeSA9IGlucHV0LnRvTG93ZXJDYXNlKCkudHJpbSgpO1xuICAgICAgaWYgKCFxdWVyeSkgcmV0dXJuIFtdO1xuXG4gICAgICBjb25zdCBzdWdnZXN0aW9ucyA9IG5ldyBTZXQoKTtcbiAgICAgIGNvbnN0IHNjb3JlcyA9IG5ldyBNYXAoKTtcblxuICAgICAgLy8gMS4gSGlzdG9yeSBtYXRjaGVzIChoaWdoZXN0IHByaW9yaXR5KVxuICAgICAgZm9yIChjb25zdCBjbWQgb2YgdGhpcy5jb21tYW5kSGlzdG9yeSkge1xuICAgICAgICBpZiAoY21kLnN0YXJ0c1dpdGgocXVlcnkpKSB7XG4gICAgICAgICAgc3VnZ2VzdGlvbnMuYWRkKGNtZCk7XG4gICAgICAgICAgc2NvcmVzLnNldChjbWQsIDEwMCk7XG4gICAgICAgIH0gZWxzZSBpZiAoY21kLmluY2x1ZGVzKHF1ZXJ5KSkge1xuICAgICAgICAgIHN1Z2dlc3Rpb25zLmFkZChjbWQpO1xuICAgICAgICAgIHNjb3Jlcy5zZXQoY21kLCA1MCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gMi4gUGF0dGVybiBjb21wbGV0aW9uc1xuICAgICAgZm9yIChjb25zdCBwYXR0ZXJuIG9mIHRoaXMuY29tbW9uUGF0dGVybnMpIHtcbiAgICAgICAgaWYgKHF1ZXJ5LnN0YXJ0c1dpdGgocGF0dGVybi5wcmVmaXgpKSB7XG4gICAgICAgICAgY29uc3QgcmVtYWluZGVyID0gcXVlcnkuc2xpY2UocGF0dGVybi5wcmVmaXgubGVuZ3RoKTtcbiAgICAgICAgICBmb3IgKGNvbnN0IGNvbXBsZXRpb24gb2YgcGF0dGVybi5jb21wbGV0aW9ucykge1xuICAgICAgICAgICAgaWYgKGNvbXBsZXRpb24uc3RhcnRzV2l0aChyZW1haW5kZXIpKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGZ1bGwgPSBwYXR0ZXJuLnByZWZpeCArIGNvbXBsZXRpb247XG4gICAgICAgICAgICAgIHN1Z2dlc3Rpb25zLmFkZChmdWxsKTtcbiAgICAgICAgICAgICAgc2NvcmVzLnNldChmdWxsLCBzY29yZXMuZ2V0KGZ1bGwpIHx8IDMwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gMy4gRmllbGQtYXdhcmUgc3VnZ2VzdGlvbnNcbiAgICAgIGlmIChwYWdlRmllbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgZmllbGRLZXl3b3JkcyA9IFsnZmlsbCAnLCAnY2xpY2sgJywgJ3R5cGUgaW50byAnXTtcbiAgICAgICAgZm9yIChjb25zdCBrZXl3b3JkIG9mIGZpZWxkS2V5d29yZHMpIHtcbiAgICAgICAgICBpZiAocXVlcnkuc3RhcnRzV2l0aChrZXl3b3JkKSkge1xuICAgICAgICAgICAgY29uc3QgZmllbGRRdWVyeSA9IHF1ZXJ5LnNsaWNlKGtleXdvcmQubGVuZ3RoKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgZmllbGQgb2YgcGFnZUZpZWxkcykge1xuICAgICAgICAgICAgICBjb25zdCBmaWVsZE5hbWUgPSBmaWVsZC5uYW1lIHx8IGZpZWxkLmxhYmVsIHx8IGZpZWxkLnBsYWNlaG9sZGVyIHx8ICcnO1xuICAgICAgICAgICAgICBpZiAoZmllbGROYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoZmllbGRRdWVyeSkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzdWdnZXN0aW9uID0gYCR7a2V5d29yZH0ke2ZpZWxkTmFtZX1gO1xuICAgICAgICAgICAgICAgIHN1Z2dlc3Rpb25zLmFkZChzdWdnZXN0aW9uKTtcbiAgICAgICAgICAgICAgICBzY29yZXMuc2V0KHN1Z2dlc3Rpb24sIDI1KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBTb3J0IGJ5IHNjb3JlIGFuZCByZXR1cm4gdG9wIE5cbiAgICAgIHJldHVybiBBcnJheS5mcm9tKHN1Z2dlc3Rpb25zKVxuICAgICAgICAuc29ydCgoYSwgYikgPT4gKHNjb3Jlcy5nZXQoYikgfHwgMCkgLSAoc2NvcmVzLmdldChhKSB8fCAwKSlcbiAgICAgICAgLnNsaWNlKDAsIE1BWF9TVUdHRVNUSU9OUyk7XG4gICAgfVxuXG4gICAgY2FjaGVQYWdlRmllbGRzKHBhZ2VVcmwsIGZpZWxkcykge1xuICAgICAgdGhpcy5maWVsZENhY2hlLnNldChwYWdlVXJsLCBmaWVsZHMpO1xuICAgIH1cblxuICAgIGdldFBhZ2VGaWVsZHMocGFnZVVybCkge1xuICAgICAgcmV0dXJuIHRoaXMuZmllbGRDYWNoZS5nZXQocGFnZVVybCkgfHwgW107XG4gICAgfVxuICB9XG5cbiAgd2luZG93Ll9fYmlsZ2VfY29tbWFuZEF1dG9jb21wbGV0ZSA9IG5ldyBDb21tYW5kQXV0b2NvbXBsZXRlKCk7XG4gIHdpbmRvdy5fX2JpbGdlX2NvbW1hbmRBdXRvY29tcGxldGUubG9hZEhpc3RvcnkoKS5jYXRjaCgoKSA9PiB7fSk7XG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7OztDQUFDLFdBQVc7QUFDVjtBQUNBLE1BQUksT0FBTyw0QkFBNkI7QUFFeEMsUUFBTSwyQkFBMkI7QUFDakMsUUFBTSxrQkFBa0I7QUFBQSxFQUV4QixNQUFNLG9CQUFvQjtBQUFBLElBUDVCLE9BTzRCO0FBQUE7QUFBQTtBQUFBLElBQ3hCLGNBQWM7QUFDWixXQUFLLGlCQUFpQixDQUFDO0FBQ3ZCLFdBQUssYUFBYSxvQkFBSSxJQUFJO0FBQzFCLFdBQUssaUJBQWlCO0FBQUEsUUFDcEIsRUFBRSxRQUFRLFNBQVMsYUFBYSxDQUFDLGdCQUFnQixTQUFTLE9BQU8sRUFBRTtBQUFBLFFBQ25FLEVBQUUsUUFBUSxVQUFVLGFBQWEsQ0FBQyxVQUFVLFFBQVEsWUFBWSxTQUFTLFFBQVEsRUFBRTtBQUFBLFFBQ25GLEVBQUUsUUFBUSxXQUFXLGFBQWEsQ0FBQyxRQUFRLE1BQU0sVUFBVSxXQUFXLEVBQUU7QUFBQSxRQUN4RSxFQUFFLFFBQVEsU0FBUyxhQUFhLENBQUMsU0FBUyxLQUFLLEVBQUU7QUFBQSxNQUNuRDtBQUFBLElBQ0Y7QUFBQSxJQUVBLE1BQU0sY0FBYztBQUNsQixVQUFJO0FBQ0YsY0FBTSxTQUFTLE1BQU0sT0FBTyxRQUFRLE1BQU0sSUFBSSxDQUFDLHdCQUF3QixDQUFDO0FBQ3hFLGFBQUssaUJBQWlCLE1BQU0sUUFBUSxPQUFPLHdCQUF3QixDQUFDLElBQUksT0FBTyx3QkFBd0IsSUFBSSxDQUFDO0FBQUEsTUFDOUcsU0FBUyxNQUFN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
