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
const ALLOWED_SETTING_KEYS = new Set([
  'port',
  'theme',
  'tunnelMode',
  'autoStartTunnel',
  'namedTunnelToken',
  'namedTunnelName',
  'namedTunnelDomain',
]);

function assertSafeServerName(rawName) {
  const name = String(rawName || '').trim();
  if (!name) throw new Error('Server name is required.');
  if (FORBIDDEN_NAMES.has(name)) {
    throw new Error(`Invalid server name: "${name}".`);
  }
  return name;
}

/**
 * Normalize a single server definition from either standard Claude/Cursor mcpServers JSON
 * or the Switchboard UI form into our canonical persisted shape.
 * @param {Record<string, any>} [raw]
 */
export function normalizeServerEntry(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Server entry must be a JSON object.');
  }

  const hasUrl = typeof raw.url === 'string' && raw.url.trim().length > 0;
  const hasCommand = typeof raw.command === 'string' && raw.command.trim().length > 0;

  let transport = raw.transport || raw.type;
  if (!transport) {
    transport = hasUrl ? 'streamableHttp' : 'stdio';
  }
  transport = String(transport).toLowerCase();
  if (transport === 'http' || transport === 'streamable-http' || transport === 'streamablehttp') {
    transport = 'streamableHttp';
  } else if (transport === 'sse') {
    transport = 'sse';
  } else {
    transport = 'stdio';
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
      parsedUrl = new URL(raw.url.trim());
    } catch {
      throw new Error(`Invalid URL: "${raw.url}"`);
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error(`Unsupported URL protocol "${parsedUrl.protocol}". Use http:// or https://.`);
    }
  }

  const args = Array.isArray(raw.args)
    ? raw.args.map((a) => String(a))
    : typeof raw.args === 'string' && raw.args.trim()
      ? raw.args.trim().split(/\s+/)
      : [];

  const env = {};
  if (raw.env && typeof raw.env === 'object' && !Array.isArray(raw.env)) {
    for (const [k, v] of Object.entries(raw.env)) {
      if (k.trim()) env[k.trim()] = String(v ?? '');
    }
  }

  const headers = {};
  if (raw.headers && typeof raw.headers === 'object' && !Array.isArray(raw.headers)) {
    for (const [k, v] of Object.entries(raw.headers)) {
      if (k.trim()) headers[k.trim()] = String(v ?? '');
    }
  }

  const entry = {
    transport,
    enabled: Boolean(raw.enabled),
  };

  if (transport === 'stdio') {
    entry.command = raw.command.trim();
    entry.args = args;
    entry.env = env;
    if (raw.cwd) entry.cwd = String(raw.cwd);
  } else {
    entry.url = raw.url.trim();
    entry.headers = headers;
  }

  if (raw.preset) entry.preset = true;
  return entry;
}

/**
 * Parse and validate pasted JSON from the "+ Add MCP" modal.
 * Accepts:
 *  - { "mcpServers": { "name": { ... }, ... } }
 *  - { "name": { "command": "...", ... } }
 *  - { "name": { "url": "https://...", ... } }
 */
export function parsePastedMcpJson(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`JSON syntax error: ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON must be an object containing "mcpServers" or server entries.');
  }

  const map = parsed.mcpServers && typeof parsed.mcpServers === 'object' && !Array.isArray(parsed.mcpServers)
    ? parsed.mcpServers
    : parsed;

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
        return {
          version: 1,
          settings: { ...defaults.settings, ...(parsed.settings || {}) },
          mcpServers: parsed.mcpServers && typeof parsed.mcpServers === 'object' ? parsed.mcpServers : {},
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
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.filePath);
  }

  getConfig() {
    return this.config;
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
      } else if (key === 'autoStartTunnel') {
        cleanPatch.autoStartTunnel = Boolean(val);
      } else {
        cleanPatch[key] = String(val ?? '').trim();
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
