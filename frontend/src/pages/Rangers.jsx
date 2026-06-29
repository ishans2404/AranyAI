import { useState } from 'react'
import { UserPlus, Users } from 'lucide-react'
import { useAppData } from '../hooks/useAppData'
import { api } from '../lib/api'
import { EmptyState } from '../components/ui/Primitives'
import ResponsiveTable from '../components/ui/ResponsiveTable'

export default function Rangers() {
  const { rangers, refreshRangers, aois } = useAppData()
  const [name, setName] = useState('')
  const [aoiId, setAoiId] = useState('')
  const [saving, setSaving] = useState(false)

  const assign = async (e) => {
    e.preventDefault()
    if (!name.trim() || !aoiId) return
    setSaving(true)
    try {
      await api.assignRanger({ ranger_name: name.trim(), aoi_id: aoiId })
      setName(''); setAoiId('')
      refreshRangers()
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    { key: 'name', label: 'Ranger', primary: true, render: r => r.name },
    {
      key: 'areas', label: 'Assigned areas',
      render: r => (
        <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
          {r.aoi_ids.map(id => (
            <span key={id} className="badge" style={{ background: 'var(--soft-bone)', color: 'var(--text-primary)' }}>
              {aois.find(a => a.id === id)?.name || id.slice(0, 8)}
            </span>
          ))}
        </div>
      ),
    },
  ]

  return (
    <div className="workspace-scroll">
      <div className="page-header">
        <h1 className="t-page-title">Rangers</h1>
        <p className="page-subtitle">
          Assign rangers to monitoring areas. This scopes what a ranger sees in the app — it is not
          a login system yet (see Settings for details).
        </p>
      </div>

      <form onSubmit={assign} className="card card-pad row gap-3 stack-on-mobile" style={{ marginBottom: 20, maxWidth: 560, alignItems: 'flex-end' }}>
        <div style={{ flex: 1, width: '100%' }}>
          <label className="form-label">Ranger name</label>
          <input className="form-control" placeholder="e.g. R. Sharma" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div style={{ flex: 1, width: '100%' }}>
          <label className="form-label">Area</label>
          <select className="form-control" value={aoiId} onChange={e => setAoiId(e.target.value)}>
            <option value="">Select area…</option>
            {aois.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <button className="btn btn-primary btn-full" disabled={saving}><UserPlus size={14} /> Assign</button>
      </form>

      <ResponsiveTable
        columns={columns}
        rows={rangers}
        rowKey="name"
        emptyState={<EmptyState icon={<Users size={18} />} title="No rangers assigned yet" message="Assign your first ranger to an area above." />}
      />

      {rangers.length > 0 && (
        <p className="t-small t-faint" style={{ marginTop: 10 }}>
          Removing an assignment requires a backend endpoint that doesn't exist yet
          (DELETE /api/rangers/assign) — flagged as a backend follow-up, not faked here.
        </p>
      )}
    </div>
  )
}
