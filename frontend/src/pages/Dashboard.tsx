import { useEffect, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import axios from 'axios';
import { BASE_URL } from '../lib/api';
import { TrendingDown, Heart, Webhook, AlertTriangle, Shield, ShieldCheck } from 'lucide-react';
import { useToast } from '../hooks/use-toast';

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
  const [webhookVolume, setWebhookVolume] = useState<WebhookVolume[]>([]);
  const [healActivity, setHealActivity] = useState<HealActivity[]>([]);
  const [healerHistory, setHealerHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    try {
      const [metricsRes, anomaliesRes, transactionsRes, driftHistoryRes, healerHistoryRes] = await Promise.all([
        axios.get<Metrics>(`${BASE_URL}/metrics`),
        axios.get(`${BASE_URL}/anomalies`),
        axios.get(`${BASE_URL}/transactions?limit=1000`),
        axios.get(`${BASE_URL}/metrics/drift-history`),
        axios.get(`${BASE_URL}/metrics/healer-history`),
      ]);

      const data = metricsRes.data;
      setMetrics(data);

      // Real drift history from drift_snapshots
      const driftData = driftHistoryRes.data.data || [];
      setDriftHistory(driftData);

      // Healer agent history
      setHealerHistory(healerHistoryRes.data.data || []);

      // Real transaction states breakdown from transactions data
      const transactions = transactionsRes.data.data || [];
      const stateMap: Record<string, number> = {};
      transactions.forEach((tx: any) => {
        const state = tx.current_state || 'unknown';
        stateMap[state] = (stateMap[state] || 0) + 1;
      });

      const stateColors: Record<string, string> = {
        initiated: '#3b82f6',
        created: '#6366f1',
        authorized: '#8b5cf6',
        captured: '#10b981',
        settled: '#22c55e',
        failed: '#ef4444',
        refunded: '#6366f1',
        unknown: '#f59e0b',
      };

      const realVolume = Object.entries(stateMap)
        .map(([state, count]) => ({
          state: state.charAt(0).toUpperCase() + state.slice(1),
          count,
          fill: stateColors[state] || '#94a3b8',
        }))
        .sort((a, b) => b.count - a.count);

      setWebhookVolume(realVolume.length > 0 ? realVolume : []);

      // Heal activity from anomalies
      const anomalies = anomaliesRes.data.data || [];
      setHealActivity(
        anomalies.slice(0, 5).map((a: any) => ({
          id: a.id,
          description: a.description || `Resolved anomaly in tx ${a.transaction_id?.substring(0, 8)}`,
          created_at: a.created_at,
          transaction_id: a.transaction_id,
        }))
      );
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  // Generate placeholder chart data
  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !metrics) {
    return <div className="text-center py-12 text-gray-500">Loading dashboard...</div>;
  }

  const isDriftCritical = metrics.driftRate > 5;
  const hasManualQueue = metrics.openAnomalies > 0;

  return (
    <div className="space-y-8">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Drift Rate */}
        <div className={`rounded-lg border shadow-sm p-6 ${isDriftCritical ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Drift Rate</span>
            <TrendingDown className={`h-5 w-5 ${isDriftCritical ? 'text-red-600' : 'text-green-600'}`} />
          </div>
          <p className={`text-3xl font-bold ${isDriftCritical ? 'text-red-600' : 'text-green-600'}`}>
            {metrics.driftRate.toFixed(2)}%
          </p>
          <p className="text-xs text-gray-500 mt-2">
            {isDriftCritical ? 'Critical - Review needed' : 'Healthy'}
          </p>
        </div>

        {/* Heal Success Rate */}
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Heal Success Rate</span>
            <Heart className="h-5 w-5 text-green-600" />
          </div>
          <p className="text-3xl font-bold text-green-600">
            {metrics.healSuccessRate.toFixed(2)}%
          </p>
          <p className="text-xs text-gray-500 mt-2">
            {metrics.healSuccessRate >= 90 ? 'Excellent' : 'Monitor'}
          </p>
        </div>

        {/* Webhooks */}
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Webhooks (60 min)</span>
            <Webhook className="h-5 w-5 text-blue-600" />
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {(metrics.totalWebhooks || 0).toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-2">Events received</p>
        </div>

        {/* Manual Queue */}
        <div
          className={`rounded-lg border shadow-sm p-6 ${hasManualQueue ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Open Anomalies</span>
            <AlertTriangle className={`h-5 w-5 ${hasManualQueue ? 'text-amber-600' : 'text-gray-400'}`} />
          </div>
          <p className={`text-3xl font-bold ${hasManualQueue ? 'text-amber-600' : 'text-gray-600'}`}>
            {metrics.openAnomalies}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            {hasManualQueue ? 'Needs review' : 'All resolved'}
          </p>
        </div>

        {/* Recovery Rate */}
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">AI Recovery Rate</span>
            <ShieldCheck className="h-5 w-5 text-purple-600" />
          </div>
          <p className="text-3xl font-bold text-purple-600">
            {metrics.healStats?.recoveryRate.toFixed(1) ?? 0}%
          </p>
          <p className="text-xs text-gray-500 mt-2">
            {metrics.healStats?.totalAgentInterventions ?? 0} interventions
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Drift Rate Trend */}
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Drift Rate Trend (last 20 min)</h3>
          {driftHistory.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              Collecting drift data... snapshots recorded every 10 seconds.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={driftHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="timestamp" tick={{ fontSize: 10 }} stroke="#9ca3af" angle={-30} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" label={{ value: 'Drift %', position: 'insideLeft', offset: -5 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
                  labelStyle={{ color: '#111827' }}
                  formatter={(value: number) => [`${value.toFixed(1)}%`, 'Drift Rate']}
                />
                <Line
                  type="monotone"
                  dataKey="driftRate"
                  stroke={isDriftCritical ? '#ef4444' : '#10b981'}
                  strokeWidth={2}
                  dot={false}
                  name="Drift %"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Webhook Volume by Gateway */}
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Transaction States</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={webhookVolume}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="state" tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
                labelStyle={{ color: '#111827' }}
              />
              <Bar dataKey="count" radius={[8, 8, 0, 0]} name="Transactions">
                {webhookVolume.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Healer Audit Log + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Agent Audit Log */}
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-purple-600" />
            AI Agent Audit Log
          </h3>
          {healerHistory.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">No agent interventions yet.</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {healerHistory.slice(0, 15).map((entry: any) => (
                <div key={entry.id} className="text-xs border-b border-gray-100 pb-3 last:border-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full font-medium ${
                        entry.outcome === 'healed' ? 'bg-green-100 text-green-700' :
                        entry.outcome === 'suppressed' ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {entry.outcome === 'healed' ? 'HEALED_BY_AI' :
                         entry.outcome === 'suppressed' ? 'SUPPRESSED' : 'PROCESSED'}
                      </span>
                      <span className="font-mono text-gray-600">{entry.gateway_txn_id}</span>
                    </div>
                    <span className="text-gray-500">{entry.created_at}</span>
                  </div>
                  {entry.actions && entry.actions.length > 0 && (
                    <p className="text-gray-700 mt-1">{entry.actions.join(' → ')}</p>
                  )}
                  {entry.bridge_events > 0 && (
                    <p className="text-gray-500 mt-1">{entry.bridge_events} bridge event(s) synthesized</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Recent Activity</h3>
          {healActivity.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">No recent activity. Ledger is healthy.</p>
          ) : (
            <div className="divide-y">
              {healActivity.map((activity) => (
                <div key={activity.id} className="py-3 flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{activity.description}</p>
                    <p className="text-xs text-gray-500 mt-1">{activity.transaction_id}</p>
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap ml-4">
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

