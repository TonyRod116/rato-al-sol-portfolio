// The old mask can remain on the map while a moved viewport is loading. Its
// geographic extent stays fixed, and it is never reused for another instant.
export function retainedShadow(result, { timeKey, visibleBounds, retryToken, sunStatus }) {
  if (!result?.uri || timeKey == null || result.timeKey !== timeKey || result.retryToken !== retryToken || sunStatus) return null;
  const old = result.area, next = visibleBounds;
  if (![old, next].every((bounds) => Array.isArray(bounds) && bounds.length === 4 && bounds.every(Number.isFinite))) return null;
  if (old[0] >= old[2] || old[1] >= old[3] || next[0] >= next[2] || next[1] >= next[3]) return null;
  return old[0] < next[2] && old[2] > next[0] && old[1] < next[3] && old[3] > next[1] ? result : null;
}
