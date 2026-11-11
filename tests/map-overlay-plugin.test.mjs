import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { patchAirMap } = require('../mobile/plugins/fix-map-overlay.js');
const fixMapOverlay = require('../mobile/plugins/fix-map-overlay.js');
const mobileRequire = createRequire(new URL('../mobile/package.json', import.meta.url));
const { compileModsAsync } = mobileRequire('expo/config-plugins');
const removal = `} else if ([subview isKindOfClass:[AIRMapOverlay class]]) {\n        [self removeOverlay:(id <MKOverlay>) subview];`;
const insertion = `} else if ([subview isKindOfClass:[AIRMapOverlay class]]) {\n        ((AIRMapOverlay *)subview).map = self;\n        [self addOverlay:(id<MKOverlay>)subview];`;

test('clears the map reference before removing an image overlay and is idempotent', () => {
  const patched = patchAirMap(`${insertion}\n${removal}`, '1.27.2');
  assert.ok(patched.includes(insertion), 'adding an overlay remains unchanged');
  assert.ok(patched.includes('((AIRMapOverlay *)subview).map = nil;\n        [self removeOverlay:(id <MKOverlay>) subview];'));
  assert.equal(patchAirMap(patched, '1.27.2'), patched);
});

test('preserves Windows line endings and refuses unknown versions or changed source', () => {
  const patched = patchAirMap(removal.replace(/\n/g, '\r\n'), '1.27.2');
  assert.ok(patched.includes('.map = nil;\r\n'));
  assert.throws(() => patchAirMap(removal, '1.27.3'), /Unsupported/);
  assert.throws(() => patchAirMap(insertion, '1.27.2'), /exactly one/);
  assert.throws(() => patchAirMap(`${removal}\n${removal}`, '1.27.2'), /exactly one/);
});

test('Expo executes the iOS mod against an isolated dependency and skips it on Android', async () => {
  const tempParent = await fs.realpath(os.tmpdir());
  const project = await fs.mkdtemp(path.join(tempParent, 'rato-overlay-'));
  const originalPackage = mobileRequire.resolve('react-native-maps/package.json');
  const originalSource = path.join(path.dirname(originalPackage), 'ios', 'AirMaps', 'AIRMap.mm');
  const copiedPackage = path.join(project, 'node_modules', 'react-native-maps');
  const copiedSource = path.join(copiedPackage, 'ios', 'AirMaps', 'AIRMap.mm');
  try {
    await fs.mkdir(path.dirname(copiedSource), { recursive: true });
    await fs.mkdir(path.join(project, 'ios'), { recursive: true });
    await fs.copyFile(originalPackage, path.join(copiedPackage, 'package.json'));
    const installed = await fs.readFile(originalSource, 'utf8');
    // A prior local prebuild may already have patched the installed package;
    // reset only the isolated fixture, never the original dependency.
    const unpatched = installed.replace(/([ \t]*)\(\(AIRMapOverlay \*\)subview\)\.map = nil;\r?\n(?=[ \t]*\[self removeOverlay:\(id <MKOverlay>\) subview\];)/, '');
    await fs.writeFile(copiedSource, unpatched);
    const config = () => fixMapOverlay({ name: 'Rato al Sol', slug: 'rato-al-sol', ios: { bundleIdentifier: 'com.ratoalsol.app' } });
    await compileModsAsync(config(), { projectRoot: project, platforms: ['android'] });
    assert.equal(await fs.readFile(copiedSource, 'utf8'), unpatched);
    await compileModsAsync(config(), { projectRoot: project, platforms: ['ios'] });
    const patched = await fs.readFile(copiedSource, 'utf8');
    assert.notEqual(patched, unpatched);
    assert.ok(patched.includes('((AIRMapOverlay *)subview).map = nil;'));
    await compileModsAsync(config(), { projectRoot: project, platforms: ['ios'] });
    assert.equal(await fs.readFile(copiedSource, 'utf8'), patched);
    assert.equal(await fs.readFile(originalSource, 'utf8'), installed);
  } finally {
    const resolved = await fs.realpath(project);
    const relative = path.relative(tempParent, resolved);
    if (!/^rato-overlay-[^/\\]+$/.test(relative)) throw new Error('Refusing to remove an unexpected test directory');
    await fs.rm(resolved, { recursive: true, force: true });
  }
});
