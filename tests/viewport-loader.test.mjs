import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewportLoader, expandedMadridViewport } from '../mobile/src/viewport.mjs';

test('nearby movements reuse complete coverage, including an in-flight request', async () => {
  const area = [1, 1, 5, 5], inner = [2, 2, 4, 4], outside = [3, 3, 6, 6];
  let clock = 1000, calls = 0, resolveFirst;
  const loader = createViewportLoader((bounds) => {
    calls++;
    return calls === 1 ? new Promise((resolve) => { resolveFirst = resolve; }) : { bounds, features: [] };
  }, () => clock);
  const first = loader.get(area);
  const sameCoverage = loader.get(inner);
  await Promise.resolve();
  assert.equal(calls, 1);
  const geometry = { bounds: area, features: [] };
  resolveFirst(geometry);
  assert.strictEqual(await first, geometry);
  assert.strictEqual(await sameCoverage, geometry);
  assert.strictEqual(loader.find(inner), geometry);
  assert.strictEqual(await loader.get(inner), geometry);
  assert.equal(calls, 1);
  assert.equal(loader.find(outside), null);
  await loader.get(outside);
  assert.equal(calls, 2, 'a view beyond coverage triggers a new query');
  clock += 120001;
  assert.equal(loader.find(inner), null, 'old data is not reused indefinitely');
});

test('failed and incomplete requests are not cached and can be retried', async () => {
  const area = [1, 1, 5, 5];
  let calls = 0;
  const loader = createViewportLoader(() => {
    calls++;
    if (calls === 1) throw new Error('offline');
    if (calls === 2) return { bounds: [2, 2, 4, 4], features: [] };
    return { bounds: area, features: [] };
  });
  await assert.rejects(loader.get(area), /offline/);
  await loader.get(area);
  assert.equal(loader.find(area), null);
  await loader.get(area);
  assert.equal(calls, 3);
  assert.ok(loader.find(area));
});

test('a wider saved view cannot replace local data at the edge of its coverage', async () => {
  const area = [-3.705, 40.414, -3.701, 40.418];
  const wider = [-3.706, 40.413, -3.700, 40.419];
  const requests = [];
  const loader = createViewportLoader(async (bounds) => {
    requests.push(bounds);
    return { bounds, features: [], source: 'madrid-local' };
  }, Date.now, () => wider, (bounds) => bounds[2] <= area[2]);
  loader.prime({ bounds: wider, features: [], source: 'madrid' });
  assert.equal((await loader.get(area)).source, 'madrid-local');
  assert.deepEqual(requests, [area]);
});

test('a realistic Madrid pan reuses the directional margin without increasing the initial request', async () => {
  const a = [-3.706, 40.414, -3.702, 40.418];
  const b = [-3.705, 40.414, -3.701, 40.418];
  const c = [-3.704, 40.414, -3.700, 40.418];
  const d = [-3.703, 40.414, -3.699, 40.418];
  const requests = [];
  const loader = createViewportLoader(async (bounds) => { requests.push(bounds); return { bounds, features: [] }; }, Date.now, expandedMadridViewport);
  await loader.get(a);
  assert.deepEqual(requests[0], a, 'first load makes the original request');
  await loader.get(b);
  assert.deepEqual(requests[1], [-3.705, 40.414, -3.700, 40.418]);
  assert.ok(loader.find(c), 'the next eastward pan remains inside complete coverage');
  await loader.get(c);
  assert.equal(requests.length, 2);
  assert.equal(loader.find(d), null, 'the next pan beyond coverage must reload');
  await loader.get(d);
  assert.equal(requests.length, 3);
  const barcelona = [2.160, 41.390, 2.164, 41.394];
  assert.deepEqual(expandedMadridViewport(barcelona, a), barcelona, 'outside Madrid uses the existing limit');
  const farMadrid = [-3.625, 40.414, -3.621, 40.418];
  assert.deepEqual(expandedMadridViewport(farMadrid, a), farMadrid, 'a distant jump has no speculative expansion');
});
