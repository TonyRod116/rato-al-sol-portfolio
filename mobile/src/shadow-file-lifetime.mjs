// Native map overlays can outlive the render job which produced their image.
// Retire files after use, but never delete one while the map still displays it.
export function createShadowFileLifetime(remove, schedule = setTimeout, delay = 10000) {
  const retained = new Map(), scheduled = new Set(), pending = new Set();
  function retire(uri) {
    if (!uri || scheduled.has(uri)) return;
    pending.delete(uri);
    scheduled.add(uri);
    schedule(() => {
      scheduled.delete(uri);
      if (retained.has(uri)) pending.add(uri);
      else remove(uri);
    }, delay);
  }
  function retain(uri) {
    if (uri) retained.set(uri, (retained.get(uri) || 0) + 1);
  }
  function release(uri) {
    const count = retained.get(uri) || 0;
    if (count > 1) retained.set(uri, count - 1);
    else retained.delete(uri);
    if (count && !retained.has(uri) && pending.has(uri)) retire(uri);
  }
  return { retire, retain, release };
}
