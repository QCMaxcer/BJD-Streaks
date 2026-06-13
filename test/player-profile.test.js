import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlayerProfile, stripMinecraftFormatting } from "../src/player-profile.js";

test("stripMinecraftFormatting removes section and ampersand color codes", () => {
  assert.equal(stripMinecraftFormatting("§b13阶§f524☆"), "13阶524☆");
  assert.equal(stripMinecraftFormatting("&a3阶 &f126☆"), "3阶 126☆");
});

test("normalizePlayerProfile unwraps the live player info shape", () => {
  const profile = normalizePlayerProfile(
    {
      data: {
        data: {
          data: {
            guild_name: "QClub",
            bjdxp_level: 183,
            vip_level: 0,
            swxp_show: "§b3阶 §f126☆",
            bwxp_show: "§e13阶§f524☆",
            vdxp_show: "§60阶 §f1☆",
          },
        },
      },
    },
    { name: "QC_Max", uuid: "uuid" },
  );

  assert.deepEqual(profile, {
    name: "QC_Max",
    uuid: "uuid",
    guildName: "QClub",
    bjdLevel: "183",
    vipLevel: "0",
    skywarsLevel: "3阶 126☆",
    bedwarsLevel: "13阶524☆",
    villageDefenseLevel: "0阶 1☆",
  });
});

test("normalizePlayerProfile supplies display fallbacks for missing fields", () => {
  assert.deepEqual(normalizePlayerProfile({}, {}), {
    name: "未知玩家",
    uuid: "",
    guildName: "无",
    bjdLevel: "0",
    vipLevel: "0",
    skywarsLevel: "0",
    bedwarsLevel: "0",
    villageDefenseLevel: "0",
  });
});
