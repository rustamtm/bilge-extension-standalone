/**
 * Configuration Module for Bilge AI Workspace Automation
 *
 * Provides storage and management for automation settings.
 */

// =============================================================================
// Types
// =============================================================================

export interface AutomationConfig {
  /** Enable humanized delays between actions */
  humanizedDelayEnabled: boolean;
  /** Base delay in milliseconds (default: 220) */
  humanizedDelayBaseMs: number;
  /** Random jitter added to base delay (default: 260) */
  humanizedDelayJitterMs: number;
  /** Allow filling sensitive fields like SSN, DOB (default: false) */
  allowSensitiveFill: boolean;
  /** Allow overwriting existing values in sensitive fields (default: false) */
  allowSensitiveOverwrite: boolean;
  /** Allow AI-generated scripts to execute (default: false) */
  allowAiScripts: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'bilge_automation_config';

export const DEFAULT_CONFIG: AutomationConfig = {
  humanizedDelayEnabled: true,
  humanizedDelayBaseMs: 220,
  humanizedDelayJitterMs: 260,
  allowSensitiveFill: false,
  allowSensitiveOverwrite: false,
  allowAiScripts: false
};

// =============================================================================
// Storage Functions
// =============================================================================

/**
 * Load automation configuration from chrome.storage.local
 */
export async function loadConfig(): Promise<AutomationConfig> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      resolve({ ...DEFAULT_CONFIG });
      return;
    }

    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const stored = result[STORAGE_KEY];
      if (stored && typeof stored === 'object') {
        resolve({
          ...DEFAULT_CONFIG,
          ...stored
        });
      } else {
        resolve({ ...DEFAULT_CONFIG });
      }
    });
  });
}

/**
 * Save automation configuration to chrome.storage.local
 */
export async function saveConfig(config: Partial<AutomationConfig>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      reject(new Error('chrome.storage.local not available'));
      return;
    }

    // Merge with existing config
    loadConfig().then((existing) => {
      const merged = {
        ...existing,
        ...config
      };

      chrome.storage.local.set({ [STORAGE_KEY]: merged }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  });
}

/**
 * Reset configuration to defaults
 */
export async function resetConfig(): Promise<void> {
  return saveConfig(DEFAULT_CONFIG);
}

/**
 * Get a single configuration value
 */
export async function getConfigValue<K extends keyof AutomationConfig>(
  key: K
): Promise<AutomationConfig[K]> {
  const config = await loadConfig();
  return config[key];
}

/**
 * Set a single configuration value
 */
export async function setConfigValue<K extends keyof AutomationConfig>(
  key: K,
  value: AutomationConfig[K]
): Promise<void> {
  return saveConfig({ [key]: value });
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate and sanitize configuration values
 */
export function validateConfig(config: Partial<AutomationConfig>): AutomationConfig {
  const validated: AutomationConfig = { ...DEFAULT_CONFIG };

  if (typeof config.humanizedDelayEnabled === 'boolean') {
    validated.humanizedDelayEnabled = config.humanizedDelayEnabled;
  }

  if (typeof config.humanizedDelayBaseMs === 'number') {
    validated.humanizedDelayBaseMs = Math.min(5000, Math.max(0, Math.round(config.humanizedDelayBaseMs)));
  }

  if (typeof config.humanizedDelayJitterMs === 'number') {
    validated.humanizedDelayJitterMs = Math.min(5000, Math.max(0, Math.round(config.humanizedDelayJitterMs)));
  }

  if (typeof config.allowSensitiveFill === 'boolean') {
    validated.allowSensitiveFill = config.allowSensitiveFill;
  }

  if (typeof config.allowSensitiveOverwrite === 'boolean') {
    validated.allowSensitiveOverwrite = config.allowSensitiveOverwrite;
  }

  if (typeof config.allowAiScripts === 'boolean') {
    validated.allowAiScripts = config.allowAiScripts;
  }

  return validated;
}

// =============================================================================
// Migration
// =============================================================================

/**
 * Migrate configuration from older versions if needed
 */
export async function migrateConfig(): Promise<void> {
  const config = await loadConfig();

  // Add migration logic here as needed for future versions
  // For now, just ensure all fields exist with valid values
  const validated = validateConfig(config);
  await saveConfig(validated);
}
