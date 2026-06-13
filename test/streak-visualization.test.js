import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStreakSegments,
  buildVisualizationExportName,
  buildVisualizationModel,
  prepareSvgExport,
} from "../src/streak-visualization.js";

const record = (date, win, type = "bw8", matchId = `${date}-${type}`) => ({
  date,
  win,
  type,
  matchId,
});

test("visualization aggregates wins and losses by local day and fills empty days", () => {
  const model = buildVisualizationModel([
    record("2026-01-01T08:00:00", true, "bw8", "1"),
    record("2026-01-01T09:00:00", false, "bw8", "2"),
    record("2026-01-03T09:00:00", true, "bw8", "3"),
  ], { from: "2026-01-01", to: "2026-01-03" });

  assert.deepEqual(
    model.days.map(({ dateKey, wins, losses }) => ({ dateKey, wins, losses })),
    [
      { dateKey: "2026-01-01", wins: 1, losses: 1 },
      { dateKey: "2026-01-02", wins: 0, losses: 0 },
      { dateKey: "2026-01-03", wins: 1, losses: 0 },
    ],
  );
});

test("all modes and exact modes use independent streak histories", () => {
  const records = [
    record("2026-01-01T08:00:00", true, "bw8", "1"),
    record("2026-01-02T08:00:00", false, "swrsolo", "2"),
    record("2026-01-03T08:00:00", true, "bw8", "3"),
  ];
  assert.equal(buildVisualizationModel(records, { mode: "all" }).best.count, 1);
  assert.equal(buildVisualizationModel(records, { mode: "bw8" }).best.count, 2);
});

test("display range preserves full-history streak values and marks clipped spans", () => {
  const model = buildVisualizationModel([
    record("2026-01-01T08:00:00", true, "bw8", "1"),
    record("2026-01-02T08:00:00", true, "bw8", "2"),
    record("2026-01-03T08:00:00", true, "bw8", "3"),
    record("2026-01-04T08:00:00", true, "bw8", "4"),
  ], { from: "2026-01-03", to: "2026-01-04" });

  assert.equal(model.best.count, 4);
  assert.equal(model.points[0].result, "carry");
  assert.equal(model.points[0].streak, 2);
  assert.equal(model.points.at(-1).streak, 4);
  assert.equal(model.spans.length, 1);
  assert.equal(model.spans[0].leftTruncated, true);
  assert.equal(model.spans[0].rightTruncated, false);
  assert.equal(model.spans[0].role, "current-best");
});

test("losses and unknown results reset the cumulative streak line", () => {
  const model = buildVisualizationModel([
    record("2026-01-01T08:00:00", true, "bw8", "1"),
    record("2026-01-02T08:00:00", false, "bw8", "2"),
    record("2026-01-03T08:00:00", true, "bw8", "3"),
    record("2026-01-04T08:00:00", undefined, "bw8", "4"),
  ], { from: "2026-01-01", to: "2026-01-04" });

  assert.deepEqual(model.points.slice(1).map((point) => point.streak), [1, 0, 1, 0]);
  assert.equal(model.unknownInRange, 1);
});

test("the most recent tied best streak is highlighted while older ties stay neutral", () => {
  const { segments } = buildStreakSegments([
    record("2026-01-01T08:00:00", true, "bw8", "1"),
    record("2026-01-02T08:00:00", true, "bw8", "2"),
    record("2026-01-03T08:00:00", false, "bw8", "3"),
    record("2026-01-04T08:00:00", true, "bw8", "4"),
    record("2026-01-05T08:00:00", true, "bw8", "5"),
    record("2026-01-06T08:00:00", false, "bw8", "6"),
  ]);

  assert.deepEqual(segments.map((segment) => segment.role), ["other", "best"]);
});

test("invalid dates are excluded from chart data and counted", () => {
  const model = buildVisualizationModel([
    record("invalid", true, "bw8", "bad"),
    record("2026-01-01T08:00:00", true, "bw8", "good"),
  ], { from: "2026-01-01", to: "2026-01-01" });

  assert.equal(model.invalidDateCount, 1);
  assert.equal(model.validCount, 1);
  assert.equal(model.days[0].wins, 1);
});

test("export helpers sanitize filenames and escape SVG metadata", () => {
  const name = buildVisualizationExportName({
    playerName: 'QC:<Max>',
    modeName: "起床/双人",
    chartType: "line",
    from: "2026-01-01",
    to: "2026-01-31",
    format: "svg",
  });
  assert.equal(name, "BJD-Streaks-QC__Max_-起床_双人-累计连胜-2026-01-01-2026-01-31.svg");

  const svg = prepareSvgExport("<svg viewBox=\"0 0 10 10\"></svg>", {
    title: "A&B",
    description: "<历史最高>",
  });
  assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<title>A&amp;B<\/title>/);
  assert.match(svg, /<desc>&lt;历史最高&gt;<\/desc>/);
});
