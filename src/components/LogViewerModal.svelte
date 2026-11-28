<script lang="ts">
  import { tick, untrack, onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import StreamlineIcon from '../lib/icons/StreamlineIcon.svelte';
  import ServerIcon from '../lib/icons/ServerIcon.svelte';
  import Button from '../lib/primitives/Button.svelte';
  import { BACKDROP_FADE, glassModal } from '../lib/motion';
  import { api } from '../lib/api';
  import type { LiveLogEvent, LogEntry, McpServerSnapshot } from '../lib/types';

  interface Props {
    server?: McpServerSnapshot | null;
    liveLogEvent?: LiveLogEvent | null;
    onClose?: () => void;
    onNotify?: (message: string, type?: 'info' | 'error') => void;
  }

  let { server = null, liveLogEvent = null, onClose = () => {}, onNotify = () => {} }: Props = $props();

  let dialogEl = $state<HTMLDivElement | null>(null);
  let logs = $state<LogEntry[]>([]);
  let loading = $state(false);
  let copied = $state(false);
  let bottomEl = $state<HTMLDivElement | null>(null);
  let lastEventRef: LiveLogEvent | null = null;
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  onDestroy(() => {
    clearTimeout(copiedTimer);
  });

  $effect(() => {
    const activeServer = server;
    if (!activeServer) {
      logs = [];
      loading = false;
      return;
    }
    logs = [];
    loading = true;
    let cancelled = false;
    void tick().then(() => dialogEl?.focus());
    void api
      .getServerLogs(activeServer.name)
      .then((res) => {
        if (!cancelled) logs = res.logs || [];
      })
      .catch(() => {
        if (!cancelled) logs = [];
      })
      .finally(() => {
        if (!cancelled) loading = false;
      });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    const activeServer = server;
    const evt = liveLogEvent;
    if (!activeServer || !evt || evt === lastEventRef || evt.server !== activeServer.name) return;
    lastEventRef = evt;
    const current = untrack(() => logs);
    const next = [...current, evt.entry];
    logs = next.length > 200 ? next.slice(-200) : next;
    void tick().then(() => bottomEl?.scrollIntoView({ behavior: 'smooth' }));
  });

  function handleKey(e: KeyboardEvent): void {
    if (server && e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  async function handleCopy(): Promise<void> {
    try {
      const text = logs.map((l) => `[${l.ts}] [${l.stream}] ${l.line}`).join('\n');
      await navigator.clipboard.writeText(text);
      copied = true;
      onNotify('Copied logs to clipboard');
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
        copied = false;
      }, 1600);
    } catch {
      onNotify('Unable to access clipboard', 'error');
    }
  }

  async function handleClear(): Promise<void> {
    if (!server) return;
    await api.clearServerLogs(server.name);
    logs = [];
  }
</script>

<svelte:window onkeydown={handleKey} />

{#if server}
  <div
    transition:fade={BACKDROP_FADE}
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
  >
    <button
      type="button"
      aria-label="Close overlay"
      onclick={onClose}
      class="fixed inset-0 cursor-default bg-transparent"
      tabindex="-1"
    ></button>
    <div
      bind:this={dialogEl}
      transition:glassModal
      role="dialog"
      aria-modal="true"
      aria-labelledby="log-viewer-title"
      tabindex="-1"
      class="board-glass-modal relative z-10 w-[92vw] max-w-4xl h-[min(82vh,720px)] min-h-[320px] rounded-2xl border border-graphite-200/80 dark:border-white/[0.09] flex flex-col overflow-hidden focus:outline-none"
    >
      <div class="flex items-center justify-between gap-3 border-b border-graphite-200/80 dark:border-white/[0.08] px-5 py-3.5 shrink-0">
        <div class="flex items-center gap-3 min-w-0">
          <div class="flex h-9 w-9 items-center justify-center rounded-xl border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/90 dark:bg-white/[0.05] text-graphite-700 dark:text-graphite-200 shrink-0 shadow-xs">
            <ServerIcon name={server.name} command={server.command} args={server.args} url={server.url} size={18} />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 min-w-0">
              <h2 id="log-viewer-title" class="text-sm font-semibold text-graphite-950 dark:text-graphite-50 truncate">
                {server.name} — Logs
              </h2>
              <span class="rounded-md border border-graphite-200/80 dark:border-white/[0.08] bg-graphite-100/80 dark:bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10.5px] text-graphite-600 dark:text-graphite-300 tabular-nums shrink-0">
                {logs.length}
              </span>
            </div>
            <p class="text-[11px] font-mono text-graphite-500 dark:text-graphite-400 truncate">
              {server.transport === 'stdio' ? `${server.command || ''} ${(server.args || []).join(' ')}`.trim() : server.url || 'Stream log'}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <Button variant="secondary" size="xs" onclick={handleCopy} disabled={logs.length === 0}>
            <StreamlineIcon name={copied ? 'Check' : 'Copy'} size={12} class={copied ? 'text-graphite-700 dark:text-graphite-300' : ''} />
            <span class="hidden xs:inline">{copied ? 'Copied' : 'Copy Logs'}</span>
            <span class="inline xs:hidden">{copied ? 'Copied' : 'Copy'}</span>
          </Button>
          <Button variant="secondary" size="xs" onclick={handleClear} disabled={logs.length === 0}>
            <StreamlineIcon name="Trash2" size={12} />
            <span>Clear</span>
          </Button>
          <Button variant="ghost" size="xs" iconOnly onclick={onClose} aria-label="Close log viewer">
            <StreamlineIcon name="X" size={13} />
          </Button>
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-graphite-950 text-graphite-100 p-4 sm:p-5 font-mono text-xs leading-relaxed">
        {#if loading}
          <p class="text-graphite-400 animate-pulse">Loading server stream logs…</p>
        {:else if logs.length === 0}
          <p class="text-graphite-500">No log output yet. Toggle this server ON to stream stderr/system logs.</p>
        {:else}
          {#each logs as entry, i (i)}
            <div class="flex gap-3 py-0.5 [overflow-wrap:anywhere]">
              <span class="text-graphite-500 shrink-0 select-none tabular-nums">
                {entry.ts?.slice(11, 19)}
              </span>
              <span
                class="shrink-0 uppercase text-[10px] pt-0.5 w-12 {entry.stream === 'stderr'
                  ? 'text-rose-400'
                  : entry.stream === 'system'
                    ? 'text-graphite-400'
                    : 'text-graphite-200'}"
              >
                {entry.stream}
              </span>
              <span class="min-w-0 flex-1 {entry.stream === 'stderr' ? 'text-rose-200' : 'text-graphite-200'}">
                {entry.line}
              </span>
            </div>
          {/each}
        {/if}
        <div bind:this={bottomEl}></div>
      </div>
    </div>
  </div>
{/if}
