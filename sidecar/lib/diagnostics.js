import { checkBinary, getInstallHint } from './processUtils.js';

const PREREQUISITES = [
  {
    id: 'node',
    label: 'Node.js',
    required: true,
    args: ['-v'],
    role: 'Required — runs the MCP Switchboard engine and Node.js STDIO servers.',
  },
  {
    id: 'npx',
    label: 'npx',
    required: false,
    args: ['--version'],
    role: 'Optional (included with Node.js) — launches npm MCP packages such as filesystem, github, or playwright.',
  },
  {
    id: 'uvx',
    label: 'uvx (uv)',
    required: false,
    args: ['--version'],
    role: 'Optional — only needed if you run Python uvx MCP servers (such as mcp-server-fetch). Local IDEs & npx servers work without it.',
  },
  {
    id: 'python',
    label: 'Python',
    required: false,
    args: ['--version'],
    role: 'Optional — only needed for custom local .py MCP server scripts. Safe to skip if you use Node/npx or HTTP servers.',
  },
  {
    id: 'cloudflared',
    label: 'cloudflared',
    required: false,
    args: ['--version'],
    role: 'Optional — only needed when enabling the public HTTPS Tunnel for remote web clients (ChatGPT, Gemini, Claude Web). Local IDEs connect without it.',
  },
];

export async function runDiagnostics() {
  const results = await Promise.all(
    PREREQUISITES.map(async (item) => {
      const probe = await checkBinary(item.id, item.args);
      return {
        id: item.id,
        label: item.label,
        required: item.required,
        role: item.role,
        installed: probe.installed,
        version: probe.version,
        installCommand: getInstallHint(item.id),
      };
    })
  );

  return {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    checkedAt: new Date().toISOString(),
    items: results,
  };
}
