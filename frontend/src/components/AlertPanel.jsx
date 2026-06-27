import { useState } from 'react'

/* ── Constants ────────────────────────────────────────────────────────────── */

const STATUS_LABEL = {
  pending:        'Pending',
  running:        'Processing…',
  done:           'Completed',
  failed:         'Failed',
  low_confidence: 'Low Confidence',
}

const CHANGE_LABEL = {
  deforestation:  'Deforestation',
  encroachment:   'Encroachment',
  agri_in_forest: 'Agri. Encroachment',
  tree_to_bare:   'Tree → Bare',
}

const CHANGE_CLASS = {
  deforestation:  'defor',
  encroachment:   'encr',
  agri_in_forest: 'agri',
  tree_to_bare:   'bare',
}

const OFFICER_REASON_LABEL = {
  cloud_shadow:    'Cloud / shadow misclassification',
  harvest:         'Authorised harvest',
  seasonal_flood:  'Seasonal flooding',
  natural_fall:    'Natural tree fall',
  other:           'Other',
}

// DW class display config — order by ecological importance for forest dept
const DW_CLASSES = [
  { key: 'trees',              label: 'Trees / Forest',      color: '#397d49' },
  { key: 'grass',              label: 'Grassland',           color: '#88b053' },
  { key: 'flooded_vegetation', label: 'Flooded Vegetation',  color: '#7a87c6' },
  { key: 'crops',              label: 'Crops',               color: '#e49635' },
  { key: 'shrub_and_scrub',    label: 'Shrub & Scrub',       color: '#dfc35a' },
  { key: 'built',              label: 'Built-up',            color: '#c4281b' },
  { key: 'bare',               label: 'Bare Soil',           color: '#a59b8f' },
  { key: 'water',              label: 'Water',               color: '#419bdf' },
  { key: 'snow_and_ice',       label: 'Snow / Ice',          color: '#b39fe1' },
]

/* ── Small helpers ────────────────────────────────────────────────────────── */

function SectionHead({ title, badge }) {
  return (
    <div className="section-head">
      <h3>{title}</h3>
      {badge != null && <span className="text-xs text-muted">{badge}</span>}
    </div>
  )
}

function RunStatus({ activeRun }) {
  if (!activeRun) return null
  const s = activeRun.status || 'pending'
  return (
    <div>
      <div className="run-status" style={{ marginTop: 8 }}>
        <div className={`run-indicator ${s}`} />
        <span style={{ fontWeight: 500 }}>{STATUS_LABEL[s] || s}</span>
        {s === 'running' && (
          <span className="text-xs text-muted" style={{ marginLeft: 'auto' }}>
            GEE processing…
          </span>
        )}
      </div>
      {activeRun.baseline && activeRun.current && ['done', 'low_confidence'].includes(s) && (
        <div className="text-xs text-muted font-mono" style={{ marginTop: 4 }}>
          baseline {activeRun.baseline} · current {activeRun.current}
        </div>
      )}
    </div>
  )
}

function MethodologyNote() {
  return (
    <div className="detect-window">
      <div className="dw-row">
        <span className="dw-label">Baseline</span>
        <span className="dw-dates">rolling 12 mo (excl. last 30 d)</span>
      </div>
      <div className="dw-row">
        <span className="dw-label">Current</span>
        <span className="dw-dates">last 15 days</span>
      </div>
      <div className="dw-row">
        <span className="dw-label">Promotion</span>
        <span className="dw-dates">2 confirming passes</span>
      </div>
    </div>
  )
}

function PrecisionPill({ precision }) {
  if (!precision || !precision.total) {
    return <span className="precision-pill unknown">No verified outcomes yet</span>
  }
  const pct = Math.round((precision.precision || 0) * 100)
  const tier = pct >= 70 ? 'good' : pct >= 40 ? 'mixed' : 'poor'
  return (
    <span className={`precision-pill ${tier}`}>
      {pct}% confirmed ({precision.confirmed}/{precision.total})
    </span>
  )
}

/* ── Land Cover Profile ───────────────────────────────────────────────────── */

function PreviewSkeleton() {
  return (
    <div className="panel-section">
      <SectionHead title="Current Land Cover Profile" />
      <div className="section-body">
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ marginBottom: 8 }}>
            <div className="skeleton-line" style={{ width: `${90 - i * 10}%` }} />
          </div>
        ))}
        <span className="text-xs text-muted">Loading land cover snapshot…</span>
      </div>
    </div>
  )
}

function LandCoverProfile({ currentDist, baselineDist, sourceLabel, windowLabel }) {
  if (!currentDist || Object.keys(currentDist).length === 0) return null

  const totalHa = Object.values(currentDist).reduce((s, v) => s + (v || 0), 0) || 1

  const rows = DW_CLASSES
    .map(c => ({
      ...c,
      ha:     currentDist[c.key] || 0,
      baseHa: baselineDist?.[c.key],
      pct:    Math.round(((currentDist[c.key] || 0) / totalHa) * 100),
    }))
    .filter(r => r.ha > 0)
    .sort((a, b) => b.ha - a.ha)

  const treeHa  = currentDist['trees'] || 0
  const treePct = Math.round((treeHa / totalHa) * 100)

  return (
    <div className="panel-section">
      <SectionHead title="Current Land Cover Profile" badge={sourceLabel} />
      <div className="section-body">

        {windowLabel && (
          <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
            Window: <span className="font-mono">{windowLabel}</span> · Total: {totalHa.toFixed(1)} ha
          </div>
        )}

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 10, padding: '7px 10px',
          background: treeHa > 0 ? '#F0FDF4' : '#FEF9F0',
          border: `1px solid ${treeHa > 0 ? '#86EFAC' : '#FCD34D'}`,
          borderRadius: 4,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: treeHa > 0 ? '#15803D' : '#92400E' }}>
            {treeHa > 0 ? '🌳' : '⚠'} Tree Cover
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: treeHa > 0 ? '#15803D' : '#92400E' }}>
            {treeHa.toFixed(1)} ha&nbsp;
            <span style={{ fontSize: 11, fontWeight: 400 }}>({treePct}%)</span>
          </span>
        </div>

        {rows.map(row => {
          const hasDelta = row.baseHa != null
          const delta = hasDelta ? row.ha - row.baseHa : 0
          const deltaStr = hasDelta && delta !== 0
            ? ` ${delta > 0 ? '+' : ''}${delta.toFixed(1)} ha`
            : ''
          return (
            <div key={row.key} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                  <span style={{
                    width: 9, height: 9, borderRadius: 2, background: row.color,
                    display: 'inline-block', flexShrink: 0,
                  }} />
                  {row.label}
                </span>
                <span style={{ fontSize: 11, color: 'var(--gray-600)', fontVariantNumeric: 'tabular-nums' }}>
                  {row.ha.toFixed(1)} ha
                  {deltaStr && (
                    <span style={{ color: delta > 0 ? '#DC2626' : '#16A34A', marginLeft: 4 }}>
                      {deltaStr}
                    </span>
                  )}
                </span>
              </div>
              <div style={{ height: 5, background: 'var(--gray-200)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${row.pct}%`,
                  background: row.color, borderRadius: 3,
                  transition: 'width .4s ease',
                }} />
              </div>
            </div>
          )
        })}

        {treeHa === 0 && (
          <div style={{
            marginTop: 8, fontSize: 11, color: '#92400E',
            background: '#FFFBEB', border: '1px solid #FDE68A',
            borderRadius: 4, padding: '6px 8px',
          }}>
            No tree cover detected in this AOI. The anomaly detector requires
            baseline-forest pixels to score against — pick a forested AOI to
            exercise deforestation/encroachment alert paths.
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Change Statistics ────────────────────────────────────────────────────── */

function ChangeStats({ activeRun }) {
  if (!activeRun || !['done', 'low_confidence'].includes(activeRun.status)) return null
  const a = activeRun.areas_ha || {}
  const hasDisturbance = (a.any_change || 0) > 0

  return (
    <div className="panel-section">
      <SectionHead title="This Run — Disturbance Detected" />
      <div className="section-body">

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 10px', marginBottom: 10,
          background: hasDisturbance ? '#FEF2F2' : '#F0FDF4',
          border: `1px solid ${hasDisturbance ? '#FCA5A5' : '#86EFAC'}`,
          borderRadius: 4,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: hasDisturbance ? '#991B1B' : '#15803D' }}>
            {hasDisturbance ? '⚠ Anomalous forest loss found' : '✓ No anomaly above baseline'}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: hasDisturbance ? '#991B1B' : '#15803D' }}>
            {(a.any_change || 0).toFixed(2)} ha
          </span>
        </div>

        <div className="stats-row">
          {[
            { key: 'deforestation',  cls: 'defor', label: 'Deforestation'   },
            { key: 'encroachment',   cls: 'encr',  label: 'Encroachment'    },
            { key: 'agri_in_forest', cls: 'agri',  label: 'Agri. Encr.'    },
            { key: 'tree_to_bare',   cls: 'bare',  label: 'Tree → Bare'     },
          ].map(({ key, cls, label }) => (
            <div key={key} className={`stat-card ${cls}`}>
              <div className="stat-value">
                {(a[key] || 0).toFixed(2)}
                <span className="stat-unit"> ha</span>
              </div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>

        <table className="data-table" style={{ marginTop: 10 }}>
          <tbody>
            <tr>
              <td className="text-muted text-xs">Baseline images</td>
              <td style={{ textAlign: 'right' }} className="font-mono">
                {activeRun.baseline_images ?? '—'}
              </td>
            </tr>
            <tr>
              <td className="text-muted text-xs">Current images</td>
              <td style={{ textAlign: 'right' }} className="font-mono">
                {activeRun.current_images ?? '—'}
              </td>
            </tr>
          </tbody>
        </table>

        {activeRun.status === 'low_confidence' && (
          <div style={{
            marginTop: 8, padding: '7px 10px', fontSize: 11,
            background: '#FFFBEB', border: '1px solid #FDE68A',
            borderRadius: 4, color: '#92400E',
          }}>
            ⚠ Only {activeRun.current_images} current image(s). Likely monsoon cloud
            cover — new candidate sites from this run will need extra confirming passes.
          </div>
        )}

        <p className="text-xs text-muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
          New clusters from this run appear under <strong>Candidates</strong> below
          and only become an open alert once re-detected on a second pass.
        </p>
      </div>
    </div>
  )
}

/* ── Confidence meter + persistence dots ─────────────────────────────────── */

function ConfidenceMeter({ value }) {
  const v = Math.max(0, Math.min(100, value || 0))
  return (
    <div className="confidence-row">
      <div className="confidence-track">
        <div className="confidence-fill" style={{ width: `${v}%` }} />
      </div>
      <span className="confidence-value">{v.toFixed(0)}/100</span>
    </div>
  )
}

function PersistenceDots({ count }) {
  const n = Math.min(count || 1, 5)
  return (
    <span className="persistence-dots">
      {Array.from({ length: Math.max(n, 2) }).map((_, i) => (
        <span key={i} className={`persistence-dot ${i < n ? 'filled' : ''}`} />
      ))}
    </span>
  )
}

/* ── Tiny inline time-series sparkline (no chart library) ─────────────────── */

function Sparkline({ data }) {
  if (!data || data.length < 2) return null
  const w = 280, h = 52, pad = 4
  const vals = data.map(d => d.trees_prob)
  const min = Math.min(...vals), max = Math.max(...vals)
  const range = (max - min) || 1
  const points = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2)
    const y = h - pad - ((d.trees_prob - min) / range) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <div className="sparkline-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke="#1A3C6E" strokeWidth="1.5" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span className="text-xs text-muted font-mono">{data[0].date}</span>
        <span className="text-xs text-muted font-mono">{data[data.length - 1].date}</span>
      </div>
    </div>
  )
}

/* ── Explainability bundle ───────────────────────────────────────────────── */

function ExplainabilityBundle({ bundle }) {
  if (!bundle) return null
  return (
    <div className="bundle">
      {bundle.caption && <p className="bundle-caption">{bundle.caption}</p>}
      {bundle.timeseries?.length > 1 && <Sparkline data={bundle.timeseries} />}
      {(bundle.before_tile_url || bundle.after_tile_url) && (
        <div className="bundle-thumbs">
          <div className="bundle-thumb-wrap">
            {bundle.before_tile_url
              ? <img className="bundle-thumb" alt="Before" src={bundle.before_tile_url.replace('{z}/{x}/{y}', '13/0/0')} />
              : <div className="bundle-thumb" />}
            <div className="bundle-thumb-label">Before</div>
          </div>
          <div className="bundle-thumb-wrap">
            {bundle.after_tile_url
              ? <img className="bundle-thumb" alt="After" src={bundle.after_tile_url.replace('{z}/{x}/{y}', '13/0/0')} />
              : <div className="bundle-thumb" />}
            <div className="bundle-thumb-label">After</div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Outcome picker ───────────────────────────────────────────────────────── */

function OutcomePicker({ alert, onAlertUpdate, currentViewer }) {
  const [reasonOpen, setReasonOpen] = useState(false)
  const [reason, setReason] = useState('cloud_shadow')

  const submit = (officer_outcome, officer_reason) => {
    onAlertUpdate(alert.id, { officer_outcome, officer_reason, verified_by: currentViewer || 'admin' })
    setReasonOpen(false)
  }

  return (
    <div>
      <div className="outcome-picker">
        <button
          className={`btn btn-xs btn-success ${alert.officer_outcome === 'confirmed' ? 'active' : ''}`}
          onClick={() => submit('confirmed', null)}
        >✓ Confirmed</button>
        <button
          className={`btn btn-xs btn-danger ${alert.officer_outcome === 'false_alarm' ? 'active' : ''}`}
          onClick={() => setReasonOpen(o => !o)}
        >✕ False Alarm</button>
        <button
          className={`btn btn-xs btn-secondary ${alert.officer_outcome === 'needs_follow_up' ? 'active' : ''}`}
          onClick={() => submit('needs_follow_up', null)}
        >Needs Follow-up</button>
      </div>
      {reasonOpen && (
        <div className="outcome-reason">
          <select
            className="form-select"
            style={{ fontSize: 11, padding: '4px 8px', marginBottom: 6 }}
            value={reason}
            onChange={e => setReason(e.target.value)}
          >
            {Object.entries(OFFICER_REASON_LABEL).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <button className="btn btn-xs btn-danger btn-full" onClick={() => submit('false_alarm', reason)}>
            Confirm False Alarm — {OFFICER_REASON_LABEL[reason]}
          </button>
        </div>
      )}
      {alert.officer_outcome && (
        <div className="text-xs text-muted" style={{ marginTop: 6 }}>
          Recorded {alert.officer_outcome === 'false_alarm' ? `false alarm (${OFFICER_REASON_LABEL[alert.officer_reason] || '—'})` : alert.officer_outcome}
          {alert.verified_by ? ` by ${alert.verified_by}` : ''}
          {alert.verified_at ? ` · ${new Date(alert.verified_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : ''}
        </div>
      )}
    </div>
  )
}

/* ── Alert card (Open / Resolved queues) ──────────────────────────────────── */

function AlertCard({ alert, onAlertUpdate, rangers, currentViewer }) {
  const [expanded, setExpanded] = useState(alert.status === 'open')
  const cls = CHANGE_CLASS[alert.change_type] || ''

  return (
    <div className={`alert-card ${cls}`}>
      <div className="alert-card-head">
        <span className="alert-card-title">
          <span className={`change-dot ${alert.change_type}`} />
          {CHANGE_LABEL[alert.change_type] || alert.change_type}
        </span>
        <span className={`badge badge-${alert.severity}`}>{alert.severity}</span>
      </div>

      <ConfidenceMeter value={alert.confidence} />

      <div className="alert-card-meta">
        <span><span className="meta-label">Area</span>{Number(alert.area_ha || 0).toFixed(2)} ha</span>
        <span className="font-mono"><span className="meta-label">z</span>{alert.anomaly_z_score?.toFixed(1) ?? '—'}</span>
        <span><span className="meta-label">Passes</span><PersistenceDots count={alert.persistence_count} /> {alert.persistence_count}</span>
        <span className="font-mono">
          <span className="meta-label">First seen</span>
          {alert.first_detected_at
            ? new Date(alert.first_detected_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
            : '—'}
        </span>
      </div>

      <button
        className="btn btn-xs btn-secondary btn-full"
        onClick={() => setExpanded(e => !e)}
        style={{ marginBottom: 6 }}
      >
        {expanded ? 'Hide evidence ▲' : 'Show evidence ▼'}
      </button>

      {expanded && <ExplainabilityBundle bundle={alert.explainability} />}

      {alert.status === 'open' && (
        <>
          {rangers.length > 0 && (
            <select
              className="form-select"
              style={{ fontSize: 11, padding: '4px 8px', marginTop: 6 }}
              defaultValue={alert.assigned_to || ''}
              onChange={e => onAlertUpdate(alert.id, { assigned_to: e.target.value })}
            >
              <option value="">Unassigned</option>
              {rangers.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
            </select>
          )}
          <OutcomePicker alert={alert} onAlertUpdate={onAlertUpdate} currentViewer={currentViewer} />
          <button
            className="btn btn-xs btn-secondary btn-full"
            style={{ marginTop: 6 }}
            onClick={() => onAlertUpdate(alert.id, { status: 'resolved' })}
          >Mark Resolved</button>
        </>
      )}

      {alert.status !== 'open' && (
        <span className={`badge badge-${alert.status}`} style={{ marginTop: 4, display: 'inline-block' }}>
          {alert.status}
        </span>
      )}
    </div>
  )
}

/* ── Candidate row (forming sites — read-only, not yet actionable) ────────── */

function CandidateRow({ site }) {
  return (
    <div className="candidate-row">
      <span className="candidate-type">
        <span className={`change-dot ${site.change_type}`} style={{ marginRight: 6 }} />
        {CHANGE_LABEL[site.change_type] || site.change_type}
      </span>
      <span className="candidate-progress">pass {site.persistence_count}/2</span>
    </div>
  )
}

/* ── Queue (tabs + list) ──────────────────────────────────────────────────── */

function Queue({ alerts, sites, rangers, onAlertUpdate, currentViewer }) {
  const [tab, setTab] = useState('open')

  const open       = alerts.filter(a => a.status === 'open')
  const resolved   = alerts.filter(a => a.status !== 'open')
  const candidates = sites.filter(s => s.status === 'candidate')

  const TABS = [
    { key: 'open',       label: 'Open',       count: open.length },
    { key: 'candidates', label: 'Candidates', count: candidates.length },
    { key: 'resolved',   label: 'Resolved',   count: resolved.length },
  ]

  return (
    <div className="panel-section">
      <div className="queue-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`queue-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}<span className="queue-tab-count">{t.count}</span>
          </button>
        ))}
      </div>
      <div className="section-body">
        {tab === 'open' && (
          open.length === 0
            ? <div className="empty-state"><span className="empty-icon">✓</span><p>No open alerts — nothing awaiting review</p></div>
            : open.map(a => (
                <AlertCard key={a.id} alert={a} onAlertUpdate={onAlertUpdate} rangers={rangers} currentViewer={currentViewer} />
              ))
        )}
        {tab === 'candidates' && (
          candidates.length === 0
            ? <div className="empty-state"><span className="empty-icon">—</span><p>No clusters currently forming</p></div>
            : <>
                <p className="text-xs text-muted" style={{ marginBottom: 8, lineHeight: 1.5 }}>
                  Detected once, not yet visible as alerts — needs a confirming
                  pass on the next run before promotion.
                </p>
                {candidates.map(s => <CandidateRow key={s.id} site={s} />)}
              </>
        )}
        {tab === 'resolved' && (
          resolved.length === 0
            ? <div className="empty-state"><span className="empty-icon">—</span><p>No closed alerts yet</p></div>
            : resolved.map(a => (
                <AlertCard key={a.id} alert={a} onAlertUpdate={onAlertUpdate} rangers={rangers} currentViewer={currentViewer} />
              ))
        )}
      </div>
    </div>
  )
}

/* ── Run History ──────────────────────────────────────────────────────────── */

function RunHistory({ runHistory }) {
  if (!runHistory?.length) return null
  return (
    <div className="panel-section">
      <SectionHead title="Detection History" badge={`last ${Math.min(runHistory.length, 5)}`} />
      <div className="tbl-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Disturbance</th>
              <th>Defor.</th>
            </tr>
          </thead>
          <tbody>
            {runHistory.slice(0, 5).map(run => (
              <tr key={run.id}>
                <td className="font-mono text-xs">
                  {run.run_at
                    ? new Date(run.run_at).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', year: '2-digit',
                      })
                    : '—'}
                </td>
                <td>
                  <div className="run-status">
                    <div className={`run-indicator ${run.status}`} />
                    <span style={{ fontSize: 11 }}>{run.status}</span>
                  </div>
                </td>
                <td className="td-area text-xs">
                  {run.any_change_ha != null ? `${Number(run.any_change_ha).toFixed(2)} ha` : '—'}
                </td>
                <td className="td-area text-xs" style={{ color: 'var(--defor)' }}>
                  {run.deforestation_ha != null ? `${Number(run.deforestation_ha).toFixed(2)} ha` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Main Panel ───────────────────────────────────────────────────────────── */

export default function AlertPanel({
  aois, selectedAoiId, selectedAoi, onSelectAoi,
  preview, previewLoading,
  activeRun, polling, onDetect,
  alerts, sites = [], precision, rangers = [], runHistory, onAlertUpdate,
  currentViewer,
}) {
  const hasRunDist = activeRun?.class_distribution &&
                      Object.keys(activeRun.class_distribution).length > 0
  const landCoverProps = hasRunDist
    ? {
        currentDist:  activeRun.class_distribution,
        baselineDist: activeRun.baseline_distribution,
        sourceLabel:  'detection run',
        windowLabel:  `${activeRun.current}`,
      }
    : preview?.class_distribution
    ? {
        currentDist:  preview.class_distribution,
        baselineDist: null,
        sourceLabel:  'preview · last 30d',
        windowLabel:  preview.window,
      }
    : null

  return (
    <div className="panel-scroll">

      {/* ── AOI Selector ──────────────────────────────────────────────── */}
      <div className="panel-section">
        <SectionHead title="Area of Interest" />
        <div className="section-body">
          <label className="form-label">Select Monitoring Area</label>
          <select
            className="form-select"
            value={selectedAoiId || ''}
            onChange={e => onSelectAoi(e.target.value)}
          >
            {aois.length === 0 && <option value="">— No AOIs registered —</option>}
            {aois.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}{a.division ? ` · ${a.division}` : ''}
              </option>
            ))}
          </select>

          {selectedAoi && (
            <div style={{ marginTop: 8 }}>
              {[
                ['Division', selectedAoi.division],
                ['Range',    selectedAoi.range_name],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="info-row">
                  <span className="info-key">{k}</span>
                  <span className="info-val">{v}</span>
                </div>
              ))}
              <div className="info-row">
                <span className="info-key">Field-verified precision</span>
                <PrecisionPill precision={precision} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Detection Controls ─────────────────────────────────────────── */}
      <div className="panel-section">
        <SectionHead title="Anomaly Detection" />
        <div className="section-body">
          <MethodologyNote />

          <button
            className="btn btn-primary btn-full"
            onClick={onDetect}
            disabled={!selectedAoiId || polling}
            style={{ marginTop: 8 }}
          >
            {polling
              ? <><span className="run-indicator running" style={{ marginRight: 6 }} />Processing GEE Job…</>
              : '▶  Run Detection Now'}
          </button>

          <RunStatus activeRun={activeRun} />
        </div>
      </div>

      {/* ── Change Statistics (only once a run has completed) ──────────── */}
      <ChangeStats activeRun={activeRun} />

      {/* ── Land Cover Profile — preview or post-run, whichever is freshest ── */}
      {previewLoading && !landCoverProps && <PreviewSkeleton />}
      {landCoverProps && <LandCoverProfile {...landCoverProps} />}

      {/* ── Verification Queue — Open / Candidates / Resolved ───────────── */}
      <Queue
        alerts={alerts}
        sites={sites}
        rangers={rangers}
        onAlertUpdate={onAlertUpdate}
        currentViewer={currentViewer}
      />

      {/* ── Detection History ──────────────────────────────────────────── */}
      <RunHistory runHistory={runHistory} />

    </div>
  )
}