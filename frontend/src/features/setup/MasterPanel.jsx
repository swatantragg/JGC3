import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardHead, Btn, DataTable, EditBtn, Empty, Spinner, ErrorState, Note } from "../../components/ui/index.jsx";
import RecordModal from "./RecordModal.jsx";

/* One reusable master (list + add + edit + delete), wired to the query hooks.
   Used for suppliers, buyers, items and transports. */
export default function MasterPanel({ title, icon, hooks, schema, columns, empty, blank, cols = 3, note }) {
  const list = hooks.useList();
  const create = hooks.useCreate();
  const update = hooks.useUpdate();
  const remove = hooks.useRemove();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  if (list.isLoading) return <Spinner label={`Loading ${title.toLowerCase()}…`} />;
  if (list.error) return <ErrorState error={list.error} onRetry={list.refetch} />;

  const rows = list.data || [];

  const actionCol = {
    key: "_act", label: "", align: "r", render: (r) => (
      <span className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
        <EditBtn onClick={() => setEditing(r)} />
        {confirmId === r.id ? (
          <span className="row" style={{ gap: 6 }}>
            <Btn variant="danger" size="sm" icon={Trash2} onClick={() => remove.mutate(r.id, { onSettled: () => setConfirmId(null) })}>Confirm</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setConfirmId(null)}>No</Btn>
          </span>
        ) : (
          <button className="icon-btn bare" title="Delete" onClick={() => setConfirmId(r.id)}><Trash2 size={14} /></button>
        )}
      </span>
    ),
  };

  return (
    <>
      <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="page-head" style={{ margin: 0 }}>
          <h2 className="h1" style={{ fontSize: 18 }}>{title}</h2>
        </div>
        <Btn icon={Plus} onClick={() => setAdding(true)}>Add {title.replace(/s$/, "").toLowerCase()}</Btn>
      </div>

      {note && <Note tone="teal">{note}</Note>}

      <Card>
        <CardHead icon={icon} title={`${rows.length} ${title.toLowerCase()}`} />
        {rows.length
          ? <DataTable columns={[...columns, actionCol]} rows={rows} rowKey={(r) => r.id} maxHeight={560} />
          : <Empty icon={icon} title={empty.title}>{empty.body}</Empty>}
      </Card>

      {adding && (
        <RecordModal title={`Add ${title.replace(/s$/, "").toLowerCase()}`} schema={schema} value={blank} cols={cols}
          saving={create.isPending}
          onClose={() => setAdding(false)}
          onSave={(body) => create.mutate(body, { onSuccess: () => setAdding(false) })} />
      )}
      {editing && (
        <RecordModal title={`Edit ${title.replace(/s$/, "").toLowerCase()}`} schema={schema} value={editing} cols={cols}
          saving={update.isPending}
          onClose={() => setEditing(null)}
          onSave={(body) => update.mutate({ id: editing.id, body }, { onSuccess: () => setEditing(null) })} />
      )}
    </>
  );
}
