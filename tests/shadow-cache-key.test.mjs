import test from 'node:test';
import assert from 'node:assert/strict';
import { geometrySignature, localFrameDay, millisecondsUntilNextDay, renderedShadowKey } from '../mobile/src/shadow-cache-key.mjs';
import { createBuildingCache } from '../mobile/src/building-cache.mjs';

const building = (height, x = 0) => ({ type: 'Feature', properties: { height }, geometry: { type: 'Polygon', coordinates: [[[x, 0], [x + 1, 0], [x, 1], [x, 0]]] } });
const area = [0, 0, 2, 2], input = { area, latitude: 40, longitude: -3, timeKey: 42 };

test('a saved mask key changes with provider geometry, height, time or viewport', async () => {
  const features = [building(10)];
  const base = await geometrySignature({ source: 'madrid', features });
  assert.equal(base, await geometrySignature({ source: 'madrid', features: [building(10)] }));
  assert.equal(base, await geometrySignature({ features: [{ geometry: { coordinates: features[0].geometry.coordinates, type: 'Polygon' }, properties: { height: 10 }, type: 'Feature' }], source: 'madrid' }));
  assert.notEqual(base, await geometrySignature({ source: 'madrid', features: [building(11)] }));
  assert.notEqual(base, await geometrySignature({ source: 'madrid', features: [building(10, 1)] }));
  const key = renderedShadowKey(base, input);
  assert.match(key, /^[a-zA-Z0-9_-]+$/);
  assert.notEqual(key, renderedShadowKey(base, { ...input, timeKey: 43 }));
  assert.notEqual(key, renderedShadowKey(base, { ...input, area: [0, 0, 3, 3] }));
  assert.notEqual(key, renderedShadowKey(base, { ...input, longitude: -3.01 }));
});

test('abandoned geometry hashing yields and never saves a partial signature', async () => {
  const data = { features: Array.from({ length: 50 }, (_, i) => building(i + 1)) };
  let cancelled = false, yields = 0, time = 0;
  assert.equal(await geometrySignature(data, () => cancelled, async () => { yields++; cancelled = true; }, () => { time += 10; return time; }), null);
  assert.equal(yields, 1);
  assert.ok(await geometrySignature(data));
});

test('cheap groups of buildings do not force unnecessary timer yields', async () => {
  const data = { features: Array.from({ length: 200 }, (_, i) => building(i + 1)) };
  let yields = 0;
  const signature = await geometrySignature(data, () => false, async () => { yields++; }, () => 0);
  assert.ok(signature);
  assert.equal(yields, 0);
});

test('local cache day is a local calendar day', () => {
  assert.equal(localFrameDay(new Date(2026, 10, 4, 12)), '2026-11-04');
  assert.equal(millisecondsUntilNextDay(new Date(2026, 10, 4, 23, 59, 59)), 1000);
});

test('next local midnight respects both daylight-saving transitions', () => {
  const prior = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Madrid';
    assert.equal(millisecondsUntilNextDay(new Date(2026, 2, 29, 0)), 23 * 60 * 60 * 1000);
    assert.equal(millisecondsUntilNextDay(new Date(2026, 9, 25, 0)), 25 * 60 * 60 * 1000);
  } finally {
    if (prior === undefined) delete process.env.TZ;
    else process.env.TZ = prior;
  }
});

test('a building area saved and restored produces the same shadow signature', async () => {
  const files = new Map();
  const store = { async getItem(k) { return files.get(k) ?? null; }, async setItem(k, v) { files.set(k, v); }, async removeItem(k) { files.delete(k); } };
  const bounds = [-3.706, 40.414, -3.702, 40.418], fetchedAt = 1_000_000;
  const ring = [[bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[2], bounds[3]], [bounds[0], bounds[1]]];
  const original = { type: 'FeatureCollection', bounds, omitted: 1, source: 'madrid', fetchedAt,
    features: [{ type: 'Feature', properties: { id: 9, height: 12 }, geometry: { type: 'Polygon', coordinates: [ring] } }] };
  const cache = createBuildingCache(store, { now: () => fetchedAt });
  assert.equal(await cache.save(original, { fetchedAt }), true);
  const hit = await cache.find(bounds);
  assert.equal(await geometrySignature(original), await geometrySignature({ ...hit.value, fetchedAt: hit.fetchedAt }));
});

test('a change deep in a courtyard, polygon nesting or building id changes the signature', async () => {
  const sample = () => ({ source: 'osm', bounds: [2, 41, 3, 42], fetchedAt: 123, omitted: 0, features: [{
    properties: { id: 123456789, height: 25 }, geometry: { type: 'Polygon', coordinates: [
      [[2, 41], [3, 41], [3, 42], [2, 41]],
      [[2.1, 41.1], [2.2, 41.1], [2.2, 41.2], [2.1, 41.1]],
    ] },
  }] });
  const original = await geometrySignature(sample());
  const changedVertex = sample(); changedVertex.features[0].geometry.coordinates[1][2][1] += .0000001;
  assert.notEqual(await geometrySignature(changedVertex), original);
  const changedId = sample(); changedId.features[0].properties.id++;
  assert.notEqual(await geometrySignature(changedId), original);
  const changedShape = sample(); changedShape.features[0].geometry = { type: 'MultiPolygon', coordinates: [changedShape.features[0].geometry.coordinates] };
  assert.notEqual(await geometrySignature(changedShape), original);
});

test('a very large single footprint yields and cancels without caching a partial signature', async () => {
  const large = { features: [{ properties: { height: 10 }, geometry: { type: 'Polygon', coordinates: [
    Array.from({ length: 20000 }, (_, i) => [i / 1e6, 40]),
  ] } }] };
  let cancelled = false, yields = 0;
  let time = 0;
  assert.equal(await geometrySignature(large, () => cancelled, async () => { yields++; cancelled = true; }, () => time++), null);
  assert.equal(yields, 1);
  assert.ok(await geometrySignature(large));
});
