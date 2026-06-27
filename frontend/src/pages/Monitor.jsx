import { useOutletContext } from 'react-router-dom'
import { useState } from 'react'
import { Play, Loader2 } from 'lucide-react'
import MapCanvas from '../components/map/MapCanvas'
import LayerPanel from '../components/map/LayerPanel'
import { DW_CLASSES } from '../lib/dw'
import { fmtDate, fmtHa } from '../lib/format'
import { SkeletonLines } from '../components/ui/Primitives'

const STATUS_LABEL = { pending: 'Pending', running: 'Processing…', done: 'Complete', failed: 'Failed', low_confidence: 'Low confidence' }

function LandCover({ dist, baseline, label }) {
  if (!dist || Object.keys(dist).length === 0) return null
  const total = Object.values(dist).reduce((s, v) => s + (v || 0), 0) || 1
  const rows = DW_CLASSES.map(c => ({ ...c, ha: dist[c.key] || 0, base: baseline?.[c.key] }))
    .filter(r => r.ha > 0).sort((a, b) => b.ha - a.ha)
  const treeHa = dist.trees || 0

  return (
    <div className="card card-pad" style={{ marginTop: 14 }}>
      <div className="row-between" style={{ marginBottom: 10 }}>
        <h3 className="t-card-title">Land cover</h3>
        <span className="t-small t-faint">{label}</span>
      </div>
      <div className="row-between" style={{
        padding: '8px 10px', marginBottom: 10, borderRadius: 'var(--r-sm)',
        background: treeHa > 0 ? 'var(--lifted)' : 'var(--sev-high-bg)',
      }}>
        <span className="t-small" style={{ fontWeight: 500 }}>Tree cover</span>
        <span className="t-small t-mono" style={{ fontWeight: 700 }}>{treeHa.toFixed(1)} ha</span>
      </div>
      {rows.map(r => {
        const delta = r.base != null ? r.ha - r.base : null
        return (
          <div key={r.key} style={{ marginBottom: 7 }}>
            <div className="row-between" style={{ marginBottom: 2 }}>
              <span className="row gap-2 t-small">
                <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color }} />
                {r.label}
              </span>
              <span className="t-small t-mono">
                {r.ha.toFixed(1)} ha
                {delta != null && Math.abs(delta) > 0.05 && (
                  <span style={{ color: delta > 0 ? 'var(--signal)' : 'var(--text-secondary)', marginLeft: 4 }}>
                    {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                  </span>
                )}
              </span>
            </div>
            <div style={{ height: 4, background: 'var(--soft-bone)', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(r.ha / total) * 100}%`, background: r.color }} />
            </div>
          </div>
        )
      })}
      {treeHa === 0 && (
        <p className="t-small" style={{ marginTop: 8, color: 'var(--clay)' }}>
          No tree cover in this area — deforestation/encroachment alerts can't trigger here by design.
        </p>
      )}
    </div>
  )
}

export default function Monitor() {
  const { aoi, preview, previewLoading, activeRun, polling, triggerDetect, tiles, vectors, sites, runHistory } = useOutletContext()
  const [layers, setLayers] = useState({ dw: true, changes: true, sites: true, imagery: 'satellite' })

  const hasDist = activeRun?.class_distribution && Object.keys(activeRun.class_distribution).length > 0
  const landCover = hasDist
    ? { dist: activeRun.class_distribution, baseline: activeRun.baseline_distribution, label: 'this run' }
    : preview?.class_distribution
    ? { dist: preview.class_distribution, baseline: null, label: 'last 30 days' }
    : null

  return (
    <div className="row" style={{ height: '100%', alignItems: 'stretch' }}>
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <MapCanvas aoi={aoi?.geojson} tiles={tiles} preview={preview} vectors={vectors} sites={sites} layers={layers} />
        <LayerPanel layers={layers} onChange={setLayers} hasTiles={!!tiles} hasPreview={!!preview?.dw_tile_url} hasSites={sites.length > 0} />
      </div>

      <div className="scroll-thin" style={{ width: 340, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--surface)', padding: 'var(--sp-5)' }}>
        <h3 className="t-card-title" style={{ marginBottom: 4 }}>Rolling-baseline anomaly detection</h3>
        <p className="t-small t-muted" style={{ marginBottom: 14 }}>
          Baseline: 12-month median, excludes last 30 days · Current: last 15 days · Promotion: 2 confirming passes
        </p>

        <button className="btn btn-primary btn-full" disabled={polling} onClick={() => triggerDetect('nrt')}>
          {polling ? <><Loader2 size={14} className="spin" /> Processing…</> : <><Play size={14} /> Run detection</>}
        </button>

        {activeRun && (
          <div className="row gap-2" style={{ marginTop: 10 }}>
            <span className="live-dot" style={polling ? undefined : { animation: 'none', background: activeRun.status === 'failed' ? 'var(--signal)' : 'var(--ink)' }} />
            <span className="t-small" style={{ fontWeight: 500 }}>{STATUS_LABEL[activeRun.status] || activeRun.status}</span>
          </div>
        )}

        {activeRun && ['done', 'low_confidence'].includes(activeRun.status) && activeRun.baseline && (
          <p className="t-small t-faint t-mono" style={{ marginTop: 4 }}>
            baseline {activeRun.baseline} · current {activeRun.current}
          </p>
        )}

        {activeRun && ['done', 'low_confidence'].includes(activeRun.status) && (
          <div className="row gap-4" style={{ marginTop: 6 }}>
            <span className="t-small t-muted">Baseline images <span className="t-mono" style={{ color: 'var(--text-primary)' }}>{activeRun.baseline_images ?? '—'}</span></span>
            <span className="t-small t-muted">Current images <span className="t-mono" style={{ color: 'var(--text-primary)' }}>{activeRun.current_images ?? '—'}</span></span>
          </div>
        )}

        {activeRun?.status === 'low_confidence' && (
          <div className="t-small" style={{ marginTop: 8, padding: '8px 10px', borderRadius: 'var(--r-sm)', background: 'var(--sev-medium-bg)', color: 'var(--sev-medium-fg)' }}>
            Only {activeRun.current_images} current image(s) — likely monsoon cloud cover. New candidate
            sites from this run will need extra confirming passes.
          </div>
        )}

        {activeRun?.areas_ha && ['done', 'low_confidence'].includes(activeRun.status) && (
          <div className="row gap-2" style={{ marginTop: 14, flexWrap: 'wrap' }}>
            {[
              ['Deforestation', activeRun.areas_ha.deforestation, 'var(--change-deforestation)'],
              ['Encroachment', activeRun.areas_ha.encroachment, 'var(--change-encroachment)'],
              ['Agri. encr.', activeRun.areas_ha.agri_in_forest, 'var(--change-agri)'],
              ['Tree → bare', activeRun.areas_ha.tree_to_bare, 'var(--change-bare)'],
            ].map(([label, val, color]) => (
              <div key={label} className="card" style={{ flex: '1 1 45%', padding: 10, borderLeft: `3px solid ${color}` }}>
                <div className="t-mono" style={{ fontSize: 16, fontWeight: 700 }}>{(val || 0).toFixed(2)}</div>
                <div className="t-eyebrow" style={{ fontSize: 9 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {previewLoading && !landCover && <div style={{ marginTop: 14 }}><SkeletonLines count={4} /></div>}
        {landCover && <LandCover {...landCover} />}

        {runHistory?.length > 0 && (
          <div className="card card-pad" style={{ marginTop: 14 }}>
            <h3 className="t-card-title" style={{ marginBottom: 10 }}>Detection history</h3>
            <div className="col gap-2">
              {runHistory.slice(0, 5).map(r => (
                <div key={r.id} className="row-between t-small">
                  <span className="t-mono t-muted">{fmtDate(r.run_at, { year: undefined })}</span>
                  <span className={`badge badge-${r.status === 'done' ? 'low' : r.status === 'failed' ? 'critical' : 'medium'}`}>{r.status}</span>
                  <span className="t-mono">{fmtHa(r.any_change_ha)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
