import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { randomBytes } from '../utils';
import { bytesToHex, hexToBytes } from './encoding';

export interface ShamirShare {
  id: number;
  data: Uint8Array;
}

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

const initTables = () => {
  let x = 1;
  const generator = 0x03;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x = gfMulNoTable(x, generator);
  }
  for (let i = 255; i < 512; i += 1) {
    EXP[i] = EXP[i - 255];
  }
};

const gfMulNoTable = (a: number, b: number) => {
  let result = 0;
  let aa = a;
  let bb = b;
  while (bb > 0) {
    if (bb & 1) result ^= aa;
    aa <<= 1;
    if (aa & 0x100) aa ^= 0x11b;
    bb >>= 1;
  }
  return result;
};

const gfAdd = (a: number, b: number) => a ^ b;
const gfMul = (a: number, b: number) => {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
};
const gfDiv = (a: number, b: number) => {
  if (b === 0) throw new Error('Division by zero');
  if (a === 0) return 0;
  return EXP[LOG[a] + 255 - LOG[b]];
};

initTables();

const assertThreshold = (threshold: number, totalShares: number) => {
  if (!Number.isInteger(threshold) || threshold < 2) {
    throw new Error('Threshold must be at least 2.');
  }
  if (!Number.isInteger(totalShares) || totalShares < threshold) {
    throw new Error('Total shares must be >= threshold.');
  }
  if (totalShares > 10) {
    throw new Error('Total shares must be <= 10.');
  }
};

export const splitSecret = (
  secret: Uint8Array,
  threshold: number,
  totalShares: number
): ShamirShare[] => {
  assertThreshold(threshold, totalShares);
  if (secret.length === 0) throw new Error('Secret is empty.');

  const coefficients: Uint8Array[] = [secret];
  for (let i = 1; i < threshold; i += 1) {
    coefficients.push(randomBytes(secret.length));
  }

  const shares: ShamirShare[] = [];
  for (let id = 1; id <= totalShares; id += 1) {
    const data = new Uint8Array(secret.length);
    for (let byteIndex = 0; byteIndex < secret.length; byteIndex += 1) {
      let y = coefficients[threshold - 1][byteIndex];
      for (let c = threshold - 2; c >= 0; c -= 1) {
        y = gfAdd(gfMul(y, id), coefficients[c][byteIndex]);
      }
      data[byteIndex] = y;
    }
    shares.push({ id, data });
  }

  return shares;
};

export const combineShares = (shares: ShamirShare[]): Uint8Array => {
  if (shares.length < 2) {
    throw new Error('At least two shares are required.');
  }
  const length = shares[0].data.length;
  shares.forEach((share) => {
    if (share.data.length !== length) {
      throw new Error('Share lengths do not match.');
    }
  });
  const ids = new Set(shares.map((share) => share.id));
  if (ids.size !== shares.length) {
    throw new Error('Duplicate share identifiers.');
  }

  const secret = new Uint8Array(length);
  for (let byteIndex = 0; byteIndex < length; byteIndex += 1) {
    let value = 0;
    for (let j = 0; j < shares.length; j += 1) {
      const { id: xj, data } = shares[j];
      let numerator = 1;
      let denominator = 1;
      for (let m = 0; m < shares.length; m += 1) {
        if (m === j) continue;
        const xm = shares[m].id;
        numerator = gfMul(numerator, xm);
        denominator = gfMul(denominator, gfAdd(xm, xj));
      }
      const lagrange = gfDiv(numerator, denominator);
      value = gfAdd(value, gfMul(data[byteIndex], lagrange));
    }
    secret[byteIndex] = value;
  }
  return secret;
};

export const shareToHex = (share: ShamirShare) => bytesToHex(share.data);

export const shareFromHex = (id: number, hex: string): ShamirShare => ({
  id,
  data: hexToBytes(hex)
});

export const shareToMnemonic = (share: ShamirShare) => entropyToMnemonic(share.data, wordlist);

export const shareFromMnemonic = (id: number, mnemonic: string): ShamirShare => ({
  id,
  data: mnemonicToEntropy(mnemonic, wordlist)
});
