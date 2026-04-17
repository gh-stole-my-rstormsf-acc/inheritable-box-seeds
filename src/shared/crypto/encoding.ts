export const utf8ToBytes = (value: string) => new TextEncoder().encode(value);
export const bytesToUtf8 = (value: Uint8Array) => new TextDecoder().decode(value);

const readBlobAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Failed to encode data.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to encode data.'));
    reader.readAsDataURL(blob);
  });

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

export const bytesToBase64Async = async (value: Uint8Array) => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value).toString('base64');
  }
  if (typeof Blob !== 'undefined' && typeof FileReader !== 'undefined') {
    const dataUrl = await readBlobAsDataUrl(new Blob([value.slice().buffer], { type: 'application/octet-stream' }));
    const separatorIndex = dataUrl.indexOf(',');
    if (separatorIndex < 0) {
      throw new Error('Failed to encode data.');
    }
    return dataUrl.slice(separatorIndex + 1);
  }
  return bytesToBase64(value);
};

export const base64ToBytes = (value: string) => {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(value, 'base64'));
  }
  const chunkSize = 4 * 8192;
  const paddingLength = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const out = new Uint8Array(Math.floor((value.length * 3) / 4) - paddingLength);
  let offset = 0;
  for (let index = 0; index < value.length;) {
    let end = Math.min(value.length, index + chunkSize);
    if (end < value.length) {
      const remainder = (end - index) % 4;
      if (remainder !== 0) {
        end -= remainder;
      }
    }
    const binary = atob(value.slice(index, end));
    for (let i = 0; i < binary.length; i += 1) {
      out[offset + i] = binary.charCodeAt(i);
    }
    offset += binary.length;
    index = end;
  }
  return out;
};
