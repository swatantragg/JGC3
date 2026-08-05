import { useEffect, useState } from "react";

/* One place that decides "this is a phone".

   The CSS breakpoints do most of the responsive work on their own, but a few
   screens need a genuinely different *shape* on a small screen — a table
   becomes a list of cards, a side-by-side form becomes a button that opens a
   dialog. Those cannot be done with CSS alone, so they ask here.

   Kept in step with the 760px tier in index.css. Anything wider renders
   exactly what it always did — none of this touches the desktop. */
export const MOBILE_QUERY = "(max-width: 760px)";

export function useIsMobile(query = MOBILE_QUERY) {
  const [is, setIs] = useState(
    () => (typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(query).matches
      : false),
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const on = (e) => setIs(e.matches);
    setIs(mq.matches);
    // addEventListener is the modern spelling; addListener keeps older Safari.
    if (mq.addEventListener) mq.addEventListener("change", on);
    else mq.addListener(on);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", on);
      else mq.removeListener(on);
    };
  }, [query]);

  return is;
}
