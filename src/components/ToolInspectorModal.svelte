<script lang="ts">
  import { tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import StreamlineIcon from '../lib/icons/StreamlineIcon.svelte';
  import ServerIcon from '../lib/icons/ServerIcon.svelte';
  import Button from '../lib/primitives/Button.svelte';
  import { glassModal, BACKDROP_FADE } from '../lib/motion';
  import { api } from '../lib/api';
  import type { McpServerSnapshot, ServerTool } from '../lib/types';

  interface Props {
    server?: McpServerSnapshot | null;
    onClose?: () => void;
  }

  let { server = null, onClose = () => {} }: Props = $props();

  let dialogEl = $state<HTMLDivElement | null>(null);
  let tools = $state<ServerTool[]>([]);
  let loading = $state(false);
  let filterQuery = $state('');

  $effect(() => {
    const active = server;
    filterQuery = '';
    if (!active) {
      tools = [];
      return;
    }
    tools = [];
    let cancelled = false;
    loading = true;
    void tick().then(() => dialogEl?.focus());
    void api
      .getServerTools(active.name)
      .then((res) => {
        if (!cancelled) tools = res.tools || [];
      })
      .catch(() => {
        if (!cancelled) tools = [];
      })
      .finally(() => {
        if (!cancelled) loading = false;
      });

    return () => {
      cancelled = true;
    };
  });

  const filteredTools = $derived.by(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
    );
  });

  function handleKey(e: KeyboardEvent): void {
    if (server && e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKey} />

{#if server}
  <div
    transition:fade={BACKDROP_FADE}
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
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
      aria-labelledby="tool-inspector-title"
      tabindex="-1"
      class="board-glass-modal relative z-10 w-[92vw] max-w-3xl h-[min(84vh,720px)] rounded-2xl border border-graphite-200/80 dark:border-white/[0.09] flex flex-col focus:outline-none overflow-hidden"
    >
      <!-- Header -->
      <div class="shrink-0 flex items-center justify-between gap-3 border-b border-graphite-200/80 dark:border-white/[0.08] px-5 py-3.5">
        <div class="flex items-center gap-3 min-w-0">
          <div class="flex h-9 w-9 items-center justify-center rounded-xl border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/90 dark:bg-white/[0.05] text-graphite-700 dark:text-graphite-200 shrink-0 shadow-xs">
            <ServerIcon name={server.name} command={server.command} url={server.url} size={18} />
          </div>
          <div class="min-w-0">
            <h2 id="tool-inspector-title" class="text-sm font-semibold text-graphite-950 dark:text-graphite-50 truncate">
              {server.name} — Tools
            </h2>
            <p class="text-[11px] font-mono text-graphite-500 dark:text-graphite-400 tabular-nums truncate">
              {tools.length} {tools.length === 1 ? 'tool' : 'tools'} · ~{(server.tokenEstimate || 0).toLocaleString()} tok
            </p>
          </div>
        </div>
        <Button variant="ghost" size="xs" iconOnly onclick={onClose} aria-label="Close tool inspector">
          <StreamlineIcon name="X" size={13} />
        </Button>
      </div>

      <!-- Filter -->
      <div class="shrink-0 px-5 py-2.5 border-b border-graphite-200/80 dark:border-white/[0.08]">
        <div class="relative">
          <StreamlineIcon
            name="Search"
            size={12}
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-graphite-400 dark:text-graphite-500"
          />
          <input
            type="text"
            placeholder="Filter tools by name or description…"
            bind:value={filterQuery}
            aria-label="Filter tools"
            class="w-full h-9 rounded-lg border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/80 dark:bg-white/[0.04] pl-8 pr-8 text-xs text-graphite-900 dark:text-graphite-100 placeholder:text-graphite-400 dark:placeholder:text-graphite-500 focus:outline-none focus:border-graphite-900 dark:focus:border-white/50 focus:ring-2 focus:ring-graphite-900/15 dark:focus:ring-white/15 transition-colors"
          />
          {#if filterQuery}
            <button
              type="button"
              onclick={() => (filterQuery = '')}
              aria-label="Clear tool filter"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-graphite-400 hover:text-graphite-700 dark:hover:text-graphite-200 transition-colors"
            >
              <StreamlineIcon name="X" size={11} />
            </button>
          {/if}
        </div>
      </div>

      <!-- Tool Cards -->
      <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-3">
        {#if loading}
          <div class="space-y-3">
            {#each [0, 1, 2] as idx (idx)}
              <div class="rounded-xl border border-graphite-200/80 dark:border-white/[0.08] bg-graphite-50/60 dark:bg-white/[0.03] p-4 space-y-2 animate-pulse">
                <div class="flex items-center justify-between gap-2">
                  <div class="h-3.5 w-40 rounded bg-graphite-200/80 dark:bg-white/[0.08]"></div>
                  <div class="h-3 w-14 rounded bg-graphite-200/60 dark:bg-white/[0.06]"></div>
                </div>
                <div class="h-3 w-4/5 rounded bg-graphite-200/60 dark:bg-white/[0.05]"></div>
              </div>
            {/each}
          </div>
        {:else if filteredTools.length === 0}
          <div class="rounded-xl border border-dashed border-graphite-200 dark:border-white/[0.1] p-8 text-center">
            <p class="text-xs text-graphite-500 dark:text-graphite-400">
              {filterQuery.trim() ? 'No tools match your filter.' : 'No tools exposed by this server.'}
            </p>
          </div>
        {:else}
          {#each filteredTools as tool (tool.name)}
            {@const props = Object.entries(tool.inputSchema?.properties || {})}
            {@const required = new Set(tool.inputSchema?.required || [])}
            <div class="rounded-xl border border-graphite-200 dark:border-white/[0.09] bg-graphite-50/75 dark:bg-white/[0.03] p-4 space-y-2.5">
              <div class="flex items-start justify-between gap-3">
                <code class="font-mono text-xs font-semibold text-graphite-950 dark:text-graphite-50 [overflow-wrap:anywhere]">
                  {tool.name}
                </code>
                <span class="shrink-0 rounded-md border border-graphite-200/80 dark:border-white/[0.08] bg-white/70 dark:bg-white/[0.04] px-2 py-0.5 font-mono text-[10.5px] text-graphite-600 dark:text-graphite-300 tabular-nums">
                  ~{tool.tokenEstimate} tok
                </span>
              </div>

              {#if tool.description}
                <p class="text-xs text-graphite-600 dark:text-graphite-300 leading-relaxed break-words">
                  {tool.description}
                </p>
              {/if}

              {#if props.length > 0}
                <div class="pt-2 border-t border-graphite-200/70 dark:border-white/[0.07] space-y-1.5">
                  <p class="text-[10px] font-semibold uppercase tracking-wider text-graphite-400 dark:text-graphite-500">
                    Parameters
                  </p>
                  {#each props as [paramName, schema] (paramName)}
                    <div class="text-[11px] flex items-baseline gap-1.5 flex-wrap leading-relaxed">
                      <code class="font-mono font-medium text-graphite-800 dark:text-graphite-200">
                        {paramName}
                      </code>
                      <span class="font-mono text-[10px] text-graphite-500 dark:text-graphite-400">
                        {schema?.type || 'any'}
                      </span>
                      {#if required.has(paramName)}
                        <span class="text-[10px] font-medium px-1.5 py-0.5 rounded border border-graphite-300 dark:border-white/[0.14] bg-graphite-100/80 dark:bg-white/[0.05] text-graphite-700 dark:text-graphite-300">
                          required
                        </span>
                      {/if}
                      {#if schema?.description}
                        <span class="text-graphite-500 dark:text-graphite-400 break-words">
                          — {schema.description}
                        </span>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}
