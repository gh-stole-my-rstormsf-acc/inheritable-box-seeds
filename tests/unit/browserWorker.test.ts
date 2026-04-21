// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { shouldUseModuleWorker } from '../../src/shared/browserWorker';

describe('browserWorker', () => {
  it('keeps hosted workers in module mode', () => {
    expect(shouldUseModuleWorker('https:')).toBe(true);
  });

  it('falls back to classic workers for file protocol pages', () => {
    expect(shouldUseModuleWorker('file:')).toBe(false);
  });
});
