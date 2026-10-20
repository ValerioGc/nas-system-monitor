//! System telemetry read from `/proc` and `/sys` on a blocking task.

pub mod gpu;
mod policy;
pub mod sensors;

use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    fs,
    os::unix::fs::MetadataExt,
    path::Path,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

pub const SHARED_FOR: Duration = Duration::from_secs(1);

#[derive(Clone, Default)]
pub struct ProcessState {
    pub previous: Arc<Mutex<Sample>>,
    latest: Arc<Mutex<Option<(Instant, Telemetry)>>>,
}

pub async fn shared(state: &ProcessState) -> Option<Telemetry> {
    let mut previous = state.previous.lock().await;
    if let Some((at, reading)) = &*state.latest.lock().await {
        if at.elapsed() < SHARED_FOR {
            return Some(reading.clone());
        }
    }
    let reading = read(&mut previous).await?;
    *state.latest.lock().await = Some((Instant::now(), reading.clone()));
    Some(reading)
}

#[derive(Default)]
pub struct Sample {
    busy: u64,
    total: u64,
    processes: HashMap<u32, u64>,
    at: Option<Instant>,
    gpu: HashMap<u32, u64>,
    counters: HashMap<String, u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    User,
    Nas,
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Running,
    Sleeping,
    Waiting,
    Stopped,
    Zombie,
    Idle,
}

impl State {
    pub fn of(letter: &str) -> Self {
        match letter {
            "R" => Self::Running,
            "D" => Self::Waiting,
            "T" | "t" => Self::Stopped,
            "Z" | "X" => Self::Zombie,
            "I" => Self::Idle,
            _ => Self::Sleeping,
        }
    }
}

const FIRST_PERSON: u32 = 1000;
const NOBODY: u32 = 65534;

pub fn kind_of(seen: &Seen, unit: Option<&str>) -> Kind {
    if seen.kernel {
        Kind::System
    } else if unit.is_some_and(|unit| unit.starts_with("nas-")) {
        Kind::Nas
    } else if (FIRST_PERSON..NOBODY).contains(&seen.owner) {
        Kind::User
    } else {
        Kind::System
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metrics {
    pub cpu: f64,
    pub cores: usize,
    pub physical_cores: Option<usize>,
    pub temperature: Option<f64>,
    pub ram: f64,
    pub ram_total: f64,
    pub swap: f64,
    pub swap_total: f64,
    pub load: f64,
    pub uptime: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Process {
    pub id: u32,
    pub name: String,
    pub process: String,
    pub ram: f64,
    pub cpu: f64,
    pub gpu: Option<f64>,
    pub state: State,
    pub kind: Kind,
    pub started: u64,
    pub unit: Option<String>,
    pub can_terminate: bool,
    pub can_restart: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct Telemetry {
    pub metrics: Metrics,
    pub processes: Vec<Process>,
    pub sensors: Vec<sensors::Sensor>,
}

pub async fn read(previous: &mut Sample) -> Option<Telemetry> {
    let mut sample = std::mem::take(previous);
    let (sample, telemetry) = tokio::task::spawn_blocking(move || {
        let telemetry = collect().map(|taken| compare(&mut sample, taken));
        (sample, telemetry)
    })
    .await
    .ok()?;
    *previous = sample;
    telemetry
}

struct Reading {
    busy: u64,
    total: u64,
    cores: usize,
    physical_cores: Option<usize>,
    temperature: Option<f64>,
    ram: f64,
    ram_total: f64,
    swap: f64,
    swap_total: f64,
    load: f64,
    uptime: u64,
    processes: Vec<Seen>,
    sensors: sensors::Raw,
}

pub struct Seen {
    pub id: u32,
    pub name: String,
    pub ticks: u64,
    pub resident: u64,
    pub started: u64,
    pub kernel: bool,
    pub state: State,
    pub owner: u32,
    pub gpu: Option<u64>,
}

fn collect() -> Option<Reading> {
    let (busy, total, cores, physical_cores) = processor()?;
    let memory = memory();
    let temperature = temperature();
    Some(Reading {
        busy,
        total,
        cores,
        physical_cores,
        temperature,
        ram: memory.0,
        ram_total: memory.1,
        swap: memory.2,
        swap_total: memory.3,
        load: load(),
        uptime: uptime(),
        processes: processes(),
        sensors: sensors::read(temperature),
    })
}

fn compare(previous: &mut Sample, taken: Reading) -> Telemetry {
    let elapsed = taken.total.saturating_sub(previous.total);
    let busy = taken.busy.saturating_sub(previous.busy);
    let cpu = share(busy, elapsed);
    let now = Instant::now();
    let seconds = previous
        .at
        .map(|at| now.duration_since(at).as_secs_f64())
        .unwrap_or_default();

    let mut processes: Vec<Process> = taken
        .processes
        .iter()
        .map(|seen| {
            let before = previous
                .processes
                .get(&seen.id)
                .copied()
                .unwrap_or(seen.ticks);
            let unit = policy::unit_of(seen.id);
            let allowed = policy::allowed(seen, unit.as_deref());
            let gpu = seen.gpu.map(|used| {
                let before = previous.gpu.get(&seen.id).copied().unwrap_or(used);
                gpu::share(used.saturating_sub(before), seconds)
            });
            Process {
                id: seen.id,
                name: seen.name.clone(),
                process: command_line(seen.id).unwrap_or_else(|| seen.name.clone()),
                ram: round((seen.resident as f64) / 1024.0),
                cpu: share(seen.ticks.saturating_sub(before), elapsed),
                gpu,
                state: seen.state,
                kind: kind_of(seen, unit.as_deref()),
                started: seen.started,
                unit,
                can_terminate: allowed.terminate,
                can_restart: allowed.restart,
            }
        })
        .collect();

    processes.sort_by(|left, right| {
        right
            .cpu
            .total_cmp(&left.cpu)
            .then(right.ram.total_cmp(&left.ram))
    });

    let ram_share = if taken.ram_total > 0.0 {
        round(taken.ram * 100.0 / taken.ram_total)
    } else {
        0.0
    };
    let sensors = taken.sensors.measure(
        &previous.counters,
        seconds,
        sensors::Totals {
            cpu,
            ram: ram_share,
            gpu: processes.iter().filter_map(|process| process.gpu).sum(),
        },
    );

    *previous = Sample {
        busy: taken.busy,
        total: taken.total,
        gpu: taken
            .processes
            .iter()
            .filter_map(|seen| Some((seen.id, seen.gpu?)))
            .collect(),
        processes: taken
            .processes
            .into_iter()
            .map(|seen| (seen.id, seen.ticks))
            .collect(),
        at: Some(now),
        counters: taken.sensors.counters(),
    };

    Telemetry {
        metrics: Metrics {
            cpu,
            cores: taken.cores,
            physical_cores: taken.physical_cores,
            temperature: taken.temperature,
            ram: taken.ram,
            ram_total: taken.ram_total,
            swap: taken.swap,
            swap_total: taken.swap_total,
            load: taken.load,
            uptime: taken.uptime,
        },
        processes,
        sensors,
    }
}

fn share(part: u64, whole: u64) -> f64 {
    if whole == 0 {
        return 0.0;
    }
    round(part as f64 * 100.0 / whole as f64)
}

pub fn round(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn processor() -> Option<(u64, u64, usize, Option<usize>)> {
    let text = fs::read_to_string("/proc/stat").ok()?;
    let mut threads = Vec::new();
    let mut totals = None;
    for line in text.lines() {
        if line.starts_with("cpu ") {
            let numbers: Vec<u64> = line
                .split_whitespace()
                .skip(1)
                .filter_map(|field| field.parse().ok())
                .collect();
            let total: u64 = numbers.iter().sum();
            let idle: u64 = numbers.iter().skip(3).take(2).sum();
            totals = Some((total.saturating_sub(idle), total));
        } else if line.starts_with("cpu") {
            if let Some(name) = line.split_whitespace().next() {
                threads.push(name);
            }
        }
    }
    let (busy, total) = totals?;
    let physical_cores = physical_cores(Path::new("/sys/devices/system/cpu"), &threads);
    Some((busy, total, threads.len().max(1), physical_cores))
}

fn physical_cores(root: &Path, threads: &[&str]) -> Option<usize> {
    let mut cores = HashSet::new();
    for thread in threads {
        let topology = root.join(thread).join("topology");
        let package: u32 = read_trimmed(&topology.join("physical_package_id"))?
            .parse()
            .ok()?;
        let core: u32 = read_trimmed(&topology.join("core_id"))?.parse().ok()?;
        cores.insert((package, core));
    }
    (!cores.is_empty()).then_some(cores.len())
}

fn memory() -> (f64, f64, f64, f64) {
    let Ok(text) = fs::read_to_string("/proc/meminfo") else {
        return (0.0, 0.0, 0.0, 0.0);
    };
    let field = |name: &str| -> f64 {
        text.lines()
            .find_map(|line| {
                line.strip_prefix(name)?
                    .split_whitespace()
                    .next()?
                    .parse()
                    .ok()
            })
            .map(|kibibytes: f64| kibibytes / 1024.0 / 1024.0)
            .unwrap_or_default()
    };

    let total = field("MemTotal:");
    let used = total - field("MemAvailable:");
    let swap_total = field("SwapTotal:");
    let swap_used = swap_total - field("SwapFree:");
    (
        round(used.max(0.0)),
        round(total),
        round(swap_used.max(0.0)),
        round(swap_total),
    )
}

fn load() -> f64 {
    fs::read_to_string("/proc/loadavg")
        .ok()
        .and_then(|text| text.split_whitespace().next()?.parse().ok())
        .unwrap_or_default()
}

fn uptime() -> u64 {
    fs::read_to_string("/proc/uptime")
        .ok()
        .and_then(|text| text.split_whitespace().next()?.parse::<f64>().ok())
        .unwrap_or_default() as u64
}

fn temperature() -> Option<f64> {
    let wanted = [
        "x86_pkg_temp",
        "cpu-thermal",
        "coretemp",
        "soc_thermal",
        "acpitz",
    ];

    let zones = fs::read_dir("/sys/class/thermal").ok()?;
    let mut best: Option<(usize, f64)> = None;
    for zone in zones.flatten() {
        let path = zone.path();
        if !path.file_name()?.to_str()?.starts_with("thermal_zone") {
            continue;
        }
        let Some(kind) = read_trimmed(&path.join("type")) else {
            continue;
        };
        let Some(degrees) = millidegrees(&path.join("temp")) else {
            continue;
        };

        let rank = wanted.iter().position(|name| kind.contains(name));
        match (rank, &best) {
            (Some(rank), Some((current, _))) if rank < *current => best = Some((rank, degrees)),
            (Some(rank), None) => best = Some((rank, degrees)),
            (None, None) => best = Some((wanted.len(), degrees)),
            _ => {}
        }
    }
    if let Some((_, degrees)) = best {
        return Some(degrees);
    }

    fs::read_dir("/sys/class/hwmon")
        .ok()?
        .flatten()
        .find_map(|sensor| millidegrees(&sensor.path().join("temp1_input")))
}

pub fn millidegrees(path: &Path) -> Option<f64> {
    let value: f64 = read_trimmed(path)?.parse().ok()?;
    (1000.0..=150_000.0)
        .contains(&value)
        .then(|| round(value / 1000.0))
}

pub fn read_trimmed(path: &Path) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .map(|text| text.trim().to_owned())
}

fn processes() -> Vec<Seen> {
    let page = page_kibibytes();
    let Ok(entries) = fs::read_dir("/proc") else {
        return Vec::new();
    };

    entries
        .flatten()
        .filter_map(|entry| {
            let id: u32 = entry.file_name().to_str()?.parse().ok()?;
            let mut found = seen(
                id,
                &fs::read_to_string(entry.path().join("stat")).ok()?,
                page,
            )?;
            found.owner = entry.metadata().map(|data| data.uid()).unwrap_or_default();
            if !found.kernel {
                found.gpu = gpu::used(&entry.path());
            }
            Some(found)
        })
        .collect()
}

pub fn seen(id: u32, stat: &str, page: u64) -> Option<Seen> {
    let (name, fields) = split_stat(stat)?;
    let number = |index: usize| fields.get(index)?.parse::<u64>().ok();
    let parent = number(1)?;
    Some(Seen {
        id,
        name,
        ticks: number(11)? + number(12)?,
        resident: number(21)? * page,
        started: number(19)?,
        kernel: id == 2 || parent == 2,
        state: State::of(fields.first()?),
        owner: 0,
        gpu: None,
    })
}

/// Splits `/proc/<pid>/stat` at the last `)`, since the command name may contain parentheses.
fn split_stat(line: &str) -> Option<(String, Vec<&str>)> {
    let open = line.find('(')?;
    let close = line.rfind(')')?;
    let name = line.get(open + 1..close)?.to_owned();
    Some((name, line.get(close + 1..)?.split_whitespace().collect()))
}

fn page_kibibytes() -> u64 {
    let pages: u64 = fs::read_to_string("/proc/self/statm")
        .ok()
        .and_then(|text| text.split_whitespace().nth(1)?.parse().ok())
        .unwrap_or(0);
    let kibibytes: u64 = fs::read_to_string("/proc/self/status")
        .ok()
        .and_then(|text| {
            text.lines().find_map(|line| {
                line.strip_prefix("VmRSS:")?
                    .split_whitespace()
                    .next()?
                    .parse()
                    .ok()
            })
        })
        .unwrap_or(0);
    if pages == 0 || kibibytes == 0 {
        return 4;
    }
    (kibibytes / pages).max(1)
}

fn command_line(id: u32) -> Option<String> {
    let raw = fs::read(format!("/proc/{id}/cmdline")).ok()?;
    let text = String::from_utf8_lossy(&raw)
        .replace('\0', " ")
        .trim()
        .to_owned();
    (!text.is_empty()).then(|| {
        if text.chars().count() > 120 {
            text.chars().take(120).collect::<String>() + "…"
        } else {
            text
        }
    })
}

#[cfg(test)]
#[path = "../tests/unit/axum/telemetry.rs"]
mod tests;
