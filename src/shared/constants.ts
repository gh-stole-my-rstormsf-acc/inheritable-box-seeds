export const VAULT_VERSION = 1;

export const ENCRYPTION_ALGORITHM_PASSWORD = 'argon2id-mlkem768-aes256gcm' as const;
export const ENCRYPTION_ALGORITHM_SHAMIR = 'shamir-mlkem768-aes256gcm' as const;

export type HdPathPresetId = 'bip44' | 'ledger-legacy' | 'ledger-live';

export interface HdPathPreset {
  id: HdPathPresetId;
  label: string;
  path: string;
  description: string;
}

export const HD_PATH_PRESETS: HdPathPreset[] = [
  {
    id: 'bip44',
    label: 'BIP-44 Standard',
    path: "m/44'/60'/0'/0/x",
    description: 'MetaMask, Trezor, most wallets'
  },
  {
    id: 'ledger-legacy',
    label: 'Ledger Legacy',
    path: "m/44'/60'/0'/x",
    description: 'Ledger (old MEW derivation)'
  },
  {
    id: 'ledger-live',
    label: 'Ledger Live',
    path: "m/44'/60'/x'/0/0",
    description: 'Ledger Live app'
  }
];

export interface Argon2Preset {
  id: 'default' | 'high';
  label: string;
  timeCost: number;
  memoryCostMB: number;
  parallelism: number;
  estimatedTime: string;
}

export const ARGON2_PRESETS: Argon2Preset[] = [
  {
    id: 'default',
    label: 'Default',
    timeCost: 4,
    memoryCostMB: 512,
    parallelism: 4,
    estimatedTime: '~30-60s'
  },
  {
    id: 'high',
    label: 'High Security',
    timeCost: 6,
    memoryCostMB: 1024,
    parallelism: 4,
    estimatedTime: '~60-85s'
  }
];
