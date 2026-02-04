# Seed Vault

Self-contained, offline, quantum-resistant HTML vault for Ethereum seed phrases with multi-path derivation support.

## Security Model

- **Offline by design**: Generated vault HTML contains all code and data needed to decrypt. No external requests are allowed.
- **Post-quantum hybrid KEM**: ML-KEM-768 combined with X25519 for shared-secret derivation.
- **Password mode**: Password → Argon2id (security-first params) → hybrid KEM → AES-256-GCM.
- **Shamir mode**: Random master seed split into k-of-n shares, then used to derive hybrid KEM key material.
- **AES-256-GCM**: Authenticated encryption with random nonce per vault.
- **No private keys**: Only derived EVM addresses are exposed for verification.
- **Memory hygiene**: Sensitive byte arrays are zeroed after use; decrypted data is cleared on page close.

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
