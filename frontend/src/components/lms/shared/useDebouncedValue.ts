import { useEffect, useState } from "react";

/**
 * Debounces a value (search input) so every keystroke does not
 * become a query. The immediate value stays in the input; the
 * debounced value is what reaches the server.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
