use std::collections::HashMap;

// Writes spike check artifacts to $SPIKE_REPORT_DIR so runs can be verified headlessly.
#[tauri::command]
fn report(files: HashMap<String, String>) -> Result<(), String> {
    let Ok(dir) = std::env::var("SPIKE_REPORT_DIR") else {
        return Ok(());
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for (name, body) in files {
        let safe = std::path::Path::new(&name)
            .file_name()
            .ok_or("invalid file name")?;
        std::fs::write(std::path::Path::new(&dir).join(safe), body).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Which checks to run and map options, for RAM attribution runs (see scripts/measure-ram.ps1).
#[tauri::command]
fn spike_config() -> (String, String) {
    let var = |k: &str, d: &str| std::env::var(k).unwrap_or_else(|_| d.into());
    (var("SPIKE_CHECKS", "sqlite,map,graph"), var("SPIKE_MAP_OPTS", ""))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![report, spike_config])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
