# Kiro Password Manager architecture

Decision record, updated 24 September 2026. This is a local-first application with a macOS desktop test target, and no accounts, analytics, or remote credential storage. Browser hosting includes a bounded icon-download API; it receives only image URLs or website origins, never vault contents.

## Runtime and boundaries

Expo SDK 57.0.24 owns the React Native 0.86.3 and React 19.2.3 versions. New Architecture and the stable Expo React Compiler integration remain enabled. Native Argon2 requires a development/release build; Expo Go is not a supported security runtime.

`src/app` contains Expo Router routes only. `features` owns screens and presentation state. `domain` owns validated entities and pure operations. `core` owns the versioned file codec, migrations, security policies, and ports. `infrastructure` implements these ports for native and web. No React import belongs in domain or the file codec.

Tauri v2 hosts static Expo Web output in the macOS system WKWebView. `desktop/tauri/src/lib.rs` owns the window, menus and lifecycle; `commands.rs` dispatches validated request channels, including the scoped `icons:fetch` downloader. `src/infrastructure/desktop/tauri.web.ts` implements the typed `DesktopBridge` through native commands/events. Its mobile sibling is inert, so mobile does not load the Tauri browser API. Crypto, journal/recovery, domain rules and presentation remain TypeScript.

The session controller owns a derived key and an in-memory decrypted vault. It publishes an immutable view through `useSyncExternalStore`; nothing automatically persists that view. Lock increments a generation counter, zeroes mutable key buffers, drops all decrypted references, and unmounts the unlocked route tree. Async operations cannot resurrect an obsolete session.

## File and persistence

The encrypted `.akpr` file is the source of truth; existing `.vault` files remain compatible. The binary prefix is followed by a bounded JSON header and AES-256-GCM ciphertext/tag. The complete original prefix/header bytes are authenticated as AAD. Format, crypto and payload schema versions are independent of the application version. Vault names, item fields, folder names, imported metadata and attachments are encrypted.

Desktop owns encrypted files below `~/Library/Application Support/Kiro Vault/encrypted-files`. A single-instance lock prevents competing desktop writers for the same profile. Its file port adds exclusive `0600` writes, fsync, verification and same-volume hard-link promotion. Finder import and export copy files explicitly. A selected external backup directory receives verified encrypted copies inside `Kiro Vault Backups`; retention only deletes automatic backups recorded by the app's bounded index. A failed mirror does not invalidate the local committed vault.

Mobile owns encrypted files inside its document directory. A journal preserves the previous encrypted generation and verifies a temporary generation before promotion. Expo FileSystem does not expose a portable fsync guarantee; retained immutable recovery generations cover interrupted application writes, not every possible device/storage failure. Imported external documents are copied; the application never promises safe in-place writes to arbitrary document providers. Mobile release builds are outside the current macOS verification scope.

Web uses IndexedDB transactions for encrypted blobs and compare-and-swap revisions. Browser storage can be evicted; downloadable encrypted backups are essential. Arbitrary persistent filesystem access, OS lock detection and reliable background execution are not promised on the web. No plaintext index is persisted.

## Security

AES-256-GCM uses OS CSPRNG nonces, 128-bit tags and 256-bit Argon2id output. New vaults use Argon2 v1.3 with a 64 MiB memory floor and at least three passes; calibration can increase passes to meet a target, never weaken the floor. Stored parameters are bounded before allocation to resist hostile files. Native uses Quick Crypto's asynchronous Argon2 implementation. Web uses a locally bundled hash-wasm worker; it is terminated after use. AES-GCM uses Expo Crypto on native and browser WebCrypto on web.

Quick unlock is configured per local vault from Settings after master-password verification. Enrollment/removal share the session mutation queue with password rotation. Lock aborts in-flight WebAuthn requests; late responses cannot restore a locked session or leave a completed enrollment active. Password rotation and vault removal revoke the local quick-unlock envelope.

The mobile biometric adapter stores a small vault-bound key envelope in OS-protected SecureStore with required authentication and device-only accessibility. A protected read verifies Face ID/Touch ID/strong biometric authentication before enrollment is marked complete. It does not change the file password. A password is still necessary on a new device or after biometric enrollment changes.

Web browsers use WebAuthn PRF to wrap the vault key with AES-256-GCM. IndexedDB contains the wrapped key, random PRF input, nonce, credential ID and public metadata, never the master password, plaintext vault key or PRF output. The authenticated wrapping metadata binds the record to the local vault ID, file KDF binding, credential public key and exact origin. Creation and assertions require user verification. Assertions also check challenge, origin, RP ID hash, user-presence/verification flags, credential ID and the ES256 signature. Authenticators without PRF cannot enroll; there is no unprotected fallback. Only a separate assertion is needed when PRF evaluation is unavailable during creation. The passkey provider may synchronize its credential, but the encrypted local vault and its key envelope are not synchronized by Appkiro. Disabling quick unlock removes the local envelope; provider-managed passkeys remain managed by the user's password manager.

The custom Tauri `tauri://localhost` origin does not support the browser passkey flow, and this desktop build does not claim native Touch ID support. Physical Face ID/Touch ID and real authenticator enrollment require device validation; the JavaScript tests use a test authenticator with real ES256 signatures and a deterministic PRF.

Sensitive clipboard content is cleared only when ownership can be established. Timers are best effort. Passwords remain masked until an explicit action, then hide automatically.

Icon images are fetched only in create/edit flows: explicitly from an image URL, or automatically from the website when there is no cached image or manual icon choice. Favicon discovery uses the HTTPS origin only, stripping credentials, path, query and fragment. It follows declared icon links and falls back to `/favicon.ico`; no third-party favicon service receives vault domains. The destination site sees the icon request. Browser hosting also sees the requested URL through its same-origin POST API. Neither cookies nor authorization headers are forwarded.

Image bytes are bounded to 512 KiB, checked for supported formats and bitmap dimensions, then stored as a data URI in encrypted item metadata. SVG is reduced to inert, self-contained drawing primitives. Rendering reads only these bytes; color edits, website edits, restart and offline use do not refresh a saved image. Explicitly choosing the default icon also prevents automatic replacement. Request cancellation, selection checks and editor unmounting discard late results. Image decoding on native uses no persistent renderer image cache. Brand and bank logos are bundled for offline selection.

The browser uses Expo SDK 57 server output to provide `/api/icon`. `app.config.ts` selects static output only for the desktop export wrapper, where Rust downloads resources through a bounded native command. The server and desktop downloader require public HTTPS destinations, validate DNS answers and pin each connection, revalidate redirects, enforce byte/time/concurrency limits and disable proxy/cookie forwarding. API replies use `Cache-Control: no-store`; the server retains no image cache. Native mobile uses Expo Fetch directly with bounded reads and cancellation. Browser deployment must serve both `dist/client` and `dist/server`; static-only hosting supports saved/bundled icons but cannot perform new cross-origin downloads.

On macOS, the bundled Swift helper uses `NSPasteboard.changeCount` and marks secret copies as concealed. A serialized native mutex and expiry timers clear only the matching clipboard ownership token. Device lock, suspend and explicit app lock immediately lock the session. Window and application focus events start a configurable departure deadline, defaulting to three minutes; native file dialogs alone do not count as leaving the app. Views and drafts remain mounted during the grace period, then unmount on actual lock. Repeated background events cannot extend the deadline, and returning checks elapsed time before accepting activity. The foreground inactivity deadline is configured separately (five minutes by default). WebKit background throttling is disabled on macOS versions that expose this policy (14+), preserving timers while minimized. Older macOS behavior and physical lock/sleep still require testing on those OS versions.

The renderer loads bundled `tauri://localhost` assets in an incognito WebView. CSP denies remote scripts, connections and frames; new windows are denied. Only the bundled main window may call validated commands. Frontend capabilities permit lifecycle event subscriptions and window dragging/maximizing; filesystem, dialog, opener and updater plugins expose no direct frontend privileges. Rust opens validated HTTP(S) URLs through the system browser. Clipboard and lifecycle notifications use the same bundled Swift helper. Production packaging signs the app ad-hoc.

The Tauri updater checks a separate app-specific HTTPS channel after startup and every six hours while visible. Native state owns the checked release and accepts only its version for download/restart. The plugin verifies the signature and signed version before installing. Downloads and restarts require separate user actions. The desktop restart guard rejects dirty editors, fences new session operations, waits for previously queued saves, locks the session and clears the native clipboard before restart. See `AUTOUPDATE.md` for key handling and release preparation.

## KeePass boundary

Kdbxweb handles the KDBX parser, authenticated blocks, AES-KDF and ChaCha20 implementation. Its Argon2 hook uses the platform adapter. Input limits, supported-version checks and parameter limits precede expensive work. Files are previewed before conversion. The source KDBX is never written. Groups, fields, timestamps, tags, binary attachments and history map to domain entities; the original encrypted source is preserved inside the new encrypted vault for properties the UI cannot represent.

Compatibility means a recorded passing fixture test, not a general claim about every KDBX plugin. Hardware challenge-response, KDB 1.x, and bidirectional KDBX editing are outside the initial supported surface. Runtime/platform results are tracked separately from library tests.

## Migration and recovery

Readers dispatch by independent format/crypto/schema versions. Schema 1 is validated before `migrateV1ToV2`; schema 2 is validated afterward. Opening an older vault does not overwrite it. A later save verifies a new file and preserves the original as an encrypted backup. Future schemas are rejected without writing. Restore and password changes follow the same verified-save path. A changed on-disk revision produces a conflict, never an automatic merge.

## UX

The desktop presentation follows the later macOS Light design: sidebar #F3F4F6, accent #3559C7, border #E3E5EA and text #15171C. Vietnamese labels, Geist, Geist Mono and Material Symbols are bundled locally. Native desktop uses the real window controls. The shared native presentation retains Green Deck tokens and bundled DM Sans/JetBrains Mono. Responsive desktop layouts provide sidebar/list/detail, rail and table views. Empty vaults begin empty: the production bundle does not contain fake credentials.

At 760–1000 px, the desktop window keeps its sidebar and shows either the list or the detail pane; wider windows show all three panes. Field layout follows the available pane width. Layout, list density and reduced motion persist in device preferences. Folder order is stored in the encrypted folder array: a drop near the top/bottom of a row inserts before/after, the middle nests inside, and the root target moves a folder back to the top level. Descendant/cycle and foreign-vault drops are rejected. The folder menu and Option+Up/Down/Left provide alternatives to dragging, while a collapsed parent expands after a short drag hover.

## Execution gates

1. Strict TypeScript, routing foundation, tokens, test harness.
2. Argon2/AES-GCM round trip, wrong-password and tamper tests.
3. File codec, transaction/recovery tests, checked-in schema fixtures.
4. Upstream KeePass fixtures through conversion and encrypted reopen.
5. Core responsive UI and editing/search.
6. Session, clipboard, screen capture and biometric protection.
7. Backup, restore, import/export and credential rotation.
8. Unit/integration/E2E, lint, typecheck, desktop build and signed-bundle launch checks.

Native device results, browser results, physical security tests and remaining release gates must be reported separately. Passing a JavaScript suite is not a native security audit.

[Appkiro website](https://appkiro.com)
