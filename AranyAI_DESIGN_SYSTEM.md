# AranyAI Design System
> Government Enterprise · Forest Monitoring Command Console
> Counterpart to DESIGN.md — same documentation rigor, opposite aesthetic intent.

---

## 1. Visual Theme & Atmosphere

AranyAI reads like an operations console, not a marketing page: a forest
officer scanning this screen needs to find the highest-severity alert in
under three seconds. Every visual decision optimizes for **density and
scanability** over breathing room. The canvas is white/light-gray
(`#F9FAFB`/`#FFFFFF`), never tinted or warm — sterility here signals
"this is official data," the opposite of a consumer brand's editorial warmth.

The dominant visual gesture is the **bordered rectangle**: panel sections,
data tables, stat cards, and badges all use the same tight 2–4px radius and
a 1px gray border. There are no circles except status dots, no pills except
severity badges, and no shadows except on floating overlays. Where Mastercard
uses radius and shadow as identity, AranyAI uses **structure and borders** —
horizontal rules between sections, table grid lines, left-border accent
stripes on stat cards — because borders read as "data," and shadows read as
"marketing."

Color carries meaning, not branding: navy is the only decorative color
(header, links, focus rings); every other color is semantic (severity
badges, change-type dots) and appears nowhere else. If a color shows up on
screen, it is telling the officer something true about the data.

**Key Characteristics:**
- White/light-gray canvas, navy-800 (`#1A3C6E`) as the single brand accent
- Tight, near-uniform radius: 2px (badges), 4px (everything else), 50% (status dots only)
- Structure via 1px borders and section dividers, not shadows — shadows reserved for floating overlays only
- Uppercase 10px/700/+0.5–0.8px-tracking label scale used pervasively (section heads, table headers, stat labels, badges) — not a rare accent like a marketing "eyebrow," but the default way AranyAI labels anything
- Severity badges (critical/high/medium/low) and change-type dots are the only saturated color in the UI
- Government-portal typography: Inter / Noto Sans, no display face, no script, no serif

---

## 2. Color Palette & Roles

### Primary
- **Navy-800** (`#1A3C6E`): The brand color. Header background, primary buttons, focus rings, links. Used nowhere decoratively — every navy element is either a brand anchor (header/footer) or an actionable control (button/link).
- **Navy-950** (`#0B1F3A`): Header border-bottom and footer background — the "ink" of the system.

### Secondary & Accent (Change Types)
- **Deforestation** (`#B91C1C`): trees → non-tree transitions.
- **Encroachment** (`#C2410C`): natural cover → built.
- **Agri. Encroachment** (`#A16207`): trees → crops.
- **Tree → Bare** (`#6D28D9`): trees → bare soil.
These four colors appear ONLY as: stat-card left-border stripes, change-dot
indicators in the alert table, and change-polygon fills on the map. They are
never used for buttons, links, or chrome — this keeps them legible as a
*data classification*, not a brand palette.

### Surface & Background
- **Gray-50** (`#F9FAFB`): Page canvas, table header rows, section heads.
- **White** (`#FFFFFF`): Panel/card surfaces, the floating Layer Controls overlay.
- **Gray-100/150** (`#F3F4F6`/`#EDEFF2`): Rare nested-surface fills.
- **Navy-50** (`#EFF6FF`): The one tinted surface — used only for the Detection Window callout and assigned-status badges, signaling "this is configuration/system state," not data.

### Neutrals & Text
- **Gray-900** (`#111827`): Primary body text.
- **Gray-700/600** (`#374151`/`#4B5563`): Table cell text, secondary labels.
- **Gray-500** (`#6B7280`): Muted text, table header labels, footer.
- **Gray-300/200** (`#D1D5DB`/`#E5E7EB`): Borders and dividers — the system's primary structural device.

### Semantic (Severity)
- **Critical**: bg `#FEF2F2` / text `#991B1B` / border `#FCA5A5`
- **High**: bg `#FFF7ED` / text `#9A3412` / border `#FDBA74`
- **Medium**: bg `#FEFCE8` / text `#854D0E` / border `#FDE047`
- **Low**: bg `#EFF6FF` / text `#1D4ED8` / border `#93C5FD`
- **Status** (open/assigned/resolved/dismissed): green/navy/gray/gray pairs, same bg+text+border pattern as severity.

### Gradient System
None. Zero gradients anywhere in the system — flat fills only. This is a
deliberate choice, documented the same way DESIGN.md documents its (also
gradient-free) system: flat color reads as "instrument panel," gradients
read as "marketing surface."

---

## 3. Typography Rules

### Font Family
- **Primary**: `Inter` — UI text, data, buttons, tables.
- **Secondary**: `Noto Sans` — fallback before system-ui, ensures Devanagari/regional script support for future localization.
- **Fallback stack**: `'Segoe UI', system-ui, sans-serif`.

### Hierarchy

| Role | Size | Weight | Transform | Letter Spacing | Used for |
|------|------|--------|-----------|-----------------|----------|
| Brand name | 15px | 700 | none | 0.3px | Header logotype only |
| Label scale | 10px | 700 | uppercase | 0.5–0.8px | Section heads, table headers, stat labels, badges — the default labeling unit across the whole system |
| Body | 13px | 400 | none | normal | Base text size, table cell content |
| Stat value | 20px | 700 | none | normal | The four change-type ha numbers — the only "loud" numerals on screen |
| Button | 12px | 600 | none | 0.2px | All button labels |
| Form label | 11px | 600 | none | 0.3px | Select/input labels |
| Mono/data | 11–13px | 400 | none | normal | Dates, IDs, GCS paths, coordinates — monospace signals "raw value, not prose" |
| Footer | 10px | 400 | none | 0.3px | Copyright/attribution strip |

### Principles
- **The label scale is the system's signature**, not a rare accent. Every structural label — section heads, table headers, stat labels, badges — uses the identical 10px/700/uppercase/+0.5–0.8px treatment. This is the opposite of DESIGN.md's "uppercase only on one rare eyebrow scale" rule, and deliberately so: a dashboard wants every label instantly recognizable as a label, at a glance, everywhere.
- **No display weight, no negative tracking.** Headlines elsewhere often use tight negative letter-spacing for editorial density; AranyAI never does — every heading here is functional (a panel title), not a hero, so default tracking stays neutral or slightly positive (labels only).
- **One font, three weights** (400/600/700). No 450, no light weights — a government system reads more credibly in standard, unfussy weights.
- **Monospace for anything literal.** Dates, run IDs, GCS paths, lat/lon all render in `'Courier New', monospace` — this is AranyAI's equivalent of DESIGN.md's "weight 450 is load-bearing": one quiet typographic rule that, once you notice it, explains why the data feels trustworthy rather than decorative.

---

## 4. Component Stylings

### Buttons

**Primary — Navy Fill**
- Background `var(--navy-800)`, text white, border `var(--navy-900)`
- Radius 4px · padding `7px 16px` · font 12px/600/+0.2px
- Hover: `var(--navy-700)` · Disabled: opacity 0.5
- Use for: the one primary action per panel (Run NRT Detection)

**Secondary — Outlined**
- Background white, text `var(--gray-700)`, border `var(--gray-300)`
- Same radius/padding/font as primary
- Hover: `var(--gray-50)` background, `var(--gray-400)` border
- Use for: Assign, secondary table-row actions

**Danger — Outlined Red**
- Background white, text `var(--critical-text)`, border `var(--critical-border)`
- Hover: `var(--critical-bg)` background
- Use for: Resolve (a deliberate, slightly alarming action)

### Badges (Severity / Status)
- Inline-block, padding `2px 8px`, radius 2px, border 1px solid
- Font 10px/700/uppercase/+0.5px
- bg/text/border triplet per severity or status (see §2)
- The 2px radius (smaller than every other component's 4px) is deliberate — badges should read as "stamps," not buttons.

### Stat Card
- Background `var(--gray-50)`, border `var(--gray-200)`, radius 4px
- **Left border: 3px solid**, colored by change type — the only place a left-accent-border pattern appears, reserved for "this number belongs to this category"
- Value: 20px/700 · Label: 10px/700/uppercase/+0.5px, `var(--gray-500)`

### Data Table
- `border-collapse: collapse`, 12px body font
- Header row: `var(--gray-50)` bg, 10px/700/uppercase label, 2px bottom border
- Body rows: 1px bottom border (`var(--gray-100)`), hover bg `var(--gray-50)`
- Mono cells (dates/IDs) in `var(--gray-500)`, value cells in `var(--gray-700)` with `font-variant-numeric: tabular-nums`

### Panel Section
- Bordered container, no shadow, no radius (full-bleed inside the side panel)
- Header: `var(--gray-50)` bg, 1px bottom border, 10px/700/uppercase title + optional muted count badge
- Body: `12-14px` padding, white background

### Detection Window Callout
- The one tinted-surface component: `var(--navy-50)` bg, `var(--navy-100)` border, radius 4px
- Signals "system-computed configuration," distinct from data (which is always white/gray)

### Layer Controls (Floating Map Overlay)
- White background, 1px `var(--gray-300)` border, radius 4px
- **Elevation Level 2** (see §6) — the only card-level shadow in the whole system besides map popups
- Fixed width 210px, positioned bottom-left over the map

### Run Status Indicator
- 7–8px circular dot + label, color-coded by status (pending/running/done/failed/low_confidence)
- `running` pulses via opacity animation — the only animation in the system, reserved for "something is actively happening server-side"

---

## 5. Layout Principles

### Spacing System
- **Base unit**: 4px (not Mastercard's 8px — a denser system needs a finer grid)
- **Scale in use**: 4 / 6 / 7 / 8 / 9 / 10 / 12 / 14 / 16 / 20 — deliberately includes odd values (7px, 9px) where a 4px-only grid felt too loose for tight chrome like section headers
- **Panel section padding**: 12–14px horizontal, consistent across all sections
- **Section vertical rhythm**: panel sections stack with no gap (border-separated, not space-separated) — the opposite of an editorial page's generous section padding

### Grid & Container
- Two-pane fixed layout: map (flex:1, fills remaining width) + side panel (380px fixed, 320px on tablet — see §8)
- No max-width cap — this is a full-bleed operational console, not a centered content page

### Whitespace Philosophy
AranyAI treats whitespace as **scarce**, not structural. Where DESIGN.md's
philosophy is "slow down, read one thing at a time," AranyAI's is "show
everything relevant, right now" — a forest officer should never scroll past
empty space looking for the alert that matters. Density is correctness here.

---

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| 0 | No shadow, border only | 95% of surfaces — table rows, section bodies, stat cards, badges, the header/footer/subbar |
| 1 | `var(--shadow-xs)` — `0 1px 2px rgba(0,0,0,.06)` | Form select focus ring companion, subtle button press feedback |
| 2 | `var(--shadow-md)` — `0 4px 6px rgba(0,0,0,.06), 0 2px 4px rgba(0,0,0,.06)` | Floating overlays only: Layer Controls panel, Mapbox click popups |

There is no Level 3. A government dashboard never needs dramatic elevation —
if something needs a heavy shadow to stand out, it should be a modal, not a
bigger shadow, and AranyAI has no modals yet. **Border lines are preferred
over shadows for nearly all structural delineation** — this is the one
principle AranyAI shares verbatim with DESIGN.md, for the same reason: shadows
imply "this is floating above the page," and most of AranyAI's structure
isn't floating, it's filed.

---

## 7. Do's and Don'ts

### Do
- Default every background to white or `var(--gray-50)` — never tinted
- Use the 10px/700/uppercase label scale for every structural label, not just one
- Reserve change-type colors (defor/encr/agri/bare) for stat-card borders, change-dots, and map polygons only — never chrome
- Keep radius to exactly three values: 2px (badges), 4px (everything else), 50% (status dots)
- Use borders, not shadows, for 95% of structural separation
- Render dates/IDs/coordinates in monospace
- Keep the pulsing animation reserved for "running" status only

### Don't
- Don't introduce a tinted/cream canvas — sterility is the point
- Don't use severity/change-type colors as decorative accents anywhere outside their data role
- Don't add a fourth radius value "just for this one card" — three is the system
- Don't add shadows to data surfaces (tables, stat cards, panel sections) — only floating overlays get Level 2
- Don't mix in a second typeface for "visual interest" — Inter/Noto Sans only
- Don't let the side panel scroll horizontally — wrap tables in `.tbl-wrap` instead
- Don't animate anything except the running-status pulse — a forest officer should never wonder if an animation means something changed

---

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile / field phone | ≤ 768px | Side panel moves **below** the map (stacked, not side-by-side); header subtitle and department block hide; subbar system-status text hides; touch targets enlarge |
| Tablet / field device | 769–1199px | Side panel narrows to 320px; layout otherwise unchanged — this is the **primary target for the Ranger view**, since rangers are expected to use tablets in the field |
| Desktop | ≥ 1200px | Full layout, 380px side panel |

### Touch Targets
Desktop data density intentionally uses compact controls (`.btn-xs` at ~24px
tall) — this is correct for a mouse-driven admin console. On coarse-pointer
devices (`@media (pointer: coarse)`), interactive buttons and selects step
up to a 40px minimum height, since the Ranger dashboard is the one surface
in this system genuinely meant for touch use in the field.

### Collapsing Strategy
- **Side panel**: side-by-side → full-width stacked below the map at ≤768px. Never collapses into a drawer/accordion — forest officers need the alert table visible, not hidden behind a tap.
- **Header**: brand subtitle and department block are the first things to hide on narrow screens; the brand name and version badge never hide.
- **Tables**: never reflow into cards on narrow screens — `.tbl-wrap` provides horizontal scroll instead, since column alignment matters more than full visibility for data tables.

### Map Behavior
The map pane has no responsive treatment beyond resizing — Mapbox GL handles
its own canvas reflow. `fitBounds()` re-runs on every AOI selection
regardless of viewport size.

---

## 9. Agent Prompt Guide

### Quick Color Reference
- Primary brand: "Navy-800 (`#1A3C6E`) — header, primary buttons, focus rings, links"
- Background: "White or Gray-50 (`#F9FAFB`) — never tinted, never cream"
- Body text: "Gray-900 (`#111827`)"
- Muted text: "Gray-500 (`#6B7280`)"
- Borders: "Gray-200/300 (`#E5E7EB`/`#D1D5DB`) — the system's primary structural device"
- Change-type accent: "Deforestation red (`#B91C1C`), Encroachment rust (`#C2410C`), Agri amber (`#A16207`), Tree→Bare violet (`#6D28D9`) — data classification only, never chrome"
- Severity: "Critical/High/Medium/Low — each a bg+text+border triplet, see §2"

### Example Component Prompts
- "Create a stat card: Gray-50 background, Gray-200 border, 4px radius, 3px colored left border matching the change type, 20px/700 value with a 10px muted unit suffix, 10px/700/uppercase label below."
- "Design a primary button: Navy-800 background, white text, 4px radius, 7px/16px padding, 12px/600/+0.2px font, Navy-700 on hover, 0.5 opacity when disabled."
- "Build a panel section: white body on a bordered container, Gray-50 header with 10px/700/uppercase title and a muted count badge, 1px Gray-200 dividers, no shadow."
- "Add a severity badge: 2px radius, 2px/8px padding, 10px/700/uppercase/+0.5px text, bg+text+border triplet from the severity palette — never the change-type palette."
- "Make the Layer Controls panel: white, 1px Gray-300 border, 4px radius, Level-2 shadow (`0 4px 6px rgba(0,0,0,.06), 0 2px 4px rgba(0,0,0,.06)`), fixed 210px width, bottom-left over the map."

### Iteration Guide
1. Before adding any new color, ask: is this brand (navy), change-type data, or severity data? Never invent a fourth category.
2. Before adding any radius, check: is it 2px, 4px, or 50%? If not, it's wrong.
3. Before adding a shadow, check: is this a floating overlay (Layer Controls, popup)? If not, use a border instead.
4. Reference exact hex/px values from this document, not approximations.
5. Default every new surface to white or Gray-50 — resist any urge toward a "softer" tinted background.

### Known Gaps
- No modal/dialog component exists yet — when one is needed (e.g., a confirmation before resolving a critical alert), it should introduce Elevation Level 3 deliberately rather than reusing Level 2.
- No dark mode — explicitly out of scope per the original brief (light theme only).
- Localization (Hindi/Chhattisgarhi label text) is not yet implemented; Noto Sans is in the font stack specifically to make this possible without a typography rework later.
