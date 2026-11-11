import test from 'node:test';
import assert from 'node:assert/strict';
import { scenesFromMadridViewport } from '../mobile/src/madrid-viewport-scenes.mjs';
import { prepareScene, lightAt } from '../frontend/shared/estimate.mjs';

const bounds = [-3.71, 40.41, -3.69, 40.43];
const point = { longitude: -3.7, latitude: 40.42 };
const ring = [[-3.702,40.419],[-3.701,40.419],[-3.701,40.42],[-3.702,40.42],[-3.702,40.419]];
const building = () => ({ type: 'Feature', properties: { height: 15 }, geometry: { type: 'Polygon', coordinates: [ring] } });
const geometry = () => ({ source: 'madrid', omitted: 0, bounds, features: [building()], fetchedAt: 1000 });

test('reuses complete municipal heights and derives a conservative bounded radius per point', async () => {
  const result = await scenesFromMadridViewport([point, { longitude: -3.709, latitude: 40.42 }], geometry(), { now: () => 1000 });
  assert.equal(result[0].source, 'madrid');
  assert.equal(result[0].radius, 250);
  assert.equal(result[1], null, 'less than 100 m from the edge is not enough coverage');
  assert.deepEqual(result[0].buildings[0], { height: 15, heightSource: 'madrid', footprint: ring.map(([longitude, latitude]) => ({ longitude, latitude })) });
  assert.equal(result[0].cacheInfo.stale, false);
});

test('never classifies from omitted, unknown-height, invalid, or nonmunicipal data', async () => {
  for (const bad of [{ ...geometry(), omitted: 1 }, { ...geometry(), omitted: undefined },
    { ...geometry(), source: 'osm' }, { ...geometry(), bounds: [-3.71, 40.41, -3.72, 40.43] },
    { ...geometry(), features: [{ ...building(), properties: { height: null } }] },
    { ...geometry(), features: [{ ...building(), geometry: { type: 'Polygon', coordinates: [ring.slice(0, -1)] } }] }]) {
    assert.equal(await scenesFromMadridViewport([point], bad), null);
  }
});

test('expands multipolygons and conservatively treats courtyards as building interior', async () => {
  const outer2 = ring.map(([x, y]) => [x + .003, y]);
  const hole = [[-3.7019,40.4192],[-3.7018,40.4192],[-3.7018,40.4193],[-3.7019,40.4193],[-3.7019,40.4192]];
  const shape = { type: 'Feature', properties: { height: 11 }, geometry: { type: 'MultiPolygon', coordinates: [[ring, hole], [outer2]] } };
  const [result] = await scenesFromMadridViewport([point, { ...point }], { ...geometry(), features: [shape] }, { now: () => 1000 });
  assert.equal(result.buildings.length, 2);
  assert.equal(result.buildings[0].footprint.length, ring.length);
  assert.equal(result.buildings[1].footprint.length, outer2.length);
});

test('long conversions yield and cancelled results are never published', async () => {
  let clock = 0, yields = 0, cancelled = false;
  const many = { ...geometry(), features: Array.from({ length: 100 }, building) };
  const result = await scenesFromMadridViewport([point], many, { now: () => clock += 10,
    yieldWork: async () => { yields++; cancelled = true; }, cancelled: () => cancelled });
  assert.equal(result, null);
  assert.ok(yields > 0);
});

test('stale source age and coverage are preserved', async () => {
  const [result] = await scenesFromMadridViewport([{ longitude: -3.7075, latitude: 40.42 }], geometry(),
    { now: () => 31 * 86400000 });
  assert.ok(result.radius >= 100 && result.radius < 250);
  assert.equal(result.cacheInfo.stale, true);
});

test('a partial viewport does not turn uncertain low-sun conditions into sunshine', async () => {
  const view = { ...geometry(), bounds: [-3.702, 40.418, -3.698, 40.422] };
  const [result] = await scenesFromMadridViewport([point], view);
  assert.ok(result.radius >= 100 && result.radius < 200);
  const scene = prepareScene(point, result.buildings, result.radius);
  assert.equal(lightAt(scene, new Date('2026-11-05T09:30:00Z')), 'unknown');
});
