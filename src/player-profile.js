import { unwrapData } from "./core.js";

export function stripMinecraftFormatting(value) {
  return String(value ?? "").replace(/[§&][0-9A-FK-OR]/gi, "").trim();
}

function displayValue(value, fallback = "0") {
  const cleaned = stripMinecraftFormatting(value);
  return cleaned || fallback;
}

export function normalizePlayerProfile(payload, binding = {}) {
  const info = unwrapData(payload);
  const source = info && typeof info === "object" && !Array.isArray(info) ? info : {};

  return {
    name: displayValue(binding?.name, "未知玩家"),
    uuid: String(binding?.uuid ?? ""),
    guildName: displayValue(source.guild_name, "无"),
    bjdLevel: displayValue(source.bjdxp_level),
    vipLevel: displayValue(source.vip_level),
    skywarsLevel: displayValue(source.swxp_show),
    bedwarsLevel: displayValue(source.bwxp_show),
    villageDefenseLevel: displayValue(source.vdxp_show),
  };
}
