import type { Action } from 'svelte/action';

/**
 * ReactBits-inspired subtle magnetic cursor pull for tactile primary CTAs.
 * Automatically no-ops on touch devices and when prefers-reduced-motion is active.
 */
export const magnet: Action<HTMLElement, number | undefined> = (node, strength = 0.16) => {
  if (typeof window === 'undefined') return {};
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!canHover || reduced) return {};

  let currentStrength = strength;
  let rafId: number | undefined;
  let targetX = 0;
  let targetY = 0;
  let curX = 0;
  let curY = 0;

  function step(): void {
    curX += (targetX - curX) * 0.22;
    curY += (targetY - curY) * 0.22;
    if (Math.abs(targetX - curX) < 0.05 && Math.abs(targetY - curY) < 0.05) {
      curX = targetX;
      curY = targetY;
      node.style.transform = curX === 0 && curY === 0 ? '' : `translate3d(${curX.toFixed(2)}px, ${curY.toFixed(2)}px, 0)`;
      rafId = undefined;
      return;
    }
    node.style.transform = `translate3d(${curX.toFixed(2)}px, ${curY.toFixed(2)}px, 0)`;
    rafId = requestAnimationFrame(step);
  }

  function schedule(): void {
    if (rafId === undefined) rafId = requestAnimationFrame(step);
  }

  function onMove(e: PointerEvent): void {
    const rect = node.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    targetX = Math.max(-4, Math.min(4, dx * currentStrength));
    targetY = Math.max(-3, Math.min(3, dy * currentStrength));
    schedule();
  }

  function onLeave(): void {
    targetX = 0;
    targetY = 0;
    schedule();
  }

  node.addEventListener('pointermove', onMove, { passive: true });
  node.addEventListener('pointerleave', onLeave, { passive: true });

  return {
    update(nextStrength = 0.16) {
      currentStrength = nextStrength;
    },
    destroy() {
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      node.style.transform = '';
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerleave', onLeave);
    },
  };
};
