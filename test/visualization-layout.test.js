import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateFitZoom,
  clampZoomMultiplier,
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
