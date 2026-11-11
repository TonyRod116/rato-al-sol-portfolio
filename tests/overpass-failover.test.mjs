import test from 'node:test';
import assert from 'node:assert/strict';
import { searchNearby, searchPlaces } from '../frontend/shared/places.mjs';

const sol = { latitude: 40.4169, longitude: -3.7035 };
const europe = 'https://ovp.dresel.systems/api/interpreter';
const world = 'https://overpass-api.de/api/interpreter';
const square = { type: 'node', id: 4, lat: sol.latitude, lon: sol.longitude,
  tags: { name: 'Plaza de prueba', place: 'square' } };

test('Sol falls back when the European provider is rate limited, then respects its backoff', async () => {
  const originalFetch = globalThis.fetch, originalNow = Date.now, calls = [];
  let clock = originalNow(), rejectEurope = true;
  Date.now = () => clock;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url === europe && rejectEurope) return { ok: false, status: 429 };
    return { ok: true, status: 200, json: async () => ({ elements: url === world ? [square] : [] }) };
  };
  try {
    assert.equal((await searchNearby(sol, 500)).length, 1);
    assert.deepEqual(calls.map((item) => item.url), [europe, world]);
    assert.ok(calls.every((item) => item.options.method === 'POST' && !item.url.includes(String(sol.latitude))));
    await searchNearby({ ...sol, latitude: sol.latitude + .0001 }, 500);
    assert.deepEqual(calls.map((item) => item.url), [europe, world, world], 'a rate-limited regional server is not hit again');
    rejectEurope = false; clock += 31000;
    assert.deepEqual(await searchNearby({ ...sol, latitude: sol.latitude + .0002 }, 500), []);
    assert.deepEqual(calls.map((item) => item.url), [europe, world, world, europe], 'a successful empty response does not call the fallback');
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});

test('both providers failing is an error rather than a false empty result', async () => {
  const calls = [];
  const unavailable = async (url) => { calls.push(url); return { ok: false, status: 503 }; };
  await assert.rejects(searchNearby(sol, 500, unavailable), /ocupado/);
  assert.deepEqual(calls, [europe, world]);
});

test('Madrid nearby bounds the wait for each provider without changing Barcelona or general search', async () => {
  const originalTimeout = globalThis.setTimeout, budgets = [], requests = [];
  globalThis.setTimeout = (fn, ms) => { budgets.push(ms); return originalTimeout(fn, 0); };
  try {
    const stalled = (url, options) => {
      requests.push({ url, query: decodeURIComponent(options.body.slice(5)) });
      return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout'))));
    };
    await assert.rejects(searchNearby(sol, 500, stalled), /timeout/);
    assert.deepEqual(budgets, [7000, 7000]);
    assert.deepEqual(requests.map((request) => request.url), [europe, world]);
    assert.ok(requests.every((request) => request.query.includes('[timeout:6]')));
    budgets.length = 0; requests.length = 0;
    const immediate = async (url, options) => {
      requests.push({ url, query: decodeURIComponent(options.body.slice(5)) });
      return { ok: true, status: 200, json: async () => ({ elements: [] }) };
    };
    await searchNearby({ latitude: 41.39172, longitude: 2.16495 }, 500, immediate);
    assert.deepEqual(budgets, [27000]);
    assert.ok(requests[0].query.includes('[timeout:20]'));
    budgets.length = 0; requests.length = 0;
    await searchPlaces('plaza', sol, 500, immediate);
    assert.deepEqual(budgets, [27000]);
    assert.ok(requests[0].query.includes('[timeout:20]'));
  } finally { globalThis.setTimeout = originalTimeout; }
});
