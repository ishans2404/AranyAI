import { useState } from 'react'
import { ChevronDown, ChevronUp, Layers } from 'lucide-react'
import { DW_CLASSES } from '../../lib/dw'

const SITE_LEGEND = [
  ['#BC6C25', 'Open — needs review'],
  ['#9C9580', 'Candidate — forming'],
  ['#283618', 'Resolved'],
]

function LegendRow({ color, label }) {
  return (
    <div className="row gap-2" style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 4 }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0 }} />
      {label}
    </div>
  )
}

export default function LayerPanel({ layers, onChange, hasTiles, hasPreview, hasSites }) {
  const [open, setOpen] = useState(true)
  if (!hasTiles && !hasPreview && !hasSites) return null
  const set = (patch) => onChange(prev => ({ ...prev, ...patch }))

  return (
    <div className="layer-panel">
      <button className="layer-panel-toggle" onClick={() => setOpen(o => !o)}>
        <span className="row gap-2"><Layers size={13} /> Layers</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="layer-panel-body">
          {hasTiles && (
            <div className="col gap-2" style={{ marginBottom: 12 }}>
              {[['satellite', 'Current imagery'], ['before', 'Before detection'], ['after', 'After detection']].map(([val, label]) => (
                <label key={val} className={`pill-toggle ${layers.imagery === val ? 'checked' : ''}`} style={{ width: '100%' }}>
                  <input type="radio" name="imagery" checked={layers.imagery === val} onChange={() => set({ imagery: val })} />
                  <span className="dot" /> {label}
                </label>
              ))}
            </div>
          )}

          <div className="col gap-2">
            <label className={`pill-toggle ${layers.dw ? 'checked' : ''}`} style={{ width: '100%' }}>
              <input type="checkbox" checked={!!layers.dw} onChange={e => set({ dw: e.target.checked })} />
              <span className="dot" /> Land cover classification
            </label>
            {hasTiles && (
              <label className={`pill-toggle ${layers.changes ? 'checked' : ''}`} style={{ width: '100%' }}>
                <input type="checkbox" checked={!!layers.changes} onChange={e => set({ changes: e.target.checked })} />
                <span className="dot" /> Change clusters
              </label>
            )}
            {hasSites && (
              <label className={`pill-toggle ${layers.sites ? 'checked' : ''}`} style={{ width: '100%' }}>
                <input type="checkbox" checked={!!layers.sites} onChange={e => set({ sites: e.target.checked })} />
                <span className="dot" /> Alert sites
              </label>
            )}
          </div>

          {layers.dw && (
            <>
              <hr className="divider" style={{ margin: '10px 0' }} />
              <div className="t-eyebrow" style={{ marginBottom: 6 }}>Land cover</div>
              {DW_CLASSES.filter(c => ['trees', 'grass', 'crops', 'built', 'bare', 'water'].includes(c.key)).map(c => (
                <LegendRow key={c.key} color={c.color} label={c.label} />
              ))}
            </>
          )}

          {hasSites && layers.sites && (
            <>
              <hr className="divider" style={{ margin: '10px 0' }} />
              <div className="t-eyebrow" style={{ marginBottom: 6 }}>Site status</div>
              {SITE_LEGEND.map(([color, label]) => <LegendRow key={label} color={color} label={label} />)}
            </>
          )}

          {!hasTiles && hasPreview && (
            <p className="t-small t-faint" style={{ marginTop: 10, lineHeight: 1.5 }}>
              Quick preview — last 30 days. Run detection for change polygons and before/after imagery.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
