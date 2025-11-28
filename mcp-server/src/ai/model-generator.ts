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
import type { WireframeModel } from "@wireframe-mapper/shared";
import type { DomData } from "../types/dom-data.js";
import { buildPrompt } from "./prompt-builder.js";
import { log, logError, logDebug } from "../utils/logger.js";

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
	log("model-generator", "generateModel called", {
		url: domData.url,
		elementCount: domData.elements.length,
		hasInstructions: !!instructions,
	});

	// Build the prompt
	const prompt = buildPrompt(domData, instructions);
	log("model-generator", `Prompt built: ${prompt.length} chars`);
	logDebug("model-generator", "Prompt preview", prompt.slice(0, 500));

	// Write prompt to temp file to avoid shell escaping issues
	const tempFile = join(tmpdir(), `wireframe-prompt-${Date.now()}.txt`);
	await writeFile(tempFile, prompt, "utf-8");
	log("model-generator", `Temp file written: ${tempFile}`);

	try {
		// Spawn Claude CLI with prompt piped via stdin
		// Use --tools "" to disable tools (faster, less context)
		// Use --model sonnet for balance of speed and quality
		const cliArgs = [
			"--print",
			"--output-format", "json",
			"--tools", "",
			"--model", "sonnet",
			"--setting-sources", ""  // Critical: disable project context loading
		];
		log("model-generator", "Spawning Claude CLI", { args: cliArgs });

		const spawnStartTime = Date.now();
		const result = await new Promise<string>((resolve, reject) => {
			const claude = spawn("claude", cliArgs, {
				stdio: ["pipe", "pipe", "pipe"],
				env: { ...process.env },
			});

			log("model-generator", `Claude process spawned, PID: ${claude.pid}`);

			let stdout = "";
			let stderr = "";
			let stdoutChunks = 0;
			let stderrChunks = 0;

			claude.stdout.on("data", (data: Buffer) => {
				stdout += data.toString();
				stdoutChunks++;
				logDebug("model-generator", `stdout chunk #${stdoutChunks}: ${data.length} bytes`);
			});

			claude.stderr.on("data", (data: Buffer) => {
				stderr += data.toString();
				stderrChunks++;
				logDebug("model-generator", `stderr chunk #${stderrChunks}`, data.toString().slice(0, 200));
			});

			claude.on("close", (code) => {
				const duration = Date.now() - spawnStartTime;
				log("model-generator", `Claude process closed`, {
					code,
					duration,
					stdoutLength: stdout.length,
					stderrLength: stderr.length,
					stdoutChunks,
					stderrChunks,
				});

				if (code === 0) {
					// Parse the JSON wrapper and extract result
					try {
						logDebug("model-generator", "Parsing JSON wrapper", stdout.slice(0, 300));
						const wrapper = JSON.parse(stdout);
						if (wrapper.is_error) {
							logError("model-generator", "Claude returned error", wrapper);
							reject(new Error(`Claude error: ${wrapper.result}`));
						} else {
							log("model-generator", "Claude returned success", {
								resultLength: wrapper.result?.length,
								duration_ms: wrapper.duration_ms,
							});
							resolve(wrapper.result);
						}
					} catch (parseError) {
						// If not JSON, return raw output
						log("model-generator", "Output not JSON wrapper, using raw", { stdout: stdout.slice(0, 200) });
						resolve(stdout);
					}
				} else {
					logError("model-generator", `Claude CLI exited with code ${code}`, { stderr, stdout: stdout.slice(0, 500) });
					reject(
						new Error(`Claude CLI exited with code ${code}: ${stderr}`)
					);
				}
			});

			claude.on("error", (error) => {
				logError("model-generator", "Failed to spawn Claude CLI", error);
				reject(new Error(`Failed to spawn Claude CLI: ${error.message}`));
			});

			// Write prompt to stdin and close
			log("model-generator", `Writing ${prompt.length} bytes to stdin...`);
			claude.stdin.write(prompt);
			claude.stdin.end();
			log("model-generator", "stdin closed, waiting for response...");
		});

		// Extract and parse JSON from response
		log("model-generator", "Extracting JSON from result", { resultLength: result.length });
		const json = extractJson(result);
		log("model-generator", "JSON extracted", { jsonLength: json.length });

		const model = parseWireframeModel(json);
		log("model-generator", "Model parsed", { nodeCount: model.nodes?.length });

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

		log("model-generator", "Model generation complete", {
			nodeCount: model.nodes.length,
			viewport: model.viewport,
			fullPageHeight: model.fullPageHeight,
		});
		return model;
	} finally {
		// Cleanup temp file
		try {
			await unlink(tempFile);
			log("model-generator", "Temp file cleaned up");
		} catch {
			// Ignore cleanup errors
		}
	}
}
