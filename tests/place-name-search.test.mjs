import test from 'node:test';
import assert from 'node:assert/strict';
import { searchPlaces } from '../frontend/shared/places.mjs';

const sol = { latitude: 40.4168, longitude: -3.7038 };
const plaza = { type: 'node', id: 42, lat: 40.4155, lon: -3.7074, tags: { name: 'Plaza Mayor', place: 'square' } };
const response = (elements) => ({ ok: true, status: 200, json: async () => ({ elements }) });

test('a correctly spelled place is returned on the first request', async () => {
  const calls = [];
  const fetch = async (url, options) => { calls.push({ url, query: decodeURIComponent(options.body.slice(5)) }); return response([plaza]); };
  const places = await searchPlaces('Plaza Mayor', sol, 5000, fetch);
  assert.equal(places[0].name, 'Plaza Mayor');
  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /\["name"="Plaza Mayor"\]/);
  assert.match(calls[0].query, /\[timeout:6\]/);
});

test('a typo retries with tolerance only after successful empty exact and partial searches', async () => {
  const queries = [];
  const fetch = async (_url, options) => {
    queries.push(decodeURIComponent(options.body.slice(5)));
    return response(queries.length < 3 ? [] : [plaza]);
  };
  const places = await searchPlaces('Plaza Mayro', sol, 5000, fetch);
  assert.equal(places[0].name, 'Plaza Mayor');
  assert.equal(queries.length, 3);
  assert.notEqual(queries[0], queries[1]);
});

test('a failed tolerant search is reported as an error, not as a false absence', async () => {
  let count = 0;
  const fetch = async () => ++count <= 2 ? response([]) : { ok: false, status: 503 };
  await assert.rejects(searchPlaces('Plaza Mayro', sol, 5000, fetch));
});
