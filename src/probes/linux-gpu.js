const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const DRM_ROOT = '/sys/class/drm';

function findGpuSysfsPaths() {
  let cards;
  try { cards = fs.readdirSync(DRM_ROOT); } catch (_) { return []; }
  const paths = [];
  for (const name of cards) {
    if (!/^card\d+$/.test(name)) continue;
    const p = path.join(DRM_ROOT, name, 'device', 'gpu_busy_percent');
    try { fs.accessSync(p, fs.constants.R_OK); paths.push(p); } catch (_) { }
  }
  return paths;
}

function readGpuSysfs(paths) {
  let sum = 0, any = false;
  for (const p of paths) {
    try {
      const n = Number(fs.readFileSync(p, 'utf8').trim());
      if (isFinite(n)) { sum += n; any = true; }
    } catch (_) { }
  }
  return any ? Math.max(0, Math.min(100, sum)) : null;
}

function readGpuSysfsEach(paths) {
  const out = {};
  for (const p of paths) {
    const card = path.basename(path.dirname(path.dirname(p)));
    try {
      const n = Number(fs.readFileSync(p, 'utf8').trim());
      if (isFinite(n)) out[card] = Math.max(0, Math.min(100, n));
    } catch (_) { }
  }
  return out;
}

let nvidiaState = null;

function detectNvidiaSmi(cb) {
  if (nvidiaState !== null) { cb(nvidiaState); return; }
  cp.execFile('nvidia-smi', ['-L'], { timeout: 3000 }, (err) => {
    nvidiaState = !err;
    cb(nvidiaState);
  });
}

function resetNvidiaDetection() { nvidiaState = null; }

function parseNvidiaSmiOutput(text) {
  let sum = 0, any = false;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const n = Number(line);
    if (isFinite(n)) { sum += n; any = true; }
  }
  return any ? Math.max(0, Math.min(100, sum)) : null;
}

function parseNvidiaSmiEach(text) {
  const out = {};
  let i = 0;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const n = Number(line);
    if (isFinite(n)) out[String(i)] = Math.max(0, Math.min(100, n));
    i++;
  }
  return out;
}

function queryNvidiaSmi(cb) {
  cp.execFile('nvidia-smi',
    ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'],
    { timeout: 3000 },
    (err, stdout) => cb(err ? null : parseNvidiaSmiOutput(stdout), err ? {} : parseNvidiaSmiEach(stdout)));
}

module.exports = {
  findGpuSysfsPaths, readGpuSysfs, readGpuSysfsEach, detectNvidiaSmi, resetNvidiaDetection,
  parseNvidiaSmiOutput, parseNvidiaSmiEach, queryNvidiaSmi
};
