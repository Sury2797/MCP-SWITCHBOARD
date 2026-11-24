<script lang="ts">
  export interface SegmentOption {
    value: string;
    label: string;
    count?: number;
  }

  interface Props {
    options?: SegmentOption[];
    value?: string;
    onchange?: (value: string) => void;
  }

  /**
   * BoardUI-inspired segmented pill control with crisp active indicator.
   */
  let { options = [], value = '', onchange = () => {} }: Props = $props();
</script>

<div
  role="tablist"
  aria-label="Filter servers"
  class="inline-flex h-9 items-center rounded-lg border border-graphite-200 dark:border-graphite-800 bg-graphite-100/70 dark:bg-graphite-900/90 p-0.5 text-xs font-medium"
>
  {#each options as opt (opt.value)}
    {@const active = value === opt.value}
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onclick={() => onchange(opt.value)}
      class="relative h-full inline-flex items-center justify-center rounded-md px-3 text-xs transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 {active
        ? 'bg-white dark:bg-graphite-800 text-graphite-950 dark:text-graphite-50 shadow-sm border border-black/[0.04] dark:border-white/[0.06]'
        : 'text-graphite-500 dark:text-graphite-400 hover:text-graphite-800 dark:hover:text-graphite-200 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'}"
    >
      <span>{opt.label}</span>
      {#if opt.count !== undefined}
        <span
          class="ml-1.5 rounded px-1.5 py-0.5 font-mono text-[10.5px] tabular-nums transition-colors {active
            ? 'bg-graphite-100 dark:bg-graphite-700/80 text-graphite-700 dark:text-graphite-300 font-semibold'
            : 'text-graphite-400 dark:text-graphite-500'}"
        >
          {opt.count}
        </span>
      {/if}
    </button>
  {/each}
</div>
