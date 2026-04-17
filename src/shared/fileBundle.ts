import { bytesToBase64, base64ToBytes } from './crypto/encoding';

export const FILE_BUNDLE_CHUNK_SIZE = 1024 * 1024;
export const FILE_BUNDLE_MAGIC = 'SVF1';
export const FILE_BUNDLE_VERSION = 1;
export const FILE_BUNDLE_ID_BYTES = 16;
export const FILE_BUNDLE_NONCE_PREFIX_BYTES = 8;
export const FILE_BUNDLE_HEADER_BYTES = 4 + 1 + FILE_BUNDLE_ID_BYTES + 4 + 8;

export interface FileBundleHeader {
  version: number;
  bundleId: Uint8Array;
  chunkSize: number;
  totalPlaintextBytes: number;
}

const textEncoder = new TextEncoder();

const setBigUint64Compat = (view: DataView, offset: number, value: number) => {
  const high = Math.floor(value / 0x100000000);
  const low = value >>> 0;
  view.setUint32(offset, low, true);
  view.setUint32(offset + 4, high, true);
};

const getBigUint64Compat = (view: DataView, offset: number) => {
  const low = view.getUint32(offset, true);
  const high = view.getUint32(offset + 4, true);
  return high * 0x100000000 + low;
};

export const buildFileBundleHeader = (input: {
  bundleId: Uint8Array;
  chunkSize: number;
  totalPlaintextBytes: number;
}) => {
  if (input.bundleId.length !== FILE_BUNDLE_ID_BYTES) {
    throw new Error('Invalid bundle id length.');
  }
  const out = new Uint8Array(FILE_BUNDLE_HEADER_BYTES);
  out.set(textEncoder.encode(FILE_BUNDLE_MAGIC), 0);
  out[4] = FILE_BUNDLE_VERSION;
  out.set(input.bundleId, 5);
  const view = new DataView(out.buffer);
  view.setUint32(5 + FILE_BUNDLE_ID_BYTES, input.chunkSize, true);
  setBigUint64Compat(view, 5 + FILE_BUNDLE_ID_BYTES + 4, input.totalPlaintextBytes);
  return out;
};

export const parseFileBundleHeader = (bytes: Uint8Array): FileBundleHeader => {
  if (bytes.length < FILE_BUNDLE_HEADER_BYTES) {
    throw new Error('Encrypted bundle header is truncated.');
  }
  const magic = new TextDecoder().decode(bytes.subarray(0, 4));
  if (magic !== FILE_BUNDLE_MAGIC) {
    throw new Error('Encrypted bundle header is invalid.');
  }
  const version = bytes[4];
  if (version !== FILE_BUNDLE_VERSION) {
    throw new Error('Encrypted bundle version is unsupported.');
  }
  const bundleId = bytes.slice(5, 5 + FILE_BUNDLE_ID_BYTES);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunkSize = view.getUint32(5 + FILE_BUNDLE_ID_BYTES, true);
  const totalPlaintextBytes = getBigUint64Compat(view, 5 + FILE_BUNDLE_ID_BYTES + 4);
  return {
    version,
    bundleId,
    chunkSize,
    totalPlaintextBytes
  };
};

export const estimateExternalBundleOverheadBytes = (totalPlaintextBytes: number, chunkSize = FILE_BUNDLE_CHUNK_SIZE) =>
  FILE_BUNDLE_HEADER_BYTES + Math.ceil(totalPlaintextBytes / chunkSize) * 16;

export const buildExternalBundleFileName = (index: number, sanitizedFileName: string) =>
  `seed-vault-file-${String(index + 1).padStart(2, '0')}-${sanitizedFileName}.svf`;

export const buildExternalFileBundleMetadata = (input: {
  fileName: string;
  mimeType: string;
  size: number;
  label: string;
  openHint: string;
  index: number;
}) => {
  const bundleId = crypto.getRandomValues(new Uint8Array(FILE_BUNDLE_ID_BYTES));
  const key = crypto.getRandomValues(new Uint8Array(32));
  const noncePrefix = crypto.getRandomValues(new Uint8Array(FILE_BUNDLE_NONCE_PREFIX_BYTES));
  return {
    entry: {
      storage: 'external' as const,
      label: input.label,
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.size,
      openHint: input.openHint,
      bundleFileName: buildExternalBundleFileName(input.index, input.fileName),
      bundleId: bytesToBase64(bundleId),
      keyBase64: bytesToBase64(key),
      noncePrefixBase64: bytesToBase64(noncePrefix),
      chunkSize: FILE_BUNDLE_CHUNK_SIZE
    },
    bundleId,
    key,
    noncePrefix
  };
};

export const validateExternalFileBundleHeader = (
  header: FileBundleHeader,
  input: { bundleId: string; chunkSize: number; totalPlaintextBytes: number }
) => {
  if (bytesToBase64(header.bundleId) !== input.bundleId) {
    throw new Error('Encrypted bundle does not match this vault file entry.');
  }
  if (header.chunkSize !== input.chunkSize) {
    throw new Error('Encrypted bundle chunk size does not match this vault file entry.');
  }
  if (header.totalPlaintextBytes !== input.totalPlaintextBytes) {
    throw new Error('Encrypted bundle size does not match this vault file entry.');
  }
};

export const parseBase64BundleId = (bundleId: string) => {
  const bytes = base64ToBytes(bundleId);
  if (bytes.length !== FILE_BUNDLE_ID_BYTES) {
    throw new Error('Invalid bundle id.');
  }
  return bytes;
};
