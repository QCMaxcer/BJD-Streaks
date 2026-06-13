import test from "node:test";
import assert from "node:assert/strict";
import { loadDesktopAccount } from "../src/desktop/account.js";

function createMemoryStore(cached = null) {
  let value = cached;
  return {
    read: async () => value,
    updatePlayerInfo: async ({ uuid, playerName, playerInfo }) => {
      value = { ...(value ?? {}), uuid, playerName, playerInfo, records: value?.records ?? [] };
      return value;
    },
  };
}

test("loadDesktopAccount uses the first binding and refreshes player info", async () => {
  const requests = [];
  const cacheEvents = [];
  const result = await loadDesktopAccount({
    cacheStore: createMemoryStore({ records: [{ matchId: "1" }] }),
    onCache: (payload) => cacheEvents.push(payload),
    post: async (path, body) => {
      requests.push([path, body]);
      if (path === "/binding/list") return { data: [{ name: "Steve", uuid: "uuid" }] };
      return { data: { data: { data: { guild_name: "Builders", bjdxp_level: 10 } } } };
    },
  });

  assert.deepEqual(requests, [
    ["/binding/list", undefined],
    ["/player/info", { uuid: "uuid" }],
  ]);
  assert.equal(cacheEvents.length, 1);
  assert.equal(result.playerInfoSource, "online");
  assert.equal(result.cache.playerInfo.guildName, "Builders");
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
