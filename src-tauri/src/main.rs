#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::{create_dir_all, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
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

#[tauri::command]
fn restart_backend(app: tauri::AppHandle, state: tauri::State<BackendState>) -> Result<String, String> {
    state.kill();

    let port = pick_free_port();
    let log_file = state.log_file.clone();
    let mut child = spawn_backend(&app, port, &log_file)?;
    wait_for_backend(&mut child, port, 60000)?;

    let api_base = format!("http://127.0.0.1:{}", port);
    if let Ok(mut guard) = state.api_base.lock() {
        *guard = Some(api_base.clone());
    }
    if let Ok(mut guard) = state.child.lock() {
        *guard = Some(child);
    }

    Ok(api_base)
}

struct BackendState {
    child: Mutex<Option<Child>>,
    api_base: Mutex<Option<String>>,
    log_file: PathBuf,
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

fn js_escape(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\n', "\\n")
        .replace('\r', "")
}

fn backend_log_file(app: &tauri::AppHandle) -> PathBuf {
    let base = app
        .path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| std::env::temp_dir().join("SentiNext"));
    base.join("logs").join("backend-sidecar.log")
}

fn health_check(port: u16) -> bool {
    let addr = format!("127.0.0.1:{}", port);
    let Ok(mut stream) = TcpStream::connect(&addr) else {
        return false;
    };
    let request = b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    let _ = stream.write_all(request);
    let _ = stream.flush();
    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);
    response.contains("200 OK") && response.contains("\"status\"") && response.contains("ok")
}

fn wait_for_backend(child: &mut Child, port: u16, timeout_ms: u64) -> Result<(), String> {
    let start = Instant::now();
    while start.elapsed().as_millis() < timeout_ms as u128 {
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!("Backend exited before becoming ready: {}", status));
        }

        if health_check(port) {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(200));
    }

    Err(format!(
        "Backend did not become ready within {}s.",
        timeout_ms / 1000
    ))
}

fn tail_file(path: &PathBuf, max_bytes: u64) -> String {
    let Ok(mut file) = OpenOptions::new().read(true).open(path) else {
        return String::new();
    };
    let Ok(size) = file.seek(SeekFrom::End(0)) else {
        return String::new();
    };
    let start = size.saturating_sub(max_bytes);
    if file.seek(SeekFrom::Start(start)).is_err() {
        return String::new();
    }
    let mut buffer = String::new();
    let _ = file.read_to_string(&mut buffer);
    buffer.trim().to_string()
}

fn project_root() -> Option<PathBuf> {
    std::env::current_dir()
        .ok()
        .and_then(|dir| dir.parent().map(|p| p.to_path_buf()))
}

fn spawn_backend(app: &tauri::AppHandle, port: u16, log_file: &PathBuf) -> Result<Child, String> {
    let enforce_license = std::env::var("SENTINEXT_LICENSE_ENFORCE").ok();
    if let Some(parent) = log_file.parent() {
        let _ = create_dir_all(parent);
    }
    let stdout = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_file)
        .map_err(|err| err.to_string())?;
    let stderr = stdout.try_clone().map_err(|err| err.to_string())?;

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
        cmd.env("SENTINEXT_LOG_FILE", log_file);
        if enforce_license.is_none() {
            cmd.env("SENTINEXT_LICENSE_ENFORCE", "false");
        }
        cmd.stdout(stdout).stderr(stderr);
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
        cmd.env("SENTINEXT_LOG_FILE", log_file);
        if enforce_license.is_none() {
            cmd.env("SENTINEXT_LICENSE_ENFORCE", "false");
        }
        cmd.stdout(stdout).stderr(stderr);
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
            clear_openai_api_key,
            restart_backend
        ])
        .setup(|app| {
            let port = pick_free_port();
            let log_file = backend_log_file(&app.handle());
            let mut child = spawn_backend(&app.handle(), port, &log_file)?;

            let ready = wait_for_backend(&mut child, port, 60000);
            let boot_error = ready.err().map(|err| {
                let tail = tail_file(&log_file, 8000);
                if tail.is_empty() {
                    err
                } else {
                    format!("{err}\n\nLast backend output:\n{tail}")
                }
            });

            let api_base = format!("http://127.0.0.1:{}", port);

            if boot_error.is_some() {
                let _ = child.kill();
            }

            app.manage(BackendState {
                child: Mutex::new(if boot_error.is_none() { Some(child) } else { None }),
                api_base: Mutex::new(Some(api_base.clone())),
                log_file: log_file.clone(),
            });

            let api_js = js_escape(&api_base);
            let log_js = js_escape(&log_file.to_string_lossy());
            let err_js = boot_error
                .map(|err| format!("'{}'", js_escape(&err)))
                .unwrap_or_else(|| "null".to_string());
            let init_script = format!(
                "window.__SENTINEXT_API_BASE__ = '{}'; window.__SENTINEXT_BACKEND_LOG_FILE__='{}'; window.__SENTINEXT_BACKEND_BOOT_ERROR__={};",
                api_js, log_js, err_js
            );

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
