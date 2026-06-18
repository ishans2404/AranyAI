# AranyAI — System Architecture Reference
> Paste this file into any AI assistant as full system context.
> Last updated: June 2026

---

## 1. Purpose

Near-real-time forest change detection and monitoring for the Chhattisgarh
Forest Department (India). Detects deforestation, encroachment, agricultural
misuse, and bare-land exposure using Google Earth Engine's Dynamic World V1
dataset (Sentinel-2, 10 m resolution).

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FRONTEND  (React 18 + Mapbox GL)                  │
│  App.jsx  │  Map.jsx  │  AlertPanel.jsx  │  LayerControls.jsx        │
│  Port 3000 — Vite proxies /api/* to backend port 8080               │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP / JSON
┌──────────────────────────▼──────────────────────────────────────────┐
│                    BACKEND  (FastAPI, Python 3.11)                    │
│  backend/main.py — all API routes                                    │
│  Port 8080                                                           │
└────────┬──────────────────────────────────┬─────────────────────────┘
         │                                  │
┌────────▼────────┐             ┌───────────▼────────────────────────┐
│  SQLite / PG    │             │  GEE Runner (BackgroundTask)        │
│  aranyai.db     │             │  backend/gee_runner.py              │
│                 │             │  • ee.Initialize (service account)  │
│  aois           │             │  • DW composite (mean → argMax)     │
│  change_runs    │             │  • Change masks + area stats        │
│  alerts         │             │  • getMapId() → tile URLs           │
│  change_vectors │             │  • reduceToVectors → GeoJSON        │
└─────────────────┘             │  • Export.image → GCS (COG)        │
                                └───────────┬────────────────────────┘
                                            │ Export tasks
                                ┌───────────▼────────────────────────┐
                                │  Google Earth Engine               │
                                │  GOOGLE/DYNAMICWORLD/V1            │
                                │  COPERNICUS/S2_SR_HARMONIZED       │
                                └───────────┬────────────────────────┘
                                            │ GCS exports
                                ┌───────────▼────────────────────────┐
                                │  Cloud Storage                     │
                                │  gs://aranyai-exports-aranyai/     │
                                │  runs/{run_id}/transition.tif      │
                                └────────────────────────────────────┘
```

---

## 3. Tech Stack

| Layer       | Technology              | Version  | Notes                              |
|-------------|------------------------|----------|------------------------------------|
| GEE         | earthengine-api         | 0.1.390  | Service account auth only          |
| Backend     | FastAPI + uvicorn       | 0.104+   | Sync + BackgroundTasks             |
| Database    | SQLite (dev) / PG (prod)| —        | SQLAlchemy 2.0 ORM                 |
| GEE dataset | Dynamic World V1        | —        | 10 m LULC, Sentinel-2 derived      |
| Storage     | Google Cloud Storage    | —        | asia-south1, COG GeoTIFF exports   |
| Map tiles   | GEE getMapId() XYZ URL  | —        | Valid ~2 h; refreshed on demand    |
| Frontend    | React 18 + Vite 5       | —        | Mapbox GL JS 3.4                   |
| Styling     | Plain CSS (Inter font)  | —        | Government enterprise light theme  |
| Local dev   | Cloud Shell / Docker    | —        | No local GCP auth needed           |

---

## 4. Detection Modes

### 4.1 NRT (Near Real-Time) — primary operational mode
```
Baseline:  today − 30d  →  today − 15d   (15-day window)
Current:   today − 15d  →  today         (15-day window)
Run every: 5 days (Cloud Scheduler cron: "0 3 */5 * *")
Purpose:   fresh encroachment, tree cutting, new construction
Max data touched: 30 days of DW images
First-detection scan: lookback capped at 90 days
```

### 4.2 Annual — for reports and audits
```
Baseline:  Jan 1 [year-1]  →  May 31 [year-1]
Current:   Jan 1 [year]    →  May 31 [year]
Run every: Monthly (cron: "0 4 1 * *")
Purpose:   annual deforestation metrics, government audit reports
Max data touched: 18 months (hard cap — never queries pre-2020 data)
```

### 4.3 Monsoon handling (Chhattisgarh, Jun–Oct)
- Sentinel-2 cloud cover > 70% → fewer clear DW images
- Detection still runs; `current_images` < 2 sets `status = "low_confidence"`
- Frontend shows warning badge; results treated with caution

---

## 5. GEE Integration — Key Patterns

```python
# ── Auth (service account, always) ───────────────────────────────────
credentials = ee.ServiceAccountCredentials(
    email="aranyai-gee@aranyai.iam.gserviceaccount.com",
    key_file="gee-sa-key.json"
)
ee.Initialize(credentials=credentials, project="aranyai")

# ── Composite: mean probability → argMax (NOT mode()) ────────────────
# mode() over long windows hides recent changes; argMax on mean probs
# is more stable and captures short-window changes correctly.
dw    = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1").filterBounds(aoi).filterDate(start, end)
mean  = dw.map(mask_low_confidence).select(CLASS_NAMES).mean()
label = mean.reduce(ee.Reducer.argMax()).rename("label").toUint8()

# ── Change masks ──────────────────────────────────────────────────────
deforestation  = baseline.eq(1).And(current.neq(1)).And(current.neq(0))  # trees gone
encroachment   = baseline.lte(2).And(current.eq(6))   # natural → built
agri_in_forest = baseline.eq(1).And(current.eq(4))    # trees → crops
tree_to_bare   = baseline.eq(1).And(current.eq(7))    # trees → bare

# Transition code: baseline*9 + current (0–80)
# trees→built=15, trees→crops=13, trees→bare=16, trees→water=9
transition = baseline.multiply(9).add(current).rename("transition").toUint8()

# ── Area stats (blocking getInfo OK for scalar) ───────────────────────
area_m2 = (ee.Image.pixelArea().updateMask(mask)
           .reduceRegion(ee.Reducer.sum(), aoi, scale=100, maxPixels=1e13, bestEffort=True)
           .get("area")).getInfo()
area_ha = area_m2 / 10_000

# ── Tile URL for Mapbox (expires ~2 h) ───────────────────────────────
tile_url = label.visualize(min=0, max=8, palette=DW_PALETTE)
               .getMapId()["tile_fetcher"].url_format
# → "https://earthengine.googleapis.com/v1/projects/.../tiles/{z}/{x}/{y}"
# Add directly as Mapbox raster source — no tile server needed.

# ── Raster export (async, non-blocking) ──────────────────────────────
task = ee.batch.Export.image.toCloudStorage(
    image=transition, bucket="aranyai-exports-aranyai",
    fileNamePrefix="runs/{run_id}/transition",
    region=aoi, scale=10, crs="EPSG:32644",
    maxPixels=1e13, fileFormat="GeoTIFF",
    formatOptions={"cloudOptimized": True}
)
task.start()  # fire and forget; task_id stored in DB

# ── Vector polygons (inline, for small AOIs < 50 km²) ────────────────
fc = mask.selfMask().reduceToVectors(
    reducer=ee.Reducer.countEvery(), geometry=aoi,
    scale=100, maxPixels=1e12, geometryType="polygon"
).getInfo()  # blocking; fine for 8 km² test AOI
```

---

## 6. API Endpoints

```
GET  /health
GET  /api/aois                           list active AOIs
POST /api/aois                           {name, division, range_name, geojson}
GET  /api/aois/{id}                      AOI detail with geojson
POST /api/aois/{id}/detect               trigger detection → 202 {run_id, poll}
  Body: {baseline_start, baseline_end, current_start, current_end, mode}
  mode: "nrt" | "annual" | "custom"

GET  /api/aois/{id}/runs                 run history (newest first, limit 20)
GET  /api/runs/{id}                      run status + area stats
  status: pending | running | done | failed | low_confidence
  areas_ha: {deforestation, encroachment, agri_in_forest, tree_to_bare, any_change}

GET  /api/runs/{id}/tiles                GEE tile URLs (cached 2 h)
  Returns: {dw_label, before_s2, after_s2, aoi_geojson, expires_at}
  ?refresh=true to force regeneration

GET  /api/runs/{id}/vectors              all change polygons → GeoJSON FeatureCollection
  feature.properties: {change_type, color, area_ha, run_id}

GET  /api/alerts                         ?status=open&severity=high&aoi_id=...
PATCH /api/alerts/{id}                   {status, assigned_to, notes}
  status: open | assigned | resolved | dismissed
```

---

## 7. Database Schema

```sql
aois (
  id UUID PK, name TEXT, division TEXT, range_name TEXT,
  geojson TEXT,          -- GeoJSON string, EPSG:4326
  is_active BOOL, created_at DATETIME
)

change_runs (
  id UUID PK, aoi_id UUID, detection_mode TEXT,
  baseline_start DATE, baseline_end DATE,
  current_start DATE, current_end DATE,
  run_at DATETIME,
  status TEXT,           -- pending|running|done|failed|low_confidence
  baseline_images INT, current_images INT,
  deforestation_ha FLOAT, encroachment_ha FLOAT,
  agri_in_forest_ha FLOAT, tree_to_bare_ha FLOAT, any_change_ha FLOAT,
  raster_path TEXT,      -- gs://... COG GeoTIFF path
  gee_task_ids TEXT,     -- JSON {"raster": "GEE_task_id"}
  dw_tile_url TEXT,      -- GEE XYZ tile URL, expires ~2h
  before_tile_url TEXT, after_tile_url TEXT,
  tile_expires_at DATETIME
)

alerts (
  id UUID PK, aoi_id UUID, run_id UUID, detection_mode TEXT,
  change_type TEXT,      -- deforestation|encroachment|agri_in_forest|tree_to_bare
  severity TEXT,         -- low|medium|high|critical
  area_ha FLOAT,
  first_detected_at DATE, -- approx. from DW time-series scan (90d lookback NRT)
  confidence FLOAT,       -- mean DW top-class probability, 0–1
  status TEXT,            -- open|assigned|resolved|dismissed
  assigned_to TEXT, notes TEXT,
  created_at DATETIME, resolved_at DATETIME
)

change_vectors (
  id UUID PK, run_id UUID, change_type TEXT,
  geojson TEXT,          -- GeoJSON FeatureCollection string
  created_at DATETIME
)
```

**Alert thresholds (hectares):**
| Change type      | low | medium | high | critical |
|-----------------|-----|--------|------|----------|
| deforestation   | 1   | 10     | 50   | 100      |
| encroachment    | 0.5 | 5      | 25   | 50       |
| agri_in_forest  | 2   | 20     | 100  | 200      |
| tree_to_bare    | 1   | 10     | 50   | 100      |

---

## 8. Dynamic World V1 — Class Reference

| Index | Name               | Color   | Transition IDs from trees (idx 1) |
|-------|--------------------|---------|-----------------------------------|
| 0     | water              | #419bdf | trees→water = 9                   |
| 1     | trees              | #397d49 | —                                 |
| 2     | grass              | #88b053 | trees→grass = 11                  |
| 3     | flooded_vegetation | #7a87c6 | trees→flooded = 12                |
| 4     | crops              | #e49635 | trees→crops = 13 (agri_in_forest) |
| 5     | shrub_and_scrub    | #dfc35a | trees→shrub = 14                  |
| 6     | built              | #c4281b | trees→built = 15 (encroachment)   |
| 7     | bare               | #a59b8f | trees→bare = 16 (tree_to_bare)    |
| 8     | snow_and_ice       | #b39fe1 | —                                 |

---

## 9. Frontend Architecture

```
App.jsx
  State: aois, selectedAoiId, selectedAoi, activeRun,
         tiles, vectors, alerts, runHistory, polling, layers
  Effects:
    - Load AOIs on mount
    - Load AOI detail + alerts when selectedAoiId changes
    - Poll /api/runs/{id} every 5 s while polling=true
    - On run complete: fetch tiles, vectors, alerts in parallel

Map.jsx (Mapbox GL JS)
  Props: aoi, tiles, vectors, layers
  Layers (bottom → top):
    satellite-v9   ← Mapbox base
    s2-before      ← GEE Sentinel-2 before (raster, opacity 0/0.95)
    s2-after       ← GEE Sentinel-2 after  (raster, opacity 0/0.95)
    dw-label       ← DW classification     (raster, opacity 0.70)
    aoi-fill       ← AOI polygon fill      (vector, opacity 0.06)
    aoi-line       ← AOI boundary          (vector, dashed)
    changes-fill   ← change polygons       (vector, opacity 0.28)
    changes-line   ← change outlines       (vector)
  Layer toggled via layers prop from LayerControls

AlertPanel.jsx
  Sections: AOI selector | Detection controls | Run status |
            Change statistics | Active alerts table | Run history

LayerControls.jsx
  Map overlay (bottom-left), visible only when tiles loaded
  Controls: imagery radio (satellite/before/after) | dw/changes checkboxes
```

---

## 10. GCP Project Configuration

```
Project ID:          aranyai
Region:              asia-south1 (Mumbai — closest to Chhattisgarh)
Service account:     aranyai-gee@aranyai.iam.gserviceaccount.com
IAM roles:
  roles/earthengine.writer
  roles/storage.objectAdmin
  roles/serviceusage.serviceUsageConsumer
GCS bucket:          aranyai-exports-aranyai
GEE registered:      https://signup.earthengine.google.com/#!/service_accounts
```

---

## 11. Environment Variables

```bash
GCP_PROJECT_ID=aranyai
GEE_SERVICE_ACCOUNT=aranyai-gee@aranyai.iam.gserviceaccount.com
GEE_KEY_FILE=gee-sa-key.json
GCS_BUCKET=aranyai-exports-aranyai
DATABASE_URL=sqlite:///./aranyai.db        # dev
MAPBOX_TOKEN=pk.eyJ1...                    # frontend
VITE_MAPBOX_TOKEN=pk.eyJ1...               # Vite build-time
```

---

## 12. Post-MVP Additions

| Feature | Implementation |
|---------|---------------|
| Landsat NDVI vegetation health | `LANDSAT/LC09/C02/T1_L2` NDVI band, 30 m |
| Fire/burn detection | `LANDSAT/LC09/C02/T1_L2` BAI/NBRT 32-day composite |
| PostgreSQL migration | Change `DATABASE_URL` — SQLAlchemy handles it |
| Cloud Scheduler automation | `gcloud scheduler jobs create http ...` |
| Cloud Run deployment | `gcloud run deploy aranyai-backend ...` |
| SMS/email alerts | Twilio + SendGrid on alert creation |
| PDF reports | WeasyPrint + Jinja2 templates |
| ML false-positive filter | XGBoost on change polygon features |
