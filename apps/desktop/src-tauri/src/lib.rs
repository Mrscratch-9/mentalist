mod tiles;

use tauri::Manager;

/// Directory holding the bundled PMTiles files: the `tiles` resource, or `public/tiles` in a dev checkout.
fn tiles_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    let bundled = app.path().resource_dir().map(|d| d.join("tiles")).ok().filter(|d| d.is_dir());
    bundled.unwrap_or_else(|| std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../public/tiles"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("tiles", |ctx, request, responder| {
            let dir = tiles_dir(ctx.app_handle());
            // Blocking file I/O stays off the webview's main thread.
            std::thread::spawn(move || responder.respond(tiles::respond(&dir, &request)));
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
