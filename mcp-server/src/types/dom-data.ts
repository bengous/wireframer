/**
 * DOM Data Types
 *
 * Data structures for DOM extraction via Playwright.
 * This data is sent to Claude for semantic analysis.
 */

import type { BoundingBox } from "@wireframe-mapper/shared";

/**
 * Complete DOM data extracted from a page.
 */
export interface DomData {
	/** Page URL */
	url: string;
	/** Page title */
	title: string;
	/** Viewport dimensions */
	viewport: {
		width: number;
		height: number;
	};
	/** Total scrollable page height */
	fullPageHeight: number;
	/** Extracted DOM elements */
	elements: DomElement[];
}

/**
 * A single DOM element with relevant properties for wireframe analysis.
 */
export interface DomElement {
	/** Unique CSS selector for this element */
	selector: string;
	/** HTML tag name (lowercase) */
	tagName: string;
	/** Bounding box in absolute page coordinates */
	bbox: BoundingBox;
	/** ARIA role if present */
	role?: string;
	/** Landmark type if element is a landmark (header, nav, main, footer, etc.) */
	landmark?: string;
	/** Heading level (1-6) if element is h1-h6 */
	headingLevel?: number;
	/** First 100 chars of text content */
	textPreview?: string;
	/** Text of first h1-h3 heading inside this element */
	headingText?: string;
	/** Number of direct children */
	childCount: number;
	/** Depth in DOM tree from body */
	depth: number;
	/** CSS display property */
	display?: string;
	/** CSS flex-direction if display is flex */
	flexDirection?: string;
	/** Meaningful class names (utility classes filtered out) */
	meaningfulClasses: string[];
}
