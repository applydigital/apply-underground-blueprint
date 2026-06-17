# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

No build step, no npm, no server required. Open `index.html` directly in a browser, or serve with any static server:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

The app fetches `data.json` at runtime with `{ cache: 'no-store' }`, so changes to `data.json` are visible immediately on reload.

## Deployment

Pushing to `main` triggers an automatic Vercel deploy. The `vercel.json` in the root configures cache headers — `data.json` is served with `no-store`; JS/CSS with 1-year immutable caching.

## Architecture

**Single-page vanilla JS application.** No framework, no bundler, no TypeScript.

| File | Role |
|---|---|
| `data.json` | Source of truth — 53 deliverables, all metadata. Edit this to change content. |
| `app.js` | All application logic in one IIFE (~670 lines). Reads JSON, builds DOM, handles all interactivity. |
| `index.html` | Shell — defines static SVG `<defs>` for arrow markers, toolbar, tray, and statusbar. No content. |
| `styles.css` | Apply Digital Editorial Momentum Design System tokens + layout. |

### Data model (`data.json`)

Each deliverable has:
- `id`, `title`, `type` (`Primary` / `Secondary` / `Cornerstone`), `stage`, `description`
- `row` (1–16), `cols` ([colStart, colEnd] 0–16) — position in the grid
- `engagementType` (`["strategy"]`, `["delivery"]`, or both) — drives the engagement filter
- `dependencies.hard[]`, `dependencies.soft[]` — IDs of prerequisite deliverables
- `enables[]` — IDs this deliverable unlocks (inverse of hard deps)
- `layerMap`, `humanGate`, `skills` — agentic delivery metadata (partially populated; see CLAUDE.md at parent workspace for population status)

### Layout system

4 tracks arranged in a 17-column × 16-row grid:

| Track | Columns | Rows |
|---|---|---|
| Discovery & Planning | 0–4 | 1–7 |
| Design & Requirements | 5–11 | 1–7 |
| Build & Run | 12–16 | 1–7 |
| Project Management | 0–16 | 8–16 |

Two phase gaps are injected at col 5 and col 12 via `colToX()` to visually separate the three delivery phases. Row and column positions in `data.json` map directly to these constants — `buildLayout()` in `app.js` converts them to pixel coordinates.

### Rendering pipeline

1. `fetch('data.json')` → builds `byId` Map
2. `renderMap(activeItems)` — called on load and on engagement filter change:
   - `buildLayout()` computes pixel `_x`, `_y`, `_w` for each deliverable
   - Renders track containers, column/row indicators, sublane divider, boxes, and SVG edges
3. `render()` — called on every selection change; applies CSS classes (`sel`, `in`, `in-t`, `out`) to boxes and edges based on `computeRoles()`

### Selection model

- Click a box: toggles it in the `selected` Set
- `⌘`/`Ctrl`-click: `selectChain()` — walks `inboundOf` transitively through hard deps, adds all ancestors
- `computeRoles()` assigns roles to non-selected nodes: `in` (direct input), `in-t` (transitive input), `out` (direct output)
- Zoom state persists in `localStorage` under key `delivmap-zoom`

### Tray (detail panel)

`openTray(id)` renders deliverable metadata into the `<aside class="tray">`. Chip buttons in the tray have `data-jump` attributes; clicking them closes the tray, selects the target, and smooth-scrolls to it.
