# NAS package of nas-system-monitor

Stable identity: `nas-system-monitor`. The launcher installs the archive produced by
`pnpm run nas:package`, serves it under `/apps/nas-system-monitor/` and starts the backend over a
Unix socket. The manifest `nas-app.json` declares executable, socket, logo and protocol, and the
read paths `/proc` and `/sys`: the backend of the app collects the telemetry. The source logo
`src/assets/logo.svg` becomes `icon.svg` in the archive. `pnpm run nas:test` extracts the archive
into an isolated directory and checks UI, `/health`, version and the absence of TCP listeners.

The catalogue of the launcher marks it `preinstall`: the NAS installs it with the first
configuration.

The workflows are `.github/workflows/ci.yml`, `build.yml`, `audit.yml` and `.github/dependabot.yml`.
A release requires consistent versions in `package.json`, the npm lock, manifest, Cargo, Sonar and
changelog. The shared details and the iframe protocol are in [APPS.md](APPS.md).
