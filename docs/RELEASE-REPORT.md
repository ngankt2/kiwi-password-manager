# Historical macOS test report

This report records the baseline before the desktop migration. See [DESKTOP-MIGRATION.md](DESKTOP-MIGRATION.md) for the Tauri migration results.

Date: September 24, 2026. Test environment: macOS 26.4.1, Apple Silicon arm64, Electron 44.4.5, Expo 57.0.24, React Native 0.86.3, React 19.2.3, and Bun 1.4.2.

This test cycle covered the macOS desktop app. iOS and Android were not rebuilt. The package was an ad hoc signed local test build, without Apple notarization or an independent security audit.

## Implemented functionality

| Area | Coverage | Evidence |
| --- | --- | --- |
| Vaults | Create, open, lock, save, rename, Save As, change password, and delete with authentication | Session and filesystem unit/integration tests, plus E2E tests |
| Format | Three independent version fields, AES-256-GCM with AAD, calibrated Argon2id, schema 1→2 | Cryptography, tampering, and KDF tests; two legacy vault fixtures |
| Safe writes | Exclusive writes, fsync, verification, new generations, retained recovery copies, and conflicts | Storage fault injection and the real macOS filesystem |
| KeePass | File and key-file selection, decryption, preview, and conversion to an application vault | Seven upstream fixtures and a private test file |
| Data | Nine entry types, custom fields, groups/tags, favorites/archive/trash, history, attachments, and OTP | Domain tests shared by the UI; full E2E coverage of every entry type was not claimed |
| Desktop workflows | List/detail views, search, editing, shortcuts, generation, three layouts, and small windows | Electron E2E; 32 screenshots at 1320×860 and 760×580, with no horizontal overflow or renderer errors detected |
| Folders | Drag to reorder, nest, or move to the root; expand collapsed folders; menus and shortcuts | Domain and Electron drag-and-drop E2E tests, including order persistence after restart and cycle prevention |
| Clipboard | AppKit helper, ownership through changeCount, timeouts, and clearing on lock | Race-condition regression tests and Electron E2E with the system clipboard |
| Sessions | Default three-minute lock delay after leaving the app; draft retention during the delay; key/reference clearing and unmounting on lock | Deadline and asynchronous race tests, plus Electron lifecycle E2E, including an open file dialog |
| Settings | Persist lock delays, layout, list density, and reduced-motion preferences | Electron restart E2E and preference migration |
| Backups | Automatic/manual backups, retention, external folders, verification, preview, restore, and recovery copies | Session/storage tests, external-folder retention, and desktop E2E |
| Import/export | Encrypted vaults; schema-based JSON with a preview; warning and authentication for plaintext export | Validation/domain tests and desktop export E2E |
| Desktop boundaries | Sandbox, context isolation, CSP, restricted IPC, offline assets, and one process per profile | Electron security E2E and bundle inspection |

## Not implemented or not sufficiently verified at this baseline

- Touch ID and device-bound key wrapping on macOS, and biometric unlock on the web.
- KDBX export or in-place KDBX editing, CSV mapping, hardware challenge-response, KDB 1.x, and cloud sync.
- Compatibility certification for every KeePass plugin and property. Unmapped data is retained rather than silently discarded.
- Lazy loading of large attachments, benchmarks with tens of thousands of entries, and performance testing across multiple hardware configurations.
- The script creates Intel builds when run on x64, but this cycle did not test Intel hardware.
- Developer ID signing, notarization, automatic updates, an independent audit, physical power-loss/disk-full testing, and screenshot protection against every macOS capture tool.
- Equivalent E2E coverage on physical iOS and Android devices was outside this desktop test cycle.

## KDBX compatibility matrix

Each fixture below completed this flow: KDBX → preview → internal vault → encrypted save → reopen → edit → reopen. Fields, folders, tags, history, attachments, and metadata were compared. Sources and SHA-256 checksums are recorded in `fixtures/kdbx/provenance.json`; upstream credentials are synthetic test data.

| Fixture | Actual header | Cipher | KDF | Key file | Core result |
| --- | --- | --- | --- | --- | --- |
| demo.kdbx | 3.1 | AES-256 | AES-KDF | demo.key | Passed, including history, custom fields, and attachments |
| Argon2.kdbx | 4.0 | AES-256 | Argon2d v19 | demo.key | Passed |
| Argon2id.kdbx | 4.0 | AES-256 | Argon2id v19 | demo.key | Passed |
| Argon2ChaCha.kdbx | 4.0 | ChaCha20 | Argon2d v19 | demo.key | Passed |
| AesChaCha.kdbx | 3.1 | ChaCha20 | AES-KDF | demo.key | Passed |
| AesKdfKdbx4.kdbx | **3.1**, despite the “4” in its name | AES-256 | AES-KDF | None | Passed |
| KDBX4.1.kdbx | 4.1 | AES-256 | AES-KDF | None | Passed, including group tags and quality metadata |
| User-supplied test file | 4.0, KeePassXC | AES-256 | Argon2d v19, 64 MiB, 108 passes, 4 lanes | None | Passed; one entry and one folder |

The private test file's source bytes remained unchanged, and results recorded only counts. KDF limits allowed the file's original cost without reducing its security parameters. Combinations without fixtures, including KDBX 4.x ChaCha20 + Argon2id and XML key-file v2, were not marked as compatible even where the library might support them. At this baseline, the KeyV2 fixture was retained for reference and was not part of the verified matrix.

## Migration compatibility matrix

| Format / crypto / schema | Handling | Result |
| --- | --- | --- |
| 1 / 1 / 1 | Validate schema 1 → migrate in memory → schema 2 → verify the new file; back up the original before saving | Passed |
| 1 / 1 / 2 | Validate and open directly | Passed |
| Version newer than the reader | Reject before writing | Passed |
| Modified header/ciphertext or incorrect password | Authentication/validation fails; the file remains unchanged | Passed |

## Test results

| Check | Result |
| --- | --- |
| Unit, integration, and compatibility tests | 71 passed, 0 failed, across 12 test files |
| Lint and TypeScript | Passed |
| Electron E2E with a private KDBX file | 9 passed, 0 failed, including folder drag and drop, lock timing, settings persistence, and process reopening |
| Packaging and launching the signed `.app` | Passed; valid signature, isolated test profile, and the new-vault interface displayed |
| Signature, ASAR, and fuses | Passed; Node/inspector CLI access disabled and integrity enabled |
| Bundle data inspection | Passed; 36 code/HTML/JSON assets contained no private test file or E2E credentials |
| Expo dependency compatibility | `expo install --check`: compatible |
| Dependency advisory scan | `bun audit --json` and `--production`: `{}` after patches |

Decrypted vault contents were not written to caches or logs. E2E runs used separate temporary directories and removed them afterward. Plaintext JSON exports used only synthetic fixtures in paths chosen by the tests and were removed at the end. Playwright tracing, video, and automatic screenshots of private files were disabled. UI screenshots, where present, contained only synthetic credentials.

Playwright exercised a staging runtime with the same main, preload, and web bundles. The inspector required by Playwright remained enabled in the test runtime. The final `.app` was checked separately through native accessibility after the inspector fuses were disabled. The 179/180/181-second boundaries were verified with a controlled renderer clock. Screen-lock and sleep events were simulated and do not replace physical device testing. Interaction tests waited for macOS to confirm that the window had focus. CI was configured but had not run on GitHub during that test cycle.

## Platform limits and security decisions

The desktop host accepts IPC only from the application's main frame and restricts file operations to valid vault and backup paths. External files require a Finder dialog. Vault names, recent metadata, and backup locations are not treated as secrets; entry contents and search indexes remain in memory or encrypted files.

Switching apps, hiding the window, or minimizing it starts a **three-minute** delay, configurable under **Settings → Security → Lock after leaving the app**. Returning before the deadline cancels the timer and preserves drafts. The separate inactivity timer defaults to five minutes. Opening an in-app file dialog does not itself start the away timer, but switching to another app while the dialog is open does. Screen lock and sleep lock the vault immediately. SessionBoundary removes secret-bearing UI when the vault locks. JavaScript cannot guarantee that every string copy is erased from memory; see the threat model.

The clipboard is cleared only while its ownership still matches. Other applications may read or retain copied contents. ScreenCaptureKit can bypass Electron content protection, so the app does not promise protection against every screenshot method. Existing backups keep their original passwords. Risks from compromised hardware, the operating system, or dependencies require assessment before production distribution.

[Appkiro website](https://appkiro.com)
