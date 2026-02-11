# Seed Vault

Self-contained, offline, quantum-resistant HTML vault for Ethereum seed phrases with multi-path derivation support.

Live app: [GitHub Pages](https://gh-stole-my-rstormsf-acc.github.io/inheritable-box-seeds/)
Download for offline usage: [Latest standalone HTML](https://github.com/gh-stole-my-rstormsf-acc/inheritable-box-seeds/releases/latest/download/seed-vault-standalone.html)

## Security Model

- **Offline by design**: Generated vault HTML contains all code and data needed to decrypt. No external requests are allowed.
- **Post-quantum hybrid KEM**: ML-KEM-768 combined with X25519 for shared-secret derivation.
- **Password mode**: Password → Argon2id (security-first params) → hybrid KEM → AES-256-GCM.
- **Shamir mode**: Random master seed split into k-of-n shares, then used to derive hybrid KEM key material.
- **AES-256-GCM**: Authenticated encryption with random nonce per vault.
- **No private keys**: Only derived EVM addresses are exposed for verification.
- **Memory hygiene**: Sensitive byte arrays are zeroed after use; decrypted data is cleared on page close.

## Usage Notes

- **Wizard order**: `Seeds -> Paths -> Files -> Security -> Finalize`.
- **Finalize is explicit download-only**: generation does not auto-save files; use:
  - `Download Seed Vault HTML`
  - `Download Ciphertext Instructions (.md)`
- **Optional encrypted file bundle**: Attach exports/backups (KeePass, 1Password, Proton Pass, etc.) in the `Files` step.
- **Vault view file recovery**: After decrypting the vault HTML, attached files appear in an `Attached Files` table with label, type, size, open hint, and per-file download.
- **Passphrases are revealable** in the decrypted vault UI (hidden by default, reveal toggle with auto-hide).
- **Derived addresses are grouped by seed + path + passphrase** in the vault UI.
- **Shamir shares must include an embedded ID prefix** like `1: <share>`. The vault decryption UI expects this format.
- **Passphrase labels are required** when a passphrase is set and are shown alongside passphrases in the vault UI.
- **CSV export includes the passphrase label only** (not the passphrase value).

## Development

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
```

### Tests

```bash
npm run test:unit
npm run test:e2e
```

For faster local branch iteration, run Chromium-only E2E:

```bash
npm run test:e2e:chromium
```

Node roundtrip proof (encrypt/decrypt ciphertext package in both modes):

```bash
npm run test:node:cipher-roundtrip
```

Before pushing to `main`, run the full `npm run test:e2e` suite.

### Fast crypto for tests

Use a low-cost Argon2 configuration in dev/test runs:

```bash
VITE_FAST_CRYPTO=true npm run dev
```

The generated vault stores the chosen parameters, so production builds remain security-first by default.

## Project Structure

- `src/creator` – Creator UI
- `src/vault` – Vault runtime and HTML template
- `src/shared` – Shared types, crypto, derivation utilities
- `tests` – Unit and E2E tests
