This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Mandatory version increase for every app build

- Every application build, including rebuilds and `desktop:prepare`, MUST increase the patch version before exporting or packaging. Auxiliary worker compilation, lint, tests, and development servers are not application builds.
- Use the versioned package commands: `build:web`, `build:desktop:web`, `desktop:prepare`, `build:macos`, `release:macos`, `build:ios`, `build:ios:appstore`, `build:android`, `build:native`, `build:mobile:cloud`, `ios`, or `android`. Do not bypass them with raw Expo export/run, EAS build, Tauri build/dev, or Cargo build commands. Direct execution of `scripts/build-desktop.ts` also performs the required bump and fresh export. `cargo check`, `cargo test` and `cargo fmt` are checks, not app builds.
- `scripts/build-version.ts` synchronizes `package.json`, `app.json`, iOS `buildNumber`, Android `versionCode`, `desktop/tauri/Cargo.toml` and the app entry in `Cargo.lock` before building. Keep these updated values after a build, including a failed build; do not roll versions back or reuse an old renderer export.
- One complete build receives one version increase. Nested worker/export/packaging steps must not bump again. Keep EAS version source local and automatic increment disabled because the wrapper increments both native counters.
- Report the resulting version and verify the packaged application and visible version agree. When committing build work at the user's request, include the synchronized version files.

## Desktop release & auto update (macOS)

When a desktop build is meant for users (a "release", "phát hành", "build bản mới cho người dùng"), ship it through the update channel. Details: `docs/AUTOUPDATE.md`.

- Release command: `bun run release:macos --notes-file <file>`. It is the only path that bumps, builds separate Apple Silicon and Intel apps, signs them with Developer ID and notarizes them, signs the update archives, creates notarized DMGs and `latest.json`, and publishes to GitHub Releases. `build:macos` alone builds without publishing (local testing only).
- Write user-facing release notes (what changed, in the app's languages if appropriate) to a file outside the repo, e.g. the scratchpad, and show them to the user before releasing. Never publish with empty or placeholder notes.
- Release builds must be Developer ID signed and notarized; never publish ad-hoc (`--no-updater`) builds or skip notarization.
- Publishing to GitHub is outward-facing: confirm with the user before running `release:macos` or `publish:macos`.
- `https://github.com/ngankt2/kiwi-password-manager` is the public open-source repository (GPL-3.0) and the update channel. It is the `github` remote; push to it only when the user asks. Never commit secrets, signing keys, certificates, private vaults or machine-specific reports there: everything pushed is public.
- Tags are `v<version>`. Never delete, replace or re-upload assets of a published release; fix problems with a newer version. If only the publish step failed, retry with `bun run publish:macos <version>` (no rebuild, no extra bump).
- Never change the updater public key (`desktop/tauri/updater.pub`, `tauri.conf.json`) or move the channel URL without the user's explicit request: existing installs would stop receiving updates. Never commit, print or upload the private signing key.
- After publishing, report the version, the release URL and that `releases/latest/download/latest.json` reports the new version.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
