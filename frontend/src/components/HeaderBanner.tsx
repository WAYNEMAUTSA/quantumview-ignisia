interface StatBlock {
  label: string;
  value: string | number;
  delta?: string;
  deltaDirection?: 'up' | 'down';
}

interface HeaderBannerProps {
  brand: string;
  stats: StatBlock[];
}

export default function HeaderBanner({ brand, stats }: HeaderBannerProps) {
  if (!stats.length) {
    return (
      <header className="shell-header">
        <div className="shell-header__brand">{brand}</div>
        <div className="shell-header__stats" style={{ justifyContent: 'center' }}>
          <span style={{ color: '#8A8A9A', fontSize: '12px' }}>Loading metrics…</span>
        </div>
      </header>
    );
  }

  return (
    <header className="shell-header">
      <div className="shell-header__brand">{brand}</div>
      <div className="shell-header__stats">
        {stats.map((stat) => (
          <div key={stat.label} className="shell-stat">
            <span className="shell-stat__label">{stat.label}</span>
            <span className="shell-stat__value">{stat.value}</span>
            {stat.delta && (
              <span
                className={`shell-stat__delta ${
                  stat.deltaDirection === 'up'
                    ? 'shell-stat__delta--up'
                    : 'shell-stat__delta--down'
                }`}
              >
                {stat.delta}
              </span>
            )}
          </div>
        ))}
      </div>
    </header>
  );
}
