use std::io::{BufRead, BufReader, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{
    atomic::{AtomicU16, Ordering},
    Arc, Mutex,
};
use std::time::Duration;
use tauri::{Manager, RunEvent, State, WindowEvent};

struct SidecarState {
    child: Mutex<Option<Child>>,
    port: Arc<AtomicU16>,
    error: Mutex<Option<String>>,
}

impl SidecarState {
    fn shutdown(&self) {
        let port = self.port.load(Ordering::SeqCst);

        // 1. Trigger graceful HTTP shutdown so Node.js kills all MCP child processes + cloudflared
        if port >= 8000 {
            if let Ok(mut stream) = TcpStream::connect_timeout(
                &SocketAddr::from(([127, 0, 0, 1], port)),
                Duration::from_millis(300),
            ) {
                let _ = stream.set_write_timeout(Some(Duration::from_millis(300)));
                let req = format!(
                    "POST /api/shutdown HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                );
                let _ = stream.write_all(req.as_bytes());
                let _ = stream.flush();
            }
        }

        // 2. Enforce strict process-tree termination so zero orphan processes survive
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let pid = child.id();

                // Wait briefly for graceful Node.js exit
                for _ in 0..12 {
                    if let Ok(Some(_)) = child.try_wait() {
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }

                // Hard kill entire process tree
                #[cfg(target_os = "windows")]
                {
                    let _ = Command::new("taskkill")
                        .args(["/PID", &pid.to_string(), "/T", "/F"])
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .status();
                }

                #[cfg(not(target_os = "windows"))]
                {
                    let _ = Command::new("kill")
                        .args(["-TERM", &pid.to_string()])
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .status();
                    std::thread::sleep(Duration::from_millis(250));
                }

                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

impl Drop for SidecarState {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[tauri::command]
fn get_sidecar_port(state: State<'_, SidecarState>) -> u16 {
    state.port.load(Ordering::SeqCst)
}

#[tauri::command]
fn get_sidecar_error(state: State<'_, SidecarState>) -> Option<String> {
    state.error.lock().ok().and_then(|g| g.clone())
}

fn resolve_node_binary() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        for candidate in [
            r"C:\Program Files\nodejs\node.exe",
            r"C:\Program Files (x86)\nodejs\node.exe",
        ] {
            let p = PathBuf::from(candidate);
            if p.is_file() {
                return p;
            }
        }
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let p = PathBuf::from(local_app_data).join(r"Programs\nodejs\node.exe");
            if p.is_file() {
                return p;
            }
        }
        if let Ok(app_data) = std::env::var("APPDATA") {
            let p = PathBuf::from(app_data).join(r"npm\node.exe");
            if p.is_file() {
                return p;
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        for candidate in ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"] {
            let p = PathBuf::from(candidate);
            if p.is_file() {
                return p;
            }
        }
    }

    PathBuf::from("node")
}

fn resolve_sidecar_script(app: &tauri::App) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    // 1. Next to current running executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join("sidecar").join("dist").join("server.cjs"));
            candidates.push(exe_dir.join("sidecar").join("server.js"));
            candidates.push(exe_dir.join("_up_").join("sidecar").join("dist").join("server.cjs"));
            candidates.push(exe_dir.join("_up_").join("sidecar").join("server.js"));
        }
    }

    // 2. Bundled production resource path
    if let Ok(res_dir) = app.path().resource_dir() {
        candidates.push(res_dir.join("sidecar").join("dist").join("server.cjs"));
        candidates.push(res_dir.join("sidecar").join("server.js"));
        candidates.push(res_dir.join("_up_").join("sidecar").join("dist").join("server.cjs"));
        candidates.push(res_dir.join("_up_").join("sidecar").join("server.js"));
    }

    // 3. Development path relative to src-tauri/
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    candidates.push(manifest_dir.join("..").join("sidecar").join("dist").join("server.cjs"));
    candidates.push(manifest_dir.join("..").join("sidecar").join("server.js"));

    for candidate in candidates {
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

fn spawn_sidecar(app: &tauri::App, port_store: Arc<AtomicU16>) -> Result<Child, String> {
    let script = resolve_sidecar_script(app)
        .ok_or_else(|| "Bundled MCP Switchboard sidecar script was not found.".to_string())?;
    let sidecar_dir = script
        .parent()
        .ok_or_else(|| "Invalid sidecar script directory.".to_string())?
        .to_path_buf();
    let node_bin = resolve_node_binary();

    let mut cmd = Command::new(&node_bin);
    cmd.arg(&script)
        .current_dir(&sidecar_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());

    // Inform sidecar of parent PID so it auto-exits cleanly if parent GUI terminates
    cmd.env("MCP_SWITCHBOARD_PARENT_PID", std::process::id().to_string());

    if let Ok(data_dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&data_dir);
        cmd.env("MCP_SWITCHBOARD_DATA_DIR", data_dir);
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().map_err(|err| {
        if err.kind() == std::io::ErrorKind::NotFound {
            "Node.js is required to run the MCP Switchboard engine, but was not found on your system.".to_string()
        } else {
            format!("Failed to launch Node.js sidecar ({}): {err}", node_bin.display())
        }
    })?;

    if let Some(stdout) = child.stdout.take() {
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                if let Some(raw_port) = line.strip_prefix("SWITCHBOARD_READY_PORT=") {
                    if let Ok(parsed) = raw_port.trim().parse::<u16>() {
                        port_store.store(parsed, Ordering::SeqCst);
                    }
                }
            }
        });
    }

    Ok(child)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let port_store = Arc::new(AtomicU16::new(0));
    let sidecar_state = SidecarState {
        child: Mutex::new(None),
        port: Arc::clone(&port_store),
        error: Mutex::new(None),
    };

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(sidecar_state)
        .invoke_handler(tauri::generate_handler![get_sidecar_port, get_sidecar_error])
        .setup(move |app| {
            let state = app.state::<SidecarState>();
            match spawn_sidecar(app, Arc::clone(&port_store)) {
                Ok(child) => {
                    if let Ok(mut guard) = state.child.lock() {
                        *guard = Some(child);
                    }
                }
                Err(msg) => {
                    eprintln!("[MCP Switchboard] {msg}");
                    if let Ok(mut err_guard) = state.error.lock() {
                        *err_guard = Some(msg);
                    }
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<SidecarState>();
                state.shutdown();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building MCP Switchboard Tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            let state = app_handle.state::<SidecarState>();
            state.shutdown();
        }
    });
}
