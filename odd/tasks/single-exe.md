# Windows installer: one Setup.exe that shows what it installs and where

Feature: distribute the app as a single Spanish installer that shows what will be installed, lets the user choose the folder (default under LocalAppData with the app's name), creates shortcuts and an uninstaller. No scripts or folders for the user to handle.

## Specs

- S1: "necesito que la app contenga todo lo necesario y descomprimi lo que necesita como cualquier app el localappdata y el nombre de la app la idea de hacer un exe es que no tenga que pasar carpetas no es funcional"
- S2: "pero no seria mejor todo dentro de la app sin scripst y hacerlo mas practico y mostrar en el instalador donde desea instalar y que se va instalar"
- S3: Owner decision: "Solo el instalador (Recomendado)" — "Un único Setup.exe en español: te muestra qué se instala, te deja elegir la carpeta, crea los accesos directos y agrega un desinstalador. Descarto el exe que se desempaqueta solo."
- S4: Default install folder `%LOCALAPPDATA%\The Mentalist Archive` (per-user, no admin); the installer carries the app and both map extracts (everything the app needs); RAM target < 700 MB unchanged.

## Tasks

- T1 [S1-S4] Tauri NSIS installer: Spanish UI, pages showing what will be installed (components with sizes and/or an information page with the contents and the credits/licences), directory chooser defaulting to the LocalAppData folder, desktop/start-menu shortcut options, uninstaller, finish page with "launch"; MSI dropped; `release/` holds only the Setup.exe; one command builds it, documented. Route: worker. Commit: pending.
- T2 [S1-S4] Smoke: silent and interactive-path checks (install to a temp folder, files present, app starts, uninstall removes it). Route: worker (with T1) + owner tries the interactive installer. Commit: n/a.

## Log

- L1: Owner request 2026-11-26 (main 82b482d), quoted in S1. A self-extracting single exe was built (uncommitted) and then discarded after S2/S3.
