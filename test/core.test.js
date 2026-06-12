import test from "node:test";
import assert from "node:assert/strict";
import {
  buildModeStats,
  calculateStreak,
  dedupeRecords,
  extractArray,
  filterRecords,
  getLocalDateKey,
  getModeCategory,
  getModeName,
  parseDateInputToKey,
  sortRecordsNewestFirst,
  unwrapData,
} from "../src/core.js";

const record = (date, win, type = "bw8", matchId = date) => ({
  date,
  win,
  type,
  matchId,
});

test("unwrapData and extractArray handle nested API responses", () => {
  const payload = { code: 200, data: { data: { data: [{ matchId: "1" }] } } };
  assert.deepEqual(unwrapData(payload), [{ matchId: "1" }]);
  assert.deepEqual(extractArray(payload), [{ matchId: "1" }]);
  assert.deepEqual(extractArray({ data: null }), []);
});

test("dedupeRecords uses matchId and date", () => {
  const records = dedupeRecords([
    record("2026-01-01", true, "bw8", "same"),
    record("2026-01-01", false, "bw8", "same"),
    record("2026-01-02", true, "bw8", "same"),
  ]);
  assert.equal(records.length, 2);
  assert.equal(records[0].win, true);
});

test("sortRecordsNewestFirst places invalid dates last", () => {
  const sorted = sortRecordsNewestFirst(
    dedupeRecords([
      record("invalid", true),
      record("2026-01-01T00:00:00Z", true),
      record("2026-01-03T00:00:00Z", true),
    ]),
  );
  assert.deepEqual(
    sorted.map((item) => item.date),
    ["2026-01-03T00:00:00Z", "2026-01-01T00:00:00Z", "invalid"],
  );
});

test("getLocalDateKey returns a local YYYY-MM-DD key", () => {
  assert.equal(getLocalDateKey("2026-06-12T12:30:00"), "2026-06-12");
  assert.equal(getLocalDateKey("invalid"), null);
});

test("parseDateInputToKey accepts common cutoff date formats", () => {
  assert.equal(parseDateInputToKey("2026-01-01"), "2026-01-01");
  assert.equal(parseDateInputToKey("2026.1.1"), "2026-01-01");
  assert.equal(parseDateInputToKey("26.1.1"), "2026-01-01");
  assert.equal(parseDateInputToKey("2026/12/5"), "2026-12-05");
  assert.equal(parseDateInputToKey("2026-02-31"), null);
  assert.equal(parseDateInputToKey("abc"), null);
});

test("mode names and categories include known and unknown modes", () => {
  assert.equal(getModeName("BW8"), "起床战争(双人)");
  assert.equal(getModeCategory("bwxp64"), "起床战争");
  assert.equal(getModeCategory("swrsolo"), "空岛相关");
  assert.equal(getModeCategory("vdefenseNormal"), "村庄守卫战");
  assert.equal(getModeCategory("custom"), "未知模式");
  assert.equal(getModeName("custom"), "custom");
});

test("calculateStreak handles all wins and first latest loss", () => {
  const allWins = dedupeRecords([
    record("2026-01-01", true),
    record("2026-01-02", true),
    record("2026-01-03", true),
  ]);
  assert.equal(calculateStreak(allWins).current.count, 3);
  assert.equal(calculateStreak(allWins).best.count, 3);

  const latestLoss = dedupeRecords([
    record("2026-01-01", true),
    record("2026-01-02", true),
    record("2026-01-03", false),
  ]);
  assert.equal(calculateStreak(latestLoss).current.count, 0);
  assert.equal(calculateStreak(latestLoss).best.count, 2);
});

test("calculateStreak chooses the most recent tied best streak", () => {
  const records = dedupeRecords([
    record("2026-01-01", true, "bw8", "1"),
    record("2026-01-02", true, "bw8", "2"),
    record("2026-01-03", false, "bw8", "3"),
    record("2026-01-04", true, "bw8", "4"),
    record("2026-01-05", true, "bw8", "5"),
    record("2026-01-06", false, "bw8", "6"),
  ]);
  const result = calculateStreak(records);
  assert.equal(result.best.count, 2);
  assert.equal(result.best.start.matchId, "4");
  assert.equal(result.best.end.matchId, "5");
});

test("missing result and invalid date interrupt streaks", () => {
  const missingResult = dedupeRecords([
    record("2026-01-01", true, "bw8", "1"),
    record("2026-01-02", undefined, "bw8", "2"),
    record("2026-01-03", true, "bw8", "3"),
  ]);
  assert.equal(calculateStreak(missingResult).current.count, 1);
  assert.equal(calculateStreak(missingResult).best.count, 1);

  const invalidDate = dedupeRecords([
    record("2026-01-01", true, "bw8", "1"),
    record("invalid", true, "bw8", "2"),
  ]);
  assert.equal(calculateStreak(invalidDate).current.count, 1);
  assert.equal(calculateStreak(invalidDate).best.count, 1);
});

test("buildModeStats keeps exact modes independent and adds mixed overview", () => {
  const stats = buildModeStats([
    record("2026-01-01", true, "bw8", "1"),
    record("2026-01-02", false, "swrsolo", "2"),
    record("2026-01-03", true, "bw8", "3"),
    record("2026-01-04", undefined, "bw8", "4"),
  ]);
  const bedwars = stats.modes.find((mode) => mode.mode === "bw8");
  assert.equal(bedwars.current.count, 0);
  assert.equal(bedwars.best.count, 2);
  assert.equal(stats.overall.current.count, 0);
  assert.equal(stats.overall.best.count, 1);
  assert.equal(stats.overall.wins, 2);
  assert.equal(stats.overall.losses, 1);
  assert.equal(stats.overall.unknown, 1);
});

test("filterRecords supports mode, category, result, date and query", () => {
  const records = buildModeStats([
    record("2026-01-01T12:00:00Z", true, "bw8", "alpha"),
    record("2026-02-01T12:00:00Z", false, "swrsolo", "beta"),
  ]).records;
  assert.equal(filterRecords(records, { mode: "bw8" }).length, 1);
  assert.equal(filterRecords(records, { category: "空岛相关" }).length, 1);
  assert.equal(filterRecords(records, { result: "loss" }).length, 1);
  assert.equal(filterRecords(records, { from: "2026-01-15" }).length, 1);
  assert.equal(filterRecords(records, { query: "alpha" }).length, 1);
});
