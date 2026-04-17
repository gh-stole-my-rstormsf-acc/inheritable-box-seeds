import { ARGON2_PRESETS } from './constants';

const DEFAULT_ARGON2_PRESET = ARGON2_PRESETS[0] ?? {
  id: 'default',
  label: 'Default',
  timeCost: 4,
  memoryCostMB: 512,
  parallelism: 4,
  estimatedTime: '~30-60s'
};
const HIGH_ARGON2_PRESET = ARGON2_PRESETS[1] ?? DEFAULT_ARGON2_PRESET;
const UNKNOWN_DEVICE_SAFE_ARGON2_MEMORY_MB = DEFAULT_ARGON2_PRESET.memoryCostMB;
const SAFE_ARGON2_MEMORY_PER_DEVICE_GB_MB = 128;

export const getSafeArgon2MemoryLimitMB = (deviceMemoryGB?: number) => {
  if (!Number.isFinite(deviceMemoryGB) || deviceMemoryGB === undefined || deviceMemoryGB <= 0) {
    return UNKNOWN_DEVICE_SAFE_ARGON2_MEMORY_MB;
  }
  return Math.max(UNKNOWN_DEVICE_SAFE_ARGON2_MEMORY_MB, Math.floor(deviceMemoryGB * SAFE_ARGON2_MEMORY_PER_DEVICE_GB_MB));
};

export const getDefaultArgon2PresetId = (deviceMemoryGB?: number): 'default' | 'high' => {
  const limit = getSafeArgon2MemoryLimitMB(deviceMemoryGB);
  return HIGH_ARGON2_PRESET.memoryCostMB <= limit ? 'high' : 'default';
};

export const getArgon2MemoryFeasibilityError = (memoryCostMB: number, deviceMemoryGB?: number) => {
  const limit = getSafeArgon2MemoryLimitMB(deviceMemoryGB);
  if (memoryCostMB <= limit) {
    return undefined;
  }
  return `This browser is unlikely to complete Argon2 with ${memoryCostMB} MB without crashing. Use ${limit} MB or less on this device.`;
};
