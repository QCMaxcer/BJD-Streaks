import test from "node:test";
import assert from "node:assert/strict";
import {
  bindDesktopAccount,
  chooseAccountAfterUnbind,
  loadDesktopAccount,
  normalizeDesktopAccounts,
  selectDesktopAccount,
  unbindDesktopAccount,
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

test("loadDesktopAccount returns a normal binding-required state for an empty list", async () => {
  const cacheEvents = [];
  const result = await loadDesktopAccount({
    cacheStore: createMemoryStore(),
    onCache: (payload) => cacheEvents.push(payload),
    post: async () => ({ data: [] }),
  });

  assert.deepEqual(result, {
    accounts: [],
    account: null,
    selectedAccount: null,
    cache: null,
    playerInfoSource: "unavailable",
    bindingRequired: true,
  });
  assert.deepEqual(cacheEvents, [result]);
});

test("bindDesktopAccount trims the code and verifies the new account through binding list", async () => {
  const requests = [];
  const responses = [
    { data: [{ name: "Steve", uuid: "uuid-a" }] },
    { data: { playerName: "Alex", uuid: "uuid-b" } },
    { data: [{ name: "Steve", uuid: "uuid-a" }, { name: "Alex", uuid: "uuid-b" }] },
  ];
  const result = await bindDesktopAccount({
    bindCode: "  temporary-code  ",
    post: async (path, body) => {
      requests.push([path, body]);
      return responses.shift();
    },
  });

  assert.deepEqual(requests, [
    ["/binding/list", undefined],
    ["/binding/bind", { bindCode: "temporary-code" }],
    ["/binding/list", undefined],
  ]);
  assert.equal(result.selectedAccount.uuid, "uuid-b");
});

test("unbindDesktopAccount validates the uuid and verifies removal without touching cache", async () => {
  const requests = [];
  const responses = [
    { data: [{ name: "Steve", uuid: "uuid-a" }, { name: "Alex", uuid: "uuid-b" }] },
    { code: 200 },
    { data: [{ name: "Alex", uuid: "uuid-b" }] },
  ];
  const result = await unbindDesktopAccount({
    uuid: "uuid-a",
    post: async (path, body) => {
      requests.push([path, body]);
      return responses.shift();
    },
  });

  assert.deepEqual(requests, [
    ["/binding/list", undefined],
    ["/binding/unbind", { UUID: "uuid-a" }],
    ["/binding/list", undefined],
  ]);
  assert.deepEqual(result.accounts, [{ name: "Alex", uuid: "uuid-b" }]);
  assert.equal(result.bindingRequired, false);
});

test("unbindDesktopAccount rejects an uuid outside the current login bindings", async () => {
  await assert.rejects(
    unbindDesktopAccount({
      uuid: "uuid-b",
      post: async () => ({ data: [{ name: "Steve", uuid: "uuid-a" }] }),
    }),
    /不属于当前登录账号/,
  );
});

test("chooseAccountAfterUnbind keeps current, selects first replacement, or returns null", () => {
  const accounts = [{ uuid: "uuid-a" }, { uuid: "uuid-b" }];
  assert.equal(chooseAccountAfterUnbind({
    accounts,
    currentUuid: "uuid-a",
    unboundUuid: "uuid-b",
  }).uuid, "uuid-a");
  assert.equal(chooseAccountAfterUnbind({
    accounts: [{ uuid: "uuid-b" }],
    currentUuid: "uuid-a",
    unboundUuid: "uuid-a",
  }).uuid, "uuid-b");
  assert.equal(chooseAccountAfterUnbind({
    accounts: [],
    currentUuid: "uuid-a",
    unboundUuid: "uuid-a",
  }), null);
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
