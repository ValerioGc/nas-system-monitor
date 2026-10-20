# nas-system-monitor

External system application, installed by the initial configuration of the NAS. It shows the state of the machine and which
processes run on it, and draws the process widget of the launcher.

- **Monitor**: summary of physical cores, logical threads, used/total RAM and uptime; temperatures,
  usage and power (with its limit, the TDP) of processor, graphics card, memory and disks, one
  section per kind. Every sensor can be pinned to the widget, up to six. The disk section includes
  only native SATA and NVMe devices, excluding USB. What the machine does not report is missing: a
  virtual machine often has only the usage of processor and memory.
- **Processes**: every process of the NAS with CPU, GPU, RAM and state, filtered by user, NAS or
  system processes or all of them, and with a switch that hides the idle ones using nothing (CPU,
  GPU and RAM at zero). The right click (or the menu key) closes a process or restarts its service;
  an essential process can only be restarted.
- **Widget**: the launcher shows it in the process drawer only with the app installed. It has the
  chosen sensors in a part that shrinks, to leave room for the processes, and the list chosen in
  the options, with the same menu as the app. By default it leaves out the idle processes, as the
  page of the processes does.
- **Settings**: RAM of the processes in MB or as a percentage of the total memory, list of the
  widget, only the active processes in the widget (on by default), refresh interval and selected
  sensors. The choices are kept by the backend of the app, in
  its database: they apply to app and widget together and to every browser that opens the NAS. The window keeps a fixed size and scrolls its content inside.

The backend of the app reads processes and sensors from `/proc` and `/sys`, with read permissions
and without capabilities. App and widget use its `api/telemetry` endpoint on the Unix socket. The
operations on processes go from the shell to the protected service of the launcher, which checks
every request again before running it as root. Every repository stands on its own and produces an
archive that can be installed.

## Local start

Requires Node.js 24, pnpm and Rust/Cargo.

```bash
pnpm install
pnpm run build
pnpm run backend:dev
```

In a second terminal:

```bash
pnpm run dev
```

Vite serves the UI on `http://127.0.0.1:1420/`, the widget on `http://127.0.0.1:1420/?view=widget`.
Locally the telemetry is available when the backend is started too. Outside the shell the
protected commands on processes are not available. The backend serves UI, `/health` and
`/api/telemetry`.

For structure, tests and checks see [DEVELOPMENT.md](DEVELOPMENT.md). The contract for installation
and communication with the launcher is in [APPS.md](APPS.md); packaging and release are in
[NAS.md](NAS.md).
