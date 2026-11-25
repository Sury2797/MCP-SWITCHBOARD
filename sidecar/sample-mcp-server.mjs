#!/usr/bin/env node
/**
 * Minimal, zero-dependency stdio MCP server for instant local testing
 * and automated end-to-end verification of MCP Switchboard.
 */
import readline from 'node:readline';

const TOOLS = [
  {
    name: 'echo',
    description: 'Echo back a message with a timestamp from the sample stdio MCP server.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message text to echo back.' },
      },
      required: ['message'],
    },
  },
  {
    name: 'system_time',
    description: 'Return the current ISO-8601 timestamp and host platform.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'very_long_tool_name_that_exceeds_sixty_four_characters_for_compatibility_testing',
    description: 'Verifies deterministic <= 64 character tool name truncation and routing.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

const PROMPTS = [
  {
    name: 'greet',
    description: 'Generate a short greeting prompt.',
    arguments: [{ name: 'name', description: 'Recipient name', required: false }],
  },
];

const RESOURCES = [
  {
    uri: 'sample://info',
    name: 'Sample Server Info',
    description: 'Metadata exposed by sample-stdio-mcp.',
    mimeType: 'application/json',
  },
];

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

console.error('[sample-mcp] Ready on stdio');

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req;
  try {
    req = JSON.parse(trimmed);
  } catch {
    return;
  }

  const { id, method, params } = req;

  if (method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: params?.protocolVersion || '2025-03-26',
        capabilities: { tools: {}, prompts: {}, resources: {} },
        serverInfo: { name: 'sample-stdio-mcp', version: '1.0.0' },
      },
    });
    return;
  }

  if (method === 'notifications/initialized') {
    return;
  }

  if (method === 'ping') {
    send({ jsonrpc: '2.0', id, result: {} });
    return;
  }

  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    return;
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};
    if (toolName === 'echo') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Echo: ${args.message ?? ''} (${new Date().toISOString()})` }],
        },
      });
      return;
    }
    if (toolName === 'system_time') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify({ iso: new Date().toISOString(), platform: process.platform }) }],
        },
      });
      return;
    }
    if (toolName === 'very_long_tool_name_that_exceeds_sixty_four_characters_for_compatibility_testing') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: 'long-tool-ok' }],
        },
      });
      return;
    }
    send({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Unknown tool: ${toolName}` },
    });
    return;
  }

  if (method === 'prompts/list') {
    send({ jsonrpc: '2.0', id, result: { prompts: PROMPTS } });
    return;
  }

  if (method === 'prompts/get') {
    const target = params?.arguments?.name || 'world';
    send({
      jsonrpc: '2.0',
      id,
      result: {
        description: 'Sample greeting',
        messages: [{ role: 'user', content: { type: 'text', text: `Hello ${target}!` } }],
      },
    });
    return;
  }

  if (method === 'resources/list') {
    send({ jsonrpc: '2.0', id, result: { resources: RESOURCES } });
    return;
  }

  if (method === 'resources/templates/list') {
    send({ jsonrpc: '2.0', id, result: { resourceTemplates: [] } });
    return;
  }

  if (method === 'resources/read') {
    if (params?.uri === 'sample://info') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          contents: [{ uri: 'sample://info', mimeType: 'application/json', text: '{"ok":true}' }],
        },
      });
      return;
    }
    send({
      jsonrpc: '2.0',
      id,
      error: { code: -32002, message: `Resource not found: ${params?.uri}` },
    });
  }
});
