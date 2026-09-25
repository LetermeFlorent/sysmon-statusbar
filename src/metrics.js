const os = require('node:os');

const GB = 1073741824;

function clampInt(v, min, max) {
  const n = Number(v);
  if (!isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function cpuSample() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) {
    for (const k in c.times) total += c.times[k];
    idle += c.times.idle;
  }
  return { idle, total };
}

function cpuCoreSamples() {
  return os.cpus().map((c) => {
    let total = 0;
    for (const k in c.times) total += c.times[k];
    return { idle: c.times.idle, total };
  });
}

function cpuPercent(prev, cur) {
  const dt = cur.total - prev.total;
  if (dt <= 0) return null;
  const di = cur.idle - prev.idle;
  return Math.max(0, Math.min(100, (1 - di / dt) * 100));
}

function usage(usedBytes, totalBytes) {
  const used = Math.max(0, Math.min(totalBytes, usedBytes));
  return { usedBytes: used, totalBytes, freeBytes: totalBytes - used, pct: totalBytes > 0 ? used / totalBytes * 100 : 0 };
}

function ramSnapshot(availableBytes) {
  const totalBytes = os.totalmem();
  const free = typeof availableBytes === 'number' ? availableBytes : os.freemem();
  return usage(totalBytes - free, totalBytes);
}

function formatGb(bytes) {
  return (Number(bytes) / GB).toFixed(2);
}

const PAD = '\u2007';

function padNum(text, width) {
  const s = String(text);
  return s.length >= width ? s : s + PAD.repeat(width - s.length);
}

function formatPercent(pct) {
  return padNum(pct === null ? '--' : Math.round(pct) + '%', 4);
}

function formatRam(snap) {
  const total = formatGb(snap.totalBytes);
  return padNum(formatGb(snap.usedBytes) + ' / ' + total + ' GB', total.length * 2 + 6);
}

function colorFor(pct) {
  const p = Number(pct) || 0;
  if (p >= 90) return '#f14c4c';
  if (p >= 75) return '#e59b45';
  if (p >= 50) return '#e5c452';
  return '#57c85a';
}

function bar(pct, width, fullGlyph, emptyGlyph) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const filled = Math.round(p / 100 * width);
  return fullGlyph.repeat(filled) + emptyGlyph.repeat(width - filled);
}

let cpuInfoCache = null;

function cpuInfo() {
  if (!cpuInfoCache) {
    const c = os.cpus();
    cpuInfoCache = { model: (c[0] && c[0].model || 'inconnu').trim(), cores: c.length };
  }
  return cpuInfoCache;
}

function formatAge(ms) {
  const s = Math.max(0, Math.floor(Number(ms) / 1000));
  if (s < 60) return s + ' s';
  return Math.floor(s / 60) + ' min';
}

module.exports = {
  clampInt, cpuSample, cpuCoreSamples, cpuPercent, usage, ramSnapshot,
  formatGb, formatRam, formatPercent, padNum, colorFor, bar, cpuInfo, formatAge
};
