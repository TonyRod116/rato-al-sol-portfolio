import test from 'node:test';
import assert from 'node:assert/strict';
import { shadowCacheProbePending, startShadowCacheProbe } from '../mobile/src/shadow-cache-probe.mjs';
import { shadowFrameMatches, playbackFrameReady } from '../mobile/src/shadow-frame.mjs';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup() {
  const pending = deferred(), events = [], timers = new Map();
  let current = true, next = 0;
  const cancel = startShadowCacheProbe({ lookup: () => pending.promise, isCurrent: () => current,
    retire: (uri) => events.push(['retire', uri]), onHit: (uri) => events.push(['hit', uri]),
    onMiss: () => events.push(['miss']), schedule: (fn) => { const id = ++next; timers.set(id, fn); return id; },
    unschedule: (id) => timers.delete(id) });
  return { pending, events, timers, cancel, obsolete: () => { current = false; } };
}

test('a cache hit can be used before any geometry work', async () => {
  const t = setup(); t.pending.resolve('cache.png'); await flush();
  assert.deepEqual(t.events, [['retire', 'cache.png'], ['hit', 'cache.png']]);
  assert.equal(t.timers.size, 0);
});

test('a miss or error starts the uncached path once', async () => {
  for (const fail of [false, true]) {
    const t = setup(); if (fail) t.pending.reject(new Error('disk')); else t.pending.resolve(null);
    await flush(); assert.deepEqual(t.events, [['miss']]); assert.equal(t.timers.size, 0);
  }
});

test('timeout and cancellation never publish a late hit and retire its file', async () => {
  const t = setup(); [...t.timers.values()][0](); t.pending.resolve('late.png'); await flush();
  assert.deepEqual(t.events, [['miss'], ['retire', 'late.png']]);
  const cancelled = setup(); cancelled.cancel(); cancelled.pending.resolve('cancelled.png'); await flush();
  assert.deepEqual(cancelled.events, [['retire', 'cancelled.png']]);
});

test('changing the scene invalidates a hit and still retires its file', async () => {
  const t = setup(); t.obsolete(); t.pending.resolve('old.png'); await flush();
  assert.deepEqual(t.events, [['retire', 'old.png']]);
});

test('cache decisions apply only to the exact scene and generation', () => {
  const area = [1, 2, 3, 4], buildings = {};
  const scene = { area, buildings, retryToken: 1, generation: 1, timeKey: 10, latitude: 1, longitude: 2 };
  const probe = { key: 'key', context: scene };
  assert.equal(shadowCacheProbePending('key', null, null, scene), true);
  assert.equal(shadowCacheProbePending('key', null, probe, scene), false);
  assert.equal(shadowCacheProbePending('key', null, probe, { ...scene, generation: 2 }), true);
  assert.equal(shadowCacheProbePending('key', null, probe, { ...scene, area: [...area] }), true);
  assert.equal(shadowCacheProbePending('key', null, probe, { ...scene, timeKey: 11 }), true);
  assert.equal(shadowCacheProbePending('key', null, probe, { ...scene, buildings: {} }), true);
  assert.equal(shadowCacheProbePending('key', null, probe, { ...scene, retryToken: 2 }), true);
  assert.equal(shadowCacheProbePending('key', {}, null, scene), false);
  assert.equal(shadowCacheProbePending(null, null, null, scene), false);
});

test('a cached empty-source image is adopted and the next frame can advance playback', () => {
  const empty = { type: 'FeatureCollection', features: [] }, area = [1, 2, 3, 4];
  const scene = { area, buildings: {}, retryToken: 0, generation: 0, timeKey: 10, latitude: 1, longitude: 2 };
  const cached = { ...scene, source: empty, uri: 'cache.png' };
  const adopted = shadowFrameMatches(cached, scene) ? cached : null;
  const shadows = adopted?.source || { features: ['must not be used'] };
  const current = adopted?.source === shadows ? adopted : null;
  assert.equal(current, cached);
  const next = { ...cached, timeKey: 11 };
  assert.equal(playbackFrameReady(scene, scene, next, 11, true, area), true);
  assert.equal(playbackFrameReady(scene, scene, { ...next, generation: 1 }, 11, true, area), false);
});
