import * as FileSystem from 'expo-file-system/legacy';
import { createBuildingCache, createBuildingFileStore } from './building-cache.mjs';
import { createSceneCache, createSceneFileStore } from './scene-cache.mjs';
import { createSearchCache, createSearchFileStore } from './search-cache.mjs';
import { createShadowCache } from './shadow-cache.mjs';

// These caches are local to this installation. A generation prevents a
// request started before clearing from writing its result afterwards.
let generation = 0;
export const buildingCache = createBuildingCache(createBuildingFileStore(FileSystem));
export const sceneCache = createSceneCache(createSceneFileStore(FileSystem));
export const searchCache = createSearchCache(createSearchFileStore(FileSystem));
export const shadowCache = createShadowCache(FileSystem, { currentGeneration: () => generation });
void shadowCache.prune();
function scheduleShadowDayCleanup() {
  const next = new Date();
  next.setHours(24, 0, 0, 0);
  setTimeout(() => {
    void shadowCache.prune();
    scheduleShadowDayCleanup();
  }, Math.max(1000, next.getTime() - Date.now()));
}
scheduleShadowDayCleanup();
export function cacheGeneration() { return generation; }
export async function clearOfflineData() {
  generation++;
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(false), 3000); });
  try {
    return await Promise.race([Promise.all([buildingCache.clear(), sceneCache.clear(), searchCache.clear(), shadowCache.clear()])
      .then((results) => results.every(Boolean)), timeout]);
  } finally { clearTimeout(timer); }
}
