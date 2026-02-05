import { describe, expect, it } from 'vitest';
import {
  isPasswordEncryption,
  isShamirEncryption,
  isVault,
  type PasswordEncryption,
  type ShamirEncryption,
  type Vault
} from '../../src/shared/types';

const passwordEncryption: PasswordEncryption = {
  type: 'password',
  algorithm: 'argon2id-mlkem768-aes256gcm',
  argon2: {
    salt: 'salt',
    timeCost: 4,
    memoryCost: 512,
    parallelism: 4
  },
  mlkem: {
    encapsulatedKey: 'key'
  },
  nonce: 'nonce'
};

const shamirEncryption: ShamirEncryption = {
  type: 'shamir',
  algorithm: 'shamir-mlkem768-aes256gcm',
  threshold: 2,
  totalShares: 3,
  shareIdentifiers: ['share-1', 'share-2', 'share-3'],
  mlkem: {
    encapsulatedKey: 'key'
  },
  nonce: 'nonce'
};

const vault: Vault = {
  version: 2,
  created: new Date().toISOString(),
  hint: 'hint',
  encryption: passwordEncryption,
  payload: 'payload'
};

describe('type guards', () => {
  it('detects password encryption', () => {
    expect(isPasswordEncryption(passwordEncryption)).toBe(true);
    expect(isPasswordEncryption(shamirEncryption)).toBe(false);
  });

  it('detects shamir encryption', () => {
    expect(isShamirEncryption(shamirEncryption)).toBe(true);
    expect(isShamirEncryption(passwordEncryption)).toBe(false);
  });

  it('detects vault', () => {
    expect(isVault(vault)).toBe(true);
    expect(isVault({ ...vault, version: 1 })).toBe(true);
    expect(isVault({ ...vault, version: 3 } as Vault)).toBe(false);
  });
});
