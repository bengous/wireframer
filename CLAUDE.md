# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workspace Structure

This is a pnpm workspace monorepo:

| Package | Location | Purpose |
|---------|----------|---------|
| `wireframe-mapper` | root | Browser-injectable tool |
| `@wireframe-mapper/shared` | `packages/shared/` | Shared TypeScript types |
| `wireframe-mapper-mcp` | `mcp-server/` | MCP server for AI wireframes |

## Build Commands

```bash
pnpm install              # Install all workspace dependencies
pnpm build:all            # Build everything (shared → browser → mcp)
pnpm build                # Build browser tool only
pnpm build:shared         # Build shared types only
pnpm build:mcp            # Build MCP server only
pnpm verify:mcp           # Verify MCP build is correct
pnpm clean                # Clean all build outputs
```

```bash
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
- **types.ts**: Type definitions (`BoundingBox`, `WireframeNode`, `WireframeModel`, `SemanticType`, `ContentType`, `ContentHint`, `BadgeInfo`, config interfaces)
- **analyzer.ts**: DOM traversal and element selection. Contains heuristics for:
  - Landmark detection (semantic tags + ARIA roles)
  - Class pattern matching for labels (`STRUCTURAL_CLASS_PATTERNS`)
  - Generic container filtering (`GENERIC_CONTAINER_PATTERNS`)
  - Wrapper collapse logic (skips parents when child occupies >85% area)
  - Heading-based label inference (falls back to h1-h3 content)
  - Semantic type classification for color coding (`getSemanticType()`)
  - Grid/flex layout detection (`detectGridItems()`) - finds card grids, feature sections, etc.
  - Content hint detection (`detectContentHints()`) - finds images, buttons, text blocks, and icons within nodes
- **renderer.ts**: Canvas drawing with:
  - Semantic color fills (header=indigo, nav=blue, hero=purple, cards=yellow, cta=green, footer=gray)
  - Depth-based visual styling (border thickness, dashed vs solid lines)
  - Label badges with dark background (#333) and white text
  - Badge position tracking for click detection
  - Content hint placeholders: crossed boxes for images, pills for buttons, horizontal lines for text, circles for icons
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
- Grid/flex detection: Row-direction flex and CSS grid containers with 2+ similarly-sized children are detected as card grids. Grid items become leaf nodes with 'card' semantic type (yellow). Landmarks (header, nav, footer, etc.) are excluded from grid detection and processed normally.
- Content hints: Detects images (30x30px min), buttons (50x20px min), text blocks, and icons (12x12px min) within wireframe nodes. Rendered as placeholders: crossed boxes for images, gray pills for buttons, horizontal lines for text, circles for icons. Toggle via `showContentHints` config (default: true).

## MCP Server (AI-Driven Wireframes)

An MCP server that uses Claude AI for semantic understanding instead of heuristic-based DOM analysis.

### Build & Test

```bash
pnpm build:mcp           # Build MCP server (uses esbuild + tsc)
pnpm verify:mcp          # Verify build is correct
```

### Architecture

```
URL → Playwright (DOM extraction) → Claude CLI (semantic analysis) → @napi-rs/canvas (render) → PNG
```

**Key modules:**
- **browser/dom-gatherer.ts**: Extracts DOM data via Playwright's `page.evaluate()`
- **ai/prompt-builder.ts**: Builds structured prompts with DOM data for Claude
- **ai/model-generator.ts**: Spawns Claude CLI to generate WireframeModel
- **render/canvas-renderer.ts**: Server-side canvas rendering with @napi-rs/canvas (Skia-based)
- **tools/wireframe-page.ts**: Orchestrates the full pipeline

### Claude CLI Integration

Uses Claude CLI (not SDK) to leverage existing Max subscription - no API key needed.

**Critical flags:**
```typescript
spawn("claude", [
  "--print",
  "--output-format", "json",
  "--tools", "",              // Disable tools for speed
  "--model", "sonnet",
  "--setting-sources", ""     // CRITICAL: prevents hang when spawned from MCP
])
```

The `--setting-sources ""` flag is essential - without it, Claude CLI hangs when spawned from within another Claude Code process (known issue: [GitHub #6775](https://github.com/anthropics/claude-code/issues/6775)).

### MCP Configuration

Uses a wrapper script for robustness - handles build path changes automatically:

```json
{
  "mcpServers": {
    "wireframe-mapper": {
      "command": "node",
      "args": ["/path/to/wireframe-mapper/scripts/mcp-wrapper.js"]
    }
  }
}
```

The wrapper script (`scripts/mcp-wrapper.js`) is stable and checked into git. It finds the correct entry point even if build structure changes.

### After MCP Changes

1. `pnpm build:mcp` - rebuild
2. `pnpm verify:mcp` - verify (runs automatically with build)
3. Restart Claude Code to reload MCP

### Shared Types

Types are shared via workspace package `@wireframe-mapper/shared`. Both browser tool and MCP server import from it:
```typescript
import type { WireframeModel } from "@wireframe-mapper/shared";
```
