import { describe, expect, it } from 'vitest';
import { encryptWithPassword, encryptWithShamir, decryptWithPassword, decryptWithShamir } from '../../src/shared/crypto/vault';
import type { VaultData } from '../../src/shared/types';

const FAST_ARGON = { timeCost: 2, memoryCostMB: 1, parallelism: 1 };
const sampleData: VaultData = {
  seeds: [
    {
      label: 'Primary',
      mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      paths: [
        {
          label: 'BIP-44',
          path: "m/44'/60'/0'/0/0",
          passphrase: '',
          deriveCount: 1
        }
      ]
    }
  ]
};

describe('encryption flows', () => {
  it('round-trips password encryption', async () => {
    const vault = await encryptWithPassword({
      password: 'test-password',
      data: sampleData,
      hint: 'hint',
      params: FAST_ARGON
    });
    const decrypted = await decryptWithPassword({ password: 'test-password', vault });
    expect(decrypted).toEqual(sampleData);
  });

  it('fails with wrong password', async () => {
    const vault = await encryptWithPassword({
      password: 'test-password',
      data: sampleData,
      params: FAST_ARGON
    });
    await expect(decryptWithPassword({ password: 'wrong', vault })).rejects.toThrow();
  });

  it('round-trips shamir encryption', () => {
    const { vault, shares } = encryptWithShamir({
      data: sampleData,
      threshold: 2,
      totalShares: 3
    });
    const decrypted = decryptWithShamir({ shares: shares.slice(0, 2), vault });
    expect(decrypted).toEqual(sampleData);
  });
});
