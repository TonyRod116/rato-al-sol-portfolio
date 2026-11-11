import assert from 'node:assert/strict';
import { open, readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildingShadows } from '../frontend/map-shadows.mjs';
import { lightAt, prepareScene } from '../frontend/shared/estimate.mjs';
import { pointInOrOnPolygon, sunPosition } from '../frontend/solar.mjs';
import { createShadowCoverage } from '../mobile/src/shadow-coverage.mjs';

const files = new URL('../mobile/assets/shadow-data/', import.meta.url);
const middaySample = new Date('2026-11-11T12:00:00+01:00');

async function cityCoverage(t, city) {
  const index = JSON.parse(await readFile(new URL(`${city}.json`, files), 'utf8'));
  const file = await open(new URL(`${city}.bin`, files));
  t.after(() => file.close());
  let reads = 0;
  const coverage = createShadowCoverage({ [city]: index }, async (_, offset, length) => {
    reads++;
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await file.read(buffer, 0, length, offset);
    return buffer.subarray(0, bytesRead);
  });
  return { coverage, readCount: () => reads };
}

// The polygon routine expects planar units; scale these nearby points uniformly.
const scale = ([x, y]) => [x * 1e6, y * 1e6];
const contains = (point, ring) => pointInOrOnPolygon(scale(point), ring.map(scale));

test('Calàbria has shadow geometry on both sides of the street and reuses tiles when panning', async (t) => {
  const { coverage, readCount } = await cityCoverage(t, 'barcelona');
  const bounds = [2.1437, 41.3859, 2.1475, 41.3885];
  const map = await coverage.get(bounds);
  assert.equal(map.source, 'barcelona-local');
  // Public building footprints at numbers 245, 247 and 246–248, previously missing OSM heights.
  for (const point of [[2.14607, 41.38618], [2.1460, 41.386235], [2.14653, 41.38654]]) {
    assert.ok(map.features.some(({ geometry, properties }) => properties.height >= 15 &&
      contains(point, geometry.coordinates[0])));
  }
  const beforePan = readCount();
  const panned = await coverage.get([bounds[0] + .0001, bounds[1], bounds[2] + .0001, bounds[3]]);
  assert.ok(panned.features.length);
  assert.equal(readCount(), beforePan);
  assert.equal(new Set(panned.features.map((feature) => feature.properties.id)).size, panned.features.length);

  const point = { longitude: 2.1453, latitude: 41.38704 };
  const scene = await coverage.scenes([point]);
  assert.equal(lightAt(prepareScene(point, scene.buildings, scene.radius), middaySample), 'shade');
  const sun = sunPosition(middaySample, point.latitude, point.longitude);
  const shadows = buildingShadows(map, sun, bounds, { maxVertices: 120000, excludeRoofs: true });
  assert.ok(shadows.features.some(({ geometry }) =>
    geometry.coordinates.some(([ring]) => contains([point.longitude, point.latitude], ring))));
});

test('central and outlying Madrid streets have local data and can project shadows without network access', async (t) => {
  const { coverage } = await cityCoverage(t, 'madrid');
  for (const [longitude, latitude] of [[-3.7038, 40.4168], [-3.7025, 40.4203], [-3.6221, 40.3788]]) {
    const bounds = [longitude - .0015, latitude - .001, longitude + .0015, latitude + .001];
    const geometry = await coverage.get(bounds);
    assert.equal(geometry.source, 'madrid-local');
    assert.ok(geometry.features.length >= 30);
    const sun = sunPosition(middaySample, latitude, longitude);
    assert.ok(buildingShadows(geometry, sun, bounds, { maxVertices: 120000, excludeRoofs: true }).features.length);
  }
  const scene = await coverage.scenes([{ longitude: -3.7038, latitude: 40.4168 }]);
  assert.equal(scene.source, 'madrid-local');
  assert.ok(scene.buildings.length);
});

test('an area without all its tiles can use the existing provider without reading local files', async () => {
  const coverage = createShadowCoverage({ barcelona: { '536,10346': [0, 10] } }, assert.fail);
  const acrossTwoTiles = [2.145, 41.385, 2.149, 41.387];
  assert.equal(coverage.has(acrossTwoTiles), false);
  assert.equal(await coverage.get(acrossTwoTiles), null);
  assert.equal(await coverage.scenes([{ longitude: 0, latitude: 0 }]), null);
});
