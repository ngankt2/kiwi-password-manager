# Threat model

## Assets and assumptions

Assets are the master password, derived key, decrypted fields, OTP seeds, private keys, card data, attachment bytes and historical versions. The OS, CSPRNG, cryptographic providers and installed application code must be trustworthy. The user must choose a strong password and retain an independent encrypted backup.

## Attacks covered by design and regression tests

- A stolen vault is protected by calibrated Argon2id and authenticated encryption. The header contains no vault name or searchable credential metadata.
- Modified headers/ciphertexts and wrong keys fail authentication. Files and KDF work are bounded before expensive processing.
- Interrupted or failed saves retain a previously valid encrypted generation. Verification reads actual persisted bytes, not the pre-write buffer.
- Stale asynchronous operations cannot repopulate a locked session. Decrypted state is never persisted through UI middleware.
- Search excludes secret/custom-protected fields; list subtitles never use secret fields.
- Clipboard expiry checks current content/ownership and never blindly clears a new user copy.
- Imported files are untrusted; schema validation, graph integrity checks, import previews and safe messages form the boundary.
- File conflicts require explicit reload or Save As. No automatic merge is claimed.
- Desktop renderer code cannot call arbitrary Node APIs, read arbitrary paths over IPC or connect to external servers. Imported data is never executed as HTML. Only the trusted main frame may use the bridge.
- Native updates verify an app-specific signature and signed version before installation. The renderer cannot supply arbitrary URLs or install paths. Release notes render as plain text; failed checks invalidate previously offered releases.
- Desktop local files use private permissions and verified durable writes. A single-instance lock protects against two copies of the app writing the same profile. Backup retention never guesses ownership of unrelated files.
- Web quick unlock stores only an authenticated key wrapper. The wrapper requires a credential-specific WebAuthn PRF result obtained with user verification. Wrong origins/challenges, missing presence/verification, forged ES256 assertions, substituted credential IDs, changed vault bindings and modified wrappers are rejected. Enrollment and removal require the master password; cancellation and locking do not bypass authentication.

## Residual risks

JavaScript strings, component props and garbage-collected/native temporary buffers cannot be reliably zeroized. The application overwrites mutable key/plaintext buffers where possible and minimizes references; this is not a secure-memory guarantee. A rooted/jailbroken OS, injected browser extension, debugger, compromised dependency or running process can observe unlocked data. An attacker can replay a valid older encrypted file; cryptographic authenticity alone cannot prove freshness without a separate trusted monotonic record.

Clipboard APIs and background timers are subject to OS/browser restrictions, and other applications may retain copied values. Screen-capture prevention does not stop an external camera. Browser storage can be evicted and does not provide OS biometric protection. Expo's portable filesystem APIs do not guarantee fsync after power loss; recovery generations and external backups reduce this risk but do not justify a claim that data loss is impossible.

On macOS, Tauri window content protection is enabled but newer ScreenCaptureKit capture paths may bypass it. It is not a promise that screenshots are impossible. Switching applications or minimizing starts a configurable grace period (three minutes by default); decrypted views and unsaved drafts remain available during that period. Returning before the deadline cancels it. Expiry, explicit lock, device lock or suspend clears the session and unmounts secret views. The grace period can be disabled in Settings after authentication, extending the period in which unlocked data remains accessible. Physical lock/sleep, OS capture tools and accessibility attacks still require device-specific review. A running privileged process can read this app's memory regardless of renderer sandboxing. Touch ID is unavailable in this desktop build.

Vault labels, recent-file paths, preferences and external-backup filenames are not secret storage. Use a non-sensitive vault name if those labels themselves would reveal private information. Credentials and persistent search indexes are never stored there. Explicit plaintext JSON/attachment exports are an exception chosen by the user after authentication, and remain readable at the selected destination.

Imported source archives and history intentionally retain old secrets until explicitly removed. Changing the master password does not revoke copies/backups encrypted with the old password. Biometric quick unlock increases the trust placed in the device's secure storage and enrolled biometrics. Passkey unlock also trusts the selected authenticator and its provider's recovery/synchronization policy. Providers can offer device PIN verification instead of biometrics. Appkiro does not promise Face ID specifically for every web passkey. A stolen old wrapper together with the corresponding old encrypted vault can still be used by someone who can authenticate to that passkey; local revocation cannot erase copies held elsewhere. Clearing browser storage removes the local enrollment but does not delete provider-managed passkeys.

## Release requirements

The supplied macOS package is an ad-hoc signed local test build. Developer ID signing, notarization, independent security review, physical device lock/sleep testing, disk-full/power-loss testing on real filesystems and distribution/update policy remain release gates. The core has fault-injection regression tests; they do not substitute for destructive hardware testing.

If mobile targets are resumed, run Argon2 fixtures and file fault tests on both physical iOS and Android devices, including biometric enrollment changes and screenshot/app-switcher behavior. Those tests are not implied by desktop results. Dependency advisory scans are useful evidence, not an independent audit of kdbxweb, cryptographic primitives or the application.
