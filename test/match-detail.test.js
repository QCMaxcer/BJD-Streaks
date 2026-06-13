import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMatchDetail } from "../src/match-detail.js";

test("normalizeMatchDetail reads nested teams and player stats", () => {
  const detail = normalizeMatchDetail({
    mapName: "夏日大作战",
    modeName: "起床战争(4队四人)",
    winnerTeam: "yellow",
    teams: [
      {
        color: "red",
        members: [
          {
            username: "Cargolux",
            stats: {
              kills: 2,
              finalKills: 1,
              deaths: 3,
              damageDealt: 22.8,
              damageTaken: 16.9,
              blocksPlaced: 37,
              blocksBroken: 4,
              resources: { iron: 120, gold: 18 },
              itemsUsed: { fireball: 2 },
            },
          },
        ],
      },
      { color: "yellow", winner: true, members: [{ username: "Winner", kills: 7 }] },
    ],
  }, { type: "bw16", date: "2026-06-12T22:00:00", win: true });

  assert.equal(detail.title, "夏日大作战");
  assert.equal(detail.playerCount, 2);
  assert.equal(detail.winnerTeamName, "黄队");
  assert.equal(detail.teams[0].name, "红队");
  assert.equal(detail.teams[0].kills, 2);
  assert.equal(detail.players[0].damageDealt, 22.8);
  assert.deepEqual(detail.players[0].resources[0], { label: "铁锭", value: 120 });
  assert.deepEqual(detail.players[0].items[0], { label: "火球", value: 2 });
});

test("normalizeMatchDetail groups flat players and supports aliases", () => {
  const detail = normalizeMatchDetail({
    winningTeam: "blue",
    playerList: [
      {
        playerName: "Alpha",
        teamName: "蓝队",
        eliminations: 3,
        finalEliminations: 2,
        placedBlocks: 44,
      },
      { playerName: "Beta", teamColor: "green", death: 1 },
    ],
  }, { type: "bw8", matchId: "match-1", date: "2026-06-12T22:00:00" });

  assert.equal(detail.modeName, "起床战争(双人)");
  assert.equal(detail.matchId, "match-1");
  assert.deepEqual(detail.teams.map((team) => team.key), ["blue", "green"]);
  assert.equal(detail.teams[0].isWinner, true);
  assert.equal(detail.teams[0].finalKills, 2);
});

test("normalizeMatchDetail tolerates empty and unknown detail data", () => {
  const detail = normalizeMatchDetail(null, {
    type: "custom",
    matchId: "unknown",
    date: "invalid",
    win: false,
  });

  assert.equal(detail.title, "custom");
  assert.equal(detail.win, false);
  assert.equal(detail.playerCount, 0);
  assert.deepEqual(detail.teams, []);
  assert.deepEqual(detail.players, []);
});

test("normalizeMatchDetail supports object maps for teams and players", () => {
  const detail = normalizeMatchDetail({
    teams: {
      red: {
        players: {
          Alice: {
            kills: 1,
            resources: { iron: { count: 12 } },
            itemsUsed: [{ itemName: "TNT", useCount: 2 }],
          },
        },
      },
    },
  }, { type: "bw16" });

  assert.equal(detail.teams[0].key, "red");
  assert.equal(detail.players[0].name, "Alice");
  assert.deepEqual(detail.players[0].resources, [{ label: "铁锭", value: 12 }]);
  assert.deepEqual(detail.players[0].items, [{ label: "TNT", value: 2 }]);
});

test("normalizeMatchDetail reads a single detail object returned in an array", () => {
  const detail = normalizeMatchDetail([{ game: { map: "海岛", victory: true }, players: [] }]);
  assert.equal(detail.title, "海岛");
  assert.equal(detail.win, true);
});

test("normalizeMatchDetail recognizes the live BJD match response shape", () => {
  const detail = normalizeMatchDetail({
    _id: "match-id",
    map: "丛林神庙",
    start_time: "2026-06-12T13:48:36.882Z",
    gamemode: "BW16",
    teams: {
      红队: [
        {
          player_name: "RedPlayer",
          pick_up: { IRON_INGOT: 58, GOLD_INGOT: 8 },
          death: 1,
          break: 8,
          interception: 4.6,
          place: 27,
          final_death: 1,
        },
      ],
      蓝队: [
        {
          player_name: "BluePlayer",
          use_item: { GOLDEN_APPLE: 2 },
          damage: 62.3,
          pick_up: { EMERALD: 3, IRON_INGOT: 70, GOLD_INGOT: 17 },
          break: 4,
          interception: 26.6,
          place: 65,
          kill: 4,
          final_kill: 3,
        },
      ],
    },
    win: "蓝队",
  }, { win: true });

  assert.equal(detail.title, "丛林神庙");
  assert.equal(detail.modeName, "起床战争(4队四人)");
  assert.equal(detail.matchId, "match-id");
  assert.equal(detail.date, "2026-06-12T13:48:36.882Z");
  assert.equal(detail.playerCount, 2);
  assert.equal(detail.winnerTeamKey, "blue");
  assert.equal(detail.winnerTeamName, "蓝队");
  assert.equal(detail.teams.find((team) => team.key === "blue").isWinner, true);
  assert.equal(detail.teams.find((team) => team.key === "blue").kills, 4);
  assert.equal(detail.teams.find((team) => team.key === "blue").finalKills, 3);

  const player = detail.players.find((entry) => entry.name === "BluePlayer");
  assert.equal(player.teamKey, "blue");
  assert.equal(player.damageDealt, 62.3);
  assert.equal(player.damageTaken, 26.6);
  assert.equal(player.blocksPlaced, 65);
  assert.equal(player.blocksBroken, 4);
  assert.deepEqual(player.resources, [
    { label: "绿宝石", value: 3 },
    { label: "铁锭", value: 70 },
    { label: "金锭", value: 17 },
  ]);
  assert.deepEqual(player.items, [{ label: "金苹果", value: 2 }]);
});
