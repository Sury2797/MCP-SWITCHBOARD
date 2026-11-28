<script lang="ts">
  import { tick, onDestroy } from 'svelte';
  import { fade, slide } from 'svelte/transition';
  import StreamlineIcon from '../lib/icons/StreamlineIcon.svelte';
  import Button from '../lib/primitives/Button.svelte';
  import Switch from '../lib/primitives/Switch.svelte';
  import { BACKDROP_FADE, glassModal } from '../lib/motion';
  import { checkForAppUpdate, getAppVersion, installAppUpdate } from '../lib/updater';
  import type { SwitchboardSettings, TunnelMode, UpdateCheckResult } from '../lib/types';

  interface Props {
    open?: boolean;
    settings?: SwitchboardSettings | null;
    configPath?: string;
    initialUpdate?: UpdateCheckResult | null;
    onUpdateStatus?: (result: UpdateCheckResult) => void;
    onClose?: () => void;
    onSave?: (patch: Partial<SwitchboardSettings>) => Promise<void>;
  }

  let {
    open = false,
    settings = null,
    configPath = '',
    initialUpdate = null,
    onUpdateStatus = () => {},
    onClose = () => {},
    onSave = async () => {},
  }: Props = $props();

  let dialogEl = $state<HTMLDivElement | null>(null);
  let copiedConfigPath = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  onDestroy(() => {
    clearTimeout(copiedTimer);
  });

  let appVersion = $state(typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? __APP_VERSION__ : '1.0.2');
  $effect(() => {
    if (open) {
      void getAppVersion().then((v) => {
        appVersion = v;
      });
    }
  });

  let tunnelMode = $state<TunnelMode>('quick');
  let autoStartTunnel = $state(false);
  let closeToTray = $state(true);
  let startAtOnboarding = $state(false);
  let port = $state(8000);
  let namedTunnelToken = $state('');
  let namedTunnelName = $state('');
  let namedTunnelDomain = $state('');
  let mcpAuthToken = $state('');
  let showAuthToken = $state(false);
  let saving = $state(false);

  // In-app updater state
  let checkingUpdate = $state(false);
  let updateResult = $state<UpdateCheckResult | null>(null);
  let downloadingUpdate = $state(false);
  let downloadProgress = $state(0);
  let installError = $state<string | null>(null);

  $effect(() => {
    if (open && initialUpdate?.status === 'available' && !downloadingUpdate && !updateResult) {
      updateResult = initialUpdate;
    }
  });

  async function handleCheckUpdate(): Promise<void> {
    checkingUpdate = true;
    installError = null;
    try {
      const res = await checkForAppUpdate();
      updateResult = res;
      onUpdateStatus(res);
    } finally {
      checkingUpdate = false;
    }
  }

  async function handleInstallUpdate(): Promise<void> {
    downloadingUpdate = true;
    installError = null;
    try {
      await installAppUpdate((p) => {
        downloadProgress = p.percent;
      });
    } catch (err) {
      installError = err instanceof Error ? err.message : 'Failed to install update';
      downloadingUpdate = false;
    }
  }

  $effect(() => {
    if (!open) return;
    copiedConfigPath = false;
    void tick().then(() => dialogEl?.focus());
    if (!settings) return;
    tunnelMode = settings.tunnelMode || 'quick';
    autoStartTunnel = Boolean(settings.autoStartTunnel);
    closeToTray = settings.closeToTray ?? true;
    startAtOnboarding = Boolean(settings.startAtOnboarding);
    port = settings.port || 8000;
    namedTunnelToken = settings.namedTunnelToken || '';
    namedTunnelName = settings.namedTunnelName || '';
    namedTunnelDomain = settings.namedTunnelDomain || '';
    mcpAuthToken = settings.mcpAuthToken || '';
    showAuthToken = false;
  });

  async function copyConfigPath(): Promise<void> {
    if (!configPath) return;
    try {
      await navigator.clipboard.writeText(configPath);
      copiedConfigPath = true;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
        copiedConfigPath = false;
      }, 1600);
    } catch {
      // Clipboard blocked
    }
  }

  function generateAuthToken(): void {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    mcpAuthToken = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    showAuthToken = true;
  }

  function handleKey(e: KeyboardEvent): void {
    if (open && e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  async function handleSubmit(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    saving = true;
    try {
      await onSave({
        tunnelMode,
        autoStartTunnel,
        closeToTray,
        startAtOnboarding,
        port: Number(port) || 8000,
        namedTunnelToken: namedTunnelToken.trim(),
        namedTunnelName: namedTunnelName.trim(),
        namedTunnelDomain: namedTunnelDomain.trim(),
        mcpAuthToken: mcpAuthToken.trim(),
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
      aria-labelledby="settings-modal-title"
      tabindex="-1"
      class="board-glass-modal relative z-10 w-[92vw] max-w-xl max-h-[min(88vh,780px)] rounded-2xl border border-graphite-200/80 dark:border-white/[0.09] flex flex-col overflow-hidden focus:outline-none"
    >
      <div class="flex items-center justify-between gap-3 border-b border-graphite-200/80 dark:border-white/[0.08] px-5 py-3.5 shrink-0">
        <div class="flex items-center gap-3 min-w-0">
          <div class="flex h-8 w-8 items-center justify-center rounded-xl border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/90 dark:bg-white/[0.05] text-graphite-700 dark:text-graphite-200 shrink-0 shadow-xs">
            <StreamlineIcon name="Settings" size={15} />
          </div>
          <h2 id="settings-modal-title" class="text-sm font-semibold text-graphite-950 dark:text-graphite-50 truncate">
            Switchboard Settings
          </h2>
        </div>
        <Button variant="ghost" size="xs" iconOnly onclick={onClose} aria-label="Close settings">
          <StreamlineIcon name="X" size={13} />
        </Button>
      </div>

      <form onsubmit={handleSubmit} class="flex-1 min-h-0 p-5 space-y-4 sm:space-y-5 overflow-y-auto overscroll-contain">
        <!-- Tunnel Mode -->
        <div class="space-y-2">
          <span id="tunnel-mode-label" class="block text-[11px] font-semibold uppercase tracking-wider text-graphite-500 dark:text-graphite-400">
            Cloudflare Tunnel Mode
          </span>
          <div role="radiogroup" aria-labelledby="tunnel-mode-label" class="grid grid-cols-1 xs:grid-cols-2 gap-2.5">
            <button
              type="button"
              role="radio"
              aria-checked={tunnelMode === 'quick'}
              onclick={() => (tunnelMode = 'quick')}
              class="rounded-xl border p-3.5 text-left transition-all duration-150 active:scale-[0.99] {tunnelMode === 'quick'
                ? 'border-graphite-900/40 dark:border-white/35 bg-graphite-950/[0.04] dark:bg-white/[0.08] ring-1 ring-graphite-950/15 dark:ring-white/20'
                : 'border-graphite-200 dark:border-graphite-800 bg-white/60 dark:bg-graphite-950/60 hover:bg-graphite-50 dark:hover:bg-white/[0.04]'}"
            >
              <div class="flex items-center justify-between mb-1">
                <p class="text-xs font-semibold text-graphite-900 dark:text-graphite-100">Quick Tunnel</p>
                {#if tunnelMode === 'quick'}
                  <span class="h-2 w-2 rounded-full bg-graphite-950 dark:bg-white"></span>
                {/if}
              </div>
              <p class="text-[11px] text-graphite-500 dark:text-graphite-400 leading-normal">
                Zero account required. Instant trycloudflare.com URL.
              </p>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={tunnelMode === 'named'}
              onclick={() => (tunnelMode = 'named')}
              class="rounded-xl border p-3.5 text-left transition-all duration-150 active:scale-[0.99] {tunnelMode === 'named'
                ? 'border-graphite-900/40 dark:border-white/35 bg-graphite-950/[0.04] dark:bg-white/[0.08] ring-1 ring-graphite-950/15 dark:ring-white/20'
                : 'border-graphite-200 dark:border-graphite-800 bg-white/60 dark:bg-graphite-950/60 hover:bg-graphite-50 dark:hover:bg-white/[0.04]'}"
            >
              <div class="flex items-center justify-between mb-1">
                <p class="text-xs font-semibold text-graphite-900 dark:text-graphite-100">Permanent Named Tunnel</p>
                {#if tunnelMode === 'named'}
                  <span class="h-2 w-2 rounded-full bg-graphite-950 dark:bg-white"></span>
                {/if}
              </div>
              <p class="text-[11px] text-graphite-500 dark:text-graphite-400 leading-normal">
                Static domain so remote IDE &amp; connector URLs never change.
              </p>
            </button>
          </div>
        </div>

        {#if tunnelMode === 'named'}
          <div transition:slide={{ duration: 200 }} class="space-y-3.5 rounded-xl border border-graphite-200/80 dark:border-white/[0.08] bg-graphite-50/60 dark:bg-graphite-950/60 p-4">
            <div>
              <label for="named-domain" class="block text-xs font-medium text-graphite-700 dark:text-graphite-300 mb-1.5">
                Permanent Domain
              </label>
              <input
                id="named-domain"
                type="text"
                bind:value={namedTunnelDomain}
                placeholder="https://mcp.yourdomain.com/mcp"
                class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-graphite-900 dark:focus:border-white/50 focus:ring-2 focus:ring-graphite-900/15 dark:focus:ring-white/15 focus:outline-none transition-colors"
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
                class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-graphite-900 dark:focus:border-white/50 focus:ring-2 focus:ring-graphite-900/15 dark:focus:ring-white/15 focus:outline-none transition-colors"
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
                class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-graphite-900 dark:focus:border-white/50 focus:ring-2 focus:ring-graphite-900/15 dark:focus:ring-white/15 focus:outline-none transition-colors"
              />
            </div>
          </div>
        {/if}

        <!-- Preference rows with Switch primitives -->
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-graphite-200/80 dark:border-white/[0.08] bg-graphite-50/50 dark:bg-graphite-950/40">
            <div class="min-w-0">
              <p class="text-xs font-medium text-graphite-900 dark:text-graphite-100">Auto-start Cloudflare Tunnel on launch</p>
              <p class="text-[11px] text-graphite-500 dark:text-graphite-400 mt-0.5">
                Immediately expose your aggregated /mcp endpoint when MCP Switchboard opens.
              </p>
            </div>
            <Switch
              checked={autoStartTunnel}
              tone="neutral"
              label="Auto-start Cloudflare Tunnel on launch"
              onchange={(v) => (autoStartTunnel = v)}
            />
          </div>

          <div class="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-graphite-200/80 dark:border-white/[0.08] bg-graphite-50/50 dark:bg-graphite-950/40">
            <div class="min-w-0">
              <p class="text-xs font-medium text-graphite-900 dark:text-graphite-100">Close to system tray (keep running in background)</p>
              <p class="text-[11px] text-graphite-500 dark:text-graphite-400 mt-0.5 leading-relaxed">
                Closing the window hides MCP Switchboard to the tray on Windows, macOS, and Linux so active servers and tunnels stay running. Use Quit in the tray menu to exit completely.
              </p>
            </div>
            <Switch
              checked={closeToTray}
              tone="neutral"
              label="Close to system tray"
              onchange={(v) => (closeToTray = v)}
            />
          </div>

          <div class="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-graphite-200/80 dark:border-white/[0.08] bg-graphite-50/50 dark:bg-graphite-950/40">
            <div class="min-w-0">
              <p class="text-xs font-medium text-graphite-900 dark:text-graphite-100">Open on Welcome / Onboarding screen at launch</p>
              <p class="text-[11px] text-graphite-500 dark:text-graphite-400 mt-0.5 leading-relaxed">
                Start each launch on the Onboarding flow (click Skip or Launch Switchboard to enter the dashboard).
              </p>
            </div>
            <Switch
              checked={startAtOnboarding}
              tone="neutral"
              label="Open on Onboarding screen at launch"
              onchange={(v) => (startAtOnboarding = v)}
            />
          </div>

          <div class="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-graphite-200/80 dark:border-white/[0.08] bg-graphite-50/50 dark:bg-graphite-950/40">
            <div class="min-w-0">
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
              class="w-24 h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono tabular-nums text-right text-graphite-900 dark:text-graphite-100 shadow-xs focus:border-graphite-900 dark:focus:border-white/50 focus:ring-2 focus:ring-graphite-900/15 dark:focus:ring-white/15 focus:outline-none transition-colors shrink-0"
            />
          </div>

          <div class="space-y-2 p-3.5 rounded-xl border border-graphite-200/80 dark:border-white/[0.08] bg-graphite-50/50 dark:bg-graphite-950/40">
            <div class="flex items-center justify-between gap-2">
              <label for="mcp-auth-token" class="text-xs font-medium text-graphite-900 dark:text-graphite-100">
                Optional Endpoint Bearer Token
              </label>
              <div class="flex items-center gap-1.5 shrink-0">
                <Button type="button" variant="secondary" size="xs" onclick={generateAuthToken}>
                  Generate
                </Button>
                {#if mcpAuthToken}
                  <Button type="button" variant="ghost" size="xs" onclick={() => (mcpAuthToken = '')}>
                    Clear
                  </Button>
                {/if}
              </div>
            </div>
            <div class="flex items-center gap-1.5">
              <input
                id="mcp-auth-token"
                type={showAuthToken ? 'text' : 'password'}
                bind:value={mcpAuthToken}
                placeholder="Leave blank for open local access"
                class="flex-1 min-w-0 h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-graphite-900 dark:focus:border-white/50 focus:ring-2 focus:ring-graphite-900/15 dark:focus:ring-white/15 focus:outline-none transition-colors"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                iconOnly
                onclick={() => (showAuthToken = !showAuthToken)}
                title={showAuthToken ? 'Hide token' : 'Show token'}
                aria-label={showAuthToken ? 'Hide bearer token' : 'Show bearer token'}
              >
                <StreamlineIcon name={showAuthToken ? 'EyeOff' : 'Eye'} size={13} />
              </Button>
            </div>
            <p class="text-[11px] text-graphite-500 dark:text-graphite-400 leading-relaxed">
              When set, <code class="font-mono">/mcp</code> and <code class="font-mono">/sse</code> require <code class="font-mono">Authorization: Bearer &lt;token&gt;</code> (applied immediately, great for public tunnels).
            </p>
          </div>
        </div>

        <!-- Updates section -->
        <div class="space-y-3 rounded-xl border border-graphite-200/80 dark:border-white/[0.08] bg-graphite-50/50 dark:bg-graphite-950/40 p-3.5">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-xs font-semibold text-graphite-900 dark:text-graphite-100">Native App Updates</p>
              <p class="text-[11px] text-graphite-500 dark:text-graphite-400 mt-0.5 font-mono truncate">
                Version {appVersion} · Precision Desktop Shell
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onclick={handleCheckUpdate}
              disabled={checkingUpdate || downloadingUpdate}
              class="shrink-0"
            >
              <StreamlineIcon name="RefreshCw" size={12} class={checkingUpdate ? 'animate-spin' : ''} />
              <span>{checkingUpdate ? 'Checking…' : 'Check for Updates'}</span>
            </Button>
          </div>

          {#if updateResult}
            {#if updateResult.status === 'latest'}
              <div class="flex items-center gap-2 rounded-lg border border-graphite-200/80 dark:border-white/[0.08] bg-graphite-100/60 dark:bg-white/[0.04] px-3 py-2 text-xs text-graphite-700 dark:text-graphite-300">
                <StreamlineIcon name="CheckCircle2" size={14} class="text-graphite-500 shrink-0" />
                <span>{updateResult.message}</span>
              </div>
            {:else if updateResult.status === 'available'}
              <div class="rounded-lg border border-graphite-200/80 dark:border-white/[0.08] bg-white/80 dark:bg-graphite-900/80 backdrop-blur-sm p-3 text-xs space-y-2 text-graphite-900 dark:text-graphite-100">
                <div class="flex items-center justify-between">
                  <span class="font-semibold">Update v{updateResult.version} is available!</span>
                  <span class="font-mono text-[11px] text-graphite-500 dark:text-graphite-400">{updateResult.date || 'New release'}</span>
                </div>
                {#if updateResult.body}
                  <p class="text-[11px] text-graphite-600 dark:text-graphite-300 leading-relaxed font-mono">
                    {updateResult.body}
                  </p>
                {/if}

                {#if downloadingUpdate}
                  <div class="space-y-1.5 pt-1">
                    <div class="flex justify-between text-[11px] font-mono text-graphite-600 dark:text-graphite-400">
                      <span>{downloadProgress >= 100 ? 'Installing & restarting…' : 'Downloading…'}</span>
                      <span>{downloadProgress}%</span>
                    </div>
                    <div class="h-1.5 w-full rounded-full bg-graphite-200 dark:bg-graphite-800 overflow-hidden">
                      <div class="h-full bg-graphite-950 dark:bg-white transition-all duration-150" style="width: {downloadProgress}%"></div>
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
              <div class="flex items-start gap-2 rounded-lg border border-graphite-200/80 dark:border-white/[0.08] bg-graphite-100/60 dark:bg-graphite-900/60 px-3 py-2 text-xs text-graphite-600 dark:text-graphite-400">
                <StreamlineIcon name="Info" size={13} class="shrink-0 mt-0.5 text-graphite-500" />
                <span class="break-words leading-relaxed">{updateResult.error}</span>
              </div>
            {:else if updateResult.status === 'unsupported'}
              <div class="flex items-center gap-2 rounded-lg border border-graphite-200/80 dark:border-white/[0.08] bg-graphite-100/60 dark:bg-graphite-900/60 px-3 py-2 text-[11px] text-graphite-500">
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
          <div class="rounded-xl border border-graphite-200/80 dark:border-white/[0.08] bg-graphite-50/80 dark:bg-graphite-950/80 px-3.5 py-2.5 text-[11px] flex items-center justify-between gap-2">
            <div class="min-w-0">
              <span class="text-graphite-500 dark:text-graphite-400 block">Switchboard Config File</span>
              <code class="font-mono text-graphite-800 dark:text-graphite-200 [overflow-wrap:anywhere] select-all">
                {configPath}
              </code>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              iconOnly
              onclick={copyConfigPath}
              title="Copy config path"
              aria-label="Copy Switchboard config file path"
            >
              <StreamlineIcon name={copiedConfigPath ? 'Check' : 'Copy'} size={12} class={copiedConfigPath ? 'text-graphite-700 dark:text-graphite-300' : ''} />
            </Button>
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
