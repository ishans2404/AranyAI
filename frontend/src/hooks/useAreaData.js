import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'

/**
 * Centralizes everything one AOI's workspace needs: detail, fast preview,
 * the active/most-recent detection run (with polling), alerts, sites,
 * precision, and run history. Used once per AOI selection by
 * AreaWorkspaceLayout, then shared between the Monitor and Alerts tabs
 * via React Router's Outlet context — switching tabs never re-fetches.
 */
export function useAreaData(aoiId) {
  const [aoi, setAoi] = useState(null)
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [activeRun, setActiveRun] = useState(null)
  const [tiles, setTiles] = useState(null)
  const [vectors, setVectors] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [sites, setSites] = useState([])
  const [precision, setPrecision] = useState(null)
  const [runHistory, setRunHistory] = useState([])
  const [polling, setPolling] = useState(false)
  const [loading, setLoading] = useState(true)

  // Mirrors the in-flight run id so the polling interval's closure always
  // reads the current value — fixes the GET /api/runs/undefined loop that
  // happens if state goes stale between renders.
  const pollRunIdRef = useRef(null)

  const refreshSecondary = useCallback(async () => {
    const [alertsData, sitesData, historyData, precisionData] = await Promise.all([
      api.listAlerts({ aoi_id: aoiId }),
      api.listSites({ aoi_id: aoiId }),
      api.listRuns(aoiId),
      api.getAoiPrecision(aoiId),
    ])
    setAlerts(alertsData)
    setSites(sitesData)
    setRunHistory(historyData)
    setPrecision(precisionData)
  }, [aoiId])

  /* ── Load everything when the AOI changes ───────────────────────── */
  useEffect(() => {
    if (!aoiId) return
    setLoading(true)
    setTiles(null); setVectors(null); setActiveRun(null); setPreview(null)
    pollRunIdRef.current = null
    setPolling(false)

    Promise.all([api.getAoi(aoiId), refreshSecondary()])
      .then(([aoiData]) => setAoi(aoiData))
      .catch(err => console.error('Area workspace load failed:', err))
      .finally(() => setLoading(false))

    setPreviewLoading(true)
    api.previewAoi(aoiId)
      .then(setPreview)
      .catch(err => console.error('Preview load failed:', err))
      .finally(() => setPreviewLoading(false))
  }, [aoiId, refreshSecondary])

  /* ── Poll the active run every 5s while one is in flight ─────────── */
  useEffect(() => {
    if (!polling) return
    const tick = async () => {
      const runId = pollRunIdRef.current
      if (!runId) return
      try {
        const run = await api.getRun(runId)
        setActiveRun(run)
        if (['done', 'low_confidence'].includes(run.status)) {
          setPolling(false)
          pollRunIdRef.current = null
          const [tilesData, vectorsData] = await Promise.all([
            api.getRunTiles(run.id),
            api.getRunVectors(run.id),
          ])
          setTiles(tilesData)
          setVectors(vectorsData)
          await refreshSecondary()
        } else if (run.status === 'failed') {
          setPolling(false)
          pollRunIdRef.current = null
        }
      } catch (err) {
        console.error('Run poll failed:', err)
      }
    }
    const timer = setInterval(tick, 5000)
    return () => clearInterval(timer)
  }, [polling, refreshSecondary])

  const triggerDetect = useCallback(async (mode = 'nrt') => {
    if (polling) return
    const run = await api.triggerDetect(aoiId, { mode })
    pollRunIdRef.current = run.run_id
    setActiveRun({ id: run.run_id, status: 'running' })
    setPolling(true)
    setTiles(null); setVectors(null)
  }, [aoiId, polling])

  const updateAlert = useCallback(async (alertId, updates) => {
    await api.updateAlert(alertId, updates)
    await refreshSecondary()
  }, [refreshSecondary])

  return {
    aoi, loading,
    preview, previewLoading,
    activeRun, polling, triggerDetect,
    tiles, vectors,
    alerts, sites, precision, runHistory,
    updateAlert,
  }
}
