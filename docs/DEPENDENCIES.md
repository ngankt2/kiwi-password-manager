# Dependency decisions

Checked against the npm registry on 24 September 2026. Exact JavaScript versions/integrity hashes are in `bun.lock`, and native versions/checksums are in `desktop/tauri/Cargo.lock`; installation must preserve both patches in `patches/`. Expo-managed versions pass `bunx expo install --check`.

| Component | Installed | Latest registry release at check | Maintainer | Purpose / runtime |
| --- | --- | --- | --- | --- |
| Expo / React Native / React | 57.0.24 / 0.86.3 / 19.2.3 | Expo-compatible set | Expo / Meta | Router, shared UI and platform adapters |
| Tauri (Rust / JS / CLI) | 2.11.6 / 2.11.1 / 2.11.5 | Locked during migration | Tauri project | macOS host and scoped native bridge |
| Tauri updater / dialog | 2.12.0 / 2.7.3 | Cargo.lock | Tauri project | Signed updates and native file pickers |
| kdbxweb | 2.1.1 | 2.1.1, 2021-09-06 | KeeWeb / antelle | KDBX parser, AES-KDF, ChaCha20, protected fields |
| hash-wasm | 4.12.0 | 4.12.0, 2024-11-19 | Daninet, sdombi94 | Desktop/web Argon2d/id in a bundled worker |
| @xmldom/xmldom | 0.9.12 | 0.9.12, 2026-08-21 | xmldom / karfau | Strict XML parsing for KDBX and key files |
| fflate | 0.8.3 | 0.8.3, 2026-05-16 | 101arrowz | Bounded GZIP decompression for KDBX |
| OTPAuth | 9.5.2 | 9.5.2, 2026-09-03 | Hector Molinero | OTP URI parsing and standards-based codes |
| Zod | 4.6.5 | 4.6.5, 2026-09-13 | Colin McDonnell | File/domain/settings validation |
| react-native-quick-crypto | 1.1.7 | 1.1.7, 2026-08-15 | Margelo | Native Argon2 and crypto integration; not used by macOS renderer |

## Why these integrations

WebCrypto provides AES-256-GCM, SHA-256 and OS randomness on desktop/web. Argon2 is not a WebCrypto primitive, so hash-wasm runs it outside the UI thread. Mobile uses native crypto and Expo Crypto instead; it needs a development/release build with the required native modules. Crypto providers share a typed port, and no algorithm is reimplemented in the application.

kdbxweb has broad KDBX support and typed mapping APIs with real upstream KeePass fixtures. It does not run unchanged across platforms: the application supplies crypto and XML adapters and adds bounded decompression. Its npm release is old. Passing fixtures and an advisory scan do not establish active maintenance or constitute an independent security review. A fork/current-source audit or replacement evaluation remains a release requirement. A handwritten KDBX parser was rejected because it would duplicate a large security-sensitive format.

The kdbxweb patch routes both compressed database XML and compressed binary values through current fflate streaming decompression, capped at 64 MiB. It does not implement compression. XML adapters reject DTDs/external entities and malformed documents. The xmldom override replaces the old transitive version requested by kdbxweb.

Tauri reuses the existing Expo Web frontend and system WebKit. Rust replaces only the OS operations previously handled by Node; it does not reimplement vault encryption or domain logic. The same Swift helper retains AppKit clipboard ownership/concealed content and reports lifecycle events. `electron`, `@electron/packager`, `@electron/fuses` and the unused JavaScript `tar` dependency were removed after parity checks. Rust's updater archive dependencies remain necessary. `esbuild` still builds the Argon2 worker and isolated test harness.

## Advisory fixes and compatibility shims

- `fflate` is pinned/overridden to 0.8.3 for [GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98). The application uses GZIP, but avoids shipping the affected ZIP parser version too.
- `decode-uri-component` is overridden to 0.5.0 for [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr). Expo's transitive `query-string` 7.1.3 remains at its expected API; a one-line patch reads the new decoder's ESM default export. Unicode and malformed-query regressions exercise the actual dependency path. Latest query-string is 9.5.1; a broad router dependency major upgrade was unnecessary.
- Expo project tooling's `uuid` is overridden to 11.1.1 for [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq). This release preserves a CommonJS entry and the `v4` API used by `xcode`. Latest uuid is 14.0.2; the compatibility test uses the actual xcode ID-generation path. This is build tooling, not vault randomness.

Both production and complete `bun audit --json` scans returned an empty advisory object after these changes. This is a point-in-time registry result, not a guarantee against unknown vulnerabilities.

## Native requirements and alternatives

Expo FileSystem/DocumentPicker handle mobile documents; desktop uses Rust filesystem operations behind validated native commands. IndexedDB is the browser fallback. Plaintext SQLite, AsyncStorage persistence of the session, and browser localStorage for vault contents were rejected.

Expo SecureStore/LocalAuthentication handle supported mobile biometric key envelopes. There is no macOS/web biometric implementation in this build; a real device-bound OS key wrapper is required before adding Touch ID. The clipboard Swift helper is compiled with Xcode Command Line Tools and bundled inside the Tauri app resources. Tauri is packaged for the host architecture; Intel and Apple Silicon releases need separate verification.
