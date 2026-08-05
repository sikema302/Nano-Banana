// Public API keys intentionally share the website's managed provider routes.
// Returning undefined also migrates the previous `junliai_only` key setting.
export function normalizePublicApiProviderRouting(_value: unknown): undefined {
  return undefined;
}
