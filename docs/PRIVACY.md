# Kiwi Password Privacy Policy

Last updated: October 17, 2026

This policy explains how Kiwi Password, built by AppKiro, handles your data. The in-app version is in `src/core/i18n/privacy.ts` and `src/features/about/privacy.ts`; keep both in sync and publish this page at the Privacy Policy URL in App Store Connect.

## Data we collect

AppKiro does not collect, store or receive any data you enter in the app. The app has no online account, usage analytics, advertising or tracking.

## Data on your device

Your vault is encrypted with AES-256-GCM using a key derived from your master password with Argon2id, and it is stored only on your device. Your master password is never stored or sent anywhere.

Encrypted vault files may be included in device backups if you turn on your operating system's backup, such as iCloud. App settings such as language, appearance and auto-lock times are stored locally and contain no passwords.

## Network connections

When an item has a website address, the app may download its icon or favicon directly from that website. The website can see your IP address, just as it would when you visit it. Passwords and vault contents are never sent.

The desktop app checks GitHub for updates. The web version downloads icons through the server hosting the page to work around browser limits; that server only receives the website address of the icon.

## Export and sharing

Data leaves your device only when you choose to export or share a file. `.akpr` files are always encrypted. JSON exports are plain text, so protect them and delete them when you no longer need them.

## Biometrics

Face ID, Touch ID and other biometric methods are used only for quick unlock through the operating system. The app never receives your biometric data.

## Deleting your data

You can delete a vault in its vault settings, or uninstall the app to remove all local data. Because we do not store your data, we cannot recover your vault or master password.

## Changes and contact

When this policy changes, we will update the date at the top of this page. If you have a privacy question, contact AppKiro through the [support page](https://appkiro.com/contact).
