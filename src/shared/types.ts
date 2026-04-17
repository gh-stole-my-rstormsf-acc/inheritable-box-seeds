export type VaultVersion = 1 | 2;

export interface Vault {
  version: VaultVersion;
  created: string;
  hint?: string;
  encryption: PasswordEncryption | ShamirEncryption;
  payload: string;
}

export interface PasswordEncryption {
  type: 'password';
  algorithm: 'argon2id-mlkem768-aes256gcm';
  argon2: {
    salt: string;
    timeCost: number;
    memoryCost: number;
    parallelism: number;
  };
  mlkem: {
    encapsulatedKey: string;
  };
  nonce: string;
}

export interface ShamirEncryption {
  type: 'shamir';
  algorithm: 'shamir-mlkem768-aes256gcm';
  threshold: number;
  totalShares: number;
  shareIdentifiers: string[];
  mlkem: {
    encapsulatedKey: string;
  };
  nonce: string;
}

export interface VaultData {
  seeds: SeedEntry[];
  files?: VaultFileEntry[];
}

export interface SeedEntry {
  label: string;
  mnemonic: string;
  paths: PathConfig[];
}

export interface PathConfig {
  label: string;
  path: string;
  passphrase: string;
  passphraseLabel: string;
  deriveCount: number;
}

export interface VaultFileEntryBase {
  label: string;
  fileName: string;
  mimeType: string;
  size: number;
  openHint: string;
}

export interface InlineVaultFileEntry extends VaultFileEntryBase {
  storage?: 'inline';
  dataBase64: string;
}

export interface ExternalVaultFileEntry extends VaultFileEntryBase {
  storage: 'external';
  bundleFileName: string;
  bundleId: string;
  keyBase64: string;
  noncePrefixBase64: string;
  chunkSize: number;
}

export type VaultFileEntry = InlineVaultFileEntry | ExternalVaultFileEntry;

export const isExternalVaultFileEntry = (value: VaultFileEntry): value is ExternalVaultFileEntry =>
  value.storage === 'external';

export const isInlineVaultFileEntry = (value: VaultFileEntry): value is InlineVaultFileEntry =>
  value.storage !== 'external';

export const isPasswordEncryption = (value: unknown): value is PasswordEncryption => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as PasswordEncryption;
  return (
    candidate.type === 'password' &&
    candidate.algorithm === 'argon2id-mlkem768-aes256gcm' &&
    typeof candidate.argon2?.salt === 'string' &&
    typeof candidate.argon2?.timeCost === 'number' &&
    typeof candidate.argon2?.memoryCost === 'number' &&
    typeof candidate.argon2?.parallelism === 'number' &&
    typeof candidate.mlkem?.encapsulatedKey === 'string' &&
    typeof candidate.nonce === 'string'
  );
};

export const isShamirEncryption = (value: unknown): value is ShamirEncryption => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as ShamirEncryption;
  return (
    candidate.type === 'shamir' &&
    candidate.algorithm === 'shamir-mlkem768-aes256gcm' &&
    typeof candidate.threshold === 'number' &&
    typeof candidate.totalShares === 'number' &&
    Array.isArray(candidate.shareIdentifiers) &&
    typeof candidate.mlkem?.encapsulatedKey === 'string' &&
    typeof candidate.nonce === 'string'
  );
};

export const isVault = (value: unknown): value is Vault => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Vault;
  return (
    (candidate.version === 1 || candidate.version === 2) &&
    typeof candidate.created === 'string' &&
    typeof candidate.payload === 'string' &&
    (isPasswordEncryption(candidate.encryption) || isShamirEncryption(candidate.encryption))
  );
};
