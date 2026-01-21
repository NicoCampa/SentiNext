#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{Manager, WindowBuilder, WindowUrl};

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
        cmd.spawn().map_err(|err| err.to_string())
    } else {
        let bin_name = if cfg!(windows) {
            "sentinext-backend.exe"
        } else {
            "sentinext-backend"
        };
        let sidecar = app
            .path_resolver()
            .resolve_resource(bin_name)
            .ok_or("Sidecar binary not found")?;
        Command::new(sidecar)
            .arg("--port")
            .arg(port.to_string())
            .spawn()
            .map_err(|err| err.to_string())
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let port = pick_free_port();
            let child = spawn_backend(&app.handle(), port)?;

            app.manage(BackendState {
                child: Mutex::new(Some(child)),
            });

            wait_for_port(port, 6000);

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
