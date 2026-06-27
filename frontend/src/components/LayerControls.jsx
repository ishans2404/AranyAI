const PANEL = {
  position: 'absolute', bottom: '36px', left: '12px', zIndex: 100,
  background: '#FFFFFF', border: '1px solid #D1D5DB',
  // Level-2 elevation — matches var(--shadow-md) in index.css.
  // Kept as a literal here since this panel uses inline styles, not a
  // CSS class; see AranyAI_DESIGN_SYSTEM.md §6 for the elevation scale.
  borderRadius: '4px',
  boxShadow: '0 4px 6px rgba(0,0,0,.06), 0 2px 4px rgba(0,0,0,.06)',
  width: '210px', overflow: 'hidden', fontFamily: "'Inter','Noto Sans',system-ui,sans-serif",
}
const HEAD = {
  background: '#F9FAFB', borderBottom: '1px solid #E5E7EB',
  padding: '7px 10px', fontSize: '10px', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '.8px', color: '#1A3C6E',
}
const BODY = { padding: '10px 10px 12px' }
const SUBLABEL = {
  fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '.5px', color: '#6B7280', marginBottom: '6px', display: 'block',
}
const ROW = {
  display: 'flex', alignItems: 'center', gap: '7px',
  marginBottom: '5px', cursor: 'pointer', fontSize: '12px', color: '#374151',
  userSelect: 'none',
}
const HR = { border: 'none', borderTop: '1px solid #E5E7EB', margin: '8px 0' }

const DW_LEGEND = [
  ['#397d49','Trees / Forest'],
  ['#88b053','Grassland'],
  ['#e49635','Crops'],
  ['#c4281b','Built-up'],
  ['#a59b8f','Bare Soil'],
  ['#419bdf','Water'],
]

const CHANGE_LEGEND = [
  ['#B91C1C','Deforestation'],
  ['#C2410C','Encroachment'],
  ['#A16207','Agri. Encroachment'],
  ['#6D28D9','Tree → Bare'],
]

const SITE_LEGEND = [
  ['#991B1B','Open alert — needs review'],
  ['#9CA3AF','Candidate — forming'],
  ['#15803D','Resolved'],
]

function LegendRows({ items }) {
  return items.map(([color, label]) => (
    <div key={label} style={{ display:'flex', alignItems:'center', gap:'6px',
                              fontSize:'11px', color:'#4B5563', marginBottom:'3px' }}>
      <span style={{ width:10, height:10, background:color,
                     display:'inline-block', borderRadius:2, flexShrink:0 }} />
      {label}
    </div>
  ))
}

export default function LayerControls({ layers, onChange, hasTiles, hasPreview, hasSites }) {
  /* Nothing to control until either a preview, sites, or a full run exists */
  if (!hasTiles && !hasPreview && !hasSites) return null

  const set = patch => onChange(prev => ({ ...prev, ...patch }))

  /* ── Simplified panel: preview only, no detection run yet ──────── */
  if (!hasTiles && hasPreview) {
    return (
      <div style={PANEL}>
        <div style={HEAD}>Land Cover Preview</div>
        <div style={BODY}>
          <label style={ROW}>
            <input
              type="checkbox" checked={layers.dw ?? true}
              onChange={e => set({ dw: e.target.checked })}
              style={{ accentColor: '#1A3C6E' }}
            />
            Show DW Classification
          </label>
          {hasSites && (
            <label style={ROW}>
              <input
                type="checkbox" checked={layers.sites ?? true}
                onChange={e => set({ sites: e.target.checked })}
                style={{ accentColor: '#1A3C6E' }}
              />
              Show Alert Sites
            </label>
          )}
          <hr style={HR} />
          <span style={SUBLABEL}>DW Class Legend</span>
          <LegendRows items={DW_LEGEND} />
          {hasSites && (
            <>
              <hr style={HR} />
              <span style={SUBLABEL}>Site Status</span>
              <LegendRows items={SITE_LEGEND} />
            </>
          )}
          <hr style={HR} />
          <p style={{ fontSize: 10, color: '#9CA3AF', lineHeight: 1.5, margin: 0 }}>
            Quick preview — last 30 days. Run detection for change polygons
            and before/after imagery.
          </p>
        </div>
      </div>
    )
  }

  /* ── Full panel: detection run completed ────────────────────────── */
  return (
    <div style={PANEL}>
      <div style={HEAD}>Layer Controls</div>
      <div style={BODY}>

        {/* ── Satellite Imagery ─────────────────────────────────── */}
        <span style={SUBLABEL}>Satellite Imagery</span>
        {[
          { val: 'satellite', label: 'Current (Mapbox)' },
          { val: 'before',    label: 'Before Detection'  },
          { val: 'after',     label: 'After Detection'   },
        ].map(({ val, label }) => (
          <label key={val} style={ROW}>
            <input
              type="radio" name="aranyai-imagery" value={val}
              checked={layers.imagery === val}
              onChange={() => set({ imagery: val })}
              style={{ accentColor: '#1A3C6E' }}
            />
            {label}
          </label>
        ))}

        <hr style={HR} />

        {/* ── Overlays ─────────────────────────────────────────── */}
        <span style={SUBLABEL}>Classification Overlays</span>

        <label style={ROW}>
          <input
            type="checkbox" checked={layers.dw ?? true}
            onChange={e => set({ dw: e.target.checked })}
            style={{ accentColor: '#1A3C6E' }}
          />
          DW Classification Mask
        </label>

        <label style={ROW}>
          <input
            type="checkbox" checked={layers.changes ?? true}
            onChange={e => set({ changes: e.target.checked })}
            style={{ accentColor: '#1A3C6E' }}
          />
          Change Polygons
        </label>

        {hasSites && (
          <label style={ROW}>
            <input
              type="checkbox" checked={layers.sites ?? true}
              onChange={e => set({ sites: e.target.checked })}
              style={{ accentColor: '#1A3C6E' }}
            />
            Alert Sites
          </label>
        )}

        {/* ── DW Legend ─────────────────────────────────────────── */}
        {layers.dw && (
          <>
            <hr style={HR} />
            <span style={{ ...SUBLABEL, marginBottom: '5px' }}>DW Class Legend</span>
            <LegendRows items={DW_LEGEND} />
          </>
        )}

        {/* ── Change Type Legend ────────────────────────────────── */}
        {layers.changes && (
          <>
            <hr style={HR} />
            <span style={{ ...SUBLABEL, marginBottom: '5px' }}>Change Types</span>
            <LegendRows items={CHANGE_LEGEND} />
          </>
        )}

        {/* ── Site Status Legend ───────────────────────────────── */}
        {hasSites && layers.sites && (
          <>
            <hr style={HR} />
            <span style={{ ...SUBLABEL, marginBottom: '5px' }}>Site Status</span>
            <LegendRows items={SITE_LEGEND} />
          </>
        )}

      </div>
    </div>
  )
}