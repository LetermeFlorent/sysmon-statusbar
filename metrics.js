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

// Le remplissage va APRES la valeur, pas avant : la barre est a gauche, donc un
// remplissage en tete eloignerait "4%" de sa barre plus que "100%" de la sienne.
// En queue, chaque valeur commence a la meme distance de sa barre et c'est le
// groupe suivant qui reste aligne.
function padNum(text, width) {
  const s = String(text);
  return s.length >= width ? s : s + PAD.repeat(width - s.length);
}

// Largeur 3 et non 4 : caler sur "100%" ajouterait deux chasses apres "2%", ce
// qui se cumule a la marge que VS Code met entre items et creuse un trou avant
// le groupe suivant. A 3, seules les valeurs a un chiffre sont completees, et
// 100% deborde d'un cran le temps qu'il dure.
function formatPercent(pct) {
  return padNum(pct === null ? '--' : Math.round(pct) + '%', 3);
}

function formatRam(snap) {
  return padNum(formatGb(snap.usedBytes) + ' / ' + formatGb(snap.totalBytes) + ' GB', 16);
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

// Reduit le detail par disque a la seule valeur affichee a cote du groupe
// DISK. Liste vide = comportement par defaut, celui d'avant ce reglage : le
// total deja calcule par la sonde (agrege sur Windows, disque le plus charge
// sur Linux). Liste non vide = maximum parmi les seuls disques coches, null
// si aucun d'eux n'a encore ete vu (pas encore afficher un faux 0 %).
function selectedDiskPercent(disks, fallback, selected) {
  if (!selected || !selected.length) return fallback;
  let max = null;
  for (const name of selected) {
    const v = disks && disks[name];
    if (typeof v === 'number' && (max === null || v > max)) max = v;
  }
  return max;
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
  formatGb, formatRam, formatPercent, padNum, colorFor, bar, cpuInfo, formatAge,
  selectedDiskPercent
};
