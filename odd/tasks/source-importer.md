# Phase 5: canon importer from Fandom (MediaWiki API) and TMDB

Feature: replace the hand-authored canon with data imported at build time from The Mentalist Wiki (Fandom MediaWiki API) and The Movie Database (TMDB), plus a non-canon fans section (theories and trivia) from Fandom, all gated by the spoiler engine. The app stays offline; the importer writes the canon YAML that the existing pipeline validates and compiles.

## Specs

- S1: "vamos hacer un cambio en el motor en si desde donde se saca la informacion, por lo que voy a cambiar va a hacer este Para el agente, estos son los links: Wiki: https://thementalist.fandom.com API (MediaWiki), que es la que usaría el código: https://thementalist.fandom.com/api.php y the movie database para mas fidelidad y el tema de los fans del de fandom"
- S2: Owner decision (when): "Al compilar los datos (Recomendado)" — "Un importador baja todo de Fandom y TMDB, lo valida y arma la base. La app sigue andando sin internet y el anti-spoiler no cambia. Para actualizar, se corre un comando."
- S3: Owner decision (existing data): "Reemplazarlos por los importados" — "Fandom pasa a ser la fuente principal y los YAML actuales se regeneran desde el importador."
- S4: Owner decision (TMDB key): "la variable la tengo quiero que cree un txt yo relleno los campos y con txt hacers todo ese proceso de conectarse". The settings file is `data-sources.txt` (gitignored; template `data-sources.example.txt`). The agent never reads, prints, copies or commits it; runs that send the key to TMDB are started by the owner or with the owner's explicit authorization.
- S5: Owner decision (fans): "Teorías y trivia de fans" — "Llenar la sección Geek / Fans (no canónica) con teorías y curiosidades de la wiki, filtradas por episodio para no spoilear."
- S7: Owner decision (cases): "Importar lo estructurado y curar casos (Recomendado)" — "El importador reemplaza episodios, personajes, invitados y curiosidades. Culpables, víctimas, lugares y marcas de Red John quedan como capa curada, revisada contra la wiki como hasta ahora."
- S8: Owner decision (synopsis): "La de TMDB (Recomendado)" — "Oficial y corta. Suele contar solo la premisa del caso. Se muestra con la atribución que pide TMDB."
- S9: Attribution: Fandom text is CC BY-SA (page, revision link, licence, "Fandom contributors", adapted); TMDB requires its logo, the notice "This product uses the TMDB API but is not endorsed or certified by TMDB." and a link, in an About/Credits section.
- S6: Unchanged guarantees: every fact keeps a source tied to its reveal episode (`docs/design.md` §1, §3); the spoiler engine gates everything; the owner (progress S6E10) never sees canon text after S6E10 outside the app — reports and logs are counts and keys only.

## Tasks

- T0 [S1-S5] Explore the Fandom API (episode, character and case page templates/infobox fields, categories, trivia sections, rate limits/licence) and TMDB (series/season/episode endpoints, credits, auth with v3 key or v4 token). Route: explorer. Commit: n/a.
- T1 [S1, S2, S6] `packages/importer` Fandom client: api.php with descriptive User-Agent, sequential requests, `maxlag=5` + retry, continuation, on-disk cache keyed by revid (gitignored); parsers for `Infobox episode`/`Infobox character` (brace-depth), wikilinks/redirects, sections, categories; S3E23+24 split. Route: worker (parallel with T2, T5). Commit: a9135d9. Done.
- T2 [S4, S8] `packages/importer` settings + TMDB client: read `data-sources.txt` (never log or echo values), TMDB v3/v4 auth via Bearer header, series 5920 seasons 1-7 episodes (name, overview, air_date), rate-limit friendly, cache. Route: worker (parallel with T1, T5). Commit: 0cfff79 (+ fixes in a73a880, f342f49). Done: native review approved (lineage review-504c537d5c5102dc), key never in URLs/logs/errors/cache.
- T3 [S2, S3, S5, S6, S7, S8] Generators + CLI `pnpm data:import`: episodes (Fandom infobox + TMDB synopsis), characters (persons introduced at `first`; name, actor, job; `recurring` from Main/Recurring categories; no `status`/`last`/`family`), guests per episode (`appears_in`), trivia → theories with `spoils_up_to` = max episode linked in the bullet; writes generated YAML. Route: worker (after T1, T2). Commit: a73a880, 05580b5, 26f16fb (TMDB run, owner-authorized), f342f49. Done: 151 episodes with TMDB synopses, 639 persons (77 recurring), 368 fan notes gated by links, plain-text titles/names/codes and future wording.
- T4 [S3, S7] Reconcile the curated case layer with imported keys (person refs, recurring characters), remove the replaced hand-authored files, keep all guards green. Route: worker (after T3). Commit: 8040bc2. Done: 260 hand persons replaced, 273 references repointed (verifier sample 15/15 + all 273 name-checked), 126 cases / 103 solved at S6E10.
- T5 [S5, S9] App: Geek / Fans section (non-canon, gated by `spoils_up_to`) and About/Credits (Fandom CC BY-SA, TMDB logo + notice). Route: worker (parallel with T1, T2). Commit: a40b7af (+ 25fd48f). Done.
- T6 [S2, S4, S6] Run the Fandom import (agent) and the TMDB step (owner, or agent with the owner's explicit authorization), independent verification, rebuild `mentalist.exe`. Route: inline + verifier. Commit: pending.

## Log

- L1: Owner request 2026-11-25 (main b104964), quoted in S1; answers quoted in S2-S5.
- L2: Created `data-sources.example.txt` (no secrets) and gitignored `data-sources.txt`.
- L3: T0 findings: Fandom has no structured killer/victim/location data (only prose); episode infobox fields Title, season, episode, Aired, Writer, Director, Guests, Recurring; character infobox name, actor, first, last, status, job, family; categories Main/Recurring/Minor characters, Killers, Victims, Red John *; Trivia sections leak later events; no theories category; page URLs 403 behind Cloudflare, api.php works; licence CC-BY-SA. TMDB series id 5920; attribution logo + notice; storage terms to check.
- L4: Owner answers: cases curated (S7), TMDB synopsis (S8).
- L5: Verification at 8040bc2: S2-S5, S7-S9 met; blocker S6: fan note `t-8cb6eb25a3eb` visible at S6E10 named a later episode in plain text → fixed in f342f49 (explicit season/episode formats, plain-text titles and names, future words on all pages; regression test in canon-gating). Advisory fixed: `--offline` never calls TMDB. Advisory open: Credits/fan source URLs are plain text, not links. 132 fan notes visible at S6E10.
