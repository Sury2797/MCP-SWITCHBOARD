<script lang="ts">
  import { tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import StreamlineIcon from '../lib/icons/StreamlineIcon.svelte';
  import ServerIcon from '../lib/icons/ServerIcon.svelte';
  import Button from '../lib/primitives/Button.svelte';
  import CustomSelect, { type SelectOption } from '../lib/primitives/CustomSelect.svelte';
  import SegmentedControl, { type SegmentOption } from '../lib/primitives/SegmentedControl.svelte';
  import { BACKDROP_FADE, glassModal } from '../lib/motion';
  import type { McpServerSnapshot, ServerSavePayload, TransportType } from '../lib/types';

  interface Props {
    open?: boolean;
    editingServer?: McpServerSnapshot | null;
    onClose?: () => void;
    onImportJson?: (jsonText: string) => Promise<void>;
    onSaveServer?: (payload: ServerSavePayload) => Promise<void>;
  }

  interface KeyValuePair {
    key: string;
    value: string;
  }

  let {
    open = false,
    editingServer = null,
    onClose = () => {},
    onImportJson = async () => {},
    onSaveServer = async () => {},
  }: Props = $props();

  let jsonInputEl = $state<HTMLTextAreaElement | null>(null);
  let nameInputEl = $state<HTMLInputElement | null>(null);

  const TRANSPORT_OPTIONS: SelectOption[] = [
    {
      value: 'stdio',
      label: 'STDIO',
      badge: 'Local Process',
      description: 'Spawn a local CLI process (npx, uvx, node, python, binary)',
    },
    {
      value: 'streamableHttp',
      label: 'Streamable HTTP',
      badge: 'Remote HTTP',
      description: 'Modern standard remote MCP HTTP endpoint',
    },
    {
      value: 'sse',
      label: 'SSE',
      badge: 'Legacy Remote',
      description: 'Legacy Server-Sent Events remote MCP endpoint',
    },
  ];

  const MODE_OPTIONS: SegmentOption[] = [
    { value: 'json', label: 'Paste JSON' },
    { value: 'form', label: 'Simple Form' },
  ];

  const SAMPLE_PLACEHOLDER = `{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
      }
    }
  }
}`;

  const isEditing = $derived(Boolean(editingServer));

  let tab = $state<'json' | 'form'>('json');
  let jsonText = $state('');
  let submitting = $state(false);
  let submitError = $state<string | null>(null);

  let name = $state('');
  let transport = $state<TransportType>('stdio');
  let command = $state('');
  let argsText = $state('');
  let url = $state('');
  let envPairs = $state<KeyValuePair[]>([]);
  let headerPairs = $state<KeyValuePair[]>([]);
  let revealedSecrets = $state<Record<string, boolean>>({});

  $effect(() => {
    if (!open) return;
    submitError = null;
    revealedSecrets = {};
    if (editingServer) {
      tab = 'form';
      name = editingServer.name || '';
      transport = editingServer.transport || 'stdio';
      command = editingServer.command || '';
      argsText = (editingServer.args || []).map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
      url = editingServer.url || '';
      envPairs = Object.entries(editingServer.env || {}).map(([k, v]) => ({ key: k, value: v }));
      headerPairs = Object.entries(editingServer.headers || {}).map(([k, v]) => ({ key: k, value: v }));
    } else {
      tab = 'json';
      jsonText = '';
      name = '';
      transport = 'stdio';
      command = '';
      argsText = '';
      url = '';
      envPairs = [];
      headerPairs = [];
    }
    void tick().then(() => {
      if (editingServer) {
        nameInputEl?.focus();
      } else {
        jsonInputEl?.focus();
      }
    });
  });

  const jsonValidation = $derived.by(() => {
    if (!jsonText.trim()) return { valid: false, error: null as string | null, servers: [] as Array<{ name: string; transport: string; target: string }> };
    try {
      const parsed: unknown = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { valid: false, error: 'Root value must be a JSON object.', servers: [] };
      }
      const root = parsed as Record<string, unknown>;
      let rawMap = root;
      for (const key of ['mcpServers', 'servers', 'context_servers', 'mcp']) {
        const candidate = root[key];
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
          rawMap = candidate as Record<string, unknown>;
          break;
        }
      }
      const entries = Object.entries(rawMap);
      if (entries.length === 0) {
        return { valid: false, error: 'No server entries found in JSON.', servers: [] };
      }
      const summaries: Array<{ name: string; transport: string; target: string }> = [];
      for (const [entryName, rawCfg] of entries) {
        if (!rawCfg || typeof rawCfg !== 'object' || Array.isArray(rawCfg)) {
          return { valid: false, error: `Entry "${entryName}" must be a JSON object.`, servers: [] };
        }
        const cfg = rawCfg as {
          url?: unknown;
          httpUrl?: unknown;
          serverUrl?: unknown;
          command?: unknown;
          args?: unknown[];
        };
        const rawUrl = cfg.url ?? cfg.httpUrl ?? cfg.serverUrl;
        const hasUrl = typeof rawUrl === 'string' && rawUrl.trim().length > 0;
        let cmdDisplay = '';
        if (typeof cfg.command === 'string' && cfg.command.trim().length > 0) {
          cmdDisplay = `${cfg.command.trim()} ${(Array.isArray(cfg.args) ? cfg.args : []).join(' ')}`.trim();
        } else if (Array.isArray(cfg.command) && cfg.command.length > 0) {
          cmdDisplay = cfg.command.map((v) => String(v)).join(' ').trim();
        } else if (cfg.command && typeof cfg.command === 'object') {
          const zedCmd = cfg.command as { path?: unknown; command?: unknown; args?: unknown[] };
          const bin = String(zedCmd.path || zedCmd.command || '').trim();
          if (bin) {
            cmdDisplay = `${bin} ${(Array.isArray(zedCmd.args) ? zedCmd.args : []).join(' ')}`.trim();
          }
        }
        const hasCmd = cmdDisplay.length > 0;
        if (!hasUrl && !hasCmd) {
          return {
            valid: false,
            error: `Entry "${entryName}" needs either a "command" (STDIO) or "url" (HTTP/SSE).`,
            servers: [],
          };
        }
        summaries.push({
          name: entryName.trim(),
          transport: hasUrl ? 'HTTP' : 'STDIO',
          target: hasUrl ? String(rawUrl).trim() : cmdDisplay,
        });
      }
      return { valid: true, error: null, servers: summaries };
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : String(err), servers: [] };
    }
  });

  function handleWindowKey(e: KeyboardEvent): void {
    if (open && e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  async function handleImportSubmit(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!jsonValidation.valid) return;
    submitting = true;
    submitError = null;
    try {
      await onImportJson(jsonText);
      onClose();
    } catch (err) {
      submitError = err instanceof Error ? err.message : String(err);
    } finally {
      submitting = false;
    }
  }

  async function handleFormSubmit(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    submitting = true;
    submitError = null;
    try {
      const env: Record<string, string> = {};
      for (const row of envPairs) {
        if (row.key.trim()) env[row.key.trim()] = row.value;
      }
      const headers: Record<string, string> = {};
      for (const row of headerPairs) {
        if (row.key.trim()) headers[row.key.trim()] = row.value;
      }
      const args = argsText.trim()
        ? argsText.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((s) => s.replace(/^["']|["']$/g, '')) || []
        : [];

      await onSaveServer({
        name: name.trim(),
        originalName: editingServer?.name || null,
        transport,
        command: transport === 'stdio' ? command.trim() : undefined,
        args: transport === 'stdio' ? args : undefined,
        env: transport === 'stdio' ? env : undefined,
        url: transport !== 'stdio' ? url.trim() : undefined,
        headers: transport !== 'stdio' ? headers : undefined,
      });
      onClose();
    } catch (err) {
      submitError = err instanceof Error ? err.message : String(err);
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:window onkeydown={handleWindowKey} />

{#if open}
  <div
    transition:fade={BACKDROP_FADE}
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
  >
    <button
      type="button"
      aria-label="Close overlay"
      onclick={onClose}
      class="fixed inset-0 cursor-default bg-transparent"
      tabindex="-1"
    ></button>
    <div
      transition:glassModal
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-mcp-title"
      tabindex="-1"
      class="board-glass-modal relative z-10 w-[92vw] max-w-2xl max-h-[min(88vh,780px)] rounded-2xl border border-graphite-200/80 dark:border-white/[0.09] flex flex-col overflow-hidden focus:outline-none"
    >
      <div class="flex items-center justify-between gap-3 border-b border-graphite-200/80 dark:border-white/[0.08] px-5 py-3.5 shrink-0">
        <div class="flex items-center gap-3 min-w-0">
          <div class="flex h-8 w-8 items-center justify-center rounded-xl border border-graphite-200 dark:border-white/[0.1] bg-graphite-50/90 dark:bg-white/[0.05] text-graphite-700 dark:text-graphite-200 shrink-0 shadow-xs">
            {#if isEditing || (tab === 'form' && name.trim())}
              <ServerIcon name={editingServer?.name || name} command={command} url={url} size={18} />
            {:else}
              <StreamlineIcon name="Plus" size={14} />
            {/if}
          </div>
          <h2 id="add-mcp-title" class="text-sm font-semibold text-graphite-950 dark:text-graphite-50 truncate">
            {editingServer ? `Edit ${editingServer.name}` : 'Add MCP Server'}
          </h2>
        </div>
        <Button variant="ghost" size="xs" iconOnly onclick={onClose} aria-label="Close modal">
          <StreamlineIcon name="X" size={13} />
        </Button>
      </div>

      {#if !isEditing}
        <div class="border-b border-graphite-200/80 dark:border-white/[0.08] px-5 py-2.5 shrink-0">
          <SegmentedControl
            options={MODE_OPTIONS}
            value={tab}
            ariaLabel="Add server mode"
            onchange={(v) => {
              tab = v as 'json' | 'form';
              submitError = null;
            }}
          />
        </div>
      {/if}

      {#if tab === 'json'}
        <div role="tabpanel" class="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <form onsubmit={handleImportSubmit} class="p-5 space-y-4">
          <div class="space-y-1.5">
            <p class="text-xs text-graphite-600 dark:text-graphite-300 leading-relaxed">
              Paste any standard <code class="font-mono">mcpServers</code>, <code class="font-mono">servers</code>, or <code class="font-mono">context_servers</code> JSON from GitHub, Antigravity, Claude Desktop, Cursor, VS Code, Windsurf, or Zed.
            </p>
            <p class="font-mono text-[10.5px] text-graphite-500 dark:text-graphite-400 break-words">
              Paths: %APPDATA%\Claude · ~/Library/Application Support/Claude · ~/.config/zed · ~/.cursor/mcp.json
            </p>
          </div>

          <textarea
            bind:this={jsonInputEl}
            rows={10}
            bind:value={jsonText}
            placeholder={SAMPLE_PLACEHOLDER}
            aria-label="MCP JSON configuration"
            spellcheck="false"
            class="relative z-10 w-full rounded-xl border border-graphite-200 dark:border-graphite-700/80 bg-graphite-50/50 dark:bg-graphite-950 p-3.5 font-mono text-xs leading-relaxed text-graphite-900 dark:text-graphite-100 shadow-xs focus:border-graphite-900 dark:focus:border-white/50 focus:ring-2 focus:ring-graphite-900/15 dark:focus:ring-white/15 focus:outline-none transition-colors"
          ></textarea>

          {#if jsonText.trim() && jsonValidation.error}
            <div class="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              <StreamlineIcon name="AlertCircle" size={14} class="mt-0.5 text-rose-500 shrink-0" />
              <span class="font-mono break-words">{jsonValidation.error}</span>
            </div>
          {/if}

          {#if jsonValidation.valid}
            <div class="rounded-xl border border-graphite-200/80 dark:border-white/[0.1] bg-graphite-50/80 dark:bg-white/[0.04] backdrop-blur-sm px-3.5 py-2.5 text-xs text-graphite-800 dark:text-graphite-200 space-y-1.5">
              <div class="flex items-center gap-1.5 font-medium">
                <StreamlineIcon name="CheckCircle2" size={14} class="text-graphite-700 dark:text-graphite-300 shrink-0" />
                <span>Detected {jsonValidation.servers.length} {jsonValidation.servers.length === 1 ? 'server' : 'servers'} ready to import:</span>
              </div>
              <ul class="pl-5 list-disc font-mono text-[11px] space-y-1 text-graphite-700 dark:text-graphite-300">
                {#each jsonValidation.servers as s (s.name)}
                  <li class="break-words">
                    <span class="font-semibold">{s.name}</span> ({s.transport}) — <span class="opacity-80">{s.target}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if submitError}
            <p class="text-xs text-rose-500 break-words">{submitError}</p>
          {/if}

          <div class="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onclick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" disabled={!jsonValidation.valid || submitting}>
              {submitting
                ? 'Importing…'
                : jsonValidation.servers.length > 1
                  ? `Import ${jsonValidation.servers.length} Servers`
                  : 'Import Server'}
            </Button>
          </div>
          </form>
        </div>
      {:else}
        <div role="tabpanel" class="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <form onsubmit={handleFormSubmit} class="p-5 pb-8 space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label for="mcp-name" class="block text-xs font-medium text-graphite-700 dark:text-graphite-300 mb-1.5">Server Name</label>
              <input
                bind:this={nameInputEl}
                id="mcp-name"
                type="text"
                required
                bind:value={name}
                placeholder="e.g. github"
                class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-graphite-900 dark:focus:border-white/50 focus:ring-2 focus:ring-graphite-900/15 dark:focus:ring-white/15 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label for="mcp-transport" class="block text-xs font-medium text-graphite-700 dark:text-graphite-300 mb-1.5">Transport</label>
              <CustomSelect
                id="mcp-transport"
                value={transport}
                options={TRANSPORT_OPTIONS}
                onchange={(v) => (transport = v as TransportType)}
              />
            </div>
          </div>

          {#if transport === 'stdio'}
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label for="mcp-cmd" class="block text-xs font-medium text-graphite-700 dark:text-graphite-300 mb-1.5">Command</label>
                <input
                  id="mcp-cmd"
                  type="text"
                  required
                  bind:value={command}
                  placeholder="npx, uvx, node"
                  class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-graphite-900 dark:focus:border-white/50 focus:ring-2 focus:ring-graphite-900/15 dark:focus:ring-white/15 focus:outline-none transition-colors"
                />
              </div>
              <div class="sm:col-span-2">
                <label for="mcp-args" class="block text-xs font-medium text-graphite-700 dark:text-graphite-300 mb-1.5">Arguments</label>
                <input
                  id="mcp-args"
                  type="text"
                  bind:value={argsText}
                  placeholder="-y @modelcontextprotocol/server-filesystem /path"
                  class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-graphite-900 dark:focus:border-white/50 focus:ring-2 focus:ring-graphite-900/15 dark:focus:ring-white/15 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium text-graphite-700 dark:text-graphite-300">Environment Variables</span>
                <Button variant="ghost" size="xs" onclick={() => (envPairs = [...envPairs, { key: '', value: '' }])}>
                  <StreamlineIcon name="Plus" size={12} />
                  <span>Add Variable</span>
                </Button>
              </div>
              {#each envPairs as pair, idx (idx)}
                <div class="flex items-center gap-2">
                  <input
                    type="text"
                    bind:value={pair.key}
                    placeholder="KEY"
                    class="w-2/5 h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-graphite-900 dark:focus:border-white/50 focus:ring-2 focus:ring-graphite-900/15 dark:focus:ring-white/15 focus:outline-none transition-colors"
                  />
                  <div class="relative flex-1 min-w-0">
                    <input
                      type={revealedSecrets[`env-${idx}`] ? 'text' : 'password'}
                      bind:value={pair.value}
                      placeholder="Secret value"
                      class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 pl-3 pr-9 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-graphite-900 dark:focus:border-white/50 focus:ring-2 focus:ring-graphite-900/15 dark:focus:ring-white/15 focus:outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onclick={() => (revealedSecrets[`env-${idx}`] = !revealedSecrets[`env-${idx}`])}
                      aria-label="Toggle secret visibility"
                      class="absolute right-2.5 top-1/2 -translate-y-1/2 text-graphite-400 hover:text-graphite-600 dark:hover:text-graphite-200 transition-colors p-1 rounded"
                    >
                      <StreamlineIcon name={revealedSecrets[`env-${idx}`] ? 'EyeOff' : 'Eye'} size={13} />
                    </button>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    iconOnly
                    onclick={() => (envPairs = envPairs.filter((_, i) => i !== idx))}
                    aria-label="Remove variable"
                  >
                    <StreamlineIcon name="Trash2" size={13} />
                  </Button>
                </div>
              {/each}
            </div>
          {:else}
            <div>
              <label for="mcp-url" class="block text-xs font-medium text-graphite-700 dark:text-graphite-300 mb-1.5">Endpoint URL</label>
              <input
                id="mcp-url"
                type="url"
                required
                bind:value={url}
                placeholder="https://example.com/mcp"
                class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-graphite-900 dark:focus:border-white/50 focus:ring-2 focus:ring-graphite-900/15 dark:focus:ring-white/15 focus:outline-none transition-colors"
              />
            </div>

            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium text-graphite-700 dark:text-graphite-300">HTTP Headers</span>
                <Button variant="ghost" size="xs" onclick={() => (headerPairs = [...headerPairs, { key: '', value: '' }])}>
                  <StreamlineIcon name="Plus" size={12} />
                  <span>Add Header</span>
                </Button>
              </div>
              {#each headerPairs as pair, idx (idx)}
                <div class="flex items-center gap-2">
                  <input
                    type="text"
                    bind:value={pair.key}
                    placeholder="Authorization"
                    class="w-2/5 h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-graphite-900 dark:focus:border-white/50 focus:ring-2 focus:ring-graphite-900/15 dark:focus:ring-white/15 focus:outline-none transition-colors"
                  />
                  <div class="relative flex-1 min-w-0">
                    <input
                      type={revealedSecrets[`hdr-${idx}`] ? 'text' : 'password'}
                      bind:value={pair.value}
                      placeholder="Bearer ..."
                      class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 pl-3 pr-9 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-graphite-900 dark:focus:border-white/50 focus:ring-2 focus:ring-graphite-900/15 dark:focus:ring-white/15 focus:outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onclick={() => (revealedSecrets[`hdr-${idx}`] = !revealedSecrets[`hdr-${idx}`])}
                      aria-label="Toggle header visibility"
                      class="absolute right-2.5 top-1/2 -translate-y-1/2 text-graphite-400 hover:text-graphite-600 dark:hover:text-graphite-200 transition-colors p-1 rounded"
                    >
                      <StreamlineIcon name={revealedSecrets[`hdr-${idx}`] ? 'EyeOff' : 'Eye'} size={13} />
                    </button>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    iconOnly
                    onclick={() => (headerPairs = headerPairs.filter((_, i) => i !== idx))}
                    aria-label="Remove header"
                  >
                    <StreamlineIcon name="Trash2" size={13} />
                  </Button>
                </div>
              {/each}
            </div>
          {/if}

          {#if submitError}
            <div class="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
              <StreamlineIcon name="AlertCircle" size={14} class="shrink-0" />
              <span class="break-words">{submitError}</span>
            </div>
          {/if}

          <div class="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onclick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" disabled={submitting}>
              {submitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Server'}
            </Button>
          </div>
          </form>
        </div>
      {/if}
    </div>
  </div>
{/if}
