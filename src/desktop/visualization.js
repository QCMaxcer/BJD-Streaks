import { prepareSvgExport } from "../streak-visualization.js";
import {
  CHART_LEFT,
  CHART_RIGHT,
  STREAK_TRACK_LABEL_Y,
  STREAK_TRACK_LINE_Y,
  getExportChartWidth,
  getPreviewChartWidth,
} from "../visualization-layout.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const COLORS = Object.freeze({
  ink: "#172033",
  muted: "#64748b",
  grid: "#dbe4f0",
  win: "#16a34a",
  loss: "#dc2626",
  unknown: "#64748b",
  line: "#0969da",
  other: "#94a3b8",
  best: "#d97706",
  current: "#16a34a",
});

function svgElement(tag, attributes = {}, text) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) element.setAttribute(name, String(value));
  }
  if (text !== undefined) element.textContent = text;
  return element;
}

function appendText(parent, text, x, y, attributes = {}) {
  parent.append(svgElement("text", { x, y, ...attributes }, text));
}

function shortDate(dateKey) {
  const [, month = "", day = ""] = String(dateKey).split("-");
  return `${month}/${day}`;
}

function fullDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value || "未知日期");
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rangeText(model) {
  return `${model.range.from} 至 ${model.range.to}`;
}

function resultText(result) {
  return result === "win" ? "胜利" : result === "loss" ? "失败" : "未知结果";
}

function xScale(model, width, timestamp) {
  const left = CHART_LEFT;
  const right = width - CHART_RIGHT;
  const span = Math.max(1, model.range.toTimestamp - model.range.fromTimestamp);
  return left + ((timestamp - model.range.fromTimestamp) / span) * (right - left);
}

function spanStyle(role) {
  if (role === "best") return { stroke: COLORS.best, width: 8 };
  if (role === "current") return { stroke: COLORS.current, width: 8 };
  if (role === "current-best") return { stroke: COLORS.best, width: 8, outline: COLORS.current };
  return { stroke: COLORS.other, width: 5 };
}

function spanRoleText(role) {
  return {
    best: "历史最高连胜",
    current: "当前连胜",
    "current-best": "当前最高连胜",
    other: "其他连胜",
  }[role] || "连胜";
}

function spanTooltip(span) {
  const truncated = [
    span.leftTruncated ? "左侧被截断" : "",
    span.rightTruncated ? "右侧被截断" : "",
  ].filter(Boolean);
  return [
    spanRoleText(span.role),
    `连胜 ${span.count} 局`,
    `${fullDate(span.start?.date)} 至 ${fullDate(span.end?.date)}`,
    truncated.length ? truncated.join("，") : "",
  ].filter(Boolean).join("\n");
}

export function getVisualizationLegendItems(chartType) {
  return chartType === "line"
    ? [
        ["累计连胜", COLORS.line],
        ["其他连胜", COLORS.other],
        ["历史最高", COLORS.best],
        ["当前连胜", COLORS.current],
      ]
    : [
        ["胜利", COLORS.win],
        ["失败", COLORS.loss],
        ["其他连胜", COLORS.other],
        ["历史最高", COLORS.best],
        ["当前连胜", COLORS.current],
      ];
}

export function getVisualizationFixedLabels(model, {
  chartType = "bars",
  playerName = "未知玩家",
} = {}) {
  return {
    title: `${playerName} · ${model.modeName} · ${chartType === "line" ? "累计连胜" : "每日胜负频次"}`,
    subtitle: `${rangeText(model)} · 当前连胜 ${model.current.count} · 历史最高 ${model.best.count}`,
    trackLabel: "连胜跨度",
    primaryAxisLabel: chartType === "line" ? "连胜局数" : "胜利局数",
    secondaryAxisLabel: chartType === "line" ? "" : "失败局数",
  };
}

function renderLegend(svg, width, chartType) {
  const items = getVisualizationLegendItems(chartType);
  let x = Math.max(72, width - 520);
  for (const [label, color] of items) {
    svg.append(svgElement("line", {
      x1: x,
      x2: x + 18,
      y1: 48,
      y2: 48,
      stroke: color,
      "stroke-width": 5,
      "stroke-linecap": "round",
    }));
    appendText(svg, label, x + 25, 52, { fill: COLORS.muted, "font-size": 12 });
    x += label.length * 13 + 56;
  }
}

function renderStreakTrack(svg, model, width, { showAxisLabels = true } = {}) {
  const labelY = STREAK_TRACK_LABEL_Y;
  const y = STREAK_TRACK_LINE_Y;
  const hits = [];
  if (showAxisLabels) {
    appendText(svg, "连胜跨度", 30, labelY, {
      fill: COLORS.muted,
      "font-size": 12,
      "font-weight": 700,
    });
  }
  svg.append(svgElement("line", {
    x1: CHART_LEFT,
    x2: width - CHART_RIGHT,
    y1: y,
    y2: y,
    stroke: COLORS.grid,
    "stroke-width": 2,
  }));

  for (const span of model.spans) {
    const startX = xScale(model, width, span.visibleStart);
    const endX = xScale(model, width, span.visibleEnd);
    const left = Math.min(startX, endX);
    const right = Math.max(startX, endX);
    const style = spanStyle(span.role);
    const label = span.role === "current-best"
      ? `当前最高 ${span.count}`
      : span.role === "best"
        ? `历史最高 ${span.count}`
        : span.role === "current"
          ? `当前 ${span.count}`
          : "";

    if (style.outline) {
      svg.append(svgElement("line", {
        x1: startX,
        x2: Math.max(startX, endX),
        y1: y,
        y2: y,
        stroke: style.outline,
        "stroke-width": style.width + 5,
        "stroke-linecap": "round",
      }));
    }
    if (Math.abs(endX - startX) < 2) {
      svg.append(svgElement("circle", {
        cx: startX,
        cy: y,
        r: span.role === "other" ? 4 : 6,
        fill: style.stroke,
        stroke: style.outline ?? "#fff",
        "stroke-width": style.outline ? 3 : 1,
      }));
    } else {
      svg.append(svgElement("line", {
        x1: startX,
        x2: endX,
        y1: y,
        y2: y,
        stroke: style.stroke,
        "stroke-width": style.width,
        "stroke-linecap": "round",
      }));
    }
    if (span.leftTruncated) {
      appendText(svg, "‹", CHART_LEFT - 10, y + 6, { fill: style.stroke, "font-size": 20, "font-weight": 700 });
    }
    if (span.rightTruncated) {
      appendText(svg, "›", width - CHART_RIGHT + 4, y + 6, {
        fill: style.stroke,
        "font-size": 20,
        "font-weight": 700,
      });
    }
    if (label) {
      appendText(svg, label, Math.max(CHART_LEFT + 55, Math.min(width - CHART_RIGHT - 65, (startX + endX) / 2)), y - 16, {
        fill: style.stroke,
        "font-size": 11,
        "font-weight": 700,
        "text-anchor": "middle",
      });
    }
    hits.push({
      kind: "span",
      priority: 2,
      x: (startX + endX) / 2,
      x1: left,
      x2: right,
      y,
      hitTop: y - 18,
      hitBottom: y + 18,
      text: spanTooltip(span),
    });
  }
  return hits;
}

function renderXAxis(svg, model, width, y) {
  const tickStep = Math.max(1, Math.ceil(model.days.length / 11));
  model.days.forEach((day, index) => {
    if (index % tickStep !== 0 && index !== model.days.length - 1) return;
    const timestamp = new Date(`${day.dateKey}T12:00:00`).getTime();
    const x = xScale(model, width, timestamp);
    svg.append(svgElement("line", {
      x1: x,
      x2: x,
      y1: y,
      y2: y + 6,
      stroke: COLORS.muted,
      "stroke-width": 1,
    }));
    appendText(svg, shortDate(day.dateKey), x, y + 22, {
      fill: COLORS.muted,
      "font-size": 11,
      "text-anchor": "middle",
    });
  });
}

function renderBars(svg, model, width, { showAxisLabels = true } = {}) {
  const top = 190;
  const bottom = 585;
  const zeroY = 390;
  const halfHeight = Math.min(zeroY - top, bottom - zeroY) - 18;
  const maxValue = Math.max(1, ...model.days.flatMap((day) => [day.wins, day.losses]));
  const valueScale = halfHeight / maxValue;
  const step = (width - 104) / Math.max(1, model.days.length);
  const barWidth = Math.max(2, Math.min(18, step * 0.7));
  const hits = [];

  for (const ratio of [0.5, 1]) {
    const offset = maxValue * ratio * valueScale;
    for (const y of [zeroY - offset, zeroY + offset]) {
      svg.append(svgElement("line", {
        x1: CHART_LEFT,
        x2: width - CHART_RIGHT,
        y1: y,
        y2: y,
        stroke: COLORS.grid,
        "stroke-width": 1,
        "stroke-dasharray": "4 5",
      }));
    }
  }
  svg.append(svgElement("line", {
    x1: CHART_LEFT,
    x2: width - CHART_RIGHT,
    y1: zeroY,
    y2: zeroY,
    stroke: COLORS.ink,
    "stroke-width": 1.5,
  }));
  appendText(svg, String(maxValue), CHART_LEFT - 12, zeroY - maxValue * valueScale + 4, {
    fill: COLORS.win,
    "font-size": 11,
    "text-anchor": "end",
  });
  appendText(svg, "0", CHART_LEFT - 12, zeroY + 4, { fill: COLORS.muted, "font-size": 11, "text-anchor": "end" });
  appendText(svg, String(maxValue), CHART_LEFT - 12, zeroY + maxValue * valueScale + 4, {
    fill: COLORS.loss,
    "font-size": 11,
    "text-anchor": "end",
  });
  if (showAxisLabels) {
    appendText(svg, "胜利局数", 30, top + 12, { fill: COLORS.win, "font-size": 11, "font-weight": 700 });
    appendText(svg, "失败局数", 30, bottom, { fill: COLORS.loss, "font-size": 11, "font-weight": 700 });
  }

  model.days.forEach((day) => {
    const timestamp = new Date(`${day.dateKey}T12:00:00`).getTime();
    const x = xScale(model, width, timestamp);
    if (day.wins) {
      svg.append(svgElement("rect", {
        x: x - barWidth / 2,
        y: zeroY - day.wins * valueScale,
        width: barWidth,
        height: day.wins * valueScale,
        rx: Math.min(3, barWidth / 3),
        fill: COLORS.win,
      }));
    }
    if (day.losses) {
      svg.append(svgElement("rect", {
        x: x - barWidth / 2,
        y: zeroY,
        width: barWidth,
        height: day.losses * valueScale,
        rx: Math.min(3, barWidth / 3),
        fill: COLORS.loss,
      }));
    }
    hits.push({
      x,
      y: zeroY,
      text: `${day.dateKey}\n胜利 ${day.wins} 局 · 失败 ${day.losses} 局 · 未知 ${day.unknown} 局`,
    });
  });
  renderXAxis(svg, model, width, bottom + 10);
  return hits;
}

function circlePath(points, radius) {
  return points.map(({ x, y }) => (
    `M ${x - radius} ${y} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`
  )).join(" ");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    const yMin = Math.min(p1.y, p2.y);
    const yMax = Math.max(p1.y, p2.y);
    const cp1 = {
      x: p1.x + (p2.x - p0.x) / 6,
      y: clamp(p1.y + (p2.y - p0.y) / 6, yMin, yMax),
    };
    const cp2 = {
      x: p2.x - (p3.x - p1.x) / 6,
      y: clamp(p2.y - (p3.y - p1.y) / 6, yMin, yMax),
    };
    path += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
  }
  return path;
}

function buildDailyLinePoints(model, width, yScale) {
  const pointsByDay = new Map();
  for (const point of model.points) {
    if (point.result === "carry") continue;
    if (!pointsByDay.has(point.dateKey)) pointsByDay.set(point.dateKey, []);
    pointsByDay.get(point.dateKey).push(point);
  }

  let streak = model.points[0]?.streak ?? 0;
  return model.days.map((day) => {
    const points = pointsByDay.get(day.dateKey) ?? [];
    if (points.length) streak = points[points.length - 1].streak;
    const timestamp = new Date(`${day.dateKey}T12:00:00`).getTime();
    return {
      x: xScale(model, width, timestamp),
      y: yScale(streak),
      timestamp,
      dateKey: day.dateKey,
      streak,
      wins: day.wins,
      losses: day.losses,
      unknown: day.unknown,
      text: `${day.dateKey}\n当天最终连胜 ${streak} 局\n胜利 ${day.wins} 局 · 失败 ${day.losses} 局 · 未知 ${day.unknown} 局`,
    };
  });
}

function renderLine(svg, model, width, { showAxisLabels = true } = {}) {
  const top = 155;
  const bottom = 575;
  const plotTop = 190;
  const maxValue = Math.max(1, ...model.points.map((point) => point.streak));
  const yScale = (value) => bottom - (value / maxValue) * (bottom - plotTop);
  const hits = buildDailyLinePoints(model, width, yScale);
  const path = smoothPath(hits);

  for (let tick = 0; tick <= 4; tick += 1) {
    const value = Math.round((maxValue * tick) / 4);
    const y = yScale(value);
    svg.append(svgElement("line", {
      x1: CHART_LEFT,
      x2: width - CHART_RIGHT,
      y1: y,
      y2: y,
      stroke: COLORS.grid,
      "stroke-width": tick === 0 ? 1.5 : 1,
      "stroke-dasharray": tick === 0 ? "" : "4 5",
    }));
    appendText(svg, String(value), CHART_LEFT - 12, y + 4, {
      fill: COLORS.muted,
      "font-size": 11,
      "text-anchor": "end",
    });
  }
  if (showAxisLabels) {
    appendText(svg, "连胜局数", 30, plotTop + 12, { fill: COLORS.line, "font-size": 11, "font-weight": 700 });
  }
  svg.append(svgElement("path", {
    d: path,
    fill: "none",
    stroke: COLORS.line,
    "stroke-width": 2.8,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  }));
  renderXAxis(svg, model, width, bottom + 10);
  return hits;
}

export function createVisualizationSvg(model, {
  chartType = "bars",
  playerName = "未知玩家",
  renderMode = "preview",
  viewportWidth,
  fitZoom,
  zoomMultiplier = 1,
  exportDensity,
} = {}) {
  const width = renderMode === "export"
    ? getExportChartWidth(model, { exportDensity })
    : getPreviewChartWidth(model, { viewportWidth, fitZoom, zoomMultiplier });
  const height = 660;
  const labels = getVisualizationFixedLabels(model, { chartType, playerName });
  const showFixedSvgText = renderMode === "export";
  const svg = svgElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: "img",
    "aria-label": `${labels.title}，${labels.subtitle}`,
    "data-chart-width": width,
    "data-chart-height": height,
    style: "font-family: Microsoft YaHei, Segoe UI, sans-serif; background: #ffffff;",
  });
  svg.append(svgElement("rect", { width, height, fill: "#fff" }));
  if (renderMode === "export") {
    svg.append(svgElement("title", {}, labels.title));
    svg.append(svgElement("desc", {}, labels.subtitle));
  }
  if (showFixedSvgText) {
    appendText(svg, labels.title, 30, 33, { fill: COLORS.ink, "font-size": 20, "font-weight": 700 });
    appendText(svg, labels.subtitle, 30, 57, { fill: COLORS.muted, "font-size": 12 });
  }
  if (renderMode === "export") renderLegend(svg, width, chartType);
  const spanHits = renderStreakTrack(svg, model, width, { showAxisLabels: showFixedSvgText });
  const hits = chartType === "line"
    ? renderLine(svg, model, width, { showAxisLabels: showFixedSvgText })
    : renderBars(svg, model, width, { showAxisLabels: showFixedSvgText });
  return { svg, width, height, hits: [...spanHits, ...hits] };
}

export function renderVisualizationSvg(container, model, options = {}) {
  const result = createVisualizationSvg(model, options);
  container.replaceChildren(result.svg);
  return result;
}

export function serializeVisualizationSvg(svg, metadata) {
  const markup = new XMLSerializer().serializeToString(svg);
  return prepareSvgExport(markup, metadata);
}

export async function svgToPngBase64(svgMarkup, width, height, scale = 2) {
  const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").split(",", 2)[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}
