import { ENCRYPTION_ALGORITHM_PASSWORD } from '../constants';
import { zeroBytes } from '../utils';
import type { Vault, VaultData, PasswordEncryption } from '../types';
import { base64ToBytes, bytesToUtf8, utf8ToBytes } from './encoding';
import { decryptAesGcm } from './aes';
import { decapsulateHybrid, deriveHybridReceiverKeys } from './hybrid-kem';

export interface PasswordRuntimeKdfParams {
  timeCost: number;
  memoryCostMB: number;
  parallelism: number;
}

export interface PasswordRuntimeDecryptOptions {
  password: string;
  vault: Vault;
  kdf: (
    password: string,
    salt: Uint8Array,
    params: PasswordRuntimeKdfParams,
    onProgress?: (progress: number) => void
  ) => Promise<Uint8Array>;
  onProgress?: (progress: number) => void;
}

const deserializeVaultData = (bytes: Uint8Array): VaultData => JSON.parse(bytesToUtf8(bytes)) as VaultData;

const buildPasswordAad = (input: {
  version: number;
  created: string;
  hint?: string;
  argon2: PasswordEncryption['argon2'];
  mlkem: PasswordEncryption['mlkem'];
}) =>
  utf8ToBytes(
    JSON.stringify({
      version: input.version,
      created: input.created,
      hint: input.hint,
      encryption: {
        type: 'password',
        algorithm: ENCRYPTION_ALGORITHM_PASSWORD,
        argon2: input.argon2,
        mlkem: input.mlkem
      }
    })
  );

export const decryptWithPasswordRuntime = async ({
  password,
  vault,
  kdf,
  onProgress
}: PasswordRuntimeDecryptOptions): Promise<VaultData> => {
  if (vault.encryption.type !== 'password') {
    throw new Error('Vault is not password-encrypted.');
  }

  const { argon2, mlkem, nonce } = vault.encryption;
  const salt = base64ToBytes(argon2.salt);
  const key = await kdf(
    password,
    salt,
    {
      timeCost: argon2.timeCost,
      memoryCostMB: argon2.memoryCost,
      parallelism: argon2.parallelism
    },
    onProgress
  );
  const receiverKeys = deriveHybridReceiverKeys(key);
  const encapsulatedKey = base64ToBytes(mlkem.encapsulatedKey);
  const sharedSecret = decapsulateHybrid(receiverKeys, encapsulatedKey);
  const ciphertext = base64ToBytes(vault.payload);
  const aad =
    vault.version >= 2
      ? buildPasswordAad({
          version: vault.version,
          created: vault.created,
          hint: vault.hint,
          argon2,
          mlkem
        })
      : undefined;

  try {
    const plaintext = decryptAesGcm(sharedSecret, ciphertext, base64ToBytes(nonce), aad);
    try {
      return deserializeVaultData(plaintext);
    } finally {
      zeroBytes(plaintext);
    }
  } catch {
    throw new Error('Decryption failed. Check your password and try again.');
  } finally {
    zeroBytes(key);
    zeroBytes(sharedSecret);
  }
};
