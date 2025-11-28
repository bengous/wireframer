/**
 * File-based logger for debugging MCP server issues.
 * Writes to ~/.wireframe-mapper/mcp.log
 */

import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const LOG_DIR = join(homedir(), ".wireframe-mapper");
const LOG_FILE = join(LOG_DIR, "mcp.log");

// Ensure log directory exists
if (!existsSync(LOG_DIR)) {
	mkdirSync(LOG_DIR, { recursive: true });
}

function timestamp(): string {
	return new Date().toISOString();
}

function formatMessage(level: string, component: string, message: string, data?: unknown): string {
	let line = `[${timestamp()}] [${level}] [${component}] ${message}`;
	if (data !== undefined) {
		try {
			const dataStr = typeof data === "string" ? data : JSON.stringify(data, null, 2);
			// Truncate very long data
			const truncated = dataStr.length > 2000 ? dataStr.slice(0, 2000) + "... (truncated)" : dataStr;
			line += `\n  DATA: ${truncated}`;
		} catch {
			line += `\n  DATA: [unserializable]`;
		}
	}
	return line + "\n";
}

export function log(component: string, message: string, data?: unknown): void {
	const line = formatMessage("INFO", component, message, data);
	appendFileSync(LOG_FILE, line);
	// Also write to stderr for immediate visibility
	console.error(`[wireframe-mapper] ${message}`);
}

export function logError(component: string, message: string, error?: unknown): void {
	let errorData: unknown;
	if (error instanceof Error) {
		errorData = { name: error.name, message: error.message, stack: error.stack };
	} else {
		errorData = error;
	}
	const line = formatMessage("ERROR", component, message, errorData);
	appendFileSync(LOG_FILE, line);
	console.error(`[wireframe-mapper] ERROR: ${message}`);
}

export function logDebug(component: string, message: string, data?: unknown): void {
	const line = formatMessage("DEBUG", component, message, data);
	appendFileSync(LOG_FILE, line);
}

export function logSeparator(title: string): void {
	const sep = "=".repeat(60);
	const line = `\n${sep}\n${title} - ${timestamp()}\n${sep}\n`;
	appendFileSync(LOG_FILE, line);
}

export function getLogPath(): string {
	return LOG_FILE;
}
