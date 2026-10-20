use std::{collections::HashSet, fs, path::Path};

pub fn used(process: &Path) -> Option<u64> {
    let entries = fs::read_dir(process.join("fdinfo")).ok()?;
    let mut clients = HashSet::new();
    let mut total = None;
    for entry in entries.flatten() {
        let Ok(text) = fs::read_to_string(entry.path()) else {
            continue;
        };
        if let Some((id, busy)) = client(&text) {
            if clients.insert(id) {
                total = Some(total.unwrap_or(0) + busy);
            }
        }
    }
    total
}

pub fn client(fdinfo: &str) -> Option<(String, u64)> {
    let mut id = None;
    let mut busy = 0_u64;
    for line in fdinfo.lines() {
        if let Some(value) = line.strip_prefix("drm-client-id:") {
            id = Some(value.trim().to_owned());
        } else if let Some(engine) = line.strip_prefix("drm-engine-") {
            if engine.starts_with("capacity-") {
                continue;
            }
            busy += engine
                .split_once(':')
                .and_then(|(_, value)| value.trim().trim_end_matches("ns").trim().parse().ok())
                .unwrap_or(0_u64);
        }
    }
    Some((id?, busy))
}

pub fn share(nanoseconds: u64, seconds: f64) -> f64 {
    if seconds <= 0.0 {
        return 0.0;
    }
    super::round((nanoseconds as f64 / (seconds * 1e9) * 100.0).min(100.0))
}
