import { inMadridArea } from '../../frontend/shared/madrid-scene.mjs';
import { inBarcelonaArea } from '../../frontend/shared/barcelona-terraces.mjs';
import { distanceMetres } from '../../frontend/shared/places.mjs';

// Each saved result is one provider's exact query/centre/radius, never a
// catalogue or a merged collection from several providers. Nearby-centre
// reuse is explicitly partial because places at the edge may be missing.
const VERSION = 1;
const INDEX = 'index';
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_ENTRY_BYTES = 256 * 1024;
const DEFAULT_FRESH_MS = 24 * 60 * 60 * 1000;
const PROVIDERS = new Set(['osm-search', 'osm-nearby', 'osm-nearby-eu', 'madrid-terraces', 'madrid-parks', 'barcelona-terraces']);

function validateSpec(input) {
  if (!input || !PROVIDERS.has(input.source) || typeof input.query !== 'string' || input.query.length > 80 ||
      /[\x00-\x1f]/.test(input.query) || !Number.isFinite(input.radius) || input.radius < 100 || input.radius > 5000) return null;
  const center = input.center;
  if (!center || !Number.isFinite(center.latitude) || !Number.isFinite(center.longitude)) return null;
  const madrid = inMadridArea(center), barcelona = inBarcelonaArea(center);
  if (!madrid && !barcelona) return null;
  if (input.source.startsWith('madrid-') && !madrid) return null;
  if (input.source === 'barcelona-terraces' && !barcelona) return null;
  if (input.source === 'osm-search' && input.query.trim().length < 2) return null;
  if (['osm-nearby', 'osm-nearby-eu'].includes(input.source) && input.query !== '') return null;
  if (input.source === 'osm-nearby-eu' && !madrid) return null;
  return { source: input.source, query: input.query, center: { latitude: center.latitude, longitude: center.longitude }, radius: input.radius };
}

function specKey(spec) {
  return JSON.stringify([spec.source, spec.query, spec.center.latitude, spec.center.longitude, spec.radius]);
}

function sameSearch(a, b) {
  return a.source === b.source && a.query === b.query && a.radius === b.radius;
}

function sanitisePlaces(places) {
  if (!Array.isArray(places) || places.length > 1000) return null;
  const result = [];
  for (const value of places) {
    if (!value || typeof value.id !== 'string' || !value.id || value.id.length > 250 ||
        typeof value.name !== 'string' || !value.name.trim() || value.name.length > 180 ||
        !Number.isFinite(value.latitude) || Math.abs(value.latitude) > 85 ||
        !Number.isFinite(value.longitude) || Math.abs(value.longitude) > 180 ||
        !Number.isFinite(value.distance) || value.distance < 0 ||
        !['business', 'public', 'place'].includes(value.kind)) return null;
    const item = { id: value.id, name: value.name, latitude: value.latitude, longitude: value.longitude,
      kind: value.kind, distance: value.distance };
    if (typeof value.outdoor === 'boolean') item.outdoor = value.outdoor;
    if (typeof value.categoryUnknown === 'boolean') item.categoryUnknown = value.categoryUnknown;
    if (value.municipalPeriod) {
      const { year, semester } = value.municipalPeriod;
      if (!Number.isInteger(year) || year < 1900 || year > 2200 || ![1, 2].includes(semester)) return null;
      item.municipalPeriod = { year, semester };
    }
    result.push(item);
  }
  return result;
}

function byteLength(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n++;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

// Keep searches and coordinates inside the private, purgeable app cache. The
// application passes Expo FileSystem; tests may pass an in-memory substitute.
export function createSearchFileStore(FileSystem) {
  const root = FileSystem?.cacheDirectory ? `${FileSystem.cacheDirectory}rato-search-cache-v1/` : null;
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
    if (!/^(?:index|item-[a-z0-9-]+)$/.test(name)) throw new Error('Invalid cache file');
    return `${root}${name}.json`;
  }
  return {
    async getItem(name) { await ready(); const file = path(name); const info = await FileSystem.getInfoAsync(file); return info.exists ? FileSystem.readAsStringAsync(file) : null; },
    async setItem(name, value) { await ready(); await FileSystem.writeAsStringAsync(path(name), value); },
    async removeItem(name) { await ready(); await FileSystem.deleteAsync(path(name), { idempotent: true }); },
    async prune(validIds) {
      await ready();
      if (typeof FileSystem.readDirectoryAsync !== 'function') return false;
      const keep = new Set(validIds);
      let removed = true;
      for (const filename of await FileSystem.readDirectoryAsync(root)) {
        const match = /^(item-[a-z0-9-]+)\.json$/.exec(filename);
        if (match && !keep.has(match[1])) {
          try { await FileSystem.deleteAsync(path(match[1]), { idempotent: true }); } catch { removed = false; }
        }
      }
      return removed;
    },
  };
}

// Cache failures (including a hanging storage provider) never block search.
// A caller must explicitly certify a finished single-provider response. Dates
// describe the original fetch, not the most recent time the result was viewed.
export function createSearchCache(store, { now = Date.now, maxBytes = DEFAULT_MAX_BYTES,
  maxEntryBytes = DEFAULT_MAX_ENTRY_BYTES, maxEntries = 50, freshMs = DEFAULT_FRESH_MS, ioTimeoutMs = 1200,
  maxCenterShiftMetres = 25 } = {}) {
  let chain = Promise.resolve(), metadata = null, sequence = 0;
  const exclusive = (action) => { const task = chain.then(action); chain = task.catch(() => {}); return task; };
  function bounded(task, fallback) {
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ioTimeoutMs); });
    return Promise.race([task.catch(() => fallback), timeout]).finally(() => clearTimeout(timer));
  }
  async function index() {
    if (metadata) return metadata;
    try {
      const data = JSON.parse(await store.getItem(INDEX) || 'null');
      metadata = data?.version === VERSION && Array.isArray(data.entries) ? data.entries.filter((entry) =>
        typeof entry?.id === 'string' && /^item-[a-z0-9-]+$/.test(entry.id) && validateSpec(entry.spec) &&
        Number.isFinite(entry.fetchedAt) && Number.isFinite(entry.usedAt) && Number.isSafeInteger(entry.size) && entry.size >= 0)
        .slice(0, maxEntries) : [];
    } catch { metadata = []; }
    // Reclaim files left by an interrupted write or corrupt index, only in our
    // dedicated directory. The serialized queue prevents racing a live save.
    try { if (store.prune) await store.prune(metadata.map((entry) => entry.id)); } catch { /* best effort */ }
    return metadata;
  }
  async function persist(entries) { await store.setItem(INDEX, JSON.stringify({ version: VERSION, entries })); metadata = entries; }
  async function remove(entries) {
    let removed = true;
    for (const item of entries) { try { await store.removeItem(item.id); } catch { removed = false; } }
    return removed;
  }
  return {
    async find(input) {
      const spec = validateSpec(input);
      if (!spec) return null;
      return bounded(exclusive(async () => {
        const entries = await index();
        const candidates = entries.filter((item) => sameSearch(item.spec, spec) && item.fetchedAt <= now() + 60000)
          .map((entry) => ({ entry, shift: distanceMetres(entry.spec.center, spec.center) }))
          .filter((item) => item.shift <= maxCenterShiftMetres)
          .sort((a, b) => a.shift - b.shift || b.entry.fetchedAt - a.entry.fetchedAt);
        for (const { entry, shift } of candidates) {
          let value;
          try { value = JSON.parse(await store.getItem(entry.id)); } catch { continue; }
          const savedSpec = validateSpec(value?.spec);
          if (value?.version !== VERSION || value.complete !== true || !savedSpec || specKey(savedSpec) !== specKey(entry.spec)) continue;
          let places = sanitisePlaces(value.places);
          if (!places) continue;
          const moved = shift > 0;
          const partial = value.partial === true || moved;
          if (moved) places = places.map((place) => ({ ...place, distance: distanceMetres(spec.center, place) }))
            .filter((place) => place.distance <= spec.radius).sort((a, b) => a.distance - b.distance);
          entry.usedAt = now();
          // Remember recency in memory and persist it with the next write; an
          // index write must not delay a cache hit or trigger a network fallback.
          return { places, source: spec.source, fetchedAt: entry.fetchedAt, stale: now() - entry.fetchedAt >= freshMs,
            partial, centerShiftMetres: shift };
        }
        return null;
      }), null);
    },
    async save(input, places, { complete = false, partial = false, fetchedAt = now() } = {}) {
      const spec = validateSpec(input), safe = sanitisePlaces(places);
      if (!spec || !safe || complete !== true || typeof partial !== 'boolean' || !Number.isFinite(fetchedAt) || fetchedAt < 0 || fetchedAt > now() + 60000) return false;
      const text = JSON.stringify({ version: VERSION, complete: true, partial, spec, places: safe });
      const size = byteLength(text);
      if (size > maxEntryBytes || size > maxBytes) return false;
      return bounded(exclusive(async () => {
        const entries = await index();
        // A response that arrived late must not replace a newer snapshot.
        if (entries.some((item) => specKey(item.spec) === specKey(spec) && item.fetchedAt > fetchedAt)) return false;
        let id;
        do { id = `item-${Math.floor(now()).toString(36)}-${(++sequence).toString(36)}`; } while (entries.some((item) => item.id === id));
        const entry = { id, spec, fetchedAt, usedAt: now(), size };
        const replaced = entries.filter((item) => specKey(item.spec) === specKey(spec));
        const next = entries.filter((item) => !replaced.includes(item));
        next.push(entry); next.sort((a, b) => b.usedAt - a.usedAt);
        let total = 0;
        const retained = [], removed = [...replaced];
        for (const item of next) {
          const indexSize = byteLength(JSON.stringify({ version: VERSION, entries: [...retained, item] }));
          if (retained.length < maxEntries && total + item.size + indexSize <= maxBytes) { retained.push(item); total += item.size; }
          else removed.push(item);
        }
        if (!retained.includes(entry)) return false;
        await store.setItem(id, text);
        try { await persist(retained); } catch (error) { try { await store.removeItem(id); } catch {} throw error; }
        await remove(removed);
        return true;
      }), false);
    },
    async clear() {
      return bounded(exclusive(async () => {
        const entries = await index();
        const removed = await remove(entries);
        const pruned = store.prune ? await store.prune([]) : true;
        if (!removed || !pruned) return false;
        await persist([]);
        return true;
      }), false);
    },
  };
}
