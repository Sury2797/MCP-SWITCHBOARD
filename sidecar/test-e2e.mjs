#!/usr/bin/env node
/**
 * End-to-end verification test for MCP Switchboard sidecar:
 * 1. Launches sidecar/server.js with an isolated temp config directory
 * 2. Imports sidecar/sample-mcp-server.mjs via POST /api/servers/import (Paste JSON flow)
 * 3. Toggles the server ON and verifies tools appear at http://localhost:<port>/mcp
 * 4. Executes tools/call for sample_stdio__echo
 * 5. Toggles the server OFF and confirms process termination and 0 tools / 0 tokens
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-switchboard-e2e-'));

function waitForReady(proc) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Sidecar startup timed out')), 10000);
    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      const match = text.match(/SWITCHBOARD_READY_PORT=(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
    proc.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Sidecar exited prematurely with code ${code}`));
    });
  });
}

async function mcpRpc(port, body, sessionId = null) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;

  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const nextSession = res.headers.get('mcp-session-id') || sessionId;

  // Handle either application/json or text/event-stream response
  let json;
  if (text.trim().startsWith('{')) {
    json = JSON.parse(text);
  } else {
    const dataLine = text.split(/\r?\n/).find((l) => l.startsWith('data: '));
    json = dataLine ? JSON.parse(dataLine.slice(6)) : null;
  }
  return { status: res.status, sessionId: nextSession, json };
}

async function run() {
  const sidecar = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, MCP_SWITCHBOARD_DATA_DIR: tmpDir, PORT: '8005' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    const port = await waitForReady(sidecar);
    console.log(`[E2E] Sidecar ready on http://127.0.0.1:${port}/mcp`);

    // 1. Verify /health
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    assert.equal(health.ok, true);
    assert.equal(health.totalTools, 0);

    // 1b. Security checks: /api/* must reject tunnel proxy headers, foreign origins, and unsafe names
    const tunneledApi = await fetch(`http://127.0.0.1:${port}/api/state`, {
      headers: { 'cf-ray': 'fake-tunnel-ray' },
    });
    assert.equal(tunneledApi.status, 403, 'Control API must reject Cloudflare Tunnel traffic');

    const foreignOrigin = await fetch(`http://127.0.0.1:${port}/api/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ name: 'evil', command: 'node', args: ['-v'] }),
    });
    assert.equal(foreignOrigin.status, 403, 'Control API must reject untrusted web origins');

    const badUrlRes = await fetch(`http://127.0.0.1:${port}/api/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'badurl', transport: 'sse', url: 'file:///etc/passwd' }),
    });
    assert.equal(badUrlRes.status, 400, 'Server validation must reject non-HTTP URLs');
    console.log('[E2E] Verified local-only Control API & input validation security');

    // 2. Import sample stdio MCP via Paste JSON endpoint
    const sampleScript = path.join(__dirname, 'sample-mcp-server.mjs');
    const jsonSnippet = JSON.stringify({
      mcpServers: {
        sample_stdio: {
          command: process.execPath,
          args: [sampleScript],
        },
      },
    });

    const importRes = await (
      await fetch(`http://127.0.0.1:${port}/api/servers/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonText: jsonSnippet }),
      })
    ).json();
    assert.equal(importRes.ok, true);
    assert.deepEqual(importRes.imported, ['sample_stdio']);

    // 3. Toggle sample_stdio ON
    const onRes = await (
      await fetch(`http://127.0.0.1:${port}/api/servers/sample_stdio/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      })
    ).json();
    assert.equal(onRes.server.status, 'connected');
    assert.equal(onRes.server.toolCount, 2);
    assert.ok(onRes.server.tokenEstimate > 0);
    const childPid = onRes.server.pid;
    console.log(`[E2E] Connected sample_stdio (PID=${childPid}, tools=${onRes.server.toolCount}, ~${onRes.server.tokenEstimate} tokens)`);

    // 4. Query /mcp via Streamable HTTP (initialize -> tools/list -> tools/call)
    const init = await mcpRpc(port, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'e2e-verifier', version: '1.0.0' },
      },
    });
    assert.equal(init.status, 200);

    const list = await mcpRpc(
      port,
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      init.sessionId
    );
    const toolNames = (list.json?.result?.tools || []).map((t) => t.name);
    assert.ok(toolNames.includes('sample_stdio__echo'), `Expected sample_stdio__echo in ${toolNames}`);
    assert.ok(toolNames.includes('sample_stdio__system_time'));

    const call = await mcpRpc(
      port,
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'sample_stdio__echo', arguments: { message: 'hello switchboard' } },
      },
      init.sessionId
    );
    assert.match(call.json?.result?.content?.[0]?.text || '', /hello switchboard/);
    console.log('[E2E] Verified /mcp tools/list and tools/call routing');

    // 5. Toggle sample_stdio OFF and confirm process termination + 0 tools
    const offRes = await (
      await fetch(`http://127.0.0.1:${port}/api/servers/sample_stdio/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      })
    ).json();
    assert.equal(offRes.server.status, 'off');
    assert.equal(offRes.state.totals.totalTools, 0);
    assert.equal(offRes.state.totals.totalTokens, 0);

    if (childPid) {
      let alive = true;
      try { process.kill(childPid, 0); } catch { alive = false; }
      assert.equal(alive, false, `Expected child PID ${childPid} to be terminated`);
    }

    const listAfter = await mcpRpc(
      port,
      { jsonrpc: '2.0', id: 4, method: 'tools/list', params: {} },
      init.sessionId
    );
    assert.equal((listAfter.json?.result?.tools || []).length, 0);
    console.log('[E2E] PASS: Process terminated and /mcp tool count dropped to 0.');
  } finally {
    sidecar.kill('SIGTERM');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error('[E2E] FAIL:', err);
  process.exit(1);
});
