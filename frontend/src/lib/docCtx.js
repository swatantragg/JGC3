/* Adapter — API records into the shape the document engine reads.

   `lib/docs.js` is the reference build's engine, kept verbatim so all 40
   layouts stay identical. It speaks camelCase; the API speaks snake_case.
   Rather than touch 40 builders, everything is translated here, once. */

export const EXPORTER = {
  name: "JAIKVIN GLOBAL",
  sub: "Merchant Exporters",
  addr: "A-101, Rajshree Royale, Navroji Lane, Ghatkopar (W), MUMBAI-400 086. Maharashtra (State Code : 27)",
  tel: "9987122600",
  email: "aalok.shah@jaikvinglobal.com",
  iec: "AVIPS4808H",
  gstin: "27AVIPS4808H1Z8",
  pan: "AVIPS4808H",
  origin: "INDIA",
};

export const docItem = (i) => ({
  id: i.id, code: i.code, gd: i.gd, oswin: i.oswin, gl: i.gl,
  size: i.size, length: i.length, packing: i.packing, packUnit: i.pack_unit,
  description: i.description, barcode: i.barcode, hsn: i.hsn,
  volume: i.volume, netPerBox: i.net_per_box, grossPerBox: i.gross_per_box,
  bgPerBox: i.bg_per_box, pPerBox: i.p_per_box, typeUp: i.type_up,
  stickerMult: i.sticker_mult, stickerRound: i.sticker_round,
  stickersFixed: i.stickers_fixed, labelSpoilage: i.label_spoilage,
  uom: i.uom, valueMode: i.value_mode, unitValue: i.unit_value,
  fobMode: i.fob_mode, unitFob100: i.unit_fob100,
  group: i.group, supplierId: i.supplier_id,
});

export const docBuyer = (b) => (b ? {
  id: b.id, name: b.name, brand: b.brand, country: b.country, curr: b.curr,
  shipTo: b.ship_to, addr: b.addr, orderNo: b.order_no,
} : { name: "—", brand: "—", country: "—", curr: "USD", shipTo: "", addr: "", orderNo: "" });

export const docSupplier = (s) => ({
  id: s.id, code: s.code, name: s.name, place: s.place, gstin: s.gstin,
  addr: s.addr, pin: s.pin, state: s.state,
});

export const docTransport = (t) => ({
  id: t.id, name: t.name, transportId: t.transport_id,
  supplierId: t.supplier_id, supplierIds: t.supplier_ids || [],
});

export const docInvoice = (inv) => (inv ? {
  id: inv.id, invoiceNo: inv.invoice_no, date: inv.date, buyerId: inv.buyer_id,
  rbi: inv.rbi, serialStart: inv.serial_start,
  vehicles: inv.vehicles || {}, ship: inv.ship || {}, stepSkip: inv.step_skip || {},
  packingTransports: inv.packing_transports || {},
  lines: (inv.lines || []).map((l) => ({ itemId: l.item_id, supplierId: l.supplier_id, boxes: l.boxes })),
} : null);

/* The buyer order book, in the engine's row shape — each line carries a
   snapshot of its item so a later master edit never rewrites history. */
export const docOrderLines = (poLines, itemsById) =>
  (poLines || []).map((r) => ({
    id: r.id, po: r.po, date: r.date, buyerId: r.buyer_id,
    itemId: r.item_id, qty: r.qty, rbi: r.rbi,
    item: itemsById[r.item_id],
  })).filter((r) => r.item);

/* Assemble everything one document needs. */
export function docCtx({ invoice, items = [], buyers = [], suppliers = [], poLines = [], transports = [], invoices = [] }) {
  const docItems = items.map(docItem);
  const byId = Object.fromEntries(docItems.map((i) => [i.id, i]));
  const sups = suppliers.map(docSupplier);
  const inv = docInvoice(invoice);
  const buyer = docBuyer(buyers.find((b) => b.id === invoice?.buyer_id) || buyers[0]);
  return {
    inv, buyer, items: docItems,
    buyerMaster: docOrderLines(poLines, byId),
    invoices: invoices.map(docInvoice),
    SUPPLIERS: sups,
    BUYERS: buyers.map(docBuyer),
    EXPORTER,
    transports: transports.map(docTransport),
    supCode: (id) => sups.find((s) => s.id === id)?.code || "—",
  };
}
