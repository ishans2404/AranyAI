import { useEffect, useMemo, useState } from 'react'
import { Eye } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useAppData } from '../hooks/useAppData'
import { ROLES } from '../auth/roles'
import { api } from '../lib/api'
import { CHANGE_TYPES } from '../lib/dw'
import { fmtDate, fmtHa } from '../lib/format'
import { SeverityBadge, ChangeDot, EmptyState, SkeletonLines, ConfidenceMeter } from '../components/ui/Primitives'
import AlertDrawer from '../components/alerts/AlertDrawer'

export default function Alerts() {
  const { user } = useAuth()
  const { aois, rangers } = useAppData()
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('open')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [areaFilter, setAreaFilter] = useState('all')
  const [activeAlert, setActiveAlert] = useState(null)

  const myAoiIds = user.role === ROLES.RANGER
    ? (rangers.find(r => r.name === user.name)?.aoi_ids || [])
    : null

  const load = () => {
    setLoading(true)
    api.listAlerts({ status: statusFilter === 'all' ? undefined : statusFilter })
      .then(data => setAlerts(myAoiIds ? data.filter(a => myAoiIds.includes(a.aoi_id)) : data))
      .catch(err => console.error('Alerts load failed:', err))
      .finally(() => setLoading(false))
  }

  useEffect(load, [statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const visibleAreas = myAoiIds ? aois.filter(a => myAoiIds.includes(a.id)) : aois
  const areaName = (id) => aois.find(a => a.id === id)?.name || '—'

  const filtered = useMemo(() => alerts
    .filter(a => severityFilter === 'all' || a.severity === severityFilter)
    .filter(a => areaFilter === 'all' || a.aoi_id === areaFilter)
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0)),
  [alerts, severityFilter, areaFilter])

  const handleUpdate = async (alertId, updates) => {
    await api.updateAlert(alertId, updates)
    load()
    setActiveAlert(prev => prev && prev.id === alertId ? { ...prev, ...updates } : prev)
  }

  return (
    <div className="workspace-scroll">
      <div className="page-header">
        <h1 className="t-page-title">Alerts</h1>
        <p className="page-subtitle">Detections sorted by confidence — review highest-confidence cases first.</p>
      </div>

      <div className="row gap-3" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="form-control" style={{ width: 150 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
          <option value="all">All statuses</option>
        </select>
        <select className="form-control" style={{ width: 150 }} value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="form-control" style={{ width: 200 }} value={areaFilter} onChange={e => setAreaFilter(e.target.value)}>
          <option value="all">All areas</option>
          {visibleAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="card card-pad" style={{ maxWidth: 420 }}><SkeletonLines count={5} /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Eye size={18} />} title="No alerts match these filters" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Type</th><th>Area</th><th>Severity</th><th>Confidence</th>
                <th>Size</th><th>First seen</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => {
                const ct = CHANGE_TYPES[a.change_type] || { label: a.change_type, color: 'var(--slate)' }
                return (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setActiveAlert(a)}>
                    <td className="t-small" style={{ fontWeight: 500 }}><ChangeDot color={ct.color} /> {ct.label}</td>
                    <td className="t-small">{areaName(a.aoi_id)}</td>
                    <td><SeverityBadge severity={a.severity} /></td>
                    <td style={{ width: 130 }}><ConfidenceMeter value={a.confidence} /></td>
                    <td className="t-small t-mono">{fmtHa(a.area_ha)}</td>
                    <td className="t-small t-mono">{a.first_detected_at ? fmtDate(a.first_detected_at, { year: undefined }) : '—'}</td>
                    <td><span className={`badge badge-${a.status}`}>{a.status}</span></td>
                    <td><button className="btn btn-xs btn-secondary" onClick={(e) => { e.stopPropagation(); setActiveAlert(a) }}>Review</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AlertDrawer
        alert={activeAlert}
        areaName={activeAlert ? areaName(activeAlert.aoi_id) : null}
        onClose={() => setActiveAlert(null)}
        onUpdate={handleUpdate}
        rangers={user.role === ROLES.ADMIN ? rangers : []}
        viewerName={user.name}
      />
    </div>
  )
}
