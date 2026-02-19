#!/usr/bin/env node
import { WebSocketServer } from 'ws';
import { watch } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, '../src');
const distDir = resolve(__dirname, '../dist/dev');

// WebSocket server for hot reload
const wss = new WebSocketServer({ port: 35729 });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  console.log(`🔌 Hot reload client connected (${clients.size} total)`);
});

function notifyReload() {
  const message = JSON.stringify({ type: 'reload' });
  for (const client of clients) {
    try {
      client.send(message);
    } catch (e) {}
  }
}

// File watcher with debounce
let buildTimeout = null;
function triggerBuild() {
  if (buildTimeout) clearTimeout(buildTimeout);
  buildTimeout = setTimeout(() => {
    console.log('
🔨 Rebuilding...');
    const build = spawn('node', ['build.mjs'], { 
      cwd: resolve(__dirname, '..'), 
      stdio: 'inherit' 
    });
    build.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Build complete, triggering reload...');
        notifyReload();
      } else {
        console.error('❌ Build failed with code', code);
      }
    });
  }, 200);
}

// Watch source files
watch(srcDir, { recursive: true }, (eventType, filename) => {
  if (filename && (filename.endsWith('.js') || filename.endsWith('.json') || filename.endsWith('.css'))) {
    console.log(`📝 Changed: ${filename}`);
    triggerBuild();
  }
});

console.log(`
 🚀 Bilge Dev Server Started
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 📁 Watching: ${srcDir}
 📦 Output: ${distDir}
 🔄 Hot reload: ws://localhost:35729
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Load extension from: chrome://extensions → Load unpacked → dist/dev
`);

// Initial build
triggerBuild();
