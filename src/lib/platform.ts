export type PlatformId = 'win32' | 'darwin' | 'linux';

/**
 * Detect current desktop/browser OS cleanly across Tauri, Node diagnostics, and Web.
 */
export function detectPlatform(explicit?: string | null): PlatformId {
  if (explicit === 'win32' || explicit === 'darwin' || explicit === 'linux') {
    return explicit;
  }
  if (typeof navigator !== 'undefined') {
    const ua = `${navigator.userAgent || ''} ${navigator.platform || ''}`.toLowerCase();
    if (ua.includes('mac') || ua.includes('darwin')) return 'darwin';
    if (ua.includes('win')) return 'win32';
    if (ua.includes('linux') || ua.includes('x11')) return 'linux';
  }
  return 'win32';
}

export function isMacPlatform(explicit?: string | null): boolean {
  return detectPlatform(explicit) === 'darwin';
}

export function getPlatformLabel(platform: PlatformId): string {
  if (platform === 'darwin') return 'macOS';
  if (platform === 'linux') return 'Linux';
  return 'Windows';
}

export function getModifierKey(explicit?: string | null): '⌘' | 'Ctrl' {
  return isMacPlatform(explicit) ? '⌘' : 'Ctrl';
}

export type InstallableTool = 'node' | 'uv' | 'cloudflared' | 'python';

const INSTALL_COMMANDS: Record<InstallableTool, Record<PlatformId, string>> = {
  node: {
    win32: 'winget install OpenJS.NodeJS.LTS',
    darwin: 'brew install node',
    linux: 'sudo apt install nodejs npm',
  },
  uv: {
    win32: 'winget install --id astral-sh.uv',
    darwin: 'brew install uv',
    linux: 'curl -LsSf https://astral.sh/uv/install.sh | sh',
  },
  cloudflared: {
    win32: 'winget install --id Cloudflare.cloudflared',
    darwin: 'brew install cloudflared',
    linux: 'curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared',
  },
  python: {
    win32: 'winget install Python.Python.3.12',
    darwin: 'brew install python',
    linux: 'sudo apt install python3',
  },
};

export function getInstallCommand(tool: InstallableTool, platform: PlatformId): string {
  return INSTALL_COMMANDS[tool][platform];
}

export function getPlatformConfigPathsHint(platform: PlatformId): string {
  if (platform === 'darwin') {
    return '~/Library/Application Support/Claude · ~/.cursor/mcp.json · ~/.config/zed/settings.json';
  }
  if (platform === 'linux') {
    return '~/.config/Claude · ~/.cursor/mcp.json · ~/.config/zed/settings.json';
  }
  return '%APPDATA%\\Claude · %USERPROFILE%\\.cursor\\mcp.json · %APPDATA%\\Zed\\settings.json';
}
