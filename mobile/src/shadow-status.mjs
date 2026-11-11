// Below five degrees, shadows are intentionally not drawn because their
// projection would be unreliable near the horizon.
export function shadowSunStatus(sun) {
  if (!Number.isFinite(sun?.altitude)) return null;
  if (sun.altitude < -1) return 'night';
  if (sun.altitude < 5) return 'low';
  return null;
}
