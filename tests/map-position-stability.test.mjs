import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewportLoader, stableMapBounds, stableMapCenter } from '../mobile/src/viewport.mjs';
import { viewportBounds } from '../frontend/viewport-buildings.mjs';

test('native map coordinate noise preserves the center and bounds references', () => {
  const center = { latitude: 40.4168, longitude: -3.7038 };
  const bounds = [-3.705, 40.415, -3.702, 40.418];
  assert.equal(stableMapCenter(center, { latitude: center.latitude + 5e-8, longitude: center.longitude - 5e-8 }), center);
  assert.equal(stableMapBounds(bounds, bounds.map((value, i) => value + (i % 2 ? 5e-8 : -5e-8))), bounds);
});

test('real movement, zoom and lost bounds remain observable', () => {
  const center = { latitude: 40.4168, longitude: -3.7038 };
  const moved = { latitude: center.latitude + .00001, longitude: center.longitude };
  const bounds = [-3.705, 40.415, -3.702, 40.418];
  const zoomed = [-3.7051, 40.4149, -3.7019, 40.4181];
  assert.deepEqual(stableMapCenter(center, moved), moved);
  assert.notEqual(stableMapCenter(center, moved), center);
  assert.equal(stableMapCenter(center, { latitude: NaN, longitude: -3.7 }), center);
  assert.equal(stableMapBounds(bounds, zoomed), zoomed);
  assert.equal(stableMapBounds(bounds, null), null);
});

test('native jitter across a rounding boundary does not request a new building cell', () => {
  const first = [-3.70500004, 40.4142, -3.7012, 40.4182];
  const noise = [-3.70499999, 40.4142, -3.7012, 40.4182];
  const moved = [-3.70495, 40.4142, -3.7012, 40.4182];
  assert.notDeepEqual(viewportBounds(first), viewportBounds(noise), 'rounding alone changes the request');
  let raw = stableMapBounds(null, first);
  const original = viewportBounds(raw);
  raw = stableMapBounds(raw, noise);
  assert.deepEqual(viewportBounds(raw), original, 'sub-centimetre jitter retains the original request');
  raw = stableMapBounds(raw, moved);
  assert.notDeepEqual(viewportBounds(raw), original, 'real movement is still detected');
  assert.equal(stableMapBounds(raw, null), null, 'invalid coverage clears the stabilized bounds');
});

test('a rounding boundary jitter would trigger a strip download without stabilization', async () => {
  const first = [-3.70499999, 40.4142, -3.7012, 40.4182];
  const jitter = [-3.70500004, 40.4142, -3.7012, 40.4182];
  const requests = [];
  const loader = createViewportLoader(async (bounds) => {
    requests.push(bounds);
    return { source: 'madrid', bounds, features: [], omitted: 0 };
  });
  await loader.get(viewportBounds(first));
  await loader.get(viewportBounds(jitter));
  assert.equal(requests.length, 2, 'rounding the jitter before stabilization loads a strip');

  const stableRequests = [];
  const stableLoader = createViewportLoader(async (bounds) => {
    stableRequests.push(bounds);
    return { source: 'madrid', bounds, features: [], omitted: 0 };
  });
  let raw = stableMapBounds(null, first);
  await stableLoader.get(viewportBounds(raw));
  raw = stableMapBounds(raw, jitter);
  await stableLoader.get(viewportBounds(raw));
  assert.equal(stableRequests.length, 1, 'the stabilized request is served from complete coverage');
});
