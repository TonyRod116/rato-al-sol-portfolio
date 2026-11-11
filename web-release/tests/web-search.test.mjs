import test from 'node:test';
import assert from 'node:assert/strict';
import { createExplorer } from '../frontend/explore-search.mjs';

// Exercise the actual form handlers with a partial provider outage and a municipal catalogue.
test('Barcelona web falls back to municipal results and reports incomplete searches', async () => {
  class Element {
    constructor() { this.dataset = {}; this.children = []; this.listeners = {}; this.value = ''; this.valueAsNumber = 0; this.checked = false; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    replaceChildren(...children) { this.children = children; }
    append(...children) { this.children.push(...children); }
  }
  const nodes = new Map();
  const doc = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); }, createElement() { return new Element(); }, querySelector() { return null; } };
  const oldDocument = globalThis.document, oldFetch = globalThis.fetch;
  const center = { latitude: 41.39172, longitude: 2.16495 };
  globalThis.document = doc;
  globalThis.fetch = async (url) => {
    if (String(url).includes('ovp.dresel.systems')) return { ok: false, status: 503 };
    if (String(url).includes('package_show')) return { ok: true, json: async () => ({ success: true, result: { resources: [{ id: '11111111-1111-1111-1111-111111111111', name: '2026_1S_terrasses', format: 'CSV' }] } }) };
    if (String(url).includes('datastore_search')) return { ok: true, json: async () => ({ success: true, result: { total: 1, records: [{ _id: 1, EMPLACAMENT: 'Carrer de prova', LATITUD: center.latitude, LONGITUD: center.longitude }] } }) };
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    createExplorer({ getCenter: () => center, getDate: () => '2026-06-01', getTime: () => 750, onPlaces() {}, onPoint() {} });
    const submit = () => nodes.get('place-form').listeners.submit({ preventDefault() {} });
    const until = async predicate => { for (let n = 0; n < 50 && !predicate(); n++) await new Promise(resolve => setTimeout(resolve, 5)); assert.ok(predicate(), 'Timed out waiting for status'); };
    doc.getElementById('place-query').value = 'restaurante';
    submit();
    await until(() => nodes.get('place-status').textContent?.includes('incompleta'));
    assert.equal(nodes.get('place-results').children.length, 1);
    assert.match(nodes.get('place-status').textContent, /1 lugar/);
    doc.getElementById('place-query').value = 'nombre imposible';
    submit();
    await until(() => nodes.get('place-status').textContent?.includes('No hemos encontrado coincidencias'));
    assert.match(nodes.get('place-status').textContent, /búsqueda está incompleta/);
    doc.getElementById('nearby-radius').valueAsNumber = 1000;
    doc.getElementById('nearby-start').valueAsNumber = 750;
    doc.getElementById('nearby-end').valueAsNumber = 750;
    nodes.get('nearby-form').listeners.submit({ preventDefault() {} });
    await until(() => nodes.get('nearby-status').textContent?.includes('resultados pueden estar incompletos'));
    assert.ok(nodes.get('nearby-results').children.length > 0);
  } finally { globalThis.document = oldDocument; globalThis.fetch = oldFetch; }
});
