import { isRateLimitError, wait } from "../api.js";
import { recordKey } from "../core.js";
import { normalizeMatchDetail } from "../match-detail.js";

function abortError() {
  return new DOMException("操作已取消", "AbortError");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function isRetriableServerError(error) {
  return Number(error?.status) >= 500 && Number(error?.status) < 600;
}

function isRetriableNetworkError(error) {
  return error instanceof TypeError || (
    error?.status == null &&
    error?.name !== "AbortError" &&
    !isRateLimitError(error)
  );
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  return Math.max(1, Math.floor(positiveNumber(value, fallback)));
}

export function extractEmbeddedMatchDetail(record) {
  return normalizeMatchDetail(record, record).players.length > 0 ? record : null;
}

export function createInFlightRequestRegistry() {
  const requests = new Map();
  return {
    run(key, operation) {
      if (requests.has(key)) return requests.get(key);
      const promise = Promise.resolve(operation())
        .finally(() => {
          if (requests.get(key) === promise) requests.delete(key);
        });
      requests.set(key, promise);
      return promise;
    },
    size() {
      return requests.size;
    },
  };
}

export async function runMatchDetailPrefetch({
  records = [],
  cachedDetails = {},
  mode = "adaptive",
  pageDelayMs = 100,
  signal,
  fetchDetail,
  flushBatch,
  onProgress = () => {},
  sleep = wait,
  now = Date.now,
  batchSize = 50,
  batchIntervalMs = 2000,
  initialConcurrency = 2,
  maxConcurrency = 4,
  initialRequestsPerSecond = 5,
  maxRequestsPerSecond = 10,
  successRateStep = 25,
  successConcurrencyStep = 75,
  rateLimitBaseDelayMs = 5000,
  maxRateLimitRetries = 5,
  maxNetworkRetries = 3,
} = {}) {
  if (typeof fetchDetail !== "function") throw new TypeError("fetchDetail 必须是函数。");
  if (typeof flushBatch !== "function") throw new TypeError("flushBatch 必须是函数。");

  const conservative = mode === "conservative";
  const maximumConcurrency = conservative ? 1 : positiveInteger(maxConcurrency, 4);
  let concurrency = conservative ? 1 : Math.min(positiveInteger(initialConcurrency, 2), maximumConcurrency);
  const maximumRequestsPerSecond = conservative
    ? Math.max(1 / 60, 1000 / positiveNumber(pageDelayMs, 100))
    : positiveNumber(maxRequestsPerSecond, 10);
  let requestsPerSecond = conservative
    ? maximumRequestsPerSecond
    : Math.min(positiveNumber(initialRequestsPerSecond, 5), maximumRequestsPerSecond);

  const pending = [];
  let cached = 0;
  let embedded = 0;
  for (const record of records) {
    if (cachedDetails?.[recordKey(record)]) {
      cached += 1;
      continue;
    }
    const raw = extractEmbeddedMatchDetail(record);
    if (raw) {
      pending.push({ record, raw, embedded: true });
      embedded += 1;
    } else {
      pending.push({ record, raw: null, embedded: false });
    }
  }
  const targets = pending.filter((entry) => !entry.embedded);
  const total = pending.length;
  const startedAt = now();
  let completed = embedded;
  let requested = 0;
  let retryCount = 0;
  let consecutiveSuccesses = 0;
  let nextIndex = 0;
  let nextStartAt = 0;
  let pauseUntil = 0;
  let fatalError = null;
  let rateSlotQueue = Promise.resolve();
  let batch = pending
    .filter((entry) => entry.embedded)
    .map(({ record, raw }) => ({ record, raw, fetchedAt: new Date().toISOString() }));
  let batchTimer = null;
  let batchError = null;
  let flushPromise = Promise.resolve();
  const capacityWaiters = new Set();

  const metrics = (phase, extra = {}) => ({
    phase,
    cached,
    embedded,
    missing: targets.length,
    completed,
    total,
    requested,
    retryCount,
    requestsPerSecond,
    concurrency,
    estimatedRemainingMs: Math.ceil(
      Math.max(0, targets.length - requested) / Math.max(1 / 60, requestsPerSecond) * 1000,
    ),
    elapsedMs: Math.max(0, now() - startedAt),
    ...extra,
  });
  const emit = (phase, extra) => onProgress(metrics(phase, extra));
  const wakeCapacityWaiters = () => {
    for (const resolve of capacityWaiters) resolve();
    capacityWaiters.clear();
  };
  const waitForCapacity = async (workerIndex) => {
    while (!fatalError && workerIndex >= concurrency && nextIndex < targets.length) {
      throwIfAborted(signal);
      await new Promise((resolve) => capacityWaiters.add(resolve));
    }
  };
  const flushPending = async () => {
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }
    if (!batch.length) return flushPromise;
    const details = batch;
    batch = [];
    flushPromise = flushPromise.then(() => flushBatch(details));
    await flushPromise;
  };
  const scheduleBatchFlush = () => {
    if (batchTimer || batchIntervalMs <= 0) return;
    batchTimer = setTimeout(() => {
      batchTimer = null;
      flushPending().catch((error) => {
        batchError = error;
      });
    }, batchIntervalMs);
  };
  const addToBatch = async (detail) => {
    if (batchError) throw batchError;
    batch.push(detail);
    if (batch.length >= batchSize) await flushPending();
    else scheduleBatchFlush();
  };
  const waitForRateSlot = () => {
    const slot = rateSlotQueue.catch(() => {}).then(async () => {
      throwIfAborted(signal);
      const current = now();
      const waitMs = Math.max(0, pauseUntil - current, nextStartAt - current);
      if (waitMs > 0) await sleep(waitMs, signal);
      throwIfAborted(signal);
      nextStartAt = Math.max(nextStartAt, now()) + (1000 / requestsPerSecond);
    });
    rateSlotQueue = slot;
    return slot;
  };
  const fetchWithRetry = async (record) => {
    let rateLimitAttempts = 0;
    let networkAttempts = 0;
    while (true) {
      await waitForRateSlot();
      emit("fetch", { matchId: record.matchId });
      try {
        const raw = await fetchDetail(record, { signal });
        consecutiveSuccesses += 1;
        if (!conservative && consecutiveSuccesses % successRateStep === 0) {
          requestsPerSecond = Math.min(maximumRequestsPerSecond, requestsPerSecond + 1);
        }
        if (!conservative && consecutiveSuccesses % successConcurrencyStep === 0) {
          concurrency = Math.min(maximumConcurrency, concurrency + 1);
          wakeCapacityWaiters();
        }
        return raw;
      } catch (error) {
        throwIfAborted(signal);
        if (isRateLimitError(error) && rateLimitAttempts < maxRateLimitRetries) {
          rateLimitAttempts += 1;
          retryCount += 1;
          consecutiveSuccesses = 0;
          if (!conservative) {
            requestsPerSecond = Math.max(0.5, requestsPerSecond / 2);
            concurrency = Math.max(1, concurrency - 1);
          }
          const waitMs = Math.min(rateLimitBaseDelayMs * 2 ** (rateLimitAttempts - 1), 60000);
          pauseUntil = Math.max(pauseUntil, now() + waitMs);
          emit("rate-limit", { matchId: record.matchId, waitMs, attempt: rateLimitAttempts });
          await sleep(waitMs, signal);
          continue;
        }
        if (
          (isRetriableServerError(error) || isRetriableNetworkError(error)) &&
          networkAttempts < maxNetworkRetries
        ) {
          networkAttempts += 1;
          retryCount += 1;
          const waitMs = Math.min(1000 * 2 ** (networkAttempts - 1), 10000);
          emit("retry", { matchId: record.matchId, waitMs, attempt: networkAttempts });
          await sleep(waitMs, signal);
          continue;
        }
        throw error;
      }
    }
  };
  const worker = async (workerIndex) => {
    try {
      while (true) {
        throwIfAborted(signal);
        if (fatalError || nextIndex >= targets.length) return;
        await waitForCapacity(workerIndex);
        if (fatalError || nextIndex >= targets.length) return;
        const target = targets[nextIndex];
        nextIndex += 1;
        if (nextIndex >= targets.length) wakeCapacityWaiters();

        const raw = await fetchWithRetry(target.record);
        requested += 1;
        completed += 1;
        await addToBatch({
          record: target.record,
          raw,
          fetchedAt: new Date().toISOString(),
        });
        emit("received", { matchId: target.record.matchId });
      }
    } catch (error) {
      fatalError ??= error;
      wakeCapacityWaiters();
      throw error;
    }
  };

  emit("start");
  try {
    if (batch.length >= batchSize) await flushPending();
    else if (batch.length) scheduleBatchFlush();
    const results = await Promise.allSettled(
      Array.from({ length: maximumConcurrency }, (_, index) => worker(index)),
    );
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected) throw rejected.reason;
    await flushPending();
    if (batchError) throw batchError;
    emit("done");
    return {
      cached,
      embedded,
      missing: targets.length,
      completed,
      total,
      requested,
      retryCount,
      requestsPerSecond,
      concurrency,
    };
  } finally {
    wakeCapacityWaiters();
    await flushPending();
  }
}
