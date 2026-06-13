import {
  calculateStreak,
  dedupeRecords,
  getLocalDateKey,
  getModeName,
  recordKey,
  sortRecordsNewestFirst,
} from "./core.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateKey(value, endOfDay = false) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (!Number.isFinite(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date.getTime();
}

export function addLocalDays(dateKey, amount) {
  const timestamp = parseDateKey(dateKey);
  if (timestamp === null) return null;
  const date = new Date(timestamp);
  date.setDate(date.getDate() + amount);
  return getLocalDateKey(date);
}

function validTimestamp(record) {
  const timestamp = record?.timestamp ?? new Date(record?.date).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function sameStreak(segment, streak) {
  return Boolean(
    streak?.count &&
    segment.count === streak.count &&
    recordKey(segment.start) === recordKey(streak.start) &&
    recordKey(segment.end) === recordKey(streak.end),
  );
}

export function selectVisualizationRecords(records, mode = "all") {
  const normalized = sortRecordsNewestFirst(dedupeRecords(records));
  return mode === "all" ? normalized : normalized.filter((record) => record.type === mode);
}

export function buildStreakSegments(records) {
  const selected = sortRecordsNewestFirst(dedupeRecords(records));
  const stats = calculateStreak(selected);
  const chronological = [...selected]
    .filter((record) => validTimestamp(record) !== null)
    .reverse();
  const segments = [];
  let run = [];

  const closeRun = () => {
    if (!run.length) return;
    const segment = {
      count: run.length,
      start: run[0],
      end: run[run.length - 1],
      startTimestamp: validTimestamp(run[0]),
      endTimestamp: validTimestamp(run[run.length - 1]),
      records: [...run],
      role: "other",
    };
    const isBest = sameStreak(segment, stats.best);
    const isCurrent = sameStreak(segment, stats.current);
    segment.role = isBest && isCurrent
      ? "current-best"
      : isBest
        ? "best"
        : isCurrent
          ? "current"
          : "other";
    segments.push(segment);
    run = [];
  };

  for (const record of chronological) {
    if (record.win === true) run.push(record);
    else closeRun();
  }
  closeRun();

  return { segments, ...stats };
}

export function getVisualizationRange(records, { from, to, presetDays = 90 } = {}) {
  const valid = selectVisualizationRecords(records)
    .filter((record) => validTimestamp(record) !== null)
    .reverse();
  const fallback = getLocalDateKey(new Date());
  const minimum = valid.length ? getLocalDateKey(valid[0].date) : fallback;
  const maximum = valid.length ? getLocalDateKey(valid[valid.length - 1].date) : fallback;
  const safeTo = parseDateKey(to) === null ? maximum : to;
  const safeFrom = parseDateKey(from) === null
    ? addLocalDays(safeTo, -(Math.max(1, Number(presetDays) || 90) - 1))
    : from;

  if (parseDateKey(safeFrom) > parseDateKey(safeTo)) {
    throw new Error("图表开始日期不能晚于结束日期。");
  }

  return {
    from: safeFrom,
    to: safeTo,
    minimum,
    maximum,
    fromTimestamp: parseDateKey(safeFrom),
    toTimestamp: parseDateKey(safeTo, true),
  };
}

export function enumerateLocalDates(from, to) {
  const dates = [];
  let current = from;
  while (current && parseDateKey(current) <= parseDateKey(to)) {
    dates.push(current);
    current = addLocalDays(current, 1);
  }
  return dates;
}

export function buildVisualizationModel(records, {
  mode = "all",
  from,
  to,
  presetDays = 90,
} = {}) {
  const selected = selectVisualizationRecords(records, mode);
  const range = getVisualizationRange(selected, { from, to, presetDays });
  const streaks = buildStreakSegments(selected);
  const validChronological = [...selected]
    .filter((record) => validTimestamp(record) !== null)
    .reverse();
  const dailyMap = new Map();
  let runningStreak = 0;
  let carryStreak = 0;
  const allPoints = [];

  for (const record of validChronological) {
    const timestamp = validTimestamp(record);
    runningStreak = record.win === true ? runningStreak + 1 : 0;
    const point = {
      timestamp,
      dateKey: getLocalDateKey(record.date),
      streak: runningStreak,
      result: record.win === true ? "win" : record.win === false ? "loss" : "unknown",
      record,
    };
    allPoints.push(point);
    if (timestamp < range.fromTimestamp) carryStreak = runningStreak;

    if (timestamp < range.fromTimestamp || timestamp > range.toTimestamp) continue;
    const day = dailyMap.get(point.dateKey) ?? {
      dateKey: point.dateKey,
      wins: 0,
      losses: 0,
      unknown: 0,
    };
    if (point.result === "win") day.wins += 1;
    else if (point.result === "loss") day.losses += 1;
    else day.unknown += 1;
    dailyMap.set(point.dateKey, day);
  }

  const days = enumerateLocalDates(range.from, range.to).map((dateKey) => (
    dailyMap.get(dateKey) ?? { dateKey, wins: 0, losses: 0, unknown: 0 }
  ));
  const points = [
    {
      timestamp: range.fromTimestamp,
      dateKey: range.from,
      streak: carryStreak,
      result: "carry",
      record: null,
    },
    ...allPoints.filter(
      (point) => point.timestamp >= range.fromTimestamp && point.timestamp <= range.toTimestamp,
    ),
  ];
  const spans = streaks.segments
    .filter(
      (segment) =>
        segment.endTimestamp >= range.fromTimestamp &&
        segment.startTimestamp <= range.toTimestamp,
    )
    .map((segment) => ({
      ...segment,
      visibleStart: Math.max(segment.startTimestamp, range.fromTimestamp),
      visibleEnd: Math.min(segment.endTimestamp, range.toTimestamp),
      leftTruncated: segment.startTimestamp < range.fromTimestamp,
      rightTruncated: segment.endTimestamp > range.toTimestamp,
    }));
  const invalidDateCount = selected.filter((record) => validTimestamp(record) === null).length;
  const unknownInRange = days.reduce((sum, day) => sum + day.unknown, 0);

  return {
    mode,
    modeName: mode === "all" ? "所有模式" : getModeName(mode),
    selectedCount: selected.length,
    validCount: validChronological.length,
    invalidDateCount,
    unknownInRange,
    range,
    days,
    points,
    spans,
    segments: streaks.segments,
    current: streaks.current,
    best: streaks.best,
    bestInRange: spans.some((span) => span.role === "best" || span.role === "current-best"),
    currentInRange: spans.some((span) => span.role === "current" || span.role === "current-best"),
  };
}

export function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildVisualizationExportName({
  playerName,
  modeName,
  chartType,
  from,
  to,
  format,
}) {
  const safe = (value) => String(value ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, 80) || "未知";
  const extension = format === "png" ? "png" : "svg";
  return [
    "BJD-Streaks",
    safe(playerName),
    safe(modeName),
    chartType === "line" ? "累计连胜" : "每日胜负",
    safe(from),
    safe(to),
  ].join("-") + `.${extension}`;
}

export function prepareSvgExport(svgMarkup, { title = "", description = "" } = {}) {
  const markup = String(svgMarkup ?? "").replace(/^<\?xml[^>]*>\s*/i, "");
  const metadata = `<title>${escapeXml(title)}</title><desc>${escapeXml(description)}</desc>`;
  const withNamespace = markup.replace(
    /^<svg\b(?![^>]*\bxmlns=)/,
    '<svg xmlns="http://www.w3.org/2000/svg"',
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n${withNamespace.replace(/^(<svg\b[^>]*>)/, `$1${metadata}`)}`;
}
