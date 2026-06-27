import { Link } from 'react-router-dom'
import { ShieldAlert, Compass } from 'lucide-react'

export function Unauthorized() {
  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="auth-mark" style={{ color: 'var(--signal)' }}><ShieldAlert size={20} /></div>
        <h1 className="t-section-title" style={{ marginBottom: 8 }}>You don't have access to this</h1>
        <p className="t-muted t-small" style={{ marginBottom: 20 }}>
          Your role doesn't include this page, or this area isn't assigned to you.
        </p>
        <Link to="/dashboard" className="btn btn-primary">Back to dashboard</Link>
      </div>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="auth-mark"><Compass size={20} /></div>
        <h1 className="t-section-title" style={{ marginBottom: 8 }}>Page not found</h1>
        <Link to="/dashboard" className="btn btn-primary">Back to dashboard</Link>
      </div>
    </div>
  )
}
