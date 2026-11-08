mod auth;

use auth::{AuthInfo, AuthState};
use std::sync::Mutex;
use tauri::State;

struct AppAuth(Mutex<AuthState>);

#[tauri::command]
fn get_auth(auth: State<'_, AppAuth>) -> Result<AuthInfo, String> {
    let g = auth.0.lock().map_err(|_| "Auth lock poisoned".to_string())?;
    Ok(auth::auth_status(&g))
}

#[tauri::command]
fn sign_in(auth: State<'_, AppAuth>) -> Result<AuthInfo, String> {
    auth::sign_in(&auth.0)
}

#[tauri::command]
fn sign_out(auth: State<'_, AppAuth>) -> Result<AuthInfo, String> {
    let mut g = auth.0.lock().map_err(|_| "Auth lock poisoned".to_string())?;
    auth::sign_out(&mut g);
    Ok(auth::auth_status(&g))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppAuth(Mutex::new(AuthState::default())))
        .invoke_handler(tauri::generate_handler![get_auth, sign_in, sign_out])
        .run(tauri::generate_context!())
        .expect("error while running ai-antivirus");
}
