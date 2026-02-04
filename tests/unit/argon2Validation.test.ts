import { describe, expect, it } from 'vitest';
import { validateArgon2Params } from '../../src/creator/validation/argon2';

const base = { timeCost: 4, memoryCostMB: 512, parallelism: 4 };

describe('argon2 custom validation', () => {
  it('accepts default or higher values', () => {
    expect(validateArgon2Params(base).valid).toBe(true);
    expect(validateArgon2Params({ timeCost: 5, memoryCostMB: 1024, parallelism: 4 }).valid).toBe(true);
  });

  it('rejects below default values', () => {
    expect(validateArgon2Params({ timeCost: 3, memoryCostMB: 512, parallelism: 4 }).valid).toBe(false);
    expect(validateArgon2Params({ timeCost: 4, memoryCostMB: 256, parallelism: 4 }).valid).toBe(false);
    expect(validateArgon2Params({ timeCost: 4, memoryCostMB: 512, parallelism: 2 }).valid).toBe(false);
  });

  it('rejects invalid memory/parallelism constraint', () => {
    expect(validateArgon2Params({ timeCost: 4, memoryCostMB: 1, parallelism: 8 }).valid).toBe(false);
  });
});
