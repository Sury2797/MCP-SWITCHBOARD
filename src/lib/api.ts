import type {
  AppState,
  DiagnosticsReport,
  LiveLogEvent,
  LogEntry,
  McpServerSnapshot,
  ServerSavePayload,
  ServerTool,
  SwitchboardSettings,
  TunnelState,
} from './types';

let baseUrl = 'http://127.0.0.1:8000';
let controlToken = '';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface DiscoverOptions {
  maxAttempts?: number;
  intervalMs?: number;
}

async function probeSidecarPort(port: number, timeoutMs = 260, verifyAuth = false): Promise<string | null> {
  const candidate = `http://127.0.0.1:${port}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${candidate}/health`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { service?: string };
    if (data?.service !== 'mcp-switchboard') return null;
    if (verifyAuth) {
      const stateRes = await fetch(`${candidate}/api/state`, {
        signal: controller.signal,
        headers: controlToken ? { 'X-Switchboard-Token': controlToken } : {},
      });
      if (!stateRes.ok) return null;
    }
    return candidate;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function scanFallbackPorts(): Promise<string | null> {
  try {
    return await Promise.any(
      Array.from({ length: 11 }, (_, idx) => 8000 + idx).map(async (port) => {
        const hit = await probeSidecarPort(port, 300, true);
        if (!hit) throw new Error('miss');
        return hit;
      })
    );
  } catch {
    return null;
  }
}

/**
 * Robustly discover and verify the active sidecar HTTP base URL.
 * Uses direct Tauri port handoff first and parallel loopback fallback so UI connects in milliseconds.
 */
export async function discoverSidecarBaseUrl({
  maxAttempts = 45,
  intervalMs = 90,
}: DiscoverOptions = {}): Promise<string> {
  const isTauri = typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const spawnError = await invoke<string | null>('get_sidecar_error');
        if (spawnError) {
          throw new Error(spawnError);
        }
        if (!controlToken) {
          controlToken = (await invoke<string>('get_sidecar_token')) || '';
        }
        const port = await invoke<number>('get_sidecar_port');
        if (port && Number(port) >= 8000) {
          const hit = await probeSidecarPort(Number(port), 350, false);
          if (hit) {
            baseUrl = hit;
            return baseUrl;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg && /node\.js|sidecar script/i.test(msg)) {
          throw new Error(msg);
        }
      }
    }

    // Outside Tauri (or after initial Tauri wait ticks), probe 8000 first then fan out in parallel
    if (!isTauri || attempt >= 8) {
      const hit8000 = await probeSidecarPort(8000, 260, true);
      if (hit8000) {
        baseUrl = hit8000;
        return baseUrl;
      }
      const fallbackHit = await scanFallbackPorts();
      if (fallbackHit) {
        baseUrl = fallbackHit;
        return baseUrl;
      }
    }

    await sleep(attempt < 8 ? intervalMs : Math.min(220, intervalMs + attempt * 10));
  }

  throw new Error('Unable to connect to MCP Switchboard engine. The background process did not respond in time.');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const customHeaders =
    options.headers && !(options.headers instanceof Headers) && !Array.isArray(options.headers)
      ? options.headers
      : {};
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(controlToken ? { 'X-Switchboard-Token': controlToken } : {}),
      ...customHeaders,
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  getState: () => request<AppState>('/api/state'),
  importJson: (jsonText: string) =>
    request<{ ok: boolean; imported: string[]; state: AppState }>('/api/servers/import', {
      method: 'POST',
      body: JSON.stringify({ jsonText }),
    }),
  saveServer: (payload: ServerSavePayload) =>
    request<{ ok: boolean; server: { name: string }; state: AppState }>('/api/servers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteServer: (name: string) =>
    request<{ ok: boolean; state: AppState }>(`/api/servers/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
  toggleServer: (name: string, enabled: boolean) =>
    request<{ ok: boolean; server: McpServerSnapshot; state: AppState }>(
      `/api/servers/${encodeURIComponent(name)}/toggle`,
      {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      }
    ),
  getServerTools: (name: string) =>
    request<{ server: string; tools: ServerTool[] }>(`/api/servers/${encodeURIComponent(name)}/tools`),
  getServerLogs: (name: string) =>
    request<{ server: string; logs: LogEntry[] }>(`/api/servers/${encodeURIComponent(name)}/logs`),
  clearServerLogs: (name: string) =>
    request<{ ok: boolean }>(`/api/servers/${encodeURIComponent(name)}/logs`, {
      method: 'DELETE',
    }),
  startTunnel: () =>
    request<{ ok: boolean; tunnel: TunnelState; state: AppState }>('/api/tunnel/start', {
      method: 'POST',
    }),
  stopTunnel: () =>
    request<{ ok: boolean; tunnel: TunnelState; state: AppState }>('/api/tunnel/stop', {
      method: 'POST',
    }),
  updateSettings: (patch: Partial<SwitchboardSettings>) =>
    request<{ ok: boolean; settings: SwitchboardSettings; state: AppState }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  getDiagnostics: () => request<DiagnosticsReport>('/api/diagnostics'),
};

export interface SseSubscriptionHandlers {
  onState?: (nextState: AppState) => void;
  onLog?: (payload: LiveLogEvent) => void;
  onError?: () => void;
}

export function subscribeEvents({
  onState,
  onLog,
  onError,
}: SseSubscriptionHandlers): () => void {
  const sseUrl = controlToken
    ? `${baseUrl}/api/events?token=${encodeURIComponent(controlToken)}`
    : `${baseUrl}/api/events`;
  const es = new EventSource(sseUrl);
  es.addEventListener('state', (e) => {
    try {
      onState?.(JSON.parse((e as MessageEvent<string>).data) as AppState);
    } catch {}
  });
  es.addEventListener('log', (e) => {
    try {
      onLog?.(JSON.parse((e as MessageEvent<string>).data) as LiveLogEvent);
    } catch {}
  });
  es.onerror = () => {
    onError?.();
  };
  return () => es.close();
}
