import {
  buildModeStats,
  filterRecords,
  getLocalDateKey,
  getModeName,
  parseDateInputToKey,
  recordKey,
  sortRecordsNewestFirst,
} from "../core.js";
import { buildMatchAnalytics, filterAnalyticsRecords } from "../match-analytics.js";
import { normalizeMatchDetail } from "../match-detail.js";
import {
  addLocalDays,
  buildVisualizationExportName,
  buildVisualizationModel,
} from "../streak-visualization.js";
import {
  calculateFitZoom,
  calculateTooltipPosition,
  clampZoomMultiplier,
  DEFAULT_VISUALIZATION_RANGE_PRESET,
  getVisualizationFixedLabelLayout,
  resolveVisualizationWheelAction,
} from "../visualization-layout.js";
import {
  createVisualizationSvg,
  getVisualizationFixedLabels,
  getVisualizationLegendItems,
  renderVisualizationSvg,
  serializeVisualizationSvg,
  svgToPngBase64,
} from "./visualization.js";
import { chooseAccountAfterUnbind } from "./account.js";

const DISPLAY_LIMIT = 300;
const DEFAULT_CUTOFF_DATE = "2025-01-01";
const DEFAULT_PAGE_DELAY_SECONDS = 0.1;
const DEFAULT_ANALYTICS_EXPAND = Object.freeze({
  items: 5,
  teammates: 10,
  bedwarsMaps: 10,
  skywarsMaps: 10,
});

const desktop = window.bjdDesktop;
const state = {
  authenticated: false,
  autoUpdateEnabled: true,
  activeTab: "streaks",
  accounts: [],
  account: null,
  bindingRequired: false,
  bindingOperation: false,
  accountMenuOpen: false,
  playerInfo: null,
  playerInfoSource: "unavailable",
  records: [],
  stats: buildModeStats([]),
  loading: false,
  analyticsLoading: false,
  analyticsProgress: null,
  analyticsExpand: { ...DEFAULT_ANALYTICS_EXPAND },
  recordsVersion: 0,
  matchDetailsVersion: 0,
  analyticsDirty: true,
  analyticsCache: new Map(),
  normalizedDetailCache: new Map(),
  lastAnalyticsModel: null,
  accountSwitching: false,
  filters: { mode: "", category: "", result: "", query: "", from: "", to: "" },
  analyticsFilters: { mode: "", from: "", to: "" },
  detailCache: new Map(),
  activeDetailKey: "",
  matchDetails: {},
  visualization: {
    open: false,
    mode: "all",
    chartType: "bars",
    rangePreset: DEFAULT_VISUALIZATION_RANGE_PRESET,
    from: "",
    to: "",
    fitZoom: 1,
    zoomMultiplier: 1,
    model: null,
    chart: null,
  },
};

const els = {
  authStatus: document.querySelector("#authStatus"),
  loginButton: document.querySelector("#loginButton"),
  logoutButton: document.querySelector("#logoutButton"),
  updateButton: document.querySelector("#updateButton"),
  refetchButton: document.querySelector("#refetchButton"),
  cancelButton: document.querySelector("#cancelButton"),
  clearCacheButton: document.querySelector("#clearCacheButton"),
  cutoffDate: document.querySelector("#cutoffDate"),
  pageDelay: document.querySelector("#pageDelay"),
  autoUpdate: document.querySelector("#autoUpdate"),
  statusText: document.querySelector("#statusText"),
  bindingGuide: document.querySelector("#bindingGuide"),
  bindingGuideStart: document.querySelector("#bindingGuideStart"),
  bindingGuideOfficial: document.querySelector("#bindingGuideOfficial"),
  tabBar: document.querySelector("#tabBar"),
  streaksTab: document.querySelector("#streaksTab"),
  recordsTab: document.querySelector("#recordsTab"),
  analyticsTab: document.querySelector("#analyticsTab"),
  streaksPanel: document.querySelector("#streaksPanel"),
  recordsPanel: document.querySelector("#recordsPanel"),
  analyticsPanel: document.querySelector("#analyticsPanel"),
  playerProfile: document.querySelector("#playerProfile"),
  playerName: document.querySelector("#playerName"),
  accountMenu: document.querySelector("#accountMenu"),
  accountMenuButton: document.querySelector("#accountMenuButton"),
  accountMenuLabel: document.querySelector("#accountMenuLabel"),
  accountMenuPanel: document.querySelector("#accountMenuPanel"),
  profileStatus: document.querySelector("#profileStatus"),
  profileGuild: document.querySelector("#profileGuild"),
  profileBjdLevel: document.querySelector("#profileBjdLevel"),
  profileVipLevel: document.querySelector("#profileVipLevel"),
  profileSkywarsLevel: document.querySelector("#profileSkywarsLevel"),
  profileBedwarsLevel: document.querySelector("#profileBedwarsLevel"),
  profileVillageLevel: document.querySelector("#profileVillageLevel"),
  overallGrid: document.querySelector("#overallGrid"),
  modeList: document.querySelector("#modeList"),
  visualizeAllButton: document.querySelector("#visualizeAllButton"),
  recordCount: document.querySelector("#recordCount"),
  recordList: document.querySelector("#recordList"),
  modeFilter: document.querySelector("#modeFilter"),
  categoryFilter: document.querySelector("#categoryFilter"),
  resultFilter: document.querySelector("#resultFilter"),
  queryFilter: document.querySelector("#queryFilter"),
  fromFilter: document.querySelector("#fromFilter"),
  toFilter: document.querySelector("#toFilter"),
  analyticsMode: document.querySelector("#analyticsMode"),
  analyticsFrom: document.querySelector("#analyticsFrom"),
  analyticsTo: document.querySelector("#analyticsTo"),
  analyticsPrefetchButton: document.querySelector("#analyticsPrefetchButton"),
  analyticsCancelButton: document.querySelector("#analyticsCancelButton"),
  analyticsStatus: document.querySelector("#analyticsStatus"),
  analyticsOverview: document.querySelector("#analyticsOverview"),
  analyticsTotals: document.querySelector("#analyticsTotals"),
  analyticsResources: document.querySelector("#analyticsResources"),
  analyticsItems: document.querySelector("#analyticsItems"),
  analyticsUpgrades: document.querySelector("#analyticsUpgrades"),
  analyticsTeammates: document.querySelector("#analyticsTeammates"),
  analyticsBedwarsMaps: document.querySelector("#analyticsBedwarsMaps"),
  analyticsSkywarsMaps: document.querySelector("#analyticsSkywarsMaps"),
  detailDialog: document.querySelector("#detailDialog"),
  detailTitle: document.querySelector("#detailTitle"),
  detailBody: document.querySelector("#detailBody"),
  detailClose: document.querySelector("#detailClose"),
  bindingDialog: document.querySelector("#bindingDialog"),
  bindingDialogClose: document.querySelector("#bindingDialogClose"),
  bindingForm: document.querySelector("#bindingForm"),
  bindingCode: document.querySelector("#bindingCode"),
  bindingDialogStatus: document.querySelector("#bindingDialogStatus"),
  bindingOfficialButton: document.querySelector("#bindingOfficialButton"),
  bindingSubmitButton: document.querySelector("#bindingSubmitButton"),
  visualizationDialog: document.querySelector("#visualizationDialog"),
  visualizationTitle: document.querySelector("#visualizationTitle"),
  visualizationClose: document.querySelector("#visualizationClose"),
  visualizationMode: document.querySelector("#visualizationMode"),
  visualizationChartType: document.querySelector("#visualizationChartType"),
  visualizationBarsButton: document.querySelector("#visualizationBarsButton"),
  visualizationLineButton: document.querySelector("#visualizationLineButton"),
  visualizationRange: document.querySelector("#visualizationRange"),
  visualizationFrom: document.querySelector("#visualizationFrom"),
  visualizationTo: document.querySelector("#visualizationTo"),
  visualizationZoom: document.querySelector("#visualizationZoom"),
  visualizationZoomValue: document.querySelector("#visualizationZoomValue"),
  visualizationLocateBest: document.querySelector("#visualizationLocateBest"),
  visualizationExportPng: document.querySelector("#visualizationExportPng"),
  visualizationExportSvg: document.querySelector("#visualizationExportSvg"),
  visualizationSummary: document.querySelector("#visualizationSummary"),
  visualizationNotice: document.querySelector("#visualizationNotice"),
  visualizationChartTitle: document.querySelector("#visualizationChartTitle"),
  visualizationChartSubtitle: document.querySelector("#visualizationChartSubtitle"),
  visualizationLegend: document.querySelector("#visualizationLegend"),
  visualizationTrackLabel: document.querySelector("#visualizationTrackLabel"),
  visualizationPrimaryAxisLabel: document.querySelector("#visualizationPrimaryAxisLabel"),
  visualizationSecondaryAxisLabel: document.querySelector("#visualizationSecondaryAxisLabel"),
  visualizationChartScroller: document.querySelector("#visualizationChartScroller"),
  visualizationChart: document.querySelector("#visualizationChart"),
  visualizationTooltip: document.querySelector("#visualizationTooltip"),
};

let visualizationResizeObserver = null;
let analyticsRenderFrame = 0;

function invalidateAnalyticsCache({
  recordsChanged = false,
  matchDetailsChanged = false,
  clearNormalizedDetails = false,
} = {}) {
  if (recordsChanged) state.recordsVersion += 1;
  if (matchDetailsChanged) state.matchDetailsVersion += 1;
  if (clearNormalizedDetails) state.normalizedDetailCache.clear();
  state.analyticsCache.clear();
  state.analyticsDirty = true;
  state.lastAnalyticsModel = null;
}

function setMatchDetails(matchDetails, options = {}) {
  state.matchDetails = matchDetails ?? {};
  invalidateAnalyticsCache({ matchDetailsChanged: true, ...options });
}

function createElement(tag, className = "", text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatDate(value, withTime = true) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value || "未知时间");
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function formatRate(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}

function resultLabel(win) {
  return win === true ? "胜利" : win === false ? "失败" : "未知";
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function formatDuration(value) {
  const totalSeconds = Math.max(0, Math.ceil(Number(value || 0) / 1000));
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes} 分 ${seconds} 秒`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小时 ${minutes % 60} 分`;
}

function streakRange(streak) {
  if (!streak?.count) return "暂无连胜";
  return `${formatDate(streak.start?.date, false)} 至 ${formatDate(streak.end?.date, false)}`;
}

function errorMessage(error) {
  return error?.message || String(error || "发生未知错误。");
}

function setStatus(text, kind = "") {
  els.statusText.textContent = text;
  els.statusText.className = `status ${kind}`.trim();
}

function renderAuthControls() {
  els.authStatus.textContent = state.authenticated ? "已登录" : "未登录";
  els.loginButton.classList.toggle("hidden", state.authenticated);
  els.logoutButton.classList.toggle("hidden", !state.authenticated);
}

function renderTabs() {
  const available = state.authenticated && Boolean(state.account?.uuid);
  const isStreaks = state.activeTab === "streaks";
  const isRecords = state.activeTab === "records";
  const isAnalytics = state.activeTab === "analytics";
  els.bindingGuide.classList.toggle("hidden", !state.authenticated || !state.bindingRequired);
  els.tabBar.classList.toggle("hidden", !available);
  els.streaksTab.classList.toggle("active", isStreaks);
  els.recordsTab.classList.toggle("active", isRecords);
  els.analyticsTab.classList.toggle("active", isAnalytics);
  els.streaksPanel.classList.toggle("hidden", !available || !isStreaks);
  els.recordsPanel.classList.toggle("hidden", !available || !isRecords);
  els.analyticsPanel.classList.toggle("hidden", !available || !isAnalytics);
  updateSlidingIndicator(els.tabBar, els.tabBar.querySelector(".tab-button.active"));
}

function updateSlidingIndicator(container, activeButton) {
  if (!container || !activeButton) return;
  container.style.setProperty("--indicator-x", `${activeButton.offsetLeft}px`);
  container.style.setProperty("--indicator-width", `${activeButton.offsetWidth}px`);
}

function setLoading(loading) {
  state.loading = loading;
  const unavailable = loading || !state.authenticated || !state.account?.uuid;
  els.updateButton.disabled = unavailable;
  els.refetchButton.disabled = unavailable;
  els.clearCacheButton.disabled = unavailable;
  els.cutoffDate.disabled = loading;
  els.pageDelay.disabled = loading;
  els.autoUpdate.disabled = unavailable;
  els.accountMenuButton.disabled = !state.authenticated || state.accountSwitching || state.bindingOperation;
  els.bindingGuideStart.disabled = !state.authenticated || state.bindingOperation;
  els.bindingGuideOfficial.disabled = !state.authenticated || state.bindingOperation;
  if (els.analyticsPrefetchButton) {
    els.analyticsPrefetchButton.disabled =
      unavailable || state.analyticsLoading || state.activeTab !== "analytics";
  }
  els.cancelButton.classList.toggle("hidden", !loading);
}

function closeAccountMenu() {
  state.accountMenuOpen = false;
  els.accountMenuButton.setAttribute("aria-expanded", "false");
  els.accountMenuPanel.classList.add("hidden");
}

function openAccountMenu() {
  if (els.accountMenuButton.disabled) return;
  state.accountMenuOpen = true;
  els.accountMenuButton.setAttribute("aria-expanded", "true");
  els.accountMenuPanel.classList.remove("hidden");
  const options = els.accountMenuPanel.querySelectorAll("button");
  options[0]?.focus();
}

function renderAccountMenu() {
  const accounts = state.accounts.length ? state.accounts : state.account ? [state.account] : [];
  els.accountMenuLabel.textContent = state.account?.name || "选择游戏账号";
  els.accountMenuPanel.replaceChildren();
  const list = createElement("div", "account-menu-list");
  for (const account of accounts) {
    const row = createElement("div", "account-menu-row");
    const option = createElement(
      "button",
      `account-menu-option${account.uuid === state.account?.uuid ? " current" : ""}`,
    );
    option.type = "button";
    option.setAttribute("role", "menuitemradio");
    option.setAttribute("aria-checked", String(account.uuid === state.account?.uuid));
    option.dataset.accountUuid = account.uuid;
    option.append(
      createElement("strong", "", account.name || account.uuid || "未知玩家"),
      createElement("span", "", account.uuid === state.account?.uuid ? "当前账号" : account.uuid),
    );
    option.addEventListener("click", () => {
      closeAccountMenu();
      switchAccount(account.uuid);
    });

    const unbind = createElement("button", "account-menu-unbind", "×");
    unbind.type = "button";
    unbind.setAttribute("role", "menuitem");
    unbind.setAttribute("aria-label", `解绑 ${account.name || account.uuid}`);
    unbind.title = `解绑 ${account.name || account.uuid}`;
    unbind.addEventListener("click", () => unbindAccount(account));
    row.append(option, unbind);
    list.append(row);
  }
  const add = createElement("button", "account-menu-add", "＋ 绑定新的游戏账号");
  add.type = "button";
  add.setAttribute("role", "menuitem");
  add.addEventListener("click", () => {
    closeAccountMenu();
    openBindingDialog();
  });
  els.accountMenuPanel.append(list, add);
  els.accountMenuButton.disabled = !state.authenticated || state.accountSwitching || state.bindingOperation;
  if (!state.accountMenuOpen) closeAccountMenu();
}

function renderProfile() {
  els.playerProfile.classList.toggle("hidden", !state.authenticated || !state.account);
  renderAccountMenu();
  renderTabs();
  if (!state.account) return;

  const profile = state.playerInfo ?? {};
  els.playerName.textContent = profile.name || state.account.name || "未知玩家";
  els.profileGuild.textContent = profile.guildName || "无";
  els.profileBjdLevel.textContent = profile.bjdLevel || "0";
  els.profileVipLevel.textContent = profile.vipLevel || "0";
  els.profileSkywarsLevel.textContent = profile.skywarsLevel || "0";
  els.profileBedwarsLevel.textContent = profile.bedwarsLevel || "0";
  els.profileVillageLevel.textContent = profile.villageDefenseLevel || "0";
  els.profileStatus.className = "profile-status";
  if (state.playerInfoSource === "online") {
    els.profileStatus.textContent = "资料已更新";
    els.profileStatus.classList.add("online");
  } else if (state.playerInfoSource === "cache") {
    els.profileStatus.textContent = "缓存资料";
    els.profileStatus.classList.add("cached");
  } else {
    els.profileStatus.textContent = "资料暂不可用";
  }
}

function renderOverall() {
  els.overallGrid.replaceChildren();
  const metrics = [
    ["总局数", state.stats.overall.total, ""],
    ["胜局", state.stats.overall.wins, "win"],
    ["负局", state.stats.overall.losses, "loss"],
    ["胜率", formatRate(state.stats.overall.winRate), "win"],
    ["当前连胜", state.stats.overall.current.count, "win"],
    ["历史最高", state.stats.overall.best.count, "warn"],
  ];
  for (const [label, value, className] of metrics) {
    const card = createElement("div", "metric");
    card.append(createElement("span", "", label), createElement("strong", className, value));
    els.overallGrid.append(card);
  }
}

function renderModes() {
  els.modeList.replaceChildren();
  if (state.stats.modes.length === 0) {
    els.modeList.append(createElement("div", "empty", "暂无可统计的模式。"));
    return;
  }

  for (const mode of state.stats.modes) {
    const card = createElement("article", "mode-card");
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.setAttribute("aria-label", `查看${mode.modeName}连胜可视化`);
    const head = createElement("div", "mode-head");
    head.append(
      createElement("span", "mode-name", mode.modeName),
      createElement("span", "tag", mode.category),
    );
    const values = createElement("div", "mode-stats");
    for (const [label, value, className] of [
      ["局数", mode.total, ""],
      ["胜率", formatRate(mode.winRate), "win"],
      ["当前", mode.current.count, "win"],
      ["最高", mode.best.count, "warn"],
    ]) {
      const item = createElement("div", "mode-stat");
      item.append(createElement("span", "", label), createElement("strong", className, value));
      values.append(item);
    }
    card.append(head, values, createElement("div", "range", `最高连胜区间：${streakRange(mode.best)}`));
    card.addEventListener("click", () => openVisualization(mode.mode));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openVisualization(mode.mode);
      }
    });
    els.modeList.append(card);
  }
}

function fillSelect(select, value, options) {
  select.replaceChildren();
  for (const [optionValue, text] of options) {
    const option = createElement("option", "", text);
    option.value = optionValue;
    option.selected = optionValue === value;
    select.append(option);
  }
}

function renderFilters() {
  fillSelect(els.modeFilter, state.filters.mode, [
    ["", "全部精确模式"],
    ...state.stats.modes.map((mode) => [mode.mode, mode.modeName]),
  ]);
  fillSelect(els.categoryFilter, state.filters.category, [
    ["", "全部大类"],
    ...[...new Set(state.records.map((record) => record.category))].map((value) => [value, value]),
  ]);
}

function renderRecords() {
  els.recordList.replaceChildren();
  const filtered = filterRecords(state.records, state.filters);
  els.recordCount.textContent = `找到 ${filtered.length} 条记录${filtered.length > DISPLAY_LIMIT ? `，显示前 ${DISPLAY_LIMIT} 条` : ""}`;

  if (filtered.length === 0) {
    els.recordList.append(createElement("div", "empty", "暂无匹配记录。"));
    return;
  }

  for (const record of filtered.slice(0, DISPLAY_LIMIT)) {
    const button = createElement("button", "record");
    button.type = "button";
    const resultClass = record.win === true ? "win" : record.win === false ? "loss" : "unknown";
    const head = createElement("div", "record-head");
    head.append(
      createElement("span", "record-name", getModeName(record.type)),
      createElement("span", `result ${resultClass}`, resultLabel(record.win)),
    );
    button.append(
      head,
      createElement("div", "record-meta", `${formatDate(record.date)} · ${record.matchId || "无 matchId"}`),
    );
    button.addEventListener("click", () => openDetails(record));
    els.recordList.append(button);
  }
}

function analyticsPlayerNames() {
  return [
    state.playerInfo?.name,
    state.account?.name,
    state.account?.playerName,
  ].filter(Boolean);
}

function analyticsSelection() {
  return filterAnalyticsRecords(state.records, state.analyticsFilters);
}

function resetAnalyticsExpand() {
  state.analyticsExpand = { ...DEFAULT_ANALYTICS_EXPAND };
}

function expandAnalyticsList(key, step) {
  state.analyticsExpand[key] = (state.analyticsExpand[key] ?? 0) + step;
  renderOneAnalyticsRank(key, state.lastAnalyticsModel ?? getAnalyticsModel());
}

function analyticsMetricClass(tone) {
  if (tone === "positive") return "metric positive";
  if (tone === "negative") return "metric negative";
  if (tone === "neutral") return "metric neutral";
  return "metric";
}

function createRankList(container, entries, emptyText, {
  valueLabel = "",
  initialLimit = 20,
  step = 0,
  onExpand,
} = {}) {
  container.replaceChildren();
  if (!entries.length) {
    container.append(createElement("div", "empty compact-empty", emptyText));
    return;
  }
  const limit = Math.max(0, initialLimit);
  entries.slice(0, limit).forEach((entry, index) => {
    const row = createElement("div", "analytics-rank-row");
    row.append(
      createElement("span", "analytics-rank-index", String(index + 1)),
      createElement("strong", "", entry.label ?? entry.name),
      createElement("span", "analytics-rank-value", `${formatNumber(entry.value ?? entry.count)}${valueLabel}`),
    );
    container.append(row);
  });
  if (step > 0 && entries.length > limit) {
    const remaining = entries.length - limit;
    const button = createElement(
      "button",
      "button compact analytics-expand-button",
      `展开 ${Math.min(step, remaining)} 个（剩余 ${remaining} 个）`,
    );
    button.type = "button";
    button.addEventListener("click", onExpand);
    container.append(button);
  }
}

function renderAnalyticsFilters() {
  fillSelect(els.analyticsMode, state.analyticsFilters.mode, [
    ["", "全部精确模式"],
    ...state.stats.modes.map((mode) => [mode.mode, mode.modeName]),
  ]);
  els.analyticsFrom.value = state.analyticsFilters.from;
  els.analyticsTo.value = state.analyticsFilters.to;
}

function analyticsCacheKey() {
  return JSON.stringify({
    uuid: state.account?.uuid ?? "",
    recordsVersion: state.recordsVersion,
    matchDetailsVersion: state.matchDetailsVersion,
    playerNames: analyticsPlayerNames().map((name) => String(name).trim().toLowerCase()),
    filters: state.analyticsFilters,
  });
}

function getAnalyticsModel() {
  const cacheKey = analyticsCacheKey();
  if (!state.analyticsDirty && state.analyticsCache.has(cacheKey)) {
    state.lastAnalyticsModel = state.analyticsCache.get(cacheKey);
    return state.lastAnalyticsModel;
  }

  const analytics = buildMatchAnalytics({
    records: state.records,
    matchDetails: state.matchDetails,
    playerNames: analyticsPlayerNames(),
    normalizedDetailCache: state.normalizedDetailCache,
    ...state.analyticsFilters,
  });
  const selection = analyticsSelection();
  const missingRecords = selection.records.filter((record) => !state.matchDetails[recordKey(record)]);

  const model = { analytics, selection, missingRecords, cacheKey };
  state.analyticsCache.set(cacheKey, model);
  if (state.analyticsCache.size > 8) {
    state.analyticsCache.delete(state.analyticsCache.keys().next().value);
  }
  state.analyticsDirty = false;
  state.lastAnalyticsModel = model;
  return model;
}

function renderAnalyticsSummary(model) {
  const { analytics, missingRecords } = model;
  const progress = state.analyticsProgress;
  els.analyticsStatus.textContent = state.analyticsLoading && progress
    ? `已完成 ${progress.completed}/${progress.total}，${progress.requestsPerSecond.toFixed(1)} 次/秒，并发 ${progress.concurrency}，预计剩余 ${formatDuration(progress.estimatedRemainingMs)}`
    : state.analyticsLoading
      ? "正在扫描本地缓存并准备补全详情…"
      : `已缓存详情 ${analytics.matchedDetails + analytics.unmatchedPlayer} 局，缺失 ${analytics.missingDetails} 局`;
  els.analyticsPrefetchButton.disabled =
    state.analyticsLoading ||
    state.loading ||
    !state.account?.uuid ||
    missingRecords.length === 0;
  els.analyticsCancelButton.classList.toggle("hidden", !state.analyticsLoading);

  els.analyticsOverview.replaceChildren(
    createElement("span", "", `范围内对局 ${analytics.totalRecords} 局`),
    createElement("span", "", `已识别本人 ${analytics.matchedDetails} 局`),
    createElement("span", "", `缺失详情 ${analytics.missingDetails} 局`),
    createElement("span", "", `未识别当前玩家 ${analytics.unmatchedPlayer} 局`),
    createElement("span", "", `无效日期 ${analytics.invalidDateCount} 条`),
    createElement("span", "", `未识别地图 ${analytics.unknownMapCount} 局`),
    createElement("span", "", `其它模式地图未统计 ${analytics.ignoredMapCategoryCount} 局`),
  );

  els.analyticsTotals.replaceChildren();
  for (const [label, value, tone] of [
    ["总击败", analytics.totals.kills, "positive"],
    ["最终击败", analytics.totals.finalKills, "positive"],
    ["死亡", analytics.totals.deaths, "negative"],
    ["最终死亡", analytics.totals.finalDeaths, "negative"],
    ["伤害", analytics.totals.damageDealt, "positive"],
    ["承伤", analytics.totals.damageTaken, "negative"],
    ["放置方块", analytics.totals.blocksPlaced, "neutral"],
    ["破坏方块", analytics.totals.blocksBroken, "neutral"],
  ]) {
    const item = createElement("div", analyticsMetricClass(tone));
    item.append(createElement("span", "", label), createElement("strong", "", formatNumber(value)));
    els.analyticsTotals.append(item);
  }
}

function renderOneAnalyticsRank(key, model) {
  const analytics = model?.analytics;
  if (!analytics) return;
  const configs = {
    resources: {
      container: els.analyticsResources,
      entries: analytics.resources,
      emptyText: "暂无资源收集数据。",
    },
    items: {
      container: els.analyticsItems,
      entries: analytics.items,
      emptyText: "暂无物品使用数据。",
      options: {
        initialLimit: state.analyticsExpand.items,
        step: 5,
        onExpand: () => expandAnalyticsList("items", 5),
      },
    },
    upgrades: {
      container: els.analyticsUpgrades,
      entries: analytics.upgrades,
      emptyText: "暂无升级数据。",
    },
    teammates: {
      container: els.analyticsTeammates,
      entries: analytics.teammates,
      emptyText: "暂无可识别的队友数据。",
      options: {
        valueLabel: " 局",
        initialLimit: state.analyticsExpand.teammates,
        step: 10,
        onExpand: () => expandAnalyticsList("teammates", 10),
      },
    },
    bedwarsMaps: {
      container: els.analyticsBedwarsMaps,
      entries: analytics.maps.bedwars,
      emptyText: "暂无起床战争地图数据。",
      options: {
        valueLabel: " 局",
        initialLimit: state.analyticsExpand.bedwarsMaps,
        step: 10,
        onExpand: () => expandAnalyticsList("bedwarsMaps", 10),
      },
    },
    skywarsMaps: {
      container: els.analyticsSkywarsMaps,
      entries: analytics.maps.skywars,
      emptyText: "暂无空岛相关地图数据。",
      options: {
        valueLabel: " 局",
        initialLimit: state.analyticsExpand.skywarsMaps,
        step: 10,
        onExpand: () => expandAnalyticsList("skywarsMaps", 10),
      },
    },
  };
  const config = configs[key];
  if (!config) return;
  createRankList(config.container, config.entries, config.emptyText, config.options);
}

function renderAnalyticsRanks(model) {
  for (const key of ["resources", "items", "upgrades", "teammates", "bedwarsMaps", "skywarsMaps"]) {
    renderOneAnalyticsRank(key, model);
  }
}

function renderAnalytics() {
  if (analyticsRenderFrame) {
    window.cancelAnimationFrame(analyticsRenderFrame);
    analyticsRenderFrame = 0;
  }
  renderAnalyticsFilters();
  const model = getAnalyticsModel();
  renderAnalyticsSummary(model);
  renderAnalyticsRanks(model);
}

function scheduleAnalyticsRender() {
  if (analyticsRenderFrame) window.cancelAnimationFrame(analyticsRenderFrame);
  renderAnalyticsFilters();
  if (!state.analyticsLoading) {
    els.analyticsStatus.textContent = "正在统计本地详情…";
  }
  analyticsRenderFrame = window.requestAnimationFrame(() => {
    analyticsRenderFrame = 0;
    if (state.activeTab === "analytics") {
      renderAnalytics();
    } else {
      state.analyticsDirty = true;
    }
  });
}

function renderAnalyticsIfVisible() {
  if (state.activeTab === "analytics") {
    scheduleAnalyticsRender();
  } else {
    state.analyticsDirty = true;
  }
}

function setRecords(records) {
  state.records = sortRecordsNewestFirst(records);
  invalidateAnalyticsCache({ recordsChanged: true });
  state.stats = buildModeStats(state.records);
  renderOverall();
  renderModes();
  renderFilters();
  renderRecords();
  renderAnalyticsIfVisible();
  els.visualizeAllButton.disabled = state.records.length === 0;
  if (state.visualization.open) renderVisualization();
}

function visualizationPlayerName() {
  return state.playerInfo?.name || state.account?.name || "未知玩家";
}

function visualizationRangeOptions() {
  const current = state.visualization;
  if (current.rangePreset === "all") {
    const base = buildVisualizationModel(state.records, { mode: current.mode, presetDays: 90 });
    return { from: base.range.minimum, to: base.range.maximum };
  }
  if (current.rangePreset === "custom") {
    return { from: current.from, to: current.to };
  }
  return { presetDays: Number(current.rangePreset) || 90 };
}

function createVisualizationMetric(label, value, className = "") {
  const card = createElement("div", "metric");
  card.append(createElement("span", "", label), createElement("strong", className, value));
  return card;
}

function renderVisualizationSummary(model) {
  const rangeWins = model.days.reduce((sum, day) => sum + day.wins, 0);
  const rangeLosses = model.days.reduce((sum, day) => sum + day.losses, 0);
  els.visualizationSummary.replaceChildren(
    createVisualizationMetric("范围内对局", rangeWins + rangeLosses + model.unknownInRange),
    createVisualizationMetric("范围内胜利", rangeWins, "win"),
    createVisualizationMetric("范围内失败", rangeLosses, "loss"),
    createVisualizationMetric("当前连胜", model.current.count, "win"),
    createVisualizationMetric("历史最高", model.best.count, "warn"),
  );

  const notices = [];
  if (model.best.count && !model.bestInRange) notices.push("历史最高连胜不在当前范围，可点击“定位历史最高”。");
  if (model.current.count && !model.currentInRange) notices.push("当前连胜跨度不在当前范围。");
  if (model.spans.some((span) => span.leftTruncated || span.rightTruncated)) {
    notices.push("边缘箭头表示连胜跨度超出当前显示范围。");
  }
  if (model.unknownInRange) notices.push(`范围内有 ${model.unknownInRange} 条未知结果，已按中断连胜处理。`);
  if (model.invalidDateCount) notices.push(`已忽略 ${model.invalidDateCount} 条无效日期记录。`);
  els.visualizationNotice.textContent = notices.join(" ");
}

function renderVisualizationModeOptions() {
  fillSelect(els.visualizationMode, state.visualization.mode, [
    ["all", "所有模式"],
    ...state.stats.modes.map((mode) => [mode.mode, mode.modeName]),
  ]);
}

function renderVisualizationLegend() {
  els.visualizationLegend.replaceChildren();
  for (const [label, color] of getVisualizationLegendItems(state.visualization.chartType)) {
    const item = createElement("span", "visualization-legend-item");
    const swatch = createElement("i", "visualization-legend-swatch");
    swatch.style.background = color;
    item.append(swatch, createElement("span", "", label));
    els.visualizationLegend.append(item);
  }
}

function renderVisualizationFixedLabels(model) {
  const labels = getVisualizationFixedLabels(model, {
    chartType: state.visualization.chartType,
    playerName: visualizationPlayerName(),
  });
  const layout = getVisualizationFixedLabelLayout(state.visualization.chartType);
  els.visualizationChartTitle.textContent = labels.title;
  els.visualizationChartSubtitle.textContent = labels.subtitle;
  els.visualizationTrackLabel.textContent = labels.trackLabel;
  els.visualizationTrackLabel.style.top = `${layout.trackTop}px`;
  els.visualizationPrimaryAxisLabel.textContent = labels.primaryAxisLabel;
  els.visualizationPrimaryAxisLabel.style.top = `${layout.primaryTop}px`;
  els.visualizationPrimaryAxisLabel.style.color = state.visualization.chartType === "line" ? "#0969da" : "#16a34a";
  els.visualizationSecondaryAxisLabel.textContent = labels.secondaryAxisLabel;
  els.visualizationSecondaryAxisLabel.style.top = `${layout.secondaryTop}px`;
  els.visualizationSecondaryAxisLabel.classList.toggle("hidden", !labels.secondaryAxisLabel);
}

function visualizationViewportWidth() {
  return Math.max(320, Math.floor(els.visualizationChartScroller.clientWidth || 0));
}

function hideVisualizationTooltip() {
  els.visualizationTooltip.classList.add("hidden");
}

function bindVisualizationHover(chart) {
  const { svg, hits } = chart;
  let activeSpanElement = null;
  const setActiveSpan = (hit) => {
    const nextElement = hit?.kind === "span" ? hit.element : null;
    if (nextElement === activeSpanElement) return;
    activeSpanElement?.classList.remove("is-hovered");
    nextElement?.classList.add("is-hovered");
    activeSpanElement = nextElement;
  };
  svg.addEventListener("pointermove", (event) => {
    if (!hits.length) return;
    const rect = svg.getBoundingClientRect();
    const viewX = ((event.clientX - rect.left) / rect.width) * chart.width;
    const viewY = ((event.clientY - rect.top) / rect.height) * chart.height;
    const spanHits = hits
      .filter((hit) => (
        hit.kind === "span" &&
        viewX >= hit.x1 - 8 &&
        viewX <= hit.x2 + 8 &&
        viewY >= hit.hitTop &&
        viewY <= hit.hitBottom
      ))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    let nearest = spanHits[0];
    if (!nearest) {
      nearest = hits.find((hit) => hit.kind !== "span") ?? hits[0];
      for (const hit of hits.filter((item) => item.kind !== "span")) {
        if (Math.abs(hit.x - viewX) < Math.abs(nearest.x - viewX)) nearest = hit;
      }
    }
    setActiveSpan(nearest);
    els.visualizationTooltip.textContent = nearest.text;
    els.visualizationTooltip.classList.remove("hidden");
    const position = calculateTooltipPosition({
      clientX: event.clientX,
      clientY: event.clientY,
      tooltipWidth: els.visualizationTooltip.offsetWidth || 260,
      tooltipHeight: els.visualizationTooltip.offsetHeight || 110,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    els.visualizationTooltip.style.left = `${position.left}px`;
    els.visualizationTooltip.style.top = `${position.top}px`;
  });
  svg.addEventListener("pointerleave", () => {
    setActiveSpan(null);
    hideVisualizationTooltip();
  });
}

function renderVisualization({
  scrollRatio = null,
  pointerOffset = 0,
  preserveScroll = false,
} = {}) {
  if (!state.visualization.open) return;
  try {
    const previousScrollLeft = els.visualizationChartScroller.scrollLeft;
    const model = buildVisualizationModel(state.records, {
      mode: state.visualization.mode,
      ...visualizationRangeOptions(),
    });
    const viewportWidth = visualizationViewportWidth();
    state.visualization.fitZoom = calculateFitZoom(model, viewportWidth);
    state.visualization.zoomMultiplier = clampZoomMultiplier(state.visualization.zoomMultiplier);
    state.visualization.model = model;
    state.visualization.from = model.range.from;
    state.visualization.to = model.range.to;
    els.visualizationTitle.textContent = `${model.modeName}连胜可视化`;
    els.visualizationRange.value = state.visualization.rangePreset;
    els.visualizationFrom.value = model.range.from;
    els.visualizationTo.value = model.range.to;
    els.visualizationZoom.max = String(Math.max(8, Math.ceil(state.visualization.zoomMultiplier)));
    els.visualizationZoom.value = String(state.visualization.zoomMultiplier);
    els.visualizationZoomValue.textContent = `${Math.round(state.visualization.zoomMultiplier * 100)}%`;
    els.visualizationFrom.disabled = state.visualization.rangePreset !== "custom";
    els.visualizationTo.disabled = state.visualization.rangePreset !== "custom";
    els.visualizationBarsButton.classList.toggle("active", state.visualization.chartType === "bars");
    els.visualizationLineButton.classList.toggle("active", state.visualization.chartType === "line");
    updateSlidingIndicator(els.visualizationChartType, els.visualizationChartType.querySelector("button.active"));
    els.visualizationLocateBest.disabled = model.best.count === 0;
    els.visualizationExportPng.disabled = model.validCount === 0;
    els.visualizationExportSvg.disabled = model.validCount === 0;
    renderVisualizationModeOptions();
    renderVisualizationSummary(model);
    renderVisualizationFixedLabels(model);
    renderVisualizationLegend();
    state.visualization.chart = renderVisualizationSvg(els.visualizationChart, model, {
      renderMode: "preview",
      chartType: state.visualization.chartType,
      playerName: visualizationPlayerName(),
      viewportWidth,
      fitZoom: state.visualization.fitZoom,
      zoomMultiplier: state.visualization.zoomMultiplier,
    });
    bindVisualizationHover(state.visualization.chart);
    requestAnimationFrame(() => {
      if (scrollRatio !== null) {
        els.visualizationChartScroller.scrollLeft =
          scrollRatio * els.visualizationChartScroller.scrollWidth - pointerOffset;
      } else if (preserveScroll) {
        els.visualizationChartScroller.scrollLeft = previousScrollLeft;
      } else {
        els.visualizationChartScroller.scrollLeft = 0;
      }
    });
  } catch (error) {
    els.visualizationNotice.textContent = errorMessage(error);
    els.visualizationChart.replaceChildren(createElement("div", "empty", errorMessage(error)));
  }
}

function openVisualization(mode = "all") {
  if (!state.records.length) return;
  state.visualization.open = true;
  state.visualization.mode = mode;
  state.visualization.rangePreset = DEFAULT_VISUALIZATION_RANGE_PRESET;
  state.visualization.from = "";
  state.visualization.to = "";
  state.visualization.fitZoom = 1;
  state.visualization.zoomMultiplier = 1;
  els.visualizationDialog.classList.remove("hidden");
  renderVisualization();
}

function closeVisualization() {
  state.visualization.open = false;
  state.visualization.model = null;
  state.visualization.chart = null;
  hideVisualizationTooltip();
  els.visualizationDialog.classList.add("hidden");
}

function locateBestStreak() {
  const model = state.visualization.model;
  if (!model?.best?.count) return;
  const bestFrom = getLocalDateKey(model.best.start?.date);
  const bestTo = getLocalDateKey(model.best.end?.date);
  state.visualization.rangePreset = "custom";
  state.visualization.from = addLocalDays(bestFrom, -3) ?? bestFrom;
  state.visualization.to = addLocalDays(bestTo, 3) ?? bestTo;
  state.visualization.zoomMultiplier = 1;
  renderVisualization();
}

async function exportVisualization(format) {
  const model = state.visualization.model;
  if (!model) return;
  const title = `${visualizationPlayerName()} · ${model.modeName} · ${state.visualization.chartType === "line" ? "累计连胜" : "每日胜负频次"}`;
  const description = `${model.range.from} 至 ${model.range.to}，当前连胜 ${model.current.count}，历史最高 ${model.best.count}`;
  const chart = createVisualizationSvg(model, {
    renderMode: "export",
    chartType: state.visualization.chartType,
    playerName: visualizationPlayerName(),
  });
  const svgData = serializeVisualizationSvg(chart.svg, { title, description });
  const defaultName = buildVisualizationExportName({
    playerName: visualizationPlayerName(),
    modeName: model.modeName,
    chartType: state.visualization.chartType,
    from: model.range.from,
    to: model.range.to,
    format,
  });

  els.visualizationExportPng.disabled = true;
  els.visualizationExportSvg.disabled = true;
  try {
    const data = format === "png"
      ? await svgToPngBase64(svgData, chart.width, chart.height, 2)
      : svgData;
    const result = await desktop.exportVisualization({ format, defaultName, data });
    if (!result.canceled) {
      els.visualizationNotice.textContent = `图表已导出至 ${result.filePath}`;
    }
  } catch (error) {
    els.visualizationNotice.textContent = `导出失败：${errorMessage(error)}`;
  } finally {
    els.visualizationExportPng.disabled = false;
    els.visualizationExportSvg.disabled = false;
  }
}

function applyAccountPayload(payload, { source = payload?.playerInfoSource ?? "cache" } = {}) {
  const account = payload?.selectedAccount ?? payload?.account;
  const previousUuid = state.account?.uuid ?? "";
  const nextUuid = account?.uuid ?? "";
  if (previousUuid !== nextUuid) resetAnalyticsExpand();
  state.accounts = Array.isArray(payload?.accounts) ? payload.accounts : account ? [account] : [];
  state.bindingRequired = Boolean(payload?.bindingRequired) || !account;
  if (!account) {
    state.account = null;
    state.playerInfo = null;
    state.playerInfoSource = "unavailable";
    state.analyticsLoading = false;
    state.analyticsProgress = null;
    closeVisualization();
    els.detailDialog.classList.add("hidden");
    state.detailCache.clear();
    state.activeDetailKey = "";
    setMatchDetails({}, { clearNormalizedDetails: true });
    renderProfile();
    setRecords([]);
    setLoading(state.loading);
    return null;
  }

  state.bindingRequired = false;
  state.account = account;
  state.analyticsLoading = false;
  state.analyticsProgress = null;
  state.playerInfo = payload.cache?.playerInfo ?? null;
  state.playerInfoSource = state.playerInfo ? source : "unavailable";
  setMatchDetails(payload.cache?.matchDetails ?? {}, { clearNormalizedDetails: previousUuid !== nextUuid });
  renderProfile();
  setRecords(payload.cache?.records ?? []);
  setLoading(state.loading);
  return payload.cache;
}

function openBindingDialog() {
  closeAccountMenu();
  els.bindingDialogStatus.textContent = "绑定码仅用于本次绑定，不会保存在本地。";
  els.bindingDialogStatus.className = "binding-dialog-status";
  els.bindingDialog.classList.remove("hidden");
  window.requestAnimationFrame(() => els.bindingCode.focus());
}

function closeBindingDialog() {
  if (state.bindingOperation) return;
  els.bindingDialog.classList.add("hidden");
  els.bindingCode.value = "";
  els.bindingDialogStatus.textContent = "绑定码仅用于本次绑定，不会保存在本地。";
  els.bindingDialogStatus.className = "binding-dialog-status";
}

function setBindingOperation(loading) {
  state.bindingOperation = loading;
  els.bindingCode.disabled = loading;
  els.bindingSubmitButton.disabled = loading;
  els.bindingOfficialButton.disabled = loading;
  els.bindingDialogClose.disabled = loading;
  setLoading(state.loading);
  renderAccountMenu();
}

async function bindAccount() {
  const bindCode = els.bindingCode.value.trim();
  if (!bindCode) {
    els.bindingDialogStatus.textContent = "请输入游戏内通过 /bbind 获取的临时绑定码。";
    els.bindingDialogStatus.className = "binding-dialog-status error";
    els.bindingCode.focus();
    return;
  }

  setBindingOperation(true);
  els.bindingDialogStatus.textContent = "正在提交绑定码并验证账号列表…";
  els.bindingDialogStatus.className = "binding-dialog-status";
  try {
    await desktop.cancelFetch();
    const result = await desktop.bindAccount(bindCode);
    const uuid = result?.selectedAccount?.uuid || result?.account?.uuid || "";
    setBindingOperation(false);
    closeBindingDialog();
    await loadCurrentAccount({ uuid });
    setStatus(`已绑定并切换至 ${state.account?.name || "新游戏账号"}。点击“更新”开始抓取战绩。`, "success");
  } catch (error) {
    els.bindingDialogStatus.textContent = errorMessage(error);
    els.bindingDialogStatus.className = "binding-dialog-status error";
  } finally {
    setBindingOperation(false);
  }
}

async function openOfficialBinding() {
  closeAccountMenu();
  closeBindingDialog();
  setBindingOperation(true);
  const currentUuid = state.account?.uuid ?? "";
  setStatus("已打开官网绑定页，关闭窗口后将刷新游戏账号列表。");
  try {
    await desktop.openOfficialBinding();
    await loadCurrentAccount({ uuid: currentUuid, fallbackToDefault: true });
  } catch (error) {
    setStatus(`打开官网绑定页失败：${errorMessage(error)}`, "error");
  } finally {
    setBindingOperation(false);
  }
}

async function unbindAccount(account) {
  closeAccountMenu();
  const confirmed = window.confirm(
    `确定要解绑游戏账号“${account.name || account.uuid}”吗？\n\n本地玩家资料和战绩缓存会保留，未来重新绑定后仍可继续使用。`,
  );
  if (!confirmed) return;

  state.accountSwitching = true;
  state.analyticsLoading = false;
  state.analyticsProgress = null;
  setLoading(true);
  closeVisualization();
  els.detailDialog.classList.add("hidden");
  state.detailCache.clear();
  state.activeDetailKey = "";
  setStatus(`正在解绑 ${account.name || account.uuid}…`);
  try {
    await desktop.cancelFetch();
    await desktop.cancelMatchDetails();
    const result = await desktop.unbindAccount(account.uuid);
    const nextAccount = chooseAccountAfterUnbind({
      accounts: result.accounts,
      currentUuid: state.account?.uuid ?? "",
      unboundUuid: account.uuid,
    });
    const nextUuid = nextAccount?.uuid ?? "";
    await loadCurrentAccount({ uuid: nextUuid });
    setStatus(
      result.bindingRequired
        ? "已解绑最后一个游戏账号，请绑定角色后再开始统计战绩。"
        : `已解绑 ${account.name || account.uuid}，本地缓存已保留。`,
      "success",
    );
  } catch (error) {
    setStatus(`解绑失败：${errorMessage(error)}`, "error");
  } finally {
    state.accountSwitching = false;
    setLoading(false);
    renderProfile();
  }
}

async function loadCurrentAccount({
  autoUpdate = false,
  uuid = "",
  fallbackToDefault = false,
} = {}) {
  setLoading(true);
  setStatus("正在读取当前游戏账号与玩家资料…");
  try {
    const result = await desktop.loadAccount(uuid);
    const cache = applyAccountPayload(result);
    setLoading(false);

    if (result.bindingRequired) {
      setStatus("当前布吉岛账号尚未绑定游戏角色，请先完成绑定。");
      return;
    }

    if (autoUpdate && state.autoUpdateEnabled && state.account?.uuid) {
      await runRecordsAction("update", { automatic: true });
      return;
    }

    if (result.profileError) {
      const prefix = cache?.records?.length
        ? `已载入本地记录 ${cache.records.length} 条。`
        : "当前账号暂无本地记录。";
      setStatus(`${prefix} 玩家资料刷新失败，已使用${cache?.playerInfo ? "缓存资料" : "基础账号信息"}。`, "error");
    } else if (cache?.records?.length) {
      setStatus(`玩家资料已更新，已载入本地记录 ${cache.records.length} 条。`, "success");
    } else {
      setStatus("玩家资料已更新，当前账号暂无本地记录。", "success");
    }
  } catch (error) {
    if (fallbackToDefault && uuid) {
      await loadCurrentAccount({ autoUpdate });
      return;
    }
    setStatus(errorMessage(error), "error");
  } finally {
    setLoading(false);
  }
}

async function switchAccount(uuid) {
  const nextUuid = String(uuid || "");
  if (!nextUuid || nextUuid === state.account?.uuid) {
    renderAccountMenu();
    return;
  }

  state.accountSwitching = true;
  state.analyticsLoading = false;
  state.analyticsProgress = null;
  setLoading(true);
  closeVisualization();
  els.detailDialog.classList.add("hidden");
  state.detailCache.clear();
  state.activeDetailKey = "";
  setStatus("正在切换游戏账号…");
  try {
    await desktop.cancelFetch();
    await desktop.cancelMatchDetails();
    const result = await desktop.loadAccount(nextUuid);
    const cache = applyAccountPayload(result);
    if (result.profileError) {
      const prefix = cache?.records?.length
        ? `已切换账号并载入本地记录 ${cache.records.length} 条。`
        : "已切换账号，当前账号暂无本地记录。";
      setStatus(`${prefix} 玩家资料刷新失败，已使用${cache?.playerInfo ? "缓存资料" : "基础账号信息"}。`, "error");
    } else if (cache?.records?.length) {
      setStatus(`已切换账号，玩家资料已更新，已载入本地记录 ${cache.records.length} 条。`, "success");
    } else {
      setStatus("已切换账号，玩家资料已更新，当前账号暂无本地记录。", "success");
    }
  } catch (error) {
    setStatus(errorMessage(error), "error");
    renderAccountMenu();
  } finally {
    state.accountSwitching = false;
    setLoading(false);
    renderProfile();
  }
}

async function login() {
  setStatus("请在弹出的窗口中登录布吉岛用户中心。");
  try {
    const status = await desktop.login();
    state.authenticated = Boolean(status.authenticated);
    renderAuthControls();
    await loadCurrentAccount();
  } catch (error) {
    setStatus(errorMessage(error), "error");
  }
}

async function logout() {
  await desktop.logout();
  closeVisualization();
  state.authenticated = false;
  state.accounts = [];
  state.account = null;
  state.bindingRequired = false;
  state.accountMenuOpen = false;
  state.playerInfo = null;
  state.playerInfoSource = "unavailable";
  state.analyticsLoading = false;
  state.analyticsProgress = null;
  state.detailCache.clear();
  state.activeDetailKey = "";
  setMatchDetails({}, { clearNormalizedDetails: true });
  renderAuthControls();
  renderProfile();
  setRecords([]);
  setLoading(false);
  setStatus("已退出登录，并清理程序内的布吉岛登录态。");
}

function readPageDelayMs() {
  const delaySeconds = Number(els.pageDelay.value);
  const pageDelayMs = Math.round(
    Math.min(
      Math.max(
        Number.isFinite(delaySeconds) ? delaySeconds : DEFAULT_PAGE_DELAY_SECONDS,
        DEFAULT_PAGE_DELAY_SECONDS,
      ),
      60,
    ) * 1000,
  );
  els.pageDelay.value = String(pageDelayMs / 1000);
  return pageDelayMs;
}

function readFetchOptions() {
  const cutoffDate = parseDateInputToKey(els.cutoffDate.value);
  if (!cutoffDate) throw new Error("请选择有效截止日期。");
  const pageDelayMs = readPageDelayMs();
  return {
    uuid: state.account?.uuid ?? "",
    playerName: state.account?.name ?? "",
    cutoffDate,
    pageDelayMs,
  };
}

function stopLabel(stoppedBy) {
  return {
    "known-record": "命中本地缓存",
    "cutoff-date-passed": "已越过截止日期",
    empty: "没有更多记录",
    duplicates: "连续重复分页",
    limit: "达到页数上限",
  }[stoppedBy] || stoppedBy;
}

async function runRecordsAction(mode, { automatic = false } = {}) {
  if (!state.account?.uuid || state.loading) return;
  const actionUuid = state.account.uuid;

  setLoading(true);
  setStatus(
    mode === "update"
      ? automatic ? "启动自动更新中…" : "准备更新最新战绩…"
      : "准备重新抓取战绩…",
  );
  try {
    const options = readFetchOptions();
    const result =
      mode === "update"
        ? await desktop.updateRecords(options)
        : await desktop.refetchRecords(options);
    if (state.account?.uuid !== actionUuid) return;
    setRecords(result.records);
    setStatus(
      `${mode === "update" ? "更新" : "重新抓取"}完成：本次新增 ${result.fetchedRecords} 条，缓存共 ${result.cachedRecords} 条；扫描 ${result.scannedCount} 条、${result.pagesFetched} 页（${stopLabel(result.stoppedBy)}）。`,
      "success",
    );
  } catch (error) {
    if (state.account?.uuid !== actionUuid) return;
    setStatus(errorMessage(error), error?.name === "AbortError" ? "" : "error");
  } finally {
    if (!state.accountSwitching && state.account?.uuid === actionUuid) setLoading(false);
  }
}

async function clearRecords() {
  if (!state.account?.uuid) return;
  try {
    await desktop.clearRecords(state.account.uuid);
    setMatchDetails({}, { clearNormalizedDetails: true });
    state.detailCache.clear();
    setRecords([]);
    setStatus("已清空当前账号的战绩记录，玩家资料已保留。");
  } catch (error) {
    setStatus(errorMessage(error), "error");
  }
}

async function prefetchAnalyticsDetails() {
  if (!state.account?.uuid || state.analyticsLoading) return;
  const actionUuid = state.account.uuid;
  const selection = analyticsSelection();
  const missingRecords = selection.records.filter((record) => !state.matchDetails[recordKey(record)]);
  if (!missingRecords.length) return;

  state.analyticsLoading = true;
  state.analyticsProgress = null;
  renderAnalytics();
  setStatus(`正在扫描本地缓存，准备补全 ${missingRecords.length} 局缺失详情…`);
  try {
    const result = await desktop.prefetchMatchDetails({
      uuid: actionUuid,
      records: selection.records,
      pageDelayMs: readPageDelayMs(),
    });
    if (state.account?.uuid !== actionUuid) return;
    setMatchDetails(result.cache?.matchDetails ?? state.matchDetails);
    renderAnalyticsIfVisible();
    setStatus(
      `对局详情补全完成：本地已有 ${result.cached} 局，内嵌详情 ${result.embedded} 局，请求补全 ${result.requested} 局，限流重试 ${result.retryCount} 次。`,
      "success",
    );
  } catch (error) {
    if (state.account?.uuid !== actionUuid) return;
    if (error?.name === "AbortError") {
      const cache = await desktop.loadCache(actionUuid);
      setMatchDetails(cache?.matchDetails ?? state.matchDetails);
      renderAnalyticsIfVisible();
      setStatus("已取消详情补全，已完成的详情已保存，可稍后继续。");
    } else {
      setStatus(errorMessage(error), "error");
    }
  } finally {
    if (state.account?.uuid === actionUuid) {
      state.analyticsLoading = false;
      state.analyticsProgress = null;
      renderAnalyticsIfVisible();
    }
  }
}

function createDetailStat(label, value, className = "") {
  const item = createElement("div", `match-stat ${className}`.trim());
  item.append(createElement("span", "", label), createElement("strong", "", formatNumber(value)));
  return item;
}

function createDetailSection(title, content, className = "") {
  const section = createElement("section", `match-detail-section ${className}`.trim());
  section.append(createElement("h3", "", title), content);
  return section;
}

function createEntryList(entries, emptyText) {
  const list = createElement("div", "match-entry-list");
  if (!entries?.length) {
    list.append(createElement("p", "match-empty-note", emptyText));
    return list;
  }
  for (const entry of entries) {
    const chip = createElement("span", "match-entry");
    chip.append(
      createElement("i", "", String(entry.label || "?").slice(0, 1)),
      createElement("span", "", entry.label),
      createElement("strong", "", formatNumber(entry.value)),
    );
    list.append(chip);
  }
  return list;
}

function createTeamCard(team) {
  const card = createElement("article", "match-team-card");
  card.style.setProperty("--team-color", team.color);
  const head = createElement("div", "match-team-head");
  const name = createElement("strong", "match-team-name");
  name.append(createElement("i", "match-team-dot"), createElement("span", "", team.name));
  head.append(
    name,
    createElement(
      "span",
      `match-team-result ${team.isWinner ? "winner" : "loser"}`,
      team.isWinner ? "胜方队伍" : "未获胜",
    ),
  );
  const stats = createElement("div", "match-team-stats");
  for (const [label, value] of [
    ["击败", team.kills],
    ["最终击败", team.finalKills],
    ["死亡", team.deaths],
    ["最终死亡", team.finalDeaths],
    ["方块", `${formatNumber(team.blocksPlaced)}/${formatNumber(team.blocksBroken)}`],
  ]) {
    const chip = createElement("span", "match-team-stat");
    chip.append(createElement("span", "", label), createElement("strong", "", value));
    stats.append(chip);
  }
  card.append(head, stats);
  return card;
}

function createPlayerCard(player, teams) {
  const team = teams.find((entry) => entry.key === player.teamKey);
  const card = createElement("article", "match-player-card");
  card.style.setProperty("--team-color", team?.color ?? "#94a3b8");

  const head = createElement("div", "match-player-head");
  head.append(
    createElement("strong", "", player.name),
    createElement("span", "match-player-team", team?.name ?? "未知队伍"),
  );

  const primary = createElement("div", "match-primary-stats");
  primary.append(
    createDetailStat("击败", player.kills),
    createDetailStat("最终击败", player.finalKills),
    createDetailStat("死亡次数", player.deaths),
    createDetailStat("最终死亡", player.finalDeaths),
  );

  const combat = createElement("div", "match-subcard");
  combat.append(
    createElement("h4", "", "战斗伤害"),
    createElement("div", "match-paired-stats"),
  );
  combat.lastElementChild.append(
    createDetailStat("造成伤害", player.damageDealt),
    createDetailStat("承受伤害", player.damageTaken),
  );

  const blocks = createElement("div", "match-subcard");
  blocks.append(
    createElement("h4", "", "方块交互"),
    createElement("div", "match-paired-stats"),
  );
  blocks.lastElementChild.append(
    createDetailStat("放置方块", player.blocksPlaced),
    createDetailStat("破坏方块", player.blocksBroken),
  );

  const middle = createElement("div", "match-middle-grid");
  middle.append(combat, blocks);

  const resources = createElement("div", "match-subcard");
  resources.append(
    createElement("h4", "", "资源收集"),
    createEntryList(player.resources, "本局没有资源收集记录。"),
  );
  const items = createElement("div", "match-subcard");
  items.append(
    createElement("h4", "", "使用物品"),
    createEntryList(player.items, "本局没有物品使用记录。"),
  );
  const upgrades = createElement("div", "match-subcard");
  upgrades.append(
    createElement("h4", "", "升级"),
    createEntryList(player.upgrades, "本局没有升级记录。"),
  );
  const bottom = createElement("div", "match-bottom-grid");
  bottom.append(resources, items, upgrades);

  card.append(head, primary, middle, bottom);
  return card;
}

function renderDetailMessage(message, kind = "") {
  els.detailBody.replaceChildren(createElement("div", `match-detail-message ${kind}`.trim(), message));
}

function renderDetailLoading(record) {
  const root = createElement("div", "match-detail-view");
  const hero = createElement("section", "match-hero loading");
  const heroText = createElement("div", "match-hero-text");
  heroText.append(
    createElement("span", "match-hero-kicker", getModeName(record.type)),
    createElement("h2", "", "正在加载对局详情"),
  );
  const meta = createElement("div", "match-hero-meta");
  for (const text of [
    formatDate(record.date),
    record.matchId ? `ID ${record.matchId}` : "",
    resultLabel(record.win),
  ].filter(Boolean)) {
    meta.append(createElement("span", "", text));
  }
  heroText.append(meta);
  hero.append(
    heroText,
    createElement(
      "strong",
      `match-result-badge ${record.win === true ? "win" : record.win === false ? "loss" : "unknown"}`,
      resultLabel(record.win),
    ),
  );
  root.append(
    hero,
    createElement("div", "match-detail-message", "正在读取服务器对局详情，加载完成后会自动显示。"),
  );
  els.detailBody.replaceChildren(root);
}

function renderMatchDetail(details, record) {
  const detail = normalizeMatchDetail(details, record);
  const root = createElement("div", "match-detail-view");

  const hero = createElement("section", "match-hero");
  const heroText = createElement("div", "match-hero-text");
  heroText.append(
    createElement("span", "match-hero-kicker", detail.modeName),
    createElement("h2", "", detail.title),
  );
  const meta = createElement("div", "match-hero-meta");
  for (const text of [
    formatDate(detail.date),
    `玩家 ${detail.playerCount} 人`,
    detail.winnerTeamName ? `胜方 ${detail.winnerTeamName}` : "",
    detail.matchId ? `ID ${detail.matchId}` : "",
  ].filter(Boolean)) {
    meta.append(createElement("span", "", text));
  }
  heroText.append(meta);
  hero.append(
    heroText,
    createElement(
      "strong",
      `match-result-badge ${detail.win === true ? "win" : detail.win === false ? "loss" : "unknown"}`,
      resultLabel(detail.win),
    ),
  );
  root.append(hero);

  const teamGrid = createElement("div", "match-team-grid");
  if (detail.teams.length) {
    detail.teams.forEach((team) => teamGrid.append(createTeamCard(team)));
  } else {
    teamGrid.append(createElement("div", "match-empty-note match-empty-block", "此对局没有可识别的队伍数据。"));
  }
  root.append(createDetailSection("队伍概览", teamGrid));

  const playerGrid = createElement("div", "match-player-grid");
  if (detail.players.length) {
    detail.players.forEach((player) => playerGrid.append(createPlayerCard(player, detail.teams)));
  } else {
    playerGrid.append(createElement("div", "match-empty-note match-empty-block", "此对局没有可识别的玩家数据。"));
  }
  root.append(createDetailSection("玩家表现", playerGrid));

  const raw = createElement("details", "match-raw-detail");
  raw.append(createElement("summary", "", "查看原始数据"));
  const pre = createElement("pre");
  pre.textContent = JSON.stringify(details, null, 2);
  raw.append(pre);
  root.append(raw);

  els.detailBody.replaceChildren(root);
}

async function openDetails(record) {
  const key = `${record.matchId}::${record.date}`;
  const actionUuid = state.account?.uuid ?? "";
  const existingPersistedDetail = state.matchDetails[key]?.raw;
  state.activeDetailKey = key;
  els.detailTitle.textContent = `${getModeName(record.type)} · ${resultLabel(record.win)}`;
  renderDetailLoading(record);
  els.detailDialog.classList.remove("hidden");
  try {
    let details = state.detailCache.get(key) ?? existingPersistedDetail;
    if (!details) {
      details = await desktop.getMatchDetails({
        ...record,
        uuid: actionUuid,
      });
      if (state.activeDetailKey !== key) return;
      if (state.account?.uuid !== actionUuid) return;
      state.detailCache.set(key, details);
    } else {
      state.detailCache.set(key, details);
    }
    if (state.activeDetailKey !== key) return;
    if (state.account?.uuid !== actionUuid) return;
    if (existingPersistedDetail !== details) {
      state.matchDetails[key] = {
        fetchedAt: new Date().toISOString(),
        raw: details,
      };
      invalidateAnalyticsCache({ matchDetailsChanged: true });
      renderAnalyticsIfVisible();
    }
    renderMatchDetail(details, record);
  } catch (error) {
    if (state.activeDetailKey !== key) return;
    renderDetailMessage(errorMessage(error), "error");
  }
}

function bindEvents() {
  desktop.onAccountCache((payload) => {
    const cache = applyAccountPayload(payload, { source: "cache" });
    if (payload?.bindingRequired) {
      setStatus("当前布吉岛账号尚未绑定游戏角色，请先完成绑定。");
    } else if (cache?.records?.length) {
      setStatus(`已载入本地记录 ${cache.records.length} 条，正在刷新玩家资料…`);
    } else {
      setStatus("已读取当前游戏账号，正在刷新玩家资料…");
    }
  });

  desktop.onRecordsProgress((progress) => {
    if (progress.uuid && progress.uuid !== state.account?.uuid) return;
    const speed = progress.requestsPerSecond
      ? `，速度 ${progress.requestsPerSecond.toFixed(1)} 次/秒`
      : "";
    const retry = progress.retryCount ? `，限流重试 ${progress.retryCount} 次` : "";
    if (progress.phase === "delay") {
      setStatus(`已扫描 ${progress.scannedCount} 条，保留 ${progress.count} 条；等待 ${(progress.waitMs / 1000).toFixed(1)} 秒后读取第 ${progress.page} 页${speed}${retry}…`);
      return;
    }
    if (progress.phase === "rate-limit") {
      setStatus(`服务器提示请求频繁，等待 ${Math.ceil(progress.waitMs / 1000)} 秒后重试第 ${progress.page} 页（${progress.attempt}/${progress.maxAttempts}）${speed}${retry}。`);
      return;
    }
    const suffix = progress.phase === "received" ? `，新增 ${progress.added} 条` : "";
    const known = progress.pageKnownRecordHits ? `，命中缓存 ${progress.pageKnownRecordHits} 条` : "";
    setStatus(`正在读取第 ${progress.page} 页，已扫描 ${progress.scannedCount} 条，保留 ${progress.count} 条${suffix}${known}${speed}${retry}`);
  });

  desktop.onMatchDetailsProgress?.((progress) => {
    if (progress.uuid && progress.uuid !== state.account?.uuid) return;
    state.analyticsProgress = progress;
    const metrics = `已完成 ${progress.completed}/${progress.total}，${progress.requestsPerSecond.toFixed(1)} 次/秒，并发 ${progress.concurrency}`;
    const eta = `，预计剩余 ${formatDuration(progress.estimatedRemainingMs)}`;
    if (state.analyticsLoading) {
      els.analyticsStatus.textContent = `${metrics}${eta}，限流重试 ${progress.retryCount} 次`;
    }
    if (progress.phase === "rate-limit") {
      setStatus(`服务器提示请求频繁，等待 ${Math.ceil(progress.waitMs / 1000)} 秒后重试；${metrics}，已降速。`);
      return;
    }
    if (progress.phase === "retry") {
      setStatus(`详情请求暂时失败，等待 ${Math.ceil(progress.waitMs / 1000)} 秒后重试；${metrics}${eta}。`);
      return;
    }
    if (progress.phase === "done") {
      setStatus(`详情补全请求完成；${metrics}。`);
      return;
    }
    setStatus(`正在补全对局详情；${metrics}${eta}。`);
  });

  els.loginButton.addEventListener("click", login);
  els.logoutButton.addEventListener("click", logout);
  els.accountMenuButton.addEventListener("click", () => {
    if (state.accountMenuOpen) closeAccountMenu();
    else openAccountMenu();
  });
  els.accountMenuButton.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openAccountMenu();
    }
  });
  els.bindingGuideStart.addEventListener("click", openBindingDialog);
  els.bindingGuideOfficial.addEventListener("click", openOfficialBinding);
  els.bindingDialogClose.addEventListener("click", closeBindingDialog);
  els.bindingDialog.addEventListener("click", (event) => {
    if (event.target === els.bindingDialog) closeBindingDialog();
  });
  els.bindingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    bindAccount();
  });
  els.bindingOfficialButton.addEventListener("click", openOfficialBinding);
  els.updateButton.addEventListener("click", () => runRecordsAction("update"));
  els.refetchButton.addEventListener("click", () => {
    const confirmed = window.confirm(
      "重新抓取会从第一页开始请求全部战绩，并在成功后替换当前账号的本地缓存。是否继续？",
    );
    if (confirmed) runRecordsAction("refetch");
  });
  els.cancelButton.addEventListener("click", () => desktop.cancelFetch());
  els.clearCacheButton.addEventListener("click", () => {
    const confirmed = window.confirm(
      "确定要清空当前账号的全部战绩记录吗？玩家资料会保留，此操作无法撤销。",
    );
    if (confirmed) clearRecords();
  });
  els.autoUpdate.addEventListener("change", async (event) => {
    state.autoUpdateEnabled = event.target.checked;
    await desktop.setPreferences({ autoUpdate: state.autoUpdateEnabled });
  });
  els.streaksTab.addEventListener("click", () => {
    state.activeTab = "streaks";
    renderTabs();
  });
  els.recordsTab.addEventListener("click", () => {
    state.activeTab = "records";
    renderTabs();
  });
  els.analyticsTab.addEventListener("click", () => {
    state.activeTab = "analytics";
    renderTabs();
    renderAnalyticsIfVisible();
  });
  els.analyticsMode.addEventListener("change", (event) => {
    state.analyticsFilters.mode = event.target.value;
    resetAnalyticsExpand();
    renderAnalyticsIfVisible();
  });
  els.analyticsFrom.addEventListener("change", (event) => {
    state.analyticsFilters.from = event.target.value;
    resetAnalyticsExpand();
    renderAnalyticsIfVisible();
  });
  els.analyticsTo.addEventListener("change", (event) => {
    state.analyticsFilters.to = event.target.value;
    resetAnalyticsExpand();
    renderAnalyticsIfVisible();
  });
  els.analyticsPrefetchButton.addEventListener("click", prefetchAnalyticsDetails);
  els.analyticsCancelButton.addEventListener("click", () => desktop.cancelMatchDetails());
  els.visualizeAllButton.addEventListener("click", () => openVisualization("all"));
  els.detailClose.addEventListener("click", () => {
    state.activeDetailKey = "";
    els.detailDialog.classList.add("hidden");
  });
  els.detailDialog.addEventListener("click", (event) => {
    if (event.target === els.detailDialog) {
      state.activeDetailKey = "";
      els.detailDialog.classList.add("hidden");
    }
  });
  els.visualizationClose.addEventListener("click", closeVisualization);
  els.visualizationDialog.addEventListener("click", (event) => {
    if (event.target === els.visualizationDialog) closeVisualization();
  });
  els.visualizationMode.addEventListener("change", (event) => {
    state.visualization.mode = event.target.value;
    state.visualization.rangePreset = DEFAULT_VISUALIZATION_RANGE_PRESET;
    state.visualization.zoomMultiplier = 1;
    renderVisualization();
  });
  els.visualizationBarsButton.addEventListener("click", () => {
    state.visualization.chartType = "bars";
    renderVisualization({ preserveScroll: true });
  });
  els.visualizationLineButton.addEventListener("click", () => {
    state.visualization.chartType = "line";
    renderVisualization({ preserveScroll: true });
  });
  els.visualizationRange.addEventListener("change", (event) => {
    state.visualization.rangePreset = event.target.value;
    if (state.visualization.rangePreset === "custom" && state.visualization.model) {
      state.visualization.from = state.visualization.model.range.from;
      state.visualization.to = state.visualization.model.range.to;
    }
    state.visualization.zoomMultiplier = 1;
    renderVisualization();
  });
  for (const [key, input] of [
    ["from", els.visualizationFrom],
    ["to", els.visualizationTo],
  ]) {
    input.addEventListener("change", (event) => {
      state.visualization.rangePreset = "custom";
      state.visualization[key] = event.target.value;
      state.visualization.zoomMultiplier = 1;
      renderVisualization();
    });
  }
  els.visualizationZoom.addEventListener("input", (event) => {
    state.visualization.zoomMultiplier = clampZoomMultiplier(event.target.value);
    renderVisualization({ preserveScroll: true });
  });
  els.visualizationChartScroller.addEventListener("wheel", (event) => {
    if (!state.visualization.open) return;
    const action = resolveVisualizationWheelAction({
      ctrlKey: event.ctrlKey,
      scrollWidth: els.visualizationChartScroller.scrollWidth,
      clientWidth: els.visualizationChartScroller.clientWidth,
    });
    switch (action) {
      case "scroll-x": {
        event.preventDefault();
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        els.visualizationChartScroller.scrollLeft += delta;
        break;
      }
      case "zoom": {
        event.preventDefault();
        const rect = els.visualizationChartScroller.getBoundingClientRect();
        const pointerOffset = Math.max(0, event.clientX - rect.left);
        const scrollWidth = Math.max(1, els.visualizationChartScroller.scrollWidth);
        const scrollRatio = (els.visualizationChartScroller.scrollLeft + pointerOffset) / scrollWidth;
        const factor = event.deltaY < 0 ? 1.16 : 1 / 1.16;
        state.visualization.zoomMultiplier = clampZoomMultiplier(state.visualization.zoomMultiplier * factor);
        renderVisualization({ scrollRatio, pointerOffset });
        break;
      }
      default:
        break;
    }
  }, { passive: false });
  els.visualizationLocateBest.addEventListener("click", locateBestStreak);
  els.visualizationExportPng.addEventListener("click", () => exportVisualization("png"));
  els.visualizationExportSvg.addEventListener("click", () => exportVisualization("svg"));
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!els.bindingDialog.classList.contains("hidden")) {
      closeBindingDialog();
    } else if (state.accountMenuOpen) {
      closeAccountMenu();
      els.accountMenuButton.focus();
    } else if (state.visualization.open) {
      closeVisualization();
    }
  });
  document.addEventListener("click", (event) => {
    if (state.accountMenuOpen && !els.accountMenu.contains(event.target)) closeAccountMenu();
  });
  window.addEventListener("resize", () => {
    updateSlidingIndicator(els.tabBar, els.tabBar.querySelector(".tab-button.active"));
    updateSlidingIndicator(els.visualizationChartType, els.visualizationChartType.querySelector("button.active"));
  });
  if ("ResizeObserver" in window) {
    visualizationResizeObserver = new ResizeObserver(() => {
      if (state.visualization.open) {
        window.requestAnimationFrame(() => renderVisualization({ preserveScroll: true }));
      }
    });
    visualizationResizeObserver.observe(els.visualizationChartScroller);
  }

  for (const [name, input] of [
    ["mode", els.modeFilter],
    ["category", els.categoryFilter],
    ["result", els.resultFilter],
    ["query", els.queryFilter],
    ["from", els.fromFilter],
    ["to", els.toFilter],
  ]) {
    input.addEventListener("input", (event) => {
      state.filters[name] = event.target.value;
      renderRecords();
    });
    input.addEventListener("change", (event) => {
      state.filters[name] = event.target.value;
      renderRecords();
    });
  }
}

async function init() {
  els.cutoffDate.value = DEFAULT_CUTOFF_DATE;
  els.pageDelay.value = String(DEFAULT_PAGE_DELAY_SECONDS);
  bindEvents();
  renderTabs();
  renderProfile();
  setRecords([]);

  const preferences = await desktop.getPreferences();
  state.autoUpdateEnabled = preferences.autoUpdate !== false;
  els.autoUpdate.checked = state.autoUpdateEnabled;

  setStatus("正在恢复登录状态…");
  const status = await desktop.getAuthStatus();
  state.authenticated = Boolean(status.authenticated);
  renderAuthControls();
  setLoading(false);

  if (state.authenticated) {
    await loadCurrentAccount({ autoUpdate: state.autoUpdateEnabled });
  } else {
    setStatus("请先登录布吉岛用户中心。");
  }
}

init();
