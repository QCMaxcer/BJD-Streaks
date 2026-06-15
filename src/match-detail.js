import { getModeName } from "./core.js";

export const TEAM_COLORS = Object.freeze({
  red: { name: "红队", color: "#ef4444" },
  blue: { name: "蓝队", color: "#3b82f6" },
  yellow: { name: "黄队", color: "#eab308" },
  green: { name: "绿队", color: "#22c55e" },
  aqua: { name: "青队", color: "#22d3ee" },
  white: { name: "白队", color: "#e5e7eb" },
  pink: { name: "粉队", color: "#f472b6" },
  gray: { name: "灰队", color: "#94a3b8" },
  unknown: { name: "未知队伍", color: "#94a3b8" },
});

export const ITEM_LABELS = Object.freeze({
  iron: "铁锭",
  ironingot: "铁锭",
  gold: "金锭",
  goldingot: "金锭",
  diamond: "钻石",
  emerald: "绿宝石",
  goldenapple: "金苹果",
  enchantedgoldenapple: "附魔金苹果",
  fireball: "火球",
  firecharge: "火球",
  obsidian: "黑曜石",
  enderpearl: "末影珍珠",
  egg: "搭桥蛋",
  blazerod: "自救平台",
  snowball: "蠹虫蛋",
  snowbadd: "蠹虫蛋",
  tnt: "TNT",
  pgtrapflow: "吃鸡-水陷阱",
  pgchicken: "吃鸡-急救鸡",
  pgairdrop: "吃鸡-空投",
  pgtrapcobweb: "吃鸡-蜘蛛网陷阱",
  pgbandit: "吃鸡-绷带",
  protection: "保护",
  defense: "挖掘疲劳陷阱",
  trap: "这是个陷阱",
  sharpness: "锋利",
  heal: "治愈池",
  ironforge: "铁锻炉",
  fastdig: "急迫",
  alarmtrap: "报警陷阱",
  counteroffensivetrap: "反击陷阱",
  kills: "击败",
  finalkills: "最终击败",
  deaths: "死亡",
  blocksplaced: "放置方块",
  blocksbroken: "破坏方块",
});

const TEAM_ORDER = Object.keys(TEAM_COLORS);
const TEAM_ALIASES = ["teams", "teamlist", "groups", "sides"];
const PLAYER_ALIASES = ["players", "playerlist", "members", "users", "participants"];

function normalizedKey(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sourceObjects(value) {
  const root = asObject(value);
  if (!root) return [];
  return [
    root,
    root.stats,
    root.stat,
    root.statistics,
    root.summary,
    root.data,
    root.match,
    root.game,
    root.detail,
    root.gameStats,
    root.bedwars,
  ].filter(asObject);
}

function findValue(value, aliases) {
  const wanted = new Set(aliases.map(normalizedKey));
  for (const source of sourceObjects(value)) {
    for (const [key, entry] of Object.entries(source)) {
      if (wanted.has(normalizedKey(key)) && entry !== undefined && entry !== null) return entry;
    }
  }
  return undefined;
}

function findCollection(root, aliases, maxDepth = 4) {
  const wanted = new Set(aliases.map(normalizedKey));
  const visited = new Set();

  function walk(value, depth) {
    if (!value || typeof value !== "object" || visited.has(value) || depth > maxDepth) return null;
    visited.add(value);
    for (const [key, entry] of Object.entries(value)) {
      if (!wanted.has(normalizedKey(key))) continue;
      if (Array.isArray(entry)) return entry;
      if (asObject(entry)) {
        return Object.entries(entry).map(([collectionKey, collectionValue]) => (
          Array.isArray(collectionValue)
            ? { __collectionKey: collectionKey, members: collectionValue }
            : asObject(collectionValue)
            ? { __collectionKey: collectionKey, ...collectionValue }
            : { __collectionKey: collectionKey, value: collectionValue }
        ));
      }
    }
    for (const entry of Object.values(value)) {
      if (!Array.isArray(entry)) {
        const found = walk(entry, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  return walk(root, 0) ?? [];
}

function textValue(value, aliases, fallback = "") {
  const found = findValue(value, aliases);
  if (found === undefined || found === null || typeof found === "object") return fallback;
  return String(found);
}

function numberValue(value, aliases, fallback = 0) {
  const found = findValue(value, aliases);
  const number = Number(found);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value, aliases, fallback = null) {
  const found = findValue(value, aliases);
  if (found === true || found === false) return found;
  if (typeof found === "number") return found > 0;
  const normalized = normalizedKey(found);
  if (["true", "win", "winner", "victory", "胜利", "获胜"].includes(normalized)) return true;
  if (["false", "loss", "lose", "defeat", "失败", "未获胜"].includes(normalized)) return false;
  return fallback;
}

function normalizeTeamKey(value) {
  const key = normalizedKey(value);
  const matches = {
    red: ["red", "r", "红", "红队"],
    blue: ["blue", "b", "蓝", "蓝队"],
    yellow: ["yellow", "y", "黄", "黄队"],
    green: ["green", "g", "绿", "绿队"],
    aqua: ["aqua", "cyan", "青", "青队"],
    white: ["white", "w", "白", "白队"],
    pink: ["pink", "p", "粉", "粉队"],
    gray: ["gray", "grey", "灰", "灰队"],
  };
  return Object.entries(matches).find(([, aliases]) => aliases.includes(key))?.[0] ?? (key || "unknown");
}

function humanizeKey(value) {
  const raw = String(value ?? "");
  const known = ITEM_LABELS[normalizedKey(raw)];
  if (known) return known;
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim() || "未知";
}

function normalizeEntries(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (entry && typeof entry === "object") {
          const label = textValue(
            entry,
            ["name", "label", "type", "item", "itemName", "resource", "__collectionKey"],
            "未知",
          );
          const amount = numberValue(
            entry,
            ["count", "amount", "value", "total", "quantity", "useCount", "collected"],
            0,
          );
          return { label: humanizeKey(label), value: amount };
        }
        return { label: humanizeKey(entry), value: 1 };
      })
      .filter((entry) => entry.value !== 0);
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, entry]) => ({
        label: humanizeKey(key),
        value: asObject(entry)
          ? numberValue(entry, ["count", "amount", "value", "total", "quantity", "useCount"], 0)
          : Number(entry) || 0,
      }))
      .filter((entry) => entry.value !== 0);
  }
  return [];
}

function entriesValue(value, aliases) {
  return normalizeEntries(findValue(value, aliases));
}

function normalizePlayer(player, fallbackTeam = "unknown") {
  const teamKey = normalizeTeamKey(
    textValue(player, ["team", "teamName", "teamColor", "color", "group", "side"], fallbackTeam),
  );
  return {
    name: textValue(
      player,
      ["name", "playerName", "username", "nickName", "nickname", "displayName", "__collectionKey"],
      "未知玩家",
    ),
    teamKey,
    kills: numberValue(player, ["kills", "kill", "eliminations", "击败"]),
    finalKills: numberValue(player, ["finalKills", "finalKill", "finalEliminations", "最终击败"]),
    deaths: numberValue(player, ["deaths", "death", "死亡次数", "死亡"]),
    finalDeaths: numberValue(player, [
      "finalDeaths",
      "finalDeath",
      "final_deaths",
      "final_death",
      "最终死亡",
    ]),
    damageDealt: numberValue(
      player,
      ["damageDealt", "dealtDamage", "damageGiven", "damage", "造成伤害"],
    ),
    damageTaken: numberValue(
      player,
      ["damageTaken", "takenDamage", "damageReceived", "interception", "承受伤害"],
    ),
    blocksPlaced: numberValue(
      player,
      ["blocksPlaced", "placedBlocks", "placeBlocks", "blockPlace", "place", "放置方块"],
    ),
    blocksBroken: numberValue(
      player,
      ["blocksBroken", "brokenBlocks", "breakBlocks", "blockBreak", "break", "破坏方块"],
    ),
    resources: entriesValue(
      player,
      ["resources", "resourcesCollected", "collectedResources", "resource", "pickUp"],
    ),
    items: entriesValue(player, ["items", "itemsUsed", "usedItems", "itemUses", "useItem"]),
    upgrades: entriesValue(player, ["upgrades", "upgrade", "teamUpgrades"]),
    raw: player,
  };
}

function sumPlayers(players, key) {
  return players.reduce((total, player) => total + (Number(player[key]) || 0), 0);
}

function normalizeTeam(team, players, fallbackKey, winnerKey) {
  const key = normalizeTeamKey(
    textValue(
      team,
      ["key", "id", "team", "teamName", "teamColor", "color", "name", "__collectionKey"],
      fallbackKey,
    ),
  );
  const metadata = TEAM_COLORS[key] ?? {
    name: textValue(team, ["name", "teamName"], humanizeKey(key)),
    color: textValue(team, ["hex", "colorHex"], TEAM_COLORS.unknown.color),
  };
  const teamPlayers = players.filter((player) => player.teamKey === key);
  const directWinner = booleanValue(team, ["win", "winner", "isWinner", "victory"], null);
  return {
    key,
    name: textValue(team, ["name", "teamName", "displayName"], metadata.name),
    color: metadata.color,
    isWinner: directWinner ?? (winnerKey !== "unknown" && key === winnerKey),
    kills: numberValue(team, ["kills", "kill", "eliminations"], sumPlayers(teamPlayers, "kills")),
    finalKills: numberValue(team, ["finalKills", "finalKill", "finalEliminations"], sumPlayers(teamPlayers, "finalKills")),
    deaths: numberValue(team, ["deaths", "death"], sumPlayers(teamPlayers, "deaths")),
    finalDeaths: numberValue(team, ["finalDeaths", "finalDeath", "final_deaths", "final_death"], sumPlayers(teamPlayers, "finalDeaths")),
    blocksPlaced: numberValue(team, ["blocksPlaced", "placedBlocks", "placeBlocks"], sumPlayers(teamPlayers, "blocksPlaced")),
    blocksBroken: numberValue(team, ["blocksBroken", "brokenBlocks", "breakBlocks"], sumPlayers(teamPlayers, "blocksBroken")),
    players: teamPlayers,
  };
}

function uniquePlayers(players) {
  const seen = new Set();
  return players.filter((player) => {
    const key = `${player.name}::${player.teamKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeMatchDetail(rawDetail, record = {}) {
  const raw = asObject(rawDetail) ?? asObject(asArray(rawDetail)[0]) ?? {};
  const rawTeams = findCollection(raw, TEAM_ALIASES);
  const topPlayers = findCollection(raw, PLAYER_ALIASES).map((player) => normalizePlayer(player));
  const nestedPlayers = rawTeams.flatMap((team) => {
    const teamKey = normalizeTeamKey(
      textValue(
        team,
        ["key", "id", "team", "teamName", "teamColor", "color", "name", "__collectionKey"],
        "unknown",
      ),
    );
    return findCollection(team, PLAYER_ALIASES, 2).map((player) => normalizePlayer(player, teamKey));
  });
  const players = uniquePlayers([...topPlayers, ...nestedPlayers]);
  const winnerKey = normalizeTeamKey(textValue(
    raw,
    ["winnerTeam", "winningTeam", "winner", "victoryTeam", "winTeam", "win"],
    "unknown",
  ));

  const teamKeys = new Set([
    ...rawTeams.map((team) => normalizeTeamKey(
      textValue(
        team,
        ["key", "id", "team", "teamName", "teamColor", "color", "name", "__collectionKey"],
        "unknown",
      ),
    )),
    ...players.map((player) => player.teamKey),
  ]);
  teamKeys.delete("unknown");
  if (teamKeys.size === 0 && players.length > 0) teamKeys.add("unknown");

  const teams = [...teamKeys]
    .map((key) => {
      const rawTeam = rawTeams.find((team) => normalizeTeamKey(
        textValue(
          team,
          ["key", "id", "team", "teamName", "teamColor", "color", "name", "__collectionKey"],
          "unknown",
        ),
      ) === key) ?? {};
      return normalizeTeam(rawTeam, players, key, winnerKey);
    })
    .sort((a, b) => {
      const aIndex = TEAM_ORDER.indexOf(a.key);
      const bIndex = TEAM_ORDER.indexOf(b.key);
      return (aIndex < 0 ? TEAM_ORDER.length : aIndex) - (bIndex < 0 ? TEAM_ORDER.length : bIndex);
    });

  const inferredWinner = teams.find((team) => team.isWinner)?.key ?? winnerKey;
  const modeCode = textValue(
    raw,
    ["type", "mode", "gameType", "modeCode", "gamemode"],
    record.type ?? "",
  );
  const win = booleanValue(raw, ["win", "victory", "isWinner"], record.win ?? null);

  return {
    title: textValue(raw, ["title", "mapName", "map", "gameName"], getModeName(modeCode)),
    modeName: textValue(raw, ["modeName", "typeName", "gameTypeName"], getModeName(modeCode)),
    date: textValue(raw, ["date", "time", "startTime", "createdAt", "start_time"], record.date ?? ""),
    matchId: textValue(raw, ["matchId", "id", "_id"], record.matchId ?? ""),
    win,
    winnerTeamKey: inferredWinner,
    winnerTeamName: teams.find((team) => team.key === inferredWinner)?.name ?? "",
    playerCount: numberValue(raw, ["playerCount", "playersCount", "totalPlayers"], players.length),
    teams,
    players,
    raw: rawDetail,
  };
}
