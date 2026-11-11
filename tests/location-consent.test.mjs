import test from 'node:test';
import assert from 'node:assert/strict';
import { requestPermissionAfterNotice } from '../mobile/src/location-consent.mjs';

test('cancelling the notice does not request device permission', async () => {
  let calls = 0;
  const result = await requestPermissionAfterNotice({
    ask: async () => false,
    requestPermission: async () => { calls++; return { granted: true }; },
    isCurrent: () => true,
  });
  assert.equal(result, null);
  assert.equal(calls, 0);
});

test('a request superseded while the notice is open does not request permission', async () => {
  let calls = 0;
  const result = await requestPermissionAfterNotice({
    ask: async () => true,
    requestPermission: async () => { calls++; return { granted: true }; },
    isCurrent: () => false,
  });
  assert.equal(result, null);
  assert.equal(calls, 0);
});

test('continuing the current notice asks the operating system for permission', async () => {
  let calls = 0;
  const result = await requestPermissionAfterNotice({
    ask: async () => true,
    requestPermission: async () => { calls++; return { granted: false }; },
    isCurrent: () => true,
  });
  assert.deepEqual(result, { granted: false });
  assert.equal(calls, 1);
});
