export const STYLES = `
#bjdw-root {
  --bjdw-bg: #0f172a;
  --bjdw-panel: #172033;
  --bjdw-panel-soft: #1e293b;
  --bjdw-border: #334155;
  --bjdw-text: #e5edf7;
  --bjdw-muted: #94a3b8;
  --bjdw-primary: #38bdf8;
  --bjdw-win: #22c55e;
  --bjdw-loss: #f87171;
  --bjdw-warning: #fbbf24;
  position: relative;
  z-index: 2147483000;
  color: var(--bjdw-text);
  font-family: Inter, "Segoe UI", "Microsoft YaHei", sans-serif;
}

#bjdw-root, #bjdw-root * { box-sizing: border-box; }

.bjdw-launcher {
  position: fixed;
  right: 22px;
  bottom: 24px;
  z-index: 2147483001;
  border: 0;
  border-radius: 999px;
  padding: 12px 17px;
  color: #082f49;
  background: linear-gradient(135deg, #7dd3fc, #38bdf8);
  box-shadow: 0 12px 32px rgba(2, 132, 199, .38);
  font-weight: 800;
  cursor: pointer;
}

.bjdw-launcher:hover { transform: translateY(-1px); }
.bjdw-hidden { display: none !important; }

.bjdw-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483002;
  background: rgba(2, 6, 23, .58);
  backdrop-filter: blur(2px);
}

.bjdw-drawer {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 2147483003;
  width: min(620px, 100vw);
  height: 100vh;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  background: var(--bjdw-bg);
  border-left: 1px solid var(--bjdw-border);
  box-shadow: -18px 0 50px rgba(2, 6, 23, .46);
}

.bjdw-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--bjdw-border);
  background: linear-gradient(135deg, #172554, #0f172a 65%);
}

.bjdw-title { flex: 1; min-width: 0; }
.bjdw-title strong { display: block; font-size: 17px; }
.bjdw-title span { color: var(--bjdw-muted); font-size: 12px; }

.bjdw-button, .bjdw-icon-button, .bjdw-select, .bjdw-input {
  border: 1px solid var(--bjdw-border);
  border-radius: 9px;
  color: var(--bjdw-text);
  background: var(--bjdw-panel-soft);
  font: inherit;
}

.bjdw-button, .bjdw-icon-button { cursor: pointer; }
.bjdw-button { padding: 8px 12px; font-weight: 700; }
.bjdw-button:hover, .bjdw-icon-button:hover { border-color: var(--bjdw-primary); }
.bjdw-button-primary { color: #082f49; border-color: #38bdf8; background: #7dd3fc; }
.bjdw-button-danger { border-color: #7f1d1d; background: #450a0a; color: #fecaca; }
.bjdw-icon-button { width: 34px; height: 34px; padding: 0; font-size: 20px; }

.bjdw-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--bjdw-border);
  background: var(--bjdw-panel);
}

.bjdw-account-row { display: flex; gap: 8px; min-width: 0; }
.bjdw-select, .bjdw-input { min-width: 0; padding: 8px 9px; outline: none; }
.bjdw-select:focus, .bjdw-input:focus { border-color: var(--bjdw-primary); }
.bjdw-account-row .bjdw-select { flex: 1; }

.bjdw-fetch-settings {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.bjdw-field { display: grid; gap: 5px; }
.bjdw-field span { color: var(--bjdw-muted); font-size: 11px; font-weight: 700; }

.bjdw-progress {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 18px;
  color: var(--bjdw-muted);
  font-size: 12px;
}

.bjdw-progress-line {
  flex: 1;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: #334155;
}

.bjdw-progress-line::after {
  display: block;
  width: 40%;
  height: 100%;
  content: "";
  background: var(--bjdw-primary);
  animation: bjdw-progress 1.2s infinite ease-in-out;
}

@keyframes bjdw-progress {
  from { transform: translateX(-100%); }
  to { transform: translateX(350%); }
}

.bjdw-content { overflow-y: auto; padding: 15px; }
.bjdw-section { margin-bottom: 17px; }
.bjdw-section-title {
  margin: 0 0 9px;
  color: #cbd5e1;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.bjdw-overall-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.bjdw-metric, .bjdw-mode-card, .bjdw-record, .bjdw-empty, .bjdw-error {
  border: 1px solid var(--bjdw-border);
  border-radius: 12px;
  background: var(--bjdw-panel);
}

.bjdw-metric { padding: 11px; }
.bjdw-metric span { display: block; color: var(--bjdw-muted); font-size: 11px; }
.bjdw-metric strong { display: block; margin-top: 5px; font-size: 19px; }
.bjdw-win-text { color: var(--bjdw-win); }
.bjdw-loss-text { color: var(--bjdw-loss); }
.bjdw-warning-text { color: var(--bjdw-warning); }

.bjdw-mode-list { display: grid; gap: 8px; }
.bjdw-mode-card { padding: 11px 12px; }
.bjdw-mode-head { display: flex; align-items: center; gap: 8px; }
.bjdw-mode-name { flex: 1; font-weight: 800; }
.bjdw-tag {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 3px 7px;
  color: #bae6fd;
  background: #0c4a6e;
  font-size: 11px;
}
.bjdw-mode-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  margin-top: 9px;
}
.bjdw-mode-stat span { display: block; color: var(--bjdw-muted); font-size: 10px; }
.bjdw-mode-stat strong { font-size: 14px; }
.bjdw-range { margin-top: 6px; color: var(--bjdw-muted); font-size: 11px; }

.bjdw-filters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 9px;
}
.bjdw-filter-wide { grid-column: 1 / -1; }
.bjdw-result-count { margin: 0 0 8px; color: var(--bjdw-muted); font-size: 12px; }

.bjdw-record-list { display: grid; gap: 7px; }
.bjdw-record {
  width: 100%;
  padding: 10px 12px;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.bjdw-record:hover { border-color: var(--bjdw-primary); }
.bjdw-record-head { display: flex; align-items: center; gap: 8px; }
.bjdw-record-name { flex: 1; font-weight: 750; }
.bjdw-record-meta { margin-top: 5px; color: var(--bjdw-muted); font-size: 11px; word-break: break-all; }
.bjdw-result {
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 800;
}
.bjdw-result-win { color: #bbf7d0; background: #14532d; }
.bjdw-result-loss { color: #fecaca; background: #7f1d1d; }
.bjdw-result-unknown { color: #fde68a; background: #713f12; }

.bjdw-empty, .bjdw-error { padding: 18px; text-align: center; }
.bjdw-empty { color: var(--bjdw-muted); }
.bjdw-error { color: #fecaca; border-color: #7f1d1d; background: #450a0a; }

.bjdw-detail {
  position: fixed;
  inset: 0;
  z-index: 2147483004;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(2, 6, 23, .72);
}
.bjdw-detail-card {
  width: min(720px, 100%);
  max-height: min(820px, calc(100vh - 32px));
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border: 1px solid var(--bjdw-border);
  border-radius: 14px;
  background: var(--bjdw-bg);
  box-shadow: 0 24px 60px rgba(0, 0, 0, .5);
}
.bjdw-detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 13px 15px;
  border-bottom: 1px solid var(--bjdw-border);
}
.bjdw-detail-head strong { flex: 1; }
.bjdw-detail-body { overflow: auto; padding: 14px; }
.bjdw-detail-body pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: #cbd5e1;
  font: 12px/1.55 Consolas, monospace;
}

@media (max-width: 520px) {
  .bjdw-toolbar { grid-template-columns: 1fr; }
  .bjdw-account-row { flex-wrap: wrap; }
  .bjdw-fetch-settings { grid-template-columns: 1fr; }
  .bjdw-overall-grid, .bjdw-mode-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .bjdw-launcher { right: 12px; bottom: 14px; }
}
`;
