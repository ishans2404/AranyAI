import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { CHANGE_TYPES } from '../../lib/dw'
import { fmtDate } from '../../lib/format'
import { SeverityBadge, StatusBadge, ConfidenceMeter, PersistenceDots, ChangeDot } from '../ui/Primitives'
import ExplainabilityBundle from './ExplainabilityBundle'
import OutcomePicker from './OutcomePicker'

export default function AlertCard({ alert, onUpdate, rangers = [], viewerName, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const ct = CHANGE_TYPES[alert.change_type] || { label: alert.change_type, color: 'var(--slate)' }

  return (
    <div className="card card-pad" style={{ borderLeft: `3px solid ${ct.color}` }}>
      <div className="row-between" style={{ marginBottom: 8 }}>
        <span className="row gap-2 t-card-title">
          <ChangeDot color={ct.color} />
          {ct.label}
        </span>
        <SeverityBadge severity={alert.severity} />
      </div>

      <ConfidenceMeter value={alert.confidence} />

      <div className="row gap-5" style={{ marginTop: 10, marginBottom: 4, flexWrap: 'wrap', rowGap: 6 }}>
        <Meta label="Area">{Number(alert.area_ha || 0).toFixed(2)} ha</Meta>
        <Meta label="z-score" mono>{alert.anomaly_z_score?.toFixed(1) ?? '—'}</Meta>
        <Meta label="Passes"><PersistenceDots count={alert.persistence_count} /></Meta>
        <Meta label="First seen" mono>{alert.first_detected_at ? fmtDate(alert.first_detected_at, { year: undefined }) : '—'}</Meta>
      </div>

      <button className="btn btn-ghost btn-xs btn-full" onClick={() => setExpanded(e => !e)} style={{ marginTop: 6 }}>
        {expanded ? <>Hide evidence <ChevronUp size={13} /></> : <>Show evidence <ChevronDown size={13} /></>}
      </button>

      {expanded && <ExplainabilityBundle bundle={alert.explainability} />}

      {alert.status === 'open' ? (
        <div style={{ marginTop: 10 }}>
          {rangers.length > 0 && (
            <select
              className="form-control" style={{ fontSize: 12, padding: '6px 10px', marginBottom: 8 }}
              defaultValue={alert.assigned_to || ''}
              onChange={e => onUpdate(alert.id, { assigned_to: e.target.value })}
            >
              <option value="">Unassigned</option>
              {rangers.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
            </select>
          )}
          <OutcomePicker alert={alert} onUpdate={onUpdate} viewerName={viewerName} />
        </div>
      ) : (
        <div style={{ marginTop: 10 }}><StatusBadge status={alert.status} /></div>
      )}
    </div>
  )
}

function Meta({ label, children, mono }) {
  return (
    <span className="t-small">
      <span className="t-eyebrow" style={{ fontSize: 9, marginRight: 4 }}>{label}</span>
      <span className={mono ? 't-mono' : ''} style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{children}</span>
    </span>
  )
}
