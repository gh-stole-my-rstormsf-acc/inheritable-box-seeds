import { describe, expect, it } from 'vitest';
import {
  FILE_BUNDLE_CHUNK_SIZE,
  FILE_BUNDLE_HEADER_BYTES,
  buildExternalBundleFileName,
  buildExternalFileBundleMetadata,
  buildFileBundleHeader,
  parseBase64BundleId,
  parseFileBundleHeader,
  validateExternalFileBundleHeader
} from '../../src/shared/fileBundle';

describe('external file bundle metadata', () => {
  it('round-trips bundle headers', () => {
    const metadata = buildExternalFileBundleMetadata({
      index: 0,
      label: 'Primary Export',
      fileName: 'backup.kdbx',
      mimeType: 'application/octet-stream',
      openHint: 'Open with KeePassXC',
      size: 11 * 1024 * 1024
    });

    const headerBytes = buildFileBundleHeader({
      bundleId: parseBase64BundleId(metadata.entry.bundleId),
      chunkSize: metadata.entry.chunkSize,
      totalPlaintextBytes: metadata.entry.size
    });

    expect(headerBytes.byteLength).toBe(FILE_BUNDLE_HEADER_BYTES);

    const parsed = parseFileBundleHeader(headerBytes);
    expect(parsed.chunkSize).toBe(FILE_BUNDLE_CHUNK_SIZE);
    expect(parsed.totalPlaintextBytes).toBe(11 * 1024 * 1024);
    expect(parsed.bundleId).toEqual(parseBase64BundleId(metadata.entry.bundleId));
  });

  it('validates bundle metadata against the expected vault entry', () => {
    const metadata = buildExternalFileBundleMetadata({
      index: 1,
      label: 'Archive',
      fileName: 'vault export.zip',
      mimeType: 'application/zip',
      openHint: 'Inspect offline',
      size: 12345
    });
    const header = parseFileBundleHeader(
      buildFileBundleHeader({
        bundleId: parseBase64BundleId(metadata.entry.bundleId),
        chunkSize: metadata.entry.chunkSize,
        totalPlaintextBytes: metadata.entry.size
      })
    );

    expect(() =>
      validateExternalFileBundleHeader(header, {
        bundleId: metadata.entry.bundleId,
        chunkSize: metadata.entry.chunkSize,
        totalPlaintextBytes: metadata.entry.size
      })
    ).not.toThrow();

    expect(() =>
      validateExternalFileBundleHeader(header, {
        bundleId: metadata.entry.bundleId,
        chunkSize: metadata.entry.chunkSize * 2,
        totalPlaintextBytes: metadata.entry.size
      })
    ).toThrow(/chunk size does not match/i);
  });

  it('builds deterministic external bundle filenames', () => {
    expect(buildExternalBundleFileName(0, 'backup.kdbx')).toBe('seed-vault-file-01-backup.kdbx.svf');
    expect(buildExternalBundleFileName(11, 'vault export.zip')).toBe('seed-vault-file-12-vault export.zip.svf');
  });
});
