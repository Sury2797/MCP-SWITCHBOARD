<script>
  /**
   * Native Svelte 5 kinetic number ticker adapted from React Bits CountUp.
   * Uses ease-out-expo interpolation and respects prefers-reduced-motion.
   */
  let { value = 0, duration = 280, prefix = '', suffix = '' } = $props();

  let display = $state(0);
  let current = 0;

  $effect(() => {
    const target = Number(value) || 0;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || target === current) {
      current = target;
      display = target;
      return;
    }

    const startVal = current;
    const delta = target - startVal;
    const startTime = performance.now();
    let rafId;

    function tick(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(2, -10 * t);
      current = Math.round(startVal + delta * eased);
      display = current;
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        current = target;
        display = target;
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
    };
  });
</script>

<span class="tabular-nums tracking-[-0.02em]">{prefix}{display.toLocaleString()}{suffix}</span>
