<script lang="ts">
  import { tick } from 'svelte';
  import StreamlineIcon from '../icons/StreamlineIcon.svelte';
  import { measureSlidingPill, slidingPillStyle } from '../motion';

  export interface SegmentOption {
    value: string;
    label: string;
    count?: number;
    done?: boolean;
  }

  interface Props {
    options?: SegmentOption[];
    value?: string;
    ariaLabel?: string;
    variant?: 'default' | 'pill';
    size?: 'sm' | 'md';
    onchange?: (value: string) => void;
  }

  /**
   * Fluid spring-gliding segmented control with ResizeObserver + layout-offset measurement.
   */
  let {
    options = [],
    value = '',
    ariaLabel = 'Segmented control',
    variant = 'default',
    size = 'md',
    onchange = () => {},
  }: Props = $props();

  let containerEl = $state<HTMLDivElement | null>(null);
  const btnEls: Record<string, HTMLButtonElement | null> = {};
  let indicator = $state({ left: 0, width: 0, ready: false });

  function measure(): void {
    const next = measureSlidingPill(btnEls[value] ?? null);
    if (!next) return;
    if (indicator.ready && indicator.left === next.left && indicator.width === next.width) return;
    indicator = { ...next, ready: true };
  }

  $effect(() => {
    void value;
    for (const opt of options) {
      void opt.value;
      void opt.label;
      void opt.count;
      void opt.done;
    }
    let cancelled = false;
    void tick().then(() => {
      if (!cancelled) measure();
    });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const container = containerEl;
    if (!container) return;

    const ro = new ResizeObserver(measure);
    ro.observe(container);
    for (const opt of options) {
      const btn = btnEls[opt.value];
      if (btn) ro.observe(btn);
    }

    let cancelled = false;
    void document.fonts?.ready?.then(() => {
      if (!cancelled) measure();
    });

    return () => {
      cancelled = true;
      ro.disconnect();
    };
  });

  function handleTabKeydown(e: KeyboardEvent, idx: number): void {
    if (options.length < 2) return;
    let nextIdx = -1;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % options.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + options.length) % options.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = options.length - 1;
    if (nextIdx < 0) return;

    e.preventDefault();
    const nextOpt = options[nextIdx];
    onchange(nextOpt.value);
    btnEls[nextOpt.value]?.focus();
  }

  const isPill = $derived(variant === 'pill');
  const isSm = $derived(size === 'sm');
</script>

<div
  bind:this={containerEl}
  role="tablist"
  aria-label={ariaLabel}
  class="sliding-pill-track relative inline-flex items-center p-0.5 font-medium {isPill
    ? 'rounded-full'
    : 'rounded-lg'} {isSm ? 'h-8 text-[11px]' : 'h-9 text-xs'}"
>
  {#if indicator.ready}
    <div
      aria-hidden="true"
      style={slidingPillStyle(indicator)}
      class="sliding-pill-thumb pointer-events-none absolute top-0.5 bottom-0.5 left-0 {isPill
        ? 'rounded-full'
        : 'rounded-md'}"
    ></div>
  {/if}

  {#each options as opt, idx (opt.value)}
    {@const active = value === opt.value}
    <button
      bind:this={btnEls[opt.value]}
      type="button"
      role="tab"
      aria-selected={active}
      tabindex={active ? 0 : -1}
      onclick={() => onchange(opt.value)}
      onkeydown={(e) => handleTabKeydown(e, idx)}
      class="relative z-10 h-full inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-[color,transform] duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite-950/35 dark:focus-visible:ring-white/40 {isPill
        ? 'rounded-full'
        : 'rounded-md'} {isSm ? 'px-2.5 text-[11px]' : 'px-3 text-xs'} {active
        ? 'text-graphite-950 dark:text-graphite-50'
        : 'text-graphite-500 dark:text-graphite-400 hover:text-graphite-900 dark:hover:text-graphite-100'}"
    >
      {#if opt.done && !active}
        <StreamlineIcon name="Check" size={10} class="text-emerald-600 dark:text-emerald-400 shrink-0" />
      {/if}
      <span>{opt.label}</span>
      {#if opt.count !== undefined}
        <span
          class="rounded px-1.5 py-0.5 font-mono font-medium text-[10.5px] tabular-nums transition-colors duration-200 {active
            ? 'bg-graphite-950/[0.06] dark:bg-white/[0.1] text-graphite-800 dark:text-graphite-100'
            : 'text-graphite-400 dark:text-graphite-500'}"
        >
          {opt.count}
        </span>
      {/if}
    </button>
  {/each}
</div>
