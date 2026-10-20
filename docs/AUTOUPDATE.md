# Desktop updates

The macOS app checks its update channel three seconds after startup and every six hours while visible:

`https://github.com/ngankt2/kiwi-password-manager/releases/latest/download/latest.json`

Users can also check from Settings, the app menu, or the footer version. An available release displays a notice with its version and plain-text notes. Download/install and restart require separate actions. Dirty editors block restart. Queued saves must finish, new writes are fenced, and the session/clipboard are cleared before restarting.

The Rust host owns the checked release; the UI supplies only its version. It accepts downloads only from `https://github.com/ngankt2/kiwi-password-manager/releases/download/v<version>/`, serializes operations, and discards stale releases after a failed check. Tauri verifies both the Minisign signature and its signed version before installation. Debug apps cannot install updates. No updater privileges, filesystem paths or shell execution are exposed directly to the renderer.

## Release repository

[`ngankt2/kiwi-password-manager`](https://github.com/ngankt2/kiwi-password-manager) is a distribution-only repository. Never push this source tree or its history there. Its only commit is a generated README, created by the publish script when the repository is empty, so release tags have something to point at. Release tags are `v<version>`.

Each release contains:

- `KiwiPassword_<version>_universal.dmg` — installer for new users
- `KiwiPassword_<version>_universal.app.tar.gz` and its `.sig` — the signed update payload
- `latest.json` — the update manifest, listing the same universal archive for `darwin-aarch64` and `darwin-x86_64`

The release body is the release notes. Published releases are never replaced; fix a bad release by building a newer version.

## Keys

The public key is kept in `desktop/tauri/updater.pub` and in the Tauri configuration. The app-specific private key is stored outside source at `~/.config/appkiro/signing/appkiro-password-manager.key`, with mode `0600`. Back it up securely; replacing it would prevent existing installations from verifying updates.

Builds read `TAURI_SIGNING_PRIVATE_KEY` when supplied, otherwise that local path. Encrypted keys use `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Never put a private key in source, a release folder, a command argument or a public manifest.

## Build → sign → publish

Write the release notes for users to a UTF-8 file, then run one command:

```sh
bun run release:macos --notes-file /absolute/path/to/release-notes.md
```

It bumps the patch version (package.json, app.json, native counters, Cargo), builds a universal app (Apple Silicon + Intel), signs the update archive, creates the DMG, writes `latest.json`, and publishes everything to GitHub Releases with `gh`. Assets are uploaded into a draft that is published only once complete, and the script then confirms the public channel reports the new version. It refuses to publish without notes, over an existing tag, or a version that is not newer than the latest release.

Requirements: `gh` signed in with write access to the release repository, Rust targets `aarch64-apple-darwin` and `x86_64-apple-darwin`, and the signing key.

If publishing fails after a successful build (for example, a network error), publish the existing artifacts without rebuilding:

```sh
bun run publish:macos <version>
```

`bun run build:macos [--notes-file …]` builds the same artifacts in `desktop-release/tauri-<version>/` without publishing. `bun run build:macos --no-updater` builds a local app without an update payload on machines without the key.

The app is ad-hoc signed. Updater signatures authenticate payloads; they do not replace Apple Developer ID signing or notarization, so first-time installs from the DMG must be opened with Control-click → Open. Read-only/translocated bundles must be moved to `/Applications` before updating. Installations from before this channel (1.0.28 and earlier, which used the `ngankt2/appkiro.com` channel) need one manual install from the DMG.

## Verification

`test:desktop:host` uses a throwaway key and synthetic signed app to test successful installation, tampering, signed-version mismatch, missing signed versions, downgrades and unpublished channels. It never installs into a real application.

After a production build, verify its actual signature and install the payload into a disposable copy before publishing:

```sh
KIRO_TEST_RELEASE_DIR="$PWD/desktop-release/tauri-<version>" cargo test --manifest-path desktop/tauri/Cargo.toml --lib packaged_release_signature_version_and_installation_are_valid -- --ignored
```

[Appkiro website](https://appkiro.com)
