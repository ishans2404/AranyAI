export function fmtDate(d, opts = {}) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', ...opts,
  })
}

export function fmtHa(v) {
  return v == null ? '—' : `${Number(v).toFixed(2)} ha`
}

export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
}

/** Minimal client-side CSV export — no server PDF/report pipeline exists yet
 *  (see ARCHITECTURE.md §12 Post-MVP Additions: WeasyPrint+Jinja2 PDF
 *  reports are a backend task). This covers the tabular case for now. */
export function downloadCsv(filename, rows) {
  if (!rows || rows.length === 0) return
  const headers = Object.keys(rows[0])
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [headers.join(',')]
    .concat(rows.map(r => headers.map(h => escape(r[h])).join(',')))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
