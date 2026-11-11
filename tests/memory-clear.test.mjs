import test from 'node:test';
import assert from 'node:assert/strict';
import { clearViewportBuildingMemoryCache, getViewportBuildings } from '../frontend/viewport-buildings.mjs';
import { clearPlacesMemoryCache, searchPlaces } from '../frontend/shared/places.mjs';
import { clearMadridSearchMemoryCache, searchMadridFallback, searchMadridParks } from '../frontend/shared/ayala-fallback.mjs';
import { clearBarcelonaSearchMemoryCache, searchBarcelonaTerraces } from '../frontend/shared/barcelona-terraces.mjs';

const madrid = { latitude: 40.42785, longitude: -3.6873 };
const barcelona = { latitude: 41.39172, longitude: 2.16495 };
const bounds = [-3.689, 40.427, -3.687, 40.429];
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const response = (data) => ({ ok: true, status: 200, json: async () => data });

function useFetch(t, fake) {
  const previous = globalThis.fetch;
  globalThis.fetch = fake;
  t.after(() => { globalThis.fetch = previous; });
}

test('a viewport response started before clear cannot repopulate the building cache', async (t) => {
  clearViewportBuildingMemoryCache();
  const first = deferred(); let calls = 0;
  const data = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { ALTURA: 12, OBJECTID: 1 }, geometry: { type: 'Polygon', coordinates: [[[-3.688, 40.428], [-3.6879, 40.428], [-3.6879, 40.4281], [-3.688, 40.428]]] } }] };
  useFetch(t, () => ++calls === 1 ? first.promise : Promise.resolve(response(data)));
  const old = getViewportBuildings(bounds);
  clearViewportBuildingMemoryCache(); first.resolve(response(data)); await old;
  await getViewportBuildings(bounds); await getViewportBuildings(bounds);
  assert.equal(calls, 2, 'new request fetches once and then its own result is cached');
});

test('an Overpass response started before clear cannot repopulate the search cache', async (t) => {
  clearPlacesMemoryCache();
  const first = deferred(); let calls = 0;
  const data = { elements: [{ type: 'node', id: 1, lat: madrid.latitude, lon: madrid.longitude, tags: { name: 'Parque sintético' } }] };
  useFetch(t, () => ++calls === 1 ? first.promise : Promise.resolve(response(data)));
  const old = searchPlaces('parque', madrid, 1000);
  clearPlacesMemoryCache(); first.resolve(response(data)); await old;
  await searchPlaces('parque', madrid, 1000); await searchPlaces('parque', madrid, 1000);
  assert.equal(calls, 2);
});

test('an old Overpass response cannot replace newer data fetched after clear', async (t) => {
  clearPlacesMemoryCache();
  const first = deferred(); let calls = 0;
  const data = (name) => ({ elements: [{ type: 'node', id: 1, lat: madrid.latitude, lon: madrid.longitude, tags: { name } }] });
  useFetch(t, () => ++calls === 1 ? first.promise : Promise.resolve(response(data('Parque reciente'))));
  const old = searchPlaces('parque', madrid, 1000);
  clearPlacesMemoryCache();
  assert.equal((await searchPlaces('parque', madrid, 1000))[0].name, 'Parque reciente');
  first.resolve(response(data('Parque antiguo'))); await old;
  assert.equal((await searchPlaces('parque', madrid, 1000))[0].name, 'Parque reciente');
  assert.equal(calls, 2, 'the current cache was not overwritten');
});

test('a Madrid park response started before clear cannot repopulate the catalogue', async (t) => {
  clearMadridSearchMemoryCache();
  const first = deferred(); let calls = 0;
  const data = { '@graph': [{ id: 1, title: 'Parque sintético', location: madrid }] };
  useFetch(t, () => ++calls === 1 ? first.promise : Promise.resolve(response(data)));
  const old = searchMadridParks(madrid, 1000);
  clearMadridSearchMemoryCache(); first.resolve(response(data)); await old;
  await searchMadridParks(madrid, 1000); await searchMadridParks(madrid, 1000);
  assert.equal(calls, 2);
});

test('a Madrid terrace response started before clear cannot repopulate the catalogue', async (t) => {
  clearMadridSearchMemoryCache();
  const first = deferred(); let calls = 0;
  const data = { success: true, result: { total: 0, records: [] } };
  useFetch(t, () => ++calls === 1 ? first.promise : Promise.resolve(response(data)));
  const old = searchMadridFallback(madrid, 1000, '');
  clearMadridSearchMemoryCache(); first.resolve(response(data)); await old;
  await searchMadridFallback(madrid, 1000, ''); await searchMadridFallback(madrid, 1000, '');
  assert.equal(calls, 2);
});

test('a Barcelona catalogue started before clear cannot repopulate its cache', async (t) => {
  clearBarcelonaSearchMemoryCache();
  const first = deferred(); let calls = 0;
  const metadata = { success: true, result: { resources: [{ id: 'ca298802-c798-4750-b078-021af11ce46b', name: '2026_1S_Data_set.csv', format: 'CSV' }] } };
  const data = { success: true, result: { total: 0, records: [] } };
  useFetch(t, (url) => {
    calls++;
    if (calls === 1) return first.promise;
    return Promise.resolve(response(url.includes('package_show') ? metadata : data));
  });
  const old = searchBarcelonaTerraces(barcelona, 1000);
  clearBarcelonaSearchMemoryCache(); first.resolve(response(metadata)); await old;
  await searchBarcelonaTerraces(barcelona, 1000); await searchBarcelonaTerraces(barcelona, 1000);
  assert.equal(calls, 4, 'the second operation retrieves both metadata and records');
});

test('clearing results does not disable Overpass rate-limit backoff', async (t) => {
  clearPlacesMemoryCache();
  const calls = [];
  useFetch(t, async (url) => { calls.push(url); return { ok: false, status: 429 }; });
  await assert.rejects(searchPlaces('parque', barcelona, 1000));
  assert.deepEqual(calls, ['https://ovp.dresel.systems/api/interpreter', 'https://overpass-api.de/api/interpreter']);
  clearPlacesMemoryCache();
  await assert.rejects(searchPlaces('parque', barcelona, 1000));
  assert.equal(calls.length, 2, 'neither rate-limited provider is hit again during backoff');
});
