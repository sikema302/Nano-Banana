export function findCreationActivityStageIndex<T>(
  stageCards: Array<T | null>,
  options: {
    batchCount: number;
    loading: boolean;
    activeGenerationStageIndex: number;
    activeGenerationStageIndexes?: number[];
  },
): number {
  if (options.batchCount > 1) return -1;

  const activeIndexes = new Set(options.activeGenerationStageIndexes || [options.activeGenerationStageIndex]);

  return stageCards.findIndex((item, index) => (
    item === null
    && !(options.loading && activeIndexes.has(index))
  ));
}
