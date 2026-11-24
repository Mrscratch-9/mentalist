use std::path::Path;

/// Bundled basemap extracts (`public/tiles/<name>.pmtiles`, gitignored). When one is absent, write a small
/// non-pmtiles placeholder `<name>.missing` next to it so its resource glob (`<name>.*`) still matches and the
/// build works; the app then answers 404 for that extract. The map keeps working with the other extract and
/// shows its "basemap could not be loaded" notice only when every extract is missing.
const EXTRACTS: [&str; 2] = ["california", "austin"];

fn main() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../public/tiles");
    println!("cargo:rerun-if-changed={}", dir.display());
    let _ = std::fs::create_dir_all(&dir);
    for name in EXTRACTS {
        let extract = dir.join(format!("{name}.pmtiles"));
        println!("cargo:rerun-if-changed={}", extract.display());
        let placeholder = dir.join(format!("{name}.missing"));
        if extract.exists() {
            let _ = std::fs::remove_file(&placeholder); // never bundle a stale placeholder
        } else {
            let note = format!("Placeholder: {name}.pmtiles is missing (see apps/desktop/README.md, Offline basemap).\n");
            let _ = std::fs::write(&placeholder, note);
        }
    }
    tauri_build::build()
}
