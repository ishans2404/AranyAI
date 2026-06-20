import { nrtWindows } from '../api'

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

// DW class display config — order by ecological importance for forest dept
const DW_CLASSES = [
  { key: 'trees',              label: 'Trees / Forest',      color: '#397d49', important: true  },
  { key: 'grass',              label: 'Grassland',           color: '#88b053', important: true  },
  { key: 'flooded_vegetation', label: 'Flooded Vegetation',  color: '#7a87c6', important: false },
  { key: 'crops',              label: 'Crops',               color: '#e49635', important: true  },
  { key: 'shrub_and_scrub',    label: 'Shrub & Scrub',       color: '#dfc35a', important: false },
  { key: 'built',              label: 'Built-up',            color: '#c4281b', important: true  },
  { key: 'bare',               label: 'Bare Soil',           color: '#a59b8f', important: true  },
  { key: 'water',              label: 'Water',               color: '#419bdf', important: false },
  { key: 'snow_and_ice',       label: 'Snow / Ice',          color: '#b39fe1', important: false },
]

/* ── Small helpers ────────────────────────────────────────────────────────── */

function SectionHead({ title, badge }) {
  return (
    <div className="section-head">
      <h3>{title}</h3>
      {badge != null && (
        <span className="text-xs text-muted">{badge}</span>
      )}
    </div>
  )
}

function RunStatus({ activeRun }) {
  if (!activeRun) return null
  const s = activeRun.status || 'pending'
  return (
    <div className="run-status" style={{ marginTop: 8 }}>
      <div className={`run-indicator ${s}`} />
      <span style={{ fontWeight: 500 }}>{STATUS_LABEL[s] || s}</span>
      {s === 'running' && (
        <span className="text-xs text-muted" style={{ marginLeft: 'auto' }}>
          GEE processing…
        </span>
      )}
    </div>
  )
}

function DateWindow() {
  const w = nrtWindows()
  return (
    <div className="detect-window">
      <div className="dw-row">
        <span className="dw-label">Baseline</span>
        <span className="dw-dates">{w.baseline_start} → {w.baseline_end}</span>
      </div>
      <div className="dw-row">
        <span className="dw-label">Current</span>
        <span className="dw-dates">{w.current_start} → {w.current_end}</span>
      </div>
    </div>
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

        {/* Tree cover summary */}
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

        {/* Class breakdown bars */}
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
            No tree cover detected in this AOI. Deforestation and tree-loss
            alerts require forest as the baseline land class. Use a forested AOI
            (e.g. the "forest" test AOI) for forest change detection.
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

  const hasAnyChange = (a.any_change || 0) > 0
  const hasSpecific  = ['deforestation','encroachment','agri_in_forest','tree_to_bare']
    .some(k => (a[k] || 0) > 0)

  return (
    <div className="panel-section">
      <SectionHead title="Change Detection Results" />
      <div className="section-body">

        {/* High-level summary row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 10px', marginBottom: 10,
          background: hasAnyChange ? '#FEF2F2' : '#F0FDF4',
          border: `1px solid ${hasAnyChange ? '#FCA5A5' : '#86EFAC'}`,
          borderRadius: 4,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: hasAnyChange ? '#991B1B' : '#15803D' }}>
            {hasAnyChange ? '⚠ Change detected' : '✓ No significant change'}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: hasAnyChange ? '#991B1B' : '#15803D' }}>
            {(a.any_change || 0).toFixed(1)} ha
          </span>
        </div>

        {/* 4 specific change type stats */}
        <div className="stats-row">
          {[
            { key: 'deforestation',  cls: 'defor', label: 'Deforestation'   },
            { key: 'encroachment',   cls: 'encr',  label: 'Encroachment'    },
            { key: 'agri_in_forest', cls: 'agri',  label: 'Agri. Encr.'    },
            { key: 'tree_to_bare',   cls: 'bare',  label: 'Tree → Bare'     },
          ].map(({ key, cls, label }) => (
            <div key={key} className={`stat-card ${cls}`}>
              <div className="stat-value">
                {(a[key] || 0).toFixed(1)}
                <span className="stat-unit"> ha</span>
              </div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>

        {/* Image count + context */}
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

        {/* Low confidence warning */}
        {activeRun.status === 'low_confidence' && (
          <div style={{
            marginTop: 8, padding: '7px 10px', fontSize: 11,
            background: '#FFFBEB', border: '1px solid #FDE68A',
            borderRadius: 4, color: '#92400E',
          }}>
            ⚠ Only {activeRun.current_images} current image(s). Likely monsoon cloud
            cover. Results may be unreliable.
          </div>
        )}

        {/* No specific changes context */}
        {hasAnyChange && !hasSpecific && (
          <div style={{
            marginTop: 8, padding: '7px 10px', fontSize: 11,
            background: '#EFF6FF', border: '1px solid #BFDBFE',
            borderRadius: 4, color: '#1E40AF',
          }}>
            ℹ {(a.any_change || 0).toFixed(1)} ha total change is class transitions
            between non-forest types (e.g. crops ↔ bare). No tree-loss transitions
            detected — see Land Cover Profile above.
          </div>
        )}

        {/* GCS raster path */}
        {activeRun.raster_gcs && (
          <div style={{ marginTop: 8, fontSize: 10, color: 'var(--gray-400)', wordBreak: 'break-all' }}>
            <span style={{ fontWeight: 600, color: 'var(--gray-500)' }}>Raster: </span>
            <span className="font-mono">{activeRun.raster_gcs}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Alert Table ──────────────────────────────────────────────────────────── */

function AlertTable({ alerts, onAlertUpdate }) {
  const open = alerts.filter(a => a.status === 'open')
  return (
    <div className="panel-section">
      <SectionHead
        title="Active Alerts"
        badge={open.length > 0 ? `${open.length} open` : 'none'}
      />
      <div className="tbl-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Change Type</th>
              <th>Area</th>
              <th>Sev.</th>
              <th>First Det.</th>
              <th>Conf.</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {alerts.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <span className="empty-icon">✓</span>
                    <p>No alerts triggered for this run</p>
                  </div>
                </td>
              </tr>
            )}
            {alerts.map((alert, i) => (
              <tr key={alert.id}>
                <td className="font-mono text-xs">{i + 1}</td>
                <td>
                  <span className={`change-dot ${alert.change_type}`} />
                  <span className="td-type">
                    {CHANGE_LABEL[alert.change_type] || alert.change_type}
                  </span>
                </td>
                <td className="td-area">{Number(alert.area_ha || 0).toFixed(1)} ha</td>
                <td>
                  <span className={`badge badge-${alert.severity}`}>{alert.severity}</span>
                </td>
                <td className="font-mono text-xs">
                  {alert.first_detected_at
                    ? new Date(alert.first_detected_at)
                        .toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                    : '—'}
                </td>
                <td className="font-mono text-xs">
                  {alert.confidence ? `${Math.round(alert.confidence * 100)}%` : '—'}
                </td>
                <td>
                  {alert.status === 'open' ? (
                    <div className="td-actions">
                      <button
                        className="btn btn-xs btn-secondary"
                        onClick={() => onAlertUpdate(alert.id, { status: 'assigned' })}
                      >Assign</button>
                      <button
                        className="btn btn-xs btn-danger"
                        onClick={() => onAlertUpdate(alert.id, { status: 'resolved' })}
                      >Resolve</button>
                    </div>
                  ) : (
                    <span className={`badge badge-${alert.status}`}>{alert.status}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
              <th>Change</th>
              <th>Trees Lost</th>
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
                  {run.any_change_ha != null
                    ? `${Number(run.any_change_ha).toFixed(1)} ha`
                    : '—'}
                </td>
                <td className="td-area text-xs" style={{ color: 'var(--defor)' }}>
                  {run.deforestation_ha != null
                    ? `${Number(run.deforestation_ha).toFixed(1)} ha`
                    : '—'}
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
  alerts, runHistory, onAlertUpdate,
}) {
  // Prefer the detection run's distribution once one exists (it reflects
  // the actual NRT window just analysed); fall back to the fast preview
  // (last 30 days) when no run has completed yet for this AOI.
  const hasRunDist  = activeRun?.class_distribution &&
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
            </div>
          )}
        </div>
      </div>

      {/* ── Detection Controls ─────────────────────────────────────────── */}
      <div className="panel-section">
        <SectionHead title="NRT Detection" />
        <div className="section-body">
          <DateWindow />

          <button
            className="btn btn-primary btn-full"
            onClick={onDetect}
            disabled={!selectedAoiId || polling}
            style={{ marginTop: 8 }}
          >
            {polling
              ? <><span className="run-indicator running" style={{ marginRight: 6 }} />Processing GEE Job…</>
              : '▶  Run NRT Detection'}
          </button>

          <RunStatus activeRun={activeRun} />
        </div>
      </div>

      {/* ── Change Statistics (only once a run has completed) ──────────── */}
      <ChangeStats activeRun={activeRun} />

      {/* ── Land Cover Profile — preview or post-run, whichever is freshest ── */}
      {previewLoading && !landCoverProps && <PreviewSkeleton />}
      {landCoverProps && <LandCoverProfile {...landCoverProps} />}

      {/* ── Active Alerts ─────────────────────────────────────────────── */}
      <AlertTable alerts={alerts} onAlertUpdate={onAlertUpdate} />

      {/* ── Detection History ──────────────────────────────────────────── */}
      <RunHistory runHistory={runHistory} />

    </div>
  )
}