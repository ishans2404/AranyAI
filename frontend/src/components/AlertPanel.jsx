import { nrtWindows } from '../api'

/* ── Helpers ───────────────────────────────────────────────────────── */

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

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

/* ── Sub-components ────────────────────────────────────────────────── */

function SectionHead({ title, count }) {
  return (
    <div className="section-head">
      <h3>{title}</h3>
      {count != null && (
        <span className="text-xs text-muted">{count} record{count !== 1 ? 's' : ''}</span>
      )}
    </div>
  )
}

function RunStatusRow({ activeRun, polling }) {
  if (!activeRun) return null
  const status = activeRun.status || 'pending'
  return (
    <div className="run-status" style={{ marginTop: 8 }}>
      <div className={`run-indicator ${status}`} />
      <span>{STATUS_LABEL[status] || status}</span>
      {status === 'running' && (
        <span className="text-xs text-muted" style={{ marginLeft: 'auto' }}>
          polling every 5 s…
        </span>
      )}
    </div>
  )
}

function DetectionWindow() {
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

function StatsSection({ activeRun }) {
  if (!activeRun || !['done', 'low_confidence'].includes(activeRun.status)) return null
  const a = activeRun.areas_ha || {}
  return (
    <div className="panel-section">
      <SectionHead title="Change Statistics" />
      <div className="section-body">
        <div className="stats-row">
          {[
            { key: 'deforestation',  cls: 'defor', label: 'Deforestation' },
            { key: 'encroachment',   cls: 'encr',  label: 'Encroachment'  },
            { key: 'agri_in_forest', cls: 'agri',  label: 'Agri. Encr.'   },
            { key: 'tree_to_bare',   cls: 'bare',  label: 'Tree → Bare'   },
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

        <table className="data-table" style={{ marginTop: 10 }}>
          <tbody>
            <tr>
              <td className="text-muted text-xs">Total change area</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{(a.any_change || 0).toFixed(1)} ha</td>
            </tr>
            <tr>
              <td className="text-muted text-xs">Baseline images</td>
              <td style={{ textAlign: 'right' }} className="font-mono">{activeRun.baseline_images ?? '—'}</td>
            </tr>
            <tr>
              <td className="text-muted text-xs">Current images</td>
              <td style={{ textAlign: 'right' }} className="font-mono">{activeRun.current_images ?? '—'}</td>
            </tr>
          </tbody>
        </table>

        {activeRun.status === 'low_confidence' && (
          <div style={{
            marginTop: 8, padding: '7px 10px', background: '#FFFBEB',
            border: '1px solid #FDE68A', borderRadius: 4, fontSize: 11, color: '#92400E',
          }}>
            ⚠ Low image count — likely monsoon cloud cover. Treat results with caution.
          </div>
        )}
      </div>
    </div>
  )
}

function AlertsTable({ alerts, onAlertUpdate }) {
  return (
    <div className="panel-section">
      <SectionHead title="Active Alerts" count={alerts.filter(a => a.status === 'open').length} />
      <div className="tbl-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 28 }}>#</th>
              <th>Change Type</th>
              <th>Area</th>
              <th>Severity</th>
              <th>First Det.</th>
              <th>Conf.</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {alerts.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <span className="empty-icon">✓</span>
                    <p>No active alerts</p>
                  </div>
                </td>
              </tr>
            )}
            {alerts.map((alert, i) => (
              <tr key={alert.id}>
                <td className="td-mono">{i + 1}</td>
                <td>
                  <span className={`change-dot ${alert.change_type}`} />
                  <span className="td-type">
                    {CHANGE_LABEL[alert.change_type] || alert.change_type}
                  </span>
                </td>
                <td className="td-area">{Number(alert.area_ha || 0).toFixed(1)} ha</td>
                <td>
                  <span className={`badge badge-${alert.severity}`}>
                    {alert.severity}
                  </span>
                </td>
                <td className="td-mono" style={{ fontSize: 11 }}>
                  {alert.first_detected_at
                    ? new Date(alert.first_detected_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })
                    : '—'}
                </td>
                <td className="td-mono" style={{ fontSize: 11 }}>
                  {alert.confidence ? `${Math.round(alert.confidence * 100)}%` : '—'}
                </td>
                <td>
                  <div className="td-actions">
                    {alert.status === 'open' && (
                      <>
                        <button
                          className="btn btn-xs btn-secondary"
                          onClick={() => onAlertUpdate(alert.id, { status: 'assigned' })}
                        >
                          Assign
                        </button>
                        <button
                          className="btn btn-xs btn-danger"
                          onClick={() => onAlertUpdate(alert.id, { status: 'resolved' })}
                        >
                          Resolve
                        </button>
                      </>
                    )}
                    {alert.status !== 'open' && (
                      <span className={`badge badge-${alert.status}`}>{alert.status}</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RunHistoryTable({ runHistory }) {
  if (!runHistory || runHistory.length === 0) return null
  return (
    <div className="panel-section">
      <SectionHead title="Run History" count={runHistory.length} />
      <div className="tbl-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Run Date</th>
              <th>Status</th>
              <th>Any Change</th>
              <th>Deforest.</th>
            </tr>
          </thead>
          <tbody>
            {runHistory.slice(0, 5).map(run => (
              <tr key={run.id}>
                <td className="td-mono" style={{ fontSize: 11 }}>
                  {run.run_at ? new Date(run.run_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' }) : '—'}
                </td>
                <td>
                  <div className="run-status">
                    <div className={`run-indicator ${run.status}`} />
                    <span style={{ fontSize: 11 }}>{run.status}</span>
                  </div>
                </td>
                <td className="td-area" style={{ fontSize: 11 }}>
                  {run.any_change_ha != null ? `${Number(run.any_change_ha).toFixed(1)} ha` : '—'}
                </td>
                <td className="td-area" style={{ fontSize: 11 }}>
                  {run.deforestation_ha != null ? `${Number(run.deforestation_ha).toFixed(1)} ha` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Main Panel ─────────────────────────────────────────────────────── */

export default function AlertPanel({
  aois, selectedAoiId, selectedAoi, onSelectAoi,
  activeRun, polling, onDetect,
  alerts, runHistory, onAlertUpdate,
}) {
  return (
    <div className="panel-scroll">

      {/* ── AOI Selection ──────────────────────────────────────────── */}
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
              {selectedAoi.range_name && (
                <div className="info-row">
                  <span className="info-key">Range</span>
                  <span className="info-val">{selectedAoi.range_name}</span>
                </div>
              )}
              {selectedAoi.division && (
                <div className="info-row">
                  <span className="info-key">Division</span>
                  <span className="info-val">{selectedAoi.division}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Detection Controls ─────────────────────────────────────── */}
      <div className="panel-section">
        <SectionHead title="Detection — NRT Mode" />
        <div className="section-body">
          <DetectionWindow />

          <button
            className="btn btn-primary btn-full"
            onClick={onDetect}
            disabled={!selectedAoiId || polling}
            style={{ marginTop: 8 }}
          >
            {polling
              ? <><span className="run-indicator running" />Processing GEE Job…</>
              : '▶ Run NRT Detection'}
          </button>

          <RunStatusRow activeRun={activeRun} polling={polling} />

          {activeRun?.status === 'done' && activeRun.raster_gcs && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--gray-500)' }}>
              <span style={{ fontWeight: 600 }}>Raster: </span>
              <span className="font-mono" style={{ wordBreak: 'break-all' }}>
                {activeRun.raster_gcs}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Change Statistics ──────────────────────────────────────── */}
      <StatsSection activeRun={activeRun} />

      {/* ── Active Alerts ─────────────────────────────────────────── */}
      <AlertsTable alerts={alerts} onAlertUpdate={onAlertUpdate} />

      {/* ── Run History ───────────────────────────────────────────── */}
      <RunHistoryTable runHistory={runHistory} />

    </div>
  )
}
