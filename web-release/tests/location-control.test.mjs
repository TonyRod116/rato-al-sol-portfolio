import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLocationControl } from '../frontend/shared/location-control.mjs';

const setup = (geolocation) => {
  const button = { disabled: false }, status = { hidden: true }, positions = [];
  const control = createLocationControl({ button, status, geolocation: () => geolocation,
    onFound: (point) => positions.push(point), showMessage: (node, spanish) => { node.textContent = spanish; } });
  return { button, status, positions, control };
};

test('location is requested only after a tap and centers the map on success', () => {
  let success, options, calls = 0;
  const state = setup({ getCurrentPosition(ok, _fail, opts) { calls++; success = ok; options = opts; } });
  assert.equal(calls, 0);
  state.control.start();
  assert.equal(calls, 1);
  assert.equal(state.button.disabled, true);
  assert.equal(options.enableHighAccuracy, false);
  success({ coords: { latitude: 41.4, longitude: 2.1 } });
  assert.deepEqual(state.positions, [{ lat: 41.4, lng: 2.1 }]);
  assert.equal(state.button.disabled, false);
  assert.match(state.status.textContent, /centrado en tu ubicación/);
});

test('permission denial or unsupported browser leaves a clear manual alternative', () => {
  const unsupported = setup(null);
  unsupported.control.start();
  assert.match(unsupported.status.textContent, /Madrid o Barcelona/);
  assert.equal(unsupported.status.hidden, false);
  let fail;
  const denied = setup({ getCurrentPosition(_ok, reject) { fail = reject; } });
  denied.control.start();
  fail({ code: 1 });
  assert.equal(denied.button.disabled, false);
  assert.match(denied.status.textContent, /Permite la ubicación/);
  assert.match(denied.status.textContent, /Madrid o Barcelona/);
});

test('a late location result cannot override a later city choice', () => {
  let success;
  const state = setup({ getCurrentPosition(ok) { success = ok; } });
  state.control.start();
  state.control.cancel();
  success({ coords: { latitude: 40.4, longitude: -3.7 } });
  assert.deepEqual(state.positions, []);
  assert.equal(state.button.disabled, false);
  assert.equal(state.status.hidden, true);
});

test('invalid location fails safely and limited coverage is explained', () => {
  let success;
  const state = setup({ getCurrentPosition(ok) { success = ok; } });
  state.control.start();
  success({ coords: { latitude: NaN, longitude: 2 } });
  assert.deepEqual(state.positions, []);
  assert.equal(state.button.disabled, false);
  assert.match(state.status.textContent, /No hemos podido obtener/);

  const button = { disabled: false }, status = {};
  const control = createLocationControl({ button, status, geolocation: () => ({ getCurrentPosition(ok) { ok({ coords: { latitude: 37.4, longitude: -5.9 } }); } }),
    onFound: () => false, showMessage: (node, spanish) => { node.textContent = spanish; } });
  control.start();
  assert.match(status.textContent, /Fuera de Madrid y Barcelona/);
});

test('the location button and status appear before city selection and map', () => {
  const html = readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('id="use-location"') < html.indexOf('id="city-select"'));
  assert.ok(html.indexOf('id="location-status"') < html.indexOf('id="city-select"'));
  assert.equal(html.match(/id="use-location"/g).length, 1);
  assert.match(html, /id="location-status"[^>]*role="status"/);
});
