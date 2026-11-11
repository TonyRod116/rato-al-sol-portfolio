import test from 'node:test';
import assert from 'node:assert/strict';
import { clipDaylightWindows } from '../mobile/src/daylight-range.mjs';

const start = 360, end = 1320;
test('clips boundaries while preserving states and proportional durations', () => {
  const input = [
    { from: 0, to: 420, state: 'night' },
    { from: 420, to: 720, state: 'shade' },
    { from: 720, to: 1400, state: 'sun' },
    { from: 1400, to: 1440, state: 'night' },
  ];
  assert.deepEqual(clipDaylightWindows(input, start, end), [
    { from: 360, to: 420, state: 'night' },
    { from: 420, to: 720, state: 'shade' },
    { from: 720, to: 1320, state: 'sun' },
  ]);
  assert.equal(input[0].from, 0);
  assert.equal(input[2].to, 1400);
});

test('handles no data, exact endpoints, and a window spanning the whole range', () => {
  assert.deepEqual(clipDaylightWindows([], start, end), []);
  assert.deepEqual(clipDaylightWindows([{ from: 0, to: start, state: 'night' }, { from: end, to: 1440, state: 'night' }], start, end), []);
  assert.deepEqual(clipDaylightWindows([{ from: 0, to: 1440, state: 'unknown' }], start, end), [{ from: start, to: end, state: 'unknown' }]);
});
