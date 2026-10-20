# NAS application contract

This document is shared by nas-backup-manager, nas-disk-manager, nas-log-manager, nas-file-manager, and nas-system-monitor. Each repository builds and releases independently. The temporary `external-apps/` directory in a NAS checkout is not a dependency.

## Package and runtime

`app.system` is an optional boolean, defaulting to `false`, independent of `app.category`.
External system apps retain their own process, package updates and management. The catalogue
can mark an entry with `system`; `preinstall` selects initial installation with a desktop
shortcut, independently of the preference for later interactive installs.

`nas-app.json` declares `manifest_version: 1`, the stable app ID and version, `run.exec`, `run.socket`, `ui.protocol: 1`, capabilities, and requested paths. The packager copies `src/assets/logo.svg` to `icon.svg` inside the archive. `pnpm run nas:package` builds the frontend and backend and writes the archive and checksum. `pnpm run nas:test` extracts the archive in an isolated directory and checks static assets, the JSON `/health` version, API response, executable permissions, and absence of a public TCP listener. The NAS launcher installs, starts, stops, updates, and uninstalls each archive. Its app proxy serves it under `/apps/<id>/` on the launcher's origin.

The backend listens on the Unix socket passed by `--listen` or `NAS_APP_SOCKET`. Development uses `pnpm run backend:dev` and Vite on `127.0.0.1:1420`; Vite proxies `/api/` to that socket. Frontend requests must use relative `api/...` URLs so that the same code works below `/apps/<id>/`. The frontend bundle uses `base: './'`; it must not import files from this document's host repository. `data-testid` attributes exist in development tests and are removed from production output.

nas-file-manager is a web application only. Its NAS backend reads `NAS_STORAGE_ROOT` (set on the NAS by the launcher's grant of `/srv/storage`; `FS_EXPLORER_ROOT` in development), uses `STATE_DIRECTORY` for preview cache when present, and provides `/api/launcher/search`. Its manifest requests `/srv/storage` and declares `search` and `file-picker` capabilities; no other app declares a file capability.

## Permissions

`nas-app@.service` hides from every application the data disks (`/srv`, `/mnt`, `/media`), the logs, the launcher's state except the application's own package, `/sys`, `/run/udev` and the processes of other users. `permissions.paths` asks for more, from a fixed list the launcher grants without asking: `/srv/storage` (read and written, in the `nas-storage` group, with `NAS_STORAGE_ROOT` and `NAS_STORAGE_REGISTRY` set), and read only `/proc` (all of it, not only the processes), `/sys` and `/run/udev`. A package asking for any other path is refused at installation and leaves nothing on disk. nas-file-manager and nas-backup-manager ask for `/srv/storage`, nas-disk-manager for `/proc`, `/sys` and `/run/udev`, nas-system-monitor for `/proc` and `/sys`, the others for nothing. Granting `/proc` exposes process metadata allowed by Unix permissions (`ProcSubset=all`, `ProtectProc=default`), without capabilities.

## Launcher iframe protocol

All messages carry `nas: 1`. The launcher accepts messages only from the registered iframe window and its expected origin. Applications accept shell messages only from `window.parent` with `event.origin === window.location.origin`. Applications send `ready` after mounting their message listener, to `window.location.origin`; standalone pages send nothing to themselves. The shell replies with `context` containing `app`, resolved `theme` (`light` or `dark`), `accent`, `locale`, and `palette`: the colours of the launcher's theme by role (`background`, `foreground`, `surface`, `sunken`, `hover`, `border`, `muted`), which the application puts in its `--nas-<role>` tokens on the root and removes when missing or invalid. Context can arrive repeatedly. The shell controls theme, accent, and language in NAS iframe mode; standalone and native preferences remain available outside it. An empty accent removes the inline override.

Application-to-shell messages are `ready`, `notify`, `open`, `describe`, `pick-files`, and the nas-disk-manager-only `initialize-disk`. The shell returns `context`, `described` notification labels, `pick-files-result`, and `initialize-disk-result`. The `open` request may carry `location`, a query string beginning with `?` and at most 2048 characters. The common TypeScript contract, the transport (`createNasShell`) and the Vue lifecycle (`useNasLauncherContext`) live in the shared library `@valeriogc/nas-base-app`. No application imports launcher source files.

An application process has no loopback (`IPAddressDeny=localhost` in the NAS unit) and never calls the launcher on `127.0.0.1:3000`. To leave a notification or report an operation from its backend it uses the unix socket named by `NAS_LAUNCHER_SOCKET`, where the launcher identifies the application from its systemd unit and accepts writes only under its own id. The routes are listed in the launcher's `docs/development/external_apps/APPS.md`.

Only nas-security-center may ask about the access of the NAS: `{ nas: 1, type, requestId, payload? }` with `type` one of `access-settings`, `save-access-settings`, `access-rules`, `add-access-rule`, `remove-access-rule`, `sign-in-policy`, `save-sign-in-policy`, `refused-sign-ins`, and for the devices allowed in with mTLS `mtls-state`, `save-mtls`, `devices`, `add-device`, `update-device`, `renew-device`, `revoke-device` and `remove-device`. Where the payload carries the account password (`save-mtls`, `add-device`, `renew-device`), the shell checks it with the gateway and never passes it on. The shell answers `{ nas: 1, type: '<type>-result', requestId, success, data?, error? }` with the console's session, after checking the payload again; a malformed request gets no answer. The payload is plain data: a reactive object does not cross `postMessage`.

nas-system-monitor owns its window, widget (`?view=widget`), preferences and backend telemetry.
It requests read access to `/proc` and `/sys`; its `GET api/telemetry` is served on its own Unix
socket. Only `process-action` with `{ id, started, action }`, `action` one of `terminate` and
`restart`, is delegated through the shell. The launcher independently validates the request
before its protected root helper acts. Its legacy `system-telemetry` bridge only forwards to
the application's endpoint for compatibility. No monitoring code or samples remain in the launcher.

Only nas-disk-manager may send `{ nas: 1, type: 'initialize-disk', requestId, device, label }`. The launcher derives the sender from the registered frame, validates the request again and answers with `{ nas: 1, type: 'initialize-disk-result', requestId, success, taskId?, error? }`. The application never receives block-device privileges and never calls the launcher's API directly.

nas-file-manager alone may request a folder shortcut:

```ts
{ nas: 1, type: 'shortcut', requestId: string, path: string, name: string }
{ nas: 1, type: 'shortcut-result', requestId: string, success: boolean, error?: string }
```

The launcher derives the sender from its registered frame and persists the shortcut before returning success. The folder path is logical relative to Explorer's configured root. The external page never writes the launcher's desktop API directly. The launcher stores shortcuts of kind `app` or `folder`, opens folders in `nas-file-manager` with `?path=...`, and keeps shortcuts when Explorer is uninstalled so they work again after reinstalling it.

## Search provider

Explorer keeps `/api/search?query=` for its own UI. The launcher uses the manifest endpoint `/api/launcher/search` with `q`, optional `type`, and optional `ext`. The response is an array of `{ id, name, path, type, extension, size, modified, target }`. Types are `folder`, `document`, `image`, `audio`, `video`, and `archive`. `path` is a logical path such as `/Documents/report.pdf`; `target` is an encoded query such as `?path=%2FDocuments&select=report.pdf`. Explorer maps the query to its filesystem view, while the launcher assigns the provider app ID. The launcher can start a stopped provider through the existing app lifecycle before retrying its query. Missing metadata uses an empty `modified` string and numeric size zero.

## File picker provider

An application calls `shell.pickFiles({ multiple })` on the bridge of `@valeriogc/nas-base-app`. The launcher queries `GET /api/capabilities/file-picker`, starts the first installed version 1 provider if necessary, and opens its declared UI endpoint (ending in `/`) in a dialog. Explorer declares `endpoint: "/"`. The UI receives a `nasPicker` token and optional `multiple=1` in its query. It lists folders and files from its own backend, then sends `{ nas: 1, type: 'files-picked', token, files: [{ name, path, download }], cancelled? }` to the shell. `download` is a relative `api/...` URL under the provider's `/apps/<id>/` path. Explorer uses `api/downloads?path=...`.

The shell accepts the result only from the picker iframe on the same origin with the matching token. It returns `{ nas: 1, type: 'pick-files-result', requestId, files: [{ name, path, url }], cancelled, error? }` to the requesting app. `url` is the absolute authenticated NAS URL for the provider's download. The caller fetches it with its NAS session; `path` is a logical path, not an unrestricted host filesystem path. Cancelling yields an empty array, and a missing or unavailable provider yields an `error`. Only one picker can be open; multiple selection accepts at most 100 files.

## Repository gates

The four repositories expose the same pnpm script names. Locally they install with `pnpm install`; the pipelines install with `npm ci` from `package-lock.json`, which `pnpm install` keeps in step (`postinstall`), `pnpm run lock:npm` realigns after `pnpm add`, `update` or `remove`, and `pnpm run lint` checks. Run `pnpm run format:check`, `pnpm run lint`, `pnpm run type-check`, `pnpm test`, `pnpm run test:e2e`, `pnpm run test:coverage`, `cargo fmt --manifest-path backend/Cargo.toml --all --check`, `cargo clippy --manifest-path backend/Cargo.toml --all-targets -- -D warnings`, and `cargo test --locked --manifest-path backend/Cargo.toml`. `pnpm run nas:package` and `pnpm run nas:test` verify the standalone archive. `release:merge` writes Git history and tags; never use it for a test in a real app repository. Its no-tag case uses the version in `package.json`, and `--dry-run` makes no changes.

Frontend tests live under `src/tests/unit`, `src/tests/component`, `src/tests/scripts`, and `src/tests/e2e`, mirroring source paths. Rust tests live under `backend/axum/tests/unit` and `backend/axum/tests/integration` when applicable. UI strings belong in `src/i18n/locales/{en,it}.ts`. Source code, method names, technical errors, and test descriptions are in English; `README.md`, `DEVELOPMENT.md`, and `NAS.md` are in Italian.
