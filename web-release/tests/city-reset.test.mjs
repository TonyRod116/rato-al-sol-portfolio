import test from 'node:test';
import assert from 'node:assert/strict';
import { createExplorer } from '../frontend/explore-search.mjs';

test('a late search cannot restore old results after switching cities', async () => {
  class Element {
    constructor() { this.dataset = {}; this.children = []; this.listeners = {}; this.value = ''; this.style = {}; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    replaceChildren(...children) { this.children = children; }
    append(...children) { this.children.push(...children); }
  }
  const nodes = new Map();
  const oldDocument = globalThis.document, oldFetch = globalThis.fetch;
  globalThis.document = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); }, createElement() { return new Element(); }, querySelector() { return null; } };
  let finishFetch;
  globalThis.fetch = () => new Promise((resolve) => { finishFetch = resolve; });
  let pins, point;
  try {
    const explorer = createExplorer({ getCenter: () => ({ latitude: 0, longitude: 0 }), getDate: () => '2026-06-01', getTime: () => 720, onPlaces(value) { pins = value; }, onPoint(value) { point = value; } });
    document.getElementById('place-query').value = 'restaurante';
    nodes.get('place-form').listeners.submit({ preventDefault() {} });
    assert.equal(typeof finishFetch, 'function');
    explorer.reset();
    finishFetch({ ok: true, json: async () => ({ elements: [{ type: 'node', id: 1, lat: 0, lon: 0, tags: { name: 'Restaurante antiguo', amenity: 'restaurant' } }] }) });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(nodes.get('place-query').value, '');
    assert.equal(nodes.get('place-results').children.length, 0);
    assert.match(nodes.get('place-status').textContent, /Buscamos cerca/);
    assert.deepEqual(pins, []);
    assert.equal(point, null);
  } finally { globalThis.document = oldDocument; globalThis.fetch = oldFetch; }
});
