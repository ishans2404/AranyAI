import { useState, useEffect, useCallback, useRef } from 'react'
import Map from './components/Map'
import AlertPanel from './components/AlertPanel'
import LayerControls from './components/LayerControls'
import RoleSwitcher from './components/RoleSwitcher'
import { api, nrtWindows } from './api'

export default function App() {
  const [aois,          setAois]          = useState([])
  const [rangers,       setRangers]       = useState([])    // [{name, aoi_ids}]
  const [viewMode,      setViewMode]      = useState('admin') // 'admin' | ranger name
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

  // Ref mirrors the in-flight run id so the polling interval's closure
  // always reads the latest value, even if React batches/replaces state
  // in ways that would otherwise leave an old closure stale. This is the
  // single source of truth for "what run am I polling" — fixes the
  // GET /api/runs/undefined loop that happened when activeRun lost its
  // run_id mapping.
  const pollRunIdRef = useRef(null)

  // AOIs visible in the current view — admin sees all, a ranger view
  // sees only AOIs assigned to that ranger via /api/rangers.
  const visibleAois = viewMode === 'admin'
    ? aois
    : aois.filter(a => rangers.find(r => r.name === viewMode)?.aoi_ids.includes(a.id))

  /* ── Load AOI list + rangers on mount ───────────────────────────── */
  useEffect(() => {
    api.listAois()
      .then(data => {
        setAois(data)
        if (data.length > 0) setSelectedAoiId(data[0].id)
      })
      .catch(err => console.error('AOI load:', err))

    api.listRangers()
      .then(setRangers)
      .catch(err => console.error('Ranger load:', err))
  }, [])

  /* ── Keep selected AOI valid when switching views ───────────────── */
  useEffect(() => {
    if (visibleAois.length === 0) return
    if (!visibleAois.some(a => a.id === selectedAoiId)) {
      setSelectedAoiId(visibleAois[0].id)
    }
  }, [viewMode, rangers]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Load AOI detail when selection changes ─────────────────────── */
  useEffect(() => {
    if (!selectedAoiId) return
    setTiles(null); setVectors(null); setActiveRun(null); setPreview(null)
    pollRunIdRef.current = null
    setPolling(false)

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
  /* Reads pollRunIdRef.current at call time (not a stale closure), so   */
  /* it always polls the run actually in flight, never "undefined".     */
  useEffect(() => {
    if (!polling) return

    const poll = async () => {
      const runId = pollRunIdRef.current
      if (!runId) return   // nothing in flight — guard, never request /undefined

      try {
        const run = await api.getRun(runId)
        setActiveRun(run)

        if (['done', 'low_confidence'].includes(run.status)) {
          setPolling(false)
          pollRunIdRef.current = null
          const [tilesData, vectorsData, alertsData, historyData] = await Promise.all([
            api.getRunTiles(run.id),
            api.getRunVectors(run.id),
            api.listAlerts({ aoi_id: selectedAoiId, status: 'open' }),
            api.listRuns(selectedAoiId),
          ])
          setTiles(tilesData)
          setVectors(vectorsData)
          setAlerts(alertsData)
          setRunHistory(historyData)
        } else if (run.status === 'failed') {
          setPolling(false)
          pollRunIdRef.current = null
        }
      } catch (err) {
        console.error('Poll error:', err)
      }
    }

    const timer = setInterval(poll, 5000)
    return () => clearInterval(timer)
  }, [polling, selectedAoiId])

  /* ── Trigger NRT detection ──────────────────────────────────────── */
  const handleDetect = useCallback(async () => {
    if (!selectedAoiId || polling) return
    try {
      const run = await api.triggerDetect(selectedAoiId, nrtWindows())
      pollRunIdRef.current = run.run_id
      setActiveRun({ id: run.run_id, status: 'running' })
      setPolling(true)
      setTiles(null); setVectors(null)
    } catch (err) {
      alert('Detection trigger failed:\n' + err.message)
    }
  }, [selectedAoiId, polling])

  /* ── Update alert status / assign to a ranger ───────────────────── */
  const handleAlertUpdate = useCallback(async (alertId, updates) => {
    try {
      await api.updateAlert(alertId, updates)
      const updated = await api.listAlerts({ aoi_id: selectedAoiId, status: 'open' })
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
          <RoleSwitcher rangers={rangers} viewMode={viewMode} onChange={setViewMode} />
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
            {viewMode === 'admin' ? 'NRT Change Detection Dashboard' : `Ranger Dashboard — ${viewMode}`}
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
            aois={visibleAois}
            selectedAoiId={selectedAoiId}
            selectedAoi={selectedAoi}
            onSelectAoi={setSelectedAoiId}
            preview={preview}
            previewLoading={previewLoading}
            activeRun={activeRun}
            polling={polling}
            onDetect={handleDetect}
            alerts={alerts}
            rangers={viewMode === 'admin' ? rangers : []}
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