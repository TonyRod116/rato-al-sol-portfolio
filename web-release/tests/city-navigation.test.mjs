import test from 'node:test';
import assert from 'node:assert/strict';
import { createCityMap } from '../frontend/city-map.mjs';
import { createOpenMap } from '../frontend/open-map.mjs';
import { createExplorer } from '../frontend/explore-search.mjs';

test('switching cities then immediately searching uses the chosen city', async () => {
  class Element {
    constructor() { this.dataset = {}; this.children = []; this.listeners = {}; this.value = ''; this.style = {}; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    replaceChildren(...children) { this.children = children; }
    append(...children) { this.children.push(...children); }
    setAttribute() {}
  }
  const nodes = new Map(), requests = [];
  const oldDocument = globalThis.document, oldWindow = globalThis.window, oldFetch = globalThis.fetch;
  let current;
  class FakeMap {
    constructor({ center }) { this.center = { lat: center[1], lng: center[0] }; this.events = {}; }
    addControl() {}
    on(name, callback) { this.events[name] = callback; }
    once(name, callback) { if (name === 'load' || name === 'idle') queueMicrotask(callback); }
    querySourceFeatures() { return [{}]; }
    getLayer() { return null; }
    addSource() {}
    addLayer() {}
    getBounds() { return { getWest: () => this.center.lng - .01, getEast: () => this.center.lng + .01, getSouth: () => this.center.lat - .01, getNorth: () => this.center.lat + .01 }; }
    getBearing() { return 0; }
    getPitch() { return 0; }
    getZoom() { return 17; }
    getCenter() { return this.center; }
    easeTo(options) { this.pendingAnimation = options; }
    jumpTo({ center }) { this.pendingAnimation = null; this.center = { lat: center[1], lng: center[0] }; this.events.moveend(); }
    remove() {}
  }
  globalThis.document = {
    head: { append(resource) { queueMicrotask(() => resource.onload()); } },
    createElement() { return new Element(); },
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); },
    querySelector() { return null; },
  };
  globalThis.window = { maplibregl: { Map: FakeMap, NavigationControl: class {} }, matchMedia: () => ({ matches: false }) };
  globalThis.fetch = async (url, options = {}) => {
    if (options.body) requests.push(decodeURIComponent(options.body));
    return { ok: true, json: async () => ({ elements: [], success: true, result: { resources: [] } }) };
  };
  try {
    const map = await createCityMap(new Element(), (view) => { current = view.center; });
    const explorer = createExplorer({
      getCenter: () => ({ latitude: current.lat, longitude: current.lng }),
      getDate: () => '2026-06-01', getTime: () => 720, onPlaces() {}, onPoint() {},
    });
    const barcelona = { lat: 41.3851, lng: 2.1734 };
    const submit = () => nodes.get('place-form').listeners.submit({ preventDefault() {} });
    const latestOverpass = () => requests.findLast((body) => body.includes('around:5000'));
    document.getElementById('place-query').value = 'Sagrada Familia';
    map.focus(barcelona); // The former animated city change has not finished.
    submit();
    assert.match(requests[0], /40\.41678/); // Reproduces the old Madrid search.
    explorer.reset();
    map.jumpTo(barcelona);
    document.getElementById('place-query').value = 'Sagrada Familia';
    submit();
    assert.match(latestOverpass(), /41\.3851/);
    assert.match(latestOverpass(), /2\.1734/);
    assert.equal(current.lat, barcelona.lat);
    assert.equal(current.lng, barcelona.lng);
    explorer.reset();
    map.jumpTo({ lat: 40.4168, lng: -3.7038 });
    document.getElementById('place-query').value = 'Gran Via';
    submit();
    assert.match(latestOverpass(), /40\.4168/);
    assert.match(latestOverpass(), /-3\.7038/);
    assert.equal(current.lat, 40.4168);
    assert.equal(current.lng, -3.7038);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 25));
    globalThis.document = oldDocument; globalThis.window = oldWindow; globalThis.fetch = oldFetch;
  }
});

test('the 2D fallback switches city without an animation', async () => {
  const oldDocument = globalThis.document, oldWindow = globalThis.window;
  let current, nativeMap;
  class FakeMap {
    constructor() { this.center = { lat: 0, lng: 0 }; this.events = {}; this.attributionControl = { setPrefix() {} }; }
    setView([lat, lng], zoom, options) {
      this.lastOptions = options;
      this.center = { lat, lng };
      this.events.moveend?.();
      return this;
    }
    getCenter() { return this.center; }
    getZoom() { return 17; }
    getBounds() { return { getWest: () => this.center.lng - .01, getEast: () => this.center.lng + .01, getSouth: () => this.center.lat - .01, getNorth: () => this.center.lat + .01, pad() { return this; } }; }
    on(name, callback) { this.events[name] = callback; }
  }
  const tiles = { handlers: {}, on(name, callback) { this.handlers[name] = callback; return this; }, addTo() { queueMicrotask(() => this.handlers.tileload()); return this; } };
  const L = {
    map() { nativeMap = new FakeMap(); return nativeMap; },
    control: { zoom: () => ({ addTo() {} }) },
    tileLayer: () => tiles,
    imageOverlay: () => ({ addTo() { return this; } }),
  };
  globalThis.document = { createElement: () => ({}), head: { append(resource) { queueMicrotask(() => resource.onload()); } } };
  globalThis.window = { L };
  try {
    const map = await createOpenMap({}, () => {}, (view) => { current = view.center; });
    map.jumpTo({ lat: 41.3851, lng: 2.1734 });
    assert.deepEqual(current, { lat: 41.3851, lng: 2.1734 });
    assert.deepEqual(nativeMap.lastOptions, { animate: false });
  } finally { globalThis.document = oldDocument; globalThis.window = oldWindow; }
});
