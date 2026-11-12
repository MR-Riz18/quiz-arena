import { useState, useEffect } from 'react';

// Returns a debounced copy of `value` that only updates after `delay` ms
// of no changes. Ideal for search-as-you-type inputs.
export function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
