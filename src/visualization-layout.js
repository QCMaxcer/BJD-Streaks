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
