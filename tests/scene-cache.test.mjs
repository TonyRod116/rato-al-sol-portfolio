import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneCache, createSceneFileStore } from '../mobile/src/scene-cache.mjs';

const madrid = { latitude: 40.4168, longitude: -3.7038, name: 'do not persist' };
const barcelona = { latitude: 41.3917, longitude: 2.1649, name: 'do not persist' };
const building = (point, height) => ({ height, heightSource: height === null ? 'unknown' : 'height', footprint: [
  { latitude: point.latitude, longitude: point.longitude },
  { latitude: point.latitude + .0001, longitude: point.longitude },
  { latitude: point.latitude + .0001, longitude: point.longitude + .0001 },
  { latitude: point.latitude, longitude: point.longitude },
] });
const scene = (point, source = 'osm', radius = 400) => ({ source, radius,
  buildings: [building(point, null), building(point, 12)], searchText: 'private search' });
function memoryStore() {
  const map = new Map();
  return { map, async getItem(key) { return map.get(key) ?? null; },
    async setItem(key, value) { map.set(key, value); }, async removeItem(key) { map.delete(key); } };
}

test('saves complete OSM scene locally, preserving unknown heights without search text', async () => {
  const store = memoryStore(), cache = createSceneCache(store, { now: () => 10000 });
  assert.equal(await cache.save([barcelona], scene(barcelona)), true);
  const found = await cache.find(barcelona, { minRadius: 400 });
  assert.equal(found.value.radius, 400);
  assert.equal(found.value.buildings[0].height, null);
  assert.equal(found.value.buildings[1].height, 12);
  assert.equal(found.stale, false);
  assert.ok([...store.map.values()].every((text) => !text.includes('private search') && !text.includes('do not persist')));
  // A fresh service instance can reopen the same data.
  assert.equal((await createSceneCache(store, { now: () => 10001 }).find(barcelona)).value.source, 'osm');
});

test('nearby reuse shrinks the actual coverage radius and does not claim an uncovered circle', async () => {
  const cache = createSceneCache(memoryStore(), { now: () => 10000 });
  const origin = { ...madrid }, north50m = { latitude: madrid.latitude + 50 / 111195, longitude: madrid.longitude };
  assert.equal(await cache.save([origin], scene(origin, 'madrid', 250)), true);
  assert.equal(await cache.find(north50m, { minRadius: 250 }), null);
  const found = await cache.find(north50m, { minRadius: 100 });
  assert.ok(found.value.radius >= 195 && found.value.radius <= 199);
  assert.equal(found.value.buildings[0].height, null);
  assert.equal(await cache.find({ latitude: madrid.latitude + 151 / 111195, longitude: madrid.longitude }, { minRadius: 100 }), null);
});

test('combined OSM query covers each supplied circle but not the gap outside them', async () => {
  const second = { latitude: barcelona.latitude, longitude: barcelona.longitude + .02 };
  const cache = createSceneCache(memoryStore(), { now: () => 20000 });
  assert.equal(await cache.save([barcelona, second], scene(barcelona)), true);
  assert.equal((await cache.find(second, { minRadius: 400 })).value.radius, 400);
  assert.equal(await cache.find({ latitude: barcelona.latitude, longitude: barcelona.longitude + .01 }), null);
});

test('findMany reads one shared capture once and uses the smallest safe radius', async () => {
  const second = { latitude: barcelona.latitude, longitude: barcelona.longitude + .02 };
  const store = memoryStore(), cache = createSceneCache(store, { now: () => 20000 });
  await cache.save([barcelona, second], scene(barcelona));
  let reads = 0;
  const getItem = store.getItem.bind(store);
  store.getItem = async (name) => { if (name.startsWith('scene-')) reads++; return getItem(name); };
  const nearby = { latitude: second.latitude + 50 / 111195, longitude: second.longitude };
  const hit = await cache.findMany([barcelona, nearby]);
  assert.ok(hit?.entryId.startsWith('scene-'));
  assert.ok(hit.value.radius >= 345 && hit.value.radius <= 349);
  assert.equal(reads, 1);
  assert.equal(await cache.findMany([barcelona, { latitude: barcelona.latitude, longitude: barcelona.longitude + .01 }]), null);
  assert.equal(reads, 1, 'uncovered point does not trigger a data read');
});

test('older records remain available offline but carry their original timestamp and stale flag', async () => {
  const store = memoryStore(); let clock = 1000;
  const cache = createSceneCache(store, { now: () => clock, freshMs: 100 });
  assert.equal(await cache.save([madrid], scene(madrid, 'madrid', 250)), true);
  clock = 1100;
  const value = await cache.find(madrid);
  assert.equal(value.stale, true);
  assert.equal(value.fetchedAt, 1000);
});

test('invalid, incomplete, excessive or failed storage never counts as a cache hit', async () => {
  const store = memoryStore(), cache = createSceneCache(store, { now: () => 10000, maxEntryBytes: 300 });
  assert.equal(await cache.save([barcelona], scene(barcelona)), false);
  assert.equal(await cache.find(barcelona), null);
  assert.equal(await createSceneCache(store).save([barcelona], { ...scene(barcelona), incomplete: true }), false);
  assert.equal(await createSceneCache(store).save([barcelona], { ...scene(barcelona), buildings: [building(barcelona, undefined)] }), false);
  const failing = createSceneCache({ async getItem() { throw Error('offline'); }, async setItem() { throw Error('full'); }, async removeItem() {} });
  assert.equal(await failing.find(barcelona), null);
  assert.equal(await failing.save([barcelona], scene(barcelona)), false);
});

test('clear removes only files from this cache and file adapter rejects arbitrary paths', async () => {
  const files = new Map(), directories = new Set();
  const fs = { cacheDirectory: 'file:///cache/', async getInfoAsync(path) { return { exists: files.has(path) || directories.has(path), isDirectory: directories.has(path) }; },
    async makeDirectoryAsync(path) { directories.add(path); }, async writeAsStringAsync(path, value) { files.set(path, value); },
    async readAsStringAsync(path) { return files.get(path); }, async deleteAsync(path) { files.delete(path); },
    async readDirectoryAsync(path) { return [...files.keys()].filter((name) => name.startsWith(path)).map((name) => name.slice(path.length)); } };
  const adapter = createSceneFileStore(fs), cache = createSceneCache(adapter, { now: () => 10000 });
  files.set('file:///cache/other-project.json', 'preserve');
  assert.equal(await cache.save([barcelona], scene(barcelona)), true);
  await assert.rejects(adapter.removeItem('../other-project'));
  assert.equal(await cache.clear(), true);
  assert.equal(files.get('file:///cache/other-project.json'), 'preserve');
  assert.equal(await cache.find(barcelona), null);
});

test('equal clock values across launches do not overwrite another cached scene', async () => {
  const store = memoryStore(), now = () => 10000;
  assert.equal(await createSceneCache(store, { now }).save([madrid], scene(madrid, 'madrid', 250)), true);
  assert.equal(await createSceneCache(store, { now }).save([barcelona], scene(barcelona)), true);
  const cache = createSceneCache(store, { now });
  assert.equal((await cache.find(madrid)).value.source, 'madrid');
  assert.equal((await cache.find(barcelona)).value.source, 'osm');
});

test('oldest entries are evicted within the configured count and corrupt files are ignored', async () => {
  const store = memoryStore(); let clock = 1000;
  const cache = createSceneCache(store, { now: () => ++clock, maxEntries: 1 });
  assert.equal(await cache.save([madrid], scene(madrid, 'madrid', 250)), true);
  assert.equal(await cache.save([barcelona], scene(barcelona)), true);
  assert.equal(await cache.find(madrid), null);
  assert.ok(await cache.find(barcelona));
  const entryId = JSON.parse(store.map.get('index')).entries[0].id;
  store.map.set(entryId, '{invalid JSON');
  assert.equal(await cache.find(barcelona), null);
});

test('late older response cannot replace a newer scene for the same area', async () => {
  const store = memoryStore(), cache = createSceneCache(store, { now: () => 50000 });
  const newer = scene(barcelona), older = scene(barcelona);
  newer.buildings[1].height = 18;
  older.buildings[1].height = 7;
  assert.equal(await cache.save([barcelona], newer, { fetchedAt: 40000 }), true);
  assert.equal(await cache.save([barcelona], older, { fetchedAt: 30000 }), false);
  const found = await cache.find(barcelona);
  assert.equal(found.fetchedAt, 40000);
  assert.equal(found.value.buildings[1].height, 18);
});

test('a corrupt index cleans only orphaned files owned by this cache', async () => {
  const files = new Map(), directories = new Set(['file:///cache/rato-scene-cache-v1/']);
  const fs = { cacheDirectory: 'file:///cache/', async getInfoAsync(path) { return { exists: files.has(path) || directories.has(path), isDirectory: directories.has(path) }; },
    async makeDirectoryAsync(path) { directories.add(path); }, async writeAsStringAsync(path, value) { files.set(path, value); },
    async readAsStringAsync(path) { return files.get(path); }, async deleteAsync(path) { files.delete(path); },
    async readDirectoryAsync(path) { return [...files.keys()].filter((name) => name.startsWith(path)).map((name) => name.slice(path.length)); } };
  const root = 'file:///cache/rato-scene-cache-v1/';
  files.set(`${root}index.json`, '{broken');
  files.set(`${root}scene-dead-1.json`, 'orphan');
  files.set(`${root}other-data.json`, 'preserve');
  const cache = createSceneCache(createSceneFileStore(fs));
  assert.equal(await cache.find(barcelona), null);
  assert.equal(files.has(`${root}scene-dead-1.json`), false);
  assert.equal(files.get(`${root}other-data.json`), 'preserve');
});

test('a blocked filesystem cannot indefinitely delay find, save or clear', async () => {
  const stuck = new Promise(() => {});
  const store = { getItem: () => stuck, setItem: () => stuck, removeItem: () => stuck };
  const cache = createSceneCache(store, { timeoutMs: 20 });
  const results = await Promise.all([cache.find(barcelona), cache.save([barcelona], scene(barcelona)), cache.clear()]);
  assert.deepEqual(results, [null, false, false]);
});

test('a parseable but false index size cannot evade the on-device byte quota', async () => {
  const files = new Map(), directories = new Set();
  const fs = { cacheDirectory: 'file:///cache/', async getInfoAsync(path) { const exists = files.has(path) || directories.has(path);
      return { exists, isDirectory: directories.has(path), ...(files.has(path) ? { size: Buffer.byteLength(files.get(path), 'utf8') } : {}) }; },
    async makeDirectoryAsync(path) { directories.add(path); }, async writeAsStringAsync(path, value) { files.set(path, value); },
    async readAsStringAsync(path) { return files.get(path); }, async deleteAsync(path) { files.delete(path); },
    async readDirectoryAsync(path) { return [...files.keys()].filter((name) => name.startsWith(path)).map((name) => name.slice(path.length)); } };
  const root = 'file:///cache/rato-scene-cache-v1/', store = createSceneFileStore(fs);
  assert.equal(await createSceneCache(store, { now: () => 10000 }).save([barcelona], scene(barcelona)), true);
  const metadata = JSON.parse(files.get(`${root}index.json`)), id = metadata.entries[0].id;
  metadata.entries[0].size = 1;
  files.set(`${root}index.json`, JSON.stringify(metadata));
  const constrained = createSceneCache(store, { now: () => 10001, maxBytes: 20 });
  assert.equal(await constrained.find(barcelona), null);
  assert.equal(files.has(`${root}${id}.json`), false);
});

test('clear reports a failed deletion and a later clear retries owned orphan files', async () => {
  const store = memoryStore(); let fail = true;
  store.listItems = async () => [...store.map.keys()].filter((key) => key.startsWith('scene-'));
  const remove = store.removeItem.bind(store);
  store.removeItem = async (key) => { if (fail && key.startsWith('scene-')) throw new Error('cannot delete'); await remove(key); };
  const cache = createSceneCache(store, { now: () => 10000 });
  assert.equal(await cache.save([barcelona], scene(barcelona)), true);
  assert.equal(await cache.clear(), false);
  assert.ok([...store.map.keys()].some((key) => key.startsWith('scene-')));
  fail = false;
  assert.equal(await cache.clear(), true);
  assert.ok(![...store.map.keys()].some((key) => key.startsWith('scene-')));
});

test('large scene encoding and decoding yield between batches', async () => {
  const store = memoryStore(), cache = createSceneCache(store, { now: () => 10000 });
  const large = { source: 'osm', radius: 400, buildings: Array.from({ length: 300 }, (_, i) => building(barcelona, i % 2 ? 12 : null)) };
  let done = false;
  const save = cache.save([barcelona], large).then((value) => { done = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(done, false, 'saving gives the UI an opportunity to run');
  assert.equal(await save, true);
  done = false;
  const find = cache.find(barcelona).then((value) => { done = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(done, false, 'reading gives the UI an opportunity to run');
  assert.equal((await find).value.buildings.length, 300);
});

test('active processing renews the inactivity limit for itself and queued cache work', async () => {
  const store = memoryStore(), cache = createSceneCache(store, { now: () => 10000, timeoutMs: 100 });
  const large = { source: 'osm', radius: 400, buildings: Array.from({ length: 8000 }, (_, i) => building(barcelona, i % 2 ? 12 : null)) };
  const started = Date.now();
  const saving = cache.save([barcelona], large);
  const finding = cache.find(barcelona);
  assert.equal(await saving, true);
  const found = await finding;
  assert.equal(found.value.buildings.length, 8000);
  assert.ok(Date.now() - started > 100, 'work exceeds the limit but continues making progress');
});
