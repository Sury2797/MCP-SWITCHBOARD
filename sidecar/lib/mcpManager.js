import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  PromptListChangedNotificationSchema,
  ResourceListChangedNotificationSchema,
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  findExecutableInPath,
  getInstallHint,
  killProcessTree,
  mergePlatformEnv,
  resolveBinaryPath,
  resolveCommandForPlatform,
  stripOuterQuotes,
} from './processUtils.js';

const STARTUP_TIMEOUT_MS = 60000;
const MAX_LOG_LINES = 200;
const ERROR_SNIPPET_LINES = 50;
const MAX_SYMBOL_LENGTH = 64;
const MAX_LIST_PAGES = 20;
const ERROR_LINE_RE = /error|err!|enoent|eacces|not recognized|not found|cannot find|failed|exception|invalid|usage:|missing|denied|traceback/i;

/**
 * Sanitize server name for safe tool/prompt namespacing: `<serverName>__<symbolName>`.
 */
export function sanitizePrefix(serverName) {
  return String(serverName)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'server';
}

/**
 * Build a universally compatible MCP tool/prompt identifier (`^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$`)
 * accepted by Gemini, OpenAI/Codex, Anthropic/Claude, Cursor, VS Code, Windsurf, and Zed.
 *
 * @param {string} serverName
 * @param {string} originalName
 * @param {Set<string>} [usedNames]
 */
export function buildSafeSymbolName(serverName, originalName, usedNames = new Set()) {
  const prefix = sanitizePrefix(serverName);
  const cleanOriginal = String(originalName || 'item')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'item';

  let candidate = `${prefix}__${cleanOriginal}`;
  if (!/^[a-zA-Z_]/.test(candidate)) {
    candidate = `s_${candidate}`;
  }

  if (candidate.length <= MAX_SYMBOL_LENGTH && !usedNames.has(candidate)) {
    usedNames.add(candidate);
    return candidate;
  }

  const hash = createHash('sha1').update(`${serverName}\0${originalName}`).digest('hex').slice(0, 5);
  let attempt = 0;
  while (true) {
    const suffix = attempt === 0 ? `_${hash}` : `_${hash}_${attempt}`;
    const maxHead = Math.max(1, MAX_SYMBOL_LENGTH - suffix.length);
    const bounded = `${candidate.slice(0, maxHead)}${suffix}`;
    if (!usedNames.has(bounded)) {
      usedNames.add(bounded);
      return bounded;
    }
    attempt += 1;
  }
}

function normalizeToolSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { type: 'object', properties: {} };
  }
  return {
    properties: {},
    ...schema,
    type: typeof schema.type === 'string' && schema.type ? schema.type : 'object',
  };
}

async function fetchAllPages(fetchPage, listKey) {
  const items = [];
  let cursor = undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const res = await fetchPage(cursor ? { cursor } : undefined);
    if (Array.isArray(res?.[listKey])) {
      items.push(...res[listKey]);
    }
    if (!res?.nextCursor || res.nextCursor === cursor) break;
    cursor = res.nextCursor;
  }
  return items;
}

/**
 * Estimate input token overhead for a list of MCP tool definitions.
 */
export function estimateToolTokens(tools = []) {
  if (!Array.isArray(tools) || tools.length === 0) return 0;
  return Math.ceil(JSON.stringify(tools).length / 4);
}

/**
 * Create a rolling in-memory runtime record for a single server.
 */
function createRuntimeRecord(name) {
  return {
    name,
    prefix: sanitizePrefix(name),
    status: 'off', // 'off' | 'starting' | 'connected' | 'error'
    pid: null,
    client: null,
    transport: null,
    tools: [], // Namespaced tools ready for aggregated tools/list
    rawToolMap: new Map(), // namespacedName -> originalToolName
    prompts: [], // Namespaced prompts ready for aggregated prompts/list
    rawPromptMap: new Map(), // namespacedName -> originalPromptName
    resources: [], // Upstream resources
    rawResourceSet: new Set(), // exact URIs owned by this server
    resourceTemplates: [], // Upstream resource templates
    supportsResources: false,
    tokenEstimate: 0,
    error: null,
    installHint: null,
    lastErrorLogs: [],
    logs: [],
    connectedAt: null,
    stopping: false,
    runLogStart: 0,
    pendingStop: null,
  };
}

export class McpManager extends EventEmitter {
  constructor(configStore) {
    super();
    this.configStore = configStore;
    this.runtimes = new Map(); // serverName -> runtime record
    this._syncRuntimesWithConfig();
  }

  _syncRuntimesWithConfig() {
    const servers = this.configStore.getServers();
    for (const name of Object.keys(servers)) {
      if (!this.runtimes.has(name)) {
        this.runtimes.set(name, createRuntimeRecord(name));
      }
    }
    for (const name of this.runtimes.keys()) {
      if (!Object.hasOwn(servers, name)) {
        this.runtimes.delete(name);
      }
    }
  }

  _ensureRuntime(name) {
    if (!this.runtimes.has(name)) {
      this.runtimes.set(name, createRuntimeRecord(name));
    }
    return this.runtimes.get(name);
  }

  _appendLog(name, stream, text) {
    const rt = this._ensureRuntime(name);
    const lines = String(text || '').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (!line) continue;
      const entry = { ts: new Date().toISOString(), stream, line };
      rt.logs.push(entry);
      if (rt.logs.length > MAX_LOG_LINES) {
        const dropped = rt.logs.length - MAX_LOG_LINES;
        rt.logs.splice(0, dropped);
        rt.runLogStart = Math.max(0, rt.runLogStart - dropped);
      }
      this.emit('log', { server: name, entry });
    }
  }

  _captureErrorTail(rt) {
    const stderrLines = rt.logs
      .filter((l) => l.stream === 'stderr' || l.stream === 'error')
      .slice(-ERROR_SNIPPET_LINES);
    rt.lastErrorLogs = stderrLines.length > 0
      ? stderrLines
      : rt.logs.slice(-ERROR_SNIPPET_LINES);
  }

  _summarizeStderr(rt) {
    const recent = rt.logs
      .slice(rt.runLogStart)
      .filter(
        (l) =>
          l.stream === 'stderr' &&
          !/^MCP server (?:process )?exited|^Startup failed:|^Transport error:/i.test(l.line)
      )
      .map((l) => l.line.trim())
      .filter(Boolean);
    if (recent.length === 0) return '';
    const errMatches = recent.filter((line) => ERROR_LINE_RE.test(line));
    const picked = (errMatches.length > 0 ? errMatches : recent).slice(-2).join(' | ');
    return picked.length > 240 ? `${picked.slice(0, 237)}...` : picked;
  }

  _formatFailureMessage(rawErrMsg, rt) {
    const summary = this._summarizeStderr(rt);
    if (/MCP error -32000|Connection closed/i.test(rawErrMsg)) {
      return summary
        ? `Process closed during startup: ${summary}`
        : 'MCP server exited before completing startup handshake (no stderr output). Verify command, arguments, or open Logs.';
    }
    if (/Startup timed out/i.test(rawErrMsg) && summary) {
      return `${rawErrMsg} (${summary})`;
    }
    return rawErrMsg;
  }

  _emitState() {
    this.emit('state', this.getSummary());
  }

  _clearRuntimeCapabilities(rt) {
    const hadPrompts = rt.prompts.length > 0;
    const hadResources = rt.resources.length > 0 || rt.resourceTemplates.length > 0;
    rt.tools = [];
    rt.rawToolMap.clear();
    rt.prompts = [];
    rt.rawPromptMap.clear();
    rt.resources = [];
    rt.resourceTemplates = [];
    rt.rawResourceSet.clear();
    rt.supportsResources = false;
    rt.tokenEstimate = 0;
    return { hadPrompts, hadResources };
  }

  _emitToolsChanged() {
    this.emit('toolsChanged', this.getAggregatedTools());
    this._emitState();
  }

  _emitPromptsChanged() {
    this.emit('promptsChanged', this.getAggregatedPrompts());
    this._emitState();
  }

  _emitResourcesChanged() {
    this.emit('resourcesChanged', this.getAggregatedResources());
    this._emitState();
  }

  _collectUsedToolNames(excludeServerName) {
    const used = new Set();
    for (const [otherName, otherRt] of this.runtimes.entries()) {
      if (otherName === excludeServerName || otherRt.status !== 'connected') continue;
      for (const t of otherRt.tools) used.add(t.name);
    }
    return used;
  }

  _collectUsedPromptNames(excludeServerName) {
    const used = new Set();
    for (const [otherName, otherRt] of this.runtimes.entries()) {
      if (otherName === excludeServerName || otherRt.status !== 'connected') continue;
      for (const p of otherRt.prompts) used.add(p.name);
    }
    return used;
  }

  async _syncServerTools(name, client, rt) {
    const caps = client.getServerCapabilities?.() || {};
    let rawTools = [];
    if (caps.tools || (!caps.prompts && !caps.resources)) {
      try {
        rawTools = await fetchAllPages((p) => client.listTools(p), 'tools');
      } catch (err) {
        if (caps.tools) throw err;
      }
    }

    const usedNames = this._collectUsedToolNames(name);
    rt.rawToolMap.clear();
    const namespacedTools = rawTools.map((tool) => {
      const namespacedName = buildSafeSymbolName(name, tool.name, usedNames);
      rt.rawToolMap.set(namespacedName, tool.name);
      return {
        ...tool,
        name: namespacedName,
        description: tool.description
          ? `[${name}] ${tool.description}`
          : `[${name}] Tool ${tool.name}`,
        inputSchema: normalizeToolSchema(tool.inputSchema),
        _switchboard: {
          server: name,
          originalName: tool.name,
        },
      };
    });

    rt.tools = namespacedTools;
    rt.tokenEstimate = estimateToolTokens(
      namespacedTools.map(({ _switchboard, ...clean }) => clean)
    );
  }

  async _syncServerPrompts(name, client, rt) {
    const caps = client.getServerCapabilities?.() || {};
    if (!caps.prompts) {
      rt.prompts = [];
      rt.rawPromptMap.clear();
      return;
    }
    let rawPrompts = [];
    try {
      rawPrompts = await fetchAllPages((p) => client.listPrompts(p), 'prompts');
    } catch {
      rt.prompts = [];
      rt.rawPromptMap.clear();
      return;
    }

    const usedNames = this._collectUsedPromptNames(name);
    rt.rawPromptMap.clear();
    rt.prompts = rawPrompts.map((prompt) => {
      const namespacedName = buildSafeSymbolName(name, prompt.name, usedNames);
      rt.rawPromptMap.set(namespacedName, prompt.name);
      return {
        ...prompt,
        name: namespacedName,
        description: prompt.description
          ? `[${name}] ${prompt.description}`
          : `[${name}] Prompt ${prompt.name}`,
      };
    });
  }

  async _syncServerResources(name, client, rt) {
    const caps = client.getServerCapabilities?.() || {};
    if (!caps.resources) {
      rt.supportsResources = false;
      rt.resources = [];
      rt.resourceTemplates = [];
      rt.rawResourceSet.clear();
      return;
    }

    rt.supportsResources = true;
    rt.rawResourceSet.clear();

    try {
      const rawResources = await fetchAllPages((p) => client.listResources(p), 'resources');
      rt.resources = rawResources.map((r) => {
        if (r?.uri) rt.rawResourceSet.add(r.uri);
        return {
          ...r,
          name: r.name ? `[${name}] ${r.name}` : `[${name}] ${r.uri}`,
        };
      });
    } catch {
      rt.resources = [];
    }

    try {
      const rawTemplates = await fetchAllPages(
        (p) => client.listResourceTemplates(p),
        'resourceTemplates'
      );
      rt.resourceTemplates = rawTemplates.map((tpl) => ({
        ...tpl,
        name: tpl.name ? `[${name}] ${tpl.name}` : `[${name}] ${tpl.uriTemplate}`,
      }));
    } catch {
      rt.resourceTemplates = [];
    }
  }

  /**
   * Auto-start any servers that were persisted as `enabled: true`.
   */
  async restoreEnabledServers() {
    const servers = this.configStore.getServers();
    const toStart = Object.entries(servers)
      .filter(([, cfg]) => cfg.enabled)
      .map(([name]) => name);

    await Promise.allSettled(toStart.map((name) => this.startServer(name)));
  }

  /**
   * Start and connect to a configured MCP server (stdio, streamableHttp, or sse).
   */
  async startServer(name) {
    const config = this.configStore.getServer(name);
    if (!config) {
      throw new Error(`Server "${name}" not found in configuration.`);
    }

    const rt = this._ensureRuntime(name);
    if (rt.pendingStop) {
      await rt.pendingStop;
    }
    if (rt.status === 'connected' || rt.status === 'starting') {
      return this.getServerSnapshot(name);
    }

    rt.stopping = false;
    rt.status = 'starting';
    rt.error = null;
    rt.installHint = null;
    rt.lastErrorLogs = [];
    rt.runLogStart = rt.logs.length;
    rt.tools = [];
    rt.rawToolMap.clear();
    rt.prompts = [];
    rt.rawPromptMap.clear();
    rt.resources = [];
    rt.resourceTemplates = [];
    rt.rawResourceSet.clear();
    rt.supportsResources = false;
    rt.tokenEstimate = 0;
    this.configStore.setServerEnabled(name, true);
    this._appendLog(name, 'system', `Starting ${name} (${config.transport})...`);
    this._emitState();

    // For STDIO servers, validate cwd and binary availability before spawning
    let resolvedCommand = stripOuterQuotes(config.command);
    if (config.transport === 'stdio') {
      if (config.cwd && !fs.existsSync(config.cwd)) {
        const msg = `Working directory "${config.cwd}" does not exist.`;
        rt.status = 'error';
        rt.error = msg;
        this.configStore.setServerEnabled(name, false);
        this._appendLog(name, 'stderr', msg);
        this._captureErrorTail(rt);
        this._emitState();
        return this.getServerSnapshot(name);
      }

      const isPath = resolvedCommand.includes('/') || resolvedCommand.includes('\\') || resolvedCommand.startsWith('.');
      const resolvedExecutable = isPath
        ? findExecutableInPath(resolvedCommand, config.cwd || null)
        : await resolveBinaryPath(resolvedCommand);
      if (!resolvedExecutable) {
        const msg = isPath
          ? `Executable "${resolvedCommand}" was not found.`
          : `Binary "${resolvedCommand}" was not found on your system PATH.`;
        rt.status = 'error';
        rt.error = msg;
        if (!isPath) rt.installHint = getInstallHint(resolvedCommand);
        this.configStore.setServerEnabled(name, false);
        this._appendLog(name, 'stderr', msg);
        this._captureErrorTail(rt);
        this._emitState();
        return this.getServerSnapshot(name);
      }
      resolvedCommand = resolvedExecutable;
    }

    /** @type {any} */
    let transport;
    const client = new Client(
      { name: 'mcp-switchboard', version: '1.0.0' },
      { capabilities: {} }
    );

    const startupPromise = (async () => {
      if (config.transport === 'stdio') {
        // StdioClientTransport delegates to cross-spawn, which resolves .cmd/.bat/shebangs
        // and quotes Windows arguments safely when passed the unquoted command + args directly.
        const resolved = resolveCommandForPlatform(resolvedCommand, config.args || []);

        transport = new StdioClientTransport({
          command: resolved.command,
          args: resolved.args,
          env: mergePlatformEnv(config.env),
          cwd: config.cwd || undefined,
          stderr: 'pipe',
        });
        rt.client = client;
        rt.transport = transport;

        // Attach stderr log capture immediately
        const stderrStream = transport.stderr;
        if (stderrStream) {
          stderrStream.on('data', (chunk) => {
            this._appendLog(name, 'stderr', chunk.toString('utf8'));
          });
        }

        transport.onerror = (err) => {
          this._appendLog(name, 'stderr', `Transport error: ${err?.message || String(err)}`);
        };

        transport.onclose = () => {
          // During 'starting', client.connect()/MCP requests reject on close and handle failure once in catch().
          if (!rt.stopping && rt.status === 'connected') {
            this._handleUnexpectedExit(name, 'MCP server process exited unexpectedly.');
          }
        };

        await client.connect(transport);
        rt.pid = transport.pid || null;
      } else {
        // Remote HTTP / SSE server: try StreamableHTTP first unless explicitly 'sse'
        const targetUrl = new URL(config.url);
        const requestInit = config.headers && Object.keys(config.headers).length > 0
          ? { headers: config.headers }
          : undefined;

        if (config.transport === 'sse') {
          transport = new SSEClientTransport(targetUrl, { requestInit });
          rt.client = client;
          rt.transport = transport;
          await client.connect(transport);
        } else {
          try {
            transport = new StreamableHTTPClientTransport(targetUrl, { requestInit });
            rt.client = client;
            rt.transport = transport;
            await client.connect(transport);
          } catch (httpErr) {
            try { await transport?.close?.(); } catch {}
            if (rt.stopping) throw httpErr;
            this._appendLog(name, 'system', `Streamable HTTP failed (${httpErr.message}); falling back to SSE...`);
            transport = new SSEClientTransport(targetUrl, { requestInit });
            rt.client = client;
            rt.transport = transport;
            await client.connect(transport);
          }
        }

        transport.onerror = (err) => {
          this._appendLog(name, 'stderr', `Remote transport error: ${err?.message || String(err)}`);
        };
        transport.onclose = () => {
          if (!rt.stopping && rt.status === 'connected') {
            this._handleUnexpectedExit(name, 'Remote MCP server connection closed.');
          }
        };
      }

      if (rt.stopping) {
        throw new Error('Cancelled while starting.');
      }

      // Fetch tools, prompts, and resources advertised by the connected MCP server
      await this._syncServerTools(name, client, rt);
      if (rt.stopping) {
        throw new Error('Cancelled while fetching capabilities.');
      }
      await Promise.all([
        this._syncServerPrompts(name, client, rt),
        this._syncServerResources(name, client, rt),
      ]);
      if (rt.stopping) {
        throw new Error('Cancelled while fetching capabilities.');
      }

      // Forward dynamic list_changed updates from upstream MCP servers
      client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
        if (rt.status !== 'connected' || rt.stopping) return;
        try {
          await this._syncServerTools(name, client, rt);
          this._emitToolsChanged();
        } catch {}
      });
      client.setNotificationHandler(PromptListChangedNotificationSchema, async () => {
        if (rt.status !== 'connected' || rt.stopping) return;
        try {
          await this._syncServerPrompts(name, client, rt);
          this._emitPromptsChanged();
        } catch {}
      });
      client.setNotificationHandler(ResourceListChangedNotificationSchema, async () => {
        if (rt.status !== 'connected' || rt.stopping) return;
        try {
          await this._syncServerResources(name, client, rt);
          this._emitResourcesChanged();
        } catch {}
      });

      rt.client = client;
      rt.transport = transport;
      rt.status = 'connected';
      rt.connectedAt = new Date().toISOString();
      rt.error = null;
      rt.installHint = null;
      this._appendLog(
        name,
        'system',
        `Connected (${rt.tools.length} tools, ${rt.prompts.length} prompts, ${rt.resources.length} resources, ~${rt.tokenEstimate.toLocaleString()} tokens)`
      );
      this._emitToolsChanged();
      if (rt.prompts.length > 0) this._emitPromptsChanged();
      if (rt.resources.length > 0 || rt.resourceTemplates.length > 0) this._emitResourcesChanged();
    })();

    // Enforce startup timeout (absorb late rejections from timed-out connects)
    startupPromise.catch(() => {});
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Startup timed out after ${STARTUP_TIMEOUT_MS / 1000}s.`));
      }, STARTUP_TIMEOUT_MS);
    });

    try {
      await Promise.race([startupPromise, timeoutPromise]);
    } catch (err) {
      const wasCancelled = rt.stopping;
      rt.stopping = true;
      const rawErrMsg = err?.message || String(err);

      // Clean up any partial transport/process and allow buffered stderr chunks to flush
      const pid = transport?.pid || rt.pid;
      if (transport) {
        transport.onclose = undefined;
        transport.onerror = undefined;
      }
      try { await client.close(); } catch {}
      try { await transport?.close?.(); } catch {}
      if (pid) await killProcessTree(pid, 1500);
      await new Promise((resolve) => setImmediate(resolve));
      transport?.stderr?.removeAllListeners?.();

      rt.client = null;
      rt.transport = null;
      rt.pid = null;
      const { hadPrompts, hadResources } = this._clearRuntimeCapabilities(rt);

      if (wasCancelled) {
        rt.status = 'off';
        rt.error = null;
      } else {
        const formattedErr = this._formatFailureMessage(rawErrMsg, rt);
        this._appendLog(name, 'stderr', `Startup failed: ${formattedErr}`);
        rt.status = 'error';
        rt.error = formattedErr;
        if (config.transport === 'stdio' && /ENOENT|not recognized|not found/i.test(`${rawErrMsg} ${formattedErr}`)) {
          rt.installHint = getInstallHint(config.command);
        }
        this._captureErrorTail(rt);
      }
      this.configStore.setServerEnabled(name, false);
      rt.stopping = false;
      this._emitToolsChanged();
      if (hadPrompts) this._emitPromptsChanged();
      if (hadResources) this._emitResourcesChanged();
    } finally {
      clearTimeout(timeoutId);
    }

    return this.getServerSnapshot(name);
  }

  _handleUnexpectedExit(name, reason) {
    const rt = this.runtimes.get(name);
    if (!rt) return;
    const transport = rt.transport;
    if (transport) {
      transport.onclose = undefined;
      transport.onerror = undefined;
      transport.stderr?.removeAllListeners?.();
    }
    rt.client = null;
    rt.transport = null;
    rt.pid = null;
    const { hadPrompts, hadResources } = this._clearRuntimeCapabilities(rt);
    const summary = this._summarizeStderr(rt);
    const fullReason = summary ? `${reason} (${summary})` : reason;
    rt.status = 'error';
    rt.error = fullReason;
    this._appendLog(name, 'stderr', fullReason);
    this._captureErrorTail(rt);
    this.configStore.setServerEnabled(name, false);
    this._emitToolsChanged();
    if (hadPrompts) this._emitPromptsChanged();
    if (hadResources) this._emitResourcesChanged();
  }

  /**
   * Stop a running MCP server, kill its entire process tree (0 MB RAM),
   * and immediately purge its tools from the aggregated tool list (0 tokens).
   */
  async stopServer(name) {
    const rt = this.runtimes.get(name);
    const cfg = this.configStore.getServer(name);
    if (cfg?.enabled) {
      this.configStore.setServerEnabled(name, false);
    }
    if (!rt) return null;

    if (rt.pendingStop) {
      await rt.pendingStop;
      return this.getServerSnapshot(name);
    }
    if (rt.status === 'off' && !rt.client && !rt.transport && !rt.pid) {
      return this.getServerSnapshot(name);
    }

    rt.pendingStop = (async () => {
      rt.stopping = true;
      const pid = rt.pid || rt.transport?.pid;
      const client = rt.client;
      const transport = rt.transport;

      if (transport) {
        transport.onclose = undefined;
        transport.onerror = undefined;
      }

      rt.client = null;
      rt.transport = null;
      rt.pid = null;
      const { hadPrompts, hadResources } = this._clearRuntimeCapabilities(rt);
      rt.status = 'off';
      rt.connectedAt = null;
      rt.error = null;
      rt.installHint = null;

      // Immediately notify downstream MCP clients so token count drops to 0 right away
      this._emitToolsChanged();
      if (hadPrompts) this._emitPromptsChanged();
      if (hadResources) this._emitResourcesChanged();

      try { await client?.close(); } catch {}
      try { await transport?.close?.(); } catch {}
      transport?.stderr?.removeAllListeners?.();
      if (pid) {
        await killProcessTree(pid, 2000);
      }

      rt.stopping = false;
      this._appendLog(name, 'system', `Stopped ${name} (process terminated).`);
      this._emitState();
    })().finally(() => {
      rt.pendingStop = null;
    });

    await rt.pendingStop;
    return this.getServerSnapshot(name);
  }

  async toggleServer(name, enabled) {
    return enabled ? this.startServer(name) : this.stopServer(name);
  }

  async deleteServer(name) {
    await this.stopServer(name);
    this.runtimes.delete(name);
    return this.configStore.deleteServer(name);
  }

  async upsertServer(name, entry, originalName = null) {
    if (originalName && originalName !== name) {
      await this.stopServer(originalName);
      this.runtimes.delete(originalName);
      this.configStore.deleteServer(originalName);
    }
    const existing = this.runtimes.get(name);
    const wasActive = existing?.status === 'connected' || existing?.status === 'starting';
    if (wasActive) {
      await this.stopServer(name);
    }
    const saved = this.configStore.upsertServer(name, {
      ...entry,
      enabled: wasActive ? true : Boolean(entry.enabled),
    });
    this._ensureRuntime(name);
    if (wasActive) {
      await this.startServer(name);
    } else {
      this._emitState();
    }
    return saved;
  }

  importServers(serversMap) {
    const imported = this.configStore.importServers(serversMap);
    this._syncRuntimesWithConfig();
    this._emitState();
    return imported;
  }

  /**
   * Return the aggregated, clean MCP tools/list payload across all connected servers.
   */
  getAggregatedTools() {
    const tools = [];
    for (const rt of this.runtimes.values()) {
      if (rt.status === 'connected') {
        for (const t of rt.tools) {
          const { _switchboard, ...cleanTool } = t;
          tools.push(cleanTool);
        }
      }
    }
    return tools;
  }

  /**
   * Route an incoming `tools/call` request to the exact child MCP client.
   */
  async callTool(namespacedName, args = {}) {
    for (const rt of this.runtimes.values()) {
      if (rt.status === 'connected' && rt.rawToolMap.has(namespacedName)) {
        const originalName = rt.rawToolMap.get(namespacedName);
        this._appendLog(rt.name, 'system', `tools/call -> ${originalName}`);
        try {
          return await rt.client.callTool({
            name: originalName,
            arguments: args || {},
          });
        } catch (err) {
          const msg = err?.message || String(err);
          this._appendLog(rt.name, 'stderr', `Tool "${originalName}" error: ${msg}`);
          return {
            content: [{ type: 'text', text: `Error executing ${namespacedName}: ${msg}` }],
            isError: true,
          };
        }
      }
    }
    return {
      content: [
        {
          type: 'text',
          text: `Tool "${namespacedName}" is not available. The owning MCP server may be toggled OFF.`,
        },
      ],
      isError: true,
    };
  }

  /**
   * Return aggregated prompts across all connected servers.
   */
  getAggregatedPrompts() {
    const prompts = [];
    for (const rt of this.runtimes.values()) {
      if (rt.status === 'connected') {
        prompts.push(...rt.prompts);
      }
    }
    return prompts;
  }

  /**
   * Route `prompts/get` to the owning connected MCP server.
   */
  async getPrompt(namespacedName, args = {}) {
    for (const rt of this.runtimes.values()) {
      if (rt.status === 'connected' && rt.rawPromptMap.has(namespacedName)) {
        const originalName = rt.rawPromptMap.get(namespacedName);
        this._appendLog(rt.name, 'system', `prompts/get -> ${originalName}`);
        return rt.client.getPrompt({
          name: originalName,
          arguments: args || {},
        });
      }
    }
    throw new Error(`Prompt "${namespacedName}" is not available.`);
  }

  /**
   * Return aggregated resources across all connected servers.
   */
  getAggregatedResources() {
    const resources = [];
    for (const rt of this.runtimes.values()) {
      if (rt.status === 'connected') {
        resources.push(...rt.resources);
      }
    }
    return resources;
  }

  /**
   * Return aggregated resource templates across all connected servers.
   */
  getAggregatedResourceTemplates() {
    const resourceTemplates = [];
    for (const rt of this.runtimes.values()) {
      if (rt.status === 'connected') {
        resourceTemplates.push(...rt.resourceTemplates);
      }
    }
    return resourceTemplates;
  }

  /**
   * Route `resources/read` to the owning connected MCP server (exact URI first, then template-capable servers).
   */
  async readResource(uri) {
    for (const rt of this.runtimes.values()) {
      if (rt.status === 'connected' && rt.rawResourceSet.has(uri)) {
        this._appendLog(rt.name, 'system', `resources/read -> ${uri}`);
        return rt.client.readResource({ uri });
      }
    }
    for (const rt of this.runtimes.values()) {
      if (rt.status === 'connected' && rt.supportsResources) {
        try {
          const result = await rt.client.readResource({ uri });
          this._appendLog(rt.name, 'system', `resources/read -> ${uri}`);
          return result;
        } catch {
          // Try next resource-capable server
        }
      }
    }
    throw new Error(`Resource "${uri}" is not available.`);
  }

  getServerLogs(name) {
    const rt = this.runtimes.get(name);
    return rt ? rt.logs : [];
  }

  clearServerLogs(name) {
    const rt = this.runtimes.get(name);
    if (rt) {
      rt.logs = [];
      rt.lastErrorLogs = [];
    }
  }

  getServerTools(name) {
    const rt = this.runtimes.get(name);
    if (!rt) return [];
    return rt.tools.map((t) => ({
      name: t.name,
      originalName: t._switchboard?.originalName || t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || { type: 'object', properties: {} },
      tokenEstimate: estimateToolTokens([t]),
    }));
  }

  getServerSnapshot(name) {
    const cfg = this.configStore.getServer(name);
    if (!cfg) return null;
    const rt = this._ensureRuntime(name);
    return {
      name,
      transport: cfg.transport,
      command: cfg.command || null,
      args: cfg.args || [],
      env: cfg.env || {},
      url: cfg.url || null,
      headers: cfg.headers || {},
      preset: Boolean(cfg.preset),
      enabled: Boolean(cfg.enabled),
      status: rt.status,
      pid: rt.pid,
      toolCount: rt.tools.length,
      tokenEstimate: rt.tokenEstimate,
      error: rt.error,
      installHint: rt.installHint,
      lastErrorLogs: rt.lastErrorLogs,
      connectedAt: rt.connectedAt,
    };
  }

  getSummary() {
    this._syncRuntimesWithConfig();
    const servers = Object.keys(this.configStore.getServers()).map((name) =>
      this.getServerSnapshot(name)
    );
    const totalTools = servers.reduce((sum, s) => sum + (s.status === 'connected' ? s.toolCount : 0), 0);
    const totalTokens = servers.reduce((sum, s) => sum + (s.status === 'connected' ? s.tokenEstimate : 0), 0);
    const activeServers = servers.filter((s) => s.status === 'connected').length;

    return {
      servers,
      totals: {
        activeServers,
        totalServers: servers.length,
        totalTools,
        totalTokens,
      },
    };
  }

  async shutdownAll() {
    const names = Array.from(this.runtimes.keys());
    await Promise.allSettled(names.map((name) => this.stopServer(name)));
  }
}
