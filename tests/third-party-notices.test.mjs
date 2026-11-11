import { readFile } from 'node:fs/promises';
import { mkdtemp, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPENDENCY_NOTICES, SUNCALC_LICENSE } from '../mobile/src/third-party-notices.mjs';
import { NATIVE_NOTICES } from '../mobile/src/native-third-party-notices.mjs';

test('the distributed SunCalc notice includes the complete upstream license', async () => {
  const upstream = await readFile(new URL('../frontend/vendor/SUNCALC-LICENSE.txt', import.meta.url), 'utf8');
  assert.equal(SUNCALC_LICENSE.replace(/\r\n/g, '\n'), upstream.replace(/\r\n/g, '\n'));
});

test('notice generation refuses missing or incomplete source maps without deleting transitive notices', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const target = join(root, 'mobile/src/third-party-notices.mjs');
  const before = await readFile(target, 'utf8');
  const missing = spawnSync(process.execPath, ['scripts/generate-native-notices.cjs'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(missing.status, 0);
  assert.equal(await readFile(target, 'utf8'), before);
  const temporary = await mkdtemp(join(tmpdir(), 'rato-notices-test-'));
  try {
    const map = join(temporary, 'empty.map');
    await writeFile(map, JSON.stringify({ sources: [] }));
    const incomplete = spawnSync(process.execPath, ['scripts/generate-native-notices.cjs', 'mobile/node_modules', map], { cwd: root, encoding: 'utf8' });
    assert.notEqual(incomplete.status, 0);
    assert.match(incomplete.stderr, /Refusing to remove existing notices/);
    assert.equal(await readFile(target, 'utf8'), before);
  } finally {
    await rm(join(temporary, 'empty.map'));
    await rmdir(temporary);
  }
});

test('all declared direct packages have a notice for the locked version', async () => {
  const app = JSON.parse(await readFile(new URL('../mobile/package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../mobile/package-lock.json', import.meta.url), 'utf8'));
  const packages = Object.keys(app.dependencies).sort();
  for (const name of packages) {
    const version = lock.packages[`node_modules/${name}`].version;
    const notice = DEPENDENCY_NOTICES.find((item) => item.name === name && item.version === version);
    assert.ok(notice, `Missing notice for ${name}@${version}`);
    assert.match(notice.text, /copyright/i, `${notice.name} must include its copyright notice`);
    assert.ok(notice.text.length > 100, `${notice.name} must include its license text`);
  }
});

test('the sources and notices text has at least 4.5:1 contrast on the panel', async () => {
  const app = await readFile(new URL('../mobile/App.js', import.meta.url), 'utf8');
  const foreground = app.match(/licenseBody:\s*\{\s*color:\s*'(#[a-f0-9]{6})'/i)?.[1];
  const background = app.match(/modalSafe:\s*\{[^}]*backgroundColor:\s*'(#[a-f0-9]{6})'/i)?.[1];
  assert.ok(foreground && background, 'source colors must be present');
  function luminance(hex) {
    const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  assert.ok((lighter + 0.05) / (darker + 0.05) >= 4.5);
});

test('the native notices preserve complete provider text and the bundled Public Suffix notice', async () => {
  const folder = new URL('../mobile/src/native-notice-sources/', import.meta.url);
  const normalize = (text) => text.replace(/\r\n/g, '\n');
  for (const [name, files] of [
    ['OkHttp · Apache 2.0', ['okhttp-license.txt']], ['Okio · Apache 2.0', ['okio-license.txt']],
    ['Fresco · MIT', ['fresco-license.txt']], ['Folly · Apache 2.0', ['folly-license.txt']],
    ['fmt · MIT', ['fmt-license.txt']], ['DoubleConversion · BSD 3-Clause', ['double-conversion-license.txt']],
    ['glog · BSD 3-Clause', ['glog-license.txt']], ['Boost · Boost Software License 1.0', ['boost-license.txt']],
    ['Hermes · MIT', ['hermes-license.txt']], ['Kotlin · Apache 2.0', ['kotlin-license.txt']],
    ['Apache Commons Codec · Apache 2.0', ['codec-notice.txt', 'codec-license.txt']],
    ['Public Suffix List · MPL 2.0', ['public-suffix-notice.txt', 'mpl-2.0.txt']],
  ]) {
    const notice = NATIVE_NOTICES.find((item) => item.name === name);
    assert.ok(notice, `Missing ${name}`);
    for (const file of files) assert.ok(notice.text.includes(normalize(await readFile(new URL(file, folder), 'utf8'))), `${name} lost ${file}`);
  }
});

test('Codec notice retains the Beider-Morse attribution without asserting a bundled version', () => {
  const codec = NATIVE_NOTICES.find((item) => item.name === 'Apache Commons Codec · Apache 2.0');
  assert.ok(codec);
  assert.match(codec.text, /Copyright \(c\) 2008 Alexander Beider & Stephen P\. Morse\./);
  assert.doesNotMatch(codec.name, /1\.10/);
});

test('native component notices retain original copyright without unverified binary versions', () => {
  for (const [name, copyright] of [
    ['fmt · MIT', /Victor Zverovich/],
    ['DoubleConversion · BSD 3-Clause', /V8 project authors/],
    ['glog · BSD 3-Clause', /Google Inc\./],
    ['Boost · Boost Software License 1.0', /Boost Software License/],
  ]) {
    const notice = NATIVE_NOTICES.find((item) => item.name === name);
    assert.ok(notice, `Missing ${name}`);
    assert.match(notice.text, copyright);
    assert.doesNotMatch(notice.name, /\b(?:12\.1\.0|1\.1\.6|0\.3\.5|1\.84\.0)\b/);
  }
});
