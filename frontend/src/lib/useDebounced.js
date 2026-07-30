import { useEffect, useState } from "react";

/* Hold a value still for `delay` ms. Used for anything that becomes a request
   key — a search box or a quantity — so typing "5000" asks the API once
   rather than four times. */
export function useDebounced(value, delay = 300) {
  const [held, setHeld] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setHeld(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return held;
}
