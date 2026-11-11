import test from 'node:test';
import assert from 'node:assert/strict';
import { createShadowFileLifetime } from '../mobile/src/shadow-file-lifetime.mjs';

test('an image remains on disk while the map still displays it', () => {
  const timers = [], removed = [];
  const files = createShadowFileLifetime((uri) => removed.push(uri), (fn) => timers.push(fn));
  files.retain('old.png');
  files.retire('old.png');
  timers.shift()();
  assert.deepEqual(removed, []);
  files.release('old.png');
  timers.shift()();
  assert.deepEqual(removed, ['old.png']);
});

test('a late cancelled image is retired and repeated requests are deduplicated', () => {
  const timers = [], removed = [];
  const files = createShadowFileLifetime((uri) => removed.push(uri), (fn) => timers.push(fn));
  files.retire('late.png');
  files.retire('late.png');
  assert.equal(timers.length, 1);
  timers.shift()();
  assert.deepEqual(removed, ['late.png']);
});

test('a shared image is not deleted until its final user releases it', () => {
  const timers = [], removed = [];
  const files = createShadowFileLifetime((uri) => removed.push(uri), (fn) => timers.push(fn));
  files.retain('same.png'); files.retain('same.png'); files.retire('same.png');
  timers.shift()();
  files.release('same.png');
  assert.equal(timers.length, 0);
  files.release('same.png');
  timers.shift()();
  assert.deepEqual(removed, ['same.png']);
});
