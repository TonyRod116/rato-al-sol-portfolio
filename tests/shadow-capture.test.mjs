import test from 'node:test';
import assert from 'node:assert/strict';
import { captureShadow } from '../mobile/src/shadow-capture.mjs';

function fakeClock() {
  let id = 0;
  const timers = new Map();
  return { schedule(fn) { timers.set(++id, fn); return id; }, unschedule(key) { timers.delete(key); },
    tick() { const [key, fn] = timers.entries().next().value; timers.delete(key); fn(); }, timers };
}

test('a timed-out native capture is not duplicated and its late result is ignored', async () => {
  const clock = fakeClock(), callbacks = [], ready = [], errors = [];
  captureShadow({ capture: (callback) => callbacks.push(callback), write: async (data) => data,
    discard: () => assert.fail('no orphan expected'), onReady: (uri) => ready.push(uri), onError: (error) => errors.push(error), ...clock });
  clock.tick();
  assert.equal(callbacks.length, 1);
  callbacks[0]('old');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(ready, []); assert.deepEqual(errors, ['timeout']);
  assert.equal(clock.timers.size, 0);
});

test('a cancelled viewport cannot report failure or success and releases a file written late', async () => {
  const clock = fakeClock(), callbacks = [], ready = [], errors = [], removed = [];
  let finishWrite;
  const cancel = captureShadow({ capture: (callback) => callbacks.push(callback), write: () => new Promise((resolve) => { finishWrite = resolve; }),
    discard: (uri) => removed.push(uri), onReady: (uri) => ready.push(uri), onError: (error) => errors.push(error), ...clock });
  callbacks[0]('data');
  await Promise.resolve();
  cancel(); finishWrite('file://old.png');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(ready, []); assert.deepEqual(errors, []); assert.deepEqual(removed, ['file://old.png']);
});

test('a missing callback is reported without launching another capture', () => {
  const clock = fakeClock(), errors = [];
  captureShadow({ capture: () => {}, write: () => {}, discard: () => {}, onReady: () => {}, onError: (error) => errors.push(error), ...clock });
  clock.tick();
  assert.deepEqual(errors, ['timeout']);
  assert.equal(clock.timers.size, 0);
});

test('a synchronous capture failure may retry because no native work was queued', async () => {
  const clock = fakeClock(), ready = [], errors = [];
  let calls = 0;
  captureShadow({ capture: (callback) => { if (++calls === 1) throw new Error('not queued'); callback('image'); },
    write: async (data) => data, discard: () => {}, onReady: (uri) => ready.push(uri),
    onError: (error) => errors.push(error), ...clock });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2); assert.deepEqual(ready, ['image']); assert.deepEqual(errors, []);
});

test('a stalled file write times out and a later file is discarded', async () => {
  const clock = fakeClock(), callbacks = [], errors = [], removed = [];
  let finishWrite;
  captureShadow({ capture: (callback) => callbacks.push(callback), write: () => new Promise((resolve) => { finishWrite = resolve; }),
    discard: (uri) => removed.push(uri), onReady: () => assert.fail('late file must not be shown'), onError: (error) => errors.push(error), ...clock });
  callbacks[0]('data'); await Promise.resolve();
  clock.tick(); finishWrite('file://late.png');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(errors, ['storage_timeout']); assert.deepEqual(removed, ['file://late.png']);
});
