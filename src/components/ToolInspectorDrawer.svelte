<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import StreamlineIcon from '../lib/icons/StreamlineIcon.svelte';
  import Button from '../lib/primitives/Button.svelte';
  import { api } from '../lib/api';
  import type { McpServerSnapshot, ServerTool } from '../lib/types';

  interface Props {
    server?: McpServerSnapshot | null;
    onClose?: () => void;
  }

  let { server = null, onClose = () => {} }: Props = $props();

  let tools = $state<ServerTool[]>([]);
  let loading = $state(false);

  $effect(() => {
    const active = server;
    if (!active) return;
    let cancelled = false;
    loading = true;
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

  function handleKey(e: KeyboardEvent): void {
    if (server && e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={handleKey} />

{#if server}
  <div
    transition:fade={{ duration: 140 }}
    class="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-[1px]"
  >
    <button
      type="button"
      aria-label="Close overlay"
      onclick={onClose}
      class="fixed inset-0 cursor-default bg-transparent"
      tabindex="-1"
    ></button>
    <div
      transition:fly={{ x: 24, duration: 210, easing: cubicOut }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tool-inspector-title"
      tabindex="-1"
      class="relative z-10 w-full max-w-lg h-full bg-white dark:bg-graphite-900 border-l border-graphite-200 dark:border-graphite-800 flex flex-col shadow-2xl"
    >
      <div class="flex items-center justify-between border-b border-graphite-200 dark:border-graphite-800 px-5 py-4">
        <div class="flex items-center gap-2.5 min-w-0">
          <StreamlineIcon name="Wrench" size={15} class="text-graphite-500 dark:text-graphite-400 shrink-0" />
          <div class="min-w-0">
            <h2 id="tool-inspector-title" class="text-sm font-semibold truncate">
              {server.name} — Tools
            </h2>
            <p class="text-[11px] font-mono text-graphite-500 dark:text-graphite-400 tabular-nums">
              {tools.length} {tools.length === 1 ? 'tool' : 'tools'} · ~{(server.tokenEstimate || 0).toLocaleString()} tok
            </p>
          </div>
        </div>
        <Button variant="ghost" size="xs" iconOnly onclick={onClose} aria-label="Close tool inspector">
          <StreamlineIcon name="X" size={13} />
        </Button>
      </div>

      <div class="flex-1 overflow-y-auto p-5 space-y-3">
        {#if loading}
          <p class="text-xs text-graphite-500">Loading tool schemas…</p>
        {:else if tools.length === 0}
          <p class="text-xs text-graphite-500">No tools exposed by this server.</p>
        {:else}
          {#each tools as tool (tool.name)}
            {@const props = Object.entries(tool.inputSchema?.properties || {})}
            {@const required = new Set(tool.inputSchema?.required || [])}
            <div class="rounded-lg border border-graphite-200 dark:border-graphite-800 bg-graphite-50/70 dark:bg-graphite-950/70 p-3.5 space-y-2">
              <div class="flex items-start justify-between gap-2">
                <code class="font-mono text-xs font-semibold text-graphite-950 dark:text-graphite-50 break-all">
                  {tool.name}
                </code>
                <span class="shrink-0 font-mono text-[10px] text-graphite-500 tabular-nums">
                  ~{tool.tokenEstimate} tok
                </span>
              </div>

              {#if tool.description}
                <p class="text-xs text-graphite-600 dark:text-graphite-300 leading-relaxed">
                  {tool.description}
                </p>
              {/if}

              {#if props.length > 0}
                <div class="pt-1.5 border-t border-graphite-200/70 dark:border-graphite-800 space-y-1">
                  <p class="text-[10px] font-semibold uppercase tracking-wider text-graphite-400">
                    Parameters
                  </p>
                  {#each props as [paramName, schema] (paramName)}
                    <div class="text-[11px] flex items-baseline gap-1.5 flex-wrap">
                      <code class="font-mono font-medium text-graphite-800 dark:text-graphite-200">
                        {paramName}
                      </code>
                      <span class="font-mono text-[10px] text-graphite-500">
                        {schema?.type || 'any'}
                      </span>
                      {#if required.has(paramName)}
                        <span class="text-[10px] text-amber-600 dark:text-amber-400">required</span>
                      {/if}
                      {#if schema?.description}
                        <span class="text-graphite-500 dark:text-graphite-400">
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
