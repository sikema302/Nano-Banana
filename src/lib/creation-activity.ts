export function findCreationActivityStageIndex<T>(
  stageCards: Array<T | null>,
  options: {
    batchCount: number;
    loading: boolean;
    activeGenerationStageIndex: number;
  },
): number {
  if (options.batchCount > 1) return -1;

  return stageCards.findIndex((item, index) => (
    item === null
    && !(options.loading && index === options.activeGenerationStageIndex)
  ));
}
