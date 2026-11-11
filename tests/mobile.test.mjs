import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceMetres, getBuildings, searchNearby, searchPlaces } from '../frontend/shared/places.mjs';
import { atMinutes, lightAt, nearbyOutdoorScenes, prepareScene, solarWindows } from '../frontend/shared/estimate.mjs';
import { getMadridScene } from '../frontend/shared/madrid-scene.mjs';
import { searchMadridFallback, searchMadridParks } from '../frontend/shared/ayala-fallback.mjs';
import { searchBarcelonaTerraces } from '../frontend/shared/barcelona-terraces.mjs';
import { nativeViewport, nativeVisibleViewport, paddedViewport } from '../mobile/src/viewport.mjs';
import { sunPosition } from '../frontend/solar.mjs';

const madrid = { latitude: 40.42785, longitude: -3.6873 };
const reply = (elements) => async (_url, options) => ({ ok: true, json: async () => ({ elements }), options });

test('map coverage follows all visible edges with a margin and falls back to the native region', () => {
  const bounds = [2.16, 41.39, 2.17, 41.40];
  const padded = paddedViewport(bounds);
  assert.ok(padded[0] < bounds[0] && padded[1] < bounds[1] && padded[2] > bounds[2] && padded[3] > bounds[3]);
  assert.equal(paddedViewport([2.17, 41.39, 2.16, 41.40]), null);
  const region = { latitude: 41.395, longitude: 2.165, latitudeDelta: .01, longitudeDelta: .01 };
  const native = nativeViewport(region, { southWest: { latitude: 41.39, longitude: 2.16 }, northEast: { latitude: 41.40, longitude: 2.17 } });
  assert.deepEqual(native, padded);
  assert.deepEqual(nativeVisibleViewport(region, { southWest: { latitude: 41.39, longitude: 2.16 }, northEast: { latitude: 41.40, longitude: 2.17 } }), bounds);
  assert.ok(nativeViewport(region, null));
});

test('place search sends literal bounded input in POST, never in the URL', async () => {
  let sent, calls = 0;
  const fetch = async (url, options) => { sent = { url, ...options }; calls++; return { ok: true, json: async () => ({ elements: calls === 1 ? [] : [{ type: 'node', id: 1, lat: madrid.latitude, lon: madrid.longitude, tags: { name: 'Un parque' } }] }) }; };
  const result = await searchPlaces('parque.*";out;', madrid, 1000, fetch);
  assert.equal(result.length, 1);
  assert.equal(sent.method, 'POST');
  assert.equal(sent.url, 'https://ovp.dresel.systems/api/interpreter');
  assert.ok(!sent.url.includes(String(madrid.latitude)));
  const query = decodeURIComponent(sent.body.slice(5));
  assert.ok(query.includes('parque\\\\.\\\\*\\";out;'));
  await assert.rejects(() => searchPlaces('x', madrid, 1000, fetch));
  await assert.rejects(() => searchPlaces('parque', madrid, 100000, fetch));
});

test('Madrid and Barcelona use the European source without applying its limited coverage elsewhere', async () => {
  const endpoints = [];
  const fetch = async (url) => { endpoints.push(url); return { ok: true, json: async () => ({ elements: [] }) }; };
  await searchPlaces('parque', { latitude: 41.39172, longitude: 2.16495 }, 1000, fetch);
  await searchPlaces('parque', { latitude: 40.4169, longitude: -3.7035 }, 1000, fetch);
  await searchPlaces('parque', { latitude: 40.7128, longitude: -74.006 }, 1000, fetch);
  assert.deepEqual(endpoints, ['https://ovp.dresel.systems/api/interpreter', 'https://ovp.dresel.systems/api/interpreter', 'https://overpass-api.de/api/interpreter']);
});

test('a misspelled category finds nearby restaurants by type, not only by their names', async () => {
  const fetch = async (_url, options) => {
    const query = decodeURIComponent(options.body.slice(5));
    const elements = query.includes('amenity') && query.includes('restaurant')
      ? [{ type: 'node', id: 7, lat: madrid.latitude, lon: madrid.longitude, tags: { name: 'Casa Pepa', amenity: 'restaurant' } }] : [];
    return { ok: true, json: async () => ({ elements }) };
  };
  assert.equal((await searchPlaces('reiaurante', madrid, 1000, fetch))[0]?.name, 'Casa Pepa');
});

test('English categories search by type without confusing parks with bars', async () => {
  const queries = [];
  const fetch = async (_url, options) => {
    queries.push(decodeURIComponent(options.body.slice(5)));
    return { ok: true, json: async () => ({ elements: [] }) };
  };
  await searchPlaces('parks', madrid, 1000, fetch);
  await searchPlaces('restaurants', madrid, 1000, fetch);
  await searchPlaces('terraces', madrid, 1000, fetch);
  assert.match(queries[0], /leisure.*park/);
  assert.match(queries[1], /amenity.*restaurant/);
  assert.match(queries[2], /outdoor_seating/);
});

test('municipal category fallback returns nearby terraces without inventing their business type', async () => {
  const fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.ok(!body.q, 'a category is not a literal business name');
    return { ok: true, json: async () => ({ success: true, result: { total: 1, records: [
      { id_terraza: '42', rotulo: 'Casa cercana', coordenada_x_local: '441830.59', coordenada_y_local: '4475475.52', desc_tipo_acceso_local: 'Puerta Calle' },
    ] } }) };
  };
  const places = await searchMadridFallback(madrid, 5000, 'reiaurante', fetch);
  assert.equal(places[0]?.name, 'Casa cercana');
  assert.equal(places[0]?.categoryUnknown, true);
});

test('Barcelona terrace records use the newest release and retain their uncertainty', async () => {
  const center = { latitude: 41.39172, longitude: 2.16495 }, requests = [];
  const resource = 'ca298802-c798-4750-b078-021af11ce46b';
  const fetch = async (url) => {
    requests.push(url);
    if (url.includes('package_show')) return { ok: true, json: async () => ({ success: true, result: { resources: [
      { id: '3be007e1-d1c8-4480-ab33-ba30da5eda1d', name: '2025_2S_Data_set.csv', format: 'CSV' },
      { id: resource, name: '2026_1S_Data_set.csv', format: 'CSV' },
    ] } }) };
    return { ok: true, json: async () => ({ success: true, result: { total: 3, records: [
      { _id: 1, EMPLACAMENT: 'Passeig de prova, 10', LATITUD: '41.39172', LONGITUD: '2.16495' },
      { _id: 2, EMPLACAMENT: 'Lejos, 1', LATITUD: '41.41', LONGITUD: '2.16' },
      { _id: 3, EMPLACAMENT: 'Sin coordenadas', LATITUD: '', LONGITUD: '' },
    ] } }) };
  };
  const results = await searchBarcelonaTerraces(center, 500, 'restaurante', fetch);
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Passeig de prova, 10');
  assert.equal(results[0].categoryUnknown, true);
  assert.deepEqual(results[0].municipalPeriod, { year: 2026, semester: 1 });
  assert.ok(requests[1].includes(resource));
  assert.ok(requests.every((url) => !url.includes(String(center.latitude)) && !url.includes('restaurante')));
  assert.deepEqual(await searchBarcelonaTerraces(center, 500, 'parque', fetch), []);
  await assert.rejects(() => searchBarcelonaTerraces(center, 500, '', async (url) => url.includes('package_show')
    ? { ok: true, json: async () => ({ success: true, result: { resources: [{ id: resource, name: '2026_1S_Data_set.csv', format: 'CSV' }] } }) }
    : { ok: true, json: async () => ({ success: true, result: { total: 2, records: [] } }) }));
});

test('nearby results are real entries within the requested radius and restaurants are not terrace points', async () => {
  const elements = [
    { type: 'node', id: 1, lat: madrid.latitude, lon: madrid.longitude, tags: { name: 'Un café', amenity: 'cafe', outdoor_seating: 'yes' } },
    { type: 'way', id: 2, center: { lat: madrid.latitude + .002, lon: madrid.longitude }, tags: { name: 'Un parque', leisure: 'park' } },
    { type: 'node', id: 3, lat: madrid.latitude + .02, lon: madrid.longitude, tags: { name: 'Lejos', leisure: 'park' } },
    { type: 'node', id: 4, lat: 999, lon: 2, tags: { name: 'Inválido' } },
  ];
  const results = await searchNearby(madrid, 500, reply(elements));
  assert.deepEqual(results.map((p) => p.kind), ['business', 'public']);
  assert.ok(results[1].distance > 200 && results[1].distance < 250);
  assert.equal(distanceMetres(madrid, madrid), 0);
});

test('building heights remain unknown when absent and incomplete geometry is rejected', async () => {
  const geometry = [
    { lat: 40.4278, lon: -3.6873 }, { lat: 40.4278, lon: -3.6872 },
    { lat: 40.4279, lon: -3.6872 }, { lat: 40.4278, lon: -3.6873 },
  ];
  const buildings = await getBuildings([madrid], reply([
    { type: 'way', id: 1, geometry, tags: { 'building:levels': '4' } },
    { type: 'way', id: 2, geometry, tags: {} },
  ]));
  assert.equal(buildings[0].height, 12);
  assert.equal(buildings[1].height, null);
  await assert.rejects(() => getBuildings([madrid], reply([{ type: 'way', geometry: geometry.slice(1), tags: {} }])));
  await assert.rejects(() => getBuildings([madrid], reply([])));
});

test('Madrid building lookup puts its coordinates in a POST and preserves missing heights as unknown', async () => {
  let request;
  const feature = { type: 'Feature', properties: { ALTURA: 20 }, geometry: { type: 'Polygon', coordinates: [[[-3.6874, 40.4278], [-3.6873, 40.4278], [-3.6873, 40.4279], [-3.6874, 40.4278]]] } };
  const fetch = async (url, options) => { request = { url, ...options }; return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [feature] }) }; };
  const buildings = await getMadridScene(madrid, fetch);
  assert.equal(buildings[0].height, 20);
  assert.equal(request.method, 'POST');
  assert.ok(!request.url.includes(String(madrid.latitude)));
  feature.properties.ALTURA = null;
  assert.equal((await getMadridScene(madrid, fetch))[0].height, null);
});

test('a building of unknown height can obstruct the sun without making every direction unknown', () => {
  const instant = new Date('2026-06-21T11:00:00Z');
  const azimuth = sunPosition(instant, madrid.latitude, madrid.longitude).azimuth * Math.PI / 180;
  const x = Math.sin(azimuth) * 30, y = -Math.cos(azimuth) * 30;
  const square = (cx, cy) => [[cx - 5, cy - 5], [cx + 5, cy - 5], [cx + 5, cy + 5], [cx - 5, cy + 5]];
  const scene = { point: madrid, radius: 400, buildings: [{ footprint: square(x, y), height: null }] };
  assert.equal(lightAt(scene, instant), 'unknown');
  scene.buildings[0].footprint = square(-x, -y);
  assert.equal(lightAt(scene, instant), 'sun');
});

test('a known nearby shadow remains usable even when distant buildings are outside coverage', () => {
  const instant = new Date('2026-11-03T15:00:00Z');
  const sun = sunPosition(instant, madrid.latitude, madrid.longitude);
  const azimuth = sun.azimuth * Math.PI / 180;
  const x = Math.sin(azimuth) * 30, y = -Math.cos(azimuth) * 30;
  const square = (cx, cy) => [[cx - 5, cy - 5], [cx + 5, cy - 5], [cx + 5, cy + 5], [cx - 5, cy + 5]];
  const scene = { point: madrid, radius: 250, buildings: [{ footprint: square(x, y), height: 30 }] };
  assert.ok(sun.altitude > 5 && 100 / Math.tan(sun.altitude * Math.PI / 180) > scene.radius - 50);
  assert.equal(lightAt(scene, instant), 'shade', 'a nearby building already blocks the sun');
  scene.buildings[0].footprint = square(-x, -y);
  assert.equal(lightAt(scene, instant), 'unknown', 'an unobstructed ray is not proof of sun with incomplete coverage');
  scene.buildings = [{ footprint: square(x, y), height: 30 }, { footprint: square(x * 2, y * 2), height: null }];
  assert.equal(lightAt(scene, instant), 'shade', 'an additional unknown obstacle cannot undo a known shadow');
  assert.equal(lightAt(scene, new Date('2026-11-03T16:55:00Z')), 'unknown', 'near-horizon geometry remains unknown');
  scene.buildings = [{ footprint: square(x, y), height: 30 }, { footprint: square(0, 0), height: null }];
  assert.equal(lightAt(scene, instant), 'unknown', 'a point inside an unknown building has no outdoor light estimate');
  assert.equal(lightAt(scene, new Date('2026-11-03T00:00:00Z')), 'night');
});

test('Madrid name fallback searches the public register via POST and keeps entrances distinct', async () => {
  let request;
  const fetch = async (url, options) => {
    request = { url, ...options };
    return { ok: true, json: async () => ({ success: true, result: { records: [
      { id_terraza: '42', rotulo: 'Bar de prueba', coordenada_x_local: '443000', coordenada_y_local: '4476000', desc_tipo_acceso_local: 'Puerta Calle' },
      { id_terraza: '43', rotulo: 'Sin entrada', coordenada_x_local: '', coordenada_y_local: '', desc_tipo_acceso_local: 'Interior' },
      { id_terraza: '44', rotulo: 'Nombre que no coincide', coordenada_x_local: '443000', coordenada_y_local: '4476000', desc_tipo_acceso_local: 'Puerta Calle' },
    ] } }) };
  };
  const places = await searchMadridFallback(madrid, 5000, 'Bar de prueba', fetch);
  assert.equal(request.method, 'POST');
  assert.ok(!request.url.includes('Bar'));
  assert.equal(JSON.parse(request.body).q, 'Bar de prueba');
  assert.equal(places.length, 1);
  assert.ok(places.every((place) => place.kind === 'business'));
  assert.ok(!places.some((place) => place.name === 'Sin entrada'));
});

test('municipal park fallback filters reference points locally and ignores invalid locations', async () => {
  let requested;
  const fetch = async (url) => {
    requested = url;
    return { ok: true, json: async () => ({ '@graph': [
      { id: '1', title: 'Jardín cercano', location: { latitude: madrid.latitude + .001, longitude: madrid.longitude } },
      { id: '2', title: 'Jardín lejano', location: { latitude: madrid.latitude + .02, longitude: madrid.longitude } },
      { id: '3', title: 'Sin posición' },
      { id: '4', title: 'Inválido', location: { latitude: '40.4', longitude: -3.6 } },
    ] }) };
  };
  const places = await searchMadridParks(madrid, 500, 'jardin', fetch);
  assert.equal(places.length, 1);
  assert.equal(places[0].name, 'Jardín cercano');
  assert.equal(places[0].kind, 'public');
  assert.ok(!requested.includes(String(madrid.latitude)) && !requested.includes('jardín'));
  await assert.rejects(() => searchMadridParks(madrid, 500, '', async () => ({ ok: true, json: async () => ({}) })));
});

test('unknown obstruction is not sunshine; known obstruction and open ray are distinguished', () => {
  const instant = new Date('2026-06-21T11:00:00Z');
  const sun = sunPosition(instant, madrid.latitude, madrid.longitude);
  const angle = sun.azimuth * Math.PI / 180;
  const x = Math.sin(angle) * 30, y = -Math.cos(angle) * 30;
  const square = (cx, cy) => [[cx - 5, cy - 5], [cx + 5, cy - 5], [cx + 5, cy + 5], [cx - 5, cy + 5]];
  const scene = { point: madrid, radius: 400, buildings: [{ footprint: square(x, y), height: 110 }] };
  assert.equal(lightAt(scene, instant), 'shade');
  scene.buildings[0].height = null;
  assert.equal(lightAt(scene, instant), 'unknown');
  scene.buildings[0] = { footprint: square(-x, -y), height: 110 };
  assert.equal(lightAt(scene, instant), 'sun');
  scene.buildings[0] = { footprint: square(0, 0), height: 110 };
  assert.equal(lightAt(scene, instant), 'unknown');
  assert.equal(lightAt(scene, new Date('2026-06-21T00:00:00Z')), 'night');
});

test('a restaurant point inside a building offers distinct outside reference points, without assigning tables', () => {
  const d = 0.00009;
  const building = { height: 12, footprint: [
    { latitude: madrid.latitude - d, longitude: madrid.longitude - d },
    { latitude: madrid.latitude - d, longitude: madrid.longitude + d },
    { latitude: madrid.latitude + d, longitude: madrid.longitude + d },
    { latitude: madrid.latitude + d, longitude: madrid.longitude - d },
    { latitude: madrid.latitude - d, longitude: madrid.longitude - d },
  ] };
  const scene = prepareScene(madrid, [building], 250);
  const choices = nearbyOutdoorScenes(scene, [building]);
  assert.equal(choices.length, 4);
  assert.equal(new Set(choices.map((choice) => choice.direction)).size, 4);
  for (const choice of choices) {
    assert.ok(distanceMetres(madrid, choice.point) > 10 && distanceMetres(madrid, choice.point) <= 40);
    assert.notEqual(lightAt(choice.scene, new Date('2026-06-21T11:00:00Z')), 'unknown');
  }
  assert.deepEqual(nearbyOutdoorScenes(choices[0].scene, [building]), []);
});

test('solar intervals cover the day in labelled samples and empty coverage remains unknown', () => {
  const scene = prepareScene(madrid, [{ footprint: [
    { latitude: 40.4278, longitude: -3.6873 }, { latitude: 40.4278, longitude: -3.6872 },
    { latitude: 40.4279, longitude: -3.6872 }, { latitude: 40.4278, longitude: -3.6873 },
  ], height: 15 }], 250);
  const windows = solarWindows(scene, new Date(2026, 5, 21, 12));
  assert.equal(windows[0].from, 0);
  assert.equal(windows.at(-1).to, 1440);
  assert.ok(windows.every((w, i) => !i || windows[i - 1].to === w.from));
  assert.equal(lightAt(null, atMinutes(new Date(), 720)), 'unknown');
  assert.equal(prepareScene(madrid, []), null);
});

test('phone local time does not silently shift the skipped DST hour', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Madrid';
    const day = new Date(2026, 2, 29, 12);
    assert.deepEqual([atMinutes(day, 90)?.toISOString(), atMinutes(day, 150), atMinutes(day, 210)?.toISOString()],
      ['2026-03-29T00:30:00.000Z', null, '2026-03-29T01:30:00.000Z']);
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

test('time range accepts sun only when every covered sample is sunny', async () => {
  const { sunnyInRange } = await import('../frontend/shared/estimate.mjs');
  const windows = [
    { from: 0, to: 600, state: 'night' },
    { from: 600, to: 720, state: 'sun' },
    { from: 720, to: 750, state: 'unknown' },
    { from: 750, to: 900, state: 'shade' },
    { from: 900, to: 1440, state: 'sun' },
  ];
  assert.equal(sunnyInRange(windows, 610, 700), true);
  assert.equal(sunnyInRange(windows, 719, 721), false);
  assert.equal(sunnyInRange(windows, 720, 720), false);
  assert.equal(sunnyInRange(windows, 1440, 1440), false);
  assert.equal(sunnyInRange(windows, 900, 800), false);
  assert.equal(sunnyInRange([{ from: 600, to: 630, state: 'sun' }, { from: 660, to: 700, state: 'sun' }], 600, 700), false);
});

test('Madrid windows use an explicit timezone and preserve the skipped DST hour', async () => {
  const { civilTimeToUtc } = await import('../frontend/solar.mjs');
  const scene = { point: madrid, radius: 400, buildings: [{ footprint: [[-30,-30],[-20,-30],[-20,-20],[-30,-20]], height: 20 }] };
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/Los_Angeles';
    const windows = solarWindows(scene, '2026-03-29', civilTimeToUtc);
    assert.equal(windows.find((entry) => entry.from <= 150 && entry.to > 150)?.state, 'unknown');
    assert.equal(windows.find((entry) => entry.from <= 90 && entry.to > 90)?.state, 'night');
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

test('range classification refuses gaps, night and unavailable geometry', async () => {
  const { lightForInterval } = await import('../frontend/shared/estimate.mjs');
  const { civilTimeToUtc } = await import('../frontend/solar.mjs');
  const scene = { point: madrid, radius: 400, buildings: [{ footprint: [[-20,-100],[20,-100],[20,-80],[-20,-80]], height: 20 }] };
  assert.equal(lightForInterval(scene, '2026-06-21', 720, 900, civilTimeToUtc), 'sun');
  assert.equal(lightForInterval(scene, '2026-06-21', 720, 1440, civilTimeToUtc), 'shade');
  assert.equal(lightForInterval(null, '2026-06-21', 720, 900, civilTimeToUtc), 'unknown');
  assert.equal(lightForInterval(scene, '2026-06-21', 900, 720, civilTimeToUtc), 'unknown');
  assert.equal(lightForInterval(scene, '2026-03-29', 150, 150, civilTimeToUtc), 'unknown');
});
