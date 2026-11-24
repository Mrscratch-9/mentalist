use std::path::Path;

/// `public/tiles/california.pmtiles` is a gitignored bundle resource. When the extract is absent, write
/// a small non-pmtiles placeholder next to it so the resource glob still matches and the build works; the
/// app then answers 404 for the basemap and shows its "basemap could not be loaded" notice.
fn main() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../public/tiles");
    println!("cargo:rerun-if-changed={}", dir.display());
    println!("cargo:rerun-if-changed={}", dir.join("california.pmtiles").display());
    let _ = std::fs::create_dir_all(&dir);
    let placeholder = dir.join("california.missing");
    if dir.join("california.pmtiles").exists() {
        let _ = std::fs::remove_file(&placeholder); // never bundle a stale placeholder
    } else {
        let note = "Placeholder: california.pmtiles is missing (see apps/desktop/README.md, Offline basemap).\n";
        let _ = std::fs::write(&placeholder, note);
    }
    tauri_build::build()
}
