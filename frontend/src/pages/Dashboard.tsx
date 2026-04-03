import { useEffect, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import { BASE_URL } from '../lib/api';
import { TrendingDown, Heart, Webhook, AlertTriangle } from 'lucide-react';
import { useToast } from '../hooks/use-toast';

interface Metrics {
  driftRate: number;
  healSuccessRate: number;
  totalWebhooks: number;
  openAnomalies: number;
}

interface DriftDataPoint {
  timestamp: string;
  driftRate: number;
}

interface WebhookVolumeData {
  gateway: string;
  count: number;
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
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    try {
      const [metricsRes, anomaliesRes, transactionsRes] = await Promise.all([
        axios.get<Metrics>(`${BASE_URL}/metrics`),
        axios.get(`${BASE_URL}/anomalies`),
        axios.get(`${BASE_URL}/transactions?limit=1000`),
      ]);

      const data = metricsRes.data;
      setMetrics(data);

      // Build drift history (simulated with current value)
      const now = new Date();
      const timestamp = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      setDriftHistory((prev) => {
        const updated = [...prev, { timestamp, driftRate: data.driftRate }];
        return updated.slice(-12); // Keep last 12 data points
      });

      // Real gateway breakdown from transactions data
      const transactions = transactionsRes.data.data || [];
      const gatewayMap: Record<string, number> = {};
      transactions.forEach((tx: any) => {
        const gateway = tx.gateway || 'Unknown';
        gatewayMap[gateway] = (gatewayMap[gateway] || 0) + 1;
      });

      const realVolume = Object.entries(gatewayMap)
        .map(([gateway, count]) => ({
          gateway: gateway.charAt(0).toUpperCase() + gateway.slice(1),
          count,
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
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Drift Rate Trend */}
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Drift Rate Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={driftHistory.length === 0 ? [{ timestamp: 'Now', driftRate: metrics.driftRate }] : driftHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="timestamp" tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" label={{ value: '(%)', position: 'insideLeft', offset: -5 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
                labelStyle={{ color: '#111827' }}
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
        </div>

        {/* Webhook Volume by Gateway */}
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Webhook Volume by Gateway</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={webhookVolume}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="gateway" tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
                labelStyle={{ color: '#111827' }}
              />
              <Bar dataKey="count" fill="#2563eb" radius={[8, 8, 0, 0]} name="Events" />
            </BarChart>
          </ResponsiveContainer>
        </div>
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
  );
}

