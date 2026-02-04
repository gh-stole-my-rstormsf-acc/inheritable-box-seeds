import { ARGON2_PRESETS } from '../../shared/constants';
import type { Argon2Params } from '../../shared/crypto/argon2';

export const DEFAULT_ARGON2_MIN = {
  timeCost: ARGON2_PRESETS[0].timeCost,
  memoryCostMB: ARGON2_PRESETS[0].memoryCostMB,
  parallelism: ARGON2_PRESETS[0].parallelism
};

export interface Argon2ValidationResult {
  valid: boolean;
  error?: string;
}

export const validateArgon2Params = (params: Argon2Params): Argon2ValidationResult => {
  const { timeCost, memoryCostMB, parallelism } = params;

  if (![timeCost, memoryCostMB, parallelism].every(Number.isInteger)) {
    return { valid: false, error: 'Argon2 parameters must be whole numbers.' };
  }

  if (timeCost < DEFAULT_ARGON2_MIN.timeCost) {
    return { valid: false, error: `Time cost must be >= ${DEFAULT_ARGON2_MIN.timeCost}.` };
  }
  if (memoryCostMB < DEFAULT_ARGON2_MIN.memoryCostMB) {
    return { valid: false, error: `Memory must be >= ${DEFAULT_ARGON2_MIN.memoryCostMB} MB.` };
  }
  if (parallelism < DEFAULT_ARGON2_MIN.parallelism) {
    return { valid: false, error: `Parallelism must be >= ${DEFAULT_ARGON2_MIN.parallelism}.` };
  }

  if (memoryCostMB <= 0) {
    return { valid: false, error: 'Memory must be greater than 0.' };
  }
  if (parallelism <= 0) {
    return { valid: false, error: 'Parallelism must be greater than 0.' };
  }

  if (memoryCostMB * 1024 < 8 * parallelism) {
    return { valid: false, error: 'Memory is too low for the chosen parallelism.' };
  }

  return { valid: true };
};
