const vscode = require('vscode');
const m = require('./metrics');
const g = require('./groups');
const { t } = require('./i18n');
const { cfg } = require('./config');
const host = require('./probe-host');
const { render, memory } = require('./render');

async function pickDevices(setting, devices, allText) {
  const current = cfg().get(setting) || [];
  const none = !current.length;
  const items = [{ id: 'all', label: t('Global'), description: allText, picked: none || current.includes('all') }]
    .concat(devices.map(function (d) {
      return Object.assign({ picked: current.includes(d.id) }, d);
    }));
  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: t('Groups shown in the status bar, one group per checked entry')
  });
  if (picked === undefined) return;
  const chosen = picked.map(function (i) { return i.id; });
  const value = chosen.length === 1 && chosen[0] === 'all' ? [] : chosen;
  await cfg().update(setting, value, vscode.ConfigurationTarget.Global);
  render();
}

async function pickDisks() {
  const names = g.knownDisks(host.currentSnapshot());
  if (!names.length) {
    vscode.window.showInformationMessage(t('No disk detected yet. Wait a few seconds and try again.'));
    return;
  }
  const current = cfg().get('diskDevices') || [];
  const items = names.map((name) => ({
    label: g.shortDiskName(name),
    description: name === g.shortDiskName(name) ? '' : name,
    name: name,
    picked: !current.length || current.includes(name)
  }));
  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: t('Disks shown in the status bar, one group per checked disk')
  });
  if (picked === undefined) return;
  const chosen = picked.map((i) => i.name);
  const value = chosen.length === names.length ? [] : chosen;
  await cfg().update('diskDevices', value, vscode.ConfigurationTarget.Global);
  render();
}

function pickCpus() {
  const ci = m.cpuInfo();
  return pickDevices('cpuDevices', g.knownCores().map(function (id) {
    return { id: id, label: 'C' + id, description: t('logical core {0}', id) };
  }), t('Average of all cores, {0} logical cores', ci.cores));
}

function pickGpus() {
  const ids = g.knownGpus(host.currentSnapshot());
  if (!ids.length) {
    vscode.window.showInformationMessage(t('No GPU detected yet. Wait a few seconds and try again.'));
    return;
  }
  return pickDevices('gpuDevices', ids.map(function (id) {
    return { id: id, label: g.gpuLabel(id), description: t('adapter {0}', id) };
  }), t('Sum of all adapters'));
}

function restartProbe() {
  memory.resetPageFile();
  host.restartProbe();
  render();
}

function registerCommands(context) {
  const table = {
    'sysmon.restartProbe': restartProbe,
    'sysmon.pickDisks': pickDisks,
    'sysmon.pickCpus': pickCpus,
    'sysmon.pickGpus': pickGpus
  };
  for (const id in table) context.subscriptions.push(vscode.commands.registerCommand(id, table[id]));
}

module.exports = { registerCommands };
