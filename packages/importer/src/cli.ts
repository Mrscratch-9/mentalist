import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { EnvError, formatError, loadDir, UsageError, validate } from "@mentalist/pipeline";
import { FandomCache } from "./fandom/cache.ts";
import { parseCharacterPage, type CharacterRecord } from "./fandom/characters.ts";
import { FandomClient, type FandomPage } from "./fandom/client.ts";
import { parseEpisodePage, type EpisodeRecord } from "./fandom/episodes.ts";
import { assemble, collectLinkTargets, type Report } from "./generate/assemble.ts";
import { DEFAULT_WIKI_BASE } from "./generate/common.ts";
import { FILE_NAMES, renderYaml, writeGenerated } from "./generate/write.ts";
import { loadSettings } from "./settings.ts";
import { MAX_SEASON, MIN_SEASON, TmdbClient, type TmdbEpisode } from "./tmdb/client.ts";

const USAGE = "Usage: pnpm data:import [--skip-tmdb] [--offline] [--cache-dir <dir>]";
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CHARACTER_CATEGORIES = ["Characters", "Main characters", "Recurring characters", "Minor Characters", "Side Characters"];

export interface CliArgs {
  skipTmdb: boolean;
  offline: boolean;
  /** Root of the caches (`fandom/` and `tmdb/` inside); default `data/.cache`. */
  cacheDir: string | undefined;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      "skip-tmdb": { type: "boolean" },
      offline: { type: "boolean" },
      "cache-dir": { type: "string" },
    },
  });
  return { skipTmdb: !!values["skip-tmdb"], offline: !!values.offline, cacheDir: values["cache-dir"] };
}

function wikiBaseOf(api: string): string {
  return api.endsWith("/api.php") ? `${api.slice(0, -"api.php".length)}wiki/` : DEFAULT_WIKI_BASE;
}

function printReport(r: Report, tmdbUsed: boolean): void {
  const line = (k: string, v: unknown): void => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  line("episodes", r.episodes);
  line("episodes without synopsis", `${r.missingSynopsis}${tmdbUsed ? "" : " (TMDB skipped)"}`);
  line("duplicate episode codes dropped", r.duplicateEpisodes);
  line("persons", r.persons);
  line("recurring", r.recurring);
  line("characters skipped (no first)", r.skippedNoFirst);
  line("characters skipped (first unresolved)", r.skippedUnresolved);
  line("person key collisions", r.keyCollisions);
  line("guest appears_in claims", r.guestClaims);
  line("guest credits without page", r.guestUnlinked);
  line("guest credits unknown person", r.guestUnknownPerson);
  line("guest credits before introduction", r.guestBeforeIntroduction);
  line("fans items", r.fans);
  line("fans spoils_up_to per season", r.fansBySeason);
  line("fans items with unresolved links", r.fanUnresolvedLinkItems);
  line("fans items without own episode", r.fanNoOwnEpisodeItems);
}

async function run(args: CliArgs): Promise<number> {
  const settings = loadSettings(undefined, { tmdb: !args.skipTmdb });
  if (!args.skipTmdb && !args.offline && !settings.tmdbApiKey) {
    throw new EnvError("TMDB_API_KEY is not set in data-sources.txt (use --skip-tmdb to import without TMDB)");
  }
  const cacheRoot = args.cacheDir ?? join(ROOT, "data", ".cache");
  const client = new FandomClient({
    baseUrl: settings.fandomApi,
    cache: new FandomCache({ dir: join(cacheRoot, "fandom"), offline: args.offline }),
  });

  const episodes: EpisodeRecord[] = [];
  const pages: Array<{ page: FandomPage; kind: "episode" | "character" }> = [];
  for (let s = MIN_SEASON; s <= MAX_SEASON; s++) {
    for (const page of await client.getCategoryPages(`Season ${s} episodes`, { namespace: 0 })) {
      const recs = parseEpisodePage(page);
      if (recs.length === 0) continue;
      episodes.push(...recs);
      pages.push({ page, kind: "episode" });
    }
  }

  const characters: CharacterRecord[] = [];
  const seen = new Set<string>();
  for (const cat of CHARACTER_CATEGORIES) {
    for (const page of await client.getCategoryPages(cat, { namespace: 0 })) {
      if (seen.has(page.title)) continue;
      seen.add(page.title);
      const rec = parseCharacterPage(page);
      if (!rec) continue;
      characters.push(rec);
      pages.push({ page, kind: "character" });
    }
  }

  const wikiBase = wikiBaseOf(settings.fandomApi);
  const base = { episodes, characters, pages, wikiBase, tmdbShowId: settings.tmdbShowId };
  const targets = collectLinkTargets(base);
  const redirects = new Map<string, string>();
  for (const [from, to] of await client.resolveRedirects(targets)) if (from !== to) redirects.set(from, to);

  let tmdb: TmdbEpisode[] | undefined;
  if (!args.skipTmdb) {
    const t = new TmdbClient({ apiKey: settings.tmdbApiKey, showId: settings.tmdbShowId, cacheDir: join(cacheRoot, "tmdb"), offline: args.offline });
    tmdb = await t.getAllSeasons(settings.tmdbLanguage);
  }

  const { docs, report } = assemble({ ...base, redirects, tmdb });
  const files: Record<string, string> = {};
  for (const name of FILE_NAMES) files[name] = renderYaml(docs[name]!);

  const tmp = mkdtempSync(join(tmpdir(), "mentalist-import-"));
  try {
    writeGenerated(tmp, files);
    const { docs: loaded, errors: loadErrors } = loadDir(tmp);
    const errors = loadErrors.length ? loadErrors : validate(loaded);
    if (errors.length) {
      for (const e of errors.slice(0, 50)) console.error(formatError(e));
      console.error(`${errors.length} error(s); nothing written`);
      return 1;
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  writeGenerated(join(ROOT, "data", "canon", "generated"), files);
  printReport(report, tmdb !== undefined);
  console.log(`wrote ${FILE_NAMES.length} files to data/canon/generated`);
  return 0;
}

/** Messages may carry page titles (canon text): print only a short generic form for non-usage errors. */
function safeMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (/^offline mode/.test(m)) return "offline mode: cache miss";
  if (m === "offline: TMDB cache missing") return m;
  if (/^(gave up after|HTTP|api error|TMDB|Settings file)/.test(m)) return m.slice(0, 160);
  return "unexpected error";
}

export async function main(argv: string[]): Promise<number> {
  try {
    return await run(parseCliArgs(argv));
  } catch (e) {
    const argError = (e as { code?: string }).code?.startsWith("ERR_PARSE_ARGS");
    if (argError) {
      console.error(`${(e as Error).message}\n${USAGE}`);
      return 2;
    }
    if (e instanceof UsageError) {
      console.error(e.showUsage ? `${e.message}\n${USAGE}` : e.message);
      return 2;
    }
    console.error(`import failed: ${safeMessage(e)}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
