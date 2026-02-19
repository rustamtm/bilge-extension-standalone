# Bilge AI Workspace Chrome Extension

This is a Chrome MV3 extension that hosts the **Bilge AI Workspace** UI in a **Side Panel** and exposes **browser automation tools** (tab context, DOM inspection, click/type, screenshot) to the Bilge agent runtime.

The extension is intentionally powerful (it can run on any site) and is designed for local, gated, proof-of-concept training workflows.

## What’s In Here

- `manifest.json`: MV3 manifest + permissions + side panel entrypoint.
- `sidepanel.html`: loads `sidepanel_loader.js`.
- `sidepanel_loader.js`: loads UI bundle from `sidepanel.bundle.json` (preferred), then falls back to `dist/index.html`.
- `sidepanel.bundle.json`: extension-local bundle manifest used for standalone extension mode.
- `background.js`: service worker; relays messages to the active tab and can capture screenshots.
- `content.js`: runs on matched pages; provides page info + DOM + click/type helpers.
- `dist/`: synced build artifacts (legacy source for standalone bundle prep).
- `assets/`: extension-served UI assets used at runtime.
- `tools/prepare_standalone_sidepanel_bundle.sh`: prepares standalone bundle manifest and extracted CSS.

## Install (Load Unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the folder: `chrome-extension-bilge/`
5. Pin the extension (optional), then click the extension icon to open the Side Panel.

## MCP Bridge (Optional)

The Bilge UI bundle can optionally connect to an MCP server for "real" tools (filesystem/search/exec) instead of the local in-browser VFS stubs.

1. Open **Settings → MCP / Tools**
2. Set **Base URL** to your MCP host (do not include `/mcp/sse`):
   - Tunnel (recommended): `https://mcp.caravanflow.com`
   - Local (dev only): `http://localhost:8010`
3. If MCP auth is enabled, set **API Token** to your server's `STATUS_API_TOKEN` (from the repo `.env`).

App-side MCP settings audit and behavior details:
- `Bilge/bilge-webapp/docs/mcp-settings.md`

## Permissions and Security Model

Current permissions (see `manifest.json`):

- `activeTab`, `tabs`: identify the active tab and communicate with it.
- `scripting`: reserved for future use (not required by the current `content.js` message protocol).
- `storage`: extension-local persistence.
- `notifications`: optional UX.
- `sidePanel`: Side Panel UI.
- Host permissions: currently includes `<all_urls>` so the content script can run on arbitrary pages.

Operationally:

- The Bilge UI runs in the side panel.
- The side panel sends tool requests to `background.js`.
- `background.js` forwards tool requests to the active tab’s `content.js`.
- `content.js` reads page context or performs DOM actions and returns results.

Recommendation:

- Keep this extension disabled when not training, and avoid running it in a Chrome profile that contains high-value sessions.

## Tool Surface (What the Agent Can Call)

The Bilge agent runtime registers these browser tools in `bilge-applet/services/mcpService.ts` and routes them to this extension:

- `get_browser_context`
  - Returns active tab `url`, `title`, `description`, plus a text-only snippet (`document.body.innerText` truncated).
- `explore_browser_dom({ selector? })`
  - Returns `outerHTML` for a selector (default `body`), truncated to avoid message limits.
- `take_screenshot`
  - Captures a PNG of the currently visible tab.
- `click_element({ selector })`
  - Performs a best-effort `HTMLElement.click()` for the selector.
- `type_text({ selector, text })`
  - Focuses the element and writes text into `INPUT`/`TEXTAREA` (dispatches `input` + `change`), or sets `textContent` otherwise.
- `launch_self_improvement_mode({ autoHeal?, applyValidationMode?, includeDomSnapshot?, includeScreenshot?, validationProvider?, validationModel? })`
  - Runs Bilge Agent maintenance diagnostics, returns runtime self-awareness/component map/issues, and can apply validation-mode presets.
  - Default validation recommendation is `openai/gpt-4o` for strict multimodal self-healing checks, with DeepSeek vision-capable models as fallback.
- `restart_extension_runtime()`
  - Explicitly restarts the extension runtime when a maintenance/config update requires a clean reload.

Natural-command shortcut:

- Commands like "self improve", "self-heal", "maintenance mode", or "diagnose yourself" are auto-routed to self-improvement mode in the background runtime.
- You can request restart in one pass by setting `restartAfter: true` in `launch_self_improvement_mode`.

Known limitations:

- Chrome blocks content scripts on some pages (e.g., `chrome://*`, Chrome Web Store). Tools will fail there.
- `file://` pages require enabling **Allow access to file URLs** for the extension in `chrome://extensions`.
- HTML/text are intentionally truncated (see `content.js`) to avoid message size issues.
- Many modern sites use Shadow DOM; `click/type/explore` will attempt Shadow DOM traversal and `EXPLORE_DOM` may include `shadow_html` when applicable, but frame-heavy pages (iframes) still require additional work.
- Screenshot payloads can be large; depending on the selected model/provider, sending large tool results back into an LLM request may hit request size/context limits.

## Message Protocol (Extension Internals)

### Side Panel -> Background relay wrapper

The side panel uses `chrome.runtime.sendMessage()` with one of these envelopes:

- To active tab content script:
  - `{ to: "CONTENT_SCRIPT", payload: { ... } }`
- To background worker:
  - `{ to: "BACKGROUND", payload: { action: "...", ... } }`

`background.js` behavior:

- If `to === "CONTENT_SCRIPT"`:
  - Finds the active tab (`chrome.tabs.query({ active: true, currentWindow: true })`)
  - Forwards `payload` to `content.js` via `chrome.tabs.sendMessage(tabId, payload)`
- If `to === "BACKGROUND"`:
  - `action: "reload_extension"` calls `chrome.runtime.reload()`
  - `action: "take_screenshot"` calls `chrome.tabs.captureVisibleTab(..., { format: "png" })`

### Content script request types

`content.js` listens for:

- `type: "GET_PAGE_INFO"`
  - Response: `{ url, title, description, html }` where `html` is a text-only snippet.
- `type: "EXPLORE_DOM"`
  - Request: `{ selector?: string }`
  - Response: `{ html, url }` or `{ error }`
- `type: "CLICK_ELEMENT"`
  - Request: `{ selector: string }`
  - Response: `{ status: "clicked" }` or `{ error }`
- `type: "TYPE_TEXT"`
  - Request: `{ selector: string, text: string }`
  - Response: `{ status: "typed" }` or `{ error }`

## Updating the UI Bundle

### Standalone Extension Workflow (Recommended)

Use this when you want to focus on extension-only work and avoid depending on `bilge-webapp` during runtime:

```bash
cd Bilge/bilge-agent-extension
bash tools/prepare_standalone_sidepanel_bundle.sh
```

One-command shortcut:

```bash
cd Bilge/bilge-agent-extension
make standalone
```

From repo root:

```bash
make -C Bilge/bilge-agent-extension standalone
```

This command:
1. Syncs `dist/assets/` into extension `assets/`
2. Extracts inline CSS from `dist/index.html` into `assets/bilge-inline.css`
3. Writes `sidepanel.bundle.json` with entry JS/CSS used by `sidepanel_loader.js`

After running it, reload the extension in `chrome://extensions`.

### Legacy Build + Sync Workflow

If you still want to build from webapp first:

```bash
cd Bilge/bilge-webapp
bash tools/sync_chrome_extension_dist.sh --ext-dir ../bilge-chrome-extension
```

This script:
1. Runs `npm run build`
2. Syncs `Bilge/bilge-webapp/dist/` into `Bilge/bilge-agent-extension/dist/`
3. Leaves hash wiring to `sidepanel_loader.js` (no manual edits needed)

Optional fast sync without rebuild:

```bash
bash tools/sync_chrome_extension_dist.sh --no-build --ext-dir ../bilge-chrome-extension
```

Note on secrets:

- API keys used by the UI are inlined at build time by Vite defines in `bilge-applet/vite.config.ts`.
- Treat the built extension as sensitive if it embeds keys.

## Troubleshooting

- “No active tab found”
  - The background couldn’t resolve an active tab (rare) or you triggered the tool with no normal tab focused.
- “Browser context tools only available inside the Chrome extension.”
  - You’re running Bilge as a normal website, not inside the extension side panel.
- DOM tools return “Selector not found”
  - Provide a more specific selector, or call `explore_browser_dom({ selector: "body" })` first to discover structure.
- Screenshot fails
  - Some pages block capture; also check Chrome permission prompts and the current active tab.

## Prompting Tips (Avoiding “Second Request” Failures)

If your model/provider is inconsistent with tool-calling, prompts that *describe* tools (for example “Action: call get_browser_context”) can stall.

In Web User Mode, prefer prompts like:

1. “Call `take_screenshot` with no arguments. Then describe what you see.”
2. “If UI elements are unclear, call `explore_browser_dom` on a narrow selector and confirm before clicking.”
3. “When calling tools, arguments must be strict JSON, no comments, no trailing commas.”

If requests start failing once tools are enabled, the most common root causes are:

- Invalid tool JSON schema (provider rejects `tools` payloads)
- Tool-call arguments that are not valid JSON (parser fails)
- Tool results that are too large (screenshot base64)
