import test from 'node:test';
import assert from 'node:assert/strict';
import { readyShadowOverlayUri, shadowOverlayBoundsKey } from '../mobile/src/shadow-overlay-image.mjs';

test('keeps the previous image visible while the next image loads for the same area', () => {
  const previous = { uri: 'old.png', bounds: [[42, 3], [41, 2]] };
  const next = { uri: 'next.png', bounds: [[42, 3], [41, 2]] };
  const ready = { uri: previous.uri, boundsKey: shadowOverlayBoundsKey(previous) };
  assert.equal(readyShadowOverlayUri(ready, next), 'old.png');
  assert.equal(readyShadowOverlayUri({ uri: next.uri, boundsKey: shadowOverlayBoundsKey(next) }, next), 'next.png');
});

test('never reuses a previous image over different or invalid bounds', () => {
  const previous = { uri: 'old.png', bounds: [[42, 3], [41, 2]] };
  const ready = { uri: previous.uri, boundsKey: shadowOverlayBoundsKey(previous) };
  assert.equal(readyShadowOverlayUri(ready, { uri: 'next.png', bounds: [[43, 3], [41, 2]] }), null);
  assert.equal(readyShadowOverlayUri(ready, { uri: 'next.png', bounds: [[NaN, 3], [41, 2]] }), null);
  assert.equal(readyShadowOverlayUri(ready, null), null);
});
