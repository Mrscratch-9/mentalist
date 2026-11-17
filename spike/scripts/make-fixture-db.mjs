// Builds public/fixture.db: synthetic, spoiler-free data shaped like the claim model.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, rmSync } from "node:fs";

const out = new URL("../public/fixture.db", import.meta.url);
mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
rmSync(out, { force: true });

const words = [
  "warehouse", "orchard", "motel", "office", "river", "ledger", "letter", "camera",
  "witness", "alibi", "receipt", "phone", "garage", "vineyard", "harbor", "station",
  "painting", "teacup", "notebook", "keycard", "invoice", "bracelet", "ticket", "tape",
];
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = () => words[Math.floor(rand() * words.length)];

const db = new DatabaseSync(out.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
db.exec(`
  CREATE TABLE entity(id TEXT PRIMARY KEY, kind TEXT NOT NULL, introduced_in INTEGER NOT NULL);
  CREATE TABLE claim(id TEXT PRIMARY KEY, subject TEXT NOT NULL, predicate TEXT NOT NULL,
                     value TEXT NOT NULL, revealed_in INTEGER NOT NULL);
  CREATE VIRTUAL TABLE claim_fts USING fts5(value, content='claim', content_rowid='rowid');
`);

const ENTITIES = 2000;
const CLAIMS = 20000;
const insE = db.prepare("INSERT INTO entity VALUES (?, ?, ?)");
const insC = db.prepare("INSERT INTO claim VALUES (?, ?, ?, ?, ?)");
db.exec("BEGIN");
for (let i = 0; i < ENTITIES; i++) {
  insE.run(`e${(i * 7919).toString(36)}`, ["person", "location", "case"][i % 3], 1 + (i % 150));
}
for (let i = 0; i < CLAIMS; i++) {
  const text = `Fixture note ${i}: ${pick()} near the ${pick()}, ${pick()} and ${pick()}.`;
  insC.run(`c${(i * 104729).toString(36)}`, `e${((i % ENTITIES) * 7919).toString(36)}`, "note", text, 1 + (i % 150));
}
db.exec("INSERT INTO claim_fts(claim_fts) VALUES('rebuild'); COMMIT; VACUUM;");
db.close();
console.log(`fixture.db: ${ENTITIES} entities, ${CLAIMS} claims`);
