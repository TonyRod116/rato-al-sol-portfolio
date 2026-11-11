import test from 'node:test';
import assert from 'node:assert/strict';
import { firstWithResults } from '../mobile/src/first-results.mjs';

test('empty saved results retain their incomplete and old-data flags', async () => {
  const result = await firstWithResults([Promise.resolve({ places: [], source: 'osm', partial: true, stale: true })]);
  assert.equal(result.partial, true);
  assert.equal(result.stale, true);
});

test('nearby search reports a provider failure even after another source returns', async () => {
  let fail, warnings = 0;
  const slow = new Promise((_, reject) => { fail = reject; });
  const found = await firstWithResults([Promise.resolve({ places: [{ id: 1 }], source: 'municipal' }), slow], () => warnings++);
  assert.equal(found.source, 'municipal');
  assert.equal(warnings, 0);
  fail(new Error('offline'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(warnings, 1);
});

test('nearby search distinguishes every source failing from an empty source', async () => {
  let warnings = 0;
  const failed = () => { warnings++; };
  const result = await firstWithResults([Promise.reject(new Error('offline')), Promise.resolve({ places: [] })], failed);
  assert.deepEqual(result, { places: [], source: 'empty', partial: true });
  assert.equal(warnings, 1);
  await assert.rejects(firstWithResults([Promise.reject(new Error('offline'))], failed), /offline/);
});

test('Madrid can briefly prefer public places over businesses that arrived first', async () => {
  let resolvePublic, timer, stopped = false, delay;
  const publicSource = new Promise((resolve) => { resolvePublic = resolve; });
  const promise = firstWithResults([
    Promise.resolve({ places: [{ id: 'shop', kind: 'business' }], source: 'terraces' }), publicSource,
  ], undefined, { preferPublicMs: 1200, schedule: (callback, ms) => { timer = callback; delay = ms; return 1; }, unschedule: () => { stopped = true; } });
  await Promise.resolve();
  assert.equal(delay, 1200);
  resolvePublic({ places: [{ id: 'park', kind: 'public' }], source: 'osm' });
  assert.equal((await promise).source, 'osm');
  assert.equal(stopped, true);
  timer(); // A late timer cannot replace the public result.
});

test('the public preference has a strict time limit and default results stay immediate', async () => {
  let timer;
  const never = new Promise(() => {}), business = { places: [{ id: 'shop', kind: 'business' }], source: 'terraces' };
  const pending = firstWithResults([Promise.resolve(business), never], undefined,
    { preferPublicMs: 1200, schedule: (fn) => { timer = fn; return 1; }, unschedule: () => {} });
  await Promise.resolve();
  timer();
  assert.equal((await pending).source, 'terraces');
  assert.equal((await firstWithResults([Promise.resolve(business), never])).source, 'terraces');
  assert.equal((await firstWithResults([Promise.resolve(business), Promise.resolve({ places: [], source: 'empty' })], undefined,
    { preferPublicMs: 1200 })).source, 'terraces', 'do not wait after every source has finished');
});
