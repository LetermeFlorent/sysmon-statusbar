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

// Largeur 4, celle de "100%" : a 3, le passage de 99% a 100% elargissait l'item
// d'une chasse et decalait tout ce qui suit dans la barre d'etat. Le vide en
// queue sur "2%" est le prix d'un affichage qui ne bouge jamais.
function formatPercent(pct) {
  return padNum(pct === null ? '--' : Math.round(pct) + '%', 4);
}

// La largeur se deduit du total, qui ne change pas de la session : la partie
// utilisee ne peut pas etre plus longue que lui, donc "9.99 / 31.74 GB" occupe
// autant que "12.35 / 31.74 GB", et une machine a 128 Go reste stable aussi.
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

// Le modele et le nombre de coeurs ne changent pas d'une session a l'autre, et
// os.cpus() alloue un objet par thread logique a chaque appel.
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
  clampInt, cpuSample, cpuPercent, ramSnapshot,
  formatGb, formatRam, formatPercent, padNum, colorFor, bar, cpuInfo, formatAge,
  selectedDiskPercent
};
