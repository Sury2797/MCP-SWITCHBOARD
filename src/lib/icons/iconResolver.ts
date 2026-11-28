import { ICON_CATALOG, type IconCatalogEntry } from './iconCatalog';

export interface ServerIconInput {
  name?: string;
  command?: string | null;
  args?: string[] | string | null;
  url?: string | null;
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
  'server',
  'servers',
  'client',
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
  repomix: 'huggingface',
  chembl: 'huggingface',
  pdb: 'huggingface',
  litert: 'huggingface',
  alphagenome: 'gemini',
  genomics: 'gemini',
  '2d-assets': 'icons8',
  textart: 'icons8',
  beads: 'slack',
  teams: 'slack',
  opensearch: 'elasticsearch',
  kibana: 'elasticsearch',
  hcl: 'terraform',
  opentofu: 'terraform',
};

const CATEGORY_PATTERNS: Array<[RegExp, string]> = [
  [/^(sql|database|db|warehouse|orm|query|analytics)$/i, 'database'],
  [/^(filesystem|file|files|folder|dir|disk|storage|fs)$/i, 'filesystem'],
  [/^(fetch|web|crawl|scrape|scraper|search|rss|url|curl)$/i, 'fetch'],
  [/^(terminal|shell|bash|zsh|powershell|iterm|cli|console)$/i, 'terminal'],
  [/^(sequential|thinking|memory|knowledge|brain|reason|context|workflow|agent|rag|vector|embed|embeddings)$/i, 'sequential'],
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

// Sort keys for deterministic compound and streaming prefix resolution:
// canonical first, then shorter keys, then alphabetical
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

  // 4. Command (only if not a generic runtime launcher like npx/uvx/node/python/docker)
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
    // Tier 1 & 2: Exact canonical slug or alias match
    for (const { token } of tokens) {
      if (ICON_CATALOG[token]) {
        return buildResult(token, ICON_CATALOG[token], 'exact');
      }
      const mapped = ALIAS_TO_SLUG.get(token);
      if (mapped && ICON_CATALOG[mapped]) {
        return buildResult(mapped, ICON_CATALOG[mapped], 'alias');
      }
    }

    // Tier 3: Embedded / concatenated brand match (e.g. "myatlassian", "githubmcp", "stripebilling")
    for (const { token } of tokens) {
      if (token.length < 5) continue;
      for (const { key, slug } of COMPOUND_KEYS) {
        if (token.includes(key) && ICON_CATALOG[slug]) {
          return buildResult(slug, ICON_CATALOG[slug], 'compound');
        }
      }
    }

    // Tier 4: Real-time streaming prefix match while typing (e.g. "atl" -> "atlassian", "gith" -> "github")
    for (const { token, allowStreaming } of tokens) {
      if (!allowStreaming || token.length < 3) continue;
      for (const { key, slug } of ALL_KEYS) {
        if (key.startsWith(token) && ICON_CATALOG[slug]) {
          return buildResult(slug, ICON_CATALOG[slug], 'streaming');
        }
      }
    }

    // Tier 5: Semantic category fallback
    for (const { token } of tokens) {
      for (const [pattern, slug] of CATEGORY_PATTERNS) {
        if (pattern.test(token) && ICON_CATALOG[slug]) {
          return buildResult(slug, ICON_CATALOG[slug], 'category');
        }
      }
    }
  }

  // Tier 6: Universal default fallback (unchanged)
  return {
    id: 'fallback',
    file: 'server.png',
    src: '/icons/servers/server.png',
    monoDark: true,
    confidence: 'fallback',
  };
}
