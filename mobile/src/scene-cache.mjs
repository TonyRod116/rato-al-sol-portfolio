import { distanceMetres, validCoordinate } from '../../frontend/shared/places.mjs';
import { inMadridArea } from '../../frontend/shared/madrid-scene.mjs';
import { inBarcelonaArea } from '../../frontend/shared/barcelona-terraces.mjs';

// These private files contain building data and the centres/times of visited
// areas. They do not contain search text, place names or GPS access tokens.
const VERSION = 2, INDEX = 'index';
const DEFAULT_MAX_BYTES = 15 * 1024 * 1024, DEFAULT_ENTRY_BYTES = 4 * 1024 * 1024;
const DEFAULT_FRESH_MS = 30 * 24 * 60 * 60 * 1000;

const yieldToUI = () => new Promise((resolve) => setTimeout(resolve, 0));

function validAreas(areas, source, radius) {
  if (!Array.isArray(areas) || !areas.length || areas.length > 6 || !['madrid', 'osm'].includes(source) ||
      !Number.isFinite(radius) || radius < 100 || radius > 400) return false;
  if (source === 'madrid' && (areas.length !== 1 || radius > 250)) return false;
  return areas.every((point) => validCoordinate(point) && (source === 'madrid' ? inMadridArea(point) : inMadridArea(point) || inBarcelonaArea(point)));
}

// A record per building avoids a single multi-megabyte JSON parse/stringify
// on the JS thread. Each batch yields so touches and map gestures can run.
function validBuilding(building) {
  return !!building && (building.height === null || (Number.isFinite(building.height) && building.height > 0 && building.height <= 500)) &&
    Array.isArray(building.footprint) && building.footprint.length >= 4 && building.footprint.length <= 10000 &&
    building.footprint.every(validCoordinate) && distanceMetres(building.footprint[0], building.footprint.at(-1)) <= 1;
}

async function encodeScene(scene, areas, maxBytes, progress = () => {}) {
  if (!scene || !validAreas(areas, scene.source, scene.radius) || !Array.isArray(scene.buildings) ||
      !scene.buildings.length || scene.buildings.length > 8000 || scene.incomplete || scene.error) return null;
  const lines = [JSON.stringify({ version: VERSION, source: scene.source, radius: scene.radius })];
  let size = lines[0].length, vertices = 0;
  for (let i = 0; i < scene.buildings.length; i++) {
    const building = scene.buildings[i];
    if (!validBuilding(building) || (vertices += building.footprint.length) > 200000) return null;
    const record = { height: building.height,
      heightSource: ['madrid', 'height', 'levels', 'unknown'].includes(building.heightSource) ? building.heightSource : '',
      footprint: building.footprint.map(({ latitude, longitude }) => ({ latitude, longitude })) };
    const line = JSON.stringify(record);
    // Sanitised fields contain ASCII only, so character count equals UTF-8 bytes.
    size += line.length + 1;
    if (size > maxBytes) return null;
    lines.push(line);
    if ((i + 1) % 50 === 0) { progress(); await yieldToUI(); progress(); }
  }
  return { text: lines.join('\n'), size };
}

async function decodeScene(text, areas, maxBytes, progress = () => {}) {
  if (typeof text !== 'string' || text.length > maxBytes) return null;
  const lines = text.split('\n');
  if (lines.length < 2 || lines.length > 8001) return null;
  let header;
  try { header = JSON.parse(lines[0]); } catch { return null; }
  if (header?.version !== VERSION || !validAreas(areas, header.source, header.radius)) return null;
  const buildings = []; let vertices = 0;
  for (let i = 1; i < lines.length; i++) {
    let building;
    try { building = JSON.parse(lines[i]); } catch { return null; }
    if (!validBuilding(building) || (vertices += building.footprint.length) > 200000) return null;
    buildings.push(building);
    if (i % 50 === 0) { progress(); await yieldToUI(); progress(); }
  }
  return { source: header.source, radius: header.radius, buildings };
}

export function createSceneFileStore(FileSystem) {
  const root = FileSystem?.cacheDirectory ? `${FileSystem.cacheDirectory}rato-scene-cache-v1/` : null;
  let directory;
  async function ready() {
    if (!root) throw new Error('Cache directory unavailable');
    if (!directory) directory = Promise.resolve().then(async () => {
      const info = await FileSystem.getInfoAsync(root);
      if (!info.exists) await FileSystem.makeDirectoryAsync(root, { intermediates: true });
      else if (!info.isDirectory) throw new Error('Cache path is not a directory');
    }).catch((error) => { directory = null; throw error; });
    return directory;
  }
  function path(name) {
    if (!/^(?:index|scene-[a-z0-9-]+)$/.test(name)) throw new Error('Invalid cache file');
    return `${root}${name}.json`;
  }
  return {
    async getItem(name) { await ready(); const file = path(name); const info = await FileSystem.getInfoAsync(file); return info.exists ? FileSystem.readAsStringAsync(file) : null; },
    async setItem(name, value) { await ready(); await FileSystem.writeAsStringAsync(path(name), value); },
    async removeItem(name) { await ready(); await FileSystem.deleteAsync(path(name), { idempotent: true }); },
    async sizeItem(name) {
      await ready();
      const info = await FileSystem.getInfoAsync(path(name), { size: true });
      if (!info.exists) return null;
      if (info.isDirectory || !Number.isSafeInteger(info.size) || info.size <= 0) throw new Error('Invalid cache file size');
      return info.size;
    },
    async listItems() {
      await ready();
      const names = await FileSystem.readDirectoryAsync(root);
      return names.flatMap((name) => /^scene-[a-z0-9-]+\.json$/.test(name) ? [name.slice(0, -5)] : []);
    },
  };
}

// Each area describes one query circle, even when a single request fetched a
// union of several circles. A neighbouring point gets a smaller conservative
// radius; it is never represented as having the original full coverage.
export function createSceneCache(store, { now = Date.now, maxBytes = DEFAULT_MAX_BYTES,
  maxEntryBytes = DEFAULT_ENTRY_BYTES, maxEntries = 20, freshMs = DEFAULT_FRESH_MS, timeoutMs = 2500 } = {}) {
  let chain = Promise.resolve(), metadata = null, sequence = 0;
  const heartbeats = new Set();
  const progress = () => { for (const heartbeat of heartbeats) heartbeat(); };
  const exclusive = (action) => {
    let expired = false, timer, rejectTimeout;
    const timeout = new Promise((_, reject) => { rejectTimeout = reject; });
    const arm = () => {
      if (expired) return;
      clearTimeout(timer);
      timer = setTimeout(() => { expired = true; rejectTimeout(new Error('Cache timed out')); }, timeoutMs);
    };
    heartbeats.add(arm);
    arm();
    const work = chain.then(() => {
      if (expired) throw new Error('Cache operation expired');
      progress();
      return action(progress);
    });
    // Keep the real operation serialized even after its caller times out.
    // Queued operations whose caller already left are skipped on eventual wake.
    chain = work.catch(() => {});
    return Promise.race([work, timeout]).finally(() => { heartbeats.delete(arm); clearTimeout(timer); });
  };
  async function index(progress = () => {}) {
    if (metadata) return metadata;
    try {
      const data = JSON.parse(await store.getItem(INDEX) || 'null'); progress();
      metadata = data?.version === VERSION && Array.isArray(data.entries) ? data.entries.filter((entry) =>
        typeof entry?.id === 'string' && /^scene-[a-z0-9-]+$/.test(entry.id) && validAreas(entry.areas, entry.source, entry.radius) &&
        Number.isSafeInteger(entry.size) && entry.size > 0 && Number.isFinite(entry.fetchedAt) && Number.isFinite(entry.usedAt)).slice(0, maxEntries) : [];
    } catch { metadata = []; }
    // Metadata may have survived a partial write or may be corrupt while still
    // parsing. On the real filesystem, trust measured bytes, not index claims.
    if (typeof store.sizeItem === 'function' && metadata.length) {
      try {
        const measured = await Promise.all(metadata.map(async (entry) => ({ ...entry, size: await store.sizeItem(entry.id) }))); progress();
        measured.sort((a, b) => b.usedAt - a.usedAt);
        const retained = []; let total = 0;
        for (const entry of measured) {
          if (Number.isSafeInteger(entry.size) && entry.size > 0 && entry.size <= maxEntryBytes &&
              retained.length < maxEntries && total + entry.size <= maxBytes) { retained.push(entry); total += entry.size; }
        }
        metadata = retained;
        await store.setItem(INDEX, JSON.stringify({ version: VERSION, entries: retained })); progress();
      } catch (error) { metadata = null; throw error; }
    }
    // After a crash or a corrupt index, remove only files owned by this cache
    // that cannot be reached through the validated index. This keeps orphaned
    // records from accumulating outside the configured storage budget.
    try {
      if (typeof store.listItems === 'function') {
        const retained = new Set(metadata.map((entry) => entry.id));
        const files = await store.listItems(); progress();
        for (const name of files) if (/^scene-[a-z0-9-]+$/.test(name) && !retained.has(name)) { await store.removeItem(name); progress(); }
      }
    } catch { /* The cache remains usable even if cleanup is unavailable. */ }
    return metadata;
  }
  async function persist(entries, progress = () => {}) { await store.setItem(INDEX, JSON.stringify({ version: VERSION, entries })); metadata = entries; progress(); }
  async function remove(entries, progress = () => {}) { for (const item of entries) { try { await store.removeItem(item.id); progress(); } catch { /* Best effort. */ } } }
  const cache = {
    async find(point, options) { return cache.findMany([point], options); },
    async findMany(points, { minRadius = 100 } = {}) {
      if (!Array.isArray(points) || !points.length || points.length > 6 ||
          !points.every((point) => validCoordinate(point) && (inMadridArea(point) || inBarcelonaArea(point))) ||
          !Number.isFinite(minRadius) || minRadius < 100 || minRadius > 400) return null;
      try {
        return await exclusive(async (progress) => {
          const entries = await index(progress);
          const candidates = entries.flatMap((entry) => {
            if (entry.fetchedAt > now() + 60000) return [];
            // Every requested point must be covered by this ONE capture.
            // The minimum safe radius then applies uniformly to all points.
            const radii = points.map((point) => {
              const distance = Math.min(...entry.areas.map((area) => distanceMetres(area, point)));
              return distance < .001 ? entry.radius : Math.floor(entry.radius - distance - 2);
            });
            const available = Math.min(...radii);
            return available >= minRadius ? [{ entry, available }] : [];
          }).sort((a, b) => b.entry.fetchedAt - a.entry.fetchedAt || b.available - a.available);
          for (const { entry, available } of candidates) {
            let value;
            try { const text = await store.getItem(entry.id); progress(); value = await decodeScene(text, entry.areas, maxEntryBytes, progress); } catch { continue; }
            if (!value || value.source !== entry.source || value.radius !== entry.radius) continue;
            entry.usedAt = now();
            try { await persist([...entries], progress); } catch { /* Cached data is still usable. */ }
            return { value: { ...value, radius: available }, entryId: entry.id, fetchedAt: entry.fetchedAt, stale: now() - entry.fetchedAt >= freshMs };
          }
          return null;
        });
      } catch { return null; }
    },
    async save(points, scene, { fetchedAt = now() } = {}) {
      if (!scene || !validAreas(points, scene.source, scene.radius) || !Number.isFinite(fetchedAt) || fetchedAt > now() + 60000 || fetchedAt < 0) return false;
      const areas = points.map(({ latitude, longitude }) => ({ latitude, longitude }));
      try {
        return await exclusive(async (progress) => {
          // Queue before yielding: a clear requested during preparation must
          // run afterwards, so an old download cannot recreate cleared data.
          const encoded = await encodeScene(scene, areas, Math.min(maxEntryBytes, maxBytes), progress);
          if (!encoded) return false;
          const { text, size } = encoded;
          const entries = await index(progress);
          let id;
          do { id = `scene-${Math.floor(now()).toString(36)}-${(++sequence).toString(36)}`; }
          while (entries.some((item) => item.id === id));
          const entry = { id, areas, source: scene.source, radius: scene.radius, fetchedAt, usedAt: now(), size };
          const same = entries.filter((item) => item.source === entry.source && item.radius === entry.radius && JSON.stringify(item.areas) === JSON.stringify(entry.areas));
          if (same.some((item) => item.fetchedAt > entry.fetchedAt)) return false;
          const next = [...entries.filter((item) => !same.includes(item)), entry].sort((a, b) => b.usedAt - a.usedAt);
          let total = 0;
          const retained = [], removed = [...same];
          for (const item of next) {
            if (retained.length < maxEntries && total + item.size <= maxBytes) { retained.push(item); total += item.size; }
            else removed.push(item);
          }
          if (!retained.includes(entry)) return false;
          await store.setItem(id, text); progress();
          try { await persist(retained, progress); } catch (error) { try { await store.removeItem(id); } catch {} throw error; }
          await remove(removed, progress);
          return true;
        });
      } catch { return false; }
    },
    async clear() {
      try {
        return await exclusive(async (progress) => {
          const entries = await index(progress);
          const names = new Set(entries.map((item) => item.id));
          if (typeof store.listItems === 'function') {
            // Also retry orphan cleanup left by an interrupted or failed clear.
            const files = await store.listItems(); progress();
            for (const name of files) if (/^scene-[a-z0-9-]+$/.test(name)) names.add(name);
          }
          await persist([], progress);
          let complete = true;
          for (const name of names) { try { await store.removeItem(name); progress(); } catch { complete = false; } }
          return complete;
        });
      }
      catch { return false; }
    },
  };
  return cache;
}
