export function boundsCover(outer, inner) {
  return Array.isArray(outer) && Array.isArray(inner) && outer.length === 4 && inner.length === 4 &&
    outer.every(Number.isFinite) && inner.every(Number.isFinite) &&
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
}

// A fully rendered image can survive a small pan only for the same map,
// instant and building dataset, and only while its bounds cover the view.
export function canReuseWebShadow(frame, { map, timeKey, buildings, visibleBounds, daylight }) {
  return Boolean(daylight && frame && frame.map === map && frame.timeKey === timeKey &&
    frame.buildings === buildings && boundsCover(frame.bounds, visibleBounds));
}
