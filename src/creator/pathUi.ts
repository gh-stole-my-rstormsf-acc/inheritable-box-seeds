export const ONLY_PATH_TOOLTIP = "Can't remove the only path for this seed.";

interface PreviewPathLike {
  deriveCount: number;
}

interface PreviewSeedLike {
  paths: PreviewPathLike[];
}

export const canRemovePath = (pathCountForSeed: number) => pathCountForSeed > 1;

export const getOnlyPathTooltip = (pathCountForSeed: number) =>
  canRemovePath(pathCountForSeed) ? '' : ONLY_PATH_TOOLTIP;

export const getTotalPreviewCount = (seeds: PreviewSeedLike[]) =>
  seeds.reduce(
    (sum, seed) => sum + seed.paths.reduce((pathSum, path) => pathSum + path.deriveCount, 0),
    0
  );

export const shouldShowLargePreviewWarning = (totalPreviewCount: number) => totalPreviewCount > 50;
