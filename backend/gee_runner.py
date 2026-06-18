"""
AranyAI GEE Runner
==================
ALL ee.* calls live here only. Nothing else in the codebase imports ee.

Two detection modes:
  nrt    — 15-day rolling windows (operational alerts, runs every 5 days)
  annual — same dry season year-on-year (reports, runs monthly)

Data bounds (hard limits — nothing older is ever queried):
  NRT    : 90 days  max lookback for first-detection scan
  Annual : 18 months max (never queries data from 2015 etc.)
"""
import json
import logging
import uuid
from datetime import date, datetime, timedelta

import ee

from .config import settings
from .database import Alert, ChangeRun, ChangeVector, get_session

log = logging.getLogger("aranyai.gee")

# ── Constants ─────────────────────────────────────────────────────────────────
CLASS_NAMES = [
    "water", "trees", "grass", "flooded_vegetation", "crops",
    "shrub_and_scrub", "built", "bare", "snow_and_ice",
]
CLASS_IDX = {n: i for i, n in enumerate(CLASS_NAMES)}

DW_PALETTE = [
    "419bdf", "397d49", "88b053", "7a87c6", "e49635",
    "dfc35a", "c4281b", "a59b8f", "b39fe1",
]

# Alert thresholds in hectares
THRESHOLDS = {
    "deforestation":  {"low": 1,   "medium": 10,  "high": 50,  "critical": 100},
    "encroachment":   {"low": 0.5, "medium": 5,   "high": 25,  "critical": 50},
    "agri_in_forest": {"low": 2,   "medium": 20,  "high": 100, "critical": 200},
    "tree_to_bare":   {"low": 1,   "medium": 10,  "high": 50,  "critical": 100},
}

# Hard lookback limits — GEE never touches data older than these
NRT_MAX_LOOKBACK_DAYS    = 90
ANNUAL_MAX_LOOKBACK_DAYS = 548   # 18 months

_initialized = False


# ── Auth ──────────────────────────────────────────────────────────────────────
def _init():
    global _initialized
    if _initialized:
        return
    creds = ee.ServiceAccountCredentials(
        email=settings.gee_service_account,
        key_file=settings.gee_key_file,
    )
    ee.Initialize(credentials=creds, project=settings.gcp_project_id)
    _initialized = True
    log.info("GEE initialized")


# ── Date window helpers ───────────────────────────────────────────────────────
def nrt_windows(window_days: int = 15) -> dict:
    """
    Rolling pair of N-day windows anchored to today.
    current  = today-N  →  today
    baseline = today-2N →  today-N
    Max data touched: 2×N days.
    """
    today = datetime.utcnow().date()
    return {
        "current_end":    str(today),
        "current_start":  str(today - timedelta(days=window_days)),
        "baseline_end":   str(today - timedelta(days=window_days)),
        "baseline_start": str(today - timedelta(days=window_days * 2)),
    }


def annual_windows(start_month: int = 1, end_month: int = 5) -> dict:
    """
    Same calendar months, two consecutive years.
    Never exceeds ANNUAL_MAX_LOOKBACK_DAYS.
    """
    today    = datetime.utcnow().date()
    cur_year = today.year
    base_year = cur_year - 1

    baseline_start = date(base_year, start_month, 1)
    if (today - baseline_start).days > ANNUAL_MAX_LOOKBACK_DAYS:
        raise ValueError(
            f"Annual window exceeds {ANNUAL_MAX_LOOKBACK_DAYS}-day hard limit."
        )

    return {
        "current_start":  f"{cur_year}-{start_month:02d}-01",
        "current_end":    f"{cur_year}-{end_month:02d}-30",
        "baseline_start": f"{base_year}-{start_month:02d}-01",
        "baseline_end":   f"{base_year}-{end_month:02d}-30",
    }


# ── Core GEE helpers ──────────────────────────────────────────────────────────
def _composite(aoi, start: str, end: str):
    """
    Mean-probability composite → argMax label.
    Returns (label_image, raw_collection, image_count).
    """
    dw = (
        ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
        .filterBounds(aoi)
        .filterDate(start, end)
    )
    count = dw.size().getInfo()

    def mask_low(img):
        return img.updateMask(
            img.select(CLASS_NAMES).reduce(ee.Reducer.max()).gt(0.5)
        )

    mean  = dw.map(mask_low).select(CLASS_NAMES).mean()
    label = mean.toArray().arrayArgmax().arrayGet([0]).rename("label").toUint8()
    return label, dw, count


def _area_ha(mask, aoi) -> float:
    r = (
        ee.Image.pixelArea()
        .updateMask(mask)
        .reduceRegion(ee.Reducer.sum(), aoi, 100, maxPixels=1e13, bestEffort=True)
        .get("area")
    )
    return round((ee.Number(r).getInfo() or 0) / 10_000, 2)


def _severity(change_type: str, area_ha: float):
    t = THRESHOLDS.get(change_type, {})
    for level in ("critical", "high", "medium", "low"):
        if area_ha >= t.get(level, float("inf")):
            return level
    return None


def _confidence(aoi, collection, change_mask) -> float:
    """Mean top-class DW probability for changed pixels."""
    top = collection.select(CLASS_NAMES).mean().reduce(ee.Reducer.max())
    r = (
        top.updateMask(change_mask)
        .reduceRegion(ee.Reducer.mean(), aoi, 100, maxPixels=1e12, bestEffort=True)
        .get("max")
    )
    return round(ee.Number(r).getInfo() or 0.0, 3)


def _vectors(aoi, mask, change_type: str, area_ha: float) -> dict | None:
    """
    Inline vectorisation — OK for AOIs < 50 km².
    Returns GeoJSON FeatureCollection dict or None on failure.
    """
    if area_ha == 0:
        return None
    try:
        fc = (
            mask.selfMask()
            .reduceToVectors(
                reducer=ee.Reducer.countEvery(),
                geometry=aoi,
                scale=100,
                maxPixels=1e12,
                geometryType="polygon",
            )
            .map(lambda f: f.set({"change_type": change_type, "area_ha": area_ha}))
            .getInfo()
        )
        return fc
    except Exception as exc:
        log.warning("Vector generation failed for %s: %s", change_type, exc)
        return None


# ── Tile URL generation ───────────────────────────────────────────────────────
def get_tile_urls(aoi, baseline_end: str, current_end: str, current_label) -> dict:
    """
    Generate GEE tile URLs for the map panel.
    dw_label  : DW classification overlay for current period
    before_s2 : Clearest Sentinel-2 image before the change
    after_s2  : Clearest Sentinel-2 image after the change
    URLs expire ~2 h. Call again to refresh.
    """
    S2_VIS = {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000, "gamma": 1.4}
    DW_VIS = {"min": 0, "max": 8, "palette": DW_PALETTE}

    def best_s2(start: str, end: str, max_cloud: int = 30):
        return (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(aoi)
            .filterDate(start, end)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", max_cloud))
            .sort("CLOUDY_PIXEL_PERCENTAGE")
            .first()
        )

    def tile_url(image, vis: dict) -> str | None:
        try:
            return image.visualize(**vis).getMapId()["tile_fetcher"].url_format
        except Exception as exc:
            log.warning("tile_url failed: %s", exc)
            return None

    before_start = (
        datetime.strptime(baseline_end, "%Y-%m-%d") - timedelta(days=90)
    ).strftime("%Y-%m-%d")
    after_start = (
        datetime.strptime(current_end, "%Y-%m-%d") - timedelta(days=30)
    ).strftime("%Y-%m-%d")

    return {
        "before_s2": tile_url(best_s2(before_start, baseline_end), S2_VIS),
        "after_s2":  tile_url(best_s2(after_start,  current_end),  S2_VIS),
        "dw_label":  tile_url(current_label, DW_VIS),
    }


# ── First detection dating ────────────────────────────────────────────────────
def find_first_detection(
    aoi,
    change_mask,
    new_class_id: int,
    current_end: str,
    lookback_days: int,
) -> str | None:
    """
    Scan DW time series backward to find when changed pixels first
    showed new_class_id. Returns ISO date string or None.
    """
    lookback_start = (
        datetime.strptime(current_end, "%Y-%m-%d").date()
        - timedelta(days=lookback_days)
    ).strftime("%Y-%m-%d")

    col = (
        ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
        .filterBounds(aoi)
        .filterDate(lookback_start, current_end)
        .sort("system:time_start")
    )

    def stamp(img):
        ts = img.date().millis().toFloat()
        return (
            ts
            .updateMask(change_mask)
            .updateMask(img.select("label").eq(new_class_id))
            .rename("ts_ms")
        )

    result = (
        col.map(stamp)
        .min()
        .reduceRegion(ee.Reducer.min(), aoi, 100, maxPixels=1e12, bestEffort=True)
        .get("ts_ms")
    )
    ms = ee.Number(result).getInfo()
    if ms is None:
        return None
    return datetime.utcfromtimestamp(ms / 1000.0).strftime("%Y-%m-%d")


# ── Main detection entry point ────────────────────────────────────────────────
def run_gee_detection(
    run_id: str,
    aoi_geojson: dict,
    baseline_start: str,
    baseline_end: str,
    current_start: str,
    current_end: str,
    mode: str = "nrt",
) -> None:
    """
    Background task called by FastAPI BackgroundTasks.
    1. Builds two composites.
    2. Computes change masks + area stats.
    3. Generates tile URLs (before/after S2 + DW overlay).
    4. Vectorises change polygons (inline, for small AOIs).
    5. Finds first detection dates from time series.
    6. Persists everything to DB and creates Alert records.
    """
    _init()
    aoi = ee.Geometry(aoi_geojson)
    log.info("[%s] mode=%s  %s/%s  →  %s/%s",
             run_id[:8], mode, baseline_start, baseline_end,
             current_start, current_end)

    try:
        # ── Composites ───────────────────────────────────────────────────────
        b_label, _b_col, b_count = _composite(aoi, baseline_start, baseline_end)
        c_label, c_col,  c_count = _composite(aoi, current_start,  current_end)
        log.info("[%s] images baseline:%d current:%d", run_id[:8], b_count, c_count)

        if b_count == 0:
            raise RuntimeError(
                f"Zero baseline images ({baseline_start}→{baseline_end}). "
                "Extend the date range."
            )

        run_status = "done"
        if c_count < 2:
            log.warning("[%s] only %d current images — likely monsoon cloud cover",
                        run_id[:8], c_count)
            run_status = "low_confidence"

        # ── Change masks ─────────────────────────────────────────────────────
        trees = CLASS_IDX["trees"]
        defor  = b_label.eq(trees).And(c_label.neq(trees)).And(c_label.neq(CLASS_IDX["water"]))
        encr   = b_label.lte(CLASS_IDX["grass"]).And(c_label.eq(CLASS_IDX["built"]))
        agri   = b_label.eq(trees).And(c_label.eq(CLASS_IDX["crops"]))
        bare_m = b_label.eq(trees).And(c_label.eq(CLASS_IDX["bare"]))
        any_ch = b_label.neq(c_label)
        trans  = b_label.multiply(9).add(c_label).rename("transition").toUint8()

        change_map = {
            "deforestation":  (defor,  CLASS_IDX["bare"]),
            "encroachment":   (encr,   CLASS_IDX["built"]),
            "agri_in_forest": (agri,   CLASS_IDX["crops"]),
            "tree_to_bare":   (bare_m, CLASS_IDX["bare"]),
        }

        # ── Area stats ───────────────────────────────────────────────────────
        areas = {ct: _area_ha(m, aoi) for ct, (m, _) in change_map.items()}
        areas["any_change"] = _area_ha(any_ch, aoi)
        log.info("[%s] areas_ha: %s", run_id[:8], areas)

        # ── Tile URLs ────────────────────────────────────────────────────────
        urls = get_tile_urls(aoi, baseline_end, current_end, c_label)

        # ── Raster export to GCS ─────────────────────────────────────────────
        gcs_key = f"runs/{run_id[:8]}/transition"
        task = ee.batch.Export.image.toCloudStorage(
            image=trans,
            description=f"aranyai_{run_id[:8]}",
            bucket=settings.gcs_bucket,
            fileNamePrefix=gcs_key,
            region=aoi,
            scale=10,
            crs="EPSG:32644",
            maxPixels=1e13,
            fileFormat="GeoTIFF",
            formatOptions={"cloudOptimized": True},
        )
        task.start()
        gee_task_id = task.status()["id"]

        # ── Persist run ──────────────────────────────────────────────────────
        tile_expires = datetime.utcnow().replace(microsecond=0)
        tile_expires = tile_expires.replace(
            hour=(tile_expires.hour + 2) % 24
        )

        with get_session() as db:
            run = db.query(ChangeRun).filter(ChangeRun.id == run_id).first()
            run.status            = run_status
            run.detection_mode    = mode
            run.baseline_images   = b_count
            run.current_images    = c_count
            run.deforestation_ha  = areas["deforestation"]
            run.encroachment_ha   = areas["encroachment"]
            run.agri_in_forest_ha = areas["agri_in_forest"]
            run.tree_to_bare_ha   = areas["tree_to_bare"]
            run.any_change_ha     = areas["any_change"]
            run.raster_path       = f"gs://{settings.gcs_bucket}/{gcs_key}.tif"
            run.gee_task_ids      = json.dumps({"raster": gee_task_id})
            run.dw_tile_url       = urls.get("dw_label")
            run.before_tile_url   = urls.get("before_s2")
            run.after_tile_url    = urls.get("after_s2")
            run.tile_expires_at   = tile_expires
            aoi_id = run.aoi_id

        # ── Vectors + alerts ─────────────────────────────────────────────────
        lookback = NRT_MAX_LOOKBACK_DAYS if mode == "nrt" else ANNUAL_MAX_LOOKBACK_DAYS

        with get_session() as db:
            for ctype, (mask, new_cls) in change_map.items():
                area = areas[ctype]
                sev  = _severity(ctype, area)

                # Vectorise polygons
                fc = _vectors(aoi, mask, ctype, area)
                if fc:
                    db.add(ChangeVector(
                        run_id=run_id,
                        change_type=ctype,
                        geojson=json.dumps(fc),
                    ))

                # Create alert if threshold exceeded
                if not sev:
                    continue

                first_date = find_first_detection(
                    aoi, mask, new_cls,
                    current_end=current_end,
                    lookback_days=lookback,
                )
                conf = _confidence(aoi, c_col, mask)

                db.add(Alert(
                    id=str(uuid.uuid4()),
                    aoi_id=aoi_id,
                    run_id=run_id,
                    detection_mode=mode,
                    change_type=ctype,
                    severity=sev,
                    area_ha=area,
                    first_detected_at=first_date,
                    confidence=conf,
                ))

        log.info("[%s] complete  status=%s  gee_task=%s",
                 run_id[:8], run_status, gee_task_id[:16])

    except Exception as exc:
        log.error("[%s] failed: %s", run_id[:8], exc)
        with get_session() as db:
            run = db.query(ChangeRun).filter(ChangeRun.id == run_id).first()
            if run:
                run.status       = "failed"
                run.gee_task_ids = json.dumps({"error": str(exc)})
        raise
