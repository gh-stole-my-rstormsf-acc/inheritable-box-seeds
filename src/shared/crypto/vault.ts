import { ARGON2_PRESETS, ENCRYPTION_ALGORITHM_PASSWORD, ENCRYPTION_ALGORITHM_SHAMIR, VAULT_VERSION } from '../constants';
import { zeroBytes, randomBytes } from '../utils';
import { type Vault, type VaultData, type PasswordEncryption, type ShamirEncryption } from '../types';
import { bytesToBase64, bytesToBase64Async, base64ToBytes, bytesToUtf8, utf8ToBytes } from './encoding';
import { decryptAesGcm, encryptAesGcm } from './aes';
import { deriveKeyArgon2, deriveKeyArgon2WithSalt, type Argon2Params, type Argon2Result } from './argon2';
import { decapsulateHybrid, deriveHybridReceiverKeys, encapsulateHybrid } from './hybrid-kem';
import { combineShares, splitSecret, type ShamirShare } from './shamir';

export interface PasswordEncryptOptions {
  password: string;
  data: VaultData;
  hint?: string;
  params?: Argon2Params;
  kdf?: (
    password: string,
    params: Argon2Params,
    onProgress?: (progress: number) => void
  ) => Promise<Argon2Result>;
  onProgress?: (progress: number) => void;
}

export interface PasswordDecryptOptions {
  password: string;
  vault: Vault;
  kdf?: (
    password: string,
    salt: Uint8Array,
    params: Argon2Params,
    onProgress?: (progress: number) => void
  ) => Promise<Uint8Array>;
  onProgress?: (progress: number) => void;
}

export interface ShamirEncryptOptions {
  data: VaultData;
  threshold: number;
  totalShares: number;
  hint?: string;
}

export interface ShamirDecryptOptions {
  shares: ShamirShare[];
  vault: Vault;
}

const serializeVaultData = (data: VaultData) => utf8ToBytes(JSON.stringify(data));
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

export const encryptWithPassword = async ({
  password,
  data,
  hint,
  params = {
    timeCost: ARGON2_PRESETS[0].timeCost,
    memoryCostMB: ARGON2_PRESETS[0].memoryCostMB,
    parallelism: ARGON2_PRESETS[0].parallelism
  },
  kdf,
  onProgress
}: PasswordEncryptOptions): Promise<Vault> => {
  const payloadBytes = serializeVaultData(data);
  const kdfFn =
    onProgress
      ? (opts: Argon2Params) => (kdf ?? deriveKeyArgon2)(password, opts, onProgress)
      : (opts: Argon2Params) => (kdf ?? deriveKeyArgon2)(password, opts);
  const { key, salt, params: usedParams } = await kdfFn(params);
  const receiverKeys = deriveHybridReceiverKeys(key);
  const { encapsulatedKey, sharedSecret } = encapsulateHybrid(receiverKeys);
  const created = new Date().toISOString();
  const argon2Params = {
    salt: bytesToBase64(salt),
    timeCost: usedParams.timeCost,
    memoryCost: usedParams.memoryCostMB,
    parallelism: usedParams.parallelism
  };
  const aad = buildPasswordAad({
    version: VAULT_VERSION,
    created,
    hint,
    argon2: argon2Params,
    mlkem: { encapsulatedKey: bytesToBase64(encapsulatedKey) }
  });
  const { ciphertext, nonce } = encryptAesGcm(sharedSecret, payloadBytes, aad);

  zeroBytes(payloadBytes);
  zeroBytes(key);
  zeroBytes(sharedSecret);

  const payload = await bytesToBase64Async(ciphertext);
  zeroBytes(ciphertext);

  const encryption: PasswordEncryption = {
    type: 'password',
    algorithm: ENCRYPTION_ALGORITHM_PASSWORD,
    argon2: argon2Params,
    mlkem: {
      encapsulatedKey: bytesToBase64(encapsulatedKey)
    },
    nonce: bytesToBase64(nonce)
  };

  return {
    version: VAULT_VERSION,
    created,
    hint,
    encryption,
    payload
  };
};

export const decryptWithPassword = async ({
  password,
  vault,
  kdf,
  onProgress
}: PasswordDecryptOptions): Promise<VaultData> => {
  if (vault.encryption.type !== 'password') {
    throw new Error('Vault is not password-encrypted.');
  }
  const { argon2, mlkem, nonce } = vault.encryption;
  const salt = base64ToBytes(argon2.salt);
  const key = await (kdf ?? deriveKeyArgon2WithSalt)(
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
    zeroBytes(ciphertext);
    zeroBytes(key);
    zeroBytes(sharedSecret);
  }
};

export const encryptWithShamir = async ({
  data,
  threshold,
  totalShares,
  hint
}: ShamirEncryptOptions): Promise<{ vault: Vault; shares: ShamirShare[] }> => {
  const payloadBytes = serializeVaultData(data);
  const masterSeed = randomBytes(32);
  const receiverKeys = deriveHybridReceiverKeys(masterSeed);
  const { encapsulatedKey, sharedSecret } = encapsulateHybrid(receiverKeys);
  const created = new Date().toISOString();
  const shares = splitSecret(masterSeed, threshold, totalShares);
  const shareIdentifiers = shares.map((share) => `share-${share.id}`);
  const aad = buildShamirAad({
    version: VAULT_VERSION,
    created,
    hint,
    threshold,
    totalShares,
    shareIdentifiers,
    mlkem: { encapsulatedKey: bytesToBase64(encapsulatedKey) }
  });
  const { ciphertext, nonce } = encryptAesGcm(sharedSecret, payloadBytes, aad);

  zeroBytes(payloadBytes);
  zeroBytes(sharedSecret);
  zeroBytes(masterSeed);

  const payload = await bytesToBase64Async(ciphertext);
  zeroBytes(ciphertext);

  const encryption: ShamirEncryption = {
    type: 'shamir',
    algorithm: ENCRYPTION_ALGORITHM_SHAMIR,
    threshold,
    totalShares,
    shareIdentifiers,
    mlkem: {
      encapsulatedKey: bytesToBase64(encapsulatedKey)
    },
    nonce: bytesToBase64(nonce)
  };

  return {
    vault: {
      version: VAULT_VERSION,
      created,
      hint,
      encryption,
      payload
    },
    shares
  };
};

export const decryptWithShamir = ({ shares, vault }: ShamirDecryptOptions): VaultData => {
  if (vault.encryption.type !== 'shamir') {
    throw new Error('Vault is not Shamir-encrypted.');
  }
  if (shares.length < vault.encryption.threshold) {
    throw new Error('Not enough shares provided.');
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
