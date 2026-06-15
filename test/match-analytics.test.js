import test from "node:test";
import assert from "node:assert/strict";
import { recordKey } from "../src/core.js";
import { buildMatchAnalytics, filterAnalyticsRecords } from "../src/match-analytics.js";

const record = (matchId, date, type = "bw16") => ({
  matchId,
  date,
  type,
  win: true,
});

const detail = (players) => ({
  teams: {
    红队: players.red ?? [],
    蓝队: players.blue ?? [],
  },
  win: "红队",
});

function detailsFor(records, entries) {
  return Object.fromEntries(entries.map(([index, raw]) => [
    recordKey(records[index]),
    { fetchedAt: "2026-06-14T00:00:00.000Z", raw },
  ]));
}

test("analytics filters records by exact mode and inclusive local date range", () => {
  const records = [
    record("1", "2026-06-01T12:00:00", "bw16"),
    record("2", "2026-06-02T23:59:59", "bw8"),
    record("3", "invalid", "bw16"),
  ];

  const result = filterAnalyticsRecords(records, {
    mode: "bw16",
    from: "2026-06-01",
    to: "2026-06-01",
  });

  assert.deepEqual(result.records.map((entry) => entry.matchId), ["1"]);
  assert.equal(result.invalidDateCount, 1);
});

test("analytics aggregates only the selected account player", () => {
  const records = [record("1", "2026-06-01T12:00:00"), record("2", "2026-06-02T12:00:00")];
  const details = detailsFor(records, [
    [0, detail({
      red: [
        {
          player_name: "QC_Max",
          kill: 4,
          final_kill: 2,
          death: 1,
          final_death: 1,
          damage: 62.5,
          interception: 12.5,
          place: 50,
          break: 3,
          pick_up: { IRON_INGOT: 70, GOLD_INGOT: 12 },
          use_item: { GOLDEN_APPLE: 2 },
          upgrade: { SHARPNESS: 1 },
        },
        { player_name: "Friend", kill: 99, team: "红队" },
      ],
      blue: [{ player_name: "Enemy", kill: 99 }],
    })],
    [1, detail({
      red: [
        { player_name: "QC_Max", kill: 1, damage: 10, pick_up: { IRON_INGOT: 5 } },
        { player_name: "Friend", kill: 1 },
      ],
    })],
  ]);

  const analytics = buildMatchAnalytics({
    records,
    matchDetails: details,
    playerNames: ["QC_Max"],
  });

  assert.equal(analytics.totals.kills, 5);
  assert.equal(analytics.totals.finalKills, 2);
  assert.equal(analytics.totals.deaths, 1);
  assert.equal(analytics.totals.finalDeaths, 1);
  assert.equal(analytics.totals.damageDealt, 72.5);
  assert.equal(analytics.totals.damageTaken, 12.5);
  assert.equal(analytics.totals.blocksPlaced, 50);
  assert.equal(analytics.totals.blocksBroken, 3);
  assert.deepEqual(analytics.resources.slice(0, 2), [
    { label: "铁锭", value: 75 },
    { label: "金锭", value: 12 },
  ]);
  assert.deepEqual(analytics.items, [{ label: "金苹果", value: 2 }]);
  assert.deepEqual(analytics.upgrades, [{ label: "锋利", value: 1 }]);
  assert.deepEqual(analytics.teammates, [{ name: "Friend", count: 2 }]);
  assert.equal(analytics.matchedDetails, 2);
});

test("analytics reports missing details and unmatched current player", () => {
  const records = [record("1", "2026-06-01T12:00:00"), record("2", "2026-06-02T12:00:00")];
  const analytics = buildMatchAnalytics({
    records,
    matchDetails: detailsFor(records, [[0, detail({ red: [{ player_name: "Other" }] })]]),
    playerNames: ["QC_Max"],
  });

  assert.equal(analytics.totalRecords, 2);
  assert.equal(analytics.missingDetails, 1);
  assert.equal(analytics.unmatchedPlayer, 1);
  assert.equal(analytics.matchedDetails, 0);
});

test("analytics groups played maps into bedwars and skywars rankings", () => {
  const records = [
    record("1", "2026-06-01T12:00:00", "bw16"),
    record("2", "2026-06-02T12:00:00", "bw8"),
    record("3", "2026-06-03T12:00:00", "swrsolo"),
    record("4", "2026-06-04T12:00:00", "pgsolo"),
    record("5", "2026-06-05T12:00:00", "vdefensenormal"),
    record("6", "2026-06-06T12:00:00", "bw16"),
  ];
  const details = detailsFor(records, [
    [0, { mapName: "夏日大作战", teams: { red: [{ player_name: "QC_Max" }] } }],
    [1, { mapName: "夏日大作战", teams: { red: [{ player_name: "QC_Max" }] } }],
    [2, { mapName: "天空岛", teams: { red: [{ player_name: "QC_Max" }] } }],
    [3, { mapName: "吃鸡岛", teams: { red: [{ player_name: "QC_Max" }] } }],
    [4, { mapName: "村守地图", teams: { red: [{ player_name: "QC_Max" }] } }],
    [5, { teams: { red: [{ player_name: "QC_Max" }] } }],
  ]);

  const analytics = buildMatchAnalytics({
    records,
    matchDetails: details,
    playerNames: ["QC_Max"],
  });

  assert.deepEqual(analytics.maps.bedwars, [{ label: "夏日大作战", count: 2 }]);
  assert.deepEqual(analytics.maps.skywars, [
    { label: "吃鸡岛", count: 1 },
    { label: "天空岛", count: 1 },
  ]);
  assert.equal(analytics.unknownMapCount, 1);
  assert.equal(analytics.ignoredMapCategoryCount, 1);
});

test("analytics reuses normalized detail cache across repeated builds", () => {
  const records = [record("1", "2026-06-01T12:00:00")];
  const raw = { stable: true };
  const matchDetails = detailsFor(records, [[0, raw]]);
  const normalizedDetailCache = new Map();
  let normalizeCalls = 0;

  const normalizeDetail = () => {
    normalizeCalls += 1;
    return {
      players: [{
        name: "QC_Max",
        teamKey: "red",
        kills: 3,
        finalKills: 1,
        deaths: 0,
        finalDeaths: 0,
        damageDealt: 20,
        damageTaken: 5,
        blocksPlaced: 12,
        blocksBroken: 2,
        resources: [],
        items: [],
        upgrades: [],
      }],
    };
  };

  const first = buildMatchAnalytics({
    records,
    matchDetails,
    playerNames: ["QC_Max"],
    normalizedDetailCache,
    normalizeDetail,
  });
  const second = buildMatchAnalytics({
    records,
    matchDetails,
    playerNames: ["QC_Max"],
    normalizedDetailCache,
    normalizeDetail,
  });

  assert.equal(normalizeCalls, 1);
  assert.equal(first.totals.kills, 3);
  assert.equal(second.totals.kills, 3);
});
