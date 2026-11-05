mod google_auth;
use std::io::Write;
use std::process::{Command, Stdio};
use tauri::Manager;

#[tauri::command]
fn helper(request: serde_json::Value, app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let exe = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("helper")
        .join("KKF.Helper.exe");
    let mut child = Command::new(&exe)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| {
            format!(
                "Nie można uruchomić modułu dokumentów ({}): {}",
                exe.display(),
                e
            )
        })?;
    child
        .stdin
        .take()
        .ok_or("Brak wejścia modułu")?
        .write_all(request.to_string().as_bytes())
        .map_err(|e| e.to_string())?;
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&text).map_err(|_| {
        format!(
            "Błąd modułu dokumentów: {}",
            String::from_utf8_lossy(&output.stderr)
        )
    })?;
    if parsed.get("ok").and_then(|x| x.as_bool()) == Some(true) {
        Ok(parsed["data"].clone())
    } else {
        Err(parsed["error"]
            .as_str()
            .unwrap_or("Nieznany błąd")
            .to_string())
    }
}

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[tauri::command]
fn template_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("assets")
        .join("KKF.docx")
        .to_string_lossy()
        .into_owned())
}

#[tauri::command]
fn open_document(path: String) -> Result<(), String> {
    if !std::path::Path::new(&path).is_file() {
        return Err("Nie znaleziono pliku.".into());
    }
    Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Start-Process -FilePath $args[0]",
            "--",
            &path,
        ])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            helper,
            template_path,
            open_document,
            google_auth::google_sign_in
        ])
        .run(tauri::generate_context!())
        .expect("Nie udało się uruchomić KKF Studio");
}
