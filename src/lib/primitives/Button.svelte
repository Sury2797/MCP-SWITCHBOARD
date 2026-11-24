<script lang="ts">
  import type { Snippet } from 'svelte';

  type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
  type ButtonSize = 'md' | 'sm' | 'xs';

  interface Props {
    children: Snippet;
    variant?: ButtonVariant;
    size?: ButtonSize;
    iconOnly?: boolean;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    onclick?: (e: MouseEvent) => void;
    class?: string;
    'aria-label'?: string;
    title?: string;
  }

  /**
   * BoardUI-inspired precision Button primitive.
   */
  let {
    children,
    variant = 'secondary',
    size = 'sm',
    iconOnly = false,
    disabled = false,
    type = 'button',
    onclick = () => {},
    class: className = '',
    'aria-label': ariaLabel = undefined,
    title = undefined,
  }: Props = $props();

  const SIZES: Record<ButtonSize, { default: string; icon: string }> = {
    md: {
      default: 'h-10 px-4 rounded-lg text-xs sm:text-sm font-medium gap-2',
      icon: 'h-10 w-10 p-0 rounded-lg',
    },
    sm: {
      default: 'h-9 px-3.5 rounded-lg text-xs font-medium gap-1.5',
      icon: 'h-9 w-9 p-0 rounded-lg',
    },
    xs: {
      default: 'h-7.5 px-2.5 rounded-md text-xs font-medium gap-1',
      icon: 'h-7.5 w-7.5 p-0 rounded-md',
    },
  };

  const VARIANTS: Record<ButtonVariant, string> = {
    primary:
      'bg-graphite-950 text-graphite-50 hover:bg-graphite-800 active:bg-graphite-900 dark:bg-graphite-100 dark:text-graphite-950 dark:hover:bg-white dark:active:bg-graphite-200 border border-transparent',
    secondary:
      'bg-white text-graphite-800 border border-graphite-200 hover:bg-graphite-100/80 hover:border-graphite-300 dark:bg-graphite-850 dark:text-graphite-200 dark:border-graphite-700 dark:hover:bg-graphite-800 dark:hover:border-graphite-600',
    ghost:
      'bg-transparent text-graphite-600 border border-transparent hover:bg-graphite-100 hover:text-graphite-950 dark:text-graphite-400 dark:hover:bg-graphite-800/80 dark:hover:text-graphite-100',
    danger:
      'bg-rose-500/10 text-rose-700 border border-rose-500/25 hover:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30 dark:hover:bg-rose-500/20',
  };

  const sizeClass = $derived((SIZES[size] || SIZES.sm)[iconOnly ? 'icon' : 'default']);
  const variantClass = $derived(VARIANTS[variant] || VARIANTS.secondary);
</script>

<button
  {type}
  {disabled}
  {title}
  aria-label={ariaLabel}
  {onclick}
  class="inline-flex items-center justify-center font-medium select-none shrink-0 transition-[background-color,border-color,color,opacity,transform] duration-150 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none {sizeClass} {variantClass} {className}"
>
  {@render children()}
</button>
