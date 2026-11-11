import test from 'node:test';
import assert from 'node:assert/strict';
import { getMadridTerraces, madridUtmToLatLng } from '../frontend/madrid.mjs';

const terrace = {
  id_terraza: '32', rotulo: 'LOCAL DE PRUEBA', desc_barrio_local: 'RECOLETOS',
  clase_vial_edificio: 'CALLE', desc_vial_edificio: 'AYALA', num_edificio: '000019',
  cal_edificio: null, desc_situacion_local: 'Abierto', desc_situacion_terraza: 'Abierta',
  desc_tipo_acceso_local: 'Puerta Calle', coordenada_x_local: '441830.59', coordenada_y_local: '4475475.52',
};
const response = (records) => ({ ok: true, json: async () => ({ success: true, result: { records } }) });

test('consulta solo la zona seleccionada y presenta una dirección del local, sin inventar mesas', async () => {
  let request;
  const result = await getMadridTerraces(async (url, options) => {
    request = { url: new URL(url), options };
    return response([terrace]);
  });
  assert.equal(result[0].name, 'LOCAL DE PRUEBA');
  assert.equal(result[0].address, 'Calle de Ayala, 19');
  assert.ok(result[0].position.lat > 40.4 && result[0].position.lat < 40.5);
  assert.ok(result[0].position.lng > -3.8 && result[0].position.lng < -3.6);
  assert.equal(request.url.origin, 'https://datos.madrid.es');
  assert.equal(request.url.searchParams.get('resource_id'), '200085-6-censo-locales');
  assert.equal(JSON.parse(request.url.searchParams.get('filters')).desc_vial_edificio, 'AYALA');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.referrerPolicy, 'no-referrer');
});

test('convierte el punto de referencia de Puerta del Sol y rechaza coordenadas incorrectas', () => {
  // Referencia publicada: 440291.28, 4474254.60 en ETRS89/UTM 30N.
  const point = madridUtmToLatLng('440291.28', '4474254.60');
  assert.ok(Math.abs(point.lat - 40.416775) < .0003);
  assert.ok(Math.abs(point.lng - (-3.70379)) < .0003);
  for (const [x, y] of [['', '4474254'], [null, '4474254'], ['0', '0'], ['bad', '4474254'], ['441830', 'Infinity'], ['0x6bdd6', '4474254'], ['441830', '4.475e6']]) {
    assert.equal(madridUtmToLatLng(x, y), null);
  }
});

test('conserva el local sin inventar un punto cuando no existe una entrada geolocalizada', async () => {
  const result = await getMadridTerraces(async () => response([
    { ...terrace, desc_tipo_acceso_local: 'Interior' },
    { ...terrace, id_terraza: '33', coordenada_x_local: null },
  ]));
  assert.deepEqual(result.map((place) => place.position), [null, null]);
});

test('descarta filas inválidas o fuera de la consulta y no oculta un contrato roto como lista vacía', async () => {
  const valid = { ...terrace, rotulo: '<img src=x onerror=alert(1)>' };
  const result = await getMadridTerraces(async () => response([
    valid, { ...terrace, id_terraza: '33', desc_vial_edificio: 'GOYA' },
    { ...terrace, id_terraza: '34', num_edificio: 'no-numero' },
  ]));
  assert.equal(result.length, 1);
  assert.equal(result[0].name, '<img src=x onerror=alert(1)>'); // se mostrará como texto, nunca HTML
  await assert.rejects(() => getMadridTerraces(async () => response([{ unexpected: 'schema' }])));
  await assert.rejects(() => getMadridTerraces(async () => ({ ok: true, json: async () => ({ success: false }) })));
  await assert.rejects(() => getMadridTerraces(async () => ({ ok: false, status: 503 })));
  assert.deepEqual(await getMadridTerraces(async () => response([])), []);
});
