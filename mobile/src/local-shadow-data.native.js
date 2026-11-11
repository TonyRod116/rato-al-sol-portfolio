import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { createShadowCoverage } from './shadow-coverage.mjs';

const assets = {
  barcelona: require('../assets/shadow-data/barcelona.bin'),
  madrid: require('../assets/shadow-data/madrid.bin'),
};
const indexes = {
  barcelona: require('../assets/shadow-data/barcelona.json'),
  madrid: require('../assets/shadow-data/madrid.json'),
};

async function readTile(city, offset, length) {
  const asset = await Asset.fromModule(assets[city]).downloadAsync();
  const handle = new File(asset.localUri).open();
  try {
    handle.offset = offset;
    return handle.readBytes(length);
  } finally {
    handle.close();
  }
}

export const localShadowData = createShadowCoverage(indexes, readTile);
