<script lang="ts">
  import { resolveServerIcon } from './iconResolver';

  interface Props {
    name?: string;
    command?: string | null;
    args?: string[] | string | null;
    url?: string | null;
    size?: number;
    inverted?: boolean;
    class?: string;
  }

  let {
    name = '',
    command = null,
    args = null,
    url = null,
    size = 16,
    inverted = false,
    class: cls = '',
  }: Props = $props();

  const resolved = $derived(resolveServerIcon({ name, command, args, url }));

  let failedSrc = $state<string | null>(null);
  const effectiveSrc = $derived(
    failedSrc === resolved.src ? '/icons/servers/server.png' : resolved.src
  );
  const isMonoDark = $derived(
    failedSrc === resolved.src ? true : resolved.monoDark
  );

  const adaptiveFilter = $derived(
    isMonoDark
      ? inverted
        ? 'invert dark:invert-0'
        : 'invert-0 dark:invert'
      : ''
  );

  function handleError() {
    if (resolved.src !== '/icons/servers/server.png') {
      failedSrc = resolved.src;
    }
  }
</script>

<span
  aria-hidden="true"
  style="width: {size}px; height: {size}px;"
  class="inline-flex items-center justify-center shrink-0 select-none transition-transform duration-150 {cls}"
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
      class="h-full w-full object-contain select-none transition-opacity duration-150 {adaptiveFilter} {resolved.extraClass || ''}"
    />
  {/key}
</span>
