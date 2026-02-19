// dom_runtime.js - Bilge Resident Agent
// Provides persistent DOM capabilities and resident automation runtime.

(function() {
  if (window.__bilge_runtime) return;

  class BilgeRuntime {
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

      const retry = () => {
        this._shadowDomInitScheduled = false;
        try {
          this.setupShadowDOM();
        } catch (err) {
          console.warn("[Bilge] DOM Runtime shadow DOM init failed:", err);
        }
      };

      // Try shortly after, plus once on DOMContentLoaded if still loading.
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', retry, { once: true });
      }
      const delayMs = Math.min(2000, 50 * this._shadowDomInitAttempts);
      setTimeout(retry, delayMs);
    }

    ensureShadowUI() {
      if (this.shadowRoot && this.highlightEl) return true;
      try {
        this.setupShadowDOM();
      } catch {}
      return Boolean(this.shadowRoot && this.highlightEl);
    }

    setupShadowDOM() {
      const hostId = 'bilge-runtime-host';
      let host = document.getElementById(hostId);
      if (!host) {
        host = document.createElement('div');
        host.id = hostId;
        host.style.cssText = 'position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';

        const mount = document.body || document.documentElement;
        if (!mount) {
          console.warn("[Bilge] DOM Runtime: document not ready; deferring shadow DOM init.");
          this.scheduleShadowDOMInit();
          return;
        }
        mount.appendChild(host);
      }

      this.shadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' });
      this._shadowDomInitAttempts = 0;
      
      let style = this.shadowRoot.querySelector('#bilge-runtime-style');
      if (!style) {
        style = document.createElement('style');
        style.id = 'bilge-runtime-style';
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

      const existingHighlight = this.shadowRoot.querySelector('.bilge-highlight-overlay');
      this.highlightEl = existingHighlight || document.createElement('div');
      if (!existingHighlight) {
        this.highlightEl.className = 'bilge-highlight-overlay';
        this.shadowRoot.appendChild(this.highlightEl);
      }
    }

    setupListeners() {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === 'EXECUTE_ACTION') {
          this.execute(msg.action, msg.options).then(res => sendResponse(res));
          return true; // Async response
        }
        if (msg.type === 'EXECUTE_BATCH') {
          this.executeBatch(msg.actions, msg.options).then(res => sendResponse(res));
          return true;
        }
        if (msg.type === 'QUERY_STATE') {
          sendResponse(this.getState());
        }
        if (msg.type === '__BILGE_PING__') {
          sendResponse({ ok: true, version: '1.0.0' });
        }
      });

      // Track cursor for smart context
      window.addEventListener('mousemove', (e) => {
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
      const type = String(rawType || '').toLowerCase().trim();
      if (type === 'click_element' || type === 'click_button') return 'click';
      if (type === 'type_text' || type === 'enter_text' || type === 'input') return 'type';
      if (type === 'fill_form' || type === 'fill_field') return 'fill';
      if (type === 'scroll_to' || type === 'scroll_page') return 'scroll';
      return type;
    }

    async execute(action, options = {}) {
      if (Array.isArray(action)) {
        return this.executeBatch(action, options);
      }

      const rawType = action.type || action.action || '';
      const type = this.normalizeActionType(rawType);
      
      console.log("[Bilge] Executing:", type, action);
      
      const humanizedDelayEnabled = options.humanizedDelayEnabled !== false;
      this.humanizedDelayBaseMs = options.humanizedDelayBaseMs || 220;
      this.humanizedDelayJitterMs = options.humanizedDelayJitterMs || 260;

      try {
        let result;
        switch (type) {
          case 'click':
            result = await this.click(action);
            break;
          case 'fill':
          case 'type':
            result = await this.type(action);
            break;
          case 'scroll':
            result = await this.scroll(action);
            break;
          case 'wait':
            await this.wait(action.duration || 1000);
            result = { success: true };
            break;
          case 'extract':
            result = await this.extract(action);
            break;
          case 'script':
          case 'js':
          case 'javascript':
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
        success: results.every(r => r.success),
        executedSteps,
        totalSteps: actions.length,
        results
      };
    }

    nextHumanizedDelayMs() {
      return this.humanizedDelayBaseMs + Math.floor(Math.random() * (this.humanizedDelayJitterMs + 1));
    }

    wait(ms) {
      return new Promise(r => setTimeout(r, ms));
    }

    async resolve(action) {
      const { selector, selectors, field, name, label, placeholder, type } = action;
      const candidates = selectors || (selector ? [selector] : []);
      const actionType = (type || '').toLowerCase();
      
      // 1. Try explicit selectors
      for (const sel of candidates) {
        try {
          const el = document.querySelector(sel);
          if (el && this.isUsable(el)) return el;
        } catch (e) {}
      }

      // 2. Heuristic fallback
      let el = this.findHeuristic(field, name, label, placeholder, candidates);
      if (el) return el;

      // 3. Probe scrolling fallback (only for interaction types)
      if (['click', 'type', 'fill', 'scroll'].includes(actionType)) {
        console.log("[Bilge] Element not found, attempting probe scrolling...");
        const probeDistance = Math.max(240, Math.round(window.innerHeight * 0.8));
        const maxProbeScrolls = 4;
        
        for (let probe = 1; probe <= maxProbeScrolls; probe += 1) {
          window.scrollBy({ top: probeDistance, behavior: 'auto' });
          await this.wait(150);
          
          // Retry selectors
          for (const sel of candidates) {
            try {
              const pEl = document.querySelector(sel);
              if (pEl && this.isUsable(pEl)) return pEl;
            } catch (e) {}
          }
          
          // Retry heuristics
          el = this.findHeuristic(field, name, label, placeholder, candidates);
          if (el) return el;
        }
        
        // Reset if still not found
        window.scrollTo({ top: 0, behavior: 'auto' });
        await this.wait(150);
      }

      return null;
    }

    isUsable(el) {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }

    findHeuristic(field, name, label, placeholder, selectors) {
      const tokens = new Set();
      [field, name, label, placeholder].forEach(t => {
        if (t) String(t).toLowerCase().split(/[^a-z0-9]+/).forEach(token => tokens.add(token));
      });

      if (tokens.size === 0) return null;

      const elements = Array.from(document.querySelectorAll('input, button, a, textarea, select, [role="button"], [role="link"]'));
      let bestMatch = null;
      let highestScore = 0;

      elements.forEach(el => {
        if (!this.isUsable(el)) return;

        let score = 0;
        const searchBody = (
          (el.innerText || '') + ' ' + 
          (el.getAttribute('aria-label') || '') + ' ' + 
          (el.getAttribute('placeholder') || '') + ' ' + 
          (el.name || '') + ' ' + 
          (el.id || '') + ' ' +
          (el.getAttribute('data-testid') || '')
        ).toLowerCase();

        tokens.forEach(token => {
          if (searchBody.includes(token)) {
            score += (token.length >= 4) ? 2 : 1;
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
        this.highlightEl.style.display = 'none';
        return;
      }
      const rect = el.getBoundingClientRect();
      this.highlightEl.style.width = `${rect.width}px`;
      this.highlightEl.style.height = `${rect.height}px`;
      this.highlightEl.style.left = `${rect.left + window.scrollX}px`;
      this.highlightEl.style.top = `${rect.top + window.scrollY}px`;
      this.highlightEl.style.display = 'block';
    }

    showClickRipple(x, y) {
      if (!this.ensureShadowUI()) return;
      const ripple = document.createElement('div');
      ripple.className = 'bilge-click-ripple';
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      this.shadowRoot.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    }

    showTypeIndicator(element, text) {
      if (!this.ensureShadowUI()) return;
      const rect = element.getBoundingClientRect();
      const indicator = document.createElement('div');
      indicator.className = 'bilge-type-indicator';
      indicator.textContent = `✓ Typed: ${text.slice(0, 20)}${text.length > 20 ? '...' : ''}`;
      indicator.style.left = `${rect.left + window.scrollX}px`;
      indicator.style.top = `${rect.top + window.scrollY}px`;
      this.shadowRoot.appendChild(indicator);
      setTimeout(() => indicator.remove(), 1500);
    }

    showScrollIndicator(direction) {
      if (!this.ensureShadowUI()) return;
      const indicator = document.createElement('div');
      indicator.className = `bilge-scroll-indicator ${direction}`;
      indicator.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12l7 7 7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      this.shadowRoot.appendChild(indicator);
      setTimeout(() => indicator.remove(), 800);
    }

    showToast(message, type = 'success') {
      if (!this.ensureShadowUI()) return;
      const existing = this.shadowRoot.querySelector('.bilge-toast');
      if (existing) existing.remove();
      const toast = document.createElement('div');
      toast.className = `bilge-toast ${type}`;
      toast.textContent = message;
      this.shadowRoot.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    }

    async click(action) {
      const el = await this.resolve(action);
      if (!el) throw new Error(`Could not resolve element for click: ${JSON.stringify(action)}`);

      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.wait(200);

      this.updateHighlight(el);
      el.focus();
      
      let value = action.value || action.text || '';
      if (action.copyFrom) {
        const sourceHint = String(action.copyFrom || '').trim();
        const sourceAction = {
          type: 'type',
          field: sourceHint,
          name: sourceHint,
          label: sourceHint,
          placeholder: sourceHint
        };
        const sourceEl = await this.resolve(sourceAction);
        if (!sourceEl) {
          throw new Error(`Could not resolve source field for copy: "${sourceHint}"`);
        }
        if (sourceEl.tagName === 'INPUT' || sourceEl.tagName === 'TEXTAREA' || sourceEl.tagName === 'SELECT') {
          value = String(sourceEl.value || '');
        } else if (sourceEl.isContentEditable) {
          value = String(sourceEl.textContent || '');
        } else {
          value = '';
        }
        if (!value) {
          throw new Error(`Source field "${sourceHint}" is empty`);
        }
      }
      
      if (el.tagName === 'SELECT') {
        el.value = value;
      } else {
        el.value = value;
      }

      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      
      this.showTypeIndicator(el, value);
      await this.wait(150);
      this.updateHighlight(null);

      this.lastElement = el;
      return { success: true };
    }

    async scroll(action) {
      const el = await this.resolve(action);
      if (el) {
        // If we matched an element, scroll it into view
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.updateHighlight(el);
        this.showScrollIndicator('down');
        await this.wait(300);
        this.updateHighlight(null);
      } else {
        // Otherwise scroll the window
        const amount = action.amount || action.duration || 500;
        const direction = amount > 0 ? 'down' : 'up';
        window.scrollBy({ top: amount, behavior: 'smooth' });
        this.showScrollIndicator(direction);
      }
      await this.wait(400);
      return { success: true };
    }

    async extract(action) {
      const el = await this.resolve(action);
      if (!el) return { success: false, error: 'Element not found' };
      
      return {
        success: true,
        data: {
          text: el.innerText || el.textContent,
          value: el.value,
          html: el.outerHTML.slice(0, 1000)
        }
      };
    }

    async runScript(action, allowAiScripts) {
      if (!allowAiScripts) throw new Error("AI Scripts are disabled by policy.");
      const code = action.code || action.script || action.js;
      if (!code) throw new Error("No script code provided.");

      try {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
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
      return String(command || '')
        .replace(/\bconfirmaton\b/gi, 'confirmation')
        .replace(/\bconfirmtion\b/gi, 'confirmation')
        .replace(/\bconfrimation\b/gi, 'confirmation')
        .replace(/\bconfimation\b/gi, 'confirmation')
        .replace(/\s+/g, ' ')
        .trim();
    }

    buildNaturalRecoveryCandidates(command) {
      const base = this.normalizeNaturalCommand(command);
      const candidates = [];
      const seen = new Set();
      const push = (value) => {
        const text = String(value || '').trim();
        if (!text) return;
        const key = text.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push(text);
      };

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
        return { error: 'Cortex not loaded', parsed: null, executable: null };
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
          error: 'Could not execute command safely after recovery attempts',
          parsed: null,
          executable: null,
          catchMode: 'auto-debug'
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
        return { success: false, error: 'Could not convert command to action', command };
      }

      // Handle scroll specially for natural scroll commands
      if (action.type === 'scroll') {
        return await this.executeNaturalScroll(action, parseResult.parsed);
      }

      // For other actions, delegate to standard execute
      return await this.execute(action, options);
    }

    /**
     * Execute natural scroll command with direction support
     */
    async executeNaturalScroll(action, parsed) {
      const direction = parsed?.direction || 'down';

      // Scroll to absolute position
      if (action.scrollTo) {
        if (action.scrollTo.top === 0) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (action.scrollTo.top === 'max') {
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        }
        this.showScrollIndicator(action.scrollTo.top === 0 ? 'up' : 'down');
        await this.wait(400);
        return { success: true, scrolled: true, direction };
      }

      // Relative scroll
      const scrollOptions = { behavior: 'smooth' };

      if (action.horizontal !== undefined) {
        // Horizontal scroll
        scrollOptions.left = action.horizontal;
        scrollOptions.top = 0;
      } else {
        // Vertical scroll
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
        return { success: false, error: 'Cortex not loaded' };
      }

      const actions = window.BilgeCortex.parseCommandSequence(commandText);
      if (!actions || actions.length === 0) {
        return { success: false, error: 'No commands recognized', commandText };
      }

      return await this.executeBatch(actions, options);
    }
  }

  window.__bilge_runtime = new BilgeRuntime();
})();
