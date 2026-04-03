import { useEffect, useState } from "react";
import { fetchTransactions, healTransaction } from "@/services/mockApi";
import { ChevronLeft, ChevronRight, RefreshCw, X } from "lucide-react";

type Tx = Awaited<ReturnType<typeof fetchTransactions>>["data"][number];

const GATEWAY_COLOR: Record<string, string> = {
  razorpay: "bg-primary/10 text-primary",
  stripe: "bg-success/10 text-success",
  cashfree: "bg-warning/10 text-warning",
};

const STATUS_COLOR: Record<string, string> = {
  created: "bg-muted text-muted-foreground",
  captured: "bg-primary/10 text-primary",
  settled: "bg-success/10 text-success",
  refunded: "bg-destructive/10 text-destructive",
};

export default function Transactions() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Tx | null>(null);
  const perPage = 5;

  const load = async () => {
    const r = await fetchTransactions(page, perPage);
    setTxs(r.data);
    setTotal(r.total);
  };

  useEffect(() => { load(); }, [page]);
  useEffect(() => {
    const id = setInterval(load, 5_000);
    return () => clearInterval(id);
  }, [page]);

  const totalPages = Math.ceil(total / perPage);

  const handleHeal = async (txId: string) => {
    await healTransaction(txId);
    load();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-foreground">Transaction Explorer</h2>

      <div className="bg-card border rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-secondary/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Transaction ID</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Gateway</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">State Timeline</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((tx) => (
              <tr
                key={tx.id}
                className={`border-b last:border-0 transition-colors ${tx.isHealing ? "bg-warning/5" : "hover:bg-secondary/30"}`}
              >
                <td className="px-4 py-3">
                  <button onClick={() => setSelected(tx)} className="text-primary hover:underline font-mono text-xs">
                    {tx.id}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${GATEWAY_COLOR[tx.gateway] ?? ""}`}>
                    {tx.gateway}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[tx.status] ?? ""}`}>
                    {tx.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {tx.currency === "USD" ? "$" : "₹"}
                  {(tx.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3">
                  <Timeline steps={tx.timeline} />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleHeal(tx.id)}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <RefreshCw className="h-3 w-3" /> Re-heal
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {page} of {totalPages} · {total} transactions
        </span>
        <div className="flex gap-1">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="p-1 rounded hover:bg-secondary disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="p-1 rounded hover:bg-secondary disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Drawer */}
      {selected && <EventDrawer tx={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Timeline({ steps }: { steps: Array<{ step: string; present: boolean }> }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground">→</span>}
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${
              s.present
                ? "bg-primary/10 text-primary"
                : "border border-dashed border-destructive text-destructive bg-destructive/5"
            }`}
          >
            {!s.present && "gap: "}
            {s.step}
          </span>
        </div>
      ))}
    </div>
  );
}

function EventDrawer({ tx, onClose }: { tx: Tx; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-foreground/20" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border-l shadow-lg p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Raw Event Log</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-2 font-mono">{tx.id}</p>
        <pre className="bg-secondary rounded-md p-3 text-xs overflow-x-auto text-foreground">
          {JSON.stringify(tx.rawEvents, null, 2)}
        </pre>
      </div>
    </div>
  );
}
