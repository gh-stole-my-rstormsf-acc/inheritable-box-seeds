import { ENCRYPTION_ALGORITHM_SHAMIR } from '../constants';
import { zeroBytes } from '../utils';
import type { Vault, VaultData, ShamirEncryption } from '../types';
import { base64ToBytes, bytesToUtf8, utf8ToBytes } from './encoding';
import { decryptAesGcm } from './aes';
import { combineShares, type ShamirShare } from './shamir';
import { decapsulateHybrid, deriveHybridReceiverKeys } from './hybrid-kem';

export interface ShamirRuntimeDecryptOptions {
  shares: ShamirShare[];
  vault: Vault;
}

const deserializeVaultData = (bytes: Uint8Array): VaultData => JSON.parse(bytesToUtf8(bytes)) as VaultData;

const buildShamirAad = (input: {
  version: number;
  created: string;
  hint?: string;
  threshold: number;
  totalShares: number;
  shareIdentifiers: string[];
  mlkem: ShamirEncryption['mlkem'];
}) =>
  utf8ToBytes(
    JSON.stringify({
      version: input.version,
      created: input.created,
      hint: input.hint,
      encryption: {
        type: 'shamir',
        algorithm: ENCRYPTION_ALGORITHM_SHAMIR,
        threshold: input.threshold,
        totalShares: input.totalShares,
        shareIdentifiers: input.shareIdentifiers,
        mlkem: input.mlkem
      }
    })
  );

export const decryptWithShamirRuntime = ({ shares, vault }: ShamirRuntimeDecryptOptions): VaultData => {
  if (vault.encryption.type !== 'shamir') {
    throw new Error('Vault is not Shamir-encrypted.');
  }

  const masterSeed = combineShares(shares);
  const receiverKeys = deriveHybridReceiverKeys(masterSeed);
  const encapsulatedKey = base64ToBytes(vault.encryption.mlkem.encapsulatedKey);
  const sharedSecret = decapsulateHybrid(receiverKeys, encapsulatedKey);
  const ciphertext = base64ToBytes(vault.payload);
  const aad =
    vault.version >= 2
      ? buildShamirAad({
          version: vault.version,
          created: vault.created,
          hint: vault.hint,
          threshold: vault.encryption.threshold,
          totalShares: vault.encryption.totalShares,
          shareIdentifiers: vault.encryption.shareIdentifiers,
          mlkem: vault.encryption.mlkem
        })
      : undefined;

  try {
    const plaintext = decryptAesGcm(sharedSecret, ciphertext, base64ToBytes(vault.encryption.nonce), aad);
    try {
      return deserializeVaultData(plaintext);
    } finally {
      zeroBytes(plaintext);
    }
  } catch {
    throw new Error('Decryption failed. Check your shares and try again.');
  } finally {
    zeroBytes(ciphertext);
    zeroBytes(masterSeed);
    zeroBytes(sharedSecret);
  }
};
