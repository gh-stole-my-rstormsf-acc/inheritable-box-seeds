export const utf8ToBytes = (value: string) => new TextEncoder().encode(value);
export const bytesToUtf8 = (value: Uint8Array) => new TextDecoder().decode(value);

export const bytesToHex = (value: Uint8Array) =>
  Array.from(value)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

export const hexToBytes = (value: string) => {
  const clean = value.trim().toLowerCase();
  if (!/^[0-9a-f]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

export const bytesToBase64 = (value: Uint8Array) => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value).toString('base64');
  }
  let binary = '';
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

export const base64ToBytes = (value: string) => {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(value, 'base64'));
  }
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
};
