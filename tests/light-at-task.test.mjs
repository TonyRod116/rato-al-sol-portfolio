import test from 'node:test';
import assert from 'node:assert/strict';
import { createLightAtBuilder, lightAt, solarWindows } from '../frontend/shared/estimate.mjs';
import { sunPosition } from '../frontend/solar.mjs';
import { startLightAtTask, startSolarWindowsTask } from '../mobile/src/light-at-task.mjs';

const point = { latitude: 40.417, longitude: -3.704 };
const instant = new Date('2026-06-21T11:00:00Z');
const azimuth = sunPosition(instant, point.latitude, point.longitude).azimuth * Math.PI / 180;
const x = Math.sin(azimuth) * 30, y = -Math.cos(azimuth) * 30;
const square = (cx, cy) => [[cx - 5, cy - 5], [cx + 5, cy - 5], [cx + 5, cy + 5], [cx - 5, cy + 5]];
const obstacle = (cx, cy, height = 30) => ({ footprint: square(cx, cy), height });
const run = (scene, time = instant) => {
  const builder = createLightAtBuilder(scene, time);
  while (!builder.step(1)) {}
  return builder.result();
};

test('batched calculation checks later unknown footprints before declaring a known shadow', () => {
  const scene = { point, radius: 400, buildings: [obstacle(x, y, 110), obstacle(-x, -y), obstacle(0, 0, null)] };
  const builder = createLightAtBuilder(scene, instant);
  assert.equal(builder.step(1), false);
  assert.throws(() => builder.result(), /incomplete/);
  while (!builder.step(1)) {}
  assert.equal(builder.result(), 'unknown');
  scene.buildings[2] = obstacle(-2 * x, -2 * y, null);
  assert.equal(run(scene), 'shade');
  assert.equal(lightAt(scene, instant), 'shade');
});

test('batched calculation preserves sunlight, unknown heights, limited coverage and night', () => {
  const scene = { point, radius: 400, buildings: [obstacle(-x, -y)] };
  assert.equal(run(scene), 'sun');
  scene.buildings.push(obstacle(x, y, null));
  assert.equal(run(scene), 'unknown');
  scene.buildings = [obstacle(-x, -y, 500)]; scene.radius = 100;
  assert.equal(run(scene), 'unknown');
  assert.equal(run(scene, new Date('2026-06-21T00:00:00Z')), 'night');
});

test('an incomplete scene without a building list is never reported as sunny', () => {
  for (const buildings of [undefined, null, 'invalid']) {
    const scene = { point, radius: 400, buildings };
    assert.equal(run(scene), 'unknown');
    assert.equal(lightAt(scene, instant), 'unknown');
  }
});

test('native calculation yields and cancellation discards a stale result', () => {
  const scene = { point, radius: 400, buildings: Array.from({ length: 100 }, () => obstacle(-x, -y)) };
  const timers = new Map(); let id = 0, clock = 0, result;
  const stop = startLightAtTask(scene, instant, (value) => { result = value; }, assert.fail, {
    schedule: (fn) => { timers.set(++id, fn); return id; }, unschedule: (key) => timers.delete(key), now: () => clock += 10,
  });
  const [key, runFirst] = timers.entries().next().value; timers.delete(key); runFirst();
  assert.equal(result, undefined);
  assert.equal(timers.size, 1, 'remaining work runs in a later turn');
  stop();
  assert.equal(timers.size, 0);
  assert.equal(result, undefined);
});

test('the native timeline yields while producing the same intervals as the shared engine', () => {
  const scene = { point, radius: 400, buildings: [obstacle(x, y, 30)] };
  const pending = [];
  let clock = 0, result;
  startSolarWindowsTask(scene, instant, (value) => { result = value; }, assert.fail, {
    schedule: (fn) => pending.push(fn), now: () => clock += 10,
  });
  pending.shift()();
  assert.equal(result, undefined);
  while (pending.length) pending.shift()();
  assert.deepEqual(result, solarWindows(scene, instant));
});
