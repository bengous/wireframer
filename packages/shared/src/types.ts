/**
 * Shared Type Definitions
 *
 * Core data structures used by both the browser tool and MCP server:
 * - BoundingBox: Position and size in absolute page coordinates
 * - WireframeNode: A significant DOM element in the wireframe tree
 * - WireframeModel: Complete page analysis result
 * - AnalyzerConfig: Settings for DOM analysis
 * - RendererConfig: Settings for canvas rendering
 *
 * @module shared/types
 */

/**
 * Semantic classification for visual differentiation in rendered wireframes.
 */
export type SemanticType = "header" | "navigation" | "hero" | "content" | "card" | "cta" | "footer";

/**
 * Content element type for placeholder rendering.
 */
export type ContentType = "image" | "button" | "text" | "icon";

/**
 * Detected content element within a wireframe node.
 * Used to render visual placeholders (crossed boxes for images, pills for buttons, etc.)
 */
export interface ContentHint {
	type: ContentType;
	bbox: BoundingBox;
	/** Optional label for buttons */
	label?: string;
}

/**
 * Bounding box in absolute page coordinates (not viewport-relative).
 * Origin (0,0) is top-left of the full page.
 */
export interface BoundingBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * A node in the wireframe tree representing a significant DOM element.
 */
export interface WireframeNode {
	/** Unique identifier for this node */
	id: string;
	/** Original HTML tag name (lowercase) */
	tagName: string;
	/** Human-readable label: "Header", "Hero", "Card", etc. */
	label: string;
	/** Position and size in absolute page coordinates */
	bbox: BoundingBox;
	/** Nesting depth (0 = root level) */
	depth: number;
	/** Child nodes */
	children: WireframeNode[];
	/** True if this is a semantic landmark (header, nav, main, etc.) */
	isLandmark: boolean;
	/** Semantic classification for color coding */
	semanticType: SemanticType;
	/** Content placeholders to render inside this node */
	contentHints?: ContentHint[];
}

/**
 * Complete wireframe model for a page.
 */
export interface WireframeModel {
	/** Root-level nodes (usually body's direct significant children) */
	nodes: WireframeNode[];
	/** Viewport dimensions at capture time */
	viewport: {
		width: number;
		height: number;
	};
	/** Total scrollable page height */
	fullPageHeight: number;
	/** Page URL */
	pageUrl: string;
	/** ISO timestamp of capture */
	capturedAt: string;
}

/**
 * Configuration options for the analyzer.
 */
export interface AnalyzerConfig {
	/** Minimum element area in pixels squared (default: 2500 = 50x50) */
	minArea: number;
	/** Maximum depth to traverse (default: 4) */
	maxDepth: number;
	/** Minimum percentage of viewport area for significance (default: 0.02 = 2%) */
	viewportAreaThreshold: number;
}

/**
 * Configuration options for the renderer.
 */
export interface RendererConfig {
	/** Show labels on blocks */
	showLabels: boolean;
	/** Background color */
	backgroundColor: string;
	/** Block fill color */
	blockFillColor: string;
	/** Block border color */
	blockBorderColor: string;
	/** Label text color */
	labelColor: string;
	/** Base font size for labels */
	labelFontSize: number;
	/** Custom label overrides by node ID. Empty string hides the label. */
	labelOverrides?: Map<string, string>;
	/** Show content placeholders (images, buttons, text, icons). Default: true */
	showContentHints?: boolean;
}

/**
 * Badge position info for click detection.
 */
export interface BadgeInfo {
	nodeId: string;
	x: number;
	y: number;
	width: number;
	height: number;
	label: string;
}
