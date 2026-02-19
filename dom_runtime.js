var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/dom_runtime.js
(function() {
  if (window.__bilge_runtime) return;
  class BilgeRuntime {
    static {
      __name(this, "BilgeRuntime");
    }
    constructor() {
      this.active = true;
      this.cursor = { x: 0, y: 0 };
      this.lastElement = null;
      this.humanizedDelayBaseMs = 220;
      this.humanizedDelayJitterMs = 260;
      this.shadowRoot = null;
      this.highlightEl = null;
      this._shadowDomInitScheduled = false;
      this._shadowDomInitAttempts = 0;
      console.log("[Bilge] DOM Runtime Initialized");
      this.setupShadowDOM();
      this.setupListeners();
    }
    scheduleShadowDOMInit() {
      if (this._shadowDomInitScheduled) return;
      this._shadowDomInitScheduled = true;
      this._shadowDomInitAttempts = (this._shadowDomInitAttempts || 0) + 1;
      const retry = /* @__PURE__ */ __name(() => {
        this._shadowDomInitScheduled = false;
        try {
          this.setupShadowDOM();
        } catch (err) {
          console.warn("[Bilge] DOM Runtime shadow DOM init failed:", err);
        }
      }, "retry");
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", retry, { once: true });
      }
      const delayMs = Math.min(2e3, 50 * this._shadowDomInitAttempts);
      setTimeout(retry, delayMs);
    }
    ensureShadowUI() {
      if (this.shadowRoot && this.highlightEl) return true;
      try {
        this.setupShadowDOM();
      } catch {
      }
      return Boolean(this.shadowRoot && this.highlightEl);
    }
    setupShadowDOM() {
      const hostId = "bilge-runtime-host";
      let host = document.getElementById(hostId);
      if (!host) {
        host = document.createElement("div");
        host.id = hostId;
        host.style.cssText = "position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;";
        const mount = document.body || document.documentElement;
        if (!mount) {
          console.warn("[Bilge] DOM Runtime: document not ready; deferring shadow DOM init.");
          this.scheduleShadowDOMInit();
          return;
        }
        mount.appendChild(host);
      }
      this.shadowRoot = host.shadowRoot || host.attachShadow({ mode: "open" });
      this._shadowDomInitAttempts = 0;
      let style = this.shadowRoot.querySelector("#bilge-runtime-style");
      if (!style) {
        style = document.createElement("style");
        style.id = "bilge-runtime-style";
        style.textContent = `
        .bilge-highlight-overlay {
          position: absolute;
          outline: 3px solid #2563eb;
          background-color: rgba(37, 99, 235, 0.1);
          transition: all 0.2s ease-in-out;
          pointer-events: none;
          display: none;
        }
        /* Click ripple */
        .bilge-click-ripple {
          position: absolute;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(37, 99, 235, 0.4);
          transform: translate(-50%, -50%) scale(0);
          animation: bilge-ripple 0.6s ease-out forwards;
          pointer-events: none;
        }
        @keyframes bilge-ripple {
          to { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
        }
        /* Type indicator */
        .bilge-type-indicator {
          position: absolute;
          background: #10b981;
          color: white;
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 4px;
          transform: translateY(-100%);
          margin-top: -4px;
          animation: bilge-fade-in-out 1.5s ease-out forwards;
          pointer-events: none;
          white-space: nowrap;
          z-index: 2147483647;
        }
        @keyframes bilge-fade-in-out {
          0% { opacity: 0; transform: translateY(-100%) scale(0.8); }
          15% { opacity: 1; transform: translateY(-100%) scale(1); }
          70% { opacity: 1; }
          100% { opacity: 0; }
        }
        /* Scroll indicator */
        .bilge-scroll-indicator {
          position: fixed;
          right: 20px;
          top: 50%;
          transform: translateY(-50%);
          width: 40px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(37, 99, 235, 0.9);
          border-radius: 20px;
          animation: bilge-scroll-pulse 0.8s ease-out forwards;
          pointer-events: none;
          z-index: 2147483647;
        }
        .bilge-scroll-indicator svg {
          width: 24px;
          height: 24px;
          stroke: white;
          stroke-width: 2.5;
        }
        .bilge-scroll-indicator.up svg { transform: rotate(180deg); }
        @keyframes bilge-scroll-pulse {
          0% { opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { opacity: 0; }
        }
        /* Toast notification */
        .bilge-toast {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: #1f2937;
          color: white;
          padding: 12px 20px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
          animation: bilge-toast-in 0.3s ease-out;
          z-index: 2147483647;
          white-space: nowrap;
        }
        .bilge-toast.success { border-left: 4px solid #10b981; }
        .bilge-toast.error { border-left: 4px solid #ef4444; }
        @keyframes bilge-toast-in {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `;
        this.shadowRoot.appendChild(style);
      }
      const existingHighlight = this.shadowRoot.querySelector(".bilge-highlight-overlay");
      this.highlightEl = existingHighlight || document.createElement("div");
      if (!existingHighlight) {
        this.highlightEl.className = "bilge-highlight-overlay";
        this.shadowRoot.appendChild(this.highlightEl);
      }
    }
    setupListeners() {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === "EXECUTE_ACTION") {
          this.execute(msg.action, msg.options).then((res) => sendResponse(res));
          return true;
        }
        if (msg.type === "EXECUTE_BATCH") {
          this.executeBatch(msg.actions, msg.options).then((res) => sendResponse(res));
          return true;
        }
        if (msg.type === "QUERY_STATE") {
          sendResponse(this.getState());
        }
        if (msg.type === "__BILGE_PING__") {
          sendResponse({ ok: true, version: "1.0.0" });
        }
      });
      window.addEventListener("mousemove", (e) => {
        this.cursor.x = e.clientX;
        this.cursor.y = e.clientY;
      }, { passive: true });
    }
    getState() {
      return {
        url: window.location.href,
        title: document.title,
        scroll: { x: window.scrollX, y: window.scrollY },
        cursor: this.cursor,
        viewport: { width: window.innerWidth, height: window.innerHeight }
      };
    }
    normalizeActionType(rawType) {
      const type = String(rawType || "").toLowerCase().trim();
      if (type === "click_element" || type === "click_button") return "click";
      if (type === "type_text" || type === "enter_text" || type === "input") return "type";
      if (type === "fill_form" || type === "fill_field") return "fill";
      if (type === "scroll_to" || type === "scroll_page") return "scroll";
      return type;
    }
    async execute(action, options = {}) {
      if (Array.isArray(action)) {
        return this.executeBatch(action, options);
      }
      const rawType = action.type || action.action || "";
      const type = this.normalizeActionType(rawType);
      console.log("[Bilge] Executing:", type, action);
      const humanizedDelayEnabled = options.humanizedDelayEnabled !== false;
      this.humanizedDelayBaseMs = options.humanizedDelayBaseMs || 220;
      this.humanizedDelayJitterMs = options.humanizedDelayJitterMs || 260;
      try {
        let result;
        switch (type) {
          case "click":
            result = await this.click(action);
            break;
          case "fill":
          case "type":
            result = await this.type(action);
            break;
          case "scroll":
            result = await this.scroll(action);
            break;
          case "wait":
            await this.wait(action.duration || 1e3);
            result = { success: true };
            break;
          case "extract":
            result = await this.extract(action);
            break;
          case "script":
          case "js":
          case "javascript":
            result = await this.runScript(action, options.allowAiScripts);
            break;
          default:
            throw new Error(`Unknown action type: ${rawType} (normalized to ${type})`);
        }
        if (humanizedDelayEnabled) {
          await this.wait(this.nextHumanizedDelayMs());
        }
        return result;
      } catch (err) {
        console.error("[Bilge] Action failed:", err);
        return { success: false, error: err.message, type: rawType };
      }
    }
    async executeBatch(actions, options = {}) {
      const results = [];
      let executedSteps = 0;
      for (const action of actions) {
        const res = await this.execute(action, options);
        results.push(res);
        if (!res.success) break;
        executedSteps++;
      }
      return {
        success: results.every((r) => r.success),
        executedSteps,
        totalSteps: actions.length,
        results
      };
    }
    nextHumanizedDelayMs() {
      return this.humanizedDelayBaseMs + Math.floor(Math.random() * (this.humanizedDelayJitterMs + 1));
    }
    wait(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }
    async resolve(action) {
      const { selector, selectors, field, name, label, placeholder, type } = action;
      const candidates = selectors || (selector ? [selector] : []);
      const actionType = (type || "").toLowerCase();
      for (const sel of candidates) {
        try {
          const el2 = document.querySelector(sel);
          if (el2 && this.isUsable(el2)) return el2;
        } catch (e) {
        }
      }
      let el = this.findHeuristic(field, name, label, placeholder, candidates);
      if (el) return el;
      if (["click", "type", "fill", "scroll"].includes(actionType)) {
        console.log("[Bilge] Element not found, attempting probe scrolling...");
        const probeDistance = Math.max(240, Math.round(window.innerHeight * 0.8));
        const maxProbeScrolls = 4;
        for (let probe = 1; probe <= maxProbeScrolls; probe += 1) {
          window.scrollBy({ top: probeDistance, behavior: "auto" });
          await this.wait(150);
          for (const sel of candidates) {
            try {
              const pEl = document.querySelector(sel);
              if (pEl && this.isUsable(pEl)) return pEl;
            } catch (e) {
            }
          }
          el = this.findHeuristic(field, name, label, placeholder, candidates);
          if (el) return el;
        }
        window.scrollTo({ top: 0, behavior: "auto" });
        await this.wait(150);
      }
      return null;
    }
    isUsable(el) {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    }
    findHeuristic(field, name, label, placeholder, selectors) {
      const tokens = /* @__PURE__ */ new Set();
      [field, name, label, placeholder].forEach((t) => {
        if (t) String(t).toLowerCase().split(/[^a-z0-9]+/).forEach((token) => tokens.add(token));
      });
      if (tokens.size === 0) return null;
      const elements = Array.from(document.querySelectorAll('input, button, a, textarea, select, [role="button"], [role="link"]'));
      let bestMatch = null;
      let highestScore = 0;
      elements.forEach((el) => {
        if (!this.isUsable(el)) return;
        let score = 0;
        const searchBody = ((el.innerText || "") + " " + (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("placeholder") || "") + " " + (el.name || "") + " " + (el.id || "") + " " + (el.getAttribute("data-testid") || "")).toLowerCase();
        tokens.forEach((token) => {
          if (searchBody.includes(token)) {
            score += token.length >= 4 ? 2 : 1;
          }
        });
        if (score > highestScore) {
          highestScore = score;
          bestMatch = el;
        }
      });
      return highestScore >= 2 ? bestMatch : null;
    }
    updateHighlight(el) {
      if (!this.ensureShadowUI()) return;
      if (!el) {
        this.highlightEl.style.display = "none";
        return;
      }
      const rect = el.getBoundingClientRect();
      this.highlightEl.style.width = `${rect.width}px`;
      this.highlightEl.style.height = `${rect.height}px`;
      this.highlightEl.style.left = `${rect.left + window.scrollX}px`;
      this.highlightEl.style.top = `${rect.top + window.scrollY}px`;
      this.highlightEl.style.display = "block";
    }
    showClickRipple(x, y) {
      if (!this.ensureShadowUI()) return;
      const ripple = document.createElement("div");
      ripple.className = "bilge-click-ripple";
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      this.shadowRoot.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    }
    showTypeIndicator(element, text) {
      if (!this.ensureShadowUI()) return;
      const rect = element.getBoundingClientRect();
      const indicator = document.createElement("div");
      indicator.className = "bilge-type-indicator";
      indicator.textContent = `\u2713 Typed: ${text.slice(0, 20)}${text.length > 20 ? "..." : ""}`;
      indicator.style.left = `${rect.left + window.scrollX}px`;
      indicator.style.top = `${rect.top + window.scrollY}px`;
      this.shadowRoot.appendChild(indicator);
      setTimeout(() => indicator.remove(), 1500);
    }
    showScrollIndicator(direction) {
      if (!this.ensureShadowUI()) return;
      const indicator = document.createElement("div");
      indicator.className = `bilge-scroll-indicator ${direction}`;
      indicator.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12l7 7 7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      this.shadowRoot.appendChild(indicator);
      setTimeout(() => indicator.remove(), 800);
    }
    showToast(message, type = "success") {
      if (!this.ensureShadowUI()) return;
      const existing = this.shadowRoot.querySelector(".bilge-toast");
      if (existing) existing.remove();
      const toast = document.createElement("div");
      toast.className = `bilge-toast ${type}`;
      toast.textContent = message;
      this.shadowRoot.appendChild(toast);
      setTimeout(() => toast.remove(), 3e3);
    }
    async click(action) {
      const el = await this.resolve(action);
      if (!el) throw new Error(`Could not resolve element for click: ${JSON.stringify(action)}`);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      await this.wait(200);
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2 + window.scrollX;
      const centerY = rect.top + rect.height / 2 + window.scrollY;
      this.updateHighlight(el);
      this.showClickRipple(centerX, centerY);
      await this.wait(150);
      el.click();
      this.showToast(`Clicked: ${el.textContent?.slice(0, 30) || el.tagName}`);
      await this.wait(150);
      this.updateHighlight(null);
      this.lastElement = el;
      return { success: true };
    }
    async type(action) {
      const el = await this.resolve(action);
      if (!el) throw new Error(`Could not resolve element for type: ${JSON.stringify(action)}`);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      await this.wait(200);
      this.updateHighlight(el);
      el.focus();
      let value = action.value || action.text || "";
      if (action.copyFrom) {
        const sourceHint = String(action.copyFrom || "").trim();
        const sourceAction = {
          type: "type",
          field: sourceHint,
          name: sourceHint,
          label: sourceHint,
          placeholder: sourceHint
        };
        const sourceEl = await this.resolve(sourceAction);
        if (!sourceEl) {
          throw new Error(`Could not resolve source field for copy: "${sourceHint}"`);
        }
        if (sourceEl.tagName === "INPUT" || sourceEl.tagName === "TEXTAREA" || sourceEl.tagName === "SELECT") {
          value = String(sourceEl.value || "");
        } else if (sourceEl.isContentEditable) {
          value = String(sourceEl.textContent || "");
        } else {
          value = "";
        }
        if (!value) {
          throw new Error(`Source field "${sourceHint}" is empty`);
        }
      }
      if (el.tagName === "SELECT") {
        el.value = value;
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      this.showTypeIndicator(el, value);
      await this.wait(150);
      this.updateHighlight(null);
      this.lastElement = el;
      return { success: true };
    }
    async scroll(action) {
      const el = await this.resolve(action);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        this.updateHighlight(el);
        this.showScrollIndicator("down");
        await this.wait(300);
        this.updateHighlight(null);
      } else {
        const amount = action.amount || action.duration || 500;
        const direction = amount > 0 ? "down" : "up";
        window.scrollBy({ top: amount, behavior: "smooth" });
        this.showScrollIndicator(direction);
      }
      await this.wait(400);
      return { success: true };
    }
    async extract(action) {
      const el = await this.resolve(action);
      if (!el) return { success: false, error: "Element not found" };
      return {
        success: true,
        data: {
          text: el.innerText || el.textContent,
          value: el.value,
          html: el.outerHTML.slice(0, 1e3)
        }
      };
    }
    async runScript(action, allowAiScripts) {
      if (!allowAiScripts) throw new Error("AI Scripts are disabled by policy.");
      const code = action.code || action.script || action.js;
      if (!code) throw new Error("No script code provided.");
      try {
        const AsyncFunction = Object.getPrototypeOf(async function() {
        }).constructor;
        const fn = new AsyncFunction(code);
        const result = await fn();
        return { success: true, result };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
    /**
     * Parse natural language command using cortex
     */
    normalizeNaturalCommand(command) {
      return String(command || "").replace(/\bconfirmaton\b/gi, "confirmation").replace(/\bconfirmtion\b/gi, "confirmation").replace(/\bconfrimation\b/gi, "confirmation").replace(/\bconfimation\b/gi, "confirmation").replace(/\s+/g, " ").trim();
    }
    buildNaturalRecoveryCandidates(command) {
      const base = this.normalizeNaturalCommand(command);
      const candidates = [];
      const seen = /* @__PURE__ */ new Set();
      const push = /* @__PURE__ */ __name((value) => {
        const text = String(value || "").trim();
        if (!text) return;
        const key = text.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push(text);
      }, "push");
      push(command);
      push(base);
      const matchFillCopy = base.match(/\bfill(?:\s+in)?\s+(.+?)\s+copy\s+from\s+(.+)$/i);
      if (matchFillCopy) {
        push(`fill ${matchFillCopy[1]} from ${matchFillCopy[2]}`);
      }
      const matchCopyInto = base.match(/\bcopy\s+(.+?)\s+(?:into|to)\s+(.+)$/i);
      if (matchCopyInto) {
        push(`fill ${matchCopyInto[2]} from ${matchCopyInto[1]}`);
      }
      return candidates;
    }
    parseNaturalCommand(command) {
      if (!window.BilgeCortex && !window.__bilge_cortex_loaded) {
        return { error: "Cortex not loaded", parsed: null, executable: null };
      }
      let parsed = null;
      let repaired = false;
      for (const candidate of this.buildNaturalRecoveryCandidates(command)) {
        parsed = window.BilgeCortex.parseCommand(candidate, {
          cursor: this.cursor,
          lastElement: this.lastElement
        });
        if (parsed) {
          repaired = candidate !== command;
          break;
        }
      }
      if (!parsed) {
        return {
          error: "Could not execute command safely after recovery attempts",
          parsed: null,
          executable: null,
          catchMode: "auto-debug"
        };
      }
      const executable = window.BilgeCortex.toExecutableAction(parsed);
      return { parsed, executable, repaired };
    }
    /**
     * Execute a natural language command
     */
    async executeNaturalCommand(command, options = {}) {
      console.log("[Bilge] Executing natural command:", command);
      const parseResult = this.parseNaturalCommand(command);
      if (parseResult.error && !parseResult.executable) {
        return { success: false, error: parseResult.error, command };
      }
      const action = parseResult.executable;
      if (!action) {
        return { success: false, error: "Could not convert command to action", command };
      }
      if (action.type === "scroll") {
        return await this.executeNaturalScroll(action, parseResult.parsed);
      }
      return await this.execute(action, options);
    }
    /**
     * Execute natural scroll command with direction support
     */
    async executeNaturalScroll(action, parsed) {
      const direction = parsed?.direction || "down";
      if (action.scrollTo) {
        if (action.scrollTo.top === 0) {
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (action.scrollTo.top === "max") {
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
        }
        this.showScrollIndicator(action.scrollTo.top === 0 ? "up" : "down");
        await this.wait(400);
        return { success: true, scrolled: true, direction };
      }
      const scrollOptions = { behavior: "smooth" };
      if (action.horizontal !== void 0) {
        scrollOptions.left = action.horizontal;
        scrollOptions.top = 0;
      } else {
        scrollOptions.top = action.amount || 300;
        scrollOptions.left = 0;
      }
      window.scrollBy(scrollOptions);
      this.showScrollIndicator(direction);
      await this.wait(400);
      return { success: true, scrolled: true, direction, amount: action.amount || action.horizontal };
    }
    /**
     * Execute a sequence of natural language commands
     */
    async executeNaturalCommandSequence(commandText, options = {}) {
      if (!window.BilgeCortex && !window.__bilge_cortex_loaded) {
        return { success: false, error: "Cortex not loaded" };
      }
      const actions = window.BilgeCortex.parseCommandSequence(commandText);
      if (!actions || actions.length === 0) {
        return { success: false, error: "No commands recognized", commandText };
      }
      return await this.executeBatch(actions, options);
    }
  }
  window.__bilge_runtime = new BilgeRuntime();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2RvbV9ydW50aW1lLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBkb21fcnVudGltZS5qcyAtIEJpbGdlIFJlc2lkZW50IEFnZW50XG4vLyBQcm92aWRlcyBwZXJzaXN0ZW50IERPTSBjYXBhYmlsaXRpZXMgYW5kIHJlc2lkZW50IGF1dG9tYXRpb24gcnVudGltZS5cblxuKGZ1bmN0aW9uKCkge1xuICBpZiAod2luZG93Ll9fYmlsZ2VfcnVudGltZSkgcmV0dXJuO1xuXG4gIGNsYXNzIEJpbGdlUnVudGltZSB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICB0aGlzLmFjdGl2ZSA9IHRydWU7XG4gICAgICB0aGlzLmN1cnNvciA9IHsgeDogMCwgeTogMCB9O1xuICAgICAgdGhpcy5sYXN0RWxlbWVudCA9IG51bGw7XG4gICAgICB0aGlzLmh1bWFuaXplZERlbGF5QmFzZU1zID0gMjIwO1xuICAgICAgdGhpcy5odW1hbml6ZWREZWxheUppdHRlck1zID0gMjYwO1xuICAgICAgdGhpcy5zaGFkb3dSb290ID0gbnVsbDtcbiAgICAgIHRoaXMuaGlnaGxpZ2h0RWwgPSBudWxsO1xuICAgICAgdGhpcy5fc2hhZG93RG9tSW5pdFNjaGVkdWxlZCA9IGZhbHNlO1xuICAgICAgdGhpcy5fc2hhZG93RG9tSW5pdEF0dGVtcHRzID0gMDtcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coXCJbQmlsZ2VdIERPTSBSdW50aW1lIEluaXRpYWxpemVkXCIpO1xuICAgICAgdGhpcy5zZXR1cFNoYWRvd0RPTSgpO1xuICAgICAgdGhpcy5zZXR1cExpc3RlbmVycygpO1xuICAgIH1cblxuICAgIHNjaGVkdWxlU2hhZG93RE9NSW5pdCgpIHtcbiAgICAgIGlmICh0aGlzLl9zaGFkb3dEb21Jbml0U2NoZWR1bGVkKSByZXR1cm47XG4gICAgICB0aGlzLl9zaGFkb3dEb21Jbml0U2NoZWR1bGVkID0gdHJ1ZTtcbiAgICAgIHRoaXMuX3NoYWRvd0RvbUluaXRBdHRlbXB0cyA9ICh0aGlzLl9zaGFkb3dEb21Jbml0QXR0ZW1wdHMgfHwgMCkgKyAxO1xuXG4gICAgICBjb25zdCByZXRyeSA9ICgpID0+IHtcbiAgICAgICAgdGhpcy5fc2hhZG93RG9tSW5pdFNjaGVkdWxlZCA9IGZhbHNlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHRoaXMuc2V0dXBTaGFkb3dET00oKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKFwiW0JpbGdlXSBET00gUnVudGltZSBzaGFkb3cgRE9NIGluaXQgZmFpbGVkOlwiLCBlcnIpO1xuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICAvLyBUcnkgc2hvcnRseSBhZnRlciwgcGx1cyBvbmNlIG9uIERPTUNvbnRlbnRMb2FkZWQgaWYgc3RpbGwgbG9hZGluZy5cbiAgICAgIGlmIChkb2N1bWVudC5yZWFkeVN0YXRlID09PSAnbG9hZGluZycpIHtcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIHJldHJ5LCB7IG9uY2U6IHRydWUgfSk7XG4gICAgICB9XG4gICAgICBjb25zdCBkZWxheU1zID0gTWF0aC5taW4oMjAwMCwgNTAgKiB0aGlzLl9zaGFkb3dEb21Jbml0QXR0ZW1wdHMpO1xuICAgICAgc2V0VGltZW91dChyZXRyeSwgZGVsYXlNcyk7XG4gICAgfVxuXG4gICAgZW5zdXJlU2hhZG93VUkoKSB7XG4gICAgICBpZiAodGhpcy5zaGFkb3dSb290ICYmIHRoaXMuaGlnaGxpZ2h0RWwpIHJldHVybiB0cnVlO1xuICAgICAgdHJ5IHtcbiAgICAgICAgdGhpcy5zZXR1cFNoYWRvd0RPTSgpO1xuICAgICAgfSBjYXRjaCB7fVxuICAgICAgcmV0dXJuIEJvb2xlYW4odGhpcy5zaGFkb3dSb290ICYmIHRoaXMuaGlnaGxpZ2h0RWwpO1xuICAgIH1cblxuICAgIHNldHVwU2hhZG93RE9NKCkge1xuICAgICAgY29uc3QgaG9zdElkID0gJ2JpbGdlLXJ1bnRpbWUtaG9zdCc7XG4gICAgICBsZXQgaG9zdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGhvc3RJZCk7XG4gICAgICBpZiAoIWhvc3QpIHtcbiAgICAgICAgaG9zdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICBob3N0LmlkID0gaG9zdElkO1xuICAgICAgICBob3N0LnN0eWxlLmNzc1RleHQgPSAncG9zaXRpb246IGFic29sdXRlOyB0b3A6IDA7IGxlZnQ6IDA7IHdpZHRoOiAwOyBoZWlnaHQ6IDA7IHotaW5kZXg6IDIxNDc0ODM2NDc7JztcblxuICAgICAgICBjb25zdCBtb3VudCA9IGRvY3VtZW50LmJvZHkgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xuICAgICAgICBpZiAoIW1vdW50KSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKFwiW0JpbGdlXSBET00gUnVudGltZTogZG9jdW1lbnQgbm90IHJlYWR5OyBkZWZlcnJpbmcgc2hhZG93IERPTSBpbml0LlwiKTtcbiAgICAgICAgICB0aGlzLnNjaGVkdWxlU2hhZG93RE9NSW5pdCgpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBtb3VudC5hcHBlbmRDaGlsZChob3N0KTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5zaGFkb3dSb290ID0gaG9zdC5zaGFkb3dSb290IHx8IGhvc3QuYXR0YWNoU2hhZG93KHsgbW9kZTogJ29wZW4nIH0pO1xuICAgICAgdGhpcy5fc2hhZG93RG9tSW5pdEF0dGVtcHRzID0gMDtcbiAgICAgIFxuICAgICAgbGV0IHN0eWxlID0gdGhpcy5zaGFkb3dSb290LnF1ZXJ5U2VsZWN0b3IoJyNiaWxnZS1ydW50aW1lLXN0eWxlJyk7XG4gICAgICBpZiAoIXN0eWxlKSB7XG4gICAgICAgIHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgICAgICAgc3R5bGUuaWQgPSAnYmlsZ2UtcnVudGltZS1zdHlsZSc7XG4gICAgICAgIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgICAgICAuYmlsZ2UtaGlnaGxpZ2h0LW92ZXJsYXkge1xuICAgICAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgICAgICBvdXRsaW5lOiAzcHggc29saWQgIzI1NjNlYjtcbiAgICAgICAgICBiYWNrZ3JvdW5kLWNvbG9yOiByZ2JhKDM3LCA5OSwgMjM1LCAwLjEpO1xuICAgICAgICAgIHRyYW5zaXRpb246IGFsbCAwLjJzIGVhc2UtaW4tb3V0O1xuICAgICAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgICAgIH1cbiAgICAgICAgLyogQ2xpY2sgcmlwcGxlICovXG4gICAgICAgIC5iaWxnZS1jbGljay1yaXBwbGUge1xuICAgICAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgICAgICB3aWR0aDogNDBweDtcbiAgICAgICAgICBoZWlnaHQ6IDQwcHg7XG4gICAgICAgICAgYm9yZGVyLXJhZGl1czogNTAlO1xuICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMzcsIDk5LCAyMzUsIDAuNCk7XG4gICAgICAgICAgdHJhbnNmb3JtOiB0cmFuc2xhdGUoLTUwJSwgLTUwJSkgc2NhbGUoMCk7XG4gICAgICAgICAgYW5pbWF0aW9uOiBiaWxnZS1yaXBwbGUgMC42cyBlYXNlLW91dCBmb3J3YXJkcztcbiAgICAgICAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcbiAgICAgICAgfVxuICAgICAgICBAa2V5ZnJhbWVzIGJpbGdlLXJpcHBsZSB7XG4gICAgICAgICAgdG8geyB0cmFuc2Zvcm06IHRyYW5zbGF0ZSgtNTAlLCAtNTAlKSBzY2FsZSgyLjUpOyBvcGFjaXR5OiAwOyB9XG4gICAgICAgIH1cbiAgICAgICAgLyogVHlwZSBpbmRpY2F0b3IgKi9cbiAgICAgICAgLmJpbGdlLXR5cGUtaW5kaWNhdG9yIHtcbiAgICAgICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgICAgICAgYmFja2dyb3VuZDogIzEwYjk4MTtcbiAgICAgICAgICBjb2xvcjogd2hpdGU7XG4gICAgICAgICAgZm9udC1zaXplOiAxMXB4O1xuICAgICAgICAgIGZvbnQtd2VpZ2h0OiA2MDA7XG4gICAgICAgICAgcGFkZGluZzogMnB4IDhweDtcbiAgICAgICAgICBib3JkZXItcmFkaXVzOiA0cHg7XG4gICAgICAgICAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0xMDAlKTtcbiAgICAgICAgICBtYXJnaW4tdG9wOiAtNHB4O1xuICAgICAgICAgIGFuaW1hdGlvbjogYmlsZ2UtZmFkZS1pbi1vdXQgMS41cyBlYXNlLW91dCBmb3J3YXJkcztcbiAgICAgICAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcbiAgICAgICAgICB3aGl0ZS1zcGFjZTogbm93cmFwO1xuICAgICAgICAgIHotaW5kZXg6IDIxNDc0ODM2NDc7XG4gICAgICAgIH1cbiAgICAgICAgQGtleWZyYW1lcyBiaWxnZS1mYWRlLWluLW91dCB7XG4gICAgICAgICAgMCUgeyBvcGFjaXR5OiAwOyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTEwMCUpIHNjYWxlKDAuOCk7IH1cbiAgICAgICAgICAxNSUgeyBvcGFjaXR5OiAxOyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTEwMCUpIHNjYWxlKDEpOyB9XG4gICAgICAgICAgNzAlIHsgb3BhY2l0eTogMTsgfVxuICAgICAgICAgIDEwMCUgeyBvcGFjaXR5OiAwOyB9XG4gICAgICAgIH1cbiAgICAgICAgLyogU2Nyb2xsIGluZGljYXRvciAqL1xuICAgICAgICAuYmlsZ2Utc2Nyb2xsLWluZGljYXRvciB7XG4gICAgICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgICAgIHJpZ2h0OiAyMHB4O1xuICAgICAgICAgIHRvcDogNTAlO1xuICAgICAgICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtNTAlKTtcbiAgICAgICAgICB3aWR0aDogNDBweDtcbiAgICAgICAgICBoZWlnaHQ6IDYwcHg7XG4gICAgICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICAgIGp1c3RpZnktY29udGVudDogY2VudGVyO1xuICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMzcsIDk5LCAyMzUsIDAuOSk7XG4gICAgICAgICAgYm9yZGVyLXJhZGl1czogMjBweDtcbiAgICAgICAgICBhbmltYXRpb246IGJpbGdlLXNjcm9sbC1wdWxzZSAwLjhzIGVhc2Utb3V0IGZvcndhcmRzO1xuICAgICAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgICAgIHotaW5kZXg6IDIxNDc0ODM2NDc7XG4gICAgICAgIH1cbiAgICAgICAgLmJpbGdlLXNjcm9sbC1pbmRpY2F0b3Igc3ZnIHtcbiAgICAgICAgICB3aWR0aDogMjRweDtcbiAgICAgICAgICBoZWlnaHQ6IDI0cHg7XG4gICAgICAgICAgc3Ryb2tlOiB3aGl0ZTtcbiAgICAgICAgICBzdHJva2Utd2lkdGg6IDIuNTtcbiAgICAgICAgfVxuICAgICAgICAuYmlsZ2Utc2Nyb2xsLWluZGljYXRvci51cCBzdmcgeyB0cmFuc2Zvcm06IHJvdGF0ZSgxODBkZWcpOyB9XG4gICAgICAgIEBrZXlmcmFtZXMgYmlsZ2Utc2Nyb2xsLXB1bHNlIHtcbiAgICAgICAgICAwJSB7IG9wYWNpdHk6IDA7IH1cbiAgICAgICAgICAyMCUgeyBvcGFjaXR5OiAxOyB9XG4gICAgICAgICAgODAlIHsgb3BhY2l0eTogMTsgfVxuICAgICAgICAgIDEwMCUgeyBvcGFjaXR5OiAwOyB9XG4gICAgICAgIH1cbiAgICAgICAgLyogVG9hc3Qgbm90aWZpY2F0aW9uICovXG4gICAgICAgIC5iaWxnZS10b2FzdCB7XG4gICAgICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgICAgIGJvdHRvbTogMjBweDtcbiAgICAgICAgICBsZWZ0OiA1MCU7XG4gICAgICAgICAgdHJhbnNmb3JtOiB0cmFuc2xhdGVYKC01MCUpO1xuICAgICAgICAgIGJhY2tncm91bmQ6ICMxZjI5Mzc7XG4gICAgICAgICAgY29sb3I6IHdoaXRlO1xuICAgICAgICAgIHBhZGRpbmc6IDEycHggMjBweDtcbiAgICAgICAgICBib3JkZXItcmFkaXVzOiAxMnB4O1xuICAgICAgICAgIGZvbnQtc2l6ZTogMTRweDtcbiAgICAgICAgICBmb250LXdlaWdodDogNTAwO1xuICAgICAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAgICBnYXA6IDEwcHg7XG4gICAgICAgICAgYm94LXNoYWRvdzogMCAxMHB4IDQwcHggcmdiYSgwLDAsMCwwLjMpO1xuICAgICAgICAgIGFuaW1hdGlvbjogYmlsZ2UtdG9hc3QtaW4gMC4zcyBlYXNlLW91dDtcbiAgICAgICAgICB6LWluZGV4OiAyMTQ3NDgzNjQ3O1xuICAgICAgICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gICAgICAgIH1cbiAgICAgICAgLmJpbGdlLXRvYXN0LnN1Y2Nlc3MgeyBib3JkZXItbGVmdDogNHB4IHNvbGlkICMxMGI5ODE7IH1cbiAgICAgICAgLmJpbGdlLXRvYXN0LmVycm9yIHsgYm9yZGVyLWxlZnQ6IDRweCBzb2xpZCAjZWY0NDQ0OyB9XG4gICAgICAgIEBrZXlmcmFtZXMgYmlsZ2UtdG9hc3QtaW4ge1xuICAgICAgICAgIGZyb20geyBvcGFjaXR5OiAwOyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoLTUwJSkgdHJhbnNsYXRlWSgyMHB4KTsgfVxuICAgICAgICAgIHRvIHsgb3BhY2l0eTogMTsgdHJhbnNmb3JtOiB0cmFuc2xhdGVYKC01MCUpIHRyYW5zbGF0ZVkoMCk7IH1cbiAgICAgICAgfVxuICAgICAgYDtcbiAgICAgICAgdGhpcy5zaGFkb3dSb290LmFwcGVuZENoaWxkKHN0eWxlKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZXhpc3RpbmdIaWdobGlnaHQgPSB0aGlzLnNoYWRvd1Jvb3QucXVlcnlTZWxlY3RvcignLmJpbGdlLWhpZ2hsaWdodC1vdmVybGF5Jyk7XG4gICAgICB0aGlzLmhpZ2hsaWdodEVsID0gZXhpc3RpbmdIaWdobGlnaHQgfHwgZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICBpZiAoIWV4aXN0aW5nSGlnaGxpZ2h0KSB7XG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWwuY2xhc3NOYW1lID0gJ2JpbGdlLWhpZ2hsaWdodC1vdmVybGF5JztcbiAgICAgICAgdGhpcy5zaGFkb3dSb290LmFwcGVuZENoaWxkKHRoaXMuaGlnaGxpZ2h0RWwpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHNldHVwTGlzdGVuZXJzKCkge1xuICAgICAgY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKChtc2csIHNlbmRlciwgc2VuZFJlc3BvbnNlKSA9PiB7XG4gICAgICAgIGlmIChtc2cudHlwZSA9PT0gJ0VYRUNVVEVfQUNUSU9OJykge1xuICAgICAgICAgIHRoaXMuZXhlY3V0ZShtc2cuYWN0aW9uLCBtc2cub3B0aW9ucykudGhlbihyZXMgPT4gc2VuZFJlc3BvbnNlKHJlcykpO1xuICAgICAgICAgIHJldHVybiB0cnVlOyAvLyBBc3luYyByZXNwb25zZVxuICAgICAgICB9XG4gICAgICAgIGlmIChtc2cudHlwZSA9PT0gJ0VYRUNVVEVfQkFUQ0gnKSB7XG4gICAgICAgICAgdGhpcy5leGVjdXRlQmF0Y2gobXNnLmFjdGlvbnMsIG1zZy5vcHRpb25zKS50aGVuKHJlcyA9PiBzZW5kUmVzcG9uc2UocmVzKSk7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG1zZy50eXBlID09PSAnUVVFUllfU1RBVEUnKSB7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHRoaXMuZ2V0U3RhdGUoKSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG1zZy50eXBlID09PSAnX19CSUxHRV9QSU5HX18nKSB7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IHRydWUsIHZlcnNpb246ICcxLjAuMCcgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBUcmFjayBjdXJzb3IgZm9yIHNtYXJ0IGNvbnRleHRcbiAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCAoZSkgPT4ge1xuICAgICAgICB0aGlzLmN1cnNvci54ID0gZS5jbGllbnRYO1xuICAgICAgICB0aGlzLmN1cnNvci55ID0gZS5jbGllbnRZO1xuICAgICAgfSwgeyBwYXNzaXZlOiB0cnVlIH0pO1xuICAgIH1cblxuICAgIGdldFN0YXRlKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdXJsOiB3aW5kb3cubG9jYXRpb24uaHJlZixcbiAgICAgICAgdGl0bGU6IGRvY3VtZW50LnRpdGxlLFxuICAgICAgICBzY3JvbGw6IHsgeDogd2luZG93LnNjcm9sbFgsIHk6IHdpbmRvdy5zY3JvbGxZIH0sXG4gICAgICAgIGN1cnNvcjogdGhpcy5jdXJzb3IsXG4gICAgICAgIHZpZXdwb3J0OiB7IHdpZHRoOiB3aW5kb3cuaW5uZXJXaWR0aCwgaGVpZ2h0OiB3aW5kb3cuaW5uZXJIZWlnaHQgfVxuICAgICAgfTtcbiAgICB9XG5cbiAgICBub3JtYWxpemVBY3Rpb25UeXBlKHJhd1R5cGUpIHtcbiAgICAgIGNvbnN0IHR5cGUgPSBTdHJpbmcocmF3VHlwZSB8fCAnJykudG9Mb3dlckNhc2UoKS50cmltKCk7XG4gICAgICBpZiAodHlwZSA9PT0gJ2NsaWNrX2VsZW1lbnQnIHx8IHR5cGUgPT09ICdjbGlja19idXR0b24nKSByZXR1cm4gJ2NsaWNrJztcbiAgICAgIGlmICh0eXBlID09PSAndHlwZV90ZXh0JyB8fCB0eXBlID09PSAnZW50ZXJfdGV4dCcgfHwgdHlwZSA9PT0gJ2lucHV0JykgcmV0dXJuICd0eXBlJztcbiAgICAgIGlmICh0eXBlID09PSAnZmlsbF9mb3JtJyB8fCB0eXBlID09PSAnZmlsbF9maWVsZCcpIHJldHVybiAnZmlsbCc7XG4gICAgICBpZiAodHlwZSA9PT0gJ3Njcm9sbF90bycgfHwgdHlwZSA9PT0gJ3Njcm9sbF9wYWdlJykgcmV0dXJuICdzY3JvbGwnO1xuICAgICAgcmV0dXJuIHR5cGU7XG4gICAgfVxuXG4gICAgYXN5bmMgZXhlY3V0ZShhY3Rpb24sIG9wdGlvbnMgPSB7fSkge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoYWN0aW9uKSkge1xuICAgICAgICByZXR1cm4gdGhpcy5leGVjdXRlQmF0Y2goYWN0aW9uLCBvcHRpb25zKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmF3VHlwZSA9IGFjdGlvbi50eXBlIHx8IGFjdGlvbi5hY3Rpb24gfHwgJyc7XG4gICAgICBjb25zdCB0eXBlID0gdGhpcy5ub3JtYWxpemVBY3Rpb25UeXBlKHJhd1R5cGUpO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhcIltCaWxnZV0gRXhlY3V0aW5nOlwiLCB0eXBlLCBhY3Rpb24pO1xuICAgICAgXG4gICAgICBjb25zdCBodW1hbml6ZWREZWxheUVuYWJsZWQgPSBvcHRpb25zLmh1bWFuaXplZERlbGF5RW5hYmxlZCAhPT0gZmFsc2U7XG4gICAgICB0aGlzLmh1bWFuaXplZERlbGF5QmFzZU1zID0gb3B0aW9ucy5odW1hbml6ZWREZWxheUJhc2VNcyB8fCAyMjA7XG4gICAgICB0aGlzLmh1bWFuaXplZERlbGF5Sml0dGVyTXMgPSBvcHRpb25zLmh1bWFuaXplZERlbGF5Sml0dGVyTXMgfHwgMjYwO1xuXG4gICAgICB0cnkge1xuICAgICAgICBsZXQgcmVzdWx0O1xuICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICBjYXNlICdjbGljayc6XG4gICAgICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmNsaWNrKGFjdGlvbik7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdmaWxsJzpcbiAgICAgICAgICBjYXNlICd0eXBlJzpcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMudHlwZShhY3Rpb24pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnc2Nyb2xsJzpcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMuc2Nyb2xsKGFjdGlvbik7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICd3YWl0JzpcbiAgICAgICAgICAgIGF3YWl0IHRoaXMud2FpdChhY3Rpb24uZHVyYXRpb24gfHwgMTAwMCk7XG4gICAgICAgICAgICByZXN1bHQgPSB7IHN1Y2Nlc3M6IHRydWUgfTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2V4dHJhY3QnOlxuICAgICAgICAgICAgcmVzdWx0ID0gYXdhaXQgdGhpcy5leHRyYWN0KGFjdGlvbik7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdzY3JpcHQnOlxuICAgICAgICAgIGNhc2UgJ2pzJzpcbiAgICAgICAgICBjYXNlICdqYXZhc2NyaXB0JzpcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IHRoaXMucnVuU2NyaXB0KGFjdGlvbiwgb3B0aW9ucy5hbGxvd0FpU2NyaXB0cyk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGFjdGlvbiB0eXBlOiAke3Jhd1R5cGV9IChub3JtYWxpemVkIHRvICR7dHlwZX0pYCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaHVtYW5pemVkRGVsYXlFbmFibGVkKSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy53YWl0KHRoaXMubmV4dEh1bWFuaXplZERlbGF5TXMoKSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJbQmlsZ2VdIEFjdGlvbiBmYWlsZWQ6XCIsIGVycik7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UsIHR5cGU6IHJhd1R5cGUgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBhc3luYyBleGVjdXRlQmF0Y2goYWN0aW9ucywgb3B0aW9ucyA9IHt9KSB7XG4gICAgICBjb25zdCByZXN1bHRzID0gW107XG4gICAgICBsZXQgZXhlY3V0ZWRTdGVwcyA9IDA7XG4gICAgICBcbiAgICAgIGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcbiAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5leGVjdXRlKGFjdGlvbiwgb3B0aW9ucyk7XG4gICAgICAgIHJlc3VsdHMucHVzaChyZXMpO1xuICAgICAgICBpZiAoIXJlcy5zdWNjZXNzKSBicmVhaztcbiAgICAgICAgZXhlY3V0ZWRTdGVwcysrO1xuICAgICAgfVxuICAgICAgXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiByZXN1bHRzLmV2ZXJ5KHIgPT4gci5zdWNjZXNzKSxcbiAgICAgICAgZXhlY3V0ZWRTdGVwcyxcbiAgICAgICAgdG90YWxTdGVwczogYWN0aW9ucy5sZW5ndGgsXG4gICAgICAgIHJlc3VsdHNcbiAgICAgIH07XG4gICAgfVxuXG4gICAgbmV4dEh1bWFuaXplZERlbGF5TXMoKSB7XG4gICAgICByZXR1cm4gdGhpcy5odW1hbml6ZWREZWxheUJhc2VNcyArIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqICh0aGlzLmh1bWFuaXplZERlbGF5Sml0dGVyTXMgKyAxKSk7XG4gICAgfVxuXG4gICAgd2FpdChtcykge1xuICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCBtcykpO1xuICAgIH1cblxuICAgIGFzeW5jIHJlc29sdmUoYWN0aW9uKSB7XG4gICAgICBjb25zdCB7IHNlbGVjdG9yLCBzZWxlY3RvcnMsIGZpZWxkLCBuYW1lLCBsYWJlbCwgcGxhY2Vob2xkZXIsIHR5cGUgfSA9IGFjdGlvbjtcbiAgICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBzZWxlY3RvcnMgfHwgKHNlbGVjdG9yID8gW3NlbGVjdG9yXSA6IFtdKTtcbiAgICAgIGNvbnN0IGFjdGlvblR5cGUgPSAodHlwZSB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICAgIFxuICAgICAgLy8gMS4gVHJ5IGV4cGxpY2l0IHNlbGVjdG9yc1xuICAgICAgZm9yIChjb25zdCBzZWwgb2YgY2FuZGlkYXRlcykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWwpO1xuICAgICAgICAgIGlmIChlbCAmJiB0aGlzLmlzVXNhYmxlKGVsKSkgcmV0dXJuIGVsO1xuICAgICAgICB9IGNhdGNoIChlKSB7fVxuICAgICAgfVxuXG4gICAgICAvLyAyLiBIZXVyaXN0aWMgZmFsbGJhY2tcbiAgICAgIGxldCBlbCA9IHRoaXMuZmluZEhldXJpc3RpYyhmaWVsZCwgbmFtZSwgbGFiZWwsIHBsYWNlaG9sZGVyLCBjYW5kaWRhdGVzKTtcbiAgICAgIGlmIChlbCkgcmV0dXJuIGVsO1xuXG4gICAgICAvLyAzLiBQcm9iZSBzY3JvbGxpbmcgZmFsbGJhY2sgKG9ubHkgZm9yIGludGVyYWN0aW9uIHR5cGVzKVxuICAgICAgaWYgKFsnY2xpY2snLCAndHlwZScsICdmaWxsJywgJ3Njcm9sbCddLmluY2x1ZGVzKGFjdGlvblR5cGUpKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiW0JpbGdlXSBFbGVtZW50IG5vdCBmb3VuZCwgYXR0ZW1wdGluZyBwcm9iZSBzY3JvbGxpbmcuLi5cIik7XG4gICAgICAgIGNvbnN0IHByb2JlRGlzdGFuY2UgPSBNYXRoLm1heCgyNDAsIE1hdGgucm91bmQod2luZG93LmlubmVySGVpZ2h0ICogMC44KSk7XG4gICAgICAgIGNvbnN0IG1heFByb2JlU2Nyb2xscyA9IDQ7XG4gICAgICAgIFxuICAgICAgICBmb3IgKGxldCBwcm9iZSA9IDE7IHByb2JlIDw9IG1heFByb2JlU2Nyb2xsczsgcHJvYmUgKz0gMSkge1xuICAgICAgICAgIHdpbmRvdy5zY3JvbGxCeSh7IHRvcDogcHJvYmVEaXN0YW5jZSwgYmVoYXZpb3I6ICdhdXRvJyB9KTtcbiAgICAgICAgICBhd2FpdCB0aGlzLndhaXQoMTUwKTtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBSZXRyeSBzZWxlY3RvcnNcbiAgICAgICAgICBmb3IgKGNvbnN0IHNlbCBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBjb25zdCBwRWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbCk7XG4gICAgICAgICAgICAgIGlmIChwRWwgJiYgdGhpcy5pc1VzYWJsZShwRWwpKSByZXR1cm4gcEVsO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge31cbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gUmV0cnkgaGV1cmlzdGljc1xuICAgICAgICAgIGVsID0gdGhpcy5maW5kSGV1cmlzdGljKGZpZWxkLCBuYW1lLCBsYWJlbCwgcGxhY2Vob2xkZXIsIGNhbmRpZGF0ZXMpO1xuICAgICAgICAgIGlmIChlbCkgcmV0dXJuIGVsO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBSZXNldCBpZiBzdGlsbCBub3QgZm91bmRcbiAgICAgICAgd2luZG93LnNjcm9sbFRvKHsgdG9wOiAwLCBiZWhhdmlvcjogJ2F1dG8nIH0pO1xuICAgICAgICBhd2FpdCB0aGlzLndhaXQoMTUwKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgaXNVc2FibGUoZWwpIHtcbiAgICAgIGNvbnN0IHN0eWxlID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWwpO1xuICAgICAgcmV0dXJuIHN0eWxlLmRpc3BsYXkgIT09ICdub25lJyAmJiBzdHlsZS52aXNpYmlsaXR5ICE9PSAnaGlkZGVuJztcbiAgICB9XG5cbiAgICBmaW5kSGV1cmlzdGljKGZpZWxkLCBuYW1lLCBsYWJlbCwgcGxhY2Vob2xkZXIsIHNlbGVjdG9ycykge1xuICAgICAgY29uc3QgdG9rZW5zID0gbmV3IFNldCgpO1xuICAgICAgW2ZpZWxkLCBuYW1lLCBsYWJlbCwgcGxhY2Vob2xkZXJdLmZvckVhY2godCA9PiB7XG4gICAgICAgIGlmICh0KSBTdHJpbmcodCkudG9Mb3dlckNhc2UoKS5zcGxpdCgvW15hLXowLTldKy8pLmZvckVhY2godG9rZW4gPT4gdG9rZW5zLmFkZCh0b2tlbikpO1xuICAgICAgfSk7XG5cbiAgICAgIGlmICh0b2tlbnMuc2l6ZSA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgICAgIGNvbnN0IGVsZW1lbnRzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dCwgYnV0dG9uLCBhLCB0ZXh0YXJlYSwgc2VsZWN0LCBbcm9sZT1cImJ1dHRvblwiXSwgW3JvbGU9XCJsaW5rXCJdJykpO1xuICAgICAgbGV0IGJlc3RNYXRjaCA9IG51bGw7XG4gICAgICBsZXQgaGlnaGVzdFNjb3JlID0gMDtcblxuICAgICAgZWxlbWVudHMuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgIGlmICghdGhpcy5pc1VzYWJsZShlbCkpIHJldHVybjtcblxuICAgICAgICBsZXQgc2NvcmUgPSAwO1xuICAgICAgICBjb25zdCBzZWFyY2hCb2R5ID0gKFxuICAgICAgICAgIChlbC5pbm5lclRleHQgfHwgJycpICsgJyAnICsgXG4gICAgICAgICAgKGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8ICcnKSArICcgJyArIFxuICAgICAgICAgIChlbC5nZXRBdHRyaWJ1dGUoJ3BsYWNlaG9sZGVyJykgfHwgJycpICsgJyAnICsgXG4gICAgICAgICAgKGVsLm5hbWUgfHwgJycpICsgJyAnICsgXG4gICAgICAgICAgKGVsLmlkIHx8ICcnKSArICcgJyArXG4gICAgICAgICAgKGVsLmdldEF0dHJpYnV0ZSgnZGF0YS10ZXN0aWQnKSB8fCAnJylcbiAgICAgICAgKS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgICAgIHRva2Vucy5mb3JFYWNoKHRva2VuID0+IHtcbiAgICAgICAgICBpZiAoc2VhcmNoQm9keS5pbmNsdWRlcyh0b2tlbikpIHtcbiAgICAgICAgICAgIHNjb3JlICs9ICh0b2tlbi5sZW5ndGggPj0gNCkgPyAyIDogMTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChzY29yZSA+IGhpZ2hlc3RTY29yZSkge1xuICAgICAgICAgIGhpZ2hlc3RTY29yZSA9IHNjb3JlO1xuICAgICAgICAgIGJlc3RNYXRjaCA9IGVsO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIGhpZ2hlc3RTY29yZSA+PSAyID8gYmVzdE1hdGNoIDogbnVsbDtcbiAgICB9XG5cbiAgICB1cGRhdGVIaWdobGlnaHQoZWwpIHtcbiAgICAgIGlmICghdGhpcy5lbnN1cmVTaGFkb3dVSSgpKSByZXR1cm47XG4gICAgICBpZiAoIWVsKSB7XG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWwuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgdGhpcy5oaWdobGlnaHRFbC5zdHlsZS53aWR0aCA9IGAke3JlY3Qud2lkdGh9cHhgO1xuICAgICAgdGhpcy5oaWdobGlnaHRFbC5zdHlsZS5oZWlnaHQgPSBgJHtyZWN0LmhlaWdodH1weGA7XG4gICAgICB0aGlzLmhpZ2hsaWdodEVsLnN0eWxlLmxlZnQgPSBgJHtyZWN0LmxlZnQgKyB3aW5kb3cuc2Nyb2xsWH1weGA7XG4gICAgICB0aGlzLmhpZ2hsaWdodEVsLnN0eWxlLnRvcCA9IGAke3JlY3QudG9wICsgd2luZG93LnNjcm9sbFl9cHhgO1xuICAgICAgdGhpcy5oaWdobGlnaHRFbC5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcbiAgICB9XG5cbiAgICBzaG93Q2xpY2tSaXBwbGUoeCwgeSkge1xuICAgICAgaWYgKCF0aGlzLmVuc3VyZVNoYWRvd1VJKCkpIHJldHVybjtcbiAgICAgIGNvbnN0IHJpcHBsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgcmlwcGxlLmNsYXNzTmFtZSA9ICdiaWxnZS1jbGljay1yaXBwbGUnO1xuICAgICAgcmlwcGxlLnN0eWxlLmxlZnQgPSBgJHt4fXB4YDtcbiAgICAgIHJpcHBsZS5zdHlsZS50b3AgPSBgJHt5fXB4YDtcbiAgICAgIHRoaXMuc2hhZG93Um9vdC5hcHBlbmRDaGlsZChyaXBwbGUpO1xuICAgICAgc2V0VGltZW91dCgoKSA9PiByaXBwbGUucmVtb3ZlKCksIDYwMCk7XG4gICAgfVxuXG4gICAgc2hvd1R5cGVJbmRpY2F0b3IoZWxlbWVudCwgdGV4dCkge1xuICAgICAgaWYgKCF0aGlzLmVuc3VyZVNoYWRvd1VJKCkpIHJldHVybjtcbiAgICAgIGNvbnN0IHJlY3QgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgY29uc3QgaW5kaWNhdG9yID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICBpbmRpY2F0b3IuY2xhc3NOYW1lID0gJ2JpbGdlLXR5cGUtaW5kaWNhdG9yJztcbiAgICAgIGluZGljYXRvci50ZXh0Q29udGVudCA9IGBcdTI3MTMgVHlwZWQ6ICR7dGV4dC5zbGljZSgwLCAyMCl9JHt0ZXh0Lmxlbmd0aCA+IDIwID8gJy4uLicgOiAnJ31gO1xuICAgICAgaW5kaWNhdG9yLnN0eWxlLmxlZnQgPSBgJHtyZWN0LmxlZnQgKyB3aW5kb3cuc2Nyb2xsWH1weGA7XG4gICAgICBpbmRpY2F0b3Iuc3R5bGUudG9wID0gYCR7cmVjdC50b3AgKyB3aW5kb3cuc2Nyb2xsWX1weGA7XG4gICAgICB0aGlzLnNoYWRvd1Jvb3QuYXBwZW5kQ2hpbGQoaW5kaWNhdG9yKTtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gaW5kaWNhdG9yLnJlbW92ZSgpLCAxNTAwKTtcbiAgICB9XG5cbiAgICBzaG93U2Nyb2xsSW5kaWNhdG9yKGRpcmVjdGlvbikge1xuICAgICAgaWYgKCF0aGlzLmVuc3VyZVNoYWRvd1VJKCkpIHJldHVybjtcbiAgICAgIGNvbnN0IGluZGljYXRvciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgaW5kaWNhdG9yLmNsYXNzTmFtZSA9IGBiaWxnZS1zY3JvbGwtaW5kaWNhdG9yICR7ZGlyZWN0aW9ufWA7XG4gICAgICBpbmRpY2F0b3IuaW5uZXJIVE1MID0gYDxzdmcgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCI+PHBhdGggZD1cIk0xMiA1djE0TTUgMTJsNyA3IDctN1wiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiLz48L3N2Zz5gO1xuICAgICAgdGhpcy5zaGFkb3dSb290LmFwcGVuZENoaWxkKGluZGljYXRvcik7XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IGluZGljYXRvci5yZW1vdmUoKSwgODAwKTtcbiAgICB9XG5cbiAgICBzaG93VG9hc3QobWVzc2FnZSwgdHlwZSA9ICdzdWNjZXNzJykge1xuICAgICAgaWYgKCF0aGlzLmVuc3VyZVNoYWRvd1VJKCkpIHJldHVybjtcbiAgICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5zaGFkb3dSb290LnF1ZXJ5U2VsZWN0b3IoJy5iaWxnZS10b2FzdCcpO1xuICAgICAgaWYgKGV4aXN0aW5nKSBleGlzdGluZy5yZW1vdmUoKTtcbiAgICAgIGNvbnN0IHRvYXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICB0b2FzdC5jbGFzc05hbWUgPSBgYmlsZ2UtdG9hc3QgJHt0eXBlfWA7XG4gICAgICB0b2FzdC50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG4gICAgICB0aGlzLnNoYWRvd1Jvb3QuYXBwZW5kQ2hpbGQodG9hc3QpO1xuICAgICAgc2V0VGltZW91dCgoKSA9PiB0b2FzdC5yZW1vdmUoKSwgMzAwMCk7XG4gICAgfVxuXG4gICAgYXN5bmMgY2xpY2soYWN0aW9uKSB7XG4gICAgICBjb25zdCBlbCA9IGF3YWl0IHRoaXMucmVzb2x2ZShhY3Rpb24pO1xuICAgICAgaWYgKCFlbCkgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgcmVzb2x2ZSBlbGVtZW50IGZvciBjbGljazogJHtKU09OLnN0cmluZ2lmeShhY3Rpb24pfWApO1xuXG4gICAgICBlbC5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJywgYmxvY2s6ICdjZW50ZXInIH0pO1xuICAgICAgYXdhaXQgdGhpcy53YWl0KDIwMCk7XG5cbiAgICAgIGNvbnN0IHJlY3QgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGNvbnN0IGNlbnRlclggPSByZWN0LmxlZnQgKyByZWN0LndpZHRoIC8gMiArIHdpbmRvdy5zY3JvbGxYO1xuICAgICAgY29uc3QgY2VudGVyWSA9IHJlY3QudG9wICsgcmVjdC5oZWlnaHQgLyAyICsgd2luZG93LnNjcm9sbFk7XG5cbiAgICAgIHRoaXMudXBkYXRlSGlnaGxpZ2h0KGVsKTtcbiAgICAgIHRoaXMuc2hvd0NsaWNrUmlwcGxlKGNlbnRlclgsIGNlbnRlclkpO1xuICAgICAgYXdhaXQgdGhpcy53YWl0KDE1MCk7XG4gICAgICBlbC5jbGljaygpO1xuICAgICAgdGhpcy5zaG93VG9hc3QoYENsaWNrZWQ6ICR7ZWwudGV4dENvbnRlbnQ/LnNsaWNlKDAsIDMwKSB8fCBlbC50YWdOYW1lfWApO1xuICAgICAgYXdhaXQgdGhpcy53YWl0KDE1MCk7XG4gICAgICB0aGlzLnVwZGF0ZUhpZ2hsaWdodChudWxsKTtcblxuICAgICAgdGhpcy5sYXN0RWxlbWVudCA9IGVsO1xuICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9O1xuICAgIH1cblxuICAgIGFzeW5jIHR5cGUoYWN0aW9uKSB7XG4gICAgICBjb25zdCBlbCA9IGF3YWl0IHRoaXMucmVzb2x2ZShhY3Rpb24pO1xuICAgICAgaWYgKCFlbCkgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgcmVzb2x2ZSBlbGVtZW50IGZvciB0eXBlOiAke0pTT04uc3RyaW5naWZ5KGFjdGlvbil9YCk7XG5cbiAgICAgIGVsLnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdzbW9vdGgnLCBibG9jazogJ2NlbnRlcicgfSk7XG4gICAgICBhd2FpdCB0aGlzLndhaXQoMjAwKTtcblxuICAgICAgdGhpcy51cGRhdGVIaWdobGlnaHQoZWwpO1xuICAgICAgZWwuZm9jdXMoKTtcbiAgICAgIFxuICAgICAgbGV0IHZhbHVlID0gYWN0aW9uLnZhbHVlIHx8IGFjdGlvbi50ZXh0IHx8ICcnO1xuICAgICAgaWYgKGFjdGlvbi5jb3B5RnJvbSkge1xuICAgICAgICBjb25zdCBzb3VyY2VIaW50ID0gU3RyaW5nKGFjdGlvbi5jb3B5RnJvbSB8fCAnJykudHJpbSgpO1xuICAgICAgICBjb25zdCBzb3VyY2VBY3Rpb24gPSB7XG4gICAgICAgICAgdHlwZTogJ3R5cGUnLFxuICAgICAgICAgIGZpZWxkOiBzb3VyY2VIaW50LFxuICAgICAgICAgIG5hbWU6IHNvdXJjZUhpbnQsXG4gICAgICAgICAgbGFiZWw6IHNvdXJjZUhpbnQsXG4gICAgICAgICAgcGxhY2Vob2xkZXI6IHNvdXJjZUhpbnRcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3Qgc291cmNlRWwgPSBhd2FpdCB0aGlzLnJlc29sdmUoc291cmNlQWN0aW9uKTtcbiAgICAgICAgaWYgKCFzb3VyY2VFbCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IHJlc29sdmUgc291cmNlIGZpZWxkIGZvciBjb3B5OiBcIiR7c291cmNlSGludH1cImApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzb3VyY2VFbC50YWdOYW1lID09PSAnSU5QVVQnIHx8IHNvdXJjZUVsLnRhZ05hbWUgPT09ICdURVhUQVJFQScgfHwgc291cmNlRWwudGFnTmFtZSA9PT0gJ1NFTEVDVCcpIHtcbiAgICAgICAgICB2YWx1ZSA9IFN0cmluZyhzb3VyY2VFbC52YWx1ZSB8fCAnJyk7XG4gICAgICAgIH0gZWxzZSBpZiAoc291cmNlRWwuaXNDb250ZW50RWRpdGFibGUpIHtcbiAgICAgICAgICB2YWx1ZSA9IFN0cmluZyhzb3VyY2VFbC50ZXh0Q29udGVudCB8fCAnJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWUgPSAnJztcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXZhbHVlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBTb3VyY2UgZmllbGQgXCIke3NvdXJjZUhpbnR9XCIgaXMgZW1wdHlgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICBpZiAoZWwudGFnTmFtZSA9PT0gJ1NFTEVDVCcpIHtcbiAgICAgICAgZWwudmFsdWUgPSB2YWx1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVsLnZhbHVlID0gdmFsdWU7XG4gICAgICB9XG5cbiAgICAgIGVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gICAgICBlbC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgICAgIFxuICAgICAgdGhpcy5zaG93VHlwZUluZGljYXRvcihlbCwgdmFsdWUpO1xuICAgICAgYXdhaXQgdGhpcy53YWl0KDE1MCk7XG4gICAgICB0aGlzLnVwZGF0ZUhpZ2hsaWdodChudWxsKTtcblxuICAgICAgdGhpcy5sYXN0RWxlbWVudCA9IGVsO1xuICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9O1xuICAgIH1cblxuICAgIGFzeW5jIHNjcm9sbChhY3Rpb24pIHtcbiAgICAgIGNvbnN0IGVsID0gYXdhaXQgdGhpcy5yZXNvbHZlKGFjdGlvbik7XG4gICAgICBpZiAoZWwpIHtcbiAgICAgICAgLy8gSWYgd2UgbWF0Y2hlZCBhbiBlbGVtZW50LCBzY3JvbGwgaXQgaW50byB2aWV3XG4gICAgICAgIGVsLnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdzbW9vdGgnLCBibG9jazogJ2NlbnRlcicgfSk7XG4gICAgICAgIHRoaXMudXBkYXRlSGlnaGxpZ2h0KGVsKTtcbiAgICAgICAgdGhpcy5zaG93U2Nyb2xsSW5kaWNhdG9yKCdkb3duJyk7XG4gICAgICAgIGF3YWl0IHRoaXMud2FpdCgzMDApO1xuICAgICAgICB0aGlzLnVwZGF0ZUhpZ2hsaWdodChudWxsKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIE90aGVyd2lzZSBzY3JvbGwgdGhlIHdpbmRvd1xuICAgICAgICBjb25zdCBhbW91bnQgPSBhY3Rpb24uYW1vdW50IHx8IGFjdGlvbi5kdXJhdGlvbiB8fCA1MDA7XG4gICAgICAgIGNvbnN0IGRpcmVjdGlvbiA9IGFtb3VudCA+IDAgPyAnZG93bicgOiAndXAnO1xuICAgICAgICB3aW5kb3cuc2Nyb2xsQnkoeyB0b3A6IGFtb3VudCwgYmVoYXZpb3I6ICdzbW9vdGgnIH0pO1xuICAgICAgICB0aGlzLnNob3dTY3JvbGxJbmRpY2F0b3IoZGlyZWN0aW9uKTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHRoaXMud2FpdCg0MDApO1xuICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9O1xuICAgIH1cblxuICAgIGFzeW5jIGV4dHJhY3QoYWN0aW9uKSB7XG4gICAgICBjb25zdCBlbCA9IGF3YWl0IHRoaXMucmVzb2x2ZShhY3Rpb24pO1xuICAgICAgaWYgKCFlbCkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnRWxlbWVudCBub3QgZm91bmQnIH07XG4gICAgICBcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIGRhdGE6IHtcbiAgICAgICAgICB0ZXh0OiBlbC5pbm5lclRleHQgfHwgZWwudGV4dENvbnRlbnQsXG4gICAgICAgICAgdmFsdWU6IGVsLnZhbHVlLFxuICAgICAgICAgIGh0bWw6IGVsLm91dGVySFRNTC5zbGljZSgwLCAxMDAwKVxuICAgICAgICB9XG4gICAgICB9O1xuICAgIH1cblxuICAgIGFzeW5jIHJ1blNjcmlwdChhY3Rpb24sIGFsbG93QWlTY3JpcHRzKSB7XG4gICAgICBpZiAoIWFsbG93QWlTY3JpcHRzKSB0aHJvdyBuZXcgRXJyb3IoXCJBSSBTY3JpcHRzIGFyZSBkaXNhYmxlZCBieSBwb2xpY3kuXCIpO1xuICAgICAgY29uc3QgY29kZSA9IGFjdGlvbi5jb2RlIHx8IGFjdGlvbi5zY3JpcHQgfHwgYWN0aW9uLmpzO1xuICAgICAgaWYgKCFjb2RlKSB0aHJvdyBuZXcgRXJyb3IoXCJObyBzY3JpcHQgY29kZSBwcm92aWRlZC5cIik7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IEFzeW5jRnVuY3Rpb24gPSBPYmplY3QuZ2V0UHJvdG90eXBlT2YoYXN5bmMgZnVuY3Rpb24oKXt9KS5jb25zdHJ1Y3RvcjtcbiAgICAgICAgY29uc3QgZm4gPSBuZXcgQXN5bmNGdW5jdGlvbihjb2RlKTtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZm4oKTtcbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgcmVzdWx0IH07XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhcnNlIG5hdHVyYWwgbGFuZ3VhZ2UgY29tbWFuZCB1c2luZyBjb3J0ZXhcbiAgICAgKi9cbiAgICBub3JtYWxpemVOYXR1cmFsQ29tbWFuZChjb21tYW5kKSB7XG4gICAgICByZXR1cm4gU3RyaW5nKGNvbW1hbmQgfHwgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXGJjb25maXJtYXRvblxcYi9naSwgJ2NvbmZpcm1hdGlvbicpXG4gICAgICAgIC5yZXBsYWNlKC9cXGJjb25maXJtdGlvblxcYi9naSwgJ2NvbmZpcm1hdGlvbicpXG4gICAgICAgIC5yZXBsYWNlKC9cXGJjb25mcmltYXRpb25cXGIvZ2ksICdjb25maXJtYXRpb24nKVxuICAgICAgICAucmVwbGFjZSgvXFxiY29uZmltYXRpb25cXGIvZ2ksICdjb25maXJtYXRpb24nKVxuICAgICAgICAucmVwbGFjZSgvXFxzKy9nLCAnICcpXG4gICAgICAgIC50cmltKCk7XG4gICAgfVxuXG4gICAgYnVpbGROYXR1cmFsUmVjb3ZlcnlDYW5kaWRhdGVzKGNvbW1hbmQpIHtcbiAgICAgIGNvbnN0IGJhc2UgPSB0aGlzLm5vcm1hbGl6ZU5hdHVyYWxDb21tYW5kKGNvbW1hbmQpO1xuICAgICAgY29uc3QgY2FuZGlkYXRlcyA9IFtdO1xuICAgICAgY29uc3Qgc2VlbiA9IG5ldyBTZXQoKTtcbiAgICAgIGNvbnN0IHB1c2ggPSAodmFsdWUpID0+IHtcbiAgICAgICAgY29uc3QgdGV4dCA9IFN0cmluZyh2YWx1ZSB8fCAnJykudHJpbSgpO1xuICAgICAgICBpZiAoIXRleHQpIHJldHVybjtcbiAgICAgICAgY29uc3Qga2V5ID0gdGV4dC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBpZiAoc2Vlbi5oYXMoa2V5KSkgcmV0dXJuO1xuICAgICAgICBzZWVuLmFkZChrZXkpO1xuICAgICAgICBjYW5kaWRhdGVzLnB1c2godGV4dCk7XG4gICAgICB9O1xuXG4gICAgICBwdXNoKGNvbW1hbmQpO1xuICAgICAgcHVzaChiYXNlKTtcblxuICAgICAgY29uc3QgbWF0Y2hGaWxsQ29weSA9IGJhc2UubWF0Y2goL1xcYmZpbGwoPzpcXHMraW4pP1xccysoLis/KVxccytjb3B5XFxzK2Zyb21cXHMrKC4rKSQvaSk7XG4gICAgICBpZiAobWF0Y2hGaWxsQ29weSkge1xuICAgICAgICBwdXNoKGBmaWxsICR7bWF0Y2hGaWxsQ29weVsxXX0gZnJvbSAke21hdGNoRmlsbENvcHlbMl19YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG1hdGNoQ29weUludG8gPSBiYXNlLm1hdGNoKC9cXGJjb3B5XFxzKyguKz8pXFxzKyg/OmludG98dG8pXFxzKyguKykkL2kpO1xuICAgICAgaWYgKG1hdGNoQ29weUludG8pIHtcbiAgICAgICAgcHVzaChgZmlsbCAke21hdGNoQ29weUludG9bMl19IGZyb20gJHttYXRjaENvcHlJbnRvWzFdfWApO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gY2FuZGlkYXRlcztcbiAgICB9XG5cbiAgICBwYXJzZU5hdHVyYWxDb21tYW5kKGNvbW1hbmQpIHtcbiAgICAgIGlmICghd2luZG93LkJpbGdlQ29ydGV4ICYmICF3aW5kb3cuX19iaWxnZV9jb3J0ZXhfbG9hZGVkKSB7XG4gICAgICAgIHJldHVybiB7IGVycm9yOiAnQ29ydGV4IG5vdCBsb2FkZWQnLCBwYXJzZWQ6IG51bGwsIGV4ZWN1dGFibGU6IG51bGwgfTtcbiAgICAgIH1cblxuICAgICAgbGV0IHBhcnNlZCA9IG51bGw7XG4gICAgICBsZXQgcmVwYWlyZWQgPSBmYWxzZTtcbiAgICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIHRoaXMuYnVpbGROYXR1cmFsUmVjb3ZlcnlDYW5kaWRhdGVzKGNvbW1hbmQpKSB7XG4gICAgICAgIHBhcnNlZCA9IHdpbmRvdy5CaWxnZUNvcnRleC5wYXJzZUNvbW1hbmQoY2FuZGlkYXRlLCB7XG4gICAgICAgICAgY3Vyc29yOiB0aGlzLmN1cnNvcixcbiAgICAgICAgICBsYXN0RWxlbWVudDogdGhpcy5sYXN0RWxlbWVudFxuICAgICAgICB9KTtcbiAgICAgICAgaWYgKHBhcnNlZCkge1xuICAgICAgICAgIHJlcGFpcmVkID0gY2FuZGlkYXRlICE9PSBjb21tYW5kO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICghcGFyc2VkKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgZXJyb3I6ICdDb3VsZCBub3QgZXhlY3V0ZSBjb21tYW5kIHNhZmVseSBhZnRlciByZWNvdmVyeSBhdHRlbXB0cycsXG4gICAgICAgICAgcGFyc2VkOiBudWxsLFxuICAgICAgICAgIGV4ZWN1dGFibGU6IG51bGwsXG4gICAgICAgICAgY2F0Y2hNb2RlOiAnYXV0by1kZWJ1ZydcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZXhlY3V0YWJsZSA9IHdpbmRvdy5CaWxnZUNvcnRleC50b0V4ZWN1dGFibGVBY3Rpb24ocGFyc2VkKTtcbiAgICAgIHJldHVybiB7IHBhcnNlZCwgZXhlY3V0YWJsZSwgcmVwYWlyZWQgfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlIGEgbmF0dXJhbCBsYW5ndWFnZSBjb21tYW5kXG4gICAgICovXG4gICAgYXN5bmMgZXhlY3V0ZU5hdHVyYWxDb21tYW5kKGNvbW1hbmQsIG9wdGlvbnMgPSB7fSkge1xuICAgICAgY29uc29sZS5sb2coXCJbQmlsZ2VdIEV4ZWN1dGluZyBuYXR1cmFsIGNvbW1hbmQ6XCIsIGNvbW1hbmQpO1xuXG4gICAgICBjb25zdCBwYXJzZVJlc3VsdCA9IHRoaXMucGFyc2VOYXR1cmFsQ29tbWFuZChjb21tYW5kKTtcbiAgICAgIGlmIChwYXJzZVJlc3VsdC5lcnJvciAmJiAhcGFyc2VSZXN1bHQuZXhlY3V0YWJsZSkge1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHBhcnNlUmVzdWx0LmVycm9yLCBjb21tYW5kIH07XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFjdGlvbiA9IHBhcnNlUmVzdWx0LmV4ZWN1dGFibGU7XG4gICAgICBpZiAoIWFjdGlvbikge1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdDb3VsZCBub3QgY29udmVydCBjb21tYW5kIHRvIGFjdGlvbicsIGNvbW1hbmQgfTtcbiAgICAgIH1cblxuICAgICAgLy8gSGFuZGxlIHNjcm9sbCBzcGVjaWFsbHkgZm9yIG5hdHVyYWwgc2Nyb2xsIGNvbW1hbmRzXG4gICAgICBpZiAoYWN0aW9uLnR5cGUgPT09ICdzY3JvbGwnKSB7XG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmV4ZWN1dGVOYXR1cmFsU2Nyb2xsKGFjdGlvbiwgcGFyc2VSZXN1bHQucGFyc2VkKTtcbiAgICAgIH1cblxuICAgICAgLy8gRm9yIG90aGVyIGFjdGlvbnMsIGRlbGVnYXRlIHRvIHN0YW5kYXJkIGV4ZWN1dGVcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLmV4ZWN1dGUoYWN0aW9uLCBvcHRpb25zKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlIG5hdHVyYWwgc2Nyb2xsIGNvbW1hbmQgd2l0aCBkaXJlY3Rpb24gc3VwcG9ydFxuICAgICAqL1xuICAgIGFzeW5jIGV4ZWN1dGVOYXR1cmFsU2Nyb2xsKGFjdGlvbiwgcGFyc2VkKSB7XG4gICAgICBjb25zdCBkaXJlY3Rpb24gPSBwYXJzZWQ/LmRpcmVjdGlvbiB8fCAnZG93bic7XG5cbiAgICAgIC8vIFNjcm9sbCB0byBhYnNvbHV0ZSBwb3NpdGlvblxuICAgICAgaWYgKGFjdGlvbi5zY3JvbGxUbykge1xuICAgICAgICBpZiAoYWN0aW9uLnNjcm9sbFRvLnRvcCA9PT0gMCkge1xuICAgICAgICAgIHdpbmRvdy5zY3JvbGxUbyh7IHRvcDogMCwgYmVoYXZpb3I6ICdzbW9vdGgnIH0pO1xuICAgICAgICB9IGVsc2UgaWYgKGFjdGlvbi5zY3JvbGxUby50b3AgPT09ICdtYXgnKSB7XG4gICAgICAgICAgd2luZG93LnNjcm9sbFRvKHsgdG9wOiBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsSGVpZ2h0LCBiZWhhdmlvcjogJ3Ntb290aCcgfSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zaG93U2Nyb2xsSW5kaWNhdG9yKGFjdGlvbi5zY3JvbGxUby50b3AgPT09IDAgPyAndXAnIDogJ2Rvd24nKTtcbiAgICAgICAgYXdhaXQgdGhpcy53YWl0KDQwMCk7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIHNjcm9sbGVkOiB0cnVlLCBkaXJlY3Rpb24gfTtcbiAgICAgIH1cblxuICAgICAgLy8gUmVsYXRpdmUgc2Nyb2xsXG4gICAgICBjb25zdCBzY3JvbGxPcHRpb25zID0geyBiZWhhdmlvcjogJ3Ntb290aCcgfTtcblxuICAgICAgaWYgKGFjdGlvbi5ob3Jpem9udGFsICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgLy8gSG9yaXpvbnRhbCBzY3JvbGxcbiAgICAgICAgc2Nyb2xsT3B0aW9ucy5sZWZ0ID0gYWN0aW9uLmhvcml6b250YWw7XG4gICAgICAgIHNjcm9sbE9wdGlvbnMudG9wID0gMDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFZlcnRpY2FsIHNjcm9sbFxuICAgICAgICBzY3JvbGxPcHRpb25zLnRvcCA9IGFjdGlvbi5hbW91bnQgfHwgMzAwO1xuICAgICAgICBzY3JvbGxPcHRpb25zLmxlZnQgPSAwO1xuICAgICAgfVxuXG4gICAgICB3aW5kb3cuc2Nyb2xsQnkoc2Nyb2xsT3B0aW9ucyk7XG4gICAgICB0aGlzLnNob3dTY3JvbGxJbmRpY2F0b3IoZGlyZWN0aW9uKTtcbiAgICAgIGF3YWl0IHRoaXMud2FpdCg0MDApO1xuXG4gICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBzY3JvbGxlZDogdHJ1ZSwgZGlyZWN0aW9uLCBhbW91bnQ6IGFjdGlvbi5hbW91bnQgfHwgYWN0aW9uLmhvcml6b250YWwgfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlIGEgc2VxdWVuY2Ugb2YgbmF0dXJhbCBsYW5ndWFnZSBjb21tYW5kc1xuICAgICAqL1xuICAgIGFzeW5jIGV4ZWN1dGVOYXR1cmFsQ29tbWFuZFNlcXVlbmNlKGNvbW1hbmRUZXh0LCBvcHRpb25zID0ge30pIHtcbiAgICAgIGlmICghd2luZG93LkJpbGdlQ29ydGV4ICYmICF3aW5kb3cuX19iaWxnZV9jb3J0ZXhfbG9hZGVkKSB7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ0NvcnRleCBub3QgbG9hZGVkJyB9O1xuICAgICAgfVxuXG4gICAgICBjb25zdCBhY3Rpb25zID0gd2luZG93LkJpbGdlQ29ydGV4LnBhcnNlQ29tbWFuZFNlcXVlbmNlKGNvbW1hbmRUZXh0KTtcbiAgICAgIGlmICghYWN0aW9ucyB8fCBhY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBjb21tYW5kcyByZWNvZ25pemVkJywgY29tbWFuZFRleHQgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZXhlY3V0ZUJhdGNoKGFjdGlvbnMsIG9wdGlvbnMpO1xuICAgIH1cbiAgfVxuXG4gIHdpbmRvdy5fX2JpbGdlX3J1bnRpbWUgPSBuZXcgQmlsZ2VSdW50aW1lKCk7XG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7OztDQUdDLFdBQVc7QUFDVixNQUFJLE9BQU8sZ0JBQWlCO0FBQUEsRUFFNUIsTUFBTSxhQUFhO0FBQUEsSUFOckIsT0FNcUI7QUFBQTtBQUFBO0FBQUEsSUFDakIsY0FBYztBQUNaLFdBQUssU0FBUztBQUNkLFdBQUssU0FBUyxFQUFFLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFDM0IsV0FBSyxjQUFjO0FBQ25CLFdBQUssdUJBQXVCO0FBQzVCLFdBQUsseUJBQXlCO0FBQzlCLFdBQUssYUFBYTtBQUNsQixXQUFLLGNBQWM7QUFDbkIsV0FBSywwQkFBMEI7QUFDL0IsV0FBSyx5QkFBeUI7QUFFOUIsY0FBUSxJQUFJLGlDQUFpQztBQUM3QyxXQUFLLGVBQWU7QUFDcEIsV0FBSyxlQUFlO0FBQUEsSUFDdEI7QUFBQSxJQUVBLHdCQUF3QjtBQUN0QixVQUFJLEtBQUssd0JBQXlCO0FBQ2xDLFdBQUssMEJBQTBCO0FBQy9CLFdBQUssMEJBQTBCLEtBQUssMEJBQTBCLEtBQUs7QUFFbkUsWUFBTSxRQUFRLDZCQUFNO0FBQ2xCLGFBQUssMEJBQTBCO0FBQy9CLFlBQUk7QUFDRixlQUFLLGVBQWU7QUFBQSxRQUN0QixTQUFTLEtBQUs7QUFDWixrQkFBUSxLQUFLLCtDQUErQyxHQUFHO0FBQUEsUUFDakU7QUFBQSxNQUNGLEdBUGM7QUFVZCxVQUFJLFNBQVMsZUFBZSxXQUFXO0FBQ3JDLGlCQUFTLGlCQUFpQixvQkFBb0Is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
