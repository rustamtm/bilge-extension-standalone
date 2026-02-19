#!/usr/bin/env bash
set -euo pipefail

EXT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_INDEX_PATH="$EXT_DIR/dist/index.html"
DIST_ASSETS_DIR="$EXT_DIR/dist/assets"
ASSETS_DIR="$EXT_DIR/assets"
MANIFEST_PATH="$EXT_DIR/sidepanel.bundle.json"

if [[ ! -f "$DIST_INDEX_PATH" ]]; then
  echo "Error: missing dist index at $DIST_INDEX_PATH" >&2
  exit 1
fi

if [[ ! -d "$DIST_ASSETS_DIR" ]]; then
  echo "Error: missing dist assets at $DIST_ASSETS_DIR" >&2
  exit 1
fi

mkdir -p "$ASSETS_DIR"
rsync -a "$DIST_ASSETS_DIR/" "$ASSETS_DIR/"

node - "$DIST_INDEX_PATH" "$ASSETS_DIR" "$MANIFEST_PATH" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const [distIndexPath, assetsDir, manifestPath] = process.argv.slice(2);
const html = fs.readFileSync(distIndexPath, 'utf8');

const jsMatch = html.match(/src=["']\/assets\/(index-[^"']+\.js)["']/);
if (!jsMatch) {
  throw new Error('Could not locate /assets/index-*.js in dist/index.html');
}

const cssMatches = Array.from(
  html.matchAll(/href=["']\/assets\/(index-[^"']+\.css)["']/g),
).map((match) => match[1]);

const inlineCssMatch = html.match(/<style[^>]*data-bilge-inline[^>]*>([\s\S]*?)<\/style>/i);
const inlineCss = inlineCssMatch ? inlineCssMatch[1] : '';

const entryJs = `assets/${jsMatch[1]}`;
const entryJsPath = path.join(assetsDir, jsMatch[1]);
if (!fs.existsSync(entryJsPath)) {
  throw new Error(`Resolved entry JS missing: ${entryJsPath}`);
}

const entryCss = [];
for (const cssFile of cssMatches) {
  const cssPath = path.join(assetsDir, cssFile);
  if (fs.existsSync(cssPath)) {
    entryCss.push(`assets/${cssFile}`);
  }
}

if (inlineCss.trim()) {
  const inlineCssFile = path.join(assetsDir, 'bilge-inline.css');
  fs.writeFileSync(inlineCssFile, `${inlineCss}\n`);
  entryCss.push('assets/bilge-inline.css');
}

const manifest = {
  version: 1,
  source: 'dist/index.html',
  generatedAt: new Date().toISOString(),
  entryJs,
  entryCss,
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared standalone sidepanel bundle manifest: ${manifestPath}`);
console.log(`entryJs: ${entryJs}`);
if (entryCss.length > 0) {
  console.log(`entryCss: ${entryCss.join(', ')}`);
} else {
  console.log('entryCss: (none)');
}
NODE

echo "Standalone bundle is ready."
echo "Reload the extension in chrome://extensions to apply changes."
