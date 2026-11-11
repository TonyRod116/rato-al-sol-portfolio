// Keep the day strip proportional to the same interval as the time slider.
// The underlying solar windows still cover the full day for detailed results.
export function clipDaylightWindows(windows, start, end) {
  return windows.flatMap((window) => {
    const from = Math.max(start, window.from);
    const to = Math.min(end, window.to);
    return to > from ? [{ ...window, from, to }] : [];
  });
}
