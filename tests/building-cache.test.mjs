import test from 'node:test';
import assert from 'node:assert/strict';
import { createBuildingCache, createBuildingFileStore } from '../mobile/src/building-cache.mjs';

const madrid = [-3.706, 40.414, -3.702, 40.418];
const barcelona = [2.16, 41.39, 2.164, 41.394];
function result(bounds = madrid, source = 'madrid', height = 12) {
  const [w, s, e, n] = bounds;
  return { type: 'FeatureCollection', source, bounds, omitted: 1, secret: 'do not persist', features: [{ type: 'Feature',
    properties: { id: 9, height, privateData: 'do not persist' }, geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, s]]] } }] };
}
function memoryStore() {
  const files = new Map();
  return { files, async getItem(k) { return files.get(k) ?? null; }, async setItem(k, v) { files.set(k, v); }, async removeItem(k) { files.delete(k); } };
}

test('the memory-only coverage hint is conservative and follows saves and clearing', async () => {
  const store = memoryStore(), cache = createBuildingCache(store);
  const inside = [-3.705, 40.415, -3.703, 40.417];
  assert.equal(cache.coverageHint(inside), null, 'a new process has not read its index');
  assert.equal(await cache.find(inside), null);
  assert.equal(cache.coverageHint(inside), null, 'a missing index is not proof of a usable disk scan');
  assert.equal(await cache.save(result()), true);
  assert.equal(cache.coverageHint(inside), true);
  assert.equal(cache.coverageHint(barcelona), false);
  assert.equal(await cache.save(result(barcelona, 'osm')), true);
  assert.equal(cache.coverageHint(barcelona), true);
  assert.equal(await cache.clear(), true);
  assert.equal(cache.coverageHint(inside), false);
  assert.equal(cache.coverageHint(barcelona), false);
});

test('an unreadable or damaged saved area never becomes a trusted disk hit', async () => {
  const store = memoryStore(), cache = createBuildingCache(store);
  await cache.save(result());
  const chunk = [...store.files.keys()].find((name) => name.startsWith('area-'));
  store.files.delete(chunk);
  assert.equal(cache.coverageHint(madrid), true, 'a hint never replaces reading and validating chunks');
  assert.equal(await cache.find(madrid), null);
  store.files.set('index', '{broken json');
  assert.equal(await cache.find(madrid), null);
  assert.equal(cache.coverageHint(madrid), null, 'a broken index is unknown rather than a definite miss');
});

test('coverage hints follow other cache instances sharing the same store', async () => {
  const store = memoryStore(), first = createBuildingCache(store), second = createBuildingCache(store);
  await first.save(result());
  assert.equal(second.coverageHint(madrid), true);
  assert.equal(await second.clear(), true);
  assert.equal(first.coverageHint(madrid), false);
  await second.save(result(barcelona, 'osm'));
  assert.equal(first.coverageHint(barcelona), true);
});

test('visited Madrid and Barcelona coverage survives a new session, even when stale', async () => {
  const store = memoryStore(); let time = 1_000_000;
  const first = createBuildingCache(store, { now: () => time, freshMs: 1000 });
  assert.equal(await first.save(result()), true);
  assert.equal(await first.save(result(barcelona, 'osm')), true);
  assert.equal([...store.files.values()].join('').includes('do not persist'), false);
  time += 1001;
  const reopened = createBuildingCache(store, { now: () => time, freshMs: 1000 });
  const hit = await reopened.find([-3.705, 40.415, -3.703, 40.417]);
  assert.ok(hit.stale); assert.equal(hit.fetchedAt, 1_000_000); assert.equal(hit.value.omitted, 1);
  assert.equal((await reopened.find(barcelona)).value.source, 'osm');
  assert.equal(await reopened.find([-3.707, 40.415, -3.703, 40.417]), null, 'partial coverage is never returned as complete');
});

test('invalid, incomplete or outside-city data is not saved', async () => {
  const store = memoryStore(), cache = createBuildingCache(store);
  assert.equal(await cache.save({ ...result(), incomplete: true }), false);
  assert.equal(await cache.save({ ...result(), exceededTransferLimit: true }), false);
  assert.equal(await cache.save(result([0, 0, 0.01, 0.01], 'osm')), false);
  assert.equal(await cache.save(result(madrid, 'osm')), false);
  assert.equal(await cache.save({ ...result(), features: [] }), false);
  assert.equal(store.files.size, 0);
});

test('old refreshes cannot replace newer data and a failed write keeps the previous copy', async () => {
  const store = memoryStore(); let time = 10_000;
  const cache = createBuildingCache(store, { now: () => time });
  await cache.save(result(madrid, 'madrid', 15), { fetchedAt: 9000 });
  assert.equal(await cache.save(result(madrid, 'madrid', 7), { fetchedAt: 8000 }), false);
  const oldSet = store.setItem;
  store.setItem = async (key, value) => { if (key === 'index') throw new Error('disk full'); return oldSet(key, value); };
  time++;
  assert.equal(await cache.save(result(madrid, 'madrid', 20), { fetchedAt: time }), false);
  store.setItem = oldSet;
  assert.equal((await cache.find(madrid)).value.features[0].properties.height, 15);
  assert.equal(store.files.size, 2, 'failed new data is removed');
});

test('large areas use bounded chunks, yield, and reject missing or corrupt chunks', async () => {
  const store = memoryStore(); let yields = 0;
  const cache = createBuildingCache(store, { ioTimeoutMs: 10000, yieldControl: async () => { yields++; await new Promise((resolve) => setTimeout(resolve, 0)); } });
  const large = result();
  large.features = Array.from({ length: 3500 }, (_, id) => ({ ...large.features[0], properties: { id, height: 12 } }));
  assert.equal(await cache.save(large), true);
  const chunks = [...store.files.keys()].filter((name) => name.startsWith('area-'));
  assert.ok(chunks.length > 1); assert.ok(yields > 1);
  assert.ok(chunks.every((name) => Buffer.byteLength(store.files.get(name)) <= 256 * 1024));
  assert.equal((await cache.find(madrid)).value.features.length, 3500);
  const old = store.files.get(chunks[0]);
  store.files.delete(chunks[0]);
  assert.equal(await cache.find(madrid), null, 'an area with a missing piece is never returned');
  store.files.set(chunks[0], old.slice(0, -1));
  assert.equal(await cache.find(madrid), null, 'an area with a corrupt piece is never returned');
});

test('a failed chunk write preserves the complete previous area and cleans new pieces', async () => {
  const store = memoryStore(), cache = createBuildingCache(store, { ioTimeoutMs: 10000 });
  await cache.save(result(madrid, 'madrid', 15), { fetchedAt: 100 });
  const large = result();
  large.features = Array.from({ length: 3500 }, (_, id) => ({ ...large.features[0], properties: { id, height: 20 } }));
  const original = store.setItem;
  store.setItem = async (name, value) => { if (/-p1$/.test(name)) throw new Error('interrupted'); return original(name, value); };
  assert.equal(await cache.save(large, { fetchedAt: 200 }), false);
  store.setItem = original;
  assert.equal((await cache.find(madrid)).value.features[0].properties.height, 15);
  assert.equal([...store.files.keys()].filter((name) => name.startsWith('area-')).length, 1);
});

test('v1 indexes are ignored rather than interpreted as complete v2 data', async () => {
  const store = memoryStore();
  await store.setItem('index', JSON.stringify({ version: 1, entries: [{ id: 'area-old-1', bounds: madrid, source: 'madrid', size: 100, fetchedAt: 1, usedAt: 1 }] }));
  await store.setItem('area-old-1', JSON.stringify(result()));
  const cache = createBuildingCache(store);
  assert.equal(await cache.find(madrid), null);
  assert.equal(await cache.save(result()), true);
  assert.ok(await cache.find(madrid));
});

test('limits evict least recently used areas and do not split oversized data', async () => {
  const store = memoryStore(); let time = 10000;
  const cache = createBuildingCache(store, { now: () => ++time, maxEntries: 2, maxBytes: 10000, maxEntryBytes: 5000 });
  const b = [-3.7, 40.414, -3.696, 40.418], c = [-3.69, 40.414, -3.686, 40.418];
  assert.equal(await cache.save(result()), true); assert.equal(await cache.save(result(b)), true);
  assert.ok(await cache.find(madrid));
  assert.equal(await cache.save(result(c)), true);
  assert.equal(await cache.find(b), null); assert.ok(await cache.find(madrid)); assert.ok(await cache.find(c));
  assert.equal((await cache.clear()), true); assert.equal(store.files.size, 1, 'index remains and area files are gone');
  const tiny = createBuildingCache(memoryStore(), { maxBytes: 5, maxEntryBytes: 5 });
  assert.equal(await tiny.save(result()), false);
});

test('concurrent sessions serialize saves and clearing without resurrecting entries', async () => {
  const store = memoryStore(), cache = createBuildingCache(store), other = createBuildingCache(store);
  const b = [-3.7, 40.414, -3.696, 40.418];
  await Promise.all([cache.save(result()), other.save(result(b)), cache.clear()]);
  assert.equal(await cache.find(madrid), null); assert.equal(await cache.find(b), null);
  assert.deepEqual([...store.files.keys()], ['index']);
});

test('stalled storage is a bounded miss and never blocks saving or clearing', async () => {
  const stalled = { getItem: () => new Promise(() => {}), setItem: async () => {}, removeItem: async () => {} };
  const cache = createBuildingCache(stalled, { ioTimeoutMs: 20 });
  assert.equal(await cache.find(madrid), null);
  assert.equal(await cache.save(result()), false);
  assert.equal(await cache.clear(), false);
});

test('a long operation making progress does not time out like stalled storage', async () => {
  const store = memoryStore();
  const cache = createBuildingCache(store, { ioTimeoutMs: 60, yieldControl: () => new Promise((resolve) => setTimeout(resolve, 8)) });
  const large = result();
  large.features = Array.from({ length: 2000 }, (_, id) => ({ ...large.features[0], properties: { id, height: 12 } }));
  assert.equal(await cache.save(large), true);
  assert.equal((await cache.find(madrid)).value.features.length, 2000);
});

test('clearing reports failure on denied deletion and can be retried', async () => {
  const store = memoryStore(), cache = createBuildingCache(store);
  await cache.save(result());
  const original = store.removeItem;
  store.removeItem = async (name) => { if (name.startsWith('area-')) throw new Error('denied'); return original(name); };
  assert.equal(await cache.clear(), false);
  assert.ok(await cache.find(madrid), 'index remains available for a later clear');
  store.removeItem = original;
  assert.equal(await cache.clear(), true);
  assert.equal(await cache.find(madrid), null);
});

test('file adapter survives interrupted index moves and recreates purged directory', async () => {
  let hasDir = false, failMove = false, failIndexDelete = false, failIndexRead = false; const files = new Map();
  const fs = { cacheDirectory: 'file:///private/cache/',
    async getInfoAsync(uri) { return uri.endsWith('/') ? { exists: hasDir, isDirectory: hasDir } : { exists: files.has(uri), modificationTime: 1 }; },
    async makeDirectoryAsync() { hasDir = true; },
    async readAsStringAsync(uri) { if (!hasDir || (failIndexRead && /index-[ab]\.json$/.test(uri))) throw new Error('unavailable'); return files.get(uri); },
    async writeAsStringAsync(uri, value) { if (!hasDir) throw new Error('purged'); files.set(uri, value); },
    async deleteAsync(uri) { if (failIndexDelete && /index-[ab]\.json$/.test(uri)) throw new Error('denied'); files.delete(uri); },
    async moveAsync({ from, to }) { files.delete(to); if (failMove) throw new Error('interrupted'); files.set(to, files.get(from)); files.delete(from); },
    async readDirectoryAsync(prefix) { return [...files.keys()].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length)); },
  };
  const store = createBuildingFileStore(fs);
  const one = JSON.stringify({ version: 2, entries: [] }), two = JSON.stringify({ version: 2, entries: [{ id: 'test' }] });
  await store.setItem('index', one); assert.equal(await store.getItem('index'), one);
  failMove = true;
  await assert.rejects(store.setItem('index', two));
  assert.equal(await store.getItem('index'), one, 'previous index survives failed move');
  failMove = false;
  await store.setItem('index', two); assert.equal(await store.getItem('index'), two);
  await store.setItem('area-ab-1', 'orphan');
  failIndexRead = true;
  assert.equal(await store.getItem('index'), null);
  await store.pruneOrphans([], 1000 * 1000);
  assert.equal(await store.getItem('area-ab-1'), 'orphan', 'transient index failure does not delete areas');
  failIndexRead = false;
  assert.equal(await store.getItem('index'), two);
  await store.pruneOrphans([], 1000 * 1000);
  assert.equal(await store.getItem('area-ab-1'), null, 'old orphan is removed');
  files.set('file:///private/cache/rato-building-cache-v1/unrelated.txt', 'keep');
  const cache = createBuildingCache(store);
  await cache.save(result());
  failIndexDelete = true;
  assert.equal(await cache.clear(), false, 'failure removing a backup index is not reported as success');
  failIndexDelete = false;
  assert.equal(await cache.clear(), true);
  assert.equal(await store.getItem('index'), null, 'both index copies are removed');
  assert.equal(files.get('file:///private/cache/rato-building-cache-v1/unrelated.txt'), 'keep');
  hasDir = false; files.clear();
  await store.setItem('index', one); assert.equal(await store.getItem('index'), one);
  await assert.rejects(store.setItem('../outside', 'bad'));
  assert.ok([...files.keys()].every((key) => key.startsWith('file:///private/cache/rato-building-cache-v1/')));
});
