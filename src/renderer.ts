/**
 * Canvas Renderer Module
 *
 * Renders a WireframeModel to an HTML canvas element. Handles visual styling
 * including depth-based border thickness, rounded corners, and label placement.
 *
 * Visual conventions:
 * - Solid borders: Semantic landmark elements (header, nav, main, etc.)
 * - Dashed borders: Non-landmark elements at depth > 0
 * - Border thickness: 3px (depth 0) → 2px (depth 1-2) → 1px (depth 3+)
 * - Fill color: Slightly darker for deeper elements
 *
 * @module renderer
 */

import type {
	BadgeInfo,
	ContentHint,
	RendererConfig,
	SemanticType,
	WireframeModel,
	WireframeNode,
} from "./types.js";

/** Pastel colors for semantic differentiation */
const SEMANTIC_COLORS: Record<SemanticType, string> = {
	header: "#e8eaf6", // Indigo tint
	navigation: "#e3f2fd", // Blue tint
	hero: "#f3e5f5", // Purple tint
	content: "#f5f5f5", // Light gray
	card: "#fffde7", // Yellow tint
	cta: "#e8f5e9", // Green tint
	footer: "#eceff1", // Dark gray
};

const DEFAULT_RENDERER_CONFIG: RendererConfig = {
	showLabels: false, // Default off per user preference
	backgroundColor: "#ffffff",
	blockFillColor: "#f5f5f5",
	blockBorderColor: "#333333",
	labelColor: "#333333",
	labelFontSize: 12,
	showContentHints: true, // Show content placeholders by default
};

/**
 * Get border width based on node depth.
 * Deeper nodes get thinner borders.
 */
function getBorderWidth(depth: number): number {
	if (depth === 0) return 3;
	if (depth <= 2) return 2;
	return 1;
}

/**
 * Get fill color based on semantic type, with depth-based darkening.
 */
function getFillColor(semanticType: SemanticType, depth: number): string {
	const baseColor = SEMANTIC_COLORS[semanticType];
	const darkenAmount = Math.min(depth * 5, 20);

	const hex = baseColor.replace("#", "");
	const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - darkenAmount);
	const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - darkenAmount);
	const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - darkenAmount);

	return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Draw a rounded rectangle on canvas.
 */
function drawRoundedRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
): void {
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.lineTo(x + width - radius, y);
	ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
	ctx.lineTo(x + width, y + height - radius);
	ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
	ctx.lineTo(x + radius, y + height);
	ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
	ctx.lineTo(x, y + radius);
	ctx.quadraticCurveTo(x, y, x + radius, y);
	ctx.closePath();
}

/**
 * Draw a pill shape (rounded rectangle with full-radius ends).
 */
function drawPillShape(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
): void {
	const radius = height / 2;
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.lineTo(x + width - radius, y);
	ctx.arc(x + width - radius, y + radius, radius, -Math.PI / 2, Math.PI / 2);
	ctx.lineTo(x + radius, y + height);
	ctx.arc(x + radius, y + radius, radius, Math.PI / 2, -Math.PI / 2);
	ctx.closePath();
}

/**
 * Render an image placeholder (box with diagonal cross).
 */
function renderImagePlaceholder(
	ctx: CanvasRenderingContext2D,
	hint: ContentHint,
): void {
	const { x, y, width, height } = hint.bbox;
	const padding = 2;
	const px = x + padding;
	const py = y + padding;
	const pw = width - padding * 2;
	const ph = height - padding * 2;

	if (pw < 10 || ph < 10) return;

	// Draw border
	ctx.strokeStyle = "#999999";
	ctx.lineWidth = 1;
	ctx.setLineDash([]);
	drawRoundedRect(ctx, px, py, pw, ph, 4);
	ctx.stroke();

	// Draw diagonal cross
	ctx.beginPath();
	ctx.moveTo(px, py);
	ctx.lineTo(px + pw, py + ph);
	ctx.moveTo(px + pw, py);
	ctx.lineTo(px, py + ph);
	ctx.stroke();
}

/**
 * Render a button placeholder (pill shape).
 */
function renderButtonPlaceholder(
	ctx: CanvasRenderingContext2D,
	hint: ContentHint,
): void {
	const { x, y, width, height } = hint.bbox;

	if (width < 20 || height < 10) return;

	// Draw filled pill
	ctx.fillStyle = "#e0e0e0";
	drawPillShape(ctx, x, y, width, height);
	ctx.fill();

	// Draw border
	ctx.strokeStyle = "#666666";
	ctx.lineWidth = 1;
	ctx.setLineDash([]);
	drawPillShape(ctx, x, y, width, height);
	ctx.stroke();

	// Draw label if available
	if (hint.label && width > 40) {
		ctx.font = `${Math.min(11, height - 6)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
		ctx.fillStyle = "#333333";
		ctx.textBaseline = "middle";
		ctx.textAlign = "center";

		const maxTextWidth = width - 16;
		let displayLabel = hint.label;
		if (ctx.measureText(displayLabel).width > maxTextWidth) {
			while (displayLabel.length > 3 && ctx.measureText(`${displayLabel}...`).width > maxTextWidth) {
				displayLabel = displayLabel.slice(0, -1);
			}
			displayLabel += "...";
		}

		ctx.fillText(displayLabel, x + width / 2, y + height / 2);
		ctx.textAlign = "left"; // Reset
	}
}

/**
 * Render a text block placeholder (horizontal lines).
 */
function renderTextPlaceholder(
	ctx: CanvasRenderingContext2D,
	hint: ContentHint,
): void {
	const { x, y, width, height } = hint.bbox;
	const padding = 4;
	const lineHeight = 8;
	const lineSpacing = 12;
	const maxLines = Math.min(4, Math.floor((height - padding * 2) / lineSpacing));

	if (maxLines < 1 || width < 30) return;

	ctx.strokeStyle = "#cccccc";
	ctx.lineWidth = 2;
	ctx.lineCap = "round";
	ctx.setLineDash([]);

	for (let i = 0; i < maxLines; i++) {
		const lineY = y + padding + i * lineSpacing + lineHeight / 2;
		// Last line is shorter
		const lineWidth = i === maxLines - 1 ? (width - padding * 2) * 0.6 : width - padding * 2;

		ctx.beginPath();
		ctx.moveTo(x + padding, lineY);
		ctx.lineTo(x + padding + lineWidth, lineY);
		ctx.stroke();
	}

	ctx.lineCap = "butt"; // Reset
}

/**
 * Render an icon placeholder (small circle).
 */
function renderIconPlaceholder(
	ctx: CanvasRenderingContext2D,
	hint: ContentHint,
): void {
	const { x, y, width, height } = hint.bbox;
	const cx = x + width / 2;
	const cy = y + height / 2;
	const radius = Math.min(width, height) / 2 - 1;

	if (radius < 4) return;

	ctx.strokeStyle = "#999999";
	ctx.lineWidth = 1;
	ctx.setLineDash([]);

	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.stroke();
}

/**
 * Render all content hints for a node.
 * Z-order: text (back) → images → buttons → icons (front)
 */
function renderContentHints(
	ctx: CanvasRenderingContext2D,
	hints: ContentHint[],
): void {
	// Sort by type for consistent z-order
	const typeOrder = { text: 0, image: 1, button: 2, icon: 3 };
	const sorted = [...hints].sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);

	for (const hint of sorted) {
		switch (hint.type) {
			case "image":
				renderImagePlaceholder(ctx, hint);
				break;
			case "button":
				renderButtonPlaceholder(ctx, hint);
				break;
			case "text":
				renderTextPlaceholder(ctx, hint);
				break;
			case "icon":
				renderIconPlaceholder(ctx, hint);
				break;
		}
	}
}

/**
 * Render a label badge with solid dark background.
 * Returns badge dimensions for click detection.
 */
function renderLabelBadge(
	ctx: CanvasRenderingContext2D,
	label: string,
	x: number,
	y: number,
	maxWidth: number,
	fontSize: number,
): { width: number; height: number; displayLabel: string } {
	const paddingX = 6;
	const paddingY = 3;
	const badgeRadius = 3;

	ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

	// Truncate label if needed
	let displayLabel = label;
	let textWidth = ctx.measureText(displayLabel).width;
	const maxTextWidth = maxWidth - paddingX * 2 - 16; // Leave some margin

	while (textWidth > maxTextWidth && displayLabel.length > 3) {
		displayLabel = displayLabel.slice(0, -1);
		textWidth = ctx.measureText(`${displayLabel}...`).width;
	}
	if (displayLabel !== label) {
		displayLabel += "...";
		textWidth = ctx.measureText(displayLabel).width;
	}

	const badgeWidth = textWidth + paddingX * 2;
	const badgeHeight = fontSize + paddingY * 2;

	// Draw badge background
	ctx.fillStyle = "#333333";
	drawRoundedRect(ctx, x, y, badgeWidth, badgeHeight, badgeRadius);
	ctx.fill();

	// Draw text
	ctx.fillStyle = "#ffffff";
	ctx.textBaseline = "top";
	ctx.fillText(displayLabel, x + paddingX, y + paddingY);

	return { width: badgeWidth, height: badgeHeight, displayLabel };
}

/**
 * Render a single wireframe node.
 * Returns badge info if a label was rendered, null otherwise.
 */
function renderNode(
	ctx: CanvasRenderingContext2D,
	node: WireframeNode,
	config: RendererConfig,
): BadgeInfo | null {
	const { id, bbox, depth, label, isLandmark, semanticType } = node;
	const borderWidth = getBorderWidth(depth);
	const cornerRadius = 4;

	// Adjust coordinates for border width
	const x = bbox.x + borderWidth / 2;
	const y = bbox.y + borderWidth / 2;
	const w = bbox.width - borderWidth;
	const h = bbox.height - borderWidth;

	// Skip very small boxes
	if (w < 10 || h < 10) return null;

	// Draw fill with semantic color
	ctx.fillStyle = getFillColor(semanticType, depth);
	drawRoundedRect(ctx, x, y, w, h, cornerRadius);
	ctx.fill();

	// Draw border
	ctx.strokeStyle = config.blockBorderColor;
	ctx.lineWidth = borderWidth;

	// Use dashed line for non-landmark elements at depth > 0
	if (!isLandmark && depth > 0) {
		ctx.setLineDash([4, 4]);
	} else {
		ctx.setLineDash([]);
	}

	drawRoundedRect(ctx, x, y, w, h, cornerRadius);
	ctx.stroke();

	// Reset line dash
	ctx.setLineDash([]);

	// Draw content hints if enabled
	if (config.showContentHints !== false && node.contentHints?.length) {
		renderContentHints(ctx, node.contentHints);
	}

	// Draw label badge if enabled and box is large enough
	if (config.showLabels && w > 60 && h > 30) {
		// Check for label override (empty string = hidden)
		const overriddenLabel = config.labelOverrides?.get(id);
		const displayLabel = overriddenLabel !== undefined ? overriddenLabel : label;

		// Skip if label is empty (hidden)
		if (displayLabel === "") return null;

		const fontSize = Math.min(config.labelFontSize, 11);
		const badgePadding = 8;
		const badgeX = x + badgePadding;
		const badgeY = y + badgePadding;
		const badge = renderLabelBadge(
			ctx,
			displayLabel,
			badgeX,
			badgeY,
			w - badgePadding * 2,
			fontSize,
		);

		return {
			nodeId: id,
			x: badgeX,
			y: badgeY,
			width: badge.width,
			height: badge.height,
			label: displayLabel,
		};
	}

	return null;
}

/**
 * Recursively render nodes (children first, then parent - for proper layering).
 * Collects badge info for click detection.
 */
function renderNodeTree(
	ctx: CanvasRenderingContext2D,
	nodes: WireframeNode[],
	config: RendererConfig,
	badges: BadgeInfo[],
): void {
	for (const node of nodes) {
		const badge = renderNode(ctx, node, config);
		if (badge) badges.push(badge);
		// Render children on top
		renderNodeTree(ctx, node.children, config, badges);
	}
}

/**
 * Create and configure a canvas element for the wireframe.
 */
export function createCanvas(model: WireframeModel): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = model.viewport.width;
	canvas.height = model.fullPageHeight;
	canvas.style.display = "block";
	return canvas;
}

/**
 * Render the wireframe model to a canvas.
 * Returns badge positions for click detection.
 */
export function renderWireframe(
	model: WireframeModel,
	canvas: HTMLCanvasElement,
	config: Partial<RendererConfig> = {},
): BadgeInfo[] {
	const mergedConfig: RendererConfig = { ...DEFAULT_RENDERER_CONFIG, ...config };

	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("Failed to get 2D context from canvas");
	}

	// Clear and fill background
	ctx.fillStyle = mergedConfig.backgroundColor;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// Render all nodes and collect badge positions
	const badges: BadgeInfo[] = [];
	renderNodeTree(ctx, model.nodes, mergedConfig, badges);

	return badges;
}

/**
 * Export canvas to PNG data URL.
 */
export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
	return canvas.toDataURL("image/png");
}

/**
 * Download canvas as PNG file.
 */
export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename?: string): void {
	const url = canvasToDataUrl(canvas);
	const link = document.createElement("a");
	link.download = filename ?? `wireframe-${Date.now()}.png`;
	link.href = url;
	link.click();
}
