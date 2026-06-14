import { extractArray, unwrapData } from "../core.js";
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

export function chooseAccountAfterUnbind({ accounts = [], currentUuid = "", unboundUuid = "" }) {
  const remaining = Array.isArray(accounts) ? accounts : [];
  if (currentUuid && currentUuid !== unboundUuid) {
    return remaining.find((account) => account.uuid === currentUuid) ?? remaining[0] ?? null;
  }
  return remaining[0] ?? null;
}

export async function bindDesktopAccount({ post, bindCode }) {
  const normalizedCode = String(bindCode ?? "").trim();
  if (!normalizedCode) throw new Error("请输入游戏绑定码。");

  const beforeAccounts = normalizeDesktopAccounts(await post("/binding/list"));
  const beforeUuids = new Set(beforeAccounts.map((account) => account.uuid));
  const response = unwrapData(await post("/binding/bind", { bindCode: normalizedCode }));
  const accounts = normalizeDesktopAccounts(await post("/binding/list"));
  const responseUuid = String(response?.uuid ?? "");
  const account =
    accounts.find((candidate) => candidate.uuid === responseUuid) ??
    accounts.find((candidate) => !beforeUuids.has(candidate.uuid));

  if (!account) {
    throw new Error("绑定请求已完成，但未在账号列表中找到新绑定，请稍后重试。");
  }

  return {
    accounts,
    account,
    selectedAccount: account,
    bindingRequired: false,
  };
}

export async function unbindDesktopAccount({ post, uuid }) {
  const { account } = selectDesktopAccount(await post("/binding/list"), uuid);
  await post("/binding/unbind", { UUID: account.uuid });
  const accounts = normalizeDesktopAccounts(await post("/binding/list"));
  if (accounts.some((candidate) => candidate.uuid === account.uuid)) {
    throw new Error("服务器仍返回该游戏账号，解绑可能未生效，请稍后重试。");
  }
  return {
    accounts,
    unboundAccount: account,
    bindingRequired: accounts.length === 0,
  };
}

export async function loadDesktopAccount({
  post,
  cacheStore,
  uuid = "",
  onCache = () => {},
}) {
  const bindingPayload = await post("/binding/list");
  const accounts = normalizeDesktopAccounts(bindingPayload);
  if (!accounts.length) {
    const empty = {
      accounts: [],
      account: null,
      selectedAccount: null,
      cache: null,
      playerInfoSource: "unavailable",
      bindingRequired: true,
    };
    onCache(empty);
    return empty;
  }

  const { account: binding } = selectDesktopAccount(bindingPayload, uuid);

  const account = {
    name: binding.name,
    uuid: binding.uuid,
  };
  const cached = await cacheStore.read(account.uuid);
  onCache({ accounts, account, selectedAccount: account, cache: cached, bindingRequired: false });

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
    return {
      accounts,
      account,
      selectedAccount: account,
      cache,
      playerInfoSource: "online",
      bindingRequired: false,
    };
  } catch (error) {
    return {
      accounts,
      account,
      selectedAccount: account,
      cache: cached,
      playerInfoSource: cached?.playerInfo ? "cache" : "unavailable",
      profileError: error?.message || String(error),
      bindingRequired: false,
    };
  }
}
