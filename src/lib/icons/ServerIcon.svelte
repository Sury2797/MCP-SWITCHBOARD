<script lang="ts">
  interface Props {
    name?: string;
    command?: string | null;
    url?: string | null;
    size?: number;
    inverted?: boolean;
    class?: string;
  }

  let {
    name = '',
    command = null,
    url = null,
    size = 16,
    inverted = false,
    class: cls = '',
  }: Props = $props();

  interface IconSpec {
    file: string;
    monoDark?: boolean;
    scale?: number;
    extraClass?: string;
  }

  const SERVER_ICON_RULES: Array<[RegExp, IconSpec]> = [
    [/\bgithub\b/i, { file: 'github.svg', monoDark: true }],
    [/\b(gitlab|bitbucket|git)\b/i, { file: 'gitlab.svg' }],
    [/\b(postgres|postgresql|pg)\b/i, { file: 'postgres.svg', scale: 1.06 }],
    [/\bsupabase\b/i, { file: 'supabase.svg' }],
    [/\bneon\b/i, { file: 'neon.svg' }],
    [/\bprisma\b/i, { file: 'prisma.svg', monoDark: true }],
    [/\bsqlite\b/i, { file: 'sqlite.svg' }],
    [/\bmysql\b/i, { file: 'mysql.svg', scale: 1.72, extraClass: 'dark:brightness-150' }],
    [/\b(mongo|mongodb)\b/i, { file: 'mongodb.svg' }],
    [/\bredis\b/i, { file: 'redis.svg' }],
    [/\bbigquery\b/i, { file: 'bigquery.svg' }],
    [/\b(sql|database|db|mariadb)\b/i, { file: 'database.svg' }],
    [/\b(gdrive|google-drive|drive)\b/i, { file: 'google_drive.svg' }],
    [/\b(filesystem|file|files|fs|folder|dir|disk|storage)\b/i, { file: 'filesystem.svg' }],
    [/\bnotion\b/i, { file: 'notion.svg' }],
    [/\bobsidian\b/i, { file: 'obsidian.svg' }],
    [/\blinear\b/i, { file: 'linear.svg' }],
    [/\b(jira|confluence|atlassian)\b/i, { file: 'jira.svg' }],
    [/\b(figma|design|sketch|magic-ui|boardui|reactbits|shadcn)\b/i, { file: 'figma.svg' }],
    [/\b(grafana|prometheus)\b/i, { file: 'grafana.svg', scale: 1.04 }],
    [/\b(sentry|datadog)\b/i, { file: 'sentry.svg', monoDark: true }],
    [/\b(icons8|icon|svg|2d-assets|textart)\b/i, { file: 'icons8.svg' }],
    [/\b(docker|container|podman)\b/i, { file: 'docker.svg', scale: 1.06 }],
    [/\b(k8s|kubernetes|kubectl|helm)\b/i, { file: 'kubernetes.svg' }],
    [/\b(slack|teams|message|beads|task)\b/i, { file: 'slack.svg' }],
    [/\bdiscord\b/i, { file: 'discord.svg' }],
    [/\b(gmail|mail|email)\b/i, { file: 'gmail.svg' }],
    [/\b(cloudflare|wrangler|tunnel)\b/i, { file: 'cloudflare.svg', scale: 1.06 }],
    [/\bvercel\b/i, { file: 'vercel.svg', monoDark: true }],
    [/\bnetlify\b/i, { file: 'netlify.svg' }],
    [/\b(playwright|e2e|test)\b/i, { file: 'playwright.svg', scale: 1.1 }],
    [/\bpuppeteer\b/i, { file: 'puppeteer.svg' }],
    [/\b(chrome|devtools|browser|selenium|adb)\b/i, { file: 'chrome.svg' }],
    [/\bbrave\b/i, { file: 'brave.svg' }],
    [/\btavily\b/i, { file: 'tavily.svg' }],
    [/\bexa\b/i, { file: 'exa.svg' }],
    [/\b(fetch|web|http|url|crawl|scrape|search|firecrawl|curl)\b/i, { file: 'fetch.svg' }],
    [/\b(sequential|thinking|memory|knowledge|brain|reason|context|workflow|n8n|langgraph|langchain)\b/i, { file: 'sequential.svg', scale: 1.04 }],
    [/\b(gemini|alphagenome|genomics|google-ai)\b/i, { file: 'gemini.svg' }],
    [/\b(ollama|llama)\b/i, { file: 'ollama.svg', monoDark: true }],
    [/\b(huggingface|hf|ai|lm|ml|litert|chip|godot|repomix|chembl|pdb)\b/i, { file: 'huggingface.svg' }],
    [/\b(powershell|bash|zsh|shell|terminal|iterm)\b/i, { file: 'terminal.svg' }],
  ];

  const resolved = $derived.by<IconSpec>(() => {
    const haystack = `${name} ${command || ''} ${url || ''}`;
    for (const [pattern, spec] of SERVER_ICON_RULES) {
      if (pattern.test(haystack)) return spec;
    }
    return { file: 'server.png', monoDark: true };
  });

  const src = $derived(`/icons/servers/${resolved.file}`);
  const adaptiveFilter = $derived(
    resolved.monoDark
      ? inverted
        ? 'invert dark:invert-0'
        : 'invert-0 dark:invert'
      : ''
  );
</script>

<span
  aria-hidden="true"
  style="width: {size}px; height: {size}px;"
  class="inline-flex items-center justify-center shrink-0 select-none transition-transform duration-150 {cls}"
>
  <img
    {src}
    alt=""
    width={size}
    height={size}
    loading="eager"
    decoding="async"
    draggable="false"
    style={resolved.scale ? `transform: scale(${resolved.scale});` : undefined}
    class="h-full w-full object-contain select-none {adaptiveFilter} {resolved.extraClass || ''}"
  />
</span>
