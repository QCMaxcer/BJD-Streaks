import test from "node:test";
import assert from "node:assert/strict";
import {
  loadDesktopAccount,
  normalizeDesktopAccounts,
  selectDesktopAccount,
} from "../src/desktop/account.js";

function createMemoryStore(cached = null) {
  const values = cached instanceof Map ? cached : new Map([["uuid", cached]]);
  return {
    read: async (uuid) => values.get(uuid) ?? null,
    updatePlayerInfo: async ({ uuid, playerName, playerInfo }) => {
      const value = values.get(uuid) ?? {};
      values.set(uuid, { ...value, uuid, playerName, playerInfo, records: value?.records ?? [] });
      return values.get(uuid);
    },
  };
}

test("normalizeDesktopAccounts returns unique usable bindings", () => {
  assert.deepEqual(normalizeDesktopAccounts({
    data: [
      { name: "Steve", uuid: "uuid-a" },
      { name: "Duplicate", uuid: "uuid-a" },
      { name: "NoUuid" },
      { uuid: "uuid-b" },
    ],
  }), [
    { name: "Steve", uuid: "uuid-a" },
    { name: "uuid-b", uuid: "uuid-b" },
  ]);
});

test("selectDesktopAccount rejects uuids outside the current login bindings", () => {
  assert.throws(
    () => selectDesktopAccount({ data: [{ name: "Steve", uuid: "uuid-a" }] }, "uuid-b"),
    /不属于当前登录账号/,
  );
});

test("loadDesktopAccount uses the first binding and refreshes player info", async () => {
  const requests = [];
  const cacheEvents = [];
  const result = await loadDesktopAccount({
    cacheStore: createMemoryStore({ records: [{ matchId: "1" }] }),
    onCache: (payload) => cacheEvents.push(payload),
    post: async (path, body) => {
      requests.push([path, body]);
      if (path === "/binding/list") {
        return { data: [{ name: "Steve", uuid: "uuid" }, { name: "Alex", uuid: "uuid-2" }] };
      }
      return { data: { data: { data: { guild_name: "Builders", bjdxp_level: 10 } } } };
    },
  });

  assert.deepEqual(requests, [
    ["/binding/list", undefined],
    ["/player/info", { uuid: "uuid" }],
  ]);
  assert.equal(cacheEvents.length, 1);
  assert.equal(result.accounts.length, 2);
  assert.equal(result.selectedAccount.uuid, "uuid");
  assert.equal(result.playerInfoSource, "online");
  assert.equal(result.cache.playerInfo.guildName, "Builders");
});

test("loadDesktopAccount can select a specific bound uuid", async () => {
  const requests = [];
  const caches = new Map([
    ["uuid-a", { records: [{ matchId: "a" }] }],
    ["uuid-b", { records: [{ matchId: "b" }] }],
  ]);
  const result = await loadDesktopAccount({
    uuid: "uuid-b",
    cacheStore: createMemoryStore(caches),
    post: async (path, body) => {
      requests.push([path, body]);
      if (path === "/binding/list") {
        return { data: [{ name: "Steve", uuid: "uuid-a" }, { name: "Alex", uuid: "uuid-b" }] };
      }
      return { data: { data: { data: { guild_name: "Switchers" } } } };
    },
  });

  assert.deepEqual(requests, [
    ["/binding/list", undefined],
    ["/player/info", { uuid: "uuid-b" }],
  ]);
  assert.equal(result.selectedAccount.name, "Alex");
  assert.equal(result.cache.records[0].matchId, "b");
  assert.equal(result.cache.playerInfo.guildName, "Switchers");
});

test("loadDesktopAccount returns cached player info when online refresh fails", async () => {
  const cached = {
    records: [{ matchId: "1" }],
    playerInfo: { name: "Steve", guildName: "Cached Guild" },
  };
  const result = await loadDesktopAccount({
    cacheStore: createMemoryStore(cached),
    post: async (path) => {
      if (path === "/binding/list") return { data: [{ name: "Steve", uuid: "uuid" }] };
      throw new Error("network unavailable");
    },
  });

  assert.equal(result.playerInfoSource, "cache");
  assert.equal(result.cache.playerInfo.guildName, "Cached Guild");
  assert.equal(result.profileError, "network unavailable");
});
