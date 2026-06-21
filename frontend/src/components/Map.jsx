import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

/** Run fn now if style is loaded, otherwise wait for 'load' event. */
function whenReady(map, fn) {
  if (map.isStyleLoaded()) fn()
  else map.once('load', fn)
}

export default function Map({ aoi, tiles, preview, vectors, layers }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)

  /* ── Initialise map (once) ─────────────────────────────────────── */
  useEffect(() => {
    const map = new mapboxgl.Map({
      container:        containerRef.current,
      style:            'mapbox://styles/mapbox/satellite-v9',
      center:           [82.03, 20.33],
      zoom:             11,
      attributionControl: false,
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-right')
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    mapRef.current = map

    // Mapbox GL freezes its internal canvas size at construction time and
    // never re-measures on its own. Our layout is flexbox-driven (header
    // height, side-panel width, responsive breakpoints), so the container
    // can resize AFTER the map is created — without this, the canvas stays
    // whatever size it was at the first paint and the rest of the
    // .map-pane div renders as blank white space below/beside it.
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(containerRef.current)

    return () => { ro.disconnect(); map.remove(); mapRef.current = null }
  }, [])

  /* ── AOI boundary ──────────────────────────────────────────────── */
  /* Always re-fit the map to the new AOI, even when the source already */
  /* exists from a previous selection — previously this returned early  */
  /* on every AOI switch after the first and silently skipped fitBounds. */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !aoi) return
    whenReady(map, () => {
      const data = { type: 'Feature', geometry: aoi }
      if (map.getSource('aoi')) {
        map.getSource('aoi').setData(data)
      } else {
        map.addSource('aoi', { type: 'geojson', data })
        map.addLayer({
          id: 'aoi-fill', type: 'fill', source: 'aoi',
          paint: { 'fill-color': '#1A3C6E', 'fill-opacity': 0.06 },
        })
        map.addLayer({
          id: 'aoi-line', type: 'line', source: 'aoi',
          paint: { 'line-color': '#2563A8', 'line-width': 2, 'line-dasharray': [4, 2] },
        })
      }
      /* Fly to AOI — runs on every change, not just the first */
      const coords = aoi.type === 'Polygon'
        ? aoi.coordinates[0]
        : aoi.coordinates[0][0]
      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new mapboxgl.LngLatBounds(coords[0], coords[0])
      )
      map.fitBounds(bounds, { padding: 60, duration: 1000 })
    })
  }, [aoi])

  /* ── Preview layer (shown before a full detection run completes) ─ */
  /* Quick land-cover snapshot from GET /api/aois/{id}/preview.       */
  /* Removed once full detection `tiles` arrive — see effect below.  */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    whenReady(map, () => {
      const id  = 'preview-dw'
      const url = preview?.dw_tile_url

      if (map.getLayer(id))  map.removeLayer(id)
      if (map.getSource(id)) map.removeSource(id)
      if (!url || tiles) return   // don't show preview once real results exist

      map.addSource(id, { type: 'raster', tiles: [url], tileSize: 256 })
      map.addLayer({
        id, type: 'raster', source: id,
        paint: { 'raster-opacity': layers?.dw ?? true ? 0.55 : 0 },
      }, map.getLayer('aoi-line') ? 'aoi-line' : undefined)
    })
  }, [preview, tiles])

  /* ── GEE raster tile layers (full detection results) ────────────── */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const removeRaster = id => {
      if (map.getLayer(id))  map.removeLayer(id)
      if (map.getSource(id)) map.removeSource(id)
    }

    whenReady(map, () => {
      if (!tiles) {
        // AOI switched away from the run these tiles belonged to —
        // remove them so the previous AOI's imagery doesn't linger.
        removeRaster('dw-label')
        removeRaster('s2-before')
        removeRaster('s2-after')
        return
      }

      const addRaster = (id, url, opacity) => {
        if (!url) return
        removeRaster(id)
        map.addSource(id, { type: 'raster', tiles: [url], tileSize: 256 })
        // Insert below AOI boundary so the boundary stays on top
        map.addLayer(
          { id, type: 'raster', source: id, paint: { 'raster-opacity': opacity } },
          map.getLayer('aoi-line') ? 'aoi-line' : undefined
        )
      }

      // Remove the preview layer now that real results have arrived
      removeRaster('preview-dw')

      addRaster('dw-label',  tiles.dw_label,  0.70)
      addRaster('s2-before', tiles.before_s2, 0)   // hidden; toggled via layers prop
      addRaster('s2-after',  tiles.after_s2,  0)   // hidden; toggled via layers prop
    })
  }, [tiles])

  /* ── Change-detection polygon vectors ─────────────────────────── */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    whenReady(map, () => {
      if (!vectors) {
        if (map.getLayer('changes-fill')) map.removeLayer('changes-fill')
        if (map.getLayer('changes-line')) map.removeLayer('changes-line')
        if (map.getSource('changes'))     map.removeSource('changes')
        return
      }
      if (map.getSource('changes')) {
        map.getSource('changes').setData(vectors)
        return
      }
      map.addSource('changes', { type: 'geojson', data: vectors })
      map.addLayer({
        id: 'changes-fill', type: 'fill', source: 'changes',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.28 },
      })
      map.addLayer({
        id: 'changes-line', type: 'line', source: 'changes',
        paint: { 'line-color': ['get', 'color'], 'line-width': 1.5 },
      })

      /* Click popup */
      map.on('click', 'changes-fill', e => {
        const p = e.features[0].properties
        new mapboxgl.Popup({ closeButton: false, maxWidth: '240px' })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family:'Inter',sans-serif;font-size:12px;padding:2px 0">
              <strong style="color:#0F2B52;text-transform:capitalize">
                ${(p.change_type || '').replace(/_/g, ' ')}
              </strong><br/>
              <span style="color:#6B7280">
                Area: <b>${Number(p.area_ha || 0).toFixed(1)} ha</b>
              </span>
            </div>
          `)
          .addTo(map)
      })
      map.on('mouseenter', 'changes-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'changes-fill', () => { map.getCanvas().style.cursor = '' })
    })
  }, [vectors])

  /* ── Layer visibility / opacity controlled by LayerControls ────── */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !layers || !map.isStyleLoaded()) return

    const setOp  = (id, v) => { if (map.getLayer(id)) map.setPaintProperty(id,  'raster-opacity', v) }
    const setVis = (id, v) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none') }

    setOp('dw-label',   layers.dw ? 0.70 : 0)
    setOp('preview-dw', layers.dw ? 0.55 : 0)
    setVis('changes-fill', layers.changes ?? true)
    setVis('changes-line', layers.changes ?? true)

    /* Imagery mode — toggle which S2 raster is shown */
    setOp('s2-before', layers.imagery === 'before' ? 0.95 : 0)
    setOp('s2-after',  layers.imagery === 'after'  ? 0.95 : 0)
  }, [layers])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    />
  )
}
