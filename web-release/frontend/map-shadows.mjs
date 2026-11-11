import { shadowOffset } from './solar.mjs';
// Local metres-per-degree approximation follows the latitude of the view.
const METRES_PER_DEGREE = 111319.49079327358;
const shift = (point, dx, dy, east) => [point[0] + dx / east, point[1] - dy / METRES_PER_DEGREE];
const boundsCache = new WeakMap();

function footprintBounds(building) {
  if (boundsCache.has(building)) return boundsCache.get(building);
  const polygons = building.geometry.type === 'Polygon' ? [building.geometry.coordinates] : building.geometry.coordinates;
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of polygons) for (const ring of polygon) for (const [lng, lat] of ring) {
    bounds[0] = Math.min(bounds[0], lng); bounds[1] = Math.min(bounds[1], lat);
    bounds[2] = Math.max(bounds[2], lng); bounds[3] = Math.max(bounds[3], lat);
  }
  boundsCache.set(building, bounds);
  return bounds;
}

function mayReachView(building, offset, view, eastPerDegree) {
  if (!Array.isArray(view) || view.length !== 4 || !view.every(Number.isFinite)) return true;
  const [west, south, east, north] = footprintBounds(building);
  const dx = offset[0] / eastPerDegree, dy = -offset[1] / METRES_PER_DEGREE;
  // Include the swept area, even when the casting building is off screen.
  return Math.min(west, west + dx) <= view[2] && Math.max(east, east + dx) >= view[0] &&
    Math.min(south, south + dy) <= view[3] && Math.max(north, north + dy) >= view[1];
}

// The translated roof plus the swept edges facing opposite the translation
// cover exactly the same area as all swept edges. Courtyards reverse the
// interior side; orientation is measured rather than assumed from the source.
function facingSweepEdges(ring, hole, dx, dy) {
  let twiceArea = 0;
  const [originX, originY] = ring[0];
  for (let i = 0; i < ring.length - 1; i++) twiceArea += (ring[i][0] - originX) * (ring[i + 1][1] - originY) -
    (ring[i + 1][0] - originX) * (ring[i][1] - originY);
  // Ambiguous/degenerate rings fall back to the original complete sweep.
  if (!Number.isFinite(twiceArea) || twiceArea === 0) return null;
  const inside = Math.sign(twiceArea) * (hole ? -1 : 1);
  const facing = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    if (((b[0] - a[0]) * dy - (b[1] - a[1]) * dx) * inside > 0) facing.push(i);
  }
  return facing;
}

// Neighbouring facing edges are monotone across the shadow direction, so
// their swept quadrilaterals form a single strip without self-overlap.
// Keep ambiguous rings as individual edges rather than joining them.
function sweepRuns(ring, facing) {
  if (!facing) return Array.from({ length: ring.length - 1 }, (_, i) => [i, i]);
  const runs = [];
  for (const i of facing) {
    const a = ring[i], b = ring[i + 1];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const last = runs[runs.length - 1];
    if (last && last[1] + 1 === i) last[1] = i;
    else runs.push([i, i]);
  }
  return runs;
}

// Sweep each boundary, including courtyard boundaries, and the translated roof.
// Geometry remains a visual estimate; it is not used to classify a terrace.
export function createBuildingShadowBuilder(buildings, sun, view = null, { maxVertices = Infinity, excludeRoofs = false } = {}) {
  if (maxVertices !== Infinity && (!Number.isSafeInteger(maxVertices) || maxVertices < 0)) {
    throw new RangeError('Invalid shadow vertex limit');
  }
  const features = [], roofs = [];
  let vertices = 0, index = 0, completed = false, output = null;
  const input = buildings?.features ?? [];
  function step(maxBuildings = 50) {
    if (!Number.isSafeInteger(maxBuildings) || maxBuildings < 1) throw new RangeError('Invalid shadow batch size');
    if (completed) return true;
    const end = Math.min(input.length, index + maxBuildings);
    while (index < end) {
      const building = input[index++];
      if (excludeRoofs) {
        const [west, south, east, north] = footprintBounds(building);
        if (!Array.isArray(view) || view.length !== 4 || !view.every(Number.isFinite) ||
            (west <= view[2] && east >= view[0] && south <= view[3] && north >= view[1])) roofs.push(building);
      }
      const offset = shadowOffset(sun, building.properties.height);
      if (!offset) continue;
      const buildingBounds = footprintBounds(building);
      const east = METRES_PER_DEGREE * Math.cos((buildingBounds[1] + buildingBounds[3]) / 2 * Math.PI / 180);
      if (!mayReachView(building, offset, view, east)) continue;
      const polygons = building.geometry.type === 'Polygon' ? [building.geometry.coordinates] : building.geometry.coordinates;
      const runs = polygons.map((polygon) => polygon.map((ring, index) => sweepRuns(ring,
        facingSweepEdges(ring, index > 0, offset[0] / east, -offset[1] / METRES_PER_DEGREE))));
      if (maxVertices !== Infinity) {
        // Count the translated rings and each five-vertex swept edge before
        // allocating them. If the next building would cross the budget, return
        // no shapes at all: a partial shadow mask could imply false sunshine.
        for (let p = 0; p < polygons.length; p++) for (let r = 0; r < polygons[p].length; r++) {
          const ring = polygons[p][r];
          vertices += ring.length;
          if (vertices > maxVertices) { output = { type: 'FeatureCollection', features: [], limitExceeded: true }; completed = true; return true; }
          for (const [first, last] of runs[p][r]) {
            const a = ring[first], b = ring[last + 1];
            if (a[0] === b[0] && a[1] === b[1]) continue;
            vertices += 2 * (last - first + 1) + 3;
            if (vertices > maxVertices) { output = { type: 'FeatureCollection', features: [], limitExceeded: true }; completed = true; return true; }
          }
        }
      }
      const shapes = [];
      for (let p = 0; p < polygons.length; p++) {
        const polygon = polygons[p];
        const shifted = polygon.map((ring) => ring.map((point) => shift(point, ...offset, east)));
        shapes.push(shifted);
        for (let r = 0; r < polygon.length; r++) {
          const ring = polygon[r];
          for (const [first, last] of runs[p][r]) {
            const a = ring[first], b = ring[last + 1];
            if (a[0] === b[0] && a[1] === b[1]) continue;
            const boundary = ring.slice(first, last + 2);
            const translated = shifted[r].slice(first, last + 2).reverse();
            shapes.push([[...boundary, ...translated, a]]);
          }
        }
      }
      if (shapes.length) features.push({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: shapes } });
    }
    if (index < input.length) return false;
    output = excludeRoofs ? { type: 'FeatureCollection', features, roofs } : { type: 'FeatureCollection', features };
    completed = true;
    return true;
  }
  function result() {
    if (!completed) throw new Error('Shadow geometry is incomplete');
    return output;
  }
  return { step, result };
}

// Keep the synchronous API for the web and callers that need an immediate result.
export function buildingShadows(buildings, sun, view = null, options = {}) {
  const builder = createBuildingShadowBuilder(buildings, sun, view, options);
  while (!builder.step(500)) {}
  return builder.result();
}

const DIRECTIONS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];
export function shadowDirection(sun) {
  if (!shadowOffset(sun, 1)) return null;
  const bearing = (sun.azimuth + 180) % 360;
  return { bearing, label: DIRECTIONS[Math.round(bearing / 45) % 8] };
}
