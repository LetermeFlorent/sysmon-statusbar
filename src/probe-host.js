const os = require('node:os');
const vscode = require('vscode');
const m = require('./metrics');
const { cfg, shown } = require('./config');
const share = require('./share');
const { Probe: WindowsProbe } = require('./probes/windows');
const { LinuxProbe } = require('./probes/linux');
const { MacProbe } = require('./probes/mac');

const IS_WINDOWS = os.platform() === 'win32';
const IS_MAC = os.platform() === 'darwin';

let probe = null;
let restartTimer = null;
let restartEvery = 0;

function createProbe(interval) {
  if (IS_WINDOWS) return new WindowsProbe(interval);
  if (IS_MAC) return new MacProbe(interval);
  return new LinuxProbe(interval);
}

function probeWanted() {
  return shown('gpu') || shown('disk') || (IS_WINDOWS && shown('swap'));
}

function focused() {
  return !(vscode.window.state && vscode.window.state.focused === false);
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

function stopProbe() {
  stopRestart();
  if (probe) { probe.stop(); probe = null; }
}

function syncProbe() {
  const paused = cfg().get('pauseWhenUnfocused') === true && !focused();
  if (!probeWanted() || paused || !share.lease.held) { stopProbe(); return; }
  const interval = m.clampInt(cfg().get('refreshSeconds'), 1, 60);
  if (probe && probe.interval === interval) { armRestart(); return; }
  if (probe) probe.stop();
  probe = createProbe(interval);
  probe.start();
  armRestart();
}

function shareEnabled() { return cfg().get('shareProbe') !== false; }

function pumpProbe(now) {
  if (!probeWanted()) return probe ? probe.snapshot() : null;
  if (!shareEnabled()) {
    if (!share.lease.held) { share.lease.held = true; syncProbe(); }
    return probe ? probe.snapshot() : null;
  }
  const want = share.claimLease(now);
  if (want !== share.lease.held) {
    share.lease.held = want;
    syncProbe();
  }
  if (!share.lease.held) return share.sharedSnapshot();
  const snap = probe ? probe.snapshot() : null;
  if (snap) share.publishShare(snap, now);
  return snap;
}

function currentSnapshot() {
  if (probe) return probe.snapshot();
  return shareEnabled() ? share.sharedSnapshot() : null;
}

function restartProbe() {
  if (probe) { probe.restart(); return; }
  share.takeoverShare(Date.now());
  syncProbe();
}

function disposeProbe() {
  stopProbe();
  share.releaseShare();
}

module.exports = {
  IS_WINDOWS, IS_MAC, focused, syncProbe, pumpProbe, currentSnapshot, restartProbe, disposeProbe
};
