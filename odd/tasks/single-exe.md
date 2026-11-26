# Single self-contained mentalist.exe

Feature: ship one `mentalist.exe` that carries everything it needs; on first run it unpacks the map extracts into `%LOCALAPPDATA%\The Mentalist Archive\` and reads them from there. No folder has to travel with the exe.

## Specs

- S1: "necesito que la app contenga todo lo necesario y descomprimi lo que necesita como cualquier app el localappdata y el nombre de la app la idea de hacer un exe es que no tenga que pasar carpetas no es funcional"
- S2: Everything else is already inside the exe (frontend, canon.sqlite, fonts, glyphs, sprites, icons); only `california.pmtiles` and `austin.pmtiles` (~275 MB) are external today. WebView2 is the system runtime (present on Windows 10/11).
- S3: Unpack target: `%LOCALAPPDATA%\The Mentalist Archive\tiles\` (app name). Unpack only when missing or from another build (version/size/hash marker); write to a temp file and rename (no half-written files); a failed unpack shows the existing "basemap could not be loaded" notice instead of crashing.
- S4: RAM target < 700 MB and the tiles protocol guarantees (path check, ranges, cap, pool) stay as they are.

## Tasks

- T1 [S1-S4] Payload appended to the exe (overlay after the PE image: files + JSON index + footer magic + index offset), Rust reader that unpacks on first use into the LocalAppData folder, tiles protocol serving from there (dev keeps public/tiles), packing script and `pnpm release` producing `release/mentalist.exe`, tests, README. Route: worker. Commit: pending.
- T2 [S1] Smoke run: copy only `release/mentalist.exe` to an empty temp folder, run it with a temporary LOCALAPPDATA, confirm unpack, map tiles served, second run skips unpack; clean up. Route: worker (with T1) + parent check. Commit: n/a.

## Log

- L1: Owner request 2026-11-26 (main 82b482d), quoted in S1.
