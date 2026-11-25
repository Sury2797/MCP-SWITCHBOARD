<script lang="ts">
  interface Props {
    colorFrom?: string;
    colorTo?: string;
    duration?: number;
    borderWidth?: number;
    active?: boolean;
  }

  /**
   * Native Svelte 5 MagicUI-inspired BorderBeam using CSS mask-composite + GPU transform.
   */
  let {
    colorFrom = 'rgba(161,161,170,0.85)',
    colorTo = 'rgba(255,255,255,0.95)',
    duration = 6,
    borderWidth = 1.25,
    active = true,
  }: Props = $props();
</script>

{#if active}
  <div
    aria-hidden="true"
    style="padding: {borderWidth}px; -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude;"
    class="pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden"
  >
    <div
      style="--beam-duration: {duration}s; background: conic-gradient(from 0deg, transparent 0deg 250deg, {colorFrom} 295deg, {colorTo} 335deg, transparent 360deg);"
      class="border-beam-spinner absolute left-1/2 top-1/2 aspect-square w-[220%] will-change-transform"
    ></div>
  </div>
{/if}
