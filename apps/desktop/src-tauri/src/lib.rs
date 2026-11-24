mod tiles;

use tauri::Manager;

/// Directory holding the bundled PMTiles files: the `tiles` resource. Debug builds fall back to
/// `public/tiles` in the source checkout; release builds never read a compile-time source path.
fn tiles_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    let bundled = app.path().resource_dir().map(|d| d.join("tiles")).ok().filter(|d| d.is_dir());
    #[cfg(debug_assertions)]
    let bundled = bundled.or_else(|| Some(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../public/tiles")));
    // No directory: every request resolves to 404 and the app shows its "basemap" notice.
    bundled.unwrap_or_default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Blocking file I/O stays off the webview's main thread, on a fixed set of workers.
    let pool = tiles::Pool::new(tiles::WORKERS);
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("tiles", move |ctx, request, responder| {
            let dir = tiles_dir(ctx.app_handle());
            pool.execute(move || responder.respond(tiles::respond(&dir, &request)));
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
