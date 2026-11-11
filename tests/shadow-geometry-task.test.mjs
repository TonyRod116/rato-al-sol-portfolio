import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingShadows } from '../frontend/map-shadows.mjs';
import { startShadowGeometry } from '../mobile/src/shadow-geometry-task.mjs';

const sun = { altitude: 45, azimuth: 180 };
const area = [-3.71, 40.41, -3.69, 40.43];
function city(count) {
  return { type: 'FeatureCollection', features: Array.from({ length: count }, (_, i) => {
    const x = -3.705 + i * 0.00001, y = 40.42;
    return { type: 'Feature', properties: { id: i, height: 12 },
      geometry: { type: 'Polygon', coordinates: [[[x, y], [x + .00001, y],
        [x + .00001, y + .00001], [x, y + .00001], [x, y]]] } };
  }) };
}

test('asynchronous geometry finishes with the same full result as the synchronous calculation', async () => {
  const buildings = city(48);
  const result = await new Promise((resolve, reject) => startShadowGeometry(buildings, sun, area, resolve, reject));
  assert.deepEqual(result, buildingShadows(buildings, sun, area, { maxVertices: 120000, excludeRoofs: true }));
  assert.equal(result.features.length, 48);
  assert.equal(result.roofs.length, 48);
});

test('geometry yields between batches and cancellation prevents publication of stale work', async () => {
  const buildings = city(60), originalNow = Date.now;
  let clock = 0, outcome = 'pending';
  // Force each batch over the time budget, making the yield deterministic
  // without relying on the speed or workload of the machine running the test.
  Date.now = () => { clock += 10; return clock; };
  try {
    const cancel = startShadowGeometry(buildings, sun, area,
      () => { outcome = 'complete'; }, () => { outcome = 'error'; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(outcome, 'pending', 'other timer work runs before geometry is complete');
    cancel();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(outcome, 'pending', 'cancelled geometry cannot publish a result or error');
  } finally { Date.now = originalNow; }
});

test('invalid geometry reports an error without publishing a partial result', async () => {
  const buildings = city(2);
  buildings.features[1].geometry = null;
  const result = await new Promise((resolve) => startShadowGeometry(buildings, sun, area,
    () => resolve('complete'), () => resolve('error')));
  assert.equal(result, 'error');
});
