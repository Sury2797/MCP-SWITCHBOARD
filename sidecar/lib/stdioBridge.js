import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  PromptListChangedNotificationSchema,
  ReadResourceRequestSchema,
  ResourceListChangedNotificationSchema,
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getMcpServerIcons } from './appIcon.js';

const PORT_MIN = 8000;
const PORT_MAX = 8010;

async function discoverSwitchboardUrl(explicitUrl) {
  if (explicitUrl) return explicitUrl;

  const ports = Array.from({ length: PORT_MAX - PORT_MIN + 1 }, (_, idx) => PORT_MIN + idx);
  const probes = await Promise.all(
    ports.map(async (port) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 700);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal });
        if (!res.ok) return null;
        const data = await res.json();
        if (data?.ok && data?.service === 'mcp-switchboard') {
          return `http://127.0.0.1:${port}/mcp`;
        }
      } catch {
        // Ignore offline port
      } finally {
        clearTimeout(timer);
      }
      return null;
    })
  );

  return probes.find(Boolean) || `http://127.0.0.1:${PORT_MIN}/mcp`;
}

/**
 * Run MCP Switchboard in `--stdio` bridge mode so STDIO-only desktop clients
 * (e.g. Claude Desktop local config) connect seamlessly to the running Switchboard app.
 */
export async function runStdioBridge(argv = process.argv) {
  const urlFlagIdx = argv.indexOf('--url');
  const portFlagIdx = argv.indexOf('--port');
  const tokenFlagIdx = argv.indexOf('--token');
  const rawExplicitUrl =
    (urlFlagIdx !== -1 && argv[urlFlagIdx + 1]) ||
    process.env.MCP_SWITCHBOARD_URL ||
    null;
  let explicitUrl = null;
  if (rawExplicitUrl) {
    const parsed = new URL(rawExplicitUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Unsupported Switchboard URL protocol: ${parsed.protocol}`);
    }
    explicitUrl = parsed.toString();
  } else if (portFlagIdx !== -1 && argv[portFlagIdx + 1]) {
    const parsedPort = Number(argv[portFlagIdx + 1]);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      throw new Error(`Invalid --port value: ${argv[portFlagIdx + 1]}`);
    }
    explicitUrl = `http://127.0.0.1:${parsedPort}/mcp`;
  }
  const authToken =
    (tokenFlagIdx !== -1 && argv[tokenFlagIdx + 1]) ||
    process.env.MCP_SWITCHBOARD_AUTH_TOKEN ||
    '';

  let upstreamClient = null;
  let upstreamTransport = null;
  let connectingPromise = null;

  const server = new Server(
    {
      name: 'mcp-switchboard',
      title: 'MCP Switchboard',
      version: '1.0.2',
      description: 'Dynamic MCP multiplexer bridge (STDIO -> Switchboard HTTP).',
      icons: getMcpServerIcons(),
    },
    {
      capabilities: {
        tools: { listChanged: true },
        prompts: { listChanged: true },
        resources: { listChanged: true },
      },
    }
  );

  async function ensureConnected() {
    if (upstreamClient) return upstreamClient;
    if (connectingPromise) return connectingPromise;

    connectingPromise = (async () => {
      const targetUrl = await discoverSwitchboardUrl(explicitUrl);
      const client = new Client(
        { name: 'mcp-switchboard-stdio-bridge', version: '1.0.2' },
        { capabilities: {} }
      );
      const transport = new StreamableHTTPClientTransport(
        new URL(targetUrl),
        authToken
          ? { requestInit: { headers: { Authorization: `Bearer ${authToken}` } } }
          : undefined
      );

      transport.onclose = () => {
        if (upstreamClient === client) {
          upstreamClient = null;
          upstreamTransport = null;
        }
      };

      client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
        await server.sendToolListChanged().catch(() => {});
      });
      client.setNotificationHandler(PromptListChangedNotificationSchema, async () => {
        await server.sendPromptListChanged().catch(() => {});
      });
      client.setNotificationHandler(ResourceListChangedNotificationSchema, async () => {
        await server.sendResourceListChanged().catch(() => {});
      });

      await client.connect(transport);
      upstreamClient = client;
      upstreamTransport = transport;
      return client;
    })();

    try {
      return await connectingPromise;
    } finally {
      connectingPromise = null;
    }
  }

  async function withClient(fn) {
    try {
      const client = await ensureConnected();
      return await fn(client);
    } catch (firstErr) {
      // Reset stale HTTP session and retry once in case Switchboard restarted
      try { await upstreamClient?.close?.(); } catch {}
      try { await upstreamTransport?.close?.(); } catch {}
      upstreamClient = null;
      upstreamTransport = null;
      try {
        const client = await ensureConnected();
        return await fn(client);
      } catch (retryErr) {
        const msg = retryErr?.message || firstErr?.message || 'Unable to reach MCP Switchboard.';
        throw new Error(`MCP Switchboard is not reachable (${msg}). Ensure the MCP Switchboard app is running.`);
      }
    }
  }

  server.setRequestHandler(ListToolsRequestSchema, async (req) =>
    withClient((c) => c.listTools(req.params))
  );
  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    withClient((c) => c.callTool(req.params))
  );
  server.setRequestHandler(ListPromptsRequestSchema, async (req) =>
    withClient((c) => c.listPrompts(req.params))
  );
  server.setRequestHandler(GetPromptRequestSchema, async (req) =>
    withClient((c) => c.getPrompt(req.params))
  );
  server.setRequestHandler(ListResourcesRequestSchema, async (req) =>
    withClient((c) => c.listResources(req.params))
  );
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async (req) =>
    withClient((c) => c.listResourceTemplates(req.params))
  );
  server.setRequestHandler(ReadResourceRequestSchema, async (req) =>
    withClient((c) => c.readResource(req.params))
  );

  let isClosing = false;
  const shutdown = async () => {
    if (isClosing) return;
    isClosing = true;
    try { await upstreamClient?.close?.(); } catch {}
    try { await upstreamTransport?.close?.(); } catch {}
    try { await server.close(); } catch {}
    process.exit(0);
  };

  const stdioTransport = new StdioServerTransport();
  stdioTransport.onclose = () => {
    void shutdown();
  };
  await server.connect(stdioTransport);
  await ensureConnected().catch((err) => {
    console.error(`[Switchboard --stdio] Initial connect deferred: ${err.message}`);
  });

  process.stdin.on('close', () => {
    void shutdown();
  });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
