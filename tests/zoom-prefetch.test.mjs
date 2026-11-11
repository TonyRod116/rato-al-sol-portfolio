import test from 'node:test';
import assert from 'node:assert/strict';
import { createZoomPrefetch, zoomPrefetchBounds } from '../mobile/src/zoom-prefetch.mjs';

const madrid = [-3.706, 40.414, -3.702, 40.418];
const barcelona = [2.16, 41.39, 2.164, 41.394];

function clock() {
  let time = 0, id = 0;
  const timers = new Map();
  return {
    now: () => time,
    schedule(fn, delay) { const key = ++id; timers.set(key, { fn, at: time + delay }); return key; },
    unschedule(key) { timers.delete(key); },
    async advance(ms) {
      time += ms;
      const due = [...timers].filter(([, item]) => item.at <= time);
      for (const [key, item] of due) { timers.delete(key); item.fn(); }
      await new Promise((resolve) => setImmediate(resolve));
    },
    timers,
  };
}
const geometry = (bounds = madrid, source = 'madrid') => ({ type: 'FeatureCollection', bounds, source, features: [], fetchedAt: 1 });

test('nearby zoom precache respects city coverage, query budgets and expansion limits', () => {
  for (const [bounds, source] of [[madrid, 'madrid'], [barcelona, 'osm']]) {
    const target = zoomPrefetchBounds(bounds, source);
    assert.ok(target);
    assert.ok(target[0] < bounds[0] && target[1] < bounds[1] && target[2] > bounds[2] && target[3] > bounds[3]);
  }
  assert.equal(zoomPrefetchBounds([0, 0, 1, 1], 'osm'), null);
  assert.equal(zoomPrefetchBounds([-3.9, 40.4, -3.8, 40.5], 'madrid'), null);
  assert.equal(zoomPrefetchBounds([2.14, 41.38, 2.18, 41.4], 'osm'), null);
  assert.equal(zoomPrefetchBounds(madrid, 'unknown'), null);
  assert.equal(zoomPrefetchBounds(null, 'madrid'), null);
});

test('precache waits for a stable view, checks the local cache, and saves complete results', async () => {
  const c = clock(), loads = [], saves = [];
  const loader = { find: () => null, prime: () => assert.fail('not cached'), get: async (bounds) => { loads.push(bounds); return geometry(bounds); } };
  const cache = { find: async () => null, save: async (...args) => saves.push(args) };
  const prefetch = createZoomPrefetch({ loader: () => loader, buildingCache: cache, generation: () => 1, ...c });
  prefetch.start({ bounds: madrid, geometry: geometry() });
  await c.advance(2999);
  assert.equal(loads.length, 0);
  await c.advance(1);
  assert.deepEqual(loads, [zoomPrefetchBounds(madrid, 'madrid')]);
  assert.equal(saves.length, 1);
  assert.equal(saves[0][1].fetchedAt, 1);
});

test('existing saved geometry avoids any new download and is made available to the loader', async () => {
  const c = clock(), target = zoomPrefetchBounds(barcelona, 'osm'), primed = [];
  const loader = { find: () => null, prime: (area) => primed.push(area), get: () => assert.fail('must reuse disk') };
  const cache = { find: async () => ({ value: geometry(target, 'osm'), fetchedAt: 25 }), save: () => assert.fail('must not rewrite') };
  const prefetch = createZoomPrefetch({ loader: () => loader, buildingCache: cache, generation: () => 1, ...c });
  prefetch.start({ bounds: barcelona, geometry: geometry(barcelona, 'osm') });
  await c.advance(3000);
  assert.equal(primed.length, 1);
  assert.equal(primed[0].fetchedAt, 25);
});

test('cancelling or clearing while a network request runs never saves its result', async () => {
  const c = clock(), saves = [];
  let finish, epoch = 1;
  const loader = { find: () => null, prime() {}, get: (bounds) => new Promise((resolve) => { finish = () => resolve(geometry(bounds)); }) };
  const cache = { find: async () => null, save: async (...args) => saves.push(args) };
  const prefetch = createZoomPrefetch({ loader: () => loader, buildingCache: cache, generation: () => epoch, ...c });
  prefetch.start({ bounds: madrid, geometry: geometry() });
  await c.advance(3000);
  assert.equal(typeof finish, 'function');
  prefetch.cancel(); epoch++;
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(saves, []);
});

test('recent prefetch requests are throttled and a cancelled timer does no work', async () => {
  const c = clock(), loads = [];
  const loader = { find: () => null, prime() {}, get: async (bounds) => { loads.push(bounds); return geometry(bounds); } };
  const cache = { find: async () => null, save: async () => {} };
  const prefetch = createZoomPrefetch({ loader: () => loader, buildingCache: cache, generation: () => 1, ...c });
  prefetch.start({ bounds: madrid, geometry: geometry() });
  await c.advance(3000);
  assert.equal(loads.length, 1);
  prefetch.start({ bounds: madrid, geometry: geometry() });
  await c.advance(29999);
  assert.equal(loads.length, 1);
  prefetch.cancel();
  await c.advance(1);
  assert.equal(loads.length, 1);
});
