import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { BASE_URL } from '../lib/api';
import { ChevronRight } from 'lucide-react';

interface TransactionEvent {
  event_type: string;
  gateway_timestamp: string;
  source: string;
  id: string;
}

interface Transaction {
  id: string;
  webhook_events: TransactionEvent[];
  amount: number;
  gateway: string;
  current_state: string;
  gateway_txn_id: string;
  currency: string;
}

const stateColors: Record<string, string> = {
  initiated: '#3B82F6',
  created: '#6366F1',
  authorized: '#8B5CF6',
  captured: '#E8363D',
  settled: '#16A34A',
  failed: '#EF4444',
  refunded: '#6366F1',
};

const gatewayColors: Record<string, { bg: string; text: string; border: string }> = {
  razorpay: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  stripe: { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE' },
  cashfree: { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
};

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState('');
  const [gatewayFilter, setGatewayFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 10;

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const params: Record<string, any> = { limit, page };
        if (stateFilter) params.state = stateFilter;
        if (gatewayFilter) params.gateway = gatewayFilter;
        const res = await axios.get(`${BASE_URL}/transactions`, { params });
        setTransactions(res.data.data || []);
      } catch (err) {
        console.error('Failed to fetch transactions:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
    const interval = setInterval(fetchTransactions, 5000);
    return () => clearInterval(interval);
  }, [stateFilter, gatewayFilter, page]);

  const gateways = useMemo(() => {
    const unique = new Set(transactions.map((t) => t.gateway?.toLowerCase()));
    return Array.from(unique).sort();
  }, [transactions]);

  if (loading && transactions.length === 0) {
    return <div className="text-center py-16" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>;
  }

  const textPrimary = 'var(--color-text-primary)';
  const textSecondary = 'var(--color-text-secondary)';
  const textMuted = 'var(--color-text-muted)';
  const borderColor = 'var(--color-border)';

  return (
    <div className="space-y-5">
      {/* ── Filters ── */}
      <div className="rounded p-4 flex flex-wrap gap-4 items-end" style={{ background: '#fff', border: `1px solid ${borderColor}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: textMuted }}>State</label>
          <select
            value={stateFilter}
            onChange={(e) => { setStateFilter(e.target.value); setPage(1); }}
            className="text-sm"
            style={{ borderRadius: '4px', border: `1px solid ${borderColor}`, padding: '6px 10px', color: textPrimary, outline: 'none', minWidth: '140px' }}
          >
            <option value="">All States</option>
            {['created', 'authorized', 'captured', 'settled', 'failed', 'refunded'].map((s) => (
              <option key={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: textMuted }}>Gateway</label>
          <select
            value={gatewayFilter}
            onChange={(e) => { setGatewayFilter(e.target.value); setPage(1); }}
            className="text-sm"
            style={{ borderRadius: '4px', border: `1px solid ${borderColor}`, padding: '6px 10px', color: textPrimary, outline: 'none', minWidth: '140px' }}
          >
            <option value="">All Gateways</option>
            {gateways.map((g) => (
              <option key={g}>{g?.charAt(0).toUpperCase() + g?.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="rounded overflow-hidden" style={{ background: '#fff', border: `1px solid ${borderColor}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${borderColor}` }}>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted, background: '#FAFAFD' }}>Transaction ID</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted, background: '#FAFAFD' }}>Gateway</th>
                <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted, background: '#FAFAFD' }}>Amount</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted, background: '#FAFAFD' }}>Timeline</th>
                <th className="px-5 py-3 text-center text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted, background: '#FAFAFD' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, i) => {
                const events = tx.webhook_events || [];
                const status = events.length > 0 ? events[events.length - 1].event_type : tx.current_state;
                const displayStatus = status === 'unknown' ? tx.current_state || 'captured' : status;
                const gw = gatewayColors[tx.gateway?.toLowerCase()] || { bg: '#F5F5F5', text: '#6B7280', border: '#E5E7EB' };
                const statusColor = stateColors[displayStatus] || '#6B7280';

                return (
                  <tr key={tx.id} style={{ borderBottom: i < transactions.length - 1 ? `1px solid ${borderColor}` : 'none' }}>
                    <td className="px-5 py-3.5 font-mono" style={{ color: textPrimary, fontSize: '11px' }}>
                      {tx.id.substring(0, 10)}…
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-block px-2.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: gw.bg, color: gw.text, border: `1px solid ${gw.border}` }}>
                        {tx.gateway}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold tabular-nums" style={{ color: textPrimary, fontSize: '12px', letterSpacing: '-0.02em' }}>
                      {tx.currency} {(tx.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1 items-center">
                        {events.filter((e) => e.event_type !== 'unknown').map((evt, j) => (
                          <div key={j} className="flex items-center gap-1">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: (stateColors[evt.event_type] || '#F5F5F5') + '18', color: stateColors[evt.event_type] || '#6B7280' }}>
                              {evt.event_type}
                            </span>
                            {j < events.filter((e) => e.event_type !== 'unknown').length - 1 && <ChevronRight className="h-2.5 w-2.5" style={{ color: textMuted }} />}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="inline-block px-2.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: statusColor + '18', color: statusColor }}>
                        {displayStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {transactions.length === 0 && (
          <div className="text-center py-12" style={{ color: textMuted }}>No transactions found.</div>
        )}
      </div>

      {/* ── Pagination ── */}
      {transactions.length > 0 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded"
            style={{ border: `1px solid ${borderColor}`, color: textSecondary }}
          >
            Previous
          </button>
          <span className="px-3 py-1.5 text-sm" style={{ color: textMuted }}>Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={transactions.length < limit}
            className="px-3 py-1.5 text-sm rounded"
            style={{ border: `1px solid ${borderColor}`, color: textSecondary }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
