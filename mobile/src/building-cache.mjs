import { inMadridArea } from '../../frontend/shared/madrid-scene.mjs';
import { inBarcelonaArea } from '../../frontend/shared/barcelona-terraces.mjs';

// Areas and dates can reveal places viewed; they remain in app-private cache.
// No GPS coordinates, search terms or individual visits are recorded.
const INDEX = 'index';
// Version 2 stores bounded pieces; v1 single-file indexes are ignored safely.
const VERSION = 2;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 40;
const DEFAULT_FRESH_MS = 30 * 24 * 60 * 60 * 1000;
const CHUNK_BYTES = 256 * 1024;
const FEATURE_VERTEX_LIMIT = 6000;
const fileStores = new WeakMap();
const cacheChains = new WeakMap();
const indexHints = new WeakMap();

function validBounds(bounds) {
  return Array.isArray(bounds) && bounds.length === 4 && bounds.every(Number.isFinite) &&
    bounds[0] >= -180 && bounds[2] <= 180 && bounds[1] >= -85 && bounds[3] <= 85 &&
    bounds[0] < bounds[2] && bounds[1] < bounds[3];
}
function covers(outer, inner) {
  return validBounds(outer) && validBounds(inner) && outer[0] <= inner[0] && outer[1] <= inner[1] &&
    outer[2] >= inner[2] && outer[3] >= inner[3];
}
function areaBoundsForSource(bounds, source) {
  if (!validBounds(bounds)) return false;
  const points = [
    { longitude: bounds[0], latitude: bounds[1] }, { longitude: bounds[0], latitude: bounds[3] },
    { longitude: bounds[2], latitude: bounds[1] }, { longitude: bounds[2], latitude: bounds[3] },
  ];
  return source === 'madrid' ? points.every(inMadridArea) : source === 'osm' && points.every(inBarcelonaArea);
}
function validEnvelope(value) {
  return Boolean(value && value.type === 'FeatureCollection' && areaBoundsForSource(value.bounds, value.source) &&
      !value.limitExceeded && !value.exceededTransferLimit && !value.incomplete && !value.error &&
      Array.isArray(value.features) && value.features.length && value.features.length <= 8000 &&
      Number.isSafeInteger(value.omitted || 0) && (value.omitted || 0) >= 0);
}
async function validateFeature(feature, state, yieldControl) {
  if (feature?.type !== 'Feature' || !Number.isFinite(feature.properties?.height) ||
      feature.properties.height <= 0 || feature.properties.height > 500) return false;
  const geometry = feature.geometry;
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : null;
  if (!Array.isArray(polygons) || !polygons.length) return false;
  let featureVertices = 0;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) return false;
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4 || ring.length > 10000 ||
          (featureVertices += ring.length) > FEATURE_VERTEX_LIMIT || (state.vertices += ring.length) > 200000) return false;
      for (const p of ring) {
        if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) ||
            Math.abs(p[0]) > 180 || Math.abs(p[1]) > 85) return false;
        if (++state.sinceYield >= 4000) { state.sinceYield = 0; await yieldControl(); }
      }
    }
  }
  return true;
}
/*
 * Do not stringify an entire city's response: even a valid several-megabyte
 * JSON blocks the JavaScript thread. Each isolated piece is small enough to
 * parse/stringify independently, and no incomplete area is ever returned.
 */
async function encodeChunks(value, yieldControl) {
  if (!validEnvelope(value)) return null;
  const state = { vertices: 0, sinceYield: 0 }, chunks = [];
  let elements = [], chunkBytes = 2, total = 0;
  for (const feature of value.features) {
    if (!await validateFeature(feature, state, yieldControl)) return null;
    const safe = { type: 'Feature', properties: { height: feature.properties.height, id: feature.properties.id },
      geometry: { type: feature.geometry.type, coordinates: feature.geometry.coordinates } };
    const text = JSON.stringify(safe), length = bytes(text);
    if (length + 2 > CHUNK_BYTES) return null;
    if (chunkBytes + length + (elements.length ? 1 : 0) > CHUNK_BYTES) {
      const data = `[${elements.join(',')}]`;
      chunks.push({ data, size: chunkBytes }); total += chunkBytes;
      elements = []; chunkBytes = 2;
      await yieldControl();
    }
    chunkBytes += length + (elements.length ? 1 : 0);
    elements.push(text);
  }
  if (elements.length) { chunks.push({ data: `[${elements.join(',')}]`, size: chunkBytes }); total += chunkBytes; }
  return { chunks, size: total };
}
/* previous cache versions can be safely discarded; they are never treated as
   a complete area unless their whole v2 manifest and chunks validate. */
function validMetadata(entry, maxEntryBytes) {
  if (!entry || typeof entry.id !== 'string' || !/^area-[a-z0-9-]+$/.test(entry.id) ||
      !areaBoundsForSource(entry.bounds, entry.source) || !Number.isSafeInteger(entry.size) || entry.size <= 0 ||
      entry.size > maxEntryBytes || !Number.isFinite(entry.fetchedAt) || !Number.isFinite(entry.usedAt) ||
      !Number.isSafeInteger(entry.omitted) || entry.omitted < 0 || !Number.isSafeInteger(entry.count) ||
      entry.count < 1 || entry.count > 8000 || !Array.isArray(entry.parts) || !entry.parts.length || entry.parts.length > 128) return false;
  let sum = 0;
  const ids = new Set();
  for (const part of entry.parts) {
    if (typeof part?.id !== 'string' || !part.id.startsWith(`${entry.id}-p`) || !/^area-[a-z0-9-]+$/.test(part.id) ||
        ids.has(part.id) || !Number.isSafeInteger(part.size) || part.size <= 1 || part.size > CHUNK_BYTES) return false;
    ids.add(part.id); sum += part.size;
  }
  return sum === entry.size;
}
function bytes(text) {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) count++;
    else if (code < 0x800) count += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { count += 4; i++; }
    else count += 3;
  }
  return count;
}

// FileSystem is injected so the same behavior can be tested without a phone.
// Only names created by this cache can be read or deleted in its directory.
export function createBuildingFileStore(FileSystem) {
  if (FileSystem && fileStores.has(FileSystem)) return fileStores.get(FileSystem);
  const root = FileSystem?.cacheDirectory ? `${FileSystem.cacheDirectory}rato-building-cache-v1/` : null;
  let directory, serial = Promise.resolve(), tempSequence = 0, pruneSafe = false;
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
    if (!/^(?:index-[ab]|index-temp-[a-z0-9-]+|area-[a-z0-9-]+)$/.test(name)) throw new Error('Invalid cache file');
    return `${root}${name}.json`;
  }
  async function perform(operation) {
    await ready();
    try { return await operation(); }
    catch {
      // The OS may purge the cache directory while the app is running.
      directory = null;
      await ready();
      return operation();
    }
  }
  async function readFile(name) {
    const file = path(name);
    return perform(async () => {
      const info = await FileSystem.getInfoAsync(file, { size: true });
      // A damaged cache file must not force a very large synchronous JSON parse.
      if (!info.exists || (name.startsWith('area-') && Number.isFinite(info.size) && info.size > CHUNK_BYTES)) return null;
      return FileSystem.readAsStringAsync(file);
    });
  }
  async function indexCopies() {
    const copies = [];
    let allReadable = true;
    for (const name of ['index-a', 'index-b']) {
      let text;
      try { text = await readFile(name); }
      catch { allReadable = false; continue; }
      if (text === null) continue;
      try {
        const wrapper = JSON.parse(text);
        const payload = JSON.parse(wrapper?.data || 'null');
        if (Number.isSafeInteger(wrapper?.revision) && wrapper.revision > 0 && payload?.version === VERSION && Array.isArray(payload.entries)) copies.push({ name, ...wrapper });
        else allReadable = false;
      } catch { allReadable = false; /* Keep orphan files if an index might be recoverable. */ }
    }
    pruneSafe = allReadable && copies.length > 0;
    return copies.sort((a, b) => b.revision - a.revision);
  }
  function serialized(action) {
    const result = serial.then(action);
    serial = result.catch(() => {});
    return result;
  }
  const store = {
    async getItem(name) { return name === INDEX ? (await serialized(indexCopies))[0]?.data || null : readFile(name); },
    async setItem(name, value) {
      if (name !== INDEX) return perform(() => FileSystem.writeAsStringAsync(path(name), value));
      return serialized(async () => {
        const copies = await indexCopies();
        const target = copies[0]?.name === 'index-a' ? 'index-b' : 'index-a';
        const temp = `index-temp-${Date.now().toString(36)}-${(++tempSequence).toString(36)}`;
        await perform(() => FileSystem.writeAsStringAsync(path(temp), JSON.stringify({ revision: (copies[0]?.revision || 0) + 1, data: value })));
        await perform(() => FileSystem.moveAsync({ from: path(temp), to: path(target) }));
      });
    },
    async removeItem(name) { await perform(() => FileSystem.deleteAsync(path(name), { idempotent: true })); },
    async pruneOrphans(activeIds, time = Date.now()) {
      if (!pruneSafe) return;
      await ready();
      const active = new Set(activeIds);
      const names = await FileSystem.readDirectoryAsync(root);
      for (const filename of names) {
        const match = /^(area-[a-z0-9-]+|index-temp-[a-z0-9-]+)\.json$/.exec(filename);
        if (!match || active.has(match[1])) continue;
        const uri = path(match[1]);
        try {
          const info = await FileSystem.getInfoAsync(uri);
          // A second instance may currently be committing its area file.
          if (info.exists && Number.isFinite(info.modificationTime) && info.modificationTime * 1000 < time - 10 * 60 * 1000)
            await FileSystem.deleteAsync(uri, { idempotent: true });
        } catch { /* Ignore cache files the OS already purged. */ }
      }
    },
    async purgeCache(progress = () => {}) {
      await ready();
      const names = await FileSystem.readDirectoryAsync(root);
      progress();
      for (const filename of names) {
        const match = /^(index-[ab]|area-[a-z0-9-]+|index-temp-[a-z0-9-]+)\.json$/.exec(filename);
        if (match) { await FileSystem.deleteAsync(path(match[1]), { idempotent: true }); progress(); }
      }
    },
  };
  if (FileSystem) fileStores.set(FileSystem, store);
  return store;
}

// `fetchedAt` must be the oldest real provider fetch represented in `value`;
// callers must not renew it when a response comes from cache or combines areas.
// A stale result is returned immediately and marked for the UI; the caller
// can offer an explicit refresh and replace it only after a successful fetch.
export function createBuildingCache(store, { now = Date.now, maxBytes = DEFAULT_MAX_BYTES,
  maxEntryBytes = DEFAULT_MAX_ENTRY_BYTES, maxEntries = DEFAULT_MAX_ENTRIES, freshMs = DEFAULT_FRESH_MS, ioTimeoutMs = 1200,
  yieldControl = () => new Promise((resolve) => setTimeout(resolve, 0)) } = {}) {
  let sequence = 0, cleaned = false;
  const exclusive = (action) => {
    const result = (cacheChains.get(store) || Promise.resolve()).then(action);
    cacheChains.set(store, result.catch(() => {}));
    return result;
  };
  function bounded(action, fallback) {
    let timer, done = false, progress;
    const timeout = new Promise((resolve) => {
      progress = () => {
        if (done) return;
        clearTimeout(timer);
        timer = setTimeout(() => resolve(fallback), ioTimeoutMs);
      };
      progress();
    });
    const task = exclusive(() => action(progress));
    return Promise.race([task.catch(() => fallback), timeout]).finally(() => { done = true; clearTimeout(timer); });
  }
  async function index() {
    let metadata, validIndex = false;
    try {
      const data = JSON.parse(await store.getItem(INDEX) || 'null');
      validIndex = data?.version === VERSION && Array.isArray(data.entries);
      metadata = data?.version === VERSION && Array.isArray(data.entries)
        ? data.entries.filter((entry) => validMetadata(entry, maxEntryBytes)).slice(0, maxEntries) : [];
    } catch { metadata = []; }
    if (validIndex && !cleaned && typeof store.pruneOrphans === 'function') {
      cleaned = true;
      try { await store.pruneOrphans(metadata.flatMap((entry) => entry.parts.map((part) => part.id)), now()); } catch { /* Cache remains usable. */ }
    }
    // Retain only the small, already validated index as a hint. Full reads
    // still validate every chunk: the OS can purge files at any time.
    // A missing or unreadable index cannot prove a disk miss: the file
    // adapter may also report null on transient I/O failures. Keep the hint
    // unknown until an actual index has been read or successfully written.
    indexHints.set(store, validIndex ? metadata : null);
    return metadata;
  }
  async function persistIndex(entries) {
    await store.setItem(INDEX, JSON.stringify({ version: VERSION, entries }));
    indexHints.set(store, entries);
  }
  async function removeEntries(entries, strict = false, progress = () => {}) {
    for (const item of entries) {
      for (const part of item.parts) {
        try { await store.removeItem(part.id); progress(); }
        catch (error) { if (strict) throw error; /* Eviction is best effort. */ }
      }
    }
  }
  return {
    // A cheap hint avoids a disk scan before an incremental request, while
    // never making a known saved, complete area compete with the network.
    // Null means the index has not yet been read and must not be treated as
    // a miss. `find` remains the sole authority for valid saved data.
    coverageHint(bounds) {
      const metadataSnapshot = indexHints.get(store);
      if (!validBounds(bounds) || !Array.isArray(metadataSnapshot)) return null;
      return metadataSnapshot.some((entry) => covers(entry.bounds, bounds) && entry.fetchedAt <= now() + 60000);
    },
    async find(bounds) {
      if (!validBounds(bounds)) return null;
      try {
        return await bounded(async (progress) => {
          const yieldWithProgress = async () => { progress(); await yieldControl(); progress(); };
          const entries = await index();
          progress();
          const candidates = entries.filter((entry) => covers(entry.bounds, bounds) && entry.fetchedAt <= now() + 60000)
            .sort((a, b) => b.fetchedAt - a.fetchedAt);
          for (const entry of candidates) {
            const features = [], state = { vertices: 0, sinceYield: 0 };
            let complete = true;
            for (const part of entry.parts) {
              let data;
              try {
                const text = await store.getItem(part.id);
                progress();
                if (typeof text !== 'string' || bytes(text) !== part.size) { complete = false; break; }
                data = JSON.parse(text);
              } catch { complete = false; break; }
              if (!Array.isArray(data) || !data.length || features.length + data.length > entry.count) { complete = false; break; }
              for (const feature of data) {
                if (!await validateFeature(feature, state, yieldWithProgress)) { complete = false; break; }
                features.push(feature);
              }
              if (!complete) break;
              await yieldWithProgress();
            }
            if (!complete || features.length !== entry.count) continue;
            const value = { type: 'FeatureCollection', source: entry.source, bounds: [...entry.bounds], omitted: entry.omitted, features };
            entry.usedAt = now();
            // Saving access time is best effort; a read must not fail on a full disk.
            try { await persistIndex([...entries]); } catch { /* Keep usable data. */ }
            return { value, fetchedAt: entry.fetchedAt, stale: now() - entry.fetchedAt >= freshMs };
          }
          return null;
        }, null);
      } catch { return null; }
    },
    async save(value, { fetchedAt = now() } = {}) {
      if (!validEnvelope(value) || !Number.isFinite(fetchedAt) || fetchedAt > now() + 60000 || fetchedAt < 0) return false;
      try {
        return await bounded(async (progress) => {
          const yieldWithProgress = async () => { progress(); await yieldControl(); progress(); };
          const encoded = await encodeChunks(value, yieldWithProgress);
          if (!encoded || encoded.size > maxEntryBytes || encoded.size > maxBytes) return false;
          const { chunks, size } = encoded;
          const entries = await index();
          progress();
          let id;
          do { id = `area-${Math.floor(now()).toString(36)}-${(++sequence).toString(36)}`; }
          while (entries.some((item) => item.id === id));
          const parts = chunks.map((chunk, i) => ({ id: `${id}-p${i.toString(36)}`, size: chunk.size }));
          const entry = { id, bounds: [...value.bounds], source: value.source, omitted: value.omitted || 0,
            count: value.features.length, fetchedAt, usedAt: now(), size, parts };
          const same = entries.filter((item) => item.source === entry.source && item.bounds.join(',') === entry.bounds.join(','));
          if (same.some((item) => item.fetchedAt > fetchedAt)) return false;
          let next = entries.filter((item) => !same.includes(item));
          next.push(entry);
          next.sort((a, b) => b.usedAt - a.usedAt);
          let total = 0;
          const retained = [], removed = [...same];
          for (const item of next) {
            if (retained.length < maxEntries && total + item.size <= maxBytes) { retained.push(item); total += item.size; }
            else removed.push(item);
          }
          if (!retained.includes(entry)) return false;
          const written = [];
          try {
            for (let i = 0; i < parts.length; i++) {
              await store.setItem(parts[i].id, chunks[i].data);
              progress();
              written.push(parts[i]);
              await yieldWithProgress();
            }
            await persistIndex(retained);
          } catch (error) {
            await removeEntries([{ parts: written }], false, progress);
            throw error;
          }
          await removeEntries(removed, false, progress);
          return true;
        }, false);
      } catch { return false; }
    },
    async clear() {
      return bounded(async (progress) => {
        const entries = await index();
        progress();
        // Do not acknowledge a privacy-sensitive clear while any area remains.
        // Retain the index if removal fails so the operation can be retried.
        await removeEntries(entries, true, progress);
        progress();
        await persistIndex([]);
        progress();
        // Remove both index copies as they also contain viewed area bounds.
        if (typeof store.purgeCache === 'function') await store.purgeCache(progress);
        return true;
      }, false);
    },
  };
}
