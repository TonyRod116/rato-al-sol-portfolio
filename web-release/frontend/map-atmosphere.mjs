// Visual treatment only. The same solar position remains the source of truth
// for direction and shadow calculations.
const clamp = (x) => Math.max(0, Math.min(1, x));
function smooth(from, to, value) {
  const x = clamp((value - from) / (to - from));
  return x * x * (3 - 2 * x);
}

export function mapAtmosphere(sun) {
  if (!sun || !Number.isFinite(sun.altitude) || !Number.isFinite(sun.azimuth)) {
    return { cssFilter: 'none', nativeTint: 'transparent', isNight: false };
  }
  // Begin cooling the scene before sunset; below the horizon it should no
  // longer look like broad daylight, while twilight remains gradual.
  const night = 1 - smooth(-7, 5, sun.altitude);
  const golden = smooth(-9, 2, sun.altitude) * (1 - smooth(7, 22, sun.altitude));
  const morning = sun.azimuth < 180;
  // Desaturate before tinting blue, avoiding an intermediate green hue.
  const warm = golden * (1 - smooth(.18, .5, night));
  const blue = smooth(.5, .9, night);
  const brightness = 1 - .42 * night;
  const saturation = 1 - smooth(0, .5, night) + .12 * warm;
  const sepia = .68 * blue + .23 * warm;
  const hue = night >= .5 ? 165 : warm * (morning ? -9 : -20);
  const cssFilter = `brightness(${brightness.toFixed(3)}) saturate(${saturation.toFixed(3)}) sepia(${sepia.toFixed(3)}) hue-rotate(${hue.toFixed(1)}deg)`;
  const nativeTint = night > golden
    ? `rgba(28, 47, 78, ${(night * .18).toFixed(3)})`
    : morning ? `rgba(231, 150, 83, ${(golden * .17).toFixed(3)})`
      : `rgba(208, 96, 92, ${(golden * .17).toFixed(3)})`;
  return { cssFilter, nativeTint, isNight: night > .55 };
}
