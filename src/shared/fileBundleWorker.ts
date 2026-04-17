import { base64ToBytes } from './crypto/encoding';
import {
  buildFileBundleHeader,
  FILE_BUNDLE_HEADER_BYTES,
  FILE_BUNDLE_NONCE_PREFIX_BYTES,
  parseBase64BundleId,
  parseFileBundleHeader,
  validateExternalFileBundleHeader
} from './fileBundle';

const FILE_BUNDLE_WORKER_SOURCE = `
const NONCE_PREFIX_BYTES = ${FILE_BUNDLE_NONCE_PREFIX_BYTES};

const deriveNonce = (noncePrefix, chunkIndex) => {
  const nonce = new Uint8Array(12);
  nonce.set(noncePrefix, 0);
  nonce[8] = (chunkIndex >>> 24) & 0xff;
  nonce[9] = (chunkIndex >>> 16) & 0xff;
  nonce[10] = (chunkIndex >>> 8) & 0xff;
  nonce[11] = chunkIndex & 0xff;
  return nonce;
};

self.onmessage = async (event) => {
  const { type, file, key, noncePrefix, chunkSize, totalPlaintextBytes, headerBytes } = event.data;
  try {
    const cryptoKey = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, [
      type === 'encrypt' ? 'encrypt' : 'decrypt'
    ]);
    const noncePrefixBytes = new Uint8Array(noncePrefix);

    if (noncePrefixBytes.length !== NONCE_PREFIX_BYTES) {
      throw new Error('Invalid external bundle nonce prefix.');
    }

    if (type === 'encrypt') {
      let offset = 0;
      let chunkIndex = 0;
      while (offset < file.size) {
        const plaintext = await file.slice(offset, offset + chunkSize).arrayBuffer();
        const ciphertext = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: deriveNonce(noncePrefixBytes, chunkIndex) },
          cryptoKey,
          plaintext
        );
        offset += plaintext.byteLength;
        chunkIndex += 1;
        self.postMessage(
          { type: 'chunk', chunk: ciphertext, progress: file.size === 0 ? 1 : offset / file.size },
          [ciphertext]
        );
      }
      self.postMessage({ type: 'done' });
      return;
    }

    let offset = headerBytes;
    let processedPlaintext = 0;
    let chunkIndex = 0;
    while (processedPlaintext < totalPlaintextBytes) {
      const nextPlaintextBytes = Math.min(chunkSize, totalPlaintextBytes - processedPlaintext);
      const ciphertextBytes = nextPlaintextBytes + 16;
      const ciphertext = await file.slice(offset, offset + ciphertextBytes).arrayBuffer();
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: deriveNonce(noncePrefixBytes, chunkIndex) },
        cryptoKey,
        ciphertext
      );
      offset += ciphertextBytes;
      processedPlaintext += nextPlaintextBytes;
      chunkIndex += 1;
      self.postMessage(
        {
          type: 'chunk',
          chunk: plaintext,
          progress: totalPlaintextBytes === 0 ? 1 : processedPlaintext / totalPlaintextBytes
        },
        [plaintext]
      );
    }
    self.postMessage({ type: 'done' });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'File bundle worker failed.' });
  }
};
`;

const createFileBundleWorker = () => {
  const url = URL.createObjectURL(new Blob([FILE_BUNDLE_WORKER_SOURCE], { type: 'text/javascript' }));
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker;
};

const runFileBundleWorker = (
  message: Record<string, unknown>,
  onProgress?: (progress: number) => void,
  initialParts: BlobPart[] = []
) =>
  new Promise<Blob>((resolve, reject) => {
    const worker = createFileBundleWorker();
    const parts = [...initialParts];

    worker.onmessage = (event) => {
      const data = event.data as
        | { type: 'chunk'; chunk: ArrayBuffer; progress: number }
        | { type: 'done' }
        | { type: 'error'; message?: string };

      if (data.type === 'chunk') {
        parts.push(data.chunk);
        onProgress?.(Math.max(0, Math.min(1, data.progress)));
        return;
      }

      worker.terminate();

      if (data.type === 'error') {
        reject(new Error(data.message ?? 'File bundle worker failed.'));
        return;
      }

      resolve(new Blob(parts, { type: 'application/octet-stream' }));
    };

    worker.onerror = () => {
      worker.terminate();
      reject(new Error('File bundle worker failed.'));
    };

    worker.postMessage(message);
  });

export const encryptExternalFileToBlob = (input: {
  file: File;
  bundleId: string;
  keyBase64: string;
  noncePrefixBase64: string;
  chunkSize: number;
  onProgress?: (progress: number) => void;
}) => {
  const header = buildFileBundleHeader({
    bundleId: parseBase64BundleId(input.bundleId),
    chunkSize: input.chunkSize,
    totalPlaintextBytes: input.file.size
  });
  return runFileBundleWorker(
    {
      type: 'encrypt',
      file: input.file,
      key: base64ToBytes(input.keyBase64),
      noncePrefix: base64ToBytes(input.noncePrefixBase64),
      chunkSize: input.chunkSize
    },
    input.onProgress,
    [header.buffer]
  );
};

export const decryptExternalFileToBlob = async (input: {
  encryptedFile: File;
  bundleId: string;
  keyBase64: string;
  noncePrefixBase64: string;
  chunkSize: number;
  totalPlaintextBytes: number;
  onProgress?: (progress: number) => void;
}) => {
  const headerBytes = new Uint8Array(await input.encryptedFile.slice(0, FILE_BUNDLE_HEADER_BYTES).arrayBuffer());
  const header = parseFileBundleHeader(headerBytes);
  validateExternalFileBundleHeader(header, {
    bundleId: input.bundleId,
    chunkSize: input.chunkSize,
    totalPlaintextBytes: input.totalPlaintextBytes
  });
  return runFileBundleWorker(
    {
      type: 'decrypt',
      file: input.encryptedFile,
      key: base64ToBytes(input.keyBase64),
      noncePrefix: base64ToBytes(input.noncePrefixBase64),
      chunkSize: input.chunkSize,
      totalPlaintextBytes: input.totalPlaintextBytes,
      headerBytes: FILE_BUNDLE_HEADER_BYTES
    },
    input.onProgress
  );
};
