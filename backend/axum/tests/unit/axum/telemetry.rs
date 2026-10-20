use super::*;

#[test]
fn a_command_with_spaces_and_parentheses_does_not_shift_the_fields() {
    let line =
        "42 (Web Content (odd)) S 1 42 42 0 -1 4194304 100 0 0 0 11 7 0 0 20 0 5 0 900 0 2048";
    let (name, fields) = split_stat(line).unwrap();

    assert_eq!(name, "Web Content (odd)");
    assert_eq!(fields[11], "11", "utime");
    assert_eq!(fields[12], "7", "stime");
    assert_eq!(fields[21], "2048", "resident pages");
}

#[test]
fn a_percentage_needs_two_readings_to_exist() {
    assert_eq!(share(50, 0), 0.0);
    assert_eq!(share(25, 100), 25.0);
    assert_eq!(share(1, 3), 33.3);
}

#[test]
fn a_sensor_reporting_nonsense_is_treated_as_absent() {
    let empty = std::env::temp_dir().join("nas-os-temp-probe");
    std::fs::write(&empty, "0\n").unwrap();
    assert_eq!(millidegrees(&empty), None);

    std::fs::write(&empty, "46500\n").unwrap();
    assert_eq!(millidegrees(&empty), Some(46.5));
    let _ = std::fs::remove_file(&empty);
}

#[test]
fn a_process_says_when_it_started_and_whether_it_is_the_kernel() {
    let line = "42 (worker) S 1 42 42 0 -1 4194304 100 0 0 0 11 7 0 0 20 0 5 0 900 0 2048";
    let process = seen(42, line, 4).unwrap();
    assert_eq!(process.ticks, 18);
    assert_eq!(process.resident, 8192);
    assert_eq!(process.started, 900);
    assert!(!process.kernel);

    let thread = "77 (kworker/0:1) I 2 0 0 0 -1 69238880 0 0 0 0 0 0 0 0 20 0 1 0 5 0 0";
    assert!(seen(77, thread, 4).unwrap().kernel);
    assert!(
        seen(
            2,
            "2 (kthreadd) S 0 0 0 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 1 0 0",
            4
        )
        .unwrap()
        .kernel
    );
}

#[test]
fn a_process_belongs_to_the_system_to_nas_os_or_to_a_person() {
    let line = "42 (worker) R 1 42 42 0 -1 4194304 100 0 0 0 11 7 0 0 20 0 5 0 900 0 2048";
    let mut process = seen(42, line, 4).unwrap();
    assert_eq!(process.state, State::Running);
    assert_eq!(kind_of(&process, Some("cron.service")), Kind::System);
    assert_eq!(
        kind_of(&process, Some("nas-app@nas-file-manager.service")),
        Kind::Nas
    );

    process.owner = 1000;
    assert_eq!(kind_of(&process, Some("user@1000.service")), Kind::User);
    process.owner = 65534;
    assert_eq!(kind_of(&process, None), Kind::System);

    let thread = "77 (kworker/0:1) I 2 0 0 0 -1 69238880 0 0 0 0 0 0 0 0 20 0 1 0 5 0 0";
    let thread = seen(77, thread, 4).unwrap();
    assert_eq!(thread.state, State::Idle);
    assert_eq!(kind_of(&thread, Some("nas-os.service")), Kind::System);
    assert_eq!(State::of("Z"), State::Zombie);
    assert_eq!(State::of("D"), State::Waiting);
}

#[test]
fn a_graphics_client_counts_once_and_its_engines_add_up() {
    let fdinfo = "pos:\t0\ndrm-driver:\tamdgpu\ndrm-client-id:\t12\n\
                  drm-engine-gfx:\t2000000 ns\ndrm-engine-compute:\t500 ns\n\
                  drm-engine-capacity-gfx:\t2\n";
    assert_eq!(gpu::client(fdinfo), Some(("12".to_owned(), 2_000_500)));
    assert_eq!(gpu::client("pos:\t0\nflags:\t02\n"), None);
    assert_eq!(gpu::share(500_000_000, 1.0), 50.0);
    assert_eq!(gpu::share(5_000_000_000, 1.0), 100.0);
    assert_eq!(gpu::share(1, 0.0), 0.0);
}

#[test]
fn a_counter_becomes_a_rate_between_two_readings() {
    assert_eq!(sensors::rate(5_000_000, 2.0, 1e-6, 2000.0), 2.5);
    assert_eq!(sensors::rate(1500, 1.0, 0.1, 100.0), 100.0);
    assert_eq!(sensors::rate(10, 0.0, 1.0, 100.0), 0.0);
    assert_eq!(
        sensors::busy_ms("100 0 800 40 50 0 400 30 0 1234 70"),
        Some(1234)
    );
}

#[test]
fn nvidia_smi_lines_become_sensors_without_the_values_the_card_lacks() {
    let found = sensors::nvidia_sensors("0, RTX 3060, 37, 54, [N/A], 170.00\nbroken line\n");
    let ids: Vec<&str> = found.iter().map(|sensor| sensor.id.as_str()).collect();
    assert_eq!(ids, ["nvidia0-usage", "nvidia0-temp-0", "nvidia0-tdp"]);
    assert_eq!(found[0].device, "GPU 0 (RTX 3060)");
    assert_eq!(found[2].value, 170.0);
}

#[test]
fn the_sensors_measured_from_the_totals_come_first() {
    let raw = sensors::Raw::default();
    let found = raw.measure(
        &std::collections::HashMap::new(),
        1.0,
        sensors::Totals {
            cpu: 12.5,
            ram: 40.0,
            gpu: 30.0,
        },
    );
    assert_eq!(found[0].id, "cpu-usage");
    assert_eq!(found[1].value, 40.0);
    assert!(raw.counters().is_empty());
}

#[test]
fn a_card_that_says_nothing_shows_the_use_of_its_processes() {
    let mut raw = sensors::Raw::default();
    raw.graphics = true;
    let totals = || sensors::Totals {
        cpu: 0.0,
        ram: 0.0,
        gpu: 140.0,
    };
    let found = raw.measure(&std::collections::HashMap::new(), 1.0, totals());
    let gpu = found
        .iter()
        .find(|sensor| sensor.id == "gpu-usage")
        .unwrap();
    assert_eq!((gpu.label.as_str(), gpu.value), ("processes", 100.0));

    raw.count_idle(
        sensors::sensor(
            "gpu0-usage".into(),
            sensors::Group::Gpu,
            "GPU 0 (i915)",
            "usage",
            sensors::Metric::Usage,
            0.0,
        ),
        1600,
    );
    let before = std::collections::HashMap::from([("gpu0-usage".to_owned(), 1000)]);
    let found = raw.measure(&before, 1.0, totals());
    assert!(found.iter().all(|sensor| sensor.id != "gpu-usage"));
    let card = found
        .iter()
        .find(|sensor| sensor.id == "gpu0-usage")
        .unwrap();
    assert_eq!(card.value, 40.0);
    assert_eq!(
        raw.measure(&Default::default(), 1.0, totals())[2].value,
        0.0
    );
}

#[test]
fn usb_disks_are_excluded_even_when_their_removable_flag_is_zero() {
    use std::os::unix::fs::symlink;
    let root = std::env::temp_dir().join(format!("nas-monitor-usb-{}", std::process::id()));
    let usb = root.join("devices/pci/usb1/1-1/block/sdb");
    let internal = root.join("devices/pci/ata1/block/sda");
    std::fs::create_dir_all(&usb).unwrap();
    std::fs::create_dir_all(&internal).unwrap();
    std::fs::write(usb.join("removable"), "0").unwrap();
    std::fs::write(internal.join("removable"), "0").unwrap();
    let link = root.join("sdb");
    symlink(&usb, &link).unwrap();
    assert!(sensors::external_disk(&link));
    assert!(!sensors::external_disk(&internal));
    std::fs::write(internal.join("removable"), "1").unwrap();
    assert!(sensors::external_disk(&internal));
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn only_native_sata_and_nvme_disks_are_monitored() {
    use std::os::unix::fs::symlink;
    let root = std::env::temp_dir().join(format!("nas-monitor-disks-{}", std::process::id()));
    for (name, path, included) in [
        ("sda", "pci/ata1/host0/target0/block/sda", true),
        ("nvme0n1", "pci/nvme/nvme0/nvme0n1", true),
        ("sdb", "pci/usb1/1-1/host1/target1/block/sdb", false),
        ("sdc", "pci/usb2/nvme/nvme1/block/sdc", false),
        ("vda", "pci/virtio0/block/vda", false),
        ("mmcblk0", "platform/mmc_host/mmc0/mmcblk0", false),
        ("sdd", "pci/host2/target2/block/sdd", false),
        ("sr0", "pci/ata2/host3/target3/block/sr0", false),
    ] {
        let device = root.join("devices").join(path);
        std::fs::create_dir_all(&device).unwrap();
        std::fs::write(device.join("removable"), "0").unwrap();
        let link = root.join(name);
        symlink(&device, &link).unwrap();
        assert_eq!(sensors::internal_disk(&link), included, "{name}");
    }
    std::fs::write(root.join("sda/removable"), "1").unwrap();
    assert!(!sensors::internal_disk(&root.join("sda")));
    assert!(!sensors::internal_disk(&root.join("missing")));
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn physical_cores_deduplicate_smt_threads_without_merging_cpu_packages() {
    let root = std::env::temp_dir().join(format!("nas-monitor-topology-{}", std::process::id()));
    for (index, package, core) in [(0, 0, 0), (1, 0, 0), (2, 1, 0), (3, 1, 0), (4, 1, 1)] {
        let topology = root.join(format!("cpu{index}/topology"));
        std::fs::create_dir_all(&topology).unwrap();
        std::fs::write(topology.join("physical_package_id"), package.to_string()).unwrap();
        std::fs::write(topology.join("core_id"), core.to_string()).unwrap();
    }
    assert_eq!(
        physical_cores(&root, &["cpu0", "cpu1", "cpu2", "cpu3", "cpu4"]),
        Some(3)
    );
    assert_eq!(physical_cores(&root, &["cpu0", "cpu4"]), Some(2));
    assert_eq!(physical_cores(&root, &[]), None);
    assert_eq!(physical_cores(&root, &["cpu0", "cpu5"]), None);
    std::fs::write(root.join("cpu0/topology/core_id"), "-1").unwrap();
    assert_eq!(physical_cores(&root, &["cpu0"]), None);
    std::fs::remove_dir_all(root).unwrap();
}

#[tokio::test]
async fn readings_close_together_share_one_look_at_the_machine() {
    let state = ProcessState::default();
    let first = shared(&state).await.expect("a reading of this machine");
    let again = shared(&state).await.expect("the same reading");
    assert_eq!(
        serde_json::to_string(&first.metrics).unwrap(),
        serde_json::to_string(&again.metrics).unwrap()
    );

    if let Some((at, _)) = state.latest.lock().await.as_mut() {
        *at -= SHARED_FOR * 2;
    }
    let before = state.latest.lock().await.as_ref().map(|(at, _)| *at);
    shared(&state).await.expect("a new reading");
    let after = state.latest.lock().await.as_ref().map(|(at, _)| *at);
    assert!(after > before);
}
