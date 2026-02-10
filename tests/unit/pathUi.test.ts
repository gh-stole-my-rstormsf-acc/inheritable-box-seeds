import { describe, expect, it } from 'vitest';
import {
  ONLY_PATH_TOOLTIP,
  canRemovePath,
  getOnlyPathTooltip,
  getTotalPreviewCount,
  shouldShowLargePreviewWarning
} from '../../src/creator/pathUi';

describe('path UI helpers', () => {
  it('blocks remove action when only one path exists', () => {
    expect(canRemovePath(1)).toBe(false);
    expect(getOnlyPathTooltip(1)).toBe(ONLY_PATH_TOOLTIP);
  });

  it('allows remove action when there are multiple paths', () => {
    expect(canRemovePath(2)).toBe(true);
    expect(getOnlyPathTooltip(2)).toBe('');
  });

  it('calculates total preview address count across seeds', () => {
    const total = getTotalPreviewCount([
      { paths: [{ deriveCount: 10 }, { deriveCount: 5 }] },
      { paths: [{ deriveCount: 2 }] }
    ]);
    expect(total).toBe(17);
  });

  it('flags large preview totals above the threshold', () => {
    expect(shouldShowLargePreviewWarning(50)).toBe(false);
    expect(shouldShowLargePreviewWarning(51)).toBe(true);
  });
});
