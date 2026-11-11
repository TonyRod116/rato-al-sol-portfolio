// Bounded municipal viewport requests; heights are estimates in metres.
const ENDPOINT = 'https://sigma.madrid.es/hosted/rest/services/cartografia/EDIFICIOS_ALTURAS/MapServer/0/query';
export const AYALA_BOUNDS = [-3.692, 40.425, -3.685, 40.429];
export const AYALA_CENTER = { lat: 40.42785, lng: -3.6873 };
const MAX_FEATURES = 2000;

// Stable categories help explain failures without collecting coordinates,
// response bodies or connection details from people's devices.
function buildingError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validRing(ring, bounds) {
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > 10000) return false;
  const valid = ring.every((point) => Array.isArray(point) && point.length >= 2 &&
    Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
    point[0] > bounds[0] - .02 && point[0] < bounds[2] + .02 &&
    point[1] > bounds[1] - .02 && point[1] < bounds[3] + .02);
  return valid && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1];
}

function normalize(feature, bounds) {
  const height = feature?.properties?.ALTURA;
  const geometry = feature?.geometry;
  if (!Number.isFinite(height) || height <= 0 || height > 500 || !geometry) return null;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates : null;
  if (!Array.isArray(polygons) || !polygons.length || !polygons.every((polygon) =>
    Array.isArray(polygon) && polygon.length > 0 && polygon.every((ring) => validRing(ring, bounds)))) return null;
  return { type: 'Feature', properties: { height, id: feature.properties.OBJECTID }, geometry };
}

export async function getMadridBuildings(fetchFn = fetch, bounds = AYALA_BOUNDS, { allowEmpty = false } = {}) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) ||
      bounds[0] >= bounds[2] || bounds[1] >= bounds[3] || bounds[2] - bounds[0] > .04 || bounds[3] - bounds[1] > .03 ||
      bounds[0] < -3.94 || bounds[2] > -3.50 || bounds[1] < 40.28 || bounds[3] > 40.62) throw new Error('Acerca el mapa para cargar edificios.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let retried = false;
  try {
    async function query(area, depth = 0) {
      const body = new URLSearchParams({
        where: '1=1', geometry: area.join(','), geometryType: 'esriGeometryEnvelope',
        inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
        outFields: 'OBJECTID,ALTURA', returnGeometry: 'true', f: 'geojson',
      });
      const options = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: body.toString(), signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' };
      let response;
      try {
        response = await fetchFn(ENDPOINT, options);
      } catch (error) {
        if (controller.signal.aborted) throw error;
        if (retried || error?.name !== 'TypeError') throw buildingError('network', 'Building request failed');
        retried = true;
        await new Promise((resolve) => setTimeout(resolve, 350));
        try { response = await fetchFn(ENDPOINT, options); }
        catch (retryError) {
          if (controller.signal.aborted) throw retryError;
          throw buildingError('network', 'Building request failed');
        }
      }
      if (response.status >= 500 && response.status <= 599 && !retried && !controller.signal.aborted) {
        retried = true;
        await new Promise((resolve) => setTimeout(resolve, 350));
        try { response = await fetchFn(ENDPOINT, options); }
        catch (retryError) {
          if (controller.signal.aborted) throw retryError;
          throw buildingError('network', 'Building request failed');
        }
      }
      if (!response.ok) throw buildingError('service', 'Building service unavailable');
      let data;
      try { data = await response.json(); }
      catch (error) {
        if (controller.signal.aborted) throw error;
        if (error?.name === 'TypeError') throw buildingError('network', 'Building response interrupted');
        throw buildingError('incomplete', 'Invalid building geometry');
      }
      if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw buildingError('incomplete', 'Incomplete building geometry');
      if (data.features.length >= MAX_FEATURES || data.exceededTransferLimit) {
        if (depth >= 3) throw new Error('Acerca el mapa para cargar edificios.');
        const [w, s, e, n] = area;
        const splitEast = (e - w) * Math.cos((s + n) / 2 * Math.PI / 180) > n - s;
        const mid = splitEast ? (w + e) / 2 : (s + n) / 2;
        const parts = splitEast ? [[w, s, mid, n], [mid, s, e, n]] : [[w, s, e, mid], [w, mid, e, n]];
        return (await Promise.all(parts.map((part) => query(part, depth + 1)))).flat();
      }
      return data.features;
    }
    const raw = await query(bounds);
    if (!raw.length) {
      if (allowEmpty) return { type: 'FeatureCollection', features: [], bounds, omitted: 0 };
      throw new Error('No building geometry available');
    }
    if (raw.length > 8000) throw new Error('Acerca el mapa para cargar edificios.');
    const seen = new Set();
    const features = [];
    let omitted = 0;
    for (const item of raw) {
      const feature = normalize(item, bounds);
      if (!feature) { omitted++; continue; }
      const id = feature.properties.id;
      if (id !== undefined && seen.has(id)) continue;
      if (id !== undefined) seen.add(id);
      features.push(feature);
    }
    if (!features.length) {
      if (allowEmpty) return { type: 'FeatureCollection', features: [], bounds, omitted };
      throw new Error('No valid building heights');
    }
    const vertices = features.reduce((total, feature) => {
      const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      return total + polygons.reduce((count, polygon) => count + polygon.reduce((sum, ring) => sum + ring.length, 0), 0);
    }, 0);
    if (vertices > 200000) throw new Error('Acerca el mapa para cargar edificios.');
    return { type: 'FeatureCollection', features, bounds, omitted };
  } catch (error) {
    if (controller.signal.aborted) throw buildingError('timeout', 'Building request timed out');
    throw error;
  } finally { clearTimeout(timeout); }
}

export function insideAyala({ lng, lat }) {
  return lng >= AYALA_BOUNDS[0] && lng <= AYALA_BOUNDS[2] && lat >= AYALA_BOUNDS[1] && lat <= AYALA_BOUNDS[3];
}
