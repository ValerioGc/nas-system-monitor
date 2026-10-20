use super::{
    health, listen_path, prepare_socket, resolve_ui_dir, serve, shutdown, static_file, ui_dir,
    AppState,
};
use axum::{
    body::to_bytes,
    extract::State,
    http::{header, StatusCode, Uri},
    response::IntoResponse,
};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

static NEXT_TEMP: AtomicUsize = AtomicUsize::new(0);

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "nas-system-monitor-backend-test-{}-{}",
            std::process::id(),
            NEXT_TEMP.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[tokio::test]
async fn serves_health_and_static_files_and_blocks_api_fallback() {
    let health = health().await.into_response();
    assert_eq!(health.status(), StatusCode::OK);
    let body = to_bytes(health.into_body(), usize::MAX).await.unwrap();
    let payload: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(payload["status"], "ok");

    let dir = TestDir::new();
    fs::write(dir.0.join("index.html"), "nas-system-monitor").unwrap();
    let state = State(AppState {
        ui_dir: dir.0.clone(),
        monitor: super::telemetry::ProcessState::default(),
    });
    let response = static_file(state.clone(), Uri::from_static("/")).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()[header::CACHE_CONTROL], "no-cache");
    fs::create_dir_all(dir.0.join("assets")).unwrap();
    fs::write(dir.0.join("assets/index-abc.js"), "script").unwrap();
    let asset = static_file(state.clone(), Uri::from_static("/assets/index-abc.js")).await;
    assert_eq!(
        asset.headers()[header::CACHE_CONTROL],
        "public, max-age=31536000, immutable"
    );
    assert_eq!(
        response.headers()[header::CONTENT_TYPE],
        "text/html; charset=utf-8"
    );
    assert_eq!(
        to_bytes(response.into_body(), usize::MAX).await.unwrap(),
        "nas-system-monitor"
    );

    let api = static_file(state.clone(), Uri::from_static("/api/rules")).await;
    assert_eq!(api.status(), StatusCode::NOT_FOUND);
    let traversal = static_file(state.clone(), Uri::from_static("/../secret")).await;
    assert_eq!(traversal.status(), StatusCode::BAD_REQUEST);
    let missing = static_file(state, Uri::from_static("/missing.bin")).await;
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn static_file_uses_content_types_for_supported_extensions() {
    let dir = TestDir::new();
    let state = State(AppState {
        ui_dir: dir.0.clone(),
        monitor: super::telemetry::ProcessState::default(),
    });
    let cases = [
        ("app.js", "text/javascript; charset=utf-8"),
        ("app.css", "text/css; charset=utf-8"),
        ("icon.svg", "image/svg+xml"),
        ("image.png", "image/png"),
        ("image.webp", "image/webp"),
        ("favicon.ico", "image/x-icon"),
        ("font.woff2", "font/woff2"),
        ("unknown.dat", "application/octet-stream"),
    ];

    for (name, expected) in cases {
        fs::write(dir.0.join(name), "asset").unwrap();
        let uri: Uri = format!("/{name}").parse().unwrap();
        let response = static_file(state.clone(), uri).await;
        assert_eq!(response.status(), StatusCode::OK, "{name}");
        assert_eq!(response.headers()[header::CONTENT_TYPE], expected, "{name}");
    }
}

#[test]
fn selects_configured_packaged_and_development_ui_directories() {
    let dir = TestDir::new();
    let executable = dir.0.join("bin/nas-system-monitor");
    let packaged = dir.0.join("dist");
    let configured = dir.0.join("custom-ui");

    assert_eq!(
        resolve_ui_dir(None, || Ok(executable.clone())).unwrap(),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../dist/axum")
    );

    fs::create_dir_all(&packaged).unwrap();
    fs::write(packaged.join("index.html"), "Packaged UI").unwrap();
    assert_eq!(resolve_ui_dir(None, || Ok(executable)).unwrap(), packaged);
    assert_eq!(
        resolve_ui_dir(Some(configured.clone()), || panic!(
            "configured path takes precedence"
        ))
        .unwrap(),
        configured
    );
    assert_eq!(
        resolve_ui_dir(None, || Err("executable unavailable".to_owned())).unwrap_err(),
        "executable unavailable"
    );
}

#[tokio::test]
async fn checks_socket_paths_before_binding() {
    let dir = TestDir::new();
    let missing = dir.0.join("missing.sock");
    prepare_socket(&missing).await.unwrap();

    let occupied = dir.0.join("occupied.sock");
    fs::write(&occupied, "not a socket").unwrap();
    assert!(prepare_socket(&occupied)
        .await
        .unwrap_err()
        .contains("occupied"));
}

#[test]
fn parses_socket_arguments_and_environment_defaults() {
    let explicit = listen_path(
        ["--listen".into(), "/tmp/nas-system-monitor.sock".into()],
        None,
    )
    .unwrap();
    assert_eq!(explicit, PathBuf::from("/tmp/nas-system-monitor.sock"));

    let from_environment = listen_path([], Some("/tmp/from-env.sock".into())).unwrap();
    assert_eq!(from_environment, PathBuf::from("/tmp/from-env.sock"));
    assert!(listen_path([], None).unwrap_err().contains("Provide"));
    assert!(listen_path(["--listen".into()], None)
        .unwrap_err()
        .contains("requires a socket path"));
    assert!(listen_path(["--unknown".into()], None)
        .unwrap_err()
        .contains("Unrecognized argument"));
    assert!(listen_path(["--listen".into(), "".into()], None)
        .unwrap_err()
        .contains("Empty socket path"));
}

#[tokio::test]
async fn takes_over_a_stale_socket_and_refuses_one_still_listening() {
    let dir = TestDir::new();
    let stale = dir.0.join("stale.sock");
    drop(tokio::net::UnixListener::bind(&stale).unwrap());
    for _ in 0..200 {
        if std::os::unix::net::UnixStream::connect(&stale)
            .is_err_and(|error| error.kind() == std::io::ErrorKind::ConnectionRefused)
        {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    prepare_socket(&stale).await.unwrap();
    assert!(!stale.exists());

    let live = dir.0.join("live.sock");
    let _listening = tokio::net::UnixListener::bind(&live).unwrap();
    assert!(prepare_socket(&live)
        .await
        .unwrap_err()
        .contains("already listening"));
}

async fn ask(path: &std::path::Path, target: &str) -> String {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    for _ in 0..100 {
        if let Ok(mut stream) = tokio::net::UnixStream::connect(path).await {
            stream
                .write_all(
                    format!("GET {target} HTTP/1.1\r\nHost: nas\r\nConnection: close\r\n\r\n")
                        .as_bytes(),
                )
                .await
                .unwrap();
            let mut answer = String::new();
            stream.read_to_string(&mut answer).await.unwrap();
            return answer;
        }
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
    panic!("the socket never answered");
}

#[tokio::test]
async fn serves_on_the_socket_until_stopped_and_removes_it() {
    let dir = TestDir::new();
    fs::write(dir.0.join("index.html"), "nas-system-monitor").unwrap();
    let socket = dir.0.join("app.sock");
    let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
    let state = AppState {
        ui_dir: dir.0.clone(),
        monitor: super::telemetry::ProcessState::default(),
    };

    let client = async {
        let health = ask(&socket, "/health").await;
        let page = ask(&socket, "/").await;
        let telemetry = ask(&socket, "/api/telemetry").await;
        stop.send(()).unwrap();
        (health, page, telemetry)
    };
    let documents = super::documents::open(&dir.0.join("monitor.sqlite3"))
        .await
        .unwrap();
    let (served, (health, page, telemetry)) = tokio::join!(
        serve(&socket, state, documents, async {
            let _ = stopped.await;
        }),
        client
    );

    served.unwrap();
    assert!(health.starts_with("HTTP/1.1 200"));
    assert!(health.contains("\"status\":\"ok\""));
    assert!(page.ends_with("nas-system-monitor"));
    assert!(telemetry.starts_with("HTTP/1.1 200"));
    let payload: serde_json::Value =
        serde_json::from_str(telemetry.split_once("\r\n\r\n").unwrap().1).unwrap();
    assert!(payload["metrics"]["cores"].as_u64().unwrap() > 0);
    assert!(payload["metrics"]["ramTotal"].as_f64().unwrap() > 0.0);
    assert!(payload["processes"]
        .as_array()
        .unwrap()
        .iter()
        .any(|process| process["id"] == std::process::id()));
    assert!(payload["sensors"]
        .as_array()
        .unwrap()
        .iter()
        .any(|sensor| sensor["id"] == "cpu-usage"));
    assert!(!socket.exists());
}

#[tokio::test]
async fn unavailable_telemetry_has_a_typed_json_error() {
    let response = super::TelemetryError::Unavailable.into_response();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(payload["error"], "Processes unavailable");
}

#[tokio::test]
async fn refuses_to_serve_without_the_interface() {
    let dir = TestDir::new();
    let state = AppState {
        ui_dir: dir.0.join("missing"),
        monitor: super::telemetry::ProcessState::default(),
    };

    let documents = super::documents::open(&dir.0.join("monitor.sqlite3"))
        .await
        .unwrap();
    let refused = serve(&dir.0.join("app.sock"), state, documents, async {})
        .await
        .unwrap_err();

    assert!(refused.to_string().contains("Frontend not found"));
}

#[test]
fn finds_an_interface_directory_for_this_binary() {
    assert!(ui_dir().is_ok());
}

#[tokio::test]
async fn stops_on_sigterm() {
    let stop = shutdown();
    let sent = std::process::Command::new("kill")
        .args(["-TERM", &std::process::id().to_string()])
        .status()
        .unwrap();
    assert!(sent.success());

    tokio::time::timeout(std::time::Duration::from_secs(5), stop)
        .await
        .expect("the signal stops the server");
}
