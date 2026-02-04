import { ml_kem768 } from '@noble/post-quantum/ml-kem';
import { x25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';
import { concatBytes, zeroBytes } from '../utils';
import { utf8ToBytes } from './encoding';

const X25519_PUBLIC_KEY_LEN = 32;
const PACKED_HEADER_LEN = 2;

export interface HybridReceiverKeys {
  mlkemPublicKey: Uint8Array;
  mlkemSecretKey: Uint8Array;
  x25519PublicKey: Uint8Array;
  x25519SecretKey: Uint8Array;
}

export interface HybridEncapsulation {
  encapsulatedKey: Uint8Array;
  sharedSecret: Uint8Array;
}

const deriveX25519Secret = (seed: Uint8Array) =>
  sha256(concatBytes(seed, utf8ToBytes('x25519')));

const deriveMlKemSeed = (seed: Uint8Array) => sha512(concatBytes(seed, utf8ToBytes('mlkem'))).slice(0, 64);

export const deriveHybridReceiverKeys = (seed: Uint8Array): HybridReceiverKeys => {
  const { publicKey, secretKey } = ml_kem768.keygen(deriveMlKemSeed(seed));
  const xSecret = deriveX25519Secret(seed);
  const xPublic = x25519.getPublicKey(xSecret);
  return {
    mlkemPublicKey: publicKey,
    mlkemSecretKey: secretKey,
    x25519PublicKey: xPublic,
    x25519SecretKey: xSecret
  };
};

export const encapsulateHybrid = (receiver: HybridReceiverKeys): HybridEncapsulation => {
  const { cipherText, sharedSecret: kemSecret } = ml_kem768.encapsulate(receiver.mlkemPublicKey);
  const ephemeralSecret = x25519.utils.randomSecretKey();
  const ephemeralPublic = x25519.getPublicKey(ephemeralSecret);
  const xShared = x25519.getSharedSecret(ephemeralSecret, receiver.x25519PublicKey);
  const hybridSecret = sha256(concatBytes(kemSecret, xShared));
  zeroBytes(xShared);
  zeroBytes(kemSecret);
  zeroBytes(ephemeralSecret);

  const header = new Uint8Array(PACKED_HEADER_LEN);
  header[0] = (cipherText.length >> 8) & 0xff;
  header[1] = cipherText.length & 0xff;
  const packed = concatBytes(header, cipherText, ephemeralPublic);

  return {
    encapsulatedKey: packed,
    sharedSecret: hybridSecret
  };
};

export const decapsulateHybrid = (receiver: HybridReceiverKeys, packed: Uint8Array): Uint8Array => {
  if (packed.length < PACKED_HEADER_LEN + X25519_PUBLIC_KEY_LEN) {
    throw new Error('Invalid encapsulated key.');
  }
  const cipherLen = (packed[0] << 8) + packed[1];
  const expectedLen = PACKED_HEADER_LEN + cipherLen + X25519_PUBLIC_KEY_LEN;
  if (packed.length !== expectedLen) {
    throw new Error('Invalid encapsulated key length.');
  }
  const cipherText = packed.subarray(PACKED_HEADER_LEN, PACKED_HEADER_LEN + cipherLen);
  const ephemeralPublic = packed.subarray(PACKED_HEADER_LEN + cipherLen);

  const kemSecret = ml_kem768.decapsulate(cipherText, receiver.mlkemSecretKey);
  const xShared = x25519.getSharedSecret(receiver.x25519SecretKey, ephemeralPublic);
  const hybridSecret = sha256(concatBytes(kemSecret, xShared));
  zeroBytes(kemSecret);
  zeroBytes(xShared);
  return hybridSecret;
};
