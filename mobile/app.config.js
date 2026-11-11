module.exports = ({ config }) => {
  const androidMapsKey = process.env.RATO_ANDROID_MAPS_API_KEY?.trim();
  const needsAndroidKey = process.env.RATO_REQUIRE_ANDROID_MAPS_KEY === '1'
    || process.env.EAS_BUILD_PLATFORM === 'android';

  if (needsAndroidKey && !androidMapsKey) {
    throw new Error('Falta RATO_ANDROID_MAPS_API_KEY para compilar Android con mapas. Consulta docs/RELEASE.md.');
  }

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ['react-native-maps', androidMapsKey ? { androidGoogleMapsApiKey: androidMapsKey } : {}],
    ],
  };
};
