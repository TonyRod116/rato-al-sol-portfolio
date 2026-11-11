import { madridUtmToLatLng } from '../madrid.mjs';
import { distanceMetres, matchesName, searchCategory, validCoordinate } from './places.mjs';
import { inMadridArea } from './madrid-scene.mjs';

const PARKS_URL = 'https://datos.madrid.es/dataset/200761-0-parques-jardines/resource/200761-5-parques-jardines-json/download/200761-0-parques-jardines.json';
let parksCache = null;
let terracesCache = null;
let memoryGeneration = 0;
export function clearMadridSearchMemoryCache() { memoryGeneration++; parksCache = null; terracesCache = null; }
const fold = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

// Madrid's list covers major parks, not every green space. Its coordinates are
// reference points rather than surveyed sunny seating locations.
export async function searchMadridParks(center, radius, query = '', fetchFn = fetch) {
  const generation = memoryGeneration;
  if (!validCoordinate(center) || !inMadridArea(center) || !Number.isFinite(radius) || radius < 100 || radius > 5000) return [];
  const category = searchCategory(query);
  if (category && (category.kind !== 'public' || category.filter.includes('square'))) return [];
  const name = typeof query === 'string' && !category ? fold(query.trim()) : '';
  if (name.length > 80) return [];
  let parks = fetchFn === fetch && parksCache?.expires > Date.now() ? parksCache.items : null;
  if (!parks) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetchFn(PARKS_URL, { signal: controller.signal });
      if (!response.ok) throw new Error('Catálogo municipal de parques no disponible');
      const data = await response.json(), records = data?.['@graph'];
      if (!Array.isArray(records) || records.length > 1000) throw new Error('Catálogo municipal de parques incompleto');
      parks = records.map((item) => {
        const latitude = item?.location?.latitude, longitude = item?.location?.longitude;
        if (!/^\d{1,12}$/.test(String(item?.id)) || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 120 ||
          typeof latitude !== 'number' || typeof longitude !== 'number' || !validCoordinate({ latitude, longitude })) return null;
        return { id: `madrid-park/${item.id}`, name: item.title.trim(), latitude, longitude, kind: 'public' };
      }).filter(Boolean);
      if (fetchFn === fetch && generation === memoryGeneration) parksCache = { items: parks, expires: Date.now() + 5 * 60 * 1000 };
    } finally { clearTimeout(timer); }
  }
  return parks.filter((park) => !name || matchesName(name, park.name))
    .map((park) => ({ ...park, distance: distanceMetres(center, park) }))
    .filter((park) => park.distance <= radius).sort((a, b) => a.distance - b.distance);
}

// The municipal terrace register does not specify the business activity. Its
// coordinates identify entrances and a category match must remain unconfirmed.
export async function searchMadridFallback(center, radius, query, fetchFn = fetch) {
  const generation = memoryGeneration;
  const name = typeof query === 'string' ? query.trim() : '';
  if (!inMadridArea(center) || !Number.isFinite(radius) || radius < 100 || radius > 5000 || (name && name.length < 2) || name.length > 80 || /[\x00-\x1f]/.test(name)) return [];
  const category = searchCategory(name);
  if (category?.kind === 'public') return [];
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
  try {
    const body = { resource_id: '200085-6-censo-locales', limit: 80,
      filters: { desc_situacion_terraza: 'Abierta', desc_situacion_local: 'Abierto' },
      fields: ['id_terraza', 'rotulo', 'coordenada_x_local', 'coordenada_y_local', 'desc_tipo_acceso_local'] };
    async function requestRecords(catalogue) {
      const request = { ...body, limit: catalogue ? 10000 : 80 };
      if (!catalogue) request.q = name;
      const response = await fetchFn('https://datos.madrid.es/api/3/action/datastore_search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal,
      });
      if (!response.ok) throw new Error('Censo municipal no disponible');
      const data = await response.json(), records = data?.result?.records;
      if (data?.success !== true || !Array.isArray(records) || records.length > request.limit ||
          (catalogue && Number.isFinite(data.result.total) && data.result.total > records.length)) throw new Error('Censo municipal incompleto');
      return records;
    }
    const normalize = (records) => records.map((item) => {
      if (!/^\d{1,12}$/.test(String(item.id_terraza)) || typeof item.rotulo !== 'string' || !item.rotulo.trim() ||
          item.rotulo.length > 120 || item.desc_tipo_acceso_local !== 'Puerta Calle') return null;
      const location = madridUtmToLatLng(item.coordenada_x_local, item.coordenada_y_local);
      return location && { id: `madrid/${item.id_terraza}`, name: item.rotulo.trim(), latitude: location.lat,
        longitude: location.lng, kind: 'business', outdoor: true, categoryUnknown: true };
    }).filter(Boolean);
    const inArea = (items) => items.filter((place) => !name || category || matchesName(name, place.name))
      .map((place) => ({ ...place, distance: distanceMetres(center, place) }))
      .filter((place) => place.distance <= radius).sort((a, b) => a.distance - b.distance).slice(0, 80);
    if (name && !category) {
      const exact = inArea(normalize(await requestRecords(false)));
      if (exact.length) return exact;
    }
    let catalogue = fetchFn === fetch && terracesCache?.expires > Date.now() ? terracesCache.items : null;
    if (!catalogue) {
      catalogue = normalize(await requestRecords(true));
      if (fetchFn === fetch && generation === memoryGeneration) terracesCache = { items: catalogue, expires: Date.now() + 5 * 60 * 1000 };
    }
    return inArea(catalogue);
  } finally { clearTimeout(timer); }
}
