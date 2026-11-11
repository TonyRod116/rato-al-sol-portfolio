import { validCoordinate } from './places.mjs';
const ENDPOINT = 'https://sigma.madrid.es/hosted/rest/services/cartografia/EDIFICIOS_ALTURAS/MapServer/0/query';
const MAX_FEATURES = 2000;
export const MADRID_RADIUS = 250;

export function inMadridArea(point) {
  return validCoordinate(point) && point.latitude >= 40.30 && point.latitude <= 40.60 && point.longitude >= -3.92 && point.longitude <= -3.52;
}

// Madrid's CC BY 4.0 service provides estimated heights. The selected point is
// sent in the POST body, never in the URL. A truncated response is unusable.
export async function getMadridScene(point, fetchFn = fetch) {
  if (!inMadridArea(point)) throw new Error('Punto fuera del área de Madrid.');
  const lat = MADRID_RADIUS / 111319.49;
  const lon = lat / Math.cos(point.latitude * Math.PI / 180);
  const bounds = [point.longitude - lon, point.latitude - lat, point.longitude + lon, point.latitude + lat];
  const body = new URLSearchParams({ where: '1=1', geometry: bounds.join(','), geometryType: 'esriGeometryEnvelope',
    inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'ALTURA', returnGeometry: 'true', f: 'geojson' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetchFn(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: body.toString(), signal: controller.signal });
    if (!response.ok) throw new Error('No disponible');
    const data = await response.json();
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length || data.features.length >= MAX_FEATURES || data.exceededTransferLimit) throw new Error('Geometría incompleta');
    const buildings = []; let vertices = 0;
    for (const feature of data.features) {
      const reportedHeight = feature?.properties?.ALTURA, geometry = feature?.geometry;
      // Keep the footprint even without a usable height: it can still obstruct
      // the sun, but must never be treated as a known-height building.
      const height = Number.isFinite(reportedHeight) && reportedHeight > 0 && reportedHeight <= 500 ? reportedHeight : null;
      const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : null;
      if (!Array.isArray(polygons) || !polygons.length) throw new Error('Geometría no válida');
      for (const polygon of polygons) {
        const ring = polygon?.[0];
        if (!Array.isArray(ring) || ring.length < 4 || ring.length > 10000) throw new Error('Anillo no válido');
        const footprint = ring.map((p) => ({ latitude: p?.[1], longitude: p?.[0] }));
        if (!footprint.every((p) => validCoordinate(p) && Math.abs(p.latitude - point.latitude) < .03 && Math.abs(p.longitude - point.longitude) < .03) ||
          footprint[0].latitude !== footprint.at(-1).latitude || footprint[0].longitude !== footprint.at(-1).longitude) throw new Error('Coordenadas no válidas');
        vertices += footprint.length;
        if (vertices > 200000) throw new Error('Geometría demasiado grande');
        // A courtyard is conservatively treated as part of the outer footprint;
        // points inside it remain unknown instead of being labelled sunny.
        buildings.push({ footprint, height, heightSource: 'madrid' });
      }
    }
    return buildings;
  } finally { clearTimeout(timer); }
}
