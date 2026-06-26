"use client";

import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value` that only updates after `delayMs` of
 * quiescence. Lets components derive expensive work (parsing, previews, future
 * autocomplete) from rapid input without recomputing on every keystroke (SC3).
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
