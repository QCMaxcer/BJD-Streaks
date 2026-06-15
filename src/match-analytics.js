import {
  getLocalDateKey,
  getModeCategory,
  getModeName,
  normalizeRecord,
  recordKey,
  sortRecordsNewestFirst,
} from "./core.js";
import { normalizeMatchDetail } from "./match-detail.js";

const EMPTY_TOTALS = Object.freeze({
  kills: 0,
  finalKills: 0,
  deaths: 0,
  finalDeaths: 0,
  damageDealt: 0,
  damageTaken: 0,
  blocksPlaced: 0,
  blocksBroken: 0,
});

function normalizeName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function addEntry(map, entry) {
  const label = String(entry?.label ?? "").trim();
  const value = numberValue(entry?.value);
  if (!label || value === 0) return;
  map.set(label, (map.get(label) ?? 0) + value);
}

function addCount(map, label) {
  const key = String(label ?? "").trim();
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function rankedEntries(map) {
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "zh-CN"));
}

function rankedCounts(map) {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"));
}

function detailPayload(entry) {
  if (!entry) return null;
  if (Object.prototype.hasOwnProperty.call(entry, "raw")) return entry.raw;
  return entry;
}

function normalizeCachedDetail({
  cache,
  key,
  raw,
  record,
  normalizeDetail,
}) {
  if (!cache?.get || !cache?.set) return normalizeDetail(raw, record);
  const cached = cache.get(key);
  if (cached?.raw === raw) return cached.detail;
  const detail = normalizeDetail(raw, record);
  cache.set(key, { raw, detail });
  return detail;
}

function objectSources(value) {
  const root = Array.isArray(value) ? value[0] : value;
  if (!root || typeof root !== "object") return [];
  return [
    root,
    root.data,
    root.match,
    root.game,
    root.detail,
    root.stats,
    root.summary,
  ].filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
}

function rawMapName(raw) {
  for (const source of objectSources(raw)) {
    for (const key of ["mapName", "map", "title", "gameName"]) {
      const value = source[key];
      if (value !== undefined && value !== null && typeof value !== "object") {
        const text = String(value).trim();
        if (text) return text;
      }
    }
  }
  return "";
}

export function filterAnalyticsRecords(records, { mode = "", from = "", to = "" } = {}) {
  const fromKey = String(from || "");
  const toKey = String(to || "");
  let invalidDateCount = 0;
  const filtered = [];

  for (const raw of records ?? []) {
    const record = normalizeRecord(raw);
    if (mode && record.type !== mode) continue;

    const dateKey = getLocalDateKey(record.date);
    if (!dateKey) {
      invalidDateCount += 1;
      continue;
    }
    if (fromKey && dateKey < fromKey) continue;
    if (toKey && dateKey > toKey) continue;
    filtered.push(record);
  }

  return {
    records: sortRecordsNewestFirst(filtered),
    invalidDateCount,
  };
}

export function buildMatchAnalytics({
  records = [],
  matchDetails = {},
  playerNames = [],
  mode = "",
  from = "",
  to = "",
  normalizedDetailCache = null,
  normalizeDetail = normalizeMatchDetail,
} = {}) {
  const selection = filterAnalyticsRecords(records, { mode, from, to });
  const candidateNames = new Set(playerNames.map(normalizeName).filter(Boolean));
  const totals = { ...EMPTY_TOTALS };
  const resources = new Map();
  const items = new Map();
  const upgrades = new Map();
  const teammates = new Map();
  const bedwarsMaps = new Map();
  const skywarsMaps = new Map();
  let missingDetails = 0;
  let unmatchedPlayer = 0;
  let matchedDetails = 0;
  let unknownMapCount = 0;
  let ignoredMapCategoryCount = 0;

  for (const record of selection.records) {
    const key = recordKey(record);
    const raw = detailPayload(matchDetails[key]);
    if (!raw) {
      missingDetails += 1;
      continue;
    }

    const detail = normalizeCachedDetail({
      cache: normalizedDetailCache,
      key,
      raw,
      record,
      normalizeDetail,
    });
    const player = detail.players.find((entry) => candidateNames.has(normalizeName(entry.name)));
    if (!player) {
      unmatchedPlayer += 1;
      continue;
    }

    matchedDetails += 1;
    totals.kills += numberValue(player.kills);
    totals.finalKills += numberValue(player.finalKills);
    totals.deaths += numberValue(player.deaths);
    totals.finalDeaths += numberValue(player.finalDeaths);
    totals.damageDealt += numberValue(player.damageDealt);
    totals.damageTaken += numberValue(player.damageTaken);
    totals.blocksPlaced += numberValue(player.blocksPlaced);
    totals.blocksBroken += numberValue(player.blocksBroken);

    for (const entry of player.resources ?? []) addEntry(resources, entry);
    for (const entry of player.items ?? []) addEntry(items, entry);
    for (const entry of player.upgrades ?? []) addEntry(upgrades, entry);

    const mapName = rawMapName(raw);
    if (!mapName) {
      unknownMapCount += 1;
    } else {
      const category = getModeCategory(record.type);
      if (category === "起床战争") addCount(bedwarsMaps, mapName);
      else if (category === "空岛相关") addCount(skywarsMaps, mapName);
      else ignoredMapCategoryCount += 1;
    }

    if (player.teamKey && player.teamKey !== "unknown") {
      const seenInMatch = new Set();
      for (const teammate of detail.players) {
        const teammateName = String(teammate.name ?? "").trim();
        const teammateKey = normalizeName(teammateName);
        if (!teammateName || teammateKey === normalizeName(player.name)) continue;
        if (teammate.teamKey !== player.teamKey || seenInMatch.has(teammateKey)) continue;
        seenInMatch.add(teammateKey);
        teammates.set(teammateName, (teammates.get(teammateName) ?? 0) + 1);
      }
    }
  }

  return {
    mode,
    modeName: mode ? getModeName(mode) : "全部精确模式",
    from,
    to,
    totalRecords: selection.records.length,
    invalidDateCount: selection.invalidDateCount,
    missingDetails,
    unmatchedPlayer,
    matchedDetails,
    totals,
    resources: rankedEntries(resources),
    items: rankedEntries(items),
    upgrades: rankedEntries(upgrades),
    teammates: [...teammates.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN")),
    maps: {
      bedwars: rankedCounts(bedwarsMaps),
      skywars: rankedCounts(skywarsMaps),
    },
    unknownMapCount,
    ignoredMapCategoryCount,
  };
}
