export const TIME_START = 6 * 60;
export const TIME_END = 23 * 60;

export function initialSelectedTime(minutes, step) {
  return Math.min(TIME_END, Math.max(TIME_START, Math.floor(minutes / step) * step));
}
