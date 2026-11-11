import test from 'node:test';
import assert from 'node:assert/strict';
import { shadowSunStatus } from '../mobile/src/shadow-status.mjs';

test('explains why no building shadows are drawn at night or near the horizon', () => {
  assert.equal(shadowSunStatus({ altitude: -20 }), 'night');
  assert.equal(shadowSunStatus({ altitude: -1 }), 'low');
  assert.equal(shadowSunStatus({ altitude: 4.9 }), 'low');
  assert.equal(shadowSunStatus({ altitude: 5 }), null);
  assert.equal(shadowSunStatus(null), null);
});
