const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// The native and existing web apps share the same solar calculations.
config.watchFolders = [path.resolve(__dirname, '..')];
if (!config.resolver.assetExts.includes('bin')) config.resolver.assetExts.push('bin');
module.exports = config;
