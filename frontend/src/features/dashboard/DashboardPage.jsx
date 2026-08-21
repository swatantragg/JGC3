import { useEffect, useMemo, useState } from "react";
import { Boxes, Ship, ClipboardList, Container, ChevronRight, EyeOff, Undo2, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardHead, Btn, Pill, Mono, DataTable, Modal, Empty, Note, Spinner, ErrorState } from "../../components/ui/index.jsx";
import { useDashboardMatrix, useInvoices, useItems, useBuyers, useHiddenPoMutations } from "../../api/hooks.js";
import { dmy, num } from "../../lib/format.js";
import { useIsMobile } from "../../lib/useIsMobile.js";
import { INV_STATUS_TONE } from "../../lib/constants.js";

/* Dashboard — the client's "Balance Orders, Boxes & Volume" sheet (doc 39),
   live: suppliers down the side, every open PO across the top, pending boxes
   and volume in each cell, a TOTAL row and estimated containers. Below it the
   invoices with their dispatch → ship status. Clicking a PO or an invoice
   jumps straight to it.

   An order that has been filled to the last box still holds a column of
   dashes, and after a year of trading that is most of the board. Those — and
   only those — carry a tick box: tick the ones you are finished with, confirm
   the list by number, and they come off the dashboard. Nothing is deleted:
   they stay in the PO summary, in the masters and in every report, and can be
   put back from the foot of this card. */

/* The balance matrix on a phone: suppliers across the top of a wide grid does
   not survive a 390px screen, so one supplier is chosen at a time and their
   open POs are listed down the page with the boxes and volume still owed. */
function BalanceCards({ M, empty, sel, onToggle, onOpenPo }) {
  const [sup, setSup] = useState("");           // "" = every supplier
  const row = M.rows.find((r) => r.supplier.id === sup);
  const cells = row ? row.cells : M.totals.cells;
  const totBox = row ? row.totBox : M.totals.totBox;
  const totVol = row ? row.totVol : M.totals.totVol;
  const open = M.pos.filter((po) => (cells[po]?.boxes || 0) > 0 || (cells[po]?.vol || 0) > 0);

  return (
    <>
      <div className="mob-tabs">
        <button className={sup === "" ? "on" : ""} onClick={() => setSup("")}>All suppliers</button>
        {M.rows.map((r) => (
          <button key={r.supplier.id} className={sup === r.supplier.id ? "on" : ""}
            onClick={() => setSup(r.supplier.id)}>{r.supplier.code}</button>
        ))}
      </div>

      <div className="dt-cards">
        {open.length ? open.map((po) => (
          <div key={po} className="dt-card click" onClick={onOpenPo}>
            <div className="dt-card-head">
              <span className="dt-card-title">PO {po}</span>
              <span className="dt-card-n">{dmy(M.po_date[po])}</span>
            </div>
            <dl className="dt-card-body">
              <div className="dt-pair"><dt>Boxes pending</dt><dd className="r"><b>{cells[po].boxes || "—"}</b></dd></div>
              <div className="dt-pair"><dt>Volume m³</dt><dd className="r">{cells[po].vol ? num(cells[po].vol, 2) : "—"}</dd></div>
              {!sup && (
                <div className="dt-pair">
                  <dt>Suppliers</dt>
                  <dd className="r">
                    <span className="row wrap" style={{ gap: 4, justifyContent: "flex-end" }}>
                      {M.rows.filter((r) => (r.cells[po]?.boxes || 0) > 0).map((r) => (
                        <Pill key={r.supplier.id}>{r.supplier.code}</Pill>
                      ))}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )) : <div className="dt-empty">Nothing pending {sup ? "from this supplier" : "on any order"}.</div>}

        {open.length > 0 && (
          <div className="dt-card dt-card-total">
            <div className="dt-card-head">
              <span className="dt-card-title">
                {row ? `${row.supplier.code} · total` : "All suppliers · total"}
              </span>
            </div>
            <dl className="dt-card-body">
              <div className="dt-pair"><dt>Boxes pending</dt><dd className="r"><b>{totBox}</b></dd></div>
              <div className="dt-pair"><dt>Volume m³</dt><dd className="r">{num(totVol, 2)}</dd></div>
              <div className="dt-pair"><dt>Containers</dt><dd className="r">{totVol > 0 ? (totVol / M.cntr_vol).toFixed(2) : "—"}</dd></div>
            </dl>
          </div>
        )}
      </div>

      {/* Filled orders, each with its tick box — the phone's half of the same
          "clear these off the board" action the matrix header carries. */}
      {empty.length > 0 && (
        <div className="dt-cards done-cards">
          <div className="done-head">
            <Check size={13} /> {empty.length} order{empty.length === 1 ? "" : "s"} fully delivered · tick to clear off the dashboard
          </div>
          {empty.map((po) => (
            <label key={po} className={`dt-card pick-card${sel.includes(po) ? " on" : ""}`}>
              <div className="dt-card-head">
                <span className="dt-card-title">
                  <input type="checkbox" className="ck" checked={sel.includes(po)} onChange={() => onToggle(po)} />
                  PO {po}
                </span>
                <span className="dt-card-n">{dmy(M.po_date[po])}</span>
              </div>
            </label>
          ))}
        </div>
      )}
    </>
  );
}

/* Invoices on a phone: date, buyer, volume, container and status per card. */
function InvoiceCards({ rows, brand, onOpen }) {
  return (
    <div className="dt-cards">
      {rows.map(({ inv, boxes, volume }) => (
        <div key={inv.id} className="dt-card click" onClick={onOpen}>
          <div className="dt-card-head">
            <span className="dt-card-title"><Mono>{inv.invoice_no}</Mono></span>
            <ChevronRight size={15} style={{ color: "var(--faint)", flexShrink: 0 }} />
          </div>
          <dl className="dt-card-body">
            <div className="dt-pair"><dt>Date</dt><dd className="r">{dmy(inv.date)}</dd></div>
            <div className="dt-pair"><dt>Buyer</dt><dd className="r">{brand(inv.buyer_id)}</dd></div>
            <div className="dt-pair"><dt>Boxes</dt><dd className="r"><b>{boxes}</b></dd></div>
            <div className="dt-pair"><dt>Volume m³</dt><dd className="r">{num(volume, 3)}</dd></div>
            <div className="dt-pair">
              <dt>Container</dt>
              <dd className="r">{inv.ship?.container ? <Mono>{inv.ship.container}</Mono> : "—"}</dd>
            </div>
            <div className="dt-pair">
              <dt>Status</dt>
              <dd className="r"><Pill tone={INV_STATUS_TONE[inv.status] || ""}>{inv.status}</Pill></dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}

/* The confirmation. It names every order by number, because "remove 4 orders"
   is not something anybody can check before they agree to it. */
function RemoveConfirm({ pos, dates, busy, onCancel, onConfirm }) {
  return (
    <Modal size="sm" title="Remove from the dashboard" icon={EyeOff} onClose={onCancel}
      footer={<>
        <Btn variant="ghost" size="sm" onClick={onCancel}>Cancel</Btn>
        <Btn variant="danger" size="sm" icon={EyeOff} disabled={busy} onClick={onConfirm}>
          {busy ? "Removing…" : `Remove ${pos.length} order${pos.length === 1 ? "" : "s"}`}
        </Btn>
      </>}>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 12px", lineHeight: 1.55 }}>
        {pos.length === 1 ? "This order is" : `These ${pos.length} orders are`} fully delivered
        and will come off the balance board:
      </p>
      <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
        {pos.map((po) => (
          <Pill key={po} tone="amber">PO {po}{dates[po] ? ` · ${dmy(dates[po])}` : ""}</Pill>
        ))}
      </div>
      <Note tone="teal" icon={ClipboardList}>
        Nothing is deleted. {pos.length === 1 ? "It stays" : "They stay"} in the PO summary, in the
        masters and in every report — this only clears the dashboard. You can put
        {pos.length === 1 ? " it" : " them"} back from the foot of the balance card.
      </Note>
    </Modal>
  );
}

export default function DashboardPage() {
  const nav = useNavigate();
  const mobile = useIsMobile();
  const mq = useDashboardMatrix();
  const invq = useInvoices();
  const items = useItems().data || [];
  const buyers = useBuyers().data || [];
  const { hide, restore } = useHiddenPoMutations();

  const [sel, setSel] = useState([]);
  const [confirm, setConfirm] = useState(false);

  const invoices = invq.data || [];
  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const brand = (id) => buyers.find((b) => b.id === id)?.brand || "—";

  const emptyPos = mq.data?.empty_pos || [];
  const hiddenPos = mq.data?.hidden_pos || [];

  /* A ticked order that has since been filled again — or removed by somebody
     else — must not stay ticked behind an invisible column. */
  useEffect(() => {
    setSel((p) => (p.length ? p.filter((po) => emptyPos.includes(po)) : p));
  }, [mq.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const invRows = useMemo(() => invoices.map((inv) => {
    let boxes = 0; let volume = 0;
    (inv.lines || []).forEach((l) => {
      const it = byId[l.item_id] || {};
      const b = Number(l.boxes) || 0;
      boxes += b; volume += b * (it.volume || 0);
    });
    return { inv, boxes, volume };
  }), [invoices, byId]);

  if (mq.isLoading) return <Spinner label="Rebuilding the balance register…" />;
  if (mq.error) return <ErrorState error={mq.error} onRetry={mq.refetch} />;

  const M = mq.data;
  const cntr = (vol) => (vol > 0 ? (vol / M.cntr_vol).toFixed(2) : "—");
  const toggle = (po) => setSel((p) => (p.includes(po) ? p.filter((x) => x !== po) : [...p, po]));
  const removeSelected = () => hide.mutate(sel, { onSuccess: () => { setSel([]); setConfirm(false); } });

  return (
    <div className="stack">
      <Card>
        <CardHead icon={Boxes} title="Balance orders · boxes & volume">
          {!mobile && <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Pending only · click a PO header to open it</span>}
        </CardHead>

        {/* The bar only appears once there is something to clear, and the
            button only once something is ticked. */}
        {emptyPos.length > 0 && (
          <div className="bulk-bar">
            <span className="bulk-txt">
              <Check size={13} />
              {sel.length
                ? <><b>{sel.length}</b> of {emptyPos.length} filled order{emptyPos.length === 1 ? "" : "s"} ticked</>
                : <>{emptyPos.length} order{emptyPos.length === 1 ? "" : "s"} fully delivered · tick one to clear it off the dashboard</>}
            </span>
            <span className="grow" />
            {sel.length > 0 && (
              <span className="row wrap" style={{ gap: 8 }}>
                <Btn variant="ghost" size="sm" onClick={() => setSel([])}>Clear ticks</Btn>
                <Btn variant="danger" size="sm" icon={EyeOff} onClick={() => setConfirm(true)}>
                  Remove {sel.length} from dashboard
                </Btn>
              </span>
            )}
          </div>
        )}

        {M.rows.length || emptyPos.length ? (mobile ? (
          <BalanceCards M={M} empty={emptyPos} sel={sel} onToggle={toggle} onOpenPo={() => nav("/orders")} />
        ) : (
          <div className="tbl-wrap">
            <table className="matrix">
              <thead>
                <tr>
                  <th rowSpan={2} className="mx-sup">Supplier</th>
                  {M.pos.map((po) => {
                    const done = emptyPos.includes(po);
                    return (
                      <th key={po} colSpan={2} className={`mx-po${done ? " mx-done" : ""}${sel.includes(po) ? " mx-picked" : ""}`}
                        onClick={() => nav("/orders")} title={`Open PO ${po}`}>
                        <span className="mx-poname">
                          {done && (
                            <input type="checkbox" className="ck mx-ck" checked={sel.includes(po)}
                              title="Clear this filled order off the dashboard"
                              aria-label={`Select PO ${po} to remove from the dashboard`}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggle(po)} />
                          )}
                          PO {po}
                        </span>
                        <span className="mx-podate">{dmy(M.po_date[po])}</span>
                      </th>
                    );
                  })}
                  <th colSpan={2} className="mx-tot">TOTAL</th>
                  <th rowSpan={2} className="mx-tot">CNTRS</th>
                </tr>
                <tr>
                  {M.pos.map((po) => [
                    <th key={po + "b"} className="mx-sub">BOX</th>,
                    <th key={po + "v"} className="mx-sub">VOL</th>,
                  ])}
                  <th className="mx-sub mx-tot">BOX</th>
                  <th className="mx-sub mx-tot">VOL</th>
                </tr>
              </thead>
              <tbody>
                {M.rows.map((r) => (
                  <tr key={r.supplier.id}>
                    <td className="mx-sup"><Pill>{r.supplier.code}</Pill> <span style={{ color: "var(--ink)" }}>{r.supplier.name}</span></td>
                    {M.pos.map((po) => [
                      <td key={po + "b"} className="r">{r.cells[po].boxes || "—"}</td>,
                      <td key={po + "v"} className="r mx-vol">{r.cells[po].vol ? num(r.cells[po].vol, 2) : "—"}</td>,
                    ])}
                    <td className="r strong">{r.totBox}</td>
                    <td className="r strong">{num(r.totVol, 2)}</td>
                    <td className="r">{cntr(r.totVol)}</td>
                  </tr>
                ))}
                {/* Every order filled, but filled orders left to clear: the
                    board still has to render, or there is nothing to tick. */}
                {!M.rows.length && (
                  <tr>
                    <td className="mx-sup" colSpan={M.pos.length * 2 + 4}
                      style={{ textAlign: "center", color: "var(--faint)", position: "static" }}>
                      No boxes are pending — every order above has been delivered in full.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td className="mx-sup">TOTAL</td>
                  {M.pos.map((po) => [
                    <td key={po + "b"} className="r">{M.totals.cells[po].boxes || "—"}</td>,
                    <td key={po + "v"} className="r mx-vol">{M.totals.cells[po].vol ? num(M.totals.cells[po].vol, 2) : "—"}</td>,
                  ])}
                  <td className="r">{M.totals.totBox}</td>
                  <td className="r">{num(M.totals.totVol, 2)}</td>
                  <td className="r">{cntr(M.totals.totVol)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )) : (
          <Empty icon={Boxes} title="Every order is filled">No boxes are pending across any purchase order.</Empty>
        )}
        <div className="card-foot">
          <div className="row wrap" style={{ gap: 18, fontSize: 12, color: "var(--muted)" }}>
            <span className="row" style={{ gap: 6 }}><Boxes size={13} /> {M.totals.totBox} boxes pending</span>
            <span className="row" style={{ gap: 6 }}><ClipboardList size={13} /> {M.pos.length} open PO(s)</span>
            <span className="row" style={{ gap: 6 }}><Container size={13} /> ≈ {M.containers} container(s) · {num(M.totals.totVol, 2)} m³</span>
            {hiddenPos.length > 0 && (
              <span className="row wrap" style={{ gap: 6 }}>
                <EyeOff size={13} /> {hiddenPos.length} removed from this board
                <button className="linkish" disabled={restore.isPending} onClick={() => restore.mutate(null)}>
                  <Undo2 size={12} /> Put {hiddenPos.length === 1 ? "it" : "them"} back
                </button>
              </span>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardHead icon={Ship} title={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"} · dispatch status`}>
          {!mobile && <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Click a row to open the shipment</span>}
        </CardHead>
        {invoices.length ? (mobile ? (
          <InvoiceCards rows={invRows} brand={brand} onOpen={() => nav("/shipments")} />
        ) : (
          <DataTable serial
            freeze={5}
            columns={[
              { key: "no", w: 156, label: "Invoice", render: (r) => <Mono>{r.inv.invoice_no}</Mono> },
              { key: "date", w: 118, label: "Date", render: (r) => <span style={{ color: "var(--muted)" }}>{dmy(r.inv.date)}</span> },
              { key: "buyer", w: 150, label: "Buyer", render: (r) => brand(r.inv.buyer_id) },
              { key: "boxes", w: 78, label: "Boxes", align: "r", strong: true, render: (r) => r.boxes },
              { key: "vol", w: 106, label: "Volume m³", align: "r", render: (r) => num(r.volume, 3) },
              { key: "container", label: "Container", render: (r) => r.inv.ship?.container ? <Mono>{r.inv.ship.container}</Mono> : <span style={{ color: "var(--faint)" }}>—</span> },
              { key: "status", label: "Status", render: (r) => <Pill tone={INV_STATUS_TONE[r.inv.status] || ""}>{r.inv.status}</Pill> },
            ]}
            rows={invRows} rowKey={(r) => r.inv.id}
            onRowClick={() => nav("/shipments")}
          />
        )) : <Empty icon={Ship} title="No invoices yet">Record packing to create the first invoice.</Empty>}
      </Card>

      {confirm && sel.length > 0 && (
        <RemoveConfirm pos={sel} dates={M.po_date} busy={hide.isPending}
          onCancel={() => setConfirm(false)} onConfirm={removeSelected} />
      )}
    </div>
  );
}
