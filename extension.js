const vscode = require('vscode');
const m = require('./metrics');
const { GpuProbe } = require('./gpu');

const FULL = '$(sysmon-bar-full)';
const EMPTY = '$(sysmon-bar-empty)';
const GRAY = '#8a8a8a';
const GPU_STALE_MS = 30000;

const it = {};
let timer = null;
let gpuRestartTimer = null;
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

function drawGroup(lbl, barItem, valItem, label, pct, valueText, width, color) {
  seg(lbl, label, undefined);
  seg(barItem, m.bar(pct, width, FULL, EMPTY), color);
  seg(valItem, valueText, undefined);
}

function gpuText(snap) {
  if (!snap || snap.state === 'missing' || snap.state === 'error') return 'n/a';
  if (snap.pct === null) return '--';
  return Math.round(snap.pct) + '%';
}

function setTips(cpuPct, gs, ram) {
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

  const gpuMd = new vscode.MarkdownString(undefined, true);
  gpuMd.isTrusted = true;
  gpuMd.appendMarkdown('**GPU**\n\n');
  if (!gs || gs.state === 'missing') {
    gpuMd.appendMarkdown('typeperf introuvable ou refuse par le systeme.\n\n');
  } else if (gs.state === 'error') {
    gpuMd.appendMarkdown('La sonde typeperf s\'est arretee.\n\n');
  } else if (gs.pct === null) {
    gpuMd.appendMarkdown('Premier echantillon en attente.\n\n');
  } else {
    gpuMd.appendMarkdown('Moteurs 3D : ' + gs.pct.toFixed(1) + ' %\n\n');
    gpuMd.appendMarkdown('Dernier echantillon il y a ' + m.formatAge(Date.now() - gs.ts) + '\n\n');
  }
  gpuMd.appendMarkdown('Source : compteur Windows GPU Engine, moteurs de type 3D\n\n');
  gpuMd.appendMarkdown('[$(sync) Relancer la sonde](command:sysmon.restartGpu)');

  for (const k of ['lc', 'bc', 'vc']) it[k].tooltip = cpuMd;
  for (const k of ['lg', 'bg', 'vg']) { it[k].tooltip = gpuMd; it[k].command = 'sysmon.restartGpu'; }
  for (const k of ['lr', 'br', 'vr']) it[k].tooltip = ramMd;
}

function render() {
  if (!it.lc) return;
  const w = m.clampInt(cfg().get('barWidth'), 4, 20);

  const cur = m.cpuSample();
  const cpuPct = prevCpu ? m.cpuPercent(prevCpu, cur) : null;
  prevCpu = cur;
  drawGroup(it.lc, it.bc, it.vc, 'CPU', cpuPct,
    cpuPct === null ? '--' : Math.round(cpuPct) + '%', w,
    cpuPct === null ? GRAY : m.colorFor(cpuPct));

  const gs = probe ? probe.snapshot() : null;
  if (cfg().get('showGpu') === false) {
    it.lg.hide(); it.bg.hide(); it.vg.hide();
  } else {
    const degraded = !gs || gs.pct === null || gs.state !== 'ok' ||
      (Date.now() - gs.ts > GPU_STALE_MS);
    drawGroup(it.lg, it.bg, it.vg, 'GPU',
      gs && gs.pct !== null ? gs.pct : 0,
      gpuText(gs), w,
      degraded ? GRAY : m.colorFor(gs.pct));
  }

  const ram = m.ramSnapshot();
  drawGroup(it.lr, it.br, it.vr, 'RAM', ram.pct, m.formatRam(ram), w, m.colorFor(ram.pct));

  setTips(cpuPct, gs, ram);
}

function schedule() {
  const s = m.clampInt(cfg().get('refreshSeconds'), 1, 60);
  clearInterval(timer);
  timer = setInterval(render, s * 1000);
}

function syncProbe() {
  const wanted = cfg().get('showGpu') !== false;
  clearInterval(gpuRestartTimer);
  if (!wanted) {
    if (probe) { probe.stop(); probe = null; }
    return;
  }
  const interval = m.clampInt(cfg().get('refreshSeconds'), 1, 60);
  if (!probe || probe.interval !== interval) {
    if (probe) probe.stop();
    probe = new GpuProbe(interval);
  }
  probe.restart();
  const every = Math.max(60, Number(cfg().get('gpuRestartSeconds')) || 300) * 1000;
  gpuRestartTimer = setInterval(function () { if (probe) probe.restart(); }, every);
}

function disposeItems() {
  for (const k in it) { if (it[k]) it[k].dispose(); delete it[k]; }
}

function buildItems(context) {
  const want = cfg().get('alignment') === 'left' ? 'left' : 'right';
  if (currentAlignment === want) return;
  currentAlignment = want;

  disposeItems();

  const align = want === 'left'
    ? vscode.StatusBarAlignment.Left
    : vscode.StatusBarAlignment.Right;

  const mk = function (prio) {
    const s = vscode.window.createStatusBarItem(align, prio);
    context.subscriptions.push(s);
    return s;
  };
  it.lc = mk(96); it.bc = mk(95); it.vc = mk(94);
  it.lg = mk(93); it.bg = mk(92); it.vg = mk(91);
  it.lr = mk(90); it.br = mk(89); it.vr = mk(88);
}

function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('sysmon.restartGpu', function () {
    if (probe) probe.restart(); else syncProbe();
    render();
  }));

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(function (e) {
    if (!e.affectsConfiguration('sysmon')) return;
    if (e.affectsConfiguration('sysmon.alignment')) buildItems(context);
    if (e.affectsConfiguration('sysmon.showGpu') ||
      e.affectsConfiguration('sysmon.refreshSeconds') ||
      e.affectsConfiguration('sysmon.gpuRestartSeconds')) syncProbe();
    schedule();
    render();
  }));

  context.subscriptions.push({
    dispose: function () {
      clearInterval(timer);
      clearInterval(gpuRestartTimer);
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
  clearInterval(gpuRestartTimer);
  if (probe) { probe.stop(); probe = null; }
  disposeItems();
  currentAlignment = null;
}

module.exports = { activate, deactivate };
