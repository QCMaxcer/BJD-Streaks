import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateTooltipPosition,
  calculateFitZoom,
  clampZoomMultiplier,
  DEFAULT_VISUALIZATION_RANGE_PRESET,
  getExportChartWidth,
  getStreakTrackLayout,
  getPreviewChartWidth,
  getVisualizationBaseWidth,
} from "../src/visualization-layout.js";

const model = (days) => ({
  days: Array.from({ length: days }, (_, index) => ({ dateKey: `2026-01-${index + 1}` })),
});

test("fit zoom makes the current range fit the viewport width", () => {
  const chart = model(180);
  const base = getVisualizationBaseWidth(chart);
  const fit = calculateFitZoom(chart, 900);
  assert.equal(Math.round(base * fit), 900);
  assert.equal(getPreviewChartWidth(chart, { viewportWidth: 900, fitZoom: fit }), 900);
});

test("visualization defaults to all history", () => {
  assert.equal(DEFAULT_VISUALIZATION_RANGE_PRESET, "all");
});

test("preview zoom multiplier cannot shrink below the fit view", () => {
  const chart = model(120);
  const fit = calculateFitZoom(chart, 800);
  assert.equal(clampZoomMultiplier(0.2), 1);
  assert.equal(
    getPreviewChartWidth(chart, { viewportWidth: 800, fitZoom: fit, zoomMultiplier: 0.2 }),
    800,
  );
});

test("export width ignores preview zoom and uses export density", () => {
  const chart = model(90);
  const preview = getPreviewChartWidth(chart, {
    viewportWidth: 900,
    fitZoom: calculateFitZoom(chart, 900),
    zoomMultiplier: 6,
  });
  const exported = getExportChartWidth(chart);
  assert.notEqual(preview, exported);
  assert.equal(exported, 1314);
});

test("streak track label has dedicated space above the track line", () => {
  const layout = getStreakTrackLayout();
  assert.ok(layout.minGap >= 20);
});

test("tooltip prefers the upper right and falls back near viewport edges", () => {
  assert.deepEqual(calculateTooltipPosition({
    clientX: 100,
    clientY: 200,
    tooltipWidth: 120,
    tooltipHeight: 80,
    viewportWidth: 800,
    viewportHeight: 600,
    offset: 10,
  }), { left: 110, top: 110 });

  assert.deepEqual(calculateTooltipPosition({
    clientX: 760,
    clientY: 40,
    tooltipWidth: 120,
    tooltipHeight: 80,
    viewportWidth: 800,
    viewportHeight: 600,
    offset: 10,
  }), { left: 630, top: 50 });
});
