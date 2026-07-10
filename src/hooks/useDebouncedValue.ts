import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value` that only updates once `value` has stopped
 * changing for `delayMs`. Use it to keep a fast-changing input (e.g. a search box)
 * off the query keys / network path so a query fires per pause, not per keystroke.
 *
 * Mirrors the debounce technique baked into `useListPage`, extracted so richer
 * list pages (Cases) that can't adopt that hook wholesale still share the 300ms
 * convention.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
