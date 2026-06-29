/**
 * Renders the SAME data two ways from one column config:
 *   - a normal <table> at ≥768px
 *   - a stacked card list at <768px (mobile-ui-optimization skill,
 *     MOBILE_TABLES.md Technique 6 — "Card View Pattern ★ Primary")
 *
 * Both markups render at once; CSS (.responsive-table-desktop /
 * .responsive-table-mobile in components.css) shows only one per
 * breakpoint. No JS viewport detection, no resize listeners, no
 * hydration mismatch — just a media query.
 *
 * columns: [{ key, label, render?(row), primary?: bool, mono?: bool }]
 *   - `primary` marks the column used as the card header (defaults to
 *     the first column). Every other column becomes a label/value row
 *     in the card body — nothing is hidden, per "do not remove from
 *     what's already implemented": these tables are 4-8 fields, not
 *     dense enough to need progressive disclosure on top of the card
 *     transform itself.
 */
export default function ResponsiveTable({ columns, rows, rowKey, onRowClick, emptyState }) {
  if (!rows || rows.length === 0) return emptyState || null

  const keyOf = (r, i) => (typeof rowKey === 'function' ? rowKey(r) : r[rowKey]) ?? i
  const primaryCol = columns.find(c => c.primary) || columns[0]
  const restCols = columns.filter(c => c !== primaryCol)
  const cell = (c, r) => (c.render ? c.render(r) : r[c.key])

  return (
    <>
      <div className="table-wrap responsive-table-desktop">
        <table className="table">
          <thead>
            <tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={keyOf(r, i)} onClick={onRowClick ? () => onRowClick(r) : undefined} style={onRowClick ? { cursor: 'pointer' } : undefined}>
                {columns.map(c => <td key={c.key} className={c.mono ? 't-mono' : undefined}>{cell(c, r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card-list responsive-table-mobile">
        {rows.map((r, i) => (
          <div
            key={keyOf(r, i)}
            className={`row-card ${onRowClick ? 'tappable' : ''}`}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
          >
            <div className="row-card-header">{cell(primaryCol, r)}</div>
            <div className="row-card-body">
              {restCols.map(c => (
                <div key={c.key} className="row-card-field">
                  <span className="row-card-label">{c.label}</span>
                  <span className={`row-card-value ${c.mono ? 't-mono' : ''}`}>{cell(c, r)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
