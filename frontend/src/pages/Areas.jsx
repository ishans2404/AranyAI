import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, MapPinned, ArrowRight } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useAppData } from '../hooks/useAppData'
import { ROLES, PERMISSIONS } from '../auth/roles'
import { api } from '../lib/api'
import { EmptyState } from '../components/ui/Primitives'
import ResponsiveTable from '../components/ui/ResponsiveTable'

const EXAMPLE_GEOJSON = `{
  "type": "Polygon",
  "coordinates": [[
    [82.3, 20.9], [82.7, 20.9], [82.7, 21.2], [82.3, 21.2], [82.3, 20.9]
  ]]
}`

function CreateAreaForm({ onCreated }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', division: '', range_name: '', geojson: '' })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    let geojson
    try { geojson = JSON.parse(form.geojson) } catch { setError('GeoJSON is not valid JSON.'); return }
    setSaving(true)
    try {
      await api.createAoi({ name: form.name, division: form.division || null, range_name: form.range_name || null, geojson })
      setForm({ name: '', division: '', range_name: '', geojson: '' })
      setOpen(false)
      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={14} /> Register area</button>

  return (
    <form onSubmit={submit} className="card card-pad" style={{ marginBottom: 20, maxWidth: 480 }}>
      <h3 className="t-section-title" style={{ marginBottom: 14 }}>Register a new monitoring area</h3>
      <div className="col gap-3">
        <div>
          <label className="form-label">Area name</label>
          <input className="form-control" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="row gap-3 stack-on-mobile">
          <div style={{ flex: 1 }}>
            <label className="form-label">Division</label>
            <input className="form-control" value={form.division} onChange={e => setForm(f => ({ ...f, division: e.target.value }))} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="form-label">Range</label>
            <input className="form-control" value={form.range_name} onChange={e => setForm(f => ({ ...f, range_name: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="form-label">Boundary (GeoJSON Polygon, EPSG:4326)</label>
          <textarea className="form-control" required placeholder={EXAMPLE_GEOJSON} value={form.geojson} onChange={e => setForm(f => ({ ...f, geojson: e.target.value }))} />
          <p className="form-hint">Paste a Polygon geometry. Drawing the boundary directly on the map is a planned enhancement (Mapbox GL Draw) — not built yet.</p>
        </div>
        {error && <p className="t-small" style={{ color: 'var(--signal-strong)' }}>{error}</p>}
        <div className="row gap-2">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Registering…' : 'Register area'}</button>
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </div>
    </form>
  )
}

export default function Areas() {
  const { user, can } = useAuth()
  const { aois, refreshAois, rangers } = useAppData()
  const isAdmin = user.role === ROLES.ADMIN

  const myAoiIds = !isAdmin ? (rangers.find(r => r.name === user.name)?.aoi_ids || []) : null
  const visible = myAoiIds ? aois.filter(a => myAoiIds.includes(a.id)) : aois

  const rangerNamesFor = (aoiId) => rangers.filter(r => r.aoi_ids.includes(aoiId)).map(r => r.name)

  const columns = [
    { key: 'name', label: 'Area', primary: true, render: a => a.name },
    { key: 'division', label: 'Division', render: a => a.division || '—' },
    { key: 'range', label: 'Range', render: a => a.range_name || '—' },
    ...(isAdmin ? [{ key: 'rangers', label: 'Assigned rangers', render: a => rangerNamesFor(a.id).join(', ') || <span className="t-faint">Unassigned</span> }] : []),
    {
      key: 'open', label: '',
      render: a => <Link to={`/areas/${a.id}/monitor`} className="btn btn-xs btn-secondary" onClick={e => e.stopPropagation()}>Open <ArrowRight size={12} /></Link>,
    },
  ]

  return (
    <div className="workspace-scroll">
      <div className="page-header row-between">
        <div>
          <h1 className="t-page-title">Monitoring areas</h1>
          <p className="page-subtitle">{isAdmin ? 'Every registered area in the department.' : 'Areas assigned to you.'}</p>
        </div>
        {can(PERMISSIONS.MANAGE_AREAS) && <CreateAreaForm onCreated={refreshAois} />}
      </div>

      <ResponsiveTable
        columns={columns}
        rows={visible}
        rowKey="id"
        emptyState={
          <EmptyState icon={<MapPinned size={18} />} title="No areas yet"
            message={isAdmin ? 'Register the first monitoring area above.' : 'No areas have been assigned to you yet — contact an administrator.'} />
        }
      />
    </div>
  )
}
