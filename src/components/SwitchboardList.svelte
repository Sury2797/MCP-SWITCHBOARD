<script lang="ts">
  import StreamlineIcon from '../lib/icons/StreamlineIcon.svelte';
  import Switch from '../lib/primitives/Switch.svelte';
  import Button from '../lib/primitives/Button.svelte';
  import SegmentedControl from '../lib/primitives/SegmentedControl.svelte';
  import CountUp from '../lib/primitives/CountUp.svelte';
  import { spotlight } from '../lib/primitives/spotlight';
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

  async function copyHint(hint: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(hint);
      onNotify('Copied install command');
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
          placeholder="Filter servers or commands…"
          aria-label="Filter MCP servers"
          class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 pl-9 pr-14 text-xs text-graphite-900 dark:text-graphite-100 placeholder:text-graphite-400 dark:placeholder:text-graphite-500 shadow-xs focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 focus:outline-none transition-colors"
        />
        {#if query}
          <button
            type="button"
            onclick={() => (query = '')}
            aria-label="Clear filter"
            class="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded flex items-center justify-center text-graphite-400 hover:text-graphite-700 dark:hover:text-graphite-200 hover:bg-graphite-100 dark:hover:bg-graphite-800 transition-colors"
          >
            <StreamlineIcon name="X" size={11} />
          </button>
        {:else}
          <kbd class="hidden sm:inline-flex items-center absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded border border-graphite-200 dark:border-graphite-800 bg-graphite-50 dark:bg-graphite-900 font-mono text-[10px] text-graphite-400 dark:text-graphite-500 pointer-events-none">
            Ctrl F
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
    <div class="board-surface rounded-xl border border-dashed border-graphite-300 dark:border-graphite-800 bg-white dark:bg-graphite-900/60 px-6 py-12 text-center">
      <p class="text-sm font-medium text-graphite-900 dark:text-graphite-100">
        No MCP servers configured
      </p>
      <p class="mt-1.5 text-xs text-graphite-500 dark:text-graphite-400 max-w-md mx-auto">
        Paste any standard <code class="font-mono">mcpServers</code> JSON snippet from GitHub or MCP Market to register local STDIO or remote HTTP servers in one click.
      </p>
      <div class="mt-4">
        <Button variant="primary" size="sm" onclick={onAdd}>
          <StreamlineIcon name="Plus" size={13} />
          <span>Paste mcpServers JSON</span>
        </Button>
      </div>
    </div>
  {:else if filtered.length === 0}
    <div class="board-surface rounded-xl border border-graphite-200 dark:border-graphite-800 bg-white dark:bg-graphite-900/60 p-8 text-center space-y-2.5">
      <p class="text-xs text-graphite-500 dark:text-graphite-400">
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
    <div class="board-surface divide-y divide-graphite-200 dark:divide-graphite-800/90 rounded-xl border border-graphite-200 dark:border-graphite-800 bg-white dark:bg-graphite-900 overflow-hidden">
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
          use:spotlight
          class="px-4 sm:px-6 py-3 sm:py-3.5 transition-colors hover:bg-graphite-50/80 dark:hover:bg-graphite-850/70"
        >
          <div class="flex items-start sm:items-center justify-between gap-3 sm:gap-4">
            <!-- Left: Status dot + Identity + Command -->
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 sm:gap-2.5 flex-wrap">
                <span
                  title={server.status}
                  class="h-2.5 w-2.5 rounded-full shrink-0 {isConnected
                    ? 'bg-emerald-500'
                    : isStarting
                      ? 'bg-amber-400 status-starting'
                      : isError
                        ? 'bg-rose-500'
                        : 'bg-graphite-400 dark:bg-graphite-600'}"
                ></span>

                <span class="text-[13.5px] sm:text-[14.5px] font-semibold tracking-[-0.01em] text-graphite-950 dark:text-graphite-50 truncate">
                  {server.name}
                </span>

                <span
                  class="rounded-md px-2 py-0.5 font-mono text-[10px] sm:text-[10.5px] font-medium {server.transport === 'stdio'
                    ? 'bg-graphite-100 text-graphite-600 dark:bg-graphite-800 dark:text-graphite-400'
                    : 'bg-sky-500/10 text-sky-700 dark:text-sky-400'}"
                >
                  {transportLabel}
                </span>

                {#if isConnected}
                  <span class="text-xs sm:text-[13px] font-mono text-graphite-600 dark:text-graphite-300 tabular-nums">
                    {server.toolCount} {server.toolCount === 1 ? 'tool' : 'tools'} · <CountUp value={server.tokenEstimate} prefix="~" suffix=" tok" />
                  </span>
                {:else if isStarting}
                  <span class="text-xs text-amber-600 dark:text-amber-400">Connecting…</span>
                {:else if server.status === 'off'}
                  <span class="text-xs text-graphite-400 dark:text-graphite-500 tabular-nums">
                    Idle · 0 tok
                  </span>
                {/if}
              </div>

              <p
                title={commandPreview}
                class="mt-1 pl-4.5 sm:pl-5 font-mono text-xs text-graphite-500 dark:text-graphite-400 truncate"
              >
                {commandPreview}
              </p>
            </div>

            <!-- Right: Streamline Action Icons + Mechanical Switch -->
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

              <div class="h-4 w-px bg-graphite-200 dark:bg-graphite-800 mx-1 sm:mx-1.5"></div>

              <Switch
                checked={isOn}
                starting={isStarting}
                disabled={isBusy}
                label="Toggle {server.name} {isOn ? 'off' : 'on'}"
                onchange={(next) => onToggle(server.name, next)}
              />
            </div>
          </div>

          <!-- Inline Error Banner -->
          {#if isError && server.error}
            <div class="mt-2.5 ml-[18px] flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              <div class="flex items-start gap-2 min-w-0">
                <StreamlineIcon name="AlertCircle" size={14} class="mt-0.5 text-rose-500 shrink-0" />
                <div class="min-w-0">
                  <p class="font-medium break-words">{server.error}</p>
                  {#if server.installHint}
                    <div class="mt-1 flex items-center gap-2 flex-wrap">
                      <code class="font-mono text-[11px] bg-rose-500/10 px-1.5 py-0.5 rounded select-all">
                        {server.installHint}
                      </code>
                      <button
                        type="button"
                        onclick={() => server.installHint && void copyHint(server.installHint)}
                        class="underline text-[11px]"
                      >
                        Copy
                      </button>
                    </div>
                  {/if}
                </div>
              </div>
              <Button variant="danger" size="xs" onclick={() => onViewLogs(server)}>
                View Error Log
              </Button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>
