import type { Action } from 'svelte/action';

/**
 * ReactBits SpotlightCard cursor catchlight action (subdued graphite specular sheen).
 * Strictly no-ops on touch devices or when prefers-reduced-motion is active.
 */
export const spotlight: Action<HTMLElement> = (node) => {
  if (typeof window === 'undefined') return {};
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!canHover || reduced) return {};

  node.classList.add('spotlight-surface');

  const onMove = (e: PointerEvent): void => {
    const rect = node.getBoundingClientRect();
    node.style.setProperty('--spot-x', `${Math.round(e.clientX - rect.left)}px`);
    node.style.setProperty('--spot-y', `${Math.round(e.clientY - rect.top)}px`);
    node.style.setProperty('--spot-opacity', '1');
  };

  const onLeave = (): void => {
    node.style.setProperty('--spot-opacity', '0');
  };

  node.addEventListener('pointermove', onMove, { passive: true });
  node.addEventListener('pointerleave', onLeave, { passive: true });

  return {
    destroy() {
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerleave', onLeave);
      node.style.removeProperty('--spot-x');
      node.style.removeProperty('--spot-y');
      node.style.removeProperty('--spot-opacity');
      node.classList.remove('spotlight-surface');
    },
  };
};
