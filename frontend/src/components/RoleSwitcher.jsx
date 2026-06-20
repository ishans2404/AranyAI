/**
 * Lightweight Admin/Ranger view switcher for the POC.
 *
 * This is NOT authentication — anyone can pick any view. It exists to
 * demonstrate the admin/ranger dashboard split the department asked for:
 *   Admin  — sees every AOI, every alert, full run history.
 *   Ranger — sees only AOIs assigned to them (via /api/rangers).
 *
 * Real auth (login, sessions, per-user permissions enforced server-side)
 * is the follow-up hardening phase before any non-demo deployment.
 */
const STYLE = {
  background: 'rgba(255,255,255,.12)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,.25)',
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 500,
  padding: '5px 10px',
  fontFamily: "'Inter','Noto Sans',system-ui,sans-serif",
  cursor: 'pointer',
}

export default function RoleSwitcher({ rangers, viewMode, onChange }) {
  return (
    <select
      style={STYLE}
      value={viewMode}
      onChange={e => onChange(e.target.value)}
      title="POC role view — not authentication"
    >
      <option value="admin">View: Admin (all AOIs)</option>
      {rangers.map(r => (
        <option key={r.name} value={r.name}>
          View: Ranger — {r.name} ({r.aoi_ids.length})
        </option>
      ))}
    </select>
  )
}