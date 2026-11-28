export type ClientPreset =
  | 'claude_code'
  | 'cursor'
  | 'vscode'
  | 'windsurf'
  | 'antigravity'
  | 'kiro'
  | 'trae'
  | 'zed'
  | 'jetbrains'
  | 'pycharm'
  | 'cline'
  | 'roo_code'
  | 'continue_dev'
  | 'codex'
  | 'gemini_cli'
  | 'copilot_cli'
  | 'opencode'
  | 'amp'
  | 'amazon_q'
  | 'warp'
  | 'goose'
  | 'claude_desktop'
  | 'lmstudio'
  | 'raycast'
  | 'chatgpt'
  | 'gemini'
  | 'web_connectors'
  | 'other';

export type ClientCategory = 'IDE' | 'CLI Agent' | 'Desktop & Web' | 'Universal';

export interface ClientOsPath {
  os: string;
  platformKey?: 'win32' | 'darwin' | 'linux';
  path: string;
}

export interface ClientTabMeta {
  id: ClientPreset;
  label: string;
  category: ClientCategory;
  transport: string;
  badge: string;
  requiresTunnel?: boolean;
  keywords?: string[];
  osPaths: ClientOsPath[];
}

export const CLIENT_TABS: ClientTabMeta[] = [
  // ── IDE ──
  {
    id: 'cursor',
    label: 'Cursor',
    category: 'IDE',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    keywords: ['anysphere', 'ide'],
    osPaths: [
      { os: 'Windows', platformKey: 'win32', path: '%USERPROFILE%\\.cursor\\mcp.json' },
      { os: 'macOS / Linux', platformKey: 'darwin', path: '~/.cursor/mcp.json' },
      { os: 'Project', path: '.cursor/mcp.json' },
      { os: 'IDE UI', path: 'Cursor Settings → Tools & MCP → Add Custom MCP' },
    ],
  },
  {
    id: 'vscode',
    label: 'VS Code',
    category: 'IDE',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    keywords: ['copilot', 'github copilot', 'microsoft'],
    osPaths: [
      { os: 'Workspace', path: '.vscode/mcp.json' },
      { os: 'Windows', platformKey: 'win32', path: '%APPDATA%\\Code\\User\\mcp.json' },
      { os: 'macOS', platformKey: 'darwin', path: '~/Library/Application Support/Code/User/mcp.json' },
      { os: 'Linux', platformKey: 'linux', path: '~/.config/Code/User/mcp.json' },
    ],
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    category: 'IDE',
    transport: 'HTTP/SSE',
    badge: 'Streamable HTTP / SSE',
    keywords: ['codeium', 'cascade'],
    osPaths: [
      { os: 'Windows', platformKey: 'win32', path: '%USERPROFILE%\\.codeium\\windsurf\\mcp_config.json' },
      { os: 'macOS / Linux', platformKey: 'darwin', path: '~/.codeium/windsurf/mcp_config.json' },
      { os: 'IDE UI', path: 'Windsurf Settings → Cascade → MCP Servers' },
    ],
  },
  {
    id: 'antigravity',
    label: 'Antigravity IDE',
    category: 'IDE',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    keywords: ['google', 'gemini'],
    osPaths: [
      { os: 'Global', path: '~/.gemini/antigravity/mcp_config.json' },
      { os: 'Config Dir', path: '~/.gemini/config/mcp_config.json' },
      { os: 'Workspace', path: '.agents/mcp_config.json' },
      { os: 'IDE UI', path: 'Agent Panel (···) → MCP Servers → Manage MCP Servers' },
    ],
  },
  {
    id: 'kiro',
    label: 'Kiro',
    category: 'IDE',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    keywords: ['aws', 'amazon'],
    osPaths: [
      { os: 'Windows', platformKey: 'win32', path: '%USERPROFILE%\\.kiro\\settings\\mcp.json' },
      { os: 'macOS / Linux', platformKey: 'darwin', path: '~/.kiro/settings/mcp.json' },
      { os: 'Workspace', path: '.kiro/settings/mcp.json' },
      { os: 'Command Palette', path: 'Kiro: Open user MCP config (JSON)' },
    ],
  },
  {
    id: 'trae',
    label: 'Trae',
    category: 'IDE',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    keywords: ['bytedance', 'ide'],
    osPaths: [
      { os: 'Windows', platformKey: 'win32', path: '%USERPROFILE%\\.trae\\mcp.json' },
      { os: 'macOS / Linux', platformKey: 'darwin', path: '~/.trae/mcp.json' },
      { os: 'Workspace', path: '.trae/mcp.json' },
      { os: 'IDE UI', path: 'Settings → MCP → Add Manually' },
    ],
  },
  {
    id: 'zed',
    label: 'Zed',
    category: 'IDE',
    transport: 'HTTP',
    badge: 'HTTP & STDIO',
    keywords: ['context_servers'],
    osPaths: [
      { os: 'Windows', platformKey: 'win32', path: '%APPDATA%\\Zed\\settings.json' },
      { os: 'macOS / Linux', platformKey: 'darwin', path: '~/.config/zed/settings.json' },
      { os: 'IDE UI', path: 'Settings → AI → MCP Servers → Add Remote Server' },
    ],
  },
  {
    id: 'jetbrains',
    label: 'JetBrains',
    category: 'IDE',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    keywords: ['junie', 'intellij', 'webstorm', 'rider', 'goland'],
    osPaths: [
      { os: 'IDE UI', path: 'Settings → Tools → AI Assistant → Model Context Protocol (MCP)' },
      { os: 'Project (Junie)', path: '.junie/mcp/mcp.json' },
    ],
  },
  {
    id: 'pycharm',
    label: 'PyCharm',
    category: 'IDE',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    keywords: ['jetbrains', 'junie', 'python'],
    osPaths: [
      { os: 'IDE UI', path: 'Settings → Tools → AI Assistant → Model Context Protocol (MCP)' },
      { os: 'Project (Junie)', path: '.junie/mcp/mcp.json' },
    ],
  },
  {
    id: 'cline',
    label: 'Cline',
    category: 'IDE',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    keywords: ['vscode', 'extension'],
    osPaths: [
      { os: 'Windows', platformKey: 'win32', path: '%APPDATA%\\Code\\User\\globalStorage\\saoudrizwan.claude-dev\\settings\\cline_mcp_settings.json' },
      { os: 'macOS', platformKey: 'darwin', path: '~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json' },
      { os: 'Linux', platformKey: 'linux', path: '~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json' },
    ],
  },
  {
    id: 'roo_code',
    label: 'Roo Code',
    category: 'IDE',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    keywords: ['vscode', 'extension'],
    osPaths: [
      { os: 'Windows', platformKey: 'win32', path: '%APPDATA%\\Code\\User\\globalStorage\\rooveterinaryinc.roo-cline\\settings\\mcp_settings.json' },
      { os: 'macOS', platformKey: 'darwin', path: '~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json' },
      { os: 'Linux', platformKey: 'linux', path: '~/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json' },
    ],
  },
  {
    id: 'continue_dev',
    label: 'Continue',
    category: 'IDE',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    keywords: ['yaml', 'vscode', 'jetbrains'],
    osPaths: [
      { os: 'Windows', platformKey: 'win32', path: '%USERPROFILE%\\.continue\\config.yaml' },
      { os: 'macOS / Linux', platformKey: 'darwin', path: '~/.continue/config.yaml' },
    ],
  },

  // ── CLI Agent ──
  {
    id: 'claude_code',
    label: 'Claude Code',
    category: 'CLI Agent',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    keywords: ['anthropic', 'cli'],
    osPaths: [
      { os: 'Windows', platformKey: 'win32', path: '%USERPROFILE%\\.claude.json' },
      { os: 'macOS / Linux', platformKey: 'darwin', path: '~/.claude.json (via claude mcp add)' },
      { os: 'Project', path: '.mcp.json' },
    ],
  },
  {
    id: 'gemini_cli',
    label: 'Gemini CLI',
    category: 'CLI Agent',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    keywords: ['google', 'gemini code assist'],
    osPaths: [
      { os: 'Windows', platformKey: 'win32', path: '%USERPROFILE%\\.gemini\\settings.json' },
      { os: 'macOS / Linux', platformKey: 'darwin', path: '~/.gemini/settings.json' },
      { os: 'Project', path: '.gemini/settings.json' },
    ],
  },
  {
    id: 'copilot_cli',
    label: 'GitHub Copilot CLI',
    category: 'CLI Agent',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    keywords: ['github', 'copilot', 'cli'],
    osPaths: [
      { os: 'Windows', platformKey: 'win32', path: '%USERPROFILE%\\.copilot\\mcp-config.json' },
      { os: 'macOS / Linux', platformKey: 'darwin', path: '~/.copilot/mcp-config.json' },
      { os: 'Project', path: '.mcp.json' },
      { os: 'CLI', path: '/mcp add (interactive inside Copilot CLI)' },
    ],
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    category: 'CLI Agent',
    transport: 'HTTP',
    badge: 'Remote HTTP',
    keywords: ['cli', 'tui'],
    osPaths: [
      { os: 'Global', path: '~/.config/opencode/opencode.json' },
      { os: 'Project', path: 'opencode.json' },
    ],
  },
  {
    id: 'amp',
    label: 'Amp',
    category: 'CLI Agent',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    keywords: ['sourcegraph', 'ampcode', 'cli'],
    osPaths: [
      { os: 'Global', path: '~/.config/amp/settings.json' },
      { os: 'Workspace', path: '.amp/settings.json' },
      { os: 'CLI', path: 'amp mcp add mcp-switchboard <url>' },
    ],
  },
  {
    id: 'amazon_q',
    label: 'Amazon Q',
    category: 'CLI Agent',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    keywords: ['aws', 'q developer'],
    osPaths: [
      { os: 'Global', path: '~/.aws/amazonq/mcp.json' },
      { os: 'Project', path: '.amazonq/mcp.json' },
    ],
  },
  {
    id: 'warp',
    label: 'Warp',
    category: 'CLI Agent',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    keywords: ['terminal'],
    osPaths: [
      { os: 'Global', path: '~/.warp/.mcp.json' },
      { os: 'Project', path: '.warp/.mcp.json' },
      { os: 'App UI', path: 'Settings → AI → Manage MCP servers' },
    ],
  },
  {
    id: 'goose',
    label: 'Goose',
    category: 'CLI Agent',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    keywords: ['block', 'codename goose'],
    osPaths: [
      { os: 'Windows', platformKey: 'win32', path: '%APPDATA%\\Block\\goose\\config\\config.yaml' },
      { os: 'macOS / Linux', platformKey: 'darwin', path: '~/.config/goose/config.yaml' },
    ],
  },

  // ── Desktop & Web ──
  {
    id: 'codex',
    label: 'Codex (Desktop & CLI)',
    category: 'Desktop & Web',
    transport: 'HTTP',
    badge: 'TOML · Desktop & CLI',
    keywords: ['openai', 'chatgpt', 'codex desktop', 'codex cli', 'toml'],
    osPaths: [
      { os: 'Windows', platformKey: 'win32', path: '%USERPROFILE%\\.codex\\config.toml' },
      { os: 'macOS / Linux', platformKey: 'darwin', path: '~/.codex/config.toml' },
      { os: 'Project', path: '.codex/config.toml' },
      { os: 'Desktop App', path: 'Codex Desktop → Settings (Gear) → MCP / Open config.toml' },
    ],
  },
  {
    id: 'claude_desktop',
    label: 'Claude Desktop',
    category: 'Desktop & Web',
    transport: 'STDIO/HTTPS',
    badge: 'STDIO & HTTPS Connector',
    keywords: ['anthropic', 'claude.ai', 'connectors'],
    osPaths: [
      { os: 'Windows', platformKey: 'win32', path: '%APPDATA%\\Claude\\claude_desktop_config.json' },
      { os: 'macOS', platformKey: 'darwin', path: '~/Library/Application Support/Claude/claude_desktop_config.json' },
      { os: 'Linux', platformKey: 'linux', path: '~/.config/Claude/claude_desktop_config.json' },
      { os: 'Custom Connector', path: 'Settings → Connectors → Add custom connector (HTTPS Tunnel)' },
    ],
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    category: 'Desktop & Web',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    keywords: ['local llm', 'desktop'],
    osPaths: [
      { os: 'Windows', platformKey: 'win32', path: '%USERPROFILE%\\.lmstudio\\mcp.json' },
      { os: 'macOS / Linux', platformKey: 'darwin', path: '~/.lmstudio/mcp.json' },
      { os: 'App UI', path: 'Program (Sidebar) → Install → Edit mcp.json' },
    ],
  },
  {
    id: 'raycast',
    label: 'Raycast',
    category: 'Desktop & Web',
    transport: 'HTTP/STDIO',
    badge: 'App UI · HTTP & STDIO',
    keywords: ['launcher', 'macos', 'windows'],
    osPaths: [
      { os: 'App UI', path: 'Raycast → Manage MCP Servers → Install New Server' },
    ],
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT Web (Connectors)',
    category: 'Desktop & Web',
    transport: 'HTTPS',
    badge: 'HTTPS Tunnel · Web Only',
    requiresTunnel: true,
    keywords: ['openai', 'chatgpt.com', 'developer mode', 'apps'],
    osPaths: [
      { os: 'Web (chatgpt.com)', path: 'Settings → Apps → Advanced settings → Developer mode → Create connector' },
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini Web (Connected Apps)',
    category: 'Desktop & Web',
    transport: 'HTTPS',
    badge: 'HTTPS Tunnel · Web',
    requiresTunnel: true,
    keywords: ['google', 'gemini.google.com', 'connected apps', 'enterprise'],
    osPaths: [
      { os: 'Web (gemini.google.com)', path: 'Settings → Connected Apps → Add custom app (HTTPS Tunnel URL)' },
      { os: 'Gemini Enterprise', path: 'Google Cloud Console → Gemini Enterprise → Data Stores → Custom MCP' },
    ],
  },

  // ── Universal ──
  {
    id: 'other',
    label: 'Other (Any Client)',
    category: 'Universal',
    transport: 'HTTP',
    badge: 'Universal',
    keywords: ['sse', 'stdio', 'mcp-remote', 'generic'],
    osPaths: [
      { os: 'Streamable HTTP', path: 'http://127.0.0.1:<port>/mcp' },
      { os: 'Legacy SSE', path: 'http://127.0.0.1:<port>/sse' },
      { os: 'STDIO Bridge', path: 'npx -y mcp-remote <url>' },
    ],
  },
];

export interface ClientGuideMode {
  id: string;
  label: string;
  subtitle: string;
  fileHint: string;
  snippet: string;
  copyLabel: string;
  warning?: string;
  requiresTunnel?: boolean;
}

export interface ClientGuideResult {
  subtitle: string;
  fileHint: string;
  snippet: string;
  copyLabel: string;
  warning?: string;
  info?: string;
  modes?: ClientGuideMode[];
}

/**
 * Generate the exact 1-click config snippet or CLI command for any desktop IDE, CLI agent, or web connector.
 */
export function buildClientGuide(
  client: ClientPreset | 'gemini',
  {
    localHttpUrl,
    localSseUrl,
    remoteUrl,
    authToken,
  }: { localHttpUrl: string; localSseUrl?: string; remoteUrl: string; authToken: string }
): ClientGuideResult {
  const resolved: ClientPreset = client;
  const token = authToken.trim();
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : null;
  const sseUrl = localSseUrl || localHttpUrl.replace(/\/mcp$/, '/sse');

  switch (resolved) {
    case 'claude_code': {
      const headerFlag = token ? ` --header "Authorization: Bearer ${token}"` : '';
      const cliMode: ClientGuideMode = {
        id: 'cli',
        label: 'CLI Command',
        subtitle: 'Run once in your terminal to register MCP Switchboard globally or per project:',
        fileHint: 'Terminal CLI',
        snippet: `claude mcp add --transport http mcp-switchboard ${localHttpUrl}${headerFlag}`,
        copyLabel: 'Claude Code command',
      };
      const jsonMode: ClientGuideMode = {
        id: 'json',
        label: '.mcp.json',
        subtitle: 'Add to project .mcp.json (or ~/.claude.json under mcpServers):',
        fileHint: '.mcp.json',
        snippet: JSON.stringify(
          { mcpServers: { 'mcp-switchboard': { type: 'http', url: localHttpUrl, ...(authHeaders ? { headers: authHeaders } : {}) } } },
          null,
          2
        ),
        copyLabel: 'Claude Code .mcp.json',
      };
      return {
        ...cliMode,
        modes: [cliMode, jsonMode],
      };
    }

    case 'cursor':
      return {
        subtitle: 'Add to ~/.cursor/mcp.json (global) or .cursor/mcp.json (project):',
        fileHint: '~/.cursor/mcp.json',
        snippet: JSON.stringify(
          { mcpServers: { 'mcp-switchboard': { url: localHttpUrl, ...(authHeaders ? { headers: authHeaders } : {}) } } },
          null,
          2
        ),
        copyLabel: 'Cursor mcp.json',
      };

    case 'vscode':
      return {
        subtitle: 'Add to .vscode/mcp.json or VS Code User MCP settings (uses "servers" root key):',
        fileHint: '.vscode/mcp.json',
        snippet: JSON.stringify(
          { servers: { 'mcp-switchboard': { type: 'http', url: localHttpUrl, ...(authHeaders ? { headers: authHeaders } : {}) } } },
          null,
          2
        ),
        copyLabel: 'VS Code mcp.json',
      };

    case 'windsurf':
      return {
        subtitle: 'Add to ~/.codeium/windsurf/mcp_config.json (uses "serverUrl" for Streamable HTTP):',
        fileHint: 'mcp_config.json',
        snippet: JSON.stringify(
          { mcpServers: { 'mcp-switchboard': { serverUrl: localHttpUrl, ...(authHeaders ? { headers: authHeaders } : {}) } } },
          null,
          2
        ),
        copyLabel: 'Windsurf config',
      };

    case 'antigravity':
      return {
        subtitle: 'Add to ~/.gemini/antigravity/mcp_config.json (global) or .agents/mcp_config.json (workspace):',
        fileHint: 'mcp_config.json',
        snippet: JSON.stringify(
          { mcpServers: { 'mcp-switchboard': { serverUrl: localHttpUrl, ...(authHeaders ? { headers: authHeaders } : {}) } } },
          null,
          2
        ),
        copyLabel: 'Antigravity IDE config',
      };

    case 'kiro':
      return {
        subtitle: 'Add to ~/.kiro/settings/mcp.json (global) or .kiro/settings/mcp.json (workspace):',
        fileHint: '~/.kiro/settings/mcp.json',
        snippet: JSON.stringify(
          { mcpServers: { 'mcp-switchboard': { url: localHttpUrl, ...(authHeaders ? { headers: authHeaders } : {}) } } },
          null,
          2
        ),
        copyLabel: 'Kiro mcp.json',
      };

    case 'trae':
      return {
        subtitle: 'Add to ~/.trae/mcp.json (global) or .trae/mcp.json (workspace), or paste in Settings → MCP:',
        fileHint: '~/.trae/mcp.json',
        snippet: JSON.stringify(
          { mcpServers: { 'mcp-switchboard': { url: localHttpUrl, transport: 'http', ...(authHeaders ? { headers: authHeaders } : {}) } } },
          null,
          2
        ),
        copyLabel: 'Trae mcp.json',
      };

    case 'zed': {
      const httpMode: ClientGuideMode = {
        id: 'http',
        label: 'Remote HTTP',
        subtitle: 'Add to Zed settings.json under context_servers:',
        fileHint: 'settings.json',
        snippet: JSON.stringify(
          { context_servers: { 'mcp-switchboard': { url: localHttpUrl, ...(authHeaders ? { headers: authHeaders } : {}) } } },
          null,
          2
        ),
        copyLabel: 'Zed HTTP config',
      };
      const stdioArgs = ['-y', 'mcp-remote', localHttpUrl];
      if (token) stdioArgs.push('--header', `Authorization:Bearer ${token}`);
      const stdioMode: ClientGuideMode = {
        id: 'stdio',
        label: 'STDIO Bridge',
        subtitle: 'Alternative local STDIO bridge in Zed settings.json under context_servers:',
        fileHint: 'settings.json',
        snippet: JSON.stringify(
          { context_servers: { 'mcp-switchboard': { command: { path: 'npx', args: stdioArgs } } } },
          null,
          2
        ),
        copyLabel: 'Zed STDIO config',
      };
      return {
        ...httpMode,
        modes: [httpMode, stdioMode],
      };
    }

    case 'jetbrains':
      return {
        subtitle: 'Add via Settings → Tools → AI Assistant → Model Context Protocol (MCP) or .junie/mcp/mcp.json:',
        fileHint: '.junie/mcp/mcp.json',
        snippet: JSON.stringify(
          { mcpServers: { 'mcp-switchboard': { type: 'streamable-http', url: localHttpUrl, ...(authHeaders ? { headers: authHeaders } : {}) } } },
          null,
          2
        ),
        copyLabel: 'JetBrains config',
      };

    case 'pycharm':
      return {
        subtitle: 'Add in PyCharm via Settings → Tools → AI Assistant → Model Context Protocol (MCP) or .junie/mcp/mcp.json:',
        fileHint: '.junie/mcp/mcp.json',
        snippet: JSON.stringify(
          { mcpServers: { 'mcp-switchboard': { type: 'streamable-http', url: localHttpUrl, ...(authHeaders ? { headers: authHeaders } : {}) } } },
          null,
          2
        ),
        copyLabel: 'PyCharm MCP config',
      };

    case 'cline':
      return {
        subtitle: 'Add to cline_mcp_settings.json (Cline uses camelCase "streamableHttp"):',
        fileHint: 'cline_mcp_settings.json',
        snippet: JSON.stringify(
          {
            mcpServers: {
              'mcp-switchboard': {
                type: 'streamableHttp',
                url: localHttpUrl,
                disabled: false,
                ...(authHeaders ? { headers: authHeaders } : {}),
              },
            },
          },
          null,
          2
        ),
        copyLabel: 'Cline config',
      };

    case 'roo_code':
      return {
        subtitle: 'Add to mcp_settings.json (Roo Code uses kebab-case "streamable-http"):',
        fileHint: 'mcp_settings.json',
        snippet: JSON.stringify(
          {
            mcpServers: {
              'mcp-switchboard': {
                type: 'streamable-http',
                url: localHttpUrl,
                disabled: false,
                ...(authHeaders ? { headers: authHeaders } : {}),
              },
            },
          },
          null,
          2
        ),
        copyLabel: 'Roo Code config',
      };

    case 'continue_dev': {
      let yaml = `mcpServers:\n  - name: mcp-switchboard\n    type: streamable-http\n    url: ${localHttpUrl}`;
      if (token) {
        yaml += `\n    requestOptions:\n      headers:\n        Authorization: "Bearer ${token}"`;
      }
      return {
        subtitle: 'Add to ~/.continue/config.yaml:',
        fileHint: '~/.continue/config.yaml',
        snippet: yaml,
        copyLabel: 'Continue config',
      };
    }

    case 'codex': {
      let toml = `[mcp_servers.mcp-switchboard]\nurl = "${localHttpUrl}"`;
      if (token) {
        toml += `\nbearer_token_env_var = "MCP_SWITCHBOARD_TOKEN"\n\n# Export MCP_SWITCHBOARD_TOKEN="${token}" in your environment before launching Codex Desktop or CLI.`;
      }
      const tomlMode: ClientGuideMode = {
        id: 'toml',
        label: 'config.toml (Desktop & CLI)',
        subtitle:
          'Shared by OpenAI Codex Desktop app, Codex CLI, and Codex IDE extension. Add to ~/.codex/config.toml (or open via Codex Desktop → Settings → MCP):',
        fileHint: '~/.codex/config.toml',
        snippet: toml,
        copyLabel: 'Codex config.toml',
      };
      const cliCmd = token
        ? `codex mcp add mcp-switchboard --url ${localHttpUrl} --bearer-token-env-var MCP_SWITCHBOARD_TOKEN`
        : `codex mcp add mcp-switchboard --url ${localHttpUrl}`;
      const cliMode: ClientGuideMode = {
        id: 'cli',
        label: 'CLI Command',
        subtitle: 'Register via Codex CLI (writes to ~/.codex/config.toml and syncs directly with Codex Desktop):',
        fileHint: 'Terminal CLI',
        snippet: cliCmd,
        copyLabel: 'Codex CLI command',
      };
      return {
        ...tomlMode,
        info: 'Codex Desktop & CLI share ~/.codex/config.toml for local and HTTP MCP servers. Standalone ChatGPT desktop chat does not support local MCP configs.',
        modes: [tomlMode, cliMode],
      };
    }

    case 'gemini_cli': {
      const jsonMode: ClientGuideMode = {
        id: 'json',
        label: 'settings.json',
        subtitle: 'Add to ~/.gemini/settings.json (Gemini CLI uses "httpUrl" for Streamable HTTP):',
        fileHint: '~/.gemini/settings.json',
        snippet: JSON.stringify(
          { mcpServers: { 'mcp-switchboard': { httpUrl: localHttpUrl, ...(authHeaders ? { headers: authHeaders } : {}) } } },
          null,
          2
        ),
        copyLabel: 'Gemini CLI config',
      };
      const cliMode: ClientGuideMode = {
        id: 'cli',
        label: 'CLI Command',
        subtitle: 'Or register automatically via the Gemini CLI:',
        fileHint: 'Terminal CLI',
        snippet: `gemini mcp add --transport http mcp-switchboard ${localHttpUrl}`,
        copyLabel: 'Gemini CLI command',
      };
      return {
        ...jsonMode,
        modes: [jsonMode, cliMode],
      };
    }

    case 'copilot_cli':
      return {
        subtitle: 'Add to ~/.copilot/mcp-config.json (or project .mcp.json). Copilot CLI requires explicit "type" and "tools":',
        fileHint: '~/.copilot/mcp-config.json',
        snippet: JSON.stringify(
          {
            mcpServers: {
              'mcp-switchboard': {
                type: 'http',
                url: localHttpUrl,
                tools: ['*'],
                ...(authHeaders ? { headers: authHeaders } : {}),
              },
            },
          },
          null,
          2
        ),
        copyLabel: 'GitHub Copilot CLI config',
      };

    case 'opencode':
      return {
        subtitle: 'Add to ~/.config/opencode/opencode.json (uses "mcp" root key):',
        fileHint: 'opencode.json',
        snippet: JSON.stringify(
          {
            mcp: {
              'mcp-switchboard': {
                type: 'remote',
                url: localHttpUrl,
                enabled: true,
                ...(authHeaders ? { headers: authHeaders } : {}),
              },
            },
          },
          null,
          2
        ),
        copyLabel: 'OpenCode config',
      };

    case 'amp': {
      const jsonMode: ClientGuideMode = {
        id: 'json',
        label: 'settings.json',
        subtitle: 'Add to ~/.config/amp/settings.json (or .amp/settings.json under "amp.mcpServers"):',
        fileHint: '~/.config/amp/settings.json',
        snippet: JSON.stringify(
          {
            'amp.mcpServers': {
              'mcp-switchboard': {
                url: localHttpUrl,
                ...(authHeaders ? { headers: authHeaders } : {}),
              },
            },
          },
          null,
          2
        ),
        copyLabel: 'Amp settings.json',
      };
      const cliMode: ClientGuideMode = {
        id: 'cli',
        label: 'CLI Command',
        subtitle: 'Or register directly via the Amp CLI:',
        fileHint: 'Terminal CLI',
        snippet: `amp mcp add mcp-switchboard ${localHttpUrl}`,
        copyLabel: 'Amp CLI command',
      };
      return {
        ...jsonMode,
        modes: [jsonMode, cliMode],
      };
    }

    case 'amazon_q':
      return {
        subtitle: 'Add to ~/.aws/amazonq/mcp.json (or project .amazonq/mcp.json):',
        fileHint: '~/.aws/amazonq/mcp.json',
        snippet: JSON.stringify(
          { mcpServers: { 'mcp-switchboard': { type: 'http', url: localHttpUrl, ...(authHeaders ? { headers: authHeaders } : {}) } } },
          null,
          2
        ),
        copyLabel: 'Amazon Q config',
      };

    case 'warp':
      return {
        subtitle: 'Add to ~/.warp/.mcp.json (global) or .warp/.mcp.json (repo), or via Settings → AI → Manage MCP servers:',
        fileHint: '~/.warp/.mcp.json',
        snippet: JSON.stringify(
          { mcpServers: { 'mcp-switchboard': { url: localHttpUrl, ...(authHeaders ? { headers: authHeaders } : {}) } } },
          null,
          2
        ),
        copyLabel: 'Warp config',
      };

    case 'goose': {
      let gooseYaml = `extensions:\n  mcp-switchboard:\n    name: MCP Switchboard\n    type: streamable_http\n    uri: ${localHttpUrl}`;
      if (token) {
        gooseYaml += `\n    headers:\n      Authorization: "Bearer ${token}"`;
      }
      return {
        subtitle: 'Add to ~/.config/goose/config.yaml:',
        fileHint: '~/.config/goose/config.yaml',
        snippet: gooseYaml,
        copyLabel: 'Goose config',
      };
    }

    case 'claude_desktop': {
      const args = ['-y', 'mcp-remote', localHttpUrl];
      if (token) args.push('--header', `Authorization:Bearer ${token}`);
      const stdioMode: ClientGuideMode = {
        id: 'stdio',
        label: 'Local Config (STDIO)',
        subtitle: 'Add to claude_desktop_config.json using mcp-remote (then fully quit & reopen Claude Desktop from tray/dock):',
        fileHint: 'claude_desktop_config.json',
        snippet: JSON.stringify(
          { mcpServers: { 'mcp-switchboard': { command: 'npx', args } } },
          null,
          2
        ),
        copyLabel: 'Claude Desktop config',
      };
      const connectorMode: ClientGuideMode = {
        id: 'connector',
        label: 'Custom Connector (HTTPS)',
        subtitle: 'Claude Desktop & Claude.ai Web also support native Custom Connectors — turn Tunnel ON and paste in Settings → Connectors → Add custom connector:',
        fileHint: 'HTTPS Tunnel URL',
        snippet: remoteUrl || 'https://<your-tunnel>.trycloudflare.com/mcp',
        copyLabel: 'Claude Custom Connector URL',
        requiresTunnel: true,
      };
      return {
        ...stdioMode,
        modes: [stdioMode, connectorMode],
      };
    }

    case 'lmstudio':
      return {
        subtitle: 'Add to ~/.lmstudio/mcp.json (or Program sidebar → Install → Edit mcp.json):',
        fileHint: '~/.lmstudio/mcp.json',
        snippet: JSON.stringify(
          { mcpServers: { 'mcp-switchboard': { url: localHttpUrl, ...(authHeaders ? { headers: authHeaders } : {}) } } },
          null,
          2
        ),
        copyLabel: 'LM Studio mcp.json',
      };

    case 'raycast': {
      const httpMode: ClientGuideMode = {
        id: 'http',
        label: 'Remote HTTP (UI)',
        subtitle: 'Open Raycast → Manage MCP Servers → Install New Server → select HTTP transport:',
        fileHint: 'Raycast MCP Form',
        snippet: token
          ? `Name: MCP Switchboard\nTransport: HTTP\nURL: ${localHttpUrl}\nHeader: Authorization = Bearer ${token}`
          : `Name: MCP Switchboard\nTransport: HTTP\nURL: ${localHttpUrl}`,
        copyLabel: 'Raycast HTTP details',
      };
      const stdioMode: ClientGuideMode = {
        id: 'stdio',
        label: 'STDIO (UI)',
        subtitle: 'Or select stdio transport in Raycast → Install New Server:',
        fileHint: 'Raycast STDIO Form',
        snippet: token
          ? `Name: MCP Switchboard\nTransport: stdio\nCommand: npx\nArguments: -y mcp-remote ${localHttpUrl} --header "Authorization:Bearer ${token}"`
          : `Name: MCP Switchboard\nTransport: stdio\nCommand: npx\nArguments: -y mcp-remote ${localHttpUrl}`,
        copyLabel: 'Raycast STDIO details',
      };
      return {
        ...httpMode,
        modes: [httpMode, stdioMode],
      };
    }

    case 'chatgpt':
      return {
        subtitle:
          'ChatGPT Web (chatgpt.com) connects to remote HTTPS MCP servers via Developer Mode. Turn the Tunnel switch ON, then paste your HTTPS /mcp URL under Settings → Apps → Advanced settings → Developer mode → Create connector:',
        fileHint: 'HTTPS Tunnel URL (Web)',
        snippet: remoteUrl || 'https://<your-tunnel>.trycloudflare.com/mcp',
        copyLabel: 'ChatGPT Web HTTPS tunnel URL',
        warning:
          'Web Connectors only: The standalone ChatGPT desktop chat app has no local MCP config mechanism. For OpenAI desktop & local MCP support, use Codex (Desktop & CLI).',
      };

    case 'gemini':
    case 'web_connectors':
      return {
        subtitle:
          'Turn the Tunnel switch ON, then paste your HTTPS /mcp URL into Gemini Web (gemini.google.com → Settings → Connected Apps → Add custom app):',
        fileHint: 'HTTPS Tunnel URL (Web)',
        snippet: remoteUrl || 'https://<your-tunnel>.trycloudflare.com/mcp',
        copyLabel: 'Gemini Web HTTPS tunnel URL',
        warning: token
          ? 'Note: Gemini Web Connected Apps require a personal Google Account with Gemini Apps Activity ON and do not send static custom Bearer headers. Clear the Bearer Token in Settings or use Gemini CLI for local auth.'
          : 'Requires a personal Google Account with Gemini Apps Activity ON. For local terminal/IDE MCP without a tunnel, use Gemini CLI (~/.gemini/settings.json).',
      };

    case 'other':
    default: {
      const stdioCmd = token
        ? `npx -y mcp-remote ${localHttpUrl} --header "Authorization:Bearer ${token}"`
        : `npx -y mcp-remote ${localHttpUrl}`;
      const jsonMode: ClientGuideMode = {
        id: 'json',
        label: 'Universal JSON',
        subtitle: 'Universal configuration for any MCP-compatible client (Streamable HTTP, Legacy SSE, or STDIO bridge):',
        fileHint: 'Universal MCP Config',
        snippet:
          JSON.stringify(
            {
              mcpServers: {
                'mcp-switchboard': {
                  url: localHttpUrl,
                  sseUrl,
                  ...(authHeaders ? { headers: authHeaders } : {}),
                },
              },
            },
            null,
            2
          ) +
          `\n\n# Endpoints:\n# Streamable HTTP: ${localHttpUrl}\n# Legacy SSE:      ${sseUrl}\n\n# STDIO Bridge fallback:\n# ${stdioCmd}\n# Or bundled sidecar: node server.cjs --stdio`,
        copyLabel: 'Universal config',
      };
      const stdioMode: ClientGuideMode = {
        id: 'stdio',
        label: 'STDIO Bridge',
        subtitle: 'For legacy STDIO-only MCP clients that do not yet support Streamable HTTP or SSE directly:',
        fileHint: 'STDIO Bridge Command',
        snippet: stdioCmd,
        copyLabel: 'STDIO bridge command',
      };
      return {
        ...jsonMode,
        modes: [jsonMode, stdioMode],
      };
    }
  }
}
