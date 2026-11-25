<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    dotSize?: number;
    gap?: number;
    proximity?: number;
    shockRadius?: number;
    shockStrength?: number;
    class?: string;
  }

  interface DotPoint {
    ox: number;
    oy: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
  }

  interface Shockwave {
    x: number;
    y: number;
    startTime: number;
  }

  /**
   * Native Svelte 5 GPU-friendly Canvas 2D interactive dot-grid background
   * inspired by ReactBits DotGrid.
   */
  let {
    dotSize = 1.25,
    gap = 24,
    proximity = 132,
    shockRadius = 220,
    shockStrength = 10,
    class: className = '',
  }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);

  onMount(() => {
    const canvas = canvasEl;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let dots: DotPoint[] = [];
    let shockwaves: Shockwave[] = [];
    let rafId: number | undefined;

    let pointerX = -9999;
    let pointerY = -9999;
    let pointerInside = false;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionQuery.matches;
    let isDark = document.documentElement.classList.contains('dark');

    function getPalette() {
      if (isDark) {
        return {
          baseR: 161,
          baseG: 161,
          baseB: 170,
          baseA: 0.22,
          activeR: 244,
          activeG: 244,
          activeB: 245,
          activeA: 0.65,
        };
      }
      return {
        baseR: 113,
        baseG: 113,
        baseB: 122,
        baseA: 0.24,
        activeR: 24,
        activeG: 24,
        activeB: 27,
        activeA: 0.55,
      };
    }

    function buildGrid(): void {
      const rect = canvas!.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cols = Math.floor(width / gap) + 1;
      const rows = Math.floor(height / gap) + 1;
      const offsetX = (width - (cols - 1) * gap) * 0.5;
      const offsetY = (height - (rows - 1) * gap) * 0.5;

      const nextDots: DotPoint[] = [];
      for (let r = 0; r < rows; r += 1) {
        const oy = offsetY + r * gap;
        for (let c = 0; c < cols; c += 1) {
          const ox = offsetX + c * gap;
          nextDots.push({ ox, oy, x: ox, y: oy, vx: 0, vy: 0 });
        }
      }
      dots = nextDots;
    }

    function drawStatic(): void {
      const p = getPalette();
      ctx!.clearRect(0, 0, width, height);
      ctx!.fillStyle = `rgba(${p.baseR}, ${p.baseG}, ${p.baseB}, ${p.baseA})`;
      ctx!.beginPath();
      for (let i = 0; i < dots.length; i += 1) {
        const d = dots[i];
        d.x = d.ox;
        d.y = d.oy;
        d.vx = 0;
        d.vy = 0;
        ctx!.moveTo(d.ox + dotSize, d.oy);
        ctx!.arc(d.ox, d.oy, dotSize, 0, Math.PI * 2);
      }
      ctx!.fill();
    }

    function stopLoop(): void {
      if (rafId !== undefined) {
        cancelAnimationFrame(rafId);
        rafId = undefined;
      }
    }

    function renderFrame(now: number): void {
      rafId = undefined;
      if (reducedMotion) {
        drawStatic();
        return;
      }

      const p = getPalette();
      const proxSq = proximity * proximity;
      const shockDuration = 680;
      const bandWidth = 54;

      // Prune expired shockwaves
      if (shockwaves.length > 0) {
        shockwaves = shockwaves.filter((sw) => now - sw.startTime < shockDuration);
      }

      ctx!.clearRect(0, 0, width, height);

      let needsNextFrame = shockwaves.length > 0;

      for (let i = 0; i < dots.length; i += 1) {
        const d = dots[i];

        // Spring force back toward origin
        let fx = (d.ox - d.x) * 0.14;
        let fy = (d.oy - d.y) * 0.14;

        let proximityFactor = 0;

        if (pointerInside) {
          const dx = d.x - pointerX;
          const dy = d.y - pointerY;
          const distSq = dx * dx + dy * dy;
          if (distSq < proxSq && distSq > 0.001) {
            const dist = Math.sqrt(distSq);
            const t = 1 - dist / proximity;
            proximityFactor = t * t;
            const push = proximityFactor * 5.2;
            fx += (dx / dist) * push;
            fy += (dy / dist) * push;
          }
        }

        let shockGlow = 0;
        for (let s = 0; s < shockwaves.length; s += 1) {
          const sw = shockwaves[s];
          const progress = (now - sw.startTime) / shockDuration;
          const waveR = progress * shockRadius;
          const dx = d.x - sw.x;
          const dy = d.y - sw.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const delta = Math.abs(dist - waveR);
          if (delta < bandWidth && dist > 0.001) {
            const ringT = (1 - delta / bandWidth) * (1 - progress);
            const push = ringT * shockStrength * 0.35;
            fx += (dx / dist) * push;
            fy += (dy / dist) * push;
            if (ringT > shockGlow) shockGlow = ringT;
          }
        }

        d.vx = (d.vx + fx) * 0.72;
        d.vy = (d.vy + fy) * 0.72;
        d.x += d.vx;
        d.y += d.vy;

        const dispX = d.x - d.ox;
        const dispY = d.y - d.oy;
        if (
          Math.abs(d.vx) > 0.015 ||
          Math.abs(d.vy) > 0.015 ||
          Math.abs(dispX) > 0.02 ||
          Math.abs(dispY) > 0.02
        ) {
          needsNextFrame = true;
        } else if (!pointerInside) {
          d.x = d.ox;
          d.y = d.oy;
          d.vx = 0;
          d.vy = 0;
        }

        const blend = Math.min(1, Math.max(proximityFactor * 0.9, shockGlow * 0.95));
        const radius = dotSize + blend * 1.15;

        if (blend > 0.01) {
          const r = Math.round(p.baseR + (p.activeR - p.baseR) * blend);
          const g = Math.round(p.baseG + (p.activeG - p.baseG) * blend);
          const b = Math.round(p.baseB + (p.activeB - p.baseB) * blend);
          const a = p.baseA + (p.activeA - p.baseA) * blend;
          ctx!.fillStyle = `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
        } else {
          ctx!.fillStyle = `rgba(${p.baseR}, ${p.baseG}, ${p.baseB}, ${p.baseA})`;
        }

        ctx!.beginPath();
        ctx!.arc(d.x, d.y, radius, 0, Math.PI * 2);
        ctx!.fill();
      }

      if (needsNextFrame) {
        rafId = requestAnimationFrame(renderFrame);
      }
    }

    function scheduleRender(): void {
      if (reducedMotion) {
        stopLoop();
        drawStatic();
        return;
      }
      if (rafId === undefined) {
        rafId = requestAnimationFrame(renderFrame);
      }
    }

    function onPointerMove(e: PointerEvent): void {
      if (reducedMotion) return;
      const rect = canvas!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x >= -proximity && x <= rect.width + proximity && y >= -proximity && y <= rect.height + proximity) {
        pointerX = x;
        pointerY = y;
        pointerInside = true;
        scheduleRender();
      } else if (pointerInside) {
        pointerInside = false;
        pointerX = -9999;
        pointerY = -9999;
        scheduleRender();
      }
    }

    function onPointerDown(e: PointerEvent): void {
      if (reducedMotion) return;
      const rect = canvas!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
        shockwaves.push({ x, y, startTime: performance.now() });
        if (shockwaves.length > 4) shockwaves.shift();
        scheduleRender();
      }
    }

    function onPointerBlur(): void {
      if (!pointerInside) return;
      pointerInside = false;
      pointerX = -9999;
      pointerY = -9999;
      scheduleRender();
    }

    function onMotionChange(e: MediaQueryListEvent): void {
      reducedMotion = e.matches;
      if (reducedMotion) {
        shockwaves = [];
        pointerInside = false;
        stopLoop();
        drawStatic();
      } else {
        scheduleRender();
      }
    }

    buildGrid();
    drawStatic();

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            buildGrid();
            if (reducedMotion) {
              drawStatic();
            } else {
              scheduleRender();
            }
          })
        : null;
    ro?.observe(canvas);

    const mo = new MutationObserver(() => {
      const nextDark = document.documentElement.classList.contains('dark');
      if (nextDark !== isDark) {
        isDark = nextDark;
        if (reducedMotion || rafId === undefined) {
          drawStatic();
        }
      }
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('blur', onPointerBlur);
    motionQuery.addEventListener('change', onMotionChange);

    return () => {
      stopLoop();
      ro?.disconnect();
      mo.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('blur', onPointerBlur);
      motionQuery.removeEventListener('change', onMotionChange);
    };
  });
</script>

<canvas
  bind:this={canvasEl}
  aria-hidden="true"
  class="pointer-events-none block h-full w-full {className}"
></canvas>
