import { describe, expect, it } from 'vitest';
import { decryptAesGcm, encryptAesGcm } from '../../src/shared/crypto/aes';
import { deriveKeyArgon2WithSalt } from '../../src/shared/crypto/argon2';
import { decapsulateHybrid, deriveHybridReceiverKeys, encapsulateHybrid } from '../../src/shared/crypto/hybrid-kem';
import { combineShares, splitSecret } from '../../src/shared/crypto/shamir';
import { randomBytes } from '../../src/shared/utils';

const FAST_ARGON = { timeCost: 2, memoryCostMB: 1, parallelism: 1 };

describe('AES-GCM', () => {
  it('encrypts and decrypts', () => {
    const key = randomBytes(32);
    const plaintext = randomBytes(64);
    const { ciphertext, nonce } = encryptAesGcm(key, plaintext);
    const decrypted = decryptAesGcm(key, ciphertext, nonce);
    expect(Array.from(decrypted)).toEqual(Array.from(plaintext));
  });

  it('fails on tampering', () => {
    const key = randomBytes(32);
    const plaintext = randomBytes(32);
    const { ciphertext, nonce } = encryptAesGcm(key, plaintext);
    const tampered = ciphertext.slice();
    tampered[0] ^= 0xff;
    expect(() => decryptAesGcm(key, tampered, nonce)).toThrow();
  });
});

describe('Argon2id', () => {
  it('derives deterministic keys for same inputs', async () => {
    const salt = randomBytes(16);
    const key1 = await deriveKeyArgon2WithSalt('password', salt, FAST_ARGON);
    const key2 = await deriveKeyArgon2WithSalt('password', salt, FAST_ARGON);
    expect(Array.from(key1)).toEqual(Array.from(key2));
  });

  it('produces different keys for different salts', async () => {
    const salt1 = randomBytes(16);
    const salt2 = randomBytes(16);
    const key1 = await deriveKeyArgon2WithSalt('password', salt1, FAST_ARGON);
    const key2 = await deriveKeyArgon2WithSalt('password', salt2, FAST_ARGON);
    expect(Array.from(key1)).not.toEqual(Array.from(key2));
  });
});

describe('Hybrid KEM', () => {
  it('round-trips shared secret', () => {
    const seed = randomBytes(32);
    const receiver = deriveHybridReceiverKeys(seed);
    const { encapsulatedKey, sharedSecret } = encapsulateHybrid(receiver);
    const recovered = decapsulateHybrid(receiver, encapsulatedKey);
    expect(Array.from(recovered)).toEqual(Array.from(sharedSecret));
  });
});

describe('Shamir sharing', () => {
  it('reconstructs with threshold shares', () => {
    const secret = randomBytes(32);
    const shares = splitSecret(secret, 2, 3);
    const recovered = combineShares(shares.slice(0, 2));
    expect(Array.from(recovered)).toEqual(Array.from(secret));
  });

  it('fails with insufficient shares', () => {
    const secret = randomBytes(32);
    const shares = splitSecret(secret, 2, 3);
    expect(() => combineShares(shares.slice(0, 1))).toThrow();
  });
});
