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
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parsePastedMcpJson } from './lib/configStore.js';
import { buildSafeSymbolName } from './lib/mcpManager.js';
import { checkBinary, mergePlatformEnv, stripOuterQuotes } from './lib/processUtils.js';

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

const TEST_TOKEN = 'e2e-rust-enforced-session-token-0123456789abcdef';

async function run() {
  const sidecar = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: {
      ...process.env,
      MCP_SWITCHBOARD_DATA_DIR: tmpDir,
      PORT: '8005',
      MCP_SWITCHBOARD_CONTROL_TOKEN: TEST_TOKEN,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const apiHeaders = {
    'Content-Type': 'application/json',
    'X-Switchboard-Token': TEST_TOKEN,
  };

  try {
    const port = await waitForReady(sidecar);
    console.log(`[E2E] Sidecar ready on http://127.0.0.1:${port}/mcp`);

    // 1. Verify /health and public icon / landing routes
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    assert.equal(health.ok, true);
    assert.equal(health.totalTools, 0);

    const iconPngRes = await fetch(`http://127.0.0.1:${port}/icon.png`);
    assert.equal(iconPngRes.status, 200);
    assert.match(iconPngRes.headers.get('content-type') || '', /^image\/png/i);
    const iconPngBytes = Buffer.from(await iconPngRes.arrayBuffer());
    assert.deepEqual([...iconPngBytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);

    const appleIconRes = await fetch(`http://127.0.0.1:${port}/apple-touch-icon.png`);
    assert.equal(appleIconRes.status, 200);
    assert.match(appleIconRes.headers.get('content-type') || '', /^image\/png/i);

    const faviconRes = await fetch(`http://127.0.0.1:${port}/favicon.ico`);
    assert.equal(faviconRes.status, 200);
    assert.match(faviconRes.headers.get('content-type') || '', /^image\/x-icon/i);
    const faviconBytes = Buffer.from(await faviconRes.arrayBuffer());
    assert.deepEqual([...faviconBytes.subarray(0, 4)], [0x00, 0x00, 0x01, 0x00]);

    const landingRes = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(landingRes.status, 200);
    const landingHtml = await landingRes.text();
    assert.match(landingHtml, /rel="icon"/);

    const headMcp = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'HEAD' });
    assert.equal(headMcp.status, 200);
    const wellKnown = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource`);
    assert.equal(wellKnown.status, 404);
    assert.match(wellKnown.headers.get('content-type') || '', /application\/json/i);

    // 1b. Security checks: /api/* must reject tunnel headers, foreign origins, missing/bad tokens, & non-HTTP URLs
    const noTokenRes = await fetch(`http://127.0.0.1:${port}/api/state`);
    assert.equal(noTokenRes.status, 401, 'Control API must reject unauthenticated callers when token is enforced');

    const badTokenRes = await fetch(`http://127.0.0.1:${port}/api/state`, {
      headers: { 'X-Switchboard-Token': 'wrong-token' },
    });
    assert.equal(badTokenRes.status, 401, 'Control API must reject invalid session tokens');

    const tunneledApi = await fetch(`http://127.0.0.1:${port}/api/state`, {
      headers: { 'cf-ray': 'fake-tunnel-ray', 'X-Switchboard-Token': TEST_TOKEN },
    });
    assert.equal(tunneledApi.status, 403, 'Control API must reject Cloudflare Tunnel traffic');

    const foreignOrigin = await fetch(`http://127.0.0.1:${port}/api/servers`, {
      method: 'POST',
      headers: { ...apiHeaders, Origin: 'https://evil.example' },
      body: JSON.stringify({ name: 'evil', command: 'node', args: ['-v'] }),
    });
    assert.equal(foreignOrigin.status, 403, 'Control API must reject untrusted web origins');

    const badUrlRes = await fetch(`http://127.0.0.1:${port}/api/servers`, {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify({ name: 'badurl', transport: 'sse', url: 'file:///etc/passwd' }),
    });
    assert.equal(badUrlRes.status, 400, 'Server validation must reject non-HTTP URLs');
    console.log('[E2E] Verified Rust-enforced session token, local-only Control API, & URL validation');

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
        headers: apiHeaders,
        body: JSON.stringify({ jsonText: jsonSnippet }),
      })
    ).json();
    assert.equal(importRes.ok, true);
    assert.deepEqual(importRes.imported, ['sample_stdio']);

    // 0. Unit checks for universal IDE config parsing & <=64-char symbol naming
    const vsCodeParsed = parsePastedMcpJson(JSON.stringify({
      servers: { remote_http: { type: 'http', url: 'https://example.com/mcp' } },
    }));
    assert.equal(vsCodeParsed.remote_http.transport, 'streamableHttp');

    const geminiParsed = parsePastedMcpJson(JSON.stringify({
      mcpServers: { gem_http: { httpUrl: 'https://example.com/mcp' } },
    }));
    assert.equal(geminiParsed.gem_http.url, 'https://example.com/mcp');

    const zedParsed = parsePastedMcpJson(JSON.stringify({
      context_servers: { zed_srv: { command: { path: 'npx', args: ['-y', 'demo'], env: { A: '1' } } } },
    }));
    assert.equal(zedParsed.zed_srv.command, 'npx');
    assert.deepEqual(zedParsed.zed_srv.args, ['-y', 'demo']);
    assert.equal(zedParsed.zed_srv.env.A, '1');

    const digitSafe = buildSafeSymbolName('1password', 'get_item');
    assert.match(digitSafe, /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/);
    const longSafe = buildSafeSymbolName('very_long_server_name_prefix', 'very_long_tool_name_that_exceeds_sixty_four_characters_limit');
    assert.ok(longSafe.length <= 64, `Expected <= 64 chars, got ${longSafe.length}`);
    console.log('[E2E] Verified universal IDE JSON parser & <=64-char symbol sanitizer');

    // 0b. Unit checks for processUtils (Windows quoting, missing binary false-positive guard, env merge)
    assert.equal(
      stripOuterQuotes('  "C:\\Program Files\\nodejs\\npx.cmd"  '),
      'C:\\Program Files\\nodejs\\npx.cmd'
    );
    const missingProbe = await checkBinary('nonexistent-binary-definitely-missing-xyz');
    assert.equal(missingProbe.installed, false, 'Missing binary must report installed: false');
    if (process.platform === 'win32') {
      const envMerged = mergePlatformEnv({ Path: 'C:\\SwitchboardTestBin' });
      const pathKeys = Object.keys(envMerged).filter((k) => k.toUpperCase() === 'PATH');
      assert.deepEqual(pathKeys, ['PATH'], 'Windows env merge must canonicalize to single PATH key');
      assert.equal(envMerged.PATH, 'C:\\SwitchboardTestBin');
    }
    console.log('[E2E] Verified processUtils quoting, missing binary detection, & env canonicalization');

    // 0c. Regression checks: malformed JSON (400) and control-char command rejection (400)
    const malformedJsonRes = await fetch(`http://127.0.0.1:${port}/api/servers`, {
      method: 'POST',
      headers: apiHeaders,
      body: '{"name": invalid',
    });
    assert.equal(malformedJsonRes.status, 400, 'Malformed JSON must return 400');

    const ctrlCharRes = await fetch(`http://127.0.0.1:${port}/api/servers`, {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify({ name: 'bad_ctrl', command: 'node\necho pwned', args: [] }),
    });
    assert.equal(ctrlCharRes.status, 400, 'Commands with control chars must be rejected');

    // 3. Toggle sample_stdio ON
    const onRes = await (
      await fetch(`http://127.0.0.1:${port}/api/servers/sample_stdio/toggle`, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({ enabled: true }),
      })
    ).json();
    assert.equal(onRes.server.status, 'connected');
    assert.equal(onRes.server.toolCount, 3);
    assert.ok(onRes.server.tokenEstimate > 0);
    const childPid = onRes.server.pid;
    console.log(`[E2E] Connected sample_stdio (PID=${childPid}, tools=${onRes.server.toolCount}, ~${onRes.server.tokenEstimate} tokens)`);

    // 4. Query /mcp via Streamable HTTP (initialize -> tools/list -> tools/call -> prompts -> resources)
    const init = await mcpRpc(port, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'e2e-verifier', version: '1.0.0' },
      },
    });
    assert.equal(init.status, 200);
    assert.equal(init.json?.result?.serverInfo?.title, 'MCP Switchboard');
    const serverIcons = init.json?.result?.serverInfo?.icons;
    assert.ok(Array.isArray(serverIcons) && serverIcons.length >= 2, 'Expected serverInfo.icons array');
    assert.match(serverIcons[0].src, /^data:image\/png;base64,/);
    assert.equal(serverIcons[0].mimeType, 'image/png');

    // 4a. Verify JSON-only Accept header compatibility (clients without text/event-stream)
    const jsonOnlyInit = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 10,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'json-only', version: '1.0' } },
      }),
    });
    assert.equal(jsonOnlyInit.status, 200);
    const jsonOnlyPayload = await jsonOnlyInit.json();
    assert.equal(jsonOnlyPayload?.result?.serverInfo?.name, 'mcp-switchboard');

    const list = await mcpRpc(
      port,
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      init.sessionId
    );
    const toolNames = (list.json?.result?.tools || []).map((t) => t.name);
    assert.ok(toolNames.includes('sample_stdio__echo'), `Expected sample_stdio__echo in ${toolNames}`);
    assert.ok(toolNames.includes('sample_stdio__system_time'));
    const boundedLongTool = toolNames.find((n) => n.startsWith('sample_stdio__very_long_tool_name'));
    assert.ok(boundedLongTool && boundedLongTool.length <= 64, `Expected bounded tool <= 64 chars, got ${boundedLongTool}`);

    const longCall = await mcpRpc(
      port,
      { jsonrpc: '2.0', id: 21, method: 'tools/call', params: { name: boundedLongTool, arguments: {} } },
      init.sessionId
    );
    assert.equal(longCall.json?.result?.content?.[0]?.text, 'long-tool-ok');

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

    // 4b. Verify Prompts & Resources multiplexing
    const promptsList = await mcpRpc(port, { jsonrpc: '2.0', id: 31, method: 'prompts/list', params: {} }, init.sessionId);
    assert.equal(promptsList.json?.result?.prompts?.[0]?.name, 'sample_stdio__greet');
    const promptGet = await mcpRpc(
      port,
      { jsonrpc: '2.0', id: 32, method: 'prompts/get', params: { name: 'sample_stdio__greet', arguments: { name: 'Ada' } } },
      init.sessionId
    );
    assert.match(promptGet.json?.result?.messages?.[0]?.content?.text || '', /Hello Ada!/);

    const resourcesList = await mcpRpc(port, { jsonrpc: '2.0', id: 33, method: 'resources/list', params: {} }, init.sessionId);
    assert.equal(resourcesList.json?.result?.resources?.[0]?.uri, 'sample://info');
    const resourceRead = await mcpRpc(
      port,
      { jsonrpc: '2.0', id: 34, method: 'resources/read', params: { uri: 'sample://info' } },
      init.sessionId
    );
    assert.equal(resourceRead.json?.result?.contents?.[0]?.text, '{"ok":true}');

    // 4c. Verify legacy HTTP+SSE transport (GET /sse + POST /messages)
    const sseAbort = new AbortController();
    const sseRes = await fetch(`http://127.0.0.1:${port}/sse`, { signal: sseAbort.signal });
    assert.equal(sseRes.status, 200);
    const sseReader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    let messagesEndpoint = null;
    while (!messagesEndpoint) {
      const { value, done } = await sseReader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      const match = sseBuffer.match(/event: endpoint\s+data: ([^\r\n]+)/);
      if (match) messagesEndpoint = match[1].trim();
    }
    assert.ok(messagesEndpoint && messagesEndpoint.startsWith('/messages?sessionId='));
    const sseSessionId = new URLSearchParams(messagesEndpoint.split('?')[1]).get('sessionId');
    const crossTransportRes = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Mcp-Session-Id': `sse:${sseSessionId}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 40, method: 'tools/list', params: {} }),
    });
    assert.equal(crossTransportRes.status, 404);
    const ssePostRes = await fetch(`http://127.0.0.1:${port}${messagesEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 41,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'legacy-sse', version: '1.0' } },
      }),
    });
    assert.equal(ssePostRes.status, 202);
    sseAbort.abort();

    // 4d. Verify --stdio bridge mode against running Switchboard HTTP server
    await new Promise((resolve, reject) => {
      const bridge = spawn(process.execPath, [path.join(__dirname, 'server.js'), '--stdio', '--url', `http://127.0.0.1:${port}/mcp`], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const timer = setTimeout(() => {
        bridge.kill('SIGTERM');
        reject(new Error('--stdio bridge test timed out'));
      }, 8000);
      const rl = readline.createInterface({ input: bridge.stdout });
      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line);
          if (msg.id === 100) {
            bridge.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
            bridge.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 101, method: 'tools/list', params: {} })}\n`);
          } else if (msg.id === 101) {
            const bridgedTools = (msg.result?.tools || []).map((t) => t.name);
            assert.ok(bridgedTools.includes('sample_stdio__echo'));
            clearTimeout(timer);
            rl.close();
            bridge.kill('SIGTERM');
            resolve();
          }
        } catch {}
      });
      bridge.stdin.write(`${JSON.stringify({
        jsonrpc: '2.0',
        id: 100,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'stdio-bridge-test', version: '1.0' } },
      })}\n`);
    });

    console.log('[E2E] Verified /mcp (JSON & SSE), legacy /sse, prompts/resources, & --stdio bridge');

    // 4e. Verify optional Bearer token enforcement on /mcp and /sse
    const bearerSecret = 'switchboard-e2e-bearer-secret-1234';
    const enableAuthRes = await fetch(`http://127.0.0.1:${port}/api/settings`, {
      method: 'PATCH',
      headers: apiHeaders,
      body: JSON.stringify({ mcpAuthToken: bearerSecret }),
    });
    assert.equal(enableAuthRes.status, 200);

    const unauthMcp = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 200, method: 'tools/list', params: {} }),
    });
    assert.equal(unauthMcp.status, 401);

    const unauthSse = await fetch(`http://127.0.0.1:${port}/sse`);
    assert.equal(unauthSse.status, 401);

    const authedMcp = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${bearerSecret}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 201, method: 'tools/list', params: {} }),
    });
    assert.equal(authedMcp.status, 200);
    const authedJson = await authedMcp.json();
    assert.ok((authedJson?.result?.tools || []).length >= 3);

    await fetch(`http://127.0.0.1:${port}/api/settings`, {
      method: 'PATCH',
      headers: apiHeaders,
      body: JSON.stringify({ mcpAuthToken: '' }),
    });
    console.log('[E2E] Verified optional Bearer token protection on /mcp and /sse');

    // 5. Toggle sample_stdio OFF and confirm process termination + 0 tools
    const offRes = await (
      await fetch(`http://127.0.0.1:${port}/api/servers/sample_stdio/toggle`, {
        method: 'POST',
        headers: apiHeaders,
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

    // 6. Verify human-readable stderr failure replaces cryptic "-32000: Connection closed"
    await fetch(`http://127.0.0.1:${port}/api/servers`, {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify({
        name: 'failing_stdio',
        command: process.execPath,
        args: ['-e', 'console.error("Error: simulated fatal startup failure"); process.exit(1);'],
      }),
    });
    const failToggle = await (
      await fetch(`http://127.0.0.1:${port}/api/servers/failing_stdio/toggle`, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({ enabled: true }),
      })
    ).json();
    assert.equal(failToggle.server.status, 'error');
    assert.doesNotMatch(failToggle.server.error || '', /-32000/, 'Must replace raw -32000 with readable reason');
    assert.match(failToggle.server.error || '', /simulated fatal startup failure/);
    assert.ok((failToggle.server.lastErrorLogs || []).length > 0, 'Expected captured stderr tail');
    await fetch(`http://127.0.0.1:${port}/api/servers/failing_stdio`, { method: 'DELETE', headers: apiHeaders });

    // Missing binary server must return error + install hint cleanly
    await fetch(`http://127.0.0.1:${port}/api/servers`, {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify({
        name: 'missing_bin',
        command: 'nonexistent-binary-definitely-missing-xyz',
        args: [],
      }),
    });
    const missingToggle = await (
      await fetch(`http://127.0.0.1:${port}/api/servers/missing_bin/toggle`, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({ enabled: true }),
      })
    ).json();
    assert.equal(missingToggle.server.status, 'error');
    assert.match(missingToggle.server.error || '', /not found/i);
    assert.ok(missingToggle.server.installHint, 'Expected install hint for missing binary');
    await fetch(`http://127.0.0.1:${port}/api/servers/missing_bin`, { method: 'DELETE', headers: apiHeaders });
    console.log('[E2E] Verified human-readable crash errors & missing binary hints');

    // 7. Windows .cmd shim with spaces in path, outer quotes, and spaced args regression test
    if (process.platform === 'win32') {
      const spacedDir = path.join(tmpDir, 'dir with spaces');
      fs.mkdirSync(spacedDir, { recursive: true });
      const shimPath = path.join(spacedDir, 'mock-npx.cmd');
      fs.writeFileSync(shimPath, `@echo off\r\n"${process.execPath}" "${sampleScript}" %*\r\n`, 'utf8');

      await fetch(`http://127.0.0.1:${port}/api/servers`, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({
          name: 'win_cmd_spaces',
          command: `"${shimPath}"`,
          args: ['arg with spaces'],
          env: { Path: process.env.PATH },
        }),
      });
      const winOn = await (
        await fetch(`http://127.0.0.1:${port}/api/servers/win_cmd_spaces/toggle`, {
          method: 'POST',
          headers: apiHeaders,
          body: JSON.stringify({ enabled: true }),
        })
      ).json();
      assert.equal(winOn.server.status, 'connected', `Expected Windows .cmd shim to connect, got: ${winOn.server.error}`);
      assert.equal(winOn.server.toolCount, 3);

      const winCall = await mcpRpc(
        port,
        {
          jsonrpc: '2.0',
          id: 50,
          method: 'tools/call',
          params: { name: 'win_cmd_spaces__echo', arguments: { message: 'win-cmd-ok' } },
        },
        init.sessionId
      );
      assert.match(winCall.json?.result?.content?.[0]?.text || '', /win-cmd-ok/);

      const winOff = await (
        await fetch(`http://127.0.0.1:${port}/api/servers/win_cmd_spaces/toggle`, {
          method: 'POST',
          headers: apiHeaders,
          body: JSON.stringify({ enabled: false }),
        })
      ).json();
      assert.equal(winOff.server.status, 'off');
      await fetch(`http://127.0.0.1:${port}/api/servers/win_cmd_spaces`, { method: 'DELETE', headers: apiHeaders });
      console.log('[E2E] Verified Windows .cmd shim with spaces & outer quotes');
    }
  } finally {
    sidecar.kill('SIGTERM');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error('[E2E] FAIL:', err);
  process.exit(1);
});
