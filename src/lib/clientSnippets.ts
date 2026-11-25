export type ClientPreset =
  | 'claude_code'
  | 'cursor'
  | 'vscode'
  | 'windsurf'
  | 'antigravity'
  | 'zed'
  | 'jetbrains'
  | 'pycharm'
  | 'cline'
  | 'roo_code'
  | 'continue_dev'
  | 'codex'
  | 'gemini_cli'
  | 'opencode'
  | 'amazon_q'
  | 'warp'
  | 'goose'
  | 'claude_desktop'
  | 'chatgpt'
  | 'gemini'
  | 'web_connectors'
  | 'other';

export type ClientCategory = 'IDE' | 'CLI Agent' | 'Desktop & Web' | 'Universal';

export interface ClientTabMeta {
  id: ClientPreset;
  label: string;
  category: ClientCategory;
  transport: string;
  badge: string;
  osPaths: Array<{ os: string; path: string }>;
}

export const CLIENT_TABS: ClientTabMeta[] = [
  // ── IDE ──
  {
    id: 'cursor',
    label: 'Cursor',
    category: 'IDE',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    osPaths: [
      { os: 'Windows', path: '%USERPROFILE%\\.cursor\\mcp.json' },
      { os: 'macOS / Linux', path: '~/.cursor/mcp.json' },
      { os: 'Project', path: '.cursor/mcp.json' },
    ],
  },
  {
    id: 'vscode',
    label: 'VS Code',
    category: 'IDE',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    osPaths: [
      { os: 'Workspace', path: '.vscode/mcp.json' },
      { os: 'Windows', path: '%APPDATA%\\Code\\User\\mcp.json' },
      { os: 'macOS', path: '~/Library/Application Support/Code/User/mcp.json' },
      { os: 'Linux', path: '~/.config/Code/User/mcp.json' },
    ],
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    category: 'IDE',
    transport: 'SSE/HTTP',
    badge: 'SSE / HTTP',
    osPaths: [
      { os: 'Windows', path: '%USERPROFILE%\\.codeium\\windsurf\\mcp_config.json' },
      { os: 'macOS / Linux', path: '~/.codeium/windsurf/mcp_config.json' },
    ],
  },
  {
    id: 'antigravity',
    label: 'Antigravity IDE',
    category: 'IDE',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    osPaths: [
      { os: 'Global', path: '~/.gemini/config/mcp_config.json' },
      { os: 'Legacy Global', path: '~/.gemini/antigravity/mcp_config.json' },
      { os: 'Workspace', path: '.agents/mcp_config.json' },
      { os: 'IDE UI', path: 'Agent Panel (···) → MCP Servers → Manage MCP Servers' },
    ],
  },
  {
    id: 'zed',
    label: 'Zed',
    category: 'IDE',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    osPaths: [
      { os: 'Windows', path: '%APPDATA%\\Zed\\settings.json' },
      { os: 'macOS / Linux', path: '~/.config/zed/settings.json' },
    ],
  },
  {
    id: 'jetbrains',
    label: 'JetBrains',
    category: 'IDE',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    osPaths: [
      { os: 'Project', path: '.junie/mcp/mcp.json' },
      { os: 'UI', path: 'AI Assistant → Tools → MCP' },
    ],
  },
  {
    id: 'pycharm',
    label: 'PyCharm',
    category: 'IDE',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
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
    osPaths: [
      { os: 'Windows', path: '%APPDATA%\\Code\\User\\globalStorage\\saoudrizwan.claude-dev\\settings\\cline_mcp_settings.json' },
      { os: 'macOS', path: '~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json' },
      { os: 'Linux', path: '~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json' },
    ],
  },
  {
    id: 'roo_code',
    label: 'Roo Code',
    category: 'IDE',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    osPaths: [
      { os: 'Windows', path: '%APPDATA%\\Code\\User\\globalStorage\\rooveterinaryinc.roo-cline\\settings\\mcp_settings.json' },
      { os: 'macOS', path: '~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json' },
      { os: 'Linux', path: '~/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json' },
    ],
  },
  {
    id: 'continue_dev',
    label: 'Continue',
    category: 'IDE',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    osPaths: [
      { os: 'Windows', path: '%USERPROFILE%\\.continue\\config.yaml' },
      { os: 'macOS / Linux', path: '~/.continue/config.yaml' },
    ],
  },

  // ── CLI Agent ──
  {
    id: 'claude_code',
    label: 'Claude Code',
    category: 'CLI Agent',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    osPaths: [
      { os: 'Global', path: '~/.claude.json (via claude mcp add)' },
      { os: 'Project', path: '.mcp.json' },
    ],
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    category: 'CLI Agent',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    osPaths: [
      { os: 'Config', path: '~/.codex/config.toml' },
      { os: 'CLI', path: 'codex mcp add mcp-switchboard --url ...' },
    ],
  },
  {
    id: 'gemini_cli',
    label: 'Gemini CLI',
    category: 'CLI Agent',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    osPaths: [
      { os: 'Windows', path: '%USERPROFILE%\\.gemini\\settings.json' },
      { os: 'macOS / Linux', path: '~/.gemini/settings.json' },
    ],
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    category: 'CLI Agent',
    transport: 'HTTP',
    badge: 'Remote HTTP',
    osPaths: [
      { os: 'Config', path: '~/.config/opencode/opencode.json' },
    ],
  },
  {
    id: 'amazon_q',
    label: 'Amazon Q',
    category: 'CLI Agent',
    transport: 'HTTP',
    badge: 'HTTP',
    osPaths: [
      { os: 'Config', path: '~/.aws/amazonq/mcp.json' },
    ],
  },
  {
    id: 'warp',
    label: 'Warp',
    category: 'CLI Agent',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    osPaths: [
      { os: 'Project', path: '.warp/.mcp.json' },
      { os: 'Global', path: '~/.warp/.mcp.json' },
    ],
  },
  {
    id: 'goose',
    label: 'Goose',
    category: 'CLI Agent',
    transport: 'HTTP',
    badge: 'Streamable HTTP',
    osPaths: [
      { os: 'Config', path: '~/.config/goose/config.yaml' },
    ],
  },

  // ── Desktop & Web ──
  {
    id: 'claude_desktop',
    label: 'Claude Desktop',
    category: 'Desktop & Web',
    transport: 'STDIO',
    badge: 'STDIO Bridge',
    osPaths: [
      { os: 'Windows', path: '%APPDATA%\\Claude\\claude_desktop_config.json' },
      { os: 'macOS', path: '~/Library/Application Support/Claude/claude_desktop_config.json' },
      { os: 'Linux', path: '~/.config/Claude/claude_desktop_config.json' },
    ],
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    category: 'Desktop & Web',
    transport: 'HTTPS',
    badge: 'HTTPS Tunnel',
    osPaths: [
      { os: 'Web / Desktop', path: 'Settings → Apps / Connectors → Create Developer Connector' },
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    category: 'Desktop & Web',
    transport: 'HTTPS',
    badge: 'HTTPS Tunnel',
    osPaths: [
      { os: 'Web / Desktop', path: 'Settings → Connectors (HTTPS Tunnel URL)' },
    ],
  },

  // ── Universal ──
  {
    id: 'other',
    label: 'Other (Any Client)',
    category: 'Universal',
    transport: 'HTTP',
    badge: 'Universal',
    osPaths: [
      { os: 'Streamable HTTP', path: 'http://127.0.0.1:<port>/mcp' },
      { os: 'Legacy SSE', path: 'http://127.0.0.1:<port>/sse' },
      { os: 'STDIO Bridge', path: 'npx -y @anthropic-ai/mcp-remote <url>' },
    ],
  },
];

export interface ClientGuideResult {
  subtitle: string;
  fileHint: string;
  snippet: string;
  copyLabel: string;
  warning?: string;
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
      return {
        subtitle: 'Run once in your terminal to register MCP Switchboard globally or per project:',
        fileHint: 'Terminal CLI',
        snippet: `claude mcp add --transport http mcp-switchboard ${localHttpUrl}${headerFlag}`,
        copyLabel: 'Claude Code command',
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
        subtitle: 'Add to .vscode/mcp.json or VS Code User MCP settings (GitHub Copilot):',
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
        subtitle: 'Add to ~/.codeium/windsurf/mcp_config.json:',
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
        subtitle: 'Add to ~/.gemini/config/mcp_config.json (global) or .agents/mcp_config.json (project):',
        fileHint: 'mcp_config.json',
        snippet: JSON.stringify(
          { mcpServers: { 'mcp-switchboard': { serverUrl: localHttpUrl, ...(authHeaders ? { headers: authHeaders } : {}) } } },
          null,
          2
        ),
        copyLabel: 'Antigravity IDE config',
      };

    case 'zed':
      return {
        subtitle: 'Add to Zed settings.json under context_servers:',
        fileHint: 'settings.json',
        snippet: JSON.stringify(
          { context_servers: { 'mcp-switchboard': { url: localHttpUrl, ...(authHeaders ? { headers: authHeaders } : {}) } } },
          null,
          2
        ),
        copyLabel: 'Zed config',
      };

    case 'jetbrains':
      return {
        subtitle: 'Add to .junie/mcp/mcp.json or AI Assistant → MCP Settings:',
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
        fileHint: 'PyCharm MCP JSON',
        snippet: JSON.stringify(
          { mcpServers: { 'mcp-switchboard': { type: 'http', url: localHttpUrl, ...(authHeaders ? { headers: authHeaders } : {}) } } },
          null,
          2
        ),
        copyLabel: 'PyCharm MCP config',
      };

    case 'cline':
      return {
        subtitle: 'Add to cline_mcp_settings.json (Cline VS Code extension settings):',
        fileHint: 'cline_mcp_settings.json',
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
        copyLabel: 'Cline config',
      };

    case 'roo_code':
      return {
        subtitle: 'Add to mcp_settings.json (Roo Code VS Code extension settings):',
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
        toml += `\nbearer_token_env_var = "MCP_SWITCHBOARD_TOKEN"\n\n# Export MCP_SWITCHBOARD_TOKEN="${token}" in your shell, or register via CLI:\n# codex mcp add mcp-switchboard --url ${localHttpUrl} --bearer-token-env-var MCP_SWITCHBOARD_TOKEN`;
      } else {
        toml += `\n\n# Or register via CLI:\n# codex mcp add mcp-switchboard --url ${localHttpUrl}`;
      }
      return {
        subtitle: 'Add to ~/.codex/config.toml or register with the Codex CLI:',
        fileHint: '~/.codex/config.toml',
        snippet: toml,
        copyLabel: 'Codex config',
      };
    }

    case 'gemini_cli':
      return {
        subtitle: 'Add to ~/.gemini/settings.json:',
        fileHint: '~/.gemini/settings.json',
        snippet: JSON.stringify(
          { mcpServers: { 'mcp-switchboard': { httpUrl: localHttpUrl, ...(authHeaders ? { headers: authHeaders } : {}) } } },
          null,
          2
        ),
        copyLabel: 'Gemini CLI config',
      };

    case 'opencode':
      return {
        subtitle: 'Add to ~/.config/opencode/opencode.json:',
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

    case 'amazon_q':
      return {
        subtitle: 'Add to ~/.aws/amazonq/mcp.json:',
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
        subtitle: 'Add to .warp/.mcp.json (project) or ~/.warp/.mcp.json (global):',
        fileHint: '.warp/.mcp.json',
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
      return {
        subtitle: 'Claude Desktop requires a STDIO bridge (mcp-remote) or bundled server.cjs --stdio:',
        fileHint: 'claude_desktop_config.json',
        snippet: JSON.stringify(
          { mcpServers: { 'mcp-switchboard': { command: 'npx', args } } },
          null,
          2
        ),
        copyLabel: 'Claude Desktop config',
      };
    }

    case 'chatgpt':
      return {
        subtitle:
          'Flip the Tunnel switch ON, then paste your HTTPS /mcp URL into ChatGPT (Settings → Apps / Connectors):',
        fileHint: 'HTTPS Tunnel URL',
        snippet: remoteUrl || 'https://<your-tunnel>.trycloudflare.com/mcp',
        copyLabel: 'ChatGPT HTTPS tunnel URL',
      };

    case 'gemini':
    case 'web_connectors':
      return {
        subtitle:
          'Flip the Tunnel switch ON, then paste your HTTPS /mcp URL into Gemini (Settings → Connectors):',
        fileHint: 'HTTPS Tunnel URL',
        snippet: remoteUrl || 'https://<your-tunnel>.trycloudflare.com/mcp',
        copyLabel: 'Gemini HTTPS tunnel URL',
        warning: token
          ? 'Note: Gemini Custom MCP does not send custom Bearer headers. Clear the Bearer Token in Settings if using Gemini Custom MCP.'
          : undefined,
      };

    case 'other':
    default: {
      const stdioCmd = token
        ? `npx -y @anthropic-ai/mcp-remote ${localHttpUrl} --header "Authorization:Bearer ${token}"`
        : `npx -y @anthropic-ai/mcp-remote ${localHttpUrl}`;
      return {
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
    }
  }
}
