export default function Sparkline({ data }) {
  if (!data || data.length < 2) return null
  const w = 100, h = 34, pad = 3
  const vals = data.map(d => d.trees_prob)
  const min = Math.min(...vals), max = Math.max(...vals)
  const range = (max - min) || 1
  const points = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2)
    const y = h - pad - ((d.trees_prob - min) / range) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={40} preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke="var(--ink)" strokeWidth="1.4" />
      </svg>
      <div className="row-between">
        <span className="t-small t-faint t-mono">{data[0].date}</span>
        <span className="t-small t-faint t-mono">{data[data.length - 1].date}</span>
      </div>
    </div>
  )
}
