/**
 * Returns a debounced wrapper of `fn` that delays invocation until `waitMs` have
 * elapsed since the last call. Used to keep rapid input (typing) from triggering
 * redundant work on every keystroke (SC3).
 *
 * The returned function exposes `.cancel()` to drop a pending invocation.
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number
): ((...args: A) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}
