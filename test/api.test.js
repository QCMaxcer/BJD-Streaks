import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, fetchAllRecords, isRateLimitError, wait } from "../src/api.js";

const item = (matchId, date = `2026-01-${matchId.padStart(2, "0")}`) => ({
  matchId,
  date,
  type: "bw8",
  win: true,
});

test("fetchAllRecords reads pages until an empty page", async () => {
  const pages = {
    1: { code: 200, data: { data: { data: [item("1"), item("2")] } } },
    2: { code: 200, data: { data: { data: [item("3")] } } },
    3: { code: 200, data: { data: { data: [] } } },
  };
  const calls = [];
  const progress = [];
  const result = await fetchAllRecords({
    uuid: "uuid",
    pageDelayMs: 0,
    post: async (path, body) => {
      calls.push([path, body]);
      return pages[body.page];
    },
    onProgress: (event) => progress.push(event),
  });

  assert.equal(result.records.length, 3);
  assert.equal(result.pagesFetched, 3);
  assert.equal(result.stoppedBy, "empty");
  assert.deepEqual(
    calls.map((call) => call[1].page),
    [1, 2, 3],
  );
  assert.ok(progress.some((event) => event.phase === "received" && event.count === 3));
});

test("fetchAllRecords stops after consecutive duplicate-only pages", async () => {
  const repeated = { code: 200, data: { data: { data: [item("1")] } } };
  const result = await fetchAllRecords({
    uuid: "uuid",
    duplicatePageLimit: 2,
    pageDelayMs: 0,
    post: async () => repeated,
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.pagesFetched, 3);
  assert.equal(result.stoppedBy, "duplicates");
});

test("fetchAllRecords obeys maxPages", async () => {
  const result = await fetchAllRecords({
    uuid: "uuid",
    maxPages: 2,
    pageDelayMs: 0,
    post: async (_path, body) => ({
      code: 200,
      data: { data: { data: [item(String(body.page))] } },
    }),
  });
  assert.equal(result.records.length, 2);
  assert.equal(result.stoppedBy, "limit");
});

test("fetchAllRecords stops before requesting when cancelled", async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await assert.rejects(
    fetchAllRecords({
      uuid: "uuid",
      signal: controller.signal,
      pageDelayMs: 0,
      post: async () => {
        called = true;
        return {};
      },
    }),
    { name: "AbortError" },
  );
  assert.equal(called, false);
});

test("isRateLimitError recognizes server messages and status codes", () => {
  assert.equal(isRateLimitError(new ApiError("请勿频繁请求", 200)), true);
  assert.equal(isRateLimitError(new ApiError("Too Many Requests", 429)), true);
  assert.equal(isRateLimitError(new ApiError("普通错误", 500)), false);
});

test("fetchAllRecords throttles between successful pages", async () => {
  const waits = [];
  const result = await fetchAllRecords({
    uuid: "uuid",
    maxPages: 2,
    pageDelayMs: 1500,
    sleep: async (ms) => waits.push(ms),
    post: async (_path, body) => ({
      code: 200,
      data: { data: { data: [item(String(body.page))] } },
    }),
  });
  assert.equal(result.records.length, 2);
  assert.deepEqual(waits, [1500]);
});

test("fetchAllRecords retries the same page with exponential backoff", async () => {
  const waits = [];
  const pages = [];
  const progress = [];
  let failures = 0;
  const result = await fetchAllRecords({
    uuid: "uuid",
    maxPages: 1,
    pageDelayMs: 0,
    rateLimitBaseDelayMs: 5000,
    sleep: async (ms) => waits.push(ms),
    onProgress: (event) => progress.push(event),
    post: async (_path, body) => {
      pages.push(body.page);
      if (failures < 2) {
        failures += 1;
        throw new ApiError("请勿频繁请求", 200);
      }
      return { code: 200, data: { data: { data: [item("1")] } } };
    },
  });

  assert.equal(result.records.length, 1);
  assert.deepEqual(pages, [1, 1, 1]);
  assert.deepEqual(waits, [5000, 10000]);
  assert.deepEqual(
    progress.filter((event) => event.phase === "rate-limit").map((event) => event.attempt),
    [1, 2],
  );
});

test("wait can be cancelled during a delay", async () => {
  const controller = new AbortController();
  const promise = wait(10000, controller.signal);
  controller.abort();
  await assert.rejects(promise, { name: "AbortError" });
});

test("fetchAllRecords keeps records on or after the cutoff date and stops after passing it", async () => {
  const calls = [];
  const pages = {
    1: {
      code: 200,
      data: {
        data: {
          data: [
            item("1", "2026-06-13T18:00:00"),
            item("2", "2026-06-12T22:00:00"),
          ],
        },
      },
    },
    2: {
      code: 200,
      data: {
        data: {
          data: [
            item("3", "2026-06-12T08:00:00"),
            item("4", "2026-06-11T23:59:00"),
          ],
        },
      },
    },
    3: { code: 200, data: { data: { data: [item("5", "2026-06-10T12:00:00")] } } },
  };

  const result = await fetchAllRecords({
    uuid: "uuid",
    cutoffDate: "2026-06-12",
    pageDelayMs: 0,
    post: async (_path, body) => {
      calls.push(body.page);
      return pages[body.page];
    },
  });

  assert.deepEqual(calls, [1, 2]);
  assert.deepEqual(
    result.records.map((entry) => entry.matchId),
    ["1", "2", "3"],
  );
  assert.equal(result.scannedCount, 4);
  assert.equal(result.stoppedBy, "cutoff-date-passed");
});

test("cutoff scanning does not treat newer nonmatching pages as duplicate pages", async () => {
  const calls = [];
  const pages = {
    1: { code: 200, data: { data: { data: [item("1", "2026-06-15T12:00:00")] } } },
    2: { code: 200, data: { data: { data: [item("2", "2026-06-14T12:00:00")] } } },
    3: {
      code: 200,
      data: {
        data: {
          data: [
            item("3", "2026-06-12T12:00:00"),
            item("4", "2026-06-11T12:00:00"),
          ],
        },
      },
    },
  };

  const result = await fetchAllRecords({
    uuid: "uuid",
    cutoffDate: "2026-06-12",
    duplicatePageLimit: 2,
    pageDelayMs: 0,
    post: async (_path, body) => {
      calls.push(body.page);
      return pages[body.page];
    },
  });

  assert.deepEqual(calls, [1, 2, 3]);
  assert.deepEqual(result.records.map((entry) => entry.matchId), ["1", "2", "3"]);
  assert.equal(result.stoppedBy, "cutoff-date-passed");
});

test("a future cutoff date stops after the first older page", async () => {
  let calls = 0;
  const result = await fetchAllRecords({
    uuid: "uuid",
    cutoffDate: "2027-01-01",
    pageDelayMs: 0,
    post: async () => {
      calls += 1;
      return { code: 200, data: { data: { data: [item("1", "2026-06-12T12:00:00")] } } };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.records.length, 0);
  assert.equal(result.stoppedBy, "cutoff-date-passed");
});
