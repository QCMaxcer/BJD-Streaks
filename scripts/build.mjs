import { mkdir, readFile } from "node:fs/promises";
import { build } from "esbuild";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

const banner = `// ==UserScript==
// @license MIT
// @name         布吉岛战绩与连胜统计
// @namespace    https://user.mcbjd.net/
// @version      ${packageJson.version}
// @description  分类查找布吉岛战绩，并统计当前连胜与历史最高连胜
// @author       QC_Max
// @match        https://user.mcbjd.net/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==`;

await mkdir("dist", { recursive: true });

await build({
  entryPoints: ["src/userscript.js"],
  outfile: "dist/bjd-wins.user.js",
  bundle: true,
  format: "iife",
  target: ["chrome110"],
  minify: false,
  sourcemap: false,
  legalComments: "none",
  banner: { js: banner },
});
