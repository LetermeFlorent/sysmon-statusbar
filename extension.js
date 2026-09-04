const os = require('node:os');
const vscode = require('vscode');
const m = require('./metrics');
const { Probe: WindowsProbe } = require('./probe');
const { LinuxProbe } = require('./linux');
const { MacProbe } = require('./mac');

const IS_WINDOWS = os.platform() === 'win32';
const IS_MAC = os.platform() === 'darwin';

function createProbe(interval) {
  if (IS_WINDOWS) return new WindowsProbe(interval);
  if (IS_MAC) return new MacProbe(interval);
  return new LinuxProbe(interval);
}

const GPU_SOURCE = IS_WINDOWS
  ? 'compteur Windows GPU Engine, moteurs de type 3D'
  : IS_MAC
    ? 'ioreg, statistiques de l\'accelerateur graphique'
    : 'sysfs gpu_busy_percent, ou nvidia-smi si disponible';

const DISK_SOURCE = IS_WINDOWS
  ? 'compteur Windows PhysicalDisk, un par disque'
  : IS_MAC
    ? 'indisponible sur macOS sans privileges : aucun pourcentage d\'occupation n\'est expose'
    : '/proc/diskstats, un disque par device';

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
let lastTips = 0;

function cfg() { return vscode.workspace.getConfiguration('sysmon'); }

// Chaque ecriture sur un StatusBarItem traverse le pont vers le process
// d'interface. Les libelles ne changent jamais et une barre ne bouge qu'au
// passage d'un palier : sans ce garde, tout est repousse deux fois par seconde
// pour un rendu identique.
function seg(item, text, color) {
  if (!text) {
    if (item._on !== false) { item.hide(); item._on = false; }
    return;
  }
  if (item._text !== text) { item.text = text; item._text = text; }
  if (item._color !== color) { item.color = color; item._color = color; }
  if (item._on !== true) { item.show(); item._on = true; }
}

function hideItem(item) {
  if (item._on !== false) { item.hide(); item._on = false; }
}

function hideGroup(key) {
  hideItem(it[key].lbl); hideItem(it[key].bar); hideItem(it[key].val);
}

function shown(key) {
  return cfg().get('show' + key.charAt(0).toUpperCase() + key.slice(1)) !== false;
}

// Une vingtaine de getConfiguration par tick sinon, en cascade a travers
// shown() et drawGroup().
function readCfg() {
  const c = cfg();
  return {
    barWidth: m.clampInt(c.get('barWidth'), 4, 20),
    showLabels: c.get('showLabels') !== false,
    showBars: c.get('showBars') !== false,
    showValues: c.get('showValues') !== false,
    diskDevices: c.get('diskDevices') || [],
    tooltipMs: Math.max(1, Number(c.get('tooltipSeconds')) || 5) * 1000,
    show: {
      cpu: c.get('showCpu') !== false,
      gpu: c.get('showGpu') !== false,
      disk: c.get('showDisk') !== false,
      ram: c.get('showRam') !== false
    }
  };
}

// Un item de barre d'etat ne porte qu'une seule couleur. La valeur vit donc
// dans le sien : sans couleur explicite, VS Code lui applique
// statusBar.foreground, qui suit le theme, sombre en theme clair et clair en
// theme sombre. Seule la barre est teintee par la charge. Le prix a payer est
// la marge que VS Code insere entre deux items, qu'aucune extension ne reduit.
function drawGroup(key, pct, valueText, color, conf) {
  const g = it[key];
  const withBar = conf.showBars;
  const withValue = conf.showValues;

  if (!withBar && !withValue) { hideGroup(key); return; }

  seg(g.lbl, conf.showLabels ? LABELS[key] : '', undefined);
  seg(g.bar, withBar ? m.bar(pct, conf.barWidth, FULL, EMPTY) : '', color);
  // Le remplissage reste en place. Un item se dimensionne sur son contenu, donc
  // le retirer fait passer la valeur de deux a quatre chasses entre "9%" et
  // "100%", et tout ce qui suit dans la barre d'etat se decale a chaque palier.
  seg(g.val, withValue ? valueText : '', undefined);
}

function probeText(pct, state) {
  if (state === 'missing' || state === 'error') return m.padNum('n/a', 4);
  return m.formatPercent(pct);
}

function tipsFor(cpuPct, snap, ram, conf) {
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
      md.appendMarkdown(IS_WINDOWS
        ? 'typeperf introuvable ou refuse par le systeme.\n\n'
        : 'Aucune source disponible sur cette machine.\n\n');
    } else if (snap.state === 'error') {
      md.appendMarkdown(IS_WINDOWS
        ? 'La sonde typeperf s\'est arretee.\n\n'
        : 'La sonde s\'est arretee.\n\n');
    } else if (value === null) {
      if (IS_MAC && title === 'Disque') md.appendMarkdown('Non mesure sur macOS.\n\n');
      else
      md.appendMarkdown('Premier echantillon en attente.\n\n');
    } else {
      md.appendMarkdown(value.toFixed(1) + ' %\n\n');
      md.appendMarkdown('Dernier echantillon il y a ' + m.formatAge(Date.now() - snap.ts) + '\n\n');
    }
    md.appendMarkdown('Source : ' + source + '\n\n');
    md.appendMarkdown('Relance : palette de commandes, System Monitor');
    return md;
  };

  const diskSelectedPct = snap ? m.selectedDiskPercent(snap.disks, snap.disk, conf.diskDevices) : null;
  const diskMd = mk('Disque', diskSelectedPct, DISK_SOURCE);
  const names = snap && snap.disks ? Object.keys(snap.disks).sort() : [];
  const selected = conf.diskDevices;
  if (names.length) {
    diskMd.appendMarkdown('\n\n**Detail par disque**\n\n');
    for (const name of names) {
      const cocher = !selected.length || selected.includes(name);
      diskMd.appendMarkdown((cocher ? '**' : '') + name + ' : ' + snap.disks[name].toFixed(1) + ' %' + (cocher ? '**' : '') + '\n\n');
    }
    diskMd.isTrusted = true;
    diskMd.appendMarkdown('[$(list-selection) Choisir les disques](command:sysmon.pickDisks)');
  }

  return {
    cpu: cpuMd,
    ram: ramMd,
    gpu: mk('GPU', snap ? snap.gpu : null, GPU_SOURCE),
    disk: diskMd
  };
}

function render() {
  if (!it.cpu) return;
  const conf = readCfg();
  const now = Date.now();

  const cur = m.cpuSample();
  const cpuPct = prevCpu ? m.cpuPercent(prevCpu, cur) : null;
  prevCpu = cur;
  if (conf.show.cpu) {
    drawGroup('cpu', cpuPct, m.formatPercent(cpuPct),
      cpuPct === null ? GRAY : m.colorFor(cpuPct), conf);
  } else hideGroup('cpu');

  const snap = probe ? probe.snapshot() : null;
  // Un redemarrage de sonde repasse par l'etat 'starting' : tant que le dernier
  // echantillon date de moins de STALE_MS, il reste valable et il n'y a aucune
  // raison de faire clignoter les barres en gris.
  const fresh = !!(snap && snap.ts && now - snap.ts <= STALE_MS);
  const stale = !fresh || snap.state === 'missing' || snap.state === 'error';

  for (const key of ['gpu', 'disk']) {
    if (!conf.show[key]) { hideGroup(key); continue; }
    const v = !snap ? null : (key === 'disk'
      ? m.selectedDiskPercent(snap.disks, snap.disk, conf.diskDevices)
      : snap.gpu);
    drawGroup(key, v === null ? 0 : v,
      probeText(v, snap && snap.state),
      (stale || v === null) ? GRAY : m.colorFor(v), conf);
  }

  const ram = m.ramSnapshot();
  if (conf.show.ram) {
    drawGroup('ram', ram.pct, m.formatRam(ram), m.colorFor(ram.pct), conf);
  } else hideGroup('ram');

  // Un tooltip n'est lu qu'au survol et VS Code ne le rafraichit pas pendant
  // qu'il est affiche : le reconstruire a chaque tick revient a jeter quatre
  // MarkdownString par seconde pour rien.
  if (now - lastTips < conf.tooltipMs) return;
  lastTips = now;
  const tips = tipsFor(cpuPct, snap, ram, conf);
  for (const key of GROUPS) {
    if (!conf.show[key]) continue;
    it[key].lbl.tooltip = tips[key];
    it[key].bar.tooltip = tips[key];
    it[key].val.tooltip = tips[key];
  }
}

function schedule() {
  const s = m.clampInt(cfg().get('refreshSeconds'), 1, 60);
  const mult = (pauseAllowed() && !focused())
    ? Math.max(1, Number(cfg().get('unfocusedMultiplier')) || 1)
    : 1;
  clearInterval(timer);
  timer = setInterval(render, s * 1000 * mult);
}

// Chaque fenetre VS Code fait tourner sa propre sonde, donc trois fenetres
// ouvertes mesurent trois fois la meme machine. Suspendre celle des fenetres
// au second plan ramene ce cout a une seule sonde active.
function focused() {
  return !(vscode.window.state && vscode.window.state.focused === false);
}

function pauseAllowed() {
  return cfg().get('pauseWhenUnfocused') !== false;
}

function syncProbe() {
  const wanted = shown('gpu') || shown('disk');
  clearInterval(restartTimer);
  if (!wanted || (pauseAllowed() && !focused())) {
    if (probe) { probe.stop(); probe = null; }
    return;
  }
  const interval = m.clampInt(cfg().get('refreshSeconds'), 1, 60);
  if (!probe || probe.interval !== interval) {
    if (probe) probe.stop();
    probe = createProbe(interval);
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

  context.subscriptions.push(vscode.commands.registerCommand('sysmon.pickDisks', async function () {
    const snap = probe ? probe.snapshot() : null;
    const names = snap && snap.disks ? Object.keys(snap.disks).sort() : [];
    if (!names.length) {
      vscode.window.showInformationMessage('Aucun disque detecte pour l\'instant. Patientez quelques secondes puis reessayez.');
      return;
    }
    const current = cfg().get('diskDevices') || [];
    const items = names.map((name) => ({ label: name, picked: !current.length || current.includes(name) }));
    const picked = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: 'Disques a compter dans la valeur DISK (tout coche = tous, comportement par defaut)'
    });
    if (picked === undefined) return;
    const chosen = picked.map((i) => i.label);
    // Tout laisser coche revient au mode par defaut (tableau vide), plutot que
    // de figer la liste actuelle : un disque branche plus tard reste couvert.
    const value = chosen.length === names.length ? [] : chosen;
    await cfg().update('diskDevices', value, vscode.ConfigurationTarget.Global);
  }));

  context.subscriptions.push(vscode.window.onDidChangeWindowState(function () {
    syncProbe();
    schedule();
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
