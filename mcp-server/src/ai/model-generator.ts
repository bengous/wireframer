/**
 * Model Generator
 *
 * Spawns Claude CLI to generate WireframeModel from DomData.
 * Uses existing Max subscription - no API key needed.
 */

import { spawn } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { WireframeModel } from "../../../shared/types.js";
import type { DomData } from "../types/dom-data.js";
import { buildPrompt } from "./prompt-builder.js";

/**
 * Extract JSON from Claude's response.
 * Handles markdown code blocks and raw JSON.
 */
function extractJson(response: string): string {
	// Try to find JSON in markdown code block
	const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (codeBlockMatch) {
		return codeBlockMatch[1].trim();
	}

	// Try to find raw JSON (starts with { and ends with })
	const jsonMatch = response.match(/\{[\s\S]*\}/);
	if (jsonMatch) {
		return jsonMatch[0];
	}

	throw new Error("No JSON found in response");
}

/**
 * Validate and parse the WireframeModel from JSON.
 */
function parseWireframeModel(json: string): WireframeModel {
	try {
		const parsed = JSON.parse(json);

		// Basic validation
		if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
			throw new Error("Invalid WireframeModel: missing nodes array");
		}

		if (!parsed.viewport || typeof parsed.viewport.width !== "number") {
			throw new Error("Invalid WireframeModel: missing viewport");
		}

		return parsed as WireframeModel;
	} catch (error) {
		if (error instanceof SyntaxError) {
			throw new Error(`Invalid JSON: ${error.message}`);
		}
		throw error;
	}
}

/**
 * Generate a WireframeModel from DomData using Claude CLI.
 */
export async function generateModel(
	domData: DomData,
	instructions?: string
): Promise<WireframeModel> {
	// Build the prompt
	const prompt = buildPrompt(domData, instructions);

	// Write prompt to temp file to avoid shell escaping issues
	const tempFile = join(tmpdir(), `wireframe-prompt-${Date.now()}.txt`);
	await writeFile(tempFile, prompt, "utf-8");

	try {
		// Spawn Claude CLI with prompt piped via stdin
		const result = await new Promise<string>((resolve, reject) => {
			const claude = spawn("claude", ["--print"], {
				stdio: ["pipe", "pipe", "pipe"],
				env: { ...process.env },
			});

			let stdout = "";
			let stderr = "";

			claude.stdout.on("data", (data: Buffer) => {
				stdout += data.toString();
			});

			claude.stderr.on("data", (data: Buffer) => {
				stderr += data.toString();
			});

			claude.on("close", (code) => {
				if (code === 0) {
					resolve(stdout);
				} else {
					reject(
						new Error(`Claude CLI exited with code ${code}: ${stderr}`)
					);
				}
			});

			claude.on("error", (error) => {
				reject(new Error(`Failed to spawn Claude CLI: ${error.message}`));
			});

			// Write prompt to stdin and close
			claude.stdin.write(prompt);
			claude.stdin.end();
		});

		// Extract and parse JSON from response
		const json = extractJson(result);
		const model = parseWireframeModel(json);

		// Ensure required fields
		if (!model.pageUrl) model.pageUrl = domData.url;
		if (!model.capturedAt) model.capturedAt = new Date().toISOString();
		if (!model.viewport) {
			model.viewport = {
				width: domData.viewport.width,
				height: domData.viewport.height,
			};
		}
		if (!model.fullPageHeight) model.fullPageHeight = domData.fullPageHeight;

		return model;
	} finally {
		// Cleanup temp file
		try {
			await unlink(tempFile);
		} catch {
			// Ignore cleanup errors
		}
	}
}
