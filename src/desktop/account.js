import { extractArray } from "../core.js";
import { normalizePlayerProfile } from "../player-profile.js";

export function normalizeDesktopAccounts(payload) {
  const seen = new Set();
  return extractArray(payload)
    .map((binding) => ({
      name: String(binding?.name ?? binding?.uuid ?? "未知玩家"),
      uuid: String(binding?.uuid ?? ""),
    }))
    .filter((account) => {
      if (!account.uuid || seen.has(account.uuid)) return false;
      seen.add(account.uuid);
      return true;
    });
}

export function selectDesktopAccount(payload, uuid = "") {
  const accounts = normalizeDesktopAccounts(payload);
  const requestedUuid = String(uuid || "");
  const account = requestedUuid
    ? accounts.find((candidate) => candidate.uuid === requestedUuid)
    : accounts[0];
  if (!account) {
    throw new Error(
      requestedUuid
        ? "指定游戏账号不属于当前登录账号。"
        : "当前账号没有可用的游戏绑定。",
    );
  }
  return { accounts, account };
}

export async function loadDesktopAccount({
  post,
  cacheStore,
  uuid = "",
  onCache = () => {},
}) {
  const { accounts, account: binding } = selectDesktopAccount(
    await post("/binding/list"),
    uuid,
  );

  const account = {
    name: binding.name,
    uuid: binding.uuid,
  };
  const cached = await cacheStore.read(account.uuid);
  onCache({ accounts, account, selectedAccount: account, cache: cached });

  try {
    const playerInfo = normalizePlayerProfile(
      await post("/player/info", { uuid: account.uuid }),
      account,
    );
    const cache = await cacheStore.updatePlayerInfo({
      uuid: account.uuid,
      playerName: account.name,
      playerInfo,
    });
    return { accounts, account, selectedAccount: account, cache, playerInfoSource: "online" };
  } catch (error) {
    return {
      accounts,
      account,
      selectedAccount: account,
      cache: cached,
      playerInfoSource: cached?.playerInfo ? "cache" : "unavailable",
      profileError: error?.message || String(error),
    };
  }
}
