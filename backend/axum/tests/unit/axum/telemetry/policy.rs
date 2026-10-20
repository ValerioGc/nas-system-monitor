use super::*;

fn process(id: u32, kernel: bool) -> Seen {
    Seen {
        id,
        name: "worker".to_owned(),
        ticks: 0,
        resident: 0,
        started: 900,
        kernel,
        state: crate::telemetry::State::Sleeping,
        owner: 0,
        gpu: None,
    }
}

#[test]
fn the_unit_is_the_first_service_or_scope_of_the_cgroup() {
    assert_eq!(
        unit_in("0::/system.slice/nas-app@nas-file-manager.service/worker\n").as_deref(),
        Some("nas-app@nas-file-manager.service")
    );
    assert_eq!(
        unit_in("0::/user.slice/user-1000.slice/session-3.scope\n").as_deref(),
        Some("session-3.scope")
    );
    assert_eq!(unit_in("0::/\n"), None);
    assert_eq!(unit_in(""), None);
}

#[test]
fn what_keeps_the_nas_working_is_only_restarted() {
    let worker = process(400, false);
    let essential = allowed(&worker, Some("systemd-journald.service"));
    assert!(!essential.terminate);
    assert!(essential.restart);

    let ordinary = allowed(&worker, Some("cron.service"));
    assert!(ordinary.terminate && ordinary.restart);

    let session = allowed(&worker, Some("session-3.scope"));
    assert!(session.terminate);
    assert!(!session.restart);

    let helper = allowed(&worker, Some("nas-os-process@restart-1-2.service"));
    assert!(!helper.restart);
}

#[test]
fn the_kernel_and_the_first_process_are_left_alone() {
    let none = Allowed {
        terminate: false,
        restart: false,
    };
    assert_eq!(allowed(&process(50, true), None), none);
    assert_eq!(allowed(&process(1, false), Some("init.scope")), none);
}

#[test]
fn a_pattern_stands_for_any_text_in_the_middle_only() {
    assert!(is_essential("systemd-logind.service"));
    assert!(is_essential("nas-os.service"));
    assert!(!is_essential("systemd-.scope"));
    assert!(!is_essential("nas-os-gateway.socket"));
    assert!(!is_essential("cron.service"));
}
