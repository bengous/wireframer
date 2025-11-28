/**
 * Prompt Builder
 *
 * Builds prompts for Claude to generate WireframeModel from DomData.
 */

import type { DomData } from "../types/dom-data.js";

/**
 * Build the system prompt for wireframe generation.
 */
export function buildSystemPrompt(): string {
	return `You are a wireframe architect. Given DOM data from a webpage, you create a clean WireframeModel JSON that captures the meaningful layout structure.

You will receive:
1. Page metadata (URL, title, viewport, full height)
2. A list of DOM elements with bounding boxes and semantic hints

Your task:
1. Identify the major visual sections of the page
2. Assign meaningful labels that describe PURPOSE, not just structure
3. Classify each section with the correct semanticType for color coding
4. Decide which elements should have children vs be standalone sections
5. IMPORTANT: Only include what matters for understanding the layout - be selective

Output Format:
You MUST output valid JSON matching the WireframeModel schema below. No markdown, no explanation, just JSON.

WireframeModel Schema:
{
  "nodes": [
    {
      "id": "string (unique)",
      "tagName": "string (original HTML tag)",
      "label": "string (meaningful description like 'Hero + Dual CTA', 'Services Grid (4)')",
      "bbox": { "x": number, "y": number, "width": number, "height": number },
      "depth": number (0 for root, increment for children),
      "children": [ /* nested WireframeNode objects */ ],
      "isLandmark": boolean (true for header, nav, main, footer, aside),
      "semanticType": "header" | "navigation" | "hero" | "content" | "card" | "cta" | "footer",
      "contentHints": [ /* optional: { "type": "image"|"button"|"text"|"icon", "bbox": {...}, "label": "..." } */ ]
    }
  ],
  "viewport": { "width": number, "height": number },
  "fullPageHeight": number,
  "pageUrl": "string",
  "capturedAt": "ISO 8601 timestamp"
}

semanticType Guidelines:
- "header": Page header, banner, top bar
- "navigation": Nav menus, sidebars with links
- "hero": Large hero sections, banners with CTAs
- "content": Generic content sections, text blocks
- "card": Cards, grid items, feature boxes, list items
- "cta": Call-to-action buttons, signup forms
- "footer": Page footer, bottom sections

Label Guidelines:
- Labels should describe PURPOSE: "Hero + Dual CTA", "Services Grid (4)", "Testimonials Carousel"
- Include counts when relevant: "Value Props (3)", "Footer (4-col)"
- Be concise but descriptive

Structure Guidelines:
- Maximum 2-3 levels of depth
- Only create children when they're visually distinct within the parent
- Flatten hierarchy where nesting isn't meaningful
- Grid items should be children with semanticType "card"
- CTAs within heroes should be children with semanticType "cta"`;
}

/**
 * Build the user prompt with DOM data.
 */
export function buildUserPrompt(
	domData: DomData,
	instructions?: string
): string {
	// Format elements for the prompt
	const elementsSummary = domData.elements
		.slice(0, 150) // Limit to avoid context bloat
		.map((el, i) => {
			let line = `[${i}] <${el.tagName}> at (${Math.round(el.bbox.x)},${Math.round(el.bbox.y)}) ${Math.round(el.bbox.width)}x${Math.round(el.bbox.height)}`;

			if (el.landmark) line += `\n  landmark: ${el.landmark}`;
			if (el.role) line += `\n  role: ${el.role}`;
			if (el.headingLevel) line += `\n  heading: h${el.headingLevel}`;
			if (el.headingText) line += `\n  headingText: "${el.headingText}"`;
			if (el.display && el.display !== "block")
				line += `\n  display: ${el.display}`;
			if (el.flexDirection) line += `\n  flex: ${el.flexDirection}`;
			if (el.meaningfulClasses.length > 0)
				line += `\n  classes: [${el.meaningfulClasses.join(", ")}]`;
			if (el.textPreview && el.textPreview.length > 0)
				line += `\n  text: "${el.textPreview.substring(0, 50)}${el.textPreview.length > 50 ? "..." : ""}"`;

			return line;
		})
		.join("\n");

	let prompt = `Page: ${domData.url}
Title: ${domData.title}
Viewport: ${domData.viewport.width}x${domData.viewport.height}
Full Page Height: ${domData.fullPageHeight}px
Elements: ${domData.elements.length} total (showing first 150)

`;

	if (instructions) {
		prompt += `Special Instructions: ${instructions}\n\n`;
	}

	prompt += `DOM Elements:
${elementsSummary}

Generate the WireframeModel JSON:`;

	return prompt;
}

/**
 * Build the complete prompt for Claude CLI.
 */
export function buildPrompt(domData: DomData, instructions?: string): string {
	const system = buildSystemPrompt();
	const user = buildUserPrompt(domData, instructions);

	// For Claude CLI, we combine system and user into a single prompt
	return `${system}

---

${user}`;
}
