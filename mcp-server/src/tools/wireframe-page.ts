/**
 * Wireframe Page Tool
 *
 * Orchestrates the wireframe generation pipeline:
 * 1. Gather DOM data via Playwright
 * 2. Generate WireframeModel via Claude CLI
 * 3. Render to PNG via node-canvas
 */

import { join } from "path";
import { gatherDom } from "../browser/dom-gatherer.js";
import { generateModel } from "../ai/model-generator.js";
import { renderToFile } from "../render/canvas-renderer.js";

export interface WireframePageOptions {
	/** URL to wireframe */
	url: string;
	/** Viewport width (default: 1280) */
	viewportWidth?: number;
	/** Viewport height (default: 800) */
	viewportHeight?: number;
	/** Special instructions for AI */
	instructions?: string;
	/** Show labels (default: true) */
	showLabels?: boolean;
	/** Show content placeholders (default: true) */
	showContentHints?: boolean;
	/** Output file path (default: auto-generated in .wireframe/) */
	outputPath?: string;
}

export interface WireframePageResult {
	/** Path to the generated PNG file */
	imagePath: string;
	/** Summary of the wireframe */
	summary: string;
	/** List of section labels */
	sections: string[];
}

/**
 * Generate a wireframe from a URL.
 */
export async function wireframePage(
	options: WireframePageOptions
): Promise<WireframePageResult> {
	const {
		url,
		viewportWidth = 1280,
		viewportHeight = 800,
		instructions,
		showLabels = true,
		showContentHints = true,
	} = options;

	// 1. Gather DOM data via Playwright
	const domData = await gatherDom(url, {
		width: viewportWidth,
		height: viewportHeight,
	});

	// 2. Generate model via Claude CLI (uses Max subscription)
	const model = await generateModel(domData, instructions);

	// 3. Determine output path
	const outputPath =
		options.outputPath ||
		join(process.cwd(), ".wireframe", `wireframe-${Date.now()}.png`);

	// 4. Render to PNG with node-canvas
	await renderToFile(model, outputPath, {
		showLabels,
		showContentHints,
	});

	// 5. Collect section labels
	const sections: string[] = [];
	function collectLabels(
		nodes: typeof model.nodes,
		depth = 0
	): void {
		for (const node of nodes) {
			if (node.label) {
				sections.push(depth > 0 ? `  ${"  ".repeat(depth - 1)}└─ ${node.label}` : node.label);
			}
			collectLabels(node.children, depth + 1);
		}
	}
	collectLabels(model.nodes);

	// 6. Return minimal result (keeps context clean)
	return {
		imagePath: outputPath,
		summary: `Generated wireframe with ${model.nodes.length} sections (${model.viewport.width}x${model.fullPageHeight}px)`,
		sections,
	};
}
