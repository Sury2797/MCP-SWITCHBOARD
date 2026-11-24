<script>
  import { STREAMLINE_ICONS } from './streamlineData.js';

  let {
    name,
    size = 15,
    strokeWidth = 1.25,
    class: className = '',
    ariaHidden = true,
  } = $props();

  const icon = $derived(STREAMLINE_ICONS[name]);
</script>

{#if icon}
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox={icon.viewBox || '0 0 14 14'}
    fill="none"
    stroke="currentColor"
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden={ariaHidden}
    class="inline-block shrink-0 {className}"
  >
    {@html icon.body}
  </svg>
{/if}
