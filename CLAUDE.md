# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
pnpm install              # Install dependencies
pnpm run build            # Production build (minified IIFE)
pnpm run build:dev        # Development build with sourcemaps
pnpm run watch            # Watch mode for development
pnpm run serve            # Start local dev server on port 9876
pnpm run dev              # Watch + serve together (recommended for development)
```

Output goes to `dist/wireframe-mapper.js`.

## Development Workflow

### Quick Testing (Console Paste)
Paste `dist/wireframe-mapper.js` directly into browser DevTools console.

### Recommended: Tampermonkey Workflow
For iterative development, use the Tampermonkey userscript for a faster edit-test cycle.

**One-time setup:**
1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Create new userscript (Tampermonkey icon → Create new script)
3. Paste contents of `scripts/wireframe-mapper.user.js`
4. Save (Ctrl+S)

**Development session:**
```bash
pnpm run dev    # Starts watch + server in one command
```

Then press **Alt+W** on any page to trigger the wireframe tool. Edit code, save, press Alt+W again.

**How it works:**
```
src/*.ts → esbuild (watch) → dist/wireframe-mapper.js → dev server :9876
                                                              ↓
                                          Tampermonkey fetches on Alt+W
                                                              ↓
                                              Injects into current page
```

The userscript fetches fresh JS on every Alt+W press, so changes appear immediately without manual copy-paste or page reload.

**Robustness:** The dev server automatically kills any existing process on port 9876, so you can restart freely without port conflicts.

## Architecture

Browser-injectable tool that generates wireframe mockups from live websites. The tool traverses the DOM, identifies structural elements, and renders them as a clean wireframe PNG.

### Data Flow

```
DOM Tree → analyzeDom() → WireframeModel → renderWireframe() → Canvas → PNG
```

### Module Responsibilities

**Source (src/):**
- **types.ts**: Type definitions (`BoundingBox`, `WireframeNode`, `WireframeModel`, `SemanticType`, `BadgeInfo`, config interfaces)
- **analyzer.ts**: DOM traversal and element selection. Contains heuristics for:
  - Landmark detection (semantic tags + ARIA roles)
  - Class pattern matching for labels (`STRUCTURAL_CLASS_PATTERNS`)
  - Generic container filtering (`GENERIC_CONTAINER_PATTERNS`)
  - Wrapper collapse logic (skips parents when child occupies >85% area)
  - Heading-based label inference (falls back to h1-h3 content)
  - Semantic type classification for color coding (`getSemanticType()`)
- **renderer.ts**: Canvas drawing with:
  - Semantic color fills (header=indigo, nav=blue, hero=purple, cards=yellow, cta=green, footer=gray)
  - Depth-based visual styling (border thickness, dashed vs solid lines)
  - Label badges with dark background (#333) and white text
  - Badge position tracking for click detection
- **main.ts**: Overlay UI, state management, event handlers:
  - Auto-scales canvas to fit viewport (CSS transform, preserves full resolution for export)
  - Inline label editing (click badge → input field → Enter/Escape)
  - Label overrides stored in state (empty string hides badge)
  - Auto-executes `createOverlay()` when script loads

**Dev tooling (scripts/):**
- **dev.js**: Unified dev script that runs esbuild watch + dev server together
- **dev-server.js**: Local HTTP server serving `dist/wireframe-mapper.js` with CORS headers (auto-kills existing process on port conflict)
- **wireframe-mapper.user.js**: Tampermonkey userscript that fetches and injects the tool on Alt+W

### Key Design Decisions

- Uses IIFE format for single-paste console injection
- Coordinates in absolute page space (not viewport-relative)
- Labels toggle off by default - wireframes are cleaner without them
- Only "significant" elements become wireframe blocks - filtered by size (100x100px min), semantics, and class patterns
- Depth limited to 3 levels to reduce noise
- Semantic color coding makes different section types visually distinct
- Canvas scales to fit viewport but exports at full resolution
- Label editing uses inline input field (click badge to edit, empty to hide)
