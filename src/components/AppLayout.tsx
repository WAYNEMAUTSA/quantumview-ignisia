import { Link, useLocation } from "react-router-dom";
import { Activity, Table, AlertTriangle } from "lucide-react";

const NAV = [
  { to: "/", label: "Health Overview", icon: Activity },
  { to: "/transactions", label: "Transactions", icon: Table },
  { to: "/manual-review", label: "Manual Review", icon: AlertTriangle },
] as const;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-card px-6 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            <span className="text-primary">QUANTUM</span>VIEW
          </h1>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  pathname === to
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <LiveTimestamp />
      </header>
      <main className="flex-1 p-4 md:p-6 max-w-[1400px] w-full mx-auto">{children}</main>
    </div>
  );
}

function LiveTimestamp() {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 5_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {now.toLocaleTimeString()} · {now.toLocaleDateString()}
    </span>
  );
}

import React from "react";
