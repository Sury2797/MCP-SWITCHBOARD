import { EventEmitter } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  checkBinary,
  getInstallHint,
  killProcessTree,
  resolveCommandForPlatform,
  IS_WIN,
} from './processUtils.js';

const STARTUP_TIMEOUT_MS = 15000;
const MAX_LOG_LINES = 200;
const ERROR_SNIPPET_LINES = 50;

/**
 * Sanitize server name for safe tool namespacing: `<serverName>__<toolName>`.
 */
export function sanitizePrefix(serverName) {
  return String(serverName)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'server';
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
    tokenEstimate: 0,
    error: null,
    installHint: null,
    lastErrorLogs: [],
    logs: [],
    connectedAt: null,
    stopping: false,
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
      if (!(name in servers)) {
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
        rt.logs.splice(0, rt.logs.length - MAX_LOG_LINES);
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

  _emitState() {
    this.emit('state', this.getSummary());
  }

  _emitToolsChanged() {
    this.emit('toolsChanged', this.getAggregatedTools());
    this._emitState();
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
    if (rt.status === 'connected' || rt.status === 'starting') {
      return this.getServerSnapshot(name);
    }

    rt.stopping = false;
    rt.status = 'starting';
    rt.error = null;
    rt.installHint = null;
    rt.lastErrorLogs = [];
    rt.tools = [];
    rt.rawToolMap.clear();
    rt.tokenEstimate = 0;
    this.configStore.setServerEnabled(name, true);
    this._appendLog(name, 'system', `Starting ${name} (${config.transport})...`);
    this._emitState();

    // For STDIO servers, proactively verify the binary exists so missing npx/uvx/python gives a clear hint
    let resolvedCommand = config.command;
    if (config.transport === 'stdio') {
      const cmd = config.command;
      const isPath = cmd.includes('/') || cmd.includes('\\') || cmd.startsWith('.');
      if (!isPath) {
        const probe = await checkBinary(cmd, ['--version']);
        if (!probe.installed) {
          const msg = `Binary "${cmd}" was not found on your system PATH.`;
          rt.status = 'error';
          rt.error = msg;
          rt.installHint = getInstallHint(cmd);
          this.configStore.setServerEnabled(name, false);
          this._appendLog(name, 'stderr', msg);
          this._captureErrorTail(rt);
          this._emitState();
          return this.getServerSnapshot(name);
        }
        if (probe.binary) {
          resolvedCommand = probe.binary;
        }
      }
    }

    /** @type {any} */
    let transport;
    const client = new Client(
      { name: 'mcp-switchboard', version: '1.0.0' },
      { capabilities: {} }
    );

    const startupPromise = (async () => {
      if (config.transport === 'stdio') {
        const resolved = resolveCommandForPlatform(resolvedCommand, config.args || []);
        // On Windows, StdioClientTransport passes command directly to cross-spawn / child_process.
        // Using cmd.exe /c for .cmd shims guarantees zero ENOENT errors without shell quoting bugs.
        const spawnCommand = IS_WIN && resolved.useShell ? 'cmd.exe' : resolved.command;
        const spawnArgs = IS_WIN && resolved.useShell
          ? ['/d', '/s', '/c', resolved.command, ...resolved.args]
          : resolved.args;

        transport = new StdioClientTransport({
          command: spawnCommand,
          args: spawnArgs,
          env: {
            ...process.env,
            ...(config.env || {}),
          },
          cwd: config.cwd || undefined,
          stderr: 'pipe',
        });

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
          if (!rt.stopping && (rt.status === 'connected' || rt.status === 'starting')) {
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
          await client.connect(transport);
        } else {
          try {
            transport = new StreamableHTTPClientTransport(targetUrl, { requestInit });
            await client.connect(transport);
          } catch (httpErr) {
            this._appendLog(name, 'system', `Streamable HTTP failed (${httpErr.message}); falling back to SSE...`);
            transport = new SSEClientTransport(targetUrl, { requestInit });
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

      // Fetch tool list from the connected MCP server
      const toolResponse = await client.listTools();
      if (rt.stopping) {
        throw new Error('Cancelled while fetching tools.');
      }
      const rawTools = Array.isArray(toolResponse?.tools) ? toolResponse.tools : [];
      const prefix = sanitizePrefix(name);

      const namespacedTools = rawTools.map((tool) => {
        const namespacedName = `${prefix}__${tool.name}`;
        rt.rawToolMap.set(namespacedName, tool.name);
        return {
          ...tool,
          name: namespacedName,
          description: tool.description
            ? `[${name}] ${tool.description}`
            : `[${name}] Tool ${tool.name}`,
          _switchboard: {
            server: name,
            originalName: tool.name,
          },
        };
      });

      rt.client = client;
      rt.transport = transport;
      rt.tools = namespacedTools;
      rt.tokenEstimate = estimateToolTokens(
        namespacedTools.map(({ _switchboard, ...clean }) => clean)
      );
      rt.status = 'connected';
      rt.connectedAt = new Date().toISOString();
      rt.error = null;
      rt.installHint = null;
      this._appendLog(
        name,
        'system',
        `Connected (${namespacedTools.length} tools, ~${rt.tokenEstimate.toLocaleString()} tokens)`
      );
      this._emitToolsChanged();
    })();

    // Enforce 15-second startup timeout
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
      const errMsg = err?.message || String(err);

      // Clean up any partial transport/process
      const pid = transport?.pid || rt.pid;
      try { await client.close(); } catch {}
      try { await transport?.close?.(); } catch {}
      if (pid) await killProcessTree(pid, 1500);

      rt.client = null;
      rt.transport = null;
      rt.pid = null;
      rt.tools = [];
      rt.rawToolMap.clear();
      rt.tokenEstimate = 0;

      if (wasCancelled) {
        rt.status = 'off';
        rt.error = null;
      } else {
        this._appendLog(name, 'stderr', `Startup failed: ${errMsg}`);
        rt.status = 'error';
        rt.error = errMsg;
        if (config.transport === 'stdio' && /ENOENT/i.test(errMsg)) {
          rt.installHint = getInstallHint(config.command);
        }
        this._captureErrorTail(rt);
      }
      this.configStore.setServerEnabled(name, false);
      rt.stopping = false;
      this._emitToolsChanged();
    } finally {
      clearTimeout(timeoutId);
    }

    return this.getServerSnapshot(name);
  }

  _handleUnexpectedExit(name, reason) {
    const rt = this.runtimes.get(name);
    if (!rt) return;
    rt.client = null;
    rt.transport = null;
    rt.pid = null;
    rt.tools = [];
    rt.rawToolMap.clear();
    rt.tokenEstimate = 0;
    rt.status = 'error';
    rt.error = reason;
    this._appendLog(name, 'stderr', reason);
    this._captureErrorTail(rt);
    this.configStore.setServerEnabled(name, false);
    this._emitToolsChanged();
  }

  /**
   * Stop a running MCP server, kill its entire process tree (0 MB RAM),
   * and immediately purge its tools from the aggregated tool list (0 tokens).
   */
  async stopServer(name) {
    const rt = this.runtimes.get(name);
    this.configStore.setServerEnabled(name, false);
    if (!rt) return null;

    rt.stopping = true;
    const pid = rt.pid || rt.transport?.pid;
    const client = rt.client;
    const transport = rt.transport;

    rt.client = null;
    rt.transport = null;
    rt.pid = null;
    rt.tools = [];
    rt.rawToolMap.clear();
    rt.tokenEstimate = 0;
    rt.status = 'off';
    rt.connectedAt = null;
    rt.error = null;
    rt.installHint = null;

    // Immediately notify downstream MCP clients so token count drops to 0 right away
    this._emitToolsChanged();

    try { await client?.close(); } catch {}
    try { await transport?.close?.(); } catch {}
    if (pid) {
      await killProcessTree(pid, 2000);
    }

    rt.stopping = false;
    this._appendLog(name, 'system', `Stopped ${name} (process terminated).`);
    this._emitState();
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
    const wasConnected = existing?.status === 'connected';
    if (wasConnected) {
      await this.stopServer(name);
    }
    const saved = this.configStore.upsertServer(name, {
      ...entry,
      enabled: wasConnected ? true : Boolean(entry.enabled),
    });
    this._ensureRuntime(name);
    if (wasConnected) {
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
