import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaybackFrameCache } from '../mobile/src/playback-frame-cache.mjs';

const time = (day, hour = 12) => new Date(2026, 10, day, hour).getTime();
const buildings = {}, area = [-3.7, 40.4, -3.6, 40.5];
const sample = (overrides = {}) => ({ uri: 'file://a.png', area, buildings, retryToken: 0, generation: 0,
  timeKey: time(5), latitude: 40.45, longitude: -3.65, bounds: [[40.5, -3.6], [40.4, -3.7]],
  geometrySource: 'madrid', source: { features: [new Array(1000)] }, ...overrides });
function setup(options = {}) {
  const retained = [], released = [], retired = [];
  const cache = createPlaybackFrameCache({ now: () => time(5), exists: async () => true,
    retain: (uri) => retained.push(uri), release: (uri) => released.push(uri), retire: (uri) => retired.push(uri),
    ...options });
  return { cache, retained, released, retired };
}

test('matches the exact scene and time, without retaining large polygon arrays', async () => {
  const { cache, retained } = setup();
  const frame = sample(), lightweight = { type: 'FeatureCollection', features: [] };
  assert.equal(cache.put(frame, 100), true);
  const hit = await cache.get({ ...frame }, lightweight);
  assert.equal(hit.uri, frame.uri);
  assert.equal(hit.source, lightweight);
  assert.equal(hit.buildings, frame.buildings);
  for (const changed of [{ area: [...area] }, { buildings: {} }, { retryToken: 1 }, { generation: 1 },
    { timeKey: frame.timeKey + 1 }, { latitude: frame.latitude + .001 }, { longitude: frame.longitude + .001 }]) {
    assert.equal(await cache.get({ ...frame, ...changed }, lightweight), null);
  }
  assert.deepEqual(retained, [frame.uri]);
});

test('caps actual bytes and entries and evicts least recently used files safely', async () => {
  const { cache, released, retired } = setup({ maxEntries: 2, maxBytes: 15 });
  const a = sample(), b = sample({ uri: 'file://b.png', timeKey: time(5, 13) }), c = sample({ uri: 'file://c.png', timeKey: time(5, 14) });
  assert.equal(cache.put(a, 7), true);
  assert.equal(cache.put(b, 7), true);
  assert.ok(await cache.get(a, {}));
  assert.equal(cache.put(c, 7), true);
  assert.deepEqual(cache.stats(), { entries: 2, bytes: 14 });
  assert.equal(await cache.get(b, {}), null);
  assert.deepEqual(released, [b.uri]);
  assert.deepEqual(retired, [b.uri]);
  assert.equal(cache.put(sample({ uri: 'file://big.png' }), 16), false);
  cache.clear();
  assert.deepEqual(cache.stats(), { entries: 0, bytes: 0 });
  assert.equal(released.length, 3);
});

test('the full day fits when compact, while the byte limit still evicts larger frames', async () => {
  const { cache } = setup();
  const base = time(5, 6);
  for (let i = 0; i < 65; i++) {
    assert.equal(cache.put(sample({ uri: `file://${i}.png`, timeKey: base + i * 15 * 60 * 1000 }), 50000), true);
  }
  assert.deepEqual(cache.stats(), { entries: 65, bytes: 3250000 });
  assert.ok(await cache.get(sample({ timeKey: base }), {}));
  // The entry limit allows the complete day, but it never overrides 8 MiB.
  for (let i = 0; i < 15; i++) {
    cache.put(sample({ uri: `file://extra-${i}.png`, timeKey: base + (i * 15 + 1) * 60 * 1000 }), 500000);
  }
  assert.ok(cache.stats().entries <= 72);
  assert.ok(cache.stats().bytes <= 8 * 1024 * 1024);
});

test('retains only today and tomorrow, and clears mismatched scenes', async () => {
  let clock = time(5);
  const { cache } = setup({ now: () => clock });
  const a = sample(), tomorrow = sample({ uri: 'file://tomorrow.png', timeKey: time(6) });
  assert.equal(cache.put(a, 4), true);
  assert.equal(cache.put(tomorrow, 4), true);
  assert.equal(cache.put(sample({ uri: 'file://later.png', timeKey: time(7) }), 4), false);
  clock = time(6);
  assert.equal(await cache.get(a, {}), null);
  assert.ok(await cache.get(tomorrow, {}));
  cache.keepScene({ ...tomorrow, buildings: {} });
  assert.deepEqual(cache.stats(), { entries: 0, bytes: 0 });
});

test('changing the hour preserves the animation frames, but retry and map changes discard them', async () => {
  const { cache } = setup();
  const noon = sample(), afternoon = sample({ uri: 'file://afternoon.png', timeKey: time(5, 13) });
  cache.put(noon, 4); cache.put(afternoon, 4);
  cache.keepScene({ ...noon, timeKey: time(5, 14) });
  assert.ok(await cache.get(noon, {}));
  assert.ok(await cache.get(afternoon, {}));
  cache.keepScene({ ...noon, retryToken: 1 });
  assert.equal(cache.stats().entries, 0);
  cache.put(noon, 4);
  cache.keepScene({ ...noon, area: [...area] });
  assert.equal(cache.stats().entries, 0);
});

test('file purge and clearing during an asynchronous lookup cannot resurrect a frame', async () => {
  let complete;
  const { cache, released } = setup({ exists: () => new Promise((resolve) => { complete = resolve; }) });
  const frame = sample();
  assert.equal(cache.put(frame, 5), true);
  const result = cache.get(frame, {});
  cache.clear(); complete(true);
  assert.equal(await result, null);
  assert.deepEqual(released, [frame.uri]);
  assert.equal(cache.put(frame, 5), true);
  const missing = cache.get(frame, {});
  complete(false);
  assert.equal(await missing, null);
  assert.deepEqual(cache.stats(), { entries: 0, bytes: 0 });
});
