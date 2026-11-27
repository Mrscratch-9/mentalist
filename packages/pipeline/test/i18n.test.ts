import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { KnowledgeEngine, inLanguage, progress } from "@mentalist/core";
import { buildDatabase, compile, loadDir, textHash, validate } from "../src/index.ts";
import { nodeDriver } from "../src/driver.ts";
import { base, loaded, tempDir, writeCanon } from "./fixture.ts";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });

type Entry = { key: string; field: string; hash: string; text: string };
const H = textHash;
/** Entries for synthetic CANARY text: translations of the base() fixture. */
const good = (): Entry[] => [
  { key: "c_name", field: "value", hash: H("Alice Vale"), text: "CANARY_ES alicia valle" },
  { key: "S1E2", field: "title", hash: H("Two"), text: "CANARY_ES dos" },
  { key: "S1E2", field: "synopsis", hash: H("s2"), text: "CANARY_ES sinopsis dos" },
  { key: "t1", field: "title", hash: H("T"), text: "CANARY_ES teoria" },
  { key: "t1", field: "body", hash: H("B"), text: "CANARY_ES cuerpo" },
];

type Raw = ReturnType<typeof base>;
function setup(entries: Entry[] | null, lang = "es", mutRaw?: (r: Raw) => void) {
  const root = tempDir();
  const inDir = join(root, "in");
  mkdirSync(inDir);
  const raw = base();
  mutRaw?.(raw);
  writeCanon(inDir, raw);
  if (entries) {
    mkdirSync(join(inDir, "i18n", lang), { recursive: true });
    writeFileSync(join(inDir, "i18n", lang, "x.yaml"), stringify({ translations: entries }));
  }
  return { root, inDir, out: join(root, "out.sqlite") };
}
const check = (inDir: string) => {
  const { docs, i18n, errors: le } = loadDir(inDir);
  return { le, errors: validate(docs, i18n), docs, i18n };
};

describe("i18n hash", () => {
  it("is the first 12 hex chars of sha256 of the exact English text", () => {
    expect(textHash("abc")).toBe("ba7816bf8f01");
    expect(textHash("abc ")).not.toBe(textHash("abc"));
  });
});

describe("i18n loading", () => {
  it("reads i18n/<lang>/*.yaml as translations, not as canon", () => {
    const { inDir } = setup(good());
    const { docs, i18n, errors } = loadDir(inDir);
    expect(errors).toEqual([]);
    expect(docs.map((d) => d.file)).toEqual(["canon.yaml"]);
    expect(i18n.map((d) => [d.file, d.lang, d.doc.translations.length])).toEqual([["i18n/es/x.yaml", "es", 5]]);
  });

  it("an empty i18n dir is fine", () => {
    const { inDir } = setup(null);
    mkdirSync(join(inDir, "i18n", "es"), { recursive: true });
    const r = check(inDir);
    expect([r.le, r.errors, r.i18n]).toEqual([[], [], []]);
  });

  it("schema: strict fields, 12-hex hash, known field, non-empty text", () => {
    for (const bad of [
      { key: "c_name", field: "value", hash: "XYZ", text: "t" },
      { key: "c_name", field: "nope", hash: H("x"), text: "t" },
      { key: "c_name", field: "value", hash: H("x"), text: "" },
      { key: "c_name", field: "value", hash: H("x"), text: "t", extra: 1 },
    ]) {
      const { inDir } = setup([bad as Entry]);
      const { errors } = loadDir(inDir);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.file).toBe("i18n/es/x.yaml");
      expect(errors[0]!.path).toContain("translations[0]");
      expect(errors[0]!.rule).toBe("schema");
    }
  });

  it("a bad language directory is an error", () => {
    const a = setup(good(), "Spanish");
    expect(loadDir(a.inDir).errors.map((e) => [e.file, e.rule])).toEqual([["i18n/Spanish/x.yaml", "i18n.lang_invalid"]]);
    const b = setup(good(), "en");
    expect(loadDir(b.inDir).errors.map((e) => e.rule)).toEqual(["i18n.lang_invalid"]);
  });
});

describe("i18n validation", () => {
  it("accepts good entries", () => {
    expect(check(setup(good()).inDir).errors).toEqual([]);
  });

  it("key must exist", () => {
    const e = [{ key: "nope", field: "value", hash: H("x"), text: "t" }];
    expect(check(setup(e).inDir).errors).toEqual([
      { file: "i18n/es/x.yaml", path: "translations[0].key", rule: "i18n.key_unresolved", detail: "nope" },
    ]);
  });

  it("field must exist on the target (wrong kind, non-text predicate, empty text)", () => {
    const entries: Entry[] = [
      { key: "c_name", field: "title", hash: H("x"), text: "t" }, // claim has no title
      { key: "t1", field: "value", hash: H("x"), text: "t" }, // theory has no value
      { key: "c_knows", field: "value", hash: H("x"), text: "t" }, // object claim: no value
      { key: "c_role", field: "value", hash: H("suspect"), text: "t" }, // role_in_case value is read by code
      { key: "c_name", field: "note", hash: H(""), text: "t" }, // empty note
      { key: "S1E1", field: "body", hash: H("x"), text: "t" },
    ];
    const rules = check(setup(entries).inDir).errors.map((e) => [e.path, e.rule]);
    expect(rules).toEqual(entries.map((_, i) => [`translations[${i}].field`, "i18n.field_invalid"]));
  });

  it("rejects a duplicate (lang, key, field), also across files; the same pair in another language is fine", () => {
    const dup = [good()[0]!, { ...good()[0]!, text: "other" }];
    const r = check(setup(dup).inDir);
    expect(r.errors.map((e) => [e.file, e.path, e.rule])).toEqual([["i18n/es/x.yaml", "translations[1]", "i18n.duplicate"]]);
    const s = setup([good()[0]!]);
    mkdirSync(join(s.inDir, "i18n", "fr"));
    writeFileSync(join(s.inDir, "i18n", "fr", "y.yaml"), stringify({ translations: [good()[0]] }));
    mkdirSync(join(s.inDir, "i18n", "es", "more"));
    writeFileSync(join(s.inDir, "i18n", "es", "more", "z.yaml"), stringify({ translations: [good()[0]] }));
    expect(check(s.inDir).errors.map((e) => [e.file, e.rule])).toEqual([["i18n/es/x.yaml", "i18n.duplicate"]]);
  });

  it("an episode code and a theory identifier that coincide for `title` is ambiguous", () => {
    const e = [{ key: "S1E1", field: "title", hash: H("One"), text: "t" }];
    const r = check(setup(e, "es", (raw) => { Object.assign(raw.theories[0]!, { key: "S1E1" }); }).inDir);
    expect(r.errors.map((x) => x.rule)).toEqual(["i18n.key_ambiguous"]);
  });

  it("error text never carries the translation or English text (spoiler-safe by default)", () => {
    const e = [{ key: "zqxmark_id", field: "value", hash: H("x"), text: "zqxmark_text" }];
    const r = run(setup(e).inDir, join(tempDir(), "o.sqlite"));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("i18n/es/x.yaml: translations[0].key: i18n.key_unresolved");
    expect(r.stderr).not.toContain("zqxmark");
  });
});

describe("i18n compile, stale detection, build", () => {
  const build = (entries: Entry[], mut?: (r: Raw) => void) => {
    const s = setup(entries, "es", mut);
    const res = buildDatabase(s.inDir, s.out, { force: false });
    return { ...s, res };
  };

  it("compiles to translation rows with the same opaque ids (episodes: ep_index)", () => {
    const { res } = build(good());
    expect(res.errors).toEqual([]);
    expect(res.warnings).toEqual([]);
    const d = res.dataset!;
    const claimId = d.claims.find((c) => c.value === "Alice Vale")!.id;
    expect(d.translations).toEqual([
      { targetId: claimId, field: "value", lang: "es", text: "CANARY_ES alicia valle" },
      { targetId: "2", field: "title", lang: "es", text: "CANARY_ES dos" },
      { targetId: "2", field: "synopsis", lang: "es", text: "CANARY_ES sinopsis dos" },
      { targetId: d.theories[0]!.id, field: "title", lang: "es", text: "CANARY_ES teoria" },
      { targetId: d.theories[0]!.id, field: "body", lang: "es", text: "CANARY_ES cuerpo" },
    ]);
    for (const t of d.translations!) expect(t.targetId).toMatch(/^([ct]_[0-9a-f]{12}|\d+)$/);
  });

  it("the built database serves the translation through the engine, gated, with English fallback", () => {
    const { out } = build(good());
    const db = new DatabaseSync(out, { readOnly: true });
    const en = new KnowledgeEngine(nodeDriver(db));
    const es = inLanguage(en, "es");
    expect(es.listEpisodes(progress(1)).map((e) => [e.title, e.titleLang])).toEqual([["One", "en"], ["CANARY_ES dos", "es"], ["Three", "en"]]);
    expect(es.search(progress(1), "alicia").total).toBe(1);
    expect(es.search(progress(0), "alicia").total).toBe(0);
    expect(en.search(progress(1), "alicia").total).toBe(0);
    db.close();
  });

  it("a stale hash is not compiled, is counted and reported with keys only; the build still succeeds", () => {
    const stale = good();
    stale[0] = { ...stale[0]!, hash: H("older english") };
    const { res } = build(stale);
    expect(res.errors).toEqual([]);
    expect(res.dataset!.translations!.some((t) => t.text === "CANARY_ES alicia valle")).toBe(false);
    expect(res.dataset!.translations).toHaveLength(4);
    expect(res.warnings).toEqual([
      { file: "i18n/es/x.yaml", path: "translations[0]", rule: "i18n.stale", detail: "es c_name value" },
    ]);
  });

  it("changing the English text makes its translation stale; the other fields stay compiled", () => {
    const { res } = build(good(), (raw) => { raw.theories[0]!.body = "B changed"; });
    expect(res.warnings.map((w) => w.detail)).toEqual(["es t1 body"]);
    expect(res.dataset!.translations!.some((t) => t.text === "CANARY_ES cuerpo")).toBe(false);
    expect(res.dataset!.translations).toHaveLength(4);
  });

  it("no i18n at all: no translations, no warnings, same dataset as before", () => {
    const { res } = build([]);
    expect(res.warnings).toEqual([]);
    expect(res.dataset!.translations ?? []).toEqual([]);
    expect({ ...compile(loaded(base())), translations: undefined }).toEqual({ ...res.dataset!, translations: undefined });
  });

  it("CLI: stale entries are a warning on stderr (keys only), exit 0, counts on stdout", () => {
    const stale = good();
    stale[1] = { ...stale[1]!, hash: H("older") };
    const s = setup(stale);
    const r = run(s.inDir, s.out);
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split("\n")).toHaveLength(1);
    expect(r.stdout).toContain("4 translations");
    expect(r.stdout).toContain("1 stale");
    expect(r.stderr).toContain("warning: i18n/es/x.yaml: translations[1]: i18n.stale");
    expect(r.stderr).toContain("es S1E2 title");
    expect(r.stderr).not.toContain("CANARY");
    expect(r.stderr).not.toContain("older");
    expect(readdirSync(s.root).sort()).toEqual(["in", "out.sqlite"]);
  });

  it("CLI: an empty i18n dir exits 0 with 0 translations and no warnings", () => {
    const s = setup(null);
    mkdirSync(join(s.inDir, "i18n", "es"), { recursive: true });
    const r = run(s.inDir, s.out, "--verbose");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("0 translations");
    expect(r.stderr).toBe("");
  });
});
