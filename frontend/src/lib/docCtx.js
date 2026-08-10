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
  stickerMult: i.sticker_mult, stickerRound: i.sticker_round, stickerRule: i.sticker_rule,
  stickersFixed: i.stickers_fixed, labelSpoilage: i.label_spoilage,
  uom: i.uom, valueMode: i.value_mode, unitValue: i.unit_value,
  fobMode: i.fob_mode, unitFob100: i.unit_fob100,
  group: i.group, supplierId: i.supplier_id,
});

export const docBuyer = (b) => (b ? {
  id: b.id, name: b.name, brand: b.brand, country: b.country, curr: b.curr,
  shipTo: b.ship_to, addr: b.addr, orderNo: b.order_no,
  ourReference: b.our_reference || "",
  /* The buyer's own letterhead — what their purchase order (document 17)
     prints around the goods. Blank until Setup fills it in. */
  tagline: b.tagline || "", acCode: b.ac_code || "", abn: b.abn || "", acn: b.acn || "",
  tel: b.tel || "", fax: b.fax || "", web: b.web || "", email: b.email || "", poBox: b.po_box || "",
  logo: b.logo || "",
} : {
  name: "—", brand: "—", country: "—", curr: "USD", shipTo: "", addr: "",
  orderNo: "", ourReference: "",
  tagline: "", acCode: "", abn: "", acn: "", tel: "", fax: "", web: "", email: "", poBox: "", logo: "",
});

export const docSupplier = (s) => ({
  id: s.id, code: s.code, name: s.name, place: s.place, gstin: s.gstin,
  addr: s.addr, pin: s.pin, state: s.state,
  yourReference: s.your_reference || "",
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
  /* Each line carries the prices the invoice was actually raised at. A
     delivered invoice is history — its customs paperwork, the supplier's bill
     and the bank documents were all issued at these figures — so every
     document rebuilt from it must reproduce them, never today's price. A line
     with no snapshot predates the columns and falls back to the master. */
  lines: (inv.lines || []).map((l) => ({
    itemId: l.item_id, supplierId: l.supplier_id, boxes: l.boxes,
    unitValue: l.unit_value, valueMode: l.value_mode,
    unitFob100: l.unit_fob100, fobMode: l.fob_mode,
  })),
} : null);

/* The buyer order book, in the engine's row shape.

   Each line carries the prices the order was actually agreed at — the API
   returns them on the line — so a master edit in Setup does not restate an
   order already placed. A line with no snapshot (written before the columns
   existed) falls back to the item master, exactly as the API does. */
export const docOrderLines = (poLines, itemsById) =>
  (poLines || []).map((r) => {
    const item = itemsById[r.item_id];
    if (!item) return null;
    const priced = {
      ...item,
      unitValue: r.unit_value == null ? item.unitValue : Number(r.unit_value),
      valueMode: r.value_mode || item.valueMode,
      unitFob100: r.unit_fob100 == null ? item.unitFob100 : Number(r.unit_fob100),
      fobMode: r.fob_mode || item.fobMode,
    };
    return {
      id: r.id, po: r.po, date: r.date, buyerId: r.buyer_id,
      itemId: r.item_id, qty: r.qty, rbi: r.rbi, item: priced,
    };
  }).filter(Boolean);

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

/* The purchase-order stage context.

   The PO papers (1–6) are raised the moment the buyer's order is entered, so
   they must not wait on a packing invoice the way every later document does.
   The engine still reads `ctx.inv` for the document date and the shipment
   block, so one is synthesised from the order: the PO's own date, its buyer,
   and no shipment details — those genuinely do not exist yet and print blank.
   `ctx.po` marks the context as PO-stage; `orderRefOf` in lib/docs.js prints
   that number as the order reference. */
export function poCtx({ po, items = [], buyers = [], suppliers = [], poLines = [], transports = [] }) {
  const docItems = items.map(docItem);
  const byId = Object.fromEntries(docItems.map((i) => [i.id, i]));
  const sups = suppliers.map(docSupplier);
  const mine = (poLines || []).filter((r) => r.po === po);
  const date = mine.reduce((min, r) => (!min || r.date < min ? r.date : min), null);
  const buyerId = mine.find((r) => r.buyer_id)?.buyer_id || null;
  const rbi = mine.find((r) => r.rbi)?.rbi || 0;

  return {
    po,
    inv: {
      id: `po-${po}`, invoiceNo: "", date: date || new Date().toISOString().slice(0, 10),
      buyerId, rbi, serialStart: 1,
      vehicles: {}, ship: {}, stepSkip: {}, packingTransports: {}, lines: [],
    },
    buyer: docBuyer(buyers.find((b) => b.id === buyerId) || buyers[0]),
    items: docItems,
    buyerMaster: docOrderLines(mine, byId),
    invoices: [],
    SUPPLIERS: sups,
    BUYERS: buyers.map(docBuyer),
    EXPORTER,
    transports: transports.map(docTransport),
    supCode: (id) => sups.find((s) => s.id === id)?.code || "—",
  };
}
