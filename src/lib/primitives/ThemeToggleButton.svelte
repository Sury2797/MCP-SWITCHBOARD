<script lang="ts">
  import type { ThemeMode } from '../types';

  interface Props {
    theme?: ThemeMode;
    size?: 'xs' | 'sm';
    variant?: 'secondary' | 'ghost';
    onclick?: (event: MouseEvent) => void;
  }

  /**
   * Theme-aware circular light/dark toggle skin inspired by Uiverse (Creatlydev/massive-quail-70).
   * Renders both Moon and Sun in an overlaid CSS grid with 360deg scale+rotate cross-morphing.
   */
  let {
    theme = 'dark',
    size = 'sm',
    variant = 'secondary',
    onclick = () => {},
  }: Props = $props();

  const isDark = $derived(theme === 'dark');
  const isXs = $derived(size === 'xs');
  const iconSize = $derived(isXs ? 15 : 17);

  const surfaceClass = $derived(
    variant === 'ghost'
      ? 'bg-transparent border-transparent text-graphite-600 hover:bg-graphite-950/[0.06] hover:text-graphite-950 dark:text-graphite-300 dark:hover:bg-white/[0.08] dark:hover:text-white'
      : 'bg-white text-graphite-900 border-graphite-950/[0.1] shadow-[0_2px_10px_-2px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.9)] hover:bg-white hover:border-graphite-950/[0.18] hover:shadow-[0_4px_14px_-2px_rgba(0,0,0,0.16)] dark:bg-white/[0.08] dark:text-graphite-100 dark:border-white/[0.12] dark:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] dark:hover:bg-white/[0.13] dark:hover:border-white/[0.2]'
  );
</script>

<button
  type="button"
  role="switch"
  aria-checked={isDark}
  aria-label="Toggle color theme"
  title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
  {onclick}
  class="quail-toggle relative inline-grid shrink-0 place-items-center rounded-full border leading-none select-none cursor-pointer transition-[background-color,border-color,color,box-shadow,transform] duration-200 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite-950/35 dark:focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)] {isXs
    ? 'h-7.5 w-7.5'
    : 'h-9 w-9'} {surfaceClass}"
  data-checked={isDark ? 'true' : 'false'}
>
  <span class="quail-icon quail-icon--moon" aria-hidden="true">
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="currentColor">
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z"
      />
    </svg>
  </span>

  <span class="quail-icon quail-icon--sun" aria-hidden="true">
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z"
      />
    </svg>
  </span>
</button>

<style>
  .quail-icon {
    grid-column: 1 / 1;
    grid-row: 1 / 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
  }

  .quail-icon--moon {
    transition-delay: 200ms;
    transform: scale(1) rotate(0deg);
  }

  .quail-icon--sun {
    transition-delay: 0ms;
    transform: scale(0) rotate(0deg);
  }

  .quail-toggle[data-checked='true'] .quail-icon--moon {
    transition-delay: 0ms;
    transform: rotate(360deg) scale(0);
  }

  .quail-toggle[data-checked='true'] .quail-icon--sun {
    transition-delay: 200ms;
    transform: scale(1) rotate(360deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .quail-icon {
      transition: none;
    }
  }
</style>
