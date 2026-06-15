import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../src/api.js";
import {
  createInFlightRequestRegistry,
  extractEmbeddedMatchDetail,
  runMatchDetailPrefetch,
} from "../src/desktop/match-detail-scheduler.js";

const record = (matchId, extra = {}) => ({
  matchId,
  date: `2026-06-${String(matchId).padStart(2, "0")}T12:00:00`,
  type: "bw16",
  win: true,
  ...extra,
});

test("extractEmbeddedMatchDetail only accepts list records that already contain player or team details", () => {
  assert.equal(extractEmbeddedMatchDetail(record("1")), null);
  const embedded = record("2", {
    teams: {
      red: [{ player_name: "Steve", kill: 2 }],
    },
  });
  assert.equal(extractEmbeddedMatchDetail(embedded), embedded);
});

test("in-flight registry reuses the same detail request", async () => {
  const registry = createInFlightRequestRegistry();
  let calls = 0;
  let resolveRequest;
  const request = () => {
    calls += 1;
    return new Promise((resolve) => {
      resolveRequest = resolve;
    });
  };

  const first = registry.run("uuid::match", request);
  const second = registry.run("uuid::match", request);
  assert.equal(first, second);
  assert.equal(calls, 1);

  resolveRequest({ ok: true });
  assert.deepEqual(await first, { ok: true });
  assert.equal(registry.size(), 0);
});

test("prefetch skips cached and embedded details and flushes fetched details in batches", async () => {
  const records = [
    record("1"),
    record("2", { players: [{ player_name: "Alex" }] }),
    record("3"),
    record("4"),
  ];
  const cachedDetails = {
    [`${records[0].matchId}::${records[0].date}`]: { raw: { cached: true } },
  };
  const requested = [];
  const batches = [];

  const result = await runMatchDetailPrefetch({
    records,
    cachedDetails,
    batchSize: 2,
    mode: "adaptive",
    fetchDetail: async (entry) => {
      requested.push(entry.matchId);
      return { matchId: entry.matchId, players: [] };
    },
    flushBatch: async (details) => batches.push(details),
    sleep: async () => {},
  });

  assert.deepEqual(requested.sort(), ["3", "4"]);
  assert.equal(result.cached, 1);
  assert.equal(result.embedded, 1);
  assert.equal(result.completed, 3);
  assert.equal(result.requested, 2);
  assert.equal(batches.length, 2);
  assert.deepEqual(
    batches.flat().map((entry) => entry.record.matchId).sort(),
    ["2", "3", "4"],
  );
});

test("adaptive prefetch respects concurrency and reports scheduling metrics", async () => {
  const records = [record("1"), record("2"), record("3"), record("4")];
  let active = 0;
  let maximumActive = 0;
  const releases = [];
  const progress = [];

  const promise = runMatchDetailPrefetch({
    records,
    mode: "adaptive",
    initialConcurrency: 2,
    maxConcurrency: 2,
    initialRequestsPerSecond: 1000,
    maxRequestsPerSecond: 1000,
    fetchDetail: async (entry) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => releases.push(resolve));
      active -= 1;
      return { matchId: entry.matchId };
    },
    flushBatch: async () => {},
    onProgress: (event) => progress.push(event),
    sleep: async () => {},
  });

  while (releases.length < 2) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(maximumActive, 2);
  releases.splice(0).forEach((release) => release());
  while (releases.length < 2) await new Promise((resolve) => setImmediate(resolve));
  releases.splice(0).forEach((release) => release());
  await promise;

  assert.equal(maximumActive, 2);
  assert.ok(progress.some((event) => (
    event.requestsPerSecond === 1000 &&
    event.concurrency === 2 &&
    Number.isFinite(event.estimatedRemainingMs)
  )));
});

test("adaptive prefetch backs off and reduces speed after a rate limit response", async () => {
  const waits = [];
  const progress = [];
  let attempts = 0;

  const result = await runMatchDetailPrefetch({
    records: [record("1")],
    mode: "adaptive",
    initialConcurrency: 2,
    initialRequestsPerSecond: 8,
    rateLimitBaseDelayMs: 5000,
    fetchDetail: async () => {
      attempts += 1;
      if (attempts === 1) throw new ApiError("请勿频繁请求", 200);
      return { ok: true };
    },
    flushBatch: async () => {},
    onProgress: (event) => progress.push(event),
    sleep: async (ms) => waits.push(ms),
  });

  assert.equal(result.completed, 1);
  assert.equal(result.retryCount, 1);
  assert.ok(waits.includes(5000));
  assert.ok(progress.some((event) => (
    event.phase === "rate-limit" &&
    event.requestsPerSecond === 4 &&
    event.concurrency === 1
  )));
});

test("adaptive prefetch retries transient network errors", async () => {
  const waits = [];
  let attempts = 0;

  const result = await runMatchDetailPrefetch({
    records: [record("1")],
    fetchDetail: async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("fetch failed");
      return { ok: true };
    },
    flushBatch: async () => {},
    sleep: async (ms) => waits.push(ms),
  });

  assert.equal(result.completed, 1);
  assert.equal(result.retryCount, 1);
  assert.equal(waits[0], 1000);
});

test("cancelled prefetch flushes completed details before rejecting", async () => {
  const controller = new AbortController();
  const batches = [];
  let calls = 0;

  await assert.rejects(
    runMatchDetailPrefetch({
      records: [record("1"), record("2")],
      mode: "conservative",
      batchIntervalMs: 60000,
      signal: controller.signal,
      fetchDetail: async (entry) => {
        calls += 1;
        if (entry.matchId === "2") {
          controller.abort();
          throw new DOMException("操作已取消", "AbortError");
        }
        return { matchId: entry.matchId };
      },
      flushBatch: async (details) => batches.push(details),
      sleep: async () => {},
    }),
    { name: "AbortError" },
  );

  assert.equal(calls, 2);
  assert.deepEqual(batches.flat().map((entry) => entry.record.matchId), ["1"]);
});

test("conservative prefetch keeps one worker and honors the configured delay", async () => {
  const progress = [];
  let attempts = 0;

  await runMatchDetailPrefetch({
    records: [record("1")],
    mode: "conservative",
    pageDelayMs: 10000,
    rateLimitBaseDelayMs: 0,
    fetchDetail: async () => {
      attempts += 1;
      if (attempts === 1) throw new ApiError("请勿频繁请求", 200);
      return { ok: true };
    },
    flushBatch: async () => {},
    onProgress: (event) => progress.push(event),
    sleep: async () => {},
  });

  assert.ok(progress.every((event) => event.concurrency === 1));
  assert.ok(progress.every((event) => event.requestsPerSecond === 0.1));
});
