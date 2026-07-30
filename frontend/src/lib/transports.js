/* A carrier may serve several suppliers — the workbook lists one against
   "Oswin Plastic Pvt Ltd, VP Plastic". `supplier_ids` holds the full set;
   `supplier_id` is the first of them, kept for older records that predate
   the list. Match on either so no carrier goes missing from a picker. */
export const servesSupplier = (t, supplierId) =>
  Array.isArray(t?.supplier_ids) && t.supplier_ids.length
    ? t.supplier_ids.includes(supplierId)
    : t?.supplier_id === supplierId;

export const transportsFor = (transports, supplierId) =>
  (transports || []).filter((t) => servesSupplier(t, supplierId));
