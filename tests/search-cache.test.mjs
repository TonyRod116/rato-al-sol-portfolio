import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchCache, createSearchFileStore } from '../mobile/src/search-cache.mjs';

function memoryStore() {
  const values = new Map();
  return { values, async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); }, async removeItem(key) { values.delete(key); } };
}
const madrid = { source: 'osm-search', query: 'Parque del Retiro', center: { latitude: 40.42, longitude: -3.69 }, radius: 5000 };
const barcelona = { source: 'barcelona-terraces', query: '', center: { latitude: 41.39172, longitude: 2.16495 }, radius: 1000 };
const place = { id: 'way/12', name: 'Lugar sintético', latitude: 40.42, longitude: -3.69,
  distance: 20, kind: 'public', unusedPrivateField: 'must not be cached' };

test('Madrid European nearby searches do not reuse an older empty worldwide result', async () => {
  const cache = createSearchCache(memoryStore());
  const older = { ...madrid, source: 'osm-nearby', query: '', radius: 500 };
  const european = { ...older, source: 'osm-nearby-eu' };
  assert.equal(await cache.save(older, [], { complete: true }), true);
  assert.equal(await cache.find(european), null);
  assert.equal(await cache.save(european, [place], { complete: true }), true);
  assert.equal((await cache.find(european)).places.length, 1);
  assert.equal(await cache.save({ ...european, query: 'abc' }, [place], { complete: true }), false);
  assert.equal(await cache.save({ ...european, center: barcelona.center }, [place], { complete: true }), false);
});

test('a successful provider result survives restart for the same query and radius', async () => {
  const store = memoryStore();
  let now = 1000;
  const cache = createSearchCache(store, { now: () => now });
  assert.equal(await cache.save(madrid, [place], { complete: true }), true);
  const afterRestart = createSearchCache(store, { now: () => now });
  const match = await afterRestart.find(madrid);
  assert.equal(match.source, 'osm-search'); assert.equal(match.fetchedAt, 1000); assert.equal(match.stale, false); assert.equal(match.partial, false);
  assert.equal(match.places[0].name, place.name); assert.equal(match.places[0].unusedPrivateField, undefined);
  assert.equal(await afterRestart.find({ ...madrid, query: 'parque del retiro' }), null);
  assert.equal(await afterRestart.find({ ...madrid, radius: 1000 }), null);
  assert.equal(await afterRestart.find({ ...madrid, source: 'madrid-parks' }), null);
  assert.equal(await afterRestart.find({ ...madrid, center: { ...madrid.center, latitude: 40.421 } }), null);
  now += 24 * 60 * 60 * 1000;
  assert.equal((await afterRestart.find(madrid)).stale, true);
  assert.equal((await afterRestart.find(madrid)).fetchedAt, 1000, 'reads do not renew original fetch time');
});

test('nearby centres reuse as partial, recalculate distance and filter outside radius', async () => {
  const cache = createSearchCache(memoryStore());
  const query = { ...madrid, radius: 1000 };
  const edge = { ...place, id: 'way/13', name: 'Borde sintético', latitude: 40.42895, distance: 996 };
  assert.equal(await cache.save(query, [place, edge], { complete: true }), true);
  const shifted = { ...query, center: { ...query.center, latitude: 40.4198 } };
  const result = await cache.find(shifted);
  assert.equal(result.partial, true);
  assert.ok(result.centerShiftMetres > 20 && result.centerShiftMetres < 25);
  assert.deepEqual(result.places.map((item) => item.id), ['way/12']);
  assert.ok(result.places[0].distance > 20 && result.places[0].distance < 25, 'distance reflects the new centre');
  assert.equal(await cache.find({ ...query, center: { ...query.center, latitude: 40.4197 } }), null, 'over 25 m is a miss');
});

test('a finished but truncated provider response stays partial, even at the exact centre', async () => {
  const store = memoryStore();
  const cache = createSearchCache(store);
  assert.equal(await cache.save(madrid, [place], { complete: true, partial: true }), true);
  const result = await createSearchCache(store).find(madrid);
  assert.equal(result.partial, true);
  assert.equal(result.places[0].distance, place.distance, 'an exact-centre hit does not alter the returned distance');
  const shifted = await cache.find({ ...madrid, center: { ...madrid.center, latitude: 40.4199 } });
  assert.equal(shifted.partial, true);
  assert.ok(shifted.places[0].distance > 10 && shifted.places[0].distance < 12);
  assert.equal(await cache.save(madrid, [place], { complete: true, partial: 'yes' }), false);
});

test('an exact cache hit takes precedence over a newer nearby incomplete reuse', async () => {
  let now = 1000;
  const cache = createSearchCache(memoryStore(), { now: () => now });
  assert.equal(await cache.save(madrid, [{ ...place, name: 'Exacto' }], { complete: true }), true);
  now += 100;
  const near = { ...madrid, center: { ...madrid.center, latitude: 40.4201 } };
  assert.equal(await cache.save(near, [{ ...place, name: 'Cercano' }], { complete: true }), true);
  const result = await cache.find(madrid);
  assert.equal(result.partial, false);
  assert.equal(result.places[0].name, 'Exacto');
});

test('partial, invalid, other city and mismatched-provider results are not cached', async () => {
  const cache = createSearchCache(memoryStore());
  assert.equal(await cache.save(madrid, [place]), false, 'completion must be explicit');
  assert.equal(await cache.save(madrid, [place], { complete: false }), false);
  assert.equal(await cache.save({ ...madrid, source: 'barcelona-terraces' }, [place], { complete: true }), false);
  assert.equal(await cache.save({ ...madrid, center: { latitude: 48.85, longitude: 2.35 } }, [place], { complete: true }), false);
  assert.equal(await cache.save(madrid, [{ ...place, latitude: NaN }], { complete: true }), false);
  assert.equal(await cache.find(madrid), null);
  assert.equal(await cache.save(barcelona, [], { complete: true }), true, 'a complete empty result is still a valid search');
  assert.deepEqual((await cache.find(barcelona)).places, []);
});

test('older search entries are evicted within the byte and item budget', async () => {
  const store = memoryStore(); let now = 1000;
  const cache = createSearchCache(store, { now: () => now, maxBytes: 3000, maxEntries: 2 });
  for (const query of ['primero', 'segundo', 'tercero']) {
    assert.equal(await cache.save({ ...madrid, query }, [place], { complete: true }), true); now++;
  }
  assert.equal(await cache.find({ ...madrid, query: 'primero' }), null);
  assert.ok(await cache.find({ ...madrid, query: 'tercero' }));
  const bytes = [...store.values.values()].reduce((n, value) => n + Buffer.byteLength(value), 0);
  assert.ok(bytes <= 3000, 'budget includes the index and each item');
  assert.equal(await cache.clear(), true); assert.equal(await cache.find({ ...madrid, query: 'tercero' }), null);
});

test('an older provider response arriving late cannot replace a newer one', async () => {
  const cache = createSearchCache(memoryStore(), { now: () => 5000 });
  let completeOld;
  const olderResult = new Promise((resolve) => { completeOld = resolve; }).then((places) => cache.save(madrid, places, { complete: true, fetchedAt: 2000 }));
  assert.equal(await cache.save(madrid, [{ ...place, name: 'Resultado reciente' }], { complete: true, fetchedAt: 4000 }), true);
  completeOld([{ ...place, name: 'Resultado antiguo' }]);
  assert.equal(await olderResult, false);
  assert.equal((await cache.find(madrid)).places[0].name, 'Resultado reciente');
});

test('corrupt data, full disk and unresponsive storage never break search', async () => {
  const corrupt = memoryStore(); corrupt.values.set('index', '{invalid');
  assert.equal(await createSearchCache(corrupt).find(madrid), null);
  const broken = { getItem: async () => { throw new Error('disk'); }, setItem: async () => { throw new Error('disk'); }, removeItem: async () => {} };
  const brokenCache = createSearchCache(broken);
  assert.equal(await brokenCache.find(madrid), null); assert.equal(await brokenCache.save(madrid, [place], { complete: true }), false);
  const stuckCache = createSearchCache({ getItem: () => new Promise(() => {}), setItem: async () => {}, removeItem: async () => {} }, { ioTimeoutMs: 15 });
  assert.equal(await stuckCache.find(madrid), null);
});

test('file storage stays in its app cache directory and rejects arbitrary paths', async () => {
  const files = new Map();
  const fs = { cacheDirectory: 'file:///private/cache/', async getInfoAsync(path) { return path.endsWith('/') ? { exists: true, isDirectory: true } : { exists: files.has(path) }; },
    async readAsStringAsync(path) { return files.get(path); }, async writeAsStringAsync(path, value) { files.set(path, value); }, async deleteAsync(path) { files.delete(path); } };
  const store = createSearchFileStore(fs);
  await store.setItem('item-1-a', 'data');
  assert.equal(await store.getItem('item-1-a'), 'data');
  assert.deepEqual([...files.keys()], ['file:///private/cache/rato-search-cache-v1/item-1-a.json']);
  await assert.rejects(store.setItem('../other', 'bad'));
});

test('a corrupt index discards only our orphaned search files', async () => {
  const root = 'file:///private/cache/rato-search-cache-v1/';
  const files = new Map([[`${root}index.json`, '{broken'], [`${root}item-abc-1.json`, 'orphan'], [`${root}unrelated.txt`, 'keep']]);
  const fs = { cacheDirectory: 'file:///private/cache/', async getInfoAsync(path) { return path.endsWith('/') ? { exists: true, isDirectory: true } : { exists: files.has(path) }; },
    async readAsStringAsync(path) { return files.get(path); }, async writeAsStringAsync(path, value) { files.set(path, value); },
    async deleteAsync(path) { files.delete(path); }, async readDirectoryAsync(path) { return [...files.keys()].filter((item) => item.startsWith(path)).map((item) => item.slice(path.length)); } };
  const cache = createSearchCache(createSearchFileStore(fs));
  assert.equal(await cache.find(madrid), null);
  assert.equal(files.has(`${root}item-abc-1.json`), false);
  assert.equal(files.get(`${root}unrelated.txt`), 'keep');
});

test('clearing reports failure if an indexed search file could not be deleted and can be retried', async () => {
  const store = memoryStore(), originalRemove = store.removeItem;
  let fail = true;
  store.removeItem = async (key) => { if (fail) throw new Error('permission'); return originalRemove(key); };
  const cache = createSearchCache(store);
  assert.equal(await cache.save(madrid, [place], { complete: true }), true);
  assert.equal(await cache.clear(), false);
  assert.ok(await cache.find(madrid), 'the index remains available for a retry');
  fail = false;
  assert.equal(await cache.clear(), true);
  assert.equal(await cache.find(madrid), null);
});

test('clearing reports failure if an orphaned file cannot be removed', async () => {
  const root = 'file:///private/cache/rato-search-cache-v1/';
  const files = new Map([[`${root}index.json`, '{broken'], [`${root}item-orphan-1.json`, 'search']]);
  let fail = true;
  const fs = { cacheDirectory: 'file:///private/cache/', async getInfoAsync(path) { return path.endsWith('/') ? { exists: true, isDirectory: true } : { exists: files.has(path) }; },
    async readAsStringAsync(path) { return files.get(path); }, async writeAsStringAsync(path, value) { files.set(path, value); },
    async deleteAsync(path) { if (fail) throw new Error('permission'); files.delete(path); },
    async readDirectoryAsync(path) { return [...files.keys()].filter((item) => item.startsWith(path)).map((item) => item.slice(path.length)); } };
  const cache = createSearchCache(createSearchFileStore(fs));
  assert.equal(await cache.clear(), false);
  assert.equal(files.has(`${root}item-orphan-1.json`), true);
  fail = false;
  assert.equal(await cache.clear(), true);
  assert.equal(files.has(`${root}item-orphan-1.json`), false);
});
