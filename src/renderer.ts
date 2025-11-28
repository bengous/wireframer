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

import type { WireframeNode, WireframeModel, RendererConfig } from './types.js';

const DEFAULT_RENDERER_CONFIG: RendererConfig = {
  showLabels: false, // Default off per user preference
  backgroundColor: '#ffffff',
  blockFillColor: '#f5f5f5',
  blockBorderColor: '#333333',
  labelColor: '#333333',
  labelFontSize: 12,
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
 * Get a slightly different fill color based on depth for visual hierarchy.
 */
function getFillColor(depth: number, baseColor: string): string {
  // Darken slightly for deeper levels
  const darkenAmount = Math.min(depth * 8, 40);

  // Parse hex color
  const hex = baseColor.replace('#', '');
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
  radius: number
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
 * Render a single wireframe node.
 */
function renderNode(
  ctx: CanvasRenderingContext2D,
  node: WireframeNode,
  config: RendererConfig
): void {
  const { bbox, depth, label, isLandmark } = node;
  const borderWidth = getBorderWidth(depth);
  const cornerRadius = 4;

  // Adjust coordinates for border width
  const x = bbox.x + borderWidth / 2;
  const y = bbox.y + borderWidth / 2;
  const w = bbox.width - borderWidth;
  const h = bbox.height - borderWidth;

  // Skip very small boxes
  if (w < 10 || h < 10) return;

  // Draw fill
  ctx.fillStyle = getFillColor(depth, config.blockFillColor);
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

  // Draw label if enabled and box is large enough
  if (config.showLabels && w > 60 && h > 20) {
    const labelPadding = 8;
    const fontSize = Math.min(config.labelFontSize, h - labelPadding * 2);

    if (fontSize >= 8) {
      ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = config.labelColor;
      ctx.textBaseline = 'top';

      // Truncate label if too long
      const maxLabelWidth = w - labelPadding * 2;
      let displayLabel = label;
      let textWidth = ctx.measureText(displayLabel).width;

      while (textWidth > maxLabelWidth && displayLabel.length > 3) {
        displayLabel = displayLabel.slice(0, -1);
        textWidth = ctx.measureText(displayLabel + '...').width;
      }

      if (displayLabel !== label) {
        displayLabel += '...';
      }

      ctx.fillText(displayLabel, x + labelPadding, y + labelPadding);
    }
  }
}

/**
 * Recursively render nodes (children first, then parent - for proper layering).
 */
function renderNodeTree(
  ctx: CanvasRenderingContext2D,
  nodes: WireframeNode[],
  config: RendererConfig
): void {
  // Sort by depth (render deeper nodes first so parents overlay them)
  // Actually, we want parents drawn first, children on top
  for (const node of nodes) {
    renderNode(ctx, node, config);
    // Render children on top
    renderNodeTree(ctx, node.children, config);
  }
}

/**
 * Create and configure a canvas element for the wireframe.
 */
export function createCanvas(model: WireframeModel): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = model.viewport.width;
  canvas.height = model.fullPageHeight;
  canvas.style.display = 'block';
  return canvas;
}

/**
 * Render the wireframe model to a canvas.
 */
export function renderWireframe(
  model: WireframeModel,
  canvas: HTMLCanvasElement,
  config: Partial<RendererConfig> = {}
): void {
  const mergedConfig: RendererConfig = { ...DEFAULT_RENDERER_CONFIG, ...config };

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D context from canvas');
  }

  // Clear and fill background
  ctx.fillStyle = mergedConfig.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Render all nodes
  renderNodeTree(ctx, model.nodes, mergedConfig);
}

/**
 * Export canvas to PNG data URL.
 */
export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

/**
 * Download canvas as PNG file.
 */
export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename?: string): void {
  const url = canvasToDataUrl(canvas);
  const link = document.createElement('a');
  link.download = filename ?? `wireframe-${Date.now()}.png`;
  link.href = url;
  link.click();
}
