import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingShadows } from '../frontend/map-shadows.mjs';

const square = (west) => ({
  type: 'Feature', properties: { height: 10 },
  geometry: { type: 'Polygon', coordinates: [[
    [west, 40], [west + .0001, 40], [west + .0001, 40.0001],
    [west, 40.0001], [west, 40],
  ]] },
});
const buildings = { type: 'FeatureCollection', features: [square(-3.7), square(-3.699)] };
const sun = { altitude: 45, azimuth: 180 };

test('the optional budget returns no partial shadow geometry when the next building is too large', () => {
  const unlimited = buildingShadows(buildings, sun);
  const vertexCount = unlimited.features.flatMap((feature) => feature.geometry.coordinates).flat().reduce((sum, ring) => sum + ring.length, 0);
  assert.equal(unlimited.features.length, 2);
  assert.deepEqual(buildingShadows(buildings, sun, null, { maxVertices: vertexCount }), unlimited);
  assert.deepEqual(buildingShadows(buildings, sun, null, { maxVertices: vertexCount - 1 }), {
    type: 'FeatureCollection', features: [], limitExceeded: true,
  });
  assert.deepEqual(buildingShadows(buildings, sun, null, { maxVertices: 0 }), {
    type: 'FeatureCollection', features: [], limitExceeded: true,
  });
});

test('the budget ignores geometry outside the view and no shadows at night', () => {
  const view = [-3.7002, 39.9998, -3.6998, 40.0003];
  assert.equal(buildingShadows(buildings, sun, view, { maxVertices: 25 }).features.length, 1);
  assert.deepEqual(buildingShadows(buildings, { altitude: -10, azimuth: 180 }, null, { maxVertices: 0 }), {
    type: 'FeatureCollection', features: [],
  });
  assert.throws(() => buildingShadows(buildings, sun, null, { maxVertices: -1 }), RangeError);
});
