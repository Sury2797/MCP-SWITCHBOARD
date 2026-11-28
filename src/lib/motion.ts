import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

export const BACKDROP_FADE = { duration: 160 } as const;
export const STEP_SLIDE = { y: 10, duration: 240, easing: cubicOut } as const;
export const SLIDING_PILL_TRANSITION =
  'transform 340ms var(--ease-glide), width 280ms var(--ease-out-expo), height 280ms var(--ease-out-expo)';

export interface SlidingIndicatorBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Measure layout offset/size relative to an offsetParent without transform-scale distortion.
 */
export function measureSlidingPill(activeEl: HTMLElement | null): SlidingIndicatorBounds | null {
  if (!activeEl || activeEl.offsetWidth <= 0) return null;
  return {
    left: activeEl.offsetLeft,
    top: activeEl.offsetTop,
    width: activeEl.offsetWidth,
    height: activeEl.offsetHeight,
  };
}

export function slidingPillStyle(bounds: SlidingIndicatorBounds, use2D = false): string {
  const y = use2D ? bounds.top : 0;
  const h = use2D ? `height: ${bounds.height}px; ` : '';
  return `width: ${bounds.width}px; ${h}transform: translate3d(${bounds.left}px, ${y}px, 0); transition: ${SLIDING_PILL_TRANSITION}; will-change: transform, width${use2D ? ', height' : ''};`;
}

export interface GlassModalParams {
  duration?: number;
  y?: number;
  startScale?: number;
}

/**
 * Unified GPU-composited modal & overlay entrance transition (translate3d + scale + opacity).
 */
export function glassModal(
  _node: Element,
  { duration = 220, y = 10, startScale = 0.972 }: GlassModalParams = {}
): TransitionConfig {
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    return { duration: 1 };
  }
  return {
    duration,
    easing: cubicOut,
    css: (t) => {
      const translateY = (1 - t) * y;
      const scale = startScale + (1 - startScale) * t;
      return `opacity: ${t}; transform: translate3d(0, ${translateY.toFixed(2)}px, 0) scale(${scale.toFixed(4)});`;
    },
  };
}
