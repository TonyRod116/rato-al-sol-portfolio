export const TIME_START = 6 * 60;
export const TIME_END = 22 * 60;

export function initialSelectedTime(minutes, step) {
  return Math.min(TIME_END, Math.max(TIME_START, Math.floor(minutes / step) * step));
}

export function visibleWindows(windows) {
  return windows.flatMap(({ from, to, ...rest }) => {
    const start = Math.max(TIME_START, from);
    const end = Math.min(TIME_END, to);
    return start < end ? [{ ...rest, from: start, to: end }] : [];
  });
}

export function timePercent(minutes) {
  return Math.max(0, Math.min(100, (minutes - TIME_START) / (TIME_END - TIME_START) * 100));
}

export function nextPlaybackTime(minutes, step) {
  return minutes >= TIME_END ? TIME_START : Math.min(TIME_END, minutes + step);
}
