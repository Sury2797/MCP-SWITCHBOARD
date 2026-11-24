<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import StreamlineIcon from '../icons/StreamlineIcon.svelte';

  export interface SelectOption {
    value: string;
    label: string;
    badge?: string;
    description?: string;
  }

  interface Props {
    value?: string;
    options?: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    id?: string;
    onchange?: (value: string) => void;
  }

  /**
   * BoardUI-inspired precision CustomSelect component.
   */
  let {
    value = '',
    options = [],
    placeholder = 'Select option...',
    disabled = false,
    id = undefined,
    onchange = () => {},
  }: Props = $props();

  let open = $state(false);
  let containerEl = $state<HTMLDivElement | null>(null);
  const listboxId = $derived(`${id || 'select'}-listbox`);

  const selectedOption = $derived(options.find((opt) => opt.value === value) || null);

  function toggleOpen(): void {
    if (disabled) return;
    open = !open;
  }

  function select(val: string): void {
    onchange(val);
    open = false;
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (!open) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      open = false;
      return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && options.length > 0) {
      e.preventDefault();
      const idx = options.findIndex((o) => o.value === value);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const nextIdx = (idx + step + options.length) % options.length;
      onchange(options[nextIdx].value);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      open = false;
    }
  }

  onMount(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (open && containerEl && e.target instanceof Node && !containerEl.contains(e.target)) {
        open = false;
      }
    }
    window.addEventListener('click', handleClickOutside);
    return () => {
      window.removeEventListener('click', handleClickOutside);
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div bind:this={containerEl} class="relative w-full">
  <!-- Trigger Button -->
  <button
    {id}
    type="button"
    role="combobox"
    aria-expanded={open}
    aria-haspopup="listbox"
    aria-controls={listboxId}
    {disabled}
    onclick={toggleOpen}
    class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-left text-xs text-graphite-900 dark:text-graphite-100 flex items-center justify-between gap-2 shadow-xs transition-[border-color,box-shadow] duration-150 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 disabled:opacity-50 disabled:cursor-not-allowed hover:border-graphite-300 dark:hover:border-graphite-600 {open ? 'border-sky-500 ring-1 ring-sky-500/30' : ''}"
  >
    <div class="flex items-center gap-2 min-w-0">
      {#if selectedOption}
        <span class="font-medium truncate">{selectedOption.label}</span>
        {#if selectedOption.badge}
          <span class="rounded px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tracking-wider uppercase bg-graphite-100 text-graphite-600 dark:bg-graphite-800 dark:text-graphite-300 shrink-0">
            {selectedOption.badge}
          </span>
        {/if}
      {:else}
        <span class="text-graphite-400 dark:text-graphite-500 truncate">{placeholder}</span>
      {/if}
    </div>

    <StreamlineIcon
      name="ChevronDown"
      size={13}
      class="text-graphite-400 transition-transform duration-150 shrink-0 {open ? 'rotate-180 text-sky-500' : ''}"
    />
  </button>

  <!-- Dropdown Menu -->
  {#if open}
    <div
      id={listboxId}
      transition:fly={{ y: -4, duration: 140, easing: cubicOut }}
      role="listbox"
      tabindex="-1"
      class="absolute z-50 left-0 right-0 mt-1.5 rounded-lg border border-graphite-200 dark:border-graphite-700 bg-white dark:bg-graphite-900 p-1 shadow-xl max-h-60 overflow-y-auto"
    >
      {#each options as opt (opt.value)}
        {@const isSelected = opt.value === value}
        <button
          type="button"
          role="option"
          aria-selected={isSelected}
          onclick={() => select(opt.value)}
          class="w-full rounded-md px-2.5 py-2 text-left text-xs transition-colors flex items-center justify-between gap-2 {isSelected
            ? 'bg-sky-50 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200 font-medium'
            : 'text-graphite-800 dark:text-graphite-200 hover:bg-graphite-100 dark:hover:bg-graphite-800'}"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="truncate">{opt.label}</span>
              {#if opt.badge}
                <span class="rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase {isSelected ? 'bg-sky-200/60 text-sky-800 dark:bg-sky-900 dark:text-sky-300' : 'bg-graphite-100 text-graphite-600 dark:bg-graphite-800 dark:text-graphite-400'}">
                  {opt.badge}
                </span>
              {/if}
            </div>
            {#if opt.description}
              <p class="text-[11px] text-graphite-500 dark:text-graphite-400 mt-0.5 truncate">
                {opt.description}
              </p>
            {/if}
          </div>

          {#if isSelected}
            <StreamlineIcon name="Check" size={13} class="text-sky-600 dark:text-sky-400 shrink-0" />
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>