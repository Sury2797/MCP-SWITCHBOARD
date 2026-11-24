<div align="center">
  <img src="public/app-icon.png" alt="MCP Switchboard Icon" width="92" height="92" />
  <h1>MCP Switchboard</h1>
  <p>
    <strong>One endpoint. Zero idle token bloat. Native desktop security.</strong><br />
    Dynamic MCP multiplexer and Cloudflare HTTPS tunnel console for <strong>Gemini Desktop</strong>, built with <strong>Tauri v2</strong>, <strong>Svelte 5</strong>, strict <strong>TypeScript</strong>, and <strong>Node.js</strong>.
  </p>

  <p>
    <a href="https://github.com/Sury2797/MCP-SWITCHBOARD/releases">
      <img src="https://img.shields.io/github/v/release/Sury2797/MCP-SWITCHBOARD?style=flat-square&label=release&color=0ea5e9" alt="Latest Release" />
    </a>
    <a href="https://github.com/Sury2797/MCP-SWITCHBOARD/actions/workflows/release.yml">
      <img src="https://img.shields.io/github/actions/workflow/status/Sury2797/MCP-SWITCHBOARD/release.yml?style=flat-square&label=release%20CI" alt="Release CI Status" />
    </a>
    <img src="https://img.shields.io/badge/platforms-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-64748b?style=flat-square" alt="Platforms: Windows, macOS, Linux" />
    <img src="https://img.shields.io/badge/tauri-v2-24C8DB?style=flat-square&logo=tauri&logoColor=white" alt="Tauri v2" />
    <img src="https://img.shields.io/badge/svelte-5%20%C2%B7%20TypeScript-FF3E00?style=flat-square&logo=svelte&logoColor=white" alt="Svelte 5 + TypeScript" />
    <img src="https://img.shields.io/badge/binary-~4.8%20MB-10b981?style=flat-square" alt="Compact Release Binary" />
  </p>

  <p>
    <a href="https://github.com/Sury2797/MCP-SWITCHBOARD/releases/download/v1.0.2/MCP.Switchboard_1.0.2_x64-setup.exe">
      <img src="https://img.shields.io/badge/Windows_x64-.exe_(2.27_MB)-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="Download Windows x64 Setup (.exe)" />
    </a>
    <a href="https://github.com/Sury2797/MCP-SWITCHBOARD/releases/download/v1.0.2/MCP.Switchboard_1.0.2_aarch64.dmg">
      <img src="https://img.shields.io/badge/macOS_Apple_Silicon-.dmg_(6.24_MB)-18181b?style=for-the-badge&logo=apple&logoColor=white" alt="Download macOS Apple Silicon (.dmg)" />
    </a>
    <a href="https://github.com/Sury2797/MCP-SWITCHBOARD/releases/download/v1.0.2/MCP.Switchboard_1.0.2_x64.dmg">
      <img src="https://img.shields.io/badge/macOS_Intel-.dmg_(6.34_MB)-3f3f46?style=for-the-badge&logo=apple&logoColor=white" alt="Download macOS Intel (.dmg)" />
    </a>
    <a href="https://github.com/Sury2797/MCP-SWITCHBOARD/releases/download/v1.0.2/MCP.Switchboard_1.0.2_amd64.AppImage">
      <img src="https://img.shields.io/badge/Linux_x64-.AppImage-E95420?style=for-the-badge&logo=linux&logoColor=white" alt="Download Linux x64 AppImage" />
    </a>
  </p>

  <p>
    <a href="#quick-start">Quick Start</a> &nbsp;·&nbsp;
    <a href="#downloads">Downloads</a> &nbsp;·&nbsp;
    <a href="#architecture">Architecture</a> &nbsp;·&nbsp;
    <a href="#configuration--examples">Configuration</a> &nbsp;·&nbsp;
    <a href="#security-model">Security Model</a> &nbsp;·&nbsp;
    <a href="#development--ci">Development &amp; CI</a>
  </p>
</div>

---

## Why MCP Switchboard?

| Challenge | With MCP Switchboard |
| :--- | :--- |
| **Context window bloat** from 30–100+ unused MCP schemas | Toggle servers per task — disabling a server kills its process (`0 MB RAM`) and removes its schemas (`0 input tokens`) while firing `notifications/tools/list_changed`. |
| **Local STDIO servers vs. Gemini Desktop HTTPS apps** | Aggregates local `stdio` (`npx`, `uvx`, `python`) and remote `streamableHttp` / `sse` tools behind one `/mcp` URL plus an optional one-click `cloudflared` HTTPS tunnel. |
| **Insecure local HTTP bridges & orphaned child processes** | Rust enforces a per-launch 256-bit OS-CSPRNG token on `/api/*`, blocks tunnel/proxy traffic with `403`, and terminates entire process trees on exit. |

---

## Architecture

```mermaid
flowchart LR
  UI["Tauri v2 WebView<br/>(Svelte 5 + Strict TS)"] -- "X-Switchboard-Token<br/>/api/* & /api/events" --> Sidecar["Node.js Sidecar (server.cjs)<br/>127.0.0.1:8000–8010"]
  Rust["Rust Host Shell (lib.rs)<br/>CSPRNG Token + OTA Updater"] -- "Spawns, Monitors & Shuts Down" --> Sidecar
  Gemini["Gemini Desktop<br/>(Custom Apps)"] -- "HTTPS (/mcp & /health)<br/>/api/* Blocked (403)" --> Tunnel["cloudflared Tunnel<br/>Quick or Named"]
  Tunnel --> Sidecar
  Sidecar -- "STDIO / Streamable HTTP / SSE" --> Servers["Upstream MCP Servers<br/>(npx, uvx, python, remote URLs)"]
```

<details>
<summary><strong>How Dynamic Multiplexing, Namespacing &amp; Token Metering Work</strong></summary>

1. **Tool Namespacing:** Enabled upstream tools are exposed cleanly as `<serverName>__<toolName>` (via `sanitizePrefix`) and routed dynamically back to the owning MCP client session on `tools/call`.
2. **Live Capability Sync:** Whenever a server connects, stops, or encounters an error, the sidecar broadcasts `notifications/tools/list_changed` to every connected `/mcp` client session and pushes live SSE state updates (`GET /api/events`) to the desktop UI.
3. **Token Budget Meter:** Estimates active input token overhead (`Math.ceil(JSON.stringify(tools).length / 4)`) per server and in total across live tiers: **Lean** (`< 3,000`), **Moderate** (`3,000–10,000`), and **High** (`> 10,000`).
4. **Native Desktop Craft:** Built on a locked non-bouncing quiet-graphite viewport with BoardUI-inspired primitives (`Button`, `Switch`, `SegmentedControl`, `CustomSelect`), React Bits `CountUp` and `spotlight` catchlight, live log viewer, tool schema inspector, and `prefers-reduced-motion` support.

</details>

---

## Quick Start

### Prerequisites

| Tool | Purpose | Install Command |
| :--- | :--- | :--- |
| **Node.js 20+** | Required to run the bundled sidecar engine (`server.cjs`) and JS MCP servers | Windows: `winget install OpenJS.NodeJS.LTS` · macOS: `brew install node` · Linux: NodeSource / distro LTS |
| **cloudflared** *(optional)* | Required only when toggling HTTPS Tunnels ON for Gemini Desktop | Windows: `winget install --id Cloudflare.cloudflared` · macOS: `brew install cloudflared` · Linux: `cloudflared` package |
| **uv / Python** *(optional)* | Required only for `uvx` or Python-based STDIO MCP servers | Windows: `winget install --id astral-sh.uv` · macOS: `brew install uv` |

### Platform Installers & Persistent Config Locations

<a id="downloads"></a>

| Platform | Direct Download Badges (`v1.0.2`) | Persistent Config Path |
| :--- | :--- | :--- |
| **Windows (x64)** | <a href="https://github.com/Sury2797/MCP-SWITCHBOARD/releases/download/v1.0.2/MCP.Switchboard_1.0.2_x64-setup.exe"><img src="https://img.shields.io/badge/Setup_.exe-2.27_MB-0078D4?style=flat-square&logo=windows&logoColor=white" alt="Windows Setup EXE" /></a> <a href="https://github.com/Sury2797/MCP-SWITCHBOARD/releases/download/v1.0.2/MCP.Switchboard_1.0.2_x64_en-US.msi"><img src="https://img.shields.io/badge/MSI_Installer-3.14_MB-0369a1?style=flat-square" alt="Windows MSI" /></a> | `%APPDATA%\com.mcpswitchboard.desktop\mcp-switchboard.json` |
| **macOS (Apple Silicon & Intel)** | <a href="https://github.com/Sury2797/MCP-SWITCHBOARD/releases/download/v1.0.2/MCP.Switchboard_1.0.2_aarch64.dmg"><img src="https://img.shields.io/badge/ARM64_.dmg-6.24_MB-18181b?style=flat-square&logo=apple&logoColor=white" alt="macOS Apple Silicon DMG" /></a> <a href="https://github.com/Sury2797/MCP-SWITCHBOARD/releases/download/v1.0.2/MCP.Switchboard_1.0.2_x64.dmg"><img src="https://img.shields.io/badge/Intel_x64_.dmg-6.34_MB-3f3f46?style=flat-square&logo=apple&logoColor=white" alt="macOS Intel DMG" /></a> | `~/Library/Application Support/com.mcpswitchboard.desktop/mcp-switchboard.json` |
| **Linux (x64)** | <a href="https://github.com/Sury2797/MCP-SWITCHBOARD/releases/download/v1.0.2/MCP.Switchboard_1.0.2_amd64.AppImage"><img src="https://img.shields.io/badge/.AppImage-78.1_MB-E95420?style=flat-square&logo=linux&logoColor=white" alt="Linux AppImage" /></a> <a href="https://github.com/Sury2797/MCP-SWITCHBOARD/releases/download/v1.0.2/MCP.Switchboard_1.0.2_amd64.deb"><img src="https://img.shields.io/badge/.deb-3.25_MB-A81D33?style=flat-square&logo=debian&logoColor=white" alt="Linux DEB" /></a> <a href="https://github.com/Sury2797/MCP-SWITCHBOARD/releases/download/v1.0.2/MCP.Switchboard-1.0.2-1.x86_64.rpm"><img src="https://img.shields.io/badge/.rpm-3.26_MB-EE0000?style=flat-square&logo=redhat&logoColor=white" alt="Linux RPM" /></a> | `~/.config/com.mcpswitchboard.desktop/mcp-switchboard.json` |
| **Signed OTA Feed** | <a href="https://github.com/Sury2797/MCP-SWITCHBOARD/releases/latest/download/latest.json"><img src="https://img.shields.io/badge/latest.json-Minisign_Verified-10b981?style=flat-square" alt="Signed Updater Feed latest.json" /></a> <a href="https://github.com/Sury2797/MCP-SWITCHBOARD/releases/tag/v1.0.2"><img src="https://img.shields.io/badge/All_Assets_%26_.sig-v1.0.2-475569?style=flat-square&logo=github&logoColor=white" alt="All v1.0.2 Release Assets" /></a> | Auto-checked on startup &amp; in Settings |

<details open>
<summary><strong>Windows (x64 — NSIS Setup / MSI)</strong></summary>

1. Download **`MCP.Switchboard_1.0.2_x64-setup.exe`** (recommended per-user installer for silent UAC-free OTA updates) or **`MCP.Switchboard_1.0.2_x64_en-US.msi`** directly above or from [Releases](https://github.com/Sury2797/MCP-SWITCHBOARD/releases).
2. Per-user installs live under `%LOCALAPPDATA%\MCP Switchboard\`, while configuration persists safely across updates at:
   `%APPDATA%\com.mcpswitchboard.desktop\mcp-switchboard.json`
3. Built-in Windows diagnostics read `HKCU` + `HKLM` Registry `PATH`, expand environment variables, check `NVM_SYMLINK` / `Volta` / `Scoop`, scan Python `3.x` directories, and resolve `.cmd`/`.exe` shims (`npx.cmd`, `uvx.exe`, `python.exe`, `cloudflared.exe`) with `windowsHide: true`.

</details>

<details>
<summary><strong>macOS (Apple Silicon <code>aarch64</code> &amp; Intel <code>x86_64</code> — DMG / Updater Bundle)</strong></summary>

1. Download **`MCP.Switchboard_1.0.2_aarch64.dmg`** (M1–M4) or **`MCP.Switchboard_1.0.2_x64.dmg`** (Intel) directly above (or from [Releases](https://github.com/Sury2797/MCP-SWITCHBOARD/releases)) and drag **MCP Switchboard.app** to Applications.
2. Persistent config path: `~/Library/Application Support/com.mcpswitchboard.desktop/mcp-switchboard.json`.
3. Finder/Dock-launched builds automatically check `/opt/homebrew/bin`, `/usr/local/bin`, `~/.volta/bin`, `~/.local/share/fnm`, and `~/.nvm/versions/node` so `node`, `npx`, `uvx`, and `cloudflared` work without opening a login shell.

</details>

<details>
<summary><strong>Linux (x64 — AppImage / .deb / .rpm)</strong></summary>

1. Download **`MCP.Switchboard_1.0.2_amd64.AppImage`**, **`MCP.Switchboard_1.0.2_amd64.deb`**, or **`MCP.Switchboard-1.0.2-1.x86_64.rpm`** directly above (built on Ubuntu 22.04 with WebKitGTK 4.1 for broad glibc compatibility).
2. Persistent config path: `~/.config/com.mcpswitchboard.desktop/mcp-switchboard.json` (or `$XDG_DATA_HOME/com.mcpswitchboard.desktop/mcp-switchboard.json`).
3. Desktop-launched sessions automatically prepend `~/.local/bin`, `~/.cargo/bin`, `~/.volta/bin`, and `/usr/local/bin` to `PATH`.

</details>

### Connect to Gemini Desktop in 4 Steps

1. Launch **MCP Switchboard** and click `?` (or press `?`) to verify prerequisites in the **Setup & Diagnostics** drawer.
2. Toggle the MCP servers you want active (or click **+ Add MCP** / `Ctrl+K` to import JSON).
3. Flip the header **Tunnel** switch **ON** and wait for **Tunnel live**.
4. Click **Copy URL** (`https://.../mcp`), then open **Gemini Desktop → Settings → Connected Apps → Custom apps → Add a custom app** and paste the URL.

---

## Configuration & Examples

Click **Add MCP** (`Ctrl+K` / `Cmd+K`) and switch to **Paste JSON** to import standard Claude/Cursor `mcpServers` configs or plain server maps directly. Imported servers start `enabled: false` so you inspect before launching.

<details>
<summary><strong>Sample <code>mcpServers</code> JSON (Local STDIO + Remote Streamable HTTP / SSE)</strong></summary>

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
    },
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"]
    },
    "github-remote": {
      "transport": "streamableHttp",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Cloudflare Tunnel Modes: Quick Tunnel vs. Permanent Named Tunnel</strong></summary>

- **Quick Tunnel (default):** Zero Cloudflare account needed. Spawns `cloudflared tunnel --no-autoupdate --url http://localhost:<port>` and exposes an ephemeral `https://*.trycloudflare.com/mcp` URL.
- **Permanent Named Tunnel (Settings):** Configure a **Permanent Domain** (`https://mcp.yourdomain.com/mcp`) plus a **Cloudflare Tunnel Token** (or local tunnel name) so your Gemini Desktop Custom App URL stays static across restarts.

</details>

### Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl+K` / `Cmd+K` | Open **Add MCP Server** modal |
| `Ctrl+F` / `Cmd+F` or `/` | Focus server search filter |
| `?` | Open **Gemini Desktop Setup & Diagnostics** drawer |
| `Escape` | Close active modal, dropdown, or drawer |

---

## Security Model

MCP Switchboard separates its public MCP transport (`/mcp`, `/health`) from its local desktop Control Plane (`/api/*`):

| Surface | Network Binding & Auth | Protections Enforced |
| :--- | :--- | :--- |
| **Control API** (`/api/*`, `/api/events`) | `127.0.0.1:8000–8010` only · **256-bit OS-CSPRNG** `X-Switchboard-Token` (`timingSafeEqual`, `401` on mismatch) | Rejects Cloudflare/proxy headers (`cf-ray`, `cf-connecting-ip`, `x-forwarded-for`, `x-forwarded-host`, `forwarded` → `403`), non-local `Host` headers (`403`), and foreign `Origin` headers (`403`). |
| **MCP Endpoint** (`/mcp`, `/health`) | Accessible locally and via optional Cloudflare Tunnel | Exposes aggregated tool schemas/calls only for servers you explicitly toggle **ON**. Zero tunnel exposure to config/process mutations. |
| **Input & Transport Validation** | Config store & server form | Rejects non-`http:`/`https:` remote URLs (`file://`, `javascript:`, etc.) and blocks prototype-pollution server keys (`__proto__`, `constructor`, `prototype`). |
| **WebView & Capabilities** | [`tauri.conf.json`](src-tauri/tauri.conf.json) & [`default.json`](src-tauri/capabilities/default.json) | Strict `default-src 'self'` CSP, least-privilege capabilities (`core:default`, `updater:default`), disabled web drag-and-drop/arbitrary context menus. |
| **Lifecycle & Signed Updates** | Rust [`lib.rs`](src-tauri/src/lib.rs) + Minisign | Parent-PID watchdog terminates orphans on exit; OTA updater verifies Minisign signatures, stops the sidecar via `prepare_for_update` after download so install dirs unlock cleanly on Windows, and calls `relaunch_app` on macOS/Linux. |

---

## Development & CI

### Setup & Dev Workflow

```bash
npm install          # Installs frontend deps + sidecar/ deps via postinstall
npm run tauri dev    # Starts Vite (1420), Tauri shell, and Node sidecar (127.0.0.1:8000-8010)
```

### Verification Suite

```bash
npm run check                                                             # svelte-check (strict TS) + tsc on sidecar/
node sidecar/test-e2e.mjs                                                 # E2E MCP routing + 401/403/400 security tests
cargo fmt --manifest-path src-tauri/Cargo.toml --check                    # Rust formatting check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```

### Building & Automated Signed Releases

```bash
npm run tauri build          # Compiles sidecar (~1.9 MB server.cjs), Vite UI, and LTO desktop installers
npm run tauri:build:signed   # Same build with src-tauri/tauri.updater.conf.json (requires TAURI_SIGNING_PRIVATE_KEY)
```

<details>
<summary><strong>CI Release Pipeline (Windows, macOS ARM64/x64 &amp; Ubuntu 22.04 + <code>latest.json</code>)</strong></summary>

1. Add `TAURI_SIGNING_PRIVATE_KEY` (contents of your Minisign private key) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` under **GitHub Settings → Secrets and variables → Actions**.
2. Push a version tag matching `package.json` / `tauri.conf.json` (`git tag v1.0.2 && git push origin v1.0.2`) or run **Actions → Release and Publish OTA Updates → Run workflow**.
3. [`release.yml`](.github/workflows/release.yml) runs `create-release` (draft) → parallel builds (`windows-latest`, `macos-latest` `aarch64` & `x86_64`, `ubuntu-22.04`) with `npm run check` + `node sidecar/test-e2e.mjs` + `tauri-apps/tauri-action@v1` → atomic `publish-release` once all platforms merge cleanly into `latest.json`.

</details>

---

## Project Structure

```text
mcp-switchboard/
├── .github/workflows/release.yml       # Atomic multi-OS build, Minisign signing & latest.json CI
├── public/app-icon.png                 # Desktop & README application icon
├── sidecar/                            # Node.js Express + @modelcontextprotocol/sdk multiplexer
│   ├── server.js                       # /mcp, /health, token/origin-guarded /api/* & SSE stream
│   ├── sample-mcp-server.mjs           # Sample STDIO MCP server used by E2E test suite
│   ├── test-e2e.mjs                    # Security (401/403/400) & MCP tool-routing E2E tests
│   └── lib/                            # configStore, mcpManager, tunnelManager, processUtils, diagnostics
├── src/                                # Strict TypeScript + Svelte 5 quiet-graphite UI
│   ├── App.svelte                      # Root shell, native desktop guards, SSE sync & update banner
│   ├── vite-env.d.ts                   # Vite & compile-time __APP_VERSION__ type declarations
│   ├── lib/
│   │   ├── api.ts                      # Retry polling discovery, token-authenticated REST & SSE client
│   │   ├── types.ts                    # Canonical shared domain & API types
│   │   ├── updater.ts                  # Two-phase download -> prepare_for_update -> install + relaunch
│   │   ├── icons/                      # Streamline SVG icon registry (typed IconName)
│   │   └── primitives/                 # Button, CountUp, CustomSelect, SegmentedControl, Switch, spotlight
│   └── components/                     # TopConnectionBar, TelemetryStrip, SwitchboardList, modals & drawers
├── src-tauri/                          # Tauri v2 Rust host shell
│   ├── src/lib.rs                      # CSPRNG token enforcement, cross-OS Node discovery, OTA lifecycle
│   ├── tauri.conf.json                 # Strict CSP, LTO/strip profile, updater pubkey & endpoints
│   ├── tauri.updater.conf.json         # Release override enabling createUpdaterArtifacts in CI
│   ├── icons/                          # Cross-platform icons (.ico, .icns, .png)
│   └── capabilities/default.json       # Least-privilege main-window Tauri capabilities
├── tsconfig.json                       # Strict TypeScript config for Svelte 5 frontend
├── tsconfig.sidecar.json               # TypeScript checkJs config for Node.js sidecar
└── vite.config.js                      # Vite config injecting __APP_VERSION__ + local dev proxy
```
