import test from 'node:test';
import assert from 'node:assert/strict';
import { createLastMapArea, LAST_MAP_AREA_KEY, mapArea, maySaveMapArea, startLocation } from '../mobile/src/start-location.mjs';

const barcelona = { latitude: 41.39172, longitude: 2.16495 };
const madrid = { latitude: 40.41678, longitude: -3.70379 };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setup(overrides = {}) {
  const events = [];
  const options = {
    savedArea: { load: async () => barcelona },
    getPermission: async () => ({ granted: true, status: 'granted' }),
    ask: async () => { events.push('notice'); return true; },
    requestPermission: async () => { events.push('permission'); return { granted: true }; },
    getLastKnown: async () => null,
    getCurrent: async () => ({ coords: madrid }),
    wasNoticeDeclined: async () => false,
    rememberNoticeDeclined: async () => { events.push('remember-declined'); },
    onSaved: (point) => events.push(['saved', point]),
    onCurrent: (point) => events.push(['location', point]),
    isCurrent: () => true,
    storageTimeoutMs: 40, locationTimeoutMs: 40,
    ...overrides,
  };
  return { options, events };
}

test('restores the last area immediately then uses the device location when permission exists', async () => {
  const { options, events } = setup();
  await startLocation(options);
  assert.deepEqual(events, [['saved', barcelona], ['location', madrid]]);
});

test('a denied permission leaves the last area and does not ask the system again', async () => {
  const { options, events } = setup({ getPermission: async () => ({ granted: false, status: 'denied', canAskAgain: false }) });
  await startLocation(options);
  assert.deepEqual(events, [['saved', barcelona]]);
});

test('first launch explains location before requesting permission and respects a refusal', async () => {
  const { options, events } = setup({ getPermission: async () => ({ granted: false, status: 'undetermined', canAskAgain: true }),
    ask: async () => { events.push('notice'); return false; } });
  await startLocation(options);
  await delay(0);
  assert.deepEqual(events, [['saved', barcelona], 'notice', 'remember-declined']);
  const again = setup({ getPermission: async () => ({ granted: false, status: 'undetermined' }), wasNoticeDeclined: async () => true });
  await startLocation(again.options);
  assert.deepEqual(again.events, [['saved', barcelona]]);
});

test('first launch only queries device position after notice and system consent', async () => {
  const { options, events } = setup({ savedArea: { load: async () => null }, getPermission: async () => ({ granted: false, status: 'undetermined' }) });
  await startLocation(options);
  assert.deepEqual(events, ['notice', 'permission', ['location', madrid]]);
});

test('a person can take longer than the GPS timeout to grant permission', async () => {
  const decision = deferred();
  const { options, events } = setup({ getPermission: async () => ({ granted: false, status: 'undetermined' }),
    requestPermission: () => decision.promise, locationTimeoutMs: 5 });
  const result = startLocation(options);
  await delay(15);
  decision.resolve({ granted: true });
  await result;
  assert.deepEqual(events, [['saved', barcelona], 'notice', ['location', madrid]]);
});

test('user interaction while GPS runs prevents a late map jump', async () => {
  const gps = deferred(); let current = true;
  const { options, events } = setup({ getCurrent: () => gps.promise, isCurrent: () => current });
  const result = startLocation(options);
  await delay(1);
  current = false; gps.resolve({ coords: madrid });
  await result;
  assert.deepEqual(events, [['saved', barcelona]]);
});

test('moving before the last-area read finishes prevents both restoration and permission prompts', async () => {
  const read = deferred(); let current = true;
  const { options, events } = setup({ savedArea: { load: () => read.promise }, isCurrent: () => current });
  const result = startLocation(options); current = false; read.resolve(barcelona); await result;
  assert.deepEqual(events, []);
});

test('a slow last-area read does not overwrite Barcelona with the default Madrid view', async () => {
  const read = deferred(); let loaded = false;
  const storage = new Map([[LAST_MAP_AREA_KEY, JSON.stringify(barcelona)]]);
  const adapter = { getItem: async (key) => { await read.promise; return storage.get(key); },
    setItem: async (key, value) => storage.set(key, value), removeItem: async (key) => storage.delete(key) };
  const saved = createLastMapArea(adapter, 0);
  const loading = saved.load();
  const initial = setup({ savedArea: { load: () => loading }, onSavedRead: () => { loaded = true; }, getPermission: async () => ({ granted: false, status: 'denied' }), storageTimeoutMs: 5 });
  await startLocation(initial.options);
  if (maySaveMapArea({ loaded, touched: false, paused: false })) saved.save(madrid);
  await delay(2);
  assert.deepEqual(JSON.parse(storage.get(LAST_MAP_AREA_KEY)), barcelona);
  read.resolve(); assert.deepEqual(await loading, barcelona); await delay(0);
  assert.deepEqual(initial.events, [['saved', barcelona]]);
  assert.equal(maySaveMapArea({ loaded: false, touched: true, paused: false }), true);
  assert.equal(maySaveMapArea({ loaded: true, touched: true, paused: true }), false);
});

test('a delayed read after the user has interacted never authorizes saving the initial map', async () => {
  const read = deferred(); let loaded = false, current = true;
  const { options, events } = setup({ savedArea: { load: () => read.promise }, onSavedRead: () => { loaded = true; },
    isCurrent: () => current, getPermission: async () => ({ granted: false, status: 'denied' }), storageTimeoutMs: 5 });
  await startLocation(options); current = false; read.resolve(barcelona); await delay(0);
  assert.equal(loaded, false);
  assert.equal(maySaveMapArea({ loaded, touched: false, paused: false }), false);
  assert.deepEqual(events, []);
});

test('a delayed stored area never overrides a newer GPS fix', async () => {
  const read = deferred();
  const { options, events } = setup({ savedArea: { load: () => read.promise }, storageTimeoutMs: 5 });
  await startLocation(options);
  assert.deepEqual(events, [['location', madrid]]);
  read.resolve(barcelona); await delay(0);
  assert.deepEqual(events, [['location', madrid]]);
});

test('slow permission and notice-preference reads still lead to a first-use prompt', async () => {
  const permission = deferred(), preference = deferred();
  const { options, events } = setup({ getPermission: () => permission.promise, wasNoticeDeclined: () => preference.promise, storageTimeoutMs: 5 });
  const result = startLocation(options);
  await delay(12); permission.resolve({ granted: false, status: 'undetermined' });
  await delay(12); preference.resolve(false); await result;
  assert.deepEqual(events, [['saved', barcelona], 'notice', 'permission', ['location', madrid]]);
});

test('a cancelled notice never prompts the system after user interaction', async () => {
  const prompt = deferred(); let current = true;
  const { options, events } = setup({ getPermission: async () => ({ granted: false, status: 'undetermined' }),
    ask: () => prompt.promise, isCurrent: () => current });
  const result = startLocation(options);
  await delay(1); current = false; prompt.resolve(true); await result;
  assert.deepEqual(events, [['saved', barcelona]]);
});

test('a timed-out GPS lookup or invalid coordinate preserves the saved area', async () => {
  const gps = deferred();
  const { options, events } = setup({ getCurrent: () => gps.promise, locationTimeoutMs: 5 });
  await startLocation(options); gps.resolve({ coords: madrid }); await delay(0);
  assert.deepEqual(events, [['saved', barcelona]]);
  assert.equal(mapArea({ latitude: Infinity, longitude: 1 }), null);
  assert.equal(mapArea({ latitude: 91, longitude: 1 }), null);
});

test('recent system location may appear before the fresh fix without exposing other metadata', async () => {
  const gps = deferred();
  const { options, events } = setup({ getLastKnown: async () => ({ coords: { ...barcelona, altitude: 12 } }), getCurrent: () => gps.promise });
  const result = startLocation(options); await delay(1); gps.resolve({ coords: madrid }); await result;
  assert.deepEqual(events, [['saved', barcelona], ['location', barcelona], ['location', madrid]]);
});

test('last area is rounded locally and clearing cancels any pending write', async () => {
  const storage = new Map();
  const adapter = { getItem: async (key) => storage.get(key) ?? null, setItem: async (key, value) => storage.set(key, value), removeItem: async (key) => storage.delete(key) };
  const saved = createLastMapArea(adapter, 2);
  saved.save(barcelona); await delay(8);
  assert.deepEqual(JSON.parse(storage.get(LAST_MAP_AREA_KEY)), { latitude: 41.3917, longitude: 2.165 });
  saved.save(madrid); assert.equal(await saved.clear(), true); await delay(8);
  assert.equal(storage.has(LAST_MAP_AREA_KEY), false);
});

test('clearing waits for an earlier in-flight write and cannot resurrect the area', async () => {
  const write = deferred(), storage = new Map();
  const adapter = { getItem: async (key) => storage.get(key) ?? null,
    setItem: async (key, value) => { await write.promise; storage.set(key, value); }, removeItem: async (key) => storage.delete(key) };
  const saved = createLastMapArea(adapter, 0); saved.save(barcelona); await delay(1);
  const clearing = saved.clear(); write.resolve(); assert.equal(await clearing, true);
  assert.equal(storage.has(LAST_MAP_AREA_KEY), false);
});

test('going to background flushes the most recently viewed area without waiting for debounce', async () => {
  const storage = new Map();
  const adapter = { getItem: async (key) => storage.get(key) ?? null, setItem: async (key, value) => storage.set(key, value), removeItem: async (key) => storage.delete(key) };
  const saved = createLastMapArea(adapter, 10000);
  saved.save(madrid); saved.save(barcelona); await saved.flush();
  assert.deepEqual(JSON.parse(storage.get(LAST_MAP_AREA_KEY)), { latitude: 41.3917, longitude: 2.165 });
  saved.dispose();
});
