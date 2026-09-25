const vscode = require('vscode');
const m = require('./metrics');
const { cfg } = require('./config');
const host = require('./probe-host');
const bar = require('./statusbar');
const { render, resetRender } = require('./render');
const { registerCommands } = require('./commands');

const PROBE_SETTINGS = ['showGpu', 'showDisk', 'showSwap', 'refreshSeconds', 'probeRestartSeconds'];

let timer = null;

function schedule() {
  const s = m.clampInt(cfg().get('refreshSeconds'), 1, 60);
  const mult = host.focused()
    ? 1
    : Math.max(1, Number(cfg().get('unfocusedMultiplier')) || 1);
  clearInterval(timer);
  timer = setInterval(render, s * 1000 * mult);
}

function shutdown() {
  clearInterval(timer);
  timer = null;
  host.disposeProbe();
  bar.disposeItems();
  resetRender();
}

function activate(context) {
  registerCommands(context);

  context.subscriptions.push(vscode.window.onDidChangeWindowState(function () {
    host.syncProbe();
    schedule();
    render();
  }));

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(function (e) {
    if (!e.affectsConfiguration('sysmon')) return;
    if (PROBE_SETTINGS.some(function (k) { return e.affectsConfiguration('sysmon.' + k); })) host.syncProbe();
    schedule();
    render();
  }));

  context.subscriptions.push({ dispose: shutdown });

  host.syncProbe();
  render();
  schedule();
}

function deactivate() {
  shutdown();
}

module.exports = { activate, deactivate };
