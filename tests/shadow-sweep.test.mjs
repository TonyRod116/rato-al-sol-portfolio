import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingShadows } from '../frontend/map-shadows.mjs';
import { shadowOffset } from '../frontend/solar.mjs';

const metre = 111319.49079327358;
const base = [-3.7, 40.42];
const point = ([x, y]) => [base[0] + x / (metre * Math.cos(base[1] * Math.PI / 180)), base[1] + y / metre];
const ring = (values) => [...values, values[0]].map(point);
const outer = ring([[0, 0], [60, 0], [60, 20], [35, 20], [35, 50], [0, 50]]);
const hole = ring([[5, 5], [15, 5], [15, 15], [5, 15]]);
const containsRing = (p, r) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};
const containsPoly = (p, rings) => containsRing(p, rings[0]) && !rings.slice(1).some((r) => containsRing(p, r));
const containsAny = (p, polygons) => polygons.some((polygon) => containsPoly(p, polygon));

// Original complete sweep is the reference; it includes both ends and every
// boundary edge, including all edges of the courtyard.
function allEdges(polygon, sun) {
  const [dx, dy] = shadowOffset(sun, 20);
  const all = polygon.flat();
  const latitude = (Math.min(...all.map((p) => p[1])) + Math.max(...all.map((p) => p[1]))) / 2;
  const east = metre * Math.cos(latitude * Math.PI / 180);
  const shifted = polygon.map((r) => r.map(([lng, lat]) => [lng + dx / east, lat - dy / metre]));
  const pieces = [shifted];
  for (let r = 0; r < polygon.length; r++) for (let i = 0; i < polygon[r].length - 1; i++) {
    const a = polygon[r][i], b = polygon[r][i + 1];
    pieces.push([[a, b, shifted[r][i + 1], shifted[r][i], a]]);
  }
  return pieces;
}

test('facing edges preserve the complete sweep for concavities, courtyards and all ring orientations', () => {
  for (const reverseOuter of [false, true]) for (const reverseHole of [false, true]) for (let azimuth = 0; azimuth < 360; azimuth += 30) {
    const polygon = [reverseOuter ? [...outer].reverse() : outer, reverseHole ? [...hole].reverse() : hole];
    const sun = { altitude: 35, azimuth };
    const source = { features: [{ properties: { height: 20 }, geometry: { type: 'Polygon', coordinates: polygon } }] };
    const actual = buildingShadows(source, sun).features[0].geometry.coordinates;
    const expected = allEdges(polygon, sun);
    assert.ok(actual.length < expected.length, 'the output contains fewer fragments');
    for (let y = -29.3; y <= 79.3; y += 2.73) for (let x = -29.7; x <= 89.7; x += 2.81) {
      const p = point([x, y]);
      assert.equal(containsAny(p, actual), containsAny(p, expected), `shadow differs at azimuth ${azimuth}, point ${x},${y}`);
    }
  }
});

test('roof geometry is collected only when requested and overlaps the view, regardless of available height', () => {
  const visible = { properties: { height: null }, geometry: { type: 'Polygon', coordinates: [outer, hole] } };
  const away = { properties: { height: 20 }, geometry: { type: 'Polygon', coordinates: [ring([[400, 400], [420, 400], [420, 420], [400, 420]])] } };
  const source = { features: [visible, away] };
  const lower = point([-10, -10]), upper = point([80, 80]);
  const view = [lower[0], lower[1], upper[0], upper[1]];
  const result = buildingShadows(source, { altitude: 35, azimuth: 45 }, view, { excludeRoofs: true });
  assert.deepEqual(result.roofs, [visible]);
  assert.equal('roofs' in buildingShadows(source, { altitude: 35, azimuth: 45 }, view), false);
});
