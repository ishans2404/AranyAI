/**
 * AranyAI API client. Requests go to /api/... which Vite proxies to the
 * FastAPI backend (see vite.config.js). Endpoint surface matches
 * backend/main.py exactly — nothing added or renamed here.
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

function toQuery(params = {}) {
  return new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
  ).toString()
}

export const api = {
  health: () => req('GET', '/health'),

  // AOIs
  listAois:   () => req('GET', '/api/aois'),
  getAoi:     (id) => req('GET', `/api/aois/${id}`),
  createAoi:  (body) => req('POST', '/api/aois', body),
  previewAoi: (id, days) => req('GET', `/api/aois/${id}/preview${days ? `?days=${days}` : ''}`),

  // Detection
  triggerDetect: (aoiId, body) => req('POST', `/api/aois/${aoiId}/detect`, body),
  listRuns:      (aoiId) => req('GET', `/api/aois/${aoiId}/runs`),
  getRun:        (runId) => req('GET', `/api/runs/${runId}`),
  getRunTiles:   (runId, fresh) => req('GET', `/api/runs/${runId}/tiles${fresh ? '?refresh=true' : ''}`),
  getRunVectors: (runId) => req('GET', `/api/runs/${runId}/vectors`),

  // Alerts
  listAlerts: (params = {}) => {
    const q = toQuery(params)
    return req('GET', `/api/alerts${q ? `?${q}` : ''}`)
  },
  updateAlert: (id, body) => req('PATCH', `/api/alerts/${id}`, body),

  // Sites
  listSites:       (params = {}) => {
    const q = toQuery(params)
    return req('GET', `/api/sites${q ? `?${q}` : ''}`)
  },
  getSite:         (id) => req('GET', `/api/sites/${id}`),
  getAoiPrecision: (aoiId) => req('GET', `/api/aois/${aoiId}/precision`),

  // Rangers
  listRangers:  () => req('GET', '/api/rangers'),
  assignRanger: (body) => req('POST', '/api/rangers/assign', body),
}
