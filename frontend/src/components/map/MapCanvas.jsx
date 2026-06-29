import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { CHANGE_TYPES } from '../../lib/dw'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

function whenReady(map, fn) {
  if (map.isStyleLoaded()) fn()
  else map.once('load', fn)
}

const SITE_STATUS_COLOR = {
  candidate: '#9C9580', open: '#BC6C25', resolved: '#283618', false_alarm: '#C9C2A0',
}

function popupHtml(title, body) {
  return `
    <div style="font-family:'Inter',sans-serif;font-size:12px;padding:2px 0">
      <strong style="color:#283618;text-transform:capitalize">${title}</strong><br/>
      <span style="color:#5B604D">${body}</span>
    </div>
  `
}

export default function MapCanvas({ aoi, tiles, preview, vectors, sites, layers }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/satellite-v9',
      center: [82.03, 20.33],
      zoom: 11,
      attributionControl: false,
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-right')
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    mapRef.current = map

    // Mapbox freezes canvas size at construction; the workspace shell is
    // flexbox-driven so the container can resize after first paint.
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(containerRef.current)

    return () => { ro.disconnect(); map.remove(); mapRef.current = null }
  }, [])

  /* AOI boundary — always re-fit on change */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !aoi) return
    whenReady(map, () => {
      const data = { type: 'Feature', geometry: aoi }
      if (map.getSource('aoi')) {
        map.getSource('aoi').setData(data)
      } else {
        map.addSource('aoi', { type: 'geojson', data })
        map.addLayer({ id: 'aoi-fill', type: 'fill', source: 'aoi', paint: { 'fill-color': '#283618', 'fill-opacity': 0.05 } })
        map.addLayer({ id: 'aoi-line', type: 'line', source: 'aoi', paint: { 'line-color': '#BC6C25', 'line-width': 2, 'line-dasharray': [3, 2] } })
      }
      const coords = aoi.type === 'Polygon' ? aoi.coordinates[0] : aoi.coordinates[0][0]
      const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]))
      map.fitBounds(bounds, { padding: 60, duration: 1000 })
    })
  }, [aoi])

  /* Preview layer — shown before a full run completes */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    whenReady(map, () => {
      const id = 'preview-dw'
      const url = preview?.dw_tile_url
      if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(id)) map.removeSource(id)
      if (!url || tiles) return
      map.addSource(id, { type: 'raster', tiles: [url], tileSize: 256 })
      map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': layers?.dw ?? true ? 0.55 : 0 } },
        map.getLayer('aoi-line') ? 'aoi-line' : undefined)
    })
  }, [preview, tiles])

  /* Full detection raster layers */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const removeRaster = id => { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id) }

    whenReady(map, () => {
      if (!tiles) { removeRaster('dw-label'); removeRaster('s2-before'); removeRaster('s2-after'); return }
      const addRaster = (id, url, opacity) => {
        if (!url) return
        removeRaster(id)
        map.addSource(id, { type: 'raster', tiles: [url], tileSize: 256 })
        map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': opacity } },
          map.getLayer('aoi-line') ? 'aoi-line' : undefined)
      }
      removeRaster('preview-dw')
      addRaster('dw-label', tiles.dw_label, 0.70)
      addRaster('s2-before', tiles.before_s2, 0)
      addRaster('s2-after', tiles.after_s2, 0)
    })
  }, [tiles])

  /* Change-cluster vectors */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    whenReady(map, () => {
      if (!vectors) {
        if (map.getLayer('changes-fill')) map.removeLayer('changes-fill')
        if (map.getLayer('changes-line')) map.removeLayer('changes-line')
        if (map.getSource('changes')) map.removeSource('changes')
        return
      }
      if (map.getSource('changes')) { map.getSource('changes').setData(vectors); return }
      map.addSource('changes', { type: 'geojson', data: vectors })
      map.addLayer({ id: 'changes-fill', type: 'fill', source: 'changes', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.28 } })
      map.addLayer({ id: 'changes-line', type: 'line', source: 'changes', paint: { 'line-color': ['get', 'color'], 'line-width': 1.5 } })
      map.on('click', 'changes-fill', e => {
        const p = e.features[0].properties
        new mapboxgl.Popup({ closeButton: false, maxWidth: '220px' })
          .setLngLat(e.lngLat)
          .setHTML(popupHtml((p.change_type || '').replace(/_/g, ' '), `${Number(p.area_ha || 0).toFixed(1)} ha`))
          .addTo(map)
      })
      map.on('mouseenter', 'changes-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'changes-fill', () => { map.getCanvas().style.cursor = '' })
    })
  }, [vectors])

  /* Persistent sites layer */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    whenReady(map, () => {
      if (!sites || sites.length === 0) {
        if (map.getLayer('sites-fill')) map.removeLayer('sites-fill')
        if (map.getLayer('sites-line')) map.removeLayer('sites-line')
        if (map.getSource('sites')) map.removeSource('sites')
        return
      }
      const fc = {
        type: 'FeatureCollection',
        features: sites.map(s => ({
          type: 'Feature', geometry: s.geojson,
          properties: { id: s.id, status: s.status, change_type: s.change_type, persistence_count: s.persistence_count, color: SITE_STATUS_COLOR[s.status] || '#9C9580' },
        })),
      }
      if (map.getSource('sites')) { map.getSource('sites').setData(fc); return }
      map.addSource('sites', { type: 'geojson', data: fc })
      map.addLayer({ id: 'sites-fill', type: 'fill', source: 'sites', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.30 } })
      map.addLayer({
        id: 'sites-line', type: 'line', source: 'sites',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['match', ['get', 'status'], 'open', 2, 1.2],
          'line-dasharray': ['match', ['get', 'status'], 'candidate', ['literal', [2, 2]], ['literal', [1, 0]]],
        },
      })
      map.on('click', 'sites-fill', e => {
        const p = e.features[0].properties
        const body = p.status === 'candidate' ? `Forming \u00b7 pass ${p.persistence_count}/2` : `Status: ${p.status} \u00b7 ${p.persistence_count} pass(es)`
        new mapboxgl.Popup({ closeButton: false, maxWidth: '220px' })
          .setLngLat(e.lngLat)
          .setHTML(popupHtml((p.change_type || '').replace(/_/g, ' '), body))
          .addTo(map)
      })
      map.on('mouseenter', 'sites-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'sites-fill', () => { map.getCanvas().style.cursor = '' })
    })
  }, [sites])

  /* Layer visibility / opacity */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !layers || !map.isStyleLoaded()) return
    const setOp = (id, v) => { if (map.getLayer(id)) map.setPaintProperty(id, 'raster-opacity', v) }
    const setVis = (id, v) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none') }
    setOp('dw-label', layers.dw ? 0.70 : 0)
    setOp('preview-dw', layers.dw ? 0.55 : 0)
    setVis('changes-fill', layers.changes ?? true); setVis('changes-line', layers.changes ?? true)
    setVis('sites-fill', layers.sites ?? true); setVis('sites-line', layers.sites ?? true)
    setOp('s2-before', layers.imagery === 'before' ? 0.95 : 0)
    setOp('s2-after', layers.imagery === 'after' ? 0.95 : 0)
  }, [layers])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}

export { CHANGE_TYPES }
