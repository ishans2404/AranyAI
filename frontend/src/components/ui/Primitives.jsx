export function SeverityBadge({ severity }) {
  if (!severity) return null
  return <span className={`badge badge-${severity}`}>{severity}</span>
}

export function StatusBadge({ status }) {
  if (!status) return null
  const label = status.replace(/_/g, ' ')
  return <span className={`badge badge-${status}`}>{label}</span>
}

export function ChangeDot({ color }) {
  return <span className="dot" style={{ background: color }} />
}

export function Kpi({ label, value, unit, delta, accentColor }) {
  return (
    <div className="kpi">
      <div className="kpi-accent" style={accentColor ? { background: accentColor } : undefined} />
      <div className="kpi-value">{value}{unit && <span style={{ fontSize: 13, fontWeight: 450, marginLeft: 4 }}>{unit}</span>}</div>
      <div className="kpi-label">{label}</div>
      {delta && <div className="kpi-delta">{delta}</div>}
    </div>
  )
}

export function ConfidenceMeter({ value }) {
  const v = Math.max(0, Math.min(100, value || 0))
  return (
    <div className="confidence">
      <div className="confidence-track"><div className="confidence-fill" style={{ width: `${v}%` }} /></div>
      <span className="confidence-value t-mono">{v.toFixed(0)}</span>
    </div>
  )
}

export function PersistenceDots({ count = 1, required = 2 }) {
  const n = Math.max(count, required)
  return (
    <span className="persistence-dots">
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className={`dot ${i < count ? 'filled' : ''}`} />
      ))}
    </span>
  )
}

export function EmptyState({ icon, title, message }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <h4>{title}</h4>
      {message && <p>{message}</p>}
    </div>
  )
}

export function SkeletonLines({ count = 3 }) {
  return (
    <div className="col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 11, width: `${90 - i * 12}%` }} />
      ))}
    </div>
  )
}
