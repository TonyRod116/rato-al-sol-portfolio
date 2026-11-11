// Reuse only a finished result from the same source and coverage. These
// helpers keep original fetch timestamps and do not make cache failures fatal.
export function createCachedServices({ scenes, sceneCache, searchCache, generation, now = Date.now, schedule = setTimeout }) {
  const saveLater = (epoch, save) => schedule(() => { if (generation() === epoch) void save(); }, 500);
  async function cachedScenes(points, { force = false } = {}) {
    const epoch = generation();
    const hit = force ? null : points.length === 1 ? await sceneCache.find(points[0]) : await sceneCache.findMany(points);
    if (generation() === epoch && hit) {
      return { ...hit.value, cacheInfo: { fetchedAt: hit.fetchedAt, stale: hit.stale, limited: hit.value.radius < 200 } };
    }
    const fetchedAt = now();
    const value = await scenes(points);
    if (generation() === epoch) saveLater(epoch, () => sceneCache.save(points, value, { fetchedAt }));
    return value;
  }
  async function cachedSearch(spec, query, { force = false } = {}) {
    const epoch = generation();
    const hit = force ? null : await searchCache.find(spec);
    if (hit && generation() === epoch) return { places: hit.places, cached: true, stale: hit.stale, partial: hit.partial, fetchedAt: hit.fetchedAt };
    const fetchedAt = now();
    const places = await query();
    const partial = places.length >= 80;
    if (generation() === epoch) saveLater(epoch, () => searchCache.save(spec, places, { complete: true, partial, fetchedAt }));
    return { places, cached: false, stale: false, partial };
  }
  return { cachedScenes, cachedSearch };
}
