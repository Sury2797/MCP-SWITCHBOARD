<script lang="ts">
  import { resolveServerIcon } from './iconResolver';

  interface Props {
    name?: string;
    command?: string | null;
    args?: string[] | string | null;
    url?: string | null;
    env?: Record<string, string> | string | null;
    size?: number;
    inverted?: boolean;
    class?: string;
  }

  let {
    name = '',
    command = null,
    args = null,
    url = null,
    env = null,
    size = 16,
    inverted = false,
    class: cls = '',
  }: Props = $props();

  const resolved = $derived(resolveServerIcon({ name, command, args, url, env }));

  let failedSrc = $state<string | null>(null);
  const effectiveSrc = $derived(
    failedSrc === resolved.src ? '/icons/servers/server.svg' : resolved.src
  );
  const isMonoDark = $derived(
    failedSrc === resolved.src ? false : resolved.monoDark
  );

  const adaptiveFilter = $derived(
    isMonoDark
      ? inverted
        ? 'invert dark:invert-0'
        : 'invert-0 dark:invert'
      : ''
  );

  function handleError() {
    if (resolved.src !== '/icons/servers/server.svg') {
      failedSrc = resolved.src;
    }
  }
</script>

<span
  aria-hidden="true"
  style="width: {size}px; height: {size}px;"
  class="inline-flex items-center justify-center shrink-0 select-none transition-transform duration-200 ease-[var(--ease-spring)] {cls}"
>
  {#key effectiveSrc}
    <img
      src={effectiveSrc}
      alt=""
      width={size}
      height={size}
      loading="eager"
      decoding="async"
      draggable="false"
      onerror={handleError}
      style={resolved.scale && failedSrc !== resolved.src ? `transform: scale(${resolved.scale});` : undefined}
      class="svg-icon-crisp h-full w-full object-contain select-none animate-icon-pop {adaptiveFilter} {resolved.extraClass || ''}"
    />
  {/key}
</span>
