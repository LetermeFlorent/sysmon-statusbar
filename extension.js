const vscode = require('vscode');
const m = require('./metrics');
const { Probe } = require('./probe');

const FULL = '$(sysmon-bar-full)';
const EMPTY = '$(sysmon-bar-empty)';
const GRAY = '#8a8a8a';
const STALE_MS = 30000;

// Ordre d'affichage, de gauche a droite. La priorite decroit de 3 par groupe
// parce qu'un groupe occupe trois items : libelle, barre, valeur.
const GROUPS = ['cpu', 'gpu', 'disk', 'ram'];
const LABELS = { cpu: 'CPU', gpu: 'GPU', disk: 'DISK', ram: 'RAM' };

const it = {};
let timer = null;
let restartTimer = null;
let prevCpu = null;
let probe = null;
let currentAlignment = null;

function cfg() { return vscode.workspace.getConfiguration('sysmon'); }

function seg(item, text, color) {
  if (!text) { item.hide(); return; }
  item.text = text;
  item.color = color;
  item.show();
}

function hideGroup(key) {
  it[key].lbl.hide(); it[key].bar.hide(); it[key].val.hide();
}

function shown(key) {
  return cfg().get('show' + key.charAt(0).toUpperCase() + key.slice(1)) !== false;
}

// Un item de barre d'etat ne porte qu'une seule couleur. La valeur vit donc
// dans le sien : sans couleur explicite, VS Code lui applique
// statusBar.foreground, qui suit le theme, sombre en theme clair et clair en
// theme sombre. Seule la barre est teintee par la charge. Le prix a payer est
// la marge que VS Code insere entre deux items, qu'aucune extension ne reduit.
function drawGroup(key, pct, valueText, width, color) {
  const g = it[key];
  const withBar = cfg().get('showBars') !== false;
  const withValue = cfg().get('showValues') !== false;

  if (!withBar && !withValue) { hideGroup(key); return; }

  seg(g.lbl, cfg().get('showLabels') !== false ? LABELS[key] : '', undefined);
  seg(g.bar, withBar ? m.bar(pct, width, FULL, EMPTY) : '', color);
  // Chaque item se dimensionne sur son contenu, donc le remplissage de largeur
  // n'a plus rien a aligner et n'ajouterait que du vide avant le groupe suivant.
  seg(g.val, withValue ? valueText.replace(/ +$/, '') : '', undefined);
}

function probeText(pct, state) {
  if (state === 'missing' || state === 'error') return m.padNum('n/a', 4);
  return m.formatPercent(pct);
}

function tipsFor(cpuPct, snap, ram) {
  const ci = m.cpuInfo();
  const cpuMd = new vscode.MarkdownString(undefined, true);
  cpuMd.appendMarkdown('**Processeur**\n\n');
  cpuMd.appendMarkdown(ci.model + '\n\n');
  cpuMd.appendMarkdown(ci.cores + ' coeurs logiques\n\n');
  cpuMd.appendMarkdown('Charge moyenne sur tous les coeurs : ' +
    (cpuPct === null ? 'mesure en cours' : cpuPct.toFixed(1) + ' %'));

  const ramMd = new vscode.MarkdownString(undefined, true);
  ramMd.appendMarkdown('**Memoire systeme**\n\n');
  ramMd.appendMarkdown('Utilisee : ' + m.formatGb(ram.usedBytes) + ' GB\n\n');
  ramMd.appendMarkdown('Totale : ' + m.formatGb(ram.totalBytes) + ' GB\n\n');
  ramMd.appendMarkdown('Libre : ' + m.formatGb(ram.totalBytes - ram.usedBytes) + ' GB\n\n');
  ramMd.appendMarkdown('Occupation : ' + ram.pct.toFixed(1) + ' %');

  const mk = function (title, value, source) {
    const md = new vscode.MarkdownString(undefined, true);
    md.appendMarkdown('**' + title + '**\n\n');
    if (!snap || snap.state === 'missing') {
      md.appendMarkdown('typeperf introuvable ou refuse par le systeme.\n\n');
    } else if (snap.state === 'error') {
      md.appendMarkdown('La sonde typeperf s\'est arretee.\n\n');
    } else if (value === null) {
      md.appendMarkdown('Premier echantillon en attente.\n\n');
    } else {
      md.appendMarkdown(value.toFixed(1) + ' %\n\n');
      md.appendMarkdown('Dernier echantillon il y a ' + m.formatAge(Date.now() - snap.ts) + '\n\n');
    }
    md.appendMarkdown('Source : ' + source + '\n\n');
    md.appendMarkdown('Relance : palette de commandes, System Monitor');
    return md;
  };

  return {
    cpu: cpuMd,
    ram: ramMd,
    gpu: mk('GPU', snap ? snap.gpu : null, 'compteur Windows GPU Engine, moteurs de type 3D'),
    disk: mk('Disque', snap ? snap.disk : null, 'compteur Windows PhysicalDisk, temps d\'activite tous volumes')
  };
}

function render() {
  if (!it.cpu) return;
  const w = m.clampInt(cfg().get('barWidth'), 4, 20);

  const cur = m.cpuSample();
  const cpuPct = prevCpu ? m.cpuPercent(prevCpu, cur) : null;
  prevCpu = cur;
  if (shown('cpu')) {
    drawGroup('cpu', cpuPct, m.formatPercent(cpuPct), w,
      cpuPct === null ? GRAY : m.colorFor(cpuPct));
  } else hideGroup('cpu');

  const snap = probe ? probe.snapshot() : null;
  const stale = !snap || snap.state !== 'ok' || (Date.now() - snap.ts > STALE_MS);

  for (const key of ['gpu', 'disk']) {
    if (!shown(key)) { hideGroup(key); continue; }
    const v = snap ? snap[key] : null;
    drawGroup(key, v === null ? 0 : v,
      probeText(v, snap && snap.state), w,
      (stale || v === null) ? GRAY : m.colorFor(v));
  }

  const ram = m.ramSnapshot();
  if (shown('ram')) {
    drawGroup('ram', ram.pct, m.formatRam(ram), w, m.colorFor(ram.pct));
  } else hideGroup('ram');

  const tips = tipsFor(cpuPct, snap, ram);
  for (const key of GROUPS) {
    it[key].lbl.tooltip = tips[key];
    it[key].bar.tooltip = tips[key];
    it[key].val.tooltip = tips[key];
  }
}

function schedule() {
  const s = m.clampInt(cfg().get('refreshSeconds'), 1, 60);
  clearInterval(timer);
  timer = setInterval(render, s * 1000);
}

function syncProbe() {
  const wanted = shown('gpu') || shown('disk');
  clearInterval(restartTimer);
  if (!wanted) {
    if (probe) { probe.stop(); probe = null; }
    return;
  }
  const interval = m.clampInt(cfg().get('refreshSeconds'), 1, 60);
  if (!probe || probe.interval !== interval) {
    if (probe) probe.stop();
    probe = new Probe(interval);
  }
  probe.restart();
  const every = Math.max(60, Number(cfg().get('probeRestartSeconds')) || 300) * 1000;
  restartTimer = setInterval(function () { if (probe) probe.restart(); }, every);
}

function disposeItems() {
  for (const key in it) {
    const g = it[key];
    if (!g) continue;
    g.lbl.dispose(); g.bar.dispose(); g.val.dispose();
    delete it[key];
  }
}

function buildItems(context) {
  const want = cfg().get('alignment') === 'right' ? 'right' : 'left';
  if (currentAlignment === want) return;
  currentAlignment = want;

  disposeItems();

  const align = want === 'right'
    ? vscode.StatusBarAlignment.Right
    : vscode.StatusBarAlignment.Left;

  const mk = function (prio) {
    const s = vscode.window.createStatusBarItem(align, prio);
    context.subscriptions.push(s);
    return s;
  };

  let prio = 100;
  for (const key of GROUPS) {
    it[key] = { lbl: mk(prio), bar: mk(prio - 1), val: mk(prio - 2) };
    prio -= 3;
  }
}

function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('sysmon.restartProbe', function () {
    if (probe) probe.restart(); else syncProbe();
    render();
  }));

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(function (e) {
    if (!e.affectsConfiguration('sysmon')) return;
    if (e.affectsConfiguration('sysmon.alignment')) buildItems(context);
    if (e.affectsConfiguration('sysmon.showGpu') ||
      e.affectsConfiguration('sysmon.showDisk') ||
      e.affectsConfiguration('sysmon.refreshSeconds') ||
      e.affectsConfiguration('sysmon.probeRestartSeconds')) syncProbe();
    schedule();
    render();
  }));

  context.subscriptions.push({
    dispose: function () {
      clearInterval(timer);
      clearInterval(restartTimer);
      if (probe) { probe.stop(); probe = null; }
    }
  });

  buildItems(context);
  syncProbe();
  render();
  schedule();
}

function deactivate() {
  clearInterval(timer);
  clearInterval(restartTimer);
  if (probe) { probe.stop(); probe = null; }
  disposeItems();
  currentAlignment = null;
}

module.exports = { activate, deactivate };
