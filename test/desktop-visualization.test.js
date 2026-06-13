import test from "node:test";
import assert from "node:assert/strict";
import { getVisualizationLegendItems } from "../src/desktop/visualization.js";

test("visualization legends include exportable chart roles", () => {
  assert.deepEqual(
    getVisualizationLegendItems("bars").map(([label]) => label),
    ["胜利", "失败", "其他连胜", "历史最高", "当前连胜"],
  );
  assert.deepEqual(
    getVisualizationLegendItems("line").map(([label]) => label),
    ["累计连胜", "其他连胜", "历史最高", "当前连胜"],
  );
});
