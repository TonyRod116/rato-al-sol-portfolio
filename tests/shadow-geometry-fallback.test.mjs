import test from 'node:test';
import assert from 'node:assert/strict';
import { startShadowGeometryWithFallback } from '../mobile/src/shadow-geometry-task.mjs';

function setup() {
  const expanded = [0, 0, 4, 4], initialVisible = [1, 1, 3, 3];
  const jobs = [], ready = [], errors = [];
  let visible = initialVisible;
  const stop = startShadowGeometryWithFallback({ buildings: {}, sun: {}, area: expanded,
    getVisibleBounds: () => visible, onReady: (value) => ready.push(value), onError: (error) => errors.push(error),
    start: (_buildings, _sun, bounds, success, failure) => {
      const job = { bounds, success, failure, cancelled: false }; jobs.push(job);
      return () => { job.cancelled = true; };
    } });
  return { expanded, initialVisible, jobs, ready, errors, stop, move: (bounds) => { visible = bounds; } };
}
const withinBudget = { type: 'FeatureCollection', features: [{}] };
const overLimit = { type: 'FeatureCollection', features: [], limitExceeded: true };

test('an expanded frame fitting the budget is returned without extra work', () => {
  const f = setup(); f.jobs[0].success(withinBudget);
  assert.equal(f.jobs.length, 1);
  assert.deepEqual(f.ready[0], { source: withinBudget, area: f.expanded, fallback: false, requestArea: f.expanded });
});

test('an oversized expanded frame computes the visible area before returning', () => {
  const f = setup(); f.jobs[0].success(overLimit);
  assert.equal(f.jobs[1].bounds, f.initialVisible);
  assert.deepEqual(f.ready, []);
  f.jobs[1].success(withinBudget);
  assert.deepEqual(f.ready[0], { source: withinBudget, area: f.initialVisible, fallback: true, requestArea: f.expanded });
});

test('a viewport movement during fallback discards the stale result', () => {
  const f = setup(), moved = [2, 1, 4, 3];
  f.jobs[0].success(overLimit); f.move(moved); f.jobs[1].success(withinBudget);
  assert.deepEqual(f.ready, []); assert.equal(f.jobs[2].bounds, moved);
  f.jobs[1].success(withinBudget); assert.deepEqual(f.ready, []);
  f.jobs[2].success(withinBudget); assert.equal(f.ready[0].area, moved);
});

test('a visible area over the limit is reported without inventing a partial shadow', () => {
  const f = setup(); f.jobs[0].success(overLimit); f.jobs[1].success(overLimit);
  assert.equal(f.jobs.length, 2); assert.equal(f.ready[0].source.limitExceeded, true);
  assert.equal(f.ready[0].area, f.initialVisible);
});

test('cancellation and a missing visible area never publish old geometry', () => {
  const cancelled = setup(); cancelled.jobs[0].success(overLimit); cancelled.stop();
  assert.equal(cancelled.jobs[1].cancelled, true);
  cancelled.jobs[1].success(withinBudget); cancelled.jobs[1].failure(new Error('late'));
  assert.deepEqual(cancelled.ready, []); assert.deepEqual(cancelled.errors, []);
  const missing = setup(); missing.jobs[0].success(overLimit); missing.move(null); missing.jobs[1].success(withinBudget);
  assert.deepEqual(missing.ready, []); assert.equal(missing.errors.length, 1);
});
