//! Hardware sensors for CPU, GPU, RAM and disks, read from `/sys` and, when present, `nvidia-smi`.
//!
//! Cumulative counters become rates between two readings and report zero on the first one.

use super::{millidegrees, read_trimmed, round};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Group {
    Cpu,
    Gpu,
    Ram,
    Disk,
}

/// Unit of a sensor value, in degrees Celsius, percent or watts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Metric {
    Temperature,
    Usage,
    Power,
    Tdp,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sensor {
    pub id: String,
    pub group: Group,
    /// Hardware component, such as `coretemp`, `GPU 0 (amdgpu)` or `sda`.
    pub device: String,
    /// Label as reported by the driver.
    pub label: String,
    pub metric: Metric,
    pub value: f64,
}

/// Cumulative counter turned into a rate of `scale` per unit per second, capped at `limit`.
struct Counter {
    sensor: Sensor,
    total: u64,
    scale: f64,
    limit: f64,
    idle: bool,
}

/// Result of one `/sys` scan, with instant values and pending counters.
#[derive(Default)]
pub struct Raw {
    ready: Vec<Sensor>,
    counters: Vec<Counter>,
    pub(super) graphics: bool,
}

/// Usage values computed elsewhere in the reading, exposed as sensors.
pub struct Totals {
    pub cpu: f64,
    pub ram: f64,
    pub gpu: f64,
}

const MICRO: f64 = 1e-6;
const BUSY_MS: f64 = 0.1;
const POWER_LIMIT: f64 = 2000.0;

const CPU_SENSORS: [&str; 5] = [
    "coretemp",
    "k10temp",
    "zenpower",
    "cpu_thermal",
    "cpu-thermal",
];
const RAM_SENSORS: [&str; 2] = ["jc42", "spd5118"];
const DISK_PREFIXES: [&str; 2] = ["sd", "nvme"];

pub(super) fn sensor(
    id: String,
    group: Group,
    device: &str,
    label: &str,
    metric: Metric,
    value: f64,
) -> Sensor {
    Sensor {
        id,
        group,
        device: device.to_owned(),
        label: label.to_owned(),
        metric,
        value,
    }
}

impl Raw {
    fn add(&mut self, found: Sensor) {
        self.ready.push(found);
    }

    fn count(&mut self, sensor: Sensor, total: u64, scale: f64, limit: f64) {
        self.counters.push(Counter {
            sensor,
            total,
            scale,
            limit,
            idle: false,
        });
    }

    pub(super) fn count_idle(&mut self, sensor: Sensor, total: u64) {
        self.counters.push(Counter {
            sensor,
            total,
            scale: BUSY_MS,
            limit: 100.0,
            idle: true,
        });
    }

    /// Returns every sensor, with counter rates measured against the reading `seconds` ago.
    pub fn measure(
        &self,
        before: &HashMap<String, u64>,
        seconds: f64,
        totals: Totals,
    ) -> Vec<Sensor> {
        let mut found = vec![
            sensor(
                "cpu-usage".into(),
                Group::Cpu,
                "CPU",
                "usage",
                Metric::Usage,
                totals.cpu,
            ),
            sensor(
                "ram-usage".into(),
                Group::Ram,
                "RAM",
                "usage",
                Metric::Usage,
                totals.ram,
            ),
        ];
        found.extend(self.ready.iter().cloned());
        found.extend(self.counters.iter().map(|counter| {
            let value = match before.get(&counter.sensor.id) {
                Some(earlier) if seconds > 0.0 => {
                    let measured = rate(
                        counter.total.saturating_sub(*earlier),
                        seconds,
                        counter.scale,
                        counter.limit,
                    );
                    if counter.idle {
                        round(counter.limit - measured)
                    } else {
                        measured
                    }
                }
                _ => 0.0,
            };
            Sensor {
                value,
                ..counter.sensor.clone()
            }
        }));

        let card_usage = found
            .iter()
            .any(|item| item.group == Group::Gpu && item.metric == Metric::Usage);
        if self.graphics && !card_usage {
            found.push(sensor(
                "gpu-usage".into(),
                Group::Gpu,
                "GPU",
                "processes",
                Metric::Usage,
                round(totals.gpu.min(100.0)),
            ));
        }
        found
    }

    /// Current counter totals, kept for the next reading.
    pub fn counters(&self) -> HashMap<String, u64> {
        self.counters
            .iter()
            .map(|counter| (counter.sensor.id.clone(), counter.total))
            .collect()
    }
}

/// Rate of a counter that grew by `grown` over `seconds`, scaled and capped at `limit`.
pub fn rate(grown: u64, seconds: f64, scale: f64, limit: f64) -> f64 {
    if seconds <= 0.0 {
        return 0.0;
    }
    round((grown as f64 / seconds * scale).min(limit))
}

/// Reads every sensor. `zone` is the thermal zone temperature, used when `hwmon` has no CPU
/// sensor.
pub fn read(zone: Option<f64>) -> Raw {
    let mut raw = Raw::default();
    hwmon(&mut raw);
    if zone.is_some() && !raw.ready.iter().any(|found| found.group == Group::Cpu) {
        raw.add(sensor(
            "cpu-temp-zone".into(),
            Group::Cpu,
            "CPU",
            "thermal zone",
            Metric::Temperature,
            zone.unwrap_or_default(),
        ));
    }
    rapl(&mut raw);
    graphics(&mut raw);
    nvidia(&mut raw);
    disks(&mut raw);
    raw
}

fn children(directory: &Path) -> Vec<PathBuf> {
    let mut found: Vec<PathBuf> = fs::read_dir(directory)
        .map(|entries| entries.flatten().map(|entry| entry.path()).collect())
        .unwrap_or_default();
    found.sort();
    found
}

fn number(path: &Path) -> Option<u64> {
    read_trimmed(path)?.parse().ok()
}

fn name_of(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_owned()
}

/// Label and degrees of each temperature input in a `hwmon` directory.
pub fn temperatures(directory: &Path) -> Vec<(String, f64)> {
    children(directory)
        .iter()
        .filter_map(|path| {
            let file = name_of(path);
            let index = file.strip_prefix("temp")?.strip_suffix("_input")?;
            let degrees = millidegrees(path)?;
            let label = read_trimmed(&directory.join(format!("temp{index}_label")))
                .unwrap_or_else(|| format!("temp{index}"));
            Some((label, degrees))
        })
        .collect()
}

fn add_temperatures(raw: &mut Raw, directory: &Path, group: Group, id: &str, device: &str) {
    for (index, (label, degrees)) in temperatures(directory).into_iter().enumerate() {
        raw.add(sensor(
            format!("{id}-temp-{index}"),
            group,
            device,
            &label,
            Metric::Temperature,
            degrees,
        ));
    }
}

/// CPU and RAM temperatures, matched by `hwmon` driver name.
fn hwmon(raw: &mut Raw) {
    for directory in children(Path::new("/sys/class/hwmon")) {
        let Some(name) = read_trimmed(&directory.join("name")) else {
            continue;
        };
        let id = format!("{name}-{}", name_of(&directory));
        if CPU_SENSORS.contains(&name.as_str()) {
            add_temperatures(raw, &directory, Group::Cpu, &format!("cpu-{id}"), &name);
        } else if RAM_SENSORS.contains(&name.as_str()) {
            add_temperatures(raw, &directory, Group::Ram, &format!("ram-{id}"), &name);
        }
    }
}

/// RAPL package power limit and energy. Recent kernels restrict `energy_uj` to root.
fn rapl(raw: &mut Raw) {
    for directory in children(Path::new("/sys/class/powercap")) {
        let zone = name_of(&directory);
        if !zone.starts_with("intel-rapl:") || zone.matches(':').count() != 1 {
            continue;
        }
        let device = read_trimmed(&directory.join("name")).unwrap_or_else(|| zone.clone());
        if let Some(limit) = number(&directory.join("constraint_0_power_limit_uw")) {
            raw.add(sensor(
                format!("cpu-{zone}-tdp"),
                Group::Cpu,
                &device,
                "power limit",
                Metric::Tdp,
                round(limit as f64 * MICRO),
            ));
        }
        if let Some(energy) = number(&directory.join("energy_uj")) {
            raw.count(
                sensor(
                    format!("cpu-{zone}-power"),
                    Group::Cpu,
                    &device,
                    "power",
                    Metric::Power,
                    0.0,
                ),
                energy,
                MICRO,
                POWER_LIMIT,
            );
        }
    }
}

/// The `hwmon` directories of a device, nested or flat.
fn hwmon_of(device: &Path) -> Vec<PathBuf> {
    let mut found = children(&device.join("hwmon"));
    found.extend(
        children(device)
            .into_iter()
            .filter(|path| name_of(path).starts_with("hwmon")),
    );
    found
}

fn watts(path: &Path) -> Option<f64> {
    number(path).map(|microwatts| round(microwatts as f64 * MICRO))
}

/// GPUs handled by kernel DRM drivers. NVIDIA proprietary cards are read by [`nvidia`].
fn graphics(raw: &mut Raw) {
    for card in children(Path::new("/sys/class/drm")) {
        let name = name_of(&card);
        let Some(index) = name.strip_prefix("card") else {
            continue;
        };
        if index.is_empty() || !index.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        let device = card.join("device");
        let driver = fs::read_link(device.join("driver"))
            .map(|link| name_of(&link))
            .unwrap_or_default();
        raw.graphics = true;
        if driver == "nvidia" {
            continue;
        }
        let part = format!("GPU {index} ({driver})");
        let id = format!("gpu{index}");
        if let Some(idle) = idle_ms(&card, &device) {
            raw.count_idle(
                sensor(
                    format!("{id}-usage"),
                    Group::Gpu,
                    &part,
                    "usage",
                    Metric::Usage,
                    0.0,
                ),
                idle,
            );
        }
        if let Some(busy) = number(&device.join("gpu_busy_percent")) {
            raw.add(sensor(
                format!("{id}-usage"),
                Group::Gpu,
                &part,
                "usage",
                Metric::Usage,
                busy as f64,
            ));
        }
        for directory in hwmon_of(&device) {
            add_graphics_hwmon(raw, &directory, &id, &part);
        }
    }
}

/// Temperature, power and power limit from a GPU `hwmon` directory.
fn add_graphics_hwmon(raw: &mut Raw, directory: &Path, id: &str, part: &str) {
    add_temperatures(raw, directory, Group::Gpu, id, part);
    let power =
        watts(&directory.join("power1_average")).or_else(|| watts(&directory.join("power1_input")));
    if let Some(power) = power {
        raw.add(sensor(
            format!("{id}-power"),
            Group::Gpu,
            part,
            "power",
            Metric::Power,
            power,
        ));
    } else if let Some(energy) = number(&directory.join("energy1_input")) {
        raw.count(
            sensor(
                format!("{id}-power"),
                Group::Gpu,
                part,
                "power",
                Metric::Power,
                0.0,
            ),
            energy,
            MICRO,
            POWER_LIMIT,
        );
    }
    let limit =
        watts(&directory.join("power1_cap")).or_else(|| watts(&directory.join("power1_max")));
    if let Some(limit) = limit {
        raw.add(sensor(
            format!("{id}-tdp"),
            Group::Gpu,
            part,
            "power limit",
            Metric::Tdp,
            limit,
        ));
    }
}

/// Intel GPU idle milliseconds, from RC6 residency (i915) or GT idle residency (xe). Both are
/// world-readable, unlike the per-client counters.
fn idle_ms(card: &Path, device: &Path) -> Option<u64> {
    number(&card.join("gt/gt0/rc6_residency_ms"))
        .or_else(|| number(&card.join("power/rc6_residency_ms")))
        .or_else(|| number(&device.join("tile0/gt0/gtidle/idle_residency_ms")))
}

/// Cards on the NVIDIA proprietary driver, read through `nvidia-smi`.
fn nvidia(raw: &mut Raw) {
    if !Path::new("/usr/bin/nvidia-smi").exists() {
        return;
    }
    let Ok(output) = Command::new("timeout")
        .args([
            "2",
            "nvidia-smi",
            "--query-gpu=index,name,utilization.gpu,temperature.gpu,power.draw,power.limit",
            "--format=csv,noheader,nounits",
        ])
        .output()
    else {
        return;
    };
    for found in nvidia_sensors(&String::from_utf8_lossy(&output.stdout)) {
        raw.add(found);
    }
}

/// Parses the CSV output of `nvidia-smi`, skipping unavailable values such as `[N/A]`.
pub fn nvidia_sensors(text: &str) -> Vec<Sensor> {
    let mut found = Vec::new();
    for line in text.lines() {
        let fields: Vec<&str> = line.split(',').map(str::trim).collect();
        let [index, name, usage, temperature, power, limit] = fields[..] else {
            continue;
        };
        let part = format!("GPU {index} ({name})");
        let id = format!("nvidia{index}");
        for (suffix, label, metric, value) in [
            ("usage", "usage", Metric::Usage, usage),
            ("temp-0", "core", Metric::Temperature, temperature),
            ("power", "power", Metric::Power, power),
            ("tdp", "power limit", Metric::Tdp, limit),
        ] {
            if let Ok(value) = value.parse::<f64>() {
                found.push(sensor(
                    format!("{id}-{suffix}"),
                    Group::Gpu,
                    &part,
                    label,
                    metric,
                    round(value),
                ));
            }
        }
    }
    found
}

/// Disk activity from the I/O busy time, and temperature from `drivetemp` (SATA) or the NVMe
/// controller.
fn disks(raw: &mut Raw) {
    for disk in children(Path::new("/sys/block")) {
        let name = name_of(&disk);
        if number(&disk.join("size")) == Some(0) || !internal_disk(&disk) {
            continue;
        }
        let part = match read_trimmed(&disk.join("device/model")) {
            Some(model) if !model.is_empty() => format!("{name} ({model})"),
            _ => name.clone(),
        };
        let id = format!("disk-{name}");
        if let Some(busy) = read_trimmed(&disk.join("stat")).and_then(|stat| busy_ms(&stat)) {
            raw.count(
                sensor(
                    format!("{id}-usage"),
                    Group::Disk,
                    &part,
                    "activity",
                    Metric::Usage,
                    0.0,
                ),
                busy,
                BUSY_MS,
                100.0,
            );
        }
        let device = disk.join("device");
        let mut places = hwmon_of(&device);
        places.extend(hwmon_of(&device.join("device")));
        if let Some(directory) = places
            .into_iter()
            .find(|place| !temperatures(place).is_empty())
        {
            add_temperatures(raw, &directory, Group::Disk, &id, &part);
        }
    }
}

/// Native SATA or NVMe disk, excluding USB devices.
pub(super) fn internal_disk(disk: &Path) -> bool {
    DISK_PREFIXES
        .iter()
        .any(|prefix| name_of(disk).starts_with(prefix))
        && !external_disk(disk)
        && fs::canonicalize(disk).is_ok_and(|path| {
            path.components().any(|component| {
                component.as_os_str().to_str().is_some_and(|name| {
                    name == "nvme"
                        || name.strip_prefix("ata").is_some_and(|port| {
                            !port.is_empty() && port.chars().all(|c| c.is_ascii_digit())
                        })
                })
            })
        })
}

/// Removable or USB disk. USB disks may report `removable = 0`, so the sysfs path is checked too.
pub(super) fn external_disk(disk: &Path) -> bool {
    number(&disk.join("removable")) == Some(1)
        || fs::canonicalize(disk).is_ok_and(|path| {
            path.components().any(|component| {
                component
                    .as_os_str()
                    .to_str()
                    .is_some_and(|name| name.starts_with("usb"))
            })
        })
}

/// Milliseconds spent doing I/O, the tenth field of `/sys/block/<disk>/stat`.
pub fn busy_ms(stat: &str) -> Option<u64> {
    stat.split_whitespace().nth(9)?.parse().ok()
}
