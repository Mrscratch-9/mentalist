# Offline basemap assets

Vendored from https://github.com/protomaps/basemaps-assets (main, downloaded 2026-11-24) so the map needs no network.

- `fonts/NotoSans-{Regular,Medium,Italic}/{range}.pbf`: Noto Sans glyph PBFs, SIL Open Font License 1.1 (`fonts/OFL.txt`).
  Ranges: 0-255, 256-511, 512-767, 768-1023 (Latin, Latin Extended, IPA, Greek/Cyrillic start) and 8192-8447 (general punctuation).
  Directories are the protomaps font names without spaces (`Noto Sans Regular` -> `NotoSans-Regular`); `RedMap.tsx` renames the stacks.
- `sprites/black*`: protomaps v4 "black" sprite (road shields, one-way arrow, place dots), 1x and 2x,
  derived from tangrams/icons (MIT, `sprites/LICENSE-tangrams-icons-MIT.md`).
