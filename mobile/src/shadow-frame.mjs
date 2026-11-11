// A raster belongs to one precise input scene and time. Reusing it for a
// different viewport, data version, centre, date or retry would be misleading.
export function shadowFrameMatches(frame, context) {
  return Boolean(frame && context && frame.area === context.area &&
    frame.buildings === context.buildings && frame.retryToken === context.retryToken && frame.generation === context.generation &&
    frame.timeKey != null && frame.timeKey === context.timeKey &&
    frame.latitude === context.latitude && frame.longitude === context.longitude);
}

// A frame may advance only after both the minimum display time and the next
// native image are ready; these two waits run concurrently.
export function playbackFrameReady(context, dwellFrame, futureFrame, nextTimeKey, native, visibleArea) {
  if (!shadowFrameMatches(dwellFrame, context)) return false;
  if (!native) return true;
  if (!futureFrame || futureFrame.failed) return false;
  if (shadowFrameMatches(futureFrame, { ...context, timeKey: nextTimeKey })) return true;
  // A fallback frame must cover this exact visible area and come from this
  // same expanded request. It is never valid after a movement or scene change.
  return Boolean(futureFrame.fallback && futureFrame.requestArea === context.area && visibleArea &&
    shadowFrameMatches(futureFrame, { ...context, area: visibleArea, timeKey: nextTimeKey }));
}
