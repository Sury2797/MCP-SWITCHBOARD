<script>
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import StreamlineIcon from '../lib/icons/StreamlineIcon.svelte';
  import Button from '../lib/primitives/Button.svelte';
  import { checkForAppUpdate, installAppUpdate } from '../lib/updater.js';

  let { open = false, settings = null, configPath = '', onClose = () => {}, onSave = async () => {} } = $props();

  let tunnelMode = $state('quick');
  let autoStartTunnel = $state(false);
  let port = $state(8000);
  let namedTunnelToken = $state('');
  let namedTunnelName = $state('');
  let namedTunnelDomain = $state('');
  let saving = $state(false);

  // In-app updater state
  let checkingUpdate = $state(false);
  let updateResult = $state(null);
  let downloadingUpdate = $state(false);
  let downloadProgress = $state(0);
  let installError = $state(null);

  async function handleCheckUpdate() {
    checkingUpdate = true;
    installError = null;
    try {
      updateResult = await checkForAppUpdate(true);
    } finally {
      checkingUpdate = false;
    }
  }

  async function handleInstallUpdate() {
    downloadingUpdate = true;
    installError = null;
    try {
      await installAppUpdate((p) => {
        downloadProgress = p.percent;
      });
    } catch (err) {
      installError = err.message || 'Failed to install update';
      downloadingUpdate = false;
    }
  }

  $effect(() => {
    if (!open || !settings) return;
    tunnelMode = settings.tunnelMode || 'quick';
    autoStartTunnel = Boolean(settings.autoStartTunnel);
    port = settings.port || 8000;
    namedTunnelToken = settings.namedTunnelToken || '';
    namedTunnelName = settings.namedTunnelName || '';
    namedTunnelDomain = settings.namedTunnelDomain || '';
  });

  function handleKey(e) {
    if (open && e.key === 'Escape') onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    saving = true;
    try {
      await onSave({
        tunnelMode,
        autoStartTunnel,
        port: Number(port) || 8000,
        namedTunnelToken: namedTunnelToken.trim(),
        namedTunnelName: namedTunnelName.trim(),
        namedTunnelDomain: namedTunnelDomain.trim(),
      });
      onClose();
    } finally {
      saving = false;
    }
  }
</script>

<svelte:window onkeydown={handleKey} />

{#if open}
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
      aria-labelledby="settings-modal-title"
      tabindex="-1"
      class="relative z-10 w-full max-w-lg max-h-[calc(100dvh-2rem)] rounded-xl border border-graphite-200 dark:border-graphite-800 bg-white dark:bg-graphite-900 shadow-2xl flex flex-col overflow-hidden"
    >
      <div class="flex items-center justify-between border-b border-graphite-200 dark:border-graphite-800 px-4 sm:px-5 py-3 sm:py-3.5 shrink-0">
        <h2 id="settings-modal-title" class="text-sm font-semibold">
          Switchboard Settings
        </h2>
        <Button variant="ghost" size="xs" iconOnly onclick={onClose} aria-label="Close settings">
          <StreamlineIcon name="X" size={13} />
        </Button>
      </div>

      <form onsubmit={handleSubmit} class="p-4 sm:p-5 space-y-4 sm:space-y-5 overflow-y-auto">
        <div class="space-y-2">
          <span class="block text-[11px] font-semibold uppercase tracking-wider text-graphite-500 dark:text-graphite-400">
            Cloudflare Tunnel Mode
          </span>
          <div class="grid grid-cols-1 xs:grid-cols-2 gap-2.5">
            <button
              type="button"
              onclick={() => (tunnelMode = 'quick')}
              class="rounded-xl border p-3.5 text-left transition-all {tunnelMode === 'quick'
                ? 'border-sky-500/80 bg-sky-50/50 dark:bg-sky-950/20 shadow-xs ring-1 ring-sky-500/30'
                : 'border-graphite-200 dark:border-graphite-800 hover:bg-graphite-50 dark:hover:bg-graphite-850/50'}"
            >
              <div class="flex items-center justify-between mb-1">
                <p class="text-xs font-semibold text-graphite-900 dark:text-graphite-100">Quick Tunnel</p>
                {#if tunnelMode === 'quick'}
                  <span class="h-2 w-2 rounded-full bg-sky-500"></span>
                {/if}
              </div>
              <p class="text-[11px] text-graphite-500 dark:text-graphite-400 leading-normal">
                Zero account required. Instant trycloudflare.com URL.
              </p>
            </button>

            <button
              type="button"
              onclick={() => (tunnelMode = 'named')}
              class="rounded-xl border p-3.5 text-left transition-all {tunnelMode === 'named'
                ? 'border-sky-500/80 bg-sky-50/50 dark:bg-sky-950/20 shadow-xs ring-1 ring-sky-500/30'
                : 'border-graphite-200 dark:border-graphite-800 hover:bg-graphite-50 dark:hover:bg-graphite-850/50'}"
            >
              <div class="flex items-center justify-between mb-1">
                <p class="text-xs font-semibold text-graphite-900 dark:text-graphite-100">Permanent Named Tunnel</p>
                {#if tunnelMode === 'named'}
                  <span class="h-2 w-2 rounded-full bg-sky-500"></span>
                {/if}
              </div>
              <p class="text-[11px] text-graphite-500 dark:text-graphite-400 leading-normal">
                Static domain so Gemini Desktop URL never changes.
              </p>
            </button>
          </div>
        </div>

        {#if tunnelMode === 'named'}
          <div class="space-y-3.5 rounded-xl border border-graphite-200 dark:border-graphite-800 bg-graphite-50/60 dark:bg-graphite-950/60 p-4">
            <div>
              <label for="named-domain" class="block text-xs font-medium text-graphite-700 dark:text-graphite-300 mb-1.5">
                Permanent Domain
              </label>
              <input
                id="named-domain"
                type="text"
                bind:value={namedTunnelDomain}
                placeholder="https://mcp.yourdomain.com/mcp"
                class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label for="named-token" class="block text-xs font-medium text-graphite-700 dark:text-graphite-300 mb-1.5">
                Cloudflare Tunnel Token <span class="text-graphite-400 font-normal">(recommended)</span>
              </label>
              <input
                id="named-token"
                type="password"
                bind:value={namedTunnelToken}
                placeholder="eyJhIjoi..."
                class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label for="named-name" class="block text-xs font-medium text-graphite-700 dark:text-graphite-300 mb-1.5">
                Or Local Named Tunnel Name
              </label>
              <input
                id="named-name"
                type="text"
                bind:value={namedTunnelName}
                placeholder="my-mcp-tunnel"
                class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 focus:outline-none transition-colors"
              />
            </div>
          </div>
        {/if}

        <div class="space-y-3.5">
          <label class="flex items-center justify-between gap-3 p-3 rounded-lg border border-graphite-200 dark:border-graphite-800 bg-graphite-50/50 dark:bg-graphite-950/40 cursor-pointer hover:bg-graphite-100/60 dark:hover:bg-graphite-900/60 transition-colors">
            <div>
              <p class="text-xs font-medium text-graphite-900 dark:text-graphite-100">Auto-start Cloudflare Tunnel on launch</p>
              <p class="text-[11px] text-graphite-500 dark:text-graphite-400 mt-0.5">
                Immediately expose your aggregated /mcp endpoint when MCP Switchboard opens.
              </p>
            </div>
            <input
              type="checkbox"
              bind:checked={autoStartTunnel}
              class="h-4 w-4 rounded accent-sky-500 cursor-pointer"
            />
          </label>

          <div class="flex items-center justify-between gap-3 p-3 rounded-lg border border-graphite-200 dark:border-graphite-800 bg-graphite-50/50 dark:bg-graphite-950/40">
            <div>
              <label for="pref-port" class="text-xs font-medium text-graphite-900 dark:text-graphite-100">Preferred Local Port</label>
              <p class="text-[11px] text-graphite-500 dark:text-graphite-400 mt-0.5">
                Defaults to 8000 (auto-falls back to 8001–8010 if busy). Applies on restart.
              </p>
            </div>
            <input
              id="pref-port"
              type="number"
              min={8000}
              max={8010}
              bind:value={port}
              class="w-24 h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono tabular-nums text-right text-graphite-900 dark:text-graphite-100 shadow-xs focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 focus:outline-none transition-colors"
            />
          </div>
        </div>

        <div class="space-y-3 rounded-xl border border-graphite-200 dark:border-graphite-800 bg-graphite-50/50 dark:bg-graphite-950/40 p-3.5">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-graphite-900 dark:text-graphite-100">Native App Updates</p>
              <p class="text-[11px] text-graphite-500 dark:text-graphite-400 mt-0.5 font-mono">
                Version 1.0.0 · Precision Desktop Shell
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onclick={handleCheckUpdate}
              disabled={checkingUpdate || downloadingUpdate}
            >
              <StreamlineIcon name="RefreshCw" size={12} class={checkingUpdate ? 'animate-spin' : ''} />
              <span>{checkingUpdate ? 'Checking…' : 'Check for Updates'}</span>
            </Button>
          </div>

          {#if updateResult}
            {#if updateResult.status === 'latest'}
              <div class="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
                <StreamlineIcon name="CheckCircle2" size={14} class="text-emerald-500 shrink-0" />
                <span>{updateResult.message}</span>
              </div>
            {:else if updateResult.status === 'available'}
              <div class="rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-xs space-y-2 text-sky-900 dark:text-sky-200">
                <div class="flex items-center justify-between">
                  <span class="font-semibold">Update v{updateResult.version} is available!</span>
                  <span class="font-mono text-[11px] opacity-75">{updateResult.date || 'New release'}</span>
                </div>
                {#if updateResult.body}
                  <p class="text-[11px] text-graphite-600 dark:text-graphite-300 leading-relaxed font-mono">
                    {updateResult.body}
                  </p>
                {/if}

                {#if downloadingUpdate}
                  <div class="space-y-1.5 pt-1">
                    <div class="flex justify-between text-[11px] font-mono">
                      <span>Downloading…</span>
                      <span>{downloadProgress}%</span>
                    </div>
                    <div class="h-1.5 w-full rounded-full bg-sky-200 dark:bg-sky-950 overflow-hidden">
                      <div class="h-full bg-sky-500 transition-all duration-150" style="width: {downloadProgress}%"></div>
                    </div>
                  </div>
                {:else}
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    class="w-full mt-1"
                    onclick={handleInstallUpdate}
                  >
                    <span>Download &amp; Install Update</span>
                  </Button>
                {/if}
              </div>
            {:else if updateResult.status === 'error'}
              <div class="flex items-center gap-2 rounded-lg border border-graphite-200 dark:border-graphite-800 bg-graphite-100/60 dark:bg-graphite-900/60 px-3 py-2 text-xs text-graphite-600 dark:text-graphite-400">
                <StreamlineIcon name="Info" size={13} class="shrink-0 text-graphite-500" />
                <span class="truncate">{updateResult.error}</span>
              </div>
            {:else if updateResult.status === 'unsupported'}
              <div class="flex items-center gap-2 rounded-lg border border-graphite-200 dark:border-graphite-800 bg-graphite-100/60 dark:bg-graphite-900/60 px-3 py-2 text-[11px] text-graphite-500">
                <StreamlineIcon name="Info" size={13} class="shrink-0" />
                <span>{updateResult.message}</span>
              </div>
            {/if}
          {/if}

          {#if installError}
            <p class="text-xs text-rose-500 font-mono">{installError}</p>
          {/if}
        </div>

        {#if configPath}
          <div class="rounded-md border border-graphite-200 dark:border-graphite-800 bg-graphite-50 dark:bg-graphite-950/60 px-3 py-2 text-[11px]">
            <span class="text-graphite-500 block">Config File</span>
            <code class="font-mono text-graphite-700 dark:text-graphite-300 break-all select-all">
              {configPath}
            </code>
          </div>
        {/if}

        <div class="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onclick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>
            {saving ? 'Saving…' : 'Save Settings'}
          </Button>
        </div>
      </form>
    </div>
  </div>
{/if}
