import { describe, expect, it } from 'vitest';
import { generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { normalizeMnemonic, validateBip39Mnemonic } from '../../src/creator/validation/mnemonic';

const valid12 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('mnemonic validation', () => {
  it('normalizes whitespace and case', () => {
    const normalized = normalizeMnemonic('  ABANDON  abandon  Abandon  ');
    expect(normalized).toBe('abandon abandon abandon');
  });

  it('validates 12-word mnemonics', () => {
    const result = validateBip39Mnemonic(valid12);
    expect(result.valid).toBe(true);
    expect(result.wordCount).toBe(12);
  });

  it('validates 18-word mnemonics', () => {
    const mnemonic = generateMnemonic(wordlist, 192);
    const result = validateBip39Mnemonic(mnemonic);
    expect(result.valid).toBe(true);
    expect(result.wordCount).toBe(18);
  });

  it('validates 24-word mnemonics', () => {
    const mnemonic = generateMnemonic(wordlist, 256);
    const result = validateBip39Mnemonic(mnemonic);
    expect(result.valid).toBe(true);
    expect(result.wordCount).toBe(24);
  });

  it('rejects bad word counts', () => {
    const result = validateBip39Mnemonic('abandon abandon abandon');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/12, 18, or 24/);
  });

  it('rejects invalid checksums', () => {
    const bad = valid12.replace('about', 'abandon');
    const result = validateBip39Mnemonic(bad);
    expect(result.valid).toBe(false);
  });
});
