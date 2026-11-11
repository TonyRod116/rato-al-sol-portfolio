// An image can remain displayed while its replacement loads only when the
// geographic bounds have not changed. Otherwise it would be stretched onto
// an unrelated area of the map.
export function shadowOverlayBoundsKey(image) {
  const bounds = image?.bounds;
  if (!Array.isArray(bounds) || bounds.length !== 2 ||
      !bounds.every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))) return null;
  return JSON.stringify(bounds);
}

export function readyShadowOverlayUri(ready, image) {
  const key = shadowOverlayBoundsKey(image);
  return image?.uri && key && ready?.boundsKey === key ? ready.uri : null;
}
