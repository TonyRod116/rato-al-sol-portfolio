// Private cache of our own rendered masks, never the underlying map tiles.
// Filenames contain only a validated day and caller-supplied geometry digest.
const MAX_BYTES = 8 * 1024 * 1024, MAX_ENTRY_BYTES = 1024 * 1024, MAX_ENTRIES = 128;
const NAME = /^shadow-(\d{4}-\d{2}-\d{2})-([a-zA-Z0-9_-]{1,128})\.png$/;
const TEMP = /^rato-shadow-cache-hit-[a-z0-9-]+\.png$/;
const SOURCE = /^(?:rato-shadow-[a-z0-9-]+|rato-native-shadow-\d{12,16}-\d+)\.png$/;
const ABANDONED = /^rato-(?:shadow-(?:bitmap-)?|native-shadow-)(\d{12,16})-\d+\.png$/;
const pad = (n) => String(n).padStart(2, '0');
export function localShadowDay(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function allowedDay(day, time) {
  if (typeof day !== 'string') return false;
  const today = new Date(time), tomorrow = new Date(time);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return day === localShadowDay(today) || day === localShadowDay(tomorrow);
}
function validKey(key) { return typeof key === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(key); }

// Serialize writes, eviction and clearing; a copied hit has its own temporary
// URI so that evicting a cached original cannot invalidate a visible overlay.
export function createShadowCache(fs, { now = Date.now, maxBytes = MAX_BYTES, maxEntryBytes = MAX_ENTRY_BYTES,
  maxEntries = MAX_ENTRIES, currentGeneration = () => 0 } = {}) {
  const cacheRoot = fs?.cacheDirectory;
  const root = cacheRoot ? `${cacheRoot}rato-shadow-cache-v1/` : null;
  // Constructed before the app renders any new raster. Source filenames embed
  // their creation timestamp; older ones are abandoned by a previous run.
  const processStarted = now();
  let serial = Promise.resolve(), sequence = 0, epoch = 0, cleanedHits = false, index = null, indexDay = null;
  function enqueue(action) {
    const result = serial.then(action);
    serial = result.catch(() => {});
    return result.catch(() => null);
  }
  async function ready() {
    if (!root) throw new Error('Cache directory unavailable');
    const info = await fs.getInfoAsync(root);
    if (!info.exists) {
      await fs.makeDirectoryAsync(root, { intermediates: true });
      index = null; indexDay = null;
    }
    else if (!info.isDirectory) throw new Error('Invalid cache directory');
    if (!cleanedHits) {
      cleanedHits = true;
      // Temporary hits are never retained across app launches. The cache is
      // constructed before rendering begins, so a source generated before
      // processStarted was left by a previous run. Keep same-timestamp and
      // newer sources because the map may already use them.
      const names = await fs.readDirectoryAsync(cacheRoot);
      for (const name of names) {
        const match = ABANDONED.exec(name);
        if (TEMP.test(name) || (match && Number(match[1]) < processStarted))
          await fs.deleteAsync(`${cacheRoot}${name}`, { idempotent: true });
      }
    }
  }
  const valid = (key, day) => validKey(key) && allowedDay(day, now());
  const current = (operationEpoch, generation) => operationEpoch === epoch &&
    (generation === undefined || generation === currentGeneration());
  async function pruneEntries(preferName = '', force = false) {
    const today = localShadowDay(new Date(now()));
    if (!index || indexDay !== today || force) {
      index = new Map(); indexDay = today;
      for (const name of await fs.readDirectoryAsync(root)) {
        const match = NAME.exec(name);
        if (!match) {
          if (/^temp-[a-z0-9-]+\.png$/.test(name)) await fs.deleteAsync(`${root}${name}`, { idempotent: true });
          continue;
        }
        const info = await fs.getInfoAsync(`${root}${name}`, { size: true });
        if (!info.exists) continue;
        if (!allowedDay(match[1], now()) || !Number.isFinite(info.size) || info.size < 1 || info.size > maxEntryBytes) {
          await fs.deleteAsync(`${root}${name}`, { idempotent: true });
          continue;
        }
        index.set(name, { name, size: info.size, modified: (info.modificationTime || 0) * 1000 });
      }
    }
    const retained = [...index.values()].sort((a, b) => Number(b.name === preferName) - Number(a.name === preferName) ||
      b.modified - a.modified || (b.order || 0) - (a.order || 0) || a.name.localeCompare(b.name));
    let bytes = 0, count = 0;
    for (const entry of retained) {
      if (++count > maxEntries || bytes + entry.size > maxBytes) {
        await fs.deleteAsync(`${root}${entry.name}`, { idempotent: true }); index.delete(entry.name);
      }
      else bytes += entry.size;
    }
  }
  return {
    get(key, day, { generation } = {}) {
      const operationEpoch = epoch;
      if (!valid(key, day)) return Promise.resolve(null);
      return enqueue(async () => {
        if (!current(operationEpoch, generation)) return null;
        await ready(); await pruneEntries();
        const uri = `${root}shadow-${day}-${key}.png`;
        const info = await fs.getInfoAsync(uri, { size: true });
        if (!info.exists || !Number.isFinite(info.size) || info.size < 1 || info.size > maxEntryBytes) {
          index.delete(`shadow-${day}-${key}.png`); return null;
        }
        const copy = `${cacheRoot}rato-shadow-cache-hit-${Math.floor(now()).toString(36)}-${(++sequence).toString(36)}.png`;
        await fs.copyAsync({ from: uri, to: copy });
        if (!valid(key, day) || !current(operationEpoch, generation)) {
          await fs.deleteAsync(copy, { idempotent: true }); return null;
        }
        return copy;
      });
    },
    put(key, day, sourceUri, { generation } = {}) {
      const operationEpoch = epoch;
      if (!valid(key, day) || !cacheRoot || typeof sourceUri !== 'string' || !sourceUri.startsWith(cacheRoot) ||
          !SOURCE.test(sourceUri.slice(cacheRoot.length))) return Promise.resolve(false);
      return enqueue(async () => {
        if (!current(operationEpoch, generation)) return false;
        await ready(); await pruneEntries();
        const source = await fs.getInfoAsync(sourceUri, { size: true });
        if (!source.exists || !Number.isFinite(source.size) || source.size < 1 || source.size > maxEntryBytes || source.size > maxBytes) return false;
        const target = `${root}shadow-${day}-${key}.png`;
        if (!valid(key, day) || !current(operationEpoch, generation)) return false;
        if ((await fs.getInfoAsync(target)).exists) return valid(key, day) && current(operationEpoch, generation);
        const temp = `${root}temp-${Math.floor(now()).toString(36)}-${(++sequence).toString(36)}.png`;
        try {
          await fs.copyAsync({ from: sourceUri, to: temp });
          if (!valid(key, day) || !current(operationEpoch, generation)) return false;
          await fs.moveAsync({ from: temp, to: target });
          const name = `shadow-${day}-${key}.png`;
          index.set(name, { name, size: source.size, modified: now(), order: sequence });
          await pruneEntries(`shadow-${day}-${key}.png`);
          return (await fs.getInfoAsync(target)).exists;
        } finally { await fs.deleteAsync(temp, { idempotent: true }); }
      }).then(Boolean);
    },
    prune() { return enqueue(async () => { await ready(); await pruneEntries('', true); return true; }).then(Boolean); },
    clear() {
      epoch++;
      return enqueue(async () => {
        await ready();
        for (const name of await fs.readDirectoryAsync(root)) {
          if (NAME.test(name) || /^temp-[a-z0-9-]+\.png$/.test(name)) await fs.deleteAsync(`${root}${name}`, { idempotent: true });
        }
        index = new Map(); indexDay = localShadowDay(new Date(now()));
        return true;
      }).then(Boolean);
    },
  };
}
