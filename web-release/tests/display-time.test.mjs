import test from 'node:test';
import assert from 'node:assert/strict';
import { initialSelectedTime, nextPlaybackTime, timePercent, visibleWindows, TIME_START, TIME_END } from '../frontend/shared/time-selection.mjs';

test('the selected hour and animation stay in the 06:00–22:00 range', () => {
  assert.equal(TIME_START, 360);
  assert.equal(TIME_END, 1320);
  assert.equal(initialSelectedTime(0, 10), 360);
  assert.equal(initialSelectedTime(1439, 10), 1320);
  assert.equal(nextPlaybackTime(1310, 10), 1320);
  assert.equal(nextPlaybackTime(1320, 10), 360);
});

test('displayed light windows are cropped to match the time slider', () => {
  const windows = [
    { state: 'night', from: 0, to: 420 },
    { state: 'sun', from: 420, to: 1200 },
    { state: 'shade', from: 1200, to: 1410 },
    { state: 'night', from: 1410, to: 1440 },
  ];
  assert.deepEqual(visibleWindows(windows), [
    { state: 'night', from: 360, to: 420 },
    { state: 'sun', from: 420, to: 1200 },
    { state: 'shade', from: 1200, to: 1320 },
  ]);
  assert.equal(windows[0].from, 0, 'the original day-long calculations are preserved');
  assert.equal(timePercent(360), 0);
  assert.equal(timePercent(720), 37.5);
  assert.equal(timePercent(1080), 75);
  assert.equal(timePercent(1320), 100);
  assert.equal(timePercent(1440), 100);
});
