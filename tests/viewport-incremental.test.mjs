import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewportLoader } from '../mobile/src/viewport.mjs';
import { getMadridBuildings } from '../frontend/madrid-buildings.mjs';

const a = [-3.706, 40.414, -3.702, 40.418];
const b = [-3.705, 40.414, -3.701, 40.418];
const feature = (id) => ({ properties: { id }, geometry: { type: 'Polygon', coordinates: [] } });

test('Madrid movement fetches only missing complete strips and deduplicates buildings', async () => {
  const requests = [];
  const loader = createViewportLoader(async (bounds, _fetch, options) => {
    requests.push({ bounds, options });
    return { source: 'madrid', bounds, features: requests.length === 1 ? [feature(1), feature(2)] : [feature(2), feature(3)], omitted: 0 };
  });
  await loader.get(a);
  const result = await loader.get(b);
  assert.deepEqual(requests[0].bounds, a);
  assert.deepEqual(requests[1].bounds, [-3.7022, 40.4138, -3.7008, 40.4182]);
  assert.equal(requests[1].options.allowEmpty, true);
  assert.deepEqual(result.bounds, b);
  assert.deepEqual(result.features.map((item) => item.properties.id), [1, 2, 3]);
  assert.strictEqual(loader.find(b), result);
});

test('overlapping in-memory Madrid coverage can start incremental loading without a disk lookup', async () => {
  const loader = createViewportLoader(async (bounds) => ({ source: 'madrid', bounds, features: [feature(1)], omitted: 0 }));
  assert.equal(loader.hasIncremental(b), false);
  await loader.get(a);
  assert.equal(loader.hasIncremental(b), true);
  assert.equal(loader.hasIncremental([-3.600, 40.414, -3.596, 40.418]), false);
  assert.equal(loader.hasIncremental([2.160, 41.390, 2.164, 41.394]), false);
});

test('Barcelona pans fetch just the new strip and merge OSM buildings by id', async () => {
  const left = [2.160, 41.390, 2.164, 41.394], right = [2.161, 41.390, 2.165, 41.394];
  const requests = [];
  const loader = createViewportLoader(async (bounds, _fetch, options) => {
    requests.push({ bounds, options });
    return { source: 'osm', bounds, features: requests.length === 1 ? [feature(1), feature(2)] : [feature(2), feature(3)], omitted: 1 };
  });
  await loader.get(left);
  assert.equal(loader.hasIncremental(right), true);
  const result = await loader.get(right);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.allowEmpty, true);
  assert.ok(requests[1].bounds[0] > left[0]);
  assert.deepEqual(result.features.map((item) => item.properties.id), [1, 2, 3]);
  assert.equal(result.omitted, 2);
  assert.deepEqual(result.bounds, right);
});

test('a diagonal Barcelona pan sends one bounded OSM query instead of concurrent strip queries', async () => {
  const initial = [2.160, 41.390, 2.164, 41.394], moved = [2.161, 41.391, 2.165, 41.395];
  const requests = [];
  const loader = createViewportLoader(async (bounds, _fetch, options) => {
    requests.push({ bounds, options });
    return { source: 'osm', bounds, features: [feature(requests.length)], omitted: 0 };
  });
  await loader.get(initial);
  const result = await loader.get(moved);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.allowEmpty, true);
  assert.deepEqual(result.bounds, moved);
  assert.equal(result.features.length, 2);
});

test('an OSM strip exceeding the query limit falls back to the full view', async () => {
  const initial = [2.160, 41.390, 2.164, 41.394], moved = [2.161, 41.391, 2.165, 41.395];
  const requests = [];
  const loader = createViewportLoader(async (bounds, _fetch, options) => {
    requests.push({ bounds, options });
    if (options?.allowEmpty) throw new Error('Acerca el mapa para cargar edificios.');
    return { source: 'osm', bounds, features: [feature(requests.length)], omitted: 0 };
  });
  await loader.get(initial);
  assert.deepEqual((await loader.get(moved)).bounds, moved);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[2].bounds, moved);
  assert.equal(loader.hasIncremental(null), false);
});

test('a pan while Madrid is loading requests only the missing strip in parallel and waits for both', async () => {
  const requests = [];
  let resolveFirst, resolveStrip;
  const loader = createViewportLoader((bounds, _fetch, options) => {
    requests.push({ bounds, options });
    if (requests.length === 1) return new Promise((resolve) => { resolveFirst = resolve; });
    return new Promise((resolve) => { resolveStrip = resolve; });
  });
  const first = loader.get(a);
  await Promise.resolve();
  const next = loader.get(b);
  await Promise.resolve();
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].bounds, [-3.7022, 40.4138, -3.7008, 40.4182]);
  assert.equal(requests[1].options.allowEmpty, true);
  resolveStrip({ source: 'madrid', bounds: requests[1].bounds, features: [feature(2)], omitted: 0 });
  assert.equal(loader.find(b), null, 'partial coverage is never exposed as complete');
  resolveFirst({ source: 'madrid', bounds: a, features: [feature(1)], omitted: 0 });
  await first;
  const result = await next;
  assert.deepEqual(result.bounds, b);
  assert.deepEqual(result.features.map((item) => item.properties.id), [1, 2]);
  assert.strictEqual(loader.find(b), result);
});

test('if the pending area fails, an overlapping pan falls back to a complete query', async () => {
  const requests = [];
  let rejectFirst;
  const loader = createViewportLoader((bounds, _fetch, options) => {
    requests.push({ bounds, options });
    if (requests.length === 1) return new Promise((_resolve, reject) => { rejectFirst = reject; });
    return Promise.resolve({ source: 'madrid', bounds, features: [feature(requests.length)], omitted: 0 });
  });
  const first = loader.get(a);
  const firstRejected = assert.rejects(first, /offline/);
  await Promise.resolve();
  const next = loader.get(b);
  await Promise.resolve();
  rejectFirst(new Error('offline'));
  await firstRejected;
  const result = await next;
  assert.deepEqual(requests.map((request) => Boolean(request.options?.allowEmpty)), [false, true, false]);
  assert.deepEqual(requests[2].bounds, b);
  assert.deepEqual(result.features.map((item) => item.properties.id), [3]);
});

test('a failed missing strip never appears as complete and can be retried', async () => {
  let fail = true;
  const loader = createViewportLoader(async (bounds, _fetch, options) => {
    if (options?.allowEmpty && fail) throw new Error('offline');
    return { source: 'madrid', bounds, features: [feature(1)], omitted: 0 };
  });
  await loader.get(a);
  await assert.rejects(loader.get(b), /offline/);
  assert.equal(loader.find(b), null);
  fail = false;
  assert.deepEqual((await loader.get(b)).bounds, b);
});

test('a successful response that does not cover its strip is rejected', async () => {
  const loader = createViewportLoader(async (bounds, _fetch, options) => ({
    source: 'madrid', bounds: options?.allowEmpty ? [-3.702, 40.414, -3.701, 40.418] : bounds,
    features: [feature(1)], omitted: 0,
  }));
  await loader.get(a);
  await assert.rejects(loader.get(b), /incompleta/);
  assert.equal(loader.find(b), null);
});

test('combined areas enforce the Madrid vertex budget after deduplication', async () => {
  const requests = [];
  const large = (id, count) => ({ properties: { id }, geometry: { type: 'Polygon', coordinates: [Array(count).fill([0, 0])] } });
  const loader = createViewportLoader(async (bounds, _fetch, options) => {
    requests.push({ bounds, options });
    return { source: 'madrid', bounds, features: requests.length === 1 ? [large(1, 100001)]
      : options?.allowEmpty ? [large(2, 100000)] : [], omitted: 0 };
  });
  await loader.get(a);
  assert.deepEqual((await loader.get(b)).features, []);
  assert.equal(requests.length, 3, 'an oversized union falls back to the normal full query');
  assert.deepEqual(requests[2].bounds, b);
});

test('merged coverage expires with its oldest source rather than extending stale data', async () => {
  let time = 0, requests = 0;
  const loader = createViewportLoader(async (bounds) => {
    requests++;
    return { source: 'madrid', bounds, features: [], omitted: 0 };
  }, () => time);
  await loader.get(a);
  time = 119000;
  await loader.get(b);
  assert.ok(loader.find(b));
  time = 120001;
  assert.equal(loader.find(b), null);
  await loader.get(b);
  assert.equal(requests, 3);
});

test('Madrid accepts a successful empty incremental strip, but not an empty full view', async () => {
  const fetch = async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) });
  await assert.rejects(getMadridBuildings(fetch, a));
  assert.deepEqual((await getMadridBuildings(fetch, a, { allowEmpty: true })).features, []);
});

test('incremental strips with only unknown heights preserve the missing-height warning', async () => {
  const fetch = async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { OBJECTID: 1, ALTURA: null }, geometry: null },
  ] }) });
  await assert.rejects(getMadridBuildings(fetch, a));
  const result = await getMadridBuildings(fetch, a, { allowEmpty: true });
  assert.deepEqual(result.features, []);
  assert.equal(result.omitted, 1);
});

test('Madrid retries one transient server error but does not retry rate limiting or bad data', async () => {
  let calls = 0;
  const fetch = async () => { calls++; return calls === 1 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) }; };
  assert.deepEqual((await getMadridBuildings(fetch, a, { allowEmpty: true })).features, []);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(getMadridBuildings(async () => { calls++; return { ok: false, status: 429 }; }, a));
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(getMadridBuildings(async () => { calls++; return { ok: true, json: async () => ({ bad: true }) }; }, a));
  assert.equal(calls, 1);
});

test('Madrid retries a transport failure once and never loops', async () => {
  let calls = 0;
  const fetch = async () => { calls++; throw new TypeError('network failure'); };
  await assert.rejects(getMadridBuildings(fetch, a));
  assert.equal(calls, 2);
});
