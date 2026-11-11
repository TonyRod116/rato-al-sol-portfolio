import test from 'node:test';
import assert from 'node:assert/strict';
import { startNativeShadowTask } from '../mobile/src/shadow-native-task.mjs';

const bounds = [-1, -1, 1, 1];
const shadows = { features: [{ geometry: { type: 'Polygon', coordinates: [[[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5], [-.5, -.5]]] } }] };
const settle = () => new Promise((resolve) => setImmediate(resolve));
function clock() {
  let next = 0;
  const timers = new Map();
  return { timers, schedule(fn, ms) { timers.set(++next, { fn, ms }); return next; }, unschedule(id) { timers.delete(id); },
    tick() { const [id, item] = timers.entries().next().value; timers.delete(id); item.fn(); } };
}
function fixture(native) {
  const timers = clock(), ready = [], errors = [], removed = [];
  const args = { shadows, bounds, retryToken: 7, uri: 'cache/rato-native-shadow-1760000000000-1.png', native,
    retire: (uri) => removed.push(uri), onReady: (value) => ready.push(value), onError: (value) => errors.push(value), ...timers };
  return { timers, ready, errors, removed, args };
}

test('native renderer registers before rendering and publishes its exact scene', async () => {
  const calls = [];
  const f = fixture({ register: async (id) => { calls.push(['register', id]); return true; },
    render: async (...args) => { calls.push(['render', ...args]); return args[5]; }, cancel: (id) => calls.push(['cancel', id]) });
  const stop = startNativeShadowTask(f.args);
  assert.deepEqual(calls, []);
  f.timers.tick(); await settle();
  assert.deepEqual(calls.map((call) => call[0]), ['register', 'render']);
  assert.equal(calls[0][1], calls[1][1]);
  assert.match(calls[1][2], /^M/);
  assert.equal(calls[1][6], f.args.uri);
  assert.equal(f.ready.length, 1); assert.equal(f.ready[0].source, shadows); assert.equal(f.ready[0].area, bounds);
  assert.equal(f.ready[0].retryToken, 7); assert.deepEqual(f.ready[0].bounds, [[1, 1], [-1, -1]]);
  assert.equal(f.timers.timers.size, 0);
  stop(); assert.deepEqual(f.removed, [f.args.uri]);
  assert.deepEqual(calls.map((call) => call[0]), ['register', 'render']);
});

test('cancel before registration prevents the native job entirely', async () => {
  let calls = 0;
  const f = fixture({ register: () => { calls++; }, render: () => { calls++; }, cancel: () => { calls++; } });
  const stop = startNativeShadowTask(f.args); stop(); await settle();
  assert.equal(calls, 0); assert.equal(f.timers.timers.size, 0);
  assert.deepEqual(f.removed, [f.args.uri]); assert.deepEqual(f.ready, []); assert.deepEqual(f.errors, []);
});

test('cancellation during registration never starts rendering and cancels the token', async () => {
  let finishRegister, renders = 0, cancels = 0;
  const f = fixture({ register: () => new Promise((resolve) => { finishRegister = resolve; }),
    render: () => { renders++; }, cancel: () => { cancels++; } });
  const stop = startNativeShadowTask(f.args); f.timers.tick(); await settle();
  stop(); finishRegister(true); await settle();
  assert.equal(renders, 0); assert.equal(cancels, 1);
  assert.deepEqual(f.removed, [f.args.uri]); assert.deepEqual(f.ready, []); assert.deepEqual(f.errors, []);
});

test('cancellation during rendering waits for native completion to retire the file', async () => {
  let finishRender, cancelled = 0;
  const f = fixture({ register: async () => true, render: () => new Promise((resolve) => { finishRender = resolve; }),
    cancel: () => { cancelled++; } });
  const stop = startNativeShadowTask(f.args); f.timers.tick(); await settle();
  stop(); assert.equal(cancelled, 1); assert.deepEqual(f.removed, []);
  finishRender(f.args.uri); await settle();
  assert.deepEqual(f.removed, [f.args.uri]); assert.deepEqual(f.ready, []); assert.deepEqual(f.errors, []);
});

test('timeout reports one error, cancels native and discards a late file', async () => {
  let finishRender, cancelled = 0;
  const f = fixture({ register: async () => true, render: () => new Promise((resolve) => { finishRender = resolve; }),
    cancel: () => { cancelled++; } });
  startNativeShadowTask(f.args); f.timers.tick(); await settle();
  assert.equal([...f.timers.timers.values()][0].ms, 15000);
  f.timers.tick(); assert.equal(f.errors[0].reason, 'timeout'); assert.equal(cancelled, 1); assert.deepEqual(f.removed, []);
  finishRender(f.args.uri); await settle();
  assert.equal(f.errors.length, 1); assert.deepEqual(f.ready, []); assert.deepEqual(f.removed, [f.args.uri]);
});

test('a registration that finishes after timeout is cancelled without rendering', async () => {
  let finishRegister, renders = 0, cancelled = 0;
  const f = fixture({ register: () => new Promise((resolve) => { finishRegister = resolve; }),
    render: () => { renders++; }, cancel: () => { cancelled++; } });
  startNativeShadowTask(f.args); f.timers.tick(); await settle();
  f.timers.tick(); assert.equal(f.errors[0].reason, 'timeout');
  finishRegister(true); await settle();
  assert.equal(renders, 0); assert.equal(cancelled, 1); assert.equal(f.errors.length, 1);
  assert.deepEqual(f.ready, []); assert.deepEqual(f.removed, [f.args.uri]);
});

test('native registration and rendering errors report failure for fallback', async () => {
  for (const native of [
    { register: async () => { throw Error('registration'); }, render: async () => {}, cancel: () => {} },
    { register: async () => true, render: async () => '', cancel: () => {} },
    { register: async () => true, render: async () => { throw Error('drawing'); }, cancel: () => {} },
  ]) {
    const f = fixture(native); startNativeShadowTask(f.args); f.timers.tick(); await settle();
    assert.equal(f.errors[0].reason, 'native'); assert.equal(f.errors[0].source, shadows);
    assert.deepEqual(f.removed, [f.args.uri]); assert.deepEqual(f.ready, []); assert.equal(f.timers.timers.size, 0);
  }
});

test('a full native queue reports busy without starting another renderer', async () => {
  const f = fixture({ register: async () => false, render: async () => assert.fail('must not render'), cancel: () => {} });
  startNativeShadowTask(f.args); f.timers.tick(); await settle();
  assert.equal(f.errors[0].reason, 'busy');
  assert.deepEqual(f.ready, []); assert.deepEqual(f.removed, [f.args.uri]);
});

test('a bridge rejection after registration cancels the registered token', async () => {
  const cancelled = [];
  const f = fixture({ register: async () => true, render: async () => { throw Error('bridge'); },
    cancel: (id) => cancelled.push(id) });
  const stop = startNativeShadowTask(f.args); f.timers.tick(); await settle();
  assert.equal(f.errors[0].reason, 'native');
  assert.equal(cancelled.length, 1);
  stop(); assert.equal(cancelled.length, 1, 'already-cancelled token is not cancelled twice');
  assert.deepEqual(f.removed, [f.args.uri]);
});

test('a native complexity limit reports a controlled failure and does not publish an image', async () => {
  const f = fixture({ register: async () => true, render: async () => 'rato-shadow-complexity', cancel: () => {} });
  const stop = startNativeShadowTask(f.args);
  f.timers.tick(); await settle();
  assert.deepEqual(f.ready, []);
  assert.equal(f.errors.length, 1);
  assert.equal(f.errors[0].reason, 'complexity');
  assert.deepEqual(f.removed, [f.args.uri]);
  stop();
  assert.equal(f.errors.length, 1);
});

test('invalid native geometry reports a controlled failure without publishing', async () => {
  const f = fixture({ register: async () => true, render: async () => 'rato-shadow-geometry', cancel: () => {} });
  startNativeShadowTask(f.args); f.timers.tick(); await settle();
  assert.deepEqual(f.ready, []);
  assert.equal(f.errors[0].reason, 'geometry');
  assert.deepEqual(f.removed, [f.args.uri]);
});
