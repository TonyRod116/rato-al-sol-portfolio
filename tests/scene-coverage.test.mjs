import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareScene, lightAt } from '../frontend/shared/estimate.mjs';
import { civilTimeToUtc } from '../frontend/solar.mjs';

const point = { latitude: 40.4168, longitude: -3.7038 };
const metres = 111319.49079327358;
const longitudeMetres = metres * Math.cos(point.latitude * Math.PI / 180);
const building = (west, south, east, north, height) => ({ height,
  footprint: [[west, south], [east, south], [east, north], [west, north], [west, south]]
    .map(([x, y]) => ({ longitude: point.longitude + x / longitudeMetres, latitude: point.latitude - y / metres })) });

test('a long building crossing the covered scene is not dropped just because all vertices lie outside', () => {
  const longBlock = building(-600, 70, 600, 80, 60);
  const nearby = building(-100, -100, -90, -90, 10);
  const scene = prepareScene(point, [longBlock, nearby], 400);
  assert.equal(scene.buildings.length, 2);
  // At this civil time the sun is south of the point: the long block shades it.
  assert.equal(lightAt(scene, civilTimeToUtc('2026-11-05', 13 * 60)), 'shade');
});

test('an entirely distant bounding box is ignored and a footprint surrounding the point stays unknown', () => {
  const distant = building(800, 800, 900, 900, 30);
  const surrounds = building(-600, -600, 600, 600, 30);
  const scene = prepareScene(point, [distant, surrounds], 400);
  assert.equal(scene.buildings.length, 1);
  assert.equal(lightAt(scene, civilTimeToUtc('2026-11-05', 13 * 60)), 'unknown');
});
