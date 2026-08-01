/* Prices stay off the screen.

   The client asked for the FOB $ and unit ₹ columns — and the totals that give
   them away, since a total divided by a quantity is the unit price — to be
   invisible in the app. Nothing is removed from the database and nothing is
   removed from a download: every export still carries the full figures, and
   the edit form still shows and saves them. This is a display rule and only a
   display rule, kept in one place so no table can quietly reintroduce a
   column the client does not want on a monitor.

   The Costing screen is deliberately outside this: pricing is the entire
   subject of that page, and the client asks for the old and new price to be
   shown side by side there.  */

export const PRICE_COLUMN_KEYS = new Set([
  // Item master
  "unitValue", "unitFob", "fobpc",
  // Purchase orders — PO detail, order lines, supplier summary
  "val", "fob", "unit", "inr", "usd", "tinr", "fobu", "tusd",
  "cost", "cpu", "tc", "fpc", "tfob",
  // RBI reference and the rate derived from it
  "rbi", "rbiref", "rref", "rate",
  // Invoice detail and the shipment register
  "amt",
  // Balance registers
  "value",
]);

/** Drop the price columns from a DataTable column list. */
export const hidePriceCols = (columns) =>
  (columns || []).filter((c) => c && !PRICE_COLUMN_KEYS.has(c.key));

/** How many of a list are being withheld — for the note under a table. */
export const hiddenPriceCount = (columns) =>
  (columns || []).filter((c) => c && PRICE_COLUMN_KEYS.has(c.key)).length;

export const PRICE_HIDDEN_NOTE =
  "Purchase and FOB prices are kept off screen. They are stored in full and "
  + "appear complete in every Excel and PDF download.";
