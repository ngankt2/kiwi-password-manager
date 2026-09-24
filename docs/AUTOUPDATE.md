# Desktop updates

The macOS app checks its dedicated channel three seconds after startup and every six hours while visible:

`https://raw.githubusercontent.com/ngankt2/appkiro.com/main/updates/appkiro-password-manager/latest.json`

Users can also check from Settings, the app menu, or the footer version. An available release displays a notice and plain-text notes. Download/install and restart require separate actions. Dirty editors block restart. Queued saves must finish, new writes are fenced, and the session/clipboard are cleared before restarting.

The Rust host owns the checked release; the UI supplies only its version. It rejects URLs outside this app's exact GitHub release namespace, serializes operations, and discards stale releases after a failed check. Tauri verifies both the Minisign signature and its signed version before installation. Debug apps cannot install updates. No updater privileges, filesystem paths or shell execution are exposed directly to the renderer.

## Keys and builds

The public key is kept in `desktop/tauri/updater.pub` and in the Tauri configuration. The app-specific private key is stored outside source at `~/.config/appkiro/signing/appkiro-password-manager.key`, with mode `0600`. It is separate from all other apps' keys. Back it up securely; replacing it would prevent existing installations from verifying updates.

`bun run build:macos` reads `TAURI_SIGNING_PRIVATE_KEY` when supplied, otherwise uses that local path. Encrypted keys use `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Never put a private key in source, a release folder, a command argument or a public manifest. Builds on machines without a key can use `bun run build:macos --no-updater`; that creates the app without a publishable update payload.

Every build increases the patch version and native counters. To include release notes, pass a UTF-8 file:

```sh
bun run build:macos --notes-file /absolute/path/to/release-notes.txt
```

The resulting `desktop-release/tauri-<version>/` contains:

- `Kiro Password Manager.app`
- `KiroPasswordManager_<version>_<arch>.app.tar.gz` and its `.sig`
- `latest.json`, containing only the architecture that was built
- `updater.pub`

The app is currently ad-hoc signed. Updater signatures authenticate payloads; they do not replace Apple Developer ID signing or notarization. Read-only/translocated bundles must be moved to a writable installed location before updating.

## Local verification and publication

`test:desktop:host` uses a throwaway key and synthetic signed app to test successful installation, tampering, signed-version mismatch, missing signed versions, downgrades and unpublished channels. It never installs into a real application.

After a production build, verify its actual signature and install the payload into a disposable copy:

```sh
KIRO_TEST_RELEASE_DIR="$PWD/desktop-release/tauri-<version>" cargo test --manifest-path desktop/tauri/Cargo.toml --lib packaged_release_signature_version_and_installation_are_valid -- --ignored
```

The separate release repository is `/Users/ngannv/app/appkiro.com`. Its local registration uses `updates/appkiro-password-manager/latest.json` with an initially empty platform map and the public updater key. Validate and review publication without changing any remote state:

```sh
python3 /Users/ngannv/app/appkiro.com/scripts/validate-updates.py
python3 /Users/ngannv/app/appkiro.com/scripts/publish-release.py appkiro-password-manager /absolute/path/to/release-artifacts
```

Publishing is a separate explicit action. Until the registration and a tested release are published, the public channel will not offer an update. Earlier desktop binaries without an updater need one manual installation of this first Tauri release. Release tags use `appkiro-password-manager-v<version>` and never change another app's channel.
