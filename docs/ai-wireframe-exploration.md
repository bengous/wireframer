# AI-Powered Wireframe Generation: Exploration Session

**Date:** 2025-11-28
**Context:** Exploring whether AI (Claude) can generate better wireframes by understanding page semantics, rather than relying on heuristic-based DOM analysis.

---

## The Question That Started It

> "I am trying to recreate mockups from an existing website by creating this tool. But now I wonder... could you do that without the tool by just reading the DOM?"

This led to an exploration of combining:
1. **Browser automation** (Playwright) for DOM access and measurements
2. **AI semantic understanding** for meaningful labels and structure
3. **Existing renderer** for visual output

---

## What We Did During This Session

### Phase 1: Initial DOM Analysis

I visited `http://localhost:4321/` (a pharmacy website) using Playwright and gathered:
- Accessibility tree snapshot (semantic structure)
- Element bounding boxes via `getBoundingClientRect()`
- Screenshot for visual reference

**First observation:** The accessibility tree gives structure, but labels are generic ("section", "generic", "navigation").

### Phase 2: Understanding the Data Structures

Read the existing codebase to understand:
- `types.ts`: `WireframeModel`, `WireframeNode`, `SemanticType`, `BoundingBox`
- `renderer.ts`: Canvas drawing logic, semantic colors, badge rendering

**Key insight:** The renderer is decoupled from the analyzer. If I build a valid `WireframeModel`, the renderer will draw it.

### Phase 3: Building an AI-Generated Model

Instead of using `analyzer.ts` heuristics, I manually constructed a `WireframeModel` based on my understanding of the page:

```javascript
const model = {
  nodes: [
    {
      id: 'header',
      label: 'Header + Nav',           // ← Meaningful label
      semanticType: 'header',
      bbox: { x: 0, y: 0, width: 1265, height: 114 },
      children: [{
        id: 'nav',
        label: 'Navigation',
        semanticType: 'navigation',
        // ...
      }]
    },
    {
      id: 'hero',
      label: 'Hero + Dual CTA',        // ← Describes purpose
      semanticType: 'hero',
      bbox: { x: 0, y: 114, width: 1265, height: 500 },
      children: [
        { id: 'cta-contact', label: 'CTA: Contact', semanticType: 'cta', ... },
        { id: 'cta-services', label: 'CTA: Services', semanticType: 'cta', ... }
      ]
    },
    // ... etc
  ],
  viewport: { width: 1265, height: 800 },
  fullPageHeight: 2407,
  pageUrl: 'http://localhost:4321/',
  capturedAt: '2025-11-28T13:20:27.194Z'
};
```

### Phase 4: Injecting the Renderer

Injected a minimal version of the renderer into the page via `page.evaluate()`:
- Same semantic colors from `renderer.ts`
- Same rounded rectangle drawing
- Same badge styling
- Exported to PNG

**Result:** A cleaner wireframe with meaningful labels like "Hero + Dual CTA", "Services Grid", "Value Props (3)", "Footer (4-col)".

---

## Architecture Comparison

### Original Tool Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXISTING TOOL                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   DOM Tree                                                                  │
│      │                                                                      │
│      ▼                                                                      │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │ analyzer.ts                                                          │  │
│   │                                                                      │  │
│   │  • Traverses DOM looking for "significant" elements                  │  │
│   │  • Heuristics: min size 100x100px, semantic tags, class patterns     │  │
│   │  • Labels from: tag name, class patterns, ARIA roles, h1-h3 text     │  │
│   │  • Filters out: generic containers, small elements, wrappers         │  │
│   │                                                                      │  │
│   │  Problem: Labels are mechanical ("section", "nav", "generic")        │  │
│   └──────────────────────────────┬──────────────────────────────────────┘  │
│                                  │                                          │
│                                  ▼                                          │
│                          WireframeModel                                     │
│                                  │                                          │
│                                  ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │ renderer.ts                                                          │  │
│   │                                                                      │  │
│   │  • Draws rounded rectangles on canvas                                │  │
│   │  • Semantic color fills (header=indigo, hero=purple, etc.)          │  │
│   │  • Depth-based styling (thicker borders for depth 0)                │  │
│   │  • Label badges with dark background                                 │  │
│   └──────────────────────────────┬──────────────────────────────────────┘  │
│                                  │                                          │
│                                  ▼                                          │
│                             Canvas PNG                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### AI-Powered Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AI WIREFRAME GENERATION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │ STEP 1: Browser Automation (Playwright)                               │ │
│   │                                                                       │ │
│   │   • Navigate to URL                                                   │ │
│   │   • Get accessibility tree (semantic structure)                       │ │
│   │   • Execute JS to get bounding boxes via getBoundingClientRect()     │ │
│   └───────────────────────────────┬──────────────────────────────────────┘ │
│                                   │                                         │
│                                   ▼                                         │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │ STEP 2: AI Semantic Analysis (Claude)                                 │ │
│   │                                                                       │ │
│   │   Instead of heuristics, AI UNDERSTANDS the page:                     │ │
│   │                                                                       │ │
│   │   • "This section has h1 + tagline + 2 buttons → Hero with CTAs"     │ │
│   │   • "4 articles with h3 titles under 'Nos services' → Service Grid"  │ │
│   │   • "Section with map iframe + address → Location block"             │ │
│   │   • "Footer with 4 columns of links → Footer (4-col)"                │ │
│   │                                                                       │ │
│   │   AI can also decide what's IMPORTANT vs noise                       │ │
│   └───────────────────────────────┬──────────────────────────────────────┘ │
│                                   │                                         │
│                                   ▼                                         │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │ STEP 3: Build WireframeModel                                          │ │
│   │                                                                       │ │
│   │   {                                                                   │ │
│   │     id: 'hero',                                                       │ │
│   │     label: 'Hero + Dual CTA',        ← AI-generated label            │ │
│   │     semanticType: 'hero',            ← Correct classification        │ │
│   │     bbox: { x: 0, y: 114, ... },     ← From JS measurement           │ │
│   │     children: [                                                       │ │
│   │       { id: 'cta-contact', label: 'CTA: Contact', ... },             │ │
│   │       { id: 'cta-services', label: 'CTA: Services', ... }            │ │
│   │     ]                                                                 │ │
│   │   }                                                                   │ │
│   └───────────────────────────────┬──────────────────────────────────────┘ │
│                                   │                                         │
│                                   ▼                                         │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │ STEP 4: Inject Renderer + Draw                                        │ │
│   │                                                                       │ │
│   │   • Inject canvas drawing code (from renderer.ts)                    │ │
│   │   • Use the AI-built model as input                                  │ │
│   │   • Same visual output: colors, badges, borders                      │ │
│   │   • Export as PNG                                                    │ │
│   └───────────────────────────────┬──────────────────────────────────────┘ │
│                                   │                                         │
│                                   ▼                                         │
│                              Canvas PNG                                     │
│                      (with semantic labels!)                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Differences

| Aspect | Heuristic Analyzer | AI Approach |
|--------|-------------------|-------------|
| **How it "sees"** | Pattern matching on classes/tags | Understands content and purpose |
| **Label source** | `STRUCTURAL_CLASS_PATTERNS`, tag names | Semantic understanding of what the section IS |
| **Filtering** | Size thresholds, generic patterns | Judgment on what matters for wireframe |
| **Hierarchy** | Wrapper collapse heuristic (>85% area) | Deliberate parent-child decisions |
| **Output** | "section", "nav", "article" | "Hero + Dual CTA", "Services Grid (4)" |

---

## Why the AI Wireframe Feels "Less Bloated"

The heuristic analyzer captures **everything significant by size/semantics**. AI captures only **what matters for understanding the layout**:

```
Heuristic might find:          AI chose to show:
─────────────────────          ────────────────
header                         Header + Nav
  div.top-bar                    └─ Navigation
  nav
    ul
      li (x5)
main
  section                      Hero + Dual CTA
    div.hero-content             ├─ CTA: Contact
      h1                         └─ CTA: Services
      p
      div.cta-buttons
        a (x2)
  section                      Hours Bar
  section                      Value Props (3)
    div (x3)
  section                      Services Grid
    article (x4)                 ├─ Vaccination
                                 ├─ Orthopédie
                                 ├─ Livraison
                                 └─ Conseil
  section                      Location + Map
footer                         Footer (4-col)
```

AI flattened hierarchy where nesting wasn't useful, and only showed children that are **meaningful for the wireframe**.

---

## Code: The AI Model I Built

```javascript
const model = {
  nodes: [
    // HEADER
    {
      id: 'header',
      tagName: 'header',
      label: 'Header + Nav',
      bbox: { x: 0, y: 0, width: 1265, height: 114 },
      depth: 0,
      children: [
        {
          id: 'nav',
          tagName: 'nav',
          label: 'Navigation',
          bbox: { x: 0, y: 41, width: 1265, height: 72 },
          depth: 1,
          children: [],
          isLandmark: true,
          semanticType: 'navigation'
        }
      ],
      isLandmark: true,
      semanticType: 'header'
    },

    // HERO
    {
      id: 'hero',
      tagName: 'section',
      label: 'Hero + Dual CTA',
      bbox: { x: 0, y: 114, width: 1265, height: 500 },
      depth: 0,
      children: [
        {
          id: 'cta-contact',
          tagName: 'a',
          label: 'CTA: Contact',
          bbox: { x: 32, y: 424, width: 166, height: 52 },
          depth: 1,
          children: [],
          isLandmark: false,
          semanticType: 'cta'
        },
        {
          id: 'cta-services',
          tagName: 'a',
          label: 'CTA: Services',
          bbox: { x: 214, y: 424, width: 152, height: 52 },
          depth: 1,
          children: [],
          isLandmark: false,
          semanticType: 'cta'
        }
      ],
      isLandmark: true,
      semanticType: 'hero'
    },

    // HOURS BAR
    {
      id: 'hours-bar',
      tagName: 'section',
      label: 'Hours Bar',
      bbox: { x: 0, y: 614, width: 1265, height: 54 },
      depth: 0,
      children: [],
      isLandmark: false,
      semanticType: 'content'
    },

    // VALUE PROPS
    {
      id: 'engagements',
      tagName: 'section',
      label: 'Value Props (3)',
      bbox: { x: 0, y: 668, width: 1265, height: 388 },
      depth: 0,
      children: [],
      isLandmark: false,
      semanticType: 'content'
    },

    // SERVICES GRID
    {
      id: 'services',
      tagName: 'section',
      label: 'Services Grid',
      bbox: { x: 0, y: 1056, width: 1265, height: 402 },
      depth: 0,
      children: [
        {
          id: 'card-vaccination',
          tagName: 'article',
          label: 'Vaccination',
          bbox: { x: 32, y: 1188, width: 282, height: 206 },
          depth: 1,
          children: [],
          isLandmark: false,
          semanticType: 'card'
        },
        {
          id: 'card-ortho',
          tagName: 'article',
          label: 'Orthopédie',
          bbox: { x: 338, y: 1188, width: 282, height: 206 },
          depth: 1,
          children: [],
          isLandmark: false,
          semanticType: 'card'
        },
        {
          id: 'card-delivery',
          tagName: 'article',
          label: 'Livraison',
          bbox: { x: 645, y: 1188, width: 282, height: 206 },
          depth: 1,
          children: [],
          isLandmark: false,
          semanticType: 'card'
        },
        {
          id: 'card-conseil',
          tagName: 'article',
          label: 'Conseil',
          bbox: { x: 951, y: 1188, width: 282, height: 206 },
          depth: 1,
          children: [],
          isLandmark: false,
          semanticType: 'card'
        }
      ],
      isLandmark: false,
      semanticType: 'content'
    },

    // LOCATION
    {
      id: 'location',
      tagName: 'section',
      label: 'Location + Map',
      bbox: { x: 0, y: 1458, width: 1265, height: 596 },
      depth: 0,
      children: [],
      isLandmark: false,
      semanticType: 'content'
    },

    // FOOTER
    {
      id: 'footer',
      tagName: 'footer',
      label: 'Footer (4-col)',
      bbox: { x: 0, y: 2054, width: 1265, height: 353 },
      depth: 0,
      children: [],
      isLandmark: true,
      semanticType: 'footer'
    }
  ],
  viewport: { width: 1265, height: 800 },
  fullPageHeight: 2407,
  pageUrl: 'http://localhost:4321/',
  capturedAt: '2025-11-28T13:20:27.194Z'
};
```

---

## Code: The Injected Renderer

```javascript
// Semantic colors (from renderer.ts)
const SEMANTIC_COLORS = {
  header: '#e8eaf6',     // Indigo tint
  navigation: '#e3f2fd', // Blue tint
  hero: '#f3e5f5',       // Purple tint
  content: '#f5f5f5',    // Light gray
  card: '#fffde7',       // Yellow tint
  cta: '#e8f5e9',        // Green tint
  footer: '#eceff1',     // Dark gray
};

// Create canvas
const canvas = document.createElement('canvas');
canvas.width = model.viewport.width;
canvas.height = model.fullPageHeight;
const ctx = canvas.getContext('2d');

// Fill background
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, canvas.width, canvas.height);

// Helper: draw rounded rect
function drawRoundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Helper: get fill color with depth darkening
function getFillColor(semanticType, depth) {
  const baseColor = SEMANTIC_COLORS[semanticType] || '#f5f5f5';
  const darken = Math.min(depth * 5, 20);
  const hex = baseColor.replace('#', '');
  const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - darken);
  const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - darken);
  const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - darken);
  return `rgb(${r}, ${g}, ${b})`;
}

// Render a node
function renderNode(node) {
  const { bbox, depth, label, isLandmark, semanticType } = node;
  const borderWidth = depth === 0 ? 3 : depth <= 2 ? 2 : 1;
  const x = bbox.x + borderWidth / 2;
  const y = bbox.y + borderWidth / 2;
  const w = bbox.width - borderWidth;
  const h = bbox.height - borderWidth;

  if (w < 10 || h < 10) return;

  // Fill
  ctx.fillStyle = getFillColor(semanticType, depth);
  drawRoundedRect(x, y, w, h, 4);
  ctx.fill();

  // Border (dashed for non-landmark children)
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = borderWidth;
  ctx.setLineDash(!isLandmark && depth > 0 ? [4, 4] : []);
  drawRoundedRect(x, y, w, h, 4);
  ctx.stroke();
  ctx.setLineDash([]);

  // Label badge
  if (w > 60 && h > 30 && label) {
    const fontSize = 11;
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    const textWidth = ctx.measureText(label).width;
    const badgeW = textWidth + 12;
    const badgeH = fontSize + 6;
    const badgeX = x + 8;
    const badgeY = y + 8;

    ctx.fillStyle = '#333333';
    drawRoundedRect(badgeX, badgeY, badgeW, badgeH, 3);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    ctx.fillText(label, badgeX + 6, badgeY + 3);
  }

  // Render children
  node.children.forEach(renderNode);
}

// Render all nodes
model.nodes.forEach(renderNode);

// Export
canvas.toDataURL('image/png');
```

---

## Possible Next Steps

### Option 1: AI-Enhanced Labels (Minimal Change)
Keep `analyzer.ts` but post-process with AI to improve labels:
```javascript
const model = analyzeDom();
const enhancedModel = await aiEnhanceLabels(model);
renderWireframe(enhancedModel);
```

### Option 2: AI-Driven Model (Replace Analyzer)
Skip the heuristic analyzer entirely:
```javascript
const domData = gatherDomData();  // Just measurements
const model = await aiGenerateModel(domData);  // AI builds model
renderWireframe(model);
```

### Option 3: Conversational Wireframing
Natural language control:
```
"Wireframe this page, but highlight the CTAs"
"Show only above-the-fold content"
"Compare mobile vs desktop layout"
```

### Option 4: MCP Tool
Create an MCP server with:
```
wireframe_page(url, instructions) → PNG
```

---

## Files Generated

- **AI Wireframe PNG:** `.playwright-mcp/ai-wireframe.png`
- **This documentation:** `docs/ai-wireframe-exploration.md`

---

---

## Critical: Context Window Efficiency with Browser Automation

### The Problem

During this session, the context window filled up very fast. Here's why:

#### 1. Playwright Page Snapshots (Biggest Offender)

Every Playwright MCP tool call returns the **full accessibility tree** of the page:

```yaml
- generic [ref=e1]:
  - link "Aller au contenu principal" [ref=e2]:
  - banner [ref=e3]:
    - generic [ref=e4]:
      - button "Ouvrir le menu" [ref=e5]:
        - img [ref=e6]
      - link "Pharmacie des Aiguinards" [ref=e8]:
        ... (hundreds more lines)
```

This happens **every single time** you call `browser_evaluate`, `browser_navigate`, `browser_click`, etc. Even for a simple return value, you get the entire DOM tree back (~500+ lines per call).

#### 2. Base64 Data Returns

Attempting to return `canvas.toDataURL('image/png')` tried to send a ~2MB image as base64. It got truncated at 25,000 tokens but still consumed a huge chunk of context.

#### 3. Multiple Exploratory Queries

Running several `page.evaluate()` calls sequentially means multiple page snapshots:
- First query → +500 lines snapshot
- Second query → +500 lines snapshot
- Third query → +500 lines snapshot

### The Solution

#### Batch DOM Queries

```javascript
// BAD: Multiple calls, each returns full page snapshot
await page.evaluate(() => getHeader());   // + snapshot
await page.evaluate(() => getSections()); // + snapshot
await page.evaluate(() => getFooter());   // + snapshot

// GOOD: Single call, one snapshot
await page.evaluate(() => ({
  header: getHeader(),
  sections: getSections(),
  footer: getFooter()
}));
```

#### Never Return Large Data - Write to Files

```javascript
// BAD: Return base64 (huge, may truncate)
return canvas.toDataURL('image/png');

// GOOD: Trigger download directly
const link = document.createElement('a');
link.download = 'output.png';
link.href = canvas.toDataURL('image/png');
link.click();
return { success: true, filename: 'output.png' };
```

#### Plan Before Executing

Before running browser automation:
1. Determine exactly what data you need
2. Write a single comprehensive query
3. Avoid iterative exploration when possible

### Rules for Browser Automation Sessions

1. **Batch all DOM queries** into single `page.evaluate()` calls
2. **Never return large data** - write to files instead
3. **Be aware** that every tool call dumps the accessibility tree
4. **Plan queries upfront** rather than exploring iteratively
5. **Use screenshots sparingly** - they add to context too

---

## Conclusion

The combination of browser automation + AI semantic understanding + existing renderer produces wireframes that are:
- **More meaningful** - labels describe purpose, not just structure
- **Less bloated** - shows what matters, not everything significant
- **Customizable** - can follow natural language instructions

The key insight is that the **renderer is reusable** - only the model generation needs to change.
