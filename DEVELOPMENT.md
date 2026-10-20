# Development of nas-system-monitor

The Vue/TypeScript UI is in `src/`; the Rust/Axum backend, which serves the interface, `/health` and
`/api/telemetry`, is in `backend/axum/`. The shared scripts are in the library
`@valeriogc/nas-base-app`; manifest and version are in `nas-app.json`, `package.json` and the Cargo
metadata. `src/assets/logo.svg` is the source of the logo and the UI icons are in
`src/assets/icons/`.

## Structure

```text
src/
  App.vue                       # Sidebar, chosen section and options
  WidgetApp.vue                 # The page of the widget (`?view=widget`), chosen in main.ts
  components/layout/            # AppSidebar
  components/sections/          # MonitorPage, ProcessesPage
  components/monitor/           # SensorCard
  components/processes/         # ProcessTable, ProcessContextMenu, ProcessFilterPicker
  components/widget/            # MonitorWidget
  components/modals/            # OptionsModal
  components/common/            # CommonModal (on NasModal)
  composables/useTelemetry.ts   # Periodic readings and actions on the processes
  composables/usePreferences.ts # Options saved by the backend, shared by app and widget
  composables/useNasLauncherContext.ts # The context of the library with the catalogue of the app
  services/nasShell.ts          # The conversation with the shell (askNasShell) on the bridge of the library
  services/monitor.ts           # The requests about the machine
  utils/sensors.ts              # Units, thresholds and filters
  types.ts
```

## How it talks to the launcher

The backend of the app collects CPU, memory, processes and sensors in
`backend/axum/src/telemetry.rs` and in the modules `telemetry/{gpu,sensors,policy}.rs`. The tests
are in `backend/axum/tests/unit/axum/telemetry.rs` and `telemetry/policy.rs`. No source is imported from
the launcher. The manifest requires `/proc` and `/sys`, with the read permissions granted by the
launcher; `ProtectProc=default` makes visible the metadata the Unix permissions allow, without
capabilities.

App and widget read `api/telemetry` with a relative URL: the proxy of the shell reaches the Unix
socket of the app. Only `process-action` (`{ id, started, action }`) goes through `askNasShell`,
with a limit of 125 seconds for restarts. The launcher checks the request again and has its own
root unit act on it; the policy of the app decides which commands are shown and grants no
privilege. The old `system-telemetry` in the bridge of the launcher stays for compatibility and
only forwards to the backend of the app, without collecting data or keeping samples in the
launcher.

The widget is the same app opened with `?view=widget` in the process drawer of the launcher, which
offers it only when the app is installed. The options are the `preferences` document of the
backend (`GET`/`PUT api/documents/preferences`, `backend/axum/src/documents.rs`), in a SQLite
database of the app: `NAS_DB_PATH` when set, otherwise `$STATE_DIRECTORY/system-monitor.sqlite3`,
in development `backend/data/`. Never the database of the launcher. `storedDocument` of
`@valeriogc/nas-base-app` starts from the default values, reads the document at start and saves
every change shortly after; app and widget, in the same browser, follow each other through a
`BroadcastChannel`, the other browsers read again when the page becomes visible. The choices left
in `localStorage` from before move to the backend the first time.

`processMemoryUnit` chooses `mb` (default, also for older preferences) or `percent` for both
tables. The percentage uses `metrics.ramTotal` in GiB, converted to MiB like the RAM of the
processes, with one decimal; without a valid total it shows `-`. The GPU keeps the detected values
and shows `0%` when the value of the process is `null`; it does not change the telemetry.

In the Monitor summary, `metrics.cores` stays the count of the logical threads of the existing
contract; `metrics.physicalCores` gives the physical cores from the CPU topology read by the app.
If the field is missing or `null` (topology unavailable), the card of the cores shows `-`. The
backend of the app filters the disk sensors before sending them: only native SATA and NVMe,
without USB devices, even when they declare `removable = 0`.

## Boundaries with the launcher

The launcher keeps the `MonitorDrawer.vue` frame that hosts the iframe, the `systemMonitor.ts`
link for the protected actions and compatibility, and `services/process_control.rs` with the root
helper. The views, the widget, the preferences, the polling, the formats, and the collection and
classification of processes and sensors belong entirely to this project.

## Telemetry contract

`GET api/telemetry` of the backend of the app reads the data of the machine from `/proc` and
`/sys`, with no further dependency:

```json
{
  "metrics": {
    "cpu": 12.4,
    "cores": 16,
    "physicalCores": 8,
    "temperature": 46.5,
    "ram": 8,
    "ramTotal": 13.3,
    "swap": 0,
    "swapTotal": 15,
    "load": 0.98,
    "uptime": 17693
  },
  "processes": [
    {
      "id": 9099,
      "name": "java",
      "process": "/opt/java/…",
      "ram": 1039.2,
      "cpu": 3.2,
      "gpu": null,
      "state": "sleeping",
      "kind": "nas",
      "started": 81234,
      "unit": "nas-app@nas-photos.service",
      "canTerminate": true,
      "canRestart": true
    }
  ],
  "sensors": [
    {
      "id": "cpu-coretemp-hwmon2-temp-0",
      "group": "cpu",
      "device": "coretemp",
      "label": "Package id 0",
      "metric": "temperature",
      "value": 46
    }
  ]
}
```

`cpu` is the usage percentage of the whole machine. The memory of the system is in GiB, that of
the processes in MiB, and `uptime` is in seconds. `cores` counts the online logical threads;
`physicalCores` counts the distinct package/core pairs, or is `null` when the topology is not
available. A missing or implausible temperature is not shown as zero.

`processes` holds every readable process, sorted by CPU and then memory, without limits. `started`
tells apart processes with the same PID by their start time in ticks; `unit` is the first service
or scope of the cgroup. `canTerminate` and `canRestart` decide the commands offered in the
interface. `kind` tells apart user processes, NAS services and system. `gpu` comes from the DRM
`fdinfo` counters and stays `null` when it cannot be read. If the collection is not available,
the endpoint answers 503 with a JSON error.

`sensors` lists usage, temperatures and power by the groups `cpu`, `gpu`, `ram`, `disk`. The
collection uses `hwmon`, RAPL, the AMD/Intel data and, when available and reachable,
`nvidia-smi`. The disks are only native SATA and NVMe, with activity and temperatures reported by
the hardware. Cumulative counters become rates between two samples and show zero at the first
sample. The identifiers of the sensors stay stable. The privileged operations on processes stay
mediated by the launcher, with an independent check of the data of the request.

## Conventions

Composition API with `<script setup lang="ts">`, imports through the `@/` alias, scoped SFC styles,
CSS names with `_` and UI texts in the catalogues `src/i18n/locales/en.ts` and `it.ts`, with the
same keys. Code, method names, test descriptions, this document and the README are in English.

The FE tests are in `src/tests/unit`, `component`, `scripts`, `e2e`, with sub-paths mirroring
`src/`. The e2e tests open the app inside a fake shell (`openInShell`) that answers the requests
like the launcher. The Rust tests are in `backend/axum/tests/unit`.

## Coverage

The threshold is 80% on every file of the frontend, components included (`perFile` in
`vitest.config.ts`), and 80% of the lines of the Rust backend (`--fail-under-lines 80` passed to
`cargo llvm-cov` in the `coverage:rust` command of `package.json`).

## Dependencies and lockfiles

Locally dependencies are installed with pnpm; the pipelines install with `npm ci` from
`package-lock.json`, which therefore has to match `package.json`. `pnpm install` realigns it by
itself (`postinstall`); `pnpm add`, `pnpm update` and `pnpm remove` do not: after them run
`pnpm run lock:npm`. `pnpm run lint` checks the alignment. `pnpm-lock.yaml` stays local.

## Shared library

The launcher bridge, styles, shared components and helpers, and the build, package and release scripts come from `@valeriogc/nas-base-app`, published on GitHub Packages; the commands of `package.json` use its `nas-base-app`. The `.npmrc` of the project points the `@valeriogc` scope to its registry; locally a classic token with `read:packages` is needed in your own `~/.npmrc` (`//npm.pkg.github.com/:_authToken=...`), while the pipelines use the token of the workflow. For a new version of the library, update the number in `package.json` and run `pnpm install`. The local `pnpm-workspace.yaml` has `'@valeriogc/nas-base-app': false` under `allowBuilds`.

## Checks

```bash
pnpm install
pnpm run format:check
pnpm run lint
pnpm run type-check
pnpm test
pnpm run test:e2e
pnpm run test:coverage
pnpm run coverage:rust
cargo fmt --manifest-path backend/Cargo.toml --all --check
cargo clippy --manifest-path backend/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path backend/Cargo.toml
pnpm run nas:package
pnpm run nas:test
```

The E2E tests start Vite on port 1438. `release:merge` creates commit and tag: try it only in an
isolated temporary Git repository.
