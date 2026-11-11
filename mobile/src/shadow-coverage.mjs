import { validCoordinate } from '../../frontend/shared/places.mjs';

const SCALE = 1_000_000;
const TILE_SIZE = 4000;
const SCENE_RADIUS = 400;
const MAX_VIEW_TILES = 36;
const MAX_CACHED_TILES = 24;
const tileOf = (value) => Math.floor(value * SCALE / TILE_SIZE);
const intersects = ([a, b, c, d], [w, s, e, n]) => a <= e && c >= w && b <= n && d >= s;

function decodeTile(bytes, x, y) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const features = [];
  let offset = 0;
  while (offset < view.byteLength) {
    const id = view.getUint32(offset, true);
    const height = view.getUint16(offset + 4, true) / 10;
    const ringCount = view.getUint16(offset + 6, true);
    offset += 8;
    const coordinates = [];
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    let vertices = 0;
    for (let i = 0; i < ringCount; i++) {
      const length = view.getUint16(offset, true);
      offset += 2;
      const ring = [];
      for (let j = 0; j < length; j++) {
        const longitude = (x * TILE_SIZE + view.getInt16(offset, true)) / SCALE;
        const latitude = (y * TILE_SIZE + view.getInt16(offset + 2, true)) / SCALE;
        offset += 4;
        ring.push([longitude, latitude]);
        bounds[0] = Math.min(bounds[0], longitude); bounds[2] = Math.max(bounds[2], longitude);
        bounds[1] = Math.min(bounds[1], latitude); bounds[3] = Math.max(bounds[3], latitude);
      }
      vertices += length;
      coordinates.push(ring);
    }
    const feature = { type: 'Feature', properties: { id, height }, geometry: { type: 'Polygon', coordinates } };
    features.push({ bounds, feature, vertices });
  }
  return features;
}

export function createShadowCoverage(indexes, readTile) {
  const decoded = new Map();

  function tilesForBounds(bounds) {
    if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)) return null;
    const [west, south, east, north] = bounds;
    if (west >= east || south >= north || west < -180 || east > 180 || south < -85 || north > 85) return null;
    const [w, s, e, n] = bounds.map(tileOf);
    if ((e - w + 1) * (n - s + 1) > MAX_VIEW_TILES) return null;
    const city = Object.keys(indexes).find((name) => indexes[name][`${w},${s}`]);
    if (!city) return null;
    const tiles = [];
    for (let x = w; x <= e; x++) for (let y = s; y <= n; y++) {
      const entry = indexes[city][`${x},${y}`];
      if (!entry) return null;
      tiles.push({ x, y, entry });
    }
    return { city, tiles };
  }

  async function get(bounds) {
    const area = tilesForBounds(bounds);
    if (!area) return null;
    const { city, tiles } = area;
    const features = new Map();
    let vertices = 0;
    let started = Date.now();
    for (const { x, y, entry } of tiles) {
      const key = `${city}:${x},${y}`;
      let tile = decoded.get(key);
      if (!tile) {
        tile = readTile(city, ...entry).then((bytes) => {
          if (bytes.byteLength !== entry[1]) throw new Error('Incomplete shadow tile');
          return decodeTile(bytes, x, y);
        });
      }
      decoded.delete(key);
      decoded.set(key, tile);
      if (decoded.size > MAX_CACHED_TILES) decoded.delete(decoded.keys().next().value);
      try {
        for (const item of await tile) {
          const id = item.feature.properties.id;
          if (features.has(id) || !intersects(item.bounds, bounds)) continue;
          features.set(id, item.feature);
          vertices += item.vertices;
        }
      } catch (error) {
        if (decoded.get(key) === tile) decoded.delete(key);
        throw error;
      }
      if (features.size > 8000 || vertices > 200000) throw new Error('Acerca el mapa para cargar edificios.');
      if (Date.now() - started >= 6) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        started = Date.now();
      }
    }
    return features.size ? { type: 'FeatureCollection', features: [...features.values()], bounds, source: `${city}-local`, omitted: 0 } : null;
  }

  async function scenes(points) {
    if (!Array.isArray(points) || !points.length || points.length > 6 || !points.every(validCoordinate)) return null;
    const radiusDegrees = SCENE_RADIUS / 111319.49;
    const areas = await Promise.all(points.map(({ longitude, latitude }) => {
      const east = radiusDegrees / Math.cos(latitude * Math.PI / 180);
      return get([longitude - east, latitude - radiusDegrees, longitude + east, latitude + radiusDegrees]);
    }));
    const source = areas[0]?.source;
    if (!source || areas.some((area) => area?.source !== source)) return null;
    const features = new Map();
    for (const area of areas) for (const feature of area.features) features.set(feature.properties.id, feature);
    if (features.size > 8000) return null;
    const buildings = [...features.values()].map(({ properties, geometry }) => ({
      height: properties.height,
      footprint: geometry.coordinates[0].map(([longitude, latitude]) => ({ longitude, latitude })),
    }));
    return { buildings, radius: SCENE_RADIUS, source };
  }

  return { has: (bounds) => Boolean(tilesForBounds(bounds)), get, scenes, clear: () => decoded.clear() };
}
