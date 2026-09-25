const vscode = require('vscode');
const m = require('./metrics');

const GROUPS = ['cpu', 'gpu', 'disk', 'ram', 'swap'];

function cfg() { return vscode.workspace.getConfiguration('sysmon'); }

function shown(key) {
  return cfg().get('show' + key.charAt(0).toUpperCase() + key.slice(1)) !== false;
}

function readCfg() {
  const c = cfg();
  const show = {};
  for (const key of GROUPS) show[key] = shown(key);
  return {
    barWidth: m.clampInt(c.get('barWidth'), 4, 20),
    showLabels: c.get('showLabels') !== false,
    showBars: c.get('showBars') !== false,
    showValues: c.get('showValues') !== false,
    diskDevices: c.get('diskDevices') || [],
    cpuDevices: c.get('cpuDevices') || [],
    gpuDevices: c.get('gpuDevices') || [],
    ramValue: c.get('ramValue') === 'free' ? 'free' : 'used',
    refreshSeconds: m.clampInt(c.get('refreshSeconds'), 1, 60),
    alignment: c.get('alignment') === 'right' ? 'right' : 'left',
    tooltipMs: Math.max(1, Number(c.get('tooltipSeconds')) || 5) * 1000,
    show
  };
}

module.exports = { cfg, shown, readCfg, GROUPS };
