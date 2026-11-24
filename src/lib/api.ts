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

/**
 * Robustly discover and verify the active sidecar HTTP base URL.
 * Polls with retries so startup race conditions never throw a false-positive failure.
 */
export async function discoverSidecarBaseUrl({
  maxAttempts = 35,
  intervalMs = 250,
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
          const candidate = `http://127.0.0.1:${port}`;
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 600);
            const res = await fetch(`${candidate}/health`, { signal: controller.signal });
            clearTimeout(timer);
            if (res.ok) {
              const data = (await res.json().catch(() => ({}))) as { service?: string };
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
        const msg = err instanceof Error ? err.message : String(err);
        if (msg && /node\.js|sidecar script/i.test(msg)) {
          throw new Error(msg);
        }
      }
    }

    for (let port = 8000; port <= 8010; port += 1) {
      const candidate = `http://127.0.0.1:${port}`;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 500);
        const res = await fetch(`${candidate}/health`, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as { service?: string };
          if (data?.service === 'mcp-switchboard') {
            baseUrl = candidate;
            return baseUrl;
          }
        }
      } catch {
        // Continue checking
      }
    }

    await sleep(intervalMs);
  }

  throw new Error('Unable to connect to MCP Switchboard engine. The background process did not respond in time.');
}

export function getSidecarBaseUrl(): string {
  return baseUrl;
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
  getTunnelLogs: () => request<{ logs: LogEntry[] }>('/api/tunnel/logs'),
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
  onTunnelLog?: (entry: LogEntry) => void;
  onError?: () => void;
}

export function subscribeEvents({
  onState,
  onLog,
  onTunnelLog,
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
  es.addEventListener('tunnelLog', (e) => {
    try {
      onTunnelLog?.(JSON.parse((e as MessageEvent<string>).data) as LogEntry);
    } catch {}
  });
  es.onerror = () => {
    onError?.();
  };
  return () => es.close();
}
