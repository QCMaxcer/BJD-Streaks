// ==UserScript==
// @name         布吉岛战绩与连胜统计
// @namespace    https://user.mcbjd.net/
// @version      1.0.0
// @description  分类查找布吉岛战绩，并统计当前连胜与历史最高连胜
// @author       Codex
// @match        https://user.mcbjd.net/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  // src/core.js
  var MODE_NAMES = Object.freeze({
    bw: "\u8D77\u5E8A\u6218\u4E89\u5168\u5C40",
    bw1: "\u8D77\u5E8A\u6218\u4E89(\u5355\u4EBA)",
    bw8: "\u8D77\u5E8A\u6218\u4E89(\u53CC\u4EBA)",
    bw12: "\u8D77\u5E8A\u6218\u4E89(\u4E09\u4EBA)",
    bw16: "\u8D77\u5E8A\u6218\u4E89(4\u961F\u56DB\u4EBA)",
    bwxp32: "\u7ECF\u9A8C\u8D77\u5E8A(4\u961F\u516B\u4EBA)",
    bwxp8x4: "\u7ECF\u9A8C\u8D77\u5E8A(8\u961F\u56DB\u4EBA)",
    bwxp64: "\u7ECF\u9A8C\u8D77\u5E8A(32v32)",
    bw999: "\u8D77\u5E8A\u6218\u4E89(\u65E0\u9650\u706B\u529B)",
    swroneblock: "\u5E78\u8FD0\u4E4B\u67F1(\u5355\u4EBA)",
    swrtwoblock: "\u5E78\u8FD0\u4E4B\u67F1(\u7EC4\u961F)",
    sw: "\u7A7A\u5C9B\u6218\u4E89\u5168\u5C40",
    swrsolo: "\u7A7A\u5C9B\u6218\u4E89(\u5355\u4EBA)",
    swrdouble: "\u7A7A\u5C9B\u6218\u4E89(\u7EC4\u961F)",
    swrgodless: "\u7A7A\u5C9B\u6218\u4E89(\u5355\u4EBA-\u65E0\u795E\u88C5)",
    swrnokit: "\u7A7A\u5C9B\u6218\u4E89(\u5355\u4EBA-\u65E0\u804C\u4E1A)",
    sgsteam: "\u6781\u9650\u6E38\u620F(\u7EC4\u961F)",
    sgssolo: "\u6781\u9650\u6E38\u620F(\u5355\u4EBA)",
    pgsolo: "\u5403\u9E21: \u5F52\u6765(\u5355\u4EBA)",
    pgdouble: "\u5403\u9E21: \u5F52\u6765(\u53CC\u4EBA)",
    pgteam: "\u5403\u9E21: \u5F52\u6765(\u7EC4\u961F)",
    vdefensenormal: "\u6751\u5E84\u5B88\u536B\u6218(\u666E\u901A)"
  });
  function normalizeMode(mode) {
    return String(mode ?? "").trim().toLowerCase() || "unknown";
  }
  function getModeName(mode) {
    const normalized = normalizeMode(mode);
    return MODE_NAMES[normalized] ?? String(mode || "\u672A\u77E5\u6A21\u5F0F");
  }
  function getModeCategory(mode) {
    const normalized = normalizeMode(mode);
    if (normalized.startsWith("bw")) return "\u8D77\u5E8A\u6218\u4E89";
    if (normalized.startsWith("sw") || normalized.startsWith("sgs") || normalized.startsWith("pg")) {
      return "\u7A7A\u5C9B\u76F8\u5173";
    }
    if (normalized.startsWith("vdefense")) return "\u6751\u5E84\u5B88\u536B\u6218";
    return "\u672A\u77E5\u6A21\u5F0F";
  }
  function parseTimestamp(value) {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  function getLocalDateKey(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  function parseDateInputToKey(value) {
    const raw = String(value ?? "").trim();
    const match = raw.match(/^(\d{2}|\d{4})[-./年](\d{1,2})[-./月](\d{1,2})日?$/);
    if (!match) return null;
    const yearNumber = Number(match[1]);
    const year = yearNumber < 100 ? 2e3 + yearNumber : yearNumber;
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  function recordKey(record) {
    return `${String(record?.matchId ?? "")}::${String(record?.date ?? "")}`;
  }
  function normalizeRecord(record, sourceIndex = 0) {
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
      sourceIndex
    };
  }
  function dedupeRecords(records) {
    const seen = /* @__PURE__ */ new Set();
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
  function sortRecordsNewestFirst(records) {
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
  function unwrapData(value, maxDepth = 8) {
    let current = value;
    for (let depth = 0; depth < maxDepth; depth += 1) {
      if (current && typeof current === "object" && !Array.isArray(current) && Object.prototype.hasOwnProperty.call(current, "data")) {
        current = current.data;
        continue;
      }
      break;
    }
    return current;
  }
  function extractArray(value) {
    let current = value;
    for (let depth = 0; depth < 8; depth += 1) {
      if (Array.isArray(current)) return current;
      if (current && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, "data")) {
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
      records: []
    };
  }
  function calculateStreak(records) {
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
          records: [...run]
        };
      }
      run = [];
    };
    for (const record of oldest) {
      if (record.win === true && (record.timestamp ?? parseTimestamp(record.date)) !== null) {
        run.push(record);
      } else closeRun();
    }
    closeRun();
    return { current, best };
  }
  function buildModeStats(records) {
    const normalized = sortRecordsNewestFirst(dedupeRecords(records));
    const byMode = /* @__PURE__ */ new Map();
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
        modeName: mode === "all" ? "\u6240\u6709\u6A21\u5F0F" : getModeName(mode),
        category: mode === "all" ? "\u603B\u89C8" : getModeCategory(mode),
        total: items.length,
        wins,
        losses,
        unknown,
        winRate: items.length ? wins / items.length : 0,
        ...calculateStreak(items)
      };
    };
    const modes = [...byMode.entries()].map(([mode, items]) => summarize(mode, items)).sort((a, b) => b.total - a.total || a.modeName.localeCompare(b.modeName, "zh-CN"));
    return {
      records: normalized,
      overall: summarize("all", normalized),
      modes
    };
  }
  function filterRecords(records, filters = {}) {
    const query = String(filters.query ?? "").trim().toLowerCase();
    const from = filters.from ? (/* @__PURE__ */ new Date(`${filters.from}T00:00:00`)).getTime() : null;
    const to = filters.to ? (/* @__PURE__ */ new Date(`${filters.to}T23:59:59.999`)).getTime() : null;
    return records.filter((record) => {
      if (filters.mode && record.type !== filters.mode) return false;
      if (filters.category && record.category !== filters.category) return false;
      if (filters.result === "win" && record.win !== true) return false;
      if (filters.result === "loss" && record.win !== false) return false;
      if (filters.result === "unknown" && record.win !== null) return false;
      if (from !== null && (record.timestamp === null || record.timestamp < from)) return false;
      if (to !== null && (record.timestamp === null || record.timestamp > to)) return false;
      if (query && !`${record.matchId} ${record.type} ${record.modeName} ${record.category}`.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }

  // src/api.js
  var API_ROOT = "/api/api";
  var ApiError = class extends Error {
    constructor(message, status = null, payload = null) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.payload = payload;
    }
  };
  function getToken() {
    return localStorage.getItem("token");
  }
  function isRateLimitError(error) {
    return error?.status === 429 || error?.payload?.code === 429 || /频繁|too many requests|rate.?limit/i.test(String(error?.message ?? ""));
  }
  function wait(ms, signal) {
    if (ms <= 0) return Promise.resolve();
    if (signal?.aborted) return Promise.reject(new DOMException("\u64CD\u4F5C\u5DF2\u53D6\u6D88", "AbortError"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(done, ms);
      function done() {
        signal?.removeEventListener("abort", abort);
        resolve();
      }
      function abort() {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        reject(new DOMException("\u64CD\u4F5C\u5DF2\u53D6\u6D88", "AbortError"));
      }
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
  async function apiPost(path, body = {}, { signal } = {}) {
    const token = getToken();
    if (!token) throw new ApiError("\u767B\u5F55\u72B6\u6001\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55\u5E03\u5409\u5C9B\u7528\u6237\u4E2D\u5FC3\u3002", 401);
    const response = await fetch(`${API_ROOT}${path}`, {
      method: "POST",
      credentials: "include",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: token
      },
      body: JSON.stringify(body)
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError(`\u63A5\u53E3\u8FD4\u56DE\u4E86\u65E0\u6CD5\u89E3\u6790\u7684\u6570\u636E\uFF08HTTP ${response.status}\uFF09\u3002`, response.status);
    }
    if (!response.ok || payload?.code != null && payload.code !== 200) {
      throw new ApiError(
        payload?.message || `\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09\u3002`,
        response.status,
        payload
      );
    }
    return payload;
  }
  async function fetchBindings(options) {
    return extractArray(await apiPost("/binding/list", {}, options));
  }
  async function fetchMatchDetails(record, options) {
    const payload = await apiPost(
      "/stats/match",
      { id: record.matchId, date: record.date },
      options
    );
    return unwrapData(payload);
  }
  async function fetchAllRecords({
    uuid,
    signal,
    onProgress = () => {
    },
    post = apiPost,
    maxPages = 1e3,
    duplicatePageLimit = 2,
    pageDelayMs = 1500,
    rateLimitBaseDelayMs = 5e3,
    maxRateLimitRetries = 5,
    sleep = wait,
    cutoffDate = ""
  }) {
    const records = [];
    const seen = /* @__PURE__ */ new Set();
    let duplicatePages = 0;
    let page = 1;
    let rateLimitRetries = 0;
    let scannedCount = 0;
    while (page <= maxPages) {
      if (signal?.aborted) throw new DOMException("\u64CD\u4F5C\u5DF2\u53D6\u6D88", "AbortError");
      if (page > 1 && rateLimitRetries === 0) {
        onProgress({
          phase: "delay",
          page,
          count: records.length,
          scannedCount,
          waitMs: pageDelayMs
        });
        await sleep(pageDelayMs, signal);
      }
      onProgress({ phase: "request", page, count: records.length, scannedCount });
      let payload;
      try {
        payload = await post("/stats/list", { page, uuid }, { signal });
        rateLimitRetries = 0;
      } catch (error) {
        if (!isRateLimitError(error) || rateLimitRetries >= maxRateLimitRetries) throw error;
        rateLimitRetries += 1;
        const waitMs = Math.min(rateLimitBaseDelayMs * 2 ** (rateLimitRetries - 1), 6e4);
        onProgress({
          phase: "rate-limit",
          page,
          count: records.length,
          scannedCount,
          waitMs,
          attempt: rateLimitRetries,
          maxAttempts: maxRateLimitRetries
        });
        await sleep(waitMs, signal);
        continue;
      }
      const pageRecords = extractArray(payload);
      if (pageRecords.length === 0) {
        return {
          records: dedupeRecords(records),
          pagesFetched: page,
          scannedCount,
          stoppedBy: "empty"
        };
      }
      let added = 0;
      let scannedAdded = 0;
      for (const record of pageRecords) {
        const key = recordKey(record);
        if (seen.has(key)) continue;
        seen.add(key);
        scannedAdded += 1;
        scannedCount += 1;
        const dateKey = getLocalDateKey(record?.date);
        if (cutoffDate && (!dateKey || dateKey < cutoffDate)) continue;
        records.push(record);
        added += 1;
      }
      duplicatePages = scannedAdded === 0 ? duplicatePages + 1 : 0;
      onProgress({
        phase: "received",
        page,
        count: records.length,
        scannedCount,
        pageCount: pageRecords.length,
        added,
        scannedAdded
      });
      const pageDateKeys = pageRecords.map((record) => getLocalDateKey(record?.date)).filter(Boolean);
      if (cutoffDate && pageDateKeys.some((dateKey) => dateKey < cutoffDate)) {
        return {
          records: dedupeRecords(records),
          pagesFetched: page,
          scannedCount,
          stoppedBy: "cutoff-date-passed"
        };
      }
      if (duplicatePages >= duplicatePageLimit) {
        return {
          records: dedupeRecords(records),
          pagesFetched: page,
          scannedCount,
          stoppedBy: "duplicates"
        };
      }
      page += 1;
    }
    return {
      records: dedupeRecords(records),
      pagesFetched: maxPages,
      scannedCount,
      stoppedBy: "limit"
    };
  }

  // src/styles.js
  var STYLES = `
#bjdw-root {
  --bjdw-bg: #0f172a;
  --bjdw-panel: #172033;
  --bjdw-panel-soft: #1e293b;
  --bjdw-border: #334155;
  --bjdw-text: #e5edf7;
  --bjdw-muted: #94a3b8;
  --bjdw-primary: #38bdf8;
  --bjdw-win: #22c55e;
  --bjdw-loss: #f87171;
  --bjdw-warning: #fbbf24;
  position: relative;
  z-index: 2147483000;
  color: var(--bjdw-text);
  font-family: Inter, "Segoe UI", "Microsoft YaHei", sans-serif;
}

#bjdw-root, #bjdw-root * { box-sizing: border-box; }

.bjdw-launcher {
  position: fixed;
  right: 22px;
  bottom: 24px;
  z-index: 2147483001;
  border: 0;
  border-radius: 999px;
  padding: 12px 17px;
  color: #082f49;
  background: linear-gradient(135deg, #7dd3fc, #38bdf8);
  box-shadow: 0 12px 32px rgba(2, 132, 199, .38);
  font-weight: 800;
  cursor: pointer;
}

.bjdw-launcher:hover { transform: translateY(-1px); }
.bjdw-hidden { display: none !important; }

.bjdw-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483002;
  background: rgba(2, 6, 23, .58);
  backdrop-filter: blur(2px);
}

.bjdw-drawer {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 2147483003;
  width: min(620px, 100vw);
  height: 100vh;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  background: var(--bjdw-bg);
  border-left: 1px solid var(--bjdw-border);
  box-shadow: -18px 0 50px rgba(2, 6, 23, .46);
}

.bjdw-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--bjdw-border);
  background: linear-gradient(135deg, #172554, #0f172a 65%);
}

.bjdw-title { flex: 1; min-width: 0; }
.bjdw-title strong { display: block; font-size: 17px; }
.bjdw-title span { color: var(--bjdw-muted); font-size: 12px; }

.bjdw-button, .bjdw-icon-button, .bjdw-select, .bjdw-input {
  border: 1px solid var(--bjdw-border);
  border-radius: 9px;
  color: var(--bjdw-text);
  background: var(--bjdw-panel-soft);
  font: inherit;
}

.bjdw-button, .bjdw-icon-button { cursor: pointer; }
.bjdw-button { padding: 8px 12px; font-weight: 700; }
.bjdw-button:hover, .bjdw-icon-button:hover { border-color: var(--bjdw-primary); }
.bjdw-button-primary { color: #082f49; border-color: #38bdf8; background: #7dd3fc; }
.bjdw-button-danger { border-color: #7f1d1d; background: #450a0a; color: #fecaca; }
.bjdw-icon-button { width: 34px; height: 34px; padding: 0; font-size: 20px; }

.bjdw-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--bjdw-border);
  background: var(--bjdw-panel);
}

.bjdw-account-row { display: flex; gap: 8px; min-width: 0; }
.bjdw-select, .bjdw-input { min-width: 0; padding: 8px 9px; outline: none; }
.bjdw-select:focus, .bjdw-input:focus { border-color: var(--bjdw-primary); }
.bjdw-account-row .bjdw-select { flex: 1; }

.bjdw-fetch-settings {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.bjdw-field { display: grid; gap: 5px; }
.bjdw-field span { color: var(--bjdw-muted); font-size: 11px; font-weight: 700; }

.bjdw-progress {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 18px;
  color: var(--bjdw-muted);
  font-size: 12px;
}

.bjdw-progress-line {
  flex: 1;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: #334155;
}

.bjdw-progress-line::after {
  display: block;
  width: 40%;
  height: 100%;
  content: "";
  background: var(--bjdw-primary);
  animation: bjdw-progress 1.2s infinite ease-in-out;
}

@keyframes bjdw-progress {
  from { transform: translateX(-100%); }
  to { transform: translateX(350%); }
}

.bjdw-content { overflow-y: auto; padding: 15px; }
.bjdw-section { margin-bottom: 17px; }
.bjdw-section-title {
  margin: 0 0 9px;
  color: #cbd5e1;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.bjdw-overall-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.bjdw-metric, .bjdw-mode-card, .bjdw-record, .bjdw-empty, .bjdw-error {
  border: 1px solid var(--bjdw-border);
  border-radius: 12px;
  background: var(--bjdw-panel);
}

.bjdw-metric { padding: 11px; }
.bjdw-metric span { display: block; color: var(--bjdw-muted); font-size: 11px; }
.bjdw-metric strong { display: block; margin-top: 5px; font-size: 19px; }
.bjdw-win-text { color: var(--bjdw-win); }
.bjdw-loss-text { color: var(--bjdw-loss); }
.bjdw-warning-text { color: var(--bjdw-warning); }

.bjdw-mode-list { display: grid; gap: 8px; }
.bjdw-mode-card { padding: 11px 12px; }
.bjdw-mode-head { display: flex; align-items: center; gap: 8px; }
.bjdw-mode-name { flex: 1; font-weight: 800; }
.bjdw-tag {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 3px 7px;
  color: #bae6fd;
  background: #0c4a6e;
  font-size: 11px;
}
.bjdw-mode-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  margin-top: 9px;
}
.bjdw-mode-stat span { display: block; color: var(--bjdw-muted); font-size: 10px; }
.bjdw-mode-stat strong { font-size: 14px; }
.bjdw-range { margin-top: 6px; color: var(--bjdw-muted); font-size: 11px; }

.bjdw-filters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 9px;
}
.bjdw-filter-wide { grid-column: 1 / -1; }
.bjdw-result-count { margin: 0 0 8px; color: var(--bjdw-muted); font-size: 12px; }

.bjdw-record-list { display: grid; gap: 7px; }
.bjdw-record {
  width: 100%;
  padding: 10px 12px;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.bjdw-record:hover { border-color: var(--bjdw-primary); }
.bjdw-record-head { display: flex; align-items: center; gap: 8px; }
.bjdw-record-name { flex: 1; font-weight: 750; }
.bjdw-record-meta { margin-top: 5px; color: var(--bjdw-muted); font-size: 11px; word-break: break-all; }
.bjdw-result {
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 800;
}
.bjdw-result-win { color: #bbf7d0; background: #14532d; }
.bjdw-result-loss { color: #fecaca; background: #7f1d1d; }
.bjdw-result-unknown { color: #fde68a; background: #713f12; }

.bjdw-empty, .bjdw-error { padding: 18px; text-align: center; }
.bjdw-empty { color: var(--bjdw-muted); }
.bjdw-error { color: #fecaca; border-color: #7f1d1d; background: #450a0a; }

.bjdw-detail {
  position: fixed;
  inset: 0;
  z-index: 2147483004;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(2, 6, 23, .72);
}
.bjdw-detail-card {
  width: min(720px, 100%);
  max-height: min(820px, calc(100vh - 32px));
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border: 1px solid var(--bjdw-border);
  border-radius: 14px;
  background: var(--bjdw-bg);
  box-shadow: 0 24px 60px rgba(0, 0, 0, .5);
}
.bjdw-detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 13px 15px;
  border-bottom: 1px solid var(--bjdw-border);
}
.bjdw-detail-head strong { flex: 1; }
.bjdw-detail-body { overflow: auto; padding: 14px; }
.bjdw-detail-body pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: #cbd5e1;
  font: 12px/1.55 Consolas, monospace;
}

@media (max-width: 520px) {
  .bjdw-toolbar { grid-template-columns: 1fr; }
  .bjdw-account-row { flex-wrap: wrap; }
  .bjdw-fetch-settings { grid-template-columns: 1fr; }
  .bjdw-overall-grid, .bjdw-mode-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .bjdw-launcher { right: 12px; bottom: 14px; }
}
`;

  // src/userscript.js
  var ROOT_ID = "bjdw-root";
  var DISPLAY_LIMIT = 200;
  var DEFAULT_CUTOFF_DATE = "2025-01-01";
  var DEFAULT_PAGE_DELAY_SECONDS = 0.1;
  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== void 0) element.textContent = text;
    return element;
  }
  function formatDate(value, withTime = true) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return String(value || "\u672A\u77E5\u65F6\u95F4");
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...withTime ? { hour: "2-digit", minute: "2-digit" } : {}
    }).format(date);
  }
  function formatRate(rate) {
    return `${(rate * 100).toFixed(1)}%`;
  }
  function resultLabel(win) {
    return win === true ? "\u80DC\u5229" : win === false ? "\u5931\u8D25" : "\u672A\u77E5";
  }
  function streakRange(streak) {
    if (!streak?.count) return "\u6682\u65E0\u8FDE\u80DC";
    return `${formatDate(streak.start?.date, false)} \u81F3 ${formatDate(streak.end?.date, false)}`;
  }
  var BjdWinsApp = class {
    constructor() {
      this.bindings = [];
      this.selectedUuid = "";
      this.records = [];
      this.stats = buildModeStats([]);
      this.fetchController = null;
      this.detailController = null;
      this.loading = false;
      this.loaded = false;
      this.detailCache = /* @__PURE__ */ new Map();
      this.filters = { mode: "", category: "", result: "", from: "", to: "", query: "" };
      this.mount();
      this.syncRoute();
    }
    mount() {
      this.root = createElement("div");
      this.root.id = ROOT_ID;
      this.root.innerHTML = `
      <button class="bjdw-launcher" type="button">\u8FDE\u80DC\u7EDF\u8BA1</button>
      <div class="bjdw-backdrop bjdw-hidden"></div>
      <aside class="bjdw-drawer bjdw-hidden" aria-label="\u5E03\u5409\u5C9B\u6218\u7EE9\u4E0E\u8FDE\u80DC\u7EDF\u8BA1">
        <header class="bjdw-header">
          <div class="bjdw-title">
            <strong>\u6218\u7EE9\u4E0E\u8FDE\u80DC\u7EDF\u8BA1</strong>
            <span>\u6309\u7CBE\u786E\u6E38\u620F\u6A21\u5F0F\u7EDF\u8BA1\uFF0C\u6570\u636E\u4EC5\u4FDD\u5B58\u5728\u5F53\u524D\u9875\u9762</span>
          </div>
          <button class="bjdw-icon-button bjdw-close" type="button" aria-label="\u5173\u95ED">\xD7</button>
        </header>
        <div class="bjdw-toolbar">
          <div class="bjdw-account-row">
            <select class="bjdw-select bjdw-account" aria-label="\u7ED1\u5B9A\u8D26\u53F7"></select>
            <button class="bjdw-button bjdw-button-primary bjdw-refresh" type="button">\u6293\u53D6\u81F3\u622A\u6B62\u65E5\u671F</button>
            <button class="bjdw-button bjdw-button-danger bjdw-cancel bjdw-hidden" type="button">\u53D6\u6D88</button>
          </div>
          <button class="bjdw-button bjdw-clear" type="button">\u6E05\u7A7A\u7B5B\u9009</button>
          <div class="bjdw-fetch-settings">
            <label class="bjdw-field">
              <span>\u622A\u6B62\u65E5\u671F</span>
              <input class="bjdw-input bjdw-fetch-date" type="date" value="${DEFAULT_CUTOFF_DATE}" required>
            </label>
            <label class="bjdw-field">
              <span>\u5206\u9875\u95F4\u9694\uFF08\u79D2\uFF09</span>
              <input class="bjdw-input bjdw-fetch-delay" type="number" min="0.1" max="60" step="0.1" value="${DEFAULT_PAGE_DELAY_SECONDS}">
            </label>
          </div>
          <div class="bjdw-progress">
            <span class="bjdw-progress-text">\u6253\u5F00\u9762\u677F\u540E\u5C06\u8BFB\u53D6\u7ED1\u5B9A\u8D26\u53F7\u3002</span>
          </div>
        </div>
        <main class="bjdw-content"></main>
      </aside>
      <div class="bjdw-detail bjdw-hidden" role="dialog" aria-modal="true">
        <div class="bjdw-detail-card">
          <header class="bjdw-detail-head">
            <strong class="bjdw-detail-title">\u5BF9\u5C40\u8BE6\u60C5</strong>
            <button class="bjdw-icon-button bjdw-detail-close" type="button" aria-label="\u5173\u95ED\u8BE6\u60C5">\xD7</button>
          </header>
          <div class="bjdw-detail-body"></div>
        </div>
      </div>
    `;
      const style = createElement("style");
      style.textContent = STYLES;
      document.head.append(style);
      document.body.append(this.root);
      this.els = {
        launcher: this.root.querySelector(".bjdw-launcher"),
        backdrop: this.root.querySelector(".bjdw-backdrop"),
        drawer: this.root.querySelector(".bjdw-drawer"),
        close: this.root.querySelector(".bjdw-close"),
        account: this.root.querySelector(".bjdw-account"),
        refresh: this.root.querySelector(".bjdw-refresh"),
        cancel: this.root.querySelector(".bjdw-cancel"),
        clear: this.root.querySelector(".bjdw-clear"),
        fetchDate: this.root.querySelector(".bjdw-fetch-date"),
        fetchDelay: this.root.querySelector(".bjdw-fetch-delay"),
        progress: this.root.querySelector(".bjdw-progress"),
        content: this.root.querySelector(".bjdw-content"),
        detail: this.root.querySelector(".bjdw-detail"),
        detailTitle: this.root.querySelector(".bjdw-detail-title"),
        detailBody: this.root.querySelector(".bjdw-detail-body"),
        detailClose: this.root.querySelector(".bjdw-detail-close")
      };
      this.els.fetchDate.value = DEFAULT_CUTOFF_DATE;
      this.els.fetchDelay.value = String(DEFAULT_PAGE_DELAY_SECONDS);
      this.els.launcher.addEventListener("click", () => this.open());
      this.els.close.addEventListener("click", () => this.close());
      this.els.backdrop.addEventListener("click", () => this.close());
      this.els.refresh.addEventListener("click", () => this.loadRecords());
      this.els.cancel.addEventListener("click", () => this.fetchController?.abort());
      this.els.clear.addEventListener("click", () => this.clearFilters());
      this.els.fetchDate.addEventListener("click", () => this.showDatePicker());
      this.els.fetchDate.addEventListener("change", () => this.resetLoadedData());
      this.els.account.addEventListener("change", (event) => {
        this.selectedUuid = event.target.value;
        this.resetLoadedData();
      });
      this.els.detailClose.addEventListener("click", () => this.closeDetail());
      this.els.detail.addEventListener("click", (event) => {
        if (event.target === this.els.detail) this.closeDetail();
      });
      window.addEventListener("hashchange", () => this.syncRoute());
      window.addEventListener("popstate", () => this.syncRoute());
    }
    isStatsRoute() {
      return location.hash.startsWith("#/stats");
    }
    syncRoute() {
      this.els.launcher.classList.toggle("bjdw-hidden", !this.isStatsRoute());
      if (!this.isStatsRoute()) this.close();
    }
    async open() {
      this.els.drawer.classList.remove("bjdw-hidden");
      this.els.backdrop.classList.remove("bjdw-hidden");
      if (this.bindings.length === 0 && !this.loading) await this.loadBindings();
    }
    close() {
      this.els.drawer.classList.add("bjdw-hidden");
      this.els.backdrop.classList.add("bjdw-hidden");
      this.closeDetail();
    }
    closeDetail() {
      this.detailController?.abort();
      this.detailController = null;
      this.els.detail.classList.add("bjdw-hidden");
    }
    showDatePicker() {
      if (typeof this.els.fetchDate.showPicker !== "function") return;
      try {
        this.els.fetchDate.showPicker();
      } catch {
      }
    }
    setProgress(text, active = false) {
      this.els.progress.replaceChildren();
      this.els.progress.append(createElement("span", "bjdw-progress-text", text));
      if (active) this.els.progress.append(createElement("span", "bjdw-progress-line"));
    }
    setLoading(loading) {
      this.loading = loading;
      this.els.refresh.disabled = loading;
      this.els.account.disabled = loading;
      this.els.fetchDate.disabled = loading;
      this.els.fetchDelay.disabled = loading;
      this.els.cancel.classList.toggle("bjdw-hidden", !loading);
    }
    resetLoadedData() {
      this.records = [];
      this.stats = buildModeStats([]);
      this.loaded = false;
      this.render();
    }
    showError(error) {
      const message = error?.name === "AbortError" ? "\u5DF2\u53D6\u6D88\u6293\u53D6\u3002" : error?.message || "\u53D1\u751F\u672A\u77E5\u9519\u8BEF\u3002";
      this.setProgress(message, false);
      if (error?.name !== "AbortError") {
        this.els.content.replaceChildren(createElement("div", "bjdw-error", message));
      }
    }
    async loadBindings() {
      this.setLoading(true);
      this.setProgress("\u6B63\u5728\u8BFB\u53D6\u7ED1\u5B9A\u8D26\u53F7\u2026", true);
      try {
        this.bindings = await fetchBindings();
        if (this.bindings.length === 0) throw new Error("\u5F53\u524D\u8D26\u6237\u6CA1\u6709\u53EF\u7528\u7684\u6E38\u620F\u7ED1\u5B9A\u3002");
        this.selectedUuid = String(this.bindings[0].uuid ?? "");
        this.renderAccounts();
        this.setProgress("\u9009\u62E9\u8D26\u53F7\u540E\u70B9\u51FB\u201C\u6293\u53D6\u5168\u90E8\u6218\u7EE9\u201D\u3002");
        this.render();
      } catch (error) {
        this.showError(error);
      } finally {
        this.setLoading(false);
      }
    }
    renderAccounts() {
      this.els.account.replaceChildren();
      for (const binding of this.bindings) {
        const option = createElement("option", "", binding.name || binding.uuid || "\u672A\u547D\u540D\u8D26\u53F7");
        option.value = String(binding.uuid ?? "");
        option.selected = option.value === this.selectedUuid;
        this.els.account.append(option);
      }
    }
    async loadRecords() {
      if (!this.selectedUuid || this.loading) return;
      const cutoffDate = parseDateInputToKey(this.els.fetchDate.value);
      if (!cutoffDate) {
        this.showError(new Error("\u8BF7\u8F93\u5165\u6709\u6548\u622A\u6B62\u65E5\u671F\uFF0C\u4F8B\u5982 2026-01-01 \u6216 26.1.1\u3002"));
        return;
      }
      this.els.fetchDate.value = cutoffDate;
      const delaySeconds = Number(this.els.fetchDelay.value);
      const pageDelayMs = Math.round(
        Math.min(
          Math.max(
            Number.isFinite(delaySeconds) ? delaySeconds : DEFAULT_PAGE_DELAY_SECONDS,
            DEFAULT_PAGE_DELAY_SECONDS
          ),
          60
        ) * 1e3
      );
      this.els.fetchDelay.value = String(pageDelayMs / 1e3);
      this.fetchController?.abort();
      this.fetchController = new AbortController();
      this.setLoading(true);
      this.setProgress("\u51C6\u5907\u6293\u53D6\u6218\u7EE9\u2026", true);
      try {
        const result = await fetchAllRecords({
          uuid: this.selectedUuid,
          signal: this.fetchController.signal,
          cutoffDate,
          pageDelayMs,
          onProgress: ({
            phase,
            page,
            count,
            scannedCount,
            added,
            waitMs,
            attempt,
            maxAttempts
          }) => {
            if (phase === "delay") {
              this.setProgress(
                `\u5DF2\u626B\u63CF ${scannedCount} \u6761\uFF0C\u4FDD\u7559 ${count} \u6761\uFF1B\u7B49\u5F85 ${(waitMs / 1e3).toFixed(1)} \u79D2\u540E\u8BFB\u53D6\u7B2C ${page} \u9875\u2026`,
                true
              );
              return;
            }
            if (phase === "rate-limit") {
              this.setProgress(
                `\u670D\u52A1\u5668\u63D0\u793A\u8BF7\u6C42\u9891\u7E41\uFF0C\u7B49\u5F85 ${Math.ceil(waitMs / 1e3)} \u79D2\u540E\u91CD\u8BD5\u7B2C ${page} \u9875\uFF08${attempt}/${maxAttempts}\uFF09\uFF0C\u5DF2\u4FDD\u7559 ${count} \u6761\u2026`,
                true
              );
              return;
            }
            const suffix = phase === "received" ? `\uFF0C\u65B0\u589E ${added} \u6761` : "";
            this.setProgress(
              `\u6B63\u5728\u8BFB\u53D6\u7B2C ${page} \u9875\uFF0C\u5DF2\u626B\u63CF ${scannedCount} \u6761\uFF0C\u4FDD\u7559 ${count} \u6761${suffix}`,
              true
            );
          }
        });
        this.records = sortRecordsNewestFirst(result.records);
        this.stats = buildModeStats(this.records);
        this.loaded = true;
        const stopLabels = {
          "cutoff-date-passed": "\u5DF2\u8D8A\u8FC7\u622A\u6B62\u65E5\u671F",
          empty: "\u6CA1\u6709\u66F4\u591A\u8BB0\u5F55",
          duplicates: "\u8FDE\u7EED\u91CD\u590D\u5206\u9875",
          limit: "\u8FBE\u5230\u9875\u6570\u4E0A\u9650"
        };
        this.setProgress(
          `\u622A\u6B62 ${cutoffDate} \u6293\u53D6\u5B8C\u6210\uFF1A\u4FDD\u7559 ${this.records.length} \u6761\uFF0C\u626B\u63CF ${result.scannedCount} \u6761\u3001${result.pagesFetched} \u9875\uFF08${stopLabels[result.stoppedBy] || result.stoppedBy}\uFF09\u3002`
        );
        this.render();
      } catch (error) {
        this.showError(error);
      } finally {
        this.fetchController = null;
        this.setLoading(false);
      }
    }
    clearFilters() {
      this.filters = { mode: "", category: "", result: "", from: "", to: "", query: "" };
      this.render();
    }
    updateFilter(name, value) {
      this.filters[name] = value;
      this.renderRecordsSection();
    }
    render() {
      this.els.content.replaceChildren();
      if (!this.loaded) {
        this.els.content.append(
          createElement(
            "div",
            "bjdw-empty",
            this.selectedUuid ? "\u9009\u62E9\u622A\u6B62\u65E5\u671F\u548C\u5206\u9875\u95F4\u9694\u540E\uFF0C\u70B9\u51FB\u201C\u6293\u53D6\u81F3\u622A\u6B62\u65E5\u671F\u201D\u5F00\u59CB\u7EDF\u8BA1\u3002" : "\u6B63\u5728\u7B49\u5F85\u7ED1\u5B9A\u8D26\u53F7\u6570\u636E\u3002"
          )
        );
        return;
      }
      this.renderOverall();
      this.renderModes();
      this.renderRecordsSection();
    }
    renderOverall() {
      const section = createElement("section", "bjdw-section");
      section.append(createElement("h2", "bjdw-section-title", "\u6240\u6709\u6A21\u5F0F\u603B\u89C8"));
      const grid = createElement("div", "bjdw-overall-grid");
      const metrics = [
        ["\u603B\u5C40\u6570", this.stats.overall.total, ""],
        ["\u80DC\u5C40", this.stats.overall.wins, "bjdw-win-text"],
        ["\u8D1F\u5C40", this.stats.overall.losses, "bjdw-loss-text"],
        ["\u80DC\u7387", formatRate(this.stats.overall.winRate), "bjdw-win-text"],
        ["\u5F53\u524D\u8FDE\u80DC", this.stats.overall.current.count, "bjdw-win-text"],
        ["\u5386\u53F2\u6700\u9AD8", this.stats.overall.best.count, "bjdw-warning-text"]
      ];
      for (const [label, value, className] of metrics) {
        const card = createElement("div", "bjdw-metric");
        card.append(createElement("span", "", label), createElement("strong", className, value));
        grid.append(card);
      }
      section.append(grid);
      this.els.content.append(section);
    }
    renderModes() {
      const section = createElement("section", "bjdw-section");
      section.append(createElement("h2", "bjdw-section-title", "\u7CBE\u786E\u6A21\u5F0F\u8FDE\u80DC"));
      const list = createElement("div", "bjdw-mode-list");
      for (const mode of this.stats.modes) {
        const card = createElement("article", "bjdw-mode-card");
        const head = createElement("div", "bjdw-mode-head");
        head.append(
          createElement("span", "bjdw-mode-name", mode.modeName),
          createElement("span", "bjdw-tag", mode.category)
        );
        const values = createElement("div", "bjdw-mode-stats");
        for (const [label, value, className] of [
          ["\u5C40\u6570", mode.total, ""],
          ["\u80DC\u7387", formatRate(mode.winRate), "bjdw-win-text"],
          ["\u5F53\u524D\u8FDE\u80DC", mode.current.count, "bjdw-win-text"],
          ["\u5386\u53F2\u6700\u9AD8", mode.best.count, "bjdw-warning-text"]
        ]) {
          const item = createElement("div", "bjdw-mode-stat");
          item.append(createElement("span", "", label), createElement("strong", className, value));
          values.append(item);
        }
        card.append(
          head,
          values,
          createElement("div", "bjdw-range", `\u6700\u9AD8\u8FDE\u80DC\u533A\u95F4\uFF1A${streakRange(mode.best)}`)
        );
        list.append(card);
      }
      if (this.stats.modes.length === 0) {
        list.append(createElement("div", "bjdw-empty", "\u6CA1\u6709\u53EF\u7EDF\u8BA1\u7684\u6A21\u5F0F\u3002"));
      }
      section.append(list);
      this.els.content.append(section);
    }
    createSelect(name, label, options) {
      const select = createElement("select", "bjdw-select");
      select.setAttribute("aria-label", label);
      for (const [value, text] of options) {
        const option = createElement("option", "", text);
        option.value = value;
        option.selected = this.filters[name] === value;
        select.append(option);
      }
      select.addEventListener("change", (event) => this.updateFilter(name, event.target.value));
      return select;
    }
    createInput(name, type, placeholder) {
      const input = createElement("input", "bjdw-input");
      input.type = type;
      input.placeholder = placeholder;
      input.value = this.filters[name];
      input.setAttribute("aria-label", placeholder);
      input.addEventListener("input", (event) => this.updateFilter(name, event.target.value));
      return input;
    }
    renderRecordsSection() {
      this.els.content.querySelector(".bjdw-records-section")?.remove();
      if (!this.loaded) return;
      const section = createElement("section", "bjdw-section bjdw-records-section");
      section.append(createElement("h2", "bjdw-section-title", "\u5206\u7C7B\u67E5\u627E\u8BB0\u5F55"));
      const filters = createElement("div", "bjdw-filters");
      const modeOptions = [
        ["", "\u5168\u90E8\u7CBE\u786E\u6A21\u5F0F"],
        ...this.stats.modes.map((mode) => [mode.mode, mode.modeName])
      ];
      const categoryOptions = [
        ["", "\u5168\u90E8\u5927\u7C7B"],
        ...[...new Set(this.records.map((record) => record.category))].map((value) => [
          value,
          value
        ])
      ];
      filters.append(
        this.createSelect("mode", "\u7CBE\u786E\u6A21\u5F0F", modeOptions),
        this.createSelect("category", "\u6E38\u620F\u5927\u7C7B", categoryOptions),
        this.createSelect("result", "\u80DC\u8D1F\u7ED3\u679C", [
          ["", "\u5168\u90E8\u7ED3\u679C"],
          ["win", "\u80DC\u5229"],
          ["loss", "\u5931\u8D25"],
          ["unknown", "\u672A\u77E5\u7ED3\u679C"]
        ]),
        this.createInput("query", "search", "\u641C\u7D22 matchId / \u6A21\u5F0F"),
        this.createInput("from", "date", "\u5F00\u59CB\u65E5\u671F"),
        this.createInput("to", "date", "\u7ED3\u675F\u65E5\u671F")
      );
      const filtered = filterRecords(this.records, this.filters);
      section.append(
        filters,
        createElement(
          "p",
          "bjdw-result-count",
          `\u627E\u5230 ${filtered.length} \u6761\u8BB0\u5F55${filtered.length > DISPLAY_LIMIT ? `\uFF0C\u5F53\u524D\u663E\u793A\u524D ${DISPLAY_LIMIT} \u6761` : ""}`
        )
      );
      const list = createElement("div", "bjdw-record-list");
      for (const record of filtered.slice(0, DISPLAY_LIMIT)) {
        const button = createElement("button", "bjdw-record");
        button.type = "button";
        const head = createElement("div", "bjdw-record-head");
        const resultClass = record.win === true ? "bjdw-result-win" : record.win === false ? "bjdw-result-loss" : "bjdw-result-unknown";
        head.append(
          createElement("span", "bjdw-record-name", getModeName(record.type)),
          createElement("span", `bjdw-result ${resultClass}`, resultLabel(record.win))
        );
        button.append(
          head,
          createElement(
            "div",
            "bjdw-record-meta",
            `${formatDate(record.date)} \xB7 ${record.matchId || "\u65E0 matchId"}`
          )
        );
        button.addEventListener("click", () => this.openDetails(record));
        list.append(button);
      }
      if (filtered.length === 0) list.append(createElement("div", "bjdw-empty", "\u6CA1\u6709\u5339\u914D\u8BB0\u5F55\u3002"));
      section.append(list);
      this.els.content.append(section);
    }
    async openDetails(record) {
      this.detailController?.abort();
      const controller = new AbortController();
      this.detailController = controller;
      this.els.detail.classList.remove("bjdw-hidden");
      this.els.detailTitle.textContent = `${getModeName(record.type)} \xB7 ${resultLabel(record.win)}`;
      this.els.detailBody.replaceChildren(createElement("div", "bjdw-empty", "\u6B63\u5728\u8BFB\u53D6\u5BF9\u5C40\u8BE6\u60C5\u2026"));
      const key = `${record.matchId}::${record.date}`;
      try {
        let details = this.detailCache.get(key);
        if (!details) {
          details = await fetchMatchDetails(record, { signal: controller.signal });
          this.detailCache.set(key, details);
        }
        const pre = createElement("pre");
        pre.textContent = JSON.stringify(details, null, 2);
        this.els.detailBody.replaceChildren(pre);
      } catch (error) {
        if (error?.name !== "AbortError") {
          this.els.detailBody.replaceChildren(
            createElement("div", "bjdw-error", error?.message || "\u8BFB\u53D6\u8BE6\u60C5\u5931\u8D25\u3002")
          );
        }
      } finally {
        if (this.detailController === controller) this.detailController = null;
      }
    }
  };
  if (!document.getElementById(ROOT_ID)) {
    globalThis.__bjdWinsApp = new BjdWinsApp();
  }
})();
