/**
 * Dynamic World V1 class palette — these are the dataset's own official
 * visualization colors (from Google's GEE catalog entry), not part of
 * the app's design system. A satellite land-cover raster needs to render
 * in the colors the data is published in; recoloring it to fit brand
 * tokens would make it harder to cross-reference against any other DW
 * tool or publication. See ARCHITECTURE.md §8 for the same palette used
 * server-side.
 */
export const DW_CLASSES = [
  { key: 'water',              label: 'Water',               color: '#419bdf' },
  { key: 'trees',               label: 'Trees / Forest',      color: '#397d49' },
  { key: 'grass',               label: 'Grassland',           color: '#88b053' },
  { key: 'flooded_vegetation',  label: 'Flooded Vegetation',  color: '#7a87c6' },
  { key: 'crops',                label: 'Crops',               color: '#e49635' },
  { key: 'shrub_and_scrub',      label: 'Shrub & Scrub',       color: '#dfc35a' },
  { key: 'built',                label: 'Built-up',            color: '#c4281b' },
  { key: 'bare',                 label: 'Bare Soil',           color: '#a59b8f' },
  { key: 'snow_and_ice',         label: 'Snow / Ice',          color: '#b39fe1' },
]

export const DW_LOOKUP = Object.fromEntries(DW_CLASSES.map(c => [c.key, c]))

export const CHANGE_TYPES = {
  deforestation:  { label: 'Deforestation',     color: 'var(--change-deforestation)' },
  encroachment:   { label: 'Encroachment',      color: 'var(--change-encroachment)' },
  agri_in_forest: { label: 'Agri. Encroachment',color: 'var(--change-agri)' },
  tree_to_bare:   { label: 'Tree → Bare',       color: 'var(--change-bare)' },
}

export const OFFICER_REASONS = {
  cloud_shadow:   'Cloud / shadow misclassification',
  harvest:        'Authorised harvest',
  seasonal_flood: 'Seasonal flooding',
  natural_fall:   'Natural tree fall',
  other:          'Other',
}
