/**
 * Runtime environment utilities
 * Falls back to defaults if __BILGE_ENV__ not injected
 */
function getInjectedEnv() {
  try {
    const g = typeof globalThis !== 'undefined' ? globalThis : null;
    if (g && g.__BILGE_ENV__ && typeof g.__BILGE_ENV__ === 'object') {
      return g.__BILGE_ENV__;
    }
  } catch {}
  return null;
}

function getEnvFromBuildDefines() {
  // These identifiers are replaced at build time by esbuild `define` in `build.mjs`.
  const hasDefines =
    typeof __BILGE_ENV__ !== 'undefined' ||
    typeof __MCP_BASE_URL__ !== 'undefined' ||
    typeof __ENABLE_HOT_RELOAD__ !== 'undefined' ||
    typeof __VERSION__ !== 'undefined';

  if (!hasDefines) return null;

  // MODE is used for logger levels and feature gating.
  // Accept both modern (`development`/`production`) and short (`dev`/`prod`) spellings.
  const inferredMode =
    typeof __BILGE_ENV__ !== 'undefined'
      ? __BILGE_ENV__
      : typeof __BUILD_MODE__ !== 'undefined' && __BUILD_MODE__ === 'prod'
        ? 'production'
        : 'development';

  return {
    MODE: inferredMode,
    DEBUG: typeof __BILGE_DEBUG__ !== 'undefined' ? __BILGE_DEBUG__ : true,
    VERSION: typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev',
    MCP_BASE_URL: typeof __MCP_BASE_URL__ !== 'undefined' ? __MCP_BASE_URL__ : 'http://localhost:8787',
    MCP_WS_URL: typeof __MCP_WS_URL__ !== 'undefined' ? __MCP_WS_URL__ : 'ws://localhost:8787/ws',
    DEFAULT_BRAIN_PROVIDER:
      typeof __DEFAULT_BRAIN_PROVIDER__ !== 'undefined' ? __DEFAULT_BRAIN_PROVIDER__ : 'deepseek',
    DEFAULT_BRAIN_MODEL: typeof __DEFAULT_BRAIN_MODEL__ !== 'undefined' ? __DEFAULT_BRAIN_MODEL__ : 'deepseek-chat',
    FEATURES: {
      DEV_TOOLS: typeof __ENABLE_DEV_TOOLS__ !== 'undefined' ? __ENABLE_DEV_TOOLS__ : true,
      CONSOLE_LOGGING: typeof __ENABLE_CONSOLE_LOGGING__ !== 'undefined' ? __ENABLE_CONSOLE_LOGGING__ : true,
      PERFORMANCE_METRICS:
        typeof __ENABLE_PERFORMANCE_METRICS__ !== 'undefined' ? __ENABLE_PERFORMANCE_METRICS__ : true,
      HOT_RELOAD: typeof __ENABLE_HOT_RELOAD__ !== 'undefined' ? __ENABLE_HOT_RELOAD__ : false
    },
    TELEMETRY: {
      ENABLED: typeof __TELEMETRY_ENABLED__ !== 'undefined' ? __TELEMETRY_ENABLED__ : false,
      ENDPOINT: typeof __TELEMETRY_ENDPOINT__ !== 'undefined' ? __TELEMETRY_ENDPOINT__ : ''
    }
  };
}

export function getEnv() {
  const injected = getInjectedEnv();
  if (injected) return injected;

  const fromDefines = getEnvFromBuildDefines();
  if (fromDefines) return fromDefines;

  // Fallback for direct loading
  return {
    MODE: 'development',
    DEBUG: true,
    VERSION: 'dev',
    MCP_BASE_URL: 'http://localhost:8787',
    MCP_WS_URL: 'ws://localhost:8787/ws',
    DEFAULT_BRAIN_PROVIDER: 'deepseek',
    DEFAULT_BRAIN_MODEL: 'deepseek-chat',
    FEATURES: { DEV_TOOLS: true, CONSOLE_LOGGING: true, PERFORMANCE_METRICS: true, HOT_RELOAD: true },
    TELEMETRY: { ENABLED: false, ENDPOINT: '' }
  };
}

export const ENV = getEnv();
export const isDev = () => ENV.MODE === 'development' || ENV.MODE === 'dev';
export const isProd = () => ENV.MODE === 'production' || ENV.MODE === 'prod';
export const isDebug = () => ENV.DEBUG === true;
