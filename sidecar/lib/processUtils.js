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
 * Augment process.env.PATH with standard user-local, Homebrew, Python, Node.js,
 * and cloudflared locations across Windows, macOS, and Linux so GUI app launches
 * find newly installed or package-manager binaries immediately.
 */
let pathsAugmented = false;
export function ensurePlatformPaths() {
  if (pathsAugmented) return;
  pathsAugmented = true;

  try {
    const currentPath = process.env.PATH || '';
    const paths = currentPath.split(path.delimiter).filter(Boolean);
    const normalize = (p) => (IS_WIN ? p.toLowerCase() : p);
    const pathSet = new Set(paths.map(normalize));
    const candidates = [path.dirname(process.execPath)];

    if (IS_WIN) {
      const home = process.env.USERPROFILE || process.env.HOME || '';
      const localAppData = process.env.LOCALAPPDATA || (home ? path.join(home, 'AppData', 'Local') : '');
      const appData = process.env.APPDATA || (home ? path.join(home, 'AppData', 'Roaming') : '');
      const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
      const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

      candidates.push(
        ...[
          path.join(programFiles, 'nodejs'),
          path.join(appData, 'npm'),
          home ? path.join(home, '.local', 'bin') : null,
          home ? path.join(home, '.cargo', 'bin') : null,
          localAppData ? path.join(localAppData, 'uv') : null,
          ...findWindowsPythonDirs(localAppData, programFiles),
          localAppData ? path.join(localAppData, 'Microsoft', 'WindowsApps') : null,
          path.join(programFilesX86, 'cloudflared'),
          path.join(programFiles, 'cloudflared'),
        ].filter(Boolean)
      );

      // Read latest User + Machine PATH from Windows registry (catches newly installed tools without reboot)
      const regKeys = [
        'HKCU\\Environment',
        'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
      ];
      for (const regKey of regKeys) {
        try {
          const regOut = execSync(`reg query "${regKey}" /v Path`, {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 2000,
          });
          const match = regOut.match(/Path\s+REG_[^\s]+\s+(.+)/i);
          if (match?.[1]) {
            for (const rawEntry of match[1].trim().split(';')) {
              const expanded = expandWinEnv(rawEntry.trim());
              if (expanded && !pathSet.has(normalize(expanded))) candidates.push(expanded);
            }
          }
        } catch {}
      }
    } else {
      const home = process.env.HOME || '';
      candidates.push(
        ...[
          '/opt/homebrew/bin',
          '/opt/homebrew/sbin',
          '/usr/local/bin',
          home ? path.join(home, '.local', 'bin') : null,
          home ? path.join(home, '.cargo', 'bin') : null,
          home ? path.join(home, '.volta', 'bin') : null,
        ].filter(Boolean)
      );
    }

    // Keep user PATH priority intact; ensure our own Node dir is present, then append fallbacks.
    const nodeDir = candidates[0];
    if (nodeDir && !pathSet.has(normalize(nodeDir)) && fs.existsSync(nodeDir)) {
      paths.unshift(nodeDir);
      pathSet.add(normalize(nodeDir));
    }
    for (const candidate of candidates.slice(1)) {
      if (!pathSet.has(normalize(candidate)) && fs.existsSync(candidate)) {
        paths.push(candidate);
        pathSet.add(normalize(candidate));
      }
    }

    process.env.PATH = paths.join(path.delimiter);
  } catch {}
}

ensurePlatformPaths();

/**
 * Merge extra environment variables onto process.env without creating duplicate
 * case-divergent PATH/Path keys on Windows.
 */
export function mergePlatformEnv(extraEnv = {}) {
  const merged = { ...process.env };
  const keyMap = IS_WIN
    ? new Map(Object.keys(merged).map((k) => [k.toUpperCase(), k]))
    : null;

  if (IS_WIN && keyMap) {
    // Canonicalize inherited PATH key to 'PATH' so StdioClientTransport's getDefaultEnvironment() never creates a duplicate key.
    const existingPathKey = keyMap.get('PATH');
    if (existingPathKey && existingPathKey !== 'PATH') {
      merged.PATH = merged[existingPathKey];
      delete merged[existingPathKey];
      keyMap.set('PATH', 'PATH');
    }
  }

  for (const [rawKey, rawVal] of Object.entries(extraEnv || {})) {
    const rawTrimmed = String(rawKey || '').trim();
    if (!rawTrimmed) continue;
    const key = IS_WIN && rawTrimmed.toUpperCase() === 'PATH' ? 'PATH' : rawTrimmed;
    const val = String(rawVal ?? '');
    if (keyMap) {
      const existingKey = keyMap.get(key.toUpperCase());
      if (existingKey && existingKey !== key) {
        delete merged[existingKey];
      }
      keyMap.set(key.toUpperCase(), key);
    }
    merged[key] = val;
  }
  return merged;
}

/**
 * Strip matching outer quotes if a user pasted a quoted command path.
 */
export function stripOuterQuotes(value) {
  const trimmed = String(value || '').trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function quoteWinCmdArg(arg) {
  const s = String(arg ?? '');
  return !s || /[\s"&|<>^()%!]/.test(s)
    ? `"${s.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`
    : s;
}

function buildWinCmdExec(command, args = []) {
  const cmdLine = [quoteWinCmdArg(command), ...args.map(quoteWinCmdArg)].join(' ');
  return {
    command: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', `"${cmdLine}"`],
  };
}

/**
 * Windows wrapper commands that require .cmd/.exe resolution or shell execution
 * to prevent ENOENT when spawned directly from Node.js.
 */
const WIN_CMD_SHIMS = new Set(['npx', 'npm', 'pnpm', 'yarn', 'bunx', 'corepack']);
const WIN_EXE_SHIMS = new Set(['uvx', 'uv', 'python', 'python3', 'node', 'cloudflared']);

/**
 * Normalize command and spawn options for cross-platform reliability.
 * Never wraps `command` in literal quotes so cross-spawn / StdioClientTransport
 * handles paths with spaces and `.cmd` shims without double-quoting bugs.
 */
export function resolveCommandForPlatform(command, args = []) {
  const cleaned = stripOuterQuotes(command);
  if (!IS_WIN) {
    return { command: cleaned, args: [...args], useShell: false };
  }

  // If already an explicit path or already carries an extension
  if (cleaned.includes('\\') || cleaned.includes('/') || /\.[a-z0-9]+$/i.test(cleaned)) {
    const isCmd = /\.(cmd|bat)$/i.test(cleaned);
    const hasExt = /\.[a-z0-9]+$/i.test(cleaned);
    return {
      command: cleaned,
      args: [...args],
      useShell: isCmd || !hasExt,
    };
  }

  const lower = cleaned.toLowerCase();
  if (WIN_CMD_SHIMS.has(lower)) {
    return {
      command: `${cleaned}.cmd`,
      args: [...args],
      useShell: true,
    };
  }
  if (WIN_EXE_SHIMS.has(lower)) {
    const mapped = lower === 'python3' ? 'python.exe' : `${cleaned}.exe`;
    return {
      command: mapped,
      args: [...args],
      useShell: false,
    };
  }
  return {
    command: cleaned,
    args: [...args],
    useShell: true,
  };
}

const NOT_FOUND_OUTPUT_RE =
  /not recognized as an internal or external command|was not found|cannot find the path|command not found|no such file/i;

function isExecutableFile(filePath) {
  try {
    if (!fs.statSync(filePath).isFile()) return false;
    if (!IS_WIN) fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function getWinPathExts() {
  const raw = process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD';
  return raw.split(';').map((e) => e.trim()).filter(Boolean);
}

/**
 * Resolve an explicit path or bare command name against PATH/PATHEXT without spawning a shell.
 */
export function findExecutableInPath(rawCommand, cwd = null) {
  const cleaned = stripOuterQuotes(rawCommand);
  if (!cleaned) return null;

  const isExplicitPath = cleaned.includes('\\') || cleaned.includes('/') || cleaned.startsWith('.');
  if (isExplicitPath) {
    const abs = cwd ? path.resolve(cwd, cleaned) : path.resolve(cleaned);
    if (isExecutableFile(abs)) return abs;
    if (IS_WIN && !/\.[a-z0-9]+$/i.test(abs)) {
      for (const ext of getWinPathExts()) {
        if (isExecutableFile(`${abs}${ext}`)) return `${abs}${ext}`;
      }
    }
    return null;
  }

  ensurePlatformPaths();
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  const pathDirs = String(process.env[pathKey] || '').split(path.delimiter).filter(Boolean);
  const exts = IS_WIN && !/\.[a-z0-9]+$/i.test(cleaned) ? ['', ...getWinPathExts()] : [''];

  for (const dir of pathDirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, `${cleaned}${ext}`);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}

function getBinaryCandidates(cleanName) {
  if (!IS_WIN) return [cleanName];

  const home = process.env.USERPROFILE || '';
  const localAppData = process.env.LOCALAPPDATA || (home ? path.join(home, 'AppData', 'Local') : '');
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  if (cleanName === 'npx') {
    const directNpxCmd = path.join(path.dirname(process.execPath), 'npx.cmd');
    return [directNpxCmd, 'npx.cmd', 'npx'];
  }
  if (cleanName === 'uvx' || cleanName === 'uv') {
    const uvxLocal = home ? path.join(home, '.local', 'bin', `${cleanName}.exe`) : '';
    return [uvxLocal, `${cleanName}.exe`, `${cleanName}.cmd`, cleanName].filter(Boolean);
  }
  if (cleanName === 'python' || cleanName === 'python3') {
    return [
      ...(cleanName === 'python3' ? ['python3.exe'] : []),
      ...findWindowsPythonDirs(localAppData, programFiles).map((d) => path.join(d, 'python.exe')),
      'python.exe',
      'py.exe',
      'python',
    ];
  }
  if (cleanName === 'cloudflared') {
    return [
      path.join(programFilesX86, 'cloudflared', 'cloudflared.exe'),
      path.join(programFiles, 'cloudflared', 'cloudflared.exe'),
      'cloudflared.exe',
      'cloudflared',
    ];
  }
  return [cleanName];
}

function isWindowsAppAliasStub(filePath) {
  return IS_WIN && filePath.toLowerCase().includes('\\microsoft\\windowsapps\\');
}

/**
 * Resolve a bare command or known binary quickly without blocking on `--version` probes
 * (still probes WindowsApps Store aliases so broken stubs are skipped cleanly).
 */
export async function resolveBinaryPath(name) {
  const cleanName = stripOuterQuotes(name);
  if (!cleanName) return null;
  if (cleanName === 'node') return process.execPath;

  for (const candidate of getBinaryCandidates(cleanName)) {
    const resolved = findExecutableInPath(candidate);
    if (!resolved) continue;
    if (isWindowsAppAliasStub(resolved)) {
      const check = await checkBinary(resolved, ['--version']);
      if (!check.installed) continue;
    }
    return resolved;
  }
  return null;
}

/**
 * Check whether a binary is available in PATH (or well-known locations) and return its resolved version string.
 */
export async function checkBinary(name, versionArgs = ['--version']) {
  const cleanName = stripOuterQuotes(name);
  if (!cleanName) {
    return { installed: false, version: null, binary: cleanName };
  }
  // If checking node itself, we are already running inside Node!
  if (cleanName === 'node') {
    return {
      installed: true,
      version: process.version,
      binary: process.execPath,
    };
  }

  ensurePlatformPaths();

  const seenPaths = new Set();
  for (const bin of getBinaryCandidates(cleanName)) {
    const executable = findExecutableInPath(bin);
    if (!executable) continue;
    const dedupeKey = IS_WIN ? executable.toLowerCase() : executable;
    if (seenPaths.has(dedupeKey)) continue;
    seenPaths.add(dedupeKey);

    const resolved = resolveCommandForPlatform(executable, versionArgs);
    const execTarget = IS_WIN && resolved.useShell
      ? buildWinCmdExec(resolved.command, resolved.args)
      : { command: resolved.command, args: resolved.args };
    try {
      const { stdout, stderr } = await execFileAsync(execTarget.command, execTarget.args, {
        windowsVerbatimArguments: IS_WIN && resolved.useShell,
        timeout: 4000,
        windowsHide: true,
      });
      const combined = (stdout || stderr || '').trim();
      if (NOT_FOUND_OUTPUT_RE.test(combined)) continue;
      const raw = combined.split(/\r?\n/)[0] || 'installed';
      return { installed: true, version: raw.slice(0, 80), binary: executable };
    } catch (err) {
      const errAny = /** @type {any} */ (err);
      if (errAny?.code === 'ENOENT' || errAny?.code === 9009) continue;
      const combined = `${errAny?.stdout || ''}\n${errAny?.stderr || ''}`.trim();
      if (NOT_FOUND_OUTPUT_RE.test(combined)) continue;
      const raw = combined.split(/\r?\n/).find((l) => l.trim())?.trim();
      return {
        installed: true,
        version: raw ? raw.slice(0, 80) : 'installed',
        binary: executable,
      };
    }
  }

  return { installed: false, version: null, binary: cleanName };
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
  const useCmdExec = IS_WIN && (options.shell ?? resolved.useShell);
  const target = useCmdExec
    ? buildWinCmdExec(resolved.command, resolved.args)
    : { command: resolved.command, args: resolved.args };
  const { shell: _ignoredShell, ...restOptions } = options;
  return spawn(target.command, target.args, {
    ...restOptions,
    shell: false,
    windowsVerbatimArguments: useCmdExec ? true : options.windowsVerbatimArguments,
    detached: !IS_WIN,
    windowsHide: true,
  });
}
