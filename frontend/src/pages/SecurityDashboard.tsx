import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BASE_URL } from '../lib/api';
import { Shield, AlertTriangle, XCircle, CheckCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface SecurityLog {
  id: string;
  gateway_txn_id: string;
  event_type: string;
  risk_score: number;
  fraud_flag: boolean;
  assessment: 'block' | 'drop' | 'allow';
  original_timestamp: string;
  retry_timestamp: string;
  time_delta_ms: number;
  header_consistency: number;
  flagged_fields: string[];
  ip_address: string;
  user_agent: string;
  created_at: string;
}

interface FraudStats {
  totalBlocked: number;
  totalDropped: number;
  totalAllowed: number;
  avgRiskScore: number;
  topFlaggedFields: { field: string; count: number }[];
}

export default function SecurityDashboard() {
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [stats, setStats] = useState<FraudStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [totalLogs, setTotalLogs] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [logsRes, statsRes] = await Promise.all([
        axios.get(`${BASE_URL}/security/logs?limit=100`),
        axios.get(`${BASE_URL}/security/stats`),
      ]);
      setLogs(logsRes.data.entries || []);
      setTotalLogs(logsRes.data.pagination?.total || 0);
      setStats(statsRes.data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch security data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const textPrimary = 'var(--color-text-primary)';
  const textSecondary = 'var(--color-text-secondary)';
  const textMuted = 'var(--color-text-muted)';
  const borderColor = 'var(--color-border)';

  if (loading) {
    return <div className="text-center py-16" style={{ color: textMuted }}>Loading security dashboard…</div>;
  }

  const total = (stats?.totalBlocked || 0) + (stats?.totalDropped || 0) + (stats?.totalAllowed || 0);

  // Severity color for risk score
  const getRiskColor = (score: number) => {
    if (score >= 60) return '#DC2626';
    if (score >= 25) return '#D97706';
    return '#16A34A';
  };

  const getAssessmentBadge = (assessment: string) => {
    switch (assessment) {
      case 'block':
        return { bg: '#FEF2F2', color: '#DC2626', label: 'BLOCKED', icon: <XCircle className="h-3 w-3" /> };
      case 'drop':
        return { bg: '#FFFBEB', color: '#D97706', label: 'DROPPED', icon: <AlertTriangle className="h-3 w-3" /> };
      case 'allow':
        return { bg: '#F0FDF4', color: '#16A34A', label: 'ALLOWED', icon: <CheckCircle className="h-3 w-3" /> };
      default:
        return { bg: '#F3F4F6', color: textMuted, label: assessment, icon: null };
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold mb-0.5" style={{ color: textPrimary, letterSpacing: '-0.01em' }}>
            <Shield className="h-5 w-5 inline mr-1.5" style={{ color: '#6366F1' }} />
            Security Dashboard
          </h2>
          <p className="text-sm" style={{ color: textMuted }}>
            Fraud detection &amp; webhook integrity monitoring · {totalLogs} total events
            {lastUpdated && (
              <span className="ml-2" style={{ fontSize: '10px' }}>
                · last updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            {refreshing && (
              <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            )}
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition"
          style={{ borderRadius: '4px', border: `1px solid ${borderColor}`, background: '#fff', color: textSecondary }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ── Stats Cards ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {/* Blocked */}
          <div className="rounded p-4" style={{ background: '#fff', border: `1px solid ${borderColor}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="h-4 w-4" style={{ color: '#DC2626' }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: textMuted }}>Blocked</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#DC2626' }}>{stats.totalBlocked}</p>
            {total > 0 && <p className="text-[10px]" style={{ color: textMuted }}>{((stats.totalBlocked / total) * 100).toFixed(1)}% of total</p>}
          </div>

          {/* Dropped */}
          <div className="rounded p-4" style={{ background: '#fff', border: `1px solid ${borderColor}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4" style={{ color: '#D97706' }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: textMuted }}>Dropped</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#D97706' }}>{stats.totalDropped}</p>
            {total > 0 && <p className="text-[10px]" style={{ color: textMuted }}>{((stats.totalDropped / total) * 100).toFixed(1)}% of total</p>}
          </div>

          {/* Allowed */}
          <div className="rounded p-4" style={{ background: '#fff', border: `1px solid ${borderColor}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4" style={{ color: '#16A34A' }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: textMuted }}>Allowed</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#16A34A' }}>{stats.totalAllowed}</p>
            {total > 0 && <p className="text-[10px]" style={{ color: textMuted }}>{((stats.totalAllowed / total) * 100).toFixed(1)}% of total</p>}
          </div>

          {/* Avg Risk */}
          <div className="rounded p-4" style={{ background: '#fff', border: `1px solid ${borderColor}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4" style={{ color: '#6366F1' }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: textMuted }}>Avg Risk</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: getRiskColor(stats.avgRiskScore) }}>{stats.avgRiskScore}</p>
            <p className="text-[10px]" style={{ color: textMuted }}>out of 100</p>
          </div>

          {/* Total Events */}
          <div className="rounded p-4" style={{ background: '#fff', border: `1px solid ${borderColor}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4" style={{ color: textMuted }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: textMuted }}>Events</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: textPrimary }}>{totalLogs}</p>
            <p className="text-[10px]" style={{ color: textMuted }}>logged</p>
          </div>
        </div>
      )}

      {/* ── Top Flagged Fields ── */}
      {stats && stats.topFlaggedFields.length > 0 && (
        <div className="rounded p-4" style={{ background: '#fff', border: `1px solid ${borderColor}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: textPrimary }}>Top Flagged Headers</h3>
          <div className="flex flex-wrap gap-2">
            {stats.topFlaggedFields.map((f) => (
              <span
                key={f.field}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium"
                style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
              >
                {f.field}
                <span className="font-bold">{f.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Security Log Entries ── */}
      {logs.length === 0 ? (
        <div className="text-center py-20">
          <div className="flex justify-center mb-4">
            <Shield className="h-14 w-14" style={{ color: '#16A34A' }} />
          </div>
          <h2 className="text-xl font-semibold mb-1" style={{ color: textPrimary }}>No Security Events</h2>
          <p className="text-sm" style={{ color: textMuted }}>All webhook requests are passing fraud checks.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const badge = getAssessmentBadge(log.assessment);
            const isExpanded = expandedId === log.id;
            return (
              <div
                key={log.id}
                className="rounded overflow-hidden transition"
                style={{
                  background: '#fff',
                  border: `1px solid ${log.fraud_flag ? '#FECACA' : borderColor}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                >
                  {/* Assessment icon */}
                  <div className="flex-shrink-0">{badge.icon}</div>

                  {/* Badge */}
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold flex-shrink-0"
                    style={{ background: badge.bg, color: badge.color }}
                  >
                    {badge.label}
                  </span>

                  {/* Risk score bar */}
                  <div className="flex-shrink-0 w-16">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 flex-1 rounded" style={{ background: '#F3F4F6' }}>
                        <div
                          className="h-full rounded"
                          style={{ width: `${Math.min(log.risk_score, 100)}%`, background: getRiskColor(log.risk_score) }}
                        />
                      </div>
                      <span className="text-[10px] font-mono font-bold" style={{ color: getRiskColor(log.risk_score) }}>
                        {log.risk_score}
                      </span>
                    </div>
                  </div>

                  {/* Transaction ID */}
                  <span className="font-mono text-xs truncate" style={{ color: textMuted }}>
                    {log.gateway_txn_id.substring(0, 18)}…
                  </span>

                  {/* Event type */}
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: '#F3F4F6', color: textSecondary }}>
                    {log.event_type}
                  </span>

                  {/* Time delta */}
                  <span className="text-[10px] flex-shrink-0" style={{ color: textMuted }}>
                    Δ {log.time_delta_ms > 60000 ? `${(log.time_delta_ms / 60000).toFixed(1)}m` : `${(log.time_delta_ms / 1000).toFixed(0)}s`}
                  </span>

                  {/* Consistency */}
                  <span className="text-[10px] flex-shrink-0" style={{ color: (log.header_consistency < 0.8 ? '#DC2626' : textMuted) }}>
                    {(log.header_consistency * 100).toFixed(0)}% match
                  </span>

                  {/* Expand arrow */}
                  <div className="ml-auto flex-shrink-0" style={{ color: textMuted }}>
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t" style={{ borderTop: `1px solid ${borderColor}` }}>
                    <div className="grid grid-cols-2 gap-4 mt-3 text-xs">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: textMuted }}>IP Address</p>
                        <p className="font-mono" style={{ color: textPrimary }}>{log.ip_address}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: textMuted }}>User Agent</p>
                        <p style={{ color: textPrimary, fontSize: '10px' }}>{log.user_agent}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: textMuted }}>Original Attempt</p>
                        <p style={{ color: textPrimary, fontSize: '10px' }}>{new Date(log.original_timestamp).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: textMuted }}>Retry Attempt</p>
                        <p style={{ color: textPrimary, fontSize: '10px' }}>{new Date(log.retry_timestamp).toLocaleString()}</p>
                      </div>
                      {log.flagged_fields.length > 0 && (
                        <div className="col-span-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: textMuted }}>Flagged Fields</p>
                          <div className="flex flex-wrap gap-1.5">
                            {log.flagged_fields.map((f) => (
                              <span key={f} className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ background: '#FEF2F2', color: '#DC2626' }}>
                                {f}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
