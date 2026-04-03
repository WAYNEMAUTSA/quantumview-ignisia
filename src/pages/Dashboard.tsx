import { useEffect, useState, useCallback } from "react";
import { fetchDashboardMetrics, fetchWebhookVolume, fetchRecentHeals } from "@/services/mockApi";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingDown, Heart, Webhook, AlertTriangle, Activity } from "lucide-react";

type Metrics = Awaited<ReturnType<typeof fetchDashboardMetrics>>;
type Volume = Awaited<ReturnType<typeof fetchWebhookVolume>>;
type Heal = Awaited<ReturnType<typeof fetchRecentHeals>>[number];

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [volume, setVolume] = useState<Volume>([]);
  const [heals, setHeals] = useState<Heal[]>([]);

  const load = useCallback(async () => {
    const [m, v, h] = await Promise.all([fetchDashboardMetrics(), fetchWebhookVolume(), fetchRecentHeals()]);
    setMetrics(m);
    setVolume(v);
    setHeals(h);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5_000);
    return () => clearInterval(id);
  }, [load]);

  if (!metrics) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading…</div>;

  const driftDanger = metrics.driftRate > 5;
  const queueWarn = metrics.manualQueueSize > 0;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-foreground">Live Health Overview</h2>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Drift Rate"
          value={`${metrics.driftRate}%`}
          variant={driftDanger ? "destructive" : "success"}
          icon={TrendingDown}
        />
        <MetricCard label="Heal Success Rate" value={`${metrics.healSuccessRate}%`} variant="success" icon={Heart} />
        <MetricCard label="Webhooks (60 min)" value={metrics.totalWebhooksLastHour.toLocaleString()} variant="info" icon={Webhook} />
        <MetricCard
          label="Manual Queue"
          value={String(metrics.manualQueueSize)}
          variant={queueWarn ? "warning" : "default"}
          icon={AlertTriangle}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Drift Rate – Last 60 min</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={metrics.driftRateHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="timestamp" tick={false} />
              <YAxis domain={[0, "auto"]} tickFormatter={(v: number) => `${v}%`} fontSize={12} />
              <Tooltip
                labelFormatter={(l: string) => new Date(l).toLocaleTimeString()}
                formatter={(v: number) => [`${v}%`, "Drift"]}
              />
              <Line type="monotone" dataKey="value" stroke={driftDanger ? "hsl(var(--destructive))" : "hsl(var(--success))"} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Webhook Volume by Gateway</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={volume}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="gateway" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Heal feed */}
      <div className="bg-card border rounded-lg shadow-sm p-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
          <Activity className="h-4 w-4" /> Recent Heal Activity
        </h3>
        {heals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent heal events.</p>
        ) : (
          <ul className="divide-y">
            {heals.map((h) => (
              <li key={h.id} className="py-2 flex items-start justify-between text-sm">
                <span className="text-foreground">{h.description}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                  {new Date(h.timestamp).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type Variant = "destructive" | "success" | "warning" | "info" | "default";

function MetricCard({ label, value, variant, icon: Icon }: { label: string; value: string; variant: Variant; icon: React.ElementType }) {
  const ring: Record<Variant, string> = {
    destructive: "border-destructive/40 bg-destructive/5",
    success: "border-success/40 bg-success/5",
    warning: "border-warning/40 bg-warning/5",
    info: "border-primary/40 bg-primary/5",
    default: "border-border",
  };
  const text: Record<Variant, string> = {
    destructive: "text-destructive",
    success: "text-success",
    warning: "text-warning",
    info: "text-primary",
    default: "text-foreground",
  };

  return (
    <div className={`bg-card border rounded-lg shadow-sm p-4 ${ring[variant]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <Icon className={`h-4 w-4 ${text[variant]}`} />
      </div>
      <p className={`text-2xl font-bold tabular-nums ${text[variant]}`}>{value}</p>
    </div>
  );
}
