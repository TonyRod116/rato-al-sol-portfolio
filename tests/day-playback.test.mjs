import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYBACK_START, PLAYBACK_END, nextPlaybackTime, playbackProgress } from '../mobile/src/day-playback.mjs';

test('day playback covers 06:00 through 22:00 then loops, without night hours', () => {
  const values = [PLAYBACK_START];
  for (let index = 0; index < 64; index++) values.push(nextPlaybackTime(values.at(-1)));
  assert.equal(values[0], 360);
  assert.equal(values.at(-1), 1320);
  assert.equal(nextPlaybackTime(values.at(-1)), 360);
  assert.ok(values.every((value) => value >= PLAYBACK_START && value <= PLAYBACK_END));
  assert.equal(new Set(values).size, 65);
});

test('a value outside the animation range returns to the beginning', () => {
  assert.equal(nextPlaybackTime(23 * 60), PLAYBACK_START);
  assert.equal(nextPlaybackTime(5 * 60), PLAYBACK_START);
  assert.equal(nextPlaybackTime(NaN), PLAYBACK_START);
});

test('selected time uses the same 06:00–22:00 scale as the daylight strip', () => {
  assert.equal(playbackProgress(6 * 60), 0);
  assert.equal(playbackProgress(12 * 60), 0.375);
  assert.equal(playbackProgress(18 * 60), 0.75);
  assert.equal(playbackProgress(22 * 60), 1);
  assert.equal(playbackProgress(0), 0);
  assert.equal(playbackProgress(24 * 60), 1);
  assert.equal(playbackProgress(NaN), 0);
});
