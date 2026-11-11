import test from 'node:test';
import assert from 'node:assert/strict';
import { getMadridBuildings } from '../frontend/madrid-buildings.mjs';
import { mapLoadError } from '../mobile/src/map-load-error.mjs';
import { createViewportLoader } from '../mobile/src/viewport.mjs';
import { getViewportBuildings } from '../frontend/viewport-buildings.mjs';

const bounds = [-3.706, 40.415, -3.702, 40.418];
const reason = (code) => (error) => error.code === code;

test('Madrid labels HTTP, malformed and connection failures without exposing details', async () => {
  await assert.rejects(getMadridBuildings(async () => ({ ok: false, status: 429 }), bounds), reason('service'));
  await assert.rejects(getMadridBuildings(async () => ({ ok: true, json: async () => ({ features: null }) }), bounds), reason('incomplete'));
  await assert.rejects(getMadridBuildings(async () => ({ ok: true, json: async () => { throw new SyntaxError('private details'); } }), bounds), reason('incomplete'));
  await assert.rejects(getMadridBuildings(async () => ({ ok: true, json: async () => { throw new TypeError('response interrupted'); } }), bounds), reason('network'));
  await assert.rejects(getMadridBuildings(async () => { throw new TypeError('private details'); }, bounds), reason('network'));
  for (const code of ['service', 'incomplete', 'network', 'timeout']) {
    const message = mapLoadError({ code });
    assert.ok(message.es.includes('Toca para reintentar.'));
    assert.ok(message.en.includes('Tap to retry.'));
    assert.ok(!JSON.stringify(message).includes('private details'));
  }
  assert.match(mapLoadError({ code: 'network' }).es, /conectar/);
  assert.match(mapLoadError({ code: 'timeout' }).es, /tardó demasiado/);
  assert.match(mapLoadError({ code: 'service' }).es, /fuente/);
  assert.match(mapLoadError({ code: 'incomplete' }).es, /incompletos/);
  assert.match(mapLoadError(new Error('unknown')).es, /No se han podido cargar/);
});

test('a timed out request is reported as timeout rather than a network failure', async () => {
  const realSetTimeout = globalThis.setTimeout;
  try {
    globalThis.setTimeout = (callback, delay, ...args) => realSetTimeout(callback, delay === 20000 ? 0 : delay, ...args);
    const stalled = (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    await assert.rejects(getMadridBuildings(stalled, bounds), reason('timeout'));
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});

test('a failed Madrid strip preserves the cause and never marks incomplete coverage as complete', async () => {
  const base = [-3.706, 40.414, -3.702, 40.418];
  const moved = [-3.705, 40.414, -3.701, 40.418];
  const request = async () => ({ ok: false, status: 429 });
  const loader = createViewportLoader((area, _fetch, options) => getViewportBuildings(area, request, options));
  loader.prime({ type: 'FeatureCollection', source: 'madrid', bounds: base, features: [], omitted: 0 });
  await assert.rejects(loader.get(moved), reason('service'));
  assert.equal(loader.find(moved), null);
  assert.match(mapLoadError({ code: 'service' }).es, /no está disponible/);
});
