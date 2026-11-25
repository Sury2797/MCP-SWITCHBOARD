<script lang="ts">
  import { onDestroy } from 'svelte';
  import StreamlineIcon from '../lib/icons/StreamlineIcon.svelte';
  import ServerIcon from '../lib/icons/ServerIcon.svelte';
  import Switch from '../lib/primitives/Switch.svelte';
  import Button from '../lib/primitives/Button.svelte';
  import SegmentedControl from '../lib/primitives/SegmentedControl.svelte';
  import CountUp from '../lib/primitives/CountUp.svelte';
  import type { McpServerSnapshot } from '../lib/types';

  interface Props {
    servers?: McpServerSnapshot[];
    busyServers?: Record<string, boolean>;
    searchInputEl?: HTMLInputElement | null;
    onToggle?: (name: string, enable: boolean) => void;
    onAdd?: () => void;
    onEdit?: (server: McpServerSnapshot) => void;
    onDelete?: (server: McpServerSnapshot) => void;
    onInspectTools?: (server: McpServerSnapshot) => void;
    onViewLogs?: (server: McpServerSnapshot) => void;
    onNotify?: (message: string, type?: 'info' | 'error') => void;
  }

  let {
    servers = [],
    busyServers = {},
    searchInputEl = $bindable(null),
    onToggle = () => {},
    onAdd = () => {},
    onEdit = () => {},
    onDelete = () => {},
    onInspectTools = () => {},
    onViewLogs = () => {},
    onNotify = () => {},
  }: Props = $props();

  let query = $state('');
  let filterTab = $state<'all' | 'active' | 'stdio' | 'http'>('all');
  let copiedServer = $state<string | null>(null);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  onDestroy(() => {
    clearTimeout(copyTimer);
  });

  const isMac =
    typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent);

  function handleSearchKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (query) {
        e.stopPropagation();
        query = '';
      } else {
        searchInputEl?.blur();
      }
    }
  }

  const filterOptions = $derived([
    { value: 'all', label: 'All', count: servers.length },
    {
      value: 'active',
      label: 'Active',
      count: servers.filter((s) => s.status === 'connected' || s.status === 'starting').length,
    },
    {
      value: 'stdio',
      label: 'STDIO',
      count: servers.filter((s) => s.transport === 'stdio').length,
    },
    {
      value: 'http',
      label: 'HTTP',
      count: servers.filter((s) => s.transport !== 'stdio').length,
    },
  ]);

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return servers.filter((s) => {
      if (filterTab === 'active' && s.status !== 'connected' && s.status !== 'starting') return false;
      if (filterTab === 'stdio' && s.transport !== 'stdio') return false;
      if (filterTab === 'http' && s.transport === 'stdio') return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.command || '').toLowerCase().includes(q) ||
        (s.url || '').toLowerCase().includes(q)
      );
    });
  });

  function formatServerError(raw: string): string {
    const clean = raw.replace(/\s+/g, ' ').trim();
    if (/MCP error -32000:\s*Connection closed/i.test(clean)) {
      return 'Server exited before completing MCP handshake';
    }
    const withoutCode = clean.replace(/^MCP error -?\d+:\s*/i, '');
    return withoutCode.length > 130 ? `${withoutCode.slice(0, 127)}…` : withoutCode;
  }

  async function copyErrorDetails(server: McpServerSnapshot): Promise<void> {
    const text = server.installHint || server.error || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      copiedServer = server.name;
      onNotify(server.installHint ? 'Copied install command' : 'Copied error details');
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copiedServer = null;
      }, 1600);
    } catch {
      onNotify('Unable to access clipboard', 'error');
    }
  }
</script>

<section class="space-y-3">
  <!-- BoardUI Command Toolbar -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
    <div class="flex flex-col xs:flex-row xs:items-center gap-2 flex-1 min-w-0">
      <div class="relative flex-1 sm:max-w-xs">
        <StreamlineIcon
          name="Search"
          size={14}
          class="text-graphite-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        />
        <input
          bind:this={searchInputEl}
          type="text"
          bind:value={query}
          onkeydown={handleSearchKey}
          placeholder="Filter servers or commands…"
          aria-label="Filter MCP servers"
          class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 pl-9 pr-14 text-xs text-graphite-900 dark:text-graphite-100 placeholder:text-graphite-400 dark:placeholder:text-graphite-500 shadow-xs focus:border-graphite-900 dark:focus:border-white/50 focus:ring-2 focus:ring-graphite-900/15 dark:focus:ring-white/15 focus:outline-none transition-colors duration-200"
        />
        {#if query}
          <button
            type="button"
            onclick={() => (query = '')}
            aria-label="Clear filter"
            class="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded flex items-center justify-center text-graphite-400 hover:text-graphite-700 dark:hover:text-graphite-200 hover:bg-graphite-100 dark:hover:bg-graphite-800 transition-colors duration-200"
          >
            <StreamlineIcon name="X" size={11} />
          </button>
        {:else}
          <kbd class="hidden sm:inline-flex items-center absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded border border-graphite-200 dark:border-graphite-800 bg-graphite-50 dark:bg-graphite-900 font-mono text-[10px] text-graphite-500 dark:text-graphite-400 pointer-events-none">
            {isMac ? '⌘ F' : 'Ctrl F'}
          </kbd>
        {/if}
      </div>

      <div class="shrink-0 overflow-x-auto">
        <SegmentedControl
          options={filterOptions}
          value={filterTab}
          onchange={(v) => (filterTab = v as 'all' | 'active' | 'stdio' | 'http')}
        />
      </div>
    </div>

    <Button variant="primary" size="sm" onclick={onAdd} class="shrink-0">
      <StreamlineIcon name="Plus" size={13} />
      <span>Add MCP</span>
    </Button>
  </div>

  <!-- Switchboard Table / Rows -->
  {#if servers.length === 0}
    <div class="board-surface rounded-2xl border border-dashed border-graphite-300 dark:border-graphite-800 px-6 py-12 text-center space-y-2.5">
      <p class="text-sm font-semibold text-graphite-950 dark:text-graphite-50">
        No MCP servers configured
      </p>
      <p class="text-xs text-graphite-600 dark:text-graphite-400 max-w-lg mx-auto leading-relaxed">
        Paste any MCP config snippet from Antigravity, Claude Desktop, Cursor, VS Code, Windsurf, or Zed to register local STDIO or remote HTTP/SSE servers in one click.
      </p>
      <p class="font-mono text-[10.5px] text-graphite-500 dark:text-graphite-400 max-w-lg mx-auto">
        %APPDATA%\Claude · ~/Library/Application Support/Claude · ~/.config/zed · ~/.cursor/mcp.json
      </p>
      <div class="pt-2">
        <Button variant="primary" size="sm" onclick={onAdd}>
          <StreamlineIcon name="Plus" size={13} />
          <span>Paste MCP JSON</span>
        </Button>
      </div>
    </div>
  {:else if filtered.length === 0}
    <div
      role="status"
      aria-live="polite"
      class="board-surface rounded-2xl border border-graphite-200/80 dark:border-white/[0.08] p-8 text-center space-y-2.5"
    >
      <p class="text-xs text-graphite-600 dark:text-graphite-400">
        No servers match {query.trim() ? `"${query.trim()}"` : 'this filter'}.
      </p>
      <Button
        variant="ghost"
        size="xs"
        onclick={() => {
          query = '';
          filterTab = 'all';
        }}
      >
        Reset filter
      </Button>
    </div>
  {:else}
    <div
      role="list"
      aria-label="MCP servers"
      class="board-surface divide-y divide-graphite-200/80 dark:divide-white/[0.06] rounded-2xl border border-graphite-200/80 dark:border-white/[0.08] overflow-hidden"
    >
      {#each filtered as server (server.name)}
        {@const isConnected = server.status === 'connected'}
        {@const isStarting = server.status === 'starting'}
        {@const isError = server.status === 'error'}
        {@const isBusy = Boolean(busyServers[server.name]) || isStarting}
        {@const isOn = isConnected || isStarting}
        {@const transportLabel = server.transport === 'stdio' ? 'STDIO' : 'HTTP'}
        {@const commandPreview = server.transport === 'stdio'
          ? `${server.command} ${(server.args || []).join(' ')}`.trim()
          : server.url}

        <div
          role="listitem"
          class="px-4 sm:px-6 py-3.5 sm:py-4 transition-colors duration-200 hover:bg-graphite-50/90 dark:hover:bg-white/[0.03]"
        >
          <div class="flex items-start sm:items-center justify-between gap-3 sm:gap-4">
            <!-- Left: Server Icon + Status dot + Identity + Command -->
            <div class="min-w-0 flex-1 flex items-start sm:items-center gap-3.5">
              <div class="relative shrink-0">
                {#if isStarting}
                  <span
                    aria-hidden="true"
                    class="connect-ring-pulse pointer-events-none absolute -inset-1 rounded-[14px] border border-amber-500/55 dark:border-amber-400/50"
                  ></span>
                {/if}
                <div
                  class="relative flex h-10 w-10 items-center justify-center rounded-xl border transition-[border-color,background-color,box-shadow,color] duration-200 {isConnected
                    ? 'border-emerald-500/35 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-400 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]'
                    : isStarting
                      ? 'border-amber-500/45 bg-amber-500/[0.1] text-amber-700 dark:text-amber-400'
                      : isError
                        ? 'border-rose-500/35 bg-rose-500/[0.08] text-rose-600 dark:text-rose-400'
                        : 'border-graphite-200/80 dark:border-white/[0.09] bg-graphite-100/70 dark:bg-white/[0.05] text-graphite-600 dark:text-graphite-300'}"
                >
                  <ServerIcon name={server.name} command={server.command} url={server.url} size={20} />
                </div>
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 sm:gap-2.5 flex-wrap">
                  <span
                    title={server.status}
                    class="h-1.5 w-1.5 rounded-full shrink-0 {isConnected
                      ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]'
                      : isStarting
                        ? 'bg-amber-400 status-starting'
                        : isError
                          ? 'bg-rose-500'
                          : 'bg-graphite-400 dark:bg-graphite-600'}"
                  ></span>

                  <span class="text-[13.5px] sm:text-[14.5px] font-semibold tracking-[-0.01em] text-graphite-950 dark:text-graphite-50 truncate">
                    {server.name}
                  </span>

                  <!-- Monochrome transport badge -->
                  <span
                    class="rounded-md border border-graphite-200 dark:border-white/[0.1] bg-graphite-100/80 dark:bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] sm:text-[10.5px] font-medium text-graphite-700 dark:text-graphite-300"
                  >
                    {transportLabel}
                  </span>

                  {#if isConnected}
                    <span class="text-xs sm:text-[13px] font-mono text-graphite-600 dark:text-graphite-300 tabular-nums">
                      {server.toolCount} {server.toolCount === 1 ? 'tool' : 'tools'} · <CountUp value={server.tokenEstimate} prefix="~" suffix=" tok" />
                    </span>
                  {:else if isStarting}
                    <span
                      class="connect-shimmer relative inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 dark:border-amber-400/25 bg-amber-500/[0.08] px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
                    >
                      <span class="h-2.5 w-2.5 rounded-full border-[1.5px] border-amber-500/25 border-t-amber-600 dark:border-amber-400/25 dark:border-t-amber-300 connect-arc-spin"></span>
                      <span>Connecting…</span>
                    </span>
                  {:else if server.status === 'off'}
                    <span class="text-xs text-graphite-400 dark:text-graphite-500 tabular-nums">
                      Idle · 0 tok
                    </span>
                  {/if}
                </div>

                <p
                  title={commandPreview}
                  class="mt-1 font-mono text-xs text-graphite-500 dark:text-graphite-400 truncate"
                >
                  {commandPreview}
                </p>
              </div>
            </div>

            <!-- Right: Streamline Action Icons + Status Switch -->
            <div class="flex items-center gap-1 shrink-0 pt-0.5 sm:pt-0">
              <Button
                variant="ghost"
                size="xs"
                disabled={!isConnected}
                onclick={() => onInspectTools(server)}
                title="Inspect tools"
                aria-label="Inspect tools for {server.name}"
              >
                <StreamlineIcon name="Wrench" size={13} />
                <span class="hidden lg:inline">Tools</span>
              </Button>

              <Button
                variant="ghost"
                size="xs"
                onclick={() => onViewLogs(server)}
                title="View logs"
                aria-label="View logs for {server.name}"
              >
                <StreamlineIcon name="Terminal" size={13} />
                <span class="hidden lg:inline">Logs</span>
              </Button>

              <Button
                variant="ghost"
                size="xs"
                iconOnly
                onclick={() => onEdit(server)}
                title="Edit server"
                aria-label="Edit {server.name}"
              >
                <StreamlineIcon name="Edit3" size={13} />
              </Button>

              <Button
                variant="ghost"
                size="xs"
                iconOnly
                onclick={() => onDelete(server)}
                title="Delete server"
                aria-label="Delete {server.name}"
                class="hover:!text-rose-500 hover:!bg-rose-500/10"
              >
                <StreamlineIcon name="Trash2" size={13} />
              </Button>

              <div class="h-4 w-px bg-graphite-200 dark:bg-white/[0.1] mx-1 sm:mx-1.5"></div>

              <Switch
                checked={isOn}
                starting={isStarting}
                error={isError}
                disabled={isBusy}
                label="Toggle {server.name} {isOn ? 'off' : 'on'}"
                onchange={(next) => onToggle(server.name, next)}
              />
            </div>
          </div>

          <!-- Compact Inline Error Strip -->
          {#if isError && server.error}
            <div
              role="alert"
              class="mt-2.5 sm:ml-[54px] flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 rounded-lg border border-rose-500/25 dark:border-rose-400/20 bg-rose-500/[0.04] dark:bg-rose-500/[0.06] px-3 py-1.5 text-xs"
            >
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <StreamlineIcon name="AlertCircle" size={13} class="text-rose-600 dark:text-rose-400 shrink-0" />
                <p
                  title={server.error}
                  class="text-[11.5px] font-medium text-graphite-800 dark:text-graphite-200 leading-snug truncate"
                >
                  {formatServerError(server.error)}
                </p>
                {#if server.installHint}
                  <code
                    title={server.installHint}
                    class="hidden md:inline-block max-w-[220px] truncate rounded bg-graphite-950/[0.05] dark:bg-white/[0.07] px-1.5 py-0.5 font-mono text-[10.5px] text-graphite-700 dark:text-graphite-300 select-all shrink-0"
                  >
                    {server.installHint}
                  </code>
                {/if}
              </div>

              <div class="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onclick={() => void copyErrorDetails(server)}
                  title={server.installHint ? 'Copy install command' : 'Copy error message'}
                  class="inline-flex h-7 items-center gap-1 rounded-md border border-graphite-950/[0.08] dark:border-white/[0.1] bg-white/80 dark:bg-white/[0.06] px-2 text-[11px] font-medium text-graphite-700 dark:text-graphite-200 hover:bg-white dark:hover:bg-white/[0.12] transition-colors active:scale-[0.97]"
                >
                  <StreamlineIcon name={copiedServer === server.name ? 'Check' : 'Copy'} size={11} />
                  <span>{copiedServer === server.name ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onclick={() => onToggle(server.name, true)}
                  title="Retry connecting server"
                  class="inline-flex h-7 items-center gap-1 rounded-md border border-graphite-950/[0.08] dark:border-white/[0.1] bg-white/80 dark:bg-white/[0.06] px-2 text-[11px] font-medium text-graphite-700 dark:text-graphite-200 hover:bg-white dark:hover:bg-white/[0.12] transition-colors active:scale-[0.97] disabled:opacity-40"
                >
                  <StreamlineIcon name="RefreshCw" size={11} />
                  <span>Retry</span>
                </button>
                <button
                  type="button"
                  onclick={() => onViewLogs(server)}
                  title="View server logs"
                  class="inline-flex h-7 items-center gap-1 rounded-md border border-graphite-950/[0.08] dark:border-white/[0.1] bg-white/80 dark:bg-white/[0.06] px-2 text-[11px] font-medium text-graphite-700 dark:text-graphite-200 hover:bg-white dark:hover:bg-white/[0.12] transition-colors active:scale-[0.97]"
                >
                  <StreamlineIcon name="Terminal" size={11} />
                  <span>View Log</span>
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>
