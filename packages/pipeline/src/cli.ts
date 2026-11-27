import { parseArgs } from "node:util";
import { buildDatabase, formatError, formatWarning, UsageError } from "./index.ts";

const USAGE = "Usage: node src/cli.ts <in-dir> <out.sqlite> [--force] [--verbose]";

function main(argv: string[]): number {
  try {
    const { values, positionals } = parseArgs({
      args: argv, allowPositionals: true,
      options: { force: { type: "boolean" }, verbose: { type: "boolean" } },
    });
    const [inDir, out] = positionals;
    if (!inDir || !out || positionals.length !== 2) throw new UsageError("expected <in-dir> and <out.sqlite>");
    const { errors, warnings, dataset: d } = buildDatabase(inDir, out, { force: !!values.force });
    if (!d) {
      for (const e of errors) console.error(formatError(e, !!values.verbose));
      console.error(`${errors.length} error(s); nothing written`);
      return 1;
    }
    for (const w of warnings) console.error(formatWarning(w));
    const stale = warnings.length ? `, ${warnings.length} stale (not compiled)` : "";
    console.log(`wrote ${out}: ${d.episodes.length} episodes, ${d.entities.length} entities, ${d.claims.length} claims, ${d.arcItems.length} arc items, ${d.theories.length} theories, ${d.translations?.length ?? 0} translations${stale}`);
    return 0;
  } catch (e) {
    const usage = e instanceof UsageError || (e as { code?: string }).code?.startsWith("ERR_PARSE_ARGS");
    if (!usage) {
      // I/O or environment failure: one line, no stack, no record text (exit 2; exit 1 is for validation only)
      const code = (e as { code?: unknown }).code;
      console.error(`build failed: ${typeof code === "string" ? code : "unexpected error"}`);
      return 2;
    }
    const msg = (e as Error).message;
    console.error(e instanceof UsageError && !e.showUsage ? msg : `${msg}\n${USAGE}`);
    return 2;
  }
}

process.exitCode = main(process.argv.slice(2));
