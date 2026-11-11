import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { createShadowBitmap, createShadowPng } from '../mobile/src/shadow-raster-cpu.mjs';

const ring = (west, south, east, north) => [[west, south], [east, south], [east, north], [west, north], [west, south]];
const feature = (rings) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: rings }, properties: {} });
function finish(builder, step = 8) { while (!builder.step(step)) {} return builder.result(); }
function pixel(bitmap, longitude, latitude) {
  const mercator = (lat) => (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2;
  const x = Math.floor(longitude / 10 * bitmap.width), y = Math.floor((mercator(latitude) - mercator(10)) / (mercator(0) - mercator(10)) * bitmap.height);
  return bitmap.pixels[y * bitmap.width + x];
}
test('unions overlap once, retains courtyards and removes roofs', () => {
  const collection = { features: [feature([ring(1, 1, 7, 9), ring(2, 3, 4, 7)]), feature([ring(5, 2, 9, 8)])], roofs: [feature([ring(6, 4, 8, 6), ring(6.5, 4.5, 7.5, 5.5)])] };
  const bitmap = finish(createShadowBitmap(collection, [0, 0, 10, 10], 256));
  assert.equal(pixel(bitmap, 3, 5), 0, 'courtyard');
  assert.equal(pixel(bitmap, 5.5, 5), 1, 'overlapping shadows');
  assert.equal(pixel(bitmap, 6.2, 5), 0, 'roof removed');
  assert.equal(pixel(bitmap, 7, 5), 1, 'courtyard of a roof remains shaded');
  assert.equal(pixel(bitmap, .5, .5), 0, 'outside');
});
test('PNG is decodable across DEFLATE block boundaries with correct opacity', () => {
  const pixels = new Uint8Array(256 * 256); pixels[0] = 1; pixels[255 * 256 + 255] = 1;
  const encoded = finish(createShadowPng({ width: 256, height: 256, pixels }), 47);
  const png = Buffer.from(encoded, 'base64');
  assert.deepEqual([...png.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  assert.equal(png.readUInt32BE(16), 256); assert.equal(png.readUInt32BE(20), 256);
  const n = png.readUInt32BE(33), raw = inflateSync(png.subarray(41, 41 + n));
  assert.equal(raw.length, 256 * (1 + 256 * 4));
  assert.deepEqual([...raw.subarray(1, 5)], [48, 67, 73, 66]);
  assert.equal(raw[8], 0); assert.equal(raw.at(-1), 66);
});
test('2x supersampling gives partially transparent edges', () => {
  const pixels = Uint8Array.from([1, 0, 0, 0]);
  const png = Buffer.from(finish(createShadowPng({ width: 2, height: 2, pixels }, [48, 67, 73, 66], 2)), 'base64');
  const n = png.readUInt32BE(33), raw = inflateSync(png.subarray(41, 41 + n));
  assert.equal(png.readUInt32BE(16), 1); assert.equal(png.readUInt32BE(20), 1);
  assert.deepEqual([...raw], [0, 48, 67, 73, 17]);
});
test('clipping preserves a polygon crossing the viewport and multiple holes', () => {
  const large = feature([ring(-5, -5, 15, 15), ring(1, 1, 3, 3), ring(7, 7, 9, 9)]);
  const overlap = feature([ring(2, 2, 8, 8)]);
  const roof = feature([ring(-2, 4, 2, 6)]);
  const bitmap = finish(createShadowBitmap({ features: [large, overlap], roofs: [roof] }, [0, 0, 10, 10], 256));
  assert.equal(pixel(bitmap, 1.5, 1.5), 0);
  assert.equal(pixel(bitmap, 2.5, 2.5), 1, 'another shadow fills a courtyard');
  assert.equal(pixel(bitmap, 8.5, 8.5), 0, 'second courtyard');
  assert.equal(pixel(bitmap, 1, 5), 0, 'roof is clipped to the view');
  assert.equal(pixel(bitmap, 3, 5), 1);
  assert.equal(pixel(bitmap, 9.5, 9.5), 1, 'building exterior clips against viewport');
});
test('outside polygons do not prevent yielding while scanning', () => {
  const outside = Array.from({ length: 100 }, () => feature([ring(20, 20, 21, 21)]));
  const builder = createShadowBitmap({ features: [...outside, feature([ring(1, 1, 9, 9)])] }, [0, 0, 10, 10], 256);
  assert.equal(builder.step(1), false);
  assert.throws(() => builder.result(), /incomplete/);
  assert.equal(pixel(finish(builder), 5, 5), 1);
});
test('overlapping roofs still erase another roof courtyard', () => {
  const ground = feature([ring(0, 0, 10, 10)]);
  const roof = feature([ring(2, 2, 8, 8), ring(3, 3, 7, 7)]);
  const second = feature([ring(5, 4, 9, 6)]);
  const bitmap = finish(createShadowBitmap({ features: [ground], roofs: [roof, second] }, [0, 0, 10, 10], 256));
  assert.equal(pixel(bitmap, 4, 5), 1, 'open roof courtyard');
  assert.equal(pixel(bitmap, 6, 5), 0, 'second roof covers courtyard');
  assert.equal(pixel(bitmap, 1, 1), 1);
});
