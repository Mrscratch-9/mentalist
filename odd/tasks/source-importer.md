# Phase 5: canon importer from Fandom (MediaWiki API) and TMDB

Feature: replace the hand-authored canon with data imported at build time from The Mentalist Wiki (Fandom MediaWiki API) and The Movie Database (TMDB), plus a non-canon fans section (theories and trivia) from Fandom, all gated by the spoiler engine. The app stays offline; the importer writes the canon YAML that the existing pipeline validates and compiles.

## Specs

- S1: "vamos hacer un cambio en el motor en si desde donde se saca la informacion, por lo que voy a cambiar va a hacer este Para el agente, estos son los links: Wiki: https://thementalist.fandom.com API (MediaWiki), que es la que usaría el código: https://thementalist.fandom.com/api.php y the movie database para mas fidelidad y el tema de los fans del de fandom"
- S2: Owner decision (when): "Al compilar los datos (Recomendado)" — "Un importador baja todo de Fandom y TMDB, lo valida y arma la base. La app sigue andando sin internet y el anti-spoiler no cambia. Para actualizar, se corre un comando."
- S3: Owner decision (existing data): "Reemplazarlos por los importados" — "Fandom pasa a ser la fuente principal y los YAML actuales se regeneran desde el importador."
- S4: Owner decision (TMDB key): "la variable la tengo quiero que cree un txt yo relleno los campos y con txt hacers todo ese proceso de conectarse". The settings file is `data-sources.txt` (gitignored; template `data-sources.example.txt`). The agent never reads, prints, copies or commits it; runs that send the key to TMDB are started by the owner or with the owner's explicit authorization.
- S5: Owner decision (fans): "Teorías y trivia de fans" — "Llenar la sección Geek / Fans (no canónica) con teorías y curiosidades de la wiki, filtradas por episodio para no spoilear."
- S6: Unchanged guarantees: every fact keeps a source tied to its reveal episode (`docs/design.md` §1, §3); the spoiler engine gates everything; the owner (progress S6E10) never sees canon text after S6E10 outside the app — reports and logs are counts and keys only.

## Tasks

- T0 [S1-S5] Explore the Fandom API (episode, character and case page templates/infobox fields, categories, trivia sections, rate limits/licence) and TMDB (series/season/episode endpoints, credits, auth with v3 key or v4 token). Route: explorer. Commit: n/a.
- T1.. Planned after T0 (importer package, mapping to the claim model, fans section, regeneration of data/canon, gating checks).

## Log

- L1: Owner request 2026-11-25 (main b104964), quoted in S1; answers quoted in S2-S5.
- L2: Created `data-sources.example.txt` (no secrets) and gitignored `data-sources.txt`.
