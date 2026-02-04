import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

export interface MnemonicValidationResult {
  normalized: string;
  wordCount: number;
  valid: boolean;
  error?: string;
}

const normalize = (input: string) =>
  input
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');

export const validateBip39Mnemonic = (input: string): MnemonicValidationResult => {
  const normalized = normalize(input);
  const words = normalized.length ? normalized.split(' ') : [];
  const wordCount = words.length;

  if (wordCount === 0) {
    return {
      normalized,
      wordCount,
      valid: false,
      error: 'Enter a seed phrase.'
    };
  }

  if (![12, 18, 24].includes(wordCount)) {
    return {
      normalized,
      wordCount,
      valid: false,
      error: 'Seed phrase must be 12, 18, or 24 words.'
    };
  }

  const valid = validateMnemonic(normalized, wordlist);
  if (!valid) {
    return {
      normalized,
      wordCount,
      valid: false,
      error: 'Seed phrase checksum or words are invalid.'
    };
  }

  return {
    normalized,
    wordCount,
    valid: true
  };
};

export const normalizeMnemonic = (input: string) => normalize(input);
