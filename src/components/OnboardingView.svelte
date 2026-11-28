<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import StreamlineIcon from '../lib/icons/StreamlineIcon.svelte';
  import AgentIcon from '../lib/icons/AgentIcon.svelte';
  import ServerIcon from '../lib/icons/ServerIcon.svelte';
  import Button from '../lib/primitives/Button.svelte';
  import ThemeToggleButton from '../lib/primitives/ThemeToggleButton.svelte';
  import Switch from '../lib/primitives/Switch.svelte';
  import SegmentedControl from '../lib/primitives/SegmentedControl.svelte';
  import CountUp from '../lib/primitives/CountUp.svelte';
  import StarBorder from '../lib/primitives/StarBorder.svelte';
  import DotGrid from '../lib/primitives/DotGrid.svelte';
  import { spotlight } from '../lib/primitives/spotlight';
  import { magnet } from '../lib/primitives/magnet';
  import { BACKDROP_FADE, SLIDING_PILL_TRANSITION, STEP_SLIDE, measureSlidingPill } from '../lib/motion';
  import { api } from '../lib/api';
  import { buildClientGuide, CLIENT_TABS, type ClientPreset, type ClientCategory } from '../lib/clientSnippets';
  import type {
    DiagnosticsReport,
    McpServerSnapshot,
    SwitchboardTotals,
    ThemeMode,
    TunnelState,
  } from '../lib/types';

  interface Props {
    port?: number;
    servers?: McpServerSnapshot[];
    totals?: SwitchboardTotals;
    tunnel?: TunnelState | null;
    busyServers?: Record<string, boolean | 'connecting' | 'disconnecting'>;
    mcpAuthToken?: string;
    connecting?: boolean;
    theme?: ThemeMode;
    onToggleTheme?: (event: MouseEvent) => void;
    onToggleServer?: (name: string, enable: boolean) => void;
    onOpenAddModal?: () => void;
    onSkip?: () => void;
    onComplete?: () => void;
    onNotify?: (message: string, type?: 'info' | 'error') => void;
  }

  interface SimServer {
    name: string;
    subtitle: string;
    toolCount: number;
    tokenEstimate: number;
    enabled: boolean;
  }

  interface TopologyBeam {
    id: string;
    d: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    active: boolean;
    connecting?: boolean;
    selected?: boolean;
    dur: string;
  }

  let {
    port = 8000,
    servers = [],
    totals: _totals = { activeServers: 0, totalServers: 0, totalTools: 0, totalTokens: 0 },
    tunnel = null,
    busyServers: _busyServers = {},
    mcpAuthToken = '',
    connecting = false,
    theme = 'dark',
    onToggleTheme = () => {},
    onToggleServer: _onToggleServer = () => {},
    onOpenAddModal = () => {},
    onSkip = undefined,
    onComplete = () => {},
    onNotify = () => {},
  }: Props = $props();

  let step = $state<1 | 2 | 3>(1);
  let selectedClient = $state<ClientPreset>('cursor');
  let selectedModeId = $state<string>('');
  let diag = $state<DiagnosticsReport | null>(null);
  let diagLoading = $state(false);
  let diagAttempted = false;
  let probeState = $state<{ status: 'idle' | 'probing' | 'ok' | 'error'; detail: string }>({
    status: 'idle',
    detail: '',
  });
  let clientSearch = $state('');
  let clientCategory = $state<'All' | ClientCategory>('All');
  let copiedKey = $state<string | null>(null);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  let reducedMotion = $state(false);

  // Smooth gliding stepper state
  const STEPS = [
    { id: 1 as const, short: 'Architecture', label: 'Architecture' },
    { id: 2 as const, short: 'Check', label: 'System Check' },
    { id: 3 as const, short: 'Connect', label: 'Connect & Launch' },
  ];

  let stepNavEl = $state<HTMLElement | null>(null);
  const stepBtnEls: Record<number, HTMLButtonElement | null> = {};
  let stepPill = $state({ left: 0, width: 0, ready: false });
  let hoverPill = $state({ left: 0, width: 0, visible: false });

  // Pure local sandbox state for Step 1 interactive playground (never touches real backend)
  let simServers = $state<SimServer[]>([
    { name: 'filesystem', subtitle: 'npx @mcp/server-filesystem', toolCount: 11, tokenEstimate: 1420, enabled: true },
    { name: 'fetch', subtitle: 'uvx mcp-server-fetch', toolCount: 2, tokenEstimate: 310, enabled: false },
    { name: 'github', subtitle: 'npx @mcp/server-github', toolCount: 26, tokenEstimate: 3640, enabled: false },
    { name: 'postgres', subtitle: 'npx @mcp/server-postgres', toolCount: 6, tokenEstimate: 890, enabled: false },
  ]);
  let simConnecting = $state<Record<string, boolean>>({});
  const simTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Measured SVG topology coordinates
  let stageEl = $state<HTMLDivElement | null>(null);
  let hubLeftPortEl = $state<HTMLSpanElement | null>(null);
  let hubRightPortEl = $state<HTMLSpanElement | null>(null);
  const serverPortEls: Record<string, HTMLSpanElement | null> = {};
  const clientPortEls: Record<string, HTMLSpanElement | null> = {};
  let topoSize = $state({ width: 0, height: 0 });
  let leftBeams = $state<TopologyBeam[]>([]);
  let rightBeams = $state<TopologyBeam[]>([]);

  const PLAYGROUND_CLIENTS: Array<{ id: ClientPreset; label: string; transport: string }> = [
    { id: 'claude_code', label: 'Claude Code', transport: 'HTTP' },
    { id: 'cursor', label: 'Cursor', transport: 'HTTP' },
    { id: 'vscode', label: 'VS Code', transport: 'HTTP' },
    { id: 'windsurf', label: 'Windsurf', transport: 'SSE/HTTP' },
    { id: 'antigravity', label: 'Antigravity', transport: 'HTTP' },
    { id: 'zed', label: 'Zed', transport: 'HTTP' },
    { id: 'gemini_cli', label: 'Gemini CLI', transport: 'HTTP' },
    { id: 'other', label: 'Other', transport: 'HTTP' },
  ];

  const CATEGORY_OPTIONS = [
    { value: 'All', label: 'All' },
    { value: 'IDE', label: 'IDE' },
    { value: 'CLI Agent', label: 'CLI' },
    { value: 'Desktop & Web', label: 'Desktop' },
    { value: 'Universal', label: 'Universal' },
  ];

  const filteredStep3Clients = $derived.by(() => {
    const q = clientSearch.trim().toLowerCase();
    return CLIENT_TABS.filter((c) => {
      if (clientCategory !== 'All' && c.category !== clientCategory) return false;
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

  const simTotals = $derived.by(() => {
    let activeServers = 0;
    let totalTools = 0;
    let totalTokens = 0;
    for (const s of simServers) {
      if (s.enabled) {
        activeServers += 1;
        totalTools += s.toolCount;
        totalTokens += s.tokenEstimate;
      }
    }
    return { activeServers, totalTools, totalTokens };
  });

  const simAnyActive = $derived(simTotals.activeServers > 0);
  const simTokenRatio = $derived(Math.min(100, Math.round((simTotals.totalTokens / 6260) * 100)));
  const simBudgetTone = $derived(
    simTotals.totalTokens >= 3000
      ? 'text-amber-600 dark:text-amber-400'
      : simAnyActive
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-graphite-500 dark:text-graphite-400'
  );

  const localHttpUrl = $derived(`http://127.0.0.1:${port || 8000}/mcp`);
  const localSseUrl = $derived(`http://127.0.0.1:${port || 8000}/sse`);
  const remoteUrl = $derived(tunnel?.publicUrl || 'https://<your-tunnel>.trycloudflare.com/mcp');
  const activeToken = $derived(String(mcpAuthToken || '').trim());

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

  const platformSummary = $derived.by(() => {
    const p = diag?.platform;
    if (p === 'win32') return `Windows (${diag?.arch || 'x64'})`;
    if (p === 'darwin') return `macOS (${diag?.arch || 'arm64'})`;
    if (p === 'linux') return `Linux (${diag?.arch || 'x64'})`;
    return p ? `${p} (${diag?.arch || ''})` : 'Detecting OS…';
  });

  const diagReadyCount = $derived(diag?.items ? diag.items.filter((i) => i.installed).length : 0);

  function measureStepPill(): void {
    const next = measureSlidingPill(stepBtnEls[step] ?? null);
    if (!next) return;
    if (stepPill.ready && stepPill.left === next.left && stepPill.width === next.width) return;
    stepPill = { ...next, ready: true };
  }

  function showHoverPill(stepId: number): void {
    if (stepId === step) {
      hoverPill = { ...hoverPill, visible: false };
      return;
    }
    const next = measureSlidingPill(stepBtnEls[stepId] ?? null);
    if (!next) {
      hoverPill = { ...hoverPill, visible: false };
      return;
    }
    hoverPill = { ...next, visible: true };
  }

  function hideHoverPill(): void {
    if (hoverPill.visible) hoverPill = { ...hoverPill, visible: false };
  }

  function goToStep(next: 1 | 2 | 3): void {
    hideHoverPill();
    step = next;
  }

  function handleStepKey(e: KeyboardEvent): void {
    let nextStep: 1 | 2 | 3 | null = null;
    if (e.key === 'ArrowRight') nextStep = step === 3 ? 1 : ((step + 1) as 1 | 2 | 3);
    else if (e.key === 'ArrowLeft') nextStep = step === 1 ? 3 : ((step - 1) as 1 | 2 | 3);
    else if (e.key === 'Home') nextStep = 1;
    else if (e.key === 'End') nextStep = 3;
    if (!nextStep) return;

    e.preventDefault();
    goToStep(nextStep);
    void tick().then(() => stepBtnEls[nextStep]?.focus());
  }

  function measureTopology(): void {
    if (step !== 1 || !stageEl || !hubLeftPortEl || !hubRightPortEl) return;
    const stageRect = stageEl.getBoundingClientRect();
    if (stageRect.width < 520 || stageRect.height < 120) {
      topoSize = { width: 0, height: 0 };
      leftBeams = [];
      rightBeams = [];
      return;
    }

    const hlRect = hubLeftPortEl.getBoundingClientRect();
    const hrRect = hubRightPortEl.getBoundingClientRect();
    const hlx = hlRect.left + hlRect.width / 2 - stageRect.left;
    const hly = hlRect.top + hlRect.height / 2 - stageRect.top;
    const hrx = hrRect.left + hrRect.width / 2 - stageRect.left;
    const hry = hrRect.top + hrRect.height / 2 - stageRect.top;

    const nextLeft: TopologyBeam[] = [];
    for (let i = 0; i < simServers.length; i += 1) {
      const srv = simServers[i];
      const portEl = serverPortEls[srv.name];
      if (!portEl) continue;
      const r = portEl.getBoundingClientRect();
      const x1 = r.left + r.width / 2 - stageRect.left;
      const y1 = r.top + r.height / 2 - stageRect.top;
      const dx = Math.max(24, (hlx - x1) * 0.54);
      const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + dx).toFixed(1)} ${y1.toFixed(1)}, ${(hlx - dx).toFixed(1)} ${hly.toFixed(1)}, ${hlx.toFixed(1)} ${hly.toFixed(1)}`;
      nextLeft.push({
        id: srv.name,
        d,
        x1,
        y1,
        x2: hlx,
        y2: hly,
        active: srv.enabled,
        connecting: Boolean(simConnecting[srv.name]),
        dur: `${(1.45 + i * 0.18).toFixed(2)}s`,
      });
    }

    const nextRight: TopologyBeam[] = [];
    for (let i = 0; i < PLAYGROUND_CLIENTS.length; i += 1) {
      const client = PLAYGROUND_CLIENTS[i];
      const portEl = clientPortEls[client.id];
      if (!portEl) continue;
      const r = portEl.getBoundingClientRect();
      const x2 = r.left + r.width / 2 - stageRect.left;
      const y2 = r.top + r.height / 2 - stageRect.top;
      const dx = Math.max(24, (x2 - hrx) * 0.54);
      const d = `M ${hrx.toFixed(1)} ${hry.toFixed(1)} C ${(hrx + dx).toFixed(1)} ${hry.toFixed(1)}, ${(x2 - dx).toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
      nextRight.push({
        id: client.id,
        d,
        x1: hrx,
        y1: hry,
        x2,
        y2,
        active: simAnyActive,
        selected: selectedClient === client.id,
        dur: '1.35s',
      });
    }

    topoSize = { width: Math.round(stageRect.width), height: Math.round(stageRect.height) };
    leftBeams = nextLeft;
    rightBeams = nextRight;
  }

  function toggleSimServer(name: string, next: boolean): void {
    const existingTimer = simTimers.get(name);
    if (existingTimer) {
      clearTimeout(existingTimer);
      simTimers.delete(name);
    }

    simServers = simServers.map((s) => (s.name === name ? { ...s, enabled: next } : s));

    if (next && !reducedMotion) {
      simConnecting = { ...simConnecting, [name]: true };
      const timer = setTimeout(() => {
        simConnecting = { ...simConnecting, [name]: false };
        simTimers.delete(name);
      }, 380);
      simTimers.set(name, timer);
    } else {
      simConnecting = { ...simConnecting, [name]: false };
    }
  }

  $effect(() => {
    void step;
    let cancelled = false;
    void tick().then(() => {
      if (!cancelled) measureStepPill();
    });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    void step;
    void simServers;
    void simConnecting;
    void selectedClient;
    if (step !== 1) return;
    let cancelled = false;
    let frameId: number | undefined;
    void tick().then(() => {
      if (!cancelled) frameId = requestAnimationFrame(measureTopology);
    });
    return () => {
      cancelled = true;
      if (frameId !== undefined) cancelAnimationFrame(frameId);
    };
  });

  $effect(() => {
    if (step !== 1 || !stageEl || typeof ResizeObserver === 'undefined') return;
    const target = stageEl;
    const ro = new ResizeObserver(() => {
      measureTopology();
    });
    ro.observe(target);
    return () => ro.disconnect();
  });

  onMount(() => {
    let cancelled = false;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = mq.matches;
    const onMotion = (e: MediaQueryListEvent) => {
      reducedMotion = e.matches;
    };
    mq.addEventListener('change', onMotion);

    measureStepPill();
    measureTopology();
    void document.fonts?.ready?.then(() => {
      if (!cancelled) {
        measureStepPill();
        measureTopology();
      }
    });

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            measureStepPill();
          })
        : null;
    if (ro && stepNavEl) ro.observe(stepNavEl);

    const onResize = () => {
      measureStepPill();
      measureTopology();
    };
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      cancelled = true;
      ro?.disconnect();
      mq.removeEventListener('change', onMotion);
      window.removeEventListener('resize', onResize);
    };
  });

  onDestroy(() => {
    clearTimeout(copiedTimer);
    for (const timer of simTimers.values()) clearTimeout(timer);
    simTimers.clear();
  });

  async function loadDiagnostics(): Promise<void> {
    diagAttempted = true;
    diagLoading = true;
    try {
      diag = await api.getDiagnostics();
    } catch {
      diag = null;
    } finally {
      diagLoading = false;
    }
  }

  $effect(() => {
    if (step === 2 && !connecting && !diag && !diagLoading && !diagAttempted) {
      void loadDiagnostics();
    }
  });

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

  async function testEndpointLive(): Promise<void> {
    probeState = { status: 'probing', detail: 'Sending read-only tools/list probe to /mcp…' };
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
      const payload = (await res.json()) as { result?: { tools?: unknown[] } };
      const count = Array.isArray(payload?.result?.tools) ? payload.result.tools.length : 0;
      probeState = {
        status: 'ok',
        detail:
          count > 0
            ? `Endpoint live · ${count} ${count === 1 ? 'tool' : 'tools'} ready on /mcp`
            : 'Endpoint live · toggle a server ON in Switchboard to expose tools',
      };
    } catch (err) {
      probeState = {
        status: 'error',
        detail: err instanceof Error ? err.message : 'Endpoint unreachable',
      };
    }
  }
</script>

<div
  transition:fade={BACKDROP_FADE}
  role="dialog"
  aria-modal="true"
  aria-label="MCP Switchboard Onboarding"
  class="fixed inset-0 z-40 flex flex-col bg-[#f5f5f7] dark:bg-[#09090b] text-graphite-950 dark:text-graphite-50 overflow-y-auto overscroll-contain"
>
  <!-- Interactive Canvas 2D DotGrid Backdrop -->
  <div class="pointer-events-none fixed inset-0 z-0">
    <DotGrid />
  </div>
  <div class="grain-overlay pointer-events-none fixed inset-0 z-0"></div>
  <!-- Pure neutral monochrome ambient wash -->
  <div
    aria-hidden="true"
    class="pointer-events-none fixed inset-x-0 top-0 z-0 h-80 bg-[radial-gradient(ellipse_at_top,rgba(0,0,0,0.035),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.045),transparent_70%)]"
  ></div>

  <!-- Top Onboarding Bar -->
  <header class="relative z-10 mx-auto w-full max-w-5xl px-4 sm:px-8 pt-5 pb-2 flex items-center justify-between gap-3">
    <div class="flex items-center gap-2.5 min-w-0">
      <img
        src="/app-icon.png"
        alt="MCP Switchboard"
        width="32"
        height="32"
        class="h-8 w-8 drop-shadow-xs shrink-0 select-none"
      />
      <span class="hidden xs:inline text-sm font-semibold tracking-[-0.015em] text-graphite-950 dark:text-graphite-50 truncate">
        MCP Switchboard
      </span>
    </div>

    <!-- True Measured Spring-Gliding Stepper -->
    <nav aria-label="Onboarding steps" onmouseleave={hideHoverPill}>
      <div
        bind:this={stepNavEl}
        role="tablist"
        aria-label="Onboarding steps"
        class="relative inline-flex items-center rounded-full border border-graphite-950/[0.08] dark:border-white/[0.1] bg-white/80 dark:bg-graphite-900/80 backdrop-blur-2xl p-1 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.07),inset_0_1px_0_rgba(255,255,255,0.85)] dark:shadow-[0_6px_18px_-4px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]"
      >
        <!-- Hover ghost indicator -->
        <div
          aria-hidden="true"
          style="width: {hoverPill.width}px; transform: translate3d({hoverPill.left}px, 0, 0); transition: {SLIDING_PILL_TRANSITION}, opacity 160ms ease; will-change: transform, width, opacity;"
          class="pointer-events-none absolute top-1 bottom-1 left-0 rounded-full bg-graphite-950/[0.05] dark:bg-white/[0.07] {hoverPill.visible ? 'opacity-100' : 'opacity-0'}"
        ></div>

        <!-- Gliding active pill -->
        {#if stepPill.ready}
          <div
            aria-hidden="true"
            style="width: {stepPill.width}px; transform: translate3d({stepPill.left}px, 0, 0); transition: {SLIDING_PILL_TRANSITION}; will-change: transform, width;"
            class="pointer-events-none absolute top-1 bottom-1 left-0 rounded-full bg-graphite-950 dark:bg-white shadow-[0_1px_4px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.12)] dark:shadow-[0_1px_6px_rgba(0,0,0,0.45)]"
          ></div>
        {/if}

        {#each STEPS as item (item.id)}
          {@const active = step === item.id}
          {@const completed = step > item.id}
          <button
            bind:this={stepBtnEls[item.id]}
            type="button"
            role="tab"
            aria-selected={active}
            aria-current={active ? 'step' : undefined}
            tabindex={active ? 0 : -1}
            onmouseenter={() => showHoverPill(item.id)}
            onkeydown={handleStepKey}
            onclick={() => goToStep(item.id)}
            class="relative z-10 inline-flex items-center gap-1.5 rounded-full px-2.5 sm:px-3.5 py-1.5 text-[11.5px] font-medium transition-[color,transform] duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite-950/35 dark:focus-visible:ring-white/40 {active
              ? 'text-white dark:text-graphite-950'
              : completed
                ? 'text-graphite-800 dark:text-graphite-200'
                : 'text-graphite-500 dark:text-graphite-400 hover:text-graphite-900 dark:hover:text-graphite-100'}"
          >
            <span
              class="inline-flex h-4 w-4 items-center justify-center rounded-full font-mono text-[10px] transition-colors duration-200 {active
                ? 'bg-white/20 text-white dark:bg-graphite-950/15 dark:text-graphite-950'
                : completed
                  ? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300'
                  : 'bg-graphite-950/[0.06] dark:bg-white/[0.08] text-graphite-500 dark:text-graphite-400'}"
            >
              {#if completed}
                <StreamlineIcon name="Check" size={9} strokeWidth={1.7} />
              {:else}
                {item.id}
              {/if}
            </span>
            <span class="hidden sm:inline">{item.label}</span>
            <span class="inline sm:hidden">{item.short}</span>
          </button>
        {/each}
      </div>
    </nav>

    <div class="flex items-center gap-1.5 shrink-0">
      <ThemeToggleButton {theme} size="xs" variant="ghost" onclick={onToggleTheme} />
      <Button variant="ghost" size="xs" onclick={() => (onSkip ?? onComplete)?.()}>
        <span>Skip</span>
      </Button>
    </div>
  </header>

  <!-- Main Interactive Stage -->
  <main class="relative z-10 flex-1 mx-auto w-full max-w-5xl px-4 sm:px-8 py-3 sm:py-4 flex flex-col justify-center">
    {#key step}
      <div in:fly={STEP_SLIDE} class="space-y-4">
        {#if step === 1}
          <div class="text-center space-y-2 max-w-2xl mx-auto animate-blur-enter">
            <div class="inline-flex items-center gap-2 rounded-full border border-graphite-200/90 dark:border-white/[0.09] bg-white/85 dark:bg-white/[0.05] backdrop-blur-md px-3 py-1 text-[11px] font-medium text-graphite-600 dark:text-graphite-300 shadow-xs">
              <span class="h-1.5 w-1.5 rounded-full {simAnyActive ? 'bg-emerald-500' : 'bg-graphite-500'}"></span>
              <span>Interactive Architecture · Safe Sandbox</span>
            </div>
            <h1 class="text-2xl sm:text-[32px] leading-tight font-semibold tracking-[-0.03em] text-graphite-950 dark:text-graphite-50">
              One endpoint for every AI agent.
            </h1>
            <p class="text-xs sm:text-sm text-graphite-600 dark:text-graphite-400 leading-relaxed max-w-xl mx-auto">
              Toggle the simulated servers below to watch live tools and schema tokens multiplex through <code class="font-mono text-graphite-900 dark:text-graphite-200">127.0.0.1:{port}/mcp</code> without touching your real config.
            </p>
          </div>

          <!-- Flagship Interactive Topology Canvas -->
          <section class="board-surface relative rounded-2xl border border-graphite-200/80 dark:border-white/[0.09] p-4 sm:p-6 shadow-xl">
            <StarBorder
              active={simAnyActive}
              duration={6}
              stars={2}
              thickness={1.25}
              trailLength={0.3}
              glow={0.6}
              sparkle={true}
              hover="lap"
              clickPulse={true}
            />

            <div
              bind:this={stageEl}
              class="relative grid grid-cols-1 md:grid-cols-[1.08fr_auto_1fr] items-center gap-5 md:gap-8"
            >
              <!-- Pixel-accurate Measured SVG Topology Traces & Travelling Packets -->
              {#if topoSize.width > 0 && topoSize.height > 0}
                <svg
                  aria-hidden="true"
                  width={topoSize.width}
                  height={topoSize.height}
                  viewBox="0 0 {topoSize.width} {topoSize.height}"
                  class="hidden md:block pointer-events-none absolute inset-0 z-0 overflow-visible"
                >
                  <!-- Left Traces: Simulated Servers -> Switchboard Core -->
                  {#each leftBeams as beam (beam.id)}
                    <!-- Quiet base schematic trace -->
                    <path
                      d={beam.d}
                      fill="none"
                      stroke="currentColor"
                      stroke-opacity="0.13"
                      stroke-width="1.25"
                      class="text-graphite-500 dark:text-graphite-400"
                    />
                    {#if beam.active}
                      <path
                        d={beam.d}
                        fill="none"
                        stroke="currentColor"
                        stroke-opacity={beam.connecting ? 0.72 : 0.45}
                        stroke-width="2"
                        class="transition-colors duration-300 {beam.connecting
                          ? 'text-amber-500 dark:text-amber-400'
                          : 'text-emerald-500 dark:text-emerald-400'}"
                      />
                      <path
                        d={beam.d}
                        fill="none"
                        stroke="currentColor"
                        stroke-opacity="0.85"
                        stroke-width="1.75"
                        class="{beam.connecting
                          ? 'text-amber-500 dark:text-amber-400'
                          : 'text-emerald-500 dark:text-emerald-400'} {!reducedMotion ? 'beam-flow-active' : ''}"
                      />
                      {#if !reducedMotion && !beam.connecting}
                        <circle r="4.5" fill="currentColor" opacity="0.22" class="text-emerald-500 dark:text-emerald-400">
                          <animateMotion dur={beam.dur} repeatCount="indefinite" path={beam.d} />
                        </circle>
                        <circle r="2.4" fill="currentColor" class="text-emerald-500 dark:text-emerald-300">
                          <animateMotion dur={beam.dur} repeatCount="indefinite" path={beam.d} />
                        </circle>
                        <circle r="2" fill="currentColor" opacity="0.85" class="text-emerald-400 dark:text-emerald-200">
                          <animateMotion dur={beam.dur} begin="-0.75s" repeatCount="indefinite" path={beam.d} />
                        </circle>
                      {/if}
                    {/if}
                    <circle
                      cx={beam.x1}
                      cy={beam.y1}
                      r={beam.active ? 3.2 : 2.2}
                      fill="currentColor"
                      class="transition-all duration-200 {beam.connecting
                        ? 'text-amber-500'
                        : beam.active
                          ? 'text-emerald-500'
                          : 'text-graphite-300 dark:text-graphite-700'}"
                    />
                  {/each}

                  <!-- Right Traces: Switchboard Core -> Client Nodes -->
                  {#each rightBeams as beam (beam.id)}
                    <path
                      d={beam.d}
                      fill="none"
                      stroke="currentColor"
                      stroke-opacity={beam.selected ? (beam.active ? 0.55 : 0.3) : beam.active ? 0.24 : 0.11}
                      stroke-width={beam.selected ? 1.85 : 1.15}
                      class="transition-all duration-300 {beam.selected && beam.active
                        ? 'text-emerald-500 dark:text-emerald-400'
                        : 'text-graphite-600 dark:text-graphite-300'}"
                    />
                    {#if beam.selected && beam.active}
                      <path
                        d={beam.d}
                        fill="none"
                        stroke="currentColor"
                        stroke-opacity="0.85"
                        stroke-width="1.8"
                        class="text-emerald-500 dark:text-emerald-400 {!reducedMotion ? 'beam-flow-active' : ''}"
                      />
                      {#if !reducedMotion}
                        <circle r="4.8" fill="currentColor" opacity="0.22" class="text-emerald-500 dark:text-emerald-400">
                          <animateMotion dur={beam.dur} repeatCount="indefinite" path={beam.d} />
                        </circle>
                        <circle r="2.5" fill="currentColor" class="text-emerald-500 dark:text-emerald-300">
                          <animateMotion dur={beam.dur} repeatCount="indefinite" path={beam.d} />
                        </circle>
                      {/if}
                    {/if}
                    <circle
                      cx={beam.x2}
                      cy={beam.y2}
                      r={beam.selected ? 3.2 : 2}
                      fill="currentColor"
                      class="transition-all duration-200 {beam.selected && beam.active
                        ? 'text-emerald-500'
                        : beam.selected
                          ? 'text-graphite-700 dark:text-graphite-200'
                          : 'text-graphite-300 dark:text-graphite-700'}"
                    />
                  {/each}
                </svg>
              {/if}

              <!-- Column 1: Simulated Starter Servers -->
              <div class="relative z-10 space-y-2.5">
                <div class="flex items-center justify-between px-1">
                  <span class="text-[11px] font-semibold uppercase tracking-wider text-graphite-500 dark:text-graphite-400">
                    MCP Servers
                  </span>
                  <span class="font-mono text-[10.5px] text-graphite-500 dark:text-graphite-400 tabular-nums">
                    {simTotals.activeServers}/4 active
                  </span>
                </div>

                {#each simServers as srv (srv.name)}
                  {@const isConn = Boolean(simConnecting[srv.name])}
                  {@const isLive = srv.enabled && !isConn}
                  <div
                    use:spotlight
                    class="relative rounded-xl border px-3.5 py-2.5 flex items-center justify-between gap-3 bg-white/85 dark:bg-graphite-950/85 backdrop-blur-md transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-[1px] {isLive
                      ? 'border-emerald-500/40 dark:border-emerald-400/30 shadow-xs'
                      : isConn
                        ? 'connect-shimmer border-amber-500/45 dark:border-amber-400/35 shadow-xs'
                        : 'border-graphite-200/80 dark:border-white/[0.08]'}"
                  >
                    <div class="flex items-center gap-3 min-w-0">
                      <div
                        class="relative flex h-10 w-10 items-center justify-center rounded-xl border shrink-0 transition-all duration-200 {isLive
                          ? 'border-emerald-500/35 bg-emerald-500/[0.09] text-emerald-700 dark:text-emerald-400'
                          : isConn
                            ? 'border-amber-500/45 bg-amber-500/[0.1] text-amber-700 dark:text-amber-300'
                            : 'border-graphite-200/80 dark:border-white/[0.09] bg-graphite-100/75 dark:bg-white/[0.04] text-graphite-500 dark:text-graphite-400'}"
                      >
                        {#if isConn && !reducedMotion}
                          <span class="connect-ring-pulse pointer-events-none absolute -inset-1 rounded-[14px] border border-amber-500/55 dark:border-amber-400/50"></span>
                        {/if}
                        <ServerIcon name={srv.name} command={srv.subtitle} size={20} />
                      </div>
                      <div class="min-w-0">
                        <div class="flex items-center gap-1.5">
                          <span
                            class="h-1.5 w-1.5 rounded-full shrink-0 transition-colors {isConn
                              ? 'bg-amber-400 status-starting'
                              : isLive
                                ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.55)]'
                                : 'bg-graphite-300 dark:bg-graphite-700'}"
                          ></span>
                          <p class="text-xs font-semibold text-graphite-950 dark:text-graphite-50 truncate">
                            {srv.name}
                          </p>
                        </div>
                        <p class="mt-0.5 text-[10.5px] font-mono text-graphite-500 dark:text-graphite-400 truncate tabular-nums">
                          {#if isConn}
                            <span class="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                              <span class="h-2 w-2 rounded-full border-[1.5px] border-amber-500/25 border-t-amber-600 dark:border-t-amber-300 connect-arc-spin"></span>
                              <span>Connecting…</span>
                            </span>
                          {:else if srv.enabled}
                            {srv.toolCount} tools · ~{srv.tokenEstimate.toLocaleString()} tok
                          {:else}
                            Idle · 0 MB · 0 tok
                          {/if}
                        </p>
                      </div>
                    </div>

                    <div class="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={srv.enabled}
                        starting={isConn}
                        label={`Toggle simulated ${srv.name}`}
                        onchange={(next) => toggleSimServer(srv.name, next)}
                      />
                      <!-- Right port terminal anchor for SVG Bezier measurement -->
                      <span
                        bind:this={serverPortEls[srv.name]}
                        aria-hidden="true"
                        class="hidden md:block h-1.5 w-1.5 rounded-full opacity-0 -mr-1.5"
                      ></span>
                    </div>
                  </div>
                {/each}
              </div>

              <!-- Column 2: Floating Switchboard Core Hub -->
              <div class="relative z-10 flex flex-col items-center justify-center py-2">
                <div class="relative flex items-center justify-center">
                  <!-- Left Hub Port -->
                  <span
                    bind:this={hubLeftPortEl}
                    aria-hidden="true"
                    class="hidden md:block absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full border border-graphite-300 dark:border-white/25 bg-white dark:bg-graphite-900 z-20"
                  ></span>

                  <!-- Right Hub Port -->
                  <span
                    bind:this={hubRightPortEl}
                    aria-hidden="true"
                    class="hidden md:block absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full border border-graphite-300 dark:border-white/25 bg-white dark:bg-graphite-900 z-20"
                  ></span>

                  <div
                    class="board-surface relative rounded-2xl border px-6 py-5 flex flex-col items-center text-center gap-2.5 min-w-[202px] transition-all duration-300 {simAnyActive
                      ? 'border-graphite-400/60 dark:border-white/[0.24] shadow-xl'
                      : 'border-graphite-200/80 dark:border-white/[0.09]'}"
                  >
                    <img src="/app-icon.png" alt="Switchboard Hub" width="48" height="48" class="relative h-12 w-12 drop-shadow-sm select-none" />

                    <div class="space-y-0.5">
                      <p class="text-xs font-semibold tracking-[-0.01em] text-graphite-950 dark:text-graphite-50">
                        Switchboard Core
                      </p>
                      <p class="font-mono text-xs font-medium tabular-nums {simBudgetTone}">
                        <CountUp value={simTotals.totalTools} suffix=" tools" /> · <CountUp value={simTotals.totalTokens} prefix="~" suffix=" tok" />
                      </p>
                    </div>

                    <!-- Context budget slim meter -->
                    <div class="w-full space-y-1 pt-0.5">
                      <div class="h-1.5 w-full rounded-full bg-graphite-200/80 dark:bg-white/[0.08] overflow-hidden">
                        <div
                          class="h-full rounded-full transition-all duration-300 {simTotals.totalTokens >= 3000
                            ? 'bg-amber-500'
                            : simAnyActive
                              ? 'bg-emerald-500'
                              : 'bg-graphite-400'}"
                          style="width: {simTokenRatio}%"
                        ></div>
                      </div>
                      <div class="flex items-center justify-between font-mono text-[9.5px] text-graphite-400 dark:text-graphite-500">
                        <span>{simTotals.totalTokens >= 3000 ? 'Moderate' : simAnyActive ? 'Lean budget' : 'Idle'}</span>
                        <span>127.0.0.1:{port}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Column 3: Interactive Client Nodes -->
              <div class="relative z-10 space-y-1.5">
                <div class="flex items-center justify-between px-1">
                  <span class="text-[11px] font-semibold uppercase tracking-wider text-graphite-500 dark:text-graphite-400">
                    AI Clients
                  </span>
                  <span class="font-mono text-[10.5px] text-graphite-400 dark:text-graphite-500">
                    {CLIENT_TABS.length}+ supported
                  </span>
                </div>
                {#each PLAYGROUND_CLIENTS as client (client.id)}
                  {@const selected = selectedClient === client.id}
                  <button
                    type="button"
                    use:spotlight
                    aria-pressed={selected}
                    onclick={() => (selectedClient = client.id)}
                    class="relative w-full text-left rounded-xl border px-3 py-2 flex items-center justify-between gap-2.5 bg-white/85 dark:bg-graphite-950/85 backdrop-blur-md transition-[transform,border-color,box-shadow] duration-150 hover:-translate-y-[0.5px] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite-950/35 dark:focus-visible:ring-white/40 {selected
                      ? 'border-graphite-900/55 dark:border-white/40 ring-1 ring-graphite-900/15 dark:ring-white/20 shadow-xs'
                      : 'border-graphite-200/80 dark:border-white/[0.08] hover:border-graphite-300 dark:hover:border-white/[0.16]'}"
                  >
                    <!-- Left port terminal anchor for SVG Bezier measurement -->
                    <span
                      bind:this={clientPortEls[client.id]}
                      aria-hidden="true"
                      class="hidden md:block h-1.5 w-1.5 rounded-full opacity-0 -ml-2"
                    ></span>
                    <div class="flex items-center gap-2.5 min-w-0 flex-1">
                      <AgentIcon id={client.id} size={18} />
                      <span class="text-xs font-medium text-graphite-900 dark:text-graphite-100 truncate">
                        {client.label}
                      </span>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                      {#if selected && simAnyActive}
                        <span class="relative flex h-2 w-2 items-center justify-center">
                          {#if !reducedMotion}
                            <span class="live-pulse-halo absolute inset-0 rounded-full bg-emerald-500/45"></span>
                          {/if}
                          <span class="relative h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                        </span>
                      {/if}
                      <span class="font-mono text-[10px] text-graphite-400 dark:text-graphite-500">
                        {client.transport}
                      </span>
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          </section>

          <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p class="text-xs text-graphite-500 dark:text-graphite-400">
              {simAnyActive
                ? `${PLAYGROUND_CLIENTS.find((c) => c.id === selectedClient)?.label ?? 'Client'} receives ${simTotals.totalTools} live tools over 1 unified URL.`
                : 'Tip: Toggle any simulated server ON to watch packets route through the hub.'}
            </p>
            <div use:magnet={0.14}>
              <Button variant="primary" size="md" onclick={() => goToStep(2)}>
                <span>Continue to System Check</span>
              </Button>
            </div>
          </div>

        {:else if step === 2}
          <div class="text-center space-y-2 max-w-2xl mx-auto animate-blur-enter">
            <div class="inline-flex items-center gap-2 rounded-full border border-graphite-200/90 dark:border-white/[0.09] bg-white/85 dark:bg-white/[0.05] backdrop-blur-md px-3 py-1 text-[11px] font-medium text-graphite-600 dark:text-graphite-300 shadow-xs">
              <span class="h-1.5 w-1.5 rounded-full {diagLoading || connecting ? 'bg-amber-400 status-starting' : diag?.items ? 'bg-emerald-500' : 'bg-graphite-500'}"></span>
              <span>{diagLoading || connecting ? 'Scanning local runtimes…' : `${platformSummary} · ${diagReadyCount}/${diag?.items?.length || 4} runtimes detected`}</span>
            </div>
            <h1 class="text-2xl sm:text-[32px] leading-tight font-semibold tracking-[-0.03em] text-graphite-950 dark:text-graphite-50">
              System Check
            </h1>
            <p class="text-xs sm:text-sm text-graphite-600 dark:text-graphite-400 leading-relaxed max-w-xl mx-auto">
              Read-only check of local MCP runtimes. Missing CLIs include 1-click install commands; <code class="font-mono text-graphite-800 dark:text-graphite-200">cloudflared</code> is only needed for remote web connectors.
            </p>
          </div>

          <section class="board-surface rounded-2xl border border-graphite-200/80 dark:border-white/[0.09] p-4 sm:p-6 shadow-xl space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2.5">
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold text-graphite-900 dark:text-graphite-100">
                  Runtime Prerequisites
                </span>
                <span class="rounded-md border border-graphite-200 dark:border-white/[0.09] bg-white/70 dark:bg-white/[0.04] px-2 py-0.5 font-mono text-[10.5px] text-graphite-600 dark:text-graphite-400">
                  {platformSummary}
                </span>
              </div>
              <div class="flex items-center gap-2">
                <Button variant="secondary" size="xs" onclick={onOpenAddModal}>
                  <StreamlineIcon name="Plus" size={12} />
                  <span>Add MCP JSON</span>
                </Button>
                <Button variant="ghost" size="xs" onclick={loadDiagnostics} disabled={diagLoading || connecting}>
                  <StreamlineIcon name="RefreshCw" size={12} class={diagLoading || connecting ? 'animate-spin' : ''} />
                  <span>{diagLoading ? 'Scanning…' : 'Re-check'}</span>
                </Button>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {#if (connecting || diagLoading) && !diag}
                {#each [0, 1, 2, 3] as idx (idx)}
                  <div class="rounded-xl border border-graphite-200/80 dark:border-white/[0.08] bg-white/70 dark:bg-white/[0.03] p-4 space-y-2.5 animate-pulse">
                    <div class="flex items-center justify-between gap-2">
                      <div class="h-4 w-28 rounded bg-graphite-200/80 dark:bg-white/[0.08]"></div>
                      <div class="h-4 w-16 rounded bg-graphite-200/60 dark:bg-white/[0.06]"></div>
                    </div>
                    <div class="h-3 w-48 rounded bg-graphite-200/60 dark:bg-white/[0.05]"></div>
                  </div>
                {/each}
              {:else if diag?.items}
                {#each diag.items as item (item.id)}
                  <div use:spotlight class="relative rounded-xl border border-graphite-200/80 dark:border-white/[0.09] bg-white/80 dark:bg-white/[0.03] p-4 space-y-2 flex flex-col justify-between {diagLoading ? 'connect-shimmer' : ''}">
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
                        <span class="rounded-md border border-graphite-200/80 dark:border-white/[0.08] bg-graphite-50/80 dark:bg-white/[0.04] px-2 py-0.5 font-mono text-[10.5px] text-graphite-600 dark:text-graphite-300 truncate max-w-[165px]">
                          {item.installed ? item.version : item.required ? 'Missing' : 'Not installed'}
                        </span>
                      </div>
                      <p class="text-[11.5px] text-graphite-500 dark:text-graphite-400 leading-relaxed">
                        {item.role}
                      </p>
                    </div>
                    {#if !item.installed}
                      <div class="flex items-center justify-between gap-2 rounded-lg bg-graphite-50/90 dark:bg-graphite-950/75 border border-graphite-200 dark:border-white/[0.08] px-2.5 py-1.5">
                        <code class="font-mono text-[10.5px] text-graphite-800 dark:text-graphite-200 truncate select-all">
                          {item.installCommand}
                        </code>
                        <Button
                          variant="ghost"
                          size="xs"
                          iconOnly
                          onclick={() => copyText(`step2-${item.id}`, item.label, item.installCommand)}
                          title="Copy install command"
                          aria-label="Copy {item.label} install command"
                        >
                          <StreamlineIcon name={copiedKey === `step2-${item.id}` ? 'Check' : 'Copy'} size={11} />
                        </Button>
                      </div>
                    {/if}
                  </div>
                {/each}
              {:else}
                <div class="col-span-full rounded-xl border border-dashed border-graphite-200 dark:border-white/[0.1] p-6 text-center text-xs text-graphite-500 dark:text-graphite-400">
                  Diagnostics unavailable yet. Click Re-check in a moment.
                </div>
              {/if}
            </div>

            <!-- Clarity note for Node-only setups -->
            <div class="flex items-start gap-2.5 rounded-xl border border-graphite-200/80 dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] px-3.5 py-2.5 text-[11.5px] text-graphite-700 dark:text-graphite-300">
              <StreamlineIcon name="Info" size={14} class="shrink-0 mt-0.5 text-graphite-500 dark:text-graphite-400" />
              <p class="leading-relaxed">
                <strong class="font-semibold text-graphite-950 dark:text-graphite-50">Only have Node.js?</strong>
                You are already set for 100% of local IDEs (Cursor, VS Code, Claude Desktop, Windsurf, Zed) and npm (<code class="font-mono">npx</code>) or HTTP servers. <code class="font-mono">uvx</code>/Python are optional for Python MCP servers, and <code class="font-mono">cloudflared</code> is only needed if you turn on the remote HTTPS Tunnel.
              </p>
            </div>

            <!-- Cross-platform OS quick notes -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-graphite-200/80 dark:border-white/[0.08] bg-white/70 dark:bg-white/[0.02] p-3.5 text-[11px]">
              <div class="space-y-1">
                <span class="font-mono text-[10px] font-semibold uppercase tracking-wider text-graphite-500 dark:text-graphite-400">Windows</span>
                <p class="text-graphite-600 dark:text-graphite-300 leading-relaxed">
                  Uses <code class="font-mono">winget</code> for Node/uv/cloudflared; client configs live in <code class="font-mono">%APPDATA%</code>.
                </p>
              </div>
              <div class="space-y-1 sm:border-l sm:border-graphite-200/80 sm:dark:border-white/[0.08] sm:pl-3">
                <span class="font-mono text-[10px] font-semibold uppercase tracking-wider text-graphite-500 dark:text-graphite-400">macOS</span>
                <p class="text-graphite-600 dark:text-graphite-300 leading-relaxed">
                  Uses <code class="font-mono">brew</code>; desktop configs live in <code class="font-mono">~/Library/Application Support</code>.
                </p>
              </div>
              <div class="space-y-1 sm:border-l sm:border-graphite-200/80 sm:dark:border-white/[0.08] sm:pl-3">
                <span class="font-mono text-[10px] font-semibold uppercase tracking-wider text-graphite-500 dark:text-graphite-400">Linux</span>
                <p class="text-graphite-600 dark:text-graphite-300 leading-relaxed">
                  Uses distro pkg / <code class="font-mono">curl</code>; client configs live under <code class="font-mono">~/.config</code>.
                </p>
              </div>
            </div>
          </section>

          <div class="flex items-center justify-between gap-3 pt-1">
            <Button variant="secondary" size="sm" onclick={() => goToStep(1)}>
              <span>Back</span>
            </Button>
            <div class="flex items-center gap-3">
              {#if servers.length > 0}
                <span class="hidden sm:inline font-mono text-[11px] text-graphite-500 dark:text-graphite-400">
                  {servers.length} configured {servers.length === 1 ? 'server' : 'servers'} ready
                </span>
              {/if}
              <div use:magnet={0.14}>
                <Button variant="primary" size="md" onclick={() => goToStep(3)}>
                  <span>Continue to Connect &amp; Launch</span>
                </Button>
              </div>
            </div>
          </div>

        {:else}
          <div class="text-center space-y-1.5 max-w-2xl mx-auto animate-blur-enter">
            <h1 class="text-2xl sm:text-[28px] leading-tight font-semibold tracking-[-0.03em] text-graphite-950 dark:text-graphite-50">
              Connect Once &amp; Launch
            </h1>
            <p class="text-xs sm:text-sm text-graphite-600 dark:text-graphite-400 leading-relaxed max-w-xl mx-auto">
              Choose your AI client, copy its single endpoint config, and run a live <code class="font-mono text-graphite-800 dark:text-graphite-200">tools/list</code> probe.
            </p>
          </div>

          <section class="board-surface relative rounded-2xl border border-graphite-200/80 dark:border-white/[0.09] p-4 sm:p-5 shadow-xl space-y-3 overflow-hidden">
            <!-- Search + Smooth Gliding Category SegmentedControl + Live Probe -->
            <div class="flex flex-wrap items-center justify-between gap-2.5">
              <div class="flex flex-wrap items-center gap-2.5">
                <div class="relative">
                  <StreamlineIcon
                    name="Search"
                    size={12}
                    class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-graphite-400 dark:text-graphite-500"
                  />
                  <input
                    type="text"
                    placeholder="Search {CLIENT_TABS.length} clients…"
                    bind:value={clientSearch}
                    aria-label="Search client presets"
                    class="w-44 h-9 rounded-lg border border-graphite-200 dark:border-white/[0.1] bg-white/80 dark:bg-white/[0.04] pl-8 pr-7 text-xs text-graphite-900 dark:text-graphite-100 placeholder:text-graphite-400 focus:outline-none focus:border-graphite-900 dark:focus:border-white/50 focus:ring-2 focus:ring-graphite-900/15 dark:focus:ring-white/15 transition-colors"
                  />
                  {#if clientSearch}
                    <button
                      type="button"
                      onclick={() => (clientSearch = '')}
                      aria-label="Clear search"
                      class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-graphite-400 hover:text-graphite-700 dark:hover:text-graphite-200"
                    >
                      <StreamlineIcon name="X" size={10} />
                    </button>
                  {/if}
                </div>

                <SegmentedControl
                  options={CATEGORY_OPTIONS}
                  value={clientCategory}
                  ariaLabel="Filter client category"
                  onchange={(v) => (clientCategory = v as 'All' | ClientCategory)}
                />
              </div>

              <Button variant="secondary" size="sm" onclick={testEndpointLive} disabled={probeState.status === 'probing'}>
                {#if probeState.status === 'probing'}
                  <span class="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
                    <span class="connect-ring-pulse absolute inset-0 rounded-full border border-amber-500/70"></span>
                    <span class="h-2 w-2 rounded-full border-[1.5px] border-amber-500/25 border-t-amber-600 dark:border-t-amber-300 connect-arc-spin"></span>
                  </span>
                {:else}
                  <StreamlineIcon name="RefreshCw" size={12} />
                {/if}
                <span>{probeState.status === 'probing' ? 'Probing…' : 'Test Live'}</span>
              </Button>
            </div>

            {#if probeState.status !== 'idle'}
              <div
                aria-live="polite"
                class="relative flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-xs transition-colors {probeState.status === 'error'
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

            <!-- Roomy 21-Client Selector Grid -->
            {#if filteredStep3Clients.length === 0}
              <div class="rounded-xl border border-graphite-200/80 dark:border-white/[0.08] p-4 text-center flex items-center justify-center gap-3">
                <span class="text-xs text-graphite-500 dark:text-graphite-400">No matching clients.</span>
                <Button
                  variant="secondary"
                  size="xs"
                  onclick={() => {
                    clientSearch = '';
                    clientCategory = 'All';
                    selectedClient = 'other';
                  }}
                >
                  <span>Use Other (Any Client)</span>
                </Button>
              </div>
            {:else}
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5">
                {#each filteredStep3Clients as client (client.id)}
                  {@const selected = selectedClient === client.id}
                  <button
                    type="button"
                    use:spotlight
                    onclick={() => {
                      selectedClient = client.id;
                      selectedModeId = '';
                    }}
                    class="text-left rounded-xl border px-2.5 py-1.5 flex items-center gap-2 transition-all duration-150 active:scale-[0.98] {selected
                      ? 'bg-graphite-950 text-white dark:bg-white dark:text-graphite-950 border-transparent shadow-xs'
                      : 'border-graphite-200/80 dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] text-graphite-800 dark:text-graphite-200 hover:border-graphite-300 dark:hover:border-white/[0.16]'}"
                  >
                    <AgentIcon
                      id={client.id}
                      size={18}
                      inverted={selected}
                    />
                    <span class="text-[11px] font-medium truncate flex-1">{client.label}</span>
                  </button>
                {/each}
              </div>
            {/if}

            <!-- Split Config & OS Locations -->
            <div class="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-3">
              <!-- Config Snippet -->
              <div class="rounded-xl border border-graphite-200 dark:border-white/[0.1] bg-white/80 dark:bg-white/[0.03] p-3.5 flex flex-col gap-2">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <AgentIcon id={selectedMeta.id} size={18} />
                    <span class="text-xs font-semibold text-graphite-900 dark:text-graphite-100 truncate">
                      {selectedMeta.label}
                    </span>
                    <span class="font-mono text-[10px] uppercase tracking-wider text-graphite-500 dark:text-graphite-400 truncate">
                      · {activeGuide.fileHint}
                    </span>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                    {#if clientGuide.modes && clientGuide.modes.length > 1}
                      <SegmentedControl
                        size="sm"
                        options={clientGuide.modes.map((m) => ({ value: m.id, label: m.label }))}
                        value={activeGuide.id}
                        ariaLabel="Connection method"
                        onchange={(v) => (selectedModeId = v)}
                      />
                    {/if}
                    <Button
                      variant="secondary"
                      size="xs"
                      onclick={() => copyText('step3-snippet', activeGuide.copyLabel, activeGuide.snippet)}
                      class="shrink-0"
                    >
                      <StreamlineIcon name={copiedKey === 'step3-snippet' ? 'Check' : 'Copy'} size={11} />
                      <span>{copiedKey === 'step3-snippet' ? 'Copied' : 'Copy'}</span>
                    </Button>
                  </div>
                </div>

                <p class="text-[11.5px] text-graphite-600 dark:text-graphite-300 leading-relaxed">
                  {activeGuide.subtitle}
                </p>

                {#if clientGuide.info}
                  <div class="flex items-start gap-2 rounded-lg border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/80 dark:bg-white/[0.04] px-3 py-2 text-[11px] text-graphite-700 dark:text-graphite-300">
                    <StreamlineIcon name="Info" size={13} class="shrink-0 mt-0.5 text-graphite-500 dark:text-graphite-400" />
                    <span>{clientGuide.info}</span>
                  </div>
                {/if}

                {#if activeGuide.warning}
                  <div class="flex items-start gap-2 rounded-lg border border-graphite-300 dark:border-white/[0.12] bg-graphite-50/80 dark:bg-white/[0.04] px-3 py-2 text-[11px] text-graphite-700 dark:text-graphite-300">
                    <StreamlineIcon name="ShieldAlert" size={13} class="shrink-0 mt-0.5 text-graphite-500 dark:text-graphite-400" />
                    <span>{activeGuide.warning}</span>
                  </div>
                {/if}

                <pre class="rounded-lg border border-graphite-200/80 dark:border-white/[0.08] bg-graphite-50/90 dark:bg-graphite-950/75 p-2.5 font-mono text-[11.5px] leading-relaxed text-graphite-800 dark:text-graphite-200 overflow-x-auto whitespace-pre-wrap [overflow-wrap:anywhere] select-all max-h-40">{activeGuide.snippet}</pre>
              </div>

              <!-- Config File Locations & Endpoint Summary -->
              <div class="rounded-xl border border-graphite-200 dark:border-white/[0.1] bg-white/70 dark:bg-white/[0.02] p-3.5 flex flex-col justify-between gap-2.5">
                <div class="space-y-2">
                  <span class="font-mono text-[10px] uppercase tracking-wider text-graphite-500 dark:text-graphite-400 block">
                    Config File Locations
                  </span>
                  <div class="space-y-2">
                    {#each selectedMeta.osPaths as loc (loc.os)}
                      <div class="flex items-center justify-between gap-2 text-[11px]">
                        <div class="min-w-0 flex-1 [overflow-wrap:anywhere]">
                          <span class="font-medium text-graphite-800 dark:text-graphite-200">{loc.os}:</span>
                          <code class="ml-1 font-mono text-[10.5px] text-graphite-600 dark:text-graphite-400 select-all">{loc.path}</code>
                        </div>
                        <button
                          type="button"
                          class="shrink-0 text-graphite-400 hover:text-graphite-700 dark:hover:text-graphite-200 transition-colors p-1 rounded"
                          onclick={() => copyText(`step3-path-${loc.os}`, `${selectedMeta.label} ${loc.os} path`, loc.path)}
                          aria-label="Copy {loc.os} path"
                        >
                          <StreamlineIcon name={copiedKey === `step3-path-${loc.os}` ? 'Check' : 'Copy'} size={11} />
                        </button>
                      </div>
                    {/each}
                  </div>
                </div>

                <div class="pt-2.5 border-t border-graphite-200/70 dark:border-white/[0.07] space-y-1.5 text-[11px]">
                  <span class="font-mono text-[10px] uppercase tracking-wider text-graphite-500 dark:text-graphite-400 block">
                    Local Endpoints
                  </span>
                  <div class="flex items-center justify-between gap-2">
                    <code class="font-mono text-[10.5px] text-graphite-700 dark:text-graphite-300 truncate select-all">{localHttpUrl}</code>
                    <button
                      type="button"
                      onclick={() => copyText('step3-http', 'HTTP Endpoint', localHttpUrl)}
                      aria-label="Copy local HTTP endpoint"
                      class="shrink-0 text-graphite-400 hover:text-graphite-700 dark:hover:text-graphite-200 p-0.5 rounded"
                    >
                      <StreamlineIcon name={copiedKey === 'step3-http' ? 'Check' : 'Copy'} size={11} />
                    </button>
                  </div>
                  <div class="flex items-center justify-between gap-2">
                    <code class="font-mono text-[10.5px] text-graphite-700 dark:text-graphite-300 truncate select-all">{localSseUrl}</code>
                    <button
                      type="button"
                      onclick={() => copyText('step3-sse', 'SSE Endpoint', localSseUrl)}
                      aria-label="Copy local SSE endpoint"
                      class="shrink-0 text-graphite-400 hover:text-graphite-700 dark:hover:text-graphite-200 p-0.5 rounded"
                    >
                      <StreamlineIcon name={copiedKey === 'step3-sse' ? 'Check' : 'Copy'} size={11} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div class="flex items-center justify-between gap-3 pt-1">
            <Button variant="secondary" size="sm" onclick={() => goToStep(2)}>
              <span>Back</span>
            </Button>
            <div use:magnet={0.16} class="relative rounded-lg">
              <Button variant="primary" size="md" onclick={onComplete}>
                <span>Launch Switchboard</span>
              </Button>
            </div>
          </div>
        {/if}
      </div>
    {/key}
  </main>
</div>
