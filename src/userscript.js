import { fetchAllRecords, fetchBindings, fetchMatchDetails } from "./api.js";
import {
  buildModeStats,
  filterRecords,
  getModeName,
  parseDateInputToKey,
  sortRecordsNewestFirst,
} from "./core.js";
import { STYLES } from "./styles.js";

const ROOT_ID = "bjdw-root";
const DISPLAY_LIMIT = 200;
const DEFAULT_CUTOFF_DATE = "2025-01-01";
const DEFAULT_PAGE_DELAY_SECONDS = 0.1;

function createElement(tag, className, text) {
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

function streakRange(streak) {
  if (!streak?.count) return "暂无连胜";
  return `${formatDate(streak.start?.date, false)} 至 ${formatDate(streak.end?.date, false)}`;
}

class BjdWinsApp {
  constructor() {
    this.bindings = [];
    this.selectedUuid = "";
    this.records = [];
    this.stats = buildModeStats([]);
    this.fetchController = null;
    this.detailController = null;
    this.loading = false;
    this.loaded = false;
    this.detailCache = new Map();
    this.filters = { mode: "", category: "", result: "", from: "", to: "", query: "" };
    this.mount();
    this.syncRoute();
  }

  mount() {
    this.root = createElement("div");
    this.root.id = ROOT_ID;
    this.root.innerHTML = `
      <button class="bjdw-launcher" type="button">连胜统计</button>
      <div class="bjdw-backdrop bjdw-hidden"></div>
      <aside class="bjdw-drawer bjdw-hidden" aria-label="布吉岛战绩与连胜统计">
        <header class="bjdw-header">
          <div class="bjdw-title">
            <strong>战绩与连胜统计</strong>
            <span>按精确游戏模式统计，数据仅保存在当前页面</span>
          </div>
          <button class="bjdw-icon-button bjdw-close" type="button" aria-label="关闭">×</button>
        </header>
        <div class="bjdw-toolbar">
          <div class="bjdw-account-row">
            <select class="bjdw-select bjdw-account" aria-label="绑定账号"></select>
            <button class="bjdw-button bjdw-button-primary bjdw-refresh" type="button">抓取至截止日期</button>
            <button class="bjdw-button bjdw-button-danger bjdw-cancel bjdw-hidden" type="button">取消</button>
          </div>
          <button class="bjdw-button bjdw-clear" type="button">清空筛选</button>
          <div class="bjdw-fetch-settings">
            <label class="bjdw-field">
              <span>截止日期</span>
              <input class="bjdw-input bjdw-fetch-date" type="date" value="${DEFAULT_CUTOFF_DATE}" required>
            </label>
            <label class="bjdw-field">
              <span>分页间隔（秒）</span>
              <input class="bjdw-input bjdw-fetch-delay" type="number" min="0.1" max="60" step="0.1" value="${DEFAULT_PAGE_DELAY_SECONDS}">
            </label>
          </div>
          <div class="bjdw-progress">
            <span class="bjdw-progress-text">打开面板后将读取绑定账号。</span>
          </div>
        </div>
        <main class="bjdw-content"></main>
      </aside>
      <div class="bjdw-detail bjdw-hidden" role="dialog" aria-modal="true">
        <div class="bjdw-detail-card">
          <header class="bjdw-detail-head">
            <strong class="bjdw-detail-title">对局详情</strong>
            <button class="bjdw-icon-button bjdw-detail-close" type="button" aria-label="关闭详情">×</button>
          </header>
          <div class="bjdw-detail-body"></div>
        </div>
      </div>
    `;

    const style = createElement("style");
    style.textContent = STYLES;
    document.head.append(style);
    document.body.append(this.root);

    this.els = {
      launcher: this.root.querySelector(".bjdw-launcher"),
      backdrop: this.root.querySelector(".bjdw-backdrop"),
      drawer: this.root.querySelector(".bjdw-drawer"),
      close: this.root.querySelector(".bjdw-close"),
      account: this.root.querySelector(".bjdw-account"),
      refresh: this.root.querySelector(".bjdw-refresh"),
      cancel: this.root.querySelector(".bjdw-cancel"),
      clear: this.root.querySelector(".bjdw-clear"),
      fetchDate: this.root.querySelector(".bjdw-fetch-date"),
      fetchDelay: this.root.querySelector(".bjdw-fetch-delay"),
      progress: this.root.querySelector(".bjdw-progress"),
      content: this.root.querySelector(".bjdw-content"),
      detail: this.root.querySelector(".bjdw-detail"),
      detailTitle: this.root.querySelector(".bjdw-detail-title"),
      detailBody: this.root.querySelector(".bjdw-detail-body"),
      detailClose: this.root.querySelector(".bjdw-detail-close"),
    };
    this.els.fetchDate.value = DEFAULT_CUTOFF_DATE;
    this.els.fetchDelay.value = String(DEFAULT_PAGE_DELAY_SECONDS);

    this.els.launcher.addEventListener("click", () => this.open());
    this.els.close.addEventListener("click", () => this.close());
    this.els.backdrop.addEventListener("click", () => this.close());
    this.els.refresh.addEventListener("click", () => this.loadRecords());
    this.els.cancel.addEventListener("click", () => this.fetchController?.abort());
    this.els.clear.addEventListener("click", () => this.clearFilters());
    this.els.fetchDate.addEventListener("click", () => this.showDatePicker());
    this.els.fetchDate.addEventListener("change", () => this.resetLoadedData());
    this.els.account.addEventListener("change", (event) => {
      this.selectedUuid = event.target.value;
      this.resetLoadedData();
    });
    this.els.detailClose.addEventListener("click", () => this.closeDetail());
    this.els.detail.addEventListener("click", (event) => {
      if (event.target === this.els.detail) this.closeDetail();
    });

    window.addEventListener("hashchange", () => this.syncRoute());
    window.addEventListener("popstate", () => this.syncRoute());
  }

  isStatsRoute() {
    return location.hash.startsWith("#/stats");
  }

  syncRoute() {
    this.els.launcher.classList.toggle("bjdw-hidden", !this.isStatsRoute());
    if (!this.isStatsRoute()) this.close();
  }

  async open() {
    this.els.drawer.classList.remove("bjdw-hidden");
    this.els.backdrop.classList.remove("bjdw-hidden");
    if (this.bindings.length === 0 && !this.loading) await this.loadBindings();
  }

  close() {
    this.els.drawer.classList.add("bjdw-hidden");
    this.els.backdrop.classList.add("bjdw-hidden");
    this.closeDetail();
  }

  closeDetail() {
    this.detailController?.abort();
    this.detailController = null;
    this.els.detail.classList.add("bjdw-hidden");
  }

  showDatePicker() {
    if (typeof this.els.fetchDate.showPicker !== "function") return;
    try {
      this.els.fetchDate.showPicker();
    } catch {
      // Native date inputs still work when showPicker is unavailable or already open.
    }
  }

  setProgress(text, active = false) {
    this.els.progress.replaceChildren();
    this.els.progress.append(createElement("span", "bjdw-progress-text", text));
    if (active) this.els.progress.append(createElement("span", "bjdw-progress-line"));
  }

  setLoading(loading) {
    this.loading = loading;
    this.els.refresh.disabled = loading;
    this.els.account.disabled = loading;
    this.els.fetchDate.disabled = loading;
    this.els.fetchDelay.disabled = loading;
    this.els.cancel.classList.toggle("bjdw-hidden", !loading);
  }

  resetLoadedData() {
    this.records = [];
    this.stats = buildModeStats([]);
    this.loaded = false;
    this.render();
  }

  showError(error) {
    const message =
      error?.name === "AbortError" ? "已取消抓取。" : error?.message || "发生未知错误。";
    this.setProgress(message, false);
    if (error?.name !== "AbortError") {
      this.els.content.replaceChildren(createElement("div", "bjdw-error", message));
    }
  }

  async loadBindings() {
    this.setLoading(true);
    this.setProgress("正在读取绑定账号…", true);
    try {
      this.bindings = await fetchBindings();
      if (this.bindings.length === 0) throw new Error("当前账户没有可用的游戏绑定。");
      this.selectedUuid = String(this.bindings[0].uuid ?? "");
      this.renderAccounts();
      this.setProgress("选择账号后点击“抓取全部战绩”。");
      this.render();
    } catch (error) {
      this.showError(error);
    } finally {
      this.setLoading(false);
    }
  }

  renderAccounts() {
    this.els.account.replaceChildren();
    for (const binding of this.bindings) {
      const option = createElement("option", "", binding.name || binding.uuid || "未命名账号");
      option.value = String(binding.uuid ?? "");
      option.selected = option.value === this.selectedUuid;
      this.els.account.append(option);
    }
  }

  async loadRecords() {
    if (!this.selectedUuid || this.loading) return;
    const cutoffDate = parseDateInputToKey(this.els.fetchDate.value);
    if (!cutoffDate) {
      this.showError(new Error("请输入有效截止日期，例如 2026-01-01 或 26.1.1。"));
      return;
    }
    this.els.fetchDate.value = cutoffDate;
    const delaySeconds = Number(this.els.fetchDelay.value);
    const pageDelayMs = Math.round(
      Math.min(
        Math.max(
          Number.isFinite(delaySeconds) ? delaySeconds : DEFAULT_PAGE_DELAY_SECONDS,
          DEFAULT_PAGE_DELAY_SECONDS,
        ),
        60,
      ) * 1000,
    );
    this.els.fetchDelay.value = String(pageDelayMs / 1000);
    this.fetchController?.abort();
    this.fetchController = new AbortController();
    this.setLoading(true);
    this.setProgress("准备抓取战绩…", true);

    try {
      const result = await fetchAllRecords({
        uuid: this.selectedUuid,
        signal: this.fetchController.signal,
        cutoffDate,
        pageDelayMs,
        onProgress: ({
          phase,
          page,
          count,
          scannedCount,
          added,
          waitMs,
          attempt,
          maxAttempts,
        }) => {
          if (phase === "delay") {
            this.setProgress(
              `已扫描 ${scannedCount} 条，保留 ${count} 条；等待 ${(waitMs / 1000).toFixed(1)} 秒后读取第 ${page} 页…`,
              true,
            );
            return;
          }
          if (phase === "rate-limit") {
            this.setProgress(
              `服务器提示请求频繁，等待 ${Math.ceil(waitMs / 1000)} 秒后重试第 ${page} 页（${attempt}/${maxAttempts}），已保留 ${count} 条…`,
              true,
            );
            return;
          }
          const suffix = phase === "received" ? `，新增 ${added} 条` : "";
          this.setProgress(
            `正在读取第 ${page} 页，已扫描 ${scannedCount} 条，保留 ${count} 条${suffix}`,
            true,
          );
        },
      });
      this.records = sortRecordsNewestFirst(result.records);
      this.stats = buildModeStats(this.records);
      this.loaded = true;
      const stopLabels = {
        "cutoff-date-passed": "已越过截止日期",
        empty: "没有更多记录",
        duplicates: "连续重复分页",
        limit: "达到页数上限",
      };
      this.setProgress(
        `截止 ${cutoffDate} 抓取完成：保留 ${this.records.length} 条，扫描 ${result.scannedCount} 条、${result.pagesFetched} 页（${stopLabels[result.stoppedBy] || result.stoppedBy}）。`,
      );
      this.render();
    } catch (error) {
      this.showError(error);
    } finally {
      this.fetchController = null;
      this.setLoading(false);
    }
  }

  clearFilters() {
    this.filters = { mode: "", category: "", result: "", from: "", to: "", query: "" };
    this.render();
  }

  updateFilter(name, value) {
    this.filters[name] = value;
    this.renderRecordsSection();
  }

  render() {
    this.els.content.replaceChildren();
    if (!this.loaded) {
      this.els.content.append(
        createElement(
          "div",
          "bjdw-empty",
          this.selectedUuid
            ? "选择截止日期和分页间隔后，点击“抓取至截止日期”开始统计。"
            : "正在等待绑定账号数据。",
        ),
      );
      return;
    }
    this.renderOverall();
    this.renderModes();
    this.renderRecordsSection();
  }

  renderOverall() {
    const section = createElement("section", "bjdw-section");
    section.append(createElement("h2", "bjdw-section-title", "所有模式总览"));
    const grid = createElement("div", "bjdw-overall-grid");
    const metrics = [
      ["总局数", this.stats.overall.total, ""],
      ["胜局", this.stats.overall.wins, "bjdw-win-text"],
      ["负局", this.stats.overall.losses, "bjdw-loss-text"],
      ["胜率", formatRate(this.stats.overall.winRate), "bjdw-win-text"],
      ["当前连胜", this.stats.overall.current.count, "bjdw-win-text"],
      ["历史最高", this.stats.overall.best.count, "bjdw-warning-text"],
    ];
    for (const [label, value, className] of metrics) {
      const card = createElement("div", "bjdw-metric");
      card.append(createElement("span", "", label), createElement("strong", className, value));
      grid.append(card);
    }
    section.append(grid);
    this.els.content.append(section);
  }

  renderModes() {
    const section = createElement("section", "bjdw-section");
    section.append(createElement("h2", "bjdw-section-title", "精确模式连胜"));
    const list = createElement("div", "bjdw-mode-list");

    for (const mode of this.stats.modes) {
      const card = createElement("article", "bjdw-mode-card");
      const head = createElement("div", "bjdw-mode-head");
      head.append(
        createElement("span", "bjdw-mode-name", mode.modeName),
        createElement("span", "bjdw-tag", mode.category),
      );
      const values = createElement("div", "bjdw-mode-stats");
      for (const [label, value, className] of [
        ["局数", mode.total, ""],
        ["胜率", formatRate(mode.winRate), "bjdw-win-text"],
        ["当前连胜", mode.current.count, "bjdw-win-text"],
        ["历史最高", mode.best.count, "bjdw-warning-text"],
      ]) {
        const item = createElement("div", "bjdw-mode-stat");
        item.append(createElement("span", "", label), createElement("strong", className, value));
        values.append(item);
      }
      card.append(
        head,
        values,
        createElement("div", "bjdw-range", `最高连胜区间：${streakRange(mode.best)}`),
      );
      list.append(card);
    }

    if (this.stats.modes.length === 0) {
      list.append(createElement("div", "bjdw-empty", "没有可统计的模式。"));
    }
    section.append(list);
    this.els.content.append(section);
  }

  createSelect(name, label, options) {
    const select = createElement("select", "bjdw-select");
    select.setAttribute("aria-label", label);
    for (const [value, text] of options) {
      const option = createElement("option", "", text);
      option.value = value;
      option.selected = this.filters[name] === value;
      select.append(option);
    }
    select.addEventListener("change", (event) => this.updateFilter(name, event.target.value));
    return select;
  }

  createInput(name, type, placeholder) {
    const input = createElement("input", "bjdw-input");
    input.type = type;
    input.placeholder = placeholder;
    input.value = this.filters[name];
    input.setAttribute("aria-label", placeholder);
    input.addEventListener("input", (event) => this.updateFilter(name, event.target.value));
    return input;
  }

  renderRecordsSection() {
    this.els.content.querySelector(".bjdw-records-section")?.remove();
    if (!this.loaded) return;

    const section = createElement("section", "bjdw-section bjdw-records-section");
    section.append(createElement("h2", "bjdw-section-title", "分类查找记录"));
    const filters = createElement("div", "bjdw-filters");
    const modeOptions = [
      ["", "全部精确模式"],
      ...this.stats.modes.map((mode) => [mode.mode, mode.modeName]),
    ];
    const categoryOptions = [
      ["", "全部大类"],
      ...[...new Set(this.records.map((record) => record.category))].map((value) => [
        value,
        value,
      ]),
    ];
    filters.append(
      this.createSelect("mode", "精确模式", modeOptions),
      this.createSelect("category", "游戏大类", categoryOptions),
      this.createSelect("result", "胜负结果", [
        ["", "全部结果"],
        ["win", "胜利"],
        ["loss", "失败"],
        ["unknown", "未知结果"],
      ]),
      this.createInput("query", "search", "搜索 matchId / 模式"),
      this.createInput("from", "date", "开始日期"),
      this.createInput("to", "date", "结束日期"),
    );

    const filtered = filterRecords(this.records, this.filters);
    section.append(
      filters,
      createElement(
        "p",
        "bjdw-result-count",
        `找到 ${filtered.length} 条记录${filtered.length > DISPLAY_LIMIT ? `，当前显示前 ${DISPLAY_LIMIT} 条` : ""}`,
      ),
    );

    const list = createElement("div", "bjdw-record-list");
    for (const record of filtered.slice(0, DISPLAY_LIMIT)) {
      const button = createElement("button", "bjdw-record");
      button.type = "button";
      const head = createElement("div", "bjdw-record-head");
      const resultClass =
        record.win === true
          ? "bjdw-result-win"
          : record.win === false
            ? "bjdw-result-loss"
            : "bjdw-result-unknown";
      head.append(
        createElement("span", "bjdw-record-name", getModeName(record.type)),
        createElement("span", `bjdw-result ${resultClass}`, resultLabel(record.win)),
      );
      button.append(
        head,
        createElement(
          "div",
          "bjdw-record-meta",
          `${formatDate(record.date)} · ${record.matchId || "无 matchId"}`,
        ),
      );
      button.addEventListener("click", () => this.openDetails(record));
      list.append(button);
    }
    if (filtered.length === 0) list.append(createElement("div", "bjdw-empty", "没有匹配记录。"));
    section.append(list);
    this.els.content.append(section);
  }

  async openDetails(record) {
    this.detailController?.abort();
    const controller = new AbortController();
    this.detailController = controller;
    this.els.detail.classList.remove("bjdw-hidden");
    this.els.detailTitle.textContent = `${getModeName(record.type)} · ${resultLabel(record.win)}`;
    this.els.detailBody.replaceChildren(createElement("div", "bjdw-empty", "正在读取对局详情…"));

    const key = `${record.matchId}::${record.date}`;
    try {
      let details = this.detailCache.get(key);
      if (!details) {
        details = await fetchMatchDetails(record, { signal: controller.signal });
        this.detailCache.set(key, details);
      }
      const pre = createElement("pre");
      pre.textContent = JSON.stringify(details, null, 2);
      this.els.detailBody.replaceChildren(pre);
    } catch (error) {
      if (error?.name !== "AbortError") {
        this.els.detailBody.replaceChildren(
          createElement("div", "bjdw-error", error?.message || "读取详情失败。"),
        );
      }
    } finally {
      if (this.detailController === controller) this.detailController = null;
    }
  }
}

if (!document.getElementById(ROOT_ID)) {
  globalThis.__bjdWinsApp = new BjdWinsApp();
}
