#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{Manager, WindowBuilder, WindowUrl};

const KEYCHAIN_SERVICE: &str = "SentiNext";
const OPENAI_KEY_ACCOUNT: &str = "openai_api_key";

fn keychain_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, OPENAI_KEY_ACCOUNT).map_err(|err| err.to_string())
}

#[tauri::command]
fn get_openai_api_key() -> Result<Option<String>, String> {
    let entry = keychain_entry()?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
fn set_openai_api_key(api_key: String) -> Result<(), String> {
    let entry = keychain_entry()?;
    entry.set_password(api_key.trim()).map_err(|err| err.to_string())
}

#[tauri::command]
fn clear_openai_api_key() -> Result<(), String> {
    let entry = keychain_entry()?;
    let _ = entry.delete_password();
    Ok(())
}

struct BackendState {
    child: Mutex<Option<Child>>,
}

impl BackendState {
    fn kill(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

fn pick_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|listener| listener.local_addr().ok().map(|addr| addr.port()))
        .unwrap_or(8000)
}

fn wait_for_port(port: u16, timeout_ms: u64) {
    let start = Instant::now();
    while start.elapsed().as_millis() < timeout_ms as u128 {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return;
        }
        thread::sleep(Duration::from_millis(200));
    }
}

fn project_root() -> Option<PathBuf> {
    std::env::current_dir()
        .ok()
        .and_then(|dir| dir.parent().map(|p| p.to_path_buf()))
}

fn spawn_backend(app: &tauri::AppHandle, port: u16) -> Result<Child, String> {
    let enforce_license = std::env::var("SENTINEXT_LICENSE_ENFORCE").ok();
    if cfg!(debug_assertions) {
        let python = std::env::var("SENTINEXT_PYTHON").unwrap_or_else(|_| {
            if cfg!(windows) {
                "python".to_string()
            } else {
                "python3".to_string()
            }
        });
        let root = project_root().ok_or("Failed to resolve project root")?;
        let script = root.join("backend").join("tauri_backend.py");
        let mut cmd = Command::new(python);
        cmd.arg(script)
            .arg("--port")
            .arg(port.to_string())
            .current_dir(&root)
            .env("PYTHONPATH", &root);
        if enforce_license.is_none() {
            cmd.env("SENTINEXT_LICENSE_ENFORCE", "false");
        }
        cmd.spawn().map_err(|err| err.to_string())
    } else {
        let bin_name = if cfg!(windows) {
            "sentinext-backend.exe"
        } else {
            "sentinext-backend"
        };
        let sidecar = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|dir| dir.join(bin_name)))
            .filter(|path| path.exists())
            .or_else(|| app.path_resolver().resolve_resource(bin_name))
            .ok_or("Sidecar binary not found")?;
        let mut cmd = Command::new(sidecar);
        cmd.arg("--port")
            .arg(port.to_string());
        if enforce_license.is_none() {
            cmd.env("SENTINEXT_LICENSE_ENFORCE", "false");
        }
        cmd
            .spawn()
            .map_err(|err| err.to_string())
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_openai_api_key,
            set_openai_api_key,
            clear_openai_api_key
        ])
        .setup(|app| {
            let port = pick_free_port();
            let child = spawn_backend(&app.handle(), port)?;

            app.manage(BackendState {
                child: Mutex::new(Some(child)),
            });

            wait_for_port(port, 15000);

            let api_base = format!("http://127.0.0.1:{}", port);
            let init_script = format!("window.__SENTINEXT_API_BASE__ = '{}';", api_base);

            let window = WindowBuilder::new(app, "main", WindowUrl::App("index.html".into()))
                .title("SentiNext")
                .inner_size(1280.0, 860.0)
                .min_inner_size(1024.0, 700.0)
                .visible(false)
                .initialization_script(&init_script)
                .build()?;

            let _ = window.show();
            Ok(())
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event.event() {
                if let Some(state) = event.window().app_handle().try_state::<BackendState>() {
                    state.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
