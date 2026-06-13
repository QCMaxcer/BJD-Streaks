import { extractArray } from "../core.js";
import { normalizePlayerProfile } from "../player-profile.js";

export async function loadDesktopAccount({ post, cacheStore, onCache = () => {} }) {
  const bindings = extractArray(await post("/binding/list"));
  const binding = bindings[0];
  if (!binding) throw new Error("当前账号没有可用的游戏绑定。");

  const account = {
    name: String(binding.name ?? "未知玩家"),
    uuid: String(binding.uuid ?? ""),
  };
  const cached = await cacheStore.read(account.uuid);
  onCache({ account, cache: cached });

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
    return { account, cache, playerInfoSource: "online" };
  } catch (error) {
    return {
      account,
      cache: cached,
      playerInfoSource: cached?.playerInfo ? "cache" : "unavailable",
      profileError: error?.message || String(error),
    };
  }
}
