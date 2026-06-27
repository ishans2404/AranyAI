export function PrecisionPill({ precision }) {
  if (!precision || !precision.total) {
    return <span className="badge" style={{ background: 'var(--soft-bone)', color: 'var(--text-secondary)' }}>No verified outcomes yet</span>
  }
  const pct = Math.round((precision.precision || 0) * 100)
  const variant = pct >= 70 ? 'low' : pct >= 40 ? 'medium' : 'critical'
  return (
    <span className={`badge badge-${variant}`}>
      {pct}% confirmed · {precision.confirmed}/{precision.total}
    </span>
  )
}
