export type HelpCategory =
  | 'Runtimes'
  | 'Transports'
  | 'Controls & Budget'
  | 'Security & Tray'
  | 'Troubleshooting';

export interface HelpTopic {
  id: string;
  category: HelpCategory;
  title: string;
  summary: string;
  bullets: string[];
  command?: string;
  commandLabel?: string;
}

export const HELP_CATEGORIES: Array<'All' | HelpCategory> = [
  'All',
  'Runtimes',
  'Transports',
  'Controls & Budget',
  'Security & Tray',
  'Troubleshooting',
];

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'only-nodejs',
    category: 'Runtimes',
    title: 'I only have Node.js installed — what still works?',
    summary:
      'Node.js + npx (included with Node.js) is enough for 100% of local IDE connections and all JavaScript/TypeScript & remote HTTP/SSE MCP servers.',
    bullets: [
      'Local AI clients (Cursor, VS Code, Windsurf, Antigravity IDE, Kiro, Trae, Claude Desktop, Claude Code, Codex Desktop & CLI, Zed, JetBrains) connect locally over 127.0.0.1 — no Python or cloudflared needed.',
      'All npm-hosted STDIO servers (filesystem, sequential-thinking, github, playwright, etc.) run using npx right inside Node.js.',
      'All remote HTTP/SSE MCP servers (e.g. cloud SaaS MCP URLs) work directly with zero extra local runtimes.',
    ],
  },
  {
    id: 'python-uvx-optional',
    category: 'Runtimes',
    title: 'When do I actually need Python or uvx (uv)?',
    summary:
      'Python and uvx are completely optional. They are only used when you toggle ON a Python-based STDIO MCP server (like uvx mcp-server-fetch or a custom .py script).',
    bullets: [
      'If uvx/Python is not installed, Node.js servers, HTTP servers, the unified /mcp endpoint, and HTTPS Tunnels continue working normally.',
      'Installing uv automatically provides fast isolated Python tool environments via uvx without managing global pip packages.',
    ],
    command: 'winget install --id astral-sh.uv',
    commandLabel: 'Install uv (includes uvx)',
  },
  {
    id: 'cloudflared-optional',
    category: 'Runtimes',
    title: 'When is cloudflared required vs not needed?',
    summary:
      'cloudflared is only required when you turn ON the top-bar HTTPS Tunnel switch for remote/web AI connectors.',
    bullets: [
      'Not needed for local IDEs or CLIs running on the same computer (they talk to http://127.0.0.1:8000/mcp).',
      'Required for cloud web apps (ChatGPT Web Connectors, Gemini Web, Claude.ai Web) or connecting from another device over HTTPS.',
      'Quick Tunnels work with zero Cloudflare account; Permanent Named Tunnels keep one fixed domain URL across restarts.',
    ],
    command: 'winget install --id Cloudflare.cloudflared',
    commandLabel: 'Install cloudflared (Windows)',
  },
  {
    id: 'transports-explained',
    category: 'Transports',
    title: 'Streamable HTTP (/mcp) vs Legacy SSE (/sse) vs STDIO',
    summary:
      'MCP Switchboard aggregates every active server behind two local URLs and an optional STDIO bridge so you configure your AI client once.',
    bullets: [
      'Streamable HTTP (/mcp): Recommended modern standard used by Cursor, VS Code, Kiro, Trae, Claude Code, OpenCode, Codex Desktop & CLI, Gemini CLI, ChatGPT Web, and Gemini Web.',
      'Legacy SSE (/sse): Used by older MCP clients that only support Server-Sent Events.',
      'STDIO Bridge / Connectors (Claude Desktop): Supports both local claude_desktop_config.json (via npx -y mcp-remote) and native HTTPS Custom Connectors in Settings → Connectors.',
      'Upstream servers you add inside Switchboard can use STDIO (npx/uvx/node/python), Streamable HTTP, or Legacy SSE — all tools merge automatically.',
    ],
  },
  {
    id: 'memory-and-tokens',
    category: 'Controls & Budget',
    title: 'Zero Idle RAM & Context Token Budget',
    summary:
      'Keeping extra MCP servers switched OFF saves both system memory and your AI model context window.',
    bullets: [
      'OFF servers do not spawn child processes (0 MB RAM) and contribute 0 tool schemas (~0 tokens).',
      'Lean (<3,000 tokens): Optimal speed and accuracy across models. Moderate (3,000–10,000): Noticeable prompt overhead. High (>10k): Switch off unused servers.',
      'When you toggle any server ON/OFF or edit it, Switchboard emits live MCP tools/list_changed notifications to connected clients.',
      'Shortcuts: Ctrl/Cmd+F searches servers, Ctrl/Cmd+K adds an MCP server, and ? opens MCPS Connection & Help.',
    ],
  },
  {
    id: 'settings-and-tunnel-modes',
    category: 'Controls & Budget',
    title: 'Quick Tunnel vs Permanent Named Tunnel & Port Settings',
    summary:
      'Configure port binding, tunnel persistence, tray behavior, and startup flow inside Switchboard Settings.',
    bullets: [
      'Quick Tunnel creates an instant *.trycloudflare.com URL with zero login — great for ad-hoc sessions (URL rotates each start).',
      'Permanent Named Tunnel binds a static Cloudflare domain + tunnel token so remote web connectors stay valid forever.',
      'Local Listener Port defaults to 8000 (auto-fallback up to 8010 if 8000 is occupied by another app).',
      'Toggle "Open on Welcome / Onboarding screen at launch" anytime if you want every app launch to start in Onboarding.',
    ],
  },
  {
    id: 'security-and-tray',
    category: 'Security & Tray',
    title: 'Loopback Security, Bearer Tokens & Background Tray',
    summary:
      'Designed with strict local isolation, OS-generated per-launch control authentication, and leak-proof process cleanup.',
    bullets: [
      'Switchboard binds exclusively to 127.0.0.1 (local machine only) unless you explicitly flip the HTTPS Tunnel switch ON.',
      'Set an Optional Bearer Token in Settings before turning ON a public HTTPS Tunnel so unauthorized callers receive 401 Unauthorized.',
      'Closing the window hides to the system tray (when "Close to system tray" is enabled) so servers and tunnels stay live; use Quit in the tray menu to stop everything cleanly.',
      'Secrets inside env vars, HTTP headers, and Cloudflare tokens are never logged and are spawned with minimal explicit handles.',
    ],
  },
  {
    id: 'troubleshoot-32000',
    category: 'Troubleshooting',
    title: 'Fixing "MCP error -32000: Connection closed" or PATH issues',
    summary:
      'Indicates a child MCP server exited before completing the initial MCP handshake.',
    bullets: [
      'Click "View Log" on the server row to see the exact stderr line (missing API key, bad folder path, network timeout, or missing binary).',
      'First-run "npx -y ..." servers download the npm package before responding — wait a few seconds or click Retry.',
      'Verify any folder argument (for example @modelcontextprotocol/server-filesystem path) actually exists and is readable.',
      'If you just installed Node.js, uvx, or cloudflared, click "Re-check" in System Diagnostics (Switchboard scans Windows Registry & user PATH automatically).',
    ],
  },
];
