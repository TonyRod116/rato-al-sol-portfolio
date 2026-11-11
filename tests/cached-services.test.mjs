import test from 'node:test';
import assert from 'node:assert/strict';
import { createCachedServices } from '../mobile/src/cached-services.mjs';

test('a previously saved search and scene do not call their providers', async () => {
  let calls = 0;
  const hit = { entryId: 'same', fetchedAt: 10, stale: true, value: { buildings: [1], radius: 240, source: 'madrid' } };
  const service = createCachedServices({ scenes: async () => { calls++; }, sceneCache: { find: async () => hit, findMany: async () => hit },
    searchCache: { find: async () => ({ places: [{ id: 'p' }], stale: true, fetchedAt: 20 }) }, generation: () => 0 });
  const scene = await service.cachedScenes([{}, {}]);
  const search = await service.cachedSearch({}, () => { calls++; });
  assert.equal(calls, 0); assert.equal(scene.radius, 240); assert.equal(scene.cacheInfo.stale, true);
  assert.equal(search.cached, true); assert.equal(search.stale, true);
});

test('different cached scenes fetch full coverage instead of mixing circles', async () => {
  let calls = 0, saved = 0;
  const service = createCachedServices({ scenes: async () => { calls++; return { buildings: [1], radius: 400, source: 'osm' }; },
    sceneCache: { findMany: async () => null, save: async () => { saved++; } },
    searchCache: {}, generation: () => 0, now: () => 100, schedule: (fn) => fn() });
  assert.equal((await service.cachedScenes([{}, {}])).radius, 400);
  assert.equal(calls, 1); assert.equal(saved, 1);
});

test('clearing cached data while a request is running prevents a late save', async () => {
  let epoch = 0, finish, saved = 0;
  const service = createCachedServices({ scenes: () => new Promise((resolve) => { finish = resolve; }),
    sceneCache: { find: async () => null, save: async () => { saved++; } }, searchCache: {}, generation: () => epoch, schedule: (fn) => fn() });
  const pending = service.cachedScenes([{}]);
  await new Promise((resolve) => setImmediate(resolve)); epoch++;
  finish({ buildings: [1], radius: 250, source: 'madrid' }); await pending;
  assert.equal(saved, 0);
});

test('a capped search remains marked partial when stored', async () => {
  let options;
  const service = createCachedServices({ scenes: () => {}, sceneCache: {}, generation: () => 0, schedule: (fn) => fn(),
    searchCache: { find: async () => null, save: async (_spec, _places, value) => { options = value; } } });
  const result = await service.cachedSearch({}, async () => Array.from({ length: 80 }, () => ({})));
  assert.equal(result.partial, true);
  assert.equal(options.partial, true);
});

test('a deferred write cannot restore data after clearing', async () => {
  let epoch = 0, scheduled, saved = 0;
  const service = createCachedServices({ scenes: async () => ({ buildings: [1], radius: 250, source: 'madrid' }),
    sceneCache: { find: async () => null, save: async () => { saved++; } }, searchCache: {}, generation: () => epoch,
    schedule: (fn) => { scheduled = fn; } });
  await service.cachedScenes([{}]); epoch++; scheduled();
  assert.equal(saved, 0);
});

test('a manual refresh bypasses saved searches and scenes', async () => {
  let reads = 0, calls = 0;
  const service = createCachedServices({ generation: () => 0, schedule: (fn) => fn(),
    scenes: async () => { calls++; return { buildings: [1], radius: 250, source: 'madrid' }; },
    sceneCache: { find: async () => { reads++; }, save: async () => true },
    searchCache: { find: async () => { reads++; }, save: async () => true } });
  await service.cachedScenes([{}], { force: true });
  await service.cachedSearch({}, async () => { calls++; return []; }, { force: true });
  assert.equal(reads, 0); assert.equal(calls, 2);
});
