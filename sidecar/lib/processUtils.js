import { spawn, execFile, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export const IS_WIN = process.platform === 'win32';
export const IS_MAC = process.platform === 'darwin';

function expandWinEnv(value) {
  return String(value || '').replace(/%([^%]+)%/g, (orig, key) => process.env[key] || orig);
}

function findWindowsPythonDirs(localAppData, programFiles) {
  const dirs = [];
  const roots = [
    localAppData ? path.join(localAppData, 'Programs', 'Python') : null,
    programFiles,
  ].filter(Boolean);
  for (const root of roots) {
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory() && /^Python3\d+$/i.test(entry.name)) {
          dirs.push(path.join(root, entry.name));
        }
      }
    } catch {}
  }
  // Prefer newest Python 3.x version first
  return dirs.sort().reverse();
}

/**
 * On Windows, refresh and augment process.env.PATH with user local bin, Python,
 * Node.js, and cloudflared paths. This guarantees newly installed CLI tools are
 * detected immediately even if Windows Explorer hasn't reloaded its environment.
 */
let pathsAugmented = false;
export function ensureWindowsPaths() {
  if (!IS_WIN || pathsAugmented) return;
  pathsAugmented = true;

  try {
    const currentPath = process.env.PATH || '';
    const paths = currentPath.split(';').filter(Boolean);
    const pathSet = new Set(paths.map((p) => p.toLowerCase()));

    const home = process.env.USERPROFILE || process.env.HOME || '';
    const localAppData = process.env.LOCALAPPDATA || (home ? path.join(home, 'AppData', 'Local') : '');
    const appData = process.env.APPDATA || (home ? path.join(home, 'AppData', 'Roaming') : '');
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    const candidates = [
      path.dirname(process.execPath),
      path.join(programFiles, 'nodejs'),
      path.join(appData, 'npm'),
      home ? path.join(home, '.local', 'bin') : null,
      home ? path.join(home, '.cargo', 'bin') : null,
      localAppData ? path.join(localAppData, 'uv') : null,
      ...findWindowsPythonDirs(localAppData, programFiles),
      localAppData ? path.join(localAppData, 'Microsoft', 'WindowsApps') : null,
      path.join(programFilesX86, 'cloudflared'),
      path.join(programFiles, 'cloudflared'),
    ].filter(Boolean);

    // Read latest User + Machine PATH from Windows registry (catches newly installed tools without reboot)
    const regKeys = [
      'HKCU\\Environment',
      'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
    ];
    for (const regKey of regKeys) {
      try {
        const regOut = execSync(`reg query "${regKey}" /v Path`, { encoding: 'utf8', windowsHide: true });
        const match = regOut.match(/Path\s+REG_[^\s]+\s+(.+)/i);
        if (match?.[1]) {
          for (const rawEntry of match[1].trim().split(';')) {
            const expanded = expandWinEnv(rawEntry.trim());
            if (expanded && !pathSet.has(expanded.toLowerCase())) candidates.push(expanded);
          }
        }
      } catch {}
    }

    for (const candidate of candidates) {
      if (!pathSet.has(candidate.toLowerCase()) && fs.existsSync(candidate)) {
        paths.unshift(candidate);
        pathSet.add(candidate.toLowerCase());
      }
    }

    process.env.PATH = paths.join(';');
  } catch {}
}

ensureWindowsPaths();

/**
 * Windows wrapper commands that require .cmd/.exe resolution or shell execution
 * to prevent ENOENT when spawned directly from Node.js.
 */
const WIN_CMD_SHIMS = new Set(['npx', 'npm', 'pnpm', 'yarn', 'bunx', 'corepack']);
const WIN_EXE_SHIMS = new Set(['uvx', 'uv', 'python', 'python3', 'node', 'cloudflared']);

/**
 * Normalize command and spawn options for cross-platform reliability.
 * On Windows, maps `npx` -> `npx.cmd` (or invokes via cmd.exe /c when needed)
 * so child processes never throw ENOENT.
 */
export function resolveCommandForPlatform(command, args = []) {
  const trimmed = String(command || '').trim();
  if (!IS_WIN) {
    return { command: trimmed, args: [...args], useShell: false };
  }

  // If already an absolute or relative path to an executable/script
  if (trimmed.includes('\\') || trimmed.includes('/')) {
    const isCmd = /\.cmd$/i.test(trimmed) || /\.bat$/i.test(trimmed);
    const cmdStr = isCmd && trimmed.includes(' ') && !trimmed.startsWith('"') ? `"${trimmed}"` : trimmed;
    return {
      command: cmdStr,
      args: [...args],
      useShell: isCmd,
    };
  }

  const lower = trimmed.toLowerCase();
  if (WIN_CMD_SHIMS.has(lower)) {
    return {
      command: `${trimmed}.cmd`,
      args: [...args],
      useShell: true,
    };
  }
  if (WIN_EXE_SHIMS.has(lower)) {
    const mapped = lower === 'python3' ? 'python.exe' : `${trimmed}.exe`;
    return {
      command: mapped,
      args: [...args],
      useShell: false,
    };
  }
  // If the command has no extension and isn't an absolute path, allow shell lookup on Windows
  const hasExt = /\.[a-z0-9]+$/i.test(trimmed);
  return {
    command: trimmed,
    args: [...args],
    useShell: !hasExt,
  };
}

/**
 * Check whether a binary is available in PATH (or well-known locations) and return its resolved version string.
 */
export async function checkBinary(name, versionArgs = ['--version']) {
  // If checking node itself, we are already running inside Node!
  if (name === 'node') {
    return {
      installed: true,
      version: process.version,
      binary: process.execPath,
    };
  }

  ensureWindowsPaths();

  const candidates = [];

  if (IS_WIN) {
    const home = process.env.USERPROFILE || '';
    const localAppData = process.env.LOCALAPPDATA || (home ? path.join(home, 'AppData', 'Local') : '');
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    if (name === 'npx') {
      const nodeDir = path.dirname(process.execPath);
      const directNpxCmd = path.join(nodeDir, 'npx.cmd');
      if (fs.existsSync(directNpxCmd)) candidates.push(directNpxCmd);
      candidates.push('npx.cmd', 'npx');
    } else if (name === 'uvx' || name === 'uv') {
      const uvxLocal = path.join(home, '.local', 'bin', `${name}.exe`);
      if (fs.existsSync(uvxLocal)) candidates.push(uvxLocal);
      candidates.push(`${name}.exe`, name);
    } else if (name === 'python' || name === 'python3') {
      const pyCandidates = [
        ...findWindowsPythonDirs(localAppData, programFiles).map((d) => path.join(d, 'python.exe')),
        'python.exe',
        'py.exe',
        'python',
      ];
      for (const py of pyCandidates) {
        if (!py.includes('\\') || fs.existsSync(py)) candidates.push(py);
      }
    } else if (name === 'cloudflared') {
      const cfCandidates = [
        path.join(programFilesX86, 'cloudflared', 'cloudflared.exe'),
        path.join(programFiles, 'cloudflared', 'cloudflared.exe'),
        'cloudflared.exe',
        'cloudflared',
      ];
      for (const cf of cfCandidates) {
        if (!cf.includes('\\') || fs.existsSync(cf)) candidates.push(cf);
      }
    } else {
      candidates.push(name);
    }
  } else {
    candidates.push(name);
  }

  for (const bin of candidates) {
    const resolved = resolveCommandForPlatform(bin, versionArgs);
    try {
      const { stdout, stderr } = await execFileAsync(resolved.command, resolved.args, {
        shell: resolved.useShell,
        timeout: 4000,
        windowsHide: true,
      });
      const raw = (stdout || stderr || '').trim().split(/\r?\n/)[0] || 'installed';
      return { installed: true, version: raw.slice(0, 80), binary: bin };
    } catch (err) {
      if (err && err.code !== 'ENOENT') {
        const raw = ((err.stdout || '') + (err.stderr || '')).trim().split(/\r?\n/)[0];
        if (raw) {
          return { installed: true, version: raw.slice(0, 80), binary: bin };
        }
      }
      // If direct execution failed on Windows, retry through cmd shell once
      if (IS_WIN && !resolved.useShell) {
        try {
          const { stdout, stderr } = await execFileAsync(resolved.command, resolved.args, {
            shell: true,
            timeout: 4000,
            windowsHide: true,
          });
          const raw = (stdout || stderr || '').trim().split(/\r?\n/)[0] || 'installed';
          return { installed: true, version: raw.slice(0, 80), binary: bin };
        } catch {}
      }
    }
  }

  return { installed: false, version: null, binary: name };
}

/**
 * Return platform-specific install instructions for common missing binaries.
 */
export function getInstallHint(binary) {
  const lower = String(binary || '').toLowerCase().replace(/\.(cmd|exe)$/i, '');
  const hints = {
    cloudflared: IS_WIN
      ? 'winget install --id Cloudflare.cloudflared'
      : IS_MAC
        ? 'brew install cloudflared'
        : 'curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared',
    npx: IS_WIN
      ? 'winget install OpenJS.NodeJS.LTS'
      : IS_MAC
        ? 'brew install node'
        : 'sudo apt install nodejs npm',
    node: IS_WIN
      ? 'winget install OpenJS.NodeJS.LTS'
      : IS_MAC
        ? 'brew install node'
        : 'sudo apt install nodejs npm',
    uvx: IS_WIN
      ? 'winget install --id astral-sh.uv'
      : IS_MAC
        ? 'brew install uv'
        : 'curl -LsSf https://astral.sh/uv/install.sh | sh',
    python: IS_WIN
      ? 'winget install Python.Python.3.12'
      : IS_MAC
        ? 'brew install python'
        : 'sudo apt install python3',
    python3: IS_WIN
      ? 'winget install Python.Python.3.12'
      : IS_MAC
        ? 'brew install python'
        : 'sudo apt install python3',
  };
  return hints[lower] || `Ensure "${binary}" is installed and available on your system PATH.`;
}

/**
 * Gracefully terminate a process and its entire child tree.
 * Windows: uses `taskkill /PID <pid> /T /F`
 * Unix: sends SIGTERM to the process group (or PID), then escalates to SIGKILL after graceMs.
 */
export async function killProcessTree(pid, graceMs = 2000) {
  if (!pid || typeof pid !== 'number' || pid <= 0) return;

  if (IS_WIN) {
    try {
      await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        timeout: 4000,
        windowsHide: true,
      });
    } catch {
      // Process may already have exited
    }
    return;
  }

  // Unix: attempt process group signal first, fall back to direct PID
  const sendSignal = (sig) => {
    try {
      process.kill(-pid, sig);
      return true;
    } catch {
      try {
        process.kill(pid, sig);
        return true;
      } catch {
        return false;
      }
    }
  };

  const isAlive = () => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  if (!isAlive()) return;
  sendSignal('SIGTERM');

  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (!isAlive()) return;
    await new Promise((r) => setTimeout(r, 80));
  }

  if (isAlive()) {
    sendSignal('SIGKILL');
  }
}

/**
 * Spawn a child process in its own process group (on Unix) so the entire tree
 * can be cleanly terminated with zero orphan processes.
 */
export function spawnManaged(command, args = [], options = {}) {
  const resolved = resolveCommandForPlatform(command, args);
  return spawn(resolved.command, resolved.args, {
    ...options,
    shell: options.shell ?? resolved.useShell,
    detached: !IS_WIN,
    windowsHide: true,
  });
}
