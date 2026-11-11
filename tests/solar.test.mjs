import test from 'node:test';
import assert from 'node:assert/strict';
import { civilTimeToUtc, sunPosition, classifyLight, shadowOffset, shadowPolygons } from '../frontend/solar.mjs';
import { initialSelectedTime } from '../frontend/shared/time-selection.mjs';

test('la hora inicial usa un extremo si se abre fuera del rango seleccionable', () => {
  assert.equal(initialSelectedTime(3 * 60 + 25, 10), 6 * 60);
  assert.equal(initialSelectedTime(12 * 60 + 37, 10), 12 * 60 + 30);
  assert.equal(initialSelectedTime(12 * 60 + 37, 15), 12 * 60 + 30);
  assert.equal(initialSelectedTime(23 * 60 + 45, 15), 23 * 60);
});

test('posición solar: caso de referencia independiente del laboratorio NLR', () => {
  // SPA tester del NLR y valores esperados publicados por pvlib para ese caso:
  // https://midcdmz.nlr.gov/spa/spa_tester.c
  // https://github.com/pvlib/pvlib-python/blob/main/tests/test_solarposition.py
  // La tolerancia de 0,1° admite distintas aproximaciones y atmósferas.
  const sun = sunPosition(new Date('2003-10-17T19:30:30Z'), 39.742476, -105.1786);
  assert.ok(Math.abs(sun.azimuth - 194.340241) < 0.1);
  assert.ok(Math.abs(sun.altitude - 39.888378) < 0.1);
});

test('la hora de Madrid respeta ambos cambios de horario', () => {
  assert.equal(civilTimeToUtc('2026-03-29', 600).toISOString(), '2026-03-29T08:00:00.000Z');
  assert.equal(civilTimeToUtc('2026-10-25', 600).toISOString(), '2026-10-25T09:00:00.000Z');
  assert.equal(civilTimeToUtc('2026-02-30', 600), null);
  assert.equal(civilTimeToUtc('2026-03-29', 90).toISOString(), '2026-03-29T00:30:00.000Z');
  assert.equal(civilTimeToUtc('2026-03-29', 150), null, 'la hora saltada no existe');
  assert.equal(civilTimeToUtc('2026-10-25', 150).toISOString(), '2026-10-25T00:30:00.000Z', 'la hora repetida usa la primera');
  assert.equal(civilTimeToUtc('2026-07-01', 0).toISOString(), '2026-06-30T22:00:00.000Z');
  assert.equal(civilTimeToUtc('2026-07-01', 1430).toISOString(), '2026-07-01T21:50:00.000Z');
  assert.equal(civilTimeToUtc('1900-01-01', 600), null);
  assert.equal(sunPosition(new Date('invalid'), 40.4, -3.7), null);
});

test('un edificio al este proyecta sombra hacia el oeste con sol bajo', () => {
  // Fachada a 10 m al este y altura de 10 m: el rayo de 45° la toca;
  // el de 60° pasa por encima de la cubierta.
  const buildings = [{ footprint: [[10, -5], [20, -5], [20, 5], [10, 5]], height: 10 }];
  const input = { point: [0, 0], buildings, coverage: true };
  assert.equal(classifyLight({ ...input, sun: { altitude: 45, azimuth: 90 } }), 'shade');
  assert.equal(classifyLight({ ...input, sun: { altitude: 60, azimuth: 90 } }), 'sun');
  assert.equal(classifyLight({ ...input, sun: { altitude: 45, azimuth: 270 } }), 'sun');
});

test('la orientación norte y los polígonos cerrados funcionan de forma coherente', () => {
  const building = { footprint: [[-5, -20], [5, -20], [5, -10], [-5, -10], [-5, -20]], height: 10 };
  const input = { point: [0, 0], buildings: [building], coverage: true };
  assert.equal(classifyLight({ ...input, sun: { altitude: 30, azimuth: 0 } }), 'shade');
  assert.equal(classifyLight({ ...input, sun: { altitude: 30, azimuth: 180 } }), 'sun');
  assert.equal(classifyLight({ ...input, buildings: [{ ...building, footprint: [[0, 1], [0, 2], [0, 3]] }], sun: { altitude: 30, azimuth: 180 } }), 'unknown');
});

test('la noche, el horizonte bajo y la geometría incompleta son estados distintos', () => {
  const sun = { altitude: 30, azimuth: 180 };
  const building = { footprint: [[-5, 10], [5, 10], [5, 20], [-5, 20]], height: 10 };
  const input = { point: [0, 0], buildings: [building], coverage: true, sun };
  assert.equal(classifyLight({ ...input, sun: { ...sun, altitude: -5 } }), 'night');
  assert.equal(classifyLight({ ...input, sun: { ...sun, altitude: 2 } }), 'unknown');
  assert.equal(classifyLight({ ...input, point: null }), 'unknown');
  assert.equal(classifyLight({ ...input, coverage: false }), 'unknown');
  assert.equal(classifyLight({ ...input, buildings: [{ ...building, height: null }] }), 'unknown');
  assert.equal(classifyLight({ ...input, point: [0, 15] }), 'unknown');
  assert.equal(classifyLight({ ...input, sun: { altitude: NaN, azimuth: 180 } }), 'unknown');
});

test('la sombra dibujada se proyecta lejos del sol y coincide con el cálculo de luz', () => {
  const east = { altitude: 45, azimuth: 90 };
  const offset = shadowOffset(east, 10);
  assert.ok(Math.abs(offset[0] + 10) < 1e-8);
  assert.ok(Math.abs(offset[1]) < 1e-8);
  const north = shadowOffset({ altitude: 45, azimuth: 0 }, 10);
  assert.ok(Math.abs(north[0]) < 1e-8);
  assert.ok(Math.abs(north[1] - 10) < 1e-8);
  const building = { footprint: [[10, -5], [20, -5], [20, 5], [10, 5]], height: 10 };
  assert.equal(classifyLight({ sun: east, point: [5, 0], buildings: [building], coverage: true }), 'shade');
  assert.equal(classifyLight({ sun: east, point: [-5, 0], buildings: [building], coverage: true }), 'sun');
  const shadow = shadowPolygons(east, building);
  // La cubierta desplazada cubre x=0…10 e y=-5…5 para este caso analítico.
  assert.ok(Math.abs(shadow[0][0][0]) < 1e-8);
  assert.ok(Math.abs(shadow[0][1][0] - 10) < 1e-8);
  assert.deepEqual(shadow[0].map((point) => Math.round(point[1])), [-5, -5, 5, 5]);
  assert.equal(shadow.length, 5);
  assert.deepEqual(shadowPolygons({ altitude: -5, azimuth: 90 }, building), []);
  assert.equal(shadowOffset({ altitude: 2, azimuth: 90 }, 10), null);
  assert.equal(shadowOffset({ altitude: -5, azimuth: 90 }, 10), null);
  assert.equal(shadowOffset({ altitude: 45, azimuth: 361 }, 10), null);
});
