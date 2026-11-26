# App v2: spoiler-safe characters, Spanish, real case map, settings, photos

Feature: fix the character spoilers and overlapping texts (Phase 0, first), then Spanish (Phase 1), curated case places with chronology and red-string links (Phase 2), settings with map styles (Phase 3) and character photos (Phase 4).

## Specs

- S1 (owner, 2026-11-26): "1 los nombres, sinpsosis y todo esta en ingles, 2 el tipo de mapa no me gusta ya que solo muestra la sede central o el headqueartes pero no donde se desarrollo, la cronologia y por donde se movieron o a donde fueron, hay textos que se supones, te comparto la capturas que tome 4 el otro punto es que me gustaria que tuviera list y escritura en vez de hacerlo solo escribinedo, en la parte de la izquierda donde estan los episodios, deberia de poder pincharlos y ll;evarme a la ubicacion lo mismo con tab y enter si se ocupa teclado una seccion de configuracion, para poder cambiar el idioma si es mapa 2 o 3d y que el mapa no se obcuro sino algo mas realista o algo asi como se ocupan en las series de cirminals minds y el metalista"
- S2 (owner answers): "los traduciomos, 2 lugares curados por casos es decir fiel 100%, 3 los 4 que me nombraste me gustan que estuvieses, pero quiero que se pueda combionar el de hilo rojo con varios es decir como conectando los espisodios y todo, quiero que extrauigas la imagenes de los personajkes ya no solo siluestas ya que es de uso publico creo se puede hacer 4 espanol latinoamaerica"
- S3 (owner decisions): Phase 0 first ("Sí, primero la Fase 0 (Recomendado)"); repository "Privado"; satellite "Alto: varios GB más"; photos "Fandom y TMDB (Recomendado)". Photos are not committed to git; they are downloaded at import and bundled only in the owner's installer.
- S4 (screenshots): at progress 1x01 the characters strip showed later-season names and jobs (Fandom infobox `name`/`job` hold the final values, not the first-appearance values), raw wiki HTML (`<div class="mw-collapsible…`) and overlapping text ("textos que se superponen").
- S5: Owner progress is now S6E12 (screenshot: "now 6x12").

## Tasks

- T0 [S4, S5] Phase 0: character name = page title (no "(real name)"/alias text), drop the Fandom `job` as a displayed role; show the actor; restore curated dated roles for main characters (superseding claims per episode, sourced); strip HTML/wiki markup from every imported text; characters strip with fixed-width cards and ellipsis; tests (no markup in imported text; no imported field other than dated curated claims describes later status); owner progress S6E12; new installer. Route: worker + verifier. Commit: pending.
- T1 [S1-S3] Phase 1 Spanish (UI i18n, TMDB es-MX, translated wiki content stored alongside the original). Planned after T0.
- T2 [S1-S3] Phase 2 curated places per case, chronology mode, red-string overlay combinable with any style, click/keyboard to fly, progress pickers. Planned after T1.
- T3 [S1-S3] Phase 3 settings: language, 2D/3D, styles (realistic light with terrain, night, high-detail satellite, investigation board). Planned after T2.
- T4 [S2-S3] Phase 4 photos (first Fandom image, else TMDB actor photo with attribution; not in git). Planned after T3.

## Log

- L1: Owner messages and decisions quoted in S1-S3; screenshots analysed in S4. The leak is an importer defect: only status/last/family were excluded, not name/job.
