# Contract of nas-system-monitor with the NAS launcher

The contract every application shares with the launcher (package, manifest, permissions, frame
protocol, launcher socket and providers) is `docs/development/external_apps/APPS.md` in the
nas-launcher repository, and the bridge is the one of `@valeriogc/nas-base-app`. This file keeps
only what is specific to nas-system-monitor, which builds and releases on its own.

## Identity

- id `nas-system-monitor`, category `system`, system application
- permissions `paths` ["/proc", "/sys"]

## Specific to this application

nas-system-monitor owns its window, widget (`?view=widget`), preferences and backend telemetry.
It requests read access to `/proc` and `/sys`; its `GET api/telemetry` is served on its own Unix
socket. Only `process-action` with `{ id, started, action }`, `action` one of `terminate` and
`restart`, is delegated through the shell. The launcher independently validates the request
before its protected root helper acts. Its legacy `system-telemetry` bridge only forwards to
the application's endpoint for compatibility. No monitoring code or samples remain in the launcher.

The commands that check the repository are in [DEVELOPMENT.md](DEVELOPMENT.md).
