import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Resolve OS-standard app data directory for persisting mcp-switchboard.json.
 * Respects MCP_SWITCHBOARD_DATA_DIR override (passed by Tauri or tests).
 */
export function resolveDataDir() {
  if (process.env.MCP_SWITCHBOARD_DATA_DIR) {
    return process.env.MCP_SWITCHBOARD_DATA_DIR;
  }
  const appName = 'mcp-switchboard';
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), appName);
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName);
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), appName);
}

/**
 * Starter presets (disabled by default) so users can see the exact schema
 * and try toggling a server immediately without hardcoding runtime behavior.
 */
export function createDefaultConfig() {
  return {
    version: 1,
    settings: {
      port: 8000,
      theme: 'dark',
      tunnelMode: 'quick', // 'quick' | 'named'
      autoStartTunnel: false,
      namedTunnelToken: '',
      namedTunnelName: '',
      namedTunnelDomain: '',
      mcpAuthToken: '',
      closeToTray: true,
      onboardingCompleted: false,
      startAtOnboarding: false,
    },
    mcpServers: {
      filesystem: {
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', os.homedir()],
        env: {},
        enabled: false,
        preset: true,
      },
      fetch: {
        transport: 'stdio',
        command: 'uvx',
        args: ['mcp-server-fetch'],
        env: {},
        enabled: false,
        preset: true,
      },
    },
  };
}

const FORBIDDEN_NAMES = new Set(['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty']);
const CONTROL_CHAR_RE = /[\r\n\0]/;
const ALLOWED_SETTING_KEYS = new Set([
  'port',
  'theme',
  'tunnelMode',
  'autoStartTunnel',
  'namedTunnelToken',
  'namedTunnelName',
  'namedTunnelDomain',
  'mcpAuthToken',
  'closeToTray',
  'onboardingCompleted',
  'startAtOnboarding',
]);

function assertNoControlChars(value, label) {
  if (CONTROL_CHAR_RE.test(value)) {
    throw new Error(`${label} contains invalid newline or null characters.`);
  }
}

function assertSafeServerName(rawName) {
  const name = String(rawName || '').trim();
  if (!name) throw new Error('Server name is required.');
  if (name.length > 128) throw new Error('Server name must be 128 characters or fewer.');
  assertNoControlChars(name, 'Server name');
  if (FORBIDDEN_NAMES.has(name)) {
    throw new Error(`Invalid server name: "${name}".`);
  }
  return name;
}

/**
 * Extract command, args, and env from STDIO formats used across Claude/Cursor,
 * Zed (`{ command: { path, args, env } }`), and OpenCode (`{ command: ["npx", ...] }`).
 * @param {Record<string, any>} raw
 */
function extractCommandSpec(raw) {
  let commandStr = '';
  let extraArgs = [];
  const nestedEnv = Object.create(null);

  if (typeof raw.command === 'string') {
    commandStr = raw.command.trim();
  } else if (Array.isArray(raw.command) && raw.command.length > 0) {
    commandStr = String(raw.command[0] ?? '').trim();
    extraArgs = raw.command.slice(1).map((a) => String(a));
  } else if (raw.command && typeof raw.command === 'object') {
    commandStr = String(raw.command.path || raw.command.command || '').trim();
    if (Array.isArray(raw.command.args)) {
      extraArgs = raw.command.args.map((a) => String(a));
    }
    if (raw.command.env && typeof raw.command.env === 'object' && !Array.isArray(raw.command.env)) {
      Object.assign(nestedEnv, raw.command.env);
    }
  }

  return { commandStr, extraArgs, nestedEnv };
}

/**
 * Normalize a single server definition from Claude, Cursor, VS Code, Windsurf,
 * Antigravity, Gemini CLI, Zed, or OpenCode JSON into our canonical persisted shape.
 * @param {Record<string, any>} [raw]
 */
export function normalizeServerEntry(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Server entry must be a JSON object.');
  }

  const rawUrl = raw.url ?? raw.httpUrl ?? raw.serverUrl;
  const hasUrl = typeof rawUrl === 'string' && rawUrl.trim().length > 0;
  const { commandStr, extraArgs, nestedEnv } = extractCommandSpec(raw);
  const hasCommand = commandStr.length > 0;

  let transport = raw.transport || raw.type;
  if (!transport) {
    transport = hasUrl ? 'streamableHttp' : 'stdio';
  }
  transport = String(transport).toLowerCase();
  if (transport === 'http' || transport === 'streamable-http' || transport === 'streamablehttp' || transport === 'remote') {
    transport = 'streamableHttp';
  } else if (transport === 'sse') {
    transport = 'sse';
  } else if (transport === 'stdio' || transport === 'local') {
    transport = 'stdio';
  } else {
    transport = hasUrl ? 'streamableHttp' : 'stdio';
  }

  if (transport === 'stdio' && !hasCommand) {
    throw new Error('STDIO server requires a non-empty "command" string.');
  }
  if ((transport === 'streamableHttp' || transport === 'sse') && !hasUrl) {
    throw new Error('Remote HTTP/SSE server requires a non-empty "url" string.');
  }

  if (hasUrl) {
    let parsedUrl;
    try {
      parsedUrl = new URL(rawUrl.trim());
    } catch {
      throw new Error(`Invalid URL: "${rawUrl}"`);
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error(`Unsupported URL protocol "${parsedUrl.protocol}". Use http:// or https://.`);
    }
  }

  const rawArgs = Array.isArray(raw.args)
    ? raw.args.map((a) => String(a))
    : typeof raw.args === 'string' && raw.args.trim()
      ? raw.args.trim().split(/\s+/)
      : [];
  const args = [...extraArgs, ...rawArgs];

  if (transport === 'stdio') {
    assertNoControlChars(commandStr, 'Command');
    for (const arg of args) assertNoControlChars(arg, 'Command argument');
    if (raw.cwd) assertNoControlChars(String(raw.cwd), 'Working directory');
  }

  const env = {};
  const mergedEnv = Object.assign(
    Object.create(null),
    nestedEnv,
    raw.environment && typeof raw.environment === 'object' && !Array.isArray(raw.environment) ? raw.environment : null,
    raw.env && typeof raw.env === 'object' && !Array.isArray(raw.env) ? raw.env : null
  );
  for (const [k, v] of Object.entries(mergedEnv)) {
    const cleanKey = k.trim();
    if (cleanKey && !FORBIDDEN_NAMES.has(cleanKey)) {
      if (cleanKey.includes('=') || CONTROL_CHAR_RE.test(cleanKey)) {
        throw new Error(`Invalid environment variable name: "${cleanKey}".`);
      }
      const cleanVal = String(v ?? '');
      if (cleanVal.includes('\0')) {
        throw new Error(`Environment variable "${cleanKey}" contains a null byte.`);
      }
      env[cleanKey] = cleanVal;
    }
  }

  const headers = {};
  if (raw.headers && typeof raw.headers === 'object' && !Array.isArray(raw.headers)) {
    for (const [k, v] of Object.entries(raw.headers)) {
      const cleanKey = k.trim();
      if (cleanKey && !FORBIDDEN_NAMES.has(cleanKey)) {
        assertNoControlChars(cleanKey, 'Header name');
        const cleanVal = String(v ?? '');
        assertNoControlChars(cleanVal, `Header "${cleanKey}" value`);
        headers[cleanKey] = cleanVal;
      }
    }
  }

  const entry = {
    transport,
    enabled: Boolean(raw.enabled),
  };

  if (transport === 'stdio') {
    entry.command = commandStr;
    entry.args = args;
    entry.env = env;
    if (raw.cwd) entry.cwd = String(raw.cwd);
  } else {
    entry.url = rawUrl.trim();
    entry.headers = headers;
  }

  if (raw.preset) entry.preset = true;
  return entry;
}

/**
 * Extract the server definition map from any popular IDE/agent config format:
 * `mcpServers` (Claude/Cursor/Windsurf/Gemini CLI), `servers` (VS Code),
 * `context_servers` (Zed), `mcp` (OpenCode), or a direct map.
 * @param {Record<string, any>} parsed
 */
export function extractServerMap(parsed) {
  for (const key of ['mcpServers', 'servers', 'context_servers', 'mcp']) {
    if (parsed[key] && typeof parsed[key] === 'object' && !Array.isArray(parsed[key])) {
      return parsed[key];
    }
  }
  return parsed;
}

/**
 * Parse and validate pasted JSON from the "+ Add MCP" modal.
 */
export function parsePastedMcpJson(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`JSON syntax error: ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON must be an object containing "mcpServers", "servers", or server entries.');
  }

  const map = extractServerMap(parsed);

  const entries = Object.entries(map);
  if (entries.length === 0) {
    throw new Error('No MCP servers found in the pasted JSON.');
  }

  const result = {};
  for (const [rawName, rawDef] of entries) {
    const name = assertSafeServerName(rawName);
    result[name] = normalizeServerEntry({ ...rawDef, enabled: false });
  }
  return result;
}

export class ConfigStore {
  constructor(customPath = null) {
    this.dataDir = customPath ? path.dirname(customPath) : resolveDataDir();
    this.filePath = customPath || path.join(this.dataDir, 'mcp-switchboard.json');
    this.config = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        const defaults = createDefaultConfig();
        const safeServers = {};
        if (parsed.mcpServers && typeof parsed.mcpServers === 'object' && !Array.isArray(parsed.mcpServers)) {
          for (const [key, val] of Object.entries(parsed.mcpServers)) {
            if (!FORBIDDEN_NAMES.has(key) && val && typeof val === 'object') {
              safeServers[key] = val;
            }
          }
        }
        const loadedSettings =
          parsed.settings && typeof parsed.settings === 'object' && !Array.isArray(parsed.settings)
            ? parsed.settings
            : {};
        return {
          version: 1,
          settings: { ...defaults.settings, ...loadedSettings },
          mcpServers: safeServers,
        };
      }
    } catch (err) {
      console.error(`[ConfigStore] Failed to load ${this.filePath}, resetting to defaults:`, err.message);
    }
    const fresh = createDefaultConfig();
    this._save(fresh);
    return fresh;
  }

  _save(data = this.config) {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    /** @type {import('node:fs').WriteFileOptions} */
    const fileOpts = process.platform === 'win32'
      ? { encoding: 'utf8' }
      : { encoding: 'utf8', mode: 0o600 };
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), fileOpts);
    try {
      fs.renameSync(tmpPath, this.filePath);
    } catch {
      // Fallback for transient Windows file-indexer / AV locks on renameSync
      fs.copyFileSync(tmpPath, this.filePath);
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  }

  getSettings() {
    return this.config.settings;
  }

  updateSettings(patch = {}) {
    const cleanPatch = {};
    for (const [key, val] of Object.entries(patch || {})) {
      if (!ALLOWED_SETTING_KEYS.has(key)) continue;
      if (key === 'port') {
        const parsedPort = Number(val);
        if (Number.isInteger(parsedPort) && parsedPort >= 8000 && parsedPort <= 8010) {
          cleanPatch.port = parsedPort;
        }
      } else if (key === 'theme') {
        cleanPatch.theme = val === 'light' ? 'light' : 'dark';
      } else if (key === 'tunnelMode') {
        cleanPatch.tunnelMode = val === 'named' ? 'named' : 'quick';
      } else if (
        key === 'autoStartTunnel' ||
        key === 'closeToTray' ||
        key === 'onboardingCompleted' ||
        key === 'startAtOnboarding'
      ) {
        cleanPatch[key] = Boolean(val);
      } else {
        const strVal = String(val ?? '').trim();
        assertNoControlChars(strVal, `Setting "${key}"`);
        cleanPatch[key] = strVal;
      }
    }
    this.config.settings = {
      ...this.config.settings,
      ...cleanPatch,
    };
    this._save();
    return this.config.settings;
  }

  getServers() {
    return this.config.mcpServers;
  }

  getServer(name) {
    return Object.hasOwn(this.config.mcpServers, name) ? this.config.mcpServers[name] : null;
  }

  upsertServer(name, entry) {
    const cleanName = assertSafeServerName(name);
    const normalized = normalizeServerEntry(entry);
    this.config.mcpServers[cleanName] = normalized;
    this._save();
    return { name: cleanName, config: normalized };
  }

  importServers(serversMap) {
    const imported = [];
    for (const [rawName, entry] of Object.entries(serversMap)) {
      const name = assertSafeServerName(rawName);
      const normalized = normalizeServerEntry(entry);
      this.config.mcpServers[name] = normalized;
      imported.push(name);
    }
    this._save();
    return imported;
  }

  deleteServer(name) {
    if (!Object.hasOwn(this.config.mcpServers, name)) return false;
    delete this.config.mcpServers[name];
    this._save();
    return true;
  }

  setServerEnabled(name, enabled) {
    if (!Object.hasOwn(this.config.mcpServers, name)) return null;
    this.config.mcpServers[name].enabled = Boolean(enabled);
    this._save();
    return this.config.mcpServers[name];
  }
}
