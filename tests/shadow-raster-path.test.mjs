import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceShadowRasterPath, createShadowRasterPath } from '../mobile/src/shadow-raster-path.mjs';

const rectangle = (x1, y1, x2, y2) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]];
const feature = (coordinates) => ({ geometry: { type: 'Polygon', coordinates } });
const bounds = [-1, -1, 1, 1];
function finish(features) {
  const builder = createShadowRasterPath({ features }, bounds);
  while (!builder.step(2)) {};
  return builder.result();
}
function windingAt(result, longitude, latitude) {
  const mercator = (lat) => (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2;
  const x = (longitude + 1) / 2 * result.width;
  const y = (mercator(latitude) - mercator(1)) / (mercator(-1) - mercator(1)) * result.height;
  let winding = 0;
  for (const subpath of result.d.match(/M[^M]+?Z/g) || []) {
    const ring = subpath.slice(1, -1).split('L').map((point) => point.split(',').map(Number));
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const cross = (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]);
      if (a[1] <= y && b[1] > y && cross > 0) winding++;
      if (a[1] > y && b[1] <= y && cross < 0) winding--;
    }
  }
  return winding;
}

test('one nonzero-fill path covers overlap once and preserves an uncovered courtyard', () => {
  const outer = rectangle(-.8, -.8, .5, .8).reverse();
  const hole = rectangle(-.4, -.4, .2, .4).reverse();
  const overlap = rectangle(-.1, -.5, .8, .5);
  const result = finish([feature([outer, hole]), feature([overlap])]);
  assert.notEqual(windingAt(result, -.6, 0), 0, 'outer area is painted');
  assert.equal(windingAt(result, -.3, 0), 0, 'uncovered courtyard remains open');
  assert.notEqual(windingAt(result, .1, 0), 0, 'another shadow covers a courtyard');
  assert.notEqual(windingAt(result, .4, .6), 0, 'building shadow remains painted');
  assert.equal(windingAt(result, .9, 0), 0, 'outside stays clear');
  assert.deepEqual(result.bounds, [[1, 1], [-1, -1]]);
  for (const subpath of result.d.match(/M[^M]+?Z/g)) {
    const points = subpath.slice(1, -1).split('L');
    assert.notEqual(points[0], points[points.length - 1], 'Z closes each ring without a duplicate point');
  }
});

test('a smaller retina mask retains shadows, overlap and an uncovered courtyard', () => {
  const shapes = [feature([rectangle(-.8, -.8, .5, .8), rectangle(-.4, -.4, .2, .4)]),
    feature([rectangle(-.1, -.5, .8, .5)])];
  const builder = createShadowRasterPath({ features: shapes }, bounds, { longestSide: 256 });
  while (!builder.step(10)) {}
  const image = builder.result();
  assert.equal(Math.max(image.width, image.height), 256);
  assert.notEqual(windingAt(image, -.6, 0), 0);
  assert.equal(windingAt(image, -.3, 0), 0);
  assert.notEqual(windingAt(image, .1, 0), 0);
  assert.equal(windingAt(image, .9, 0), 0);
});

test('work is incremental and oversized or invalid geometry is rejected', () => {
  const geometry = feature([rectangle(-.5, -.5, .5, .5)]);
  const builder = createShadowRasterPath({ features: [geometry, geometry] }, bounds, { maxVertices: 9 });
  assert.equal(builder.step(1), false);
  assert.throws(() => builder.step(1), /too large/);
  assert.throws(() => createShadowRasterPath({ features: [] }, [1, 1, -1, -1]), /bounds/);
});

test('time-budgeted batches keep identical geometry and yield to other work', () => {
  const features = Array.from({ length: 2000 }, (_, i) => {
    const x = -.9 + (i % 40) * .04, y = -.9 + Math.floor(i / 40) * .035;
    return feature([rectangle(x, y, x + .03, y + .025)]);
  });
  const baseline = finish(features);
  const builder = createShadowRasterPath({ features }, bounds);
  let simulatedTime = 0, turns = 0;
  // One millisecond elapses after each small batch; the calculation must
  // regularly give the event loop an opportunity to handle gestures.
  while (!advanceShadowRasterPath(builder, () => simulatedTime++)) turns++;
  assert.ok(turns > 1);
  assert.deepEqual(builder.result(), baseline);
});

test('a fast clock cannot produce an unbounded batch', () => {
  let calls = 0;
  assert.equal(advanceShadowRasterPath({ step() { calls++; return false; } }, () => 0), false);
  assert.equal(calls, 80);
});

test('the separate rooftop mask covers overlapping roofs and preserves open courtyards', () => {
  const shadow = feature([rectangle(-.9, -.9, .9, .9)]);
  const firstRoof = feature([rectangle(-.8, -.8, .5, .8), rectangle(-.4, -.4, .2, .4)]);
  const secondRoof = feature([rectangle(-.1, -.5, .8, .5)]);
  const builder = createShadowRasterPath({ features: [shadow], roofs: [firstRoof, secondRoof] }, bounds);
  while (!builder.step(2)) {}
  const result = builder.result(), roofs = { ...result, d: result.roofD };
  assert.notEqual(windingAt(roofs, -.6, 0), 0, 'roof is masked');
  assert.equal(windingAt(roofs, -.3, 0), 0, 'courtyard remains open');
  assert.notEqual(windingAt(roofs, .1, 0), 0, 'other roof masks its overlap with the courtyard');
  assert.notEqual(windingAt(roofs, .4, .1), 0, 'overlapping roofs remain masked');
  assert.equal(windingAt(roofs, .9, 0), 0, 'street is not masked');
  assert.notEqual(windingAt(result, .85, 0), 0, 'the shadow itself is still present on the street');
  assert.ok(result.roofVertices > 0);
});

test('native polygon groups preserve the SVG union, holes and roof cutouts', () => {
  const first = feature([rectangle(-.85, -.8, .6, .8), rectangle(-.5, -.4, .3, .4)]);
  const second = feature([rectangle(-.15, -.55, .9, .55), rectangle(.4, -.2, .6, .2)]);
  const shadow = feature([rectangle(-.95, -.95, .95, .95)]);
  const builder = createShadowRasterPath({ features: [first, second], roofs: [first, second, shadow] }, bounds, { nativeGroups: true });
  const original = createShadowRasterPath({ features: [first, second], roofs: [first, second, shadow] }, bounds);
  while (!builder.step(1)) {}
  while (!original.step(1)) {}
  const result = builder.result(), svg = original.result();
  assert.equal(result.d.replaceAll('|', ''), svg.d);
  assert.equal(result.roofD.replaceAll('|', ''), svg.roofD);
  assert.equal(result.d.split('|').length, 2);
  assert.equal((result.d.split('|')[0].match(/M/g) || []).length, 2, 'a courtyard remains in its polygon');
  for (const [flat, grouped] of [[svg.d, result.d], [svg.roofD, result.roofD]]) {
    for (let y = -.93; y < .94; y += .071) for (let x = -.93; x < .94; x += .069) {
      const combined = windingAt({ ...result, d: flat }, x, y) !== 0;
      const union = grouped.split('|').some((d) => windingAt({ ...result, d }, x, y) !== 0);
      assert.equal(union, combined, `coverage mismatch at ${x}, ${y}`);
    }
  }
});

test('reused roof projections preserve geometry across time, view and resolution changes', () => {
  const roof = feature([rectangle(-.8, -.8, .5, .8), rectangle(-.4, -.4, .2, .4)]);
  const second = feature([rectangle(-.1, -.5, .8, .5)]);
  const shadows = [feature([rectangle(-.95, -.95, .95, .95)])];
  function render(roofs, area, longestSide, maxVertices = 120000) {
    const builder = createShadowRasterPath({ features: shadows, roofs }, area, { longestSide, maxVertices, nativeGroups: true });
    while (!builder.step(1)) {}
    return builder.result();
  }
  const roofs = [roof, second];
  const cold = render(roofs, bounds, 256);
  assert.deepEqual(render(roofs, bounds, 256), cold, 'a cached roof produces identical output');
  const smallerArea = [-.9, -.8, .9, .8];
  assert.deepEqual(render(roofs, smallerArea, 256), render(structuredClone(roofs), smallerArea, 256));
  assert.deepEqual(render(roofs, smallerArea, 384), render(structuredClone(roofs), smallerArea, 384));
  assert.deepEqual(render(roofs, bounds, 256), cold, 'returning to the original area is correct');
  assert.throws(() => render(roofs, bounds, 256, 14), /too large/, 'cached vertices still count toward the safety limit');
});
