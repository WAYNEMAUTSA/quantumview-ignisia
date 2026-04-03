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
  initiated: 'bg-blue-100 text-blue-700',
  processing: 'bg-purple-100 text-purple-700',
  unknown: 'bg-amber-100 text-amber-700',
  healing: 'bg-orange-100 text-orange-700',
  settled: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-indigo-100 text-indigo-700',
};

const gatewayBadgeColors: Record<string, string> = {
  razorpay: 'bg-blue-50 text-blue-700 border-blue-200',
  stripe: 'bg-purple-50 text-purple-700 border-purple-200',
  cashfree: 'bg-green-50 text-green-700 border-green-200',
  paypal: 'bg-yellow-50 text-yellow-700 border-yellow-200',
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
    // Real-time polling every 5 seconds
    const interval = setInterval(fetchTransactions, 5000);
    return () => clearInterval(interval);
  }, [stateFilter, gatewayFilter, page]);

  const gateways = useMemo(() => {
    const unique = new Set(transactions.map((t) => t.gateway?.toLowerCase()));
    return Array.from(unique).sort();
  }, [transactions]);

  if (loading && transactions.length === 0) {
    return <div className="text-center py-12 text-gray-500">Loading transactions...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
          <select
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value);
              setPage(1);
            }}
            className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"
          >
            <option value="">All States</option>
            {['initiated', 'processing', 'unknown', 'healing', 'settled', 'failed', 'refunded'].map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Gateway</label>
          <select
            value={gatewayFilter}
            onChange={(e) => {
              setGatewayFilter(e.target.value);
              setPage(1);
            }}
            className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"
          >
            <option value="">All Gateways</option>
            {gateways.map((g) => (
              <option key={g} value={g}>
                {g?.charAt(0).toUpperCase() + g?.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Transaction ID</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Gateway</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Amount</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">State Timeline</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Current Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {transactions.map((tx) => {
                const events = tx.webhook_events || [];
                const status = events.length > 0 ? events[events.length - 1].event_type : tx.current_state;
                const isHealing = status === 'unknown' || status === 'healing';

                return (
                  <tr key={tx.id} className={isHealing ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                    <td className="px-6 py-4 font-mono text-xs text-gray-900">{tx.id.substring(0, 12)}...</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-medium border ${
                          gatewayBadgeColors[tx.gateway?.toLowerCase() || ''] || 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}
                      >
                        {tx.gateway}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {tx.currency} {(tx.amount / 100).toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1 items-center">
                        {events.map((evt, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${stateColors[evt.event_type] || 'bg-gray-100 text-gray-700'}`}>
                              {evt.event_type}
                            </span>
                            {i < events.length - 1 && <ChevronRight className="h-3 w-3 text-gray-400" />}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${stateColors[status] || 'bg-gray-100 text-gray-700'}`}>
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {transactions.length === 0 && (
          <div className="text-center py-12 text-gray-500">No transactions found.</div>
        )}
      </div>

      {/* Pagination */}
      {transactions.length > 0 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-2 rounded border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="px-3 py-2 text-sm text-gray-600">Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={transactions.length < limit}
            className="px-3 py-2 rounded border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

