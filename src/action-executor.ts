/**
 * Action Executor Module for Bilge AI Workspace
 * Ported from CaravanFlow Agent automation capabilities
 *
 * Core features:
 * - Batch action execution (fill, click, scroll, wait, script)
 * - Heuristic field matching with token-based scoring
 * - Field type inference (email, phone, date, zip, state, checkbox, select)
 * - Sensitive field guards (SSN, DOB, passport, etc.)
 * - Humanized delays for natural interaction
 * - Middle name checkbox auto-detection
 * - Probe scrolling to find off-screen elements
 */

// =============================================================================
// Types
// =============================================================================

export interface Action {
  type: 'fill' | 'click' | 'scroll' | 'wait' | 'script' | 'type' | 'js' | 'javascript';
  selector?: string;
  selectors?: string[];
  value?: string;
  duration?: number;
  code?: string;
  script?: string;
  js?: string;
  field?: string;
  name?: string;
  key?: string;
  label?: string;
  placeholder?: string;
  allowSensitiveFill?: boolean;
  allowSensitiveOverwrite?: boolean;
  allowContinueClick?: boolean;
  overwrite?: boolean;
  force?: boolean;
  preserveExisting?: boolean;
  noMiddleName?: boolean;
  post_wait_ms?: number;
}

export interface AutomationOptions {
  humanizedDelayEnabled?: boolean;
  humanizedDelayBaseMs?: number;
  humanizedDelayJitterMs?: number;
  allowAiScripts?: boolean;
  allowSensitiveFill?: boolean;
  allowSensitiveOverwrite?: boolean;
  suppressLifecycleLogs?: boolean;
}

export interface TraceMeta {
  runId?: string;
  commandId?: string;
}

export interface ExecutionResult {
  ok: boolean;
  cancelled?: boolean;
  executedSteps: number;
  error?: string;
}

interface ResolvedElement {
  element: Element | null;
  matchedBy: string;
  selectors: string[];
}

interface HeuristicMatch {
  element: Element;
  score: number;
  tokens: string[];
}

interface FillResult {
  ok: boolean;
  skipped: boolean;
  reason: string;
  kind: string;
}

interface SanitizedValue {
  ok: boolean;
  value?: string;
  checked?: boolean;
  reason?: string;
}

// =============================================================================
// Constants
// =============================================================================

const HUMANIZED_DELAY_BASE_DEFAULT_MS = 220;
const HUMANIZED_DELAY_JITTER_DEFAULT_MS = 260;

// =============================================================================
// Core Executor Function (to be injected into page context)
// =============================================================================

/**
 * The main executor function that runs in page context.
 * This function is serialized and injected via chrome.scripting.executeScript
 */
export async function performPageActions(
  actions: Action[],
  traceMeta: TraceMeta | null = null,
  runId = '',
  optionsInput: AutomationOptions | null = null
): Promise<ExecutionResult> {
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
  const options = optionsInput && typeof optionsInput === 'object' ? optionsInput : {};
  const logLifecycle = options.suppressLifecycleLogs !== true;
  const humanizedDelayEnabled = options.humanizedDelayEnabled === true;
  const parsedBaseDelayMs = Number(options.humanizedDelayBaseMs);
  const parsedJitterDelayMs = Number(options.humanizedDelayJitterMs);
  const humanizedDelayBaseMs = Number.isFinite(parsedBaseDelayMs)
    ? Math.min(5000, Math.max(0, Math.round(parsedBaseDelayMs)))
    : HUMANIZED_DELAY_BASE_DEFAULT_MS;
  const humanizedDelayJitterMs = Number.isFinite(parsedJitterDelayMs)
    ? Math.min(5000, Math.max(0, Math.round(parsedJitterDelayMs)))
    : HUMANIZED_DELAY_JITTER_DEFAULT_MS;
  const allowAiScripts = options.allowAiScripts === true;
  const defaultAllowSensitiveFill = options.allowSensitiveFill === true;
  const defaultAllowSensitiveOverwrite = options.allowSensitiveOverwrite === true;

  const trace = {
    runId: String(traceMeta?.runId || '').trim(),
    commandId: String(traceMeta?.commandId || '').trim()
  };

  function tracePrefixLocal(): string {
    const parts: string[] = [];
    if (trace.runId) parts.push(`run=${trace.runId}`);
    if (trace.commandId) parts.push(`cmd=${trace.commandId}`);
    return parts.length > 0 ? `[${parts.join(' ')}] ` : '';
  }

  function remoteLog(text: string, level = 'INFO'): void {
    const decorated = `${tracePrefixLocal()}${text}`;
    try {
      chrome.runtime.sendMessage({
        type: 'EXECUTION_LOG',
        payload: { text: decorated, level }
      });
    } catch (_err) {
      console.log(`[${level}] ${decorated}`);
    }
  }

  function isCancelled(): boolean {
    const key = '__bilgeCancelledRuns';
    if (!runId) return false;
    return Boolean((window as any)[key]?.[runId]);
  }

  function nextHumanizedDelayMs(): number {
    if (!humanizedDelayEnabled) return 0;
    if (humanizedDelayJitterMs <= 0) return humanizedDelayBaseMs;
    return humanizedDelayBaseMs + Math.floor(Math.random() * (humanizedDelayJitterMs + 1));
  }

  // ---------------------------------------------------------------------------
  // Text normalization and tokenization
  // ---------------------------------------------------------------------------

  function normalizeText(value: string | undefined | null): string {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function tokenize(value: string | undefined | null): string[] {
    return String(value || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  // ---------------------------------------------------------------------------
  // Selector hint extraction
  // ---------------------------------------------------------------------------

  function extractSelectorHints(selector: string): { hints: string[]; preferredTag: string } {
    const hints: string[] = [];
    const attrMatches = selector.matchAll(
      /\[\s*(name|id|placeholder|aria-label|data-testid|data-test-id|data-qa)\s*(?:[*^$|~]?=)\s*(?:['"]([^'"]+)['"]|([^\]\s]+))\s*\]/gi
    );
    for (const match of attrMatches) {
      hints.push(match[2] || match[3] || '');
    }
    const idMatches = selector.matchAll(/#([A-Za-z0-9_-]+)/g);
    for (const match of idMatches) {
      hints.push(String(match[1] || '').replace(/[_-]+/g, ' '));
    }
    const classMatches = selector.matchAll(/\.([A-Za-z0-9_-]+)/g);
    for (const match of classMatches) {
      hints.push(String(match[1] || '').replace(/[_-]+/g, ' '));
    }
    const tagMatch = selector.match(/^\s*([a-z]+)/i);
    const preferredTag = tagMatch ? String(tagMatch[1]).toLowerCase() : '';
    return { hints, preferredTag };
  }

  function buildSelectorCandidates(action: Action): string[] {
    const raw: (string | undefined)[] = [];
    if (Array.isArray(action.selectors)) raw.push(...action.selectors);
    raw.push(action.selector);
    const seen = new Set<string>();
    const selectors: string[] = [];
    for (const item of raw) {
      const selector = String(item || '').trim();
      if (!selector || seen.has(selector)) continue;
      seen.add(selector);
      selectors.push(selector);
    }
    return selectors;
  }

  // ---------------------------------------------------------------------------
  // Label finding utilities
  // ---------------------------------------------------------------------------

  function findLabelText(element: Element): string {
    if (!(element instanceof Element)) return '';
    const parts: string[] = [];
    const id = element.getAttribute('id');
    if (id) {
      const labelFor = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (labelFor?.textContent) parts.push(labelFor.textContent);
    }
    const closestLabel = element.closest('label');
    if (closestLabel?.textContent) parts.push(closestLabel.textContent);
    const parentLabel = element.parentElement?.querySelector?.('label');
    if (parentLabel?.textContent) parts.push(parentLabel.textContent);
    return parts.join(' ');
  }

  function elementSearchText(element: Element): string {
    const attrKeys = [
      'name',
      'id',
      'placeholder',
      'aria-label',
      'autocomplete',
      'data-testid',
      'data-test-id',
      'data-qa',
      'title'
    ];
    const values: string[] = [];
    values.push(element.tagName.toLowerCase());
    for (const key of attrKeys) {
      const v = element.getAttribute?.(key);
      if (v) values.push(v);
    }
    values.push(findLabelText(element));
    const role = element.getAttribute?.('role');
    if (role) values.push(role);
    return normalizeText(values.join(' '));
  }

  function isUsableField(element: Element): boolean {
    if (!(element instanceof Element)) return false;
    const disabled = element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    if (disabled) return false;
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (rect.width < 2 || rect.height < 2) return false;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Heuristic token collection
  // ---------------------------------------------------------------------------

  function collectHintTokens(action: Action, selectors: string[]): { tokens: string[]; preferredTag: string } {
    const tokenSet = new Set<string>();
    const rawHints: (string | undefined)[] = [action.field, action.name, action.key, action.label, action.placeholder];
    let preferredTag = '';

    for (const selector of selectors) {
      const parsed = extractSelectorHints(selector);
      rawHints.push(...parsed.hints);
      if (!preferredTag && parsed.preferredTag) preferredTag = parsed.preferredTag;
    }

    for (const hint of rawHints) {
      for (const token of tokenize(hint)) tokenSet.add(token);
    }

    // Expand synonyms
    const expanded = new Set(tokenSet);
    if (expanded.has('first')) expanded.add('given');
    if (expanded.has('last')) {
      expanded.add('family');
      expanded.add('surname');
    }
    if (expanded.has('phone')) expanded.add('tel');
    if (expanded.has('mail')) expanded.add('email');
    if (expanded.has('email')) expanded.add('mail');

    return {
      tokens: Array.from(expanded),
      preferredTag
    };
  }

  // ---------------------------------------------------------------------------
  // Heuristic element resolution
  // ---------------------------------------------------------------------------

  function resolveHeuristicElement(action: Action, selectors: string[]): HeuristicMatch | null {
    const { tokens, preferredTag } = collectHintTokens(action, selectors);
    if (!tokens.length) return null;

    const candidates = Array.from(
      document.querySelectorAll('input, textarea, select, [contenteditable="true"], [role="textbox"]')
    ).filter(isUsableField);

    const phrase = normalizeText(tokens.join(''));
    let best: HeuristicMatch | null = null;

    for (const element of candidates) {
      const haystack = elementSearchText(element);
      if (!haystack) continue;
      let score = 0;

      for (const token of tokens) {
        const normalizedToken = normalizeText(token);
        if (!normalizedToken) continue;
        if (haystack.includes(normalizedToken)) {
          score += normalizedToken.length >= 4 ? 2 : 1;
        }
      }

      if (phrase && haystack.includes(phrase)) score += 3;
      if (preferredTag && element.tagName.toLowerCase() === preferredTag) score += 1;

      if (!best || score > best.score) {
        best = { element, score, tokens };
      }
    }

    if (!best || best.score <= 0) return null;
    return best;
  }

  // ---------------------------------------------------------------------------
  // Element resolution with fallbacks
  // ---------------------------------------------------------------------------

  function resolveActionElement(action: Action, stepIndex: number, totalSteps: number, type: string): ResolvedElement {
    const selectors = buildSelectorCandidates(action);
    for (let idx = 0; idx < selectors.length; idx += 1) {
      const selector = selectors[idx];
      remoteLog(`Step ${stepIndex}/${totalSteps}: selector try ${idx + 1}/${selectors.length}: ${selector}`, 'INFO');
      try {
        const element = document.querySelector(selector);
        if (element) {
          return {
            element,
            matchedBy: `selector:${selector}`,
            selectors
          };
        }
      } catch (err: any) {
        remoteLog(`Step ${stepIndex}/${totalSteps}: invalid selector ${selector} (${err.message})`, 'WARN');
      }
    }

    // Fallback to heuristic matching for fill/type/click/scroll
    if (type === 'fill' || type === 'type' || type === 'click' || type === 'scroll') {
      const heuristic = resolveHeuristicElement(action, selectors);
      if (heuristic?.element) {
        const tokenText = heuristic.tokens.join(',');
        remoteLog(
          `Step ${stepIndex}/${totalSteps}: heuristic matched field (score=${heuristic.score}, tokens=${tokenText})`,
          'INFO'
        );
        return {
          element: heuristic.element,
          matchedBy: `heuristic:${tokenText}`,
          selectors
        };
      }
    }

    return {
      element: null,
      matchedBy: '',
      selectors
    };
  }

  // ---------------------------------------------------------------------------
  // Field value reading/inference
  // ---------------------------------------------------------------------------

  function readElementValue(element: Element | null): string {
    if (!element) return '';
    if ((element as HTMLElement).isContentEditable) return String((element as HTMLElement).textContent || '');
    if ('value' in element) return String((element as HTMLInputElement).value ?? '');
    return String(element.getAttribute?.('value') || '');
  }

  function inferFillFieldKind(element: Element | null, action: Action): string {
    const tag = String(element?.tagName || '').toLowerCase();
    const type = String(element?.getAttribute?.('type') || '').toLowerCase();
    const hintText = [
      action?.field,
      action?.name,
      action?.key,
      action?.label,
      action?.placeholder,
      element?.getAttribute?.('name'),
      element?.getAttribute?.('id'),
      element?.getAttribute?.('aria-label'),
      element?.getAttribute?.('placeholder'),
      findLabelText(element as Element)
    ].join(' ').toLowerCase();

    if (type === 'email' || /\bemail\b/.test(hintText)) return 'email';
    if (type === 'tel' || /\b(phone|tel|mobile)\b/.test(hintText)) return 'phone';
    if (/\b(zip|postal)\b/.test(hintText)) return 'zip';
    if (type === 'date' || /\b(dob|date|from date|to date|start date|end date)\b/.test(hintText)) return 'date';
    if (/\bstate\b/.test(hintText)) return 'state';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (tag === 'select') return 'select';
    return 'text';
  }

  function normalizeComparableValue(kind: string, value: string | undefined | null): string {
    const text = String(value ?? '').trim();
    if (!text) return '';
    if (kind === 'email') return text.toLowerCase();
    if (kind === 'phone') return text.replace(/\D+/g, '');
    if (kind === 'zip') return text.replace(/\D+/g, '');
    if (kind === 'state') return text.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
    if (kind === 'date') return text.replace(/\s+/g, '');
    return text.toLowerCase();
  }

  // ---------------------------------------------------------------------------
  // Value sanitization
  // ---------------------------------------------------------------------------

  function sanitizeFillValue(kind: string, rawValue: string | undefined | null, element: Element): SanitizedValue {
    const text = String(rawValue ?? '').trim();
    const inputType = String(element?.getAttribute?.('type') || '').toLowerCase();

    if (kind === 'email') {
      const email = text.toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, reason: `invalid email value "${text}"` };
      }
      return { ok: true, value: email };
    }

    if (kind === 'phone') {
      const digits = text.replace(/\D+/g, '');
      if (digits.length < 10) return { ok: false, reason: `invalid phone value "${text}"` };
      const normalized = digits.length >= 10 ? digits.slice(-10) : digits;
      const formatted = normalized.length === 10
        ? `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`
        : normalized;
      return { ok: true, value: formatted };
    }

    if (kind === 'zip') {
      const digits = text.replace(/\D+/g, '');
      if (digits.length < 5) return { ok: false, reason: `invalid zip value "${text}"` };
      return { ok: true, value: digits.slice(0, 5) };
    }

    if (kind === 'state') {
      const letters = text.toUpperCase().replace(/[^A-Z]/g, '');
      if (letters.length < 2) return { ok: false, reason: `invalid state value "${text}"` };
      return { ok: true, value: letters.slice(0, 2) };
    }

    if (kind === 'date') {
      const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const mdyMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (inputType === 'date') {
        if (isoMatch) return { ok: true, value: text };
        if (mdyMatch) {
          const mm = mdyMatch[1].padStart(2, '0');
          const dd = mdyMatch[2].padStart(2, '0');
          const yyyy = mdyMatch[3];
          return { ok: true, value: `${yyyy}-${mm}-${dd}` };
        }
      } else {
        if (mdyMatch) {
          const mm = mdyMatch[1].padStart(2, '0');
          const dd = mdyMatch[2].padStart(2, '0');
          const yyyy = mdyMatch[3];
          return { ok: true, value: `${mm}/${dd}/${yyyy}` };
        }
        if (isoMatch) {
          return { ok: true, value: `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}` };
        }
      }
      if (!text) return { ok: false, reason: 'empty date value' };
      return { ok: true, value: text };
    }

    if (kind === 'checkbox') {
      const lowered = text.toLowerCase();
      const isChecked = lowered === 'true' || lowered === '1' || lowered === 'yes' || lowered === 'checked' || lowered === 'on';
      return { ok: true, checked: isChecked };
    }

    if (kind === 'radio') {
      if (!text) return { ok: false, reason: 'empty radio value' };
      return { ok: true, value: text };
    }

    if (kind === 'select') {
      return { ok: true, value: text };
    }

    if (!text) return { ok: false, reason: 'empty fill value' };
    return { ok: true, value: text };
  }

  // ---------------------------------------------------------------------------
  // Sensitive field detection
  // ---------------------------------------------------------------------------

  function fieldHintText(element: Element | null, action: Action): string {
    return [
      action?.field,
      action?.name,
      action?.key,
      action?.label,
      action?.placeholder,
      element?.getAttribute?.('name'),
      element?.getAttribute?.('id'),
      element?.getAttribute?.('aria-label'),
      element?.getAttribute?.('placeholder'),
      findLabelText(element as Element)
    ]
      .join(' ')
      .toLowerCase();
  }

  function isSensitiveFieldTarget(element: Element | null, action: Action): boolean {
    const hint = fieldHintText(element, action);
    if (!hint) return false;
    return /\b(ssn|social security|passport|driver'?s?\s*license|license number|maiden name|uscis|alien number|a-number|tax id|tin|itin|dob|date of birth)\b/.test(hint)
      || /\bdl\s*#?\b/.test(hint);
  }

  // ---------------------------------------------------------------------------
  // Middle name checkbox detection
  // ---------------------------------------------------------------------------

  function isMiddleNameTarget(element: Element | null, action: Action): boolean {
    const hint = fieldHintText(element, action);
    if (!hint) return false;
    if (/\bmiddle[_\s-]?name\b/.test(hint)) return true;
    return /\bmiddle\b/.test(hint) && /\bname\b/.test(hint);
  }

  function checkboxLabelText(checkbox: Element | null): string {
    const parts: string[] = [];
    const id = checkbox?.getAttribute?.('id');
    const owner = (checkbox as any)?.ownerDocument || document;
    if (id) {
      const labelFor = owner.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (labelFor?.textContent) parts.push(labelFor.textContent);
    }
    const closestLabel = checkbox?.closest?.('label');
    if (closestLabel?.textContent) parts.push(closestLabel.textContent);
    if (checkbox?.parentElement?.textContent) parts.push(checkbox.parentElement.textContent);
    parts.push(
      checkbox?.getAttribute?.('aria-label') || '',
      checkbox?.getAttribute?.('title') || '',
      checkbox?.getAttribute?.('name') || '',
      checkbox?.getAttribute?.('id') || ''
    );
    return parts.join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function findNearbyNoMiddleNameCheckbox(element: Element): HTMLInputElement | null {
    if (!element) return null;
    const scopes: Element[] = [];
    let cursor: Element | null = element;
    for (let depth = 0; depth < 6 && cursor; depth += 1) {
      if (cursor instanceof Element) scopes.push(cursor);
      cursor = cursor.parentElement;
    }
    const doc = (element as any).ownerDocument || document;
    if (doc?.body) scopes.push(doc.body);

    const seen = new Set<Element>();
    let best: { checkbox: HTMLInputElement; score: number } | null = null;
    const noMiddlePattern = /(no|none|without|n\/a|doesn'?t have|do not have).{0,24}middle|middle.{0,24}(no|none|n\/a)/i;

    for (let scopeIndex = 0; scopeIndex < scopes.length; scopeIndex += 1) {
      const scope = scopes[scopeIndex];
      let checkboxes: Element[] = [];
      try {
        checkboxes = Array.from(scope.querySelectorAll('input[type="checkbox"]'));
      } catch (_err) {
        checkboxes = [];
      }
      for (const checkbox of checkboxes) {
        if (!checkbox || seen.has(checkbox)) continue;
        seen.add(checkbox);
        const text = checkboxLabelText(checkbox);
        if (!text) continue;
        let score = 0;
        if (noMiddlePattern.test(text)) score += 6;
        if (text.includes('middle') && text.includes('name')) score += 2;
        if (/\bno[_\s-]?middle\b/.test(text)) score += 3;
        score += Math.max(0, 3 - scopeIndex);
        if (!best || score > best.score) best = { checkbox: checkbox as HTMLInputElement, score };
      }
    }

    if (!best || best.score < 4) return null;
    return best.checkbox;
  }

  // ---------------------------------------------------------------------------
  // Apply fill with guards
  // ---------------------------------------------------------------------------

  function applyFill(element: Element, value: string | undefined, action: Action): FillResult {
    const fieldKind = inferFillFieldKind(element, action);
    const preserveExisting = action?.preserveExisting !== false;
    const overwrite = action?.overwrite === true || action?.force === true;
    const sensitiveTarget = isSensitiveFieldTarget(element, action);
    const allowSensitiveFill = action?.allowSensitiveFill === true
      || (action?.allowSensitiveFill === undefined && defaultAllowSensitiveFill);
    const allowSensitiveOverwrite = action?.allowSensitiveOverwrite === true
      || (action?.allowSensitiveOverwrite === undefined && defaultAllowSensitiveOverwrite);
    const existingRaw = readElementValue(element);
    const existingComparableRaw = normalizeComparableValue(fieldKind, existingRaw);

    if (sensitiveTarget) {
      if (existingComparableRaw && !allowSensitiveOverwrite) {
        return {
          ok: true,
          skipped: true,
          reason: 'sensitive field locked (existing value preserved)',
          kind: fieldKind
        };
      }
      if (!existingComparableRaw && !allowSensitiveFill) {
        return {
          ok: true,
          skipped: true,
          reason: 'sensitive field fill blocked',
          kind: fieldKind
        };
      }
    }

    // Handle middle name special case
    if (isMiddleNameTarget(element, action)) {
      const raw = String(value ?? '').trim().toLowerCase();
      const noMiddleRequested = action?.noMiddleName === true
        || raw === ''
        || raw === 'na'
        || raw === 'n/a'
        || raw === 'none'
        || raw === 'no middle name';
      if (noMiddleRequested) {
        const noMiddleCheckbox = findNearbyNoMiddleNameCheckbox(element);
        if (noMiddleCheckbox) {
          const alreadyChecked = Boolean(noMiddleCheckbox.checked);
          if (!alreadyChecked) {
            noMiddleCheckbox.focus();
            noMiddleCheckbox.click();
            noMiddleCheckbox.dispatchEvent(new Event('input', { bubbles: true }));
            noMiddleCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
          }
          if ('value' in element) {
            (element as HTMLInputElement).value = '';
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return {
            ok: true,
            skipped: alreadyChecked,
            reason: alreadyChecked ? 'no-middle-name checkbox already checked' : 'checked no-middle-name checkbox',
            kind: fieldKind
          };
        }
      }
    }

    const sanitized = sanitizeFillValue(fieldKind, value, element);
    if (!sanitized.ok) {
      return { ok: false, skipped: true, reason: sanitized.reason || 'validation failed', kind: fieldKind };
    }
    const text = String(sanitized.value ?? '');
    const tag = element.tagName.toLowerCase();
    const normalized = text.trim().toLowerCase();
    const nextComparable = normalizeComparableValue(fieldKind, text);
    const existingComparable = existingComparableRaw;

    if (existingComparable && nextComparable && existingComparable === nextComparable) {
      return { ok: true, skipped: true, reason: 'already set', kind: fieldKind };
    }
    if (preserveExisting && !overwrite && existingComparable && nextComparable && existingComparable !== nextComparable) {
      return { ok: true, skipped: true, reason: 'existing non-empty value preserved', kind: fieldKind };
    }

    function dispatchInputLikeEvents(target: Element): void {
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));
      target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Tab' }));
      target.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    }

    function setElementValue(target: HTMLInputElement | HTMLTextAreaElement, nextValue: string): void {
      if (!target) return;
      const proto = Object.getPrototypeOf(target);
      const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
      if (descriptor && typeof descriptor.set === 'function') {
        descriptor.set.call(target, nextValue);
      } else {
        target.value = nextValue;
      }
    }

    if (fieldKind === 'checkbox' && 'checked' in element) {
      (element as HTMLInputElement).focus();
      (element as HTMLInputElement).checked = Boolean(sanitized.checked);
    } else if ((element as HTMLElement).isContentEditable) {
      (element as HTMLElement).focus();
      (element as HTMLElement).textContent = text;
    } else if (tag === 'select') {
      const selectEl = element as HTMLSelectElement;
      const options = Array.from(selectEl.options || []);
      const match = options.find(
        (opt) => {
          const valueLower = String(opt.value || '').trim().toLowerCase();
          const textLower = String(opt.textContent || '').trim().toLowerCase();
          return (
            valueLower === normalized
            || textLower === normalized
            || (normalized && valueLower.includes(normalized))
            || (normalized && textLower.includes(normalized))
          );
        }
      );
      selectEl.value = match ? match.value : text;
    } else if ('value' in element) {
      (element as HTMLInputElement).focus();
      setElementValue(element as HTMLInputElement, text);
    } else {
      element.setAttribute('value', text);
    }

    dispatchInputLikeEvents(element);
    return { ok: true, skipped: false, reason: '', kind: fieldKind };
  }

  // ---------------------------------------------------------------------------
  // Main execution loop
  // ---------------------------------------------------------------------------

  if (logLifecycle) {
    remoteLog('Batch action execution started.', 'INFO');
  }

  const list = Array.isArray(actions) ? actions : [];
  let executedSteps = 0;

  for (let i = 0; i < list.length; i++) {
    if (isCancelled()) {
      remoteLog('Execution cancelled by user request.', 'WARN');
      return { ok: false, cancelled: true, executedSteps };
    }

    const action = list[i] || {};
    const type = String(action.type || '').toLowerCase();

    try {
      // Handle wait action
      if (type === 'wait') {
        const duration = Number(action.duration || 1000);
        remoteLog(`Step ${i + 1}/${list.length}: wait ${duration}ms`, 'INFO');
        await sleep(duration);
        executedSteps += 1;
        continue;
      }

      // Handle script action
      if (type === 'script' || type === 'js' || type === 'javascript') {
        if (!allowAiScripts) {
          remoteLog(
            `Step ${i + 1}/${list.length}: blocked script action (allowAiScripts is false).`,
            'WARN'
          );
          continue;
        }

        const code = String(action.code ?? action.script ?? action.js ?? '').trim();
        if (!code) {
          remoteLog(`Step ${i + 1}/${list.length}: skipped script action (empty code).`, 'WARN');
          continue;
        }
        if (code.length > 12000) {
          remoteLog(`Step ${i + 1}/${list.length}: skipped script action (code too large).`, 'WARN');
          continue;
        }

        remoteLog(`Step ${i + 1}/${list.length}: script action`, 'INFO');
        try {
          const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
          const fn = new AsyncFunction('"use strict";\n' + code);
          const resultValue = await fn();

          let preview = '';
          try {
            preview = typeof resultValue === 'string' ? resultValue : JSON.stringify(resultValue);
          } catch (_err) {
            preview = String(resultValue);
          }
          preview = String(preview || '').replace(/\s+/g, ' ').trim();
          if (preview) {
            remoteLog(`Step ${i + 1}/${list.length}: script result: ${preview.slice(0, 180)}`, 'INFO');
          }
        } catch (err: any) {
          remoteLog(`Step ${i + 1}/${list.length}: script error: ${err.message}`, 'ERROR');
        }

        const postWaitMs = Math.max(0, Number(action.post_wait_ms || 300));
        await sleep(postWaitMs);
        const humanizedDelayMs = nextHumanizedDelayMs();
        if (humanizedDelayMs > 0 && i < list.length - 1) {
          remoteLog(`Step ${i + 1}/${list.length}: natural delay ${humanizedDelayMs}ms`, 'INFO');
          await sleep(humanizedDelayMs);
        }
        executedSteps += 1;
        continue;
      }

      // Resolve element with probe scrolling for fill/type/click/scroll
      let resolved = resolveActionElement(action, i + 1, list.length, type);
      let element = resolved.element;

      if (!element && (type === 'fill' || type === 'type' || type === 'click' || type === 'scroll')) {
        const probeDistance = Math.max(240, Math.round(window.innerHeight * 0.8));
        const maxProbeScrolls = 4;
        for (let probe = 1; probe <= maxProbeScrolls && !element; probe += 1) {
          window.scrollBy({ top: probeDistance, behavior: 'auto' });
          await sleep(120);
          resolved = resolveActionElement(action, i + 1, list.length, type);
          element = resolved.element;
          if (element) {
            remoteLog(`Step ${i + 1}/${list.length}: matched after probe scroll ${probe}/${maxProbeScrolls}`, 'INFO');
            break;
          }
        }
        if (!element) {
          window.scrollTo({ top: 0, behavior: 'auto' });
          await sleep(120);
          resolved = resolveActionElement(action, i + 1, list.length, type);
          element = resolved.element;
          if (element) {
            remoteLog(`Step ${i + 1}/${list.length}: matched after reset-to-top probe`, 'INFO');
          }
        }
      }

      if (!element) {
        const tried = resolved.selectors?.length ? resolved.selectors.join(' | ') : '(none)';
        remoteLog(`Step ${i + 1} failed: Could not resolve target. selectors tried: ${tried}`, 'WARN');
        continue;
      }

      // Visual highlight
      const htmlElement = element as HTMLElement;
      const originalStyle = {
        outline: htmlElement.style.outline,
        backgroundColor: htmlElement.style.backgroundColor
      };

      htmlElement.style.outline = '3px solid #2563eb';
      htmlElement.style.backgroundColor = 'rgba(37, 99, 235, 0.1)';
      remoteLog(`Step ${i + 1}/${list.length}: ${type} via ${resolved.matchedBy}`, 'INFO');

      // Execute action by type
      if (type === 'fill' || type === 'type') {
        try {
          htmlElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          remoteLog(`Step ${i + 1}/${list.length}: auto-scroll to active input`, 'INFO');
        } catch (_err) {
          // ignore scroll failures for non-scrollable containers
        }
        const fillResult = applyFill(element, action.value, action);
        if (!fillResult.ok || fillResult.skipped) {
          const status = fillResult.ok ? 'INFO' : 'WARN';
          const reason = fillResult.reason || 'fill skipped';
          remoteLog(`Step ${i + 1}/${list.length}: fill guard (${fillResult.kind || 'text'}) -> ${reason}`, status);
        }
      } else if (type === 'click') {
        htmlElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        htmlElement.click();
      } else if (type === 'scroll') {
        htmlElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        remoteLog(`Step ${i + 1} skipped: Unsupported action type ${type}`, 'WARN');
      }

      // Post-action delays
      const postWaitMs = Math.max(0, Number(action.post_wait_ms || 300));
      await sleep(postWaitMs);
      const humanizedDelayMs = nextHumanizedDelayMs();
      if (humanizedDelayMs > 0 && i < list.length - 1) {
        remoteLog(`Step ${i + 1}/${list.length}: natural delay ${humanizedDelayMs}ms`, 'INFO');
        await sleep(humanizedDelayMs);
      }

      // Restore style
      htmlElement.style.outline = originalStyle.outline;
      htmlElement.style.backgroundColor = originalStyle.backgroundColor;
      executedSteps += 1;
    } catch (err: any) {
      remoteLog(`Step ${i + 1} execution error: ${err.message}`, 'ERROR');
    }
  }

  if (logLifecycle) {
    remoteLog('Batch action execution finished.', 'INFO');
  }
  return { ok: true, cancelled: false, executedSteps };
}

// =============================================================================
// Standalone heuristic matcher for content script use
// =============================================================================

/**
 * Exported heuristic element matcher for use in content.js
 * This is a simplified version that can be called synchronously
 */
export function findElementByHeuristic(
  field?: string,
  name?: string,
  label?: string,
  placeholder?: string,
  selectors?: string[]
): Element | null {
  const action: Partial<Action> = { field, name, label, placeholder };

  function normalizeText(value: string | undefined | null): string {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function tokenize(value: string | undefined | null): string[] {
    return String(value || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function extractSelectorHints(selector: string): { hints: string[]; preferredTag: string } {
    const hints: string[] = [];
    const attrMatches = selector.matchAll(
      /\[\s*(name|id|placeholder|aria-label|data-testid|data-test-id|data-qa)\s*(?:[*^$|~]?=)\s*(?:['"]([^'"]+)['"]|([^\]\s]+))\s*\]/gi
    );
    for (const match of attrMatches) {
      hints.push(match[2] || match[3] || '');
    }
    const idMatches = selector.matchAll(/#([A-Za-z0-9_-]+)/g);
    for (const match of idMatches) {
      hints.push(String(match[1] || '').replace(/[_-]+/g, ' '));
    }
    const classMatches = selector.matchAll(/\.([A-Za-z0-9_-]+)/g);
    for (const match of classMatches) {
      hints.push(String(match[1] || '').replace(/[_-]+/g, ' '));
    }
    const tagMatch = selector.match(/^\s*([a-z]+)/i);
    const preferredTag = tagMatch ? String(tagMatch[1]).toLowerCase() : '';
    return { hints, preferredTag };
  }

  function findLabelText(element: Element): string {
    if (!(element instanceof Element)) return '';
    const parts: string[] = [];
    const id = element.getAttribute('id');
    if (id) {
      const labelFor = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (labelFor?.textContent) parts.push(labelFor.textContent);
    }
    const closestLabel = element.closest('label');
    if (closestLabel?.textContent) parts.push(closestLabel.textContent);
    const parentLabel = element.parentElement?.querySelector?.('label');
    if (parentLabel?.textContent) parts.push(parentLabel.textContent);
    return parts.join(' ');
  }

  function elementSearchText(element: Element): string {
    const attrKeys = ['name', 'id', 'placeholder', 'aria-label', 'autocomplete', 'data-testid', 'data-test-id', 'data-qa', 'title'];
    const values: string[] = [];
    values.push(element.tagName.toLowerCase());
    for (const key of attrKeys) {
      const v = element.getAttribute?.(key);
      if (v) values.push(v);
    }
    values.push(findLabelText(element));
    const role = element.getAttribute?.('role');
    if (role) values.push(role);
    return normalizeText(values.join(' '));
  }

  function isUsableField(element: Element): boolean {
    if (!(element instanceof Element)) return false;
    const disabled = element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    if (disabled) return false;
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (rect.width < 2 || rect.height < 2) return false;
    return true;
  }

  // Collect hint tokens
  const tokenSet = new Set<string>();
  const rawHints: (string | undefined)[] = [field, name, label, placeholder];
  let preferredTag = '';

  for (const selector of selectors || []) {
    const parsed = extractSelectorHints(selector);
    rawHints.push(...parsed.hints);
    if (!preferredTag && parsed.preferredTag) preferredTag = parsed.preferredTag;
  }

  for (const hint of rawHints) {
    for (const token of tokenize(hint)) tokenSet.add(token);
  }

  // Expand synonyms
  const expanded = new Set(tokenSet);
  if (expanded.has('first')) expanded.add('given');
  if (expanded.has('last')) {
    expanded.add('family');
    expanded.add('surname');
  }
  if (expanded.has('phone')) expanded.add('tel');
  if (expanded.has('mail')) expanded.add('email');
  if (expanded.has('email')) expanded.add('mail');

  const tokens = Array.from(expanded);
  if (!tokens.length) return null;

  const candidates = Array.from(
    document.querySelectorAll('input, textarea, select, [contenteditable="true"], [role="textbox"]')
  ).filter(isUsableField);

  const phrase = normalizeText(tokens.join(''));
  let best: { element: Element; score: number } | null = null;

  for (const element of candidates) {
    const haystack = elementSearchText(element);
    if (!haystack) continue;
    let score = 0;

    for (const token of tokens) {
      const normalizedToken = normalizeText(token);
      if (!normalizedToken) continue;
      if (haystack.includes(normalizedToken)) {
        score += normalizedToken.length >= 4 ? 2 : 1;
      }
    }

    if (phrase && haystack.includes(phrase)) score += 3;
    if (preferredTag && element.tagName.toLowerCase() === preferredTag) score += 1;

    if (!best || score > best.score) {
      best = { element, score };
    }
  }

  if (!best || best.score <= 0) return null;
  return best.element;
}

// =============================================================================
// Export function string for injection
// =============================================================================

/**
 * Returns the performPageActions function as a string for injection
 */
export function getPerformPageActionsSource(): string {
  return performPageActions.toString();
}
