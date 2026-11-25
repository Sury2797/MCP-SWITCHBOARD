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
    class="board-btn-secondary w-full h-9 rounded-lg border border-graphite-950/[0.1] dark:border-white/[0.11] bg-white/80 dark:bg-white/[0.06] px-3 text-left text-xs text-graphite-900 dark:text-graphite-100 flex items-center justify-between gap-2 transition-[border-color,background-color,box-shadow,transform] duration-150 ease-[var(--ease-spring)] active:scale-[0.99] focus-visible:outline-none focus-visible:border-graphite-900 dark:focus-visible:border-white/50 focus-visible:ring-2 focus-visible:ring-graphite-950/25 dark:focus-visible:ring-white/25 disabled:opacity-50 disabled:cursor-not-allowed hover:border-graphite-950/[0.18] dark:hover:border-white/[0.2] hover:bg-white/90 dark:hover:bg-white/[0.09] {open ? 'border-graphite-900 dark:border-white/50 ring-2 ring-graphite-950/25 dark:ring-white/25' : ''}"
  >
    <div class="flex items-center gap-2 min-w-0">
      {#if selectedOption}
        <span class="font-medium truncate">{selectedOption.label}</span>
        {#if selectedOption.badge}
          <span class="rounded px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tracking-wider uppercase bg-graphite-100 text-graphite-600 dark:bg-white/[0.08] dark:text-graphite-300 shrink-0">
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
      class="text-graphite-400 transition-transform duration-150 ease-[var(--ease-spring)] shrink-0 {open ? 'rotate-180 text-graphite-950 dark:text-graphite-50' : ''}"
    />
  </button>

  <!-- Dropdown Menu -->
  {#if open}
    <div
      id={listboxId}
      transition:fly={{ y: -4, duration: 150, easing: cubicOut }}
      role="listbox"
      tabindex="-1"
      class="board-dropdown absolute z-50 left-0 right-0 mt-1.5 rounded-lg border border-graphite-950/[0.08] dark:border-white/[0.1] p-1 max-h-60 overflow-y-auto origin-top backdrop-blur-2xl"
    >
      {#each options as opt (opt.value)}
        {@const isSelected = opt.value === value}
        <button
          type="button"
          role="option"
          aria-selected={isSelected}
          onclick={() => select(opt.value)}
          class="w-full rounded-md px-2.5 py-2 text-left text-xs transition-[background-color,color,transform] duration-150 active:scale-[0.99] flex items-center justify-between gap-2 {isSelected
            ? 'bg-graphite-950/[0.06] dark:bg-white/[0.1] text-graphite-950 dark:text-graphite-50 font-medium'
            : 'text-graphite-800 dark:text-graphite-200 hover:bg-graphite-950/[0.045] dark:hover:bg-white/[0.07]'}"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="truncate">{opt.label}</span>
              {#if opt.badge}
                <span class="rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase {isSelected ? 'bg-graphite-950/[0.08] text-graphite-700 dark:bg-white/[0.12] dark:text-graphite-200' : 'bg-graphite-100 text-graphite-600 dark:bg-white/[0.08] dark:text-graphite-400'}">
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
            <StreamlineIcon name="Check" size={13} class="text-graphite-950 dark:text-graphite-50 shrink-0" />
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
