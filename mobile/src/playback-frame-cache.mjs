import { shadowFrameMatches } from './shadow-frame.mjs';

// Retain only small frame descriptors and their files. Shadow polygon arrays
// are deliberately excluded: keeping many copies exhausts memory in cities.
// Cache entries have exact scene identities and can never be reused for a
// different time, position, building dataset or cache generation.
export function createPlaybackFrameCache({ retain, release, retire, exists, now = Date.now,
  maxEntries = 72, maxBytes = 8 * 1024 * 1024 } = {}) {
  if (![retain, release, retire, exists, now].every((fn) => typeof fn === 'function') ||
      !Number.isSafeInteger(maxEntries) || maxEntries < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError('Invalid playback cache options');
  }
  const entries = [];
  let bytes = 0;
  function dayAllowed(timestamp) {
    if (!Number.isFinite(timestamp)) return false;
    const current = new Date(now()), tomorrow = new Date(current);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const day = new Date(timestamp);
    const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    return sameDay(day, current) || sameDay(day, tomorrow);
  }
  function removeAt(index) {
    const [entry] = entries.splice(index, 1);
    bytes -= entry.size;
    release(entry.frame.uri);
    retire(entry.frame.uri);
  }
  function pruneExpired() {
    for (let i = entries.length - 1; i >= 0; i--) if (!dayAllowed(entries[i].frame.timeKey)) removeAt(i);
  }
  function clear() { while (entries.length) removeAt(entries.length - 1); }
  function put(frame, size) {
    pruneExpired();
    if (!frame || frame.failed || typeof frame.uri !== 'string' || !frame.uri ||
        !Array.isArray(frame.area) || frame.area.length !== 4 || !frame.area.every(Number.isFinite) ||
        !Array.isArray(frame.bounds) || frame.bounds.length !== 2 ||
        !frame.bounds.every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)) ||
        !frame.buildings || !Number.isFinite(frame.latitude) || !Number.isFinite(frame.longitude) ||
        frame.retryToken == null || frame.generation == null || !dayAllowed(frame.timeKey) ||
        !Number.isSafeInteger(size) || size < 1 || size > maxBytes) return false;
    // Retain first in case this exact URI already exists in the cache.
    retain(frame.uri);
    const existing = entries.findIndex((entry) => shadowFrameMatches(entry.frame, frame));
    if (existing >= 0) removeAt(existing);
    const { area, buildings, retryToken, generation, timeKey, latitude, longitude, geometrySource, uri, bounds } = frame;
    entries.unshift({ frame: { area, buildings, retryToken, generation, timeKey, latitude, longitude, geometrySource, uri, bounds }, size });
    bytes += size;
    while (entries.length > maxEntries || bytes > maxBytes) removeAt(entries.length - 1);
    return true;
  }
  async function get(context, source) {
    pruneExpired();
    const index = entries.findIndex((entry) => shadowFrameMatches(entry.frame, context));
    if (index < 0) return null;
    const entry = entries[index];
    let valid = false;
    try { valid = Boolean(await exists(entry.frame.uri)); } catch { /* Missing or purged files are cache misses. */ }
    const currentIndex = entries.indexOf(entry);
    if (currentIndex < 0) return null;
    if (!valid || !dayAllowed(entry.frame.timeKey)) { removeAt(currentIndex); return null; }
    entries.splice(currentIndex, 1);
    entries.unshift(entry);
    // Supply a lightweight empty collection when consuming the finished PNG.
    // The caller must not rasterize it again or represent it as missing data.
    return { ...entry.frame, source };
  }
  function keepScene(context) {
    pruneExpired();
    for (let i = entries.length - 1; i >= 0; i--) {
      const frame = entries[i].frame;
      if (!context || !shadowFrameMatches(frame, { ...context, timeKey: frame.timeKey })) removeAt(i);
    }
  }
  return { get, put, keepScene, prune: pruneExpired, clear, stats: () => ({ entries: entries.length, bytes }) };
}
