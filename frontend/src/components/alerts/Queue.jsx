import { useState } from 'react'
import { ShieldCheck, Clock3, Inbox } from 'lucide-react'
import { CHANGE_TYPES } from '../../lib/dw'
import { ChangeDot, EmptyState } from '../ui/Primitives'
import AlertCard from './AlertCard'

export function CandidateRow({ site }) {
  const ct = CHANGE_TYPES[site.change_type] || { label: site.change_type, color: 'var(--slate)' }
  return (
    <div className="row-between card card-pad" style={{ padding: '10px 14px', marginBottom: 6 }}>
      <span className="row gap-2 t-small" style={{ fontWeight: 500 }}>
        <ChangeDot color={ct.color} /> {ct.label}
      </span>
      <span className="t-small t-mono t-muted">pass {site.persistence_count}/2</span>
    </div>
  )
}

export default function Queue({ alerts, sites, rangers = [], onUpdate, viewerName }) {
  const [tab, setTab] = useState('open')
  const open = alerts.filter(a => a.status === 'open')
  const resolved = alerts.filter(a => a.status !== 'open')
  const candidates = sites.filter(s => s.status === 'candidate')

  const TABS = [
    { key: 'open', label: 'Open', count: open.length },
    { key: 'candidates', label: 'Candidates', count: candidates.length },
    { key: 'resolved', label: 'Resolved', count: resolved.length },
  ]

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label} <span className="tab-count">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === 'open' && (
        open.length === 0
          ? <EmptyState icon={<ShieldCheck size={18} />} title="Nothing awaiting review" message="No open alerts for this area." />
          : <div className="col gap-3">{open.map(a => <AlertCard key={a.id} alert={a} onUpdate={onUpdate} rangers={rangers} viewerName={viewerName} defaultExpanded />)}</div>
      )}

      {tab === 'candidates' && (
        candidates.length === 0
          ? <EmptyState icon={<Clock3 size={18} />} title="No clusters forming" message="Detected once, not yet confirmed by a second pass." />
          : <>
              <p className="t-small t-muted" style={{ marginBottom: 10 }}>
                Detected once — needs a confirming pass on the next run before it becomes an alert.
              </p>
              {candidates.map(s => <CandidateRow key={s.id} site={s} />)}
            </>
      )}

      {tab === 'resolved' && (
        resolved.length === 0
          ? <EmptyState icon={<Inbox size={18} />} title="No closed alerts yet" />
          : <div className="col gap-3">{resolved.map(a => <AlertCard key={a.id} alert={a} onUpdate={onUpdate} rangers={rangers} viewerName={viewerName} />)}</div>
      )}
    </div>
  )
}
