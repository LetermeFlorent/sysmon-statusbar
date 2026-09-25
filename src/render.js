const m = require('./metrics');
const g = require('./groups');
const { t } = require('./i18n');
const { readCfg } = require('./config');
const host = require('./probe-host');
const bar = require('./statusbar');
const { tipsFor } = require('./tooltips');
const { MemoryReader } = require('./memory/reader');

const GRAY = '#8a8a8a';

const memory = new MemoryReader();
let prevCpu = null;
let prevCores = null;
let lastTips = 0;

function staleMs(refreshSeconds) {
  return Math.max(30000, refreshSeconds * 3000);
}

function spokenName(key) {
  return g.isDiskKey(key) ? t('Disk {0}', g.labelFor(key)) : g.labelFor(key);
}

function spokenPercent(key, v) {
  return v === null ? t('{0}: no reading', spokenName(key)) : t('{0}: {1} percent', spokenName(key), Math.round(v));
}

function probeText(pct, state) {
  if (state === 'missing' || state === 'error') return m.padNum('n/a', 4);
  return m.formatPercent(pct);
}

function sampleCpu(conf) {
  const cores = {};
  if (!conf.show.cpu) { prevCpu = null; prevCores = null; return { cpuPct: null, cores }; }
  const cur = m.cpuSample();
  const cpuPct = prevCpu ? m.cpuPercent(prevCpu, cur) : null;
  prevCpu = cur;
  const curCores = m.cpuCoreSamples();
  curCores.forEach(function (c, i) {
    const p = prevCores && prevCores[i] ? m.cpuPercent(prevCores[i], c) : null;
    if (p !== null) cores[i] = p;
  });
  prevCores = curCores;
  return { cpuPct, cores };
}

function drawMemory(key, u, conf, stale) {
  if (!u || !u.totalBytes) {
    const text = u ? m.padNum(t('off'), 4) : m.formatPercent(null);
    const spoken = u ? t('{0}: none configured', g.labelFor(key)) : spokenPercent(key, null);
    bar.drawGroup(key, 0, text, GRAY, conf, spoken);
    return;
  }
  const free = key === 'ram' && conf.ramValue === 'free';
  const text = free ? t('{0} GB free', m.formatGb(u.freeBytes)) : m.formatRam(u);
  const spoken = free
    ? t('{0}: {1} GB free of {2} GB', g.labelFor(key), m.formatGb(u.freeBytes), m.formatGb(u.totalBytes))
    : t('{0}: {1} GB used of {2} GB', g.labelFor(key), m.formatGb(u.usedBytes), m.formatGb(u.totalBytes));
  bar.drawGroup(key, u.pct, text, stale ? GRAY : m.colorFor(u.pct), conf, spoken);
}

function probeValue(key, snap) {
  if (!snap) return null;
  const kind = g.kindOf(key);
  const sub = key.indexOf(':') > 0 ? g.subOf(key) : null;
  const raw = kind === 'gpu'
    ? (sub === null ? snap.gpu : snap.gpus && snap.gpus[sub])
    : (sub === null || !snap.disks ? null : snap.disks[g.diskOf(key)]);
  return typeof raw === 'number' ? raw : null;
}

function render() {
  const conf = readCfg();
  const now = Date.now();
  const snap = host.pumpProbe(now);
  bar.syncGroups(conf, g.groupKeys(conf, snap));
  const { cpuPct, cores } = sampleCpu(conf);
  const fresh = !!(snap && snap.ts && now - snap.ts <= staleMs(conf.refreshSeconds));
  const stale = !fresh || snap.state === 'missing' || snap.state === 'error';
  const mem = memory.read(snap);
  const keys = bar.groupKeysShown();

  for (const key of keys) {
    const kind = g.kindOf(key);
    if (kind === 'cpu') {
      const v = key === 'cpu' ? cpuPct : (typeof cores[g.subOf(key)] === 'number' ? cores[g.subOf(key)] : null);
      bar.drawGroup(key, v, m.formatPercent(v), v === null ? GRAY : m.colorFor(v), conf, spokenPercent(key, v));
    } else if (kind === 'gpu' || kind === 'disk') {
      const v = probeValue(key, snap);
      bar.drawGroup(key, v === null ? 0 : v, probeText(v, snap && snap.state),
        (stale || v === null) ? GRAY : m.colorFor(v), conf, spokenPercent(key, stale ? null : v));
    } else if (key === 'ram') {
      drawMemory(key, mem.ram, conf, false);
    } else if (key === 'swap') {
      drawMemory(key, mem.swap, conf, host.IS_WINDOWS && stale);
    }
  }

  if (now - lastTips < conf.tooltipMs) return;
  lastTips = now;
  bar.applyTooltips(tipsFor(keys, { cpuPct, cores, snap, mem }));
}

function resetRender() {
  prevCpu = null;
  prevCores = null;
  lastTips = 0;
}

module.exports = { render, resetRender, memory };
