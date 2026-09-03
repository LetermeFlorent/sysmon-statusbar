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

function cpuPercent(prev, cur) {
  const dt = cur.total - prev.total;
  if (dt <= 0) return null;
  const di = cur.idle - prev.idle;
  return Math.max(0, Math.min(100, (1 - di / dt) * 100));
}

function ramSnapshot() {
  const totalBytes = os.totalmem();
  const usedBytes = totalBytes - os.freemem();
  return { usedBytes, totalBytes, pct: totalBytes > 0 ? usedBytes / totalBytes * 100 : 0 };
}

function formatGb(bytes) {
  return (Number(bytes) / GB).toFixed(2);
}

// U+2007 FIGURE SPACE a exactement la largeur d'un chiffre, contrairement a
// l'espace ordinaire. Sans lui, passer de "9%" a "100%" elargit l'item et
// decale tout ce qui suit dans la barre d'etat a chaque changement de palier.
const PAD = ' ';

function padNum(text, width) {
  const s = String(text);
  return s.length >= width ? s : PAD.repeat(width - s.length) + s;
}

function formatPercent(pct) {
  return padNum(pct === null ? '--' : Math.round(pct) + '%', 4);
}

function formatRam(snap) {
  return padNum(formatGb(snap.usedBytes), 5) + ' / ' + formatGb(snap.totalBytes) + ' GB';
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

function cpuInfo() {
  const c = os.cpus();
  return { model: (c[0] && c[0].model || 'inconnu').trim(), cores: c.length };
}

function formatAge(ms) {
  const s = Math.max(0, Math.floor(Number(ms) / 1000));
  if (s < 60) return s + ' s';
  return Math.floor(s / 60) + ' min';
}

module.exports = {
  clampInt, cpuSample, cpuPercent, ramSnapshot,
  formatGb, formatRam, formatPercent, padNum, colorFor, bar, cpuInfo, formatAge
};
