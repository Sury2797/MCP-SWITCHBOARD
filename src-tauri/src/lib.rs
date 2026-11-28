use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::io::{BufRead, BufReader, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, AtomicU16, Ordering},
    Arc, Mutex,
};
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, State, WindowEvent,
};

fn send_control_post(port: u16, token: &str, path: &str) {
    if port < 8000 {
        return;
    }
    if let Ok(mut stream) = TcpStream::connect_timeout(
        &SocketAddr::from(([127, 0, 0, 1], port)),
        Duration::from_millis(450),
    ) {
        let _ = stream.set_write_timeout(Some(Duration::from_millis(450)));
        let _ = stream.set_read_timeout(Some(Duration::from_millis(450)));
        let req = format!(
            "POST {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nX-Switchboard-Token: {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        );
        if stream.write_all(req.as_bytes()).is_ok() {
            let _ = stream.flush();
            let mut ack = [0u8; 64];
            let _ = std::io::Read::read(&mut stream, &mut ack);
        }
    }
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn read_close_to_tray_setting(app: &tauri::App) -> bool {
    let Ok(dir) = app.path().app_data_dir() else {
        return true;
    };
    let cfg_path = dir.join("mcp-switchboard.json");
    let Ok(raw) = std::fs::read_to_string(cfg_path) else {
        return true;
    };
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return true;
    };
    parsed
        .get("settings")
        .and_then(|s| s.get("closeToTray"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

/// Runtime state for the managed Node.js sidecar process.
struct SidecarState {
    child: Mutex<Option<Child>>,
    port: Arc<AtomicU16>,
    token: String,
    error: Arc<Mutex<Option<String>>>,
    close_to_tray: AtomicBool,
    quitting: AtomicBool,
}

impl SidecarState {
    /// Gracefully ask the sidecar to shut down child MCP processes, then force-kill if needed.
    fn shutdown(&self) {
        let port = self.port.swap(0, Ordering::SeqCst);

        // 1. Trigger authenticated graceful HTTP shutdown so Node.js kills MCP children + cloudflared
        send_control_post(port, &self.token, "/api/shutdown");

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
                    use std::os::windows::process::CommandExt;
                    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
                    let _ = Command::new("taskkill")
                        .args(["/PID", &pid.to_string(), "/T", "/F"])
                        .creation_flags(CREATE_NO_WINDOW)
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

#[tauri::command]
fn prepare_for_update(state: State<'_, SidecarState>) {
    state.quitting.store(true, Ordering::SeqCst);
    state.shutdown();
}

#[tauri::command]
fn set_close_to_tray(enabled: bool, state: State<'_, SidecarState>) {
    state.close_to_tray.store(enabled, Ordering::SeqCst);
}

#[tauri::command]
fn relaunch_app(app: tauri::AppHandle, state: State<'_, SidecarState>) {
    state.quitting.store(true, Ordering::SeqCst);
    state.shutdown();
    app.restart();
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
            r"C:\nvm4w\nodejs\node.exe",
        ] {
            let p = PathBuf::from(candidate);
            if p.is_file() {
                return p;
            }
        }
        if let Ok(nvm_symlink) = std::env::var("NVM_SYMLINK") {
            let p = PathBuf::from(nvm_symlink).join("node.exe");
            if p.is_file() {
                return p;
            }
        }
        if let Ok(volta_home) = std::env::var("VOLTA_HOME") {
            let p = PathBuf::from(volta_home).join("node.exe");
            if p.is_file() {
                return p;
            }
        }
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            for rel in [r"Programs\nodejs\node.exe", r"Volta\bin\node.exe"] {
                let p = PathBuf::from(&local_app_data).join(rel);
                if p.is_file() {
                    return p;
                }
            }
        }
        if let Ok(app_data) = std::env::var("APPDATA") {
            let p = PathBuf::from(app_data).join(r"npm\node.exe");
            if p.is_file() {
                return p;
            }
        }
        if let Ok(user_profile) = std::env::var("USERPROFILE") {
            let p = PathBuf::from(user_profile).join(r"scoop\shims\node.exe");
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
        if let Ok(home) = std::env::var("HOME") {
            for rel in [
                ".volta/bin/node",
                ".local/share/fnm/aliases/default/bin/node",
            ] {
                let p = PathBuf::from(&home).join(rel);
                if p.is_file() {
                    return p;
                }
            }
            let nvm_dir = PathBuf::from(&home).join(".nvm/versions/node");
            if let Ok(entries) = std::fs::read_dir(nvm_dir) {
                let mut versions: Vec<PathBuf> = entries
                    .filter_map(Result::ok)
                    .map(|e| e.path().join("bin/node"))
                    .filter(|p| p.is_file())
                    .collect();
                versions.sort();
                if let Some(latest) = versions.pop() {
                    return latest;
                }
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
    error_store: Arc<Mutex<Option<String>>>,
    control_token: &str,
) -> Result<Child, String> {
    let script = resolve_sidecar_script(app)
        .ok_or_else(|| "Bundled MCP Switchboard sidecar script was not found.".to_string())?;
    let node_bin = resolve_node_binary();

    let data_dir = app.path().app_data_dir().ok();
    if let Some(ref dir) = data_dir {
        let _ = std::fs::create_dir_all(dir);
    }
    // Keep CWD outside the install folder so Windows NSIS updates never hit directory handle locks
    let work_dir = data_dir.clone().unwrap_or_else(std::env::temp_dir);

    let mut cmd = Command::new(&node_bin);
    cmd.arg(&script)
        .current_dir(&work_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Enforce parent PID lifecycle watchdog and Rust-owned control plane auth token
    cmd.env("MCP_SWITCHBOARD_PARENT_PID", std::process::id().to_string());
    cmd.env("MCP_SWITCHBOARD_CONTROL_TOKEN", control_token);

    if let Some(dir) = data_dir {
        cmd.env("MCP_SWITCHBOARD_DATA_DIR", dir);
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

    let last_stderr = Arc::new(Mutex::new(None::<String>));
    if let Some(stderr) = child.stderr.take() {
        let last_stderr_ref = Arc::clone(&last_stderr);
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                eprintln!("{line}");
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    if let Ok(mut guard) = last_stderr_ref.lock() {
                        *guard = Some(trimmed.to_string());
                    }
                }
            }
        });
    }

    if let Some(stdout) = child.stdout.take() {
        let err_store_ref = Arc::clone(&error_store);
        let last_stderr_ref = Arc::clone(&last_stderr);
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            let mut reported_port = false;
            for line in reader.lines().map_while(Result::ok) {
                if let Some(raw_port) = line.strip_prefix("SWITCHBOARD_READY_PORT=") {
                    if let Ok(parsed) = raw_port.trim().parse::<u16>() {
                        port_store.store(parsed, Ordering::SeqCst);
                        reported_port = true;
                    }
                }
            }
            // If stdout closed before reporting a port, surface the sidecar crash immediately to UI.
            if !reported_port {
                std::thread::sleep(Duration::from_millis(50));
                let detail = last_stderr_ref
                    .lock()
                    .ok()
                    .and_then(|g| g.clone())
                    .unwrap_or_else(|| "Sidecar exited before reporting readiness.".to_string());
                if let Ok(mut err_guard) = err_store_ref.lock() {
                    if err_guard.is_none() {
                        *err_guard =
                            Some(format!("MCP Switchboard sidecar failed to start: {detail}"));
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
    let error_store = Arc::new(Mutex::new(None));
    let control_token = generate_control_token();
    let spawn_token = control_token.clone();

    let sidecar_state = SidecarState {
        child: Mutex::new(None),
        port: Arc::clone(&port_store),
        token: control_token,
        error: Arc::clone(&error_store),
        close_to_tray: AtomicBool::new(true),
        quitting: AtomicBool::new(false),
    };

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(sidecar_state)
        .invoke_handler(tauri::generate_handler![
            get_sidecar_port,
            get_sidecar_token,
            get_sidecar_error,
            prepare_for_update,
            set_close_to_tray,
            relaunch_app
        ])
        .setup(move |app| {
            let state = app.state::<SidecarState>();
            state
                .close_to_tray
                .store(read_close_to_tray_setting(app), Ordering::SeqCst);

            match spawn_sidecar(
                app,
                Arc::clone(&port_store),
                Arc::clone(&error_store),
                &spawn_token,
            ) {
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

            let open_item =
                MenuItem::with_id(app, "open", "Open MCP Switchboard", true, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let tunnel_start = MenuItem::with_id(
                app,
                "tunnel_start",
                "Start HTTPS Tunnel",
                true,
                None::<&str>,
            )?;
            let tunnel_stop =
                MenuItem::with_id(app, "tunnel_stop", "Stop HTTPS Tunnel", true, None::<&str>)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let quit_item =
                MenuItem::with_id(app, "quit", "Quit MCP Switchboard", true, None::<&str>)?;
            let tray_menu = Menu::with_items(
                app,
                &[
                    &open_item,
                    &sep1,
                    &tunnel_start,
                    &tunnel_stop,
                    &sep2,
                    &quit_item,
                ],
            )?;

            let mut tray_builder = TrayIconBuilder::with_id("main-tray")
                .tooltip("MCP Switchboard — Active in background")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app_handle, event| {
                    let state = app_handle.state::<SidecarState>();
                    match event.id().as_ref() {
                        "open" => show_main_window(app_handle),
                        "tunnel_start" | "tunnel_stop" => {
                            let port = state.port.load(Ordering::SeqCst);
                            let token = state.token.clone();
                            let path = if event.id().as_ref() == "tunnel_start" {
                                "/api/tunnel/start"
                            } else {
                                "/api/tunnel/stop"
                            };
                            std::thread::spawn(move || {
                                send_control_post(port, &token, path);
                            });
                        }
                        "quit" => {
                            state.quitting.store(true, Ordering::SeqCst);
                            state.shutdown();
                            app_handle.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });

            #[cfg(target_os = "macos")]
            {
                if let Ok(tray_icon) =
                    tauri::image::Image::from_bytes(include_bytes!("../icons/tray-template.png"))
                {
                    tray_builder = tray_builder.icon(tray_icon).icon_as_template(true);
                } else if let Some(icon) = app.default_window_icon().cloned() {
                    tray_builder = tray_builder.icon(icon).icon_as_template(true);
                }
            }
            #[cfg(not(target_os = "macos"))]
            if let Some(icon) = app.default_window_icon().cloned() {
                tray_builder = tray_builder.icon(icon);
            }
            let _tray = tray_builder.build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<SidecarState>();
                if !state.quitting.load(Ordering::SeqCst)
                    && state.close_to_tray.load(Ordering::SeqCst)
                {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    state.quitting.store(true, Ordering::SeqCst);
                    state.shutdown();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building MCP Switchboard Tauri application");

    app.run(|app_handle, event| match event {
        RunEvent::ExitRequested { api, .. } => {
            let state = app_handle.state::<SidecarState>();
            if !state.quitting.load(Ordering::SeqCst) && state.close_to_tray.load(Ordering::SeqCst)
            {
                api.prevent_exit();
            }
        }
        #[cfg(target_os = "macos")]
        RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } => {
            show_main_window(app_handle);
        }
        RunEvent::Exit => {
            let state = app_handle.state::<SidecarState>();
            state.shutdown();
        }
        _ => {}
    });
}
