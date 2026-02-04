export const noop = () => undefined;

export const randomBytes = (length: number) => {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('Length must be a positive integer.');
  }
  const buffer = new Uint8Array(length);
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure random number generator unavailable.');
  }
  globalThis.crypto.getRandomValues(buffer);
  return buffer;
};

export const concatBytes = (...arrays: Uint8Array[]) => {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
};

export const zeroBytes = (value: Uint8Array) => {
  value.fill(0);
};
