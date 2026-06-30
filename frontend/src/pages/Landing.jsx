import { Link } from 'react-router-dom'
import { Satellite, ShieldCheck, BellRing, ClipboardCheck } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

const FEATURES = [
  {
    icon: Satellite,
    title: 'Rolling-baseline anomaly detection',
    desc: 'Google Earth Engine + Dynamic World V1 (Sentinel-2, 10m) flags forest cover anomalies against a 12-month seasonal baseline.',
  },
  {
    icon: ShieldCheck,
    title: 'Built for field verification',
    desc: 'Every alert carries a confidence score, time series, and before/after imagery — nothing reaches an officer without a confirming second pass.',
  },
  {
    icon: BellRing,
    title: 'Deforestation, encroachment, agri. misuse',
    desc: 'Detects tree loss, built-up encroachment, agricultural conversion, and bare-land exposure inside designated forest areas.',
  },
  {
    icon: ClipboardCheck,
    title: 'Closed feedback loop',
    desc: 'Officer-confirmed and false-alarm outcomes feed back into per-area precision tracking and future threshold tuning.',
  },
]

export default function Landing() {
  const { user } = useAuth()
  const ctaTo = user ? '/dashboard' : '/login'
  const ctaLabel = user ? 'Go to dashboard' : 'Sign in'

  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="row gap-2" style={{ fontWeight: 700, fontSize: 15 }}>
          <span style={{ fontSize: 20 }}>🌲</span> AranyAI
        </span>
        <Link to={ctaTo} className="btn btn-primary">{ctaLabel}</Link>
      </header>

      <section className="landing-hero">
        <span className="t-eyebrow t-eyebrow-dot">Chhattisgarh Forest Department</span>
        <h1 className="t-display" style={{ fontSize: 40, lineHeight: 1.15, marginTop: 10, maxWidth: 680 }}>
          Forest change detection &amp; monitoring
        </h1>
        <p style={{ maxWidth: 560, color: 'var(--text-secondary)', marginTop: 14, fontSize: 15, lineHeight: 1.6 }}>
          AranyAI monitors designated forest areas with satellite-derived land cover anomaly
          detection, surfacing deforestation, encroachment, and agricultural misuse for field
          verification — built to support, not replace, the work forest officers already do.
        </p>
        <Link to={ctaTo} className="btn btn-primary" style={{ marginTop: 22, padding: '11px 26px' }}>
          {ctaLabel}
        </Link>
      </section>

      <section className="landing-features">
        {FEATURES.map(f => (
          <div key={f.title} className="card card-pad landing-feature">
            <div className="landing-feature-icon"><f.icon size={18} /></div>
            <h3 className="t-card-title" style={{ marginTop: 10, marginBottom: 6 }}>{f.title}</h3>
            <p className="t-small t-muted" style={{ lineHeight: 1.6 }}>{f.desc}</p>
          </div>
        ))}
      </section>

      <footer className="landing-footer">
        <span>© 2026 Chhattisgarh Forest Department · AranyAI Forest Monitoring Platform</span>
        <span>Powered by Google Earth Engine · Dynamic World V1 · Sentinel-2</span>
      </footer>
    </div>
  )
}