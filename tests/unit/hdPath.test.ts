import { describe, expect, it } from 'vitest';
import { expandPathTemplate, validateHdPath, validateHdPathTemplate } from '../../src/creator/validation/hdPath';

describe('hd path validation', () => {
  it('validates standard BIP-44 paths', () => {
    const result = validateHdPath("m/44'/60'/0'/0/0");
    expect(result.valid).toBe(true);
  });

  it('validates ledger legacy paths', () => {
    const result = validateHdPath("m/44'/60'/0'/0");
    expect(result.valid).toBe(true);
  });

  it('validates ledger live paths', () => {
    const result = validateHdPath("m/44'/60'/0'/0/0");
    expect(result.valid).toBe(true);
  });

  it('validates custom paths', () => {
    const result = validateHdPath("m/44'/1'/2/3/4");
    expect(result.valid).toBe(true);
  });

  it('rejects malformed paths', () => {
    const result = validateHdPath("n/44'/60'/0'/0/0");
    expect(result.valid).toBe(false);
  });

  it('accepts templates with x placeholders', () => {
    const result = validateHdPathTemplate("m/44'/60'/0'/0/x");
    expect(result.valid).toBe(true);
  });

  it('expands x placeholders', () => {
    expect(expandPathTemplate("m/44'/60'/0'/0/x", 5)).toBe("m/44'/60'/0'/0/5");
    expect(expandPathTemplate("m/44'/60'/x'/0/0", 2)).toBe("m/44'/60'/2'/0/0");
  });
});
