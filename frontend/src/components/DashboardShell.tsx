import { ReactNode } from 'react';
import { User } from 'lucide-react';

interface DashboardShellProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: { key: string; label: string; icon: ReactNode }[];
  liveTime?: Date;
  headerBanner?: ReactNode;
}

export default function DashboardShell({
  children,
  activeTab,
  onTabChange,
  tabs,
  liveTime,
  headerBanner,
}: DashboardShellProps) {
  return (
    <div className="min-h-screen" style={{ fontFamily: 'var(--font-body)', background: 'var(--color-bg-secondary)' }}>
      {/* ── Fixed Sidebar ── */}
      <aside className="shell-sidebar">
        <div className="shell-sidebar__logo">Q</div>
        <nav className="shell-sidebar__nav">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`shell-sidebar__nav-item ${
                activeTab === tab.key ? 'shell-sidebar__nav-item--active' : ''
              }`}
              title={tab.label}
            >
              {tab.icon}
            </button>
          ))}
        </nav>
        <div className="shell-sidebar__footer">
          <div className="shell-sidebar__nav-item">
            <User style={{ width: 18, height: 18 }} />
          </div>
        </div>
      </aside>

      {/* ── Content Wrapper ── */}
      <div>
        {/* ── Top Navigation ── */}
        <nav className="shell-topnav">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`shell-topnav__item ${
                activeTab === tab.key ? 'shell-topnav__item--active' : ''
              }`}
            >
              {tab.label}
            </button>
          ))}
          {liveTime && (
            <div className="shell-topnav__clock">
              {liveTime.toLocaleTimeString()}
            </div>
          )}
        </nav>

        {/* ── Header Banner ── */}
        {headerBanner}

        {/* ── Main Content ── */}
        <main className="shell-main">
          {children}
        </main>
      </div>
    </div>
  );
}
