import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { buildWeb } from '../scripts/build-web.mjs';

const require = createRequire(import.meta.url);

test('a release web package excludes local configuration and preserves an existing output', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'rato-release-'));
  const output = join(temporary, 'rato-al-sol');
  try {
    buildWeb(output);
    for (const file of ['index.html', 'styles.css', 'app.mjs', 'i18n.mjs', 'solar.mjs', 'shared/estimate.mjs', 'shared/barcelona-terraces.mjs', 'shared/default-location.mjs', 'shared/time-selection.mjs', 'shared/i18n.mjs', 'vendor/suncalc-2.0.2.mjs', 'vendor/SUNCALC-LICENSE.txt']) {
      assert.ok(existsSync(join(output, file)), `${file} must be included`);
    }
    assert.ok(!existsSync(join(output, 'maps-config.local.json')));
    assert.ok(!existsSync(join(output, 'maps-config.example.json')));
    assert.ok(!existsSync(join(output, 'google-map.mjs')));
    assert.ok(!existsSync(join(output, 'demo-data.mjs')));
    const marker = join(output, 'keep.txt');
    writeFileSync(marker, 'keep');
    assert.throws(() => buildWeb(output), /EEXIST/);
    assert.equal(readFileSync(marker, 'utf8'), 'keep');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('Android release configuration refuses to proceed without a maps key', () => {
  const names = ['RATO_ANDROID_MAPS_API_KEY', 'RATO_REQUIRE_ANDROID_MAPS_KEY', 'EAS_BUILD_PLATFORM'];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const configure = require('../mobile/app.config.js');
  try {
    for (const name of names) delete process.env[name];
    const config = { plugins: [['expo-location', {}]], ios: { supportsTablet: true } };
    assert.doesNotThrow(() => configure({ config }));
    process.env.EAS_BUILD_PLATFORM = 'ios';
    assert.doesNotThrow(() => configure({ config }));
    process.env.EAS_BUILD_PLATFORM = 'android';
    assert.throws(() => configure({ config }), /RATO_ANDROID_MAPS_API_KEY/);
    delete process.env.EAS_BUILD_PLATFORM;
    process.env.RATO_REQUIRE_ANDROID_MAPS_KEY = '1';
    assert.throws(() => configure({ config }), /RATO_ANDROID_MAPS_API_KEY/);
    process.env.RATO_ANDROID_MAPS_API_KEY = ' synthetic-key ';
    const prepared = configure({ config });
    assert.deepEqual(prepared.plugins.at(-1), ['react-native-maps', { androidGoogleMapsApiKey: 'synthetic-key' }]);
    assert.deepEqual(prepared.plugins[0], ['expo-location', {}]);
    assert.deepEqual(prepared.ios, { supportsTablet: true });
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});
