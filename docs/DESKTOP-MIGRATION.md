# Desktop runtime audit and migration

Audit date: 2026-09-24. Source baseline: 1.0.5; reproducible Electron comparison build: 1.0.6.

The desktop frontend is the existing Expo Web export, using Expo Router and React Native Web with the existing desktop components and styles. Only the operating-system host changes. iOS/Android remain Expo 57 and retain their existing entry points, providers, native modules and EAS configuration.

## Observed host surface

| Existing source | Observed behavior | Tauri replacement |
| --- | --- | --- |
| `desktop/main.ts`, `desktop/preload.ts`, `src/infrastructure/desktop/bridge.ts` | 22 request channels, `{ok,value,code}` replies, `security:event`, context-isolated bridge | One validated native command dispatcher plus events; the existing `DesktopBridge` contract stays intact |
| `desktop/file-store.ts` | Encrypted generations, bounded metadata, exclusive creation, fsync, hard-link promotion, no-follow reads and path validation | Rust file operations with the same paths, limits, validation and errors |
| `desktop/linked-vault-files.ts` | Picker-issued grants, `.akpr` / legacy `.vault` files, SHA-256 revisions, atomic saves, conflict detection, relocation and safe recent-file bindings | Rust port of the OS operations, preserving JSON schema and grants |
| `desktop/backup-mirror.ts` | Optional selected backup folder, verified encrypted copies, indexed retention of automatic backups only | Rust port, same folder/index names and retention rules |
| `desktop/main.ts` preferences | Validated JSON, atomic replacement, native menu language and system/light/dark appearance | Native preferences command; generated translations use the existing TypeScript catalog |
| `desktop/macos-security.swift` | Concealed macOS clipboard items, pasteboard change-count ownership, copy/conditional clear through JSON stdin/stdout | Same helper and request/reply contract, called by Rust |
| `desktop/main.ts` clipboard/lifecycle | Serialized clipboard calls, 0/10/30/60-second expiry, clearing on lock/quit, screen lock/sleep and focus events, native dialog grace period | Rust ownership/timers and macOS lifecycle notifications |
| `desktop/main.ts` dialogs/export | Native file/folder/save pickers; encrypted export backups; plaintext creation never overwrites an existing file | Native dialog plugin invoked from Rust, validated exports |
| `desktop/main.ts` window/menu | 1320×860, minimum 760×580, inset traffic lights, content protection, app/edit/view/window menus, zoom/fullscreen, Cmd+L, single instance, quit when last window closes | Tauri window/menu APIs and single-instance plugin |
| `desktop/main.ts` network | Bundled `kiro://app` assets, restrictive CSP, no remote renderer connections, no new windows, validated HTTP(S) links opened externally | Bundled Tauri protocol, equivalent CSP/navigation restrictions, native URL validation |
| `scripts/build-desktop.ts` | Expo export → bundled main/preload + Swift helper → Electron packager → hardened fuses → ad-hoc signature | Same versioned command and Expo export → Tauri Rust host + same helper → macOS app |
| `desktop/updates/*` | Unconnected work in progress; no updater is reachable in the Electron baseline | Tauri signed updater for the separately requested update feature |

Request channels audited: `files:read`, `files:write`, `files:promote`, `files:remove`, `files:list`; `vault-files:list`, `vault-files:read`, `vault-files:attach`, `vault-files:write`, `vault-files:choose-location`, `vault-files:relocate`, `vault-files:forget`; `dialog:open`, `dialog:save`; `preferences:read`, `preferences:write`; `clipboard:copy`, `clipboard:clear`; `security:locked`; `backup:status`, `backup:folder`; `external:open`.

Node APIs in the host are filesystem/path, SHA-256/UUID, child-process invocation of the clipboard helper, and process/resource paths. Pure TypeScript vault encryption, Argon2 worker, journal/recovery, business rules, search, TOTP, import/export formats and session state remain shared and are not rewritten in Rust.

There is no existing tray, notification service, global shortcut registration, SQLite database, desktop keychain enrollment, desktop deep-link handler, Windows package or Linux package. The application scheme in `app.json` belongs to the unchanged Expo app. Desktop passkey enrollment is unavailable on the existing custom origin and must not become implicitly enabled by changing hosts.

## Data continuity

The native host must use the existing `~/Library/Application Support/Kiro Vault` directory, not the Tauri identifier-derived default. Existing `encrypted-files/`, `preferences.json`, `backup-location.json`, and `linked-vaults.json` are read in place with the same formats. External files and backup destinations remain at their selected locations. Because the data directory does not move, copying or rewriting vault data on startup would add risk and is unnecessary. Isolated test profiles use `KIRO_DESKTOP_TEST_DATA`; production paths never depend on a renderer-supplied path.

## Verification log

- Baseline typecheck: passed.
- Baseline unit tests: 135 passed.
- Baseline lint: existing `react-hooks/set-state-in-effect` error in `src/features/items/item-icon-picker.tsx`.
- Baseline production build: passed, version 1.0.6, macOS arm64, ad-hoc signed.
- Baseline bundle logical size: 314,866,910 bytes (excluding symlink targets).
- Baseline app and source snapshot: `desktop-release/electron-baseline-1.0.6/`.

## Final build and verification

The completed desktop build is **1.0.14**, built and checked on **macOS 26.4.1, Apple Silicon arm64** with Bun 1.4.2 and Rust 1.98.1. Each application build, including the failed 1.0.13 packaging attempt, retained its incremented version. The package, Expo config, native build counters and Rust package/lockfile versions are synchronized by the existing build wrapper.

| Check | Observed result |
| --- | --- |
| Final lint and TypeScript check | Passed |
| Shared core/unit suite after migration | 135 passed, 17 files |
| Rust host suite | 13 passed; the production-payload test is intentionally separate |
| Actual Tauri/WKWebView runtime, debug 1.0.12 | 30 first-launch checks and 15 process-reopen checks passed |
| Final Expo Web renderer 1.0.14 in Playwright WebKit | 12 passed; one optional private KDBX case skipped because no private vault was used |
| Actual signed 1.0.14 update archive | Signature and signed version verified; installed into a disposable `.app`; resulting codesign and bundle version verified |
| Synthetic updater regression after large-payload harness correction | Passed: valid install, tampering, missing/mismatched signed versions, downgrade and empty channel |
| Production bundle | Strict deep codesign passed; arm64; version 1.0.14; expected native icon; no Electron runtime or test-only script/report markers |
| Shared release repository | Both app manifests validate; publishing 1.0.14 passes dry run; no remote publication |

The actual native runtime checks cover the existing bridge error semantics and permission boundaries, network/new-window restrictions, clipboard ownership/expiry/lock clearing, second-instance exit, minimize/restore/maximize, legacy external vault edits, native encrypted journal saves and automatic backups, preferences, and decryption after a real process restart. All profiles and vaults used for migration verification were synthetic and isolated from the user's data directory. Native picker integration in this harness supplies a test-only selected path; it does not validate manual interaction with the macOS picker UI.

The WebKit suite covers branding and persistent item icons, inline reveal/generate controls and folder creation, backup/restore, password changes, authenticated JSON export, TOTP, folder drag/drop, focus/departure grace periods, dirty drafts, lock/reopen, all three layouts and the minimum window size. Update cases cover startup/periodic checks, plain-text release notes, progress, explicit install/restart, stale-offer removal and preserving edits. Its bridge is explicitly a UI test double; it does not replace native integration tests. The final dark editor screenshot was visually reviewed.

Reports: `tests/reports/tauri-migration/native-first.json`, `native-reopen.json`, and `production-package.json`. Final renderer screenshots are under `tests/reports/editor-inputs/`, `branding/` and `desktop-ui/`.

### Regressions corrected

- WKWebView suspended timers while minimized. Disabling background throttling where macOS supports it restored the existing timer-dependent behavior; native minimize/restore/maximize checks then passed.
- Mounting the updater dialog differently during server rendering and hydration caused a React hydration error and unreliable accessible dialog labels. The existing layout hydration flag now gates that dialog; the final suite captures errors from before navigation and passed without renderer errors.
- Tauri's PNG-to-macOS-icon packaging failed with `No matching IconType`. The existing build preparation now generates a standard ICNS family from the unchanged user-selected macOS PNG using system tools. Build 1.0.14 packages that icon successfully.
- The pre-existing item-icon draft effect failed lint. Its draft handling was corrected, and save/discard/reopen/reset behavior passed the icon UI test.

The updater test HTTP server also needed blocking accepted sockets on macOS to stream a full production archive instead of truncating at a nonblocking write. This was a test-harness correction, with no application rebuild or runtime behavior change.

### Measured artifacts

| Artifact | Bytes | Decimal MB |
| --- | ---: | ---: |
| Frozen Electron 1.0.6 `.app` | 314,866,910 | 314.87 |
| Tauri 1.0.14 `.app` | 18,166,960 | 18.17 |
| Signed Tauri updater archive | 11,161,320 | 11.16 |

Bundle sizes count regular files without following symlinks. The measured application reduction is **94.23%**. Tauri reuses system WebKit, which is outside its bundle; the Electron baseline includes Chromium.

The final local artifacts are in `desktop-release/tauri-1.0.14/`: `Appkiro Password Manager.app`, `AppkiroPasswordManager_1.0.14_arm64.app.tar.gz`, its `.sig`, `latest.json`, and `updater.pub`. The old signed app and source snapshot remain in the baseline directory.

### Scope and remaining verification

- Production `.app` launch was attempted with an isolated synthetic profile. Direct visual/native-picker/menu/dragging checks could not be completed because the computer-use tool reported that the Mac was locked. Automated WebKit and earlier actual native-runtime results are reported separately above.
- macOS 26.4.1 arm64 is the only desktop OS/architecture tested physically. The configured minimum is macOS 13; background throttling control is available on macOS 14+, so behavior on macOS 13 still needs verification. Intel, Windows, Linux, iOS and Android were not built or run during this desktop migration. Windows/Linux desktop distribution did not exist in the baseline.
- Device lock/sleep handling was exercised through the isolated native test harness, not a physical sleep/wake or screen-lock cycle. No claim is made about external screen-capture prevention. CI configuration was updated but has not been run on GitHub in this session.
- The bundle retains the baseline's ad-hoc signing level, with hardened runtime. Developer ID signing and notarization were not performed. Updater signatures authenticate payloads separately from Apple distribution signing.
- The app-specific public update channel and release assets are prepared locally and pass validation. They have not been committed, pushed or published. Existing Electron apps need one manual installation of the first Tauri release; they did not have a connected updater. See `AUTOUPDATE.md` for the release procedure.

## Electron removal

After native parity checks, the old main/preload host, Node filesystem/backup/linked-file adapters and abandoned updater implementation were removed. `electron`, `@electron/packager`, `@electron/fuses` and the unused JavaScript `tar` dependency were removed. The Argon2 worker, application TypeScript, Expo Router and mobile adapters remain in place.

The final source scan found no live Electron APIs or host implementation. Historical audit/baseline documentation intentionally mentions Electron. `electron-to-chromium` remains only as Browserslist compatibility metadata in the lockfile, not as an application runtime.

[Appkiro website](https://appkiro.com)
