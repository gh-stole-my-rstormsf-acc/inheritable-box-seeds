import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '../utils';

export interface AesGcmEncrypted {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
}

export const encryptAesGcm = (key: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array): AesGcmEncrypted => {
  const nonce = randomBytes(12);
  const cipher = gcm(key, nonce, aad);
  const ciphertext = cipher.encrypt(plaintext);
  return { ciphertext, nonce };
};

export const decryptAesGcm = (key: Uint8Array, ciphertext: Uint8Array, nonce: Uint8Array, aad?: Uint8Array) => {
  const cipher = gcm(key, nonce, aad);
  return cipher.decrypt(ciphertext);
};
