export function requestSourceLabel(provider: string, sourceModel: string) {
  const rawProvider = String(provider || '').trim();
  const model = String(sourceModel || '').trim();
  const providerRoot = rawProvider.split('·')[0].trim();
  const source = /^junliai$/i.test(providerRoot) ? 'Junli' : providerRoot;

  if (!source) return model;
  if (!model || source.toLowerCase() === model.toLowerCase()) return source;
  if (model.toLowerCase().startsWith(`${source.toLowerCase()} ·`)) return model;
  return `${source} · ${model}`;
}
