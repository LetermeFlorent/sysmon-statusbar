const vscode = require('vscode');
const m = require('./metrics');
const { labelFor } = require('./groups');
const { t } = require('./i18n');

const FULL = '$(sysmon-bar-full)';
const EMPTY = '$(sysmon-bar-empty)';
const PARTS = ['lbl', 'bar', 'val'];

const it = {};
let currentAlignment = null;
let currentKeys = '';

function partName(key, part) {
  const label = labelFor(key);
  if (part === 'lbl') return t('System Monitor: {0} label', label);
  if (part === 'bar') return t('System Monitor: {0} bar', label);
  return t('System Monitor: {0} value', label);
}

function createItem(key, part, align, prio) {
  const id = 'sysmon.' + key.replace(/[^\w:-]+/g, '_') + '.' + part;
  const item = vscode.window.createStatusBarItem(id, align, prio);
  item.name = partName(key, part);
  return item;
}

function seg(item, text, color, spoken) {
  if (!text) {
    if (item._on !== false) { item.hide(); item._on = false; }
    return;
  }
  if (item._text !== text) { item.text = text; item._text = text; }
  if (item._color !== color) { item.color = color; item._color = color; }
  if (item._spoken !== spoken) {
    item.accessibilityInformation = { label: spoken, role: 'status' };
    item._spoken = spoken;
  }
  if (item._on !== true) { item.show(); item._on = true; }
}

function hideGroup(key) {
  for (const part of PARTS) {
    const item = it[key][part];
    if (item._on !== false) { item.hide(); item._on = false; }
  }
}

function drawGroup(key, pct, valueText, color, conf, spoken) {
  const g = it[key];
  if (!conf.showBars && !conf.showValues) { hideGroup(key); return; }
  seg(g.lbl, conf.showLabels ? labelFor(key) : '', undefined, spoken);
  seg(g.bar, conf.showBars ? m.bar(pct, conf.barWidth, FULL, EMPTY) : '', color, spoken);
  seg(g.val, conf.showValues ? valueText : '', undefined, spoken);
}

function disposeItems() {
  for (const key in it) {
    const g = it[key];
    if (!g) continue;
    for (const part of PARTS) g[part].dispose();
    delete it[key];
  }
  currentAlignment = null;
  currentKeys = '';
}

function syncGroups(conf, want) {
  const sig = want.join('|');
  if (sig === currentKeys && conf.alignment === currentAlignment) return;
  disposeItems();
  currentKeys = sig;
  currentAlignment = conf.alignment;
  const align = conf.alignment === 'right'
    ? vscode.StatusBarAlignment.Right
    : vscode.StatusBarAlignment.Left;
  let prio = 100;
  for (const key of want) {
    it[key] = {};
    PARTS.forEach(function (part, i) { it[key][part] = createItem(key, part, align, prio - i); });
    prio -= 3;
  }
}

function applyTooltips(tips) {
  for (const key in it) {
    const tip = tips[key];
    if (!tip) continue;
    for (const part of PARTS) it[key][part].tooltip = tip;
  }
}

function groupKeysShown() { return Object.keys(it); }

module.exports = { drawGroup, syncGroups, disposeItems, applyTooltips, groupKeysShown };
