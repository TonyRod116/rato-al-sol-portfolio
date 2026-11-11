import { getMadridBuildings } from './madrid-buildings.mjs';
import { getBuildings } from './shared/places.mjs';
import { inMadridArea } from './shared/madrid-scene.mjs';

const recent = new Map();
let memoryGeneration = 0;
export function clearViewportBuildingMemoryCache() { memoryGeneration++; recent.clear(); }

export function viewportBounds(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) ||
      bounds[0] >= bounds[2] || bounds[1] >= bounds[3] || bounds[0] < -180 || bounds[2] > 180 || bounds[1] < -85 || bounds[3] > 85) return null;
  return bounds.map((value, index) => (index < 2 ? Math.floor(value * 1000) : Math.ceil(value * 1000)) / 1000);
}

export async function getViewportBuildings(view, fetchFn = fetch, { allowEmpty = false } = {}) {
  const generation = memoryGeneration;
  const rounded = viewportBounds(view);
  if (!rounded) throw new Error('No se reconoce la zona visible.');
  // Incremental strips have their own narrow safety margin and must not be
  // rounded to an entire extra 0.001° cell on all four edges.
  const bounds = allowEmpty ? [...view] : rounded;
  const key = bounds.join(',');
  const cached = !allowEmpty && fetchFn === fetch && recent.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const [w, s, e, n] = bounds;
  const center = { latitude: (s + n) / 2, longitude: (w + e) / 2 };
  let result;
  if (inMadridArea(center)) {
    result = { ...await getMadridBuildings(fetchFn, bounds, { allowEmpty }), source: 'madrid' };
  } else {
    // Each 500 m cell fits inside an OpenStreetMap query of 400 m radius.
    const x = (e - w) * 111319.49 * Math.cos(center.latitude * Math.PI / 180);
    const y = (n - s) * 111319.49;
    const columns = Math.max(1, Math.ceil(x / 500)), rows = Math.max(1, Math.ceil(y / 500));
    if (columns * rows > 6) throw new Error('Acerca el mapa para cargar los edificios de esta zona.');
    const points = [];
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      points.push({ latitude: s + (row + .5) * (n - s) / rows, longitude: w + (column + .5) * (e - w) / columns });
    }
    const buildings = await getBuildings(points, fetchFn, { allowEmpty });
    const features = buildings.filter((building) => Number.isFinite(building.height)).map((building) => ({
      type: 'Feature', properties: { height: building.height, id: building.id },
      geometry: { type: 'Polygon', coordinates: [building.footprint.map((point) => [point.longitude, point.latitude])] },
    }));
    if (!features.length && !allowEmpty) throw new Error('No hay alturas suficientes en esta zona.');
    result = { type: 'FeatureCollection', features, bounds, source: 'osm', omitted: buildings.length - features.length };
  }
  result.fetchedAt = Date.now();
  if (!allowEmpty && fetchFn === fetch && generation === memoryGeneration) {
    if (recent.size >= 6) recent.delete(recent.keys().next().value);
    recent.set(key, { value: result, expires: Date.now() + 2 * 60 * 1000 });
  }
  return result;
}
