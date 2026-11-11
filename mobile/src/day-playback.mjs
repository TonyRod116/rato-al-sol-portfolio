// The daylight animation is intentionally shorter than the manual selector.
export const PLAYBACK_START = 6 * 60;
export const PLAYBACK_END = 22 * 60;
const STEP = 15;

export function nextPlaybackTime(minutes) {
  if (!Number.isFinite(minutes) || minutes < PLAYBACK_START || minutes >= PLAYBACK_END) return PLAYBACK_START;
  return Math.min(minutes + STEP, PLAYBACK_END);
}

// Fraction of the common 06:00–22:00 timeline filled by the selected time.
export function playbackProgress(minutes) {
  if (!Number.isFinite(minutes)) return 0;
  return Math.max(0, Math.min(1, (minutes - PLAYBACK_START) / (PLAYBACK_END - PLAYBACK_START)));
}
