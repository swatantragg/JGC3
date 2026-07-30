/* Domain constants shared by forms and displays. Keep in sync with the backend. */
export const UNIT_MODES = [
  { value: "piece", label: "Per piece" },
  { value: "100", label: "Per 100 pieces" },
  { value: "custom", label: "Customize" },
];

/* Which sheet of the client's master workbook a row came from. Kept for
   provenance — what actually differs between the ranges is carried by
   sticker_mult / sticker_round / label_spoilage on the item itself. */
export const STICKER_RULES = [
  { value: "pp", label: "PP range (Kiran · Hansa-PP · VP-PP)" },
  { value: "grn", label: "GRN range (Hansa-GRN · VP-GRN)" },
  { value: "oswin", label: "Oswin range (7A)" },
];

export const UOMS = [
  { value: "PCS", label: "Pieces" },
  { value: "MTR", label: "Metres" },
];

export const YES_NO = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
];

export const INV_STATUS_TONE = {
  "Ready to dispatch": "amber",
  "Dispatched": "teal",
  "Ready to Ship": "teal",
  "Shipped": "green",
};

export const EMPTY_ITEM = {
  code: "", gd: "", oswin: "", gl: "", size: "", length: "", pack_unit: 0, packing: 1,
  description: "", barcode: "", hsn: "", volume: 0.06, net_per_box: 0, gross_per_box: 0,
  bg_per_box: 0, p_per_box: 0, type_up: 0, sticker_mult: 1.1, sticker_round: false,
  stickers_fixed: 0, label_spoilage: 1, sticker_rule: "pp", uom: "PCS",
  value_mode: "piece", unit_value: 0, fob_mode: "100", unit_fob100: 0,
  group: "", source_sheet: "", supplier_id: null,
};

export const EMPTY_SUPPLIER = {
  code: "", name: "", place: "", gstin: "", addr: "", pin: "", state: "", weights: "auto",
};
