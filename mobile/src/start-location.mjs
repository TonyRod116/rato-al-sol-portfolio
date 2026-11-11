// Keep only the last viewed area, on this device. Avoid storing extra fields
// (such as altitude, timestamps, or provider metadata) from location results.
export const LAST_MAP_AREA_KEY = 'rato.last-map-area.v1';
export const START_NOTICE_DECLINED_KEY = 'rato.start-location-notice-declined.v1';

// Until the previous area has actually been read, the map's initial default
// is not evidence of user intent and must not overwrite that previous area.
export const maySaveMapArea = ({ loaded, touched, paused }) => !paused && (loaded || touched);

export function mapArea(value) {
  const latitude = value?.latitude, longitude = value?.longitude;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export function createLastMapArea(storage, delay = 350) {
  let timer, pending, writes = Promise.resolve();
  const enqueue = (fn) => { writes = writes.catch(() => {}).then(fn); return writes; };
  const flush = () => {
    clearTimeout(timer);
    const value = pending; pending = null;
    if (!value) return writes;
    return enqueue(() => storage.setItem(LAST_MAP_AREA_KEY, JSON.stringify(value)));
  };
  return {
    async load() {
      try { return mapArea(JSON.parse(await storage.getItem(LAST_MAP_AREA_KEY))); } catch { return null; }
    },
    save(value) {
      const point = mapArea(value);
      if (!point) return;
      clearTimeout(timer);
      pending = { latitude: Number(point.latitude.toFixed(4)), longitude: Number(point.longitude.toFixed(4)) };
      timer = setTimeout(() => { void flush().catch(() => {}); }, delay);
    },
    async clear() {
      clearTimeout(timer);
      pending = null;
      return limited(enqueue(() => storage.removeItem(LAST_MAP_AREA_KEY)).then(() => true), 3000, false);
    },
    flush,
    dispose() { void flush().catch(() => {}); },
  };
}

function limited(promise, timeoutMs, fallback = null) {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), timeoutMs); });
  return Promise.race([Promise.resolve(promise).catch(() => fallback), timeout]).finally(() => clearTimeout(timer));
}

// Every callback is guarded: the user may move/search while permission or GPS
// is pending. A failed service or stale response leaves the current map alone.
export async function startLocation({ savedArea, getPermission, ask, requestPermission, getLastKnown,
  getCurrent, wasNoticeDeclined, rememberNoticeDeclined, onSaved, onSavedRead = () => {}, onCurrent, isCurrent,
  storageTimeoutMs = 1000, locationTimeoutMs = 8000 }) {
  let savedApplied = false, locationApplied = false;
  const savedPromise = Promise.resolve().then(() => savedArea.load()).catch(() => null);
  const applySaved = (point) => {
    if (!isCurrent()) return;
    if (point && !savedApplied && !locationApplied) { savedApplied = true; onSaved(point); }
    onSavedRead();
  };
  const pending = {};
  const saved = await limited(savedPromise, storageTimeoutMs, pending);
  if (!isCurrent()) return;
  if (saved === pending) void savedPromise.then(applySaved);
  else applySaved(saved);
  let permission;
  try { permission = await getPermission(); } catch { return; }
  if (!isCurrent() || !permission) return;
  if (!permission.granted && permission.status === 'undetermined' && permission.canAskAgain !== false) {
    let declined;
    try { declined = await wasNoticeDeclined(); } catch { return; }
    if (!isCurrent() || declined) return;
    const accepted = await ask();
    if (!isCurrent()) return;
    if (!accepted) { void rememberNoticeDeclined().catch(() => {}); return; }
    // A person may need any amount of time to answer the native permission
    // dialog. Only location lookup is time-limited; still discard a response
    // if the user has moved to another task while the dialog was open.
    try { permission = await requestPermission(); } catch { return; }
  }
  if (!isCurrent() || !permission?.granted) return;
  const current = limited(getCurrent(), locationTimeoutMs);
  const recent = mapArea((await limited(getLastKnown(), 700))?.coords);
  if (!isCurrent()) return;
  if (recent) { locationApplied = true; onCurrent(recent); }
  const fresh = mapArea((await current)?.coords);
  if (isCurrent() && fresh) { locationApplied = true; onCurrent(fresh); }
}
