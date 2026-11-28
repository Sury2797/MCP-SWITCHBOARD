<script lang="ts">
  import { onMount, tick } from 'svelte';

  type Placement = 'top' | 'bottom' | 'left' | 'right';

  const GAP = 10;
  const VIEWPORT_PAD = 10;
  const SHOW_DELAY_MS = 90;

  let activeEl: HTMLElement | null = null;
  let tooltipEl = $state<HTMLDivElement | null>(null);

  let visible = $state(false);
  let text = $state('');
  let placement = $state<Placement>('top');
  let posX = $state(-9999);
  let posY = $state(-9999);
  let arrowOffset = $state(0);

  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  function restoreNativeTitle(el: HTMLElement | null): void {
    if (!el) return;
    const saved = el.dataset.uiverseTitle;
    if (saved !== undefined) {
      if (el.isConnected && !el.hasAttribute('title')) {
        el.setAttribute('title', saved);
      }
      delete el.dataset.uiverseTitle;
    }
  }

  function readTooltipText(el: HTMLElement): string {
    const explicit = el.getAttribute('data-tooltip');
    if (explicit !== null) return explicit.trim();

    if (el.hasAttribute('title')) {
      const raw = (el.getAttribute('title') ?? '').trim();
      if (raw) {
        el.dataset.uiverseTitle = raw;
        el.removeAttribute('title');
      }
      return raw;
    }

    return (el.dataset.uiverseTitle ?? '').trim();
  }

  function findTrigger(node: EventTarget | null): HTMLElement | null {
    if (!(node instanceof Element)) return null;
    const el = node.closest('[data-tooltip], [title], [data-uiverse-title]');
    return el instanceof HTMLElement ? el : null;
  }

  function computePosition(): void {
    if (!activeEl || !tooltipEl || !activeEl.isConnected) {
      visible = false;
      return;
    }

    const triggerRect = activeEl.getBoundingClientRect();
    if (triggerRect.width === 0 && triggerRect.height === 0) {
      visible = false;
      return;
    }

    const tipRect = tooltipEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const preferred = (activeEl.getAttribute('data-tooltip-placement') as Placement | null) ?? 'top';

    const spaceAbove = triggerRect.top - VIEWPORT_PAD;
    const spaceBelow = vh - triggerRect.bottom - VIEWPORT_PAD;
    const spaceLeft = triggerRect.left - VIEWPORT_PAD;
    const spaceRight = vw - triggerRect.right - VIEWPORT_PAD;

    let resolved: Placement = preferred;
    if (preferred === 'top' && spaceAbove < tipRect.height + GAP && spaceBelow >= tipRect.height + GAP) {
      resolved = 'bottom';
    } else if (preferred === 'bottom' && spaceBelow < tipRect.height + GAP && spaceAbove >= tipRect.height + GAP) {
      resolved = 'top';
    } else if (preferred === 'left' && spaceLeft < tipRect.width + GAP && spaceRight >= tipRect.width + GAP) {
      resolved = 'right';
    } else if (preferred === 'right' && spaceRight < tipRect.width + GAP && spaceLeft >= tipRect.width + GAP) {
      resolved = 'left';
    }

    placement = resolved;

    const triggerCenterX = triggerRect.left + triggerRect.width / 2;
    const triggerCenterY = triggerRect.top + triggerRect.height / 2;

    if (resolved === 'top' || resolved === 'bottom') {
      const rawLeft = triggerCenterX - tipRect.width / 2;
      const clampedLeft = Math.max(
        VIEWPORT_PAD,
        Math.min(rawLeft, vw - VIEWPORT_PAD - tipRect.width)
      );
      posX = Math.round(clampedLeft);
      posY = Math.round(
        resolved === 'top'
          ? Math.max(VIEWPORT_PAD, triggerRect.top - tipRect.height - GAP)
          : Math.min(vh - VIEWPORT_PAD - tipRect.height, triggerRect.bottom + GAP)
      );
      const minArrow = 12;
      const maxArrow = Math.max(minArrow, tipRect.width - 12);
      arrowOffset = Math.round(Math.max(minArrow, Math.min(triggerCenterX - clampedLeft, maxArrow)));
    } else {
      const rawTop = triggerCenterY - tipRect.height / 2;
      const clampedTop = Math.max(
        VIEWPORT_PAD,
        Math.min(rawTop, vh - VIEWPORT_PAD - tipRect.height)
      );
      posY = Math.round(clampedTop);
      posX = Math.round(
        resolved === 'left'
          ? Math.max(VIEWPORT_PAD, triggerRect.left - tipRect.width - GAP)
          : Math.min(vw - VIEWPORT_PAD - tipRect.width, triggerRect.right + GAP)
      );
      const minArrow = 10;
      const maxArrow = Math.max(minArrow, tipRect.height - 10);
      arrowOffset = Math.round(Math.max(minArrow, Math.min(triggerCenterY - clampedTop, maxArrow)));
    }
  }

  async function showFor(el: HTMLElement, immediate = false): Promise<void> {
    clearTimeout(hideTimer);
    clearTimeout(showTimer);

    const content = readTooltipText(el);
    if (!content) {
      hideImmediate();
      return;
    }

    if (activeEl && activeEl !== el) {
      restoreNativeTitle(activeEl);
    }
    activeEl = el;

    const run = async () => {
      if (activeEl !== el || !el.isConnected) return;
      text = content;
      visible = true;
      await tick();
      computePosition();
    };

    if (immediate || visible) {
      await run();
    } else {
      showTimer = setTimeout(() => {
        void run();
      }, SHOW_DELAY_MS);
    }
  }

  function hideImmediate(): void {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    visible = false;
    restoreNativeTitle(activeEl);
    activeEl = null;
  }

  function scheduleHide(): void {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      visible = false;
      restoreNativeTitle(activeEl);
      activeEl = null;
    }, 60);
  }

  onMount(() => {
    const onPointerOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const trigger = findTrigger(e.target);
      if (!trigger) return;
      if (trigger === activeEl && visible) {
        clearTimeout(hideTimer);
        return;
      }
      void showFor(trigger, false);
    };

    const onPointerOut = (e: PointerEvent) => {
      if (!activeEl) return;
      const next = e.relatedTarget instanceof Node ? e.relatedTarget : null;
      if (next && activeEl.contains(next)) return;
      const nextTrigger = findTrigger(next);
      if (nextTrigger && nextTrigger !== activeEl) {
        void showFor(nextTrigger, true);
        return;
      }
      scheduleHide();
    };

    const onFocusIn = (e: FocusEvent) => {
      const trigger = findTrigger(e.target);
      if (!trigger || !trigger.matches(':focus-visible')) return;
      void showFor(trigger, true);
    };

    const onFocusOut = () => {
      scheduleHide();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && visible) {
        hideImmediate();
      }
    };

    const onDismiss = () => {
      if (visible || activeEl) hideImmediate();
    };

    document.addEventListener('pointerover', onPointerOver, { passive: true });
    document.addEventListener('pointerout', onPointerOut, { passive: true });
    document.addEventListener('focusin', onFocusIn, { passive: true });
    document.addEventListener('focusout', onFocusOut, { passive: true });
    document.addEventListener('pointerdown', onDismiss, { capture: true, passive: true });
    document.addEventListener('scroll', onDismiss, { capture: true, passive: true });
    window.addEventListener('resize', onDismiss, { passive: true });
    window.addEventListener('blur', onDismiss);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      hideImmediate();
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('pointerdown', onDismiss, { capture: true });
      document.removeEventListener('scroll', onDismiss, { capture: true });
      window.removeEventListener('resize', onDismiss);
      window.removeEventListener('blur', onDismiss);
      window.removeEventListener('keydown', onKeyDown);
    };
  });
</script>

<div
  bind:this={tooltipEl}
  role="tooltip"
  aria-hidden={!visible}
  data-placement={placement}
  data-open={visible ? 'true' : 'false'}
  style="left: {posX}px; top: {posY}px; --tip-arrow-pos: {arrowOffset}px;"
  class="uiverse-tooltip pointer-events-none fixed z-[9999] select-none"
>
  <span class="uiverse-tooltip-text">{text}</span>
  <span class="uiverse-tooltip-arrow" aria-hidden="true"></span>
</div>
