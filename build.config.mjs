import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const WEBAPP_PACKAGE_JSON_PATH = resolve(REPO_ROOT, 'Bilge', 'bilge-webapp', 'package.json');
const EXT_PACKAGE_JSON_PATH = resolve(__dirname, 'package.json');

function normalizeChromeManifestVersion(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  const stripped = value.split('-')[0].split('+')[0].trim();
  // Chrome requires 1-4 dot-separated numeric components.
  if (!/^\d+(?:\.\d+){0,3}$/.test(stripped)) return '';
  return stripped;
}

function readVersionFromJson(path) {
  try {
    const pkgText = readFileSync(path, 'utf-8');
    const pkg = JSON.parse(pkgText);
    return normalizeChromeManifestVersion(pkg && pkg.version);
  } catch (_err) {
    return '';
  }
}

function getBaseVersion() {
  return (
    readVersionFromJson(WEBAPP_PACKAGE_JSON_PATH) ||
    readVersionFromJson(EXT_PACKAGE_JSON_PATH) ||
    '0.0.0'
  );
}

export function loadEnv(mode = 'dev') {
  const envFile = resolve(__dirname, `.env.${mode}`);
  const env = {};
  try {
    const content = readFileSync(envFile, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      if (key) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    }
  } catch (e) {
    console.warn(`Could not load ${envFile}:`, e.message);
  }
  return env;
}

export function getManifestConfig(mode, env) {
  const isProd = mode === 'prod';
  const baseVersion = getBaseVersion();
  return {
    // `version` must be numeric for Chrome. Use `version_name` for dev labels.
    version: baseVersion,
    versionName: isProd ? baseVersion : `${baseVersion}-dev`,
    name: 'Bilge AI Workspace',
    description: 'AI-powered browser automation workspace',
    // CSP differs between dev and prod
    // MV3 blocks 'unsafe-eval' for extension pages; keep CSP loadable in all modes.
    contentSecurityPolicy: "script-src 'self'; object-src 'self';",
    icons: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png'
    }
  };
}

export const BUILD_ENTRIES = {
  background: 'src/background.js',
  content: 'src/content.js',
  cortex: 'src/cortex.js',
  cortex_config: 'src/cortex_config.js',
  bilgeExecutionEngine: 'src/bilgeExecutionEngine.js',
  selfHealingEngine: 'src/selfHealingEngine.js',
  fieldResolver: 'src/fieldResolver.js',
  contextInference: 'src/contextInference.js',
  mcpDataBridge: 'src/mcpDataBridge.js',
  formStatePersistence: 'src/formStatePersistence.js',
  dom_runtime: 'src/dom_runtime.js',
  commandAutocomplete: 'src/commandAutocomplete.js',
  sidepanel_loader: 'src/sidepanel_loader.js',
  anomalyDetector: 'src/anomalyDetector.js',
  autoCorrector: 'src/autoCorrector.js',
  contextAnalyzer: 'src/contextAnalyzer.js',
  fieldPredictor: 'src/fieldPredictor.js',
  learningModule: 'src/learningModule.js',
  reload: 'src/reload.js',
  smartFormEngine: 'src/smartFormEngine.js',
  offscreen: 'src/offscreen.js',
  test_harness: 'src/test_harness.js'
};

export const STATIC_FILES = [
  'sidepanel.html',
  'sidepanel.bundle.json',
  'offscreen.html',
  'reload.html',
  'test_harness.html',
  'smartFormUI.css',
  'favicon.ico',
  'icons/**/*',
  'assets/**/*'
];
