import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingShadows, createBuildingShadowBuilder } from '../frontend/map-shadows.mjs';

const square = (i) => ({
  type: 'Feature', properties: { height: 12 + i },
  geometry: { type: 'Polygon', coordinates: [[[i / 10000, 40], [i / 10000 + .0001, 40],
    [i / 10000 + .0001, 40.0001], [i / 10000, 40.0001], [i / 10000, 40]]] },
});
const buildings = { type: 'FeatureCollection', features: Array.from({ length: 53 }, (_, i) => square(i)) };
const sun = { altitude: 45, azimuth: 180 };

test('batched geometry matches a synchronous result, including roofs', () => {
  const options = { maxVertices: 120000, excludeRoofs: true };
  const builder = createBuildingShadowBuilder(buildings, sun, null, options);
  assert.equal(builder.step(4), false);
  assert.throws(() => builder.result(), /incomplete/);
  let batches = 1;
  while (!builder.step(4)) batches++;
  assert.ok(batches > 5);
  assert.deepEqual(builder.result(), buildingShadows(buildings, sun, null, options));
  assert.equal(builder.step(4), true);
});

test('the budget never exposes partial shapes across batches', () => {
  const builder = createBuildingShadowBuilder(buildings, sun, null, { maxVertices: 30, excludeRoofs: true });
  while (!builder.step(1)) {}
  assert.deepEqual(builder.result(), { type: 'FeatureCollection', features: [], limitExceeded: true });
  assert.throws(() => createBuildingShadowBuilder(buildings, sun).step(0), RangeError);
});
