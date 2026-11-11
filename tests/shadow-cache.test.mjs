import test from 'node:test';
import assert from 'node:assert/strict';
import { createShadowCache, localShadowDay } from '../mobile/src/shadow-cache.mjs';

function memoryFs() {
  const data = new Map(), directories = new Set(['cache/']);
  let clock = 0;
  return {
    cacheDirectory: 'cache/', data, directories,
    async getInfoAsync(path) {
      if (directories.has(path)) return { exists: true, isDirectory: true };
      const item = data.get(path);
      return item ? { exists: true, size: item.size, modificationTime: item.modified } : { exists: false };
    },
    async makeDirectoryAsync(path) { directories.add(path); },
    async readDirectoryAsync(path) {
      return [...data.keys()].filter((key) => key.startsWith(path) && !key.slice(path.length).includes('/')).map((key) => key.slice(path.length));
    },
    async deleteAsync(path) { data.delete(path); },
    async copyAsync({ from, to }) {
      const item = data.get(from);
      if (!item) throw new Error('missing');
      data.set(to, { size: item.size, modified: ++clock });
    },
    async moveAsync({ from, to }) {
      const item = data.get(from);
      if (!item) throw new Error('missing');
      data.set(to, { ...item, modified: ++clock }); data.delete(from);
    },
    seed(path, size = 10) { data.set(path, { size, modified: ++clock }); },
  };
}
const day = (n) => new Date(2026, 10, n, 12).getTime();

test('only today and tomorrow are persisted; old images expire after local midnight', async () => {
  let time = day(4);
  const fs = memoryFs(); fs.seed('cache/rato-shadow-1-1.png');
  const cache = createShadowCache(fs, { now: () => time });
  assert.equal(localShadowDay(new Date(time)), '2026-11-04');
  assert.equal(await cache.put('today', '2026-11-04', 'cache/rato-shadow-1-1.png'), true);
  assert.equal(await cache.put('tomorrow', '2026-11-05', 'cache/rato-shadow-1-1.png'), true);
  assert.equal(await cache.put('later', '2026-11-06', 'cache/rato-shadow-1-1.png'), false);
  time = day(5);
  assert.equal(await cache.get('today', '2026-11-04'), null);
  await cache.prune();
  assert.equal([...fs.data.keys()].some((name) => name.includes('2026-11-04')), false);
  const hit = await cache.get('tomorrow', '2026-11-05');
  assert.match(hit, /^cache\/rato-shadow-cache-hit-/);
  assert.notEqual(hit, 'cache/rato-shadow-cache-v1/shadow-2026-11-05-tomorrow.png');
});

test('bounded cache evicts old images, rejects invalid or oversized inputs and preserves hit copies', async () => {
  const fs = memoryFs(); fs.seed('cache/rato-shadow-1-1.png', 8); fs.seed('cache/rato-shadow-2-1.png', 18);
  const cache = createShadowCache(fs, { now: () => day(4), maxBytes: 16, maxEntryBytes: 10, maxEntries: 2 });
  assert.equal(await cache.put('a', '2026-11-04', 'cache/rato-shadow-1-1.png'), true);
  const hit = await cache.get('a', '2026-11-04');
  assert.ok(hit);
  assert.equal(await cache.put('b', '2026-11-04', 'cache/rato-shadow-1-1.png'), true);
  assert.equal(await cache.put('c', '2026-11-04', 'cache/rato-shadow-1-1.png'), true);
  assert.equal(await cache.get('a', '2026-11-04'), null);
  assert.equal(fs.data.has(hit), true, 'a live copy is independent from cache eviction');
  assert.equal(await cache.put('large', '2026-11-04', 'cache/rato-shadow-2-1.png'), false);
  assert.equal(await cache.put('../bad', '2026-11-04', 'cache/rato-shadow-1-1.png'), false);
  assert.equal(await cache.put('x', '2026-11-04', 'cache/../../private.png'), false);
});

test('a native render may be saved only with a recognized temporary filename', async () => {
  const fs = memoryFs(), native = `cache/rato-native-shadow-${day(4)}-1.png`;
  fs.seed(native); fs.seed('cache/rato-native-shadow-personal-notes.png');
  const cache = createShadowCache(fs, { now: () => day(4) });
  assert.equal(await cache.put('native', '2026-11-04', native), true);
  assert.ok(await cache.get('native', '2026-11-04'));
  assert.equal(await cache.put('bad', '2026-11-04', 'cache/rato-native-shadow-personal-notes.png'), false);
});

test('clearing while a write is in flight prevents it from returning after the clear', async () => {
  const fs = memoryFs(); fs.seed('cache/rato-shadow-1-1.png');
  let generation = 0, begin, resume;
  const copy = fs.copyAsync;
  fs.copyAsync = async (args) => {
    if (args.to.includes('/temp-')) { begin(); await new Promise((resolve) => { resume = resolve; }); }
    return copy(args);
  };
  const started = new Promise((resolve) => { begin = resolve; });
  const cache = createShadowCache(fs, { now: () => day(4), currentGeneration: () => generation });
  const write = cache.put('x', '2026-11-04', 'cache/rato-shadow-1-1.png', { generation });
  await started;
  generation++;
  const cleared = cache.clear();
  resume();
  assert.equal(await write, false);
  assert.equal(await cleared, true);
  assert.equal(await cache.get('x', '2026-11-04'), null);
  assert.equal(await cache.put('y', '2026-11-04', 'cache/rato-shadow-1-1.png', { generation: 0 }), false);
});

test('cleanup removes abandoned temporary hits on startup but preserves unrelated files', async () => {
  const fs = memoryFs();
  fs.seed('cache/rato-shadow-cache-hit-old-1.png'); fs.seed('cache/other.png');
  const old = `cache/rato-shadow-${day(3)}-0.png`, today = `cache/rato-shadow-${day(4)}-1.png`;
  const previousRunToday = `cache/rato-shadow-${day(4) - 1000}-2.png`;
  const previousBitmap = `cache/rato-shadow-bitmap-${day(4) - 1000}-3.png`;
  const currentBitmap = `cache/rato-shadow-bitmap-${day(4)}-4.png`;
  const unrelatedBitmap = `cache/rato-shadow-bitmap-not-a-timestamp-2.png`;
  const previousNative = `cache/rato-native-shadow-${day(4) - 1000}-5.png`;
  const currentNative = `cache/rato-native-shadow-${day(4)}-6.png`;
  const unrelatedNative = 'cache/rato-native-shadow-personal-notes.png';
  fs.seed(old); fs.seed(today); fs.seed(previousRunToday);
  fs.seed(previousBitmap); fs.seed(currentBitmap); fs.seed(unrelatedBitmap);
  fs.seed(previousNative); fs.seed(currentNative); fs.seed(unrelatedNative);
  const cache = createShadowCache(fs, { now: () => day(4) });
  assert.equal(await cache.prune(), true);
  assert.equal(fs.data.has('cache/rato-shadow-cache-hit-old-1.png'), false);
  assert.equal(fs.data.has(old), false);
  assert.equal(fs.data.has(previousRunToday), false, 'today\'s abandoned source came from a previous run');
  assert.equal(fs.data.has(today), true, 'a current source may already be displayed');
  assert.equal(fs.data.has(previousBitmap), false, 'bitmap source from an old run is abandoned');
  assert.equal(fs.data.has(currentBitmap), true, 'bitmap source from this run may be displayed');
  assert.equal(fs.data.has(unrelatedBitmap), true, 'unrecognized filenames are not deleted');
  assert.equal(fs.data.has(previousNative), false, 'native source from an old run is abandoned');
  assert.equal(fs.data.has(currentNative), true, 'native source from this run may be displayed');
  assert.equal(fs.data.has(unrelatedNative), true, 'unrecognized native filenames are not deleted');
  assert.equal(fs.data.has('cache/other.png'), true);
});

test('a foreground cleanup after midnight does not delete a live source from yesterday', async () => {
  let time = day(4);
  const fs = memoryFs(), live = `cache/rato-shadow-${time}-0.png`;
  fs.seed(live);
  const cache = createShadowCache(fs, { now: () => time });
  await cache.prune();
  time = day(5);
  await cache.prune();
  assert.equal(fs.data.has(live), true, 'the running map may still hold this image');
});

test('the operating system can purge the directory while the app is running', async () => {
  const fs = memoryFs(); fs.seed('cache/rato-shadow-1-1.png', 8);
  const cache = createShadowCache(fs, { now: () => day(4), maxBytes: 8, maxEntryBytes: 8 });
  assert.equal(await cache.put('old', '2026-11-04', 'cache/rato-shadow-1-1.png'), true);
  fs.directories.delete('cache/rato-shadow-cache-v1/');
  for (const key of fs.data.keys()) if (key.startsWith('cache/rato-shadow-cache-v1/')) fs.data.delete(key);
  assert.equal(await cache.put('new', '2026-11-04', 'cache/rato-shadow-1-1.png'), true);
  assert.ok(await cache.get('new', '2026-11-04'));
  assert.equal(await cache.get('old', '2026-11-04'), null);
});
