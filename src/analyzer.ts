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

import type {
  AnalyzerConfig,
  BoundingBox,
  ContentHint,
  ContentType,
  SemanticType,
  WireframeModel,
  WireframeNode,
} from "./types.js";

/** Semantic landmark tags - these are ALWAYS significant */
const LANDMARK_TAGS = new Set(["header", "nav", "main", "section", "article", "aside", "footer"]);

/** ARIA roles that indicate landmarks */
const LANDMARK_ROLES = new Set([
  "banner",
  "navigation",
  "main",
  "contentinfo",
  "complementary",
  "region",
  "search",
  "form",
]);

/** Tags to always skip - they don't represent layout structure */
const SKIP_TAGS = new Set([
  // Text content
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "blockquote",
  "pre",
  // Inline elements
  "span",
  "a",
  "em",
  "strong",
  "b",
  "i",
  "label",
  "small",
  "sub",
  "sup",
  "abbr",
  "code",
  "kbd",
  "mark",
  "q",
  "s",
  "u",
  "var",
  "time",
  "br",
  "wbr",
  // Non-visual
  "script",
  "style",
  "link",
  "meta",
  "noscript",
  "template",
  // Media (show as leaf)
  "img",
  "svg",
  "picture",
  "video",
  "audio",
  "canvas",
  "iframe",
  // Form elements (too granular)
  "input",
  "textarea",
  "select",
  "button",
  "form",
  // Lists (usually not layout containers)
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  // Tables
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
]);

/** Class patterns that indicate meaningful structural blocks */
const STRUCTURAL_CLASS_PATTERNS: Array<[RegExp, string]> = [
  [/hero[-_\s]?section|hero[-_\s]?banner|hero$/i, "Hero"],
  [/hero/i, "Hero"],
  [/card[-_\s]?(grid|list|container)/i, "Cards"],
  [/card/i, "Card"],
  [/feature[-_\s]?(grid|list|section)/i, "Features"],
  [/feature/i, "Feature"],
  [/service[-_\s]?(grid|list|section)/i, "Services"],
  [/service/i, "Service"],
  [/testimonial/i, "Testimonials"],
  [/pricing/i, "Pricing"],
  [/cta|call[-_]?to[-_]?action/i, "CTA"],
  [/banner/i, "Banner"],
  [/sidebar/i, "Sidebar"],
  [/contact[-_\s]?(form|section)/i, "Contact"],
  [/about[-_\s]?(section|us)/i, "About"],
  [/team/i, "Team"],
  [/faq/i, "FAQ"],
  [/gallery/i, "Gallery"],
  [/portfolio/i, "Portfolio"],
  [/blog[-_\s]?(post|section)/i, "Blog"],
  [/news/i, "News"],
  [/stats|statistics/i, "Stats"],
  [/benefits/i, "Benefits"],
  [/partners|clients|logos/i, "Partners"],
  [/newsletter/i, "Newsletter"],
  [/social/i, "Social"],
  [/map[-_\s]?(section|container)/i, "Map"],
  [/location/i, "Location"],
  [/hours|schedule|opening/i, "Hours"],
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
  maxDepth: 3, // Reduced depth
  viewportAreaThreshold: 0.05, // 5% - more selective
};

/** Smaller minimum area for grid items (50x50) */
const GRID_ITEM_MIN_AREA = 2500;

/** Minimum sizes for content hint detection */
const CONTENT_MIN_SIZES = {
  image: { width: 30, height: 30 },
  button: { width: 50, height: 20 },
  text: { width: 50, height: 10 },
  icon: { width: 12, height: 12 },
};

/** Max content hints per node per type */
const CONTENT_MAX_COUNTS = {
  image: 5,
  button: 3,
  text: 1,
  icon: 6,
};

let nodeIdCounter = 0;

function generateNodeId(): string {
  return `wf-node-${++nodeIdCounter}`;
}

function isElementVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);

  if (style.display === "none") {
    return false;
  }
  if (style.visibility === "hidden") {
    return false;
  }
  if (Number.parseFloat(style.opacity) === 0) {
    return false;
  }

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }

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
  if (LANDMARK_TAGS.has(tagName)) {
    return true;
  }

  const role = el.getAttribute("role");
  if (role !== null && role !== "" && LANDMARK_ROLES.has(role)) {
    return true;
  }

  return false;
}

/**
 * Get a meaningful label from class names.
 * Returns null if no meaningful pattern found.
 */
function getClassLabel(el: HTMLElement): string | null {
  const className = el.className;
  if (typeof className !== "string" || !className) {
    return null;
  }

  // Check for structural patterns
  for (const [pattern, label] of STRUCTURAL_CLASS_PATTERNS) {
    if (pattern.test(className)) {
      return label;
    }
  }

  return null;
}

/**
 * Check if element has only generic/utility classes (not meaningful for wireframe).
 */
function hasOnlyGenericClasses(el: HTMLElement): boolean {
  const className = el.className;
  if (typeof className !== "string" || !className) {
    return true;
  }

  const classes = className.split(/\s+/).filter((c) => c.length > 0);
  if (classes.length === 0) {
    return true;
  }

  // If ALL classes match generic patterns, it's generic
  return classes.every((cls) => GENERIC_CONTAINER_PATTERNS.some((pattern) => pattern.test(cls)));
}

/**
 * Check if element is a CSS grid or row-direction flexbox container.
 * Column-direction flex is excluded (just vertical stacking, not a grid).
 */
function isGridOrFlexContainer(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  const display = style.display;

  if (display === "grid" || display === "inline-grid") {
    return true;
  }

  if (display === "flex" || display === "inline-flex") {
    const direction = style.flexDirection;
    return direction === "row" || direction === "row-reverse";
  }

  return false;
}

/**
 * Get visible child elements that could be grid items.
 */
function getVisibleChildren(el: HTMLElement): HTMLElement[] {
  const children: HTMLElement[] = [];
  for (const child of Array.from(el.children)) {
    if (child instanceof HTMLElement) {
      const tagName = child.tagName.toLowerCase();
      if (!SKIP_TAGS.has(tagName) && isElementVisible(child)) {
        children.push(child);
      }
    }
  }
  return children;
}

/**
 * Check if children have similar dimensions (within tolerance).
 * This identifies grid-like layouts with uniform items.
 */
function areChildrenSimilarlySized(children: HTMLElement[], tolerance: number = 0.3): boolean {
  if (children.length < 2) {
    return false;
  }

  const sizes = children.map((child) => {
    const rect = child.getBoundingClientRect();
    return { width: rect.width, height: rect.height, area: rect.width * rect.height };
  });

  // Filter out very small children (likely decorative)
  const significantSizes = sizes.filter((s) => s.area > 1000);
  if (significantSizes.length < 2) {
    return false;
  }

  const avgWidth = significantSizes.reduce((sum, s) => sum + s.width, 0) / significantSizes.length;
  const avgHeight =
    significantSizes.reduce((sum, s) => sum + s.height, 0) / significantSizes.length;

  return significantSizes.every((s) => {
    const widthDiff = Math.abs(s.width - avgWidth) / avgWidth;
    const heightDiff = Math.abs(s.height - avgHeight) / avgHeight;
    return widthDiff <= tolerance && heightDiff <= tolerance;
  });
}

/**
 * Detect if an element is a grid/flex container with grid-like children.
 * Returns the children that should become grid item nodes, or null if not a grid.
 * Excludes landmark elements (header, nav, footer, etc.) - they should be processed normally.
 */
function detectGridItems(el: HTMLElement): HTMLElement[] | null {
  if (!isGridOrFlexContainer(el)) {
    return null;
  }

  const children = getVisibleChildren(el);
  if (children.length < 2) {
    return null;
  }

  // Exclude landmarks - they should be processed as normal nodes, not grid items
  const nonLandmarkChildren = children.filter((child) => !isLandmark(child));
  if (nonLandmarkChildren.length < 2) {
    return null;
  }

  if (!areChildrenSimilarlySized(nonLandmarkChildren)) {
    return null;
  }

  // Filter children by minimum grid item size
  const validChildren = nonLandmarkChildren.filter((child) => {
    const rect = child.getBoundingClientRect();
    return rect.width * rect.height >= GRID_ITEM_MIN_AREA;
  });

  return validChildren.length >= 2 ? validChildren : null;
}

/**
 * Generate a label for a grid item.
 * Tries class names, then heading content, falls back to "Card".
 */
function inferGridItemLabel(el: HTMLElement): string {
  const classLabel = getClassLabel(el);
  if (classLabel !== null && classLabel !== "") {
    return classLabel;
  }

  const contentLabel = inferLabelFromContent(el);
  if (contentLabel !== null && contentLabel !== "") {
    return contentLabel;
  }

  return "Card";
}

/**
 * Determine if an element should be included in the wireframe.
 * Much more selective than before - only meaningful structural elements.
 */
function isSignificant(el: HTMLElement, viewportArea: number, config: AnalyzerConfig): boolean {
  const tagName = el.tagName.toLowerCase();

  // Always skip certain tags
  if (SKIP_TAGS.has(tagName)) {
    return false;
  }

  const bbox = getAbsoluteBoundingBox(el);
  const area = bbox.width * bbox.height;

  // Must meet minimum size
  if (area < config.minArea) {
    return false;
  }

  // Semantic landmarks are always significant
  if (isLandmark(el)) {
    return true;
  }

  // Elements with meaningful class names are significant
  if (getClassLabel(el) !== null) {
    return true;
  }

  // Generic divs with only utility classes are NOT significant
  if (tagName === "div" && hasOnlyGenericClasses(el)) {
    return false;
  }

  // For non-landmark divs, only include if they're VERY large (main content areas)
  // and don't have children that would be more meaningful
  if (tagName === "div") {
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
  const heading = el.querySelector("h1, h2, h3");
  if (heading !== null && heading.textContent !== "") {
    const text = heading.textContent.trim();
    // Return first 20 chars max, clean it up
    if (text.length > 0 && text.length < 50) {
      const label = text.slice(0, 25);
      return label.length < text.length ? `${label}...` : label;
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
  if (classLabel !== null && classLabel !== "") {
    return classLabel;
  }

  // 2. Meaningful ID
  const id = el.id;
  if (id && id.length > 2 && id.length < 30) {
    // Check if ID matches known patterns
    for (const [pattern, label] of STRUCTURAL_CLASS_PATTERNS) {
      if (pattern.test(id)) {
        return label;
      }
    }

    // Clean up ID for display
    const cleanId = id
      .replaceAll(/[-_]/g, " ")
      .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase();
    return cleanId.charAt(0).toUpperCase() + cleanId.slice(1);
  }

  // 3. ARIA role
  const role = el.getAttribute("role");
  if (role !== null && role !== "") {
    const roleLabels: Record<string, string> = {
      banner: "Header",
      navigation: "Navigation",
      main: "Main Content",
      contentinfo: "Footer",
      complementary: "Sidebar",
      search: "Search",
      region: "Region",
    };
    const roleLabel = roleLabels[role];
    if (roleLabel !== undefined && roleLabel !== "") {
      return roleLabel;
    }
  }

  // 4. For sections/articles, try to infer from content (first heading)
  if (tagName === "section" || tagName === "article" || tagName === "div") {
    const contentLabel = inferLabelFromContent(el);
    if (contentLabel !== null && contentLabel !== "") {
      return contentLabel;
    }
  }

  // 5. Semantic tag names as fallback
  const tagLabels: Record<string, string> = {
    header: "Header",
    nav: "Navigation",
    main: "Main Content",
    section: "Section",
    article: "Article",
    aside: "Sidebar",
    footer: "Footer",
  };
  const tagLabel = tagLabels[tagName];
  if (tagLabel !== undefined && tagLabel !== "") {
    return tagLabel;
  }

  // 6. Final fallback
  if (tagName === "div") {
    return "Block";
  }
  return tagName.charAt(0).toUpperCase() + tagName.slice(1);
}

/**
 * Classify element into a semantic type for color coding.
 * Uses tag name, label, and ARIA role to determine the type.
 */
function getSemanticType(el: HTMLElement, label: string): SemanticType {
  const tagName = el.tagName.toLowerCase();
  const role = el.getAttribute("role");

  // Tag-based classification
  if (tagName === "header" || role === "banner") {
    return "header";
  }
  if (tagName === "nav" || role === "navigation") {
    return "navigation";
  }
  if (tagName === "footer" || role === "contentinfo") {
    return "footer";
  }

  // Label-based classification
  const lowerLabel = label.toLowerCase();
  if (/hero|banner/.test(lowerLabel)) {
    return "hero";
  }
  if (/card|feature|service|testimonial|team|benefit/.test(lowerLabel)) {
    return "card";
  }
  if (/cta|call.?to.?action|contact|newsletter/.test(lowerLabel)) {
    return "cta";
  }
  if (/nav|menu/.test(lowerLabel)) {
    return "navigation";
  }

  return "content";
}

/**
 * Check if an element is a button or button-like link.
 */
function isButtonElement(el: Element): boolean {
  const tagName = el.tagName.toLowerCase();
  if (tagName === "button") {
    return true;
  }
  if (tagName === "input") {
    const type = el.getAttribute("type");
    return type === "submit" || type === "button";
  }
  if (tagName === "a") {
    const role = el.getAttribute("role");
    if (role === "button") {
      return true;
    }
    const className = el.className;
    if (typeof className === "string") {
      return /\b(btn|button|cta)\b/i.test(className);
    }
  }
  return false;
}

/**
 * Check if an element is an icon (small SVG or icon font).
 */
function isIconElement(el: Element): boolean {
  const tagName = el.tagName.toLowerCase();
  if (tagName === "svg") {
    const rect = el.getBoundingClientRect();
    // Small SVGs (under 400px area = 20x20) are icons
    return rect.width * rect.height <= 400;
  }
  if (tagName === "i" || tagName === "span") {
    const className = el.className;
    if (typeof className === "string") {
      return /\b(icon|fa-|bi-|material-icons)\b/i.test(className);
    }
  }
  return false;
}

/**
 * Get bounding box for any Element (works with both HTML and SVG elements).
 */
function getElementBoundingBox(el: Element): BoundingBox {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + window.scrollX,
    y: rect.top + window.scrollY,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Detect content elements within a node and return hints for rendering.
 * Scans for images, buttons, text blocks, and icons.
 * Wrapped in try-catch to prevent breaking node creation on errors.
 */
function detectContentHints(el: HTMLElement): ContentHint[] {
  try {
    return detectContentHintsUnsafe(el);
  } catch (e) {
    console.warn("detectContentHints failed:", e);
    return [];
  }
}

type AddHintFn = (type: ContentType, bbox: BoundingBox, label?: string) => void;

function makeAddHint(hints: ContentHint[], counts: Record<ContentType, number>): AddHintFn {
  return (type: ContentType, bbox: BoundingBox, label?: string): void => {
    const minSize = CONTENT_MIN_SIZES[type];
    const maxCount = CONTENT_MAX_COUNTS[type];

    if (bbox.width < minSize.width || bbox.height < minSize.height) {
      return;
    }
    if (counts[type] >= maxCount) {
      return;
    }

    const hint: ContentHint = label === undefined ? { type, bbox } : { type, bbox, label };
    hints.push(hint);
    counts[type]++;
  };
}

function detectImages(el: HTMLElement, addHint: AddHintFn): void {
  const images = el.querySelectorAll("img, picture, figure");
  for (const img of images) {
    if (!(img instanceof HTMLElement)) {
      continue;
    }
    if (!isElementVisible(img)) {
      continue;
    }
    addHint("image", getAbsoluteBoundingBox(img));
  }
}

function detectLargeSvgImages(svgs: NodeListOf<SVGSVGElement>, addHint: AddHintFn): void {
  for (const svg of svgs) {
    if (!(svg instanceof SVGElement)) {
      continue;
    }
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      continue;
    }
    if (rect.width * rect.height > 400) {
      addHint("image", getElementBoundingBox(svg));
    }
  }
}

function detectButtons(el: HTMLElement, addHint: AddHintFn): void {
  const buttons = el.querySelectorAll("button, a, input[type='submit'], input[type='button']");
  for (const btn of buttons) {
    if (!(btn instanceof HTMLElement)) {
      continue;
    }
    if (!isButtonElement(btn)) {
      continue;
    }
    if (!isElementVisible(btn)) {
      continue;
    }
    const trimmed = btn.textContent.trim().slice(0, 20);
    const label: string | undefined = trimmed === "" ? undefined : trimmed;
    addHint("button", getAbsoluteBoundingBox(btn), label);
  }
}

function detectSvgIcons(svgs: NodeListOf<SVGSVGElement>, addHint: AddHintFn): void {
  for (const svg of svgs) {
    if (!(svg instanceof SVGElement)) {
      continue;
    }
    if (isIconElement(svg)) {
      addHint("icon", getElementBoundingBox(svg));
    }
  }
}

function detectIconFonts(el: HTMLElement, addHint: AddHintFn): void {
  const iconFonts = el.querySelectorAll("i, span");
  for (const icon of iconFonts) {
    if (!(icon instanceof HTMLElement)) {
      continue;
    }
    if (!isIconElement(icon)) {
      continue;
    }
    if (!isElementVisible(icon)) {
      continue;
    }
    addHint("icon", getAbsoluteBoundingBox(icon));
  }
}

function detectTextBlocks(el: HTMLElement, textCount: number, addHint: AddHintFn): void {
  if (textCount >= CONTENT_MAX_COUNTS.text) {
    return;
  }
  const textElements = el.querySelectorAll("p, h1, h2, h3, h4, h5, h6");
  if (textElements.length === 0) {
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasVisibleText = false;

  for (const text of textElements) {
    if (!(text instanceof HTMLElement)) {
      continue;
    }
    if (!isElementVisible(text)) {
      continue;
    }
    const rect = text.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 10) {
      continue;
    }
    hasVisibleText = true;
    const bbox = getAbsoluteBoundingBox(text);
    minX = Math.min(minX, bbox.x);
    minY = Math.min(minY, bbox.y);
    maxX = Math.max(maxX, bbox.x + bbox.width);
    maxY = Math.max(maxY, bbox.y + bbox.height);
  }

  if (hasVisibleText && minX !== Infinity) {
    addHint("text", { x: minX, y: minY, width: maxX - minX, height: maxY - minY });
  }
}

function detectContentHintsUnsafe(el: HTMLElement): ContentHint[] {
  const hints: ContentHint[] = [];
  const counts: Record<ContentType, number> = { image: 0, button: 0, text: 0, icon: 0 };
  const addHint = makeAddHint(hints, counts);

  detectImages(el, addHint);
  const svgs = el.querySelectorAll("svg");
  detectLargeSvgImages(svgs, addHint);
  detectButtons(el, addHint);
  detectSvgIcons(svgs, addHint);
  detectIconFonts(el, addHint);
  detectTextBlocks(el, counts.text, addHint);

  return hints;
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
 * Collect child WireframeNodes from a grid container: process grid items as cards,
 * then pass landmark children through normally.
 */
function collectGridChildNodes(
  el: HTMLElement,
  gridItems: HTMLElement[],
  depth: number,
  viewportArea: number,
  config: AnalyzerConfig,
): WireframeNode[] {
  const childNodes: WireframeNode[] = [];
  for (const gridChild of gridItems) {
    const node = buildNodeTree(gridChild, depth + 1, viewportArea, config, true);
    if (node) {
      childNodes.push(node);
    }
  }
  // Also process landmark children normally (they were excluded from gridItems)
  for (const child of Array.from(el.children)) {
    if (child instanceof HTMLElement && isLandmark(child)) {
      const node = buildNodeTree(child, depth + 1, viewportArea, config, false);
      if (node) {
        childNodes.push(node);
      }
    }
  }
  return childNodes;
}

/**
 * Collect child WireframeNodes via normal (non-grid) traversal.
 */
function collectNormalChildNodes(
  el: HTMLElement,
  depth: number,
  significant: boolean,
  viewportArea: number,
  config: AnalyzerConfig,
): WireframeNode[] {
  const childNodes: WireframeNode[] = [];
  for (const child of Array.from(el.children)) {
    if (child instanceof HTMLElement) {
      const node = buildNodeTree(
        child,
        significant ? depth + 1 : depth,
        viewportArea,
        config,
        false,
      );
      if (node) {
        childNodes.push(node);
      }
    }
  }
  return childNodes;
}

/**
 * Collect child nodes: dispatch to grid or normal traversal.
 * Grid items are leaf nodes so they get no child traversal.
 */
function collectChildNodes(
  el: HTMLElement,
  depth: number,
  significant: boolean,
  viewportArea: number,
  config: AnalyzerConfig,
  isGridItem: boolean,
  gridItems: HTMLElement[] | null,
): WireframeNode[] {
  if (gridItems) {
    return collectGridChildNodes(el, gridItems, depth, viewportArea, config);
  }
  if (!isGridItem) {
    return collectNormalChildNodes(el, depth, significant, viewportArea, config);
  }
  return [];
}

/**
 * Wrapper collapse: return the sole child if it dominates the parent's area
 * and carries more semantic meaning. Returns null if no collapse applies.
 */
function maybeCollapseToChild(
  el: HTMLElement,
  bbox: BoundingBox,
  childNodes: WireframeNode[],
  gridItems: HTMLElement[] | null,
): WireframeNode | null {
  if (childNodes.length !== 1 || gridItems) {
    return null;
  }
  const child = childNodes[0];
  if (!child || !bboxesSimilar(bbox, child.bbox)) {
    return null;
  }
  if (!isLandmark(el) && child.isLandmark) {
    return child;
  }
  const myLabel = generateLabel(el);
  if (
    (myLabel === "Block" || myLabel === "Section") &&
    child.label !== "Block" &&
    child.label !== "Section"
  ) {
    return child;
  }
  return null;
}

/**
 * Construct the final WireframeNode for a significant element.
 */
function makeWireframeNode(
  el: HTMLElement,
  bbox: BoundingBox,
  depth: number,
  childNodes: WireframeNode[],
  isGridItem: boolean,
): WireframeNode {
  const label = isGridItem ? inferGridItemLabel(el) : generateLabel(el);
  const contentHints = detectContentHints(el);
  return {
    id: generateNodeId(),
    tagName: el.tagName.toLowerCase(),
    label,
    bbox,
    depth,
    children: childNodes,
    isLandmark: isLandmark(el),
    semanticType: isGridItem ? "card" : getSemanticType(el, label),
    ...(contentHints.length > 0 ? { contentHints } : {}),
  };
}

/**
 * Recursively build wireframe nodes from DOM elements.
 * @param isGridItem - If true, this element is a grid item and bypasses normal filtering
 */
function buildNodeTree(
  el: HTMLElement,
  depth: number,
  viewportArea: number,
  config: AnalyzerConfig,
  isGridItem: boolean = false,
): WireframeNode | null {
  if (depth > config.maxDepth && !isGridItem) {
    return null;
  }
  if (!isElementVisible(el)) {
    return null;
  }

  const bbox = getAbsoluteBoundingBox(el);
  const significant = isGridItem || isSignificant(el, viewportArea, config);
  const gridItems = significant && !isGridItem ? detectGridItems(el) : null;

  const childNodes = collectChildNodes(
    el,
    depth,
    significant,
    viewportArea,
    config,
    isGridItem,
    gridItems,
  );

  if (!significant) {
    return childNodes.length === 1 ? (childNodes[0] ?? null) : null;
  }

  const collapsed = maybeCollapseToChild(el, bbox, childNodes, gridItems);
  if (collapsed !== null) {
    return collapsed;
  }

  return makeWireframeNode(el, bbox, depth, childNodes, isGridItem);
}

/**
 * Analyze the DOM and build a wireframe model.
 */
export function analyzeDom(
  root: HTMLElement | Document = document,
  config: Partial<AnalyzerConfig> = {},
): WireframeModel {
  nodeIdCounter = 0;

  const mergedConfig: AnalyzerConfig = { ...DEFAULT_CONFIG, ...config };

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const viewportArea = viewportWidth * viewportHeight;

  const fullPageHeight = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight,
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
