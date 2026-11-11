// The handle has three positions: nearly full-map, summary, and details.
export function swipeSheet(position, dy) {
  if (dy < -24) return position === 'minimized' ? 'normal' : 'expanded';
  if (dy > 24) return position === 'expanded' ? 'normal' : 'minimized';
  return position;
}

export function tapSheet(position) {
  return position === 'normal' ? 'minimized' : 'normal';
}

// Keep the map usable without hiding the time controls. The nearby-search
// panel retains more room for its form; larger text receives additional room.
export function normalSheetHeight(height, topInset, fontScale, mode, isBusiness = false) {
  const available = Math.max(0, height - topInset - 42);
  const extraText = Math.max(0, fontScale - 1);
  const wanted = mode === 'place'
    ? Math.max(320 + extraText * 160, Math.min(350, height * 0.39)) + (isBusiness ? 34 : 0)
    : Math.max(390 + extraText * 120, height * 0.48);
  return Math.min(available, 550, wanted);
}

// The compact sheet can shrink to its measured contents. A fixed height puts
// unused space between the place summary and the time controls. While any
// measurement is unavailable, retain the existing conservative fallback.
export function measuredSheetHeight(maximum, measurements) {
  if (!Number.isFinite(maximum) || maximum <= 0) return 0;
  const dimensions = ['handle', 'summary', 'controls', 'navigation'].map((key) => measurements?.[key]);
  if (dimensions.some((value) => !Number.isFinite(value) || value <= 0)) return maximum;
  return Math.min(maximum, Math.ceil(dimensions.reduce((total, value) => total + value, 0)));
}
