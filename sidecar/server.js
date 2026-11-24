import http from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { ConfigStore, parsePastedMcpJson } from './lib/configStore.js';
import { McpManager } from './lib/mcpManager.js';
import { TunnelManager } from './lib/tunnelManager.js';
import { runDiagnostics } from './lib/diagnostics.js';

const PORT_MIN = 8000;
const PORT_MAX = 8010;

const configStore = new ConfigStore();
const mcpManager = new McpManager(configStore);
const tunnelManager = new TunnelManager();

const LOCAL_ORIGIN_RE = /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|tauri:\/\/localhost|https?:\/\/tauri\.localhost)$/i;
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1)(:\d+)?$/i;

function isLocalOrigin(origin) {
  return typeof origin === 'string' && LOCAL_ORIGIN_RE.test(origin);
}

/**
 * Guard /api/* against public internet exposure (via Cloudflare Tunnel),
 * DNS rebinding, and cross-origin browser CSRF/RCE.
 */
function requireLocalControlOrigin(req, res, next) {
  if (
    req.headers['cf-ray'] ||
    req.headers['cf-connecting-ip'] ||
    req.headers['x-forwarded-for'] ||
    req.headers['x-forwarded-host'] ||
    req.headers['forwarded']
  ) {
    return res.status(403).json({ error: 'Control API is local-only and blocked over tunnels/proxies.' });
  }

  const host = req.headers.host;
  if (host && !LOCAL_HOST_RE.test(host)) {
    return res.status(403).json({ error: 'Invalid Host header for local Control API.' });
  }

  const origin = req.headers.origin;
  if (origin && !isLocalOrigin(origin)) {
    return res.status(403).json({ error: 'Origin not allowed for local Control API.' });
  }

  next();
}

const app = express();
app.use('/mcp', cors({
  origin: true,
  exposedHeaders: ['Mcp-Session-Id'],
}));
app.use('/health', cors({ origin: true }));
app.use('/api', requireLocalControlOrigin, cors({
  origin: (origin, cb) => cb(null, !origin || isLocalOrigin(origin)),
  credentials: true,
}));
app.use(express.json({ limit: '4mb' }));

// Track active Streamable HTTP MCP sessions so we can broadcast notifications/tools/list_changed
const mcpSessions = new Map(); // sessionId -> { server, transport }

// Track SSE clients subscribed from the React Switchboard UI
const uiSseClients = new Set();

let boundPort = configStore.getSettings().port || PORT_MIN;
let httpServer = null;
let isShuttingDown = false;

function buildFullState() {
  const summary = mcpManager.getSummary();
  return {
    port: boundPort,
    configPath: configStore.filePath,
    settings: configStore.getSettings(),
    tunnel: tunnelManager.getState(),
    ...summary,
  };
}

function broadcastUiEvent(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of uiSseClients) {
    try {
      res.write(payload);
    } catch {
      uiSseClients.delete(res);
    }
  }
}

/**
 * Create a low-level MCP Server instance wired dynamically to mcpManager.
 */
function createAggregatedMcpServer() {
  const server = new Server(
    { name: 'mcp-switchboard', version: '1.0.0' },
    { capabilities: { tools: { listChanged: true } } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: mcpManager.getAggregatedTools(),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return mcpManager.callTool(name, args);
  });

  return server;
}

// Broadcast notifications/tools/list_changed to every connected MCP client session
mcpManager.on('toolsChanged', () => {
  for (const [sessionId, session] of mcpSessions.entries()) {
    session.server.sendToolListChanged().catch(() => {
      // Session may have disconnected; ignore
      mcpSessions.delete(sessionId);
    });
  }
  broadcastUiEvent('state', buildFullState());
});

mcpManager.on('state', () => {
  broadcastUiEvent('state', buildFullState());
});

mcpManager.on('log', (payload) => {
  broadcastUiEvent('log', payload);
});

tunnelManager.on('state', () => {
  broadcastUiEvent('state', buildFullState());
});

tunnelManager.on('log', (entry) => {
  broadcastUiEvent('tunnelLog', entry);
});

// ============================================================================
// 1. Streamable HTTP MCP Endpoint (/mcp) & Health Check (/health)
// ============================================================================

app.get('/health', (_req, res) => {
  const summary = mcpManager.getSummary();
  res.json({
    ok: true,
    service: 'mcp-switchboard',
    port: boundPort,
    endpoint: `http://localhost:${boundPort}/mcp`,
    tunnel: tunnelManager.getState(),
    activeServers: summary.totals.activeServers,
    totalTools: summary.totals.totalTools,
    totalTokens: summary.totals.totalTokens,
    uptimeSec: Math.floor(process.uptime()),
  });
});

app.post('/mcp', async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'];

    // Reuse existing session if valid
    if (sessionId && mcpSessions.has(sessionId)) {
      const session = mcpSessions.get(sessionId);
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    // Initialize a new stateful session if this is an `initialize` request
    const isInit = req.body && (
      req.body.method === 'initialize' ||
      (Array.isArray(req.body) && req.body.some((m) => m?.method === 'initialize'))
    );

    if (isInit) {
      const server = createAggregatedMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          mcpSessions.set(sid, { server, transport });
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          mcpSessions.delete(transport.sessionId);
        }
      };

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // Per MCP Streamable HTTP spec, return 404 if client sent an unknown/expired session ID
    if (sessionId && !mcpSessions.has(sessionId)) {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Session expired or not found. Please re-initialize.' },
        id: req.body?.id ?? null,
      });
      return;
    }

    // Stateless fallback (handles direct JSON-RPC calls without prior session header)
    const statelessServer = createAggregatedMcpServer();
    const statelessTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on('close', () => {
      statelessTransport.close().catch(() => {});
      statelessServer.close().catch(() => {});
    });
    await statelessServer.connect(statelessTransport);
    await statelessTransport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[MCP /mcp POST error]', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: err?.message || 'Internal MCP multiplexer error' },
        id: req.body?.id ?? null,
      });
    }
  }
});

app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !mcpSessions.has(sessionId)) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Invalid or missing Mcp-Session-Id header.' },
      id: null,
    });
    return;
  }
  try {
    const session = mcpSessions.get(sessionId);
    await session.transport.handleRequest(req, res);
  } catch (err) {
    console.error('[MCP /mcp GET error]', err);
    if (!res.headersSent) res.status(500).end();
  }
});

app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !mcpSessions.has(sessionId)) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  try {
    const session = mcpSessions.get(sessionId);
    await session.transport.handleRequest(req, res);
  } catch (err) {
    console.error('[MCP /mcp DELETE error]', err);
    if (!res.headersSent) res.status(500).end();
  } finally {
    mcpSessions.delete(sessionId);
  }
});

// ============================================================================
// 2. Switchboard Control REST API & Live SSE Stream (/api/*)
// ============================================================================

app.get('/api/state', (_req, res) => {
  res.json(buildFullState());
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  uiSseClients.add(res);
  res.write(`event: state\ndata: ${JSON.stringify(buildFullState())}\n\n`);

  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
      uiSseClients.delete(res);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    uiSseClients.delete(res);
  });
});

app.post('/api/servers/import', (req, res) => {
  try {
    const { jsonText } = req.body || {};
    if (typeof jsonText !== 'string' || !jsonText.trim()) {
      return res.status(400).json({ error: 'Please paste a valid JSON snippet.' });
    }
    const parsedMap = parsePastedMcpJson(jsonText);
    const imported = mcpManager.importServers(parsedMap);
    res.json({ ok: true, imported, state: buildFullState() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/servers', async (req, res) => {
  try {
    const { name, originalName, ...entry } = req.body || {};
    const saved = await mcpManager.upsertServer(name, entry, originalName || null);
    res.json({ ok: true, server: saved, state: buildFullState() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/servers/:name', async (req, res) => {
  try {
    const deleted = await mcpManager.deleteServer(req.params.name);
    if (!deleted) return res.status(404).json({ error: 'Server not found' });
    res.json({ ok: true, state: buildFullState() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/servers/:name/toggle', async (req, res) => {
  try {
    const { enabled } = req.body || {};
    const snapshot = await mcpManager.toggleServer(req.params.name, Boolean(enabled));
    res.json({ ok: true, server: snapshot, state: buildFullState() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/servers/:name/tools', (req, res) => {
  res.json({
    server: req.params.name,
    tools: mcpManager.getServerTools(req.params.name),
  });
});

app.get('/api/servers/:name/logs', (req, res) => {
  res.json({
    server: req.params.name,
    logs: mcpManager.getServerLogs(req.params.name),
  });
});

app.delete('/api/servers/:name/logs', (req, res) => {
  mcpManager.clearServerLogs(req.params.name);
  res.json({ ok: true });
});

app.post('/api/tunnel/start', async (_req, res) => {
  const tunnel = await tunnelManager.start(boundPort, configStore.getSettings());
  res.json({ ok: tunnel.status !== 'error', tunnel, state: buildFullState() });
});

app.post('/api/tunnel/stop', async (_req, res) => {
  const tunnel = await tunnelManager.stop();
  res.json({ ok: true, tunnel, state: buildFullState() });
});

app.get('/api/tunnel/logs', (_req, res) => {
  res.json({ logs: tunnelManager.getLogs() });
});

app.patch('/api/settings', (req, res) => {
  const settings = configStore.updateSettings(req.body || {});
  broadcastUiEvent('state', buildFullState());
  res.json({ ok: true, settings, state: buildFullState() });
});

app.get('/api/diagnostics', async (_req, res) => {
  const report = await runDiagnostics();
  res.json(report);
});

app.post('/api/shutdown', async (_req, res) => {
  res.json({ ok: true });
  await gracefulShutdown('api');
});

// ============================================================================
// 3. Automatic Port Fallback (8000-8010) & Strict Process-Tree Shutdown
// ============================================================================

function listenWithFallback(startPort = PORT_MIN, maxPort = PORT_MAX) {
  return new Promise((resolve, reject) => {
    let port = startPort;

    const tryPort = () => {
      const server = http.createServer(app);
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && port < maxPort) {
          console.error(`[Switchboard] Port ${port} in use, trying ${port + 1}...`);
          port += 1;
          tryPort();
        } else {
          reject(err);
        }
      });
      server.once('listening', () => {
        resolve({ server, port });
      });
      server.listen(port, '127.0.0.1');
    };

    tryPort();
  });
}

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.error(`[Switchboard] Shutting down (${signal})...`);

  for (const res of uiSseClients) {
    try { res.end(); } catch {}
  }
  uiSseClients.clear();

  for (const session of mcpSessions.values()) {
    try { await session.transport.close(); } catch {}
    try { await session.server.close(); } catch {}
  }
  mcpSessions.clear();

  await Promise.allSettled([
    tunnelManager.stop(),
    mcpManager.shutdownAll(),
  ]);

  if (httpServer) {
    await new Promise((resolve) => httpServer.close(() => resolve()));
  }
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('unhandledRejection', (err) => {
  console.error('[Switchboard] Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('[Switchboard] Uncaught exception:', err);
  gracefulShutdown('uncaughtException');
});

// Parent Process Watchdog for Tauri Desktop: cleanly terminate when parent GUI exits/crashes
const parentPidStr = process.env.MCP_SWITCHBOARD_PARENT_PID;
if (parentPidStr) {
  const parentPid = parseInt(parentPidStr, 10);
  if (!isNaN(parentPid) && parentPid > 0) {
    setInterval(() => {
      try {
        // process.kill(pid, 0) tests process existence without delivering a signal
        process.kill(parentPid, 0);
      } catch {
        console.error(`[Switchboard] Parent process ${parentPid} closed. Terminating sidecar cleanly.`);
        gracefulShutdown('parent_exit');
      }
    }, 1200);
  }
}

async function main() {
  const preferredPort = Number(process.env.PORT || configStore.getSettings().port || PORT_MIN);
  const { server, port } = await listenWithFallback(preferredPort, PORT_MAX);
  httpServer = server;
  boundPort = port;

  // Machine-readable readiness marker for Tauri parent process with immediate flush
  process.stdout.write(`SWITCHBOARD_READY_PORT=${boundPort}\n`);
  console.error(`[Switchboard] MCP endpoint listening at http://localhost:${boundPort}/mcp`);

  await mcpManager.restoreEnabledServers();

  if (configStore.getSettings().autoStartTunnel) {
    tunnelManager.start(boundPort, configStore.getSettings()).catch((err) => {
      console.error('[Switchboard] Auto-start tunnel failed:', err.message);
    });
  }
}

main().catch((err) => {
  console.error('[Switchboard] Fatal startup error:', err);
  process.exit(1);
});
