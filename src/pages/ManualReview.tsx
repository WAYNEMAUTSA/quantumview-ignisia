import { useEffect, useState } from "react";
import { fetchManualQueue, healTransaction, resolveManualReview } from "@/services/mockApi";
import { CheckCircle2, RefreshCw, X } from "lucide-react";

type Item = Awaited<ReturnType<typeof fetchManualQueue>>[number];

export default function ManualReview() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [resolveTarget, setResolveTarget] = useState<Item | null>(null);

  const load = async () => {
    const r = await fetchManualQueue();
    setItems(r);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 5_000);
    return () => clearInterval(id);
  }, []);

  if (items === null) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-foreground">Manual Review Queue</h2>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CheckCircle2 className="h-16 w-16 text-success mb-4" />
          <p className="text-lg font-medium text-foreground">No anomalies – ledger is healthy</p>
          <p className="text-sm text-muted-foreground mt-1">All transactions are reconciled.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => (
            <div key={item.id} className="bg-card border rounded-lg shadow-sm overflow-hidden flex">
              <div className="w-1 bg-destructive shrink-0" />
              <div className="p-4 flex-1 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-mono text-sm font-medium text-foreground">{item.transactionId}</p>
                    <span className="text-xs text-destructive font-medium">{item.anomalyType}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleTimeString()}</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.humanReadableReason}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setResolveTarget(item)}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    Resolve manually
                  </button>
                  <button
                    onClick={async () => {
                      await healTransaction(item.transactionId);
                      load();
                    }}
                    className="px-3 py-1.5 rounded-md text-xs font-medium border text-foreground hover:bg-secondary transition-colors inline-flex items-center gap-1"
                  >
                    <RefreshCw className="h-3 w-3" /> Re-fetch from gateway
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {resolveTarget && (
        <ResolveModal item={resolveTarget} onClose={() => { setResolveTarget(null); load(); }} />
      )}
    </div>
  );
}

function ResolveModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const [status, setStatus] = useState("settled");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    await resolveManualReview(item.id, status);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/20" onClick={onClose} />
      <div className="relative bg-card border rounded-lg shadow-lg p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Resolve Manually</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">Set the correct status for <span className="font-mono">{item.transactionId}</span>.</p>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background text-foreground"
        >
          <option value="created">Created</option>
          <option value="captured">Captured</option>
          <option value="settled">Settled</option>
          <option value="refunded">Refunded</option>
        </select>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border hover:bg-secondary transition-colors text-foreground">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
