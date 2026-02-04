import { argon2idAsync } from '@noble/hashes/argon2';
import { randomBytes, zeroBytes } from '../utils';
import { utf8ToBytes } from './encoding';

export interface Argon2Params {
  timeCost: number;
  memoryCostMB: number;
  parallelism: number;
}

export interface Argon2Result {
  key: Uint8Array;
  salt: Uint8Array;
  params: Argon2Params;
}

export const deriveKeyArgon2 = async (
  password: string,
  params: Argon2Params,
  onProgress?: (progress: number) => void
): Promise<Argon2Result> => {
  const salt = randomBytes(32);
  const passwordBytes = utf8ToBytes(password);
  try {
    const key = await argon2idAsync(passwordBytes, salt, {
      t: params.timeCost,
      m: params.memoryCostMB * 1024,
      p: params.parallelism,
      dkLen: 32,
      onProgress
    });
    return { key, salt, params };
  } finally {
    zeroBytes(passwordBytes);
  }
};

export const deriveKeyArgon2WithSalt = async (
  password: string,
  salt: Uint8Array,
  params: Argon2Params,
  onProgress?: (progress: number) => void
): Promise<Uint8Array> => {
  const passwordBytes = utf8ToBytes(password);
  try {
    return await argon2idAsync(passwordBytes, salt, {
      t: params.timeCost,
      m: params.memoryCostMB * 1024,
      p: params.parallelism,
      dkLen: 32,
      onProgress
    });
  } finally {
    zeroBytes(passwordBytes);
  }
};
