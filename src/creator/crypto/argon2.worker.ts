import argon2 from 'argon2-browser/dist/argon2-bundled.min.js';
import wasmDataUrl from 'argon2-browser/dist/argon2.wasm?inline';

const utf8ToBytes = (value: string) => new TextEncoder().encode(value);

const randomBytes = (length: number) => {
  const buffer = new Uint8Array(length);
  self.crypto.getRandomValues(buffer);
  return buffer;
};

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

self.onmessage = async (event) => {
  const { password, params, salt } = event.data as {
    password: string;
    params: { timeCost: number; memoryCostMB: number; parallelism: number };
    salt?: Uint8Array;
  };

  try {
    const passwordBytes = utf8ToBytes(password);
    const saltBytes = salt ?? randomBytes(32);

    const result = await argon2.hash({
      pass: passwordBytes,
      salt: saltBytes,
      time: params.timeCost,
      mem: params.memoryCostMB * 1024,
      parallelism: params.parallelism,
      hashLen: 32,
      type: argon2.ArgonType.Argon2id,
      wasmBinary,
      onProgress: (value) => {
        self.postMessage({ type: 'progress', value });
      }
    });

    self.postMessage(
      { type: 'result', key: result.hash.buffer, salt: saltBytes.buffer },
      [result.hash.buffer, saltBytes.buffer]
    );
  } catch (error) {
    self.postMessage({ type: 'error', message: (error as Error).message });
  }
};
