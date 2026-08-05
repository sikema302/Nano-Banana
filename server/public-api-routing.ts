export type PublicApiProviderRouting = 'junliai_dedicated';

// Ordinary public API keys intentionally share the website routes. The dedicated
// marker is internal task state; legacy `junliai_only` records still migrate away.
export function normalizePublicApiProviderRouting(value: unknown): PublicApiProviderRouting | undefined {
  return value === 'junliai_dedicated' ? value : undefined;
}
