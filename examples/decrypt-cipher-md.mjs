#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { argon2idAsync } from '@noble/hashes/argon2';
import { sha256 } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';
import { ml_kem768 } from '@noble/post-quantum/ml-kem';
import { x25519 } from '@noble/curves/ed25519';
import { gcm } from '@noble/ciphers/aes';
import { mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

const ENCRYPTION_ALGORITHM_PASSWORD = 'argon2id-mlkem768-aes256gcm';
const ENCRYPTION_ALGORITHM_SHAMIR = 'shamir-mlkem768-aes256gcm';
const X25519_PUBLIC_KEY_LEN = 32;
const PACKED_HEADER_LEN = 2;
const SHARE_BYTES = 32;

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

const initTables = () => {
  let x = 1;
  const generator = 0x03;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x = gfMulNoTable(x, generator);
  }
  for (let i = 255; i < 512; i += 1) {
    EXP[i] = EXP[i - 255];
  }
};

const gfMulNoTable = (a, b) => {
  let result = 0;
  let aa = a;
  let bb = b;
  while (bb > 0) {
    if (bb & 1) result ^= aa;
    aa <<= 1;
    if (aa & 0x100) aa ^= 0x11b;
    bb >>= 1;
  }
  return result;
};

const gfAdd = (a, b) => a ^ b;
const gfMul = (a, b) => {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
};

const gfDiv = (a, b) => {
  if (b === 0) throw new Error('Division by zero');
  if (a === 0) return 0;
  return EXP[LOG[a] + 255 - LOG[b]];
};

initTables();

const utf8ToBytes = (value) => new TextEncoder().encode(value);
const bytesToUtf8 = (value) => new TextDecoder().decode(value);

const concatBytes = (...arrays) => {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
};

const base64ToBytes = (value) => Uint8Array.from(Buffer.from(value, 'base64'));

const hexToBytes = (value) => {
  const normalized = value.replace(/\s+/g, '').trim().toLowerCase();
  if (!/^[0-9a-f]*$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error('Invalid hex string.');
  }
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

const zeroBytes = (value) => {
  value.fill(0);
};

const parseIntStrict = (value, label) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`Invalid integer for ${label}.`);
  }
  return parsed;
};

const getSectionBody = (markdown, heading) => {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const marker = `## ${heading}`;
  const start = normalized.indexOf(marker);
  if (start < 0) {
    throw new Error(`Missing section: ${heading}`);
  }

  const bodyStart = start + marker.length;
  const nextHeading = normalized.indexOf('\n## ', bodyStart);
  const bodyEnd = nextHeading >= 0 ? nextHeading : normalized.length;
  return normalized.slice(bodyStart, bodyEnd).trim();
};

const parseMetadataLines = (sectionBody) => {
  const metadata = new Map();
  for (const rawLine of sectionBody.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('- ')) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(2, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (metadata.has(key)) {
      throw new Error(`Duplicate metadata field: ${key}`);
    }
    metadata.set(key, value);
  }
  return metadata;
};

const getRequiredMetadata = (metadata, key) => {
  const value = metadata.get(key);
  if (!value) {
    throw new Error(`Missing required metadata field: ${key}`);
  }
  return value;
};

const buildPasswordAad = ({ version, created, hint, argon2, mlkem }) =>
  utf8ToBytes(
    JSON.stringify({
      version,
      created,
      hint,
      encryption: {
        type: 'password',
        algorithm: ENCRYPTION_ALGORITHM_PASSWORD,
        argon2,
        mlkem
      }
    })
  );

const buildShamirAad = ({ version, created, hint, threshold, totalShares, shareIdentifiers, mlkem }) =>
  utf8ToBytes(
    JSON.stringify({
      version,
      created,
      hint,
      encryption: {
        type: 'shamir',
        algorithm: ENCRYPTION_ALGORITHM_SHAMIR,
        threshold,
        totalShares,
        shareIdentifiers,
        mlkem
      }
    })
  );

const deriveX25519Secret = (seed) => sha256(concatBytes(seed, utf8ToBytes('x25519')));
const deriveMlKemSeed = (seed) => sha512(concatBytes(seed, utf8ToBytes('mlkem'))).slice(0, 64);

const deriveHybridReceiverKeys = (seed) => {
  const { publicKey, secretKey } = ml_kem768.keygen(deriveMlKemSeed(seed));
  const x25519SecretKey = deriveX25519Secret(seed);
  const x25519PublicKey = x25519.getPublicKey(x25519SecretKey);
  return { mlkemSecretKey: secretKey, x25519SecretKey, x25519PublicKey };
};

const decapsulateHybrid = (receiver, packed) => {
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

const combineShares = (shares) => {
  if (shares.length < 2) {
    throw new Error('At least two shares are required.');
  }
  const length = shares[0].data.length;
  if (length !== SHARE_BYTES) {
    throw new Error('Share length is invalid.');
  }

  const ids = new Set();
  for (const share of shares) {
    if (!Number.isInteger(share.id) || share.id < 1 || share.id > 255) {
      throw new Error('Share id must be an integer between 1 and 255.');
    }
    if (share.data.length !== length) {
      throw new Error('Share lengths do not match.');
    }
    if (ids.has(share.id)) {
      throw new Error('Duplicate share identifiers.');
    }
    ids.add(share.id);
  }

  const secret = new Uint8Array(length);
  for (let byteIndex = 0; byteIndex < length; byteIndex += 1) {
    let value = 0;
    for (let j = 0; j < shares.length; j += 1) {
      const { id: xj, data } = shares[j];
      let numerator = 1;
      let denominator = 1;
      for (let m = 0; m < shares.length; m += 1) {
        if (m === j) continue;
        const xm = shares[m].id;
        numerator = gfMul(numerator, xm);
        denominator = gfMul(denominator, gfAdd(xm, xj));
      }
      const lagrange = gfDiv(numerator, denominator);
      value = gfAdd(value, gfMul(data[byteIndex], lagrange));
    }
    secret[byteIndex] = value;
  }

  return secret;
};

const parseShareInput = (input) => {
  const trimmed = input.trim();
  const match = /^(\d+)\s*:\s*(.+)$/.exec(trimmed);
  if (!match) {
    throw new Error('Share must include id prefix like "1: <share>".');
  }

  const id = Number(match[1]);
  if (!Number.isInteger(id) || id < 1 || id > 255) {
    throw new Error('Share id must be an integer between 1 and 255.');
  }

  const payload = match[2].trim();
  if (!payload) {
    throw new Error('Share value is missing.');
  }

  return { id, payload };
};

const parseShamirShares = (shareValues, format) =>
  shareValues.map((value) => {
    const { id, payload } = parseShareInput(value);
    const data =
      format === 'hex'
        ? hexToBytes(payload)
        : mnemonicToEntropy(payload.split(/\s+/).join(' ').trim(), wordlist);
    if (data.length !== SHARE_BYTES) {
      throw new Error('Share length is invalid.');
    }
    return { id, data };
  });

const extractCiphertext = (markdown) => {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const match = /## Ciphertext \(base64\)\s*```text\n([\s\S]*?)\n```/m.exec(normalized);
  if (!match) {
    throw new Error('Missing or malformed ciphertext block.');
  }
  const payload = match[1].trim();
  if (!payload) {
    throw new Error('Ciphertext block is empty.');
  }
  return payload;
};

export const parseCipherMarkdown = (markdown) => {
  const payload = extractCiphertext(markdown);
  const metadataSection = getSectionBody(markdown, 'Vault Metadata');
  const metadata = parseMetadataLines(metadataSection);

  const version = parseIntStrict(getRequiredMetadata(metadata, 'Vault version'), 'Vault version');
  const created = getRequiredMetadata(metadata, 'Created');
  const hintRaw = getRequiredMetadata(metadata, 'Hint');
  const hint = hintRaw === '[none]' ? undefined : hintRaw;
  const encryptionMode = getRequiredMetadata(metadata, 'Encryption mode');
  const algorithm = getRequiredMetadata(metadata, 'Algorithm');
  const nonce = getRequiredMetadata(metadata, 'Nonce (base64)');
  const encapsulatedKey = getRequiredMetadata(metadata, 'Encapsulated key (base64)');

  if (encryptionMode === 'password') {
    if (algorithm !== ENCRYPTION_ALGORITHM_PASSWORD) {
      throw new Error(`Unexpected algorithm for password mode: ${algorithm}`);
    }

    const vault = {
      version,
      created,
      hint,
      encryption: {
        type: 'password',
        algorithm,
        argon2: {
          salt: getRequiredMetadata(metadata, 'Argon2 salt (base64)'),
          timeCost: parseIntStrict(getRequiredMetadata(metadata, 'Argon2 time cost'), 'Argon2 time cost'),
          memoryCost: parseIntStrict(
            getRequiredMetadata(metadata, 'Argon2 memory cost (MB)'),
            'Argon2 memory cost (MB)'
          ),
          parallelism: parseIntStrict(getRequiredMetadata(metadata, 'Argon2 parallelism'), 'Argon2 parallelism')
        },
        mlkem: { encapsulatedKey },
        nonce
      },
      payload
    };

    return { vault };
  }

  if (encryptionMode === 'shamir') {
    if (algorithm !== ENCRYPTION_ALGORITHM_SHAMIR) {
      throw new Error(`Unexpected algorithm for shamir mode: ${algorithm}`);
    }

    const shareIdentifiersRaw = getRequiredMetadata(metadata, 'Share identifiers');
    const shareIdentifiers = shareIdentifiersRaw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const vault = {
      version,
      created,
      hint,
      encryption: {
        type: 'shamir',
        algorithm,
        threshold: parseIntStrict(getRequiredMetadata(metadata, 'Shamir threshold (k)'), 'Shamir threshold (k)'),
        totalShares: parseIntStrict(getRequiredMetadata(metadata, 'Shamir total shares (n)'), 'Shamir total shares (n)'),
        shareIdentifiers,
        mlkem: { encapsulatedKey },
        nonce
      },
      payload
    };

    return { vault };
  }

  throw new Error(`Unsupported encryption mode: ${encryptionMode}`);
};

const decryptPasswordVault = async (vault, password) => {
  const passwordBytes = utf8ToBytes(password);
  const key = await (async () => {
    try {
      return await argon2idAsync(passwordBytes, base64ToBytes(vault.encryption.argon2.salt), {
        t: vault.encryption.argon2.timeCost,
        m: vault.encryption.argon2.memoryCost * 1024,
        p: vault.encryption.argon2.parallelism,
        dkLen: 32
      });
    } finally {
      zeroBytes(passwordBytes);
    }
  })();

  const receiver = deriveHybridReceiverKeys(key);
  const sharedSecret = decapsulateHybrid(receiver, base64ToBytes(vault.encryption.mlkem.encapsulatedKey));
  const aad =
    vault.version >= 2
      ? buildPasswordAad({
          version: vault.version,
          created: vault.created,
          hint: vault.hint,
          argon2: vault.encryption.argon2,
          mlkem: vault.encryption.mlkem
        })
      : undefined;

  try {
    const plaintext = gcm(sharedSecret, base64ToBytes(vault.encryption.nonce), aad).decrypt(base64ToBytes(vault.payload));
    try {
      return JSON.parse(bytesToUtf8(plaintext));
    } finally {
      zeroBytes(plaintext);
    }
  } catch {
    throw new Error('Decryption failed. Check your password and metadata.');
  } finally {
    zeroBytes(key);
    zeroBytes(sharedSecret);
  }
};

const decryptShamirVault = (vault, shareValues, shareFormat) => {
  const shares = parseShamirShares(shareValues, shareFormat);
  if (shares.length < vault.encryption.threshold) {
    throw new Error(`At least ${vault.encryption.threshold} shares are required.`);
  }

  const masterSeed = combineShares(shares);
  const receiver = deriveHybridReceiverKeys(masterSeed);
  const sharedSecret = decapsulateHybrid(receiver, base64ToBytes(vault.encryption.mlkem.encapsulatedKey));
  const aad =
    vault.version >= 2
      ? buildShamirAad({
          version: vault.version,
          created: vault.created,
          hint: vault.hint,
          threshold: vault.encryption.threshold,
          totalShares: vault.encryption.totalShares,
          shareIdentifiers: vault.encryption.shareIdentifiers,
          mlkem: vault.encryption.mlkem
        })
      : undefined;

  try {
    const plaintext = gcm(sharedSecret, base64ToBytes(vault.encryption.nonce), aad).decrypt(base64ToBytes(vault.payload));
    try {
      return JSON.parse(bytesToUtf8(plaintext));
    } finally {
      zeroBytes(plaintext);
    }
  } catch {
    throw new Error('Decryption failed. Check your shares and metadata.');
  } finally {
    zeroBytes(masterSeed);
    zeroBytes(sharedSecret);
  }
};

export const decryptFromCipherMarkdown = async ({ markdown, mode, password, shares, shareFormat = 'words' }) => {
  const { vault } = parseCipherMarkdown(markdown);

  if (mode !== 'password' && mode !== 'shamir') {
    throw new Error('Mode must be either "password" or "shamir".');
  }

  if (vault.encryption.type !== mode) {
    throw new Error(`Requested mode (${mode}) does not match markdown mode (${vault.encryption.type}).`);
  }

  if (mode === 'password') {
    if (!password) {
      throw new Error('Password is required for password mode.');
    }
    return await decryptPasswordVault(vault, password);
  }

  if (!Array.isArray(shares) || shares.length === 0) {
    throw new Error('At least one --share value is required for shamir mode.');
  }

  if (shareFormat !== 'words' && shareFormat !== 'hex') {
    throw new Error('Share format must be "words" or "hex".');
  }

  return decryptShamirVault(vault, shares, shareFormat);
};

const parseCliArgs = (argv) => {
  const options = { shares: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      options.help = true;
      continue;
    }

    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for argument: ${token}`);
    }

    if (token === '--md') {
      options.md = value;
    } else if (token === '--mode') {
      options.mode = value;
    } else if (token === '--password') {
      options.password = value;
    } else if (token === '--share') {
      options.shares.push(value);
    } else if (token === '--share-format') {
      options.shareFormat = value;
    } else if (token === '--out') {
      options.out = value;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }

    i += 1;
  }

  return options;
};

const usage = `Usage:
  node examples/decrypt-cipher-md.mjs --md <file.md> --mode password --password <secret> [--out decrypted.json]
  node examples/decrypt-cipher-md.mjs --md <file.md> --mode shamir --share "1: ..." --share "2: ..." [--share-format words|hex] [--out decrypted.json]

Notes:
  - --mode is required and must match the markdown encryption mode.
  - --share can be repeated multiple times for shamir mode.
  - Share values must include an id prefix, e.g. "2: <share payload>".`;

const runCli = async () => {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    return;
  }

  if (!options.md) {
    throw new Error('Missing required --md argument.');
  }

  if (!options.mode) {
    throw new Error('Missing required --mode argument.');
  }

  const markdown = await readFile(options.md, 'utf8');
  const decrypted = await decryptFromCipherMarkdown({
    markdown,
    mode: options.mode,
    password: options.password,
    shares: options.shares,
    shareFormat: options.shareFormat ?? 'words'
  });

  const output = JSON.stringify(decrypted, null, 2);
  if (options.out) {
    await writeFile(options.out, output, 'utf8');
    console.log(`Decrypted data written to ${options.out}`);
  } else {
    console.log(output);
  }
};

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  runCli().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    console.error('');
    console.error(usage);
    process.exitCode = 1;
  });
}
