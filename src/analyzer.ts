/**
 * DOM Analyzer Module
 *
 * Traverses the DOM tree and identifies significant structural elements
 * for wireframe generation. Uses heuristics to filter out noise and
 * generate meaningful labels.
 *
 * Key concepts:
 * - "Significant" elements: Semantic landmarks, large containers, or
 *   elements with meaningful class names
 * - "Wrapper collapse": Skip redundant parent containers when child
 *   occupies most of the space
 * - "Label inference": Extract labels from headings when class names
 *   are generic (e.g., Tailwind utility classes)
 *
 * @module analyzer
 */

import type { BoundingBox, WireframeNode, WireframeModel, AnalyzerConfig } from './types.js';

/** Semantic landmark tags - these are ALWAYS significant */
const LANDMARK_TAGS = new Set([
  'header', 'nav', 'main', 'section', 'article', 'aside', 'footer',
]);

/** ARIA roles that indicate landmarks */
const LANDMARK_ROLES = new Set([
  'banner', 'navigation', 'main', 'contentinfo', 'complementary',
  'region', 'search', 'form',
]);

/** Tags to always skip - they don't represent layout structure */
const SKIP_TAGS = new Set([
  // Text content
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'blockquote', 'pre',
  // Inline elements
  'span', 'a', 'em', 'strong', 'b', 'i', 'label', 'small', 'sub', 'sup',
  'abbr', 'code', 'kbd', 'mark', 'q', 's', 'u', 'var', 'time', 'br', 'wbr',
  // Non-visual
  'script', 'style', 'link', 'meta', 'noscript', 'template',
  // Media (show as leaf)
  'img', 'svg', 'picture', 'video', 'audio', 'canvas', 'iframe',
  // Form elements (too granular)
  'input', 'textarea', 'select', 'button', 'form',
  // Lists (usually not layout containers)
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  // Tables
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
]);

/** Class patterns that indicate meaningful structural blocks */
const STRUCTURAL_CLASS_PATTERNS: Array<[RegExp, string]> = [
  [/hero[-_\s]?section|hero[-_\s]?banner|hero$/i, 'Hero'],
  [/hero/i, 'Hero'],
  [/card[-_\s]?(grid|list|container)/i, 'Cards'],
  [/card/i, 'Card'],
  [/feature[-_\s]?(grid|list|section)/i, 'Features'],
  [/feature/i, 'Feature'],
  [/service[-_\s]?(grid|list|section)/i, 'Services'],
  [/service/i, 'Service'],
  [/testimonial/i, 'Testimonials'],
  [/pricing/i, 'Pricing'],
  [/cta|call[-_]?to[-_]?action/i, 'CTA'],
  [/banner/i, 'Banner'],
  [/sidebar/i, 'Sidebar'],
  [/contact[-_\s]?(form|section)/i, 'Contact'],
  [/about[-_\s]?(section|us)/i, 'About'],
  [/team/i, 'Team'],
  [/faq/i, 'FAQ'],
  [/gallery/i, 'Gallery'],
  [/portfolio/i, 'Portfolio'],
  [/blog[-_\s]?(post|section)/i, 'Blog'],
  [/news/i, 'News'],
  [/stats|statistics/i, 'Stats'],
  [/benefits/i, 'Benefits'],
  [/partners|clients|logos/i, 'Partners'],
  [/newsletter/i, 'Newsletter'],
  [/social/i, 'Social'],
  [/map[-_\s]?(section|container)/i, 'Map'],
  [/location/i, 'Location'],
  [/hours|schedule|opening/i, 'Hours'],
];

/** Generic container patterns to skip (not meaningful for wireframes) */
const GENERIC_CONTAINER_PATTERNS = [
  /^container$/i,
  /^wrapper$/i,
  /^inner$/i,
  /^outer$/i,
  /^content$/i,
  /^box$/i,
  /^row$/i,
  /^col(umn)?[-_]?\d*$/i,
  /^grid$/i,
  /^flex$/i,
  /^layout$/i,
  /^max[-_]?w/i,
  /^mx[-_]?auto/i,
  /^px[-_]?\d/i,
  /^py[-_]?\d/i,
  /^p[-_]?\d/i,
  /^m[-_]?\d/i,
];

const DEFAULT_CONFIG: AnalyzerConfig = {
  minArea: 10000, // Larger minimum - 100x100
  maxDepth: 3,    // Reduced depth
  viewportAreaThreshold: 0.05, // 5% - more selective
};

let nodeIdCounter = 0;

function generateNodeId(): string {
  return `wf-node-${++nodeIdCounter}`;
}

function isElementVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);

  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (parseFloat(style.opacity) === 0) return false;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;

  return true;
}

function getAbsoluteBoundingBox(el: HTMLElement): BoundingBox {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + window.scrollX,
    y: rect.top + window.scrollY,
    width: rect.width,
    height: rect.height,
  };
}

function isLandmark(el: HTMLElement): boolean {
  const tagName = el.tagName.toLowerCase();
  if (LANDMARK_TAGS.has(tagName)) return true;

  const role = el.getAttribute('role');
  if (role && LANDMARK_ROLES.has(role)) return true;

  return false;
}

/**
 * Get a meaningful label from class names.
 * Returns null if no meaningful pattern found.
 */
function getClassLabel(el: HTMLElement): string | null {
  const className = el.className;
  if (typeof className !== 'string' || !className) return null;

  // Check for structural patterns
  for (const [pattern, label] of STRUCTURAL_CLASS_PATTERNS) {
    if (pattern.test(className)) return label;
  }

  return null;
}

/**
 * Check if element has only generic/utility classes (not meaningful for wireframe).
 */
function hasOnlyGenericClasses(el: HTMLElement): boolean {
  const className = el.className;
  if (typeof className !== 'string' || !className) return true;

  const classes = className.split(/\s+/).filter(c => c.length > 0);
  if (classes.length === 0) return true;

  // If ALL classes match generic patterns, it's generic
  return classes.every(cls =>
    GENERIC_CONTAINER_PATTERNS.some(pattern => pattern.test(cls))
  );
}

/**
 * Determine if an element should be included in the wireframe.
 * Much more selective than before - only meaningful structural elements.
 */
function isSignificant(
  el: HTMLElement,
  viewportArea: number,
  config: AnalyzerConfig
): boolean {
  const tagName = el.tagName.toLowerCase();

  // Always skip certain tags
  if (SKIP_TAGS.has(tagName)) return false;

  const bbox = getAbsoluteBoundingBox(el);
  const area = bbox.width * bbox.height;

  // Must meet minimum size
  if (area < config.minArea) return false;

  // Semantic landmarks are always significant
  if (isLandmark(el)) return true;

  // Elements with meaningful class names are significant
  if (getClassLabel(el) !== null) return true;

  // Generic divs with only utility classes are NOT significant
  if (tagName === 'div' && hasOnlyGenericClasses(el)) return false;

  // For non-landmark divs, only include if they're VERY large (main content areas)
  // and don't have children that would be more meaningful
  if (tagName === 'div') {
    // Only include if it's a major section (>10% of viewport)
    if (area > viewportArea * 0.1) {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Try to infer a label from the first heading inside an element.
 * This helps when sections use utility classes instead of semantic class names.
 */
function inferLabelFromContent(el: HTMLElement): string | null {
  // Look for the first heading (h1-h3) inside this element
  const heading = el.querySelector('h1, h2, h3');
  if (heading && heading.textContent) {
    const text = heading.textContent.trim();
    // Return first 20 chars max, clean it up
    if (text.length > 0 && text.length < 50) {
      const label = text.slice(0, 25);
      return label.length < text.length ? label + '...' : label;
    }
  }
  return null;
}

/**
 * Generate a human-readable label for an element.
 */
function generateLabel(el: HTMLElement): string {
  const tagName = el.tagName.toLowerCase();

  // 1. Check class patterns first (most specific)
  const classLabel = getClassLabel(el);
  if (classLabel) return classLabel;

  // 2. Meaningful ID
  const id = el.id;
  if (id && id.length > 2 && id.length < 30) {
    // Check if ID matches known patterns
    for (const [pattern, label] of STRUCTURAL_CLASS_PATTERNS) {
      if (pattern.test(id)) return label;
    }

    // Clean up ID for display
    const cleanId = id
      .replace(/[-_]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase();
    return cleanId.charAt(0).toUpperCase() + cleanId.slice(1);
  }

  // 3. ARIA role
  const role = el.getAttribute('role');
  if (role) {
    const roleLabels: Record<string, string> = {
      banner: 'Header',
      navigation: 'Navigation',
      main: 'Main Content',
      contentinfo: 'Footer',
      complementary: 'Sidebar',
      search: 'Search',
      region: 'Region',
    };
    if (roleLabels[role]) return roleLabels[role];
  }

  // 4. For sections/articles, try to infer from content (first heading)
  if (tagName === 'section' || tagName === 'article' || tagName === 'div') {
    const contentLabel = inferLabelFromContent(el);
    if (contentLabel) return contentLabel;
  }

  // 5. Semantic tag names as fallback
  const tagLabels: Record<string, string> = {
    header: 'Header',
    nav: 'Navigation',
    main: 'Main Content',
    section: 'Section',
    article: 'Article',
    aside: 'Sidebar',
    footer: 'Footer',
  };
  if (tagLabels[tagName]) return tagLabels[tagName];

  // 6. Final fallback
  if (tagName === 'div') return 'Block';
  return tagName.charAt(0).toUpperCase() + tagName.slice(1);
}

/**
 * Check if bboxes are similar (for wrapper collapse).
 */
function bboxesSimilar(a: BoundingBox, b: BoundingBox): boolean {
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  return areaB > areaA * 0.85; // Child takes 85%+ of parent
}

/**
 * Recursively build wireframe nodes from DOM elements.
 */
function buildNodeTree(
  el: HTMLElement,
  depth: number,
  viewportArea: number,
  config: AnalyzerConfig
): WireframeNode | null {
  if (depth > config.maxDepth) return null;
  if (!isElementVisible(el)) return null;

  const bbox = getAbsoluteBoundingBox(el);
  const significant = isSignificant(el, viewportArea, config);

  // Process children first
  const childNodes: WireframeNode[] = [];
  for (const child of Array.from(el.children)) {
    if (child instanceof HTMLElement) {
      const childNode = buildNodeTree(
        child,
        significant ? depth + 1 : depth,
        viewportArea,
        config
      );
      if (childNode) {
        childNodes.push(childNode);
      }
    }
  }

  // If this element isn't significant, bubble up children
  if (!significant) {
    if (childNodes.length === 1) return childNodes[0];
    if (childNodes.length > 1) {
      // Return a virtual container? No, just return null
      // The children will be captured by their significant ancestors
    }
    return null;
  }

  // Wrapper collapse: prefer child if it's more meaningful
  if (childNodes.length === 1) {
    const child = childNodes[0];
    // If child takes up most of our space, use child instead
    if (bboxesSimilar(bbox, child.bbox)) {
      // But prefer landmarks over generic divs
      if (!isLandmark(el) && child.isLandmark) {
        return child;
      }
      // Prefer element with meaningful label
      const myLabel = generateLabel(el);
      if (myLabel === 'Block' || myLabel === 'Section') {
        if (child.label !== 'Block' && child.label !== 'Section') {
          return child;
        }
      }
    }
  }

  // Create node for this element
  const node: WireframeNode = {
    id: generateNodeId(),
    tagName: el.tagName.toLowerCase(),
    label: generateLabel(el),
    bbox,
    depth,
    children: childNodes,
    isLandmark: isLandmark(el),
  };

  return node;
}

/**
 * Analyze the DOM and build a wireframe model.
 */
export function analyzeDom(
  root: HTMLElement | Document = document,
  config: Partial<AnalyzerConfig> = {}
): WireframeModel {
  nodeIdCounter = 0;

  const mergedConfig: AnalyzerConfig = { ...DEFAULT_CONFIG, ...config };

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const viewportArea = viewportWidth * viewportHeight;

  const fullPageHeight = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight
  );

  const body = root instanceof Document ? root.body : root;

  const nodes: WireframeNode[] = [];
  for (const child of Array.from(body.children)) {
    if (child instanceof HTMLElement) {
      const node = buildNodeTree(child, 0, viewportArea, mergedConfig);
      if (node) {
        nodes.push(node);
      }
    }
  }

  return {
    nodes,
    viewport: { width: viewportWidth, height: viewportHeight },
    fullPageHeight,
    pageUrl: window.location.href,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Flatten the tree into an array of nodes.
 */
export function flattenNodes(nodes: WireframeNode[]): WireframeNode[] {
  const result: WireframeNode[] = [];

  function traverse(node: WireframeNode): void {
    result.push(node);
    for (const child of node.children) {
      traverse(child);
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  return result;
}
