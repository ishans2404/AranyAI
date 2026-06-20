import { useState, useEffect, useCallback } from 'react'
import Map from './components/Map'
import AlertPanel from './components/AlertPanel'
import LayerControls from './components/LayerControls'
import { api, nrtWindows } from './api'

export default function App() {
  const [aois,          setAois]          = useState([])
  const [selectedAoiId, setSelectedAoiId] = useState(null)
  const [selectedAoi,   setSelectedAoi]   = useState(null)   // full record with geojson
  const [preview,       setPreview]       = useState(null)   // quick land-cover snapshot
  const [previewLoading,setPreviewLoading]= useState(false)
  const [activeRun,     setActiveRun]     = useState(null)
  const [tiles,         setTiles]         = useState(null)   // GEE tile URLs
  const [vectors,       setVectors]       = useState(null)   // change GeoJSON
  const [alerts,        setAlerts]        = useState([])
  const [runHistory,    setRunHistory]    = useState([])
  const [polling,       setPolling]       = useState(false)
  const [layers,        setLayers]        = useState({
    dw:      true,
    changes: true,
    imagery: 'satellite',   // 'satellite' | 'before' | 'after'
  })

  /* ── Load AOI list on mount ─────────────────────────────────────── */
  useEffect(() => {
    api.listAois()
      .then(data => {
        setAois(data)
        if (data.length > 0) setSelectedAoiId(data[0].id)
      })
      .catch(err => console.error('AOI load:', err))
  }, [])

  /* ── Load AOI detail when selection changes ─────────────────────── */
  useEffect(() => {
    if (!selectedAoiId) return
    setTiles(null); setVectors(null); setActiveRun(null); setPreview(null)
    Promise.all([
      api.getAoi(selectedAoiId),
      api.listAlerts({ aoi_id: selectedAoiId, status: 'open' }),
      api.listRuns(selectedAoiId),
    ]).then(([aoiData, alertsData, runsData]) => {
      setSelectedAoi(aoiData)
      setAlerts(alertsData)
      setRunHistory(runsData)
    }).catch(err => console.error('AOI detail load:', err))

    // Fast land-cover preview — no export task, shows context immediately
    setPreviewLoading(true)
    api.previewAoi(selectedAoiId)
      .then(setPreview)
      .catch(err => console.error('Preview load:', err))
      .finally(() => setPreviewLoading(false))
  }, [selectedAoiId])

  /* ── Poll active run every 5 seconds ────────────────────────────── */
  useEffect(() => {
    if (!polling || !activeRun) return
    const poll = async () => {
      try {
        const run = await api.getRun(activeRun.id)
        setActiveRun(run)
        if (['done', 'low_confidence'].includes(run.status)) {
          setPolling(false)
          // run already contains class_distribution and baseline_distribution
          // from GET /api/runs/{id} — update activeRun with the full record
          setActiveRun(run)
          const [tilesData, vectorsData, alertsData, historyData] = await Promise.all([
            api.getRunTiles(run.id),
            api.getRunVectors(run.id),
            api.listAlerts({ aoi_id: selectedAoiId }),
            api.listRuns(selectedAoiId),
          ])
          setTiles(tilesData)
          setVectors(vectorsData)
          setAlerts(alertsData)
          setRunHistory(historyData)
        } else if (run.status === 'failed') {
          setPolling(false)
        }
      } catch (err) { console.error('Poll error:', err) }
    }
    const timer = setInterval(poll, 5000)
    return () => clearInterval(timer)
  }, [polling, activeRun, selectedAoiId])

  /* ── Trigger NRT detection ──────────────────────────────────────── */
  const handleDetect = useCallback(async () => {
    if (!selectedAoiId || polling) return
    try {
      const run = await api.triggerDetect(selectedAoiId, nrtWindows())
      setActiveRun({ ...run, status: 'running' })
      setPolling(true)
      setTiles(null); setVectors(null)
    } catch (err) {
      alert('Detection trigger failed:\n' + err.message)
    }
  }, [selectedAoiId, polling])

  /* ── Update alert status ────────────────────────────────────────── */
  const handleAlertUpdate = useCallback(async (alertId, updates) => {
    try {
      await api.updateAlert(alertId, updates)
      const updated = await api.listAlerts({ aoi_id: selectedAoiId })
      setAlerts(updated)
    } catch (err) { console.error('Alert update:', err) }
  }, [selectedAoiId])

  return (
    <div className="app-shell">

      {/* ── Top Header ────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-emblem">🌳</div>
          <div className="brand-text">
            <div className="brand-name">AranyAI</div>
            <div className="brand-sub">Forest Change Detection &amp; Monitoring System</div>
          </div>
        </div>
        <div className="header-right">
          <div className="header-dept">
            <strong>Chhattisgarh Forest Department</strong>
            Government of Chhattisgarh, India
          </div>
          <span className="header-version">v0.1.0-POC</span>
        </div>
      </header>

      {/* ── Subbar ────────────────────────────────────────────────── */}
      <div className="app-subbar">
        <div className="breadcrumb">
          <span>Home</span><span className="sep">›</span>
          <span>Forest Monitoring</span><span className="sep">›</span>
          <span style={{ color: 'var(--navy-700)', fontWeight: 500 }}>
            NRT Change Detection Dashboard
          </span>
        </div>
        <div className="system-status">
          <div className="status-green" />
          System Operational &nbsp;·&nbsp; Google Earth Engine &nbsp;·&nbsp; Dynamic World V1 (10 m)
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────── */}
      <div className="app-body">

        {/* Map pane */}
        <div className="map-pane">
          <Map
            aoi={selectedAoi?.geojson}
            tiles={tiles}
            preview={preview}
            vectors={vectors}
            layers={layers}
          />
          <LayerControls
            layers={layers}
            onChange={setLayers}
            hasTiles={!!tiles}
            hasPreview={!!preview?.dw_tile_url}
          />
        </div>

        {/* Data panel */}
        <div className="side-panel">
          <AlertPanel
            aois={aois}
            selectedAoiId={selectedAoiId}
            selectedAoi={selectedAoi}
            onSelectAoi={setSelectedAoiId}
            preview={preview}
            previewLoading={previewLoading}
            activeRun={activeRun}
            polling={polling}
            onDetect={handleDetect}
            alerts={alerts}
            runHistory={runHistory}
            onAlertUpdate={handleAlertUpdate}
          />
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="app-footer">
        <span className="footer-text">
          © 2026 Chhattisgarh Forest Department · AranyAI Forest Monitoring Platform
        </span>
        <span className="footer-text">
          Powered by Google Earth Engine · Dynamic World V1 · Sentinel-2
        </span>
      </footer>

    </div>
  )
}
