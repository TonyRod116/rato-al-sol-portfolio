import test from 'node:test';
import assert from 'node:assert/strict';
import { civilTimeToUtc } from '../frontend/solar.mjs';
import { lightAt, lightForInterval, solarWindows, sunnyInRange } from '../frontend/shared/estimate.mjs';

const point = { latitude: 40.4168, longitude: -3.7038 };
const known = { footprint: [[-20,-100],[20,-100],[20,-80],[-20,-80]], height: 20 };
const unknown = { footprint: [[80,-5],[100,-5],[100,5],[80,5]], height: null };
const scenes = [
  { point, radius: 400, buildings: [known] },
  { point, radius: 250, buildings: [known, unknown] },
  { point, radius: 400, buildings: [{ ...known, footprint: [[-2,-2],[2,-2],[2,2],[-2,2]] }] },
];

function fullDayReference(scene, day, from, to) {
  const windows = solarWindows(scene, day, civilTimeToUtc);
  const edges = [from, to - 1].map((minute) => lightAt(scene, civilTimeToUtc(day, minute)));
  if (sunnyInRange(windows, from, to) && edges.every((state) => state === 'sun')) return 'sun';
  return windows.some((window) => window.from < to && window.to > from && ['shade', 'night'].includes(window.state)) ||
    edges.some((state) => ['shade', 'night'].includes(state)) ? 'shade' : 'unknown';
}

test('interval classification matches full-day sampling, including daylight transitions and DST gaps', () => {
  const ranges = [[0, 1], [119, 121], [135, 165], [359, 360], [495, 615], [719, 721],
    [720, 900], [1019, 1031], [1320, 1440], [1439, 1440], [0, 1440]];
  for (const scene of scenes) for (const day of ['2026-03-29', '2026-06-21', '2026-11-05']) {
    for (const [from, to] of ranges) assert.equal(lightForInterval(scene, day, from, to, civilTimeToUtc),
      fullDayReference(scene, day, from, to), `${day} ${from}–${to}`);
  }
});

test('a two-hour interval evaluates only relevant half-hours plus its endpoints', () => {
  let calls = 0;
  const clock = (day, minute) => { calls++; return civilTimeToUtc(day, minute); };
  lightForInterval(scenes[0], '2026-11-05', 495, 615, clock);
  assert.equal(calls, 7);
});
