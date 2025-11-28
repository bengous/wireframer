/**
 * Wireframe Mapper MCP Server
 *
 * MCP server for AI-driven wireframe generation.
 * Uses Playwright for DOM extraction, Claude CLI for semantic understanding,
 * and @napi-rs/canvas (Skia-based) for rendering.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { wireframePage } from "./tools/wireframe-page.js";
import { log, logError, logSeparator, getLogPath } from "./utils/logger.js";

logSeparator("MCP SERVER STARTUP");
log("index", "Initializing MCP server", {
	pid: process.pid,
	cwd: process.cwd(),
	nodeVersion: process.version,
	logFile: getLogPath(),
});

// Create MCP server
const server = new McpServer({
	name: "wireframe-mapper",
	version: "0.1.0",
});

log("index", "MCP server instance created");

// Register wireframe_page tool
server.tool(
	"wireframe_page",
	"Generate a wireframe PNG from a live website using AI semantic understanding. Uses Playwright for DOM extraction, Claude for intelligent section identification, and renders to a clean PNG with semantic color coding.",
	{
		url: z.string().url().describe("URL to wireframe"),
		viewport_width: z
			.number()
			.optional()
			.describe("Viewport width in pixels (default: 1280)"),
		viewport_height: z
			.number()
			.optional()
			.describe("Viewport height in pixels (default: 800)"),
		instructions: z
			.string()
			.optional()
			.describe(
				"Special instructions for AI (e.g., 'focus on the hero section', 'highlight CTAs')"
			),
		show_labels: z
			.boolean()
			.optional()
			.describe("Show section labels (default: true)"),
		show_content_hints: z
			.boolean()
			.optional()
			.describe("Show content placeholders for images/buttons/text (default: true)"),
		output_path: z
			.string()
			.optional()
			.describe("Output file path (default: auto-generated in .wireframe/)"),
	},
	async ({
		url,
		viewport_width,
		viewport_height,
		instructions,
		show_labels,
		show_content_hints,
		output_path,
	}) => {
		logSeparator("TOOL INVOCATION: wireframe_page");
		log("index", "Tool called with params", {
			url,
			viewport_width,
			viewport_height,
			instructions,
			show_labels,
			show_content_hints,
			output_path,
		});

		const startTime = Date.now();
		try {
			log("index", "Calling wireframePage...");
			const result = await wireframePage({
				url,
				viewportWidth: viewport_width,
				viewportHeight: viewport_height,
				instructions,
				showLabels: show_labels,
				showContentHints: show_content_hints,
				outputPath: output_path,
			});

			const duration = Date.now() - startTime;
			log("index", `Tool completed successfully in ${duration}ms`, {
				imagePath: result.imagePath,
				sectionsCount: result.sections.length,
			});

			return {
				content: [
					{
						type: "text" as const,
						text: `${result.summary}\n\nSaved to: ${result.imagePath}\n\nSections:\n${result.sections.join("\n")}`,
					},
				],
			};
		} catch (error) {
			const duration = Date.now() - startTime;
			logError("index", `Tool failed after ${duration}ms`, error);

			const message =
				error instanceof Error ? error.message : "Unknown error occurred";
			return {
				content: [
					{
						type: "text" as const,
						text: `Failed to generate wireframe: ${message}`,
					},
				],
				isError: true,
			};
		}
	}
);

// Start server
async function main() {
	log("index", "Creating StdioServerTransport...");
	const transport = new StdioServerTransport();
	log("index", "Connecting to transport...");
	await server.connect(transport);
	log("index", "Server connected and running");
	console.error(`Wireframe Mapper MCP server running (log: ${getLogPath()})`);
}

main().catch((error) => {
	logError("index", "Failed to start MCP server", error);
	console.error("Failed to start MCP server:", error);
	process.exit(1);
});
