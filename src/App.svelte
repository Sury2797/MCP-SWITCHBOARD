<script>
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import StreamlineIcon from './lib/icons/StreamlineIcon.svelte';
  import Button from './lib/primitives/Button.svelte';
  import { api, discoverSidecarBaseUrl, subscribeEvents } from './lib/api.js';
  import TopConnectionBar from './components/TopConnectionBar.svelte';
  import TelemetryStrip from './components/TelemetryStrip.svelte';
  import SwitchboardList from './components/SwitchboardList.svelte';
  import AddMcpModal from './components/AddMcpModal.svelte';
  import ToolInspectorDrawer from './components/ToolInspectorDrawer.svelte';
  import LogViewerModal from './components/LogViewerModal.svelte';
  import HelpDrawer from './components/HelpDrawer.svelte';
  import SettingsModal from './components/SettingsModal.svelte';
  import { checkForAppUpdate, isTauriDesktop } from './lib/updater.js';

  let appState = $state(null);
  let connecting = $state(true);
  let connectionError = $state(null);
  let availableUpdate = $state(null);
  let theme = $state(
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('mcp-switchboard-theme') || 'dark'
      : 'dark'
  );

  let busyServers = $state({});
  let tunnelBusy = $state(false);
  let searchInputEl = $state(null);

  // Modals & Drawers
  let addModalOpen = $state(false);
  let editingServer = $state(null);
  let inspectingServer = $state(null);
  let logServer = $state(null);
  let liveLogEvent = $state(null);
  let helpOpen = $state(false);
  let settingsOpen = $state(false);

  // Toast
  let toast = $state(null);
  let toastTimer = null;

  function notify(message, type = 'info') {
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
    localStorage.setItem('mcp-switchboard-theme', theme);
  });

  let cleanupSse = null;

  async function connectToSidecar() {
    connecting = true;
    connectionError = null;
    try {
      await discoverSidecarBaseUrl({ maxAttempts: 35, intervalMs: 250 });
      const initial = await api.getState();
      appState = initial;
      if (initial?.settings?.theme && !localStorage.getItem('mcp-switchboard-theme')) {
        theme = initial.settings.theme;
      }
      cleanupSse?.();
      cleanupSse = subscribeEvents({
        onState: (nextState) => {
          appState = nextState;
        },
        onLog: (logPayload) => {
          liveLogEvent = logPayload;
        },
      });
      connecting = false;
      return true;
    } catch (err) {
      connectionError = err.message || 'Unable to connect to MCP Switchboard engine.';
      connecting = false;
      return false;
    }
  }

  onMount(() => {
    let cancelled = false;

    // 1. Prevent browser context menu on non-input UI elements
    function handleContextMenu(e) {
      const isInput = e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA' || e.target?.isContentEditable;
      if (!isInput) {
        e.preventDefault();
      }
    }

    // 2. Prevent accidental file drop navigating the desktop webview
    function handleDragOver(e) {
      e.preventDefault();
    }
    function handleDrop(e) {
      e.preventDefault();
    }

    // 3. Prevent Ctrl+Wheel zoom
    function handleWheel(e) {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    }

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    window.addEventListener('wheel', handleWheel, { passive: false });

    // 4. Background update check (quiet, after 3.5s)
    const updateTimer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const res = await checkForAppUpdate(false);
        if (res.status === 'available') {
          availableUpdate = res;
        }
      } catch {
        // Quiet ignore background check failures
      }
    }, 3500);

    connectToSidecar().then(() => {
      if (cancelled) cleanupSse?.();
    });

    return () => {
      cancelled = true;
      clearTimeout(toastTimer);
      clearTimeout(updateTimer);
      cleanupSse?.();
      cleanupSse = null;
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('wheel', handleWheel);
    };
  });

  function handleGlobalShortcut(e) {
    // Intercept native browser reload & print shortcuts
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

    const tag = e.target?.tagName;
    const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;
    const anyModalOpen = addModalOpen || settingsOpen || helpOpen || Boolean(inspectingServer) || Boolean(logServer);

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

  async function handleToggleTunnel(enable) {
    tunnelBusy = true;
    try {
      const res = enable ? await api.startTunnel() : await api.stopTunnel();
      if (res.state) appState = res.state;
      if (!enable) notify('Cloudflare Tunnel stopped');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      tunnelBusy = false;
    }
  }

  async function handleToggleServer(name, enable) {
    busyServers = { ...busyServers, [name]: true };
    try {
      const res = await api.toggleServer(name, enable);
      if (res.state) appState = res.state;
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      busyServers = { ...busyServers, [name]: false };
    }
  }

  async function handleImportJson(jsonText) {
    const res = await api.importJson(jsonText);
    if (res.state) appState = res.state;
    const count = res.imported?.length || 1;
    notify(`Imported ${count} MCP ${count === 1 ? 'server' : 'servers'}`);
  }

  async function handleSaveServer(payload) {
    const res = await api.saveServer(payload);
    if (res.state) appState = res.state;
    notify(payload.originalName ? `Updated ${payload.name}` : `Added ${payload.name}`);
  }

  async function handleDeleteServer(server) {
    try {
      const res = await api.deleteServer(server.name);
      if (res.state) appState = res.state;
      notify(`Removed ${server.name}`);
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  async function handleSaveSettings(patch) {
    const res = await api.updateSettings(patch);
    if (res.state) appState = res.state;
    notify('Settings saved');
  }

  function handleToggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    api.updateSettings({ theme }).catch(() => {});
  }
</script>

<svelte:window onkeydown={handleGlobalShortcut} />

<div class="h-screen w-screen max-w-full max-h-screen overflow-hidden flex flex-col bg-graphite-50 dark:bg-graphite-950 text-graphite-950 dark:text-graphite-50 overscroll-none select-none">
  {#if availableUpdate}
    <div class="bg-sky-500/10 border-b border-sky-500/25 px-4 py-2 flex items-center justify-between text-xs text-sky-900 dark:text-sky-200 shrink-0">
      <div class="flex items-center gap-2">
        <StreamlineIcon name="Download" size={13} class="text-sky-500 animate-pulse" />
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

  <main class="flex-1 overflow-y-auto overscroll-contain w-full">
    <div class="mx-auto max-w-6xl px-4 sm:px-8 py-5 sm:py-6 space-y-4 sm:space-y-6">
      {#if connecting}
        <div class="rounded-2xl border border-graphite-200/80 dark:border-graphite-800/80 bg-white/70 dark:bg-graphite-900/70 backdrop-blur-md p-10 text-center max-w-md mx-auto my-12 shadow-xl animate-fade-in flex flex-col items-center gap-4">
          <div class="relative w-12 h-12 flex items-center justify-center">
            <div class="absolute inset-0 rounded-full border-2 border-emerald-500/25 border-t-emerald-500 animate-spin"></div>
            <div class="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <StreamlineIcon name="Server" size={16} />
            </div>
          </div>
          <div>
            <h3 class="text-sm font-semibold text-graphite-900 dark:text-graphite-100">
              Initializing MCP Switchboard Engine
            </h3>
            <p class="text-xs text-graphite-500 dark:text-graphite-400 mt-1">
              Binding local process bridge and discovering tools…
            </p>
          </div>
        </div>
      {:else if connectionError && !appState}
        <div class="rounded-2xl border border-rose-500/30 bg-rose-500/5 dark:bg-rose-950/20 backdrop-blur-md p-8 text-center max-w-lg mx-auto my-12 shadow-xl space-y-4">
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
                Ensure Node.js is installed (<code class="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 font-mono text-[11px]">winget install OpenJS.NodeJS.LTS</code>), then click Retry.
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

  <ToolInspectorDrawer
    server={inspectingServer}
    onClose={() => (inspectingServer = null)}
  />

  <LogViewerModal
    server={logServer}
    {liveLogEvent}
    onClose={() => (logServer = null)}
    onNotify={notify}
  />

  <HelpDrawer
    open={helpOpen}
    onClose={() => (helpOpen = false)}
    onNotify={notify}
  />

  <SettingsModal
    open={settingsOpen}
    settings={appState?.settings}
    configPath={appState?.configPath}
    onClose={() => (settingsOpen = false)}
    onSave={handleSaveSettings}
  />

  {#if toast}
    <div
      transition:fly={{ y: 8, duration: 180, easing: cubicOut }}
      role="status"
      aria-live="polite"
      class="fixed bottom-5 right-5 z-50 rounded-lg border px-3.5 py-2 text-xs font-medium shadow-lg {toast.type === 'error'
        ? 'border-rose-500/40 bg-rose-950 text-rose-200'
        : 'border-graphite-700 bg-graphite-900 text-graphite-100'}"
    >
      {toast.message}
    </div>
  {/if}
</div>
