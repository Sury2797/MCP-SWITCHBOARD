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
        capabilities: { tools: {} },
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
    send({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Unknown tool: ${toolName}` },
    });
  }
});
