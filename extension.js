const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
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

function staleMs(refreshSeconds) {
  return Math.max(30000, refreshSeconds * 3000);
}

const LABELS = { cpu: 'CPU', gpu: 'GPU', disk: 'DISK', ram: 'RAM' };

const it = {};
let timer = null;
let restartTimer = null;
let restartEvery = 0;
let prevCpu = null;
let prevCores = null;
let probe = null;
let currentAlignment = null;
let currentKeys = '';
let ctx = null;
let lastTips = 0;

function shortDiskName(name) {
  const mm = /^\d+\s+(.+)$/.exec(String(name || ''));
  return mm ? mm[1] : String(name || '');
}

function diskKey(name) { return 'disk:' + name; }

function isDiskKey(key) { return key.indexOf('disk:') === 0; }

function diskOf(key) { return key.slice(5); }

function subOf(key) { return key.slice(key.indexOf(':') + 1); }

function gpuLabel(id) { return /^\d+$/.test(id) ? 'GPU' + id : id; }

function labelFor(key) {
  if (isDiskKey(key)) return shortDiskName(diskOf(key));
  if (key.indexOf('cpu:') === 0) return 'C' + subOf(key);
  if (key.indexOf('gpu:') === 0) return gpuLabel(subOf(key));
  return LABELS[key];
}

function byNumber(a, b) {
  const na = Number(a.replace(/\D+/g, '')), nb = Number(b.replace(/\D+/g, ''));
  return na - nb || (a < b ? -1 : a > b ? 1 : 0);
}

function knownGpus(snap) {
  return snap && snap.gpus ? Object.keys(snap.gpus).sort(byNumber) : [];
}

function knownCores() {
  return m.cpuCoreSamples().map(function (_, i) { return String(i); });
}

function deviceKeys(kind, chosen, ids) {
  if (!chosen.length || !ids.length) return [kind];
  const keys = [];
  if (chosen.indexOf('all') >= 0) keys.push(kind);
  for (const id of ids) if (chosen.indexOf(id) >= 0) keys.push(kind + ':' + id);
  return keys.length ? keys : [kind];
}

function knownDisks(snap) {
  return snap && snap.disks ? Object.keys(snap.disks).sort() : [];
}

function visibleDisks(conf, snap) {
  const all = knownDisks(snap);
  if (!conf.diskDevices.length) return all;
  return all.filter(function (n) { return conf.diskDevices.indexOf(n) >= 0; });
}

function groupKeys(conf, snap) {
  const keys = [];
  if (conf.show.cpu) keys.push.apply(keys, deviceKeys('cpu', conf.cpuDevices || [], knownCores()));
  if (conf.show.gpu) keys.push.apply(keys, deviceKeys('gpu', conf.gpuDevices || [], knownGpus(snap)));
  if (conf.show.disk) {
    if (!knownDisks(snap).length) keys.push('disk');
    else for (const n of visibleDisks(conf, snap)) keys.push(diskKey(n));
  }
  if (conf.show.ram) keys.push('ram');
  return keys;
}

function cfg() { return vscode.workspace.getConfiguration('sysmon'); }

const SHARE_FILE = path.join(os.tmpdir(), 'sysmon-probe-share.json');
const LEASE_MS = 8000;
const OWNER_ID = String(process.pid) + '-' + Math.random().toString(36).slice(2, 8);

let leaseHeld = false;

function readShare() {
  try { return JSON.parse(fs.readFileSync(SHARE_FILE, 'utf8')); } catch (_) { return null; }
}

function writeShare(o) {
  const tmp = SHARE_FILE + '.' + process.pid + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(o));
    fs.renameSync(tmp, SHARE_FILE);
  } catch (_) {
    try { fs.unlinkSync(tmp); } catch (_) { }
  }
}

function shareEnabled() { return cfg().get('shareProbe') !== false; }

function claimLease(now) {
  const s = readShare();
  return !s || !s.owner || !s.lease || s.lease < now || s.owner === OWNER_ID;
}

function publishShare(snap, now) {
  writeShare({
    owner: OWNER_ID,
    lease: now + LEASE_MS,
    ts: snap.ts,
    state: snap.state,
    gpu: snap.gpu,
    gpus: snap.gpus || {},
    disk: snap.disk,
    disks: snap.disks || {}
  });
}

function sharedSnapshot() {
  const s = readShare();
  if (!s || !s.ts) return null;
  return { gpu: s.gpu, gpus: s.gpus || {}, disk: s.disk, disks: s.disks || {}, ts: s.ts, state: s.state || 'ok' };
}

function releaseShare() {
  if (!leaseHeld) return;
  const s = readShare();
  if (s && s.owner === OWNER_ID) writeShare(Object.assign({}, s, { owner: null, lease: 0 }));
  leaseHeld = false;
}

function takeoverShare(now) {
  const s = readShare();
  writeShare(Object.assign({}, s || {}, { owner: OWNER_ID, lease: now + LEASE_MS }));
  leaseHeld = true;
}

function currentSnapshot() {
  if (probe) return probe.snapshot();
  return shareEnabled() ? sharedSnapshot() : null;
}

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

function readCfg() {
  const c = cfg();
  return {
    barWidth: m.clampInt(c.get('barWidth'), 4, 20),
    showLabels: c.get('showLabels') !== false,
    showBars: c.get('showBars') !== false,
    showValues: c.get('showValues') !== false,
    diskDevices: c.get('diskDevices') || [],
    cpuDevices: c.get('cpuDevices') || [],
    gpuDevices: c.get('gpuDevices') || [],
    refreshSeconds: m.clampInt(c.get('refreshSeconds'), 1, 60),
    alignment: c.get('alignment') === 'right' ? 'right' : 'left',
    tooltipMs: Math.max(1, Number(c.get('tooltipSeconds')) || 5) * 1000,
    show: {
      cpu: c.get('showCpu') !== false,
      gpu: c.get('showGpu') !== false,
      disk: c.get('showDisk') !== false,
      ram: c.get('showRam') !== false
    }
  };
}

function drawGroup(key, pct, valueText, color, conf) {
  const g = it[key];
  const withBar = conf.showBars;
  const withValue = conf.showValues;

  if (!withBar && !withValue) { hideGroup(key); return; }

  seg(g.lbl, conf.showLabels ? labelFor(key) : '', undefined);
  seg(g.bar, withBar ? m.bar(pct, conf.barWidth, FULL, EMPTY) : '', color);
  seg(g.val, withValue ? valueText : '', undefined);
}

function probeText(pct, state) {
  if (state === 'missing' || state === 'error') return m.padNum('n/a', 4);
  return m.formatPercent(pct);
}

function pickerLink(md, command, text) {
  md.isTrusted = true;
  md.appendMarkdown('\n\n[$(list-selection) ' + text + '](command:' + command + ')');
  return md;
}

function tipsFor(cpuPct, cores, snap, ram, conf) {
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

  const names = knownDisks(snap);
  const shown = visibleDisks(conf, snap);

  const withPicker = function (md) {
    if (!names.length) return md;
    md.appendMarkdown('\n\nDisques vus : ' + names.map(shortDiskName).join(', ') + '\n\n');
    md.isTrusted = true;
    md.appendMarkdown('[$(list-selection) Choisir les disques affiches](command:sysmon.pickDisks)');
    return md;
  };

  const tips = {
    cpu: pickerLink(cpuMd, 'sysmon.pickCpus', 'Choisir les coeurs affiches'),
    ram: ramMd,
    gpu: pickerLink(mk('GPU, tous adaptateurs', snap ? snap.gpu : null, GPU_SOURCE),
      'sysmon.pickGpus', 'Choisir les GPU affiches')
  };

  for (const key in it) {
    if (key.indexOf('cpu:') === 0) {
      const v = cores[subOf(key)];
      const md = new vscode.MarkdownString(undefined, true);
      md.appendMarkdown('**Coeur logique ' + subOf(key) + '**\n\n' + ci.model + '\n\n');
      md.appendMarkdown('Charge : ' + (typeof v === 'number' ? v.toFixed(1) + ' %' : 'mesure en cours'));
      tips[key] = pickerLink(md, 'sysmon.pickCpus', 'Choisir les coeurs affiches');
    } else if (key.indexOf('gpu:') === 0) {
      const v = snap && snap.gpus && typeof snap.gpus[subOf(key)] === 'number' ? snap.gpus[subOf(key)] : null;
      tips[key] = pickerLink(mk('GPU ' + subOf(key), v, GPU_SOURCE), 'sysmon.pickGpus', 'Choisir les GPU affiches');
    }
  }

  for (const name of shown) {
    const v = snap && snap.disks && typeof snap.disks[name] === 'number' ? snap.disks[name] : null;
    tips[diskKey(name)] = withPicker(mk('Disque ' + name, v, DISK_SOURCE));
  }
  if (!names.length) tips.disk = withPicker(mk('Disque', null, DISK_SOURCE));

  return tips;
}

function pumpProbe(conf, now) {
  if (!conf.show.gpu && !conf.show.disk) return probe ? probe.snapshot() : null;
  if (!shareEnabled()) {
    if (!leaseHeld) { leaseHeld = true; syncProbe(); }
    return probe ? probe.snapshot() : null;
  }
  const want = claimLease(now);
  if (want !== leaseHeld) {
    leaseHeld = want;
    syncProbe();
  }
  if (!leaseHeld) return sharedSnapshot();
  const snap = probe ? probe.snapshot() : null;
  if (snap) publishShare(snap, now);
  return snap;
}

function render() {
  const conf = readCfg();
  const now = Date.now();
  const snap = pumpProbe(conf, now);
  syncGroups(conf, snap);

  let cpuPct = null;
  const cores = {};
  if (conf.show.cpu) {
    const cur = m.cpuSample();
    cpuPct = prevCpu ? m.cpuPercent(prevCpu, cur) : null;
    prevCpu = cur;
    const curCores = m.cpuCoreSamples();
    curCores.forEach(function (c, i) {
      const p = prevCores && prevCores[i] ? m.cpuPercent(prevCores[i], c) : null;
      if (p !== null) cores[i] = p;
    });
    prevCores = curCores;
  } else {
    prevCpu = null;
    prevCores = null;
  }
  for (const key in it) {
    if (key !== 'cpu' && key.indexOf('cpu:') !== 0) continue;
    const v = key === 'cpu' ? cpuPct : (typeof cores[subOf(key)] === 'number' ? cores[subOf(key)] : null);
    drawGroup(key, v, m.formatPercent(v), v === null ? GRAY : m.colorFor(v), conf);
  }

  const fresh = !!(snap && snap.ts && now - snap.ts <= staleMs(conf.refreshSeconds));
  const stale = !fresh || snap.state === 'missing' || snap.state === 'error';

  for (const key in it) {
    if (key !== 'gpu' && key.indexOf('gpu:') !== 0) continue;
    const raw = !snap ? null : key === 'gpu' ? snap.gpu : snap.gpus && snap.gpus[subOf(key)];
    const v = typeof raw === 'number' ? raw : null;
    drawGroup(key, v === null ? 0 : v,
      probeText(v, snap && snap.state),
      (stale || v === null) ? GRAY : m.colorFor(v), conf);
  }

  for (const key in it) {
    if (key !== 'disk' && !isDiskKey(key)) continue;
    const raw = key === 'disk' || !snap || !snap.disks ? null : snap.disks[diskOf(key)];
    const v = typeof raw === 'number' ? raw : null;
    drawGroup(key, v === null ? 0 : v,
      probeText(v, snap && snap.state),
      (stale || v === null) ? GRAY : m.colorFor(v), conf);
  }

  const ram = m.ramSnapshot();
  if (it.ram) drawGroup('ram', ram.pct, m.formatRam(ram), m.colorFor(ram.pct), conf);

  if (now - lastTips < conf.tooltipMs) return;
  lastTips = now;
  const tips = tipsFor(cpuPct, cores, snap, ram, conf);
  for (const key in it) {
    const t = tips[key];
    if (!t) continue;
    it[key].lbl.tooltip = t;
    it[key].bar.tooltip = t;
    it[key].val.tooltip = t;
  }
}

function schedule() {
  const s = m.clampInt(cfg().get('refreshSeconds'), 1, 60);
  const mult = focused()
    ? 1
    : Math.max(1, Number(cfg().get('unfocusedMultiplier')) || 1);
  clearInterval(timer);
  timer = setInterval(render, s * 1000 * mult);
}

function focused() {
  return !(vscode.window.state && vscode.window.state.focused === false);
}

function pauseAllowed() {
  return cfg().get('pauseWhenUnfocused') === true;
}

function armRestart() {
  const every = Math.max(60, Number(cfg().get('probeRestartSeconds')) || 300) * 1000;
  if (restartTimer && every === restartEvery) return;
  clearInterval(restartTimer);
  restartEvery = every;
  restartTimer = setInterval(function () { if (probe) probe.restart(); }, every);
}

function stopRestart() {
  clearInterval(restartTimer);
  restartTimer = null;
  restartEvery = 0;
}

function syncProbe() {
  const wanted = shown('gpu') || shown('disk');
  if (!wanted || (pauseAllowed() && !focused()) || !leaseHeld) {
    stopRestart();
    if (probe) { probe.stop(); probe = null; }
    return;
  }
  const interval = m.clampInt(cfg().get('refreshSeconds'), 1, 60);
  if (probe && probe.interval === interval) { armRestart(); return; }
  if (probe) probe.stop();
  probe = createProbe(interval);
  probe.start();
  armRestart();
}

function disposeItems() {
  for (const key in it) {
    const g = it[key];
    if (!g) continue;
    g.lbl.dispose(); g.bar.dispose(); g.val.dispose();
    delete it[key];
  }
}

function syncGroups(conf, snap) {
  const want = groupKeys(conf, snap);
  const sig = want.join('|');
  if (sig === currentKeys && conf.alignment === currentAlignment) return;
  currentKeys = sig;
  currentAlignment = conf.alignment;

  disposeItems();

  const align = conf.alignment === 'right'
    ? vscode.StatusBarAlignment.Right
    : vscode.StatusBarAlignment.Left;

  let prio = 100;
  for (const key of want) {
    it[key] = {
      lbl: vscode.window.createStatusBarItem(align, prio),
      bar: vscode.window.createStatusBarItem(align, prio - 1),
      val: vscode.window.createStatusBarItem(align, prio - 2)
    };
    prio -= 3;
  }
}

async function pickDevices(setting, devices, allText) {
  const current = cfg().get(setting) || [];
  const none = !current.length;
  const items = [{ id: 'all', label: 'Global', description: allText, picked: none || current.includes('all') }]
    .concat(devices.map(function (d) {
      return Object.assign({ picked: current.includes(d.id) }, d);
    }));
  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: 'Groupes affiches dans la barre d\'etat, un groupe par entree cochee'
  });
  if (picked === undefined) return;
  const chosen = picked.map(function (i) { return i.id; });
  const value = chosen.length === 1 && chosen[0] === 'all' ? [] : chosen;
  await cfg().update(setting, value, vscode.ConfigurationTarget.Global);
  render();
}

function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('sysmon.restartProbe', function () {
    if (probe) { probe.restart(); render(); return; }
    takeoverShare(Date.now());
    syncProbe();
    render();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('sysmon.pickDisks', async function () {
    const snap = currentSnapshot();
    const names = knownDisks(snap);
    if (!names.length) {
      vscode.window.showInformationMessage('Aucun disque detecte pour l\'instant. Patientez quelques secondes puis reessayez.');
      return;
    }
    const current = cfg().get('diskDevices') || [];
    const items = names.map((name) => ({
      label: shortDiskName(name),
      description: name === shortDiskName(name) ? '' : name,
      name: name,
      picked: !current.length || current.includes(name)
    }));
    const picked = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: 'Disques affiches dans la barre d\'etat, un groupe par disque coche'
    });
    if (picked === undefined) return;
    const chosen = picked.map((i) => i.name);
    const value = chosen.length === names.length ? [] : chosen;
    await cfg().update('diskDevices', value, vscode.ConfigurationTarget.Global);
    render();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('sysmon.pickCpus', function () {
    const ci = m.cpuInfo();
    return pickDevices('cpuDevices', knownCores().map(function (id) {
      return { id: id, label: 'C' + id, description: 'coeur logique ' + id };
    }), 'Moyenne de tous les coeurs, ' + ci.cores + ' coeurs logiques');
  }));

  context.subscriptions.push(vscode.commands.registerCommand('sysmon.pickGpus', function () {
    const ids = knownGpus(currentSnapshot());
    if (!ids.length) {
      vscode.window.showInformationMessage('Aucun GPU detecte pour l\'instant. Patientez quelques secondes puis reessayez.');
      return;
    }
    return pickDevices('gpuDevices', ids.map(function (id) {
      return { id: id, label: gpuLabel(id), description: 'adaptateur ' + id };
    }), 'Somme de tous les adaptateurs');
  }));

  context.subscriptions.push(vscode.window.onDidChangeWindowState(function () {
    syncProbe();
    schedule();
    render();
  }));

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(function (e) {
    if (!e.affectsConfiguration('sysmon')) return;
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
      stopRestart();
      if (probe) { probe.stop(); probe = null; }
      releaseShare();
      disposeItems();
    }
  });

  syncProbe();
  render();
  schedule();
}

function deactivate() {
  clearInterval(timer);
  stopRestart();
  if (probe) { probe.stop(); probe = null; }
  releaseShare();
  disposeItems();
  currentAlignment = null;
  currentKeys = '';
}

module.exports = {
  activate, deactivate,
  shortDiskName, visibleDisks, groupKeys, labelFor, deviceKeys, knownGpus,
  claimLease, publishShare, sharedSnapshot, releaseShare, SHARE_FILE, OWNER_ID
};
