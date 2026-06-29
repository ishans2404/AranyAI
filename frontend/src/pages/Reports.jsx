import { useEffect, useState } from 'react'
import { Download, FileBarChart2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useAppData } from '../hooks/useAppData'
import { ROLES } from '../auth/roles'
import { api } from '../lib/api'
import { fmtDate, fmtHa, downloadCsv } from '../lib/format'
import { EmptyState, SkeletonLines } from '../components/ui/Primitives'
import ResponsiveTable from '../components/ui/ResponsiveTable'

export default function Reports() {
  const { user } = useAuth()
  const { aois, rangers } = useAppData()
  const [areaId, setAreaId] = useState('all')
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)

  const myAoiIds = user.role === ROLES.RANGER ? (rangers.find(r => r.name === user.name)?.aoi_ids || []) : null
  const visibleAreas = myAoiIds ? aois.filter(a => myAoiIds.includes(a.id)) : aois

  useEffect(() => {
    if (visibleAreas.length === 0) { setLoading(false); return }
    setLoading(true)
    const targets = areaId === 'all' ? visibleAreas.map(a => a.id) : [areaId]
    Promise.all(targets.map(id => api.listRuns(id).then(rs => rs.map(r => ({ ...r, aoiName: aois.find(a => a.id === id)?.name })))))
      .then(rows => setRuns(rows.flat().sort((a, b) => new Date(b.run_at) - new Date(a.run_at))))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId, visibleAreas.length])

  const exportCsv = () => downloadCsv(`aranyai_runs_${Date.now()}.csv`, runs.map(r => ({
    area: r.aoiName, run_at: r.run_at, status: r.status, detection_mode: r.detection_mode,
    any_change_ha: r.any_change_ha, deforestation_ha: r.deforestation_ha,
  })))

  const columns = [
    { key: 'area', label: 'Area', primary: true, render: r => r.aoiName },
    { key: 'date', label: 'Date', mono: true, render: r => fmtDate(r.run_at) },
    { key: 'mode', label: 'Mode', render: r => r.detection_mode },
    { key: 'status', label: 'Status', render: r => <span className={`badge badge-${r.status === 'done' ? 'low' : r.status === 'failed' ? 'critical' : 'medium'}`}>{r.status}</span> },
    { key: 'disturbance', label: 'Disturbance', mono: true, render: r => fmtHa(r.any_change_ha) },
    { key: 'deforestation', label: 'Deforestation', mono: true, render: r => fmtHa(r.deforestation_ha) },
  ]

  return (
    <div className="workspace-scroll">
      <div className="page-header">
        <h1 className="t-page-title">Reports</h1>
        <p className="page-subtitle">
          Tabular run history with CSV export. Formatted PDF reports (WeasyPrint + Jinja2, per
          ARCHITECTURE.md §12) are a planned backend addition, not built yet — this page won't pretend otherwise.
        </p>
      </div>

      <div className="row-between stack-on-mobile gap-3" style={{ marginBottom: 16, alignItems: 'flex-start' }}>
        <select className="form-control reports-area-select" value={areaId} onChange={e => setAreaId(e.target.value)}>
          <option value="all">All areas</option>
          {visibleAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button className="btn btn-secondary btn-full" disabled={runs.length === 0} onClick={exportCsv}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {loading ? (
        <div className="card card-pad" style={{ maxWidth: 420 }}><SkeletonLines count={5} /></div>
      ) : (
        <ResponsiveTable
          columns={columns}
          rows={runs}
          rowKey="id"
          emptyState={<EmptyState icon={<FileBarChart2 size={18} />} title="No detection runs yet" />}
        />
      )}
    </div>
  )
}
