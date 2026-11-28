<script lang="ts">
  import { onDestroy } from 'svelte';
  import StreamlineIcon from '../lib/icons/StreamlineIcon.svelte';
  import Switch from '../lib/primitives/Switch.svelte';
  import Button from '../lib/primitives/Button.svelte';
  import ThemeToggleButton from '../lib/primitives/ThemeToggleButton.svelte';
  import { magnet } from '../lib/primitives/magnet';
  import type { ThemeMode, TunnelState } from '../lib/types';

  interface Props {
    port?: number;
    tunnel?: TunnelState | null;
    theme?: ThemeMode;
    tunnelBusy?: boolean;
    onToggleTunnel?: (enable: boolean) => void;
    onToggleTheme?: (event: MouseEvent) => void;
    onOpenSettings?: () => void;
    onOpenHelp?: () => void;
    onNotify?: (message: string, type?: 'info' | 'error') => void;
  }

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
  }: Props = $props();

  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  onDestroy(() => {
    clearTimeout(copiedTimer);
  });

  const isLive = $derived(tunnel?.status === 'live');
  const isStarting = $derived(tunnel?.status === 'starting');
  const isError = $derived(tunnel?.status === 'error');
  const tunnelOn = $derived(isLive || isStarting);
  const displayUrl = $derived(tunnel?.publicUrl || `http://localhost:${port || 8000}/mcp`);

  const statusMeta = $derived.by(() => {
    if (isLive) {
      return {
        text: 'Tunnel live',
        dot: 'bg-emerald-500',
        textCls: 'text-emerald-700 dark:text-emerald-400',
      };
    }
    if (isStarting) {
      return {
        text: 'Starting tunnel…',
        dot: 'bg-amber-500 dark:bg-amber-400 status-starting',
        textCls: 'text-amber-700 dark:text-amber-300',
      };
    }
    if (isError) {
      return {
        text: 'Tunnel error',
        dot: 'bg-rose-500',
        textCls: 'text-rose-700 dark:text-rose-400',
      };
    }
    return {
      text: 'Local only',
      dot: 'bg-graphite-400 dark:bg-graphite-500',
      textCls: 'text-graphite-500 dark:text-graphite-400',
    };
  });

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(displayUrl);
      copied = true;
      onNotify(isLive ? 'Copied HTTPS remote endpoint URL' : 'Copied local MCP endpoint URL');
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
        copied = false;
      }, 1800);
    } catch {
      onNotify('Unable to access clipboard', 'error');
    }
  }

  async function copyInstallHint(): Promise<void> {
    if (!tunnel?.installHint) return;
    try {
      await navigator.clipboard.writeText(tunnel.installHint);
      onNotify('Copied install command');
    } catch {
      onNotify('Unable to access clipboard', 'error');
    }
  }
</script>

<header class="sticky top-0 z-30 border-b border-graphite-200/80 dark:border-white/[0.08] bg-white/75 dark:bg-graphite-900/[0.72] backdrop-blur-2xl shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:shadow-[inset_0_-1px_0_rgba(255,255,255,0.03),0_1px_8px_rgba(0,0,0,0.45)]">
  <div class="mx-auto w-full max-w-[1080px] px-4 sm:px-6 lg:px-8 py-3 space-y-2.5 sm:space-y-3">
    <!-- Row 1: App Branding + Master Tunnel Control + Native Utility Actions -->
    <div class="flex items-center justify-between gap-2.5 sm:gap-4">
      <div class="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <img
          src="/app-icon.png"
          alt="MCP Switchboard"
          width="32"
          height="32"
          class="h-7 w-7 sm:h-8 sm:w-8 shrink-0 select-none drop-shadow-xs"
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
            <span class="relative flex h-2.5 w-2.5 items-center justify-center">
              {#if isStarting}
                <span class="connect-ring-pulse absolute inset-0 rounded-full border border-amber-500/70 dark:border-amber-400/70"></span>
              {:else if isLive}
                <span class="live-pulse-halo absolute inset-0 rounded-full bg-emerald-500/45 dark:bg-emerald-400/45"></span>
              {/if}
              <span class="relative h-1.5 w-1.5 rounded-full {statusMeta.dot} {isLive ? 'shadow-[0_0_8px_rgba(16,185,129,0.7)] dark:shadow-[0_0_10px_rgba(52,211,153,0.75)]' : ''}"></span>
            </span>
            {statusMeta.text}
          </span>
          <Switch
            checked={tunnelOn}
            starting={isStarting}
            error={isError}
            disabled={tunnelBusy}
            label="Toggle Cloudflare HTTPS Tunnel"
            onchange={onToggleTunnel}
          />
        </div>

        <div class="h-4 w-px bg-graphite-200 dark:bg-white/[0.1]"></div>

        <!-- Clean Light/Dark-Safe Utility Buttons -->
        <div class="flex items-center gap-1 sm:gap-1.5">
          <ThemeToggleButton {theme} size="sm" onclick={onToggleTheme} />

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
            title="Open MCPS Connection guide (?)"
            aria-label="Open MCPS Connection guide"
          >
            <StreamlineIcon name="HelpCircle" size={14} />
            <span class="hidden sm:inline">Guide</span>
          </Button>
        </div>
      </div>
    </div>

    <!-- Row 2: Unified Endpoint Bar + 1-Click Copy -->
    <div class="flex items-center gap-2 sm:gap-2.5">
      <div
        class="relative flex-1 min-w-0 h-9 flex items-center gap-2.5 rounded-lg border px-3 sm:px-3.5 overflow-hidden transition-[border-color,box-shadow] duration-200 {isLive
          ? 'border-emerald-500/40 dark:border-emerald-400/35 bg-white/95 dark:bg-graphite-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03),0_0_0_1px_rgba(16,185,129,0.08),0_0_16px_-5px_rgba(16,185,129,0.28)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45),0_0_0_1px_rgba(52,211,153,0.12),0_0_20px_-5px_rgba(16,185,129,0.3)]'
          : isStarting
            ? 'connect-shimmer border-amber-500/35 dark:border-amber-400/30 bg-graphite-50/90 dark:bg-graphite-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]'
            : 'border-graphite-200/80 dark:border-white/[0.09] bg-graphite-50/90 dark:bg-graphite-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45),inset_0_-1px_0_rgba(255,255,255,0.03)]'}"
      >
        <span
          class="relative z-10 inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider shrink-0 select-none {isLive
            ? 'text-emerald-700 dark:text-emerald-400'
            : isStarting
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-graphite-500 dark:text-graphite-400'}"
        >
          {#if isStarting}
            <span class="h-2.5 w-2.5 rounded-full border-[1.5px] border-amber-500/25 border-t-amber-600 dark:border-amber-400/25 dark:border-t-amber-300 connect-arc-spin"></span>
            TUNNEL
          {:else}
            <span
              class="h-1.5 w-1.5 rounded-full {isLive
                ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.75)] dark:shadow-[0_0_10px_rgba(52,211,153,0.8)]'
                : 'bg-graphite-400 dark:bg-graphite-500'}"
            ></span>
            {isLive ? 'HTTPS' : 'LOCAL'}
          {/if}
        </span>
        <div class="relative z-10 h-4 w-px bg-graphite-200 dark:bg-white/[0.1] shrink-0"></div>
        <div class="relative z-10 min-w-0 flex-1 truncate text-xs sm:text-[13px] text-graphite-900 dark:text-graphite-100 select-all">
          <span class="font-mono">{displayUrl}</span>
        </div>
      </div>
      <div use:magnet={0.14} class="shrink-0">
        <Button variant="primary" size="sm" onclick={handleCopy}>
          {#if copied}
            <StreamlineIcon name="Check" size={13} class="text-graphite-100 dark:text-graphite-900" />
            <span>Copied</span>
          {:else}
            <StreamlineIcon name="Copy" size={13} />
            <span class="hidden xs:inline">Copy URL</span>
            <span class="inline xs:hidden">Copy</span>
          {/if}
        </Button>
      </div>
    </div>

    <!-- Inline Tunnel Error Banner -->
    {#if isError && tunnel?.error}
      <div class="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 rounded-lg border border-rose-500/25 dark:border-rose-400/20 bg-rose-500/[0.04] dark:bg-rose-500/[0.06] px-3 py-2 text-xs text-graphite-800 dark:text-graphite-200">
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <StreamlineIcon name="AlertTriangle" size={13} class="text-rose-600 dark:text-rose-400 shrink-0" />
          <p class="font-medium truncate" title={tunnel.error}>{tunnel.error}</p>
          {#if tunnel.installHint}
            <code
              title={tunnel.installHint}
              class="hidden md:inline-block max-w-[240px] truncate rounded bg-graphite-950/[0.05] dark:bg-white/[0.07] px-1.5 py-0.5 font-mono text-[10.5px] text-graphite-700 dark:text-graphite-300 select-all"
            >
              {tunnel.installHint}
            </code>
          {/if}
        </div>
        {#if tunnel.installHint}
          <Button variant="secondary" size="xs" onclick={copyInstallHint} class="shrink-0">
            <StreamlineIcon name="Copy" size={11} />
            <span>Copy command</span>
          </Button>
        {/if}
      </div>
    {/if}
  </div>
</header>
