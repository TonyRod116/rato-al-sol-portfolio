import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingShadows, shadowDirection } from '../frontend/map-shadows.mjs';
import { getMadridBuildings, insideAyala } from '../frontend/madrid-buildings.mjs';
import { getViewportBuildings, viewportBounds } from '../frontend/viewport-buildings.mjs';

const square = [[-3.688, 40.427], [-3.6879, 40.427], [-3.6879, 40.4271], [-3.688, 40.4271], [-3.688, 40.427]];
const hole = [[-3.68798, 40.42702], [-3.68798, 40.42708], [-3.68792, 40.42708], [-3.68792, 40.42702], [-3.68798, 40.42702]];
const raw = { type: 'Feature', properties: { ALTURA: 10 }, geometry: { type: 'Polygon', coordinates: [square, hole] } };
const response = (data) => async () => ({ ok: true, json: async () => data });

test('Madrid building input is bounded, validated and never invents missing heights', async () => {
  let requested;
  const buildings = await getMadridBuildings(async (url, options) => {
    requested = [url, options];
    return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [raw, { ...raw, properties: { ALTURA: null } }] }) };
  });
  assert.equal(buildings.features.length, 1);
  assert.equal(buildings.omitted, 1);
  assert.equal(new URLSearchParams(requested[1].body).get('geometry'), '-3.692,40.425,-3.685,40.429');
  assert.equal(requested[1].method, 'POST');
  assert.ok(!String(requested[0]).includes('40.425'));
  assert.equal(requested[1].credentials, 'omit');
  assert.ok(insideAyala({ lng: -3.688, lat: 40.427 }));
  assert.ok(!insideAyala({ lng: -3.7, lat: 40.427 }));
  await assert.rejects(getMadridBuildings(response({ type: 'FeatureCollection', features: [raw], exceededTransferLimit: true })));
  await assert.rejects(getMadridBuildings(response({ type: 'FeatureCollection', features: [] })));
  await assert.rejects(getMadridBuildings(response({ type: 'FeatureCollection', features: Array(2000).fill(raw) })));
  await assert.rejects(getMadridBuildings(response({ type: 'FeatureCollection', features: [{ ...raw, geometry: { type: 'Polygon', coordinates: [square.slice(0, -1)] } }] })));
});

test('building queries follow a different viewport and split a truncated municipal response', async () => {
  const bounds = [-3.704, 40.418, -3.698, 40.422];
  const polygon = [[-3.702, 40.419], [-3.7019, 40.419], [-3.7019, 40.4191], [-3.702, 40.4191], [-3.702, 40.419]];
  const feature = { type: 'Feature', properties: { ALTURA: 12, OBJECTID: 7 }, geometry: { type: 'Polygon', coordinates: [polygon] } };
  let calls = 0;
  const result = await getMadridBuildings(async (_url, options) => {
    calls++;
    assert.equal(options.method, 'POST');
    return { ok: true, json: async () => calls === 1 ? { type: 'FeatureCollection', features: [], exceededTransferLimit: true } : { type: 'FeatureCollection', features: [feature] } };
  }, bounds);
  assert.equal(calls, 3);
  assert.equal(result.features.length, 1, 'overlapping returned buildings are not drawn twice');
  assert.deepEqual(result.bounds, bounds);
});

test('a viewport outside Madrid uses nearby OpenStreetMap geometry and keeps missing heights out of drawn shadows', async () => {
  const geometry = [
    { lat: 40.7002, lon: -74.0010 }, { lat: 40.7002, lon: -74.0009 },
    { lat: 40.7003, lon: -74.0009 }, { lat: 40.7002, lon: -74.0010 },
  ];
  let request;
  const fetch = async (url, options) => {
    request = { url, ...options };
    return { ok: true, json: async () => ({ elements: [
      { type: 'way', id: 1, geometry, tags: { height: '12' } },
      { type: 'way', id: 2, geometry, tags: {} },
    ] }) };
  };
  const result = await getViewportBuildings([-74.0012, 40.7001, -74.0004, 40.7007], fetch);
  assert.equal(result.source, 'osm');
  assert.equal(result.features.length, 1);
  assert.equal(result.features[0].properties.height, 12);
  assert.equal(result.omitted, 1);
  assert.equal(request.method, 'POST');
  assert.deepEqual(viewportBounds([-74.0012, 40.7001, -74.0004, 40.7007]), [-74.002, 40.7, -74, 40.701]);
  await assert.rejects(() => getViewportBuildings([-74.1, 40.7, -73.9, 40.9], fetch), /Acerca el mapa/);
});

test('a 10 m building at 45° casts a 10 m shadow opposite the sun, including courtyard edges', async () => {
  const buildings = await getMadridBuildings(response({ type: 'FeatureCollection', features: [raw] }));
  const north = buildingShadows(buildings, { altitude: 45, azimuth: 180 });
  const shapes = north.features[0].geometry.coordinates;
  const roof = shapes[0];
  assert.equal(roof.length, 2, 'roof retains its courtyard');
  assert.ok(shapes.length > 1 && shapes.length < 9, 'sweeps only the useful outer and courtyard edges');
  assert.ok(Math.abs((roof[0][0][1] - square[0][1]) * 111319.49079327358 - 10) < .001);
  assert.ok(Math.abs(roof[0][0][0] - square[0][0]) < 1e-10);
  const west = buildingShadows(buildings, { altitude: 45, azimuth: 90 }).features[0].geometry.coordinates[0][0][0];
  assert.ok(west[0] < square[0][0]);
  assert.deepEqual(shadowDirection({ altitude: 45, azimuth: 180 }), { bearing: 0, label: 'norte' });
  assert.deepEqual(shadowDirection({ altitude: 45, azimuth: 90 }), { bearing: 270, label: 'oeste' });
});

test('no shadow is drawn or direction claimed near or below the horizon', async () => {
  const buildings = await getMadridBuildings(response({ type: 'FeatureCollection', features: [raw] }));
  for (const altitude of [-15, 0, 4.9]) {
    assert.equal(buildingShadows(buildings, { altitude, azimuth: 180 }).features.length, 0);
    assert.equal(shadowDirection({ altitude, azimuth: 180 }), null);
  }
});

test('viewport filtering keeps a shadow cast into view by an off-screen building', async () => {
  const buildings = await getMadridBuildings(response({ type: 'FeatureCollection', features: [raw] }));
  const sun = { altitude: 45, azimuth: 90 };
  const reachesView = [-3.68815, 40.427, -3.68803, 40.4271];
  const farAway = [-3.689, 40.427, -3.6889, 40.4271];
  assert.deepEqual(buildingShadows(buildings, sun, reachesView), buildingShadows(buildings, sun));
  assert.equal(buildingShadows(buildings, sun, farAway).features.length, 0);
});

test('shadows cover more than 45 buildings across the view', () => {
  const features = Array.from({ length: 100 }, (_, i) => {
    const dx = (i % 10) * .0002, dy = Math.floor(i / 10) * .00015;
    return { type: 'Feature', properties: { height: 12 }, geometry: { type: 'Polygon', coordinates: [square.map(([x, y]) => [x + dx, y + dy])] } };
  });
  const shadows = buildingShadows({ type: 'FeatureCollection', features }, { altitude: 45, azimuth: 180 }, [-3.689, 40.426, -3.685, 40.431]);
  assert.equal(shadows.features.length, 100);
});
