import argon2 from 'argon2-browser/dist/argon2-bundled.min.js';
import wasmDataUrl from 'argon2-browser/dist/argon2.wasm';

const utf8ToBytes = (value: string) => new TextEncoder().encode(value);

const dataUrlToBytes = (dataUrl: string) => {
  const [, base64] = dataUrl.split(',', 2);
  const binary = atob(base64 ?? '');
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
};

const wasmBinary = dataUrlToBytes(wasmDataUrl);

export const deriveKeyArgon2Wasm = async (
  password: string,
  salt: Uint8Array,
  params: { timeCost: number; memoryCostMB: number; parallelism: number },
  onProgress?: (progress: number) => void
) => {
  const passwordBytes = utf8ToBytes(password);
  const result = await argon2.hash({
    pass: passwordBytes,
    salt,
    time: params.timeCost,
    mem: params.memoryCostMB * 1024,
    parallelism: params.parallelism,
    hashLen: 32,
    type: argon2.ArgonType.Argon2id,
    wasmBinary,
    onProgress
  });
  return result.hash;
};
