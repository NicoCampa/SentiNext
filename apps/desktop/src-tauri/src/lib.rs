use std::net::TcpListener;
use std::sync::Mutex;
use std::time::Duration;

use tauri::Manager;
use tauri_plugin_shell::ShellExt;

/// Find a free port by binding to port 0.
fn find_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .expect("Failed to bind to find free port")
        .local_addr()
        .expect("Failed to get local address")
        .port()
}

/// Health-check the backend by polling GET /health.
async fn wait_for_backend(port: u16, timeout: Duration) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{}/health", port);
    let client = reqwest::Client::new();
    let start = std::time::Instant::now();
    let interval = Duration::from_millis(500);

    loop {
        if start.elapsed() > timeout {
            return Err(format!(
                "Backend did not start within {}s",
                timeout.as_secs()
            ));
        }

        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => return Ok(()),
            _ => {}
        }

        tokio::time::sleep(interval).await;
    }
}

pub fn run() {
    let port = find_free_port();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            let handle = app.handle().clone();

            // Store port in app state for later access
            app.manage(Mutex::new(port));

            // Spawn the Python sidecar
            let shell = handle.shell();
            let sidecar = shell
                .sidecar("binaries/sentinext-backend")
                .expect("Failed to create sidecar command")
                .args(["--port", &port.to_string()]);

            let (mut _rx, child) = sidecar.spawn().expect("Failed to spawn sidecar");

            // Store the child process for cleanup
            app.manage(Mutex::new(Some(child)));

            // Inject the API base URL and run health check
            let handle_clone = handle.clone();
            tauri::async_runtime::spawn(async move {
                match wait_for_backend(port, Duration::from_secs(30)).await {
                    Ok(()) => {
                        // Inject API base URL into all webview windows
                        let js = format!(
                            "window.__SENTINEXT_API_BASE__ = 'http://127.0.0.1:{}';",
                            port
                        );
                        if let Some(window) = handle_clone.get_webview_window("main") {
                            let _ = window.eval(&js);
                        }
                    }
                    Err(err) => {
                        eprintln!("Backend boot failed: {}", err);
                        let js = format!(
                            "window.__SENTINEXT_BACKEND_BOOT_ERROR__ = '{}';",
                            err.replace('\'', "\\'")
                        );
                        if let Some(window) = handle_clone.get_webview_window("main") {
                            let _ = window.eval(&js);
                        }
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Kill the sidecar process on window close
                let app = window.app_handle();
                if let Some(state) = app.try_state::<Mutex<Option<tauri_plugin_shell::process::CommandChild>>>() {
                    if let Ok(mut guard) = state.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
