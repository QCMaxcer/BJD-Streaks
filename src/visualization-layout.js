export const CHART_LEFT = 108;
export const CHART_RIGHT = 36;
export const PREVIEW_MIN_WIDTH = 1040;
export const EXPORT_MIN_WIDTH = 1280;
export const PREVIEW_DAY_DENSITY = 10;
export const EXPORT_DAY_DENSITY = 13;
export const SOFT_MAX_PREVIEW_WIDTH = 60000;
export const MAX_ZOOM_MULTIPLIER = 64;
export const STREAK_TRACK_LABEL_Y = 112;
export const STREAK_TRACK_LINE_Y = 136;
export const DEFAULT_VISUALIZATION_RANGE_PRESET = "all";

export function getVisualizationBaseWidth(model, {
  dayDensity = PREVIEW_DAY_DENSITY,
  minWidth = PREVIEW_MIN_WIDTH,
} = {}) {
  const days = Math.max(1, model?.days?.length ?? 1);
  return Math.max(minWidth, days * dayDensity + CHART_LEFT + CHART_RIGHT);
}

export function calculateFitZoom(model, viewportWidth, options = {}) {
  const baseWidth = getVisualizationBaseWidth(model, options);
  const available = Number(viewportWidth);
  if (!Number.isFinite(available) || available <= 0) return 1;
  return Math.max(0.08, available / baseWidth);
}

export function clampZoomMultiplier(value) {
  const zoom = Number(value);
  if (!Number.isFinite(zoom)) return 1;
  return Math.max(1, Math.min(MAX_ZOOM_MULTIPLIER, zoom));
}

export function getPreviewChartWidth(model, {
  viewportWidth,
  fitZoom,
  zoomMultiplier = 1,
  dayDensity = PREVIEW_DAY_DENSITY,
} = {}) {
  const baseWidth = getVisualizationBaseWidth(model, { dayDensity });
  const fit = Number.isFinite(Number(fitZoom))
    ? Number(fitZoom)
    : calculateFitZoom(model, viewportWidth, { dayDensity });
  const width = Math.round(baseWidth * fit * clampZoomMultiplier(zoomMultiplier));
  return Math.max(320, Math.min(SOFT_MAX_PREVIEW_WIDTH, width));
}

export function getExportChartWidth(model, {
  exportDensity = EXPORT_DAY_DENSITY,
  minWidth = EXPORT_MIN_WIDTH,
  maxWidth = 36000,
} = {}) {
  return Math.min(
    maxWidth,
    getVisualizationBaseWidth(model, { dayDensity: exportDensity, minWidth }),
  );
}

export function getStreakTrackLayout() {
  return {
    labelY: STREAK_TRACK_LABEL_Y,
    lineY: STREAK_TRACK_LINE_Y,
    minGap: STREAK_TRACK_LINE_Y - STREAK_TRACK_LABEL_Y,
  };
}

export function getVisualizationFixedLabelLayout(chartType = "bars") {
  return {
    trackTop: 100,
    primaryTop: chartType === "line" ? 160 : 190,
    secondaryTop: 573,
  };
}

export function resolveVisualizationWheelAction({
  ctrlKey = false,
  scrollWidth = 0,
  clientWidth = 0,
} = {}) {
  if (ctrlKey) return "zoom";
  return Number(scrollWidth) > Number(clientWidth) + 1 ? "scroll-x" : "default";
}

export function calculateTooltipPosition({
  clientX,
  clientY,
  tooltipWidth = 260,
  tooltipHeight = 110,
  viewportWidth,
  viewportHeight,
  offset = 14,
  margin = 8,
} = {}) {
  const width = Number.isFinite(Number(viewportWidth)) ? Number(viewportWidth) : 0;
  const height = Number.isFinite(Number(viewportHeight)) ? Number(viewportHeight) : 0;
  const tipWidth = Math.max(1, Number(tooltipWidth) || 260);
  const tipHeight = Math.max(1, Number(tooltipHeight) || 110);
  const x = Number(clientX) || 0;
  const y = Number(clientY) || 0;

  let left = x + offset;
  if (width && left + tipWidth + margin > width) left = x - tipWidth - offset;
  left = Math.max(margin, width ? Math.min(left, width - tipWidth - margin) : left);

  let top = y - tipHeight - offset;
  if (top < margin) top = y + offset;
  top = Math.max(margin, height ? Math.min(top, height - tipHeight - margin) : top);

  return { left: Math.round(left), top: Math.round(top) };
}
