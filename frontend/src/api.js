/**
 * AranyAI API client.
 * All requests go to /api/... which Vite proxies to the FastAPI backend.
 */

async function req(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

/** Compute NRT date windows relative to today (client-side). */
export function nrtWindows(windowDays = 15) {
  const today = new Date()
  const sub   = (d, n) => { const r = new Date(d); r.setDate(r.getDate() - n); return r }
  const fmt   = d => d.toISOString().split('T')[0]
  return {
    mode:           'nrt',
    current_end:    fmt(today),
    current_start:  fmt(sub(today, windowDays)),
    baseline_end:   fmt(sub(today, windowDays)),
    baseline_start: fmt(sub(today, windowDays * 2)),
  }
}

export const api = {
  health:           ()              => req('GET',   '/health'),

  // AOIs
  listAois:         ()              => req('GET',   '/api/aois'),
  getAoi:           (id)            => req('GET',   `/api/aois/${id}`),
  createAoi:        (body)          => req('POST',  '/api/aois', body),
  previewAoi:       (id, days)      => req('GET',   `/api/aois/${id}/preview${days ? `?days=${days}` : ''}`),

  // Detection
  triggerDetect:    (aoiId, body)   => req('POST',  `/api/aois/${aoiId}/detect`, body),
  listRuns:         (aoiId)         => req('GET',   `/api/aois/${aoiId}/runs`),
  getRun:           (runId)         => req('GET',   `/api/runs/${runId}`),
  getRunTiles:      (runId, fresh)  => req('GET',   `/api/runs/${runId}/tiles${fresh ? '?refresh=true' : ''}`),
  getRunVectors:    (runId)         => req('GET',   `/api/runs/${runId}/vectors`),

  // Alerts
  listAlerts:       (params = {})   => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
    ).toString()
    return req('GET', `/api/alerts${q ? `?${q}` : ''}`)
  },
  updateAlert:      (id, body)      => req('PATCH', `/api/alerts/${id}`, body),
}
