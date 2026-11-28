<script lang="ts">
  import { flushSync, onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import StreamlineIcon from './lib/icons/StreamlineIcon.svelte';
  import Button from './lib/primitives/Button.svelte';
  import { api, discoverSidecarBaseUrl, subscribeEvents } from './lib/api';
  import TopConnectionBar from './components/TopConnectionBar.svelte';
  import TelemetryStrip from './components/TelemetryStrip.svelte';
  import SwitchboardList from './components/SwitchboardList.svelte';
  import AddMcpModal from './components/AddMcpModal.svelte';
  import ToolInspectorModal from './components/ToolInspectorModal.svelte';
  import LogViewerModal from './components/LogViewerModal.svelte';
  import ConnectGuideModal from './components/ConnectGuideModal.svelte';
  import SettingsModal from './components/SettingsModal.svelte';
  import OnboardingView from './components/OnboardingView.svelte';
  import GlobalTooltip from './lib/primitives/GlobalTooltip.svelte';
  import { checkForAppUpdate, isTauriDesktop } from './lib/updater';
  import { detectPlatform, getInstallCommand } from './lib/platform';
  import type {
    AppState,
    LiveLogEvent,
    McpServerSnapshot,
    ServerSavePayload,
    SwitchboardSettings,
    ThemeMode,
    ToastMessage,
    UpdateCheckResult,
  } from './lib/types';

  let appState = $state<AppState | null>(null);
  let connecting = $state(true);
  let connectionError = $state<string | null>(null);
  let availableUpdate = $state<UpdateCheckResult | null>(null);
  let theme = $state<ThemeMode>(
    typeof localStorage !== 'undefined' && localStorage.getItem('mcp-switchboard-theme') === 'light'
      ? 'light'
      : 'dark'
  );
  let hasExplicitThemePreference = false;
  try {
    hasExplicitThemePreference =
      typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('mcp-switchboard-theme'));
  } catch {}

  let busyServers = $state<Record<string, boolean | 'connecting' | 'disconnecting'>>({});
  let tunnelBusy = $state(false);
  let searchInputEl = $state<HTMLInputElement | null>(null);

  // Modals & Drawers
  let addModalOpen = $state(false);
  let editingServer = $state<McpServerSnapshot | null>(null);
  let inspectingServer = $state<McpServerSnapshot | null>(null);
  let logServer = $state<McpServerSnapshot | null>(null);
  let liveLogEvent = $state<LiveLogEvent | null>(null);
  let helpOpen = $state(false);
  let settingsOpen = $state(false);
  let onboardingOpen = $state(
    typeof localStorage === 'undefined' || !localStorage.getItem('mcp-switchboard-onboarded')
  );

  function dismissOnboarding(): void {
    onboardingOpen = false;
  }

  function completeOnboarding(): void {
    onboardingOpen = false;
    try {
      localStorage.setItem('mcp-switchboard-onboarded', '1');
    } catch {}
    void api.updateSettings({ onboardingCompleted: true }).catch(() => {});
  }

  // Toast & Theme transition timers
  let toast = $state<ToastMessage | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let themeSwitchTimer: ReturnType<typeof setTimeout> | undefined;

  async function syncCloseToTrayToNative(enabled: boolean): Promise<void> {
    if (!isTauriDesktop()) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_close_to_tray', { enabled });
    } catch {
      // Ignore if unavailable outside Tauri desktop runtime
    }
  }

  function notify(message: string, type: 'info' | 'error' = 'info'): void {
    toast = { message, type, id: Date.now() };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast = null;
    }, 2600);
  }

  $effect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('mcp-switchboard-theme', theme);
    } catch {}

    const targetTheme = theme;
    if (isTauriDesktop()) {
      try {
        void import('@tauri-apps/api/window')
          .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(targetTheme))
          .catch(() => {});
      } catch {}
    }
  });

  let cleanupSse: (() => void) | null = null;
  let destroyed = false;

  async function connectToSidecar(): Promise<boolean> {
    connecting = true;
    connectionError = null;
    try {
      await discoverSidecarBaseUrl({ maxAttempts: 35, intervalMs: 250 });
      if (destroyed) return false;
      const initial = await api.getState();
      if (destroyed) return false;
      appState = initial;
      if (initial?.settings?.theme && !hasExplicitThemePreference) {
        theme = initial.settings.theme;
      }
      const shouldShowOnboarding =
        !initial?.settings?.onboardingCompleted || Boolean(initial?.settings?.startAtOnboarding);
      onboardingOpen = shouldShowOnboarding;
      try {
        if (initial?.settings?.onboardingCompleted) {
          localStorage.setItem('mcp-switchboard-onboarded', '1');
        } else {
          localStorage.removeItem('mcp-switchboard-onboarded');
        }
      } catch {}
      void syncCloseToTrayToNative(initial?.settings?.closeToTray ?? true);
      cleanupSse?.();
      cleanupSse = subscribeEvents({
        onState: (nextState) => {
          appState = nextState;
        },
        onLog: (logPayload) => {
          liveLogEvent = logPayload;
        },
      });
      if (destroyed) {
        cleanupSse?.();
        cleanupSse = null;
        return false;
      }
      connecting = false;
      return true;
    } catch (err) {
      if (!destroyed) {
        connectionError = err instanceof Error ? err.message : 'Unable to connect to MCP Switchboard engine.';
      }
      connecting = false;
      return false;
    }
  }

  onMount(() => {
    destroyed = false;

    function handleContextMenu(e: MouseEvent): void {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || Boolean(target?.isContentEditable);
      if (!isInput) {
        e.preventDefault();
      }
    }

    function handleDragOver(e: DragEvent): void {
      e.preventDefault();
    }
    function handleDrop(e: DragEvent): void {
      e.preventDefault();
    }

    function handleWheel(e: WheelEvent): void {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    }

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    window.addEventListener('wheel', handleWheel, { passive: false });

    const updateTimer = setTimeout(() => {
      if (destroyed) return;
      void checkForAppUpdate()
        .then((res) => {
          if (!destroyed && res.status === 'available') {
            availableUpdate = res;
          }
        })
        .catch(() => {});
    }, 3500);

    void connectToSidecar();

    return () => {
      destroyed = true;
      clearTimeout(toastTimer);
      clearTimeout(themeSwitchTimer);
      clearTimeout(updateTimer);
      document.documentElement.classList.remove('theme-switching');
      cleanupSse?.();
      cleanupSse = null;
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('wheel', handleWheel);
    };
  });

  function handleGlobalShortcut(e: KeyboardEvent): void {
    if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'))) {
      e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      searchInputEl?.focus();
      return;
    }

    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(target?.isContentEditable);
    const anyModalOpen = addModalOpen || settingsOpen || helpOpen || onboardingOpen || Boolean(inspectingServer) || Boolean(logServer);

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      editingServer = null;
      addModalOpen = true;
      return;
    }

    if (isTyping || anyModalOpen) return;

    if (e.key === '/') {
      e.preventDefault();
      searchInputEl?.focus();
    } else if (e.key === '?') {
      e.preventDefault();
      helpOpen = true;
    }
  }

  async function handleToggleTunnel(enable: boolean): Promise<void> {
    tunnelBusy = true;
    try {
      const res = enable ? await api.startTunnel() : await api.stopTunnel();
      if (res.state) appState = res.state;
      if (!enable) notify('Cloudflare Tunnel stopped');
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      tunnelBusy = false;
    }
  }

  async function handleToggleServer(name: string, enable: boolean): Promise<void> {
    busyServers = { ...busyServers, [name]: enable ? 'connecting' : 'disconnecting' };
    try {
      const res = await api.toggleServer(name, enable);
      if (res.state) appState = res.state;
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      busyServers = { ...busyServers, [name]: false };
    }
  }

  async function handleImportJson(jsonText: string): Promise<void> {
    const res = await api.importJson(jsonText);
    if (res.state) appState = res.state;
    const count = res.imported?.length || 1;
    notify(`Imported ${count} MCP ${count === 1 ? 'server' : 'servers'}`);
  }

  async function handleSaveServer(payload: ServerSavePayload): Promise<void> {
    const res = await api.saveServer(payload);
    if (res.state) appState = res.state;
    notify(payload.originalName ? `Updated ${payload.name}` : `Added ${payload.name}`);
  }

  async function handleDeleteServer(server: McpServerSnapshot): Promise<void> {
    try {
      const res = await api.deleteServer(server.name);
      if (res.state) appState = res.state;
      notify(`Removed ${server.name}`);
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  async function handleSaveSettings(patch: Partial<SwitchboardSettings>): Promise<void> {
    const res = await api.updateSettings(patch);
    if (res.state) appState = res.state;
    if (patch.closeToTray !== undefined) {
      await syncCloseToTrayToNative(patch.closeToTray);
    }
    notify('Settings saved');
  }

  let themeAnimating = false;

  async function handleToggleTheme(event?: MouseEvent): Promise<void> {
    const nextTheme: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    const docWithVT = document as Document & {
      startViewTransition?: (cb: () => void | Promise<void>) => {
        ready: Promise<void>;
        finished: Promise<void>;
      };
    };

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const originEl = (event?.currentTarget as HTMLElement | null) ?? null;
    let x =
      typeof event?.clientX === 'number' && event.clientX > 0
        ? event.clientX
        : window.innerWidth - 52;
    let y =
      typeof event?.clientY === 'number' && event.clientY > 0 ? event.clientY : 28;
    if (originEl) {
      const rect = originEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      }
    }

    const applyThemeNow = (): void => {
      hasExplicitThemePreference = true;
      theme = nextTheme;
      document.documentElement.classList.toggle('dark', nextTheme === 'dark');
      try {
        localStorage.setItem('mcp-switchboard-theme', nextTheme);
      } catch {}
    };

    if (themeAnimating || reduced || typeof docWithVT.startViewTransition !== 'function') {
      const root = document.documentElement;
      if (!reduced) {
        root.classList.add('theme-switching');
        clearTimeout(themeSwitchTimer);
        themeSwitchTimer = setTimeout(() => {
          root.classList.remove('theme-switching');
        }, 280);
      }
      applyThemeNow();
      void api.updateSettings({ theme: nextTheme }).catch(() => {});
      return;
    }

    themeAnimating = true;
    try {
      const transition = docWithVT.startViewTransition(() => {
        applyThemeNow();
        flushSync();
      });
      await transition.ready;

      const maxRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );

      const reveal = document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${maxRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 620,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        }
      );

      await Promise.allSettled([reveal.finished, transition.finished]);
    } catch {
      applyThemeNow();
    } finally {
      themeAnimating = false;
      void api.updateSettings({ theme: nextTheme }).catch(() => {});
    }
  }
</script>

<svelte:window onkeydown={handleGlobalShortcut} />

<div class="relative h-screen w-screen max-w-full max-h-screen overflow-hidden flex flex-col bg-graphite-50 dark:bg-graphite-950 text-graphite-950 dark:text-graphite-50 overscroll-none select-none">
  <!-- Frosted ambient glow mesh behind header + main -->
  <div class="glass-ambient-mesh pointer-events-none absolute inset-0 z-0" aria-hidden="true"></div>

  {#if availableUpdate}
    <div class="relative z-10 border-b border-graphite-200 dark:border-graphite-800 bg-white/80 dark:bg-graphite-900/80 backdrop-blur-md px-4 py-2 flex items-center justify-between text-xs text-graphite-900 dark:text-graphite-100 shrink-0">
      <div class="flex items-center gap-2">
        <StreamlineIcon name="Download" size={13} class="text-graphite-500 animate-pulse" />
        <span>Update <strong>v{availableUpdate.version}</strong> is available for MCP Switchboard.</span>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="primary" size="xs" onclick={() => (settingsOpen = true)}>
          Update Now
        </Button>
        <button
          type="button"
          onclick={() => (availableUpdate = null)}
          aria-label="Dismiss banner"
          class="text-graphite-400 hover:text-graphite-600 dark:hover:text-graphite-200 p-1"
        >
          <StreamlineIcon name="X" size={12} />
        </button>
      </div>
    </div>
  {/if}

  <TopConnectionBar
    port={appState?.port}
    tunnel={appState?.tunnel}
    {theme}
    {tunnelBusy}
    onToggleTunnel={handleToggleTunnel}
    onToggleTheme={handleToggleTheme}
    onOpenSettings={() => (settingsOpen = true)}
    onOpenHelp={() => (helpOpen = true)}
    onNotify={notify}
  />

  <main class="relative z-10 flex-1 overflow-y-auto overscroll-contain w-full">
    <div class="mx-auto max-w-[1080px] px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-4 sm:space-y-5">
      {#if connecting}
        <div class="space-y-4 sm:space-y-6 animate-fade-in">
          <div class="board-surface grid grid-cols-2 sm:grid-cols-3 rounded-2xl border border-graphite-200/80 dark:border-white/[0.08] overflow-hidden opacity-80">
            {#each [0, 1, 2] as idx (idx)}
              <div class="px-4 sm:px-6 py-4 space-y-2 {idx < 2 ? 'sm:border-r border-graphite-200/80 dark:border-white/[0.08]' : 'col-span-2 sm:col-span-1 border-t sm:border-t-0 border-graphite-200/80 dark:border-white/[0.08]'}">
                <div class="h-3 w-20 rounded bg-graphite-200/80 dark:bg-white/[0.07] animate-pulse"></div>
                <div class="h-6 w-14 rounded bg-graphite-200 dark:bg-white/[0.09] animate-pulse"></div>
              </div>
            {/each}
          </div>
          <div class="board-surface rounded-2xl border border-graphite-200/80 dark:border-white/[0.08] p-8 text-center flex flex-col items-center gap-3">
            <div class="relative w-10 h-10 flex items-center justify-center">
              <div class="absolute inset-0 rounded-full border-2 border-graphite-900/15 border-t-graphite-900 dark:border-white/15 dark:border-t-white animate-spin"></div>
              <StreamlineIcon name="Server" size={15} class="text-graphite-500 dark:text-graphite-400" />
            </div>
            <div>
              <h3 class="text-sm font-semibold text-graphite-900 dark:text-graphite-100">
                Connecting to MCP Switchboard Engine
              </h3>
              <p class="text-xs text-graphite-500 dark:text-graphite-400 mt-1">
                Binding local process bridge and verifying tool list…
              </p>
            </div>
          </div>
        </div>
      {:else if connectionError && !appState}
        <div class="board-dropdown rounded-2xl border border-rose-500/30 bg-rose-50/80 dark:bg-rose-950/30 backdrop-blur-md p-8 text-center max-w-lg mx-auto my-12 space-y-4">
          <div class="w-10 h-10 mx-auto rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center">
            <StreamlineIcon name="AlertTriangle" size={18} />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-rose-700 dark:text-rose-300">
              {isTauriDesktop() ? 'Unable to Connect to Background Engine' : connectionError}
            </h3>
            <p class="text-xs text-graphite-600 dark:text-graphite-400 mt-1.5 leading-relaxed">
              {#if isTauriDesktop()}
                {connectionError || 'The background engine took longer than expected to initialize.'}
                Ensure Node.js is installed (<code class="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 font-mono text-[11px]">{getInstallCommand('node', detectPlatform())}</code>), then click Retry.
              {:else}
                If running in web dev mode, start the local sidecar using <code class="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 font-mono text-[11px]">npm run sidecar</code>.
              {/if}
            </p>
          </div>
          <div class="pt-2 flex justify-center">
            <Button variant="primary" size="sm" onclick={connectToSidecar}>
              <StreamlineIcon name="RefreshCw" size={13} />
              <span>Retry Connection</span>
            </Button>
          </div>
        </div>
      {:else}
        <TelemetryStrip totals={appState?.totals} />

        <SwitchboardList
          servers={appState?.servers || []}
          {busyServers}
          bind:searchInputEl
          onToggle={handleToggleServer}
          onAdd={() => {
            editingServer = null;
            addModalOpen = true;
          }}
          onEdit={(server) => {
            editingServer = server;
            addModalOpen = true;
          }}
          onDelete={handleDeleteServer}
          onInspectTools={(server) => (inspectingServer = server)}
          onViewLogs={(server) => (logServer = server)}
          onNotify={notify}
        />
      {/if}
    </div>
  </main>

  <ToolInspectorModal
    server={inspectingServer}
    onClose={() => (inspectingServer = null)}
  />

  <LogViewerModal
    server={logServer}
    {liveLogEvent}
    onClose={() => (logServer = null)}
    onNotify={notify}
  />

  <ConnectGuideModal
    open={helpOpen}
    port={appState?.port}
    tunnel={appState?.tunnel}
    mcpAuthToken={appState?.settings?.mcpAuthToken}
    onReplayOnboarding={() => {
      helpOpen = false;
      onboardingOpen = true;
    }}
    onClose={() => (helpOpen = false)}
    onNotify={notify}
  />

  <!-- Onboarding (z-40): rendered from frame 0, no flash of dashboard skeleton -->
  {#if onboardingOpen}
    <OnboardingView
      port={appState?.port}
      servers={appState?.servers || []}
      totals={appState?.totals}
      tunnel={appState?.tunnel}
      {busyServers}
      {connecting}
      {theme}
      mcpAuthToken={appState?.settings?.mcpAuthToken}
      onToggleTheme={handleToggleTheme}
      onToggleServer={handleToggleServer}
      onOpenAddModal={() => {
        editingServer = null;
        addModalOpen = true;
      }}
      onSkip={dismissOnboarding}
      onComplete={completeOnboarding}
      onNotify={notify}
    />
  {/if}

  <!-- AddMcpModal (z-50) rendered after OnboardingView (z-40) so "+ Add MCP JSON" from Onboarding works -->
  <AddMcpModal
    open={addModalOpen}
    {editingServer}
    onClose={() => {
      addModalOpen = false;
      editingServer = null;
    }}
    onImportJson={handleImportJson}
    onSaveServer={handleSaveServer}
  />

  <SettingsModal
    open={settingsOpen}
    settings={appState?.settings}
    configPath={appState?.configPath}
    initialUpdate={availableUpdate}
    onUpdateStatus={(res) => {
      availableUpdate = res.status === 'available' ? res : null;
    }}
    onClose={() => (settingsOpen = false)}
    onSave={handleSaveSettings}
  />

  {#if toast}
    <div
      transition:fly={{ y: 8, duration: 200, easing: cubicOut }}
      role="status"
      aria-live="polite"
      class="board-dropdown fixed bottom-5 right-5 z-[60] rounded-xl border px-3.5 py-2 text-xs font-medium {toast.type === 'error'
        ? 'border-rose-500/35 bg-rose-50/95 text-rose-800 dark:bg-rose-950/95 dark:text-rose-200'
        : 'border-graphite-200/80 dark:border-white/[0.1] text-graphite-900 dark:text-graphite-100'}"
    >
      {toast.message}
    </div>
  {/if}

  <GlobalTooltip />
</div>
