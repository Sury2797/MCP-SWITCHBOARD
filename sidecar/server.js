import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { ConfigStore, parsePastedMcpJson } from './lib/configStore.js';
import { McpManager } from './lib/mcpManager.js';
import { TunnelManager } from './lib/tunnelManager.js';
import { runDiagnostics } from './lib/diagnostics.js';
import {
  APP_FAVICON_ICO_BUFFER,
  APP_ICON_128_BUFFER,
  getMcpServerIcons,
} from './lib/appIcon.js';
import { runStdioBridge } from './lib/stdioBridge.js';

const IS_STDIO_BRIDGE = process.argv.includes('--stdio');
const PORT_MIN = 8000;
const PORT_MAX = 8010;

const configStore = new ConfigStore();
const mcpManager = new McpManager(configStore);
const tunnelManager = new TunnelManager();

const LOCAL_ORIGIN_RE = /^(https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?|tauri:\/\/localhost|https?:\/\/tauri\.localhost)$/i;
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/i;
const CONTROL_TOKEN = process.env.MCP_SWITCHBOARD_CONTROL_TOKEN || '';

function isLocalOrigin(origin) {
  return typeof origin === 'string' && LOCAL_ORIGIN_RE.test(origin);
}

function tokensMatch(presented, expected) {
  if (typeof presented !== 'string' || !expected) return false;
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Guard /api/* against public internet exposure (Cloudflare Tunnel),
 * DNS rebinding, cross-origin browser CSRF/RCE, and unauthenticated local callers.
 */
function requireLocalControlOrigin(req, res, next) {
  if (
    req.headers['cf-ray'] ||
    req.headers['cf-connecting-ip'] ||
    req.headers['x-forwarded-for'] ||
    req.headers['x-forwarded-host'] ||
    req.headers['x-real-ip'] ||
    req.headers['via'] ||
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

  // CORS preflight requests do not carry custom auth headers
  if (req.method !== 'OPTIONS' && CONTROL_TOKEN) {
    const presented = req.headers['x-switchboard-token'] || (req.path === '/events' ? req.query?.token : '');
    if (!tokensMatch(presented, CONTROL_TOKEN)) {
      return res.status(401).json({ error: 'Unauthorized Control API request.' });
    }
  }

  next();
}

const app = express();
app.disable('x-powered-by');
const mcpCors = cors({
  origin: true,
  exposedHeaders: ['Mcp-Session-Id', 'Mcp-Protocol-Version'],
});

/**
 * Optional Bearer token enforcement for public/IDE MCP endpoints (/mcp, /sse, /messages).
 * Disabled when settings.mcpAuthToken is empty so zero-auth clients (e.g. Gemini Custom MCP)
 * continue to work out of the box.
 */
function requireMcpAuth(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  const expected = String(configStore.getSettings().mcpAuthToken || '').trim();
  if (!expected) return next();

  const authHeader = String(req.headers.authorization || '');
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const presented = match ? match[1].trim() : '';
  if (!tokensMatch(presented, expected)) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="mcp-switchboard"');
    return res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized: valid Bearer token required.' },
      id: req.body?.id ?? null,
    });
  }
  next();
}

app.use(['/mcp', '/sse', '/messages'], mcpCors, requireMcpAuth);
app.use('/health', cors({ origin: true }));
app.use(['/icon.png', '/apple-touch-icon.png', '/favicon.ico'], cors({ origin: true }));
app.use('/api', requireLocalControlOrigin, cors({
  origin: (origin, cb) => cb(null, !origin || isLocalOrigin(origin)),
  credentials: true,
}));
app.use(express.json({ limit: '4mb' }));

// Track active Streamable HTTP & legacy SSE sessions with bounded capacity and idle TTL
const MAX_MCP_SESSIONS = 64;
const SESSION_IDLE_TTL_MS = 2 * 60 * 60 * 1000;
const mcpSessions = new Map(); // sessionId -> { server, transport, kind: 'http' | 'sse', lastSeen: number }

function closeSessionAsync(key, session) {
  mcpSessions.delete(key);
  try { session?.transport?.close?.().catch?.(() => {}); } catch {}
  try { session?.server?.close?.().catch?.(() => {}); } catch {}
}

function registerSession(key, entry) {
  if (mcpSessions.size >= MAX_MCP_SESSIONS) {
    // Evict oldest HTTP session first so long-lived SSE streams stay intact when possible
    let oldestKey = null;
    let oldestTs = Infinity;
    for (const [k, s] of mcpSessions.entries()) {
      if (s.kind === 'http' && s.lastSeen < oldestTs) {
        oldestTs = s.lastSeen;
        oldestKey = k;
      }
    }
    if (!oldestKey) oldestKey = mcpSessions.keys().next().value || null;
    if (oldestKey) closeSessionAsync(oldestKey, mcpSessions.get(oldestKey));
  }
  mcpSessions.set(key, { ...entry, lastSeen: Date.now() });
}

const sessionPruneTimer = !IS_STDIO_BRIDGE
  ? setInterval(() => {
      const cutoff = Date.now() - SESSION_IDLE_TTL_MS;
      for (const [key, session] of mcpSessions.entries()) {
        const sseClosed = session.kind === 'sse' && (session.res?.writableEnded || session.res?.destroyed);
        if ((session.kind === 'http' && session.lastSeen < cutoff) || sseClosed) {
          closeSessionAsync(key, session);
        }
      }
    }, 15 * 60 * 1000)
  : null;
sessionPruneTimer?.unref?.();

// Track SSE clients subscribed from the UI with bounded capacity
const MAX_UI_SSE_CLIENTS = 32;
const uiSseClients = new Set();

let boundPort = configStore.getSettings().port || PORT_MIN;
let httpServer = null;
let ipv6HttpServer = null;
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
    if (res.writableEnded || res.destroyed) {
      uiSseClients.delete(res);
      continue;
    }
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
    {
      name: 'mcp-switchboard',
      title: 'MCP Switchboard',
      version: '1.0.2',
      description: 'Dynamic MCP multiplexer and Cloudflare HTTPS tunnel switchboard.',
      icons: getMcpServerIcons(tunnelManager.getState().publicUrl),
    },
    {
      capabilities: {
        tools: { listChanged: true },
        prompts: { listChanged: true },
        resources: { listChanged: true },
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: mcpManager.getAggregatedTools(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return mcpManager.callTool(name, args);
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: mcpManager.getAggregatedPrompts(),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return mcpManager.getPrompt(name, args);
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: mcpManager.getAggregatedResources(),
  }));

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: mcpManager.getAggregatedResourceTemplates(),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    return mcpManager.readResource(request.params.uri);
  });

  return server;
}

// Broadcast capability list_changed notifications to every connected MCP client session
mcpManager.on('toolsChanged', () => {
  for (const [sessionId, session] of mcpSessions.entries()) {
    session.server.sendToolListChanged().catch(() => {
      closeSessionAsync(sessionId, session);
    });
  }
  broadcastUiEvent('state', buildFullState());
});

mcpManager.on('promptsChanged', () => {
  for (const [sessionId, session] of mcpSessions.entries()) {
    session.server.sendPromptListChanged().catch(() => {
      closeSessionAsync(sessionId, session);
    });
  }
  broadcastUiEvent('state', buildFullState());
});

mcpManager.on('resourcesChanged', () => {
  for (const [sessionId, session] of mcpSessions.entries()) {
    session.server.sendResourceListChanged().catch(() => {
      closeSessionAsync(sessionId, session);
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

// ============================================================================
// 1. Streamable HTTP MCP Endpoint (/mcp), Health Check & Public Icons
// ============================================================================

const PUBLIC_LANDING_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MCP Switchboard</title>
    <meta name="description" content="Dynamic MCP multiplexer and Streamable HTTP endpoint." />
    <link rel="icon" type="image/png" sizes="128x128" href="/icon.png" />
    <link rel="shortcut icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  </head>
  <body>
    <main>
      <h1>MCP Switchboard</h1>
      <p>Streamable HTTP MCP endpoint available at <code>/mcp</code>.</p>
    </main>
  </body>
</html>
`;

app.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(PUBLIC_LANDING_HTML);
});

app.get(['/icon.png', '/apple-touch-icon.png'], (_req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(APP_ICON_128_BUFFER);
});

app.get('/favicon.ico', (_req, res) => {
  res.setHeader('Content-Type', 'image/x-icon');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(APP_FAVICON_ICO_BUFFER);
});

app.head(['/mcp', '/sse'], (_req, res) => {
  res.status(200).end();
});

app.get('/.well-known/*', (_req, res) => {
  res.status(404).json({ error: 'Not configured' });
});

app.get('/health', (_req, res) => {
  const summary = mcpManager.getSummary();
  res.json({
    ok: true,
    service: 'mcp-switchboard',
    port: boundPort,
    endpoint: `http://localhost:${boundPort}/mcp`,
    authRequired: Boolean(String(configStore.getSettings().mcpAuthToken || '').trim()),
    tunnel: tunnelManager.getState(),
    activeServers: summary.totals.activeServers,
    totalTools: summary.totals.totalTools,
    totalTokens: summary.totals.totalTokens,
    uptimeSec: Math.floor(process.uptime()),
  });
});

app.post('/mcp', async (req, res) => {
  try {
    // Normalize Accept header for clients sending only `application/json` or `*/*`
    const rawAccept = String(req.headers.accept || '');
    const clientAcceptsSse = rawAccept.includes('text/event-stream');
    if (!rawAccept.includes('application/json') || !clientAcceptsSse) {
      req.headers.accept = 'application/json, text/event-stream';
    }

    const sessionId = typeof req.headers['mcp-session-id'] === 'string'
      ? req.headers['mcp-session-id']
      : '';
    const existing = sessionId ? mcpSessions.get(sessionId) : null;

    // Reuse existing Streamable HTTP session if valid
    if (existing && existing.kind === 'http') {
      existing.lastSeen = Date.now();
      await existing.transport.handleRequest(req, res, req.body);
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
        enableJsonResponse: !clientAcceptsSse,
        onsessioninitialized: (sid) => {
          registerSession(sid, { server, transport, kind: 'http' });
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          mcpSessions.delete(transport.sessionId);
        }
        server.close().catch(() => {});
      };

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // Per MCP Streamable HTTP spec, return 404 if client sent an unknown/expired session ID
    if (sessionId && (!existing || existing.kind !== 'http')) {
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
      enableJsonResponse: !clientAcceptsSse,
    });
    let statelessCleaned = false;
    const cleanupStateless = () => {
      if (statelessCleaned) return;
      statelessCleaned = true;
      statelessTransport.close().catch(() => {});
      statelessServer.close().catch(() => {});
    };
    res.on('close', cleanupStateless);
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

// Legacy HTTP+SSE transport endpoints (/sse & /messages) for older IDE/agent clients
app.get('/sse', async (req, res) => {
  try {
    const server = createAggregatedMcpServer();
    const transport = new SSEServerTransport('/messages', res);
    const key = `sse:${transport.sessionId}`;
    const entry = { server, transport, res, kind: 'sse' };
    registerSession(key, entry);
    transport.onclose = () => {
      mcpSessions.delete(key);
      server.close().catch(() => {});
    };
    req.on('close', () => {
      if (mcpSessions.has(key)) closeSessionAsync(key, entry);
    });
    await server.connect(transport);
  } catch (err) {
    console.error('[MCP /sse GET error]', err);
    if (!res.headersSent) res.status(500).end();
  }
});

app.post('/messages', async (req, res) => {
  const sessionId = typeof req.query?.sessionId === 'string' ? req.query.sessionId : '';
  const session = sessionId ? mcpSessions.get(`sse:${sessionId}`) : null;
  if (!session || session.kind !== 'sse') {
    res.status(404).json({ error: 'SSE session not found. Connect to GET /sse first.' });
    return;
  }
  session.lastSeen = Date.now();
  try {
    await session.transport.handlePostMessage(req, res, req.body);
  } catch (err) {
    console.error('[MCP /messages POST error]', err);
    if (!res.headersSent) res.status(500).end();
  }
});

app.get('/mcp', async (req, res) => {
  const sessionId = typeof req.headers['mcp-session-id'] === 'string' ? req.headers['mcp-session-id'] : '';
  const session = sessionId ? mcpSessions.get(sessionId) : null;
  if (!session || session.kind !== 'http') {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Invalid or missing Mcp-Session-Id header.' },
      id: null,
    });
    return;
  }
  session.lastSeen = Date.now();
  try {
    await session.transport.handleRequest(req, res);
  } catch (err) {
    console.error('[MCP /mcp GET error]', err);
    if (!res.headersSent) res.status(500).end();
  }
});

app.delete('/mcp', async (req, res) => {
  const sessionId = typeof req.headers['mcp-session-id'] === 'string' ? req.headers['mcp-session-id'] : '';
  const session = sessionId ? mcpSessions.get(sessionId) : null;
  if (!session || session.kind !== 'http') {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  try {
    await session.transport.handleRequest(req, res);
  } catch (err) {
    console.error('[MCP /mcp DELETE error]', err);
    if (!res.headersSent) res.status(500).end();
  } finally {
    closeSessionAsync(sessionId, session);
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

  if (uiSseClients.size >= MAX_UI_SSE_CLIENTS) {
    const oldest = uiSseClients.values().next().value;
    if (oldest) {
      uiSseClients.delete(oldest);
      try { oldest.end(); } catch {}
    }
  }

  uiSseClients.add(res);
  res.write(`event: state\ndata: ${JSON.stringify(buildFullState())}\n\n`);

  const keepAlive = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      cleanup();
      return;
    }
    try {
      res.write(': keepalive\n\n');
    } catch {
      cleanup();
    }
  }, 15000);
  keepAlive.unref?.();

  let cleaned = false;
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    clearInterval(keepAlive);
    uiSseClients.delete(res);
  }

  req.on('close', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);
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

app.patch('/api/settings', (req, res) => {
  try {
    const settings = configStore.updateSettings(req.body || {});
    broadcastUiEvent('state', buildFullState());
    res.json({ ok: true, settings, state: buildFullState() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/diagnostics', async (_req, res) => {
  const report = await runDiagnostics();
  res.json(report);
});

app.post('/api/shutdown', async (_req, res) => {
  res.json({ ok: true });
  await gracefulShutdown('api');
});

app.use((err, _req, res, _next) => {
  const status = err?.status || err?.statusCode || 400;
  if (!res.headersSent) {
    res.status(status).json({ error: err?.message || 'Malformed request' });
  }
});

// ============================================================================
// 3. Automatic Port Fallback (8000-8010) & Strict Process-Tree Shutdown
// ============================================================================

function closeHttpServerFast(srv) {
  if (!srv) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 400);
    timer.unref?.();
    srv.close(() => {
      clearTimeout(timer);
      resolve();
    });
    srv.closeAllConnections?.();
  });
}

function bindIpv6Loopback(port) {
  try {
    const v6 = http.createServer(app);
    v6.once('error', () => {
      // Optional IPv6 loopback; ignore if OS disables IPv6 or port is busy on ::1
    });
    v6.once('listening', () => {
      ipv6HttpServer = v6;
    });
    v6.listen(port, '::1');
  } catch {
    // Ignore IPv6 bind failures
  }
}

function listenWithFallback(startPort = PORT_MIN, maxPort = PORT_MAX) {
  return new Promise((resolve, reject) => {
    let port = startPort;

    const tryPort = () => {
      const server = http.createServer(app);
      server.once('error', (/** @type {NodeJS.ErrnoException} */ err) => {
        if (err.code === 'EADDRINUSE' && port < maxPort) {
          console.error(`[Switchboard] Port ${port} in use, trying ${port + 1}...`);
          port += 1;
          tryPort();
        } else {
          reject(err);
        }
      });
      server.once('listening', () => {
        bindIpv6Loopback(port);
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
  if (sessionPruneTimer) clearInterval(sessionPruneTimer);
  if (parentWatchdogTimer) clearInterval(parentWatchdogTimer);
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

  await Promise.all([
    closeHttpServerFast(ipv6HttpServer),
    closeHttpServerFast(httpServer),
  ]);
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
let parentWatchdogTimer = null;
if (!IS_STDIO_BRIDGE && parentPidStr) {
  const parentPid = parseInt(parentPidStr, 10);
  if (!isNaN(parentPid) && parentPid > 0) {
    parentWatchdogTimer = setInterval(() => {
      try {
        // process.kill(pid, 0) tests process existence without delivering a signal
        process.kill(parentPid, 0);
      } catch {
        console.error(`[Switchboard] Parent process ${parentPid} closed. Terminating sidecar cleanly.`);
        gracefulShutdown('parent_exit');
      }
    }, 1200);
    parentWatchdogTimer.unref?.();
  }
}

async function main() {
  if (IS_STDIO_BRIDGE) {
    await runStdioBridge();
    return;
  }

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
