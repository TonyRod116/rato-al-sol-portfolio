import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapGestureGuard } from '../mobile/src/map-gesture-guard.mjs';

test('Android trusts Google Maps gesture flags on start and completion', () => {
  let clock = 0; const guard = createMapGestureGuard('android', () => clock);
  guard.programmatic();
  assert.equal(guard.started({ isGesture: false }), false);
  assert.equal(guard.completed({ isGesture: false }), false);
  assert.equal(guard.started({ isGesture: true }), true);
  assert.equal(guard.completed({ isGesture: true }), true);
});

test('MapKit ignores initial and app-animated regions but recognizes later changes', () => {
  let clock = 0; const guard = createMapGestureGuard('ios', () => clock);
  assert.equal(guard.started({ isGesture: false }), false);
  assert.equal(guard.completed({ isGesture: false }), false);
  guard.programmatic(); clock += 500;
  assert.equal(guard.started({ isGesture: false }), false);
  assert.equal(guard.completed({ isGesture: false }), false);
  clock += 1200;
  // Apple Maps does not provide a reliable isGesture flag, and Fabric may
  // surface the absent value as false even for an actual user gesture.
  assert.equal(guard.started({ isGesture: false }), true);
  guard.programmatic();
  assert.equal(guard.started(undefined), false);
});
