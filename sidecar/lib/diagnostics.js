import { checkBinary, getInstallHint } from './processUtils.js';

const PREREQUISITES = [
  { id: 'node', label: 'Node.js', args: ['-v'], role: 'Runs the MCP Switchboard sidecar & JS servers' },
  { id: 'npx', label: 'npx', args: ['--version'], role: 'Launches npm-hosted STDIO MCP servers' },
  { id: 'uvx', label: 'uvx (uv)', args: ['--version'], role: 'Launches Python-hosted STDIO MCP servers' },
  { id: 'python', label: 'Python', args: ['--version'], role: 'Runs local Python MCP scripts' },
  { id: 'cloudflared', label: 'cloudflared', args: ['--version'], role: 'Creates automatic HTTPS tunnels for remote web & desktop clients (Gemini, ChatGPT, Claude)' },
];

export async function runDiagnostics() {
  const results = await Promise.all(
    PREREQUISITES.map(async (item) => {
      const probe = await checkBinary(item.id, item.args);
      return {
        id: item.id,
        label: item.label,
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
