<script lang="ts">
  interface Props {
    checked?: boolean;
    starting?: boolean;
    disconnecting?: boolean;
    error?: boolean;
    disabled?: boolean;
    size?: 'sm' | 'md';
    tone?: 'status' | 'neutral';
    label?: string;
    onchange?: (next: boolean) => void;
  }

  /**
   * BoardUI-inspired precision tactile switch.
   * Status switches reflect live connection telemetry (emerald connected, amber starting,
   * cool slate disconnecting, muted rose error, matte neutral disconnected).
   */
  let {
    checked = false,
    starting = false,
    disconnecting = false,
    error = false,
    disabled = false,
    size = 'sm',
    tone = 'status',
    label = 'Toggle switch',
    onchange = () => {},
  }: Props = $props();

  const isStatus = $derived(tone === 'status');
  const isMd = $derived(size === 'md');
  const isTransitioning = $derived(starting || disconnecting);

  const thumbOffsetPx = $derived.by(() => {
    if (isTransitioning) return isMd ? 10 : 8;
    if (checked) return isMd ? 20 : 16;
    return 0;
  });

  const trackClass = $derived.by(() => {
    if (disconnecting) {
      return 'border-slate-400/80 bg-slate-400/85 dark:border-slate-500/80 dark:bg-slate-600/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_2px_rgba(148,163,184,0.16)]';
    }
    if (starting) {
      return isStatus
        ? 'border-amber-500/85 bg-amber-500/90 dark:border-amber-400/85 dark:bg-amber-400/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_0_0_2px_rgba(245,158,11,0.16)]'
        : 'border-graphite-400 dark:border-graphite-600 bg-graphite-400 dark:bg-graphite-600 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]';
    }
    if (checked) {
      return isStatus
        ? 'border-emerald-600 bg-emerald-600 dark:border-emerald-500 dark:bg-emerald-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_0_10px_-2px_rgba(16,185,129,0.38)]'
        : 'border-graphite-950 bg-graphite-950 dark:border-graphite-100 dark:bg-graphite-100 shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]';
    }
    if (isStatus && error) {
      return 'border-rose-500/55 bg-rose-500/10 dark:border-rose-400/50 dark:bg-rose-500/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]';
    }
    return 'border-graphite-950/[0.14] dark:border-white/[0.14] bg-graphite-200/85 dark:bg-white/[0.10] shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]';
  });

  const thumbColorClass = $derived.by(() => {
    if (!isStatus && checked && !isTransitioning) {
      return 'bg-white dark:bg-graphite-950';
    }
    if (isStatus && (checked || isTransitioning)) {
      return 'bg-white';
    }
    return 'bg-white dark:bg-graphite-200';
  });

  const detentClass = $derived.by(() => {
    if (checked && !isTransitioning) {
      return isStatus ? 'bg-emerald-600 dark:bg-emerald-500' : 'bg-graphite-950 dark:bg-graphite-100';
    }
    if (isStatus && error && !isTransitioning) {
      return 'bg-rose-500';
    }
    return 'bg-graphite-300 dark:bg-graphite-500';
  });
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  onclick={() => onchange(!checked)}
  class="relative inline-flex shrink-0 cursor-pointer items-center rounded-full border select-none outline-none focus-visible:ring-2 focus-visible:ring-graphite-950/35 dark:focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)] disabled:cursor-not-allowed disabled:opacity-45 transition-[background-color,border-color,box-shadow] duration-200 ease-out {isMd
    ? 'h-6 w-11 p-[2px]'
    : 'h-5 w-9 p-[2px]'} {trackClass}"
>
  {#if disconnecting}
    <span
      aria-hidden="true"
      style="--disconnect-shimmer: rgba(255, 255, 255, 0.3);"
      class="disconnect-shimmer pointer-events-none absolute inset-0 rounded-full"
    ></span>
  {:else if starting}
    <span
      aria-hidden="true"
      style="--connect-shimmer: rgba(255, 255, 255, 0.32);"
      class="connect-shimmer pointer-events-none absolute inset-0 rounded-full"
    ></span>
  {/if}
  <span
    style="transform: translate3d({thumbOffsetPx}px, 0, 0); transition: transform 280ms var(--ease-spring); will-change: transform;"
    class="relative z-10 flex items-center justify-center rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.22)] ring-1 ring-black/[0.06] {isMd
      ? 'h-[18px] w-[18px]'
      : 'h-3.5 w-3.5'} {thumbColorClass}"
  >
    {#if (starting || disconnecting) && isStatus}
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        class="connect-arc-spin {disconnecting
          ? 'text-slate-600 dark:text-slate-500'
          : 'text-amber-600 dark:text-amber-500'} {isMd ? 'h-3 w-3' : 'h-2.5 w-2.5'}"
        fill="none"
      >
        <circle cx="6" cy="6" r="4.2" stroke="currentColor" stroke-opacity="0.24" stroke-width="1.8" />
        <path d="M6 1.8A4.2 4.2 0 0 1 10.2 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
    {:else}
      <span
        class="rounded-full transition-colors duration-150 {starting ? 'bg-graphite-500 status-starting' : detentClass} {isMd ? 'h-1.5 w-1.5' : 'h-1 w-1'}"
      ></span>
    {/if}
  </span>
</button>
