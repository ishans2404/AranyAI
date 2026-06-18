# AranyAI — Forest Change Detection System

Near-real-time forest monitoring for the Chhattisgarh Forest Department.  
Uses Google Earth Engine + Dynamic World V1 (Sentinel-2, 10 m).

---

## What you get

| Component | What it does |
|-----------|-------------|
| **Backend** (FastAPI) | Triggers GEE detection jobs, stores results, serves alerts via REST API |
| **GEE Runner** | Builds DW composites, detects change masks, exports COG rasters + vectors to GCS |
| **Database** (SQLite) | Stores AOIs, detection runs, alerts, change polygons |
| **Frontend** (React + Mapbox GL) | Government-grade dashboard — map with DW overlay, before/after S2, alert table |

---

## Prerequisites (already done from previous session)

- [x] GCP project `aranyai` with Earth Engine API enabled  
- [x] Service account `aranyai-gee@aranyai.iam.gserviceaccount.com` with EE Writer + Storage Admin roles  
- [x] `gee-sa-key.json` downloaded to Cloud Shell `~`  
- [x] GCS bucket `aranyai-exports-aranyai` (asia-south1) created  
- [ ] **Mapbox token** — free at [mapbox.com](https://mapbox.com) → Account → Tokens  

---

## Running on Google Cloud Shell

Cloud Shell has Python 3.11 and Node 20 pre-installed. Use **two terminals** side by side.

### Terminal 1 — Backend

```bash
# 1. Upload project (use Cloud Shell upload button, or git clone)
cd ~

# 2. Create .env from template
cd aranyai
cp .env.example .env

# 3. Edit .env — add your Mapbox token
nano .env
# Set MAPBOX_TOKEN and VITE_MAPBOX_TOKEN to your pk.eyJ1... token
# Leave other values as-is (they match your existing GCP setup)
# Save: Ctrl+O  Exit: Ctrl+X

# 4. Install Python dependencies
pip install -r backend/requirements.txt --user

# 5. Start backend on port 8080
#    (Cloud Shell Web Preview works on 8080 by default)
uvicorn backend.main:app --host 0.0.0.0 --port 8080
```

You should see:
```
INFO:     Started server process [...]
INFO:     Application startup complete.
```

Test it: open Web Preview → Preview on port 8080 → append `/docs` for the API explorer.

---

### Terminal 2 — Seed AOI + Frontend

```bash
cd ~/aranyai

# 6. Register your test AOI in the database
python scripts/seed_aoi.py
#    → prints the AOI ID. Save it.

# 7. Install frontend dependencies
cd frontend
npm install

# 8. Start frontend dev server on port 3000
npm run dev
#    Vite automatically proxies /api/* → http://localhost:8080
```

Open Web Preview → **Change port** → **3000** → dashboard loads.

---

### Running your first detection

In the dashboard:
1. Your test AOI appears in the dropdown automatically
2. Click **▶ Run NRT Detection**
3. Status shows "Processing GEE Job…" — GEE takes **2–5 minutes**
4. When done:
   - Map loads DW classification overlay (colour-coded land cover)
   - Before/after Sentinel-2 imagery available in Layer Controls
   - Change polygons appear on the map (red = deforestation, orange = encroachment…)
   - Stats table populates with change areas
   - Alerts table shows triggered alerts

---

## Running locally (not Cloud Shell)

```bash
# Clone or unzip project
cd aranyai
cp .env.example .env   # edit to add your values

# Backend
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8080

# Frontend (new terminal)
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

---

## Docker Compose (optional)

```bash
cp .env.example .env  # fill in values
docker compose up --build
# Backend  → http://localhost:8080
# Frontend → http://localhost:3000
```

---

## Cloud Shell — important notes

| Thing | Detail |
|-------|--------|
| **Port 8080** | Cloud Shell's default Web Preview port. Use it for the backend. |
| **Port 3000** | Use "Change port" in Web Preview for the frontend. |
| **Vite proxy** | `vite.config.js` proxies `/api/*` to `http://localhost:8080` — no CORS issues. |
| **Session timeout** | Cloud Shell sleeps after ~20 min idle. Re-run both uvicorn and npm run dev. |
| **GEE key** | `gee-sa-key.json` must be in the same directory you run uvicorn from. |
| **SQLite file** | `aranyai.db` is created in the current directory on first backend start. |

---

## API Quick Reference

```bash
BASE=http://localhost:8080

# List AOIs
curl $BASE/api/aois

# Trigger NRT detection (replace AOI_ID)
curl -X POST $BASE/api/aois/AOI_ID/detect \
  -H "Content-Type: application/json" \
  -d '{"mode":"nrt","baseline_start":"2026-05-08","baseline_end":"2026-05-23",
       "current_start":"2026-05-23","current_end":"2026-06-07"}'

# Poll run status
curl $BASE/api/runs/RUN_ID

# Get GEE tile URLs (for map display)
curl $BASE/api/runs/RUN_ID/tiles

# Get change polygons (GeoJSON)
curl $BASE/api/runs/RUN_ID/vectors

# List open alerts
curl "$BASE/api/alerts?status=open"

# Resolve an alert
curl -X PATCH $BASE/api/alerts/ALERT_ID \
  -H "Content-Type: application/json" \
  -d '{"status":"resolved","notes":"Inspected on field — natural tree fall"}'
```

Full interactive docs: `http://localhost:8080/docs`

---

## Cloud Scheduler (production automation)

Once the POC works, automate NRT runs every 5 days:

```bash
# Create a Cloud Run Job from the backend
gcloud run jobs create aranyai-nrt \
  --image gcr.io/aranyai/backend \
  --region asia-south1 \
  --set-env-vars GCP_PROJECT_ID=aranyai

# Schedule it every 5 days at 03:00 IST
gcloud scheduler jobs create http aranyai-nrt-schedule \
  --location asia-south1 \
  --schedule "0 3 */5 * *" \
  --time-zone "Asia/Kolkata" \
  --uri "https://YOUR_BACKEND_URL/api/aois/AOI_ID/detect" \
  --message-body '{"mode":"nrt","baseline_start":"AUTO","baseline_end":"AUTO","current_start":"AUTO","current_end":"AUTO"}' \
  --http-method POST
```

---

## Landsat (post-MVP)

Dynamic World V1 (Sentinel-2, 10 m) is the primary dataset.  
After MVP, add Landsat 8/9 for:

| Use case | Landsat dataset | GEE collection |
|----------|----------------|----------------|
| Vegetation health | NDVI time series | `LANDSAT/LC09/C02/T1_L2` |
| Fire / burn detection | BAI, NBRT | `LANDSAT/LC09/C02/T1_L2` (32-day BAI composite) |
| Pre-2015 historical | Landsat 7/8 archive | `LANDSAT/LE07/C02/T1_L2` |
| Vegetation stress | EVI composite | 8-day EVI composite collection |

---

## File Structure

```
aranyai/
├── ARCHITECTURE.md          ← full system reference (share with any AI)
├── README.md                ← this file
├── .env.example             ← copy to .env
├── .gitignore
├── docker-compose.yml
├── Dockerfile.backend
│
├── backend/
│   ├── __init__.py
│   ├── config.py            ← pydantic-settings
│   ├── database.py          ← SQLAlchemy models (AOI, ChangeRun, Alert, ChangeVector)
│   ├── gee_runner.py        ← ALL GEE code (ee.* imports only here)
│   ├── main.py              ← FastAPI routes
│   └── requirements.txt
│
├── frontend/
│   ├── Dockerfile.frontend
│   ├── package.json
│   ├── vite.config.js       ← proxies /api → backend
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx          ← layout + state + polling
│       ├── api.js           ← all fetch() calls
│       ├── index.css        ← government enterprise design system
│       └── components/
│           ├── Map.jsx          ← Mapbox GL + GEE tile layers
│           ├── AlertPanel.jsx   ← data panel (stats + alert table)
│           └── LayerControls.jsx ← map overlay (layer toggles)
│
└── scripts/
    └── seed_aoi.py          ← register test AOI + optional first detection
```
