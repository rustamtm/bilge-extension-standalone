const STANDALONE_MANIFEST_PATH = chrome.runtime.getURL('sidepanel.bundle.json');
const DIST_INDEX_PATH = chrome.runtime.getURL('dist/index.html');

function updateVersionDisplay() {
  try {
    const versionEl =
      document.getElementById('bilge-extension-version') || document.querySelector('.backdrop-version');
    if (!versionEl) return;

    const manifest = chrome.runtime.getManifest();
    const rawVersion = manifest && manifest.version;
    if (!rawVersion) return;

    versionEl.textContent = `v${rawVersion}`;
    versionEl.title = `v${rawVersion}`;
  } catch (err) {
    console.warn('[Bilge] Failed to update version display:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateVersionDisplay, { once: true });
} else {
  updateVersionDisplay();
}

function renderLoaderError(message) {
  console.error('[Bilge] sidepanel loader failed:', message);
  const root = document.getElementById('root');
  if (!root) return;

  root.innerHTML = `
    <div style="height:100vh;display:flex;align-items:center;justify-content:center;background:#111;color:#f5f5f5;font-family:Inter,system-ui,sans-serif;padding:24px;box-sizing:border-box;">
      <div style="max-width:680px;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:16px 18px;background:rgba(255,255,255,0.03);">
        <h2 style="margin:0 0 8px;font-size:16px;">Bilge UI failed to load</h2>
        <p style="margin:0;font-size:13px;line-height:1.5;opacity:0.85;">${String(message)}</p>
        <p style="margin:12px 0 0;font-size:12px;line-height:1.5;opacity:0.7;">Try running <code>bash tools/prepare_standalone_sidepanel_bundle.sh</code> in <code>bilge-chrome-extension</code>, then reload the extension.</p>
      </div>
    </div>
  `;
}

function normalizeAssetPath(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().replace(/^\.\//, '').replace(/^\/+/, '');
  if (!trimmed || trimmed.startsWith('..')) return '';
  return trimmed;
}

function normalizeCssEntries(entryCss, cssFile) {
  const normalized = [];

  if (Array.isArray(entryCss)) {
    for (const item of entryCss) {
      const cssPath = normalizeAssetPath(item);
      if (cssPath) normalized.push(cssPath);
    }
  } else if (typeof entryCss === 'string') {
    const cssPath = normalizeAssetPath(entryCss);
    if (cssPath) normalized.push(cssPath);
  }

  const fallbackCss = normalizeAssetPath(cssFile);
  if (fallbackCss) normalized.push(fallbackCss);

  return Array.from(new Set(normalized));
}

function parseStandaloneManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('sidepanel.bundle.json must be a JSON object');
  }

  const jsPath = normalizeAssetPath(manifest.entryJs || manifest.jsFile || manifest.jsPath);
  if (!jsPath) {
    throw new Error('sidepanel.bundle.json is missing `entryJs`');
  }

  const cssPaths = normalizeCssEntries(manifest.entryCss, manifest.cssFile);
  const inlineCss = typeof manifest.inlineCss === 'string' ? manifest.inlineCss : '';

  return { jsPath, cssPaths, inlineCss };
}

function parseDistIndexEntry(html) {
  const jsMatch = html.match(/src=["']\/assets\/(index-[^"']+\.js)["']/);
  const cssMatches = Array.from(html.matchAll(/href=["']\/assets\/(index-[^"']+\.css)["']/g));
  const inlineStyleMatch = html.match(/<style[^>]*data-bilge-inline[^>]*>([\s\S]*?)<\/style>/i);

  if (!jsMatch) {
    throw new Error('Could not locate index-*.js in dist/index.html');
  }

  const cssPaths = cssMatches.map((match) => `dist/assets/${match[1]}`);

  return {
    jsPath: `dist/assets/${jsMatch[1]}`,
    cssPaths,
    inlineCss: inlineStyleMatch ? inlineStyleMatch[1] : '',
  };
}

async function readStandaloneBundleSpec() {
  const response = await fetch(STANDALONE_MANIFEST_PATH, { cache: 'no-store' });
  if (!response.ok) return null;

  let manifest;
  try {
    manifest = await response.json();
  } catch (_error) {
    throw new Error('Failed to parse sidepanel.bundle.json');
  }
  return parseStandaloneManifest(manifest);
}

async function readDistBundleSpec() {
  const response = await fetch(DIST_INDEX_PATH, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to read dist/index.html (${response.status})`);
  }

  const html = await response.text();
  return parseDistIndexEntry(html);
}

function injectInlineCss(inlineCss) {
  if (!inlineCss || document.head.querySelector('style[data-bilge-inline-from-bundle]')) return;

  const inlineStyle = document.createElement('style');
  inlineStyle.setAttribute('data-bilge-inline-from-bundle', 'true');
  inlineStyle.textContent = inlineCss;
  document.head.appendChild(inlineStyle);
}

function injectStylesheet(cssPath) {
  if (!cssPath) return;
  const href = chrome.runtime.getURL(cssPath);
  if (document.head.querySelector(`link[data-bilge-bundle-css="${cssPath}"]`)) return;

  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.crossOrigin = 'anonymous';
  style.href = href;
  style.setAttribute('data-bilge-bundle-css', cssPath);
  document.head.appendChild(style);
}

function injectModule(jsPath) {
  const script = document.createElement('script');
  script.type = 'module';
  script.crossOrigin = 'anonymous';
  script.src = chrome.runtime.getURL(jsPath);
  script.setAttribute('data-bilge-bundle-js', jsPath);
  document.head.appendChild(script);
}

async function hasUsableStyles(bundle) {
  if (!bundle || typeof bundle !== 'object') return false;
  if (typeof bundle.inlineCss === 'string' && bundle.inlineCss.trim()) return true;
  if (!Array.isArray(bundle.cssPaths) || bundle.cssPaths.length === 0) return false;

  for (const cssPathRaw of bundle.cssPaths) {
    const cssPath = normalizeAssetPath(cssPathRaw);
    if (!cssPath) continue;
    try {
      const resp = await fetch(chrome.runtime.getURL(cssPath), { cache: 'no-store' });
      if (resp.ok) return true;
    } catch (_err) {
      // continue
    }
  }

  return false;
}

async function resolveBundleSpec() {
  const errors = [];
  try {
    const standalone = await readStandaloneBundleSpec();
    if (standalone) {
      const standaloneHasStyles = await hasUsableStyles(standalone);
      if (standaloneHasStyles) {
        console.info('[Bilge] sidepanel bundle: standalone manifest');
        return standalone;
      }
      errors.push('standalone manifest missing usable styles');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`standalone manifest: ${message}`);
  }

  try {
    const distFallback = await readDistBundleSpec();
    console.info('[Bilge] sidepanel bundle: dist/index.html fallback');
    return distFallback;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`dist fallback: ${message}`);
  }

  throw new Error(`No sidepanel bundle source available (${errors.join('; ')})`);
}

async function loadBundle() {
  const bundle = await resolveBundleSpec();
  injectInlineCss(bundle.inlineCss);
  for (const cssPath of bundle.cssPaths || []) injectStylesheet(cssPath);
  injectModule(bundle.jsPath);
}

loadBundle().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  renderLoaderError(message);
});
