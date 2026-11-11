const empty = { find: async () => null, findMany: async () => null, save: async () => false, clear: async () => true };
export const buildingCache = empty, sceneCache = empty, searchCache = empty;
export const shadowCache = { get: async () => null, put: async () => false, prune: async () => true, clear: async () => true };
export function cacheGeneration() { return 0; }
export async function clearOfflineData() { return true; }
