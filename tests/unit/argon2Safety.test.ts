import { describe, expect, it } from 'vitest';
import {
  getArgon2MemoryFeasibilityError,
  getDefaultArgon2PresetId,
  getSafeArgon2MemoryLimitMB
} from '../../src/shared/argon2Safety';

describe('argon2 safety helpers', () => {
  it('uses a conservative fallback limit when device memory is unknown', () => {
    expect(getSafeArgon2MemoryLimitMB()).toBe(512);
    expect(getDefaultArgon2PresetId()).toBe('default');
  });

  it('allows the high preset only on devices with enough reported memory', () => {
    expect(getSafeArgon2MemoryLimitMB(4)).toBe(512);
    expect(getDefaultArgon2PresetId(4)).toBe('default');
    expect(getSafeArgon2MemoryLimitMB(8)).toBe(1024);
    expect(getDefaultArgon2PresetId(8)).toBe('high');
  });

  it('returns a clear feasibility error for oversized Argon2 memory settings', () => {
    expect(getArgon2MemoryFeasibilityError(1024, 4)).toContain('1024 MB');
    expect(getArgon2MemoryFeasibilityError(512, 4)).toBeUndefined();
  });
});
