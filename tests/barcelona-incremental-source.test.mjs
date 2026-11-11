import test from 'node:test';
import assert from 'node:assert/strict';
import { getViewportBuildings } from '../frontend/viewport-buildings.mjs';

const strip = [2.1601, 41.3901, 2.1605, 41.391];
const geometry = [
  { lat: 41.3902, lon: 2.1602 }, { lat: 41.3902, lon: 2.1603 },
  { lat: 41.3903, lon: 2.1603 }, { lat: 41.3902, lon: 2.1602 },
];
const reply = (elements) => async () => ({ ok: true, json: async () => ({ elements }) });

test('a truly empty Barcelona strip is accepted only for incremental coverage', async () => {
  const result = await getViewportBuildings(strip, reply([]), { allowEmpty: true });
  assert.equal(result.source, 'osm');
  assert.deepEqual(result.bounds, strip);
  assert.deepEqual(result.features, []);
  assert.equal(result.omitted, 0);
  await assert.rejects(getViewportBuildings(strip, reply([])));
});

test('an incremental strip with unknown heights preserves its uncertainty', async () => {
  const result = await getViewportBuildings(strip, reply([
    { type: 'way', id: 12, geometry, tags: {} },
    { type: 'way', id: 13, geometry, tags: {} },
  ]), { allowEmpty: true });
  assert.deepEqual(result.features, []);
  assert.equal(result.omitted, 2);
  await assert.rejects(getViewportBuildings(strip, reply([{ type: 'way', id: 12, geometry, tags: {} }])), /alturas/);
});

test('provider failures and incomplete identities are never treated as empty coverage', async () => {
  await assert.rejects(getViewportBuildings(strip, async () => ({ ok: false, status: 503 }), { allowEmpty: true }));
  await assert.rejects(getViewportBuildings(strip, reply([{ type: 'way', geometry, tags: {} }]), { allowEmpty: true }), /incompleta/);
  await assert.rejects(getViewportBuildings(strip, async () => ({ ok: true, json: async () => ({ elements: [], remark: 'timed out' }) }), { allowEmpty: true }));
});
