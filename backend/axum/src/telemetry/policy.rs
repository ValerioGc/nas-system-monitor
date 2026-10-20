use super::Seen;
use std::fs;

pub const ESSENTIAL: [&str; 9] = [
    "init.scope",
    "nas-os.service",
    "nas-os-gateway.service",
    "dbus.service",
    "dbus-broker.service",
    "polkit.service",
    "systemd-*.service",
    "NetworkManager.service",
    "ssh.service",
];

const HELPER: &str = "nas-os-process@";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Allowed {
    pub terminate: bool,
    pub restart: bool,
}

fn matches(pattern: &str, unit: &str) -> bool {
    match pattern.split_once('*') {
        Some((head, tail)) => {
            unit.len() >= head.len() + tail.len() && unit.starts_with(head) && unit.ends_with(tail)
        }
        None => pattern == unit,
    }
}

pub fn is_essential(unit: &str) -> bool {
    ESSENTIAL.iter().any(|pattern| matches(pattern, unit))
}

pub fn unit_in(cgroup: &str) -> Option<String> {
    let path = cgroup.lines().find_map(|line| line.strip_prefix("0::"))?;
    path.split('/')
        .find(|part| part.ends_with(".service") || part.ends_with(".scope"))
        .map(str::to_owned)
}

pub fn unit_of(id: u32) -> Option<String> {
    unit_in(&fs::read_to_string(format!("/proc/{id}/cgroup")).ok()?)
}

/// Actions offered for a process. The launcher validates every request again.
pub fn allowed(seen: &Seen, unit: Option<&str>) -> Allowed {
    if seen.kernel || seen.id == 1 {
        return Allowed {
            terminate: false,
            restart: false,
        };
    }
    Allowed {
        terminate: !unit.is_some_and(is_essential),
        restart: unit.is_some_and(|unit| unit.ends_with(".service") && !unit.starts_with(HELPER)),
    }
}

#[cfg(test)]
#[path = "../../tests/unit/axum/telemetry/policy.rs"]
mod tests;
