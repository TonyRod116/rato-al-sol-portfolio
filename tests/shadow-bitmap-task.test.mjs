import test from 'node:test';
import assert from 'node:assert/strict';
import { startShadowBitmapTask } from '../mobile/src/shadow-bitmap-task.mjs';

function clock() {
  let next = 0, time = 0;
  const timers = new Map();
  return { schedule(fn) { timers.set(++next, fn); return next; }, unschedule(id) { timers.delete(id); },
    now() { return time += 7; }, tick() { const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); }, timers };
}
const bounds = [-1, -1, 1, 1];
const shadows = { features: [{ geometry: { type: 'Polygon', coordinates: [[[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5], [-.5, -.5]]] } }] };
function drain(clock) {
  let steps = 0;
  while (clock.timers.size && steps++ < 5000) clock.tick();
  assert.ok(steps < 5000, 'raster and encoding terminate');
  return steps;
}

test('bitmap rendering yields and publishes only after the image is written', async () => {
  const timers = clock(), ready = [], removed = [];
  let finish, written;
  const cancel = startShadowBitmapTask({ shadows, bounds, retryToken: 7, uri: 'file://mask.png', ...timers,
    write: (uri, data) => { written = { uri, data }; return new Promise((resolve) => { finish = resolve; }); },
    retire: (uri) => removed.push(uri), onReady: (result) => ready.push(result), onError: assert.fail });
  assert.ok(drain(timers) > 10, 'work is split across multiple turns');
  await Promise.resolve();
  assert.equal(written.uri, 'file://mask.png');
  assert.equal(Buffer.from(written.data, 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.deepEqual(ready, []);
  finish(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ready.length, 1); assert.equal(ready[0].source, shadows); assert.equal(ready[0].area, bounds);
  assert.equal(ready[0].retryToken, 7); assert.deepEqual(ready[0].bounds, [[1, 1], [-1, -1]]);
  cancel(); assert.deepEqual(removed, ['file://mask.png']);
});

test('many tiny polygons share a timer when the time budget has not elapsed', async () => {
  const timers = clock(), ready = [];
  // A stopped fake clock represents many cheap batches within one time budget.
  timers.now = () => 0;
  const tiny = { geometry: { type: 'Polygon', coordinates: [[[-.5, -.5], [-.49, -.5], [-.49, -.49], [-.5, -.49], [-.5, -.5]]] } };
  const scene = { features: Array.from({ length: 1500 }, () => tiny) };
  const cancel = startShadowBitmapTask({ shadows: scene, bounds, retryToken: 0, uri: 'file://many.png', ...timers,
    write: async () => {}, retire: () => {}, onReady: (result) => ready.push(result), onError: assert.fail });
  assert.ok(drain(timers) < 4, 'cheap batches should not require hundreds of timer yields');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ready.length, 1);
  cancel();
});

test('cancelled rendering does not write or publish stale work', async () => {
  const timers = clock(), removed = [];
  const cancel = startShadowBitmapTask({ shadows, bounds, retryToken: 0, uri: 'file://cancel.png', ...timers,
    write: () => assert.fail('must not write'), retire: (uri) => removed.push(uri),
    onReady: () => assert.fail('must not publish'), onError: () => assert.fail('must not report') });
  timers.tick(); cancel(); drain(timers);
  assert.deepEqual(removed, ['file://cancel.png']);
});

test('cancellation during writing waits for completion before retiring the file', async () => {
  const timers = clock(), removed = [];
  let finish;
  const cancel = startShadowBitmapTask({ shadows, bounds, retryToken: 0, uri: 'file://late.png', ...timers,
    write: () => new Promise((resolve) => { finish = resolve; }), retire: (uri) => removed.push(uri),
    onReady: () => assert.fail('must not publish'), onError: () => assert.fail('must not report') });
  drain(timers); await Promise.resolve(); cancel();
  assert.deepEqual(removed, []);
  finish(); await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(removed, ['file://late.png']);
});

test('cancelling before a queued write starts avoids that write', async () => {
  const timers = clock(), removed = [];
  const cancel = startShadowBitmapTask({ shadows, bounds, retryToken: 0, uri: 'file://queued.png', ...timers,
    write: () => assert.fail('queued write must not start'), retire: (uri) => removed.push(uri),
    onReady: () => assert.fail('must not publish'), onError: () => assert.fail('must not report') });
  drain(timers); cancel();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(removed, ['file://queued.png']);
});

test('storage errors report the original scene and retire the partial file', async () => {
  const timers = clock(), errors = [], removed = [];
  startShadowBitmapTask({ shadows, bounds, retryToken: 3, uri: 'file://broken.png', ...timers,
    write: async () => { throw new Error('disk'); }, retire: (uri) => removed.push(uri),
    onReady: () => assert.fail('must not publish'), onError: (error) => errors.push(error) });
  drain(timers); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(errors[0].reason, 'storage'); assert.equal(errors[0].source, shadows);
  assert.equal(errors[0].area, bounds); assert.equal(errors[0].retryToken, 3);
  assert.deepEqual(removed, ['file://broken.png']);
});

test('a stalled write reports a timeout and retires its file only after late completion', async () => {
  const timers = clock(), errors = [], removed = [], ready = [];
  let finish;
  const cancel = startShadowBitmapTask({ shadows, bounds, retryToken: 4, uri: 'file://slow.png', ...timers,
    write: () => new Promise((resolve) => { finish = resolve; }), retire: (uri) => removed.push(uri),
    onReady: (result) => ready.push(result), onError: (error) => errors.push(error) });
  drain(timers); await Promise.resolve();
  assert.equal(timers.timers.size, 1);
  timers.tick();
  assert.equal(errors[0].reason, 'storage_timeout');
  assert.equal(errors[0].source, shadows);
  assert.deepEqual(removed, [], 'do not delete while the native write is active');
  cancel(); finish(); await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(ready, []);
  assert.deepEqual(removed, ['file://slow.png']);
  assert.equal(errors.length, 1);
});

test('a write rejected after timeout cannot report a second error', async () => {
  const timers = clock(), errors = [], removed = [];
  let rejectWrite;
  startShadowBitmapTask({ shadows, bounds, retryToken: 0, uri: 'file://failed-late.png', ...timers,
    write: () => new Promise((_, reject) => { rejectWrite = reject; }), retire: (uri) => removed.push(uri),
    onReady: () => assert.fail('must not publish'), onError: (error) => errors.push(error) });
  drain(timers); await Promise.resolve(); timers.tick(); rejectWrite(new Error('late failure'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(errors.map((error) => error.reason), ['storage_timeout']);
  assert.deepEqual(removed, ['file://failed-late.png']);
});
