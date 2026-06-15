import test from "node:test";
import assert from "node:assert/strict";
import {
  createVisualizationSvg,
  getVisualizationFixedLabels,
  getVisualizationLegendItems,
} from "../src/desktop/visualization.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = new Map();
    this.children = [];
    this.textContent = "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  append(...children) {
    this.children.push(...children);
  }
}

function withFakeDocument(callback) {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElementNS: (_namespace, tagName) => new FakeElement(tagName),
  };
  try {
    return callback();
  } finally {
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
}

function findTags(node, tagName, result = []) {
  if (node.tagName === tagName) result.push(node);
  for (const child of node.children ?? []) findTags(child, tagName, result);
  return result;
}

function findText(node, text, result = []) {
  if (node.textContent === text) result.push(node);
  for (const child of node.children ?? []) findText(child, text, result);
  return result;
}

const svgModel = {
  modeName: "起床战争(4队四人)",
  days: [{ dateKey: "2026-06-13", wins: 3, losses: 1, unknown: 0 }],
  points: [{ dateKey: "2026-06-13", streak: 3, result: "win" }],
  spans: [],
  range: {
    from: "2026-06-13",
    to: "2026-06-13",
    fromTimestamp: new Date("2026-06-13T00:00:00").getTime(),
    toTimestamp: new Date("2026-06-13T23:59:59").getTime(),
  },
  current: { count: 3 },
  best: { count: 8 },
  validCount: 4,
};

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

test("visualization fixed labels describe the preview header and axes", () => {
  assert.deepEqual(getVisualizationFixedLabels(svgModel, { chartType: "bars", playerName: "QC_Max" }), {
    title: "QC_Max · 起床战争(4队四人) · 每日胜负频次",
    subtitle: "2026-06-13 至 2026-06-13 · 当前连胜 3 · 历史最高 8",
    trackLabel: "连胜跨度",
    primaryAxisLabel: "胜利局数",
    secondaryAxisLabel: "失败局数",
  });
  assert.equal(
    getVisualizationFixedLabels(svgModel, { chartType: "line", playerName: "QC_Max" }).primaryAxisLabel,
    "连胜局数",
  );
});

test("preview svg omits native title and fixed labels while export keeps them", () => {
  withFakeDocument(() => {
    const preview = createVisualizationSvg(svgModel, {
      renderMode: "preview",
      chartType: "bars",
      playerName: "QC_Max",
      viewportWidth: 900,
      fitZoom: 1,
    });
    const exported = createVisualizationSvg(svgModel, {
      renderMode: "export",
      chartType: "bars",
      playerName: "QC_Max",
    });

    assert.equal(findTags(preview.svg, "title").length, 0);
    assert.equal(findText(preview.svg, "胜利局数").length, 0);
    assert.equal(findTags(exported.svg, "title").length, 1);
    assert.equal(findText(exported.svg, "胜利局数").length, 1);
  });
});

test("streak spans create prioritized tooltip hits", () => {
  withFakeDocument(() => {
    const start = new Date("2026-06-12T12:00:00").getTime();
    const end = new Date("2026-06-13T12:00:00").getTime();
    const chart = createVisualizationSvg({
      ...svgModel,
      spans: [{
        role: "best",
        count: 2,
        start: { date: "2026-06-12T12:00:00" },
        end: { date: "2026-06-13T12:00:00" },
        visibleStart: start,
        visibleEnd: end,
        leftTruncated: false,
        rightTruncated: true,
      }],
    }, {
      renderMode: "preview",
      chartType: "bars",
      playerName: "QC_Max",
      viewportWidth: 900,
      fitZoom: 1,
    });
    const spanHit = chart.hits.find((hit) => hit.kind === "span");
    assert.ok(spanHit);
    assert.equal(spanHit.priority, 2);
    assert.equal(spanHit.id, "streak-span-0");
    assert.equal(spanHit.element.attributes.get("data-span-id"), "streak-span-0");
    assert.match(spanHit.text, /历史最高连胜/);
    assert.match(spanHit.text, /连胜 2 局/);
    assert.match(spanHit.text, /右侧被截断/);
  });
});
