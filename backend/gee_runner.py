"""
AranyAI GEE Runner — Rolling-Baseline Anomaly Detection
=========================================================
ALL ee.* calls live here only. Nothing else in the codebase imports ee.

Methodology (replaces the old composite-vs-composite label diffing):

  1. BASELINE — median + stdDev of the Dynamic World "trees" probability
     band over a rolling ~12-month window, computed up to
     BASELINE_EXCLUDE_RECENT_DAYS before the run date. Excluding the most
     recent window keeps the baseline from being contaminated by the very
     change we're trying to detect.
  2. CURRENT SIGNAL — mean trees-probability over the most recent
     CURRENT_WINDOW_DAYS.
  3. ANOMALY SCORE — z = (current − baseline_median) / baseline_stdDev.
     Validated against two real Chhattisgarh forest-loss sites before
     this was wired into the app: z ≈ -5.37 (~174 ha clearing) and
     z ≈ -16.18 (~220 ha, ongoing degradation on an older loss site) —
     both far past ANOMALY_Z_THRESHOLD, against stable-forest background
     noise sitting near 0. That separation is the basis for the
     threshold below.
  4. STRATIFICATION — only pixels whose baseline (pre-window) land cover
     was "trees" are eligible. This keeps the anomaly signal specifically
     about *forest* loss, not generic land-cover noise in bare/built/
     cropland pixels that were never forest to begin with.
  5. SPATIAL COHERENCE — connectedPixelCount() minimum-mapping-unit
     filter (MIN_CLUSTER_HA) kills salt-and-pepper single-pixel noise,
     the same convention GLAD/Hansen-style disturbance alerts use.
  6. PERSISTENCE — a candidate cluster is not visible to officers until
     it has been independently re-detected on a second run
     (PERSISTENCE_REQUIRED). This is the single biggest lever against
     false positives: one noisy pass can never promote an alert by
     itself. Persistent identity is tracked via the Site model — a
     physical place, not a per-run row.
  7. EXPLAINABILITY — every promoted alert carries a trees-probability
     time series, a tight before/after Sentinel-2 crop, and a generated
     caption with the actual measured numbers, so an officer can
     interrogate the evidence instead of trusting a bare score.

The four change_type categories (deforestation / encroachment /
agri_in_forest / tree_to_bare) are kept from the old system as a
post-hoc classification of what the validated disturbed pixels look
like *now* — they no longer drive detection, only triage labeling.
"""
import json
import logging
import uuid
from datetime import datetime, timedelta

import ee
from shapely.geometry import shape as shapely_shape

from .config import settings
from .database import Alert, ChangeRun, ChangeVector, Site, get_session

log = logging.getLogger("aranyai.gee")

# ── Constants ─────────────────────────────────────────────────────────────────
CLASS_NAMES = [
    "water", "trees", "grass", "flooded_vegetation", "crops",
    "shrub_and_scrub", "built", "bare", "snow_and_ice",
]
CLASS_IDX = {n: i for i, n in enumerate(CLASS_NAMES)}
TREES_IDX = CLASS_IDX["trees"]

DW_PALETTE = [
    "419bdf", "397d49", "88b053", "7a87c6", "e49635",
    "dfc35a", "c4281b", "a59b8f", "b39fe1",
]

# Severity buckets — triage labeling only now, no longer the detection trigger.
THRESHOLDS = {
    "deforestation":  {"low": 1,   "medium": 10,  "high": 50,  "critical": 100},
    "encroachment":   {"low": 0.5, "medium": 5,   "high": 25,  "critical": 50},
    "agri_in_forest": {"low": 2,   "medium": 20,  "high": 100, "critical": 200},
    "tree_to_bare":   {"low": 1,   "medium": 10,  "high": 50,  "critical": 100},
}

# ── Anomaly detection parameters ─────────────────────────────────────────────
# ANOMALY_Z_THRESHOLD: validated against 2 real Chhattisgarh clearings
# (z ≈ -5.37, z ≈ -16.18) against stable-forest controls sitting near 0 —
# see module docstring. 2.5 leaves wide margin below both real sites
# while still being a standard "clearly abnormal" statistical cutoff.
ANOMALY_Z_THRESHOLD           = 2.5
MIN_CLUSTER_HA                = 0.5     # minimum mapping unit — kills pixel noise
BASELINE_LOOKBACK_DAYS        = 365     # rolling baseline window length
BASELINE_EXCLUDE_RECENT_DAYS  = 30      # baseline never includes the most recent N days
CURRENT_WINDOW_DAYS           = 15      # "nrt" mode — current observation window
ANNUAL_CURRENT_WINDOW_DAYS    = 60      # "annual" mode — wider, less noise-sensitive
PERSISTENCE_REQUIRED          = 2       # consecutive detections needed to promote
SITE_MATCH_BUFFER_DEG         = 0.0008  # ≈80-90 m at this latitude — re-detection tolerance
NDVI_DROP_THRESHOLD           = 0.10    # mean NDVI drop considered "agrees" with trees-prob drop

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


# ── Window helpers ────────────────────────────────────────────────────────────
def detection_windows(current_end: str, mode: str = "nrt") -> dict:
    """
    Compute the actual baseline/current windows for a run from a single
    end date. "current" is the live observation window; "baseline" is
    the rolling history used to build the median/stdDev envelope, ending
    far enough back that it can't be contaminated by the change itself.
    """
    current_window_days = (
        ANNUAL_CURRENT_WINDOW_DAYS if mode == "annual" else CURRENT_WINDOW_DAYS
    )
    end = datetime.strptime(current_end, "%Y-%m-%d").date()
    current_start = end - timedelta(days=current_window_days)

    exclude_days = max(BASELINE_EXCLUDE_RECENT_DAYS, current_window_days)
    baseline_end = end - timedelta(days=exclude_days)
    baseline_start = baseline_end - timedelta(days=BASELINE_LOOKBACK_DAYS)

    return {
        "current_start":       str(current_start),
        "current_end":         str(end),
        "baseline_start":      str(baseline_start),
        "baseline_end":        str(baseline_end),
        "current_window_days": current_window_days,
    }


# ── Composite / display helpers (used for preview + current land cover) ─────
def _composite(aoi, start: str, end: str):
    """
    Mean-probability composite → argMax label. Used for the AOI preview
    endpoint and as the "what does it look like now" display/categorisation
    layer — NOT the basis for change detection itself (see _baseline_stats /
    _current_signal / _anomaly_zscore below for that).

    No per-image confidence pre-masking — an earlier version of this
    function masked low top-1-probability pixels before averaging, which
    silently dropped ~40% of real AOI coverage. Temporal averaging across
    the whole window is the noise-reduction mechanism; every pixel always
    gets a best-guess label.

    Returns (label_image, mean_probs_image, raw_collection, image_count).
    """
    dw = (
        ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
        .filterBounds(aoi)
        .filterDate(start, end)
    )
    count = dw.size().getInfo()

    mean_probs = dw.select(CLASS_NAMES).mean()
    # ee.Image has arrayArgmax(), NOT argmax() — confirmed against eedocs.txt.
    label = mean_probs.toArray().arrayArgmax().arrayGet([0]).rename("label").toUint8()
    return label, mean_probs, dw, count


def _area_ha(mask, aoi, scale: int = 100) -> float:
    r = (
        ee.Image.pixelArea()
        .updateMask(mask)
        .reduceRegion(ee.Reducer.sum(), aoi, scale, maxPixels=1e13, bestEffort=True)
        .get("area")
    )
    return round((ee.Number(r).getInfo() or 0) / 10_000, 2)


def _severity(change_type: str, area_ha: float):
    t = THRESHOLDS.get(change_type, {})
    for level in ("critical", "high", "medium", "low"):
        if area_ha >= t.get(level, float("inf")):
            return level
    return None


def _class_distribution(label_image, aoi) -> dict:
    """Returns {class_name: area_ha} for every DW class in the AOI."""
    freq = label_image.reduceRegion(
        reducer=ee.Reducer.frequencyHistogram(),
        geometry=aoi,
        scale=10,
        maxPixels=1e13,
        bestEffort=True,
    ).get("label")

    hist = (ee.Dictionary(freq).getInfo() or {})
    pixel_ha = 0.01  # scale=10m → 100 m² → 0.01 ha

    return {
        name: round(float(hist.get(str(i), 0) or 0) * pixel_ha, 2)
        for i, name in enumerate(CLASS_NAMES)
    }


def get_tile_urls(aoi, baseline_end: str, current_end: str, current_label) -> dict:
    """
    Generate GEE tile URLs for the map panel. Clip every image to the
    region before calling getMapId() — otherwise the tile serves the
    entire Sentinel-2 granule (~100 km × 100 km).
    """
    S2_VIS = {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000, "gamma": 1.4}
    DW_VIS = {"min": 0, "max": 8, "palette": DW_PALETTE}

    def best_s2(start: str, end: str, max_cloud: int = 35):
        return (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(aoi)
            .filterDate(start, end)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", max_cloud))
            .sort("CLOUDY_PIXEL_PERCENTAGE")
            .first()
        )

    def tile_url(image, vis: dict):
        try:
            clipped = image.clip(aoi)
            return clipped.visualize(**vis).getMapId()["tile_fetcher"].url_format
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


# ── Core anomaly-detection primitives ────────────────────────────────────────
def _baseline_stats(aoi, baseline_start: str, baseline_end: str):
    """
    Rolling baseline for the 'trees' probability band: per-pixel median +
    stdDev over [baseline_start, baseline_end], plus a baseline land-cover
    label (mean-prob/argMax composite over the same window) used for
    stratification. The caller already excludes the most recent
    observation period from this window (see detection_windows()), so the
    baseline can't be contaminated by the change being measured.

    Returns (median_img, stddev_img, baseline_label, image_count).
    """
    dw = (
        ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
        .filterBounds(aoi)
        .filterDate(baseline_start, baseline_end)
    )
    count = dw.size().getInfo()

    trees_series = dw.select("trees")
    median_img = trees_series.reduce(ee.Reducer.median()).rename("trees_median")
    stddev_img = trees_series.reduce(ee.Reducer.stdDev()).rename("trees_stddev")

    mean_probs = dw.select(CLASS_NAMES).mean()
    baseline_label = (
        mean_probs.toArray().arrayArgmax().arrayGet([0]).rename("label").toUint8()
    )
    return median_img, stddev_img, baseline_label, count


def _current_signal(aoi, current_start: str, current_end: str):
    """Mean 'trees' probability over the live observation window."""
    dw = (
        ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
        .filterBounds(aoi)
        .filterDate(current_start, current_end)
    )
    count = dw.size().getInfo()
    current_trees = dw.select("trees").mean().rename("trees_current")
    return current_trees, count


def _anomaly_zscore(current_trees, median_img, stddev_img):
    """
    z = (current − median) / stdDev. stdDev is floored at 0.02 so
    near-constant pixels (permanent water, dense built-up — where
    trees-probability barely moves) don't produce extreme z from
    dividing by a near-zero denominator.
    """
    safe_stddev = stddev_img.max(0.02)
    return current_trees.subtract(median_img).divide(safe_stddev).rename("z")


def _candidate_mask(z_image, baseline_label):
    """
    Anomalous AND was forest at baseline. Thresholds on z <= -threshold
    only — a *rise* in trees-probability is not a forest-loss signal, so
    this is deliberately not an absolute-value test.
    """
    fell = z_image.lte(-ANOMALY_Z_THRESHOLD)
    was_forest = baseline_label.eq(TREES_IDX)
    return fell.And(was_forest)


def _spatial_filter(mask, min_ha: float = MIN_CLUSTER_HA, scale: int = 10):
    """
    Minimum-mapping-unit filter via connectedPixelCount — the same
    convention GLAD/Hansen-style disturbance alerts use to kill
    salt-and-pepper single/few-pixel classifier noise before it ever
    reaches a human.
    """
    min_pixels = max(2, int(round((min_ha * 10_000) / (scale * scale))))
    pixel_count = mask.selfMask().connectedPixelCount(maxSize=256, eightConnected=True)
    return mask.And(pixel_count.gte(min_pixels))


def _vectorize_clusters(mask, aoi, scale: int = 10) -> list:
    """
    Vectorise surviving anomaly clusters. reduceToVectors with
    countEvery() also returns a per-polygon pixel 'count' property, reused
    directly for hectare area instead of a second reduceRegion round trip.
    """
    try:
        fc = (
            mask.selfMask()
            .reduceToVectors(
                reducer=ee.Reducer.countEvery(),
                geometry=aoi,
                scale=scale,
                maxPixels=1e10,
                geometryType="polygon",
                eightConnected=True,
            )
            .getInfo()
        )
        return fc.get("features", [])
    except Exception as exc:
        log.warning("Cluster vectorisation failed: %s", exc)
        return []


def _classify_cluster(current_label, cluster_geom, scale: int = 10) -> str:
    """
    Post-hoc triage label for a validated disturbance cluster: what does
    the destination land cover actually look like right now? This is
    classification, not detection — the cluster has already passed the
    anomaly + stratification + spatial-coherence gates above.
    """
    mode_val = current_label.reduceRegion(
        ee.Reducer.mode(), cluster_geom, scale, maxPixels=1e9, bestEffort=True
    ).get("label")
    idx = ee.Number(mode_val).getInfo()
    if idx is None:
        return "deforestation"
    idx = int(round(idx))
    if idx == CLASS_IDX["built"]:
        return "encroachment"
    if idx == CLASS_IDX["crops"]:
        return "agri_in_forest"
    if idx == CLASS_IDX["bare"]:
        return "tree_to_bare"
    return "deforestation"


def _ndvi_drop_agrees(geom, baseline_start, baseline_end, current_start, current_end) -> bool:
    """
    Secondary, independent corroborating signal: did NDVI also drop over
    the same cluster? Trees-probability (a learned DW classifier output)
    and NDVI (a direct spectral vegetation index) respond to different
    parts of the signal, so agreement between them is real evidence, not
    a restatement of the same measurement. Best-effort — returns False
    (not "agrees") on any failure rather than blocking the run.
    """
    try:
        def ndvi_mean(start, end):
            col = (
                ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                .filterBounds(geom)
                .filterDate(start, end)
                .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40))
            )
            ndvi = col.map(lambda img: img.normalizedDifference(["B8", "B4"]).rename("ndvi"))
            return ndvi.mean()

        diff = ndvi_mean(baseline_start, baseline_end).subtract(ndvi_mean(current_start, current_end))
        val = diff.reduceRegion(
            ee.Reducer.mean(), geom, scale=20, maxPixels=1e9, bestEffort=True
        ).get("ndvi")
        delta = ee.Number(val).getInfo()
        return bool(delta and delta > NDVI_DROP_THRESHOLD)
    except Exception as exc:
        log.warning("NDVI agreement check failed: %s", exc)
        return False


# ── Confidence scoring ────────────────────────────────────────────────────────
def _normalize(value: float, cap: float) -> float:
    return max(0.0, min(1.0, abs(value) / cap)) if cap else 0.0


def _compute_confidence(anomaly_z: float, persistence_count: int, cluster_pixels: int, ndvi_agrees: bool) -> float:
    """
    0-100 confidence score:
      40% how big the anomaly is        (|z|, capped at 5)
      25% how many times it's persisted (capped at 3 passes)
      20% how large the cluster is      (pixels, capped at 50)
      15% does NDVI independently agree (binary)

    This is a starting calibration, not a derived constant — it becomes
    accurate only through officer feedback (confirmed/false_alarm
    outcomes) recalibrating these weights and the promotion threshold
    over time, the same loop eNetra describes closing in Guna, MP.
    """
    score = (
        40 * _normalize(anomaly_z, cap=5)
        + 25 * _normalize(persistence_count, cap=3)
        + 20 * _normalize(cluster_pixels, cap=50)
        + 15 * (1.0 if ndvi_agrees else 0.0)
    )
    return round(score, 1)


# ── Explainability bundle ─────────────────────────────────────────────────────
def _timeseries(geom, lookback_start: str, lookback_end: str, scale: int = 20) -> list:
    """
    Trees-probability over time for a cluster — the actual evidence an
    officer reads, not a black-box score. One FeatureCollection.getInfo()
    call for the whole series (the standard GEE "chart time series"
    pattern), not one getInfo() per image.
    """
    try:
        col = (
            ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
            .filterBounds(geom)
            .filterDate(lookback_start, lookback_end)
            .sort("system:time_start")
        )

        def to_feature(img):
            val = img.select("trees").reduceRegion(
                ee.Reducer.mean(), geom, scale, maxPixels=1e8, bestEffort=True
            ).get("trees")
            return ee.Feature(None, {
                "date": img.date().format("YYYY-MM-dd"),
                "trees_prob": val,
            })

        fc = ee.FeatureCollection(col.map(to_feature)).getInfo()
        out = []
        for feat in fc.get("features", []):
            p = feat.get("properties", {})
            if p.get("trees_prob") is not None:
                out.append({"date": p["date"], "trees_prob": round(float(p["trees_prob"]), 3)})
        return out
    except Exception as exc:
        log.warning("Time series fetch failed: %s", exc)
        return []


def _explainability_bundle(
    cluster_geom, baseline_end, current_end, current_label,
    baseline_prob, current_prob, z, persistence_count, area_ha,
    first_detected_at, change_type,
) -> dict:
    """
    Bundles everything an officer needs to judge an alert without
    trusting a bare number: a ~12-month trees-probability time series,
    a tight before/after Sentinel-2 crop around the cluster (buffered for
    visual context), and a generated caption with the actual measured
    values filled in.
    """
    lookback_start = (
        datetime.strptime(current_end, "%Y-%m-%d").date() - timedelta(days=BASELINE_LOOKBACK_DAYS)
    ).strftime("%Y-%m-%d")
    timeseries = _timeseries(cluster_geom, lookback_start, current_end)

    tile_geom = cluster_geom.buffer(150)
    tiles = get_tile_urls(tile_geom, baseline_end, current_end, current_label)

    caption = (
        f"Trees probability fell from {baseline_prob:.2f} to {current_prob:.2f} "
        f"({abs(z):.1f}\u03c3 below the {BASELINE_LOOKBACK_DAYS // 30}-month seasonal baseline). "
        f"Confirmed on {persistence_count} consecutive pass(es)"
        + (f", first detected {first_detected_at}." if first_detected_at else ".")
        + f" Cluster area \u2248 {area_ha:.2f} ha, classified as {change_type.replace('_', ' ')}."
    )

    return {
        "timeseries":      timeseries,
        "before_tile_url": tiles.get("before_s2"),
        "after_tile_url":  tiles.get("after_s2"),
        "dw_tile_url":     tiles.get("dw_label"),
        "caption":         caption,
    }


# ── Site persistence matching ─────────────────────────────────────────────────
def _site_geom_matches(existing_geojson: str, candidate_geom_dict: dict,
                        buffer_deg: float = SITE_MATCH_BUFFER_DEG) -> bool:
    try:
        existing  = shapely_shape(json.loads(existing_geojson))
        candidate = shapely_shape(candidate_geom_dict)
        return existing.buffer(buffer_deg).intersects(candidate.buffer(buffer_deg))
    except Exception:
        return False


def _find_matching_site(db, aoi_id: str, candidate_geom_dict: dict):
    """
    Match by location only, not change_type — a site's destination land
    cover can shift between runs (e.g. cleared first, built on later)
    while remaining the same physical place under persistence tracking.
    """
    open_sites = (
        db.query(Site)
        .filter(Site.aoi_id == aoi_id, Site.status.in_(["candidate", "open"]))
        .all()
    )
    for site in open_sites:
        if _site_geom_matches(site.geom_geojson, candidate_geom_dict):
            return site
    return None


# ── Main detection entry point ────────────────────────────────────────────────
def run_gee_detection(
    run_id: str,
    aoi_geojson: dict,
    current_end: str,
    mode: str = "nrt",
) -> None:
    """
    Background task called by FastAPI BackgroundTasks.

    1. Compute the rolling baseline (median/stdDev of trees-probability
       over ~12 months, excluding the most recent window) + baseline
       forest mask.
    2. Compute the current observation signal.
    3. Score anomaly z, stratify to baseline-forest pixels, apply the
       minimum-mapping-unit spatial filter.
    4. Vectorise surviving clusters; classify each by destination land
       cover.
    5. Match each cluster against existing Sites for this AOI:
         - match found  → bump persistence_count, update last_observed_at;
                           promote candidate → open once the persistence
                           requirement is met, creating/refreshing the
                           officer-visible Alert + explainability bundle.
         - no match     → create a new candidate Site (persistence_count=1),
                           NOT yet visible as an alert.
    6. Persist run-level stats + tile URLs for the map/preview layer.
    """
    _init()
    aoi = ee.Geometry(aoi_geojson)
    windows = detection_windows(current_end, mode)
    baseline_start, baseline_end = windows["baseline_start"], windows["baseline_end"]
    current_start = windows["current_start"]
    log.info("[%s] mode=%s  baseline %s/%s  current %s/%s",
             run_id[:8], mode, baseline_start, baseline_end, current_start, current_end)

    try:
        # ── Baseline + current signal ────────────────────────────────────────
        median_img, stddev_img, baseline_label, b_count = _baseline_stats(
            aoi, baseline_start, baseline_end
        )
        current_trees, c_count = _current_signal(aoi, current_start, current_end)
        log.info("[%s] images baseline:%d current:%d", run_id[:8], b_count, c_count)

        if b_count < 4:
            raise RuntimeError(
                f"Only {b_count} baseline image(s) over {baseline_start}\u2192{baseline_end} "
                "— not enough history yet to build a reliable seasonal envelope."
            )

        run_status = "done"
        if c_count < 2:
            log.warning("[%s] only %d current image(s) — likely monsoon cloud cover",
                        run_id[:8], c_count)
            run_status = "low_confidence"

        # ── Anomaly + stratification + spatial filter ───────────────────────
        z_image = _anomaly_zscore(current_trees, median_img, stddev_img)
        disturbance_mask = _candidate_mask(z_image, baseline_label)
        disturbance_mask = _spatial_filter(disturbance_mask)

        # ── Current land cover (display layer + per-cluster classification) ─
        current_label, _current_probs, _current_col, _ = _composite(aoi, current_start, current_end)

        # ── Whole-AOI stats, for the run summary panel ───────────────────────
        disturbance_ha = _area_ha(disturbance_mask, aoi, scale=10)
        baseline_dist = _class_distribution(baseline_label, aoi)
        current_dist  = _class_distribution(current_label, aoi)

        # ── Vectorise + classify clusters ───────────────────────────────────
        features = _vectorize_clusters(disturbance_mask, aoi)
        log.info("[%s] %d candidate cluster(s) after spatial filter, %.2f ha total",
                 run_id[:8], len(features), disturbance_ha)

        areas = {"deforestation": 0.0, "encroachment": 0.0, "agri_in_forest": 0.0, "tree_to_bare": 0.0}
        pixel_area_ha = (10 * 10) / 10_000  # scale=10 vectorisation

        clusters = []
        for feat in features:
            pixel_count = int(feat.get("properties", {}).get("count", 0) or 0)
            area_ha = round(pixel_count * pixel_area_ha, 3)
            if area_ha <= 0:
                continue
            geom_dict = feat["geometry"]
            cluster_geom = ee.Geometry(geom_dict)
            change_type = _classify_cluster(current_label, cluster_geom)
            areas[change_type] = round(areas.get(change_type, 0.0) + area_ha, 3)

            b_prob = ee.Number(
                median_img.reduceRegion(ee.Reducer.mean(), cluster_geom, 10, bestEffort=True).get("trees_median")
            ).getInfo()
            c_prob = ee.Number(
                current_trees.reduceRegion(ee.Reducer.mean(), cluster_geom, 10, bestEffort=True).get("trees_current")
            ).getInfo()
            cluster_z = ee.Number(
                z_image.reduceRegion(ee.Reducer.mean(), cluster_geom, 10, bestEffort=True).get("z")
            ).getInfo()

            clusters.append({
                "geom_dict":     geom_dict,
                "change_type":   change_type,
                "area_ha":       area_ha,
                "pixel_count":   pixel_count,
                "baseline_prob": round(b_prob or 0.0, 3),
                "current_prob":  round(c_prob or 0.0, 3),
                "z":             round(cluster_z or 0.0, 2),
            })

        # ── Tile URLs for the AOI-wide map layer ──────────────────────────────
        urls = get_tile_urls(aoi, baseline_end, current_end, current_label)

        # ── Raster export to GCS (z-score + disturbance mask, for audit) ──────
        export_image = z_image.rename("z").addBands(disturbance_mask.rename("disturbance").toUint8())
        gcs_key = f"runs/{run_id[:8]}/anomaly"
        task = ee.batch.Export.image.toCloudStorage(
            image=export_image,
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

        # ── Persist run ────────────────────────────────────────────────────────
        tile_expires = datetime.utcnow() + timedelta(hours=2)
        with get_session() as db:
            run = db.query(ChangeRun).filter(ChangeRun.id == run_id).first()
            run.status            = run_status
            run.detection_mode    = mode
            run.baseline_start    = datetime.strptime(baseline_start, "%Y-%m-%d").date()
            run.baseline_end      = datetime.strptime(baseline_end, "%Y-%m-%d").date()
            run.current_start     = datetime.strptime(current_start, "%Y-%m-%d").date()
            run.current_end       = datetime.strptime(current_end, "%Y-%m-%d").date()
            run.baseline_images   = b_count
            run.current_images    = c_count
            run.deforestation_ha  = areas["deforestation"]
            run.encroachment_ha   = areas["encroachment"]
            run.agri_in_forest_ha = areas["agri_in_forest"]
            run.tree_to_bare_ha   = areas["tree_to_bare"]
            run.any_change_ha     = disturbance_ha
            run.raster_path            = f"gs://{settings.gcs_bucket}/{gcs_key}.tif"
            run.gee_task_ids           = json.dumps({"raster": gee_task_id})
            run.class_distribution     = json.dumps(current_dist)
            run.baseline_distribution  = json.dumps(baseline_dist)
            run.dw_tile_url        = urls.get("dw_label")
            run.before_tile_url    = urls.get("before_s2")
            run.after_tile_url     = urls.get("after_s2")
            run.tile_expires_at    = tile_expires
            aoi_id = run.aoi_id

        # ── Site matching, persistence, alert promotion ──────────────────────
        now = datetime.utcnow()
        with get_session() as db:
            for cl in clusters:
                site = _find_matching_site(db, aoi_id, cl["geom_dict"])

                if site is None:
                    site = Site(
                        aoi_id=aoi_id,
                        change_type=cl["change_type"],
                        geom_geojson=json.dumps(cl["geom_dict"]),
                        status="candidate",
                        persistence_count=1,
                        first_detected_at=now,
                        last_observed_at=now,
                    )
                    db.add(site)
                    db.flush()
                    log.info("[%s] new candidate site %s (%s, %.2f ha, z=%.1f) — awaiting confirming pass",
                             run_id[:8], site.id[:8], cl["change_type"], cl["area_ha"], cl["z"])
                    continue  # not promoted yet — needs a second, confirming pass

                # Re-detected — bump persistence, refresh geometry/type
                site.persistence_count = (site.persistence_count or 1) + 1
                site.last_observed_at  = now
                site.change_type       = cl["change_type"]
                site.geom_geojson      = json.dumps(cl["geom_dict"])

                ndvi_agrees = _ndvi_drop_agrees(
                    ee.Geometry(cl["geom_dict"]).buffer(50),
                    baseline_start, baseline_end, current_start, current_end,
                )
                confidence = _compute_confidence(
                    anomaly_z=cl["z"],
                    persistence_count=site.persistence_count,
                    cluster_pixels=cl["pixel_count"],
                    ndvi_agrees=ndvi_agrees,
                )
                severity = _severity(cl["change_type"], cl["area_ha"])

                if site.status == "candidate" and site.persistence_count >= PERSISTENCE_REQUIRED:
                    site.status = "open"
                    log.info("[%s] site %s PROMOTED to open alert (persistence=%d)",
                             run_id[:8], site.id[:8], site.persistence_count)

                if site.status == "open":
                    bundle = _explainability_bundle(
                        ee.Geometry(cl["geom_dict"]), baseline_end, current_end, current_label,
                        cl["baseline_prob"], cl["current_prob"], cl["z"],
                        site.persistence_count, cl["area_ha"],
                        site.first_detected_at.strftime("%Y-%m-%d") if site.first_detected_at else None,
                        cl["change_type"],
                    )

                    existing_alert = (
                        db.query(Alert)
                        .filter(Alert.site_id == site.id, Alert.status == "open")
                        .order_by(Alert.created_at.desc())
                        .first()
                    )
                    if existing_alert:
                        existing_alert.run_id                = run_id
                        existing_alert.area_ha                = cl["area_ha"]
                        existing_alert.severity               = severity or existing_alert.severity
                        existing_alert.anomaly_z_score        = cl["z"]
                        existing_alert.baseline_trees_prob    = cl["baseline_prob"]
                        existing_alert.current_trees_prob     = cl["current_prob"]
                        existing_alert.persistence_count      = site.persistence_count
                        existing_alert.confidence              = confidence
                        existing_alert.explainability_bundle  = json.dumps(bundle)
                    else:
                        db.add(Alert(
                            id=str(uuid.uuid4()),
                            aoi_id=aoi_id,
                            run_id=run_id,
                            site_id=site.id,
                            detection_mode=mode,
                            change_type=cl["change_type"],
                            severity=severity or "low",
                            area_ha=cl["area_ha"],
                            first_detected_at=site.first_detected_at.date() if site.first_detected_at else None,
                            anomaly_z_score=cl["z"],
                            baseline_trees_prob=cl["baseline_prob"],
                            current_trees_prob=cl["current_prob"],
                            persistence_count=site.persistence_count,
                            confidence=confidence,
                            explainability_bundle=json.dumps(bundle),
                            status="open",
                        ))

                # Map layer vector — kept for candidates too, so officers can
                # see sites forming before they're promoted.
                db.add(ChangeVector(
                    run_id=run_id,
                    change_type=cl["change_type"],
                    geojson=json.dumps({
                        "type": "FeatureCollection",
                        "features": [{
                            "type": "Feature",
                            "geometry": cl["geom_dict"],
                            "properties": {
                                "change_type": cl["change_type"],
                                "area_ha": cl["area_ha"],
                                "site_id": site.id,
                                "site_status": site.status,
                            },
                        }],
                    }),
                ))

        log.info("[%s] complete  status=%s  clusters=%d  gee_task=%s",
                 run_id[:8], run_status, len(clusters), gee_task_id[:16])

    except Exception as exc:
        log.error("[%s] failed: %s", run_id[:8], exc)
        with get_session() as db:
            run = db.query(ChangeRun).filter(ChangeRun.id == run_id).first()
            if run:
                run.status       = "failed"
                run.gee_task_ids = json.dumps({"error": str(exc)})
        raise