const ENDPOINT = 'https://datos.madrid.es/api/3/action/datastore_search';
const RESOURCE = '200085-6-censo-locales';
const FILTERS = {
  desc_barrio_local: 'RECOLETOS', desc_vial_edificio: 'AYALA',
  desc_situacion_terraza: 'Abierta', desc_situacion_local: 'Abierto',
};
const FIELDS = [
  'id_terraza', 'rotulo', 'desc_barrio_local', 'clase_vial_edificio',
  'desc_vial_edificio', 'num_edificio', 'cal_edificio',
  'desc_situacion_local', 'desc_situacion_terraza',
  'desc_tipo_acceso_local', 'coordenada_x_local', 'coordenada_y_local',
];

// Madrid's census publishes ETRS89 / UTM 30N metres. Invert the transverse
// Mercator projection (GRS80); ETRS89 and WGS84 are equivalent at the much
// coarser accuracy of an approximate business entrance.
export function madridUtmToLatLng(x, y) {
  if ((typeof x !== 'string' && typeof x !== 'number') ||
      (typeof y !== 'string' && typeof y !== 'number') ||
      String(x).trim() === '' || String(y).trim() === '') return null;
  if ((typeof x === 'string' && !/^\d{1,7}(?:\.\d{1,4})?$/.test(x.trim())) ||
      (typeof y === 'string' && !/^\d{1,7}(?:\.\d{1,4})?$/.test(y.trim()))) return null;
  const easting = Number(x), northing = Number(y);
  if (!Number.isFinite(easting) || !Number.isFinite(northing) ||
      easting < 400000 || easting > 500000 || northing < 4400000 || northing > 4600000) return null;
  const a = 6378137, f = 1 / 298.257222101, k = 0.9996;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const mu = (northing / k) / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const foot = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const sin = Math.sin(foot), cos = Math.cos(foot), tan = Math.tan(foot);
  const n = a / Math.sqrt(1 - e2 * sin ** 2);
  const r = a * (1 - e2) / (1 - e2 * sin ** 2) ** 1.5;
  const t = tan ** 2, c = ep2 * cos ** 2, d = (easting - 500000) / (n * k);
  const lat = foot - (n * tan / r) * (d ** 2 / 2 - (5 + 3 * t + 10 * c - 4 * c ** 2 - 9 * ep2) * d ** 4 / 24
    + (61 + 90 * t + 298 * c + 45 * t ** 2 - 252 * ep2 - 3 * c ** 2) * d ** 6 / 720);
  const lng = -3 * Math.PI / 180 + (d - (1 + 2 * t + c) * d ** 3 / 6
    + (5 - 2 * c + 28 * t - 3 * c ** 2 + 8 * ep2 + 24 * t ** 2) * d ** 5 / 120) / cos;
  return { lat: lat * 180 / Math.PI, lng: lng * 180 / Math.PI };
}

function normalize(record) {
  if (!record || typeof record !== 'object' || !/^\d{1,12}$/.test(record.id_terraza ?? '') ||
      typeof record.rotulo !== 'string' || !record.rotulo.trim() || record.rotulo.length > 120 ||
      record.clase_vial_edificio !== 'CALLE' ||
      Object.entries(FILTERS).some(([key, value]) => record[key] !== value) ||
      typeof record.num_edificio !== 'string' || !/^\d{1,6}$/.test(record.num_edificio) ||
      Number(record.num_edificio) === 0) return null;
  const suffix = record.cal_edificio ?? '';
  if (typeof suffix !== 'string' || !/^[a-zA-Z0-9]{0,6}$/.test(suffix)) return null;
  return {
    id: record.id_terraza,
    name: record.rotulo.trim(),
    address: `Calle de Ayala, ${Number(record.num_edificio)}${suffix}`,
    position: record.desc_tipo_acceso_local === 'Puerta Calle'
      ? madridUtmToLatLng(record.coordenada_x_local, record.coordenada_y_local) : null,
  };
}

// A single, explicit, bounded lookup. No personal location or plan is sent.
export async function getMadridTerraces(fetchFn = fetch) {
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({
    resource_id: RESOURCE, limit: '10', fields: FIELDS.join(','), filters: JSON.stringify(FILTERS),
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchFn(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('Madrid census unavailable');
    const data = await response.json();
    if (data?.success !== true || !Array.isArray(data?.result?.records) || data.result.records.length > 10) {
      throw new Error('Unexpected Madrid census response');
    }
    const records = data.result.records.map(normalize).filter(Boolean);
    if (data.result.records.length && !records.length) throw new Error('No valid Madrid census records');
    return records;
  } finally {
    clearTimeout(timeout);
  }
}
