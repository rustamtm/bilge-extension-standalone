/**
 * Cortex v3 - Unified AI Router & Natural Language Parser for Bilge AI
 *
 * Provides:
 * 1. Natural Language Command Parsing - "scroll up", "click on X", etc.
 * 2. Intent Analysis - Categorizes goals into action types
 * 3. Strategy Selection - Chooses optimal brain provider/model
 * 4. Context Enhancement - Enriches goals with relevant context
 * 5. Multi-step Planning - Breaks complex goals into steps
 * 6. Smart Retry - Adjusts strategy on failures
 */

const CORTEX_VERSION = '3.0.1';

// =============================================================================
// INTENT CATEGORIES (AI Routing)
// =============================================================================

const INTENT_CATEGORIES = {
  form_fill: {
    description: 'Filling out forms, entering data',
    keywords: ['fill', 'enter', 'input', 'type', 'submit', 'form', 'field', 'data'],
    strategy: 'Execute form actions systematically',
    preferredProvider: 'deepseek',
    preferredModel: 'deepseek-chat',
    complexity: 'simple'
  },
  ssn_confirmation: {
    description: 'Auto-filling SSN confirmation fields by mirroring SSN',
    keywords: ['ssn', 'social security', 'confirm', 'confirmation'],
    strategy: 'Copy the value from ssn field to ssn_confirmation field',
    preferredProvider: 'deepseek',
    preferredModel: 'deepseek-chat',
    complexity: 'simple'
  },
  navigation: {
    description: 'Navigating between pages, clicking links',
    keywords: ['click', 'navigate', 'go to', 'open', 'visit', 'link', 'button', 'menu'],
    strategy: 'Navigate to target with minimal clicks',
    preferredProvider: 'deepseek',
    preferredModel: 'deepseek-chat',
    complexity: 'simple'
  },
  extraction: {
    description: 'Reading, extracting, or copying information',
    keywords: ['read', 'extract', 'copy', 'get', 'find', 'locate', 'scan', 'identify', 'list'],
    strategy: 'Identify and extract target information',
    preferredProvider: 'deepseek',
    preferredModel: 'deepseek-chat',
    complexity: 'moderate'
  },
  verification: {
    description: 'Verifying, checking, or validating state',
    keywords: ['verify', 'check', 'confirm', 'validate', 'ensure', 'assert', 'test'],
    strategy: 'Verify conditions and report status',
    preferredProvider: 'deepseek',
    preferredModel: 'deepseek-chat',
    complexity: 'moderate'
  },
  complex_workflow: {
    description: 'Multi-step workflows, complex automation',
    keywords: ['workflow', 'process', 'sequence', 'automate', 'complete', 'finish', 'all'],
    strategy: 'Break into steps and execute sequentially',
    preferredProvider: 'deepseek',
    preferredModel: 'deepseek-reasoner',
    complexity: 'complex'
  },
  reasoning: {
    description: 'Analysis, decision-making, problem-solving',
    keywords: ['analyze', 'decide', 'figure out', 'determine', 'understand', 'solve', 'plan'],
    strategy: 'Analyze situation and determine best approach',
    preferredProvider: 'deepseek',
    preferredModel: 'deepseek-reasoner',
    complexity: 'complex'
  },
  search: {
    description: 'Searching for elements or information on page',
    keywords: ['search', 'find', 'look for', 'locate', 'where is', 'show me'],
    strategy: 'Scan page to locate target elements',
    preferredProvider: 'deepseek',
    preferredModel: 'deepseek-chat',
    complexity: 'simple'
  }
};

const MODEL_CAPABILITIES = {
  'gemini-2.0-flash': {
    vision: true, speed: 'fast', reasoning: 'moderate', cost: 'low',
    bestFor: ['form_fill', 'navigation', 'extraction', 'search']
  },
  'gpt-4o': {
    vision: true, speed: 'moderate', reasoning: 'high', cost: 'high',
    bestFor: ['complex_workflow', 'reasoning', 'verification']
  },
  'deepseek-chat': {
    vision: true, speed: 'fast', reasoning: 'moderate', cost: 'low',
    bestFor: ['form_fill', 'navigation', 'verification']
  },
  'deepseek-reasoner': {
    vision: true, speed: 'slow', reasoning: 'very_high', cost: 'moderate',
    bestFor: ['complex_workflow', 'reasoning']
  }
};

// =============================================================================
// NATURAL LANGUAGE COMMAND PATTERNS
// =============================================================================

const SCROLL_PATTERNS = {
  up: /\b(scroll\s*(up|upward|upwards)|page\s*up)\b/i,
  down: /\b(scroll\s*(down|downward|downwards)|page\s*down)\b/i,
  top: /\b(scroll\s*(to\s*)?(the\s*)?(top|beginning|start)|go\s*(to\s*)?(the\s*)?(top|beginning|start))\b/i,
  bottom: /\b(scroll\s*(to\s*)?(the\s*)?(bottom|end)|go\s*(to\s*)?(the\s*)?(bottom|end))\b/i,
  left: /\b(scroll\s*(left|leftward|leftwards))\b/i,
  right: /\b(scroll\s*(right|rightward|rightwards))\b/i,
};

const CLICK_PATTERNS = {
  // "click on X", "click X", "click the X", "press X", "tap X"
  target: /\b(?:click|press|tap|select|hit)\s*(?:on\s+)?(?:the\s+)?["']?(.+?)["']?\s*(?:button|link|element)?$/i,
  // "click this", "click that", "click here"
  deictic: /\b(?:click|press|tap|select|hit)\s*(?:on\s+)?(?:this|that|here|it)\b/i,
};

const TYPE_PATTERNS = {
  // "fill in X from Y", "fill X copy from Y", "set X from Y"
  copyFromTarget: /\b(?:fill(?:\s+in)?|set|populate)\s+(?:the\s+)?["']?(.+?)["']?\s+(?:copy\s+from|from|using)\s+(?:the\s+)?["']?(.+?)["']?\s*$/i,
  // "copy X into Y", "copy X to Y"
  copyIntoTarget: /\b(?:copy)\s+["']?(.+?)["']?\s+(?:into|to)\s+(?:the\s+)?["']?(.+?)["']?\s*$/i,
  // "write X into Y", "type X in Y", "enter X to Y"
  intoTarget: /\b(?:type|enter|input|write)\s+["']?(.+?)["']?\s+(?:into|in|to)\s+(?:the\s+)?["']?(.+?)["']?\s*$/i,
  // "fill Y with X", "set Y as X"
  fillTarget: /\b(?:fill(?:\s+in)?|set)\s+(?:the\s+)?["']?(.+?)["']?\s+(?:with|as)\s+["']?(.+?)["']?\s*$/i,
  // "fill in ssn_confirmation" -> auto-infer from ssn
  ssnConfirmation: /\b(?:fill(?:\s+in)?|set)\s+(?:the\s+)?ssn_confirmation\b/i,
  // "type X", "enter X", "input X", "fill in X" (ambiguous value)
  valueOnly: /\b(?:type|enter|input|write|fill(?:\s+in)?|set)\s*["']?(.+?)["']?\s*$/i,
};

const NAVIGATION_PATTERNS = {
  back: /\b(go\s*back|navigate\s*back|back)\b/i,
  forward: /\b(go\s*forward|navigate\s*forward|forward)\b/i,
  refresh: /\b(refresh|reload)\s*(the\s*)?(page)?\b/i,
};

const WAIT_PATTERNS = {
  wait: /\b(wait|pause|sleep)\s*(?:for\s*)?(\d+)?\s*(seconds?|secs?|milliseconds?|ms)?\b/i,
};

const COMMAND_NORMALIZATION_RULES = [
  [/\bconfirmaton\b/gi, 'confirmation'],
  [/\bconfirmtion\b/gi, 'confirmation'],
  [/\bconfrimation\b/gi, 'confirmation'],
  [/\bconfimation\b/gi, 'confirmation'],
  [/\bssn\s+confirmation\b/gi, 'ssn_confirmation'],
  [/\badress\b/gi, 'address'],
  [/\bemial\b/gi, 'email']
];

function normalizeNaturalCommandInput(input) {
  let normalized = String(input || '');
  for (const [pattern, replacement] of COMMAND_NORMALIZATION_RULES) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.replace(/\s+/g, ' ').trim();
}

/**
 * Parse natural language command into structured action
 * @param {string} input - Natural language command
 * @param {object} context - Optional context (e.g., cursor position, last element)
 * @returns {object|null} Parsed action or null if not recognized
 */
function parseCommand(input, context = {}) {
  if (!input || typeof input !== 'string') return null;
  
  const trimmed = normalizeNaturalCommandInput(input);
  if (!trimmed) return null;

  // Check scroll commands
  const scrollAction = parseScrollCommand(trimmed);
  if (scrollAction) return scrollAction;

  // Check click commands
  const clickAction = parseClickCommand(trimmed, context);
  if (clickAction) return clickAction;

  // Check type commands
  const typeAction = parseTypeCommand(trimmed, context);
  if (typeAction) return typeAction;

  // Check navigation commands
  const navAction = parseNavigationCommand(trimmed);
  if (navAction) return navAction;

  // Check wait commands
  const waitAction = parseWaitCommand(trimmed);
  if (waitAction) return waitAction;

  return null;
}

/**
 * Parse scroll commands
 */
function parseScrollCommand(input) {
  // Scroll up
  if (SCROLL_PATTERNS.up.test(input)) {
    const amount = extractScrollAmount(input);
    return {
      type: 'scroll',
      direction: 'up',
      amount: amount || -300,
      raw: input
    };
  }

  // Scroll down
  if (SCROLL_PATTERNS.down.test(input)) {
    const amount = extractScrollAmount(input);
    return {
      type: 'scroll',
      direction: 'down',
      amount: amount || 300,
      raw: input
    };
  }

  // Scroll to top
  if (SCROLL_PATTERNS.top.test(input)) {
    return {
      type: 'scroll',
      direction: 'top',
      amount: 0,
      scrollTo: { top: 0 },
      raw: input
    };
  }

  // Scroll to bottom
  if (SCROLL_PATTERNS.bottom.test(input)) {
    return {
      type: 'scroll',
      direction: 'bottom',
      amount: 0,
      scrollTo: { top: 'max' },
      raw: input
    };
  }

  // Scroll left
  if (SCROLL_PATTERNS.left.test(input)) {
    const amount = extractScrollAmount(input);
    return {
      type: 'scroll',
      direction: 'left',
      amount: amount || -300,
      raw: input
    };
  }

  // Scroll right
  if (SCROLL_PATTERNS.right.test(input)) {
    const amount = extractScrollAmount(input);
    return {
      type: 'scroll',
      direction: 'right',
      amount: amount || 300,
      raw: input
    };
  }

  return null;
}

/**
 * Extract scroll amount from command like "scroll down 500 pixels"
 */
function extractScrollAmount(input) {
  const match = input.match(/(\d+)\s*(pixels?|px)?/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Parse click commands
 */
function parseClickCommand(input, context = {}) {
  // Check deictic references first ("click this", "click that")
  if (CLICK_PATTERNS.deictic.test(input)) {
    return {
      type: 'click',
      target: 'deictic',
      useContext: true,
      raw: input
    };
  }

  // Check for target specification
  const targetMatch = input.match(CLICK_PATTERNS.target);
  if (targetMatch && targetMatch[1]) {
    const target = targetMatch[1].trim();
    // Clean up common artifacts
    const cleanTarget = target
      .replace(/\s*(button|link|element)$/i, '')
      .replace(/^(the|a|an)\s+/i, '')
      .trim();
    
    if (cleanTarget) {
      return {
        type: 'click',
        target: cleanTarget,
        label: cleanTarget,
        field: cleanTarget,
        name: cleanTarget,
        raw: input
      };
    }
  }

  // Generic click detection
  if (/\bclick\b/i.test(input)) {
    // Try to extract whatever comes after "click"
    const afterClick = input.replace(/.*\bclick\s*/i, '').trim();
    if (afterClick) {
      return {
        type: 'click',
        target: afterClick,
        label: afterClick,
        field: afterClick,
        name: afterClick,
        raw: input
      };
    }
  }

  return null;
}

/**
 * Parse type/input commands
 */
function parseTypeCommand(input, context = {}) {
  const trimCapture = (value) =>
    String(value || '')
      .replace(/^["']+|["']+$/g, '')
      .replace(/[.;,\s]+$/g, '')
      .trim();

  // Special case: SSN Confirmation auto-fill
  if (TYPE_PATTERNS.ssnConfirmation.test(input)) {
    return {
      type: 'type',
      copyFrom: 'ssn',
      target: 'ssn_confirmation',
      label: 'SSN Confirmation',
      field: 'ssn_confirmation',
      name: 'ssn_confirmation',
      raw: input
    };
  }

  const copyFromMatch = input.match(TYPE_PATTERNS.copyFromTarget);
  if (copyFromMatch && copyFromMatch[1] && copyFromMatch[2]) {
    const target = trimCapture(copyFromMatch[1]);
    const source = trimCapture(copyFromMatch[2]);
    if (target && source) {
      return {
        type: 'type',
        copyFrom: source,
        target,
        label: target,
        field: target,
        name: target,
        raw: input
      };
    }
  }

  const copyIntoMatch = input.match(TYPE_PATTERNS.copyIntoTarget);
  if (copyIntoMatch && copyIntoMatch[1] && copyIntoMatch[2]) {
    const source = trimCapture(copyIntoMatch[1]);
    const target = trimCapture(copyIntoMatch[2]);
    if (target && source) {
      return {
        type: 'type',
        copyFrom: source,
        target,
        label: target,
        field: target,
        name: target,
        raw: input
      };
    }
  }

  const intoMatch = input.match(TYPE_PATTERNS.intoTarget);
  if (intoMatch && intoMatch[1] && intoMatch[2]) {
    const value = trimCapture(intoMatch[1]);
    const target = trimCapture(intoMatch[2]);
    if (value && target) {
      return {
        type: 'type',
        value,
        target,
        label: target,
        field: target,
        name: target,
        raw: input
      };
    }
  }

  const fillMatch = input.match(TYPE_PATTERNS.fillTarget);
  if (fillMatch && fillMatch[1] && fillMatch[2]) {
    const target = trimCapture(fillMatch[1]);
    const value = trimCapture(fillMatch[2]);
    if (value && target) {
      return {
        type: 'type',
        value,
        target,
        label: target,
        field: target,
        name: target,
        raw: input
      };
    }
  }

  const valueOnlyMatch = input.match(TYPE_PATTERNS.valueOnly);
  if (valueOnlyMatch && valueOnlyMatch[1]) {
    return {
      type: 'type',
      value: trimCapture(valueOnlyMatch[1]),
      raw: input
    };
  }
  return null;
}

/**
 * Parse navigation commands
 */
function parseNavigationCommand(input) {
  if (NAVIGATION_PATTERNS.back.test(input)) {
    return {
      type: 'navigate',
      action: 'back',
      raw: input
    };
  }

  if (NAVIGATION_PATTERNS.forward.test(input)) {
    return {
      type: 'navigate',
      action: 'forward',
      raw: input
    };
  }

  if (NAVIGATION_PATTERNS.refresh.test(input)) {
    return {
      type: 'navigate',
      action: 'refresh',
      raw: input
    };
  }

  return null;
}

/**
 * Parse wait commands
 */
function parseWaitCommand(input) {
  const match = input.match(WAIT_PATTERNS.wait);
  if (match) {
    let duration = parseInt(match[2], 10) || 1;
    const unit = (match[3] || 'seconds').toLowerCase();
    
    // Convert to milliseconds
    if (unit.startsWith('ms') || unit.startsWith('milli')) {
      // Already in ms
    } else {
      // Assume seconds
      duration = duration * 1000;
    }

    return {
      type: 'wait',
      duration: Math.min(duration, 30000), // Cap at 30 seconds
      raw: input
    };
  }
  return null;
}

/**
 * Convert parsed command to executable action for dom_runtime/action-executor
 */
function toExecutableAction(parsed) {
  if (!parsed) return null;

  switch (parsed.type) {
    case 'scroll':
      return buildScrollAction(parsed);
    case 'click':
      return buildClickAction(parsed);
    case 'type':
      return buildTypeAction(parsed);
    case 'navigate':
      return buildNavigateAction(parsed);
    case 'wait':
      return { type: 'wait', duration: parsed.duration };
    default:
      return null;
  }
}

function buildScrollAction(parsed) {
  const action = { type: 'scroll' };
  
  if (parsed.scrollTo) {
    // Absolute scroll position
    action.scrollTo = parsed.scrollTo;
  } else {
    // Relative scroll
    switch (parsed.direction) {
      case 'up':
        action.amount = -Math.abs(parsed.amount);
        break;
      case 'down':
        action.amount = Math.abs(parsed.amount);
        break;
      case 'left':
        action.horizontal = -Math.abs(parsed.amount);
        break;
      case 'right':
        action.horizontal = Math.abs(parsed.amount);
        break;
    }
  }
  
  return action;
}

function buildClickAction(parsed) {
  if (parsed.useContext) {
    // Deictic reference - rely on context (cursor position, last highlighted element)
    return {
      type: 'click',
      useContext: true
    };
  }
  
  return {
    type: 'click',
    label: parsed.label || parsed.target,
    field: parsed.field || parsed.target,
    name: parsed.name || parsed.target
  };
}

function buildTypeAction(parsed) {
  const action = {
    type: 'type',
    value: parsed.value
  };
  if (parsed.copyFrom) {
    action.copyFrom = parsed.copyFrom;
  }
  if (parsed.target) {
    action.label = parsed.label || parsed.target;
    action.field = parsed.field || parsed.target;
    action.name = parsed.name || parsed.target;
  }
  return action;
}

function buildNavigateAction(parsed) {
  return {
    type: 'script',
    code: getNavigationScript(parsed.action)
  };
}

function getNavigationScript(action) {
  switch (action) {
    case 'back':
      return 'window.history.back();';
    case 'forward':
      return 'window.history.forward();';
    case 'refresh':
      return 'window.location.reload();';
    default:
      return '';
  }
}

/**
 * Check if input looks like a natural language command
 */
function isNaturalLanguageCommand(input) {
  if (!input || typeof input !== 'string') return false;
  const trimmed = input.trim().toLowerCase();
  
  // Check for command-like patterns
  const commandPatterns = [
    /^(scroll|click|tap|press|type|enter|input|write|fill|set|copy|go|navigate|wait|pause|refresh|reload)/i,
    /\b(scroll\s*(up|down|left|right|to))\b/i,
    /\b(click\s*(on|the)?)\b/i,
    /\b(fill(?:\s+in)?\s+.+\s+(?:copy\s+from|from)\s+.+)\b/i,
    /\bpage\s*(up|down)\b/i,
  ];
  
  return commandPatterns.some(pattern => pattern.test(trimmed));
}

/**
 * Batch parse multiple commands (e.g., "scroll down then click submit")
 */
function parseCommandSequence(input) {
  if (!input || typeof input !== 'string') return [];
  
  // Split on common sequence words
  const parts = input.split(/\s*(?:then|and\s+then|,\s*then|,\s*and|and)\s*/i);
  
  const actions = [];
  for (const part of parts) {
    const parsed = parseCommand(part.trim());
    if (parsed) {
      const executable = toExecutableAction(parsed);
      if (executable) {
        actions.push(executable);
      }
    }
  }
  
  return actions;
}

// =============================================================================
// AI INTENT ANALYSIS
// =============================================================================

/**
 * Analyze goal text to determine intent category
 */
function analyzeIntent(goal) {
  const goalLower = (goal || '').toLowerCase().trim();
  if (!goalLower) {
    return { category: 'form_fill', confidence: 0.3, strategy: 'Execute basic actions', keywords: [], complexity: 'simple' };
  }

  const scores = {};
  const matchedKeywords = {};

  for (const [category, config] of Object.entries(INTENT_CATEGORIES)) {
    scores[category] = 0;
    matchedKeywords[category] = [];
    for (const keyword of config.keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = goalLower.match(regex);
      if (matches) {
        scores[category] += matches.length;
        matchedKeywords[category].push(keyword);
      }
    }
    if (goalLower.includes(category.replace('_', ' '))) scores[category] += 3;
  }

  let bestCategory = 'form_fill';
  let bestScore = 0;
  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) { bestScore = score; bestCategory = category; }
  }

  const config = INTENT_CATEGORIES[bestCategory];
  let complexity = config.complexity;
  if (['all', 'every', 'complete', 'entire', 'multiple'].some(ind => goalLower.includes(ind))) complexity = 'complex';
  else if (['just', 'only', 'single', 'one'].some(ind => goalLower.includes(ind))) complexity = 'simple';

  return {
    category: bestCategory,
    confidence: Math.min(1, bestScore / 5),
    strategy: config.strategy,
    keywords: matchedKeywords[bestCategory],
    complexity,
    description: config.description
  };
}

/**
 * Select optimal brain configuration based on intent
 */
function selectStrategy(intentAnalysis, currentConfig = {}, options = {}) {
  const config = INTENT_CATEGORIES[intentAnalysis.category];
  let provider = config.preferredProvider;
  let model = config.preferredModel;

  if (intentAnalysis.complexity === 'complex') {
    if (provider === 'deepseek' && model === 'deepseek-chat') model = 'deepseek-reasoner';
  }

  const configProvider = String(currentConfig.provider || '').trim();
  if (configProvider && configProvider !== 'backend') {
    provider = configProvider;
    model = currentConfig.model || model;
  }

  if (options.preferSpeed && model === 'deepseek-reasoner') model = 'deepseek-chat';

  return {
    provider, model,
    strategy: intentAnalysis.strategy,
    category: intentAnalysis.category,
    complexity: intentAnalysis.complexity,
    confidence: intentAnalysis.confidence
  };
}

/**
 * Enhance goal with contextual hints
 */
function enhanceGoal(goal, context = {}, intentAnalysis = null) {
  const analysis = intentAnalysis || analyzeIntent(goal);
  const enhanced = { original: goal, enhanced: goal, hints: [] };
  const url = context.url || '';

  if (url.includes('form') || url.includes('apply') || url.includes('register')) {
    enhanced.hints.push('Page appears to be a form - prioritize field detection');
  }
  if (url.includes('login') || url.includes('signin')) {
    enhanced.hints.push('Login page detected - handle credentials carefully');
  }
  if (url.includes('cart') || url.includes('checkout')) {
    enhanced.hints.push('E-commerce flow detected - verify before submitting');
  }
  if (analysis.complexity === 'complex') {
    enhanced.hints.push('Break into smaller steps if needed');
  }

  return enhanced;
}

/**
 * Adjust strategy after a failure
 */
function adjustStrategyOnFailure(previousStrategy, errorMessage = '', attemptNumber = 1) {
  const adjusted = { ...previousStrategy };

  if (attemptNumber >= 2) {
    if (previousStrategy.provider === 'gemini') {
      adjusted.provider = 'deepseek'; adjusted.model = 'deepseek-chat';
    } else if (previousStrategy.model === 'deepseek-chat') {
      adjusted.model = 'deepseek-reasoner';
    } else if (previousStrategy.provider === 'deepseek') {
      adjusted.provider = 'openai'; adjusted.model = 'gpt-4o';
    }
  }

  const errorLower = (errorMessage || '').toLowerCase();
  if (errorLower.includes('timeout')) adjusted.complexity = 'simple';
  if (errorLower.includes('not found')) adjusted.hints = ['Try scrolling to find element'];

  adjusted.isRetry = true;
  adjusted.previousAttempt = attemptNumber;
  return adjusted;
}

/**
 * Main Cortex AI routing function
 */
function route(goal, context = {}, currentConfig = {}, options = {}) {
  const intentAnalysis = analyzeIntent(goal);
  const strategy = selectStrategy(intentAnalysis, currentConfig, options);
  const enhanced = enhanceGoal(goal, context, intentAnalysis);

  return {
    version: CORTEX_VERSION,
    timestamp: Date.now(),
    intent: {
      category: intentAnalysis.category,
      confidence: intentAnalysis.confidence,
      complexity: intentAnalysis.complexity,
      keywords: intentAnalysis.keywords
    },
    strategy: {
      provider: strategy.provider,
      model: strategy.model,
      description: strategy.strategy
    },
    goal: { original: goal, enhanced: enhanced.enhanced, hints: enhanced.hints },
    context: { url: context.url || '', title: context.title || '' }
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

// Export for use in other modules (Node.js)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    // NL Command Parsing
    parseCommand,
    parseCommandSequence,
    toExecutableAction,
    isNaturalLanguageCommand,
    SCROLL_PATTERNS,
    CLICK_PATTERNS,
    // AI Routing
    route,
    analyzeIntent,
    selectStrategy,
    enhanceGoal,
    adjustStrategyOnFailure,
    INTENT_CATEGORIES,
    MODEL_CAPABILITIES,
    CORTEX_VERSION
  };
}

// Make available globally for content script use
if (typeof window !== 'undefined') {
  window.BilgeCortex = {
    // NL Command Parsing
    parseCommand,
    parseCommandSequence,
    toExecutableAction,
    isNaturalLanguageCommand,
    // AI Routing
    route,
    analyzeIntent,
    selectStrategy,
    enhanceGoal,
    adjustStrategyOnFailure,
    INTENT_CATEGORIES,
    MODEL_CAPABILITIES,
    version: CORTEX_VERSION
  };
}

// Also expose as globalThis.Cortex for background service worker
if (typeof globalThis !== 'undefined') {
  globalThis.Cortex = {
    version: CORTEX_VERSION,
    route,
    analyzeIntent,
    selectStrategy,
    enhanceGoal,
    adjustStrategyOnFailure,
    INTENT_CATEGORIES,
    MODEL_CAPABILITIES
  };
}

window.__bilge_cortex_loaded = true;
console.log(`[Cortex v${CORTEX_VERSION}] Unified AI Router & NL Parser initialized`);
