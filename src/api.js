import {
  dedupeRecords,
  extractArray,
  getLocalDateKey,
  recordKey,
  unwrapData,
} from "./core.js";

const API_ROOT = "/api/api";

export class ApiError extends Error {
  constructor(message, status = null, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function getToken() {
  return localStorage.getItem("token");
}

export function isRateLimitError(error) {
  return (
    error?.status === 429 ||
    error?.payload?.code === 429 ||
    /频繁|too many requests|rate.?limit/i.test(String(error?.message ?? ""))
  );
}

export function wait(ms, signal) {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(new DOMException("操作已取消", "AbortError"));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);

    function done() {
      signal?.removeEventListener("abort", abort);
      resolve();
    }

    function abort() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("操作已取消", "AbortError"));
    }

    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function apiPost(path, body = {}, { signal } = {}) {
  const token = getToken();
  if (!token) throw new ApiError("登录状态已失效，请重新登录布吉岛用户中心。", 401);

  const response = await fetch(`${API_ROOT}${path}`, {
    method: "POST",
    credentials: "include",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(`接口返回了无法解析的数据（HTTP ${response.status}）。`, response.status);
  }

  if (!response.ok || (payload?.code != null && payload.code !== 200)) {
    throw new ApiError(
      payload?.message || `请求失败（HTTP ${response.status}）。`,
      response.status,
      payload,
    );
  }

  return payload;
}

export async function fetchBindings(options) {
  return extractArray(await apiPost("/binding/list", {}, options));
}

export async function fetchMatchDetails(record, options) {
  const payload = await apiPost(
    "/stats/match",
    { id: record.matchId, date: record.date },
    options,
  );
  return unwrapData(payload);
}

export async function fetchAllRecords({
  uuid,
  signal,
  onProgress = () => {},
  post = apiPost,
  maxPages = 1000,
  duplicatePageLimit = 2,
  pageDelayMs = 1500,
  rateLimitBaseDelayMs = 5000,
  maxRateLimitRetries = 5,
  sleep = wait,
  cutoffDate = "",
}) {
  const records = [];
  const seen = new Set();
  let duplicatePages = 0;
  let page = 1;
  let rateLimitRetries = 0;
  let scannedCount = 0;

  while (page <= maxPages) {
    if (signal?.aborted) throw new DOMException("操作已取消", "AbortError");
    if (page > 1 && rateLimitRetries === 0) {
      onProgress({
        phase: "delay",
        page,
        count: records.length,
        scannedCount,
        waitMs: pageDelayMs,
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
      const waitMs = Math.min(rateLimitBaseDelayMs * 2 ** (rateLimitRetries - 1), 60000);
      onProgress({
        phase: "rate-limit",
        page,
        count: records.length,
        scannedCount,
        waitMs,
        attempt: rateLimitRetries,
        maxAttempts: maxRateLimitRetries,
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
        stoppedBy: "empty",
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
      scannedAdded,
    });

    const pageDateKeys = pageRecords
      .map((record) => getLocalDateKey(record?.date))
      .filter(Boolean);
    if (cutoffDate && pageDateKeys.some((dateKey) => dateKey < cutoffDate)) {
      return {
        records: dedupeRecords(records),
        pagesFetched: page,
        scannedCount,
        stoppedBy: "cutoff-date-passed",
      };
    }

    if (duplicatePages >= duplicatePageLimit) {
      return {
        records: dedupeRecords(records),
        pagesFetched: page,
        scannedCount,
        stoppedBy: "duplicates",
      };
    }
    page += 1;
  }

  return {
    records: dedupeRecords(records),
    pagesFetched: maxPages,
    scannedCount,
    stoppedBy: "limit",
  };
}
