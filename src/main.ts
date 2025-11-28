/**
 * Main Entry Point
 *
 * Creates and manages the wireframe overlay UI. This module:
 * - Analyzes the current page's DOM
 * - Creates a full-screen overlay with the wireframe canvas
 * - Provides controls for labels toggle, PNG export, and close
 * - Handles keyboard shortcuts (Escape to close)
 *
 * Usage:
 * 1. Build: `pnpm run build`
 * 2. Paste `dist/wireframe-mapper.js` into browser console
 * 3. Overlay appears automatically
 *
 * @module main
 */

import { analyzeDom } from "./analyzer.js";
import { createCanvas, downloadCanvasAsPng, renderWireframe } from "./renderer.js";
import type { BadgeInfo, RendererConfig, WireframeModel } from "./types.js";

const OVERLAY_ID = "wireframe-mapper-overlay";

interface WireframeMapperState {
	model: WireframeModel | null;
	canvas: HTMLCanvasElement | null;
	showLabels: boolean;
	labelOverrides: Map<string, string>;
	badges: BadgeInfo[];
	canvasContainer: HTMLDivElement | null;
	canvasScale: number;
}

const state: WireframeMapperState = {
	model: null,
	canvas: null,
	showLabels: false,
	labelOverrides: new Map(),
	badges: [],
	canvasContainer: null,
	canvasScale: 1,
};

/**
 * Create the control bar UI.
 */
function createControlBar(onClose: () => void): HTMLDivElement {
	const bar = document.createElement("div");
	bar.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    display: flex;
    gap: 8px;
    z-index: 1000001;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

	const buttonStyle = `
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
  `;

	// Labels toggle button
	const labelsBtn = document.createElement("button");
	labelsBtn.textContent = state.showLabels ? "Labels: ON" : "Labels: OFF";
	labelsBtn.style.cssText =
		buttonStyle +
		`
    background: ${state.showLabels ? "#333" : "#e0e0e0"};
    color: ${state.showLabels ? "#fff" : "#333"};
  `;
	labelsBtn.addEventListener("click", () => {
		state.showLabels = !state.showLabels;
		labelsBtn.textContent = state.showLabels ? "Labels: ON" : "Labels: OFF";
		labelsBtn.style.background = state.showLabels ? "#333" : "#e0e0e0";
		labelsBtn.style.color = state.showLabels ? "#fff" : "#333";
		rerender();
	});

	// Export PNG button
	const exportBtn = document.createElement("button");
	exportBtn.textContent = "Export PNG";
	exportBtn.style.cssText =
		buttonStyle +
		`
    background: #2563eb;
    color: #fff;
  `;
	exportBtn.addEventListener("click", () => {
		if (state.canvas) {
			// Create filename from page title or URL
			const pageTitle = document.title
				.replace(/[^a-zA-Z0-9]/g, "-")
				.replace(/-+/g, "-")
				.slice(0, 50);
			const filename = `wireframe-${pageTitle || "page"}-${Date.now()}.png`;
			downloadCanvasAsPng(state.canvas, filename);
		}
	});

	// Close button
	const closeBtn = document.createElement("button");
	closeBtn.textContent = "✕ Close";
	closeBtn.style.cssText =
		buttonStyle +
		`
    background: #ef4444;
    color: #fff;
  `;
	closeBtn.addEventListener("click", onClose);

	bar.appendChild(labelsBtn);
	bar.appendChild(exportBtn);
	bar.appendChild(closeBtn);

	return bar;
}

/**
 * Create the info bar showing page details.
 */
function createInfoBar(model: WireframeModel): HTMLDivElement {
	const bar = document.createElement("div");
	bar.style.cssText = `
    position: fixed;
    bottom: 16px;
    left: 16px;
    padding: 8px 16px;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    border-radius: 6px;
    font-family: monospace;
    font-size: 12px;
    z-index: 1000001;
  `;

	const nodeCount = countNodes(model.nodes);

	// Build info text safely using textContent
	const dimensionsSpan = document.createElement("span");
	dimensionsSpan.textContent = `${model.viewport.width} × ${model.fullPageHeight}px`;

	const separator = document.createElement("span");
	separator.textContent = " | ";

	const blocksSpan = document.createElement("span");
	blocksSpan.textContent = `${nodeCount} blocks`;

	bar.appendChild(dimensionsSpan);
	bar.appendChild(separator);
	bar.appendChild(blocksSpan);

	return bar;
}

/**
 * Count total nodes in the tree.
 */
function countNodes(nodes: WireframeModel["nodes"]): number {
	let count = 0;
	for (const node of nodes) {
		count += 1 + countNodes(node.children);
	}
	return count;
}

/**
 * Re-render the canvas with current state.
 */
function rerender(): void {
	if (!state.model || !state.canvas) return;

	const config: Partial<RendererConfig> = {
		showLabels: state.showLabels,
		labelOverrides: state.labelOverrides,
	};

	state.badges = renderWireframe(state.model, state.canvas, config);
}

/**
 * Find which badge was clicked based on canvas coordinates.
 */
function findBadgeAtPosition(canvasX: number, canvasY: number): BadgeInfo | null {
	// Search in reverse order (top-most badges first)
	for (let i = state.badges.length - 1; i >= 0; i--) {
		const badge = state.badges[i];
		if (
			canvasX >= badge.x &&
			canvasX <= badge.x + badge.width &&
			canvasY >= badge.y &&
			canvasY <= badge.y + badge.height
		) {
			return badge;
		}
	}
	return null;
}

/**
 * Show inline input for editing a label.
 */
function showLabelEditor(badge: BadgeInfo): void {
	if (!state.canvas || !state.canvasContainer) return;

	// Remove any existing editor
	hideLabelEditor();

	const canvasRect = state.canvas.getBoundingClientRect();
	const containerRect = state.canvasContainer.getBoundingClientRect();
	const scale = state.canvasScale;

	// Calculate position relative to container, accounting for scroll and scale
	const scrollLeft = state.canvasContainer.parentElement?.scrollLeft || 0;
	const scrollTop = state.canvasContainer.parentElement?.scrollTop || 0;
	const canvasOffsetX = canvasRect.left - containerRect.left + scrollLeft;
	const canvasOffsetY = canvasRect.top - containerRect.top + scrollTop;

	// Badge coordinates are in canvas space, multiply by scale for screen space
	const scaledX = badge.x * scale;
	const scaledY = badge.y * scale;
	const scaledWidth = Math.max(badge.width * scale, 120);
	const scaledHeight = badge.height * scale;

	const input = document.createElement("input");
	input.id = "wireframe-label-editor";
	input.type = "text";
	input.value = badge.label;
	input.placeholder = "Empty to hide";
	input.style.cssText = `
    position: absolute;
    left: ${canvasOffsetX + scaledX}px;
    top: ${canvasOffsetY + scaledY}px;
    min-width: ${scaledWidth}px;
    height: ${scaledHeight}px;
    padding: 0 6px;
    border: 2px solid #2563eb;
    border-radius: 3px;
    background: #333;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: ${Math.max(9, 11 * scale)}px;
    outline: none;
    z-index: 1000002;
  `;

	const saveEdit = () => {
		const newLabel = input.value.trim();
		if (newLabel !== badge.label) {
			state.labelOverrides.set(badge.nodeId, newLabel);
			rerender();
		}
		hideLabelEditor();
	};

	input.addEventListener("blur", saveEdit);
	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			saveEdit();
		} else if (e.key === "Escape") {
			hideLabelEditor();
		}
	});

	state.canvasContainer.appendChild(input);
	input.focus();
	input.select();
}

/**
 * Hide the label editor input.
 */
function hideLabelEditor(): void {
	const editor = document.getElementById("wireframe-label-editor");
	if (editor) editor.remove();
}

/**
 * Create and show the wireframe overlay.
 */
function createOverlay(): void {
	// Remove existing overlay if any
	removeOverlay();

	// Analyze the DOM
	console.log("[Wireframe Mapper] Analyzing DOM...");
	const model = analyzeDom(document);
	state.model = model;
	console.log(`[Wireframe Mapper] Found ${countNodes(model.nodes)} significant blocks`);

	// Create overlay container
	const overlay = document.createElement("div");
	overlay.id = OVERLAY_ID;
	overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 1000000;
    background: #fff;
    overflow: auto;
  `;

	// Create canvas
	const canvas = createCanvas(model);
	state.canvas = canvas;

	// Render wireframe and store badge positions
	state.badges = renderWireframe(model, canvas, {
		showLabels: state.showLabels,
		labelOverrides: state.labelOverrides,
	});

	// Create canvas container (for scrolling and positioning editor)
	const canvasContainer = document.createElement("div");
	canvasContainer.style.cssText = `
    min-height: 100%;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 40px;
    box-sizing: border-box;
    position: relative;
  `;
	state.canvasContainer = canvasContainer;

	// Calculate scale to fit viewport (with padding)
	const padding = 40;
	const availableWidth = window.innerWidth - padding * 2;
	const availableHeight = window.innerHeight - padding * 2 - 60; // 60px for controls
	const scaleX = availableWidth / canvas.width;
	const _scaleY = availableHeight / canvas.height;
	const scale = Math.min(1, scaleX); // Only scale down, never up; prioritize width fit
	state.canvasScale = scale;

	// Apply scale via CSS transform (keeps full resolution for export)
	canvas.style.cssText += `
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    border-radius: 8px;
    transform: scale(${scale});
    transform-origin: top center;
  `;

	// Wrap canvas in a sizer div to account for scaled dimensions
	const canvasSizer = document.createElement("div");
	canvasSizer.style.cssText = `
    width: ${canvas.width * scale}px;
    height: ${canvas.height * scale}px;
    position: relative;
  `;
	canvasSizer.appendChild(canvas);
	canvasContainer.appendChild(canvasSizer);

	// Add click handler for label editing
	canvas.addEventListener("click", (e) => {
		if (!state.showLabels) return;

		const rect = canvas.getBoundingClientRect();
		// Account for CSS transform scale
		const canvasX = (e.clientX - rect.left) / state.canvasScale;
		const canvasY = (e.clientY - rect.top) / state.canvasScale;

		const badge = findBadgeAtPosition(canvasX, canvasY);
		if (badge) {
			showLabelEditor(badge);
		} else {
			hideLabelEditor();
		}
	});

	// Create control bar
	const controlBar = createControlBar(removeOverlay);

	// Create info bar
	const infoBar = createInfoBar(model);

	// Assemble overlay
	overlay.appendChild(canvasContainer);
	overlay.appendChild(controlBar);
	overlay.appendChild(infoBar);

	// Add to document
	document.body.appendChild(overlay);

	// Handle escape key to close
	const handleEscape = (e: KeyboardEvent) => {
		if (e.key === "Escape") {
			removeOverlay();
			document.removeEventListener("keydown", handleEscape);
		}
	};
	document.addEventListener("keydown", handleEscape);

	console.log("[Wireframe Mapper] Overlay created. Press Escape or click Close to exit.");
}

/**
 * Remove the wireframe overlay.
 */
function removeOverlay(): void {
	const existing = document.getElementById(OVERLAY_ID);
	if (existing) {
		existing.remove();
		state.model = null;
		state.canvas = null;
		state.canvasContainer = null;
		state.badges = [];
		state.labelOverrides.clear();
		state.canvasScale = 1;
		console.log("[Wireframe Mapper] Overlay closed.");
	}
}

/**
 * Toggle the overlay (show if hidden, hide if shown).
 */
function toggleOverlay(): void {
	const existing = document.getElementById(OVERLAY_ID);
	if (existing) {
		removeOverlay();
	} else {
		createOverlay();
	}
}

// Export for potential programmatic use
export { createOverlay, removeOverlay, toggleOverlay, analyzeDom };

// Auto-run when script is loaded (for console paste usage)
createOverlay();
