<script>
  import StreamlineIcon from '../lib/icons/StreamlineIcon.svelte';
  import Switch from '../lib/primitives/Switch.svelte';
  import Button from '../lib/primitives/Button.svelte';

  let {
    port = 8000,
    tunnel = null,
    theme = 'dark',
    tunnelBusy = false,
    onToggleTunnel = () => {},
    onToggleTheme = () => {},
    onOpenSettings = () => {},
    onOpenHelp = () => {},
    onNotify = () => {},
  } = $props();

  let copied = $state(false);

  const isLive = $derived(tunnel?.status === 'live');
  const isStarting = $derived(tunnel?.status === 'starting');
  const isError = $derived(tunnel?.status === 'error');
  const tunnelOn = $derived(isLive || isStarting);
  const displayUrl = $derived(tunnel?.publicUrl || `http://localhost:${port || 8000}/mcp`);

  const statusMeta = $derived.by(() => {
    if (isLive) {
      return { text: 'Tunnel live', dot: 'bg-emerald-500', textCls: 'text-emerald-700 dark:text-emerald-400' };
    }
    if (isStarting) {
      return { text: 'Starting tunnel…', dot: 'bg-amber-400 status-starting', textCls: 'text-amber-700 dark:text-amber-400' };
    }
    if (isError) {
      return { text: 'Tunnel error', dot: 'bg-rose-500', textCls: 'text-rose-700 dark:text-rose-400' };
    }
    return { text: 'Local only', dot: 'bg-graphite-400 dark:bg-graphite-600', textCls: 'text-graphite-500 dark:text-graphite-400' };
  });

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(displayUrl);
      copied = true;
      onNotify(isLive ? 'Copied HTTPS Gemini endpoint URL' : 'Copied local MCP endpoint URL');
      setTimeout(() => {
        copied = false;
      }, 1800);
    } catch {
      onNotify('Unable to access clipboard', 'error');
    }
  }

  async function copyInstallHint() {
    if (!tunnel?.installHint) return;
    await navigator.clipboard.writeText(tunnel.installHint);
    onNotify('Copied install command');
  }
</script>

<header class="sticky top-0 z-30 border-b border-graphite-200 dark:border-graphite-800 bg-white/95 dark:bg-graphite-900/95 backdrop-blur-md">
  <div class="mx-auto w-full max-w-6xl px-4 sm:px-8 py-3 space-y-2.5 sm:space-y-3">
    <!-- Row 1: App Branding + Master Tunnel Control + Native Utility Actions -->
    <div class="flex items-center justify-between gap-2.5 sm:gap-4">
      <div class="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <img
          src="/app-icon.png"
          alt="MCP Switchboard"
          width="32"
          height="32"
          class="h-7 w-7 sm:h-8 sm:w-8 rounded-lg shrink-0 select-none shadow-xs"
        />
        <div class="min-w-0">
          <h1 class="text-sm sm:text-[15px] font-semibold tracking-[-0.015em] leading-none text-graphite-950 dark:text-graphite-50 truncate">
            MCP Switchboard
          </h1>
          <p class="mt-1 text-[11px] sm:text-xs font-mono text-graphite-500 dark:text-graphite-400 tabular-nums truncate">
            127.0.0.1:{port || 8000}/mcp
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 sm:gap-3 shrink-0">
        <!-- Master Tunnel Control -->
        <div class="flex items-center gap-2 pr-0.5 sm:pr-1">
          <span aria-live="polite" class="hidden md:inline-flex items-center gap-1.5 text-xs font-medium {statusMeta.textCls}">
            <span class="relative flex h-2 w-2 items-center justify-center">
              {#if isLive}
                <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
              {/if}
              <span class="relative h-1.5 w-1.5 rounded-full {statusMeta.dot}"></span>
            </span>
            {statusMeta.text}
          </span>
          <Switch
            checked={tunnelOn}
            starting={isStarting}
            disabled={tunnelBusy}
            label="Toggle Cloudflare HTTPS Tunnel"
            onchange={onToggleTunnel}
          />
        </div>

        <div class="h-4 w-px bg-graphite-200 dark:bg-graphite-800"></div>

        <!-- Clean Dark-Mode-Safe Utility Buttons -->
        <div class="flex items-center gap-1 sm:gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            iconOnly
            onclick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle color theme"
          >
            <StreamlineIcon name={theme === 'dark' ? 'Sun' : 'Moon'} size={14} />
          </Button>

          <Button
            variant="secondary"
            size="sm"
            iconOnly
            onclick={onOpenSettings}
            title="Settings"
            aria-label="Open settings"
          >
            <StreamlineIcon name="Settings" size={14} />
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onclick={onOpenHelp}
            title="Gemini Desktop Setup & System Diagnostics (?)"
            aria-label="Open guide and diagnostics"
          >
            <StreamlineIcon name="HelpCircle" size={14} />
            <span class="hidden sm:inline">Guide</span>
          </Button>
        </div>
      </div>
    </div>

    <!-- Row 2: Unified Endpoint Bar + 1-Click Copy -->
    <div class="flex items-center gap-2 sm:gap-2.5">
      <div class="flex-1 min-w-0 h-9 flex items-center gap-2.5 rounded-lg border border-graphite-200 dark:border-graphite-800 bg-graphite-50 dark:bg-graphite-950 px-3 sm:px-3.5">
        <span class="inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider shrink-0 select-none {isLive ? 'text-emerald-600 dark:text-emerald-400' : 'text-graphite-500 dark:text-graphite-400'}">
          <span class="h-1.5 w-1.5 rounded-full {isLive ? 'bg-emerald-500' : 'bg-graphite-400 dark:bg-graphite-600'}"></span>
          {isLive ? 'HTTPS' : 'LOCAL'}
        </span>
        <div class="h-4 w-px bg-graphite-200 dark:bg-graphite-800 shrink-0"></div>
        <div class="min-w-0 flex-1 truncate text-xs sm:text-[13px] text-graphite-900 dark:text-graphite-100 select-all">
          <span class="font-mono">{displayUrl}</span>
        </div>
      </div>
      <Button variant="primary" size="sm" onclick={handleCopy} class="shrink-0">
        {#if copied}
          <StreamlineIcon name="Check" size={13} class="text-emerald-500 dark:text-emerald-600" />
          <span>Copied</span>
        {:else}
          <StreamlineIcon name="Copy" size={13} />
          <span class="hidden xs:inline">Copy URL</span>
          <span class="inline xs:hidden">Copy</span>
        {/if}
      </Button>
    </div>

    <!-- Inline Tunnel Error Banner -->
    {#if isError && tunnel?.error}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
        <div class="flex items-start gap-2 min-w-0">
          <StreamlineIcon name="AlertTriangle" size={14} class="mt-0.5 text-rose-500 shrink-0" />
          <div class="min-w-0">
            <p class="font-medium">{tunnel.error}</p>
            {#if tunnel.installHint}
              <p class="mt-1 font-mono text-[11px] text-rose-800 dark:text-rose-200 flex items-center gap-1.5">
                <StreamlineIcon name="Terminal" size={12} class="shrink-0 opacity-75" />
                <code class="select-all truncate">{tunnel.installHint}</code>
              </p>
            {/if}
          </div>
        </div>
        {#if tunnel.installHint}
          <Button variant="danger" size="xs" onclick={copyInstallHint}>
            Copy command
          </Button>
        {/if}
      </div>
    {/if}
  </div>
</header>
