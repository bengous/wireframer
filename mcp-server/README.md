# Wireframe Mapper MCP Server

MCP server for AI-driven wireframe generation. Uses Claude AI for semantic understanding of page structure instead of heuristic-based DOM analysis.

## Prerequisites

- Node.js 18+
- Claude CLI installed and authenticated (`claude --version`)
- Active Claude Max subscription (no API key needed)

## Installation

From workspace root:

```bash
pnpm install              # Install all workspace dependencies
pnpm build:all            # Build everything
```

Or just the MCP server:

```bash
pnpm build:mcp            # Build MCP server
pnpm verify:mcp           # Verify build is correct
```

## Usage

### As MCP Tool in Claude Code

Add to `.mcp.json` in your project root (uses wrapper script for robustness):

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

The wrapper script handles build path changes automatically.

Then use in Claude Code:

```
Generate a wireframe of https://example.com
```

### Tool Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | required | URL to wireframe |
| `viewportWidth` | number | 1280 | Viewport width in pixels |
| `viewportHeight` | number | 800 | Viewport height in pixels |
| `instructions` | string | - | Special instructions for AI analysis |
| `showLabels` | boolean | true | Show section labels |
| `showContentHints` | boolean | true | Show content placeholders |
| `outputPath` | string | auto | Output PNG path |

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Playwright │ ──▶ │   Claude    │ ──▶ │@napi-rs/   │ ──▶ │    PNG      │
│  (DOM data) │     │  CLI (AI)   │     │ canvas     │     │   output    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### Pipeline Steps

1. **DOM Extraction** (`dom-gatherer.ts`): Playwright navigates to URL, extracts element data via `page.evaluate()`
2. **Prompt Building** (`prompt-builder.ts`): Formats DOM data into structured prompt for Claude
3. **AI Analysis** (`model-generator.ts`): Claude CLI generates WireframeModel with semantic understanding
4. **Rendering** (`canvas-renderer.ts`): @napi-rs/canvas (Skia-based) draws wireframe with semantic colors

### Key Files

```
mcp-server/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── browser/
│   │   └── dom-gatherer.ts   # Playwright DOM extraction
│   ├── ai/
│   │   ├── prompt-builder.ts # Prompt construction
│   │   └── model-generator.ts# Claude CLI spawning
│   ├── render/
│   │   └── canvas-renderer.ts# Server-side canvas
│   ├── tools/
│   │   └── wireframe-page.ts # Pipeline orchestration
│   └── types/
│       └── dom-data.ts       # DOM data types
└── dist/                     # Compiled output
```

## Claude CLI Integration

Uses Claude CLI to leverage existing Max subscription. No API key required.

### Required Flags

```typescript
spawn("claude", [
  "--print",              // Non-interactive output
  "--output-format", "json",
  "--tools", "",          // Disable tools (faster)
  "--model", "sonnet",    // Balance of speed/quality
  "--setting-sources", "" // CRITICAL: prevents hang
])
```

### Known Issue: Process Hanging

When Claude CLI is spawned from within an MCP server (itself spawned by Claude Code), it can hang indefinitely. This is caused by project context loading.

**Solution**: `--setting-sources ""` disables all setting source loading.

Reference: [GitHub Issue #6775](https://github.com/anthropics/claude-code/issues/6775)

## Debugging

Logs go to stderr (MCP uses stdout for protocol):

```
[wireframe-mapper] Starting wireframe for: https://example.com
[wireframe-mapper] Step 1/4: Launching Playwright...
[wireframe-mapper] Step 1/4: Done - extracted 79 elements (1234ms)
[wireframe-mapper] Step 2/4: Calling Claude CLI...
[wireframe-mapper] Step 2/4: Done - generated 12 sections (5678ms)
[wireframe-mapper] Step 3/4: Rendering to PNG...
[wireframe-mapper] Step 3/4: Done - saved to .wireframe/wireframe-xxx.png
```

## Output

PNGs are saved to `.wireframe/` directory in the current working directory by default.

## Shared Types

Types are shared via workspace package `@wireframe-mapper/shared`:

```typescript
import type { WireframeModel } from "@wireframe-mapper/shared";
```

Available types:
- `WireframeModel`
- `WireframeNode`
- `SemanticType`
- `ContentType`
- `ContentHint`
- `BoundingBox`
- `RendererConfig`
