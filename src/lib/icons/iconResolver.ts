import { ICON_CATALOG, type IconCatalogEntry } from './iconCatalog';

export interface ServerIconInput {
  name?: string;
  command?: string | null;
  args?: string[] | string | null;
  url?: string | null;
  env?: Record<string, string> | string | null;
}

export type IconMatchConfidence =
  | 'exact'
  | 'alias'
  | 'compound'
  | 'streaming'
  | 'category'
  | 'fallback';

export interface ResolvedServerIcon {
  id: string;
  file: string;
  src: string;
  monoDark: boolean;
  scale?: number;
  extraClass?: string;
  confidence: IconMatchConfidence;
}

const GENERIC_RUNTIMES = new Set([
  'npx',
  'npm',
  'pnpm',
  'pnpx',
  'yarn',
  'bun',
  'bunx',
  'uv',
  'uvx',
  'pip',
  'pipx',
  'python',
  'python3',
  'node',
  'nodejs',
  'deno',
  'tsx',
  'ts-node',
  'sh',
  'bash',
  'zsh',
  'cmd',
  'powershell',
  'pwsh',
  'docker',
  'podman',
  'exe',
]);

const NOISE_TOKENS = new Set([
  'mcp',
  'mcps',
  'server',
  'servers',
  'client',
  'clients',
  'modelcontextprotocol',
  'official',
  'remote',
  'local',
  'stdio',
  'sse',
  'http',
  'https',
  'streamable',
  'api',
  'key',
  'token',
  'secret',
  'app',
  'www',
  'com',
  'org',
  'net',
  'io',
  'ai',
  'dev',
  'co',
  'v1',
  'v2',
  'v3',
  'latest',
  'beta',
  'alpha',
  'prod',
  'staging',
  'test',
  'run',
  'exec',
  'start',
  'index',
  'main',
  'dist',
  'src',
  'bin',
  'usr',
  'etc',
  'var',
  'tmp',
  'path',
  'y',
  'yes',
  'rm',
  'i',
  'it',
  'my',
  'custom',
  'tool',
  'tools',
  'helper',
]);

// Extra semantic / package / product aliases mapped to canonical ICON_CATALOG slugs
const EXTRA_ALIASES: Record<string, string> = {
  gh: 'github',
  githubcopilot: 'copilot',
  pg: 'postgres',
  postgresql: 'postgres',
  k8s: 'kubernetes',
  kubectl: 'kubernetes',
  s3: 'aws',
  ec2: 'aws',
  lambda: 'aws',
  dynamodb: 'aws',
  bedrock: 'aws',
  cloudwatch: 'aws',
  sqs: 'aws',
  sns: 'aws',
  iam: 'aws',
  gke: 'gcp',
  gcs: 'gcp',
  vertexai: 'gcp',
  bigquery: 'bigquery',
  bq: 'bigquery',
  gcal: 'google-calendar',
  gdrive: 'google_drive',
  gmaps: 'google-maps',
  yt: 'youtube',
  hf: 'huggingface',
  context7: 'upstash',
  rovo: 'atlassian',
  jiraalign: 'jira',
  sketch: 'figma',
  'magic-ui': 'figma',
  boardui: 'figma',
  reactbits: 'figma',
  firecrawl: 'fetch',
  browserbase: 'chrome',
  browserless: 'chrome',
  devtools: 'chrome',
  'chrome-devtools': 'chrome',
  langgraph: 'sequential',
  langchain: 'sequential',
  llamaindex: 'sequential',
  'sequential-thinking': 'sequential',
  'knowledge-graph': 'sequential',
  repomix: 'book',
  chembl: 'science',
  pdb: 'science',
  litert: 'brain',
  alphagenome: 'science',
  genomics: 'science',
  '2d-assets': 'image',
  textart: 'image',
  beads: 'task',
  teams: 'slack',
  opensearch: 'elasticsearch',
  kibana: 'elasticsearch',
  hcl: 'terraform',
  opentofu: 'terraform',
  gitea: 'git',
  circleci: 'rocket',
  valkey: 'redis',
  memgraph: 'neo4j',
  openmeteo: 'weather',
  openweathermap: 'weather',
  yahoofinance: 'chart',
  alphavantage: 'chart',
  coingecko: 'chart',
  binance: 'chart',
  coinbase: 'chart',
  wolframalpha: 'science',
  semgrep: 'shield',
  snyk: 'shield',
  trivy: 'shield',
  nmap: 'shield',
  shodan: 'shield',
  tailscale: 'network',
  wireguard: 'network',
  ngrok: 'network',
  ffmpeg: 'video',
  elevenlabs: 'audio',
  deepl: 'translate',
  duckduckgo: 'search',
  searxng: 'search',
  ticktick: 'task',
  things3: 'task',
  applemail: 'mail',
  fastmail: 'mail',
  markitdown: 'document',
  pandoc: 'document',
  pdfminer: 'document',
};

const CATEGORY_PATTERNS: Array<[RegExp, string]> = [
  [/^(weather|forecast|meteo|climate|temp|temperature|rain|humidity|wind|airquality)$/i, 'weather'],
  [/^(calendar|schedule|event|events|meeting|meetings|booking|caldav|ical|agenda)$/i, 'calendar'],
  [/^(time|clock|timezone|worldclock|cron|timer|countdown|alarm|stopwatch|date)$/i, 'clock'],
  [/^(chart|charts|analytics|metric|metrics|telemetry|finance|financial|stock|stocks|crypto|bitcoin|market|trading|revenue|bi|plot|graph|grafana-like)$/i, 'chart'],
  [/^(doc|docs|document|documents|pdf|word|docx|markdown|md|note|notes|text|resume|contract|legal|ocr-doc|report)$/i, 'document'],
  [/^(excel|xlsx|xls|csv|tsv|sheet|sheets|spreadsheet|spreadsheets|table|tables|dataframe|pandas)$/i, 'spreadsheet'],
  [/^(slide|slides|ppt|pptx|powerpoint|presentation|deck|keynote)$/i, 'presentation'],
  [/^(image|images|photo|photos|picture|pictures|ocr|screenshot|screenshots|canvas|draw|paint|pixel|svg|icon|icons|vision|flux|stable-diffusion)$/i, 'image'],
  [/^(video|videos|media|ffmpeg|stream|movie|movies|clip|clips|camera|webcam|obs|recorder)$/i, 'video'],
  [/^(audio|music|sound|tts|stt|speech|voice|podcast|podcasts|mic|microphone|radio|transcribe)$/i, 'audio'],
  [/^(translate|translation|i18n|l10n|language|languages|locale|dictionary|thesaurus)$/i, 'translate'],
  [/^(map|maps|geo|geolocation|location|gps|address|place|places|route|travel|flight|flights|hotel|uber|transit)$/i, 'map'],
  [/^(security|sec|audit|vuln|vulnerability|scan|scanner|firewall|compliance|antivirus|malware|cve|pentest)$/i, 'shield'],
  [/^(secret|secrets|keys|oauth|jwt|auth|authentication|ssh|gpg|credential|credentials|password|passwords|passkey|kms)$/i, 'key'],
  [/^(cloud|storage|bucket|cdn|hosting|serverless|objectstore|vps|infra|infrastructure)$/i, 'cloud'],
  [/^(network|net|proxy|tunnel|dns|ip|whois|webhook|webhooks|websocket|grpc|rest|vpn|socket|port)$/i, 'network'],
  [/^(code|coding|ast|lint|linter|format|formatter|compiler|sdk|regex|diff|refactor|lsp|snippet|snippets|sandbox|eval)$/i, 'code'],
  [/^(bug|bugs|debug|debugger|test|tests|testing|qa|crash|trace|monitor|monitoring|profiler|alert|alerts)$/i, 'bug'],
  [/^(task|tasks|todo|todos|checklist|kanban|sprint|issue|issues|ticket|tickets|reminder|reminders|habit|habits)$/i, 'task'],
  [/^(shop|store|ecommerce|cart|checkout|order|orders|invoice|invoices|billing|payment|payments|commerce|catalog)$/i, 'cart'],
  [/^(mail|email|emails|smtp|imap|inbox|newsletter|outlook|proton|sendgrid|postmark)$/i, 'mail'],
  [/^(chat|chats|message|messages|messaging|dm|bot|chatbot|support|helpdesk|crm|sms|social|forum)$/i, 'chat'],
  [/^(brain|rag|vector|vectors|embedding|embeddings|llm|agent|agents|cognitive|neural|memory|mem|remember|recall)$/i, 'brain'],
  [/^(science|bio|biology|chem|chemistry|math|mathematics|physics|calc|calculator|research|arxiv|pubmed|biorxiv|lab|molecule|protein|dna)$/i, 'science'],
  [/^(search|find|grep|ripgrep|index|crawl|scrape|scraper|websearch|deepsearch|lookup)$/i, 'search'],
  [/^(book|books|library|wiki|manual|glossary|handbook|knowledge|read|reader|reading|article|articles|news)$/i, 'book'],
  [/^(rocket|deploy|deployment|release|cicd|ci|cd|workflow|workflows|pipeline|pipelines|automation|automate|launch)$/i, 'rocket'],
  [/^(settings|setting|config|cfg|preferences|system|os|daemon|service|util|utils|utility|utilities|desktop|clipboard)$/i, 'settings'],
  [/^(home|iot|smarthome|smart-home|sensor|sensors|device|devices|mqtt|zigbee|hue|thermostat|light|lights)$/i, 'home'],
  [/^(archive|zip|tar|gzip|backup|backups|export|sync|snapshot|snapshots|compress|extract)$/i, 'archive'],
  [/^(json|yaml|yml|toml|xml|schema|jq|yq)$/i, 'json'],
  [/^(sql|database|db|warehouse|orm|query|sqlite-like)$/i, 'database'],
  [/^(filesystem|file|files|folder|folders|dir|directory|disk|fs|fd|tree)$/i, 'filesystem'],
  [/^(fetch|web|url|curl|browser-fetch|rss)$/i, 'fetch'],
  [/^(terminal|shell|bash|zsh|powershell|iterm|cli|console|tty|pty)$/i, 'terminal'],
  [/^(sequential|thinking|reason|reasoning|planner|planning|chain)$/i, 'sequential'],
];

// Build fast lookup tables once at module load
const ALIAS_TO_SLUG = new Map<string, string>();
const ALL_KEYS: Array<{ key: string; slug: string; isCanonical: boolean }> = [];

for (const [slug, entry] of Object.entries(ICON_CATALOG)) {
  const lowerSlug = slug.toLowerCase();
  ALIAS_TO_SLUG.set(lowerSlug, slug);
  ALL_KEYS.push({ key: lowerSlug, slug, isCanonical: true });

  for (const alias of entry.aliases) {
    const lowerAlias = alias.toLowerCase();
    if (!ALIAS_TO_SLUG.has(lowerAlias)) {
      ALIAS_TO_SLUG.set(lowerAlias, slug);
      ALL_KEYS.push({ key: lowerAlias, slug, isCanonical: false });
    }
  }
}

for (const [alias, slug] of Object.entries(EXTRA_ALIASES)) {
  const lowerAlias = alias.toLowerCase();
  if (ICON_CATALOG[slug] && !ALIAS_TO_SLUG.has(lowerAlias)) {
    ALIAS_TO_SLUG.set(lowerAlias, slug);
    ALL_KEYS.push({ key: lowerAlias, slug, isCanonical: false });
  }
}

ALL_KEYS.sort((a, b) => {
  if (a.isCanonical !== b.isCanonical) return a.isCanonical ? -1 : 1;
  if (a.key.length !== b.key.length) return a.key.length - b.key.length;
  return a.key.localeCompare(b.key);
});

const COMPOUND_KEYS = [...ALL_KEYS]
  .filter((k) => k.key.length >= 4)
  .sort((a, b) => b.key.length - a.key.length);

function splitCamelAndSeparators(raw: string): string[] {
  if (!raw) return [];
  const spaced = raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function extractHyphenCompounds(raw: string): string[] {
  if (!raw) return [];
  const matches = raw.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)+/g);
  return matches ? matches : [];
}

function stemCandidates(token: string): string[] {
  const out = [token];
  if (token.length > 4 && token.endsWith('ies')) {
    out.push(`${token.slice(0, -3)}y`);
  } else if (token.length > 4 && token.endsWith('es')) {
    out.push(token.slice(0, -2));
  } else if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) {
    out.push(token.slice(0, -1));
  }
  if (token.length > 5 && token.endsWith('ing')) {
    out.push(token.slice(0, -3));
    out.push(`${token.slice(0, -3)}e`);
  }
  return out;
}

interface WeightedToken {
  token: string;
  weight: number;
  allowStreaming: boolean;
}

function extractTokens(input: ServerIconInput): WeightedToken[] {
  const tokens: WeightedToken[] = [];
  const seen = new Set<string>();

  const push = (token: string, weight: number, allowStreaming: boolean) => {
    const clean = token.toLowerCase().trim();
    if (!clean || NOISE_TOKENS.has(clean)) return;
    const key = `${clean}:${allowStreaming ? 1 : 0}`;
    if (seen.has(key)) return;
    seen.add(key);
    tokens.push({ token: clean, weight, allowStreaming });
  };

  // 1. Name (highest priority, supports real-time streaming prefix)
  const name = (input.name || '').trim();
  if (name) {
    for (const c of extractHyphenCompounds(name)) {
      push(c, 120, true);
    }
    for (const t of splitCamelAndSeparators(name)) {
      push(t, 100, true);
    }
  }

  // 2. URL host & path
  const rawUrl = (input.url || '').trim();
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl.includes('://') ? rawUrl : `https://${rawUrl}`);
      for (const c of extractHyphenCompounds(parsed.hostname)) {
        push(c, 95, true);
      }
      for (const t of splitCamelAndSeparators(parsed.hostname)) {
        push(t, 90, true);
      }
      for (const c of extractHyphenCompounds(parsed.pathname)) {
        push(c, 80, false);
      }
      for (const t of splitCamelAndSeparators(parsed.pathname)) {
        push(t, 75, false);
      }
    } catch {
      for (const t of splitCamelAndSeparators(rawUrl)) {
        push(t, 85, true);
      }
    }
  }

  // 3. Args (npm packages, python modules, docker images, paths)
  const argsList = Array.isArray(input.args)
    ? input.args
    : typeof input.args === 'string'
      ? input.args.split(/\s+/)
      : [];
  const argsJoined = argsList.join(' ').trim();
  if (argsJoined) {
    for (const c of extractHyphenCompounds(argsJoined)) {
      push(c, 70, false);
    }
    for (const t of splitCamelAndSeparators(argsJoined)) {
      push(t, 65, false);
    }
  }

  // 4. Command (if not a generic runtime launcher like npx/uvx/node/python/docker)
  const cmd = (input.command || '').trim();
  if (cmd) {
    const baseCmd = cmd.split(/[\\/]/).pop()?.toLowerCase().replace(/\.(exe|cmd|bat|sh)$/i, '') || '';
    if (baseCmd && !GENERIC_RUNTIMES.has(baseCmd)) {
      for (const c of extractHyphenCompounds(baseCmd)) {
        push(c, 55, false);
      }
      for (const t of splitCamelAndSeparators(baseCmd)) {
        if (!GENERIC_RUNTIMES.has(t)) {
          push(t, 50, false);
        }
      }
    }
  }

  // 5. Env var keys (e.g. GITHUB_TOKEN, BRAVE_API_KEY, STRIPE_SECRET)
  if (input.env) {
    const envText = typeof input.env === 'string'
      ? input.env
      : Object.keys(input.env).join(' ');
    for (const t of splitCamelAndSeparators(envText)) {
      push(t, 40, false);
    }
  }

  return tokens.sort((a, b) => b.weight - a.weight);
}

function buildResult(
  slug: string,
  entry: IconCatalogEntry,
  confidence: IconMatchConfidence
): ResolvedServerIcon {
  return {
    id: slug,
    file: entry.file,
    src: `/icons/servers/${entry.file}`,
    monoDark: Boolean(entry.monoDark),
    scale: entry.scale,
    extraClass: entry.extraClass,
    confidence,
  };
}

export function resolveServerIcon(input: ServerIconInput): ResolvedServerIcon {
  const tokens = extractTokens(input);

  if (tokens.length > 0) {
    // Tier 1 & 2: Exact canonical slug, stemmed slug, or alias match
    for (const { token } of tokens) {
      for (const candidate of stemCandidates(token)) {
        if (ICON_CATALOG[candidate]) {
          return buildResult(candidate, ICON_CATALOG[candidate], 'exact');
        }
        const mapped = ALIAS_TO_SLUG.get(candidate);
        if (mapped && ICON_CATALOG[mapped]) {
          return buildResult(mapped, ICON_CATALOG[mapped], 'alias');
        }
      }
    }

    // Tier 3: Embedded / concatenated brand or domain match (e.g. "myweather", "githubmcp", "stripebilling")
    for (const { token } of tokens) {
      if (token.length < 5) continue;
      for (const { key, slug } of COMPOUND_KEYS) {
        if (token.includes(key) && ICON_CATALOG[slug]) {
          return buildResult(slug, ICON_CATALOG[slug], 'compound');
        }
      }
    }

    // Tier 4: Real-time streaming prefix match while typing (e.g. "wea" -> "weather", "gith" -> "github")
    for (const { token, allowStreaming } of tokens) {
      if (!allowStreaming || token.length < 2) continue;
      if (token.length === 2) {
        const canonicalExact = ALL_KEYS.find((k) => k.isCanonical && k.key.startsWith(token));
        if (canonicalExact && ICON_CATALOG[canonicalExact.slug]) {
          return buildResult(canonicalExact.slug, ICON_CATALOG[canonicalExact.slug], 'streaming');
        }
        continue;
      }
      for (const { key, slug } of ALL_KEYS) {
        if (key.startsWith(token) && ICON_CATALOG[slug]) {
          return buildResult(slug, ICON_CATALOG[slug], 'streaming');
        }
      }
    }

    // Tier 5: Morphological + semantic category classifier (covers 35+ colored SVG domains)
    for (const { token } of tokens) {
      for (const candidate of stemCandidates(token)) {
        for (const [pattern, slug] of CATEGORY_PATTERNS) {
          if (pattern.test(candidate) && ICON_CATALOG[slug]) {
            return buildResult(slug, ICON_CATALOG[slug], 'category');
          }
        }
      }
    }
  }

  // Tier 6: Universal colored SVG fallback (never PNG)
  return {
    id: 'fallback',
    file: 'server.svg',
    src: '/icons/servers/server.svg',
    monoDark: false,
    confidence: 'fallback',
  };
}
