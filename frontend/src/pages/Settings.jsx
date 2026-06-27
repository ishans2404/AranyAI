import { useAuth } from '../auth/AuthContext'
import { roleLabel } from '../auth/roles'
import { initials } from '../lib/format'

export default function Settings() {
  const { user, logout } = useAuth()

  return (
    <div className="workspace-scroll">
      <div className="page-header">
        <h1 className="t-page-title">Settings</h1>
        <p className="page-subtitle">Account and system information.</p>
      </div>

      <div className="card card-pad" style={{ maxWidth: 480, marginBottom: 16 }}>
        <h3 className="t-card-title" style={{ marginBottom: 14 }}>Signed in as</h3>
        <div className="row gap-3" style={{ marginBottom: 14 }}>
          <div className="avatar" style={{ width: 42, height: 42, fontSize: 15 }}>{initials(user?.name)}</div>
          <div>
            <div style={{ fontWeight: 500 }}>{user?.name}</div>
            <div className="t-small t-muted">{roleLabel(user?.role)}</div>
          </div>
        </div>
        <p className="t-small t-muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>
          Identity here is a role/name selection, not a password-protected account — there is no
          backend authentication layer yet. Anyone can sign in as any ranger or as the administrator.
          Treat this as a workflow demonstration until real auth (login, sessions, server-enforced
          permissions) ships.
        </p>
        <button className="btn btn-secondary" onClick={logout}>Sign out</button>
      </div>

      <div className="card card-pad" style={{ maxWidth: 480 }}>
        <h3 className="t-card-title" style={{ marginBottom: 10 }}>System</h3>
        <Row label="Detection engine">Google Earth Engine · Dynamic World V1 (10m)</Row>
        <Row label="Methodology">Rolling-baseline anomaly detection</Row>
        <Row label="App version">v0.3.0</Row>
      </div>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div className="row-between" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="t-small t-muted">{label}</span>
      <span className="t-small">{children}</span>
    </div>
  )
}
