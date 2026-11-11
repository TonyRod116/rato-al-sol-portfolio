import test from 'node:test';
import assert from 'node:assert/strict';
import { retainedShadow } from '../mobile/src/retained-shadow.mjs';

const image = { uri: 'file:///previous.png', area: [0, 0, 10, 10], timeKey: 123, retryToken: 1 };
const context = { visibleBounds: [3, 0, 13, 10], timeKey: 123, retryToken: 1, sunStatus: null };

test('the old geographic image stays available over the overlapping area', () => {
  assert.equal(retainedShadow(image, context), image);
  assert.equal(retainedShadow(image, { ...context, visibleBounds: [10, 0, 20, 10] }), null);
  assert.equal(retainedShadow(image, { ...context, visibleBounds: [11, 0, 21, 10] }), null);
});

test('old shadows never survive a different instant, retry, night or invalid bounds', () => {
  assert.equal(retainedShadow(image, { ...context, timeKey: 124 }), null);
  assert.equal(retainedShadow(image, { ...context, timeKey: null }), null);
  assert.equal(retainedShadow(image, { ...context, retryToken: 2 }), null);
  assert.equal(retainedShadow(image, { ...context, sunStatus: 'night' }), null);
  assert.equal(retainedShadow(image, { ...context, sunStatus: 'low' }), null);
  assert.equal(retainedShadow(image, { ...context, visibleBounds: [4, 3, 2, 6] }), null);
  assert.equal(retainedShadow(image, { ...context, visibleBounds: null }), null);
});
