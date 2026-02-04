import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, utf8ToBytes } from '../crypto/encoding';
import { validateHdPath, expandPathTemplate } from '../../creator/validation/hdPath';

export interface DerivedAddress {
  index: number;
  address: string;
  path: string;
}

const toChecksumAddress = (address: string) => {
  const lower = address.toLowerCase().replace(/^0x/, '');
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  let result = '0x';
  for (let i = 0; i < lower.length; i += 1) {
    const char = lower[i];
    const hashNibble = Number.parseInt(hash[i], 16);
    result += hashNibble >= 8 ? char.toUpperCase() : char;
  }
  return result;
};

const derivePathForIndex = (path: string, index: number) => {
  if (path.includes('x')) {
    return expandPathTemplate(path, index);
  }

  const validation = validateHdPath(path);
  if (!validation.valid || !validation.segments) {
    throw new Error(validation.error ?? 'Invalid derivation path.');
  }

  const segments = validation.segments;
  if (segments.length >= 5) {
    const nextSegments = [...segments];
    const last = nextSegments[nextSegments.length - 1];
    nextSegments[nextSegments.length - 1] = {
      index: last.index + index,
      hardened: last.hardened
    };
    return `m/${nextSegments.map((seg) => `${seg.index}${seg.hardened ? "'" : ''}`).join('/')}`;
  }

  return `${path}/${index}`;
};

export const deriveEvmAddresses = (
  mnemonic: string,
  passphrase: string,
  path: string,
  count: number
): DerivedAddress[] => {
  const seed = mnemonicToSeedSync(mnemonic, passphrase);
  const root = HDKey.fromMasterSeed(seed);

  const results: DerivedAddress[] = [];
  for (let i = 0; i < count; i += 1) {
    const derivedPath = derivePathForIndex(path, i);
    const child = root.derive(derivedPath);
    if (!child.privateKey) {
      throw new Error('Failed to derive private key.');
    }
    const publicKey = secp256k1.getPublicKey(child.privateKey, false);
    const addressBytes = keccak_256(publicKey.slice(1));
    const address = toChecksumAddress(bytesToHex(addressBytes.slice(-20)));
    results.push({ index: i, address, path: derivedPath });
  }
  return results;
};
