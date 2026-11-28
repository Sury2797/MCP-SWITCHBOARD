<script lang="ts">
  import { fade } from 'svelte/transition';
  import { tick, onDestroy } from 'svelte';
  import StreamlineIcon from '../lib/icons/StreamlineIcon.svelte';
  import AgentIcon from '../lib/icons/AgentIcon.svelte';
  import Button from '../lib/primitives/Button.svelte';
  import SegmentedControl from '../lib/primitives/SegmentedControl.svelte';
  import { glassModal, BACKDROP_FADE } from '../lib/motion';
  import { buildClientGuide, CLIENT_TABS, type ClientPreset, type ClientCategory } from '../lib/clientSnippets';
  import { HELP_CATEGORIES, HELP_TOPICS, resolveTopicCommand, type HelpCategory } from '../lib/helpGuide';
  import { detectPlatform, type PlatformId } from '../lib/platform';
  import { api } from '../lib/api';
  import type { DiagnosticsReport, TunnelState } from '../lib/types';

  interface Props {
    open?: boolean;
    port?: number;
    tunnel?: TunnelState | null;
    mcpAuthToken?: string;
    onReplayOnboarding?: () => void;
    onClose?: () => void;
    onNotify?: (message: string, type?: 'info' | 'error') => void;
  }

  let {
    open = false,
    port = 8000,
    tunnel = null,
    mcpAuthToken = '',
    onReplayOnboarding = () => {},
    onClose = () => {},
    onNotify = () => {},
  }: Props = $props();

  let dialogEl = $state<HTMLDivElement | null>(null);
  let diag = $state<DiagnosticsReport | null>(null);
  let diagLoading = $state(false);
  let selectedClient = $state<ClientPreset>('claude_code');
  let selectedModeId = $state<string>('');
  let searchQuery = $state('');
  let activeCategory = $state<'All' | ClientCategory>('All');
  let activeTab = $state<'clients' | 'diagnostics' | 'help'>('clients');
  let helpSearchQuery = $state('');
  let activeHelpCategory = $state<'All' | HelpCategory>('All');
  let helpPlatform = $state<PlatformId>(detectPlatform());
  let helpPlatformOverridden = $state(false);
  let copiedKey = $state<string | null>(null);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  let probeState = $state<{ status: 'idle' | 'probing' | 'ok' | 'error'; detail: string }>({
    status: 'idle',
    detail: '',
  });

  onDestroy(() => {
    clearTimeout(copiedTimer);
  });

  const localHttpUrl = $derived(`http://127.0.0.1:${port || 8000}/mcp`);
  const localSseUrl = $derived(`http://127.0.0.1:${port || 8000}/sse`);
  const remoteUrl = $derived(tunnel?.publicUrl || 'https://<your-tunnel>.trycloudflare.com/mcp');
  const activeToken = $derived(String(mcpAuthToken || '').trim());
  const tunnelLive = $derived(tunnel?.status === 'live' && !!tunnel.publicUrl);

  const clientGuide = $derived(
    buildClientGuide(selectedClient, {
      localHttpUrl,
      localSseUrl,
      remoteUrl,
      authToken: activeToken,
    })
  );

  const selectedMeta = $derived(CLIENT_TABS.find((c) => c.id === selectedClient) || CLIENT_TABS[0]);

  const activeGuide = $derived.by(() => {
    const modes = clientGuide.modes;
    if (modes && modes.length > 0) {
      return modes.find((m) => m.id === selectedModeId) || modes[0];
    }
    return {
      id: 'default',
      label: 'Default',
      subtitle: clientGuide.subtitle,
      fileHint: clientGuide.fileHint,
      snippet: clientGuide.snippet,
      copyLabel: clientGuide.copyLabel,
      warning: clientGuide.warning,
      requiresTunnel: selectedMeta.requiresTunnel,
    };
  });

  const needsTunnel = $derived(Boolean(activeGuide.requiresTunnel ?? selectedMeta.requiresTunnel));

  function isCurrentPlatform(platformKey?: 'win32' | 'darwin' | 'linux', osLabel?: string): boolean {
    const p = detectPlatform(diag?.platform);
    if (!platformKey) return false;
    if (platformKey === p) return true;
    if (osLabel === 'macOS / Linux' && (p === 'darwin' || p === 'linux')) return true;
    return false;
  }

  const sortedOsPaths = $derived.by(() => {
    const paths = selectedMeta.osPaths ?? [];
    return [...paths].sort((a, b) => {
      const aMatch = isCurrentPlatform(a.platformKey, a.os) ? 0 : 1;
      const bMatch = isCurrentPlatform(b.platformKey, b.os) ? 0 : 1;
      return aMatch - bMatch;
    });
  });

  const CATEGORIES: Array<'All' | ClientCategory> = ['All', 'IDE', 'CLI Agent', 'Desktop & Web', 'Universal'];
  const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c, label: c }));
  const HELP_CATEGORY_OPTIONS = HELP_CATEGORIES.map((c) => ({ value: c, label: c }));
  const PLATFORM_OPTIONS = [
    { value: 'win32', label: 'Windows' },
    { value: 'darwin', label: 'macOS' },
    { value: 'linux', label: 'Linux' },
  ];

  const filteredClients = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    return CLIENT_TABS.filter((c) => {
      if (activeCategory !== 'All' && c.category !== activeCategory) return false;
      if (
        q &&
        !c.label.toLowerCase().includes(q) &&
        !c.id.toLowerCase().includes(q) &&
        !(c.keywords?.some((k) => k.toLowerCase().includes(q)))
      ) {
        return false;
      }
      return true;
    });
  });

  const filteredHelpTopics = $derived.by(() => {
    const q = helpSearchQuery.trim().toLowerCase();
    return HELP_TOPICS.filter((t) => {
      if (activeHelpCategory !== 'All' && t.category !== activeHelpCategory) return false;
      if (!q) return true;
      const resolved = resolveTopicCommand(t, helpPlatform);
      return (
        t.title.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q) ||
        t.bullets.some((b) => b.toLowerCase().includes(q)) ||
        (resolved.command ? resolved.command.toLowerCase().includes(q) : false)
      );
    });
  });

  const installedCount = $derived(diag?.items ? diag.items.filter((i) => i.installed).length : 0);

  async function loadDiagnostics(): Promise<void> {
    diagLoading = true;
    try {
      diag = await api.getDiagnostics();
      if (diag?.platform && !helpPlatformOverridden) {
        helpPlatform = detectPlatform(diag.platform);
      }
    } catch {
      diag = null;
    } finally {
      diagLoading = false;
    }
  }

  $effect(() => {
    if (open) {
      probeState = { status: 'idle', detail: '' };
      copiedKey = null;
      void loadDiagnostics();
      void tick().then(() => dialogEl?.focus());
    }
  });

  async function testEndpointLive(): Promise<void> {
    probeState = { status: 'probing', detail: 'Probing local MCP endpoint (tools/list)…' };
    try {
      const res = await fetch(localHttpUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      });
      if (!res.ok) {
        probeState = { status: 'error', detail: `HTTP ${res.status} from ${localHttpUrl}` };
        return;
      }
      const data = (await res.json()) as { result?: { tools?: unknown[] } };
      const count = Array.isArray(data?.result?.tools) ? data.result.tools.length : 0;
      probeState = {
        status: 'ok',
        detail:
          count > 0
            ? `Endpoint live · ${count} ${count === 1 ? 'tool' : 'tools'} callable now`
            : 'Endpoint live · 0 tools active (toggle any server ON)',
      };
    } catch (err) {
      probeState = {
        status: 'error',
        detail: err instanceof Error ? err.message : 'Unable to reach /mcp endpoint',
      };
    }
  }

  function handleKey(e: KeyboardEvent): void {
    if (open && e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  async function copyText(key: string, label: string, text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      copiedKey = key;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
        copiedKey = null;
      }, 1600);
      onNotify(`Copied ${label}`);
    } catch {
      onNotify('Unable to access clipboard', 'error');
    }
  }

  const platformSummary = $derived.by(() => {
    const p = diag?.platform;
    if (p === 'win32') return `Windows (${diag?.arch || 'x64'})`;
    if (p === 'darwin') return `macOS (${diag?.arch || 'arm64'})`;
    if (p === 'linux') return `Linux (${diag?.arch || 'x64'})`;
    return p ? `${p} (${diag?.arch || ''})` : 'Detecting…';
  });
</script>

<svelte:window onkeydown={handleKey} />

{#if open}
  <div
    transition:fade={BACKDROP_FADE}
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
  >
    <button
      type="button"
      aria-label="Close overlay"
      onclick={onClose}
      class="fixed inset-0 cursor-default bg-transparent"
      tabindex="-1"
    ></button>

    <div
      bind:this={dialogEl}
      transition:glassModal
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-guide-title"
      tabindex="-1"
      class="board-glass-modal relative z-10 w-[94vw] max-w-[1060px] h-[min(88vh,780px)] rounded-2xl border border-graphite-200/80 dark:border-white/[0.09] flex flex-col focus:outline-none overflow-hidden"
    >
      <!-- Header -->
      <header class="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-graphite-200/80 dark:border-white/[0.08] px-5 py-3.5">
        <div class="flex items-center gap-3 min-w-0">
          <div class="flex h-8 w-8 items-center justify-center rounded-xl border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/90 dark:bg-white/[0.05] text-graphite-700 dark:text-graphite-200 shrink-0 shadow-xs">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" aria-hidden="true">
              <path d="M15.688 2.343a2.588 2.588 0 00-3.61 0l-9.626 9.44a.863.863 0 01-1.203 0 .823.823 0 010-1.18l9.626-9.44a4.313 4.313 0 016.016 0 4.116 4.116 0 011.204 3.54 4.3 4.3 0 013.609 1.18l.05.05a4.115 4.115 0 010 5.9l-8.706 8.537a.274.274 0 000 .393l1.788 1.754a.823.823 0 010 1.18.863.863 0 01-1.203 0l-1.788-1.753a1.92 1.92 0 010-2.754l8.706-8.538a2.47 2.47 0 000-3.54l-.05-.049a2.588 2.588 0 00-3.607-.003l-7.172 7.034-.002.002-.098.097a.863.863 0 01-1.204 0 .823.823 0 010-1.18l7.273-7.133a2.47 2.47 0 00-.003-3.537z" />
              <path d="M14.485 4.703a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a4.115 4.115 0 000 5.9 4.314 4.314 0 006.016 0l7.12-6.982a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a2.588 2.588 0 01-3.61 0 2.47 2.47 0 010-3.54l7.12-6.982z" />
            </svg>
          </div>
          <div class="min-w-0">
            <h2 id="connect-guide-title" class="text-sm font-semibold tracking-[-0.01em] text-graphite-950 dark:text-graphite-50 truncate">
              MCPS Connection
            </h2>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0 flex-wrap">
          <SegmentedControl
            options={[
              { value: 'clients', label: 'Connect Clients', count: CLIENT_TABS.length },
              { value: 'diagnostics', label: 'Diagnostics' },
              { value: 'help', label: 'Help & FAQ', count: HELP_TOPICS.length },
            ]}
            value={activeTab}
            onchange={(v) => (activeTab = v as 'clients' | 'diagnostics' | 'help')}
            ariaLabel="Guide section"
          />
          <Button variant="secondary" size="xs" onclick={onReplayOnboarding} title="Open interactive Setup Walkthrough">
            <StreamlineIcon name="HelpCircle" size={12} />
            <span>Setup Walkthrough</span>
          </Button>
          <Button variant="ghost" size="xs" iconOnly onclick={onClose} aria-label="Close MCPS Connection">
            <StreamlineIcon name="X" size={13} />
          </Button>
        </div>
      </header>

      <!-- Body -->
      <div class="flex-1 min-h-0 flex flex-col overflow-y-auto md:overflow-hidden">
        {#if activeTab === 'clients'}
          <!-- Quick-Copy Endpoint Pills -->
          <div class="shrink-0 border-b border-graphite-200/80 dark:border-white/[0.08] px-5 py-3">
            <div class="flex flex-wrap items-center justify-between gap-2.5">
              <div class="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                <div class="flex items-center gap-1.5 rounded-lg border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/85 dark:bg-white/[0.04] px-2.5 py-1.5 min-w-0 max-w-full">
                  <span class="text-[10px] font-semibold uppercase tracking-wider text-graphite-500 dark:text-graphite-400 shrink-0">HTTP</span>
                  <code class="font-mono text-[11px] text-graphite-800 dark:text-graphite-200 select-all truncate">{localHttpUrl}</code>
                  <button
                    type="button"
                    class="ml-0.5 shrink-0 text-graphite-400 hover:text-graphite-700 dark:hover:text-graphite-200 transition-colors p-0.5 rounded"
                    onclick={() => copyText('http-url', 'Streamable HTTP URL', localHttpUrl)}
                    aria-label="Copy HTTP URL"
                  >
                    <StreamlineIcon name={copiedKey === 'http-url' ? 'Check' : 'Copy'} size={11} />
                  </button>
                </div>

                <div class="flex items-center gap-1.5 rounded-lg border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/85 dark:bg-white/[0.04] px-2.5 py-1.5 min-w-0 max-w-full">
                  <span class="text-[10px] font-semibold uppercase tracking-wider text-graphite-500 dark:text-graphite-400 shrink-0">SSE</span>
                  <code class="font-mono text-[11px] text-graphite-800 dark:text-graphite-200 select-all truncate">{localSseUrl}</code>
                  <button
                    type="button"
                    class="ml-0.5 shrink-0 text-graphite-400 hover:text-graphite-700 dark:hover:text-graphite-200 transition-colors p-0.5 rounded"
                    onclick={() => copyText('sse-url', 'Legacy SSE URL', localSseUrl)}
                    aria-label="Copy SSE URL"
                  >
                    <StreamlineIcon name={copiedKey === 'sse-url' ? 'Check' : 'Copy'} size={11} />
                  </button>
                </div>

                {#if tunnelLive}
                  <div class="flex items-center gap-1.5 rounded-lg border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/85 dark:bg-white/[0.04] px-2.5 py-1.5 min-w-0 max-w-full">
                    <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                    <span class="text-[10px] font-semibold uppercase tracking-wider text-graphite-500 dark:text-graphite-400 shrink-0">HTTPS</span>
                    <code class="font-mono text-[11px] text-graphite-800 dark:text-graphite-200 select-all max-w-[260px] truncate">{tunnel?.publicUrl}</code>
                    <button
                      type="button"
                      class="ml-0.5 shrink-0 text-graphite-400 hover:text-graphite-700 dark:hover:text-graphite-200 transition-colors p-0.5 rounded"
                      onclick={() => copyText('https-url', 'HTTPS Tunnel URL', tunnel?.publicUrl || '')}
                      aria-label="Copy HTTPS URL"
                    >
                      <StreamlineIcon name={copiedKey === 'https-url' ? 'Check' : 'Copy'} size={11} />
                    </button>
                  </div>
                {/if}
              </div>

              <div class="flex items-center gap-2 shrink-0">
                {#if activeToken}
                  <span class="inline-flex items-center gap-1 rounded-full border border-graphite-200 dark:border-white/[0.1] bg-white/60 dark:bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-medium text-graphite-600 dark:text-graphite-300 shrink-0">
                    Bearer active
                  </span>
                {/if}
                <Button variant="secondary" size="xs" onclick={testEndpointLive} disabled={probeState.status === 'probing'} class="relative">
                  {#if probeState.status === 'probing'}
                    <span class="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
                      <span class="connect-ring-pulse absolute inset-0 rounded-full border border-amber-500/70"></span>
                      <span class="h-2 w-2 rounded-full border-[1.5px] border-amber-500/25 border-t-amber-600 dark:border-t-amber-300 connect-arc-spin"></span>
                    </span>
                  {:else}
                    <StreamlineIcon name="RefreshCw" size={11} />
                  {/if}
                  <span>{probeState.status === 'probing' ? 'Probing…' : 'Test Live'}</span>
                </Button>
              </div>
            </div>

            {#if probeState.status !== 'idle'}
              <div
                aria-live="polite"
                class="relative mt-2.5 flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors {probeState.status === 'error'
                  ? 'border-rose-500/35 bg-rose-500/10 text-rose-800 dark:text-rose-300'
                  : probeState.status === 'probing'
                    ? 'connect-shimmer border-amber-500/35 bg-amber-500/[0.08] text-graphite-800 dark:text-graphite-200'
                    : 'border-emerald-500/30 bg-emerald-500/[0.06] text-graphite-800 dark:text-graphite-100'}"
              >
                <div class="flex items-center gap-2 min-w-0">
                  {#if probeState.status === 'ok'}
                    <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_6px_rgba(16,185,129,0.55)]"></span>
                  {:else if probeState.status === 'probing'}
                    <span class="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
                      <span class="connect-ring-pulse absolute inset-0 rounded-full border border-amber-500/60"></span>
                      <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                    </span>
                  {:else}
                    <StreamlineIcon name="XCircle" size={13} class="shrink-0 text-rose-500" />
                  {/if}
                  <span class="truncate">{probeState.detail}</span>
                </div>
                {#if probeState.status === 'error'}
                  <button
                    type="button"
                    onclick={testEndpointLive}
                    class="text-[11px] font-medium underline underline-offset-2 shrink-0 hover:opacity-80"
                  >
                    Retry
                  </button>
                {/if}
              </div>
            {/if}
          </div>

          <!-- Master-Detail 2-Column Layout -->
          <div class="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[278px_1fr]">
            <!-- Left Sidebar -->
            <div class="border-b md:border-b-0 md:border-r border-graphite-200/80 dark:border-white/[0.08] p-3.5 flex flex-col gap-2.5 md:overflow-y-auto overscroll-contain">
              <div class="relative">
                <StreamlineIcon
                  name="Search"
                  size={12}
                  class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-graphite-400 dark:text-graphite-500"
                />
                <input
                  type="text"
                  placeholder="Search {CLIENT_TABS.length} clients…"
                  bind:value={searchQuery}
                  aria-label="Filter AI clients"
                  class="w-full h-8 rounded-lg border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/80 dark:bg-white/[0.04] pl-8 pr-7 text-xs text-graphite-900 dark:text-graphite-100 placeholder:text-graphite-400 dark:placeholder:text-graphite-500 focus:outline-none focus:border-graphite-900 dark:focus:border-white/50 focus:ring-2 focus:ring-graphite-900/15 dark:focus:ring-white/15 transition-colors"
                />
                {#if searchQuery}
                  <button
                    type="button"
                    onclick={() => (searchQuery = '')}
                    aria-label="Clear client search"
                    class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-graphite-400 hover:text-graphite-700 dark:hover:text-graphite-200"
                  >
                    <StreamlineIcon name="X" size={10} />
                  </button>
                {/if}
              </div>

              <SegmentedControl
                options={CATEGORY_OPTIONS}
                value={activeCategory}
                size="xs"
                wrap={true}
                ariaLabel="Client category filter"
                onchange={(v) => (activeCategory = v as 'All' | ClientCategory)}
              />

              <div class="space-y-1 flex-1 min-h-0">
                {#if filteredClients.length === 0}
                  <div class="rounded-xl border border-graphite-200/80 dark:border-white/[0.08] p-3 text-center space-y-2">
                    <p class="text-[11px] text-graphite-500 dark:text-graphite-400">No clients match "{searchQuery}".</p>
                    <Button
                      variant="secondary"
                      size="xs"
                      onclick={() => {
                        searchQuery = '';
                        activeCategory = 'All';
                        selectedClient = 'other';
                      }}
                    >
                      <span>Select Other (Any Client)</span>
                    </Button>
                  </div>
                {:else}
                  {#each filteredClients as client (client.id)}
                    {@const isSelected = selectedClient === client.id}
                    <button
                      type="button"
                      onclick={() => {
                        selectedClient = client.id;
                        selectedModeId = '';
                      }}
                      class="w-full text-left rounded-xl px-2.5 py-2 flex items-center gap-2.5 transition-all duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite-950/35 dark:focus-visible:ring-white/40 {isSelected
                        ? 'bg-graphite-950 text-white dark:bg-white dark:text-graphite-950 shadow-xs'
                        : 'hover:bg-graphite-100/80 dark:hover:bg-white/[0.06] text-graphite-800 dark:text-graphite-200'}"
                    >
                      <AgentIcon
                        id={client.id}
                        size={19}
                        inverted={isSelected}
                      />
                      <span class="text-xs font-medium truncate flex-1">{client.label}</span>
                      <span
                        class="font-mono text-[9.5px] px-1.5 py-0.5 rounded shrink-0 {isSelected
                          ? 'bg-white/20 dark:bg-graphite-950/15 text-white/90 dark:text-graphite-950/85'
                          : 'bg-graphite-100 dark:bg-white/[0.06] text-graphite-500 dark:text-graphite-400'}"
                      >
                        {client.transport}
                      </span>
                    </button>
                  {/each}
                {/if}
              </div>
            </div>

            <!-- Right Detail Pane -->
            <div class="p-5 sm:p-6 space-y-4 md:overflow-y-auto overscroll-contain">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-3.5 min-w-0">
                  <div class="flex items-center justify-center h-12 w-12 rounded-xl border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/90 dark:bg-white/[0.05] shrink-0 shadow-xs">
                    <AgentIcon id={selectedMeta.id} size={28} class="text-graphite-800 dark:text-graphite-200" />
                  </div>
                  <div class="min-w-0">
                    <h3 class="text-base font-semibold tracking-[-0.015em] text-graphite-950 dark:text-graphite-50 truncate">
                      {selectedMeta.label}
                    </h3>
                    <div class="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span class="rounded-md border border-graphite-200/80 dark:border-white/[0.1] bg-graphite-100/70 dark:bg-white/[0.05] px-2 py-0.5 font-mono text-[10px] font-medium text-graphite-700 dark:text-graphite-300">
                        {selectedMeta.badge}
                      </span>
                      <span class="font-mono text-[10.5px] text-graphite-500 dark:text-graphite-400">
                        {selectedMeta.category}
                      </span>
                      {#if needsTunnel}
                        <span
                          class="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] {tunnelLive
                            ? 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300'
                            : 'border-amber-500/35 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300'}"
                        >
                          <span class="h-1.5 w-1.5 rounded-full {tunnelLive ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
                          <span>{tunnelLive ? 'Tunnel live' : 'Needs Tunnel ON'}</span>
                        </span>
                      {/if}
                    </div>
                  </div>
                </div>

                {#if clientGuide.modes && clientGuide.modes.length > 1}
                  <SegmentedControl
                    size="sm"
                    options={clientGuide.modes.map((m) => ({ value: m.id, label: m.label }))}
                    value={activeGuide.id}
                    ariaLabel="Connection method"
                    onchange={(v) => (selectedModeId = v)}
                  />
                {/if}
              </div>

              <p class="text-xs text-graphite-600 dark:text-graphite-300 leading-relaxed">
                {activeGuide.subtitle}
              </p>

              {#if needsTunnel && !tunnelLive}
                <div class="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3.5 py-2.5 text-[11px] text-amber-800 dark:text-amber-200">
                  <StreamlineIcon name="Info" size={13} class="shrink-0 mt-0.5 text-amber-600 dark:text-amber-300" />
                  <span class="leading-relaxed">
                    Remote HTTPS Tunnel is currently offline. Turn on the <strong>Tunnel</strong> switch in the top bar to generate your live <code class="font-mono">https://.../mcp</code> URL.
                  </span>
                </div>
              {/if}

              {#if clientGuide.info}
                <div class="flex items-start gap-2 rounded-xl border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/80 dark:bg-white/[0.04] px-3.5 py-2.5 text-[11px] text-graphite-700 dark:text-graphite-300">
                  <StreamlineIcon name="Info" size={13} class="shrink-0 mt-0.5 text-graphite-500 dark:text-graphite-400" />
                  <span class="leading-relaxed">{clientGuide.info}</span>
                </div>
              {/if}

              {#if activeGuide.warning}
                <div class="flex items-start gap-2 rounded-xl border border-graphite-300 dark:border-white/[0.12] bg-graphite-50/80 dark:bg-white/[0.04] px-3.5 py-2.5 text-[11px] text-graphite-700 dark:text-graphite-300">
                  <StreamlineIcon name="ShieldAlert" size={13} class="shrink-0 mt-0.5 text-graphite-500 dark:text-graphite-400" />
                  <span class="leading-relaxed">{activeGuide.warning}</span>
                </div>
              {/if}

              <!-- Snippet Code Block -->
              <div class="rounded-xl border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/80 dark:bg-white/[0.03] p-4">
                <div class="flex items-center justify-between mb-2.5 gap-2">
                  <span class="font-mono text-[10.5px] uppercase tracking-wider text-graphite-500 dark:text-graphite-400 truncate">
                    {activeGuide.fileHint}
                  </span>
                  <Button
                    variant="secondary"
                    size="xs"
                    onclick={() => copyText('snippet', activeGuide.copyLabel, activeGuide.snippet)}
                  >
                    <StreamlineIcon name={copiedKey === 'snippet' ? 'Check' : 'Copy'} size={11} />
                    <span>{copiedKey === 'snippet' ? 'Copied' : 'Copy'}</span>
                  </Button>
                </div>
                <pre class="font-mono text-xs leading-relaxed text-graphite-800 dark:text-graphite-200 overflow-x-auto whitespace-pre-wrap [overflow-wrap:anywhere] select-all max-h-64">{activeGuide.snippet}</pre>
              </div>

              <!-- OS Config File Paths -->
              <div class="rounded-xl border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/60 dark:bg-white/[0.02] px-4 py-3 space-y-2">
                <span class="font-mono text-[10px] uppercase tracking-wider text-graphite-500 dark:text-graphite-400 block">
                  Config File Locations
                </span>
                <div class="space-y-1.5">
                  {#each sortedOsPaths as loc (loc.os)}
                    {@const isThisOs = isCurrentPlatform(loc.platformKey, loc.os)}
                    <div class="flex items-center justify-between gap-2 text-[11px]">
                      <div class="min-w-0 flex-1 [overflow-wrap:anywhere]">
                        <span class="font-medium text-graphite-800 dark:text-graphite-200">{loc.os}:</span>
                        {#if isThisOs}
                          <span class="ml-1 inline-flex items-center rounded border border-emerald-500/30 bg-emerald-500/[0.08] px-1.5 py-0 font-mono text-[9.5px] font-medium text-emerald-700 dark:text-emerald-300 align-middle">
                            This OS
                          </span>
                        {/if}
                        <code class="ml-1 font-mono text-[10.5px] text-graphite-600 dark:text-graphite-400 select-all">{loc.path}</code>
                      </div>
                      <button
                        type="button"
                        class="shrink-0 text-graphite-400 hover:text-graphite-700 dark:hover:text-graphite-200 transition-colors p-1 rounded"
                        onclick={() => copyText(`path-${loc.os}`, `${selectedMeta.label} ${loc.os} path`, loc.path)}
                        aria-label="Copy {loc.os} path"
                      >
                        <StreamlineIcon name={copiedKey === `path-${loc.os}` ? 'Check' : 'Copy'} size={11} />
                      </button>
                    </div>
                  {/each}
                </div>
              </div>

              {#if activeToken}
                <p class="text-[11px] text-graphite-500 dark:text-graphite-400 flex items-center gap-1.5">
                  <StreamlineIcon name="ShieldAlert" size={12} class="shrink-0" />
                  <span>Snippets above include Bearer authentication headers from your Settings token.</span>
                </p>
              {/if}
            </div>
          </div>

        {:else if activeTab === 'diagnostics'}
          <!-- System Diagnostics Tab -->
          <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-5">
            <div class="flex flex-wrap items-center justify-between gap-2.5">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-xs font-semibold text-graphite-900 dark:text-graphite-100">Runtime Prerequisites</span>
                <span class="rounded-md border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/80 dark:bg-white/[0.04] px-2 py-0.5 font-mono text-[10.5px] text-graphite-600 dark:text-graphite-400">
                  {platformSummary}
                </span>
                {#if diag?.items}
                  <span class="rounded-md border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/80 dark:bg-white/[0.04] px-2 py-0.5 font-mono text-[10.5px] text-graphite-600 dark:text-graphite-300 tabular-nums">
                    {installedCount}/{diag.items.length} detected
                  </span>
                {/if}
              </div>
              <Button variant="secondary" size="xs" onclick={loadDiagnostics} disabled={diagLoading}>
                <StreamlineIcon name="RefreshCw" size={12} class={diagLoading ? 'animate-spin' : ''} />
                <span>{diagLoading ? 'Checking…' : 'Re-check'}</span>
              </Button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {#if diagLoading && !diag}
                {#each [0, 1, 2, 3] as idx (idx)}
                  <div class="rounded-xl border border-graphite-200/80 dark:border-white/[0.08] bg-graphite-50/70 dark:bg-white/[0.03] p-4 space-y-2 animate-pulse">
                    <div class="flex items-center justify-between gap-2">
                      <div class="h-3.5 w-28 rounded bg-graphite-200/80 dark:bg-white/[0.08]"></div>
                      <div class="h-3 w-16 rounded bg-graphite-200/60 dark:bg-white/[0.06]"></div>
                    </div>
                    <div class="h-3 w-48 rounded bg-graphite-200/60 dark:bg-white/[0.05]"></div>
                  </div>
                {/each}
              {:else if diag?.items}
                {#each diag.items as item (item.id)}
                  <div class="relative rounded-xl border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/80 dark:bg-white/[0.03] p-4 space-y-2 flex flex-col justify-between {diagLoading ? 'connect-shimmer' : ''}">
                    <div class="space-y-1.5">
                      <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-2 min-w-0">
                          <span
                            class="h-2 w-2 rounded-full shrink-0 {diagLoading
                              ? 'bg-amber-400 status-starting'
                              : item.installed
                                ? 'bg-emerald-500'
                                : item.required
                                  ? 'bg-rose-500'
                                  : 'bg-graphite-400 dark:bg-graphite-600'}"
                          ></span>
                          <span class="text-xs font-semibold text-graphite-900 dark:text-graphite-100 truncate">
                            {item.label}
                          </span>
                          <span
                            class="rounded px-1.5 py-0.5 text-[9.5px] font-medium shrink-0 {item.required
                              ? 'bg-graphite-950/10 text-graphite-800 dark:bg-white/[0.12] dark:text-graphite-100'
                              : 'bg-graphite-100 text-graphite-500 dark:bg-white/[0.05] dark:text-graphite-400'}"
                          >
                            {item.required ? 'Required' : 'Optional'}
                          </span>
                        </div>
                        <span class="rounded-md border border-graphite-200/80 dark:border-white/[0.08] bg-white/70 dark:bg-white/[0.04] px-2 py-0.5 font-mono text-[10.5px] text-graphite-600 dark:text-graphite-300 truncate max-w-[165px]">
                          {item.installed ? item.version : item.required ? 'Missing' : 'Optional / missing'}
                        </span>
                      </div>
                      <p class="text-[11.5px] text-graphite-500 dark:text-graphite-400 leading-relaxed">
                        {item.role}
                      </p>
                    </div>
                    {#if !item.installed}
                      <div class="flex items-center justify-between gap-2 rounded-lg bg-white/85 dark:bg-graphite-950/80 border border-graphite-200 dark:border-white/[0.08] px-2.5 py-1.5">
                        <code class="font-mono text-[10.5px] text-graphite-800 dark:text-graphite-200 truncate select-all">
                          {item.installCommand}
                        </code>
                        <Button
                          variant="ghost"
                          size="xs"
                          iconOnly
                          onclick={() => copyText(`diag-${item.id}`, item.label, item.installCommand)}
                          title="Copy install command"
                          aria-label="Copy {item.label} install command"
                        >
                          <StreamlineIcon name={copiedKey === `diag-${item.id}` ? 'Check' : 'Copy'} size={11} />
                        </Button>
                      </div>
                    {/if}
                  </div>
                {/each}
              {:else}
                <div class="col-span-full rounded-xl border border-dashed border-graphite-200 dark:border-white/[0.1] p-6 text-center text-xs text-graphite-500 dark:text-graphite-400">
                  Diagnostics unavailable. Click Re-check once sidecar is connected.
                </div>
              {/if}
            </div>

            <!-- Node-only reassuring note -->
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-graphite-200/80 dark:border-white/[0.08] bg-graphite-50/70 dark:bg-white/[0.03] px-4 py-3 text-xs text-graphite-700 dark:text-graphite-300">
              <div class="flex items-start gap-2.5 min-w-0 flex-1">
                <StreamlineIcon name="Info" size={14} class="shrink-0 mt-0.5 text-graphite-500 dark:text-graphite-400" />
                <p class="leading-relaxed">
                  <strong class="font-semibold text-graphite-950 dark:text-graphite-50">Only have Node.js?</strong>
                  All local IDEs &amp; CLIs (including all {CLIENT_TABS.length} supported clients), npm (<code class="font-mono">npx</code>) servers, and HTTP/SSE MCP servers work normally without Python, <code class="font-mono">uvx</code>, or <code class="font-mono">cloudflared</code>.
                </p>
              </div>
              <Button variant="secondary" size="xs" onclick={() => (activeTab = 'help')} class="shrink-0">
                <span>Read Help &amp; FAQ</span>
              </Button>
            </div>

            <!-- Balanced Security & Endpoint Reference Cards -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <section class="rounded-xl border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/80 dark:bg-white/[0.03] p-4 space-y-2.5 text-xs">
                <div class="flex items-center gap-2 font-semibold text-graphite-900 dark:text-graphite-100">
                  <StreamlineIcon name="ShieldAlert" size={14} class="text-graphite-500 dark:text-graphite-400 shrink-0" />
                  <span>Security &amp; Token Discipline</span>
                </div>
                <ul class="list-disc pl-5 space-y-1.5 text-graphite-600 dark:text-graphite-400 leading-relaxed">
                  <li>Keep unused MCP servers toggled <strong class="text-graphite-900 dark:text-graphite-100">OFF</strong> — idle servers consume 0 MB RAM and 0 context tokens.</li>
                  <li>Keep active schemas under <strong class="text-graphite-900 dark:text-graphite-100">3,000 tokens</strong> for crisp model latency.</li>
                  <li>Turn the <strong class="text-graphite-900 dark:text-graphite-100">Tunnel Switch OFF</strong> after remote sessions so your local endpoint stays private.</li>
                </ul>
              </section>

              <section class="rounded-xl border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/80 dark:bg-white/[0.03] p-4 space-y-2.5 text-xs">
                <div class="flex items-center gap-2 font-semibold text-graphite-900 dark:text-graphite-100">
                  <StreamlineIcon name="Terminal" size={14} class="text-graphite-500 dark:text-graphite-400 shrink-0" />
                  <span>Active Switchboard Endpoints</span>
                </div>
                <div class="space-y-2 text-[11px]">
                  <div class="flex items-center justify-between gap-2 rounded-lg border border-graphite-200/80 dark:border-white/[0.08] bg-white/75 dark:bg-graphite-950/70 px-3 py-1.5">
                    <span class="font-mono text-graphite-500 dark:text-graphite-400 shrink-0">HTTP</span>
                    <code class="font-mono text-graphite-800 dark:text-graphite-200 truncate select-all flex-1 text-right">{localHttpUrl}</code>
                  </div>
                  <div class="flex items-center justify-between gap-2 rounded-lg border border-graphite-200/80 dark:border-white/[0.08] bg-white/75 dark:bg-graphite-950/70 px-3 py-1.5">
                    <span class="font-mono text-graphite-500 dark:text-graphite-400 shrink-0">SSE</span>
                    <code class="font-mono text-graphite-800 dark:text-graphite-200 truncate select-all flex-1 text-right">{localSseUrl}</code>
                  </div>
                  <div class="flex items-center justify-between gap-2 rounded-lg border border-graphite-200/80 dark:border-white/[0.08] bg-white/75 dark:bg-graphite-950/70 px-3 py-1.5">
                    <span class="font-mono text-graphite-500 dark:text-graphite-400 shrink-0">AUTH</span>
                    <span class="font-mono text-graphite-700 dark:text-graphite-300 truncate">{activeToken ? 'Bearer token enabled' : 'Open local loopback (127.0.0.1)'}</span>
                  </div>
                </div>
              </section>
            </div>
          </div>

        {:else}
          <!-- A-to-Z Help & FAQ Tab -->
          <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div class="shrink-0 border-b border-graphite-200/80 dark:border-white/[0.08] px-5 py-3 space-y-2.5">
              <div class="flex flex-wrap items-center justify-between gap-2.5">
                <div class="relative flex-1 min-w-[200px] sm:max-w-xs">
                  <StreamlineIcon
                    name="Search"
                    size={12}
                    class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-graphite-400 dark:text-graphite-500"
                  />
                  <input
                    type="text"
                    placeholder="Search Help & FAQ topics…"
                    bind:value={helpSearchQuery}
                    aria-label="Search Help and FAQ"
                    class="w-full h-8 rounded-lg border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/80 dark:bg-white/[0.04] pl-8 pr-7 text-xs text-graphite-900 dark:text-graphite-100 placeholder:text-graphite-400 dark:placeholder:text-graphite-500 focus:outline-none focus:border-graphite-900 dark:focus:border-white/50 focus:ring-2 focus:ring-graphite-900/15 dark:focus:ring-white/15 transition-colors"
                  />
                  {#if helpSearchQuery}
                    <button
                      type="button"
                      onclick={() => (helpSearchQuery = '')}
                      aria-label="Clear FAQ search"
                      class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-graphite-400 hover:text-graphite-700 dark:hover:text-graphite-200"
                    >
                      <StreamlineIcon name="X" size={10} />
                    </button>
                  {/if}
                </div>

                <SegmentedControl
                  options={PLATFORM_OPTIONS}
                  value={helpPlatform}
                  size="sm"
                  ariaLabel="Target OS for install commands"
                  onchange={(v) => {
                    helpPlatformOverridden = true;
                    helpPlatform = v as PlatformId;
                  }}
                />
              </div>

              <SegmentedControl
                options={HELP_CATEGORY_OPTIONS}
                value={activeHelpCategory}
                size="xs"
                wrap={true}
                ariaLabel="Help topic category filter"
                onchange={(v) => (activeHelpCategory = v as 'All' | HelpCategory)}
              />
            </div>

            <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-3.5">
              {#if filteredHelpTopics.length === 0}
                <div class="rounded-xl border border-dashed border-graphite-200 dark:border-white/[0.1] p-8 text-center space-y-2.5">
                  <p class="text-xs text-graphite-500 dark:text-graphite-400">No help topics match "{helpSearchQuery}".</p>
                  <Button
                    variant="secondary"
                    size="xs"
                    onclick={() => {
                      helpSearchQuery = '';
                      activeHelpCategory = 'All';
                    }}
                  >
                    <span>Show all topics</span>
                  </Button>
                </div>
              {:else}
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                  {#each filteredHelpTopics as topic (topic.id)}
                    {@const resolvedCmd = resolveTopicCommand(topic, helpPlatform)}
                    <article class="rounded-xl border border-graphite-200/80 dark:border-white/[0.09] bg-graphite-50/75 dark:bg-white/[0.03] p-4 flex flex-col justify-between gap-3">
                      <div class="space-y-2">
                        <div class="flex items-start justify-between gap-2">
                          <h3 class="text-[13px] font-semibold tracking-[-0.01em] text-graphite-950 dark:text-graphite-50 leading-snug">
                            {topic.title}
                          </h3>
                          <span class="rounded-md border border-graphite-200/80 dark:border-white/[0.08] bg-white/75 dark:bg-white/[0.04] px-2 py-0.5 font-mono text-[9.5px] font-medium text-graphite-600 dark:text-graphite-300 shrink-0">
                            {topic.category}
                          </span>
                        </div>
                        <p class="text-xs text-graphite-700 dark:text-graphite-200 leading-relaxed">
                          {topic.summary}
                        </p>
                        <ul class="list-disc pl-4 space-y-1 text-[11.5px] text-graphite-600 dark:text-graphite-400 leading-relaxed">
                          {#each topic.bullets as line (line)}
                            <li>{line}</li>
                          {/each}
                        </ul>
                      </div>

                      {#if resolvedCmd.command}
                        <div class="flex items-center justify-between gap-2 rounded-lg border border-graphite-200 dark:border-white/[0.08] bg-white/85 dark:bg-graphite-950/80 px-2.5 py-1.5">
                          <div class="min-w-0 flex-1">
                            {#if resolvedCmd.label}
                              <span class="block text-[9.5px] font-medium text-graphite-500 dark:text-graphite-400">
                                {resolvedCmd.label}
                              </span>
                            {/if}
                            <code class="block font-mono text-[10.5px] text-graphite-800 dark:text-graphite-200 truncate select-all">
                              {resolvedCmd.command}
                            </code>
                          </div>
                          <Button
                            variant="ghost"
                            size="xs"
                            iconOnly
                            onclick={() => copyText(`help-${topic.id}`, resolvedCmd.label || topic.title, resolvedCmd.command || '')}
                            title="Copy command"
                            aria-label="Copy {resolvedCmd.label || topic.title}"
                          >
                            <StreamlineIcon name={copiedKey === `help-${topic.id}` ? 'Check' : 'Copy'} size={11} />
                          </Button>
                        </div>
                      {/if}
                    </article>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
