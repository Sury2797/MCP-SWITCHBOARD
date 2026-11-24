import type { STREAMLINE_ICONS } from './icons/streamlineData';

export type IconName = keyof typeof STREAMLINE_ICONS;
export type ThemeMode = 'dark' | 'light';
export type TransportType = 'stdio' | 'streamableHttp' | 'sse';
export type ServerStatus = 'off' | 'starting' | 'connected' | 'error';
export type TunnelMode = 'quick' | 'named';
export type TunnelStatus = 'offline' | 'starting' | 'live' | 'error';

export interface SwitchboardSettings {
  port: number;
  theme: ThemeMode;
  tunnelMode: TunnelMode;
  autoStartTunnel: boolean;
  namedTunnelToken: string;
  namedTunnelName: string;
  namedTunnelDomain: string;
}

export interface TunnelState {
  status: TunnelStatus;
  mode: TunnelMode;
  publicUrl: string | null;
  localUrl: string;
  error: string | null;
  installHint: string | null;
  pid: number | null;
}

export interface LogEntry {
  ts: string;
  stream: string;
  line: string;
}

export interface McpServerSnapshot {
  name: string;
  transport: TransportType;
  command: string | null;
  args: string[];
  env: Record<string, string>;
  url: string | null;
  headers: Record<string, string>;
  preset: boolean;
  enabled: boolean;
  status: ServerStatus;
  pid: number | null;
  toolCount: number;
  tokenEstimate: number;
  error: string | null;
  installHint: string | null;
  lastErrorLogs: LogEntry[];
  connectedAt: string | null;
}

export interface SwitchboardTotals {
  activeServers: number;
  totalServers: number;
  totalTools: number;
  totalTokens: number;
}

export interface AppState {
  port: number;
  configPath: string;
  settings: SwitchboardSettings;
  tunnel: TunnelState;
  servers: McpServerSnapshot[];
  totals: SwitchboardTotals;
}

export interface ServerSavePayload {
  name: string;
  originalName?: string | null;
  transport: TransportType;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface ToolSchemaProperty {
  type?: string;
  description?: string;
}

export interface ServerTool {
  name: string;
  originalName: string;
  description: string;
  inputSchema: {
    type?: string;
    properties?: Record<string, ToolSchemaProperty>;
    required?: string[];
  };
  tokenEstimate: number;
}

export interface DiagnosticItem {
  id: string;
  label: string;
  role: string;
  installed: boolean;
  version: string | null;
  installCommand: string;
}

export interface DiagnosticsReport {
  platform: string;
  arch: string;
  nodeVersion: string;
  checkedAt: string;
  items: DiagnosticItem[];
}

export interface LiveLogEvent {
  server: string;
  entry: LogEntry;
}

export interface ToastMessage {
  message: string;
  type: 'info' | 'error';
  id: number;
}

export interface UpdateCheckResult {
  status: 'available' | 'latest' | 'error' | 'unsupported';
  version?: string;
  currentVersion?: string;
  date?: string;
  body?: string;
  message?: string;
  error?: string;
}

export interface UpdateProgress {
  percent: number;
  downloaded: number;
  total: number;
}
