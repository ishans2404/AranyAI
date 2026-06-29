import { useEffect, useMemo, useState } from 'react'
import { Eye } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useAppData } from '../hooks/useAppData'
import { ROLES } from '../auth/roles'
import { api } from '../lib/api'
import { CHANGE_TYPES } from '../lib/dw'
import { fmtDate, fmtHa } from '../lib/format'
import { SeverityBadge, ChangeDot, EmptyState, SkeletonLines, ConfidenceMeter } from '../components/ui/Primitives'
import ResponsiveTable from '../components/ui/ResponsiveTable'
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

  const columns = [
    {
      key: 'type', label: 'Type', primary: true,
      render: a => {
        const ct = CHANGE_TYPES[a.change_type] || { label: a.change_type, color: 'var(--slate)' }
        return <span className="row gap-2" style={{ fontWeight: 500 }}><ChangeDot color={ct.color} /> {ct.label}</span>
      },
    },
    { key: 'area', label: 'Area', render: a => areaName(a.aoi_id) },
    { key: 'severity', label: 'Severity', render: a => <SeverityBadge severity={a.severity} /> },
    { key: 'confidence', label: 'Confidence', render: a => <ConfidenceMeter value={a.confidence} /> },
    { key: 'size', label: 'Size', mono: true, render: a => fmtHa(a.area_ha) },
    { key: 'first_seen', label: 'First seen', mono: true, render: a => a.first_detected_at ? fmtDate(a.first_detected_at, { year: undefined }) : '—' },
    { key: 'status', label: 'Status', render: a => <span className={`badge badge-${a.status}`}>{a.status}</span> },
  ]

  return (
    <div className="workspace-scroll">
      <div className="page-header">
        <h1 className="t-page-title">Alerts</h1>
        <p className="page-subtitle">Detections sorted by confidence — review highest-confidence cases first.</p>
      </div>

      <div className="filter-row">
        <select className="form-control filter-control" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
          <option value="all">All statuses</option>
        </select>
        <select className="form-control filter-control" value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="form-control filter-control filter-control-wide" value={areaFilter} onChange={e => setAreaFilter(e.target.value)}>
          <option value="all">All areas</option>
          {visibleAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="card card-pad" style={{ maxWidth: 420 }}><SkeletonLines count={5} /></div>
      ) : (
        <ResponsiveTable
          columns={columns}
          rows={filtered}
          rowKey="id"
          onRowClick={setActiveAlert}
          emptyState={<EmptyState icon={<Eye size={18} />} title="No alerts match these filters" />}
        />
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
