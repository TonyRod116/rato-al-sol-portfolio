// Resolve quickly when a source has places, while reporting failures that arrive later.
export function firstWithResults(tasks, onFailure = () => {}, { preferPublicMs = 0, schedule = setTimeout, unschedule = clearTimeout } = {}) {
  return new Promise((resolve, reject) => {
    let waiting = tasks.length, successes = 0, failures = 0, lastError, stale = false, partial = false;
    let settled = false, fallback = null, timer;
    function finish(result) {
      if (settled) return;
      settled = true;
      if (timer !== undefined) unschedule(timer);
      resolve(result);
    }
    for (const task of tasks) task.then((result) => {
      successes++;
      stale ||= Boolean(result.stale); partial ||= Boolean(result.partial);
      if (!result.places.length || settled) return;
      if (preferPublicMs > 0 && !result.places.some((place) => place.kind === 'public')) {
        if (!fallback) {
          fallback = result;
          timer = schedule(() => finish(fallback), preferPublicMs);
        }
      } else finish(result);
    }, (error) => { failures++; lastError = error; onFailure(error); }).finally(() => {
      if (--waiting !== 0 || settled) return;
      if (fallback) finish(fallback);
      else if (successes) finish({ places: [], source: 'empty', ...(stale ? { stale: true } : {}), ...(partial || failures ? { partial: true } : {}) });
      else { settled = true; reject(lastError); }
    });
  });
}
