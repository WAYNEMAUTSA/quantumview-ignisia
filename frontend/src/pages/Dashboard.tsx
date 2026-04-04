import { useEffect, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import axios from 'axios';
import { BASE_URL } from '../lib/api';
import { TrendingDown, Heart, Webhook, AlertTriangle, Shield, ShieldCheck } from 'lucide-react';

interface Metrics {
  driftRate: number;
  healSuccessRate: number;
  totalWebhooks: number;
  openAnomalies: number;
  healStats: {
    totalEvents: number;
    healedEvents: number;
    normalEvents: number;
    totalAgentInterventions: number;
    healed: number;
    suppressed: number;
    processed: number;
    recoveryRate: number;
  };
}

interface DriftDataPoint {
  timestamp: string;
  driftRate: number;
  dropped?: number;
  outOfOrder?: number;
  duplicates?: number;
}

interface WebhookVolumeData {
  state: string;
  count: number;
  fill: string;
}

interface HealActivity {
  id: string;
  description: string;
  created_at: string;
  transaction_id: string;
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [driftHistory, setDriftHistory] = useState<DriftDataPoint[]>([]);
  const [webhookVolume, setWebhookVolume] = useState<WebhookVolumeData[]>([]);
  const [healActivity, setHealActivity] = useState<HealActivity[]>([]);
  const [healerHistory, setHealerHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    try {
      const [metricsRes, _anomaliesRes, transactionsRes, driftHistoryRes, healerHistoryRes, allAnomaliesRes] = await Promise.all([
        axios.get<Metrics>(`${BASE_URL}/metrics`),
        axios.get(`${BASE_URL}/anomalies`),
        axios.get(`${BASE_URL}/transactions?limit=1000`),
        axios.get(`${BASE_URL}/metrics/drift-history`),
        axios.get(`${BASE_URL}/metrics/healer-history`),
        axios.get(`${BASE_URL}/anomalies?include_resolved=true`),
      ]);

      const data = metricsRes.data;
      setMetrics(data);
      setDriftHistory(driftHistoryRes.data.data || []);
      setHealerHistory(healerHistoryRes.data.data || []);

      const transactions = transactionsRes.data.data || [];
      const stateMap: Record<string, number> = {};
      transactions.forEach((tx: any) => {
        const state = tx.current_state;
        if (!state || state === 'unknown') return;
        stateMap[state] = (stateMap[state] || 0) + 1;
      });

      const stateColors: Record<string, string> = {
        initiated: '#3b82f6',
        created: '#6366f1',
        authorized: '#8b5cf6',
        captured: '#E8363D',
        settled: '#22c55e',
        failed: '#ef4444',
        refunded: '#6366f1',
      };

      setWebhookVolume(
        Object.entries(stateMap)
          .map(([state, count]) => ({
            state: state.charAt(0).toUpperCase() + state.slice(1),
            count,
            fill: stateColors[state] || '#94a3b8',
          }))
          .sort((a, b) => b.count - a.count)
      );

      const allAnomalies = allAnomaliesRes.data.data || [];
      setHealActivity(
        allAnomalies
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 10)
          .map((a: any) => ({
            id: a.id,
            description: a.resolution_notes
              ? `✓ ${a.resolution_notes.substring(0, 80)}${a.resolution_notes.length > 80 ? '...' : ''}`
              : a.description || `Resolved anomaly in tx ${a.transaction_id?.substring(0, 8)}`,
            created_at: a.resolved_at || a.created_at,
            transaction_id: a.transaction_id,
          }))
      );
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !metrics) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="metric-card">
            <div className="skeleton h-3 w-20 mb-2"></div>
            <div className="skeleton h-7 w-28 mb-1"></div>
            <div className="skeleton h-2.5 w-16"></div>
          </div>
        ))}
      </div>
    );
  }

  const isDriftCritical = metrics.driftRate > 5;
  const hasManualQueue = metrics.openAnomalies > 0;
  const driftStatus = isDriftCritical
    ? { text: 'Critical', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' }
    : metrics.driftRate > 2
    ? { text: 'Warning', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' }
    : { text: 'Healthy', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' };

  const primaryTextColor = 'var(--color-text-primary)';
  const secondaryTextColor = 'var(--color-text-secondary)';
  const mutedTextColor = 'var(--color-text-muted)';

  return (
    <div className="space-y-5">
      {/* ── Metric Cards (4 primary) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Drift Rate */}
        <div className="metric-card" style={{ background: driftStatus.bg, borderColor: driftStatus.border }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-semibold" style={{ color: primaryTextColor, letterSpacing: '-0.01em' }}>Drift Rate</span>
            <TrendingDown style={{ color: driftStatus.color }} className="h-4 w-4" />
          </div>
          <p className="metric-value mb-1" style={{ color: driftStatus.color, fontSize: '26px' }}>
            {metrics.driftRate.toFixed(1)}%
          </p>
          <p className="text-[11px] font-semibold" style={{ color: driftStatus.color, letterSpacing: '0.02em' }}>
            {driftStatus.text}
          </p>
        </div>

        {/* Heal Success Rate */}
        <div className="metric-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-semibold" style={{ color: primaryTextColor, letterSpacing: '-0.01em' }}>Heal Rate</span>
            <Heart className="h-4 w-4" style={{ color: '#16A34A' }} />
          </div>
          <p className="metric-value mb-1" style={{ color: '#16A34A', fontSize: '26px' }}>
            {metrics.healSuccessRate.toFixed(1)}%
          </p>
          <p className="text-[11px] font-semibold" style={{ color: metrics.healSuccessRate >= 90 ? '#16A34A' : mutedTextColor, letterSpacing: '0.02em' }}>
            {metrics.healSuccessRate >= 90 ? 'Excellent' : 'Monitor'}
          </p>
        </div>

        {/* Webhooks */}
        <div className="metric-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-semibold" style={{ color: primaryTextColor, letterSpacing: '-0.01em' }}>Webhooks</span>
            <Webhook className="h-4 w-4" style={{ color: '#0EA5E9' }} />
          </div>
          <p className="metric-value mb-1" style={{ color: primaryTextColor, fontSize: '26px' }}>
            {(metrics.totalWebhooks || 0).toLocaleString()}
          </p>
          <p className="text-[11px] font-semibold" style={{ color: mutedTextColor, letterSpacing: '0.02em' }}>
            Last 60 minutes
          </p>
        </div>

        {/* AI Recovery */}
        <div className="metric-card" style={{ background: hasManualQueue ? '#FFF5F5' : '#F0FDF4', borderColor: hasManualQueue ? '#FECACA' : '#BBF7D0' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-semibold" style={{ color: primaryTextColor, letterSpacing: '-0.01em' }}>
              {hasManualQueue ? `${metrics.openAnomalies} Open` : 'AI Recovery'}
            </span>
            {hasManualQueue
              ? <AlertTriangle className="h-4 w-4" style={{ color: '#E8363D' }} />
              : <ShieldCheck className="h-4 w-4" style={{ color: '#6366F1' }} />
            }
          </div>
          <p className="metric-value mb-1" style={{ color: hasManualQueue ? '#E8363D' : '#6366F1', fontSize: '26px' }}>
            {hasManualQueue ? metrics.openAnomalies : `${(metrics.healStats?.recoveryRate ?? 0).toFixed(1)}%`}
          </p>
          <p className="text-[11px] font-semibold" style={{ color: hasManualQueue ? '#E8363D' : mutedTextColor, letterSpacing: '0.02em' }}>
            {hasManualQueue ? 'Needs review' : `${metrics.healStats?.totalAgentInterventions ?? 0} interventions`}
          </p>
        </div>
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Drift Rate Trend */}
        <div className="chart-card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: secondaryTextColor }}>
              Drift Rate Trend
            </h3>
            {driftHistory.length > 0 && (
              <span style={{ fontSize: '11px', fontWeight: 600, color: mutedTextColor }}>
                {driftHistory.length} snapshots
              </span>
            )}
          </div>
          {driftHistory.length === 0 ? (
            <div className="flex items-center justify-center h-[220px]" style={{ color: mutedTextColor, fontSize: '12px' }}>
              Collecting data…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={driftHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke={mutedTextColor.replace(')', ', 0.15)').replace('var(', '').replace('--color-text-muted', '#9A9AAE')} opacity={0.3} />
                <XAxis dataKey="timestamp" tick={{ fontSize: 9, fill: '#9A9AAE' }} angle={-30} textAnchor="end" height={50} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9A9AAE' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #E4E4ED', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  labelStyle={{ color: '#1A1A2E', fontWeight: 600, fontSize: '11px' }}
                  formatter={(value: number) => [`${value.toFixed(1)}%`, 'Drift']}
                  itemStyle={{ fontSize: '11px', fontWeight: 600 }}
                />
                <Line
                  type="monotone"
                  dataKey="driftRate"
                  stroke={isDriftCritical ? '#EF4444' : '#E8363D'}
                  strokeWidth={2}
                  dot={false}
                  name="Drift"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Transaction States */}
        <div className="chart-card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: secondaryTextColor }}>
              Transaction States
            </h3>
            {webhookVolume.length > 0 && (
              <span style={{ fontSize: '11px', fontWeight: 600, color: mutedTextColor }}>
                {webhookVolume.reduce((s, e) => s + e.count, 0)} total
              </span>
            )}
          </div>
          {webhookVolume.length === 0 ? (
            <div className="flex items-center justify-center h-[220px]" style={{ color: mutedTextColor, fontSize: '12px' }}>
              No transaction data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={webhookVolume}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E4ED" opacity={0.5} />
                <XAxis dataKey="state" tick={{ fontSize: 10, fill: '#9A9AAE' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9A9AAE' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #E4E4ED', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  labelStyle={{ color: '#1A1A2E', fontWeight: 600, fontSize: '11px' }}
                  formatter={(value: number) => [value, 'Transactions']}
                  itemStyle={{ fontSize: '11px', fontWeight: 600 }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Transactions">
                  {webhookVolume.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Audit Log + Recent Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* AI Agent Audit Log */}
        <div className="log-panel" style={{ padding: '20px 24px' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: secondaryTextColor, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield className="h-4 w-4" style={{ color: '#6366F1' }} />
            AI Agent Audit Log
          </h3>
          {healerHistory.length === 0 ? (
            <div className="flex items-center justify-center h-[260px]" style={{ color: mutedTextColor, fontSize: '12px' }}>
              No interventions yet
            </div>
          ) : (
            <div className="space-y-3" style={{ minHeight: '260px', maxHeight: '360px', overflowY: 'auto' }}>
              {healerHistory.slice(0, 20).map((entry: any) => (
                <div key={entry.id} style={{ paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid var(--color-border)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block px-2 py-0.5 rounded font-semibold"
                        style={{
                          fontSize: '9px',
                          letterSpacing: '0.04em',
                          background: entry.outcome === 'healed' ? '#DCFCE7' : entry.outcome === 'suppressed' ? '#FEF3C7' : '#DBEAFE',
                          color: entry.outcome === 'healed' ? '#166534' : entry.outcome === 'suppressed' ? '#92400E' : '#1E40AF',
                        }}
                      >
                        {entry.outcome === 'healed' ? 'HEALED' : entry.outcome === 'suppressed' ? 'SUPPRESSED' : 'PROCESSED'}
                      </span>
                      <span className="font-mono" style={{ fontSize: '11px', color: mutedTextColor }}>{entry.gateway_txn_id}</span>
                    </div>
                    <span style={{ fontSize: '10px', color: mutedTextColor, fontVariantNumeric: 'tabular-nums' }}>{entry.created_at}</span>
                  </div>
                  {entry.actions && entry.actions.length > 0 && (
                    <p style={{ fontSize: '11px', lineHeight: 1.5, margin: '4px 0 0', color: primaryTextColor }}>{entry.actions.join(' → ')}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="log-panel" style={{ padding: '20px 24px' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: secondaryTextColor, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingDown className="h-4 w-4" style={{ color: '#0EA5E9' }} />
            Recent Activity
          </h3>
          {healActivity.length === 0 ? (
            <div className="flex items-center justify-center h-[260px]" style={{ color: mutedTextColor, fontSize: '12px' }}>
              No recent activity
            </div>
          ) : (
            <div style={{ minHeight: '260px', maxHeight: '360px', overflowY: 'auto' }}>
              {healActivity.map((activity, i) => (
                <div key={activity.id} style={{
                  padding: '10px 0',
                  borderBottom: i < healActivity.length - 1 ? '1px solid var(--color-border)' : 'none',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '12px', fontWeight: 500, margin: 0, color: primaryTextColor, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {activity.description}
                    </p>
                    <p className="font-mono" style={{ fontSize: '10px', margin: '3px 0 0', color: mutedTextColor }}>{activity.transaction_id}</p>
                  </div>
                  <span style={{ fontSize: '10px', color: mutedTextColor, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {new Date(activity.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
