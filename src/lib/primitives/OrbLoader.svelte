<script lang="ts">
  interface Props {
    size?: number;
    tone?: 'amber' | 'slate';
    reverse?: boolean;
    class?: string;
  }

  /**
   * Compact, high-DPI Svelte 5 adaptation of Uiverse (andrew-manzyk/unlucky-mouse-21).
   * Renders a glowing spherical gradient orb with an internal rotating liquid polygon mask.
   */
  let {
    size = 13,
    tone = 'amber',
    reverse = false,
    class: cls = '',
  }: Props = $props();

  const uid = $props.id();
  const maskId = `orb-clip-${uid}`;

  const paletteStyle = $derived(
    tone === 'slate'
      ? '--orb-one: #cbd5e1; --orb-two: #64748b; --orb-three: rgba(148,163,184,0.45); --orb-four: rgba(71,85,105,0.42); --orb-five: rgba(148,163,184,0.22);'
      : '--orb-one: #fbbf24; --orb-two: #be4a1d; --orb-three: rgba(251,191,36,0.45); --orb-four: rgba(190,74,29,0.42); --orb-five: rgba(251,191,36,0.22);'
  );
</script>

<span
  aria-hidden="true"
  style="width: {size}px; height: {size}px; {paletteStyle}"
  class="orb-loader relative inline-flex shrink-0 items-center justify-center rounded-full {reverse
    ? 'orb-reverse'
    : ''} {cls}"
>
  <span class="orb-rim pointer-events-none absolute inset-0 rounded-full"></span>
  <span
    class="orb-core block h-full w-full rounded-full"
    style="mask: url(#{maskId}); -webkit-mask: url(#{maskId});"
  ></span>

  <svg
    width="0"
    height="0"
    viewBox="0 0 100 100"
    class="pointer-events-none absolute h-0 w-0 overflow-hidden"
    aria-hidden="true"
  >
    <defs>
      <mask id={maskId} maskContentUnits="objectBoundingBox">
        <rect x="0" y="0" width="1" height="1" fill="black" />
        <g class="orb-mask-spin" style="transform-origin: 0.5px 0.5px;">
          <circle cx="0.5" cy="0.5" r="0.46" fill="white" opacity="0.55" />
          <polygon points="0.18,0.12 0.88,0.28 0.72,0.92 0.14,0.74" fill="white" />
          <polygon points="0.32,0.06 0.94,0.52 0.62,0.94 0.08,0.48" fill="white" opacity="0.85" />
        </g>
      </mask>
    </defs>
  </svg>
</span>

<style>
  .orb-loader {
    box-shadow:
      0 0 6px 0 var(--orb-three),
      0 1px 4px 0 var(--orb-four);
    animation: orb-colorize 6s ease-in-out infinite;
  }

  .orb-rim {
    border-top: 1px solid var(--orb-one);
    border-bottom: 1px solid var(--orb-two);
    background: linear-gradient(180deg, var(--orb-five), var(--orb-four));
    box-shadow:
      inset 0 2px 3px 0 var(--orb-three),
      inset 0 -2px 3px 0 var(--orb-four);
  }

  .orb-core {
    background: linear-gradient(180deg, var(--orb-one) 25%, var(--orb-two) 78%);
  }

  .orb-mask-spin {
    animation: orb-roundness 1s linear infinite;
  }

  .orb-reverse .orb-mask-spin {
    animation-direction: reverse;
    animation-duration: 1.15s;
  }

  @keyframes orb-roundness {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes orb-colorize {
    0%,
    100% {
      filter: hue-rotate(0deg) saturate(1.05);
    }
    50% {
      filter: hue-rotate(18deg) saturate(1.18);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .orb-loader,
    .orb-mask-spin {
      animation: none !important;
    }
  }
</style>
