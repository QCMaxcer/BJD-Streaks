import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cacheRecordKeys, createCacheStore, safeCacheName } from "../src/desktop/cache.js";

const record = (matchId, date) => ({
  matchId,
  date,
  type: "bw8",
  win: true,
});

async function withTempStore(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bjd-cache-"));
  try {
    return await fn(createCacheStore(dir));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("safeCacheName keeps cache filenames local and stable", () => {
  assert.equal(safeCacheName("abc-123.def"), "abc-123.def");
  assert.equal(safeCacheName("../token:uuid"), ".._token_uuid");
});

test("cache store writes and reads records", async () => {
  await withTempStore(async (store) => {
    await store.write({
      uuid: "uuid",
      playerName: "Steve",
      records: [record("1", "2026-01-01T12:00:00")],
      fetchedAt: "2026-06-13T00:00:00.000Z",
    });

    const cache = await store.read("uuid");
    assert.equal(cache.version, 1);
    assert.equal(cache.uuid, "uuid");
    assert.equal(cache.playerName, "Steve");
    assert.equal(cache.records.length, 1);
  });
});

test("cache store preserves player info while replacing records", async () => {
  await withTempStore(async (store) => {
    const playerInfo = { name: "Steve", guildName: "Builders" };
    await store.updatePlayerInfo({
      uuid: "uuid",
      playerName: "Steve",
      playerInfo,
      playerInfoFetchedAt: "2026-06-13T00:00:00.000Z",
    });

    const cache = await store.write({
      uuid: "uuid",
      playerName: "Steve",
      records: [record("1", "2026-01-01T12:00:00")],
    });

    assert.deepEqual(cache.playerInfo, playerInfo);
    assert.equal(cache.playerInfoFetchedAt, "2026-06-13T00:00:00.000Z");
  });
});

test("clearing records preserves player info", async () => {
  await withTempStore(async (store) => {
    const playerInfo = { name: "Steve", guildName: "Builders" };
    await store.write({
      uuid: "uuid",
      records: [record("1", "2026-01-01T12:00:00")],
      playerInfo,
    });

    const cache = await store.clearRecords("uuid");
    assert.equal(cache.records.length, 0);
    assert.deepEqual(cache.playerInfo, playerInfo);
  });
});

test("cache records remain readable after creating a new store instance", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bjd-cache-persist-"));
  try {
    await createCacheStore(dir).write({
      uuid: "uuid",
      records: [record("1", "2026-01-01T12:00:00")],
    });

    const reopened = await createCacheStore(dir).read("uuid");
    assert.equal(reopened.records.length, 1);
    assert.equal(reopened.records[0].matchId, "1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cacheRecordKeys uses matchId and date", () => {
  const keys = cacheRecordKeys({
    records: [
      record("1", "2026-01-01T12:00:00"),
      record("1", "2026-01-02T12:00:00"),
    ],
  });

  assert.equal(keys.has("1::2026-01-01T12:00:00"), true);
  assert.equal(keys.has("1::2026-01-02T12:00:00"), true);
});

test("mergeAndWrite dedupes and sorts newest first", async () => {
  await withTempStore(async (store) => {
    await store.write({
      uuid: "uuid",
      records: [
        record("1", "2026-01-01T12:00:00"),
        record("2", "2026-01-02T12:00:00"),
      ],
    });
    const cache = await store.mergeAndWrite({
      uuid: "uuid",
      records: [
        record("2", "2026-01-02T12:00:00"),
        record("3", "2026-01-03T12:00:00"),
      ],
    });

    assert.deepEqual(
      cache.records.map((entry) => entry.matchId),
      ["3", "2", "1"],
    );
  });
});

test("cache store can read cached record keys", async () => {
  await withTempStore(async (store) => {
    await store.write({
      uuid: "uuid",
      records: [record("1", "2026-01-01T12:00:00")],
    });

    assert.deepEqual(await store.readKeys("uuid"), ["1::2026-01-01T12:00:00"]);
  });
});

test("cache store migrates records from a legacy cache directory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "bjd-cache-migration-"));
  const legacy = createCacheStore(path.join(root, "cache"));
  const current = createCacheStore(path.join(root, "records-cache"), {
    legacyDirs: [path.join(root, "cache")],
  });

  try {
    await legacy.write({
      uuid: "uuid",
      playerName: "Steve",
      records: [record("1", "2026-01-01T12:00:00")],
      fetchedAt: "2026-06-13T00:00:00.000Z",
    });

    const migrated = await current.read("uuid");
    assert.equal(migrated.records.length, 1);
    assert.equal(migrated.fetchedAt, "2026-06-13T00:00:00.000Z");

    await legacy.clear("uuid");
    assert.equal((await current.read("uuid")).records.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
