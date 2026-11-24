<script lang="ts">
  import CountUp from '../lib/primitives/CountUp.svelte';
  import { spotlight } from '../lib/primitives/spotlight';
  import type { SwitchboardTotals } from '../lib/types';

  interface Props {
    totals?: SwitchboardTotals;
  }

  let { totals = { activeServers: 0, totalServers: 0, totalTools: 0, totalTokens: 0 } }: Props = $props();

  const budget = $derived.by(() => {
    const tokens = totals?.totalTokens || 0;
    if (tokens > 10000) {
      return {
        label: 'High (>10k)',
        text: 'text-rose-600 dark:text-rose-400',
        bar: 'bg-rose-500',
        pct: 100,
      };
    }
    if (tokens >= 3000) {
      return {
        label: 'Moderate',
        text: 'text-amber-700 dark:text-amber-400',
        bar: 'bg-amber-500',
        pct: Math.min(100, Math.round((tokens / 10000) * 100)),
      };
    }
    return {
      label: 'Lean',
      text: 'text-emerald-700 dark:text-emerald-400',
      bar: 'bg-emerald-500',
      pct: tokens > 0 ? Math.max(4, Math.min(100, Math.round((tokens / 10000) * 100))) : 0,
    };
  });
</script>

<section
  aria-label="Switchboard telemetry"
  class="board-surface grid grid-cols-2 sm:grid-cols-3 rounded-xl border border-graphite-200 dark:border-graphite-800 bg-white dark:bg-graphite-900 overflow-hidden"
>
  <div use:spotlight class="px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between gap-3 border-r border-graphite-200 dark:border-graphite-800">
    <div class="min-w-0">
      <p class="text-[11px] sm:text-xs font-medium text-graphite-500 dark:text-graphite-400 truncate">Active servers</p>
      <div class="mt-1 flex items-baseline gap-1.5">
        <span class="text-lg sm:text-2xl font-bold font-mono tracking-tight text-graphite-950 dark:text-graphite-50">
          <CountUp value={totals.activeServers} />
        </span>
        <span class="text-xs sm:text-sm font-mono text-graphite-400 dark:text-graphite-500 tabular-nums">
          / {totals.totalServers}
        </span>
      </div>
    </div>
    <span class="hidden xs:inline text-[11px] sm:text-xs font-mono text-graphite-400 dark:text-graphite-500 shrink-0">0 MB off</span>
  </div>

  <div use:spotlight class="px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between gap-3 sm:border-r border-graphite-200 dark:border-graphite-800">
    <div class="min-w-0">
      <p class="text-[11px] sm:text-xs font-medium text-graphite-500 dark:text-graphite-400 truncate">Exposed tools</p>
      <div class="mt-1 flex items-baseline gap-1.5">
        <span class="text-lg sm:text-2xl font-bold font-mono tracking-tight text-graphite-950 dark:text-graphite-50">
          <CountUp value={totals.totalTools} />
        </span>
        <span class="text-xs sm:text-sm font-mono text-graphite-400 dark:text-graphite-500">callable</span>
      </div>
    </div>
    <span class="hidden xs:inline text-[11px] sm:text-xs font-mono text-graphite-400 dark:text-graphite-500 shrink-0">Auto-synced</span>
  </div>

  <div use:spotlight class="col-span-2 sm:col-span-1 border-t sm:border-t-0 border-graphite-200 dark:border-graphite-800 px-4 sm:px-6 py-3.5 sm:py-4 space-y-1.5">
    <div class="flex items-center justify-between gap-2">
      <p class="text-[11px] sm:text-xs font-medium text-graphite-500 dark:text-graphite-400">Context tokens</p>
      <span class="text-[11px] sm:text-xs font-semibold {budget.text}">{budget.label}</span>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-lg sm:text-2xl font-bold font-mono tracking-tight shrink-0 {budget.text}">
        <CountUp value={totals.totalTokens} prefix="~" />
      </span>
      <div class="flex-1 h-2 rounded-full bg-graphite-100 dark:bg-graphite-800 overflow-hidden">
        <div
          class="h-full rounded-full transition-[width,background-color] duration-300 ease-out {budget.bar}"
          style="width: {budget.pct}%"
        ></div>
      </div>
    </div>
  </div>
</section>
