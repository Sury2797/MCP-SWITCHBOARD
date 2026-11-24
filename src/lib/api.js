let baseUrl = 'http://127.0.0.1:8000';
let controlToken = '';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Robustly discover and verify the active sidecar HTTP base URL.
 * Polls with retries so startup race conditions (Node.js engine initializing)
 * never throw a false-positive connection failure.
 */
export async function discoverSidecarBaseUrl({ maxAttempts = 35, intervalMs = 250 } = {}) {
  const isTauri = typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    // 1. If running in Tauri, check Rust shell for spawn failure, session token, and ready port
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const spawnError = await invoke('get_sidecar_error');
        if (spawnError) {
          throw new Error(spawnError);
        }
        if (!controlToken) {
          controlToken = (await invoke('get_sidecar_token')) || '';
        }
        const port = await invoke('get_sidecar_port');
        if (port && Number(port) >= 8000) {
          const candidate = `http://127.0.0.1:${port}`;
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 600);
            const res = await fetch(`${candidate}/health`, { signal: controller.signal });
            clearTimeout(timer);
            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              if (data?.service === 'mcp-switchboard') {
                baseUrl = candidate;
                return baseUrl;
              }
            }
          } catch {
            // Port reported but socket still finalizing; continue retry
          }
        }
      } catch (err) {
        if (err?.message && /node\.js|sidecar script/i.test(err.message)) {
          throw err;
        }
        // Fall through to probe
      }
    }

    // 2. Direct probe candidate ports (8000..8010)
    for (let port = 8000; port <= 8010; port += 1) {
      const candidate = `http://127.0.0.1:${port}`;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 500);
        const res = await fetch(`${candidate}/health`, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data?.service === 'mcp-switchboard') {
            baseUrl = candidate;
            return baseUrl;
          }
        }
      } catch {
        // Continue checking
      }
    }

    // Wait before next retry iteration
    await sleep(intervalMs);
  }

  throw new Error('Unable to connect to MCP Switchboard engine. The background process did not respond in time.');
}

export function getSidecarBaseUrl() {
  return baseUrl;
}

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(controlToken ? { 'X-Switchboard-Token': controlToken } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  getState: () => request('/api/state'),
  importJson: (jsonText) =>
    request('/api/servers/import', { method: 'POST', body: JSON.stringify({ jsonText }) }),
  saveServer: (payload) =>
    request('/api/servers', { method: 'POST', body: JSON.stringify(payload) }),
  deleteServer: (name) =>
    request(`/api/servers/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  toggleServer: (name, enabled) =>
    request(`/api/servers/${encodeURIComponent(name)}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
  getServerTools: (name) =>
    request(`/api/servers/${encodeURIComponent(name)}/tools`),
  getServerLogs: (name) =>
    request(`/api/servers/${encodeURIComponent(name)}/logs`),
  clearServerLogs: (name) =>
    request(`/api/servers/${encodeURIComponent(name)}/logs`, { method: 'DELETE' }),
  startTunnel: () => request('/api/tunnel/start', { method: 'POST' }),
  stopTunnel: () => request('/api/tunnel/stop', { method: 'POST' }),
  getTunnelLogs: () => request('/api/tunnel/logs'),
  updateSettings: (patch) =>
    request('/api/settings', { method: 'PATCH', body: JSON.stringify(patch) }),
  getDiagnostics: () => request('/api/diagnostics'),
};

export function subscribeEvents({ onState, onLog, onTunnelLog, onError }) {
  const sseUrl = controlToken
    ? `${baseUrl}/api/events?token=${encodeURIComponent(controlToken)}`
    : `${baseUrl}/api/events`;
  const es = new EventSource(sseUrl);
  es.addEventListener('state', (e) => {
    try { onState?.(JSON.parse(e.data)); } catch {}
  });
  es.addEventListener('log', (e) => {
    try { onLog?.(JSON.parse(e.data)); } catch {}
  });
  es.addEventListener('tunnelLog', (e) => {
    try { onTunnelLog?.(JSON.parse(e.data)); } catch {}
  });
  es.onerror = () => {
    onError?.();
  };
  return () => es.close();
}
