import { inMadridArea } from '../../frontend/shared/madrid-scene.mjs';

// The viewport service drops footprints whose heights are missing. Such a
// dataset is suitable for a visual estimate, but NOT for claiming a point is
// sunny: an omitted building might obstruct it. Use it only with no omissions.
export async function scenesFromMadridViewport(points, geometry, {
  cancelled = () => false, now = Date.now,
  yieldWork = () => new Promise((resolve) => setTimeout(resolve, 0)),
} = {}) {
  const bounds = geometry?.bounds;
  if (!Array.isArray(points) || !points.length || points.length > 6 || !points.every(inMadridArea) ||
      geometry?.source !== 'madrid' || geometry.omitted !== 0 || !Array.isArray(geometry.features) ||
      !geometry.features.length || geometry.features.length > 8000 || !Array.isArray(bounds) ||
      bounds.length !== 4 || !bounds.every(Number.isFinite)) return null;
  const [west, south, east, north] = bounds;
  if (west >= east || south >= north || west < -3.94 || east > -3.50 || south < 40.28 || north > 40.62 ||
      east - west > .04 || north - south > .03) return null;

  // Inscribe a circle in the *proven* bounding box. Use a conservative
  // metres-per-degree conversion and a small additional margin; never infer
  // coverage for a point just outside or close to the edge.
  const metresPerDegree = 110000;
  const longitudeMetres = metresPerDegree * Math.cos(Math.max(Math.abs(south), Math.abs(north)) * Math.PI / 180);
  const radii = points.map(({ latitude, longitude }) => Math.min(250, Math.floor(Math.min(
    (longitude - west) * longitudeMetres, (east - longitude) * longitudeMetres,
    (latitude - south) * metresPerDegree, (north - latitude) * metresPerDegree,
  ) - 3)));
  if (radii.every((radius) => radius < 100)) return points.map(() => null);

  const buildings = [];
  let vertices = 0, operations = 0, started = now();
  for (const feature of geometry.features) {
    if (cancelled()) return null;
    const height = feature?.properties?.height, shape = feature?.geometry;
    if (!Number.isFinite(height) || height <= 0 || height > 500) return null;
    const polygons = shape?.type === 'Polygon' ? [shape.coordinates]
      : shape?.type === 'MultiPolygon' ? shape.coordinates : null;
    if (!Array.isArray(polygons) || !polygons.length) return null;
    for (const polygon of polygons) {
      if (!Array.isArray(polygon) || !polygon.length) return null;
      let footprint;
      for (let i = 0; i < polygon.length; i++) {
        const ring = polygon[i];
        if (!Array.isArray(ring) || ring.length < 4 || ring.length > 10000 ||
            (vertices += ring.length) > 200000) return null;
        const converted = [];
        for (const position of ring) {
          if (!Array.isArray(position) || position.length < 2 || !Number.isFinite(position[0]) ||
              !Number.isFinite(position[1]) || position[0] < west - .02 || position[0] > east + .02 ||
              position[1] < south - .02 || position[1] > north + .02) return null;
          if (i === 0) converted.push({ longitude: position[0], latitude: position[1] });
          if (((++operations) & 255) === 0 && now() - started >= 6) {
            await yieldWork();
            if (cancelled()) return null;
            started = now();
          }
        }
        const first = ring[0], last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) return null;
        if (i === 0) footprint = converted;
      }
      // Match getMadridScene: the outer ring conservatively contains patios.
      buildings.push({ footprint, height, heightSource: 'madrid' });
    }
  }
  if (cancelled() || !buildings.length) return null;
  const fetchedAt = geometry.fetchedAt;
  const stale = Number.isFinite(fetchedAt) && now() - fetchedAt >= 30 * 86400000;
  return radii.map((radius) => radius < 100 ? null : ({ buildings, radius, source: 'madrid',
    cacheInfo: { fetchedAt, stale, limited: radius < 200 } }));
}
