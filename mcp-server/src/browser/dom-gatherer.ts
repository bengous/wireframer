/**
 * DOM Gatherer
 *
 * Uses Playwright to navigate to a URL and extract DOM data
 * for AI-powered wireframe analysis.
 */

import { chromium, type Browser } from "playwright";
import type { DomData, DomElement } from "../types/dom-data.js";
import type { BoundingBox } from "@wireframe-mapper/shared";
import { log, logError } from "../utils/logger.js";

/** Minimum element size to include (50x50 = 2500px²) */
const MIN_ELEMENT_AREA = 2500;

/** Patterns for utility/generic classes to filter out (as strings for browser context) */
const UTILITY_CLASS_PATTERN_STRINGS = [
	"^container$",
	"^wrapper$",
	"^inner$",
	"^outer$",
	"^content$",
	"^box$",
	"^row$",
	"^col(umn)?[-_]?\\d*$",
	"^grid$",
	"^flex$",
	"^layout$",
	"^max[-_]?w",
	"^mx[-_]?auto",
	"^px[-_]?\\d",
	"^py[-_]?\\d",
	"^p[-_]?\\d",
	"^m[-_]?\\d",
	// Tailwind utility patterns
	"^(sm|md|lg|xl|2xl):",
	"^(text|bg|border|rounded|shadow|font|leading|tracking)-",
	"^(w|h|min-w|min-h|max-w|max-h)-",
	"^(top|right|bottom|left|inset)-",
	"^(absolute|relative|fixed|sticky)$",
	"^(hidden|block|inline|inline-block)$",
	"^(overflow|z)-",
	"^(gap|space)-",
	"^(items|justify|self|place)-",
];

export interface GatherOptions {
	/** Viewport width (default: 1280) */
	width?: number;
	/** Viewport height (default: 800) */
	height?: number;
	/** Wait for network idle before extracting (default: true) */
	waitForNetworkIdle?: boolean;
}

/**
 * Gather DOM data from a URL using Playwright.
 */
export async function gatherDom(
	url: string,
	options: GatherOptions = {}
): Promise<DomData> {
	const { width = 1280, height = 800, waitForNetworkIdle = true } = options;

	log("dom-gatherer", "gatherDom called", { url, width, height, waitForNetworkIdle });

	let browser: Browser | null = null;

	try {
		log("dom-gatherer", "Launching Chromium...");
		browser = await chromium.launch({ headless: true });
		log("dom-gatherer", "Browser launched");

		const page = await browser.newPage({
			viewport: { width, height },
		});
		log("dom-gatherer", "Page created with viewport", { width, height });

		// Navigate to URL
		log("dom-gatherer", `Navigating to ${url}...`);
		await page.goto(url, {
			waitUntil: waitForNetworkIdle ? "networkidle" : "domcontentloaded",
			timeout: 30000,
		});
		log("dom-gatherer", "Navigation complete");

		// Extract DOM data in a single page.evaluate() call
		// This minimizes context usage by avoiding multiple round-trips
		const domData = await page.evaluate(
			({ minArea, utilityPatterns }) => {
				const patterns = utilityPatterns.map((p) => new RegExp(p, "i"));

				// Filter meaningful class names (remove utility classes)
				function filterClasses(classList: DOMTokenList): string[] {
					return Array.from(classList).filter(
						(cls) => !patterns.some((pattern) => pattern.test(cls))
					);
				}

				// Get bounding box in absolute page coordinates
				function getBbox(el: Element): { x: number; y: number; width: number; height: number } {
					const rect = el.getBoundingClientRect();
					return {
						x: rect.left + window.scrollX,
						y: rect.top + window.scrollY,
						width: rect.width,
						height: rect.height,
					};
				}

				// Get landmark type for semantic elements
				function getLandmark(el: Element): string | undefined {
					const tag = el.tagName.toLowerCase();
					const role = el.getAttribute("role");

					// ARIA role takes precedence
					if (role === "banner") return "header";
					if (role === "navigation") return "nav";
					if (role === "main") return "main";
					if (role === "contentinfo") return "footer";
					if (role === "complementary") return "aside";

					// Semantic HTML tags
					if (tag === "header") return "header";
					if (tag === "nav") return "nav";
					if (tag === "main") return "main";
					if (tag === "footer") return "footer";
					if (tag === "aside") return "aside";
					if (tag === "section") return "section";
					if (tag === "article") return "article";

					return undefined;
				}

				// Get first heading text inside element
				function getHeadingText(el: Element): string | undefined {
					const heading = el.querySelector("h1, h2, h3");
					if (heading) {
						const text = heading.textContent?.trim();
						return text ? text.substring(0, 100) : undefined;
					}
					return undefined;
				}

				// Generate a unique selector for an element
				function getSelector(el: Element): string {
					if (el.id) return `#${el.id}`;

					const tag = el.tagName.toLowerCase();
					const parent = el.parentElement;

					if (!parent) return tag;

					const siblings = Array.from(parent.children).filter(
						(child) => child.tagName === el.tagName
					);

					if (siblings.length === 1) {
						return `${getSelector(parent)} > ${tag}`;
					}

					const index = siblings.indexOf(el) + 1;
					return `${getSelector(parent)} > ${tag}:nth-of-type(${index})`;
				}

				// Element data structure
				interface ExtractedElement {
					selector: string;
					tagName: string;
					bbox: { x: number; y: number; width: number; height: number };
					role?: string;
					landmark?: string;
					headingLevel?: number;
					textPreview?: string;
					headingText?: string;
					childCount: number;
					depth: number;
					display?: string;
					flexDirection?: string;
					meaningfulClasses: string[];
				}

				// Extract elements recursively
				function extractElements(
					el: Element,
					depth: number,
					elements: ExtractedElement[]
				): void {
					const bbox = getBbox(el);
					const area = bbox.width * bbox.height;

					// Skip small elements
					if (area < minArea) return;

					// Skip hidden elements
					const style = window.getComputedStyle(el);
					if (
						style.display === "none" ||
						style.visibility === "hidden" ||
						style.opacity === "0"
					) {
						return;
					}

					const tag = el.tagName.toLowerCase();
					const htmlEl = el as HTMLElement;
					const classList = htmlEl.classList || { length: 0, [Symbol.iterator]: () => [][Symbol.iterator]() };

					// Extract element data
					const element: ExtractedElement = {
						selector: getSelector(el),
						tagName: tag,
						bbox,
						childCount: el.children.length,
						depth,
						meaningfulClasses: classList.length > 0 ? filterClasses(classList) : [],
					};

					// Add optional properties
					const role = el.getAttribute("role");
					if (role) element.role = role;

					const landmark = getLandmark(el);
					if (landmark) element.landmark = landmark;

					// Heading level
					const headingMatch = tag.match(/^h([1-6])$/);
					if (headingMatch) {
						element.headingLevel = parseInt(headingMatch[1], 10);
					}

					// Text preview
					const textContent = el.textContent?.trim();
					if (textContent) {
						element.textPreview = textContent.substring(0, 100);
					}

					// Heading text inside
					const headingText = getHeadingText(el);
					if (headingText) element.headingText = headingText;

					// CSS display
					const display = style.display;
					if (display && display !== "block") element.display = display;

					// Flex direction
					if (display === "flex" || display === "inline-flex") {
						element.flexDirection = style.flexDirection;
					}

					elements.push(element);

					// Recurse into children (limit depth to avoid noise)
					if (depth < 5) {
						for (const child of Array.from(el.children)) {
							extractElements(child, depth + 1, elements);
						}
					}
				}

				// Start extraction from body
				const elements: ExtractedElement[] = [];
				extractElements(document.body, 0, elements);

				return {
					url: window.location.href,
					title: document.title,
					viewport: {
						width: window.innerWidth,
						height: window.innerHeight,
					},
					fullPageHeight: Math.max(
						document.body.scrollHeight,
						document.documentElement.scrollHeight
					),
					elements,
				};
			},
			{
				minArea: MIN_ELEMENT_AREA,
				utilityPatterns: UTILITY_CLASS_PATTERN_STRINGS,
			}
		);

		log("dom-gatherer", "DOM extraction complete", {
			elementCount: domData.elements.length,
			fullPageHeight: domData.fullPageHeight,
		});
		return domData as DomData;
	} catch (error) {
		logError("dom-gatherer", "Failed to gather DOM", error);
		throw error;
	} finally {
		if (browser) {
			log("dom-gatherer", "Closing browser...");
			await browser.close();
			log("dom-gatherer", "Browser closed");
		}
	}
}
