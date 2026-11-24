<script lang="ts">
  interface Props {
    checked?: boolean;
    starting?: boolean;
    disabled?: boolean;
    size?: 'sm' | 'md';
    label?: string;
    onchange?: (next: boolean) => void;
  }

  /**
   * BoardUI-inspired precision tactile toggle switch.
   */
  let {
    checked = false,
    starting = false,
    disabled = false,
    size = 'sm',
    label = 'Toggle switch',
    onchange = () => {},
  }: Props = $props();
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  onclick={() => onchange(!checked)}
  class="relative inline-flex shrink-0 cursor-pointer items-center rounded-full border select-none outline-none focus-visible:ring-2 focus-visible:ring-sky-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-graphite-950 disabled:cursor-not-allowed disabled:opacity-40 transition-colors duration-150 {size === 'md'
    ? 'h-6 w-11 p-[2.5px]'
    : 'h-5 w-9 p-[2px]'} {checked && !starting
    ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-600 dark:bg-emerald-500'
    : starting
      ? 'border-amber-500 dark:border-amber-400 bg-amber-500 dark:bg-amber-400'
      : 'border-graphite-300 dark:border-graphite-700 bg-graphite-200 dark:bg-graphite-800'}"
>
  <span
    class="flex items-center justify-center rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-150 ease-out {size === 'md'
      ? 'h-[19px] w-[19px]'
      : 'h-3.5 w-3.5'} {checked && !starting
      ? size === 'md'
        ? 'translate-x-[20px]'
        : 'translate-x-4'
      : starting
        ? size === 'md'
          ? 'translate-x-[10px]'
          : 'translate-x-2'
        : 'translate-x-0'}"
  >
    <span
      class="rounded-full {size === 'md' ? 'h-1.5 w-1.5' : 'h-1 w-1'} {checked && !starting
        ? 'bg-emerald-600 dark:bg-emerald-500'
        : starting
          ? 'bg-amber-500'
          : 'bg-graphite-300 dark:bg-graphite-400'}"
    ></span>
  </span>
</button>
