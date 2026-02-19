var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/cortex.js
var CORTEX_VERSION = "3.0.1";
var INTENT_CATEGORIES = {
  form_fill: {
    description: "Filling out forms, entering data",
    keywords: ["fill", "enter", "input", "type", "submit", "form", "field", "data"],
    strategy: "Execute form actions systematically",
    preferredProvider: "deepseek",
    preferredModel: "deepseek-chat",
    complexity: "simple"
  },
  ssn_confirmation: {
    description: "Auto-filling SSN confirmation fields by mirroring SSN",
    keywords: ["ssn", "social security", "confirm", "confirmation"],
    strategy: "Copy the value from ssn field to ssn_confirmation field",
    preferredProvider: "deepseek",
    preferredModel: "deepseek-chat",
    complexity: "simple"
  },
  navigation: {
    description: "Navigating between pages, clicking links",
    keywords: ["click", "navigate", "go to", "open", "visit", "link", "button", "menu"],
    strategy: "Navigate to target with minimal clicks",
    preferredProvider: "deepseek",
    preferredModel: "deepseek-chat",
    complexity: "simple"
  },
  extraction: {
    description: "Reading, extracting, or copying information",
    keywords: ["read", "extract", "copy", "get", "find", "locate", "scan", "identify", "list"],
    strategy: "Identify and extract target information",
    preferredProvider: "deepseek",
    preferredModel: "deepseek-chat",
    complexity: "moderate"
  },
  verification: {
    description: "Verifying, checking, or validating state",
    keywords: ["verify", "check", "confirm", "validate", "ensure", "assert", "test"],
    strategy: "Verify conditions and report status",
    preferredProvider: "deepseek",
    preferredModel: "deepseek-chat",
    complexity: "moderate"
  },
  complex_workflow: {
    description: "Multi-step workflows, complex automation",
    keywords: ["workflow", "process", "sequence", "automate", "complete", "finish", "all"],
    strategy: "Break into steps and execute sequentially",
    preferredProvider: "deepseek",
    preferredModel: "deepseek-reasoner",
    complexity: "complex"
  },
  reasoning: {
    description: "Analysis, decision-making, problem-solving",
    keywords: ["analyze", "decide", "figure out", "determine", "understand", "solve", "plan"],
    strategy: "Analyze situation and determine best approach",
    preferredProvider: "deepseek",
    preferredModel: "deepseek-reasoner",
    complexity: "complex"
  },
  search: {
    description: "Searching for elements or information on page",
    keywords: ["search", "find", "look for", "locate", "where is", "show me"],
    strategy: "Scan page to locate target elements",
    preferredProvider: "deepseek",
    preferredModel: "deepseek-chat",
    complexity: "simple"
  }
};
var MODEL_CAPABILITIES = {
  "gemini-2.0-flash": {
    vision: true,
    speed: "fast",
    reasoning: "moderate",
    cost: "low",
    bestFor: ["form_fill", "navigation", "extraction", "search"]
  },
  "gpt-4o": {
    vision: true,
    speed: "moderate",
    reasoning: "high",
    cost: "high",
    bestFor: ["complex_workflow", "reasoning", "verification"]
  },
  "deepseek-chat": {
    vision: true,
    speed: "fast",
    reasoning: "moderate",
    cost: "low",
    bestFor: ["form_fill", "navigation", "verification"]
  },
  "deepseek-reasoner": {
    vision: true,
    speed: "slow",
    reasoning: "very_high",
    cost: "moderate",
    bestFor: ["complex_workflow", "reasoning"]
  }
};
var SCROLL_PATTERNS = {
  up: /\b(scroll\s*(up|upward|upwards)|page\s*up)\b/i,
  down: /\b(scroll\s*(down|downward|downwards)|page\s*down)\b/i,
  top: /\b(scroll\s*(to\s*)?(the\s*)?(top|beginning|start)|go\s*(to\s*)?(the\s*)?(top|beginning|start))\b/i,
  bottom: /\b(scroll\s*(to\s*)?(the\s*)?(bottom|end)|go\s*(to\s*)?(the\s*)?(bottom|end))\b/i,
  left: /\b(scroll\s*(left|leftward|leftwards))\b/i,
  right: /\b(scroll\s*(right|rightward|rightwards))\b/i
};
var CLICK_PATTERNS = {
  // "click on X", "click X", "click the X", "press X", "tap X"
  target: /\b(?:click|press|tap|select|hit)\s*(?:on\s+)?(?:the\s+)?["']?(.+?)["']?\s*(?:button|link|element)?$/i,
  // "click this", "click that", "click here"
  deictic: /\b(?:click|press|tap|select|hit)\s*(?:on\s+)?(?:this|that|here|it)\b/i
};
var TYPE_PATTERNS = {
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
  valueOnly: /\b(?:type|enter|input|write|fill(?:\s+in)?|set)\s*["']?(.+?)["']?\s*$/i
};
var NAVIGATION_PATTERNS = {
  back: /\b(go\s*back|navigate\s*back|back)\b/i,
  forward: /\b(go\s*forward|navigate\s*forward|forward)\b/i,
  refresh: /\b(refresh|reload)\s*(the\s*)?(page)?\b/i
};
var WAIT_PATTERNS = {
  wait: /\b(wait|pause|sleep)\s*(?:for\s*)?(\d+)?\s*(seconds?|secs?|milliseconds?|ms)?\b/i
};
var COMMAND_NORMALIZATION_RULES = [
  [/\bconfirmaton\b/gi, "confirmation"],
  [/\bconfirmtion\b/gi, "confirmation"],
  [/\bconfrimation\b/gi, "confirmation"],
  [/\bconfimation\b/gi, "confirmation"],
  [/\bssn\s+confirmation\b/gi, "ssn_confirmation"],
  [/\badress\b/gi, "address"],
  [/\bemial\b/gi, "email"]
];
function normalizeNaturalCommandInput(input) {
  let normalized = String(input || "");
  for (const [pattern, replacement] of COMMAND_NORMALIZATION_RULES) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.replace(/\s+/g, " ").trim();
}
__name(normalizeNaturalCommandInput, "normalizeNaturalCommandInput");
function parseCommand(input, context = {}) {
  if (!input || typeof input !== "string") return null;
  const trimmed = normalizeNaturalCommandInput(input);
  if (!trimmed) return null;
  const scrollAction = parseScrollCommand(trimmed);
  if (scrollAction) return scrollAction;
  const clickAction = parseClickCommand(trimmed, context);
  if (clickAction) return clickAction;
  const typeAction = parseTypeCommand(trimmed, context);
  if (typeAction) return typeAction;
  const navAction = parseNavigationCommand(trimmed);
  if (navAction) return navAction;
  const waitAction = parseWaitCommand(trimmed);
  if (waitAction) return waitAction;
  return null;
}
__name(parseCommand, "parseCommand");
function parseScrollCommand(input) {
  if (SCROLL_PATTERNS.up.test(input)) {
    const amount = extractScrollAmount(input);
    return {
      type: "scroll",
      direction: "up",
      amount: amount || -300,
      raw: input
    };
  }
  if (SCROLL_PATTERNS.down.test(input)) {
    const amount = extractScrollAmount(input);
    return {
      type: "scroll",
      direction: "down",
      amount: amount || 300,
      raw: input
    };
  }
  if (SCROLL_PATTERNS.top.test(input)) {
    return {
      type: "scroll",
      direction: "top",
      amount: 0,
      scrollTo: { top: 0 },
      raw: input
    };
  }
  if (SCROLL_PATTERNS.bottom.test(input)) {
    return {
      type: "scroll",
      direction: "bottom",
      amount: 0,
      scrollTo: { top: "max" },
      raw: input
    };
  }
  if (SCROLL_PATTERNS.left.test(input)) {
    const amount = extractScrollAmount(input);
    return {
      type: "scroll",
      direction: "left",
      amount: amount || -300,
      raw: input
    };
  }
  if (SCROLL_PATTERNS.right.test(input)) {
    const amount = extractScrollAmount(input);
    return {
      type: "scroll",
      direction: "right",
      amount: amount || 300,
      raw: input
    };
  }
  return null;
}
__name(parseScrollCommand, "parseScrollCommand");
function extractScrollAmount(input) {
  const match = input.match(/(\d+)\s*(pixels?|px)?/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}
__name(extractScrollAmount, "extractScrollAmount");
function parseClickCommand(input, context = {}) {
  if (CLICK_PATTERNS.deictic.test(input)) {
    return {
      type: "click",
      target: "deictic",
      useContext: true,
      raw: input
    };
  }
  const targetMatch = input.match(CLICK_PATTERNS.target);
  if (targetMatch && targetMatch[1]) {
    const target = targetMatch[1].trim();
    const cleanTarget = target.replace(/\s*(button|link|element)$/i, "").replace(/^(the|a|an)\s+/i, "").trim();
    if (cleanTarget) {
      return {
        type: "click",
        target: cleanTarget,
        label: cleanTarget,
        field: cleanTarget,
        name: cleanTarget,
        raw: input
      };
    }
  }
  if (/\bclick\b/i.test(input)) {
    const afterClick = input.replace(/.*\bclick\s*/i, "").trim();
    if (afterClick) {
      return {
        type: "click",
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
__name(parseClickCommand, "parseClickCommand");
function parseTypeCommand(input, context = {}) {
  const trimCapture = /* @__PURE__ */ __name((value) => String(value || "").replace(/^["']+|["']+$/g, "").replace(/[.;,\s]+$/g, "").trim(), "trimCapture");
  if (TYPE_PATTERNS.ssnConfirmation.test(input)) {
    return {
      type: "type",
      copyFrom: "ssn",
      target: "ssn_confirmation",
      label: "SSN Confirmation",
      field: "ssn_confirmation",
      name: "ssn_confirmation",
      raw: input
    };
  }
  const copyFromMatch = input.match(TYPE_PATTERNS.copyFromTarget);
  if (copyFromMatch && copyFromMatch[1] && copyFromMatch[2]) {
    const target = trimCapture(copyFromMatch[1]);
    const source = trimCapture(copyFromMatch[2]);
    if (target && source) {
      return {
        type: "type",
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
        type: "type",
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
        type: "type",
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
        type: "type",
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
      type: "type",
      value: trimCapture(valueOnlyMatch[1]),
      raw: input
    };
  }
  return null;
}
__name(parseTypeCommand, "parseTypeCommand");
function parseNavigationCommand(input) {
  if (NAVIGATION_PATTERNS.back.test(input)) {
    return {
      type: "navigate",
      action: "back",
      raw: input
    };
  }
  if (NAVIGATION_PATTERNS.forward.test(input)) {
    return {
      type: "navigate",
      action: "forward",
      raw: input
    };
  }
  if (NAVIGATION_PATTERNS.refresh.test(input)) {
    return {
      type: "navigate",
      action: "refresh",
      raw: input
    };
  }
  return null;
}
__name(parseNavigationCommand, "parseNavigationCommand");
function parseWaitCommand(input) {
  const match = input.match(WAIT_PATTERNS.wait);
  if (match) {
    let duration = parseInt(match[2], 10) || 1;
    const unit = (match[3] || "seconds").toLowerCase();
    if (unit.startsWith("ms") || unit.startsWith("milli")) {
    } else {
      duration = duration * 1e3;
    }
    return {
      type: "wait",
      duration: Math.min(duration, 3e4),
      // Cap at 30 seconds
      raw: input
    };
  }
  return null;
}
__name(parseWaitCommand, "parseWaitCommand");
function toExecutableAction(parsed) {
  if (!parsed) return null;
  switch (parsed.type) {
    case "scroll":
      return buildScrollAction(parsed);
    case "click":
      return buildClickAction(parsed);
    case "type":
      return buildTypeAction(parsed);
    case "navigate":
      return buildNavigateAction(parsed);
    case "wait":
      return { type: "wait", duration: parsed.duration };
    default:
      return null;
  }
}
__name(toExecutableAction, "toExecutableAction");
function buildScrollAction(parsed) {
  const action = { type: "scroll" };
  if (parsed.scrollTo) {
    action.scrollTo = parsed.scrollTo;
  } else {
    switch (parsed.direction) {
      case "up":
        action.amount = -Math.abs(parsed.amount);
        break;
      case "down":
        action.amount = Math.abs(parsed.amount);
        break;
      case "left":
        action.horizontal = -Math.abs(parsed.amount);
        break;
      case "right":
        action.horizontal = Math.abs(parsed.amount);
        break;
    }
  }
  return action;
}
__name(buildScrollAction, "buildScrollAction");
function buildClickAction(parsed) {
  if (parsed.useContext) {
    return {
      type: "click",
      useContext: true
    };
  }
  return {
    type: "click",
    label: parsed.label || parsed.target,
    field: parsed.field || parsed.target,
    name: parsed.name || parsed.target
  };
}
__name(buildClickAction, "buildClickAction");
function buildTypeAction(parsed) {
  const action = {
    type: "type",
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
__name(buildTypeAction, "buildTypeAction");
function buildNavigateAction(parsed) {
  return {
    type: "script",
    code: getNavigationScript(parsed.action)
  };
}
__name(buildNavigateAction, "buildNavigateAction");
function getNavigationScript(action) {
  switch (action) {
    case "back":
      return "window.history.back();";
    case "forward":
      return "window.history.forward();";
    case "refresh":
      return "window.location.reload();";
    default:
      return "";
  }
}
__name(getNavigationScript, "getNavigationScript");
function isNaturalLanguageCommand(input) {
  if (!input || typeof input !== "string") return false;
  const trimmed = input.trim().toLowerCase();
  const commandPatterns = [
    /^(scroll|click|tap|press|type|enter|input|write|fill|set|copy|go|navigate|wait|pause|refresh|reload)/i,
    /\b(scroll\s*(up|down|left|right|to))\b/i,
    /\b(click\s*(on|the)?)\b/i,
    /\b(fill(?:\s+in)?\s+.+\s+(?:copy\s+from|from)\s+.+)\b/i,
    /\bpage\s*(up|down)\b/i
  ];
  return commandPatterns.some((pattern) => pattern.test(trimmed));
}
__name(isNaturalLanguageCommand, "isNaturalLanguageCommand");
function parseCommandSequence(input) {
  if (!input || typeof input !== "string") return [];
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
__name(parseCommandSequence, "parseCommandSequence");
function analyzeIntent(goal) {
  const goalLower = (goal || "").toLowerCase().trim();
  if (!goalLower) {
    return { category: "form_fill", confidence: 0.3, strategy: "Execute basic actions", keywords: [], complexity: "simple" };
  }
  const scores = {};
  const matchedKeywords = {};
  for (const [category, config2] of Object.entries(INTENT_CATEGORIES)) {
    scores[category] = 0;
    matchedKeywords[category] = [];
    for (const keyword of config2.keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, "gi");
      const matches = goalLower.match(regex);
      if (matches) {
        scores[category] += matches.length;
        matchedKeywords[category].push(keyword);
      }
    }
    if (goalLower.includes(category.replace("_", " "))) scores[category] += 3;
  }
  let bestCategory = "form_fill";
  let bestScore = 0;
  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }
  const config = INTENT_CATEGORIES[bestCategory];
  let complexity = config.complexity;
  if (["all", "every", "complete", "entire", "multiple"].some((ind) => goalLower.includes(ind))) complexity = "complex";
  else if (["just", "only", "single", "one"].some((ind) => goalLower.includes(ind))) complexity = "simple";
  return {
    category: bestCategory,
    confidence: Math.min(1, bestScore / 5),
    strategy: config.strategy,
    keywords: matchedKeywords[bestCategory],
    complexity,
    description: config.description
  };
}
__name(analyzeIntent, "analyzeIntent");
function selectStrategy(intentAnalysis, currentConfig = {}, options = {}) {
  const config = INTENT_CATEGORIES[intentAnalysis.category];
  let provider = config.preferredProvider;
  let model = config.preferredModel;
  if (intentAnalysis.complexity === "complex") {
    if (provider === "deepseek" && model === "deepseek-chat") model = "deepseek-reasoner";
  }
  const configProvider = String(currentConfig.provider || "").trim();
  if (configProvider && configProvider !== "backend") {
    provider = configProvider;
    model = currentConfig.model || model;
  }
  if (options.preferSpeed && model === "deepseek-reasoner") model = "deepseek-chat";
  return {
    provider,
    model,
    strategy: intentAnalysis.strategy,
    category: intentAnalysis.category,
    complexity: intentAnalysis.complexity,
    confidence: intentAnalysis.confidence
  };
}
__name(selectStrategy, "selectStrategy");
function enhanceGoal(goal, context = {}, intentAnalysis = null) {
  const analysis = intentAnalysis || analyzeIntent(goal);
  const enhanced = { original: goal, enhanced: goal, hints: [] };
  const url = context.url || "";
  if (url.includes("form") || url.includes("apply") || url.includes("register")) {
    enhanced.hints.push("Page appears to be a form - prioritize field detection");
  }
  if (url.includes("login") || url.includes("signin")) {
    enhanced.hints.push("Login page detected - handle credentials carefully");
  }
  if (url.includes("cart") || url.includes("checkout")) {
    enhanced.hints.push("E-commerce flow detected - verify before submitting");
  }
  if (analysis.complexity === "complex") {
    enhanced.hints.push("Break into smaller steps if needed");
  }
  return enhanced;
}
__name(enhanceGoal, "enhanceGoal");
function adjustStrategyOnFailure(previousStrategy, errorMessage = "", attemptNumber = 1) {
  const adjusted = { ...previousStrategy };
  if (attemptNumber >= 2) {
    if (previousStrategy.provider === "gemini") {
      adjusted.provider = "deepseek";
      adjusted.model = "deepseek-chat";
    } else if (previousStrategy.model === "deepseek-chat") {
      adjusted.model = "deepseek-reasoner";
    } else if (previousStrategy.provider === "deepseek") {
      adjusted.provider = "openai";
      adjusted.model = "gpt-4o";
    }
  }
  const errorLower = (errorMessage || "").toLowerCase();
  if (errorLower.includes("timeout")) adjusted.complexity = "simple";
  if (errorLower.includes("not found")) adjusted.hints = ["Try scrolling to find element"];
  adjusted.isRetry = true;
  adjusted.previousAttempt = attemptNumber;
  return adjusted;
}
__name(adjustStrategyOnFailure, "adjustStrategyOnFailure");
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
    context: { url: context.url || "", title: context.title || "" }
  };
}
__name(route, "route");
if (typeof module !== "undefined" && module.exports) {
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
if (typeof window !== "undefined") {
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
if (typeof globalThis !== "undefined") {
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL2NvcnRleC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyoqXG4gKiBDb3J0ZXggdjMgLSBVbmlmaWVkIEFJIFJvdXRlciAmIE5hdHVyYWwgTGFuZ3VhZ2UgUGFyc2VyIGZvciBCaWxnZSBBSVxuICpcbiAqIFByb3ZpZGVzOlxuICogMS4gTmF0dXJhbCBMYW5ndWFnZSBDb21tYW5kIFBhcnNpbmcgLSBcInNjcm9sbCB1cFwiLCBcImNsaWNrIG9uIFhcIiwgZXRjLlxuICogMi4gSW50ZW50IEFuYWx5c2lzIC0gQ2F0ZWdvcml6ZXMgZ29hbHMgaW50byBhY3Rpb24gdHlwZXNcbiAqIDMuIFN0cmF0ZWd5IFNlbGVjdGlvbiAtIENob29zZXMgb3B0aW1hbCBicmFpbiBwcm92aWRlci9tb2RlbFxuICogNC4gQ29udGV4dCBFbmhhbmNlbWVudCAtIEVucmljaGVzIGdvYWxzIHdpdGggcmVsZXZhbnQgY29udGV4dFxuICogNS4gTXVsdGktc3RlcCBQbGFubmluZyAtIEJyZWFrcyBjb21wbGV4IGdvYWxzIGludG8gc3RlcHNcbiAqIDYuIFNtYXJ0IFJldHJ5IC0gQWRqdXN0cyBzdHJhdGVneSBvbiBmYWlsdXJlc1xuICovXG5cbmNvbnN0IENPUlRFWF9WRVJTSU9OID0gJzMuMC4xJztcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIElOVEVOVCBDQVRFR09SSUVTIChBSSBSb3V0aW5nKVxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuY29uc3QgSU5URU5UX0NBVEVHT1JJRVMgPSB7XG4gIGZvcm1fZmlsbDoge1xuICAgIGRlc2NyaXB0aW9uOiAnRmlsbGluZyBvdXQgZm9ybXMsIGVudGVyaW5nIGRhdGEnLFxuICAgIGtleXdvcmRzOiBbJ2ZpbGwnLCAnZW50ZXInLCAnaW5wdXQnLCAndHlwZScsICdzdWJtaXQnLCAnZm9ybScsICdmaWVsZCcsICdkYXRhJ10sXG4gICAgc3RyYXRlZ3k6ICdFeGVjdXRlIGZvcm0gYWN0aW9ucyBzeXN0ZW1hdGljYWxseScsXG4gICAgcHJlZmVycmVkUHJvdmlkZXI6ICdkZWVwc2VlaycsXG4gICAgcHJlZmVycmVkTW9kZWw6ICdkZWVwc2Vlay1jaGF0JyxcbiAgICBjb21wbGV4aXR5OiAnc2ltcGxlJ1xuICB9LFxuICBzc25fY29uZmlybWF0aW9uOiB7XG4gICAgZGVzY3JpcHRpb246ICdBdXRvLWZpbGxpbmcgU1NOIGNvbmZpcm1hdGlvbiBmaWVsZHMgYnkgbWlycm9yaW5nIFNTTicsXG4gICAga2V5d29yZHM6IFsnc3NuJywgJ3NvY2lhbCBzZWN1cml0eScsICdjb25maXJtJywgJ2NvbmZpcm1hdGlvbiddLFxuICAgIHN0cmF0ZWd5OiAnQ29weSB0aGUgdmFsdWUgZnJvbSBzc24gZmllbGQgdG8gc3NuX2NvbmZpcm1hdGlvbiBmaWVsZCcsXG4gICAgcHJlZmVycmVkUHJvdmlkZXI6ICdkZWVwc2VlaycsXG4gICAgcHJlZmVycmVkTW9kZWw6ICdkZWVwc2Vlay1jaGF0JyxcbiAgICBjb21wbGV4aXR5OiAnc2ltcGxlJ1xuICB9LFxuICBuYXZpZ2F0aW9uOiB7XG4gICAgZGVzY3JpcHRpb246ICdOYXZpZ2F0aW5nIGJldHdlZW4gcGFnZXMsIGNsaWNraW5nIGxpbmtzJyxcbiAgICBrZXl3b3JkczogWydjbGljaycsICduYXZpZ2F0ZScsICdnbyB0bycsICdvcGVuJywgJ3Zpc2l0JywgJ2xpbmsnLCAnYnV0dG9uJywgJ21lbnUnXSxcbiAgICBzdHJhdGVneTogJ05hdmlnYXRlIHRvIHRhcmdldCB3aXRoIG1pbmltYWwgY2xpY2tzJyxcbiAgICBwcmVmZXJyZWRQcm92aWRlcjogJ2RlZXBzZWVrJyxcbiAgICBwcmVmZXJyZWRNb2RlbDogJ2RlZXBzZWVrLWNoYXQnLFxuICAgIGNvbXBsZXhpdHk6ICdzaW1wbGUnXG4gIH0sXG4gIGV4dHJhY3Rpb246IHtcbiAgICBkZXNjcmlwdGlvbjogJ1JlYWRpbmcsIGV4dHJhY3RpbmcsIG9yIGNvcHlpbmcgaW5mb3JtYXRpb24nLFxuICAgIGtleXdvcmRzOiBbJ3JlYWQnLCAnZXh0cmFjdCcsICdjb3B5JywgJ2dldCcsICdmaW5kJywgJ2xvY2F0ZScsICdzY2FuJywgJ2lkZW50aWZ5JywgJ2xpc3QnXSxcbiAgICBzdHJhdGVneTogJ0lkZW50aWZ5IGFuZCBleHRyYWN0IHRhcmdldCBpbmZvcm1hdGlvbicsXG4gICAgcHJlZmVycmVkUHJvdmlkZXI6ICdkZWVwc2VlaycsXG4gICAgcHJlZmVycmVkTW9kZWw6ICdkZWVwc2Vlay1jaGF0JyxcbiAgICBjb21wbGV4aXR5OiAnbW9kZXJhdGUnXG4gIH0sXG4gIHZlcmlmaWNhdGlvbjoge1xuICAgIGRlc2NyaXB0aW9uOiAnVmVyaWZ5aW5nLCBjaGVja2luZywgb3IgdmFsaWRhdGluZyBzdGF0ZScsXG4gICAga2V5d29yZHM6IFsndmVyaWZ5JywgJ2NoZWNrJywgJ2NvbmZpcm0nLCAndmFsaWRhdGUnLCAnZW5zdXJlJywgJ2Fzc2VydCcsICd0ZXN0J10sXG4gICAgc3RyYXRlZ3k6ICdWZXJpZnkgY29uZGl0aW9ucyBhbmQgcmVwb3J0IHN0YXR1cycsXG4gICAgcHJlZmVycmVkUHJvdmlkZXI6ICdkZWVwc2VlaycsXG4gICAgcHJlZmVycmVkTW9kZWw6ICdkZWVwc2Vlay1jaGF0JyxcbiAgICBjb21wbGV4aXR5OiAnbW9kZXJhdGUnXG4gIH0sXG4gIGNvbXBsZXhfd29ya2Zsb3c6IHtcbiAgICBkZXNjcmlwdGlvbjogJ011bHRpLXN0ZXAgd29ya2Zsb3dzLCBjb21wbGV4IGF1dG9tYXRpb24nLFxuICAgIGtleXdvcmRzOiBbJ3dvcmtmbG93JywgJ3Byb2Nlc3MnLCAnc2VxdWVuY2UnLCAnYXV0b21hdGUnLCAnY29tcGxldGUnLCAnZmluaXNoJywgJ2FsbCddLFxuICAgIHN0cmF0ZWd5OiAnQnJlYWsgaW50byBzdGVwcyBhbmQgZXhlY3V0ZSBzZXF1ZW50aWFsbHknLFxuICAgIHByZWZlcnJlZFByb3ZpZGVyOiAnZGVlcHNlZWsnLFxuICAgIHByZWZlcnJlZE1vZGVsOiAnZGVlcHNlZWstcmVhc29uZXInLFxuICAgIGNvbXBsZXhpdHk6ICdjb21wbGV4J1xuICB9LFxuICByZWFzb25pbmc6IHtcbiAgICBkZXNjcmlwdGlvbjogJ0FuYWx5c2lzLCBkZWNpc2lvbi1tYWtpbmcsIHByb2JsZW0tc29sdmluZycsXG4gICAga2V5d29yZHM6IFsnYW5hbHl6ZScsICdkZWNpZGUnLCAnZmlndXJlIG91dCcsICdkZXRlcm1pbmUnLCAndW5kZXJzdGFuZCcsICdzb2x2ZScsICdwbGFuJ10sXG4gICAgc3RyYXRlZ3k6ICdBbmFseXplIHNpdHVhdGlvbiBhbmQgZGV0ZXJtaW5lIGJlc3QgYXBwcm9hY2gnLFxuICAgIHByZWZlcnJlZFByb3ZpZGVyOiAnZGVlcHNlZWsnLFxuICAgIHByZWZlcnJlZE1vZGVsOiAnZGVlcHNlZWstcmVhc29uZXInLFxuICAgIGNvbXBsZXhpdHk6ICdjb21wbGV4J1xuICB9LFxuICBzZWFyY2g6IHtcbiAgICBkZXNjcmlwdGlvbjogJ1NlYXJjaGluZyBmb3IgZWxlbWVudHMgb3IgaW5mb3JtYXRpb24gb24gcGFnZScsXG4gICAga2V5d29yZHM6IFsnc2VhcmNoJywgJ2ZpbmQnLCAnbG9vayBmb3InLCAnbG9jYXRlJywgJ3doZXJlIGlzJywgJ3Nob3cgbWUnXSxcbiAgICBzdHJhdGVneTogJ1NjYW4gcGFnZSB0byBsb2NhdGUgdGFyZ2V0IGVsZW1lbnRzJyxcbiAgICBwcmVmZXJyZWRQcm92aWRlcjogJ2RlZXBzZWVrJyxcbiAgICBwcmVmZXJyZWRNb2RlbDogJ2RlZXBzZWVrLWNoYXQnLFxuICAgIGNvbXBsZXhpdHk6ICdzaW1wbGUnXG4gIH1cbn07XG5cbmNvbnN0IE1PREVMX0NBUEFCSUxJVElFUyA9IHtcbiAgJ2dlbWluaS0yLjAtZmxhc2gnOiB7XG4gICAgdmlzaW9uOiB0cnVlLCBzcGVlZDogJ2Zhc3QnLCByZWFzb25pbmc6ICdtb2RlcmF0ZScsIGNvc3Q6ICdsb3cnLFxuICAgIGJlc3RGb3I6IFsnZm9ybV9maWxsJywgJ25hdmlnYXRpb24nLCAnZXh0cmFjdGlvbicsICdzZWFyY2gnXVxuICB9LFxuICAnZ3B0LTRvJzoge1xuICAgIHZpc2lvbjogdHJ1ZSwgc3BlZWQ6ICdtb2RlcmF0ZScsIHJlYXNvbmluZzogJ2hpZ2gnLCBjb3N0OiAnaGlnaCcsXG4gICAgYmVzdEZvcjogWydjb21wbGV4X3dvcmtmbG93JywgJ3JlYXNvbmluZycsICd2ZXJpZmljYXRpb24nXVxuICB9LFxuICAnZGVlcHNlZWstY2hhdCc6IHtcbiAgICB2aXNpb246IHRydWUsIHNwZWVkOiAnZmFzdCcsIHJlYXNvbmluZzogJ21vZGVyYXRlJywgY29zdDogJ2xvdycsXG4gICAgYmVzdEZvcjogWydmb3JtX2ZpbGwnLCAnbmF2aWdhdGlvbicsICd2ZXJpZmljYXRpb24nXVxuICB9LFxuICAnZGVlcHNlZWstcmVhc29uZXInOiB7XG4gICAgdmlzaW9uOiB0cnVlLCBzcGVlZDogJ3Nsb3cnLCByZWFzb25pbmc6ICd2ZXJ5X2hpZ2gnLCBjb3N0OiAnbW9kZXJhdGUnLFxuICAgIGJlc3RGb3I6IFsnY29tcGxleF93b3JrZmxvdycsICdyZWFzb25pbmcnXVxuICB9XG59O1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gTkFUVVJBTCBMQU5HVUFHRSBDT01NQU5EIFBBVFRFUk5TXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5jb25zdCBTQ1JPTExfUEFUVEVSTlMgPSB7XG4gIHVwOiAvXFxiKHNjcm9sbFxccyoodXB8dXB3YXJkfHVwd2FyZHMpfHBhZ2VcXHMqdXApXFxiL2ksXG4gIGRvd246IC9cXGIoc2Nyb2xsXFxzKihkb3dufGRvd253YXJkfGRvd253YXJkcyl8cGFnZVxccypkb3duKVxcYi9pLFxuICB0b3A6IC9cXGIoc2Nyb2xsXFxzKih0b1xccyopPyh0aGVcXHMqKT8odG9wfGJlZ2lubmluZ3xzdGFydCl8Z29cXHMqKHRvXFxzKik/KHRoZVxccyopPyh0b3B8YmVnaW5uaW5nfHN0YXJ0KSlcXGIvaSxcbiAgYm90dG9tOiAvXFxiKHNjcm9sbFxccyoodG9cXHMqKT8odGhlXFxzKik/KGJvdHRvbXxlbmQpfGdvXFxzKih0b1xccyopPyh0aGVcXHMqKT8oYm90dG9tfGVuZCkpXFxiL2ksXG4gIGxlZnQ6IC9cXGIoc2Nyb2xsXFxzKihsZWZ0fGxlZnR3YXJkfGxlZnR3YXJkcykpXFxiL2ksXG4gIHJpZ2h0OiAvXFxiKHNjcm9sbFxccyoocmlnaHR8cmlnaHR3YXJkfHJpZ2h0d2FyZHMpKVxcYi9pLFxufTtcblxuY29uc3QgQ0xJQ0tfUEFUVEVSTlMgPSB7XG4gIC8vIFwiY2xpY2sgb24gWFwiLCBcImNsaWNrIFhcIiwgXCJjbGljayB0aGUgWFwiLCBcInByZXNzIFhcIiwgXCJ0YXAgWFwiXG4gIHRhcmdldDogL1xcYig/OmNsaWNrfHByZXNzfHRhcHxzZWxlY3R8aGl0KVxccyooPzpvblxccyspPyg/OnRoZVxccyspP1tcIiddPyguKz8pW1wiJ10/XFxzKig/OmJ1dHRvbnxsaW5rfGVsZW1lbnQpPyQvaSxcbiAgLy8gXCJjbGljayB0aGlzXCIsIFwiY2xpY2sgdGhhdFwiLCBcImNsaWNrIGhlcmVcIlxuICBkZWljdGljOiAvXFxiKD86Y2xpY2t8cHJlc3N8dGFwfHNlbGVjdHxoaXQpXFxzKig/Om9uXFxzKyk/KD86dGhpc3x0aGF0fGhlcmV8aXQpXFxiL2ksXG59O1xuXG5jb25zdCBUWVBFX1BBVFRFUk5TID0ge1xuICAvLyBcImZpbGwgaW4gWCBmcm9tIFlcIiwgXCJmaWxsIFggY29weSBmcm9tIFlcIiwgXCJzZXQgWCBmcm9tIFlcIlxuICBjb3B5RnJvbVRhcmdldDogL1xcYig/OmZpbGwoPzpcXHMraW4pP3xzZXR8cG9wdWxhdGUpXFxzKyg/OnRoZVxccyspP1tcIiddPyguKz8pW1wiJ10/XFxzKyg/OmNvcHlcXHMrZnJvbXxmcm9tfHVzaW5nKVxccysoPzp0aGVcXHMrKT9bXCInXT8oLis/KVtcIiddP1xccyokL2ksXG4gIC8vIFwiY29weSBYIGludG8gWVwiLCBcImNvcHkgWCB0byBZXCJcbiAgY29weUludG9UYXJnZXQ6IC9cXGIoPzpjb3B5KVxccytbXCInXT8oLis/KVtcIiddP1xccysoPzppbnRvfHRvKVxccysoPzp0aGVcXHMrKT9bXCInXT8oLis/KVtcIiddP1xccyokL2ksXG4gIC8vIFwid3JpdGUgWCBpbnRvIFlcIiwgXCJ0eXBlIFggaW4gWVwiLCBcImVudGVyIFggdG8gWVwiXG4gIGludG9UYXJnZXQ6IC9cXGIoPzp0eXBlfGVudGVyfGlucHV0fHdyaXRlKVxccytbXCInXT8oLis/KVtcIiddP1xccysoPzppbnRvfGlufHRvKVxccysoPzp0aGVcXHMrKT9bXCInXT8oLis/KVtcIiddP1xccyokL2ksXG4gIC8vIFwiZmlsbCBZIHdpdGggWFwiLCBcInNldCBZIGFzIFhcIlxuICBmaWxsVGFyZ2V0OiAvXFxiKD86ZmlsbCg/Olxccytpbik/fHNldClcXHMrKD86dGhlXFxzKyk/W1wiJ10/KC4rPylbXCInXT9cXHMrKD86d2l0aHxhcylcXHMrW1wiJ10/KC4rPylbXCInXT9cXHMqJC9pLFxuICAvLyBcImZpbGwgaW4gc3NuX2NvbmZpcm1hdGlvblwiIC0+IGF1dG8taW5mZXIgZnJvbSBzc25cbiAgc3NuQ29uZmlybWF0aW9uOiAvXFxiKD86ZmlsbCg/Olxccytpbik/fHNldClcXHMrKD86dGhlXFxzKyk/c3NuX2NvbmZpcm1hdGlvblxcYi9pLFxuICAvLyBcInR5cGUgWFwiLCBcImVudGVyIFhcIiwgXCJpbnB1dCBYXCIsIFwiZmlsbCBpbiBYXCIgKGFtYmlndW91cyB2YWx1ZSlcbiAgdmFsdWVPbmx5OiAvXFxiKD86dHlwZXxlbnRlcnxpbnB1dHx3cml0ZXxmaWxsKD86XFxzK2luKT98c2V0KVxccypbXCInXT8oLis/KVtcIiddP1xccyokL2ksXG59O1xuXG5jb25zdCBOQVZJR0FUSU9OX1BBVFRFUk5TID0ge1xuICBiYWNrOiAvXFxiKGdvXFxzKmJhY2t8bmF2aWdhdGVcXHMqYmFja3xiYWNrKVxcYi9pLFxuICBmb3J3YXJkOiAvXFxiKGdvXFxzKmZvcndhcmR8bmF2aWdhdGVcXHMqZm9yd2FyZHxmb3J3YXJkKVxcYi9pLFxuICByZWZyZXNoOiAvXFxiKHJlZnJlc2h8cmVsb2FkKVxccyoodGhlXFxzKik/KHBhZ2UpP1xcYi9pLFxufTtcblxuY29uc3QgV0FJVF9QQVRURVJOUyA9IHtcbiAgd2FpdDogL1xcYih3YWl0fHBhdXNlfHNsZWVwKVxccyooPzpmb3JcXHMqKT8oXFxkKyk/XFxzKihzZWNvbmRzP3xzZWNzP3xtaWxsaXNlY29uZHM/fG1zKT9cXGIvaSxcbn07XG5cbmNvbnN0IENPTU1BTkRfTk9STUFMSVpBVElPTl9SVUxFUyA9IFtcbiAgWy9cXGJjb25maXJtYXRvblxcYi9naSwgJ2NvbmZpcm1hdGlvbiddLFxuICBbL1xcYmNvbmZpcm10aW9uXFxiL2dpLCAnY29uZmlybWF0aW9uJ10sXG4gIFsvXFxiY29uZnJpbWF0aW9uXFxiL2dpLCAnY29uZmlybWF0aW9uJ10sXG4gIFsvXFxiY29uZmltYXRpb25cXGIvZ2ksICdjb25maXJtYXRpb24nXSxcbiAgWy9cXGJzc25cXHMrY29uZmlybWF0aW9uXFxiL2dpLCAnc3NuX2NvbmZpcm1hdGlvbiddLFxuICBbL1xcYmFkcmVzc1xcYi9naSwgJ2FkZHJlc3MnXSxcbiAgWy9cXGJlbWlhbFxcYi9naSwgJ2VtYWlsJ11cbl07XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZU5hdHVyYWxDb21tYW5kSW5wdXQoaW5wdXQpIHtcbiAgbGV0IG5vcm1hbGl6ZWQgPSBTdHJpbmcoaW5wdXQgfHwgJycpO1xuICBmb3IgKGNvbnN0IFtwYXR0ZXJuLCByZXBsYWNlbWVudF0gb2YgQ09NTUFORF9OT1JNQUxJWkFUSU9OX1JVTEVTKSB7XG4gICAgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZWQucmVwbGFjZShwYXR0ZXJuLCByZXBsYWNlbWVudCk7XG4gIH1cbiAgcmV0dXJuIG5vcm1hbGl6ZWQucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRyaW0oKTtcbn1cblxuLyoqXG4gKiBQYXJzZSBuYXR1cmFsIGxhbmd1YWdlIGNvbW1hbmQgaW50byBzdHJ1Y3R1cmVkIGFjdGlvblxuICogQHBhcmFtIHtzdHJpbmd9IGlucHV0IC0gTmF0dXJhbCBsYW5ndWFnZSBjb21tYW5kXG4gKiBAcGFyYW0ge29iamVjdH0gY29udGV4dCAtIE9wdGlvbmFsIGNvbnRleHQgKGUuZy4sIGN1cnNvciBwb3NpdGlvbiwgbGFzdCBlbGVtZW50KVxuICogQHJldHVybnMge29iamVjdHxudWxsfSBQYXJzZWQgYWN0aW9uIG9yIG51bGwgaWYgbm90IHJlY29nbml6ZWRcbiAqL1xuZnVuY3Rpb24gcGFyc2VDb21tYW5kKGlucHV0LCBjb250ZXh0ID0ge30pIHtcbiAgaWYgKCFpbnB1dCB8fCB0eXBlb2YgaW5wdXQgIT09ICdzdHJpbmcnKSByZXR1cm4gbnVsbDtcbiAgXG4gIGNvbnN0IHRyaW1tZWQgPSBub3JtYWxpemVOYXR1cmFsQ29tbWFuZElucHV0KGlucHV0KTtcbiAgaWYgKCF0cmltbWVkKSByZXR1cm4gbnVsbDtcblxuICAvLyBDaGVjayBzY3JvbGwgY29tbWFuZHNcbiAgY29uc3Qgc2Nyb2xsQWN0aW9uID0gcGFyc2VTY3JvbGxDb21tYW5kKHRyaW1tZWQpO1xuICBpZiAoc2Nyb2xsQWN0aW9uKSByZXR1cm4gc2Nyb2xsQWN0aW9uO1xuXG4gIC8vIENoZWNrIGNsaWNrIGNvbW1hbmRzXG4gIGNvbnN0IGNsaWNrQWN0aW9uID0gcGFyc2VDbGlja0NvbW1hbmQodHJpbW1lZCwgY29udGV4dCk7XG4gIGlmIChjbGlja0FjdGlvbikgcmV0dXJuIGNsaWNrQWN0aW9uO1xuXG4gIC8vIENoZWNrIHR5cGUgY29tbWFuZHNcbiAgY29uc3QgdHlwZUFjdGlvbiA9IHBhcnNlVHlwZUNvbW1hbmQodHJpbW1lZCwgY29udGV4dCk7XG4gIGlmICh0eXBlQWN0aW9uKSByZXR1cm4gdHlwZUFjdGlvbjtcblxuICAvLyBDaGVjayBuYXZpZ2F0aW9uIGNvbW1hbmRzXG4gIGNvbnN0IG5hdkFjdGlvbiA9IHBhcnNlTmF2aWdhdGlvbkNvbW1hbmQodHJpbW1lZCk7XG4gIGlmIChuYXZBY3Rpb24pIHJldHVybiBuYXZBY3Rpb247XG5cbiAgLy8gQ2hlY2sgd2FpdCBjb21tYW5kc1xuICBjb25zdCB3YWl0QWN0aW9uID0gcGFyc2VXYWl0Q29tbWFuZCh0cmltbWVkKTtcbiAgaWYgKHdhaXRBY3Rpb24pIHJldHVybiB3YWl0QWN0aW9uO1xuXG4gIHJldHVybiBudWxsO1xufVxuXG4vKipcbiAqIFBhcnNlIHNjcm9sbCBjb21tYW5kc1xuICovXG5mdW5jdGlvbiBwYXJzZVNjcm9sbENvbW1hbmQoaW5wdXQpIHtcbiAgLy8gU2Nyb2xsIHVwXG4gIGlmIChTQ1JPTExfUEFUVEVSTlMudXAudGVzdChpbnB1dCkpIHtcbiAgICBjb25zdCBhbW91bnQgPSBleHRyYWN0U2Nyb2xsQW1vdW50KGlucHV0KTtcbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogJ3Njcm9sbCcsXG4gICAgICBkaXJlY3Rpb246ICd1cCcsXG4gICAgICBhbW91bnQ6IGFtb3VudCB8fCAtMzAwLFxuICAgICAgcmF3OiBpbnB1dFxuICAgIH07XG4gIH1cblxuICAvLyBTY3JvbGwgZG93blxuICBpZiAoU0NST0xMX1BBVFRFUk5TLmRvd24udGVzdChpbnB1dCkpIHtcbiAgICBjb25zdCBhbW91bnQgPSBleHRyYWN0U2Nyb2xsQW1vdW50KGlucHV0KTtcbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogJ3Njcm9sbCcsXG4gICAgICBkaXJlY3Rpb246ICdkb3duJyxcbiAgICAgIGFtb3VudDogYW1vdW50IHx8IDMwMCxcbiAgICAgIHJhdzogaW5wdXRcbiAgICB9O1xuICB9XG5cbiAgLy8gU2Nyb2xsIHRvIHRvcFxuICBpZiAoU0NST0xMX1BBVFRFUk5TLnRvcC50ZXN0KGlucHV0KSkge1xuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiAnc2Nyb2xsJyxcbiAgICAgIGRpcmVjdGlvbjogJ3RvcCcsXG4gICAgICBhbW91bnQ6IDAsXG4gICAgICBzY3JvbGxUbzogeyB0b3A6IDAgfSxcbiAgICAgIHJhdzogaW5wdXRcbiAgICB9O1xuICB9XG5cbiAgLy8gU2Nyb2xsIHRvIGJvdHRvbVxuICBpZiAoU0NST0xMX1BBVFRFUk5TLmJvdHRvbS50ZXN0KGlucHV0KSkge1xuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiAnc2Nyb2xsJyxcbiAgICAgIGRpcmVjdGlvbjogJ2JvdHRvbScsXG4gICAgICBhbW91bnQ6IDAsXG4gICAgICBzY3JvbGxUbzogeyB0b3A6ICdtYXgnIH0sXG4gICAgICByYXc6IGlucHV0XG4gICAgfTtcbiAgfVxuXG4gIC8vIFNjcm9sbCBsZWZ0XG4gIGlmIChTQ1JPTExfUEFUVEVSTlMubGVmdC50ZXN0KGlucHV0KSkge1xuICAgIGNvbnN0IGFtb3VudCA9IGV4dHJhY3RTY3JvbGxBbW91bnQoaW5wdXQpO1xuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiAnc2Nyb2xsJyxcbiAgICAgIGRpcmVjdGlvbjogJ2xlZnQnLFxuICAgICAgYW1vdW50OiBhbW91bnQgfHwgLTMwMCxcbiAgICAgIHJhdzogaW5wdXRcbiAgICB9O1xuICB9XG5cbiAgLy8gU2Nyb2xsIHJpZ2h0XG4gIGlmIChTQ1JPTExfUEFUVEVSTlMucmlnaHQudGVzdChpbnB1dCkpIHtcbiAgICBjb25zdCBhbW91bnQgPSBleHRyYWN0U2Nyb2xsQW1vdW50KGlucHV0KTtcbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogJ3Njcm9sbCcsXG4gICAgICBkaXJlY3Rpb246ICdyaWdodCcsXG4gICAgICBhbW91bnQ6IGFtb3VudCB8fCAzMDAsXG4gICAgICByYXc6IGlucHV0XG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG4vKipcbiAqIEV4dHJhY3Qgc2Nyb2xsIGFtb3VudCBmcm9tIGNvbW1hbmQgbGlrZSBcInNjcm9sbCBkb3duIDUwMCBwaXhlbHNcIlxuICovXG5mdW5jdGlvbiBleHRyYWN0U2Nyb2xsQW1vdW50KGlucHV0KSB7XG4gIGNvbnN0IG1hdGNoID0gaW5wdXQubWF0Y2goLyhcXGQrKVxccyoocGl4ZWxzP3xweCk/L2kpO1xuICBpZiAobWF0Y2gpIHtcbiAgICByZXR1cm4gcGFyc2VJbnQobWF0Y2hbMV0sIDEwKTtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuLyoqXG4gKiBQYXJzZSBjbGljayBjb21tYW5kc1xuICovXG5mdW5jdGlvbiBwYXJzZUNsaWNrQ29tbWFuZChpbnB1dCwgY29udGV4dCA9IHt9KSB7XG4gIC8vIENoZWNrIGRlaWN0aWMgcmVmZXJlbmNlcyBmaXJzdCAoXCJjbGljayB0aGlzXCIsIFwiY2xpY2sgdGhhdFwiKVxuICBpZiAoQ0xJQ0tfUEFUVEVSTlMuZGVpY3RpYy50ZXN0KGlucHV0KSkge1xuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiAnY2xpY2snLFxuICAgICAgdGFyZ2V0OiAnZGVpY3RpYycsXG4gICAgICB1c2VDb250ZXh0OiB0cnVlLFxuICAgICAgcmF3OiBpbnB1dFxuICAgIH07XG4gIH1cblxuICAvLyBDaGVjayBmb3IgdGFyZ2V0IHNwZWNpZmljYXRpb25cbiAgY29uc3QgdGFyZ2V0TWF0Y2ggPSBpbnB1dC5tYXRjaChDTElDS19QQVRURVJOUy50YXJnZXQpO1xuICBpZiAodGFyZ2V0TWF0Y2ggJiYgdGFyZ2V0TWF0Y2hbMV0pIHtcbiAgICBjb25zdCB0YXJnZXQgPSB0YXJnZXRNYXRjaFsxXS50cmltKCk7XG4gICAgLy8gQ2xlYW4gdXAgY29tbW9uIGFydGlmYWN0c1xuICAgIGNvbnN0IGNsZWFuVGFyZ2V0ID0gdGFyZ2V0XG4gICAgICAucmVwbGFjZSgvXFxzKihidXR0b258bGlua3xlbGVtZW50KSQvaSwgJycpXG4gICAgICAucmVwbGFjZSgvXih0aGV8YXxhbilcXHMrL2ksICcnKVxuICAgICAgLnRyaW0oKTtcbiAgICBcbiAgICBpZiAoY2xlYW5UYXJnZXQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHR5cGU6ICdjbGljaycsXG4gICAgICAgIHRhcmdldDogY2xlYW5UYXJnZXQsXG4gICAgICAgIGxhYmVsOiBjbGVhblRhcmdldCxcbiAgICAgICAgZmllbGQ6IGNsZWFuVGFyZ2V0LFxuICAgICAgICBuYW1lOiBjbGVhblRhcmdldCxcbiAgICAgICAgcmF3OiBpbnB1dFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICAvLyBHZW5lcmljIGNsaWNrIGRldGVjdGlvblxuICBpZiAoL1xcYmNsaWNrXFxiL2kudGVzdChpbnB1dCkpIHtcbiAgICAvLyBUcnkgdG8gZXh0cmFjdCB3aGF0ZXZlciBjb21lcyBhZnRlciBcImNsaWNrXCJcbiAgICBjb25zdCBhZnRlckNsaWNrID0gaW5wdXQucmVwbGFjZSgvLipcXGJjbGlja1xccyovaSwgJycpLnRyaW0oKTtcbiAgICBpZiAoYWZ0ZXJDbGljaykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdHlwZTogJ2NsaWNrJyxcbiAgICAgICAgdGFyZ2V0OiBhZnRlckNsaWNrLFxuICAgICAgICBsYWJlbDogYWZ0ZXJDbGljayxcbiAgICAgICAgZmllbGQ6IGFmdGVyQ2xpY2ssXG4gICAgICAgIG5hbWU6IGFmdGVyQ2xpY2ssXG4gICAgICAgIHJhdzogaW5wdXRcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG5cbi8qKlxuICogUGFyc2UgdHlwZS9pbnB1dCBjb21tYW5kc1xuICovXG5mdW5jdGlvbiBwYXJzZVR5cGVDb21tYW5kKGlucHV0LCBjb250ZXh0ID0ge30pIHtcbiAgY29uc3QgdHJpbUNhcHR1cmUgPSAodmFsdWUpID0+XG4gICAgU3RyaW5nKHZhbHVlIHx8ICcnKVxuICAgICAgLnJlcGxhY2UoL15bXCInXSt8W1wiJ10rJC9nLCAnJylcbiAgICAgIC5yZXBsYWNlKC9bLjssXFxzXSskL2csICcnKVxuICAgICAgLnRyaW0oKTtcblxuICAvLyBTcGVjaWFsIGNhc2U6IFNTTiBDb25maXJtYXRpb24gYXV0by1maWxsXG4gIGlmIChUWVBFX1BBVFRFUk5TLnNzbkNvbmZpcm1hdGlvbi50ZXN0KGlucHV0KSkge1xuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiAndHlwZScsXG4gICAgICBjb3B5RnJvbTogJ3NzbicsXG4gICAgICB0YXJnZXQ6ICdzc25fY29uZmlybWF0aW9uJyxcbiAgICAgIGxhYmVsOiAnU1NOIENvbmZpcm1hdGlvbicsXG4gICAgICBmaWVsZDogJ3Nzbl9jb25maXJtYXRpb24nLFxuICAgICAgbmFtZTogJ3Nzbl9jb25maXJtYXRpb24nLFxuICAgICAgcmF3OiBpbnB1dFxuICAgIH07XG4gIH1cblxuICBjb25zdCBjb3B5RnJvbU1hdGNoID0gaW5wdXQubWF0Y2goVFlQRV9QQVRURVJOUy5jb3B5RnJvbVRhcmdldCk7XG4gIGlmIChjb3B5RnJvbU1hdGNoICYmIGNvcHlGcm9tTWF0Y2hbMV0gJiYgY29weUZyb21NYXRjaFsyXSkge1xuICAgIGNvbnN0IHRhcmdldCA9IHRyaW1DYXB0dXJlKGNvcHlGcm9tTWF0Y2hbMV0pO1xuICAgIGNvbnN0IHNvdXJjZSA9IHRyaW1DYXB0dXJlKGNvcHlGcm9tTWF0Y2hbMl0pO1xuICAgIGlmICh0YXJnZXQgJiYgc291cmNlKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICB0eXBlOiAndHlwZScsXG4gICAgICAgIGNvcHlGcm9tOiBzb3VyY2UsXG4gICAgICAgIHRhcmdldCxcbiAgICAgICAgbGFiZWw6IHRhcmdldCxcbiAgICAgICAgZmllbGQ6IHRhcmdldCxcbiAgICAgICAgbmFtZTogdGFyZ2V0LFxuICAgICAgICByYXc6IGlucHV0XG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGNvcHlJbnRvTWF0Y2ggPSBpbnB1dC5tYXRjaChUWVBFX1BBVFRFUk5TLmNvcHlJbnRvVGFyZ2V0KTtcbiAgaWYgKGNvcHlJbnRvTWF0Y2ggJiYgY29weUludG9NYXRjaFsxXSAmJiBjb3B5SW50b01hdGNoWzJdKSB7XG4gICAgY29uc3Qgc291cmNlID0gdHJpbUNhcHR1cmUoY29weUludG9NYXRjaFsxXSk7XG4gICAgY29uc3QgdGFyZ2V0ID0gdHJpbUNhcHR1cmUoY29weUludG9NYXRjaFsyXSk7XG4gICAgaWYgKHRhcmdldCAmJiBzb3VyY2UpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHR5cGU6ICd0eXBlJyxcbiAgICAgICAgY29weUZyb206IHNvdXJjZSxcbiAgICAgICAgdGFyZ2V0LFxuICAgICAgICBsYWJlbDogdGFyZ2V0LFxuICAgICAgICBmaWVsZDogdGFyZ2V0LFxuICAgICAgICBuYW1lOiB0YXJnZXQsXG4gICAgICAgIHJhdzogaW5wdXRcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgY29uc3QgaW50b01hdGNoID0gaW5wdXQubWF0Y2goVFlQRV9QQVRURVJOUy5pbnRvVGFyZ2V0KTtcbiAgaWYgKGludG9NYXRjaCAmJiBpbnRvTWF0Y2hbMV0gJiYgaW50b01hdGNoWzJdKSB7XG4gICAgY29uc3QgdmFsdWUgPSB0cmltQ2FwdHVyZShpbnRvTWF0Y2hbMV0pO1xuICAgIGNvbnN0IHRhcmdldCA9IHRyaW1DYXB0dXJlKGludG9NYXRjaFsyXSk7XG4gICAgaWYgKHZhbHVlICYmIHRhcmdldCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdHlwZTogJ3R5cGUnLFxuICAgICAgICB2YWx1ZSxcbiAgICAgICAgdGFyZ2V0LFxuICAgICAgICBsYWJlbDogdGFyZ2V0LFxuICAgICAgICBmaWVsZDogdGFyZ2V0LFxuICAgICAgICBuYW1lOiB0YXJnZXQsXG4gICAgICAgIHJhdzogaW5wdXRcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZmlsbE1hdGNoID0gaW5wdXQubWF0Y2goVFlQRV9QQVRURVJOUy5maWxsVGFyZ2V0KTtcbiAgaWYgKGZpbGxNYXRjaCAmJiBmaWxsTWF0Y2hbMV0gJiYgZmlsbE1hdGNoWzJdKSB7XG4gICAgY29uc3QgdGFyZ2V0ID0gdHJpbUNhcHR1cmUoZmlsbE1hdGNoWzFdKTtcbiAgICBjb25zdCB2YWx1ZSA9IHRyaW1DYXB0dXJlKGZpbGxNYXRjaFsyXSk7XG4gICAgaWYgKHZhbHVlICYmIHRhcmdldCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdHlwZTogJ3R5cGUnLFxuICAgICAgICB2YWx1ZSxcbiAgICAgICAgdGFyZ2V0LFxuICAgICAgICBsYWJlbDogdGFyZ2V0LFxuICAgICAgICBmaWVsZDogdGFyZ2V0LFxuICAgICAgICBuYW1lOiB0YXJnZXQsXG4gICAgICAgIHJhdzogaW5wdXRcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgY29uc3QgdmFsdWVPbmx5TWF0Y2ggPSBpbnB1dC5tYXRjaChUWVBFX1BBVFRFUk5TLnZhbHVlT25seSk7XG4gIGlmICh2YWx1ZU9ubHlNYXRjaCAmJiB2YWx1ZU9ubHlNYXRjaFsxXSkge1xuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiAndHlwZScsXG4gICAgICB2YWx1ZTogdHJpbUNhcHR1cmUodmFsdWVPbmx5TWF0Y2hbMV0pLFxuICAgICAgcmF3OiBpbnB1dFxuICAgIH07XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbi8qKlxuICogUGFyc2UgbmF2aWdhdGlvbiBjb21tYW5kc1xuICovXG5mdW5jdGlvbiBwYXJzZU5hdmlnYXRpb25Db21tYW5kKGlucHV0KSB7XG4gIGlmIChOQVZJR0FUSU9OX1BBVFRFUk5TLmJhY2sudGVzdChpbnB1dCkpIHtcbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogJ25hdmlnYXRlJyxcbiAgICAgIGFjdGlvbjogJ2JhY2snLFxuICAgICAgcmF3OiBpbnB1dFxuICAgIH07XG4gIH1cblxuICBpZiAoTkFWSUdBVElPTl9QQVRURVJOUy5mb3J3YXJkLnRlc3QoaW5wdXQpKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHR5cGU6ICduYXZpZ2F0ZScsXG4gICAgICBhY3Rpb246ICdmb3J3YXJkJyxcbiAgICAgIHJhdzogaW5wdXRcbiAgICB9O1xuICB9XG5cbiAgaWYgKE5BVklHQVRJT05fUEFUVEVSTlMucmVmcmVzaC50ZXN0KGlucHV0KSkge1xuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiAnbmF2aWdhdGUnLFxuICAgICAgYWN0aW9uOiAncmVmcmVzaCcsXG4gICAgICByYXc6IGlucHV0XG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG4vKipcbiAqIFBhcnNlIHdhaXQgY29tbWFuZHNcbiAqL1xuZnVuY3Rpb24gcGFyc2VXYWl0Q29tbWFuZChpbnB1dCkge1xuICBjb25zdCBtYXRjaCA9IGlucHV0Lm1hdGNoKFdBSVRfUEFUVEVSTlMud2FpdCk7XG4gIGlmIChtYXRjaCkge1xuICAgIGxldCBkdXJhdGlvbiA9IHBhcnNlSW50KG1hdGNoWzJdLCAxMCkgfHwgMTtcbiAgICBjb25zdCB1bml0ID0gKG1hdGNoWzNdIHx8ICdzZWNvbmRzJykudG9Mb3dlckNhc2UoKTtcbiAgICBcbiAgICAvLyBDb252ZXJ0IHRvIG1pbGxpc2Vjb25kc1xuICAgIGlmICh1bml0LnN0YXJ0c1dpdGgoJ21zJykgfHwgdW5pdC5zdGFydHNXaXRoKCdtaWxsaScpKSB7XG4gICAgICAvLyBBbHJlYWR5IGluIG1zXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEFzc3VtZSBzZWNvbmRzXG4gICAgICBkdXJhdGlvbiA9IGR1cmF0aW9uICogMTAwMDtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogJ3dhaXQnLFxuICAgICAgZHVyYXRpb246IE1hdGgubWluKGR1cmF0aW9uLCAzMDAwMCksIC8vIENhcCBhdCAzMCBzZWNvbmRzXG4gICAgICByYXc6IGlucHV0XG4gICAgfTtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuLyoqXG4gKiBDb252ZXJ0IHBhcnNlZCBjb21tYW5kIHRvIGV4ZWN1dGFibGUgYWN0aW9uIGZvciBkb21fcnVudGltZS9hY3Rpb24tZXhlY3V0b3JcbiAqL1xuZnVuY3Rpb24gdG9FeGVjdXRhYmxlQWN0aW9uKHBhcnNlZCkge1xuICBpZiAoIXBhcnNlZCkgcmV0dXJuIG51bGw7XG5cbiAgc3dpdGNoIChwYXJzZWQudHlwZSkge1xuICAgIGNhc2UgJ3Njcm9sbCc6XG4gICAgICByZXR1cm4gYnVpbGRTY3JvbGxBY3Rpb24ocGFyc2VkKTtcbiAgICBjYXNlICdjbGljayc6XG4gICAgICByZXR1cm4gYnVpbGRDbGlja0FjdGlvbihwYXJzZWQpO1xuICAgIGNhc2UgJ3R5cGUnOlxuICAgICAgcmV0dXJuIGJ1aWxkVHlwZUFjdGlvbihwYXJzZWQpO1xuICAgIGNhc2UgJ25hdmlnYXRlJzpcbiAgICAgIHJldHVybiBidWlsZE5hdmlnYXRlQWN0aW9uKHBhcnNlZCk7XG4gICAgY2FzZSAnd2FpdCc6XG4gICAgICByZXR1cm4geyB0eXBlOiAnd2FpdCcsIGR1cmF0aW9uOiBwYXJzZWQuZHVyYXRpb24gfTtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZnVuY3Rpb24gYnVpbGRTY3JvbGxBY3Rpb24ocGFyc2VkKSB7XG4gIGNvbnN0IGFjdGlvbiA9IHsgdHlwZTogJ3Njcm9sbCcgfTtcbiAgXG4gIGlmIChwYXJzZWQuc2Nyb2xsVG8pIHtcbiAgICAvLyBBYnNvbHV0ZSBzY3JvbGwgcG9zaXRpb25cbiAgICBhY3Rpb24uc2Nyb2xsVG8gPSBwYXJzZWQuc2Nyb2xsVG87XG4gIH0gZWxzZSB7XG4gICAgLy8gUmVsYXRpdmUgc2Nyb2xsXG4gICAgc3dpdGNoIChwYXJzZWQuZGlyZWN0aW9uKSB7XG4gICAgICBjYXNlICd1cCc6XG4gICAgICAgIGFjdGlvbi5hbW91bnQgPSAtTWF0aC5hYnMocGFyc2VkLmFtb3VudCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnZG93bic6XG4gICAgICAgIGFjdGlvbi5hbW91bnQgPSBNYXRoLmFicyhwYXJzZWQuYW1vdW50KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdsZWZ0JzpcbiAgICAgICAgYWN0aW9uLmhvcml6b250YWwgPSAtTWF0aC5hYnMocGFyc2VkLmFtb3VudCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAncmlnaHQnOlxuICAgICAgICBhY3Rpb24uaG9yaXpvbnRhbCA9IE1hdGguYWJzKHBhcnNlZC5hbW91bnQpO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgXG4gIHJldHVybiBhY3Rpb247XG59XG5cbmZ1bmN0aW9uIGJ1aWxkQ2xpY2tBY3Rpb24ocGFyc2VkKSB7XG4gIGlmIChwYXJzZWQudXNlQ29udGV4dCkge1xuICAgIC8vIERlaWN0aWMgcmVmZXJlbmNlIC0gcmVseSBvbiBjb250ZXh0IChjdXJzb3IgcG9zaXRpb24sIGxhc3QgaGlnaGxpZ2h0ZWQgZWxlbWVudClcbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogJ2NsaWNrJyxcbiAgICAgIHVzZUNvbnRleHQ6IHRydWVcbiAgICB9O1xuICB9XG4gIFxuICByZXR1cm4ge1xuICAgIHR5cGU6ICdjbGljaycsXG4gICAgbGFiZWw6IHBhcnNlZC5sYWJlbCB8fCBwYXJzZWQudGFyZ2V0LFxuICAgIGZpZWxkOiBwYXJzZWQuZmllbGQgfHwgcGFyc2VkLnRhcmdldCxcbiAgICBuYW1lOiBwYXJzZWQubmFtZSB8fCBwYXJzZWQudGFyZ2V0XG4gIH07XG59XG5cbmZ1bmN0aW9uIGJ1aWxkVHlwZUFjdGlvbihwYXJzZWQpIHtcbiAgY29uc3QgYWN0aW9uID0ge1xuICAgIHR5cGU6ICd0eXBlJyxcbiAgICB2YWx1ZTogcGFyc2VkLnZhbHVlXG4gIH07XG4gIGlmIChwYXJzZWQuY29weUZyb20pIHtcbiAgICBhY3Rpb24uY29weUZyb20gPSBwYXJzZWQuY29weUZyb207XG4gIH1cbiAgaWYgKHBhcnNlZC50YXJnZXQpIHtcbiAgICBhY3Rpb24ubGFiZWwgPSBwYXJzZWQubGFiZWwgfHwgcGFyc2VkLnRhcmdldDtcbiAgICBhY3Rpb24uZmllbGQgPSBwYXJzZWQuZmllbGQgfHwgcGFyc2VkLnRhcmdldDtcbiAgICBhY3Rpb24ubmFtZSA9IHBhcnNlZC5uYW1lIHx8IHBhcnNlZC50YXJnZXQ7XG4gIH1cbiAgcmV0dXJuIGFjdGlvbjtcbn1cblxuZnVuY3Rpb24gYnVpbGROYXZpZ2F0ZUFjdGlvbihwYXJzZWQpIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiAnc2NyaXB0JyxcbiAgICBjb2RlOiBnZXROYXZpZ2F0aW9uU2NyaXB0KHBhcnNlZC5hY3Rpb24pXG4gIH07XG59XG5cbmZ1bmN0aW9uIGdldE5hdmlnYXRpb25TY3JpcHQoYWN0aW9uKSB7XG4gIHN3aXRjaCAoYWN0aW9uKSB7XG4gICAgY2FzZSAnYmFjayc6XG4gICAgICByZXR1cm4gJ3dpbmRvdy5oaXN0b3J5LmJhY2soKTsnO1xuICAgIGNhc2UgJ2ZvcndhcmQnOlxuICAgICAgcmV0dXJuICd3aW5kb3cuaGlzdG9yeS5mb3J3YXJkKCk7JztcbiAgICBjYXNlICdyZWZyZXNoJzpcbiAgICAgIHJldHVybiAnd2luZG93LmxvY2F0aW9uLnJlbG9hZCgpOyc7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnJztcbiAgfVxufVxuXG4vKipcbiAqIENoZWNrIGlmIGlucHV0IGxvb2tzIGxpa2UgYSBuYXR1cmFsIGxhbmd1YWdlIGNvbW1hbmRcbiAqL1xuZnVuY3Rpb24gaXNOYXR1cmFsTGFuZ3VhZ2VDb21tYW5kKGlucHV0KSB7XG4gIGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSAnc3RyaW5nJykgcmV0dXJuIGZhbHNlO1xuICBjb25zdCB0cmltbWVkID0gaW5wdXQudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gIFxuICAvLyBDaGVjayBmb3IgY29tbWFuZC1saWtlIHBhdHRlcm5zXG4gIGNvbnN0IGNvbW1hbmRQYXR0ZXJucyA9IFtcbiAgICAvXihzY3JvbGx8Y2xpY2t8dGFwfHByZXNzfHR5cGV8ZW50ZXJ8aW5wdXR8d3JpdGV8ZmlsbHxzZXR8Y29weXxnb3xuYXZpZ2F0ZXx3YWl0fHBhdXNlfHJlZnJlc2h8cmVsb2FkKS9pLFxuICAgIC9cXGIoc2Nyb2xsXFxzKih1cHxkb3dufGxlZnR8cmlnaHR8dG8pKVxcYi9pLFxuICAgIC9cXGIoY2xpY2tcXHMqKG9ufHRoZSk/KVxcYi9pLFxuICAgIC9cXGIoZmlsbCg/Olxccytpbik/XFxzKy4rXFxzKyg/OmNvcHlcXHMrZnJvbXxmcm9tKVxccysuKylcXGIvaSxcbiAgICAvXFxicGFnZVxccyoodXB8ZG93bilcXGIvaSxcbiAgXTtcbiAgXG4gIHJldHVybiBjb21tYW5kUGF0dGVybnMuc29tZShwYXR0ZXJuID0+IHBhdHRlcm4udGVzdCh0cmltbWVkKSk7XG59XG5cbi8qKlxuICogQmF0Y2ggcGFyc2UgbXVsdGlwbGUgY29tbWFuZHMgKGUuZy4sIFwic2Nyb2xsIGRvd24gdGhlbiBjbGljayBzdWJtaXRcIilcbiAqL1xuZnVuY3Rpb24gcGFyc2VDb21tYW5kU2VxdWVuY2UoaW5wdXQpIHtcbiAgaWYgKCFpbnB1dCB8fCB0eXBlb2YgaW5wdXQgIT09ICdzdHJpbmcnKSByZXR1cm4gW107XG4gIFxuICAvLyBTcGxpdCBvbiBjb21tb24gc2VxdWVuY2Ugd29yZHNcbiAgY29uc3QgcGFydHMgPSBpbnB1dC5zcGxpdCgvXFxzKig/OnRoZW58YW5kXFxzK3RoZW58LFxccyp0aGVufCxcXHMqYW5kfGFuZClcXHMqL2kpO1xuICBcbiAgY29uc3QgYWN0aW9ucyA9IFtdO1xuICBmb3IgKGNvbnN0IHBhcnQgb2YgcGFydHMpIHtcbiAgICBjb25zdCBwYXJzZWQgPSBwYXJzZUNvbW1hbmQocGFydC50cmltKCkpO1xuICAgIGlmIChwYXJzZWQpIHtcbiAgICAgIGNvbnN0IGV4ZWN1dGFibGUgPSB0b0V4ZWN1dGFibGVBY3Rpb24ocGFyc2VkKTtcbiAgICAgIGlmIChleGVjdXRhYmxlKSB7XG4gICAgICAgIGFjdGlvbnMucHVzaChleGVjdXRhYmxlKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgXG4gIHJldHVybiBhY3Rpb25zO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQUkgSU5URU5UIEFOQUxZU0lTXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIEFuYWx5emUgZ29hbCB0ZXh0IHRvIGRldGVybWluZSBpbnRlbnQgY2F0ZWdvcnlcbiAqL1xuZnVuY3Rpb24gYW5hbHl6ZUludGVudChnb2FsKSB7XG4gIGNvbnN0IGdvYWxMb3dlciA9IChnb2FsIHx8ICcnKS50b0xvd2VyQ2FzZSgpLnRyaW0oKTtcbiAgaWYgKCFnb2FsTG93ZXIpIHtcbiAgICByZXR1cm4geyBjYXRlZ29yeTogJ2Zvcm1fZmlsbCcsIGNvbmZpZGVuY2U6IDAuMywgc3RyYXRlZ3k6ICdFeGVjdXRlIGJhc2ljIGFjdGlvbnMnLCBrZXl3b3JkczogW10sIGNvbXBsZXhpdHk6ICdzaW1wbGUnIH07XG4gIH1cblxuICBjb25zdCBzY29yZXMgPSB7fTtcbiAgY29uc3QgbWF0Y2hlZEtleXdvcmRzID0ge307XG5cbiAgZm9yIChjb25zdCBbY2F0ZWdvcnksIGNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoSU5URU5UX0NBVEVHT1JJRVMpKSB7XG4gICAgc2NvcmVzW2NhdGVnb3J5XSA9IDA7XG4gICAgbWF0Y2hlZEtleXdvcmRzW2NhdGVnb3J5XSA9IFtdO1xuICAgIGZvciAoY29uc3Qga2V5d29yZCBvZiBjb25maWcua2V5d29yZHMpIHtcbiAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke2tleXdvcmR9XFxcXGJgLCAnZ2knKTtcbiAgICAgIGNvbnN0IG1hdGNoZXMgPSBnb2FsTG93ZXIubWF0Y2gocmVnZXgpO1xuICAgICAgaWYgKG1hdGNoZXMpIHtcbiAgICAgICAgc2NvcmVzW2NhdGVnb3J5XSArPSBtYXRjaGVzLmxlbmd0aDtcbiAgICAgICAgbWF0Y2hlZEtleXdvcmRzW2NhdGVnb3J5XS5wdXNoKGtleXdvcmQpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZ29hbExvd2VyLmluY2x1ZGVzKGNhdGVnb3J5LnJlcGxhY2UoJ18nLCAnICcpKSkgc2NvcmVzW2NhdGVnb3J5XSArPSAzO1xuICB9XG5cbiAgbGV0IGJlc3RDYXRlZ29yeSA9ICdmb3JtX2ZpbGwnO1xuICBsZXQgYmVzdFNjb3JlID0gMDtcbiAgZm9yIChjb25zdCBbY2F0ZWdvcnksIHNjb3JlXSBvZiBPYmplY3QuZW50cmllcyhzY29yZXMpKSB7XG4gICAgaWYgKHNjb3JlID4gYmVzdFNjb3JlKSB7IGJlc3RTY29yZSA9IHNjb3JlOyBiZXN0Q2F0ZWdvcnkgPSBjYXRlZ29yeTsgfVxuICB9XG5cbiAgY29uc3QgY29uZmlnID0gSU5URU5UX0NBVEVHT1JJRVNbYmVzdENhdGVnb3J5XTtcbiAgbGV0IGNvbXBsZXhpdHkgPSBjb25maWcuY29tcGxleGl0eTtcbiAgaWYgKFsnYWxsJywgJ2V2ZXJ5JywgJ2NvbXBsZXRlJywgJ2VudGlyZScsICdtdWx0aXBsZSddLnNvbWUoaW5kID0+IGdvYWxMb3dlci5pbmNsdWRlcyhpbmQpKSkgY29tcGxleGl0eSA9ICdjb21wbGV4JztcbiAgZWxzZSBpZiAoWydqdXN0JywgJ29ubHknLCAnc2luZ2xlJywgJ29uZSddLnNvbWUoaW5kID0+IGdvYWxMb3dlci5pbmNsdWRlcyhpbmQpKSkgY29tcGxleGl0eSA9ICdzaW1wbGUnO1xuXG4gIHJldHVybiB7XG4gICAgY2F0ZWdvcnk6IGJlc3RDYXRlZ29yeSxcbiAgICBjb25maWRlbmNlOiBNYXRoLm1pbigxLCBiZXN0U2NvcmUgLyA1KSxcbiAgICBzdHJhdGVneTogY29uZmlnLnN0cmF0ZWd5LFxuICAgIGtleXdvcmRzOiBtYXRjaGVkS2V5d29yZHNbYmVzdENhdGVnb3J5XSxcbiAgICBjb21wbGV4aXR5LFxuICAgIGRlc2NyaXB0aW9uOiBjb25maWcuZGVzY3JpcHRpb25cbiAgfTtcbn1cblxuLyoqXG4gKiBTZWxlY3Qgb3B0aW1hbCBicmFpbiBjb25maWd1cmF0aW9uIGJhc2VkIG9uIGludGVudFxuICovXG5mdW5jdGlvbiBzZWxlY3RTdHJhdGVneShpbnRlbnRBbmFseXNpcywgY3VycmVudENvbmZpZyA9IHt9LCBvcHRpb25zID0ge30pIHtcbiAgY29uc3QgY29uZmlnID0gSU5URU5UX0NBVEVHT1JJRVNbaW50ZW50QW5hbHlzaXMuY2F0ZWdvcnldO1xuICBsZXQgcHJvdmlkZXIgPSBjb25maWcucHJlZmVycmVkUHJvdmlkZXI7XG4gIGxldCBtb2RlbCA9IGNvbmZpZy5wcmVmZXJyZWRNb2RlbDtcblxuICBpZiAoaW50ZW50QW5hbHlzaXMuY29tcGxleGl0eSA9PT0gJ2NvbXBsZXgnKSB7XG4gICAgaWYgKHByb3ZpZGVyID09PSAnZGVlcHNlZWsnICYmIG1vZGVsID09PSAnZGVlcHNlZWstY2hhdCcpIG1vZGVsID0gJ2RlZXBzZWVrLXJlYXNvbmVyJztcbiAgfVxuXG4gIGNvbnN0IGNvbmZpZ1Byb3ZpZGVyID0gU3RyaW5nKGN1cnJlbnRDb25maWcucHJvdmlkZXIgfHwgJycpLnRyaW0oKTtcbiAgaWYgKGNvbmZpZ1Byb3ZpZGVyICYmIGNvbmZpZ1Byb3ZpZGVyICE9PSAnYmFja2VuZCcpIHtcbiAgICBwcm92aWRlciA9IGNvbmZpZ1Byb3ZpZGVyO1xuICAgIG1vZGVsID0gY3VycmVudENvbmZpZy5tb2RlbCB8fCBtb2RlbDtcbiAgfVxuXG4gIGlmIChvcHRpb25zLnByZWZlclNwZWVkICYmIG1vZGVsID09PSAnZGVlcHNlZWstcmVhc29uZXInKSBtb2RlbCA9ICdkZWVwc2Vlay1jaGF0JztcblxuICByZXR1cm4ge1xuICAgIHByb3ZpZGVyLCBtb2RlbCxcbiAgICBzdHJhdGVneTogaW50ZW50QW5hbHlzaXMuc3RyYXRlZ3ksXG4gICAgY2F0ZWdvcnk6IGludGVudEFuYWx5c2lzLmNhdGVnb3J5LFxuICAgIGNvbXBsZXhpdHk6IGludGVudEFuYWx5c2lzLmNvbXBsZXhpdHksXG4gICAgY29uZmlkZW5jZTogaW50ZW50QW5hbHlzaXMuY29uZmlkZW5jZVxuICB9O1xufVxuXG4vKipcbiAqIEVuaGFuY2UgZ29hbCB3aXRoIGNvbnRleHR1YWwgaGludHNcbiAqL1xuZnVuY3Rpb24gZW5oYW5jZUdvYWwoZ29hbCwgY29udGV4dCA9IHt9LCBpbnRlbnRBbmFseXNpcyA9IG51bGwpIHtcbiAgY29uc3QgYW5hbHlzaXMgPSBpbnRlbnRBbmFseXNpcyB8fCBhbmFseXplSW50ZW50KGdvYWwpO1xuICBjb25zdCBlbmhhbmNlZCA9IHsgb3JpZ2luYWw6IGdvYWwsIGVuaGFuY2VkOiBnb2FsLCBoaW50czogW10gfTtcbiAgY29uc3QgdXJsID0gY29udGV4dC51cmwgfHwgJyc7XG5cbiAgaWYgKHVybC5pbmNsdWRlcygnZm9ybScpIHx8IHVybC5pbmNsdWRlcygnYXBwbHknKSB8fCB1cmwuaW5jbHVkZXMoJ3JlZ2lzdGVyJykpIHtcbiAgICBlbmhhbmNlZC5oaW50cy5wdXNoKCdQYWdlIGFwcGVhcnMgdG8gYmUgYSBmb3JtIC0gcHJpb3JpdGl6ZSBmaWVsZCBkZXRlY3Rpb24nKTtcbiAgfVxuICBpZiAodXJsLmluY2x1ZGVzKCdsb2dpbicpIHx8IHVybC5pbmNsdWRlcygnc2lnbmluJykpIHtcbiAgICBlbmhhbmNlZC5oaW50cy5wdXNoKCdMb2dpbiBwYWdlIGRldGVjdGVkIC0gaGFuZGxlIGNyZWRlbnRpYWxzIGNhcmVmdWxseScpO1xuICB9XG4gIGlmICh1cmwuaW5jbHVkZXMoJ2NhcnQnKSB8fCB1cmwuaW5jbHVkZXMoJ2NoZWNrb3V0JykpIHtcbiAgICBlbmhhbmNlZC5oaW50cy5wdXNoKCdFLWNvbW1lcmNlIGZsb3cgZGV0ZWN0ZWQgLSB2ZXJpZnkgYmVmb3JlIHN1Ym1pdHRpbmcnKTtcbiAgfVxuICBpZiAoYW5hbHlzaXMuY29tcGxleGl0eSA9PT0gJ2NvbXBsZXgnKSB7XG4gICAgZW5oYW5jZWQuaGludHMucHVzaCgnQnJlYWsgaW50byBzbWFsbGVyIHN0ZXBzIGlmIG5lZWRlZCcpO1xuICB9XG5cbiAgcmV0dXJuIGVuaGFuY2VkO1xufVxuXG4vKipcbiAqIEFkanVzdCBzdHJhdGVneSBhZnRlciBhIGZhaWx1cmVcbiAqL1xuZnVuY3Rpb24gYWRqdXN0U3RyYXRlZ3lPbkZhaWx1cmUocHJldmlvdXNTdHJhdGVneSwgZXJyb3JNZXNzYWdlID0gJycsIGF0dGVtcHROdW1iZXIgPSAxKSB7XG4gIGNvbnN0IGFkanVzdGVkID0geyAuLi5wcmV2aW91c1N0cmF0ZWd5IH07XG5cbiAgaWYgKGF0dGVtcHROdW1iZXIgPj0gMikge1xuICAgIGlmIChwcmV2aW91c1N0cmF0ZWd5LnByb3ZpZGVyID09PSAnZ2VtaW5pJykge1xuICAgICAgYWRqdXN0ZWQucHJvdmlkZXIgPSAnZGVlcHNlZWsnOyBhZGp1c3RlZC5tb2RlbCA9ICdkZWVwc2Vlay1jaGF0JztcbiAgICB9IGVsc2UgaWYgKHByZXZpb3VzU3RyYXRlZ3kubW9kZWwgPT09ICdkZWVwc2Vlay1jaGF0Jykge1xuICAgICAgYWRqdXN0ZWQubW9kZWwgPSAnZGVlcHNlZWstcmVhc29uZXInO1xuICAgIH0gZWxzZSBpZiAocHJldmlvdXNTdHJhdGVneS5wcm92aWRlciA9PT0gJ2RlZXBzZWVrJykge1xuICAgICAgYWRqdXN0ZWQucHJvdmlkZXIgPSAnb3BlbmFpJzsgYWRqdXN0ZWQubW9kZWwgPSAnZ3B0LTRvJztcbiAgICB9XG4gIH1cblxuICBjb25zdCBlcnJvckxvd2VyID0gKGVycm9yTWVzc2FnZSB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgaWYgKGVycm9yTG93ZXIuaW5jbHVkZXMoJ3RpbWVvdXQnKSkgYWRqdXN0ZWQuY29tcGxleGl0eSA9ICdzaW1wbGUnO1xuICBpZiAoZXJyb3JMb3dlci5pbmNsdWRlcygnbm90IGZvdW5kJykpIGFkanVzdGVkLmhpbnRzID0gWydUcnkgc2Nyb2xsaW5nIHRvIGZpbmQgZWxlbWVudCddO1xuXG4gIGFkanVzdGVkLmlzUmV0cnkgPSB0cnVlO1xuICBhZGp1c3RlZC5wcmV2aW91c0F0dGVtcHQgPSBhdHRlbXB0TnVtYmVyO1xuICByZXR1cm4gYWRqdXN0ZWQ7XG59XG5cbi8qKlxuICogTWFpbiBDb3J0ZXggQUkgcm91dGluZyBmdW5jdGlvblxuICovXG5mdW5jdGlvbiByb3V0ZShnb2FsLCBjb250ZXh0ID0ge30sIGN1cnJlbnRDb25maWcgPSB7fSwgb3B0aW9ucyA9IHt9KSB7XG4gIGNvbnN0IGludGVudEFuYWx5c2lzID0gYW5hbHl6ZUludGVudChnb2FsKTtcbiAgY29uc3Qgc3RyYXRlZ3kgPSBzZWxlY3RTdHJhdGVneShpbnRlbnRBbmFseXNpcywgY3VycmVudENvbmZpZywgb3B0aW9ucyk7XG4gIGNvbnN0IGVuaGFuY2VkID0gZW5oYW5jZUdvYWwoZ29hbCwgY29udGV4dCwgaW50ZW50QW5hbHlzaXMpO1xuXG4gIHJldHVybiB7XG4gICAgdmVyc2lvbjogQ09SVEVYX1ZFUlNJT04sXG4gICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgIGludGVudDoge1xuICAgICAgY2F0ZWdvcnk6IGludGVudEFuYWx5c2lzLmNhdGVnb3J5LFxuICAgICAgY29uZmlkZW5jZTogaW50ZW50QW5hbHlzaXMuY29uZmlkZW5jZSxcbiAgICAgIGNvbXBsZXhpdHk6IGludGVudEFuYWx5c2lzLmNvbXBsZXhpdHksXG4gICAgICBrZXl3b3JkczogaW50ZW50QW5hbHlzaXMua2V5d29yZHNcbiAgICB9LFxuICAgIHN0cmF0ZWd5OiB7XG4gICAgICBwcm92aWRlcjogc3RyYXRlZ3kucHJvdmlkZXIsXG4gICAgICBtb2RlbDogc3RyYXRlZ3kubW9kZWwsXG4gICAgICBkZXNjcmlwdGlvbjogc3RyYXRlZ3kuc3RyYXRlZ3lcbiAgICB9LFxuICAgIGdvYWw6IHsgb3JpZ2luYWw6IGdvYWwsIGVuaGFuY2VkOiBlbmhhbmNlZC5lbmhhbmNlZCwgaGludHM6IGVuaGFuY2VkLmhpbnRzIH0sXG4gICAgY29udGV4dDogeyB1cmw6IGNvbnRleHQudXJsIHx8ICcnLCB0aXRsZTogY29udGV4dC50aXRsZSB8fCAnJyB9XG4gIH07XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBFWFBPUlRTXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyBFeHBvcnQgZm9yIHVzZSBpbiBvdGhlciBtb2R1bGVzIChOb2RlLmpzKVxuaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gIG1vZHVsZS5leHBvcnRzID0ge1xuICAgIC8vIE5MIENvbW1hbmQgUGFyc2luZ1xuICAgIHBhcnNlQ29tbWFuZCxcbiAgICBwYXJzZUNvbW1hbmRTZXF1ZW5jZSxcbiAgICB0b0V4ZWN1dGFibGVBY3Rpb24sXG4gICAgaXNOYXR1cmFsTGFuZ3VhZ2VDb21tYW5kLFxuICAgIFNDUk9MTF9QQVRURVJOUyxcbiAgICBDTElDS19QQVRURVJOUyxcbiAgICAvLyBBSSBSb3V0aW5nXG4gICAgcm91dGUsXG4gICAgYW5hbHl6ZUludGVudCxcbiAgICBzZWxlY3RTdHJhdGVneSxcbiAgICBlbmhhbmNlR29hbCxcbiAgICBhZGp1c3RTdHJhdGVneU9uRmFpbHVyZSxcbiAgICBJTlRFTlRfQ0FURUdPUklFUyxcbiAgICBNT0RFTF9DQVBBQklMSVRJRVMsXG4gICAgQ09SVEVYX1ZFUlNJT05cbiAgfTtcbn1cblxuLy8gTWFrZSBhdmFpbGFibGUgZ2xvYmFsbHkgZm9yIGNvbnRlbnQgc2NyaXB0IHVzZVxuaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7XG4gIHdpbmRvdy5CaWxnZUNvcnRleCA9IHtcbiAgICAvLyBOTCBDb21tYW5kIFBhcnNpbmdcbiAgICBwYXJzZUNvbW1hbmQsXG4gICAgcGFyc2VDb21tYW5kU2VxdWVuY2UsXG4gICAgdG9FeGVjdXRhYmxlQWN0aW9uLFxuICAgIGlzTmF0dXJhbExhbmd1YWdlQ29tbWFuZCxcbiAgICAvLyBBSSBSb3V0aW5nXG4gICAgcm91dGUsXG4gICAgYW5hbHl6ZUludGVudCxcbiAgICBzZWxlY3RTdHJhdGVneSxcbiAgICBlbmhhbmNlR29hbCxcbiAgICBhZGp1c3RTdHJhdGVneU9uRmFpbHVyZSxcbiAgICBJTlRFTlRfQ0FURUdPUklFUyxcbiAgICBNT0RFTF9DQVBBQklMSVRJRVMsXG4gICAgdmVyc2lvbjogQ09SVEVYX1ZFUlNJT05cbiAgfTtcbn1cblxuLy8gQWxzbyBleHBvc2UgYXMgZ2xvYmFsVGhpcy5Db3J0ZXggZm9yIGJhY2tncm91bmQgc2VydmljZSB3b3JrZXJcbmlmICh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgZ2xvYmFsVGhpcy5Db3J0ZXggPSB7XG4gICAgdmVyc2lvbjogQ09SVEVYX1ZFUlNJT04sXG4gICAgcm91dGUsXG4gICAgYW5hbHl6ZUludGVudCxcbiAgICBzZWxlY3RTdHJhdGVneSxcbiAgICBlbmhhbmNlR29hbCxcbiAgICBhZGp1c3RTdHJhdGVneU9uRmFpbHVyZSxcbiAgICBJTlRFTlRfQ0FURUdPUklFUyxcbiAgICBNT0RFTF9DQVBBQklMSVRJRVNcbiAgfTtcbn1cblxud2luZG93Ll9fYmlsZ2VfY29ydGV4X2xvYWRlZCA9IHRydWU7XG5jb25zb2xlLmxvZyhgW0NvcnRleCB2JHtDT1JURVhfVkVSU0lPTn1dIFVuaWZpZWQgQUkgUm91dGVyICYgTkwgUGFyc2VyIGluaXRpYWxpemVkYCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7O0FBWUEsSUFBTSxpQkFBaUI7QUFNdkIsSUFBTSxvQkFBb0I7QUFBQSxFQUN4QixXQUFXO0FBQUEsSUFDVCxhQUFhO0FBQUEsSUFDYixVQUFVLENBQUMsUUFBUSxTQUFTLFNBQVMsUUFBUSxVQUFVLFFBQVEsU0FBUyxNQUFNO0FBQUEsSUFDOUUsVUFBVTtBQUFBLElBQ1YsbUJBQW1CO0FBQUEsSUFDbkIsZ0JBQWdCO0FBQUEsSUFDaEIsWUFBWTtBQUFBLEVBQ2Q7QUFBQSxFQUNBLGtCQUFrQjtBQUFBLElBQ2hCLGFBQWE7QUFBQSxJQUNiLFVBQVUsQ0FBQyxPQUFPLG1CQUFt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
