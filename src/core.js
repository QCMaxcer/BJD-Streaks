export const MODE_NAMES = Object.freeze({
  bw: "起床战争全局",
  bw1: "起床战争(单人)",
  bw8: "起床战争(双人)",
  bw12: "起床战争(三人)",
  bw16: "起床战争(4队四人)",
  bwxp32: "经验起床(4队八人)",
  bwxp8x4: "经验起床(8队四人)",
  bwxp64: "经验起床(32v32)",
  bw999: "起床战争(无限火力)",
  swroneblock: "幸运之柱(单人)",
  swrtwoblock: "幸运之柱(组队)",
  sw: "空岛战争全局",
  swrsolo: "空岛战争(单人)",
  swrdouble: "空岛战争(组队)",
  swrgodless: "空岛战争(单人-无神装)",
  swrnokit: "空岛战争(单人-无职业)",
  sgsteam: "极限游戏(组队)",
  sgssolo: "极限游戏(单人)",
  pgsolo: "吃鸡: 归来(单人)",
  pgdouble: "吃鸡: 归来(双人)",
  pgteam: "吃鸡: 归来(组队)",
  vdefensenormal: "村庄守卫战(普通)",
});

export function normalizeMode(mode) {
  return String(mode ?? "").trim().toLowerCase() || "unknown";
}

export function getModeName(mode) {
  const normalized = normalizeMode(mode);
  return MODE_NAMES[normalized] ?? String(mode || "未知模式");
}

export function getModeCategory(mode) {
  const normalized = normalizeMode(mode);
  if (normalized.startsWith("bw")) return "起床战争";
  if (
    normalized.startsWith("sw") ||
    normalized.startsWith("sgs") ||
    normalized.startsWith("pg")
  ) {
    return "空岛相关";
  }
  if (normalized.startsWith("vdefense")) return "村庄守卫战";
  return "未知模式";
}

export function parseTimestamp(value) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getLocalDateKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateInputToKey(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{2}|\d{4})[-./年](\d{1,2})[-./月](\d{1,2})日?$/);
  if (!match) return null;

  const yearNumber = Number(match[1]);
  const year = yearNumber < 100 ? 2000 + yearNumber : yearNumber;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function recordKey(record) {
  return `${String(record?.matchId ?? "")}::${String(record?.date ?? "")}`;
}

export function normalizeRecord(record, sourceIndex = 0) {
  const mode = normalizeMode(record?.type);
  return {
    ...record,
    matchId: String(record?.matchId ?? ""),
    date: record?.date ?? "",
    type: mode,
    win: record?.win === true ? true : record?.win === false ? false : null,
    modeName: getModeName(mode),
    category: getModeCategory(mode),
    timestamp: parseTimestamp(record?.date),
    sourceIndex,
  };
}

export function dedupeRecords(records) {
  const seen = new Set();
  const result = [];
  records.forEach((record, index) => {
    const normalized = normalizeRecord(record, index);
    const key = recordKey(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result;
}

export function sortRecordsNewestFirst(records) {
  return [...records].sort((a, b) => {
    const aTime = a.timestamp ?? parseTimestamp(a.date);
    const bTime = b.timestamp ?? parseTimestamp(b.date);
    if (aTime === null && bTime === null) {
      return (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0);
    }
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    return bTime - aTime || (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0);
  });
}

export function unwrapData(value, maxDepth = 8) {
  let current = value;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (
      current &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      Object.prototype.hasOwnProperty.call(current, "data")
    ) {
      current = current.data;
      continue;
    }
    break;
  }
  return current;
}

export function extractArray(value) {
  let current = value;
  for (let depth = 0; depth < 8; depth += 1) {
    if (Array.isArray(current)) return current;
    if (
      current &&
      typeof current === "object" &&
      Object.prototype.hasOwnProperty.call(current, "data")
    ) {
      current = current.data;
      continue;
    }
    return [];
  }
  return [];
}

function createEmptyStreak() {
  return {
    count: 0,
    start: null,
    end: null,
    records: [],
  };
}

export function calculateStreak(records) {
  const newest = sortRecordsNewestFirst(records);
  const current = createEmptyStreak();

  for (const record of newest) {
    if (record.win !== true || (record.timestamp ?? parseTimestamp(record.date)) === null) break;
    current.records.push(record);
  }
  current.count = current.records.length;
  if (current.count > 0) {
    current.end = current.records[0];
    current.start = current.records[current.records.length - 1];
  }

  const oldest = [...newest].reverse();
  let run = [];
  let best = createEmptyStreak();

  const closeRun = () => {
    if (run.length >= best.count) {
      best = {
        count: run.length,
        start: run[0] ?? null,
        end: run[run.length - 1] ?? null,
        records: [...run],
      };
    }
    run = [];
  };

  for (const record of oldest) {
    if (record.win === true && (record.timestamp ?? parseTimestamp(record.date)) !== null) {
      run.push(record);
    }
    else closeRun();
  }
  closeRun();

  return { current, best };
}

export function buildModeStats(records) {
  const normalized = sortRecordsNewestFirst(dedupeRecords(records));
  const byMode = new Map();

  for (const record of normalized) {
    if (!byMode.has(record.type)) byMode.set(record.type, []);
    byMode.get(record.type).push(record);
  }

  const summarize = (mode, items) => {
    const wins = items.filter((item) => item.win === true).length;
    const losses = items.filter((item) => item.win === false).length;
    const unknown = items.length - wins - losses;
    return {
      mode,
      modeName: mode === "all" ? "所有模式" : getModeName(mode),
      category: mode === "all" ? "总览" : getModeCategory(mode),
      total: items.length,
      wins,
      losses,
      unknown,
      winRate: items.length ? wins / items.length : 0,
      ...calculateStreak(items),
    };
  };

  const modes = [...byMode.entries()]
    .map(([mode, items]) => summarize(mode, items))
    .sort((a, b) => b.total - a.total || a.modeName.localeCompare(b.modeName, "zh-CN"));

  return {
    records: normalized,
    overall: summarize("all", normalized),
    modes,
  };
}

export function filterRecords(records, filters = {}) {
  const query = String(filters.query ?? "").trim().toLowerCase();
  const from = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : null;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999`).getTime() : null;

  return records.filter((record) => {
    if (filters.mode && record.type !== filters.mode) return false;
    if (filters.category && record.category !== filters.category) return false;
    if (filters.result === "win" && record.win !== true) return false;
    if (filters.result === "loss" && record.win !== false) return false;
    if (filters.result === "unknown" && record.win !== null) return false;
    if (from !== null && (record.timestamp === null || record.timestamp < from)) return false;
    if (to !== null && (record.timestamp === null || record.timestamp > to)) return false;
    if (
      query &&
      !`${record.matchId} ${record.type} ${record.modeName} ${record.category}`
        .toLowerCase()
        .includes(query)
    ) {
      return false;
    }
    return true;
  });
}
