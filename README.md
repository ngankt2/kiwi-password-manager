# Kiro Password Manager

[Appkiro website](https://appkiro.com) · [App overview](https://github.com/ngankt2/appkiro.com/tree/main/apps/appkiro-password-manager) · [Downloads](https://github.com/ngankt2/appkiro.com/releases?q=appkiro-password-manager)

A password manager that keeps vault data on your device. Vaults are stored as encrypted `.akpr` files, with no online account, cloud sync, or telemetry. The desktop app uses **Tauri v2**, an Expo Web interface, a TypeScript core, and Expo Router. Expo iOS and Android use separate runtimes and platform adapters. Network connections are used to check for updates and download icons or favicons when creating or editing entries.

## Run the desktop app on macOS

Requirements: macOS 13 or later, Bun 1.4.2, Node 24, stable Rust, and Xcode Command Line Tools to compile the Rust host and Swift clipboard helper. These commands prepare and run the macOS desktop app:

```sh
bun install --frozen-lockfile
bun run desktop:prepare
bun run desktop:start
```

Package the app for the current machine's architecture:

```sh
bun run build:macos
```

The `.app`, `.app.tar.gz` update package, signature, and `latest.json` are written to `desktop-release/tauri-<version>/`. The default build requires an app-specific update signing key; see the [update guide](docs/AUTOUPDATE.md). Use `bun run build:macos --no-updater` to create a local package without an update signing key. The app is currently ad hoc signed. Update signatures do not replace Apple Developer ID signing or notarization.

Every application build, including `desktop:prepare` and rebuilds, increases the patch version before export. The build wrapper synchronizes `package.json`, `app.json`, the Rust manifest and lockfile, and the iOS and Android build counters. Keep the increased versions even if the build fails. Use the build commands in `package.json`; direct Expo export/run or EAS build commands bypass this versioning requirement. Worker compilation, tests, and development servers do not increase the application version.

Build the web app with `bun run build:web` and preview it with `bun run preview:web`. Expo server output (`dist/client` and `dist/server`) provides the same-origin `/api/icon` endpoint, which downloads images from websites that do not allow browser CORS requests. Deploy both the client and server with an Expo Server adapter; static hosting alone cannot provide image downloads from URLs. The desktop wrapper exports a static renderer and downloads icons through the native host. Build mobile apps on EAS with `bun run build:ios --profile production` or `bun run build:android --profile production`; EAS uses the locally increased version.

The original logo is in `assets/branding/appkiro-original.png`. The interface uses its symbol for clarity at small sizes. The app icon uses separate artwork with a gradient background from `assets/branding/appkiro-app-icon-original.png`. Regenerate transparent PNGs, favicons, splash images, and platform icons with `python3 scripts/prepare-branding.py` (requires Pillow).

## Testing

```sh
bun run verify
bun run desktop:prepare --runtime-tests
bun run test:desktop:host
bun run test:desktop:native
bunx playwright install webkit
bun run test:desktop
bun audit
```

Native tests launch the real Tauri/WKWebView app with temporary data directories. They cover opening existing files, saving, creating vaults, restarting, the system clipboard, IPC boundaries, and window operations. Rust tests cover the filesystem, conflicts, permissions, backups, and signed update installation. Run these test groups sequentially because both exercise the clipboard.

The `test:desktop` suite uses Playwright WebKit with a UI test bridge. It covers editing, icons, search, drag and drop, three layouts, TOTP, backup and restore, password changes, JSON export, update notices, and draft protection. This suite does not run the native Tauri host; macOS has no official Tauri WebDriver. Screenshots and reports use synthetic data.

Tests against a private KeePass file require an explicit path and a password supplied through the environment. Do not store that password in source files or `.env`:

```sh
read -r -s KIRO_TEST_PASSWORD
export KIRO_TEST_PASSWORD
bun run test:kdbx:local '/absolute/path/to/test.kdbx'
KIRO_TEST_KDBX='/absolute/path/to/test.kdbx' bun run test:desktop
unset KIRO_TEST_PASSWORD
```

Private-file tests report only counts and status. They do not write entry contents or passwords to reports. The source KDBX file remains unchanged, and converted test output is removed after the run. Files matching `tests/Passwords*.kdbx` are excluded from Git and application bundles.

## Data and core workflows

- Create a vault with a master password of at least 12 characters. Open `.akpr` files, legacy `.vault` files, or import `.kdbx` files through Finder. The rules for creating a new master password do not apply to passwords for existing KDBX files.
- Preview imported data before creating a new vault. Groups, custom fields, history, attachments, timestamps, tags, and OTP settings are retained. KeePass data that cannot be represented directly is preserved in metadata and an encrypted copy of the source.
- Search with `⌘K`, add with `⌘N`, edit with `⌘E`, save with `⌘S`, and lock with `⌘L`. Passwords are masked by default and automatically hidden after being revealed.
- Sidebar tag badges show the number of active entries. Select a tag for exact filtering, then select it again or clear the filter to return to all entries. Both the full sidebar and compact layout support tag filtering.
- Choose a bundled brand or bank logo, or download an image from an HTTPS URL. An entry's website supplies its favicon automatically when no image or manual icon choice exists. Favicon requests include only the website origin; paths, queries, and credentials are removed. Images are stored in encrypted metadata and included in history and backups. Opening a vault, viewing an entry, or changing its website does not download the image again. Choosing a new image or icon replaces it. Supported formats are PNG, JPEG, WebP, GIF, SVG, and ICO, up to 512 KB; bitmap dimensions are limited to 1024 × 1024 pixels. Bundled logos work offline.
- Switching to another app, hiding the window, or minimizing it starts a default **three-minute** lock timer. Returning before the deadline preserves the screen and draft. Change the delay in **Settings → Security → Lock after leaving the app**. The inactivity timeout is configured separately. Locking the screen or putting the Mac to sleep locks the vault immediately.
- Drag folders up or down to reorder them, or onto the center of another folder to nest them. The **Drop here to move to the vault root** area appears while dragging. Hover over a collapsed folder to open it. The `…` menu and `⌥↑`, `⌥↓`, and `⌥←` shortcuts also move folders.
- Layout, list density, and reduced-motion preferences persist after the app closes. Smaller windows keep the sidebar and show either the list or entry details for readability.
- Settings provides access to backup and restore, data export, and vault management. Encrypted `.akpr` export is the default. Exported backups and copies in external folders use the same extension. Unencrypted JSON export requires a warning and master-password verification.
- **Settings → Sign-in & unlock** can enable passkeys in browsers that support WebAuthn PRF, or Face ID, Touch ID, and other supported biometrics in the iOS and Android apps. Enabling or disabling quick unlock requires the master password. Passkeys may use Face ID, Touch ID, Windows Hello, or a security key, depending on the browser and device; not every passkey supports vault decryption. Quick unlock applies only to the vault on the device or browser where it was configured and must be configured again after a master-password change. The Tauri app's internal protocol does not yet support passkeys or Touch ID directly.
- Each save writes a new encrypted generation and reads it back for verification before accepting it. The previous generation is always retained. Automatic backups, manual backups, and copies made before migration, restore, or password changes are managed separately.

The desktop app continues to use `~/Library/Application Support/Kiro Vault`. Existing `encrypted-files/`, `preferences.json`, file links, and backup settings are read in place. Changing the desktop runtime does not copy, reformat, or delete vault data. External `.akpr` and `.vault` files continue to save to their selected locations after revision checks; source KDBX files remain read-only. Settings allows you to change the vault location and select additional external backup folders.

Vaults and backups contain encrypted data. Preferences and recent vault names are unencrypted metadata; entry names, passwords, and search indexes are not written as plaintext. Changing the master password does not change the passwords on existing backups.

## Documentation and status

- [Desktop migration and verification](docs/DESKTOP-MIGRATION.md)
- [Application updates and release signing](docs/AUTOUPDATE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Vault format and compatibility](docs/VAULT-FORMAT.md)
- [Threat model and protection limits](docs/THREAT-MODEL.md)
- [Dependencies and patches](docs/DEPENDENCIES.md)
- [Historical test report and compatibility matrices](docs/RELEASE-REPORT.md)

Touch ID on macOS, KDBX export, CSV mapping, and cloud sync are not available. Mobile platform adapters are included in the source but are outside this desktop release. This is a working test build; it has not undergone an independent security audit and is not presented as production-ready.
