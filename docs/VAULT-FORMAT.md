# Vault format, version 1

The application version is independent of `formatVersion`, `cryptoVersion` and `schemaVersion`. The current reader accepts format 1, crypto 1 and payload schemas 1–2. The current writer always emits schema 2.

Exported vaults and external backups use the `.akpr` extension. Legacy `.vault` files remain readable with the same password and binary format. Internal journal generations and compatibility fixtures retain their existing `.vault` paths; changing the public extension does not migrate stored data or change encryption.

## Binary layout

| Offset | Length | Contents |
| --- | --- | --- |
| 0 | 8 bytes | UTF-8 magic `KIROVLT\0` |
| 8 | 4 bytes | Unsigned big-endian JSON header byte length |
| 12 | Header length | UTF-8 JSON header |
| 12 + header length | Remaining bytes | AES-256-GCM ciphertext followed by a 16-byte authentication tag |

The exact prefix and header bytes, including JSON whitespace/property order, are authenticated as AES-GCM additional authenticated data. A reader must authenticate the original bytes and must not reserialize the header first. Nonces are 12 random bytes, salts are 16 random bytes, and keys are 32 bytes. Binary header values use standard base64.

The header has these properties; all objects reject unknown keys:

```ts
{
  formatVersion: 1,
  cryptoVersion: 1,
  schemaVersion: 1 | 2,
  vaultId: string,
  kdf: {
    algorithm: 'argon2id', version: 19,
    memoryKiB: number, iterations: number, parallelism: number,
    salt: string
  },
  cipher: { algorithm: 'aes-256-gcm', nonce: string }
}
```

Names, fields, folders, history, attachments and imported metadata are in the encrypted payload. The random `vaultId` and KDF cost are visible. The decrypted payload ID must match the authenticated header ID. File size is limited to 64 MiB and header size to 4096 bytes.

## KDF policy

New vaults use Argon2id version 19, 65,536 KiB and one lane. Calibration starts at three passes, targets approximately 750 ms, and may select three through eight passes. It never weakens the memory or pass floor. Each new vault, Save As and password change gets a fresh salt. Every save gets a fresh nonce.

Readers retain older stored parameters and do not silently replace them with current defaults. Shared import limits permit 8–262,144 KiB, 1–512 passes, 1–16 lanes, at least eight KiB per lane and `memoryKiB * iterations <= 8,388,608`. A lower valid cost can be necessary for historical fixtures; those limits are not the policy for newly created vaults. The desktop worker supports Argon2 version 19 and enforces a 60-second work timeout.

## Payload migration

Schema 1 is validated before `migrateV1ToV2`. Schema 2 adds the vault revision counter and explicit archive/trash timestamps. Migration occurs in memory and validates the complete result. Opening an old vault does not write it. Saving a migrated model first creates an encrypted backup of the original bytes even if automatic backups are off.

Fixtures `fixtures/vault/schema-v1.vault` and `schema-v2.vault` contain fake credentials and use the public test password `fixture-only-password`. Their intentionally small test KDF is never used by the new-vault UI. Every release must run both fixtures through the current reader; future schemas are rejected without a write.

## Desktop commit and conflict semantics

The file port writes an exclusive `.vault.tmp` with mode `0600`, flushes it with `fsync`, reads it back and authenticates it. Promotion creates an exclusive same-volume hard link to a new generation, flushes the parent directory and removes the staging link. The destination is read and authenticated again before the generation is treated as saved. There is no truncate-and-rewrite of the current vault.

Generation filenames order committed revisions; hashes in revision tokens detect outside changes. The current and previous generation remain available. Housekeeping failures cannot turn a completed save into a reported save failure. Metadata files contain only vault labels/timestamps and are rebuildable. A broken newest generation is not silently replaced with an old one: recovery is explicit.

Conflicts offer Reload, Save As, Review Changes and Cancel. Save As verifies the password against the last verified revision, preserves the in-memory draft and writes a separate vault with a fresh ID, salt and key. No automatic merge is promised.

Filesystem durability still depends on the disk and operating system. Immutable generations and external encrypted backups reduce recovery risk; they cannot guarantee survival of every hardware failure.
