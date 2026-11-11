import { distanceMetres, matchesName, searchCategory, validCoordinate } from './places.mjs';

// Public municipal records describe authorisations and an approximate address,
// not a business name, opening hours or the actual location of the tables.
const API = 'https://opendata-ajuntament.barcelona.cat/data/api/3/action/';
const CITY_CENTER = { latitude: 41.39172, longitude: 2.16495 };
let cached;
let memoryGeneration = 0;
export function clearBarcelonaSearchMemoryCache() { memoryGeneration++; cached = null; }

export function inBarcelonaArea(point) {
  return validCoordinate(point) && distanceMetres(CITY_CENTER, point) <= 15000;
}

export async function searchBarcelonaTerraces(center, radius, query = '', fetchFn = fetch) {
  const generation = memoryGeneration;
  const text = typeof query === 'string' ? query.trim() : '';
  if (!inBarcelonaArea(center) || !Number.isFinite(radius) || radius < 100 || radius > 5000 ||
      (text && text.length < 2) || text.length > 80 || /[\x00-\x1f]/.test(text)) return [];
  const category = searchCategory(text);
  if (category?.kind === 'public') return [];
  const live = fetchFn === globalThis.fetch;
  let catalogue = live && cached?.expires > Date.now() ? cached.items : null;
  if (!catalogue) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const metadataResponse = await fetchFn(`${API}package_show?id=terrasses-comercos-vigents`, { signal: controller.signal });
      if (!metadataResponse.ok) throw new Error('Catálogo municipal no disponible');
      const metadata = await metadataResponse.json();
      const versions = metadata?.success === true && Array.isArray(metadata.result?.resources)
        ? metadata.result.resources.flatMap((resource) => {
          const match = /^(\d{4})_([12])S_/i.exec(resource.name || '');
          return match && resource.format?.toUpperCase() === 'CSV' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(resource.id || '')
            ? [{ id: resource.id, year: Number(match[1]), semester: Number(match[2]) }] : [];
        }).sort((a, b) => b.year - a.year || b.semester - a.semester) : [];
      if (!versions.length) throw new Error('Catálogo municipal incompleto');
      const version = versions[0];
      const params = new URLSearchParams({ resource_id: version.id, limit: '10000', fields: '_id,EMPLACAMENT,LATITUD,LONGITUD' });
      const response = await fetchFn(`${API}datastore_search?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error('Catálogo municipal no disponible');
      const data = await response.json(), records = data?.result?.records, total = data?.result?.total;
      if (data?.success !== true || !Array.isArray(records) || records.length > 10000 ||
          !Number.isInteger(total) || total !== records.length) throw new Error('Catálogo municipal incompleto');
      catalogue = records.flatMap((item) => {
        const lat = item?.LATITUD, lon = item?.LONGITUD;
        const latitude = typeof lat === 'string' && !lat.trim() ? NaN : Number(lat);
        const longitude = typeof lon === 'string' && !lon.trim() ? NaN : Number(lon);
        const name = typeof item?.EMPLACAMENT === 'string' ? item.EMPLACAMENT.trim() : '';
        if (!/^\d{1,12}$/.test(String(item?._id)) || !name || name.length > 120 ||
            !inBarcelonaArea({ latitude, longitude })) return [];
        return [{ id: `barcelona/${version.id}/${item._id}`, name, latitude, longitude, kind: 'business', outdoor: true,
          categoryUnknown: true, municipalPeriod: { year: version.year, semester: version.semester } }];
      });
      if (live && generation === memoryGeneration) cached = { items: catalogue, expires: Date.now() + 5 * 60 * 1000 };
    } finally { clearTimeout(timer); }
  }
  return catalogue.filter((place) => !text || category || matchesName(text, place.name))
    .map((place) => ({ ...place, distance: distanceMetres(center, place) }))
    .filter((place) => place.distance <= radius).sort((a, b) => a.distance - b.distance).slice(0, 80);
}
