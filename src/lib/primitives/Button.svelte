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
      'board-btn-primary text-white dark:text-graphite-950 border border-transparent',
    secondary:
      'board-btn-secondary bg-white/80 text-graphite-900 border border-graphite-950/[0.1] hover:bg-white/90 hover:border-graphite-950/[0.16] active:bg-graphite-100/80 active:scale-[0.97] dark:bg-white/[0.08] dark:text-graphite-100 dark:border-white/[0.1] dark:hover:bg-white/[0.12] dark:hover:border-white/[0.16] dark:active:bg-white/[0.15]',
    ghost:
      'bg-transparent text-graphite-600 border border-transparent hover:bg-graphite-950/[0.05] hover:text-graphite-950 active:bg-graphite-950/[0.08] active:scale-[0.97] dark:text-graphite-400 dark:hover:bg-white/[0.07] dark:hover:text-graphite-50 dark:active:bg-white/[0.11]',
    danger:
      'bg-rose-500/10 text-rose-700 border border-rose-500/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] hover:bg-rose-500/15 hover:border-rose-500/35 active:bg-rose-500/20 active:scale-[0.97] dark:bg-rose-500/[0.12] dark:text-rose-300 dark:border-rose-500/30 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:bg-rose-500/20',
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
  class="inline-flex items-center justify-center font-medium select-none shrink-0 transition-[background-color,border-color,color,opacity,transform,box-shadow,filter] duration-150 ease-[var(--ease-spring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite-950/35 dark:focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)] disabled:opacity-40 disabled:pointer-events-none {sizeClass} {variantClass} {className}"
>
  {@render children()}
</button>
