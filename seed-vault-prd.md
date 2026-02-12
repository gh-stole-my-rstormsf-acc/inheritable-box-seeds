# Seed Vault PRD

> A self-contained, offline, quantum-resistant HTML vault for Ethereum seed phrases with multi-path derivation support.

---

## Problem Statement

Managing Ethereum seed phrases across multiple HD derivation paths (BIP-44, Ledger Legacy, Ledger Live) with optional BIP-39 passphrases is error-prone and insecure. Existing solutions either require trusting third-party software, lack offline capability, or don't support the complexity of real-world wallet configurations. Users need a portable, future-proof way to store this critical information that survives software obsolescence and quantum computing threats.

---

## Goals

1. **Security**: Provide quantum-resistant encryption that protects seed phrases for 20+ years
2. **Portability**: Generate a single self-contained HTML file that works offline in any modern browser
3. **Completeness**: Support multiple seeds, each with multiple HD paths and optional passphrases
4. **Durability**: Create read-only vaults that cannot be accidentally modified after creation
5. **Usability**: Family-friendly UI that doesn't intimidate non-technical users

---

## Non-Goals

1. **Online features**: No cloud sync, no network requests, no external dependencies
2. **Editing**: Vaults are immutable after creation; create a new vault to make changes
3. **Private key export**: Never display or export private keys; only addresses for verification
4. **Hardware wallet integration**: No USB/Bluetooth connectivity; manual entry only
5. **Wallet functionality**: No transaction signing, no balance checking

---

## User Stories

### Creator Flow

**As a crypto holder**, I want to create an encrypted vault containing my seed phrases so that I can securely back up my wallet configurations.

**As a privacy-conscious user**, I want to choose between password encryption or Shamir secret sharing so that I can select the security model that fits my threat model.

**As a multi-wallet user**, I want to store multiple seed phrases in one vault so that I don't need separate files for each wallet.

**As a Ledger user**, I want to configure different HD paths (BIP-44, Ledger Legacy, Ledger Live) per seed so that I can track all my derived accounts.

**As a passphrase user**, I want to associate different BIP-39 passphrases with different HD paths so that I can document my hidden wallets.

### Reader Flow

**As a vault owner**, I want to decrypt my vault with my password or Shamir shares so that I can access my seed phrases when needed.

**As a verification user**, I want to derive addresses from my stored configuration so that I can verify I recorded the correct information.

**As an organized user**, I want to export derived addresses to CSV so that I can maintain a reference list without exposing private keys.

---

## Requirements

### P0 — Must Have

#### Encryption & Security

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| SEC-01 | Support password-based encryption using Argon2id for key derivation | Security-first: time cost ≥4, memory cost ≥512MB; accept up to 85s on mobile |
| SEC-02 | Support Shamir Secret Sharing with user-defined threshold (k-of-n) | User selects k and n; minimum k=2, maximum n=10 |
| SEC-03 | Use ML-KEM-768 (CRYSTALS-Kyber) + X25519 hybrid for key encapsulation | Implemented via @noble/post-quantum library |
| SEC-04 | Use AES-256-GCM for symmetric encryption | Authenticated encryption with random nonce per vault |
| SEC-05 | Zero network requests in both creator and vault | CSP blocks all external connections; works air-gapped |
| SEC-06 | Clear sensitive data from memory after use | Explicit zeroing of seed phrases, keys, passphrases after operations |

#### Data Model

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| DATA-01 | Support multiple seed phrases per vault | No artificial limit; UI handles 1-20 seeds gracefully |
| DATA-02 | Support 12, 18, and 24-word BIP-39 seed phrases | Validate checksum on entry |
| DATA-03 | Support multiple HD paths per seed | Preset options: BIP-44 (m/44'/60'/0'/0), Ledger Legacy (m/44'/60'/0'), Ledger Live (m/44'/60'/x'/0/0) |
| DATA-04 | Support custom HD derivation paths | Validate path format; allow any valid BIP-32 path |
| DATA-05 | Support optional BIP-39 passphrase per HD path | Empty string = no passphrase; store association clearly |
| DATA-06 | User-configurable address derivation count | Derive 1-100 addresses per path; default 10 |
| DATA-07 | Support password hints | Optional hint stored unencrypted in vault |

#### Output & Portability

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| OUT-01 | Generate single self-contained HTML file | All JS/CSS inlined; no external resources; <2MB total |
| OUT-02 | Vault works offline in any modern browser | Tested: Chrome, Firefox, Safari, Edge (latest 2 versions) |
| OUT-03 | Vault is read-only after creation | No edit functionality; data cannot be modified |
| OUT-04 | Export derived addresses to CSV | Columns: seed_label, hd_path, passphrase_hint, address_index, address |

#### User Interface

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| UI-01 | Mobile-responsive design | Fully functional on 320px-wide screens |
| UI-02 | Seed phrases hidden by default with reveal toggle | Click/tap to show; auto-hide after 30 seconds |
| UI-03 | Family-friendly visual design | Soft colors, clear typography, no "hacker" aesthetic |
| UI-04 | Progress indication during encryption/decryption | Show spinner and estimated time for long operations |
| UI-05 | Clear error messages | Human-readable errors; no technical jargon |

### P1 — Nice to Have

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| P1-01 | Dark mode support | Respects system preference; manual toggle available |
| P1-02 | QR code display for derived addresses | Generate QR on-demand; not stored in vault |
| P1-03 | Print-friendly vault summary | Print view shows labels and hints only; no secrets |
| P1-04 | Keyboard navigation | Full accessibility via keyboard |
| P1-05 | Multiple language support | English default; i18n-ready architecture |

### P2 — Future Considerations

| ID | Requirement | Notes |
|----|-------------|-------|
| ~~P2-01~~ | ~~Support for other chains (Bitcoin, Solana)~~ | **Removed** — EVM only; out of scope |
| P2-02 | Vault versioning/migration | Upgrade encrypted vaults to new crypto standards |
| P2-03 | Steganography mode | Hide vault inside innocent-looking image |
| P2-04 | Time-locked decryption | Vault only decryptable after specified date |

---

## Technical Architecture

### Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Build Tool | Vite | Fast builds, native ES modules, excellent tree-shaking |
| Language | TypeScript | Type safety for security-critical code |
| UI Framework | Vanilla JS + Web Components | Minimal bundle, no framework overhead, long-term stability |
| Styling | CSS (no framework) | Native CSS with custom properties; minimal footprint |
| Crypto (PQC) | @noble/post-quantum | Auditable, minimal, pure JS, no WASM dependency issues |
| Crypto (Classic) | noble-hashes, noble-ciphers | Same author; consistent API; audited |
| HD Derivation | @scure/bip32, @scure/bip39 | Audited implementations by same author |
| Shamir | @noble/shamir or custom | Compatible with noble ecosystem |
| Testing | Vitest (unit), Playwright (E2E) | Vite-native; fast; reliable |

### Project Structure

```
seed-vault/
├── src/
│   ├── creator/           # Vault creation app
│   │   ├── crypto/        # Encryption logic
│   │   ├── derivation/    # HD path derivation
│   │   ├── validation/    # Input validation
│   │   ├── main.ts        # Pages entry logic
│   │   └── main.standalone.ts  # Standalone entry logic
│   ├── vault/             # Embedded vault template
│   │   ├── runtime.app.ts # Shared runtime UI logic
│   │   ├── runtime.password.ts
│   │   ├── runtime.shamir.ts
│   │   ├── runtime.password.bundle.js
│   │   ├── runtime.shamir.bundle.js
│   │   ├── template.ts
│   │   └── template.html
│   └── shared/            # Shared utilities
│       ├── constants.ts
│       ├── types.ts
│       └── utils.ts
├── tests/
│   ├── unit/              # Vitest unit tests
│   └── e2e/               # Playwright E2E tests
├── dist/                  # Build output artifact
│   └── index.html         # Pages build or standalone artifact (depending on command)
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

### Data Schema

```typescript
interface Vault {
  version: 1;
  created: string;                    // ISO 8601 timestamp
  hint?: string;                      // Optional password hint
  encryption: PasswordEncryption | ShamirEncryption;
  payload: string;                    // Encrypted VaultData as base64
}

interface PasswordEncryption {
  type: 'password';
  algorithm: 'argon2id-mlkem768-aes256gcm';
  argon2: {
    salt: string;                     // base64
    timeCost: number;
    memoryCost: number;
    parallelism: number;
  };
  mlkem: {
    encapsulatedKey: string;          // base64
  };
  nonce: string;                      // base64, for AES-GCM
}

interface ShamirEncryption {
  type: 'shamir';
  algorithm: 'shamir-mlkem768-aes256gcm';
  threshold: number;                  // k shares needed
  totalShares: number;                // n shares created
  shareIdentifiers: string[];         // Which shares exist (not the shares themselves)
  mlkem: {
    encapsulatedKey: string;
  };
  nonce: string;
}

interface VaultData {
  seeds: SeedEntry[];
}

interface SeedEntry {
  label: string;                      // User-friendly name
  mnemonic: string;                   // BIP-39 words (space-separated)
  paths: PathConfig[];
}

interface PathConfig {
  label: string;                      // e.g., "Main Wallet", "Hidden Stash"
  path: string;                       // e.g., "m/44'/60'/0'/0"
  passphrase: string;                 // BIP-39 passphrase (empty = none)
  deriveCount: number;                // How many addresses to derive
}
```

### Security Model

```
┌─────────────────────────────────────────────────────────────────┐
│                     ENCRYPTION FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Password Mode:                                                │
│   ┌──────────┐    ┌─────────┐    ┌──────────┐    ┌──────────┐  │
│   │ Password │───▶│ Argon2id│───▶│ ML-KEM   │───▶│ AES-256  │  │
│   │          │    │ (KDF)   │    │ (Hybrid) │    │ -GCM     │  │
│   └──────────┘    └─────────┘    └──────────┘    └──────────┘  │
│                                                                 │
│   Shamir Mode:                                                  │
│   ┌──────────┐    ┌─────────┐    ┌──────────┐    ┌──────────┐  │
│   │ k-of-n   │───▶│ Shamir  │───▶│ ML-KEM   │───▶│ AES-256  │  │
│   │ Shares   │    │ Combine │    │ (Hybrid) │    │ -GCM     │  │
│   └──────────┘    └─────────┘    └──────────┘    └──────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Success Metrics

### Leading Indicators (measure during development)

| Metric | Target |
|--------|--------|
| Unit test coverage | ≥90% for crypto modules |
| E2E test pass rate | 100% across target browsers |
| Bundle size (creator) | <5000KB gzipped |
| Bundle size (vault) | <2000KB total (inlined) |
| Lighthouse performance score | ≥70 on mobile |
| Encryption time (mobile) | <85 seconds for typical vault |

### Lagging Indicators (measure post-launch)

| Metric | Target |
|--------|--------|
| Successful vault creation | Track via optional anonymous telemetry |
| Decryption success rate | 100% (vaults never fail to decrypt with correct key) |
| Cross-browser compatibility | Zero browser-specific bugs reported |

---

## Resolved Questions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Should we support legacy PBKDF2 mode for browser compatibility fallback? | **No** | Target modern browsers only; no legacy fallback needed |
| What Argon2 parameters balance security vs. mobile performance? | **Security first** | Use desktop-tier parameters; accept longer encryption times |
| Should Shamir shares be displayed as words (like seed phrases) or hex? | **Both** | Display shares in both BIP-39 word format AND hexadecimal |
| Do we need explicit CSPRNG seeding or is browser crypto.getRandomValues sufficient? | **crypto.getRandomValues** | Browser's CSPRNG is sufficient for cryptographic randomness |
| Should we embed derivation libraries or compute addresses server-side during creation? | **Embed libraries** | Self-contained vault with embedded derivation; EVM chains only |

---

## Timeline Considerations

### Phase 1: Core MVP (Stories 1-8)
- Password encryption flow
- Single seed, multiple HD paths
- Basic vault generation
- Unit tests for crypto

### Phase 2: Full Feature Set (Stories 9-14)
- Shamir secret sharing
- Multiple seeds
- Address derivation & CSV export
- E2E tests

### Phase 3: Polish (Stories 15-18)
- Mobile optimization
- Accessibility
- Documentation

---

## Dependencies

| Dependency | Version | Purpose | License |
|------------|---------|---------|---------|
| @noble/post-quantum | ^0.2.0 | ML-KEM-768, ML-DSA | MIT |
| @noble/hashes | ^1.4.0 | SHA-256, Argon2 | MIT |
| @noble/ciphers | ^0.5.0 | AES-256-GCM, ChaCha20 | MIT |
| @scure/bip32 | ^1.4.0 | HD key derivation | MIT |
| @scure/bip39 | ^1.3.0 | Mnemonic validation | MIT |
| vite | ^5.0.0 | Build tooling | MIT |
| vitest | ^1.0.0 | Unit testing | MIT |
| playwright | ^1.40.0 | E2E testing | Apache-2.0 |

---

## References

- [Portable Secret](https://mprimi.github.io/portable-secret/) — Inspiration for self-contained HTML approach
- [BIP-32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki) — HD wallet specification
- [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) — Mnemonic code specification
- [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki) — Multi-account hierarchy
- [NIST FIPS 203](https://csrc.nist.gov/pubs/fips/203/final) — ML-KEM standard
- [noble-post-quantum](https://github.com/paulmillr/noble-post-quantum) — PQC library
- [Argon2 RFC 9106](https://datatracker.ietf.org/doc/rfc9106/) — Password hashing

---

## Appendix A: HD Path Reference

| Path Type | Path Pattern | Example | Used By |
|-----------|--------------|---------|---------|
| BIP-44 Standard | m/44'/60'/0'/0/x | m/44'/60'/0'/0/0 | MetaMask, Trezor, most wallets |
| Ledger Legacy | m/44'/60'/0'/x | m/44'/60'/0'/0 | Ledger (old MEW derivation) |
| Ledger Live | m/44'/60'/x'/0/0 | m/44'/60'/0'/0/0 | Ledger Live app |

---

## Appendix B: Encryption Parameter Recommendations

### Argon2id Parameters (Security First)

| Device Class | Time Cost | Memory Cost | Parallelism | Est. Time |
|--------------|-----------|-------------|-------------|-----------|
| Default | 4 | 512 MB | 4 | ~30-60s |
| High Security | 6 | 1 GB | 4 | ~60-85s |

Recommendation: **Security first approach.** Use high-cost parameters by default. Users should expect longer encryption/decryption times (up to 85 seconds on mobile) in exchange for maximum brute-force resistance. This is a one-time operation for vault creation and rare operation for decryption.

### Shamir Threshold Suggestions

| Scenario | Threshold | Rationale |
|----------|-----------|-----------|
| Personal backup | 2-of-3 | One share lost is recoverable |
| Family inheritance | 3-of-5 | Distributed trust, survives 2 losses |
| Business treasury | 4-of-7 | High security, requires quorum |

---

*Generated for Ralph autonomous coding framework. Compatible with Codex execution.*
