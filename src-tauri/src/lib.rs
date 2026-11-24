use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::io::{BufRead, BufReader, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{
    atomic::{AtomicU16, Ordering},
    Arc, Mutex,
};
use std::time::Duration;
use tauri::{Manager, RunEvent, State, WindowEvent};

/// Runtime state for the managed Node.js sidecar process.
struct SidecarState {
    child: Mutex<Option<Child>>,
    port: Arc<AtomicU16>,
    token: String,
    error: Mutex<Option<String>>,
}

impl SidecarState {
    /// Gracefully ask the sidecar to shut down child MCP processes, then force-kill if needed.
    fn shutdown(&self) {
        let port = self.port.load(Ordering::SeqCst);

        // 1. Trigger authenticated graceful HTTP shutdown so Node.js kills MCP children + cloudflared
        if port >= 8000 {
            if let Ok(mut stream) = TcpStream::connect_timeout(
                &SocketAddr::from(([127, 0, 0, 1], port)),
                Duration::from_millis(300),
            ) {
                let _ = stream.set_write_timeout(Some(Duration::from_millis(300)));
                let req = format!(
                    "POST /api/shutdown HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nX-Switchboard-Token: {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                    self.token
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

/// Generate a 256-bit per-launch control token seeded from the OS CSPRNG via std RandomState.
fn generate_control_token() -> String {
    let mut token = String::with_capacity(64);
    for idx in 0..4u64 {
        let mut hasher = RandomState::new().build_hasher();
        hasher.write_u64(idx ^ u64::from(std::process::id()));
        token.push_str(&format!("{:016x}", hasher.finish()));
    }
    token
}

#[tauri::command]
fn get_sidecar_port(state: State<'_, SidecarState>) -> u16 {
    state.port.load(Ordering::SeqCst)
}

#[tauri::command]
fn get_sidecar_token(state: State<'_, SidecarState>) -> String {
    state.token.clone()
}

#[tauri::command]
fn get_sidecar_error(state: State<'_, SidecarState>) -> Option<String> {
    state.error.lock().ok().and_then(|g| g.clone())
}

fn push_sidecar_variants(candidates: &mut Vec<PathBuf>, base: &Path) {
    candidates.push(base.join("sidecar").join("dist").join("server.cjs"));
    candidates.push(base.join("sidecar").join("server.js"));
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
        for candidate in [
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
        ] {
            let p = PathBuf::from(candidate);
            if p.is_file() {
                return p;
            }
        }
    }

    PathBuf::from("node")
}

fn resolve_sidecar_script(app: &tauri::App) -> Option<PathBuf> {
    let mut candidates = Vec::with_capacity(10);

    // 1. Next to current running executable and bundled production resources
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            push_sidecar_variants(&mut candidates, exe_dir);
            push_sidecar_variants(&mut candidates, &exe_dir.join("_up_"));
        }
    }
    if let Ok(res_dir) = app.path().resource_dir() {
        push_sidecar_variants(&mut candidates, &res_dir);
        push_sidecar_variants(&mut candidates, &res_dir.join("_up_"));
    }

    // 2. Development path relative to src-tauri/
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(repo_root) = manifest_dir.parent() {
        push_sidecar_variants(&mut candidates, repo_root);
    }

    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn spawn_sidecar(
    app: &tauri::App,
    port_store: Arc<AtomicU16>,
    control_token: &str,
) -> Result<Child, String> {
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

    // Enforce parent PID lifecycle watchdog and Rust-owned control plane auth token
    cmd.env("MCP_SWITCHBOARD_PARENT_PID", std::process::id().to_string());
    cmd.env("MCP_SWITCHBOARD_CONTROL_TOKEN", control_token);

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
    let control_token = generate_control_token();
    let spawn_token = control_token.clone();

    let sidecar_state = SidecarState {
        child: Mutex::new(None),
        port: Arc::clone(&port_store),
        token: control_token,
        error: Mutex::new(None),
    };

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(sidecar_state)
        .invoke_handler(tauri::generate_handler![
            get_sidecar_port,
            get_sidecar_token,
            get_sidecar_error
        ])
        .setup(move |app| {
            let state = app.state::<SidecarState>();
            match spawn_sidecar(app, Arc::clone(&port_store), &spawn_token) {
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
