import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useAppData } from '../hooks/useAppData'
import { ROLES } from '../auth/roles'
import { api } from '../lib/api'
import { Kpi } from '../components/ui/Primitives'
import { fmtDate, fmtHa } from '../lib/format'

export default function Dashboard() {
  const { user } = useAuth()
  const { aois, aoisLoaded, rangers, rangersLoaded } = useAppData()
  const [openAlerts, setOpenAlerts] = useState([])
  const [precisionTotals, setPrecisionTotals] = useState({ confirmed: 0, total: 0 })
  const [recentRuns, setRecentRuns] = useState([])
  const [loading, setLoading] = useState(true)

  const myAoiIds = user.role === ROLES.RANGER
    ? (rangers.find(r => r.name === user.name)?.aoi_ids || [])
    : null
  const visibleAois = myAoiIds ? aois.filter(a => myAoiIds.includes(a.id)) : aois

  useEffect(() => {
    if (!aoisLoaded || !rangersLoaded) return
    let cancelled = false

    async function load() {
      setLoading(true)
      const ids = visibleAois.map(a => a.id)
      const [alerts, precisions, runsByAoi] = await Promise.all([
        api.listAlerts({ status: 'open' }).catch(() => []),
        Promise.all(ids.map(id => api.getAoiPrecision(id).catch(() => null))),
        Promise.all(ids.slice(0, 8).map(id => api.listRuns(id).catch(() => []))),
      ])
      if (cancelled) return
      setOpenAlerts(myAoiIds ? alerts.filter(a => ids.includes(a.aoi_id)) : alerts)
      setPrecisionTotals(precisions.reduce((acc, p) => p ? { confirmed: acc.confirmed + p.confirmed, total: acc.total + p.total } : acc, { confirmed: 0, total: 0 }))
      const merged = runsByAoi.flat().sort((a, b) => new Date(b.run_at) - new Date(a.run_at)).slice(0, 6)
      setRecentRuns(merged.map(r => ({ ...r, aoiName: visibleAois.find(a => a.id === r.aoi_id)?.name })))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aoisLoaded, rangersLoaded, visibleAois.length])

  const precisionPct = precisionTotals.total ? Math.round((precisionTotals.confirmed / precisionTotals.total) * 100) : null

  return (
    <div className="workspace-scroll">
      <div className="page-header">
        <h1 className="t-page-title">
          {user.role === ROLES.ADMIN ? 'Department overview' : `Welcome back, ${user.name}`}
        </h1>
        <p className="page-subtitle">
          {user.role === ROLES.ADMIN
            ? 'Forest cover anomaly detection across all monitored areas.'
            : 'Anomalies detected in your assigned areas, awaiting field verification.'}
        </p>
      </div>

      <div className="row gap-4" style={{ flexWrap: 'wrap', marginBottom: 'var(--sp-6)' }}>
        <div style={{ flex: '1 1 200px' }}>
          <Kpi label={myAoiIds ? 'My areas' : 'Monitored areas'} value={visibleAois.length} accentColor="var(--ink)" />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <Kpi label="Open alerts" value={loading ? '—' : openAlerts.length} accentColor="var(--signal)" />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <Kpi label="Field-verified precision" value={precisionPct == null ? '—' : `${precisionPct}%`}
               delta={precisionTotals.total ? `${precisionTotals.confirmed}/${precisionTotals.total} confirmed` : 'No outcomes recorded yet'} />
        </div>
        {user.role === ROLES.ADMIN && (
          <div style={{ flex: '1 1 200px' }}>
            <Kpi label="Active rangers" value={rangers.length} />
          </div>
        )}
      </div>

      <div className="row gap-5" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="card card-pad" style={{ flex: '2 1 380px' }}>
          <div className="row-between" style={{ marginBottom: 12 }}>
            <h3 className="t-section-title">Recent detection runs</h3>
            <Link to="/areas" className="btn btn-ghost btn-xs">View areas <ArrowRight size={13} /></Link>
          </div>
          {recentRuns.length === 0 ? (
            <p className="t-small t-muted">No detection runs yet — open an area and run detection.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Area</th><th>Date</th><th>Status</th><th>Disturbance</th></tr></thead>
                <tbody>
                  {recentRuns.map(r => (
                    <tr key={r.id}>
                      <td className="t-small" style={{ fontWeight: 500 }}>{r.aoiName || '—'}</td>
                      <td className="t-small t-mono">{fmtDate(r.run_at)}</td>
                      <td><span className={`badge badge-${r.status === 'done' ? 'low' : r.status === 'failed' ? 'critical' : 'medium'}`}>{r.status}</span></td>
                      <td className="t-small t-mono">{fmtHa(r.any_change_ha)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card card-pad" style={{ flex: '1 1 260px' }}>
          <h3 className="t-section-title" style={{ marginBottom: 12 }}>{myAoiIds ? 'My areas' : 'Quick access'}</h3>
          <div className="col gap-2">
            {visibleAois.slice(0, 6).map(a => (
              <Link key={a.id} to={`/areas/${a.id}/monitor`} className="row-between" style={{ padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                <span className="t-small" style={{ fontWeight: 500 }}>{a.name}</span>
                <ArrowRight size={13} color="var(--text-secondary)" />
              </Link>
            ))}
            {visibleAois.length === 0 && <p className="t-small t-muted">No areas assigned yet.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
