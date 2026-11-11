// Google reports isGesture; MapKit does not. After its first settled region,
// treat a new unmarked region change as user movement. Explicit app camera
// changes are marked briefly so they do not cancel the startup location.
export function createMapGestureGuard(platform, now = Date.now) {
  let settled = false, programmaticUntil = 0;
  return {
    programmatic() { programmaticUntil = now() + 1600; },
    started(details) {
      if (platform === 'android') return details?.isGesture === true;
      return settled && now() >= programmaticUntil;
    },
    completed(details) {
      const user = platform === 'android' && details?.isGesture === true;
      settled = true;
      return user;
    },
  };
}
