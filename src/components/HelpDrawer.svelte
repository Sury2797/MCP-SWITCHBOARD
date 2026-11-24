<script>
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import StreamlineIcon from '../lib/icons/StreamlineIcon.svelte';
  import Button from '../lib/primitives/Button.svelte';
  import { api } from '../lib/api.js';

  let { open = false, onClose = () => {}, onNotify = () => {} } = $props();

  let diag = $state(null);
  let loading = $state(false);

  async function loadDiagnostics() {
    loading = true;
    try {
      diag = await api.getDiagnostics();
    } catch {
      diag = null;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (open) loadDiagnostics();
  });

  function handleKey(e) {
    if (open && e.key === 'Escape') onClose();
  }

  async function copyCmd(label, cmd) {
    await navigator.clipboard.writeText(cmd);
    onNotify(`Copied ${label} install command`);
  }
</script>

<svelte:window onkeydown={handleKey} />

{#if open}
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
      aria-labelledby="help-drawer-title"
      tabindex="-1"
      class="relative z-10 w-full max-w-lg h-full bg-white dark:bg-graphite-900 border-l border-graphite-200 dark:border-graphite-800 flex flex-col shadow-2xl"
    >
      <div class="flex items-center justify-between border-b border-graphite-200 dark:border-graphite-800 px-5 py-4">
        <div>
          <h2 id="help-drawer-title" class="text-sm font-semibold">
            Gemini Desktop Setup &amp; Diagnostics
          </h2>
          <p class="text-xs text-graphite-500 dark:text-graphite-400">
            Connect all toggled MCP servers through one HTTPS URL
          </p>
        </div>
        <Button variant="ghost" size="xs" iconOnly onclick={onClose} aria-label="Close help drawer">
          <StreamlineIcon name="X" size={13} />
        </Button>
      </div>

      <div class="flex-1 overflow-y-auto p-5 space-y-6">
        <section class="space-y-2.5">
          <h3 class="text-[11px] font-semibold uppercase tracking-wider text-graphite-500 dark:text-graphite-400">
            Connect to Gemini Desktop (3 Steps)
          </h3>
          <ol class="space-y-2 text-xs">
            <li class="flex gap-3 rounded-lg border border-graphite-200 dark:border-graphite-800 bg-graphite-50 dark:bg-graphite-950/70 p-3">
              <span class="h-5 w-5 rounded-full bg-graphite-900 dark:bg-graphite-100 text-white dark:text-graphite-950 font-mono text-[11px] font-semibold flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <p class="font-medium text-graphite-900 dark:text-graphite-100">
                  Flip the Master Tunnel Switch ON
                </p>
                <p class="mt-0.5 text-graphite-500 dark:text-graphite-400">
                  Wait for status to show <span class="text-emerald-600 dark:text-emerald-400 font-medium">Tunnel live</span>, then click <strong>Copy URL</strong> (ends with <code class="font-mono">/mcp</code>).
                </p>
              </div>
            </li>

            <li class="flex gap-3 rounded-lg border border-graphite-200 dark:border-graphite-800 bg-graphite-50 dark:bg-graphite-950/70 p-3">
              <span class="h-5 w-5 rounded-full bg-graphite-900 dark:bg-graphite-100 text-white dark:text-graphite-950 font-mono text-[11px] font-semibold flex items-center justify-center shrink-0">
                2
              </span>
              <div>
                <p class="font-medium text-graphite-900 dark:text-graphite-100">
                  Open Custom Apps in Gemini Desktop
                </p>
                <p class="mt-0.5 text-graphite-500 dark:text-graphite-400">
                  Go to <span class="font-mono text-[11px] text-graphite-700 dark:text-graphite-200">Gemini Desktop → Settings → Connected Apps → Custom apps → Add a custom app</span>.
                </p>
              </div>
            </li>

            <li class="flex gap-3 rounded-lg border border-graphite-200 dark:border-graphite-800 bg-graphite-50 dark:bg-graphite-950/70 p-3">
              <span class="h-5 w-5 rounded-full bg-graphite-900 dark:bg-graphite-100 text-white dark:text-graphite-950 font-mono text-[11px] font-semibold flex items-center justify-center shrink-0">
                3
              </span>
              <div>
                <p class="font-medium text-graphite-900 dark:text-graphite-100">
                  Paste Your Single HTTPS URL &amp; Save
                </p>
                <p class="mt-0.5 text-graphite-500 dark:text-graphite-400">
                  Name it <strong>MCP Switchboard</strong>, paste your <code class="font-mono">https://.../mcp</code> URL, and save. Flipping toggles here updates Gemini&apos;s tool list automatically.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section class="space-y-2.5">
          <div class="flex items-center justify-between">
            <h3 class="text-[11px] font-semibold uppercase tracking-wider text-graphite-500 dark:text-graphite-400">
              System Prerequisites Check
            </h3>
            <Button variant="ghost" size="xs" onclick={loadDiagnostics} disabled={loading}>
              <StreamlineIcon name="RefreshCw" size={12} class={loading ? 'animate-spin' : ''} />
              <span>Re-check</span>
            </Button>
          </div>

          <div class="divide-y divide-graphite-200 dark:divide-graphite-800 rounded-lg border border-graphite-200 dark:border-graphite-800 overflow-hidden">
            {#if diag?.items}
              {#each diag.items as item (item.id)}
                <div class="p-3 bg-white dark:bg-graphite-950/60 space-y-1.5">
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2">
                      <StreamlineIcon
                        name={item.installed ? 'CheckCircle2' : 'XCircle'}
                        size={14}
                        class={item.installed ? 'text-emerald-500' : 'text-rose-500'}
                      />
                      <span class="text-xs font-semibold">{item.label}</span>
                    </div>
                    <span class="font-mono text-[11px] text-graphite-500 truncate max-w-[200px]">
                      {item.installed ? item.version : 'Not found'}
                    </span>
                  </div>
                  <p class="text-[11px] text-graphite-500 dark:text-graphite-400 pl-6">
                    {item.role}
                  </p>
                  {#if !item.installed}
                    <div class="ml-6 mt-1 flex items-center justify-between gap-2 rounded bg-graphite-100 dark:bg-graphite-900 border border-graphite-200 dark:border-graphite-800 px-2.5 py-1.5">
                      <code class="font-mono text-[11px] text-graphite-800 dark:text-graphite-200 truncate select-all">
                        {item.installCommand}
                      </code>
                      <Button
                        variant="ghost"
                        size="xs"
                        iconOnly
                        onclick={() => copyCmd(item.label, item.installCommand)}
                        title="Copy install command"
                        aria-label="Copy {item.label} install command"
                      >
                        <StreamlineIcon name="Copy" size={12} />
                      </Button>
                    </div>
                  {/if}
                </div>
              {/each}
            {:else}
              <div class="p-4 text-xs text-graphite-500">
                {loading ? 'Checking installed binaries…' : 'Unable to reach sidecar diagnostics.'}
              </div>
            {/if}
          </div>
        </section>

        <section class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-1.5 text-xs">
          <div class="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
            <StreamlineIcon name="ShieldAlert" size={14} class="text-amber-500 shrink-0" />
            <span>Security &amp; Token Discipline</span>
          </div>
          <ul class="list-disc pl-5 space-y-1 text-amber-900/90 dark:text-amber-200/90">
            <li>Keep heavy MCP servers toggled <strong>OFF</strong> when idle—disabled servers use 0 MB RAM and send 0 schema tokens to Gemini.</li>
            <li>Keep active schemas under <strong>3,000 tokens</strong> (green) for lean, fast prompts.</li>
            <li>Turn the <strong>Tunnel Switch OFF</strong> when you finish a session so your local endpoint is not publicly reachable.</li>
          </ul>
        </section>
      </div>
    </div>
  </div>
{/if}
