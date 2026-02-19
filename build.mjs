#!/usr/bin/env node
import esbuild from 'esbuild';
import { copyFileSync, mkdirSync, rmSync, readdirSync, statSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadEnv, getManifestConfig, BUILD_ENTRIES, STATIC_FILES } from './build.config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const mode = args.includes('--prod') ? 'prod' : 'dev';
const watch = args.includes('--watch');
const inplace = args.includes('--inplace') || args.includes('--in-place');

console.log(`
🔧 Building Bilge Extension [${mode.toUpperCase()}]${watch ? ' (watch mode)' : ''}
`);

const env = loadEnv(mode);
const manifestConfig = getManifestConfig(mode, env);
const outDir = inplace ? __dirname : resolve(__dirname, `dist/${mode}`);

// Clean output directory (never wipe the source folder in --inplace mode)
if (!inplace) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
}

// Define environment variables for injection
const defineEnv = {};
for (const [key, value] of Object.entries(env)) {
  if (value === 'true' || value === 'false') {
    defineEnv[`process.env.${key}`] = value;
    defineEnv[`__${key}__`] = value;
  } else {
    defineEnv[`process.env.${key}`] = JSON.stringify(value);
    defineEnv[`__${key}__`] = JSON.stringify(value);
  }
}
defineEnv['__BUILD_MODE__'] = JSON.stringify(mode);
defineEnv['__BUILD_TIME__'] = JSON.stringify(new Date().toISOString());
defineEnv['__VERSION__'] = JSON.stringify(manifestConfig.version);

// esbuild configuration
const buildOptions = {
  entryPoints: Object.values(BUILD_ENTRIES).map(p => resolve(__dirname, p)),
  outdir: outDir,
  bundle: true, // Enable bundling to support imports
  format: 'esm',
  target: 'chrome100',
  define: defineEnv,
  minify: mode === 'prod',
  sourcemap: mode === 'dev' ? 'inline' : false,
  drop: mode === 'prod' ? ['console', 'debugger'] : [],
  keepNames: mode === 'dev',
  legalComments: mode === 'prod' ? 'none' : 'inline',
};

async function buildJS() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('👀 Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log('✅ JavaScript built');
  }
}

function generateManifest() {
  const baseManifestPath = resolve(__dirname, 'manifest.base.json');
  if (!existsSync(baseManifestPath)) {
    console.error('❌ manifest.base.json not found');
    return;
  }
  const baseManifest = JSON.parse(readFileSync(baseManifestPath, 'utf-8'));
  const manifest = {
    ...baseManifest,
    version: manifestConfig.version,
    name: manifestConfig.name,
    description: manifestConfig.description,
    icons: manifestConfig.icons,
  };

  if (mode === 'dev') {
    manifest.host_permissions = [
      ...(manifest.host_permissions || []),
      'http://localhost/*',
      'http://127.0.0.1/*'
    ];
  }

  if (manifestConfig.versionName && mode !== 'prod') {
    manifest.version_name = manifestConfig.versionName;
  }

  if (manifestConfig.contentSecurityPolicy) {
    manifest.content_security_policy = {
      extension_pages: manifestConfig.contentSecurityPolicy,
    };
  }

  writeFileSync(
    resolve(outDir, 'manifest.json'),
    JSON.stringify(manifest, null, mode === 'dev' ? 2 : 0)
  );
  console.log('✅ Manifest generated');
}

function generateEnvConfig() {
  const envMode =
    env.BILGE_ENV === 'production' || env.BILGE_ENV === 'development'
      ? env.BILGE_ENV
      : mode === 'prod'
        ? 'production'
        : 'development';

  const config = `
// Auto-generated environment configuration
// Build: ${mode} @ ${new Date().toISOString()}
window.__BILGE_ENV__ = Object.freeze({
  MODE: '${envMode}',
  DEBUG: ${env.BILGE_DEBUG},
  VERSION: '${manifestConfig.version}',
  MCP_BASE_URL: '${env.MCP_BASE_URL}',
  MCP_WS_URL: '${env.MCP_WS_URL}',
  DEFAULT_BRAIN_PROVIDER: '${env.DEFAULT_BRAIN_PROVIDER}',
  DEFAULT_BRAIN_MODEL: '${env.DEFAULT_BRAIN_MODEL}',
  FEATURES: Object.freeze({
    DEV_TOOLS: ${env.ENABLE_DEV_TOOLS},
    CONSOLE_LOGGING: ${env.ENABLE_CONSOLE_LOGGING},
    PERFORMANCE_METRICS: ${env.ENABLE_PERFORMANCE_METRICS},
    HOT_RELOAD: ${env.ENABLE_HOT_RELOAD}
  }),
  TELEMETRY: Object.freeze({
    ENABLED: ${env.TELEMETRY_ENABLED},
    ENDPOINT: '${env.TELEMETRY_ENDPOINT}'
  })
});
`;
  writeFileSync(resolve(outDir, 'env.config.js'), config);
  console.log('✅ Environment config generated');
}

function copyDirRecursive(src, dest) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function copyStatic(pattern) {
  if (pattern.includes('**')) {
    const baseDir = pattern.split('**')[0].replace(/\/$/, '');
    copyDirRecursive(resolve(__dirname, baseDir), resolve(outDir, baseDir));
  } else {
    const src = resolve(__dirname, pattern);
    const dest = resolve(outDir, pattern);
    if (existsSync(src)) {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
    }
  }
}

async function build() {
  try {
    await buildJS();
    generateManifest();
    generateEnvConfig();
    if (!inplace) {
      for (const pattern of STATIC_FILES) {
        copyStatic(pattern);
      }
      console.log('✅ Static files copied');
    }
    console.log(`
🎉 Build complete: ${outDir}
`);
  } catch (e) {
    console.error('❌ Build failed:', e);
    process.exit(1);
  }
}

build();
