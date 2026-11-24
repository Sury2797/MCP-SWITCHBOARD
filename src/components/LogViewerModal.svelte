<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import StreamlineIcon from '../lib/icons/StreamlineIcon.svelte';
  import Button from '../lib/primitives/Button.svelte';
  import { api } from '../lib/api';
  import type { LiveLogEvent, LogEntry, McpServerSnapshot } from '../lib/types';

  interface Props {
    server?: McpServerSnapshot | null;
    liveLogEvent?: LiveLogEvent | null;
    onClose?: () => void;
    onNotify?: (message: string, type?: 'info' | 'error') => void;
  }

  let { server = null, liveLogEvent = null, onClose = () => {}, onNotify = () => {} }: Props = $props();

  let logs = $state<LogEntry[]>([]);
  let copied = $state(false);
  let bottomEl = $state<HTMLDivElement | null>(null);
  let lastEventRef: LiveLogEvent | null = null;

  $effect(() => {
    const activeServer = server;
    if (!activeServer) return;
    let cancelled = false;
    void api
      .getServerLogs(activeServer.name)
      .then((res) => {
        if (!cancelled) logs = res.logs || [];
      })
      .catch(() => {
        if (!cancelled) logs = [];
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
    if (server && e.key === 'Escape') onClose();
  }

  async function handleCopy(): Promise<void> {
    try {
      const text = logs.map((l) => `[${l.ts}] [${l.stream}] ${l.line}`).join('\n');
      await navigator.clipboard.writeText(text);
      copied = true;
      onNotify('Copied logs to clipboard');
      setTimeout(() => {
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
    transition:fade={{ duration: 140 }}
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
  >
    <button
      type="button"
      aria-label="Close overlay"
      onclick={onClose}
      class="fixed inset-0 cursor-default bg-transparent"
      tabindex="-1"
    ></button>
    <div
      transition:fly={{ y: 10, duration: 200, easing: cubicOut }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="log-viewer-title"
      tabindex="-1"
      class="relative z-10 w-full max-w-3xl max-h-[calc(100dvh-2rem)] h-[75vh] min-h-[300px] rounded-xl border border-graphite-200 dark:border-graphite-800 bg-white dark:bg-graphite-900 shadow-2xl flex flex-col overflow-hidden"
    >
      <div class="flex items-center justify-between border-b border-graphite-200 dark:border-graphite-800 px-4 sm:px-5 py-3 sm:py-3.5 shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <StreamlineIcon name="Terminal" size={14} class="text-graphite-500 dark:text-graphite-400 shrink-0" />
          <h2 id="log-viewer-title" class="text-sm font-semibold truncate">
            {server.name} — Logs
          </h2>
          <span class="text-[11px] font-mono text-graphite-500 tabular-nums shrink-0">
            ({logs.length})
          </span>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <Button variant="secondary" size="xs" onclick={handleCopy} disabled={logs.length === 0}>
            <StreamlineIcon name={copied ? 'Check' : 'Copy'} size={12} class={copied ? 'text-emerald-500' : ''} />
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

      <div class="flex-1 overflow-y-auto bg-graphite-950 text-graphite-100 p-4 font-mono text-xs leading-relaxed">
        {#if logs.length === 0}
          <p class="text-graphite-500">No log output yet. Toggle this server ON to stream stderr/system logs.</p>
        {:else}
          {#each logs as entry, i (i)}
            <div class="flex gap-2.5 py-0.5 break-all">
              <span class="text-graphite-500 shrink-0 select-none tabular-nums">
                {entry.ts?.slice(11, 19)}
              </span>
              <span
                class="shrink-0 uppercase text-[10px] pt-0.5 w-12 {entry.stream === 'stderr'
                  ? 'text-rose-400'
                  : entry.stream === 'system'
                    ? 'text-sky-400'
                    : 'text-emerald-400'}"
              >
                {entry.stream}
              </span>
              <span class={entry.stream === 'stderr' ? 'text-rose-200' : 'text-graphite-200'}>
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
