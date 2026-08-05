type ImageChannelFailoverOptions = {
  cooldownMs?: number;
  now?: () => number;
};

export function createImageChannelFailover(options: ImageChannelFailoverOptions = {}) {
  const cooldownMs = Math.max(0, options.cooldownMs ?? 30_000);
  const now = options.now ?? Date.now;
  const retryAfterByChannel = new Map<string, number>();

  function channelKey(routeKey: string, channelId: string) {
    return `${routeKey}:${channelId}`;
  }

  function candidates(routeKey: string, channelIds: string[]) {
    const currentTime = now();
    const ready = channelIds.filter((channelId) => {
      const key = channelKey(routeKey, channelId);
      const retryAfter = retryAfterByChannel.get(key) || 0;
      if (retryAfter <= currentTime) {
        retryAfterByChannel.delete(key);
        return true;
      }
      return false;
    });

    // If every route failed very recently, retry the configured order instead of
    // rejecting the request without trying. This keeps the user's experience smooth.
    return ready.length > 0 ? ready : [...channelIds];
  }

  function markFailure(routeKey: string, channelId: string) {
    retryAfterByChannel.set(channelKey(routeKey, channelId), now() + cooldownMs);
  }

  function markSuccess(routeKey: string, channelId: string) {
    retryAfterByChannel.delete(channelKey(routeKey, channelId));
  }

  function reset() {
    retryAfterByChannel.clear();
  }

  return { candidates, markFailure, markSuccess, reset };
}
