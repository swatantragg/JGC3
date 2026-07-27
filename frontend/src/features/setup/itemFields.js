import { UNIT_MODES, STICKER_RULES, UOMS } from "../../lib/constants.js";

/* One description of an item's fields, shared by the add drawer and the edit
   modal so the two can never fall out of step. */
export const itemSections = (supOpts) => [
  {
    n: "1", title: "Identity", hint: "OSWIN and GL codes are only used by the ranges that carry them.",
    fields: [
      { key: "code", label: "Code *" }, { key: "gd", label: "GD code *" },
      { key: "oswin", label: "OSWIN code" }, { key: "gl", label: "GL code" },
      { key: "description", label: "Description", type: "textarea", span: 2 },
      { key: "barcode", label: "Bar code number" },
      { key: "group", label: "Group", hint: 'Product family, e.g. PP Moulded or 25 MM (1")' },
      { key: "supplier_id", label: "Supplier", type: "select", options: supOpts },
    ],
  },
  {
    n: "2", title: "Physical", hint: "Drives boxes, volume and weight on every packing list.",
    fields: [
      { key: "size", label: "Size (mm)" }, { key: "length", label: "Length (mm)" },
      { key: "uom", label: "Ordered in", type: "select", options: UOMS, allowEmpty: false },
      { key: "pack_unit", label: "Pieces per unit pack", type: "number" },
      { key: "packing", label: "Pieces per box *", type: "number" },
      { key: "volume", label: "Volume / box (m³)", type: "number", step: "0.001" },
      { key: "net_per_box", label: "Nett weight / box (kg)", type: "number", step: "0.01" },
      { key: "gross_per_box", label: "Gross weight / box (kg)", type: "number", step: "0.01" },
    ],
  },
  {
    n: "3", title: "Barcode stickers & labels",
    hint: "Stickers per box = ( bag + piece ) × multiplier, rounded on the GRN range. Labels = boxes × that × the allowance. Sheets = RoundUp ( labels ÷ labels per sheet ).",
    fields: [
      { key: "bg_per_box", label: "Bag stickers / box", type: "number" },
      { key: "p_per_box", label: "Piece stickers / box", type: "number" },
      { key: "sticker_mult", label: "Sticker multiplier", type: "number", step: "0.01", hint: "1.1 on most rows" },
      { key: "sticker_round", label: "Round the total?", type: "bool", hint: "Yes on the GRN range" },
      { key: "stickers_fixed", label: "Fixed total (override)", type: "number", hint: "0 = work it out" },
      { key: "label_spoilage", label: "Label allowance", type: "number", step: "0.01", hint: "1.05 on the Oswin range" },
      { key: "type_up", label: "Labels per sheet", type: "number" },
      { key: "sticker_rule", label: "Range", type: "select", options: STICKER_RULES, allowEmpty: false },
    ],
  },
  {
    n: "4", title: "HSN & pricing",
    hint: "HSN drives GST. The basis (per piece / per 100) sits before each price and groups the Proforma.",
    fields: [
      { key: "hsn", label: "HSN code" },
      { key: "value_mode", label: "Purchase basis", type: "select", options: UNIT_MODES, allowEmpty: false },
      { key: "unit_value", label: "Purchase price (₹)", type: "number", step: "0.01" },
      { key: "fob_mode", label: "FOB basis", type: "select", options: UNIT_MODES, allowEmpty: false },
      { key: "unit_fob100", label: "FOB price ($)", type: "number", step: "0.0001" },
      { key: "source_sheet", label: "Source sheet", hint: "Where in Masters.xlsx this row came from" },
    ],
  },
];

/* Flattened into the RecordModal schema, section headers included. */
export const itemSchema = (supOpts) =>
  itemSections(supOpts).flatMap((s) => [{ section: s.title, hint: s.hint }, ...s.fields]);

export const ITEM_NUM = ["pack_unit", "packing", "volume", "net_per_box", "gross_per_box",
  "bg_per_box", "p_per_box", "type_up", "sticker_mult", "stickers_fixed", "label_spoilage",
  "unit_value", "unit_fob100"];
