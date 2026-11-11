const fs = require('fs/promises');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const SUPPORTED_VERSION = '1.27.2';
const UNPATCHED = /\} else if \(\[subview isKindOfClass:\[AIRMapOverlay class\]\]\) \{(\r?\n)([ \t]*)\[self removeOverlay:\(id <MKOverlay>\) subview\];/g;
const PATCHED = /\} else if \(\[subview isKindOfClass:\[AIRMapOverlay class\]\]\) \{\r?\n[ \t]*\(\(AIRMapOverlay \*\)subview\)\.map = nil;\r?\n[ \t]*\[self removeOverlay:\(id <MKOverlay>\) subview\];/g;

// AIRMapOverlay asynchronously loads each image. Without clearing `map` on
// unmount, its completion callback can add an already removed overlay back to
// MapKit, leaving an unowned ghost shadow on screen.
function patchAirMap(source, version) {
  if (version !== SUPPORTED_VERSION) throw new Error(`Unsupported react-native-maps version ${version}; review the iOS overlay fix.`);
  const originalMatches = [...source.matchAll(UNPATCHED)];
  const patchedMatches = [...source.matchAll(PATCHED)];
  if (originalMatches.length === 0 && patchedMatches.length === 1) return source;
  if (originalMatches.length !== 1 || patchedMatches.length !== 0) {
    throw new Error('Could not identify exactly one iOS map overlay removal; review the overlay fix.');
  }
  return source.replace(UNPATCHED, (_match, newline, indent) =>
    `} else if ([subview isKindOfClass:[AIRMapOverlay class]]) {${newline}${indent}((AIRMapOverlay *)subview).map = nil;${newline}${indent}[self removeOverlay:(id <MKOverlay>) subview];`);
}

function fixMapOverlay(config) {
  return withDangerousMod(config, ['ios', async (result) => {
    const packagePath = require.resolve('react-native-maps/package.json', { paths: [result.modRequest.projectRoot] });
    const packageInfo = JSON.parse(await fs.readFile(packagePath, 'utf8'));
    const sourcePath = path.join(path.dirname(packagePath), 'ios', 'AirMaps', 'AIRMap.mm');
    const source = await fs.readFile(sourcePath, 'utf8');
    const patched = patchAirMap(source, packageInfo.version);
    if (source !== patched) await fs.writeFile(sourcePath, patched, 'utf8');
    console.log('[Rato al Sol] iOS shadow overlay fix verified');
    return result;
  }]);
}

module.exports = fixMapOverlay;
module.exports.patchAirMap = patchAirMap;
