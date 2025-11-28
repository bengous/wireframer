# Wireframe Mapper

A browser-injectable tool that generates clean wireframe mockups from live websites. Analyze any page's DOM structure and export a presentation-ready wireframe image.

**Use case**: Show clients your layout structure without revealing the actual implementation - like a reverse-engineered Figma/Excalidraw mockup.

## Quick Start

1. Build the project:
```bash
pnpm install
pnpm run build
```

2. Open any website in Chrome/Firefox

3. Open DevTools (F12) → Console tab

4. Paste the contents of `dist/wireframe-mapper.js` and press Enter

5. Use the overlay controls:
   - **Labels: ON/OFF** - Toggle block labels
   - **Export PNG** - Download wireframe as image
   - **Close** (or Escape) - Exit overlay

## Features

- **Smart block detection** - Identifies meaningful structural elements, not every DOM node
- **Semantic color coding** - Different fill colors by element type (header, nav, hero, cards, CTA, footer)
- **Heading-based labels** - Infers section names from H1-H3 headings (works with Tailwind/utility CSS)
- **Inline label editing** - Click any label to edit; leave empty to hide
- **Full page capture** - Captures entire scrollable page, not just viewport
- **Auto-fit viewport** - Canvas scales to fit browser window; full resolution preserved for export
- **PNG export** - Download wireframe with meaningful filename
- **Clean output** - Filters out noise (45 elements → ~20 meaningful blocks)

## Architecture

```
src/
├── types.ts      # TypeScript interfaces (BoundingBox, WireframeNode, WireframeModel)
├── analyzer.ts   # DOM traversal, filtering heuristics, label generation
├── renderer.ts   # Canvas drawing, PNG export
└── main.ts       # Entry point, overlay UI, state management
```

### Data Flow

```
DOM Tree → analyzeDom() → WireframeModel → renderWireframe() → Canvas → PNG
```

## How It Works

### 1. Element Selection (analyzer.ts)

Not every DOM element becomes a wireframe block. The analyzer uses these heuristics:

**Always included:**
- Semantic landmarks: `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<aside>`, `<footer>`
- Elements with ARIA landmark roles
- Elements with structural class patterns (hero, card, feature, service, etc.)

**Always skipped:**
- Text elements: `<h1>`-`<h6>`, `<p>`, `<blockquote>`
- Inline elements: `<span>`, `<a>`, `<em>`, `<strong>`
- Media: `<img>`, `<svg>`, `<video>`, `<iframe>`
- Form elements: `<input>`, `<button>`, `<form>`
- Lists: `<ul>`, `<ol>`, `<li>`
- Elements smaller than 100×100px

**Conditionally included:**
- Generic `<div>` elements only if:
  - They have meaningful class names (not just utility classes)
  - OR they occupy >10% of viewport area

### 2. Label Generation

Labels are determined in priority order:

1. **Class patterns** - `.hero-section` → "Hero", `.service-card` → "Service"
2. **Element ID** - `#pricing` → "Pricing"
3. **ARIA role** - `role="banner"` → "Header"
4. **Content inference** - First `<h1>`-`<h3>` inside the element
5. **Semantic tag** - `<footer>` → "Footer"
6. **Fallback** - "Block"

### 3. Wrapper Collapsing

To avoid nested duplicates, parent elements are skipped when:
- They have exactly one child
- The child occupies >85% of parent's area
- The child has a more meaningful label

### 4. Rendering (renderer.ts)

- **Canvas-based** for direct PNG export
- **Semantic colors**: Different fill colors by element type
  - Header: Indigo tint (`#e8eaf6`)
  - Navigation: Blue tint (`#e3f2fd`)
  - Hero: Purple tint (`#f3e5f5`)
  - Cards/Features: Yellow tint (`#fffde7`)
  - CTA/Contact: Green tint (`#e8f5e9`)
  - Footer: Gray tint (`#eceff1`)
  - Content: Light gray (`#f5f5f5`)
- **Depth-based styling**: thicker borders (3px) for top-level, thinner (1px) for nested
- **Dashed borders** for non-landmark elements at depth > 0
- **Rounded corners** (4px) for professional look
- **Label badges**: Dark background (`#333`) with white text, high contrast, click to edit

## Configuration

Default settings in `analyzer.ts`:

```typescript
const DEFAULT_CONFIG = {
  minArea: 10000,           // Minimum element size (100×100px)
  maxDepth: 3,              // Maximum nesting levels to traverse
  viewportAreaThreshold: 0.05  // 5% of viewport = "significant"
};
```

## Recognized Class Patterns

The tool recognizes these class name patterns for automatic labeling:

| Pattern | Label |
|---------|-------|
| `hero`, `hero-section` | Hero |
| `card`, `card-grid` | Card, Cards |
| `feature`, `features` | Feature, Features |
| `service`, `services` | Service, Services |
| `testimonial` | Testimonials |
| `pricing` | Pricing |
| `cta`, `call-to-action` | CTA |
| `contact` | Contact |
| `about` | About |
| `team` | Team |
| `faq` | FAQ |
| `gallery` | Gallery |
| `newsletter` | Newsletter |
| `location`, `map` | Location, Map |

## Development

```bash
pnpm install      # Install dependencies
pnpm run dev      # Start dev mode (watch + server)
pnpm run build    # Production build (minified)
```

### Recommended: Tampermonkey Workflow

For rapid iteration, use the included Tampermonkey userscript:

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Create new userscript and paste contents of `scripts/wireframe-mapper.user.js`
3. Run `pnpm run dev`
4. Press **Alt+W** on any page to trigger the wireframe tool

Changes are picked up automatically - edit code, save, press Alt+W again.

### Other Commands

```bash
pnpm run build:dev   # Build with sourcemaps
pnpm run watch       # Watch mode only (no server)
pnpm run serve       # Dev server only (no watch)
```

## Limitations

- **No Shadow DOM** - Doesn't pierce shadow DOM boundaries
- **No iframe content** - Iframes are shown as opaque boxes
- **Static snapshot** - Captures current state, not dynamic content
- **Tailwind-heavy sites** - Works but relies on heading inference for labels

## MCP Server (AI-Driven)

An alternative approach using Claude AI for semantic understanding instead of heuristic-based DOM analysis.

```bash
pnpm install        # Install workspace dependencies
pnpm build:all      # Build everything
pnpm verify:mcp     # Verify MCP build
```

Configure in `.mcp.json` (uses wrapper script for robustness):
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

Uses Claude CLI with your Max subscription - no API key needed. See [mcp-server/README.md](mcp-server/README.md) for details.

## Future Improvements

- [ ] Excalidraw export format
- [ ] Depth slider control
- [ ] Multiple viewport sizes
- [ ] Bookmarklet version
- [x] Content visualization (image placeholders, text lines, button shapes)
