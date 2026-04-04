import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BASE_URL } from '../lib/api';
import { AlertTriangle, CheckCircle, RefreshCw, Loader2, X, Brain, Sparkles } from 'lucide-react';

interface Anomaly {
  id: string;
  transaction_id: string;
  type: string;
  severity: string;
  description: string;
  resolved_at: string | null;
  created_at: string;
  transactions?: {
    gateway: string;
    gateway_txn_id: string;
    amount: number;
  };
}

export default function ManualReview() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [selectedAnomaly, setSelectedAnomaly] = useState<Anomaly | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [resolving, setResolving] = useState(false);
  const [refetching, setRefetching] = useState<string | null>(null);
  const [refetchResult, setRefetchResult] = useState<{ success: boolean; message: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [aiHandling, setAiHandling] = useState(false);
  const [aiProcessing, setAiProcessing] = useState<Set<string>>(new Set());
  const [aiResults, setAiResults] = useState<{ id: string; transactionId: string; status: string; message: string }[] | null>(null);

  const fetchAnomalies = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await axios.get(`${BASE_URL}/anomalies`);
      setAnomalies(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch anomalies:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAnomalies();
    const interval = setInterval(fetchAnomalies, 5000);
    return () => clearInterval(interval);
  }, [fetchAnomalies]);

  const handleResolve = async (anomaly: Anomaly) => {
    setSelectedAnomaly(anomaly);
    setResolveNote('');
    setResolveModalOpen(true);
  };

  const submitResolve = async () => {
    if (!selectedAnomaly) return;
    setResolving(true);
    try {
      await axios.patch(`${BASE_URL}/anomalies/${selectedAnomaly.id}/resolve`, {
        note: resolveNote || 'Manually resolved via review queue',
        targetState: 'captured',
      });
      setAnomalies((prev) => prev.filter((a) => a.id !== selectedAnomaly.id));
      setResolveModalOpen(false);
      setResolveNote('');
      setSelectedAnomaly(null);
    } catch (err: any) {
      console.error('Failed to resolve anomaly:', err);
    } finally {
      setResolving(false);
    }
  };

  const handleRefetch = async (anomaly: Anomaly) => {
    setRefetching(anomaly.id);
    setRefetchResult(null);
    try {
      const res = await axios.post(`${BASE_URL}/anomalies/${anomaly.id}/refetch`);
      setRefetchResult({ success: true, message: res.data.message || `Replayed ${res.data.replayed} events.` });
      await fetchAnomalies();
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Failed to re-fetch from gateway';
      setRefetchResult({ success: false, message: msg });
    } finally {
      setRefetching(null);
      setTimeout(() => setRefetchResult(null), 5000);
    }
  };

  const handleAiAutoHandle = async () => {
    setAiHandling(true);
    setAiResults(null);
    const currentIds = new Set(anomalies.filter((a) => !a.resolved_at).map((a) => a.id));
    setAiProcessing(currentIds);
    try {
      const res = await axios.post(`${BASE_URL}/anomalies/auto-handle`);
      setAiResults(res.data.results || []);
      await fetchAnomalies();
      setTimeout(() => { setAiProcessing(new Set()); setAiHandling(false); }, 2000);
    } catch (err: any) {
      console.error('AI auto-handle failed:', err);
      setAiHandling(false);
      setAiProcessing(new Set());
    }
  };

  if (loading) {
    return <div className="text-center py-16" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>;
  }

  const unresolvedAnomalies = anomalies.filter((a) => !a.resolved_at);

  if (unresolvedAnomalies.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="flex justify-center mb-4">
          <CheckCircle className="h-14 w-14" style={{ color: '#16A34A' }} />
        </div>
        <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>All Clear</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Ledger is healthy. No anomalies detected.</p>
      </div>
    );
  }

  const accentRed = 'var(--color-accent-red)';
  const textPrimary = 'var(--color-text-primary)';
  const textSecondary = 'var(--color-text-secondary)';
  const textMuted = 'var(--color-text-muted)';
  const borderColor = 'var(--color-border)';

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold mb-0.5" style={{ color: textPrimary, letterSpacing: '-0.01em' }}>AI Review Queue</h2>
          <p className="text-sm" style={{ color: textMuted }}>
            {unresolvedAnomalies.length} unresolved · {aiHandling ? 'processing…' : 'ready for auto-handle'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAiAutoHandle}
            disabled={aiHandling}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold transition"
            style={{
              borderRadius: '4px',
              border: `1px solid #C084FC`,
              background: aiHandling ? '#F3E8FF' : 'linear-gradient(135deg, #F3E8FF 0%, #EDE9FE 100%)',
              color: '#7C3AED',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            {aiHandling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
            {aiHandling ? 'Processing…' : 'AI Auto-Handle'}
          </button>
          <button
            onClick={fetchAnomalies}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition"
            style={{ borderRadius: '4px', border: `1px solid ${borderColor}`, background: '#fff', color: textSecondary }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Refetch Result ── */}
      {refetchResult && (
        <div
          className="rounded p-3.5 flex items-center justify-between text-sm"
          style={{
            background: refetchResult.success ? '#F0FDF4' : '#FEF2F2',
            border: `1px solid ${refetchResult.success ? '#BBF7D0' : '#FECACA'}`,
            color: refetchResult.success ? '#166534' : '#991B1B',
          }}
        >
          <span className="font-medium">{refetchResult.message}</span>
          <button onClick={() => setRefetchResult(null)}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* ── AI Results ── */}
      {aiResults && aiResults.length > 0 && (
        <div className="rounded p-4" style={{ background: 'linear-gradient(135deg, #F3E8FF 0%, #EDE9FE 100%)', border: '1px solid #DDD6FE' }}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4" style={{ color: '#7C3AED' }} />
            <span className="text-sm font-semibold" style={{ color: '#6D28D9' }}>AI Auto-Handle Results</span>
          </div>
          <div className="space-y-1">
            {aiResults.map((result) => (
              <div key={result.id} className="flex items-center gap-2" style={{ fontSize: '11px' }}>
                {result.status === 'healed' && <CheckCircle className="h-3 w-3" style={{ color: '#16A34A' }} />}
                {result.status === 'suppressed' && <X className="h-3 w-3" style={{ color: textMuted }} />}
                {result.status === 'failed' && <AlertTriangle className="h-3 w-3" style={{ color: accentRed }} />}
                {result.status === 'retrying' && <Loader2 className="h-3 w-3 animate-spin" style={{ color: '#D97706' }} />}
                <span className="font-mono">{result.transactionId.substring(0, 14)}</span>
                <span style={{
                  color: result.status === 'healed' ? '#166534' : result.status === 'failed' ? '#991B1B' : result.status === 'retrying' ? '#92400E' : textMuted,
                  fontWeight: 500,
                }}>
                  {result.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Anomaly Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {unresolvedAnomalies.map((anomaly) => {
          const isProcessing = aiProcessing.has(anomaly.id);
          return (
            <div
              key={anomaly.id}
              className="rounded overflow-hidden transition"
              style={{
                background: '#fff',
                border: `1px solid ${isProcessing ? '#C084FC' : borderColor}`,
                boxShadow: isProcessing ? `0 0 0 2px #E9D5FF, 0 1px 3px rgba(0,0,0,0.06)` : '0 1px 3px rgba(0,0,0,0.06)',
                animation: isProcessing ? 'pulse 2s ease-in-out infinite' : 'none',
              }}
            >
              {/* Top accent bar */}
              <div className="h-0.5" style={{ background: isProcessing ? '#A78BFA' : accentRed }} />

              <div className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      {isProcessing
                        ? <><Brain className="h-3.5 w-3.5 animate-spin" style={{ color: '#7C3AED' }} /><span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#7C3AED' }}>Processing</span></>
                        : <><AlertTriangle className="h-3.5 w-3.5" style={{ color: accentRed }} /><span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accentRed }}>{anomaly.severity}</span></>
                      }
                    </div>
                    <p className="font-mono truncate" style={{ fontSize: '10px', color: textMuted }}>{anomaly.transaction_id}</p>
                  </div>
                  <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#FEF2F2', color: '#DC2626' }}>
                    {anomaly.type.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Description */}
                <p className="text-sm leading-relaxed mb-4" style={{ color: textPrimary }}>
                  {anomaly.description}
                </p>

                {/* Created */}
                <p className="text-[10px] mb-4" style={{ color: textMuted }}>
                  Created {new Date(anomaly.created_at).toLocaleString()}
                </p>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleResolve(anomaly)}
                    disabled={isProcessing}
                    className="flex-1 px-3 py-2 text-xs font-semibold rounded transition"
                    style={{
                      border: '1px solid #93C5FD',
                      background: '#EFF6FF',
                      color: '#1D4ED8',
                    }}
                  >
                    Resolve
                  </button>
                  <button
                    onClick={() => handleRefetch(anomaly)}
                    disabled={refetching === anomaly.id || isProcessing}
                    className="flex-1 px-3 py-2 text-xs font-semibold rounded transition flex items-center justify-center gap-1"
                    style={{ border: `1px solid ${borderColor}`, background: '#fff', color: textSecondary }}
                  >
                    {refetching === anomaly.id
                      ? <><Loader2 className="h-3 w-3 animate-spin" />Fetching</>
                      : <><RefreshCw className="h-3 w-3" />Re-fetch</>
                    }
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Resolve Modal ── */}
      {resolveModalOpen && selectedAnomaly && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="rounded-lg shadow-lg p-6 max-w-md w-full mx-4" style={{ background: '#fff' }}>
            <h3 className="text-base font-semibold mb-4" style={{ color: textPrimary }}>Resolve Anomaly</h3>
            <div className="mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: textMuted }}>Transaction</p>
              <p className="font-mono text-sm mb-3" style={{ color: textPrimary }}>{selectedAnomaly.transaction_id}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: textMuted }}>Issue</p>
              <p className="text-sm mb-4" style={{ color: textPrimary }}>{selectedAnomaly.description}</p>
              <label className="block text-xs font-medium mb-1.5" style={{ color: textSecondary }}>Resolution Note</label>
              <textarea
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                placeholder="Document the resolution…"
                className="w-full px-3 py-2 text-sm"
                style={{ border: `1px solid ${borderColor}`, borderRadius: '4px', outline: 'none' }}
                rows={3}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setResolveModalOpen(false); setResolveNote(''); setSelectedAnomaly(null); }}
                disabled={resolving}
                className="flex-1 px-4 py-2 text-sm font-medium rounded"
                style={{ border: `1px solid ${borderColor}`, color: textSecondary }}
              >
                Cancel
              </button>
              <button
                onClick={submitResolve}
                disabled={resolving}
                className="flex-1 px-4 py-2 text-sm font-semibold rounded text-white flex items-center justify-center gap-2"
                style={{ background: '#6366F1' }}
              >
                {resolving ? <><Loader2 className="h-4 w-4 animate-spin" />Resolving</> : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
