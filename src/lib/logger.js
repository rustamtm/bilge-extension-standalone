import { ENV, isDev } from './env.js';

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 };
const currentLevel = isDev() ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN;

function shouldLog(level) {
  if (!ENV.FEATURES.CONSOLE_LOGGING) return false;
  return level >= currentLevel;
}

function formatMessage(level, module, message) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  return `[${timestamp}] [${level}] [${module}] ${message}`;
}

export function createLogger(module) {
  return {
    debug(message, data) {
      if (shouldLog(LOG_LEVELS.DEBUG)) {
        console.debug(formatMessage('DEBUG', module, message), data ?? '');
      }
    },
    info(message, data) {
      if (shouldLog(LOG_LEVELS.INFO)) {
        console.info(formatMessage('INFO', module, message), data ?? '');
      }
    },
    warn(message, data) {
      if (shouldLog(LOG_LEVELS.WARN)) {
        console.warn(formatMessage('WARN', module, message), data ?? '');
      }
    },
    error(message, data) {
      if (shouldLog(LOG_LEVELS.ERROR)) {
        console.error(formatMessage('ERROR', module, message), data ?? '');
      }
    },
    time(label) {
      if (ENV.FEATURES.PERFORMANCE_METRICS) {
        console.time(`[${module}] ${label}`);
      }
    },
    timeEnd(label) {
      if (ENV.FEATURES.PERFORMANCE_METRICS) {
        console.timeEnd(`[${module}] ${label}`);
      }
    }
  };
}

export const logger = createLogger('Bilge');
