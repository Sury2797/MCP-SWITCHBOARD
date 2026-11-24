# MCP Switchboard

A lightweight, zero-Docker desktop application (**Tauri v2 + Svelte 5 + Node.js**) that multiplexes any local (`stdio`) or remote (`streamableHttp` / `sse`) Model Context Protocol (MCP) server behind a single Streamable HTTP endpoint (`http://localhost:8000/mcp`) and an automatic HTTPS Cloudflare Tunnel—built for effortless, low-token use with **Gemini Desktop** (`Settings → Connected Apps → Custom apps`).

## Key Capabilities

- **Dynamic MCP Multiplexer (`/sidecar`)**: Paste any standard `mcpServers` JSON snippet, toggle servers ON/OFF on demand, and automatically namespace tools as `<serverName>__<toolName>`. Disabled servers are killed (`0 MB RAM`) and purged from `tools/list` (`0 input tokens`).
- **Ultra-Light Svelte 5 UI (`/src`)**: Quiet-graphite instrument console built with Svelte 5 runes, BoardUI-inspired telemetry KPI strips and segmented filter controls, and zero-overhead native Svelte translations of React Bits primitives (`use:spotlight`, `CountUp`, `DecryptedText`, `ClickSpark`) with full `prefers-reduced-motion` and keyboard accessibility.
- **Live Schema Token Meter**: Tracks approximate input token overhead (`Math.ceil(JSON.stringify(tools).length / 4)`) per server and in total, with Green (`< 3,000`), Amber (`3,000–10,000`), and Red (`> 10,000`) status bands.
- **Automated Cloudflare HTTPS Tunnel**: One-click Quick Tunnel (`trycloudflare.com/mcp`, zero account required) or Permanent Named Tunnel mode (static custom domain in Settings).
- **Zero Orphan Processes**: Tauri v2 lifecycle hooks and cross-platform process-tree termination (`taskkill /T /F` on Windows, `SIGTERM` → `SIGKILL` on macOS/Linux) guarantee all MCP servers, the Node.js sidecar, and `cloudflared` exit cleanly.

---

## Quick Start (3 Steps)

### Prerequisites
- **Node.js 18+** (`node` & `npm`)
- **Rust toolchain** (`cargo` & `rustc` for Tauri v2)
- **cloudflared** (for HTTPS tunnels):
  - Windows: `winget install --id Cloudflare.cloudflared`
  - macOS: `brew install cloudflared`

### 1. Install Dependencies
```bash
npm install
```
*(The `postinstall` script automatically installs `/sidecar` dependencies as well.)*

### 2. Run in Development Mode
```bash
npm run tauri dev
```
This starts the Vite Svelte 5 UI on `http://localhost:1420`, launches the native Tauri v2 window, and spawns the Node.js MCP sidecar on `http://localhost:8000/mcp` (auto-falling back to `8001`–`8010` if busy).

### 3. Build Production Desktop Installer
```bash
npm run tauri build
```
Installers and binaries are output to `src-tauri/target/release/bundle/`.

---

## Connect to Gemini Desktop

1. Launch **MCP Switchboard** and flip the master **Tunnel Switch ON**.
2. Click **Copy URL** once the status pill turns **Live** (`https://<random>.trycloudflare.com/mcp` or your permanent domain).
3. In **Gemini Desktop**, open **Settings → Connected Apps → Custom apps → Add a custom app**, paste the URL, and save.

---

## Verify End-to-End (Automated Test)

With dependencies installed, run the bundled verification test (spawns the sidecar, imports `sidecar/sample-mcp-server.mjs` via the Paste JSON API, toggles it ON, verifies tools at `/mcp`, calls a tool, toggles it OFF, and confirms the process terminates and tool count drops to `0`):

```bash
npm --prefix sidecar run test:e2e
```

## Project Structure

```text
mcp-switchboard/
├── src/                      # Svelte 5 + Vite + Tailwind quiet-graphite UI
│   ├── App.svelte            # Root layout, SSE state sync, modals & drawers
│   ├── lib/primitives/       # Native Svelte 5 primitives (CountUp, DecryptedText, ClickSpark, spotlight, Switch, SegmentedControl)
│   └── components/           # TopConnectionBar, TelemetryStrip, SwitchboardList, AddMcpModal, ToolInspectorDrawer, LogViewerModal, HelpDrawer, SettingsModal
├── src-tauri/                # Tauri v2 native desktop shell & shutdown hooks
├── sidecar/                  # Node.js Express + @modelcontextprotocol/sdk multiplexer
│   ├── server.js             # /mcp Streamable HTTP endpoint, /health, REST & SSE API
│   └── lib/                  # mcpManager, tunnelManager, configStore, processUtils, diagnostics
└── README.md
```
