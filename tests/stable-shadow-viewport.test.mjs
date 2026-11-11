import test from 'node:test';
import assert from 'node:assert/strict';
import { paddedViewport, stableShadowViewport } from '../mobile/src/viewport.mjs';
import { shadowFrameMatches } from '../mobile/src/shadow-frame.mjs';

const visible = [-3.700, 40.410, -3.698, 40.412];
const geometry = { bounds: [-3.705, 40.406, -3.693, 40.416], features: [] };
const contains = (outer, inner) => outer[0] <= inner[0] && outer[1] <= inner[1] &&
  outer[2] >= inner[2] && outer[3] >= inner[3];

test('a small pan and zoom reuse one image while its complete projection margin fits', () => {
  const frame = stableShadowViewport(visible, geometry, 100);
  assert.ok(contains(geometry.bounds, paddedViewport(frame.bounds)));
  const pan30 = [-3.6994, 40.410, -3.6974, 40.412];
  assert.strictEqual(stableShadowViewport(pan30, geometry, 100, frame), frame);
  const zoomOut = [-3.7001, 40.4099, -3.6979, 40.4121];
  assert.strictEqual(stableShadowViewport(zoomOut, geometry, 100, frame), frame);
});

test('a different time, geometry, distant pan or too-large zoom creates a new frame', () => {
  const frame = stableShadowViewport(visible, geometry, 100);
  const later = stableShadowViewport(visible, geometry, 115, frame);
  assert.notStrictEqual(later, frame);
  assert.strictEqual(later.bounds, frame.bounds, 'future playback reuses the identical covered area');
  assert.notStrictEqual(stableShadowViewport(visible, { ...geometry }, 100, frame), frame);
  const pan = [-3.6988, 40.410, -3.6968, 40.412];
  assert.notStrictEqual(stableShadowViewport(pan, geometry, 100, frame), frame);
  const zoomOut = [-3.701, 40.409, -3.697, 40.413];
  assert.notStrictEqual(stableShadowViewport(zoomOut, geometry, 100, frame), frame);
});

test('never extends the image beyond the area protected by its full building margin', () => {
  const coverage = paddedViewport(visible);
  const frame = stableShadowViewport(visible, { bounds: coverage }, 100);
  assert.ok(contains(coverage, paddedViewport(frame.bounds)));
  assert.ok(frame.bounds.every((coordinate, i) => Math.abs(coordinate - visible[i]) < 1e-8));
  assert.equal(stableShadowViewport(visible, { bounds: visible }, 100), null);
  assert.equal(stableShadowViewport(visible, geometry, null), null);
});

test('one constrained edge does not prevent expansion toward the opposite edge', () => {
  const margin = paddedViewport(visible);
  const asymmetric = { bounds: [margin[0], margin[1] - .002, margin[2] + .002, margin[3] + .002] };
  const frame = stableShadowViewport(visible, asymmetric, 100);
  assert.ok(frame.bounds[2] - visible[2] > .0006);
  assert.ok(contains(asymmetric.bounds, paddedViewport(frame.bounds)));
});

test('the rendered frame survives a 30% pan, while an hour or day change requires the matching future image', () => {
  const initial = stableShadowViewport(visible, geometry, 100);
  const current = { area: initial.bounds, buildings: geometry, timeKey: 100, retryToken: 0, generation: 0,
    latitude: 40.411, longitude: -3.699 };
  const moved = stableShadowViewport([-3.6994, 40.410, -3.6974, 40.412], geometry, 100, initial);
  assert.equal(shadowFrameMatches(current, { ...current, area: moved.bounds }), true);
  assert.equal(shadowFrameMatches(current, { ...current, area: moved.bounds, timeKey: 115 }), false);
  assert.equal(shadowFrameMatches(current, { ...current, area: moved.bounds, timeKey: 100 + 86400000 }), false);
  const later = stableShadowViewport(visible, geometry, 115, moved);
  assert.strictEqual(later.bounds, initial.bounds);
  assert.equal(shadowFrameMatches({ ...current, timeKey: 115 }, { ...current, area: later.bounds, timeKey: 115 }), true);
  assert.equal(shadowFrameMatches(current, { ...current, latitude: 40.412 }), false);
});
