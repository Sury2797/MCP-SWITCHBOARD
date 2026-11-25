<script lang="ts">
  import type { ClientPreset } from '../clientSnippets';

  interface Props {
    id: ClientPreset;
    size?: number;
    inverted?: boolean;
    class?: string;
  }

  let { id, size = 20, inverted = false, class: cls = '' }: Props = $props();

  const MONO_DARK_AGENTS = new Set<ClientPreset>([
    'cursor',
    'windsurf',
    'zed',
    'cline',
    'roo_code',
    'goose',
    'opencode',
    'chatgpt',
    'other',
    'web_connectors',
  ]);

  // Optical compensation only for marks with non-square bounds or internal margins
  const OPTICAL_SCALE: Partial<Record<ClientPreset, number>> = {
    continue_dev: 1.46,
    roo_code: 1.08,
    opencode: 1.06,
    amazon_q: 1.06,
  };

  const resolvedFile = $derived(id === 'web_connectors' ? 'other.svg' : `${id}.svg`);
  const src = $derived(`/icons/agents/${resolvedFile}`);
  const opticalScale = $derived(OPTICAL_SCALE[id] ?? 1);
  const clipShape = $derived(
    id === 'continue_dev' ? 'rounded-full overflow-hidden' : id === 'warp' ? 'rounded-[5px] overflow-hidden' : ''
  );
  const adaptiveFilter = $derived(
    MONO_DARK_AGENTS.has(id)
      ? inverted
        ? 'invert dark:invert-0'
        : 'invert-0 dark:invert'
      : ''
  );
</script>

<span
  aria-hidden="true"
  style="width: {size}px; height: {size}px;"
  class="inline-flex items-center justify-center shrink-0 select-none transition-transform duration-150 {clipShape} {cls}"
>
  <img
    {src}
    alt=""
    width={size}
    height={size}
    loading="eager"
    decoding="async"
    draggable="false"
    style={opticalScale !== 1 ? `transform: scale(${opticalScale});` : undefined}
    class="h-full w-full object-contain select-none {adaptiveFilter}"
  />
</span>
