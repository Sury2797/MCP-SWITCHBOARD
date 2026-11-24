<script>
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import StreamlineIcon from '../lib/icons/StreamlineIcon.svelte';
  import Button from '../lib/primitives/Button.svelte';
  import CustomSelect from '../lib/primitives/CustomSelect.svelte';

  let {
    open = false,
    editingServer = null,
    onClose = () => {},
    onImportJson = async () => {},
    onSaveServer = async () => {},
  } = $props();

  const TRANSPORT_OPTIONS = [
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

  let tab = $state('json');
  let jsonText = $state('');
  let submitting = $state(false);
  let submitError = $state(null);

  let name = $state('');
  let transport = $state('stdio');
  let command = $state('');
  let argsText = $state('');
  let url = $state('');
  let envPairs = $state([]);
  let headerPairs = $state([]);
  let revealedSecrets = $state({});

  $effect(() => {
    if (!open) return;
    submitError = null;
    revealedSecrets = {};
    if (editingServer) {
      tab = 'form';
      name = editingServer.name || '';
      transport = editingServer.transport || 'stdio';
      command = editingServer.command || '';
      argsText = (editingServer.args || []).join(' ');
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
  });

  const jsonValidation = $derived.by(() => {
    if (!jsonText.trim()) return { valid: false, error: null, servers: [] };
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { valid: false, error: 'Root value must be a JSON object.', servers: [] };
      }
      const map =
        parsed.mcpServers && typeof parsed.mcpServers === 'object' && !Array.isArray(parsed.mcpServers)
          ? parsed.mcpServers
          : parsed;
      const entries = Object.entries(map);
      if (entries.length === 0) {
        return { valid: false, error: 'No server entries found in JSON.', servers: [] };
      }
      const summaries = [];
      for (const [entryName, cfg] of entries) {
        if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
          return { valid: false, error: `Entry "${entryName}" must be a JSON object.`, servers: [] };
        }
        const hasUrl = typeof cfg.url === 'string' && cfg.url.trim().length > 0;
        const hasCmd = typeof cfg.command === 'string' && cfg.command.trim().length > 0;
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
          target: hasUrl ? cfg.url.trim() : `${cfg.command} ${(cfg.args || []).join(' ')}`.trim(),
        });
      }
      return { valid: true, error: null, servers: summaries };
    } catch (err) {
      return { valid: false, error: err.message, servers: [] };
    }
  });

  function handleWindowKey(e) {
    if (open && e.key === 'Escape') onClose();
  }

  async function handleImportSubmit(e) {
    e.preventDefault();
    if (!jsonValidation.valid) return;
    submitting = true;
    submitError = null;
    try {
      await onImportJson(jsonText);
      onClose();
    } catch (err) {
      submitError = err.message;
    } finally {
      submitting = false;
    }
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    submitting = true;
    submitError = null;
    try {
      const env = {};
      for (const row of envPairs) {
        if (row.key.trim()) env[row.key.trim()] = row.value;
      }
      const headers = {};
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
      submitError = err.message;
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:window onkeydown={handleWindowKey} />

{#if open}
  <div
    transition:fade={{ duration: 140 }}
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
  >
    <button
      type="button"
      aria-label="Close overlay"
      onclick={onClose}
      class="fixed inset-0 cursor-default bg-transparent"
      tabindex="-1"
    ></button>
    <div
      transition:fly={{ y: 10, duration: 200, easing: cubicOut }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-mcp-title"
      tabindex="-1"
      class="relative z-10 w-full max-w-xl max-h-[calc(100dvh-2rem)] rounded-xl border border-graphite-200 dark:border-graphite-800 bg-white dark:bg-graphite-900 shadow-2xl flex flex-col overflow-hidden"
    >
      <div class="flex items-center justify-between border-b border-graphite-200 dark:border-graphite-800 px-4 sm:px-5 py-3 sm:py-3.5 shrink-0">
        <h2 id="add-mcp-title" class="text-sm font-semibold text-graphite-950 dark:text-graphite-50">
          {isEditing ? `Edit ${editingServer.name}` : 'Add MCP Server'}
        </h2>
        <Button variant="ghost" size="xs" iconOnly onclick={onClose} aria-label="Close modal">
          <StreamlineIcon name="X" size={13} />
        </Button>
      </div>

      {#if !isEditing}
        <div class="flex border-b border-graphite-200 dark:border-graphite-800 px-4 sm:px-5 pt-2 gap-4 sm:gap-5 text-xs font-medium shrink-0">
          <button
            type="button"
            onclick={() => { tab = 'json'; submitError = null; }}
            class="pb-2.5 border-b-2 transition-colors {tab === 'json'
              ? 'border-graphite-950 dark:border-graphite-100 text-graphite-950 dark:text-graphite-50'
              : 'border-transparent text-graphite-500 hover:text-graphite-800 dark:hover:text-graphite-200'}"
          >
            Paste JSON
          </button>
          <button
            type="button"
            onclick={() => { tab = 'form'; submitError = null; }}
            class="pb-2.5 border-b-2 transition-colors {tab === 'form'
              ? 'border-graphite-950 dark:border-graphite-100 text-graphite-950 dark:text-graphite-50'
              : 'border-transparent text-graphite-500 hover:text-graphite-800 dark:hover:text-graphite-200'}"
          >
            Simple Form
          </button>
        </div>
      {/if}

      {#if tab === 'json'}
        <form onsubmit={handleImportSubmit} class="p-4 sm:p-5 space-y-3.5 sm:space-y-4 overflow-y-auto">
          <p class="text-xs text-graphite-500 dark:text-graphite-400">
            Paste any standard <code class="font-mono">mcpServers</code> JSON from GitHub, Claude Desktop, Cursor, or MCP Market. Multiple servers in one paste import together.
          </p>

          <textarea
            rows={9}
            bind:value={jsonText}
            placeholder={SAMPLE_PLACEHOLDER}
            spellcheck="false"
            class="relative z-10 w-full rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 p-3 font-mono text-xs leading-relaxed text-graphite-900 dark:text-graphite-100 shadow-xs focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 focus:outline-none transition-colors"
          ></textarea>

          {#if jsonText.trim() && jsonValidation.error}
            <div class="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              <StreamlineIcon name="AlertCircle" size={14} class="mt-0.5 text-rose-500 shrink-0" />
              <span class="font-mono">{jsonValidation.error}</span>
            </div>
          {/if}

          {#if jsonValidation.valid}
            <div class="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
              <div class="flex items-center gap-1.5 font-medium">
                <StreamlineIcon name="CheckCircle2" size={14} class="text-emerald-500 shrink-0" />
                <span>Detected {jsonValidation.servers.length} {jsonValidation.servers.length === 1 ? 'server' : 'servers'} ready to import:</span>
              </div>
              <ul class="pl-5 list-disc font-mono text-[11px] space-y-0.5">
                {#each jsonValidation.servers as s (s.name)}
                  <li>
                    <span class="font-semibold">{s.name}</span> ({s.transport}) — <span class="opacity-80">{s.target}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if submitError}
            <p class="text-xs text-rose-500">{submitError}</p>
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
      {:else}
        <form onsubmit={handleFormSubmit} class="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label for="mcp-name" class="block text-xs font-medium text-graphite-700 dark:text-graphite-300 mb-1.5">Server Name</label>
              <input
                id="mcp-name"
                type="text"
                required
                bind:value={name}
                placeholder="e.g. github"
                class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label for="mcp-transport" class="block text-xs font-medium text-graphite-700 dark:text-graphite-300 mb-1.5">Transport</label>
              <CustomSelect
                id="mcp-transport"
                value={transport}
                options={TRANSPORT_OPTIONS}
                onchange={(v) => (transport = v)}
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
                  class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 focus:outline-none transition-colors"
                />
              </div>
              <div class="sm:col-span-2">
                <label for="mcp-args" class="block text-xs font-medium text-graphite-700 dark:text-graphite-300 mb-1.5">Arguments</label>
                <input
                  id="mcp-args"
                  type="text"
                  bind:value={argsText}
                  placeholder="-y @modelcontextprotocol/server-filesystem /path"
                  class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 focus:outline-none transition-colors"
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
                    class="w-2/5 h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 focus:outline-none transition-colors"
                  />
                  <div class="relative flex-1">
                    <input
                      type={revealedSecrets[`env-${idx}`] ? 'text' : 'password'}
                      bind:value={pair.value}
                      placeholder="Secret value"
                      class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 pl-3 pr-9 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 focus:outline-none transition-colors"
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
                class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 focus:outline-none transition-colors"
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
                    class="w-2/5 h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 px-3 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 focus:outline-none transition-colors"
                  />
                  <div class="relative flex-1">
                    <input
                      type={revealedSecrets[`hdr-${idx}`] ? 'text' : 'password'}
                      bind:value={pair.value}
                      placeholder="Bearer ..."
                      class="w-full h-9 rounded-lg border border-graphite-200 dark:border-graphite-700/80 bg-white dark:bg-graphite-950 pl-3 pr-9 text-xs font-mono text-graphite-900 dark:text-graphite-100 shadow-xs placeholder:text-graphite-400 dark:placeholder:text-graphite-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 focus:outline-none transition-colors"
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
            <div class="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
              <StreamlineIcon name="AlertCircle" size={14} class="shrink-0" />
              <span>{submitError}</span>
            </div>
          {/if}

          <div class="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onclick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" disabled={submitting}>
              {submitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Server'}
            </Button>
          </div>
        </form>
      {/if}
    </div>
  </div>
{/if}
